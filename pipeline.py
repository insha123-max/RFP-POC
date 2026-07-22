"""7-stage RFP evaluation pipeline powered by a genuinely local Ollama model,
configured via MODEL_NAME in .env (no data leaves the VM)."""

import asyncio
import json
import math
import os
import re
import time
from typing import List, Optional

import httpx
from dotenv import load_dotenv

from prompts.loader import PROMPT_VERSION, render_prompt
import vector_store

from models import (
    BidReadinessResult,
    CategoryMinimum,
    CategoryResult,
    ChecklistItem,
    CriterionEvaluation,
    EvaluationMetadata,
    EvaluationReport,
    EvaluationRules,
    PQCheck,
    PrebidQA,
    RiskItem,
    ScoringCategory,
    SubCriterion,
    Threshold,
)

load_dotenv()

# ---------------------------------------------------------------------------
# Ollama configuration
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL")
if not OLLAMA_BASE_URL:
    raise RuntimeError("OLLAMA_BASE_URL environment variable is not set. Add it to your .env file.")

# Model is env-driven, not hardcoded — swap models (e.g. qwen3.5:4b for speed
# vs qwen3.5:latest/9b for accuracy) by editing .env, no code change needed.
MODEL_NAME = os.environ.get("MODEL_NAME")
if not MODEL_NAME:
    raise RuntimeError("MODEL_NAME environment variable is not set. Add it to your .env file.")

# Optional per-stage escalation to a different model (e.g. a larger one for
# the highest-stakes compliance judgment) without a config system — set
# STAGE3_MODEL_OVERRIDE in .env and it threads through stage 3's _call()
# sites via the `model=` kwarg. Unset/empty = always use MODEL_NAME.
STAGE3_MODEL_OVERRIDE: Optional[str] = os.environ.get("STAGE3_MODEL_OVERRIDE") or None

# Same mechanism for stage 2 (RFP rule/criteria extraction). Confirmed by a
# direct side-by-side replay of the exact same RFP chunk: MODEL_NAME
# (qwen3.5:4b) extracted only 1 of 3 scoring categories present in the
# chunk (missed two worth 70% of the RFP's total marks), while gemma4:26b
# extracted all of them correctly from the identical input — a model
# capability gap, not a chunking bug. Stage 2 makes far fewer calls than
# stage 3, so the extra latency cost of a bigger model here is cheap
# relative to the accuracy it buys.
STAGE2_MODEL_OVERRIDE: Optional[str] = os.environ.get("STAGE2_MODEL_OVERRIDE") or None


def _llm_model_summary() -> str:
    """Describes every model actually in play for traceability in the
    report metadata — a silent single-model label here (when a stage
    override is active) is exactly the kind of mismatch between what a
    report says and what actually ran that made a past accuracy bug hard
    to diagnose.
    """
    parts = [f"{MODEL_NAME} (default)"]
    if STAGE2_MODEL_OVERRIDE and STAGE2_MODEL_OVERRIDE != MODEL_NAME:
        parts.append(f"{STAGE2_MODEL_OVERRIDE} (stage2)")
    if STAGE3_MODEL_OVERRIDE and STAGE3_MODEL_OVERRIDE != MODEL_NAME:
        parts.append(f"{STAGE3_MODEL_OVERRIDE} (stage3)")
    return parts[0] if len(parts) == 1 else " / ".join(parts)

# Pinned so every LLM call is reproducible — seed + temperature=0.0 make the
# same prompt + model produce the same output across runs.
TEMPERATURE = 0.0
SEED = 42

# --- Dynamic chunking ---------------------------------------------------
# Chunk COUNT is derived from document size (see _dynamic_chunks below), not
# hardcoded — a short RFP might need 1-2 chunks, a 400-page one 30+. These
# constants control chunk SIZE, which controls how many chunks a document
# needs. Never truncate: if content doesn't fit one call, it becomes more
# calls instead of being dropped.

NUM_CTX_CEILING = int(os.environ.get("NUM_CTX_CEILING", "8192"))
# CPU-safe practical cap while Ollama has no GPU access on the deploy VM
# (driver too old; fixing it needs interactive console access that isn't
# available — see infra notes). Raise via env once GPU is unblocked — chunk
# count drops automatically, no code changes needed. This is a ceiling, not
# a target: the context actually requested per call is auto-adjusted down
# further to whatever the configured model natively supports — see
# _num_ctx_for() — so switching MODEL_NAME never requests more context than
# that model can actually give.

CHARS_PER_TOKEN = 3
# Conservative estimate, not a real tokenizer — deliberately biased low so
# it never UNDER-estimates token count and risks overflowing num_ctx. RFP
# and tender text (tables, numbers, short lines) tokenizes less efficiently
# than prose.

RESERVED_TEMPLATE_TOKENS = 2000
# Headroom for the system prompt + Jinja template + any criteria/context
# text injected alongside the chunk. Largest template on disk is
# scoring_prompt.md (~5.9KB, ~1500 tok); this adds margin on top.

SAFETY_MARGIN_TOKENS = 200

# Bounded excerpt of RFP scoring-tier text handed to stage 3 as reference
# context (separate from rule extraction — this is a supplementary lookup
# snippet, already re-truncated to 4000 chars where it's used, not subject
# to the no-data-loss guarantee below).
RFP_SCORING_CONTEXT_CHARS = 15_000


def _chunk_budget_tokens(max_tokens: int, num_ctx: int) -> int:
    """How many tokens of raw document content one chunk can safely hold,
    given this call's output budget and the fixed template/system overhead.
    """
    return max(500, num_ctx - max_tokens - RESERVED_TEMPLATE_TOKENS - SAFETY_MARGIN_TOKENS)


_DETECTED_CTX_CACHE: dict[str, int] = {}


def _model_context_length(model: str) -> int:
    """Query Ollama's native /api/show for this model's real max context
    window (not exposed through the OpenAI-compatible chat/embeddings
    client), so chunk sizing auto-adjusts to whatever model is actually
    configured instead of a single number tuned for one specific model.

    Cached per model name — this is one HTTP call the first time a model
    is used, not per-request. Falls back to NUM_CTX_CEILING if Ollama can't
    be reached at that moment; dynamic chunking still works safely at that
    fallback size, just possibly with more/smaller chunks than necessary.
    """
    if model in _DETECTED_CTX_CACHE:
        return _DETECTED_CTX_CACHE[model]

    detected = NUM_CTX_CEILING
    try:
        resp = httpx.post(f"{OLLAMA_BASE_URL}/api/show", json={"model": model}, timeout=10)
        resp.raise_for_status()
        model_info = resp.json().get("model_info", {})
        for key, value in model_info.items():
            if key.endswith(".context_length") and isinstance(value, int) and value > 0:
                detected = value
                break
        print(f"[_model_context_length] {model} native max context = {detected}")
    except Exception as exc:
        print(f"[_model_context_length] could not query {model} ({exc}); using fallback {NUM_CTX_CEILING}")

    _DETECTED_CTX_CACHE[model] = detected
    return detected


def _num_ctx_for(model: str) -> int:
    """The context window to actually request for this model: the smaller
    of what it natively supports and the CPU-safe practical ceiling. Never
    requests more than a model can give (protects a small-context model
    from being asked for more than it has) and never blindly asks for a
    huge model's full native window on CPU (protects latency).
    """
    return min(_model_context_length(model), NUM_CTX_CEILING)


def _estimate_tokens(text: str) -> int:
    return len(text) // CHARS_PER_TOKEN + 1


def _dynamic_chunks(text: str, budget_tokens: int) -> list[str]:
    """Split text into the minimum number of chunks such that each fits
    budget_tokens, covering 100% of the input with no gaps.

    Chunk count scales with document size — there is no upper cap.
    Coverage always wins over call count.
    """
    if not text.strip():
        return []

    total_tokens = _estimate_tokens(text)
    n = max(1, math.ceil(total_tokens / budget_tokens))
    if n == 1:
        return [text]

    target_len = math.ceil(len(text) / n)
    chunks: list[str] = []
    start = 0
    window = 400  # how far to search for a paragraph break near the target cut

    while start < len(text):
        end = min(len(text), start + target_len)
        if end < len(text):
            break_pos = text.rfind("\n\n", max(start, end - window), min(len(text), end + window))
            if break_pos > start:
                end = break_pos
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end

    return chunks


SYSTEM = (
    "You are an expert RFP (Request for Proposal) / Tender Evaluation Assistant. "
    "You analyze procurement documents, extract scoring criteria, evaluate vendor bids, "
    "and produce structured evaluation reports. "
    "Respond with valid JSON only when asked for structured output — no prose, no markdown fences. "
    "Base every assessment solely on evidence found in the provided documents. "
    "If something is not found in the document, state 'Not found in document' and score it 0."
)

_http_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    """Shared client for Ollama's *native* API (/api/chat, /api/embed) —
    NOT the OpenAI-compatible /v1/* endpoints. Confirmed by direct testing
    that Ollama's OpenAI-compat layer silently ignores extra_body's
    options.num_ctx (it always sizes to the model's native max context
    regardless of what's requested); the native API honors it correctly,
    including shrinking an already-loaded model on request.

    A generous but finite read timeout (not None) is deliberate: generation
    can legitimately take minutes under load, but timeout=None also means a
    stale keep-alive connection left over from an Ollama server restart can
    hang a request forever with zero GPU activity and no error — observed
    directly during this project (a 45+ minute silent stall, immediately
    resolved once retried against a fresh connection). 600s comfortably
    exceeds the longest real call_time seen in practice (~300s) while still
    bounding the worst case instead of hanging indefinitely.
    """
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(connect=30.0, read=600.0, write=30.0, pool=30.0),
        )
    return _http_client


# Ollama is a local server now, not a rate-limited cloud endpoint — this
# caps total concurrent in-flight generations across evaluations running in
# this process, rather than piling everything into Ollama's own queue.
_CALL_SEMAPHORE: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _CALL_SEMAPHORE
    if _CALL_SEMAPHORE is None:
        _CALL_SEMAPHORE = asyncio.Semaphore(5)
    return _CALL_SEMAPHORE


async def _call(prompt: str, system: str = SYSTEM, max_tokens: int = 1200, model: str | None = None) -> str:
    """Call MODEL_NAME (or an explicit per-call override) with no fallback.

    Pinning ensures consistent, comparable results across evaluations.
    Raises immediately on any error instead of silently switching models.

    Uses Ollama's *native* /api/chat, not the OpenAI-compatible /v1/*
    endpoint — confirmed by direct testing that the OpenAI-compat layer
    silently ignores num_ctx and always loads a model at its native max
    context regardless of what's requested, while the native API honors it
    correctly (including shrinking an already-loaded model). Passing an
    explicit, correctly-sized num_ctx matters: Ollama's own auto-default is
    derived from detected VRAM and can otherwise balloon to a model's full
    native context, forcing a huge KV cache and much slower inference.

    think=False disables qwen3.5's chain-of-thought reasoning mode.
    Confirmed by direct testing: with thinking left on, the model spends
    the entire num_predict budget on an internal "thinking" block and
    never reaches the actual answer — response comes back with empty
    content and done_reason="length". We want direct structured JSON, not
    a reasoning trace, so thinking is unwanted overhead here regardless.
    """
    model = model or MODEL_NAME
    num_ctx = _num_ctx_for(model)
    queued_at = time.monotonic()
    print(f"[_call] queued  model={model} num_ctx={num_ctx} max_tokens={max_tokens} prompt_chars={len(prompt)}")
    async with _get_semaphore():
        # Time spent waiting for a semaphore slot vs. time spent actually
        # calling Ollama — split out on purpose. A long queue_wait means
        # too much concurrent load for what's available; a long call_time
        # means the model/hardware itself is slow. Conflating the two is
        # exactly what made the original slowdown hard to diagnose.
        started = time.monotonic()
        queue_wait = started - queued_at
        try:
            resp = await get_http_client().post(
                "/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user",   "content": prompt},
                    ],
                    "stream": False,
                    "think": False,
                    "options": {
                        "temperature": TEMPERATURE,
                        "seed": SEED,
                        "num_predict": max_tokens,
                        "num_ctx": num_ctx,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["message"]["content"]
            call_time = time.monotonic() - started
            if not content:
                # Defensive: if a model ever comes back empty despite
                # think=False (e.g. one that doesn't support disabling it),
                # log loudly instead of silently returning "" to the caller.
                print(f"[_call] WARNING model={model} returned empty content — done_reason={data.get('done_reason')} thinking_present={'thinking' in data.get('message', {})}")
            print(f"[_call] done    model={model} queue_wait={queue_wait:.1f}s call_time={call_time:.1f}s response_chars={len(content)}")
            return content
        except Exception as exc:
            call_time = time.monotonic() - started
            print(f"[_call] FAILED  model={model} queue_wait={queue_wait:.1f}s call_time={call_time:.1f}s error={exc}")
            raise RuntimeError(
                f"[_call] {model} failed: {exc}. "
                f"Ensure Ollama at {OLLAMA_BASE_URL} is reachable and the model is available."
            ) from exc


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*",     "", text)
    return text.strip()


def _parse_object(text: str) -> dict:
    text = _clean(text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    candidate = match.group() if match else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Try truncating at the last complete key-value pair
    last_comma = candidate.rfind(",")
    if last_comma > 0:
        try:
            return json.loads(candidate[:last_comma] + "}")
        except json.JSONDecodeError:
            pass

    # Response was cut off mid-structure (e.g. hit max_tokens before the
    # array/object closed) — the raw text can still contain a real
    # "rules_found": true plus fully-formed category objects earlier in the
    # array. Don't discard that data just because the tail is broken: pull
    # top-level scalars via regex and salvage whichever list entries are
    # syntactically complete, the same way _parse_array recovers from
    # truncated arrays.
    salvaged: dict = {}
    bool_match = re.search(r'"rules_found"\s*:\s*(true|false)', candidate)
    if bool_match:
        salvaged["rules_found"] = bool_match.group(1) == "true"
    for list_key in ("scoring_categories", "criteria", "disqualifiers"):
        list_match = re.search(rf'"{list_key}"\s*:\s*\[(.*)', candidate, re.DOTALL)
        if list_match:
            objects = _extract_complete_objects(list_match.group(1))
            if objects:
                salvaged[list_key] = objects
    if salvaged:
        print(
            f"[_parse_object] response truncated — salvaged keys={list(salvaged.keys())} "
            f"scoring_categories_recovered={len(salvaged.get('scoring_categories', []))}"
        )
    return salvaged


def _extract_complete_objects(text: str) -> list:
    """Extract all syntactically complete {...} objects from potentially malformed JSON."""
    objects = []
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    objects.append(json.loads(text[start : i + 1]))
                except json.JSONDecodeError:
                    pass
                start = None
    return objects


def _parse_array(text: str) -> list:
    text = _clean(text)
    match = re.search(r"\[.*\]", text, re.DOTALL)
    candidate = match.group() if match else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Salvage all complete {...} objects from the broken response
        objects = _extract_complete_objects(candidate)
        if objects:
            return objects
        return []


# ---------------------------------------------------------------------------
# Smart extractors — scan the full document, return only relevant paragraphs
# ---------------------------------------------------------------------------

_SCORING_KEYWORDS = [
    "marks", "score", "scoring", "criteria", "criterion", "evaluation",
    "weightage", "weight", "points", "rating", "percent", "%", "technical",
    "financial", "mandatory", "eligible", "qualification", "experience",
    "turnover", "empanelment", "bid", "tender", "proposal", "parameter",
    "maximum", "minimum", "pass", "threshold", "disqualif",
]

# High-confidence regex anchors that indicate we are inside an RFP scoring section.
# Used to skip past irrelevant header/boilerplate in large documents.
_SCORING_ANCHORS = [
    # Generic scoring table headers (Indian govt tenders)
    r"max\.?\s*marks",
    r"evaluation\s+basis",
    r"evaluation\s+criteria.*sub.?criteria",
    r"s\.?\s*no\.?\s+evaluation\s+criteria",
    r"marks\s+allocated\s+to\s+categor",
    r"maximum\s+marks.*criterion.*shall\s+be\s+\d+",
    # Common Indian govt tender scoring criteria names
    r"average\s+annual\s+turn\s*over",
    r"firm.s\s+relevant\s+experience",
    r"employee\s+certif",
    r"technical\s+presentation",
    r"technical\s+approach.*methodology",
    # GenAI/PNB specific (kept for backwards compat)
    r"minimum\s+qualifying\s+marks\s*:?\s*bidder\s+must\s+score",
    r"scoring\s+summary",
    r"category\s+[ab]\s*:.*(?:marks|capability|experience)",
    r"sub.criterion\s+1\.a",
    r"genai\s+delivery\s+capability",
    r"\d+\s+or\s+more\s+production\s+gen.?ai",
]

# ---------------------------------------------------------------------------
# Semantic extraction — embeddings-based chunk selection
# ---------------------------------------------------------------------------

# Embedding model served by Ollama.  Pull once with: ollama pull nomic-embed-text
_EMBED_MODEL = "nomic-embed-text"

# Query that describes what a scoring/criteria section looks like semantically.
_SCORING_SEMANTIC_QUERY = (
    "evaluation scoring criteria marks points score weightage table categories "
    "max marks threshold pass evaluation basis sub-criteria technical qualification "
    "pre-qualification eligibility mandatory requirements tender bid evaluation matrix"
)

_EMBED_CHUNK_SIZE = 600   # chars per embedding chunk
_EMBED_STEP       = 500   # step between chunks — 100-char overlap


async def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts in one Ollama API call.

    Uses Ollama's native /api/embed (not the OpenAI-compatible /v1/embeddings)
    for the same num_ctx-honoring reason as _call() — see its docstring.
    Native /api/embed returns embeddings in input order, no re-sorting needed.

    Returns a list of float vectors in the same order as `texts`.
    Returns empty lists for all items if the embedding model is unavailable.
    """
    started = time.monotonic()
    num_ctx = _num_ctx_for(_EMBED_MODEL)
    print(f"[_embed_batch] start   model={_EMBED_MODEL} num_ctx={num_ctx} batch_size={len(texts)}")
    try:
        resp = await get_http_client().post(
            "/api/embed",
            json={
                "model": _EMBED_MODEL,
                "input": texts,
                "options": {"num_ctx": num_ctx},
            },
        )
        resp.raise_for_status()
        embeddings = resp.json()["embeddings"]
        elapsed = time.monotonic() - started
        print(f"[_embed_batch] done    batch_size={len(texts)} elapsed={elapsed:.1f}s")
        return embeddings
    except Exception as exc:
        elapsed = time.monotonic() - started
        print(f"[_embed_batch] FAILED  batch_size={len(texts)} elapsed={elapsed:.1f}s error={exc} — will fall back to regex")
        return [[] for _ in texts]


async def _embed_chunks_cached(doc_id: str, chunks: list[str]) -> list[list[float]]:
    """Embed chunks, reusing persisted vectors (vector_store.py) keyed by doc_id
    so re-evaluating the same document doesn't re-embed identical chunks.
    """
    cached = vector_store.get_cached_embeddings(doc_id, len(chunks))
    if cached is not None:
        return cached
    vecs = await _embed_batch(chunks)
    if any(vecs):  # don't cache empty vectors from a failed embedding call
        vector_store.store_embeddings(doc_id, chunks, vecs)
    return vecs


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag = (sum(x * x for x in a) ** 0.5) * (sum(x * x for x in b) ** 0.5)
    return dot / mag if mag else 0.0


async def _extract_scoring_sections_semantic(text: str, max_chars: int) -> str:
    """Return the most semantically relevant paragraphs from the document.

    Splits the text into overlapping 600-char chunks, embeds all of them plus
    the scoring-query string in one batched Ollama call, ranks by cosine
    similarity, and returns the top-ranked chunks concatenated in document order.

    Falls back silently to the regex-based extractor if the embedding model is
    not available (e.g. nomic-embed-text not pulled yet).
    """
    # Build overlapping chunks, remember their start position in the original text
    positions: list[int] = []
    raw_chunks: list[str] = []
    i = 0
    while i < len(text):
        chunk = text[i: i + _EMBED_CHUNK_SIZE]
        if chunk.strip():
            positions.append(i)
            raw_chunks.append(chunk)
        i += _EMBED_STEP

    if not raw_chunks:
        return text[:max_chars]

    # Query is embedded fresh each time; chunk embeddings are reused from the
    # persisted vector store when this document was embedded before.
    doc_id = vector_store.doc_hash(text)
    query_vecs, chunk_vecs = await asyncio.gather(
        _embed_batch([_SCORING_SEMANTIC_QUERY]),
        _embed_chunks_cached(doc_id, raw_chunks),
    )
    query_vec = query_vecs[0]

    if not query_vec:
        # Embedding model unavailable — fall back to regex approach
        return _extract_scoring_sections(text, max_chars)

    # Rank chunks by similarity to the scoring query
    scored = [
        (_cosine_sim(query_vec, vec), pos, chunk)
        for vec, pos, chunk in zip(chunk_vecs, positions, raw_chunks)
    ]
    scored.sort(key=lambda x: -x[0])

    # Greedily pick top-ranked chunks until we reach max_chars
    selected: list[tuple[int, str]] = []
    total = 0
    for _sim, pos, chunk in scored:
        if total + len(chunk) > max_chars:
            break
        selected.append((pos, chunk))
        total += len(chunk)

    # Restore document order so the LLM sees coherent text
    selected.sort(key=lambda x: x[0])
    result = "\n".join(chunk for _, chunk in selected)
    print(f"[semantic] {len(selected)} chunks selected ({total} chars) from {len(raw_chunks)} total")
    return result if result.strip() else text[:max_chars]


def _find_scoring_section_start(text: str) -> int:
    """Return char offset where the actual scoring/evaluation section begins, or -1.

    Finds the earliest position where at least 3 anchors cluster within a 5000-char
    window — this distinguishes the real scoring section from scattered references.
    For shorter documents (< 50K chars) any single anchor match is sufficient.
    """
    if len(text) < 50_000:
        for pat in _SCORING_ANCHORS:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return max(0, m.start() - 300)
        return -1

    # Collect all anchor match positions
    positions: list[int] = []
    for pat in _SCORING_ANCHORS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            positions.append(m.start())
    if not positions:
        return -1

    positions.sort()
    WINDOW = 5000

    # Find the earliest window that contains ≥3 anchors
    for i, pos in enumerate(positions):
        count = sum(1 for p in positions[i:] if p - pos <= WINDOW)
        if count >= 3:
            return max(0, pos - 300)

    # Fallback: return the position of the first anchor
    return max(0, positions[0] - 300)


def _extract_scoring_sections(text: str, max_chars: int) -> str:
    """Return the most scoring-relevant paragraphs from the RFP.

    First tries anchor-based extraction (finds the actual scoring section in large
    documents where keyword density is diluted by boilerplate). Falls back to the
    original keyword-frequency approach for shorter/simpler documents.
    """
    # ── Anchor-based: target the actual evaluation/scoring section ────────
    anchor_start = _find_scoring_section_start(text)
    if anchor_start >= 0:
        return text[anchor_start: anchor_start + max_chars]

    # ── Fallback: keyword-frequency ranking ───────────────────────────────
    lines = text.splitlines()
    scored: list[tuple[int, int, str]] = []

    for i, line in enumerate(lines):
        ll = line.lower()
        hits = sum(1 for kw in _SCORING_KEYWORDS if kw in ll)
        if hits:
            start = max(0, i - 1)
            end   = min(len(lines), i + 4)
            scored.append((hits, i, "\n".join(lines[start:end])))

    scored.sort(key=lambda x: -x[0])

    seen: set[int] = set()
    result: list[tuple[int, str]] = []
    total = 0

    for hits, idx, block in scored:
        if idx not in seen and total + len(block) <= max_chars:
            seen.add(idx)
            result.append((idx, block))
            total += len(block)

    result.sort(key=lambda x: x[0])
    extracted = "\n".join(b for _, b in result)
    return extracted if extracted.strip() else text[:max_chars]


def _extract_bid_sections(bid_text: str, criteria_list: list, max_chars: int) -> str:
    """Return bid paragraphs most relevant to the criteria being evaluated.

    Builds a keyword set from criterion names so evidence buried anywhere in
    the document is surfaced — not just the first N characters.
    """
    keywords: set[str] = set()
    for c in criteria_list:
        for field in [c.get("criterion", ""), c.get("category", "")]:
            keywords.update(w.strip("(),.:;-") for w in field.lower().split() if len(w) > 3)

    # Domain-agnostic evidence keywords that appear in bids across sectors
    # (IT, infrastructure, consulting, engineering, government contracts)
    keywords.update([
        "experience", "project", "years", "work", "completed", "delivered",
        "turnover", "revenue", "annual", "crore", "lakh", "financial",
        "team", "personnel", "staff", "manpower", "expert", "specialist",
        "certified", "registered", "empanelled", "licence", "accredited",
        "client", "customer", "reference", "assignment", "contract", "award",
        "scope", "methodology", "approach", "plan", "proposed", "technical",
        "infrastructure", "survey", "design", "report", "study", "analysis",
        "implemented", "developed", "deployed", "executed", "managed",
    ])

    lines = bid_text.splitlines()
    scored: list[tuple[int, int, str]] = []

    for i, line in enumerate(lines):
        ll = line.lower()
        hits = sum(1 for kw in keywords if kw in ll)
        if hits:
            start = max(0, i - 2)
            end   = min(len(lines), i + 5)   # wider context window for bids
            scored.append((hits, i, "\n".join(lines[start:end])))

    scored.sort(key=lambda x: -x[0])

    seen: set[int] = set()
    result: list[tuple[int, str]] = []
    total = 0

    for hits, idx, block in scored:
        if idx not in seen and total + len(block) <= max_chars:
            seen.add(idx)
            result.append((idx, block))
            total += len(block)

    result.sort(key=lambda x: x[0])
    extracted = "\n".join(b for _, b in result)
    return extracted if extracted.strip() else bid_text[:max_chars]


def _category_criteria_list(cat: "ScoringCategory") -> list[dict]:
    """Build the flat category/criterion/max_marks dicts used to evaluate one scoring category."""
    if cat.subcriteria:
        return [
            {"category": cat.category, "criterion": sub.criterion, "max_marks": sub.max_marks}
            for sub in cat.subcriteria
        ]
    return [{
        "category": cat.category,
        "criterion": f"{cat.category} — overall assessment",
        "max_marks": cat.max_marks,
    }]


def _build_criteria_query(criteria_list: list[dict]) -> str:
    """Turn a criteria list into a natural-language query string for embedding."""
    query = ". ".join(
        f"{c.get('category', '')}: {c.get('criterion', '')}".strip(": ")
        for c in criteria_list
        if c.get("category") or c.get("criterion")
    )
    return query or "evaluation criteria"


async def _extract_bid_sections_semantic(
    bid_raw_chunks: list[str],
    bid_positions: list[int],
    bid_chunk_vecs: list[list[float]],
    query_vec: list[float],
    bid_text: str,
    criteria_list: list[dict],
    max_chars: int,
) -> str:
    """Return bid paragraphs most *semantically* relevant to the criteria being evaluated.

    Ranks precomputed bid chunk embeddings by cosine similarity to the criteria's
    query embedding (both computed once per evaluation, not per category — see
    stage3_parse_vendor_response). Falls back to keyword matching if embeddings
    are unavailable (e.g. nomic-embed-text not pulled).
    """
    if not query_vec or not bid_chunk_vecs:
        return _extract_bid_sections(bid_text, criteria_list, max_chars)

    scored = [
        (_cosine_sim(query_vec, vec), pos, chunk)
        for vec, pos, chunk in zip(bid_chunk_vecs, bid_positions, bid_raw_chunks)
    ]
    scored.sort(key=lambda x: -x[0])

    selected: list[tuple[int, str]] = []
    total = 0
    for _sim, pos, chunk in scored:
        if total + len(chunk) > max_chars:
            break
        selected.append((pos, chunk))
        total += len(chunk)

    selected.sort(key=lambda x: x[0])
    result = "\n".join(chunk for _, chunk in selected)
    return result if result.strip() else _extract_bid_sections(bid_text, criteria_list, max_chars)


_SIMILARITY_KEEP_RATIO = 0.85
# Keep chunks scoring within 85% of this category's top-matching chunk.
# Raised from 0.6: measured in production, a ratio-only floor barely
# discriminated at all for this embedding model — 522-524 of 524 bid
# chunks passed at 0.6, meaning nearly the entire document was resent
# per category. Real bid text apparently doesn't spread cosine similarity
# out enough for a relative floor alone to be reliable.

_MAX_RELEVANT_CHUNKS = 60
# Hard cap on chunks kept per category, applied after ranking by score —
# a backstop for exactly the flat-similarity-distribution case above,
# where even a stricter ratio might not filter enough on its own. 60
# chunks (~36,000 chars before any sub-chunk splitting) is still ~6x more
# than the old fixed MAX_BID_CHARS budget that caused missed evidence, so
# this isn't a return to that bug — it's bounding the *top* of the range,
# not reintroducing a narrow cutoff.


def _select_relevant_chunks(
    scored: list[tuple[float, int, str]],
) -> list[tuple[int, str]]:
    """scored: (similarity, position, chunk_text) for every chunk in the
    document. Returns the top-ranked chunks above a relevance floor, capped
    at _MAX_RELEVANT_CHUNKS, restored to document order.
    """
    if not scored:
        return []
    top_score = max(s for s, _, _ in scored)
    if top_score <= 0:
        return []
    floor = top_score * _SIMILARITY_KEEP_RATIO
    candidates = [(score, pos, chunk) for score, pos, chunk in scored if score >= floor]
    candidates.sort(key=lambda x: -x[0])
    candidates = candidates[:_MAX_RELEVANT_CHUNKS]
    selected = [(pos, chunk) for _, pos, chunk in candidates]
    selected.sort(key=lambda x: x[0])
    return selected


def _merge_criterion_evals(all_items: list[list[dict]]) -> list[dict]:
    """Merge CriterionEvaluation dicts for the same category across multiple
    sub-chunk calls, keyed by criterion name. Prefers a real finding over
    'Not found', then higher marks_awarded, on conflict.
    """
    by_criterion: dict[str, dict] = {}
    for items in all_items:
        for item in items:
            if not isinstance(item, dict):
                continue
            key = (item.get("criterion") or "").strip().lower()
            if not key:
                continue
            existing = by_criterion.get(key)
            if existing is None:
                by_criterion[key] = item
                continue
            existing_found = existing.get("vendor_claim") not in (None, "", "Not found")
            item_found = item.get("vendor_claim") not in (None, "", "Not found")
            if item_found and not existing_found:
                by_criterion[key] = item
            elif item_found == existing_found:
                if float(item.get("marks_awarded", 0) or 0) > float(existing.get("marks_awarded", 0) or 0):
                    by_criterion[key] = item
    return list(by_criterion.values())


# ---------------------------------------------------------------------------
# Stage 2 — Rule & Criteria Extraction
# ---------------------------------------------------------------------------

def _rfp_extract_prompt(chunk: str) -> str:
    return render_prompt("criteria_prompt", chunk=chunk)


def _rfp_pq_extract_prompt(text: str) -> str:
    return render_prompt("pq_criteria_prompt", text=text)


def _pq_evaluate_prompt(bid_text: str, pq_criteria: list) -> str:
    return render_prompt(
        "pq_scoring_prompt",
        bid_text=bid_text,
        criteria_json=json.dumps(pq_criteria, indent=2),
    )


def _rfp_pqtq_prompt(chunk: str) -> str:
    return render_prompt("pqtq_criteria_prompt", chunk=chunk)



def _base_cat_key(key: str) -> str:
    """Return the base portion of a category key, stripping descriptive suffixes.

    Handles cases where different RFP chunks extract the same category with slightly
    different names, e.g. 'category a' vs 'category a: bidder genai delivery capability'.
    Both reduce to 'category a' so they merge rather than produce phantom duplicates.
    """
    for sep in (': ', ' — ', ' - ', ' – '):
        idx = key.find(sep)
        if idx > 0:
            return key[:idx].strip()
    return key


_NON_SCORING_NAME_PATTERNS = [
    r'^\s*milestone\b',
    r'\bpayment\s+schedule\b',
    r'\bpayment\s+milestone\b',
    r'\bdelivery\s+milestone\b',
    r'\bdisbursement\s+schedule\b',
]


def _drop_non_scoring_categories(raw_cats: list) -> list:
    """Drop categories whose name identifies them as a payment/delivery schedule
    rather than a genuine technical-evaluation scoring criterion.

    Proven failure mode: an RFP's milestone-based payment table (e.g. "Milestone 1
    (D+1 Month): 10%", "Milestone 3 (D+5 Months): 25%") has numeric percentages
    that look exactly like a scoring table, so Stage 2 extracted each milestone as
    its own 100%-scorable TQ category — any bidder who simply restates the RFP's
    own payment schedule earns full marks on all of them, fabricating a large
    fraction of the final score out of criteria the RFP never intended to score.
    """
    kept = []
    for item in raw_cats:
        name = item[0].get("category", "")
        if any(re.search(p, name, re.IGNORECASE) for p in _NON_SCORING_NAME_PATTERNS):
            print(f"[Stage2] Dropping non-scoring category (payment/delivery schedule, not TQ marks): {name!r}")
            continue
        kept.append(item)
    return kept


_RFP_DECLARED_TOTAL_PATTERNS = [
    r'out\s+of\s+(\d+)\s*marks',
    r'maximum\s+marks?\s*(?:of|is|:)?\s*(\d+)',
    r'total\s+marks?\s*(?:of|is|:)?\s*(\d+)',
    r'marked\s+out\s+of\s+(\d+)',
    r'evaluation\s+(?:shall\s+be\s+)?(?:out\s+of|marked\s+out\s+of)\s+(\d+)',
]


def _detect_rfp_declared_total_marks(rfp_text: str) -> Optional[float]:
    """Find the RFP's own stated total technical-evaluation marks (e.g. this
    RFP literally says "70 marks (out of 100 marks) in the Technical
    Evaluation"), so the TQ category merge step has a ground-truth anchor to
    sanity-check against instead of just trusting one LLM pass.
    """
    counts: dict[int, int] = {}
    for pattern in _RFP_DECLARED_TOTAL_PATTERNS:
        for m in re.finditer(pattern, rfp_text, re.IGNORECASE):
            try:
                val = int(m.group(1))
            except (ValueError, IndexError):
                continue
            if 10 <= val <= 1000:  # plausible marks-total range, filters out unrelated numbers
                counts[val] = counts.get(val, 0) + 1
    if not counts:
        return None
    # Most frequently repeated candidate wins — a real declared total is usually stated more than once.
    return float(max(counts, key=counts.get))


async def _run_tq_merge_pass(all_cats: dict, stage2_model: str) -> bool:
    """Single LLM pass that spots TQ categories describing the same underlying
    RFP criterion extracted twice under different wording (e.g. "Firm's
    Relevant Experience" and "Number of Similar Projects (>= Rs 2 Crore each)"
    both describing the same 30-mark line item). Mutates all_cats in place.
    Returns True if any merge was applied.

    _base_cat_key's prefix matching can't catch this — the names share no
    common substring. An embedding-cosine-similarity check was tried and
    rejected: measured against real category names, the true duplicate pair
    scored 0.62 similarity while two genuinely DIFFERENT criteria ("Employee
    Certifications" vs "Firm's Relevant Experience") scored higher at 0.87 —
    short RFP-jargon phrases cluster too tightly by domain vocabulary for a
    threshold to safely distinguish "same criterion" from "different criterion,
    same topic". Only a model reading the full list together, with the same
    context a human evaluator would have, can make this call reliably.
    """
    tq_keys = [
        k for k, cat in all_cats.items()
        if str(cat.get("qualification_type", "") or "").upper() == "TQ"
    ]
    if len(tq_keys) < 2:
        return False

    name_to_key = {all_cats[k].get("category", k): k for k in tq_keys}
    categories_for_prompt = []
    for k in tq_keys:
        cat = all_cats[k]
        subs = cat.get("subcriteria", [])
        sub_descriptions = [
            s.get("criterion", "") for s in subs if isinstance(s, dict) and s.get("criterion")
        ] if isinstance(subs, list) else []
        categories_for_prompt.append({
            "category": cat.get("category", k),
            "max_marks": cat.get("max_marks"),
            "subcriteria": sub_descriptions,
        })

    raw = await _call(
        render_prompt("merge_duplicate_tq_categories_prompt", categories_json=json.dumps(categories_for_prompt, indent=2)),
        max_tokens=800,
        model=stage2_model,
    )
    data = _parse_object(raw)
    merge_groups = data.get("merge_groups", [])
    if not isinstance(merge_groups, list) or not merge_groups:
        return False

    merged_any = False
    for group in merge_groups:
        if not isinstance(group, dict):
            continue
        canonical_name = group.get("canonical", "")
        canonical_key = name_to_key.get(canonical_name)
        if canonical_key is None:
            continue
        for dup_name in group.get("duplicates", []) or []:
            dup_key = name_to_key.get(dup_name)
            if dup_key is None or dup_key == canonical_key or dup_key not in all_cats:
                continue
            dup_subs = all_cats[dup_key].get("subcriteria", [])
            if isinstance(dup_subs, list):
                canon_subs = all_cats[canonical_key].get("subcriteria", [])
                if not isinstance(canon_subs, list):
                    canon_subs = []
                all_cats[canonical_key]["subcriteria"] = canon_subs + dup_subs
            print(f"[Stage2] Merged duplicate TQ category {dup_name!r} into {canonical_name!r}")
            del all_cats[dup_key]
            merged_any = True

    return merged_any


def _tq_marks_total(all_cats: dict) -> float:
    """Sum max_marks across TQ categories, falling back to summing subcriteria
    marks when a category's own top-level max_marks is 0 — mirrors the same
    fallback the later raw_cats construction step uses, so this sanity-check
    total isn't a false alarm just because a category left max_marks unset at
    the top level while still fully specifying marks in its subcriteria.
    """
    total = 0.0
    for cat in all_cats.values():
        if str(cat.get("qualification_type", "") or "").upper() != "TQ":
            continue
        mm = float(cat.get("max_marks") or 0)
        if mm == 0:
            subs = cat.get("subcriteria", [])
            if isinstance(subs, list):
                mm = sum(float(s.get("max_marks") or 0) for s in subs if isinstance(s, dict))
        total += mm
    return total


async def _merge_duplicate_tq_categories(all_cats: dict, stage2_model: str, rfp_text: str = "") -> dict:
    """Run the TQ duplicate-merge pass, then sanity-check the result against
    the RFP's own declared total marks (when detectable) and retry once if the
    total still doesn't match — this LLM-based merge is not perfectly
    deterministic run-to-run (proven empirically: the same duplicate was
    caught on one run and missed on the next, most likely from GPU batching
    non-determinism under concurrent load), so a single pass isn't enough to
    trust on its own when correctness stakes are high.
    """
    await _run_tq_merge_pass(all_cats, stage2_model)

    declared_total = _detect_rfp_declared_total_marks(rfp_text) if rfp_text else None
    if declared_total is None:
        return all_cats

    current_total = _tq_marks_total(all_cats)
    if current_total == declared_total:
        return all_cats

    print(
        f"[Stage2] TQ marks total ({current_total:.0f}) doesn't match RFP's declared total "
        f"({declared_total:.0f}) after merge pass — retrying merge check once more"
    )
    merged_again = await _run_tq_merge_pass(all_cats, stage2_model)
    new_total = _tq_marks_total(all_cats)
    if new_total == declared_total:
        print(f"[Stage2] Retry resolved the mismatch — TQ total now matches declared {declared_total:.0f}")
    elif merged_again:
        print(f"[Stage2] Retry merged more categories but total ({new_total:.0f}) still doesn't match declared {declared_total:.0f}")
    else:
        print(f"[Stage2] Retry found no further merges — TQ total ({new_total:.0f}) remains off from declared {declared_total:.0f}, proceeding as-is")

    return all_cats


async def _cleanup_pq_categories(all_cats: dict, model: str) -> dict:
    """Ask the LLM to review PQ eligibility conditions for two problems a
    keyword/name match can't reliably catch, because both require understanding
    what each condition actually MEANS, not just what it's called:

    1. True duplicates — the same eligibility gate stated twice, once as the
       requirement and once as the document that proves it (e.g. "turnover >=
       Rs 4.5 Cr" and "submit CA-certified turnover data" are the same gate).
    2. Items that aren't real bidder-eligibility gates at all — functional
       requirements about the proposed SYSTEM's behaviour, or descriptive text
       spilled over from a different (TQ scoring) section of the RFP, that got
       mistakenly extracted as if they were pass/fail PQ conditions.

    Tested empirically against qwen3.5:4b (the smaller default model) vs this
    model: the smaller model caught the non-eligibility drops reliably but
    missed the subtler requirement-vs-proof-document merges — same capability
    gap already proven for Stage 2 extraction. Use whichever model the caller
    passes in (normally STAGE2_MODEL_OVERRIDE) rather than hardcoding one.
    """
    pq_keys = [
        k for k, cat in all_cats.items()
        if str(cat.get("qualification_type", "") or "").upper() == "PQ"
    ]
    if len(pq_keys) < 2:
        return all_cats

    name_to_key = {all_cats[k].get("category", k): k for k in pq_keys}
    categories_for_prompt = []
    for k in pq_keys:
        cat = all_cats[k]
        subs = cat.get("subcriteria", [])
        req_text = [
            s.get("criterion", "") for s in subs if isinstance(s, dict) and s.get("criterion")
        ] if isinstance(subs, list) else []
        categories_for_prompt.append({"category": cat.get("category", k), "requirement_text": req_text})

    raw = await _call(
        render_prompt("pq_intent_cleanup_prompt", categories_json=json.dumps(categories_for_prompt, indent=2)),
        max_tokens=1200,
        model=model,
    )
    data = _parse_object(raw)

    for group in data.get("merge_groups", []) or []:
        if not isinstance(group, dict):
            continue
        canonical_name = group.get("canonical", "")
        canonical_key = name_to_key.get(canonical_name)
        if canonical_key is None:
            continue
        for dup_name in group.get("duplicates", []) or []:
            dup_key = name_to_key.get(dup_name)
            if dup_key is None or dup_key == canonical_key or dup_key not in all_cats:
                continue
            dup_subs = all_cats[dup_key].get("subcriteria", [])
            if isinstance(dup_subs, list):
                canon_subs = all_cats[canonical_key].get("subcriteria", [])
                if not isinstance(canon_subs, list):
                    canon_subs = []
                all_cats[canonical_key]["subcriteria"] = canon_subs + dup_subs
            print(f"[Stage2] Merged duplicate PQ condition {dup_name!r} into {canonical_name!r}")
            del all_cats[dup_key]

    for name in data.get("not_eligibility_conditions", []) or []:
        key = name_to_key.get(name)
        if key is not None and key in all_cats:
            print(f"[Stage2] Dropping non-eligibility PQ item (not a real bidder pass/fail gate): {name!r}")
            del all_cats[key]

    return all_cats


def _deduplicate_scoring_categories(categories: list) -> list:
    """Remove sub-criterion entries that are already accounted for inside a parent category.

    When Stage 2 extracts both 'Category A (55 marks)' and its children
    'Sub-Criterion 1.a (20 marks)', 'Sub-Criterion 1.b (10 marks)' etc. as
    separate top-level entries, the max_score becomes inflated. This function
    keeps only the parent entries when double-counting is detected.
    """
    if not categories:
        return categories

    total = sum(c.max_marks for c in categories)
    # Heuristic: if total marks > 130 for what should be a 100-mark RFP,
    # there is likely double-counting from hierarchical extraction.
    if total <= 130:
        return categories

    # Patterns that identify child/sub-criteria entries (not top-level categories)
    child_patterns = [
        r'^sub[-\s]?criterion',
        r'^criterion\s+\d',
        r'^\d+[a-z]\.',
        r'^sub[-\s]?criter',
    ]

    parents = [
        c for c in categories
        if not any(re.match(p, c.category.strip(), re.IGNORECASE) for p in child_patterns)
    ]
    children = [
        c for c in categories
        if any(re.match(p, c.category.strip(), re.IGNORECASE) for p in child_patterns)
    ]

    parent_total = sum(c.max_marks for c in parents)

    # If parents alone sum to a reasonable total (≤130), use parents only.
    # Move children into the subcriteria of their closest parent by marks.
    if parents and parent_total <= 130:
        for child in children:
            # Find the parent whose max_marks is closest (and larger) than this child
            best = None
            for p in parents:
                if p.max_marks >= child.max_marks:
                    if best is None or p.max_marks < best.max_marks:
                        best = p
            if best is not None:
                from models import SubCriterion
                best.subcriteria.append(SubCriterion(
                    criterion=child.category,
                    max_marks=child.max_marks,
                ))
        print(f"[Stage2] Deduplicated {len(children)} child categories into {len(parents)} parent categories (was {total:.0f} marks, now {parent_total:.0f})")
        return parents

    # Fallback: return original list unchanged
    return categories


async def stage2_extract_rules(rfp_text: str) -> EvaluationRules:
    # Whichever model actually handles stage 2 (the override, if set).
    stage2_model = STAGE2_MODEL_OVERRIDE or MODEL_NAME

    # Chunk count is derived from document size — a 20-page RFP might need
    # 2 chunks, a 400-page one 30+. Every chunk covers a distinct, contiguous
    # slice of the document, so nothing is silently dropped and there's
    # nothing to dedupe (unlike the old overlapping-candidate-window design).
    budget = _chunk_budget_tokens(max_tokens=4000, num_ctx=_num_ctx_for(stage2_model))
    chunks = _dynamic_chunks(rfp_text, budget)
    print(f"[stage2_extract_rules] model={stage2_model} rfp_chars={len(rfp_text)} budget_tokens={budget} chunks={len(chunks)} sizes={[len(c) for c in chunks]}")

    # Merge categories from all chunks
    all_cats: dict[str, dict] = {}
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    # Trust the LLM's own rules_found signal — True only when it sees EXPLICIT numeric marks
    any_explicit_rules = False

    chunk_results = await asyncio.gather(
        *[_call(_rfp_extract_prompt(c), max_tokens=4000, model=stage2_model) for c in chunks],
        return_exceptions=True,
    )
    for raw in chunk_results:
        try:
            if isinstance(raw, Exception):
                print(f"[Stage2 chunk] error: {raw}")
                continue
            data = _parse_object(raw)

            # Only accept categories from this chunk if the LLM confirmed explicit rules
            chunk_has_rules = bool(data.get("rules_found", False))
            if chunk_has_rules:
                any_explicit_rules = True
            else:
                # LLM said no explicit marks in this chunk — skip its categories
                print(f"[Stage2 chunk] rules_found=false — skipping fabricated categories")
                continue

            scoring_categories = data.get("scoring_categories", [])
            if not isinstance(scoring_categories, list):
                scoring_categories = []
            for cat in scoring_categories:
                if not isinstance(cat, dict):
                    continue
                key = cat.get("category", "")
                if not isinstance(key, str):
                    key = str(key)
                key = key.strip().lower()
                if not key:
                    continue
                # Deduplicate: match exact key OR same base key so that
                # "Category A" and "Category A: Full Description" merge into one entry.
                base = _base_cat_key(key)
                matched_key = key if key in all_cats else next(
                    (k for k in all_cats if _base_cat_key(k) == base), None
                )
                if matched_key is None:
                    all_cats[key] = {**cat}
                else:
                    # Prefer the more descriptive (longer) category name
                    existing_name = all_cats[matched_key].get("category", "")
                    new_name = cat.get("category", "")
                    if len(new_name) > len(existing_name):
                        all_cats[matched_key]["category"] = new_name
                    subs = all_cats[matched_key].get("subcriteria", [])
                    if not isinstance(subs, list):
                        subs = []
                    exist_subs = {s["criterion"].lower() for s in subs if isinstance(s, dict) and "criterion" in s}
                    exist_marks = {float(s.get("max_marks", 0)) for s in subs if isinstance(s, dict)}
                    cat_subs = cat.get("subcriteria", [])
                    if not isinstance(cat_subs, list):
                        cat_subs = []
                    for sub in cat_subs:
                        if not isinstance(sub, dict):
                            continue
                        sub_text = sub.get("criterion", "").lower()
                        sub_marks = float(sub.get("max_marks", 0))
                        if sub_text in exist_subs:
                            continue  # exact text duplicate
                        if sub_marks in exist_marks:
                            # Same max_marks already present — keep the longer description
                            for i, existing in enumerate(all_cats[matched_key].get("subcriteria", [])):
                                if float(existing.get("max_marks", 0)) == sub_marks:
                                    if len(sub_text) > len(existing.get("criterion", "").lower()):
                                        all_cats[matched_key]["subcriteria"][i] = sub
                            continue
                        all_cats[matched_key].setdefault("subcriteria", []).append(sub)
                        exist_marks.add(sub_marks)

            thresh = data.get("threshold", {})
            if not isinstance(thresh, dict):
                thresh = {}
            
            pm = 0.0
            overall_pm = thresh.get("overall_pass_mark", 0.0)
            if isinstance(overall_pm, (int, float)):
                pm = float(overall_pm)
            elif isinstance(overall_pm, str):
                try:
                    pm = float(overall_pm)
                except ValueError:
                    pm = 0.0
            
            if pm > pass_mark:
                pass_mark = pm

            cat_mins_list = thresh.get("category_minimums", [])
            if not isinstance(cat_mins_list, list):
                cat_mins_list = []
            for cm in cat_mins_list:
                if isinstance(cm, dict) and "category" in cm:
                    cat_mins[cm.get("category", "").lower()] = cm
        except Exception as e:
            print(f"[Stage2 chunk] error: {e}")
            continue

    all_cats = await _merge_duplicate_tq_categories(all_cats, stage2_model, rfp_text)

    # Normalise weights to sum to 100
    raw_cats = []
    for cat in all_cats.values():
        mm = float(cat.get("max_marks") or 0)
        wp = float(cat.get("weight_percent") or 0)
        subs = cat.get("subcriteria", [])
        if not isinstance(subs, list):
            subs = []
        if mm == 0 and subs:
            mm = sum(float(s.get("max_marks") or 0) for s in subs if isinstance(s, dict))
        if wp == 0:
            wp = mm
        if mm > 0:
            raw_cats.append((cat, mm, wp))

    # ── Separate compliance-submission categories from scoring categories ──────
    # These are document-submission requirements (bank guarantee, PoA, etc.)
    # They should be eligibility checks (pass/fail), not weighted score categories.
    _COMPLIANCE_KEYWORDS = [
        "bank guarantee", "performance guarantee", "performance bond",
        "power of attorney", "authorization letter", "letter of authorization",
        "emd", "earnest money", "demand draft", "dd ",
        "undertaking", "affidavit", "declaration",
        "stamp duty", "agreement", "annexure", "checklist",
        "certificate of incorporation", "registration certificate",
        "integrity pact", "non-disclosure", "nda",
    ]

    scoring_raw: list = []
    for item in raw_cats:
        cat_name = item[0].get("category", "").lower()
        is_compliance = any(kw in cat_name for kw in _COMPLIANCE_KEYWORDS)
        if not is_compliance:
            scoring_raw.append(item)
    raw_cats = scoring_raw
    # ─────────────────────────────────────────────────────────────────────────

    raw_cats = _drop_non_scoring_categories(raw_cats)

    total_w = sum(w for _, _, w in raw_cats)
    if total_w > 0:
        raw_cats = [(c, m, round(w / total_w * 100, 2)) for c, m, w in raw_cats]

    categories = []
    for c, m, w in raw_cats:
        subs = c.get("subcriteria", [])
        if not isinstance(subs, list):
            subs = []
        subcriteria_list = []
        for s in subs:
            if not s:
                continue
            if isinstance(s, dict):
                crit_name = s.get("criterion", "Criterion")
                max_m = float(s.get("max_marks") or 0)
                subcriteria_list.append(SubCriterion(criterion=crit_name, max_marks=max_m))
            else:
                subcriteria_list.append(SubCriterion(criterion=str(s), max_marks=0))
        
        categories.append(
            ScoringCategory(
                category=c.get("category", "Category"),
                max_marks=m,
                weight_percent=w,
                subcriteria=subcriteria_list,
            )
        )

    # ── Filter out parent criteria when sub-criteria are present ─────────────────
    for cat in categories:
        sub_numbers = set()
        for s in cat.subcriteria:
            m = re.match(r'(?:Sub-Criterion|Sub-criterion|Sub_Criterion|Sub\s+Criterion)\s+(\d+)\b', s.criterion, re.IGNORECASE)
            if m:
                sub_numbers.add(m.group(1))
        
        filtered = []
        for s in cat.subcriteria:
            m = re.match(r'^Criterion\s+(\d+)\b', s.criterion, re.IGNORECASE)
            if m and m.group(1) in sub_numbers:
                print(f"[Stage2] Filtering out parent criterion '{s.criterion}' because child sub-criteria are present")
                continue
            filtered.append(s)
        cat.subcriteria = filtered

    threshold = Threshold(
        overall_pass_mark=pass_mark,
        category_minimums=[
            CategoryMinimum(category=cm.get("category", ""), minimum_percent=float(cm.get("minimum_percent") or 0))
            for cm in cat_mins.values()
            if isinstance(cm, dict)
        ],
    )

    # Force rules_found=False if no categories were successfully extracted
    rules_extracted = any_explicit_rules and len(all_cats) > 0

    # Deduplicate hierarchical categories — remove child entries whose marks are
    # already accounted for inside a parent category.
    categories = _deduplicate_scoring_categories(categories)

    return EvaluationRules(
        rules_found=rules_extracted,
        scoring_categories=categories,
        threshold=threshold,
    )


# ---------------------------------------------------------------------------
# Stage 3 — Vendor Response Parsing
# ---------------------------------------------------------------------------

async def stage3_parse_vendor_response(
    bid_text: str, rules: EvaluationRules, rfp_scoring_text: str = ""
) -> List[CriterionEvaluation]:
    """Evaluate each scoring category separately so bid extraction is focused.

    Accepts optional rfp_scoring_text so the LLM can evaluate tiered marks directly.
    """
    # Whichever model actually handles stage 3 (the override, if set) — used
    # to size chunk budgets so they match that model's real context window.
    stage3_model = STAGE3_MODEL_OVERRIDE or MODEL_NAME

    # Precompute bid-text chunk embeddings once, plus one query embedding per
    # category, in a single batched Ollama call. Every category then ranks
    # against these shared vectors instead of re-embedding the whole bid
    # document once per category (categories run concurrently below).
    bid_positions: list[int] = []
    bid_raw_chunks: list[str] = []
    i = 0
    while i < len(bid_text):
        chunk = bid_text[i: i + _EMBED_CHUNK_SIZE]
        if chunk.strip():
            bid_positions.append(i)
            bid_raw_chunks.append(chunk)
        i += _EMBED_STEP

    category_criteria_lists = [_category_criteria_list(cat) for cat in rules.scoring_categories]
    category_queries = [_build_criteria_query(cl) for cl in category_criteria_lists]

    query_vecs: list[list[float]] = [[] for _ in category_queries]
    bid_chunk_vecs: list[list[float]] = []
    if bid_raw_chunks and category_queries:
        bid_doc_id = vector_store.doc_hash(bid_text)
        query_vecs, bid_chunk_vecs = await asyncio.gather(
            _embed_batch(category_queries),
            _embed_chunks_cached(bid_doc_id, bid_raw_chunks),
        )

    print(f"[stage3_parse_vendor_response] model={stage3_model} bid_chars={len(bid_text)} bid_embed_chunks={len(bid_raw_chunks)} categories={len(rules.scoring_categories)}")

    async def _eval_category(cat: ScoringCategory, cat_index: int) -> List[CriterionEvaluation]:
        evals: List[CriterionEvaluation] = []
        criteria_list = category_criteria_lists[cat_index]
        query_vec = query_vecs[cat_index]
        is_generic = not cat.subcriteria  # True when no specific subcriteria found

        # Keep every bid chunk above a relevance threshold — not a character
        # cap — so nothing genuinely relevant is dropped just because there
        # wasn't "room" in a fixed budget.
        scored = [
            (_cosine_sim(query_vec, vec), pos, chunk)
            for vec, pos, chunk in zip(bid_chunk_vecs, bid_positions, bid_raw_chunks)
        ]
        relevant = _select_relevant_chunks(scored)
        relevant_text = "\n".join(chunk for _, chunk in relevant)

        if not relevant_text.strip():
            # Nothing matched semantically (e.g. embeddings unavailable) — fall
            # back to the keyword extractor rather than sending nothing.
            relevant_text = _extract_bid_sections(
                bid_text, criteria_list,
                _chunk_budget_tokens(3000, num_ctx=_num_ctx_for(stage3_model)) * CHARS_PER_TOKEN
            )

        # If the relevant text is bigger than one call can hold, split it into
        # multiple scoring calls and merge the results below — never truncate.
        # Guarantee at least one call even when relevant_text is empty, so an
        # empty-bid edge case still gets a real (likely "Not found") response
        # instead of silently making zero calls.
        budget = _chunk_budget_tokens(max_tokens=3000, num_ctx=_num_ctx_for(stage3_model))
        sub_chunks = _dynamic_chunks(relevant_text, budget) or [relevant_text]
        print(f"[stage3:{cat.category}] bid_chunks_matched={len(relevant)}/{len(scored)} relevant_chars={len(relevant_text)} sub_chunks={len(sub_chunks)}")

        # Detect whether this is a presentation/demo category that will be evaluated
        # during a future scheduled event. At bid stage, a detailed plan with committed
        # content and live-system evidence should be scored as 'Met', not 'Not Met'.
        _FUTURE_EVENT_KEYWORDS = ["presentation", "demonstration", "demo", "live demo", "showcase"]
        is_future_event = any(kw in cat.category.lower() for kw in _FUTURE_EVENT_KEYWORDS)

        today = "June 27, 2026"  # pinned — date.today() changes prompts across calendar days

        rfp_context = (
            f"\nRFP SCORING TIERS FOR REFERENCE (use these to determine the correct tier and marks):\n{rfp_scoring_text[:4000]}\n"
            if rfp_scoring_text and not is_future_event else ""
        )

        async def _call_one(sub_chunk: str) -> Optional[list]:
            prompt = render_prompt(
                "scoring_prompt",
                category=cat.category,
                max_marks=cat.max_marks,
                qualification_type=cat.qualification_type,
                is_generic=is_generic,
                is_future_event=is_future_event,
                has_rfp_scoring_text=bool(rfp_scoring_text),
                today=today,
                relevant_bid=sub_chunk,
                rfp_context=rfp_context,
                criteria_list_json=json.dumps(criteria_list, indent=2),
            )
            try:
                items = _parse_array(await _call(prompt, max_tokens=3000, model=STAGE3_MODEL_OVERRIDE))
                return items if isinstance(items, list) else []
            except Exception:
                return None  # distinct from "call succeeded, found nothing"

        sub_results = await asyncio.gather(*[_call_one(sc) for sc in sub_chunks])
        any_success = any(r is not None for r in sub_results)
        items = _merge_criterion_evals([r for r in sub_results if r])

        if not any_success:
            # Every sub-call actually failed (network/API error) — synthetic
            # error rows. A legitimate empty result (model found nothing) is
            # NOT an error and stays silently empty, same as before this change.
            for c in criteria_list:
                evals.append(CriterionEvaluation(
                    criterion=c["criterion"], category=c["category"],
                    max_marks=c["max_marks"], vendor_claim="Evaluation error",
                    source_reference="Not found", compliance_status="Not Met",
                    confidence="Low", justification="Parsing failed for this category.",
                ))
        else:
            for item in items:
                if not isinstance(item, dict):
                    continue
                # Default missing keys in item to satisfy CriterionEvaluation
                for k in ["criterion", "category", "vendor_claim", "source_reference", "compliance_status", "confidence", "justification"]:
                    if k not in item:
                        item[k] = "Not found" if k in ["vendor_claim", "source_reference"] else ""
                if "max_marks" not in item:
                    item["max_marks"] = 0.0
                if "marks_awarded" not in item:
                    item["marks_awarded"] = 0.0
                item.pop("is_mandatory", None)
                evals.append(CriterionEvaluation(**item))

        # Propagate qualification_type from the parent category so downstream
        # code (pq_checks derivation, risk synthesis) can filter PQ vs TQ.
        for ev in evals:
            if not ev.qualification_type:
                ev.qualification_type = cat.qualification_type
        return evals

    cat_eval_lists = await asyncio.gather(
        *[_eval_category(cat, idx) for idx, cat in enumerate(rules.scoring_categories)],
        return_exceptions=True,
    )
    all_evals: List[CriterionEvaluation] = []
    for result in cat_eval_lists:
        if isinstance(result, Exception):
            print(f"[Stage3] Category evaluation error: {result}")
        else:
            all_evals.extend(result)
    return all_evals


# ---------------------------------------------------------------------------
# Stage 4 — Scoring Engine (deterministic)
# ---------------------------------------------------------------------------

def stage4_calculate_scores(
    criteria_evals: List[CriterionEvaluation],
    rules: EvaluationRules,
) -> List[CategoryResult]:
    # First pass: resolve per-category minimum from RFP.
    # Only EXPLICIT per-category minimums go into cat_min_map.
    # overall_pass_mark is used in the second pass for per-criterion labels only —
    # it must NOT go into cat_min_map because that would force every category to
    # require 70% individually, which is far stricter than the RFP intends.
    overall_min = rules.threshold.overall_pass_mark or 0.0
    cat_min_map: dict = {}  # category -> (min_pct, source) — source is "category" only
    for cat in rules.scoring_categories:
        min_pct: Optional[float] = None
        source: Optional[str] = None
        for cm in rules.threshold.category_minimums:
            if cm.category == cat.category and cm.minimum_percent > 0:
                min_pct = cm.minimum_percent
                source = "category"
                break
        cat_min_map[cat.category] = (min_pct, source)

    # Second pass: fix marks then set compliance status + threshold_logic per criterion.
    for ce in criteria_evals:
        # If LLM said Met but gave no valid marks, award full marks
        if ce.compliance_status == "Met" and not (0 < ce.marks_awarded <= ce.max_marks):
            ce.marks_awarded = ce.max_marks
        # Clamp to valid range
        ce.marks_awarded = max(0.0, min(ce.marks_awarded, ce.max_marks))

        min_pct, source = cat_min_map.get(ce.category, (None, None))
        if ce.max_marks > 0:
            if min_pct is not None:
                # Explicit per-category RFP minimum
                threshold = ce.max_marks * (min_pct / 100)
                ce.compliance_status = "Met" if ce.marks_awarded >= threshold else "Not Met"
                ce.threshold_logic = f"RFP Category Min ({min_pct}%)"
            elif overall_min > 0:
                # No explicit category rule — apply overall pass mark for display only.
                # This does NOT affect per-category pass/fail (cat_min_map has no overall_min).
                threshold = ce.max_marks * (overall_min / 100)
                ce.compliance_status = "Met" if ce.marks_awarded >= threshold else "Not Met"
                ce.threshold_logic = f"Overall Min Fallback ({overall_min}%)"
            else:
                # No RFP pass mark at all
                ce.compliance_status = "Met" if ce.marks_awarded > ce.max_marks / 2 else "Not Met"
                ce.threshold_logic = "50% Fallback"
        else:
            ce.compliance_status = "Not Met"
            ce.threshold_logic = "N/A"

    # Third pass: aggregate into category results.
    category_results = []
    for cat in rules.scoring_categories:
        cat_criteria  = [ce for ce in criteria_evals if ce.category == cat.category]
        raw_marks     = round(sum(ce.marks_awarded for ce in cat_criteria), 2)
        # Cap at category max — duplicate/overlapping criteria extracted across chunks
        # can push the raw sum above max_marks, causing >100% scores.
        marks_awarded = min(raw_marks, cat.max_marks)
        pct           = round(marks_awarded / cat.max_marks * 100, 1) if cat.max_marks else 0.0

        min_pct, _src = cat_min_map.get(cat.category, (None, None))
        # PQ categories are binary gates — must be fully Met (any awarded marks = passed),
        # but 0 marks means failed. For TQ categories, check against minimum_percent or >0.
        if cat.qualification_type == "PQ":
            cat_passed = marks_awarded > 0
        else:
            cat_passed = pct >= min_pct if min_pct is not None else pct > 0
        weighted   = round((marks_awarded / cat.max_marks) * cat.weight_percent, 2) if cat.max_marks else 0.0

        category_results.append(
            CategoryResult(
                category=cat.category,
                max_marks=cat.max_marks,
                marks_awarded=marks_awarded,
                percent_achieved=pct,
                weight_percent=cat.weight_percent,
                weighted_score=weighted,
                passed=cat_passed,
                minimum_required=min_pct,
                criteria=cat_criteria,
                qualification_type=cat.qualification_type,
            )
        )

    return category_results


# ---------------------------------------------------------------------------
# Stage 5 — Gap Analysis & Risk Flagging
# ---------------------------------------------------------------------------

async def stage5_gap_analysis(
    criteria_evals: List[CriterionEvaluation],
    category_results: List[CategoryResult] = [],
) -> List[RiskItem]:
    # Category-level summary gives context even when individual criteria are sparse
    cat_summary = [
        {
            "category": cr.category,
            "marks_awarded": cr.marks_awarded,
            "max_marks": cr.max_marks,
            "percent_achieved": round(cr.percent_achieved, 1),
            "passed": cr.passed,
        }
        for cr in category_results
    ]

    # Criterion-level detail for specific gaps
    crit_summary = [
        {
            "criterion": ce.criterion,
            "category": ce.category,
            "compliance_status": ce.compliance_status,
            "marks_awarded": ce.marks_awarded,
            "max_marks": ce.max_marks,
            "vendor_claim": ce.vendor_claim,
        }
        for ce in criteria_evals
    ]

    prompt = render_prompt(
        "risk_prompt",
        cat_summary_json=json.dumps(cat_summary, indent=2),
        crit_summary_json=json.dumps(crit_summary, indent=2),
    )

    items = _parse_array(await _call(prompt, max_tokens=800))
    if not isinstance(items, list):
        items = []
    risks = []
    for item in items:
        if isinstance(item, dict):
            area = item.get("risk_area", "")
            sev = item.get("severity", "Medium")
            desc = item.get("description", "")
            risks.append(RiskItem(risk_area=area, severity=sev, description=desc))
    return risks


def _synthesize_pq_risks(risk_items: List[RiskItem], pq_checks: list) -> List[RiskItem]:
    """Prepend PQ failures as High-severity risks so they always appear in gap analysis."""
    failed = [chk for chk in pq_checks if chk.status == "Not Met"]
    if not failed:
        return risk_items
    existing = {r.risk_area.lower() for r in risk_items}
    pq_risks = []
    for chk in failed:
        # Skip if the LLM already identified this PQ gap
        if any(chk.criterion.lower()[:35] in area for area in existing):
            continue
        pq_risks.append(RiskItem(
            risk_area=f"PQ Failure: {chk.criterion}",
            severity="High",
            description=(
                f"Pre-qualification requirement NOT MET — {chk.detail}. "
                f"{chk.justification}"
            ).strip(),
        ))
    return pq_risks + list(risk_items)  # PQ failures always shown first


# ---------------------------------------------------------------------------
# Stage 6 — Executive Summary
# ---------------------------------------------------------------------------

async def stage6_executive_summary(
    total_score: float,
    max_score: float,
    passed: bool,
    category_results: List[CategoryResult],
) -> str:
    cat_summary = [
        f"{cr.category}: {cr.marks_awarded}/{cr.max_marks} ({cr.percent_achieved}%)"
        for cr in category_results
    ]

    prompt = render_prompt(
        "summary_prompt",
        result_label="PASSED" if passed else "FAILED",
        total_score=total_score,
        max_score=max_score,
        cat_summary="; ".join(cat_summary),
    )

    return (await _call(prompt, max_tokens=200)).strip()


# ---------------------------------------------------------------------------
# Stage 7 — Pre-Bid Q&A Extraction
# ---------------------------------------------------------------------------

_QA_SYSTEM = (
    "You are a document parser that extracts question-and-answer pairs from pre-bid clarification documents. "
    "Return only valid JSON arrays. Never fabricate data — if content is absent, return []."
)

async def stage_extract_prebid_qa(prebid_text: str) -> list:
    """Extract structured Q&A pairs from a pre-bid clarification document."""
    prompt = render_prompt("qa_prompt", prebid_text=prebid_text[:8000])
    try:
        items = _parse_array(await _call(prompt, system=_QA_SYSTEM))
        return [PrebidQA(**item) for item in items if isinstance(item, dict) and "question" in item and "answer" in item]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Orchestrator — shared stages 3-6
# ---------------------------------------------------------------------------

async def stage_extract_pq_criteria(rfp_text: str) -> list:
    """Extract PQ/eligibility criteria from RFP as a plain list of dicts.

    Searches the first 30K chars in two 15K-char passes so PQ sections
    that appear beyond the first page are not missed.
    """
    seen: set[str] = set()
    all_items: list = []
    for start in range(0, min(len(rfp_text), 30_000), 15_000):
        chunk = rfp_text[start: start + 15_000]
        if not chunk.strip():
            continue
        try:
            raw = await _call(_rfp_pq_extract_prompt(chunk))
            items = _parse_array(raw)
            for i in items:
                if not isinstance(i, dict) or not i.get("criterion"):
                    continue
                key = i["criterion"].strip().lower()[:80]
                if key not in seen:
                    seen.add(key)
                    all_items.append(i)
        except Exception:
            continue
    return all_items


async def stage_evaluate_pq_criteria(bid_text: str, pq_criteria: list) -> list:
    """Evaluate each PQ criterion against the bid and return PQCheck objects."""
    if not pq_criteria:
        return []
    chunk = bid_text[:6_000]
    try:
        raw = await _call(_pq_evaluate_prompt(chunk, pq_criteria))
        items = _parse_array(raw)
        checks = []
        for item in items:
            if not isinstance(item, dict):
                continue
            checks.append(PQCheck(
                criterion=item.get("criterion", ""),
                detail=item.get("detail", ""),
                status=item.get("status", "Not Met"),
                vendor_claim=item.get("vendor_claim", "Not found"),
                justification=item.get("justification", ""),
            ))
        return checks
    except Exception:
        return []


async def _run_pipeline(
    bid_text: str,
    rules: EvaluationRules,
    rfp_scoring_text: str = "",
    prebid_text: str = "",
    pq_criteria: list = [],
) -> EvaluationReport:
    criteria_evals   = await stage3_parse_vendor_response(bid_text, rules, rfp_scoring_text)
    category_results = stage4_calculate_scores(criteria_evals, rules)

    disqualified            = False
    disqualification_reason = None

    total_score = round(sum(cr.weighted_score for cr in category_results), 2)
    max_score   = round(sum(cat.weight_percent for cat in rules.scoring_categories), 2)
    threshold   = rules.threshold.overall_pass_mark

    category_fail = any(
        not cr.passed for cr in category_results if cr.minimum_required is not None
    )
    # Any PQ failure disqualifies the bid regardless of TQ score
    pq_fail = any(not cr.passed for cr in category_results if cr.qualification_type == "PQ")
    passed = not disqualified and not category_fail and not pq_fail and total_score >= threshold

    is_perfect = max_score > 0 and total_score >= max_score
    async def _empty() -> list:
        return []

    risk_items, executive_summary, prebid_qa, pq_checks = await asyncio.gather(
        _empty() if is_perfect else stage5_gap_analysis(criteria_evals, category_results),
        stage6_executive_summary(total_score, max_score, passed, category_results),
        stage_extract_prebid_qa(prebid_text) if prebid_text.strip() else _empty(),
        stage_evaluate_pq_criteria(bid_text, pq_criteria),
    )

    # When PQ criteria are embedded in rules.scoring_categories (stage2_extract_pqtq_rules),
    # stage_evaluate_pq_criteria receives an empty list and returns [].
    # Derive pq_checks from the PQ CategoryResults produced by stage3/4 instead.
    if not pq_checks:
        pq_checks = [
            PQCheck(
                criterion=ce.criterion,
                detail=ce.justification,
                status="Met" if ce.compliance_status == "Met" else "Not Met",
                vendor_claim=ce.vendor_claim,
                justification=ce.justification,
            )
            for cr in category_results
            if cr.qualification_type == "PQ"
            for ce in cr.criteria
        ]

    # Prepend any PQ failures as High-severity risks — gap analysis runs in parallel
    # with PQ evaluation so it can't see PQ results; we merge them deterministically here.
    risk_items = _synthesize_pq_risks(list(risk_items), pq_checks)

    prebid_applied = bool(prebid_text.strip())

    return EvaluationReport(
        total_score=total_score,
        max_score=max_score,
        threshold=threshold,
        passed=passed,
        disqualified=disqualified,
        disqualification_reason=disqualification_reason,
        category_results=category_results,
        pq_checks=pq_checks,
        risk_items=risk_items,
        executive_summary=executive_summary,
        rules=rules,
        prebid_qa=prebid_qa,
        prebid_applied=prebid_applied,
        metadata=EvaluationMetadata(
            llm_model=_llm_model_summary(),
            embed_model=_EMBED_MODEL,
            temperature=TEMPERATURE,
            seed=SEED,
            prompt_version=PROMPT_VERSION,
        ),
    )


def _rfp_has_explicit_marks(text: str) -> bool:
    """Return True only when the RFP text contains explicit numeric scoring marks.

    Patterns like '20 marks', '10 points', 'max marks: 30' must be present.
    A section heading like 'Evaluation Criteria' without numbers is NOT enough.
    """
    patterns = [
        r'\b\d+\s*(?:marks?|points?|pts)\b',
        r'\b(?:max(?:imum)?|total)\s+marks?\s*[:=\-]\s*\d+',
        r'\bweightage\s*[:=\-]\s*\d+',
        r'\b\d+\s*(?:marks?|points?)\s*(?:each|total|max|out\s+of)',
        r'\bmax(?:imum)?\s*:\s*\d+',
        r'\bout\s+of\s+\d+\s+marks?\b',
    ]
    for pat in patterns:
        if re.search(pat, text, re.I):
            return True
    return False


async def run_full_evaluation(
    rfp_text: str, bid_text: str, prebid_text: str = "",
    readiness_rules: Optional[EvaluationRules] = None,
    custom_threshold: Optional[float] = None,
) -> EvaluationReport:
    prebid_applied = bool(prebid_text.strip())
    # Always extract PQ/TQ criteria from the ORIGINAL rfp_text only.
    # Appending a supported doc changes the anchor position inside stage2 chunking,
    # causing PQ criteria to vary across runs with the same RFP — which is wrong.
    rfp_for_scoring = rfp_text
    if prebid_applied:
        rfp_for_scoring = (
            rfp_text
            + "\n\n=== ADDITIONAL DOCUMENT (evaluation rules / scoring criteria / pre-bid clarifications) ===\n\n"
            + prebid_text.strip()
        )

    if readiness_rules is not None:
        rules = readiness_rules
    else:
        print(f"[run_full_evaluation] rfp_text length={len(rfp_text)}, first 200: {rfp_text[:200]!r}")
        # Run both extractors in parallel — PQTQ (PQ+TQ labels) and general (plain scoring table).
        # The general extractor now also has the tail chunk and accepts marks/score/points/weightage,
        # so it can find rules in supporting documents that use non-PQTQ column headers.
        p1_pqtq, p1_general = await asyncio.gather(
            stage2_extract_pqtq_rules(rfp_text),
            stage2_extract_rules(rfp_text),
            return_exceptions=True,
        )
        if not isinstance(p1_pqtq, Exception) and p1_pqtq.rules_found:
            rules = p1_pqtq
        elif not isinstance(p1_general, Exception) and p1_general.rules_found:
            rules = p1_general
        else:
            rules = p1_pqtq if not isinstance(p1_pqtq, Exception) else EvaluationRules(rules_found=False)
        print(f"[run_full_evaluation] pass-1 rules_found={rules.rules_found}, cats={len(rules.scoring_categories)}")

        # Fallback: if the combined text yielded no rules but the user attached
        # supporting RFP documents (evaluation rule sheets, scoring matrices, etc.),
        # run extraction again on just those documents. The main RFP may be large
        # enough to push the supporting docs beyond the chunk window on the first pass.
        # Also try the general extractor (stage2_extract_rules) in parallel because the
        # supporting doc may use a plain scoring-table format that the PQTQ-scoped prompt
        # does not recognise.
        if not rules.rules_found:
            supp_match = re.search(
                r'===\s*SUPPORTING RFP DOCUMENT\s+\d+', rfp_text, re.IGNORECASE
            )
            print(f"[run_full_evaluation] supp_match={supp_match}")
            if supp_match:
                supp_text = rfp_text[supp_match.start():]
                print(f"[run_full_evaluation] supp_text length={len(supp_text)}, preview: {supp_text[:300]!r}")
                general_result, pqtq_result = await asyncio.gather(
                    stage2_extract_rules(supp_text),
                    stage2_extract_pqtq_rules(supp_text),
                    return_exceptions=True,
                )
                if not isinstance(general_result, Exception) and general_result.rules_found:
                    rules = general_result
                    print(f"[run_full_evaluation] pass-2 (general) rules_found=True, cats={len(rules.scoring_categories)}")
                elif not isinstance(pqtq_result, Exception) and pqtq_result.rules_found:
                    rules = pqtq_result
                    print(f"[run_full_evaluation] pass-2 (pqtq) rules_found=True, cats={len(rules.scoring_categories)}")
                else:
                    print(f"[run_full_evaluation] pass-2 both extractors failed")

    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")
    if custom_threshold is not None:
        rules.threshold.overall_pass_mark = custom_threshold
    rfp_scoring_text = await _extract_scoring_sections_semantic(rfp_for_scoring, RFP_SCORING_CONTEXT_CHARS)
    # pq_criteria=[] because PQ is already embedded in rules.scoring_categories
    # (weight_percent=0 for PQ so they don't inflate the TQ score)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text, prebid_text=prebid_text, pq_criteria=[])


async def run_evaluation_with_rules(bid_text: str, rules: EvaluationRules) -> EvaluationReport:
    """Run evaluation stages 3-6 using caller-supplied rules (no RFP needed)."""
    return await _run_pipeline(bid_text, rules)


# ---------------------------------------------------------------------------
# PQTQ evaluation — PQ/TQ-scoped rule extraction + lenient scoring
# ---------------------------------------------------------------------------

async def stage2_extract_pqtq_rules(rfp_text: str) -> EvaluationRules:
    """Like stage2_extract_rules but scoped to PQ/TQ criteria only."""
    stage2_model = STAGE2_MODEL_OVERRIDE or MODEL_NAME

    # Chunk count is derived from document size — see stage2_extract_rules.
    # Every chunk is a distinct, contiguous slice of the document, covering
    # it end-to-end regardless of how long it is.
    budget = _chunk_budget_tokens(max_tokens=4000, num_ctx=_num_ctx_for(stage2_model))
    chunks = _dynamic_chunks(rfp_text, budget)

    print(f"[stage2_extract_pqtq_rules] model={stage2_model} rfp_chars={len(rfp_text)} budget_tokens={budget} chunks={len(chunks)} sizes={[len(c) for c in chunks]}")
    for idx, c in enumerate(chunks):
        print(f"  chunk[{idx}] starts: {c[:120]!r}")

    all_cats: dict[str, dict] = {}
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    any_explicit_rules = False

    chunk_results = await asyncio.gather(
        *[_call(_rfp_pqtq_prompt(c), max_tokens=4000, model=stage2_model) for c in chunks],
        return_exceptions=True,
    )
    for raw in chunk_results:
        try:
            if isinstance(raw, Exception):
                print(f"[Stage2-PQTQ chunk] error: {raw}")
                continue
            data = _parse_object(raw)
            chunk_has_rules = bool(data.get("rules_found", False))
            print(f"[Stage2-PQTQ chunk] rules_found={chunk_has_rules}, cats={len(data.get('scoring_categories', []))}, raw_preview={str(raw)[:200]!r}")
            if chunk_has_rules:
                any_explicit_rules = True
            else:
                continue

            scoring_categories = data.get("scoring_categories", [])
            if not isinstance(scoring_categories, list):
                scoring_categories = []
            for cat in scoring_categories:
                if not isinstance(cat, dict):
                    continue
                key = cat.get("category", "")
                if not isinstance(key, str):
                    key = str(key)
                key = key.strip().lower()
                if not key:
                    continue
                base = _base_cat_key(key)
                matched_key = key if key in all_cats else next(
                    (k for k in all_cats if _base_cat_key(k) == base), None
                )
                if matched_key is None:
                    all_cats[key] = {**cat}
                else:
                    existing_name = all_cats[matched_key].get("category", "")
                    new_name = cat.get("category", "")
                    if len(new_name) > len(existing_name):
                        all_cats[matched_key]["category"] = new_name
                    subs = all_cats[matched_key].get("subcriteria", [])
                    if not isinstance(subs, list):
                        subs = []
                    exist_subs = {s["criterion"].lower() for s in subs if isinstance(s, dict) and "criterion" in s}
                    exist_marks = {float(s.get("max_marks", 0)) for s in subs if isinstance(s, dict)}
                    cat_subs = cat.get("subcriteria", [])
                    if not isinstance(cat_subs, list):
                        cat_subs = []
                    for sub in cat_subs:
                        if not isinstance(sub, dict):
                            continue
                        sub_text = sub.get("criterion", "").lower()
                        sub_marks = float(sub.get("max_marks", 0))
                        if sub_text in exist_subs:
                            continue  # exact text duplicate
                        if sub_marks in exist_marks:
                            # Same max_marks already present — keep the longer description
                            for i, existing in enumerate(all_cats[matched_key].get("subcriteria", [])):
                                if float(existing.get("max_marks", 0)) == sub_marks:
                                    if len(sub_text) > len(existing.get("criterion", "").lower()):
                                        all_cats[matched_key]["subcriteria"][i] = sub
                            continue
                        all_cats[matched_key].setdefault("subcriteria", []).append(sub)
                        exist_marks.add(sub_marks)

            thresh = data.get("threshold", {})
            if not isinstance(thresh, dict):
                thresh = {}
            pm = float(thresh.get("overall_pass_mark", 0) or 0)
            if pm > pass_mark:
                pass_mark = pm

            for cm in (thresh.get("category_minimums") or []):
                if isinstance(cm, dict) and "category" in cm:
                    cat_mins[cm.get("category", "").lower()] = cm
        except Exception as e:
            print(f"[Stage2-PQTQ chunk] error: {e}")
            continue

    all_cats = await _merge_duplicate_tq_categories(all_cats, stage2_model, rfp_text)
    all_cats = await _cleanup_pq_categories(all_cats, stage2_model)

    raw_cats = []
    for cat in all_cats.values():
        mm = float(cat.get("max_marks") or 0)
        wp = float(cat.get("weight_percent") or 0)
        subs = cat.get("subcriteria", [])
        if not isinstance(subs, list):
            subs = []
        if mm == 0 and subs:
            mm = sum(float(s.get("max_marks") or 0) for s in subs if isinstance(s, dict))
        if wp == 0:
            wp = mm
        if mm > 0:
            raw_cats.append((cat, mm, wp))

    raw_cats = _drop_non_scoring_categories(raw_cats)

    # PQ categories are pass/fail eligibility gates — they must NOT contribute to the
    # weighted TQ score. Normalize TQ weights to sum to 100; PQ gets weight_percent=0.
    pq_raw = [(c, m, w) for c, m, w in raw_cats if str(c.get("qualification_type", "")).upper() == "PQ"]
    tq_raw = [(c, m, w) for c, m, w in raw_cats if str(c.get("qualification_type", "")).upper() != "PQ"]
    total_w = sum(w for _, _, w in tq_raw)
    if total_w > 0:
        tq_raw = [(c, m, round(w / total_w * 100, 2)) for c, m, w in tq_raw]
    raw_cats = tq_raw + [(c, m, 0.0) for c, m, w in pq_raw]

    categories = []
    for c, m, w in raw_cats:
        subs = c.get("subcriteria", [])
        if not isinstance(subs, list):
            subs = []
        subcriteria_list = []
        for s in subs:
            if not s:
                continue
            if isinstance(s, dict):
                subcriteria_list.append(SubCriterion(
                    criterion=s.get("criterion", "Criterion"),
                    max_marks=float(s.get("max_marks") or 0),
                ))
            else:
                subcriteria_list.append(SubCriterion(criterion=str(s), max_marks=0))
        categories.append(ScoringCategory(
            category=c.get("category", "Category"),
            max_marks=m,
            weight_percent=w,
            subcriteria=subcriteria_list,
            qualification_type=str(c.get("qualification_type", "") or ""),
        ))

    # Filter out parent criteria when sub-criteria are present
    for cat in categories:
        sub_numbers = {
            m.group(1)
            for s in cat.subcriteria
            for m in [re.match(r'(?:Sub-Criterion|Sub-criterion|Sub\s+Criterion)\s+(\d+)\b', s.criterion, re.IGNORECASE)]
            if m
        }
        cat.subcriteria = [
            s for s in cat.subcriteria
            if not (re.match(r'^Criterion\s+(\d+)\b', s.criterion, re.IGNORECASE) and
                    re.match(r'^Criterion\s+(\d+)\b', s.criterion, re.IGNORECASE).group(1) in sub_numbers)
        ]

    threshold = Threshold(
        overall_pass_mark=pass_mark,
        category_minimums=[
            CategoryMinimum(category=cm.get("category", ""), minimum_percent=float(cm.get("minimum_percent") or 0))
            for cm in cat_mins.values()
            if isinstance(cm, dict)
        ],
    )

    qcbs = bool(re.search(
        r'\bqcbs\b|quality\s+and\s+cost\s+based\s+selection|quality\s+cost\s+based\s+selection',
        rfp_text, re.IGNORECASE
    ))

    return EvaluationRules(
        rules_found=any_explicit_rules and len(all_cats) > 0,
        scoring_categories=categories,
        threshold=threshold,
        qcbs_methodology=qcbs,
    )


_PQ_KEYWORDS = ["pre-qualif", "pre qualif", "prequalif", "eligib", "pq —", "pq-", " pq ", "(pq)", "annexure 2", "annex 2"]
_TQ_KEYWORDS = ["technical qual", "technical eval", "tq —", "tq-", " tq ", "(tq)", "annexure 18", "annex 18", "technical criteria"]


async def run_pqtq_evaluation(
    rfp_text: str, bid_text: str,
    readiness_rules: Optional[EvaluationRules] = None,
    custom_threshold: Optional[float] = None,
) -> EvaluationReport:
    """Evaluate bid scoped to Pre-Qualification / Technical Qualification criteria only.

    If *readiness_rules* is provided (converted from a prior Bid Readiness run),
    those rules are used directly — bypassing a second LLM extraction call.
    This ensures the criteria shown in the PQTQ Readiness tab are *identical*
    to the criteria used in this evaluation.
    """
    if readiness_rules is not None:
        rules = readiness_rules
    else:
        rules = await stage2_extract_pqtq_rules(rfp_text)
    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")
    if custom_threshold is not None:
        rules.threshold.overall_pass_mark = custom_threshold

    for cat in rules.scoring_categories:
        if not cat.qualification_type:
            name = cat.category.lower()
            if any(k in name for k in _TQ_KEYWORDS):
                cat.qualification_type = "TQ"
            elif any(k in name for k in _PQ_KEYWORDS):
                cat.qualification_type = "PQ"
            else:
                cat.qualification_type = "TQ"

    rfp_scoring_text = await _extract_scoring_sections_semantic(rfp_text, RFP_SCORING_CONTEXT_CHARS)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text)


def convert_readiness_to_rules(
    pq_items: list[dict],
    tq_items: list[dict],
) -> EvaluationRules:
    """Convert Bid Readiness checklist items into EvaluationRules.

    This is the bridge between the Readiness phase (``ChecklistItem`` flat
    lists) and the Evaluation phase (``EvaluationRules`` with weighted
    scoring categories).

    PQ items become a single "Pre-Qualification Requirements" category
    with weight_percent=0 so they are treated as pass/fail gates.

    TQ items are grouped by their ``category`` field and assigned weights
    proportional to their aggregate max_score.
    """
    from collections import OrderedDict

    scoring_categories: list[ScoringCategory] = []

    # ── PQ category (pass/fail, weight=0) ────────────────────────────────
    pq_subcriteria = []
    for item in pq_items:
        criterion_text = item.get("criterion", "").strip()
        if not criterion_text:
            continue
        pq_subcriteria.append(SubCriterion(
            criterion=criterion_text,
            max_marks=1.0,
        ))
    if pq_subcriteria:
        scoring_categories.append(ScoringCategory(
            category="Pre-Qualification Requirements",
            max_marks=float(len(pq_subcriteria)),
            weight_percent=0.0,
            subcriteria=pq_subcriteria,
            qualification_type="PQ",
        ))

    # ── TQ categories (weighted by marks) ────────────────────────────────
    tq_by_cat: OrderedDict[str, list[dict]] = OrderedDict()
    for item in tq_items:
        criterion_text = item.get("criterion", "").strip()
        if not criterion_text:
            continue
        cat_name = item.get("category", "Technical").strip() or "Technical"
        tq_by_cat.setdefault(cat_name, []).append(item)

    total_tq_marks = sum(
        float(item.get("max_score", 0) or 0)
        for items in tq_by_cat.values()
        for item in items
    )

    for cat_name, items in tq_by_cat.items():
        cat_marks = sum(float(item.get("max_score", 0) or 0) for item in items)
        weight = (
            round(cat_marks / total_tq_marks * 100, 2) if total_tq_marks > 0
            else round(100 / max(len(tq_by_cat), 1), 2)
        )
        subcriteria = [
            SubCriterion(
                criterion=item.get("criterion", "").strip(),
                max_marks=float(item.get("max_score", 10) or 10),
            )
            for item in items
            if item.get("criterion", "").strip()
        ]
        if subcriteria:
            scoring_categories.append(ScoringCategory(
                category=cat_name,
                max_marks=cat_marks if cat_marks > 0 else sum(s.max_marks for s in subcriteria),
                weight_percent=weight,
                subcriteria=subcriteria,
                qualification_type="TQ",
            ))

    rules_found = len(scoring_categories) > 0

    return EvaluationRules(
        rules_found=rules_found,
        scoring_categories=scoring_categories,
        threshold=Threshold(overall_pass_mark=0),
    )


# ---------------------------------------------------------------------------
# Bid Readiness — extract PQ/TQ checklist in plain English (no bid needed)
# ---------------------------------------------------------------------------

async def extract_bid_readiness_checklist(
    rfp_text: str, additional_text: str = ""
) -> BidReadinessResult:
    """Extract PQ/TQ criteria from RFP as a plain-English self-assessment checklist."""
    combined = rfp_text
    if additional_text.strip():
        combined = rfp_text + "\n\n=== ADDITIONAL DOCUMENT ===\n\n" + additional_text

    # Use the unified PQTQ rules extractor to guarantee identical criteria extraction
    # as the PQTQ Evaluation tab.
    rules = await stage2_extract_pqtq_rules(combined)

    pq_items: List[ChecklistItem] = []
    tq_items: List[ChecklistItem] = []
    
    pq_count = 0
    tq_count = 0
    total_tq = 0.0

    for cat in rules.scoring_categories:
        is_pq = (cat.qualification_type == "PQ" or cat.weight_percent == 0)
        
        if is_pq:
            # If a PQ category has no subcriteria, add the category itself as a checklist item
            if not cat.subcriteria:
                pq_items.append(ChecklistItem(
                    id=f"pq_{pq_count}",
                    type="PQ",
                    category=cat.category,
                    criterion=cat.category,
                    detail=cat.category,
                    max_score=0.0,
                    is_mandatory=True,
                ))
                pq_count += 1
            else:
                for sub in cat.subcriteria:
                    pq_items.append(ChecklistItem(
                        id=f"pq_{pq_count}",
                        type="PQ",
                        category=cat.category,
                        criterion=sub.criterion,
                        detail=sub.criterion,
                        max_score=0.0,
                        is_mandatory=True,
                    ))
                    pq_count += 1
        else:
            # TQ category
            if not cat.subcriteria:
                tq_items.append(ChecklistItem(
                    id=f"tq_{tq_count}",
                    type="TQ",
                    category=cat.category,
                    criterion=cat.category,
                    detail=cat.category,
                    max_score=cat.max_marks,
                    is_mandatory=False,
                ))
                total_tq += cat.max_marks
                tq_count += 1
            else:
                for sub in cat.subcriteria:
                    tq_items.append(ChecklistItem(
                        id=f"tq_{tq_count}",
                        type="TQ",
                        category=cat.category,
                        criterion=sub.criterion,
                        detail=sub.criterion,
                        max_score=sub.max_marks,
                        is_mandatory=False,
                    ))
                    total_tq += sub.max_marks
                    tq_count += 1

    return BidReadinessResult(
        pq_items=pq_items,
        tq_items=tq_items,
        total_tq_score=round(total_tq, 2),
    )
