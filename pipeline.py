"""7-stage RFP evaluation pipeline powered by Ollama (gemma4:26b primary)."""

import asyncio
import json
import os
import re
from datetime import date
from typing import List, Optional

from dotenv import load_dotenv
from openai import AsyncOpenAI

from models import (
    BidReadinessResult,
    CategoryMinimum,
    CategoryResult,
    ChecklistItem,
    CriterionEvaluation,
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

# Model preference order — best accuracy first.
# gemma4:26b is the largest local model and gives the best reasoning quality.
# minimax-m2.7:cloud is cloud-backed and is a strong secondary.
# llama3:latest / llama3:8b are the same model (same digest) — used as fallback.
_MODELS = [
    "minimax-m2.7:cloud",      # primary — cloud-backed, fast inference
    "llama3:8b",               # fallback — CPU inference
    "llama3:latest",           # identical to llama3:8b, backup slot
    "gemma4:26b",              # last resort — large/slow on CPU
]
MODEL_NAME = _MODELS[0]

# Chunk sizes — Ollama models run locally so no TPM quota pressure.
# gemma4:26b supports 128K context; keep chunks sane for latency reasons.
MAX_RFP_CHARS         =  15_000
MAX_BID_CHARS         =   6_000   # larger than Groq (no quota limit)
MAX_BID_CHARS_GENERIC =  10_000   # wide window for generic categories
MAX_DISQ_CHARS        =   6_000

SYSTEM = (
    "You are an expert RFP (Request for Proposal) / Tender Evaluation Assistant. "
    "You analyze procurement documents, extract scoring criteria, evaluate vendor bids, "
    "and produce structured evaluation reports. "
    "Respond with valid JSON only when asked for structured output — no prose, no markdown fences. "
    "Base every assessment solely on evidence found in the provided documents. "
    "If something is not found in the document, state 'Not found in document' and score it 0."
)

_client: Optional[AsyncOpenAI] = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=f"{OLLAMA_BASE_URL}/v1",
            api_key="ollama",          # Ollama ignores the key; must be non-empty
        )
    return _client


# Limit concurrent LLM calls so the cloud-backed primary model (minimax-m2.7:cloud)
# is not flooded by asyncio.gather firing all chunks simultaneously → 429 errors.
_CALL_SEMAPHORE: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _CALL_SEMAPHORE
    if _CALL_SEMAPHORE is None:
        _CALL_SEMAPHORE = asyncio.Semaphore(3)
    return _CALL_SEMAPHORE


async def _call(prompt: str, system: str = SYSTEM, max_tokens: int = 1200) -> str:
    """Try each model in _MODELS; fall back to next on error.

    Limits concurrent requests to 3 via a semaphore so the cloud primary model
    is not rate-limited when many chunks run in parallel.
    """
    async with _get_semaphore():
        last_exc: Exception = RuntimeError("No models available")
        for model in _MODELS:
            try:
                resp = await get_client().chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user",   "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=max_tokens,
                )
                return resp.choices[0].message.content
            except Exception as exc:
                err = str(exc)
                is_not_found = (
                    "model" in err.lower() and ("not found" in err.lower() or "pull" in err.lower())
                ) or "404" in err
                is_timeout = "timeout" in err.lower() or "timed out" in err.lower()
                is_rate_limited = "429" in err or "too many concurrent" in err.lower()

                if is_not_found:
                    print(f"[_call] {model} not available on Ollama, skipping. Error: {err[:160]}")
                    last_exc = exc
                    continue

                if is_timeout:
                    print(f"[_call] {model} timed out, trying next model. Error: {err[:160]}")
                    last_exc = exc
                    continue

                if is_rate_limited:
                    # Pause briefly and retry the same model once before falling through
                    print(f"[_call] {model} rate-limited (429), waiting 2s then retrying...")
                    await asyncio.sleep(2)
                    try:
                        resp = await get_client().chat.completions.create(
                            model=model,
                            messages=[
                                {"role": "system", "content": system},
                                {"role": "user",   "content": prompt},
                            ],
                            temperature=0.1,
                            max_tokens=max_tokens,
                        )
                        return resp.choices[0].message.content
                    except Exception as retry_exc:
                        print(f"[_call] {model} retry also failed, falling to next model. Error: {str(retry_exc)[:160]}")
                        last_exc = retry_exc
                        continue

                # Connection error or unexpected — try next model
                print(f"[_call] {model} error: {err[:200]}")
                last_exc = exc
                continue

        raise RuntimeError(
            f"All Ollama models failed. Ensure the Ollama server at {OLLAMA_BASE_URL} is reachable "
            f"and at least one of {_MODELS} is pulled. Last error: {last_exc}"
        )


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
        # Try truncating at the last complete key-value pair
        last_comma = candidate.rfind(",")
        if last_comma > 0:
            try:
                return json.loads(candidate[:last_comma] + "}")
            except json.JSONDecodeError:
                pass
        return {}


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


# ---------------------------------------------------------------------------
# Stage 2 — Rule & Criteria Extraction
# ---------------------------------------------------------------------------

def _rfp_extract_prompt(chunk: str) -> str:
    return (
        f"You are reading a tender/RFP document section. Extract ONLY the SCORING MATRIX — the table "
        f"that assigns numeric Max. Marks to evaluation criteria. Copy criterion names and marks EXACTLY "
        f"as written. Do NOT rename, paraphrase, merge, split, or invent anything.\n\n"
        f"{chunk}\n\n"
        f"=== RULE A — IGNORE ELIGIBILITY / PRE-QUALIFICATION SECTIONS ===\n"
        f"Sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria', 'Mandatory Requirements'\n"
        f"list pass/fail conditions WITHOUT marks. DO NOT extract these at all.\n"
        f"Example of what to IGNORE: 'Minimum turnover Rs 4.5 crore', 'At least 1 similar work of Rs 2 crore'\n\n"
        f"=== RULE B — EXTRACT FROM THE SCORING TABLE ONLY ===\n"
        f"Indian govt RFPs have a scoring table with columns: S.No | Evaluation Criteria | Sub-Criteria | Max. Marks | Evaluation Basis\n"
        f"Each ROW of this table becomes one scoring_category. Use the exact text from 'Evaluation Criteria' column as the category name.\n"
        f"Use the value in the 'Max. Marks' column as max_marks. Do not modify these values.\n\n"
        f"=== RULE C — TIERED SCORING (MOST IMPORTANT) ===\n"
        f"When a criterion has tiered/progressive marks (e.g. '1-3 projects=10 marks, 3-5 projects=20 marks, ≥5 projects=30 marks'),\n"
        f"this is ONE scoring_category. Create EXACTLY ONE subcriterion that describes ALL tiers in its 'criterion' text.\n"
        f"Set max_marks = the MAXIMUM tier value (highest possible marks for this criterion).\n"
        f"The tiers are MUTUALLY EXCLUSIVE — a vendor can only fall into one tier.\n"
        f"Example for 'Firm's Relevant Experience' (max 30):\n"
        f'  subcriteria: [{{"criterion":"≥1 and <3 similar projects = 10 marks; ≥3 and <5 = 20 marks; ≥5 = 30 marks","max_marks":30}}]\n'
        f"Example for 'Employee Certifications' (1 employee=4 marks, max 20):\n"
        f'  subcriteria: [{{"criterion":"1 certified employee = 4 marks; each additional = 4 marks; maximum 20 marks (5 employees)","max_marks":20}}]\n'
        f"Example for 'Average Annual Turnover' (Rs 4.5 crore=5 marks, +0.25 per crore above, max 10):\n"
        f'  subcriteria: [{{"criterion":"Rs 4.5 crore = 5 marks; above Rs 4.5 crore: +0.25 marks per Rs 1 crore; maximum 10 marks","max_marks":10}}]\n\n'
        f"=== RULE D — WHEN TO SET rules_found ===\n"
        f"Set rules_found=true if scoring_categories is non-empty — meaning you extracted EITHER:\n"
        f"  (a) rows from a numeric scoring table with explicit Max. Marks (per RULE B), OR\n"
        f"  (b) pass/fail eligibility conditions extracted per RULE A (with max_marks=1).\n"
        f"Set rules_found=false ONLY if scoring_categories is empty (no criteria of any kind found in this chunk).\n"
        f"Never guess marks. Never use eligibility thresholds as numeric scores.\n\n"
        f"=== RULE E — PRESERVE EXACT NAMES ===\n"
        f"Copy criterion and category names verbatim from the RFP. Do not rephrase or shorten.\n\n"
        f"Return ONLY JSON:\n"
        f'{{"rules_found":true,"scoring_categories":[{{"category":"<exact name from RFP>","max_marks":30,"weight_percent":30,'
        f'"subcriteria":[{{"criterion":"<ALL tier descriptions in ONE string: tier1=X marks; tier2=Y marks; tier3=Z marks","max_marks":30}}]}}],'
        f'"threshold":{{"overall_pass_mark":70,"category_minimums":[]}}}}\n\n'
        f"If no explicit scoring table with Max. Marks exists in this text: "
        f'return exactly {{"rules_found":false,"scoring_categories":[],"threshold":{{"overall_pass_mark":0,"category_minimums":[]}}}}'
    )



def _rfp_pq_extract_prompt(text: str) -> str:
    return (
        f"You are reading a tender/RFP document. Extract ONLY the Pre-Qualification (PQ) / Eligibility criteria.\n\n"
        f"{text}\n\n"
        f"These are pass/fail requirements a bidder must meet to be eligible (NOT scored criteria with marks).\n"
        f"Look for sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria' etc.\n"
        f"Extract each requirement as a short criterion name and a brief detail describing what is required.\n"
        f"Do NOT extract scored criteria that have explicit marks/points — only eligibility conditions.\n\n"
        f"Return ONLY JSON array:\n"
        f'[{{"criterion":"<short name>","detail":"<what the bidder must demonstrate or provide>"}}]\n'
        f"If no PQ/eligibility criteria are found, return: []"
    )


def _pq_evaluate_prompt(bid_text: str, pq_criteria: list) -> str:
    criteria_json = json.dumps(pq_criteria, indent=2)
    return (
        f"You are evaluating a vendor bid against Pre-Qualification (PQ) eligibility requirements.\n\n"
        f"BID DOCUMENT:\n{bid_text}\n\n"
        f"PQ REQUIREMENTS:\n{criteria_json}\n\n"
        f"For each requirement, check whether the bid provides evidence of compliance.\n"
        f"- 'Met': Bid clearly demonstrates or mentions the requirement.\n"
        f"- 'Not Met': Bid is silent or explicitly cannot meet the requirement.\n\n"
        f"Return ONLY a JSON array with one entry per requirement:\n"
        f'[{{"criterion":"<name>","detail":"<detail>","status":"Met|Not Met","vendor_claim":"<direct quote or Not found>","justification":"<one sentence>"}}]'
    )


def _rfp_pqtq_prompt(chunk: str) -> str:
    return (
        f"You are reading a tender/RFP document section. Extract BOTH:\n"
        f"  (1) Pre-Qualification (PQ) pass/fail eligibility conditions\n"
        f"  (2) Technical Qualification (TQ) scored criteria with explicit numeric marks\n\n"
        f"{chunk}\n\n"
        f"=== RULE A — PQ ELIGIBILITY CRITERIA ===\n"
        f"Sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria', 'Mandatory Requirements'\n"
        f"contain pass/fail conditions WITHOUT numeric marks. Extract EACH condition as a separate scoring_category with max_marks=1.\n"
        f"Set qualification_type='PQ' for all PQ criteria.\n"
        f"Example: category='Minimum Annual Turnover', max_marks=1, qualification_type='PQ',\n"
        f"subcriteria=[{{criterion:'Annual turnover >= Rs 4.5 crore in last 3 years', max_marks:1}}]\n\n"
        f"=== RULE B — TQ SCORED CRITERIA ===\n"
        f"Extract rows from the scoring table with explicit numeric marks/points/weightage.\n"
        f"Set qualification_type='TQ' for all scored criteria.\n"
        f"Copy criterion names and marks EXACTLY as written.\n\n"
        f"=== RULE C — TIERED SCORING ===\n"
        f"When a TQ criterion has tiered/progressive marks, create ONE scoring_category with ONE subcriterion\n"
        f"describing ALL tiers. Set max_marks = the highest tier value.\n\n"
        f"=== RULE D — WHEN TO SET rules_found ===\n"
        f"Set rules_found=true if scoring_categories is non-empty (any PQ or TQ criteria found).\n"
        f"Set rules_found=false ONLY if no criteria of any kind were found in this chunk.\n"
        f"Never invent marks. Never use eligibility thresholds as numeric scores.\n\n"
        f"Return ONLY JSON:\n"
        f'{{"rules_found":true,"scoring_categories":['
        f'{{"category":"Name","max_marks":30,"weight_percent":30,"qualification_type":"TQ",'
        f'"subcriteria":[{{"criterion":"<description>","max_marks":30}}]}}],'
        f'"threshold":{{"overall_pass_mark":70,"category_minimums":[]}}}}\n\n'
        f"If no criteria of any kind found: "
        f'{{"rules_found":false,"scoring_categories":[],"threshold":{{"overall_pass_mark":0,"category_minimums":[]}}}}'
    )


def _bid_readiness_prompt(text: str) -> str:
    return (
        f"You are a procurement expert helping a vendor understand an RFP/tender.\n\n"
        f"Analyse the document below and extract ALL Pre-Qualification (PQ) eligibility "
        f"conditions and Technical Qualification (TQ) scored criteria.\n\n"
        f"DOCUMENT:\n{text}\n\n"
        f"=== OUTPUT RULES ===\n\n"
        f"PART A — PQ_CRITERIA (ELIGIBILITY CRITERIA ONLY — pass/fail thresholds a vendor must meet):\n"
        f"\n"
        f"  INCLUDE only criteria that test whether the vendor QUALIFIES:\n"
        f"    ✓ Minimum annual turnover / financial capacity thresholds\n"
        f"    ✓ Minimum years in business / operational experience\n"
        f"    ✓ Minimum number of similar projects completed (with value/scale)\n"
        f"    ✓ Required registrations, licences, or certifications (ISO, CMMI, GST, etc.)\n"
        f"    ✓ Minimum team size or key personnel qualifications\n"
        f"    ✓ Geographic / office presence requirements\n"
        f"    ✓ Make-in-India / local content requirements\n"
        f"\n"
        f"  EXCLUDE procedural and compliance items — do NOT list these:\n"
        f"    ✗ EMD / Earnest Money Deposit / Bid Security (submission instructions)\n"
        f"    ✗ Declarations, affidavits, undertakings on stamp paper\n"
        f"    ✗ Blacklisting / debarment / insolvency declarations (these are document submissions)\n"
        f"    ✗ Power of Attorney / authorisation letters\n"
        f"    ✗ Integrity Pact / NDA / non-disclosure agreements\n"
        f"    ✗ Document checklist items (what to submit and when)\n"
        f"    ✗ Bid validity period, performance security, contract signing procedures\n"
        f"\n"
        f"  • One entry per eligibility requirement. Write criterion as a short label (≤12 words).\n"
        f"  • Write detail with the specific threshold or standard required.\n"
        f"  • AIM for 5–15 PQ entries total. If you have more, you are including procedural items.\n\n"
        f"PART B — TQ_CRITERIA (scored criteria with explicit marks/points):\n"
        f"  • Extract only criteria with explicit numeric marks/scores/weightage.\n"
        f"  • Rewrite each in plain English showing exactly what earns the marks.\n"
        f"  • Include the score threshold tiers if they exist.\n"
        f"  • Group by their original category name.\n\n"
        f"Return ONLY valid JSON — no markdown, no commentary:\n"
        f'{{"pq_criteria":['
        f'{{"category":"Financial","criterion":"<plain English>","detail":"<explanation>"}}],'
        f'"tq_criteria":['
        f'{{"category":"GenAI Experience","criterion":"<plain English>","detail":"<explanation with score tiers>","max_score":20}}]}}'
    )


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


async def stage2_extract_rules(rfp_text: str) -> EvaluationRules:
    # Chunk 0: keyword-dense extraction (focuses on scoring table language)
    chunks = [_extract_scoring_sections(rfp_text, MAX_RFP_CHARS)]
    # Add every sequential 15K window of the full document so no section is missed.
    # PQ eligibility criteria are often in a different part of the doc from the scoring table.
    for start in range(0, len(rfp_text), MAX_RFP_CHARS):
        chunk = rfp_text[start: start + MAX_RFP_CHARS]
        if chunk.strip():
            chunks.append(chunk)
    # Deduplicate — chunk 0 may overlap with a positional chunk
    seen: set = set()
    unique: list = []
    for c in chunks:
        key = c[:200]
        if key not in seen:
            seen.add(key)
            unique.append(c)
    chunks = unique

    # Merge categories from all chunks
    all_cats: dict[str, dict] = {}
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    # Trust the LLM's own rules_found signal — True only when it sees EXPLICIT numeric marks
    any_explicit_rules = False

    chunk_results = await asyncio.gather(
        *[_call(_rfp_extract_prompt(c), max_tokens=2000) for c in chunks],
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
    async def _eval_category(cat: ScoringCategory) -> List[CriterionEvaluation]:
        evals: List[CriterionEvaluation] = []
        # Build criteria list for this category only
        criteria_list = []
        if cat.subcriteria:
            for sub in cat.subcriteria:
                criteria_list.append({
                    "category": cat.category, "criterion": sub.criterion,
                    "max_marks": sub.max_marks,
                })
        else:
            criteria_list.append({
                "category": cat.category,
                "criterion": f"{cat.category} — overall assessment",
                "max_marks": cat.max_marks,
            })

        is_generic = not cat.subcriteria  # True when no specific subcriteria found

        # For generic categories we cannot target specific sections with keywords,
        # so use a larger window to ensure the LLM sees actual bid content.
        # For specific-criteria categories the focused extraction is sufficient.
        if is_generic:
            relevant_bid = _extract_bid_sections(bid_text, criteria_list, MAX_BID_CHARS_GENERIC)
            # Also append a mid-document slice so content not near the start is reachable.
            mid = len(bid_text) // 2
            mid_slice = bid_text[mid: mid + 2000]
            if mid_slice.strip() and mid_slice not in relevant_bid:
                relevant_bid = relevant_bid + "\n\n[...mid-document excerpt...]\n" + mid_slice
        else:
            relevant_bid = _extract_bid_sections(bid_text, criteria_list, MAX_BID_CHARS)
        # Detect whether this is a presentation/demo category that will be evaluated
        # during a future scheduled event. At bid stage, a detailed plan with committed
        # content and live-system evidence should be scored as 'Met', not 'Not Met'.
        _FUTURE_EVENT_KEYWORDS = ["presentation", "demonstration", "demo", "live demo", "showcase"]
        is_future_event = any(kw in cat.category.lower() for kw in _FUTURE_EVENT_KEYWORDS)

        today = date.today().strftime("%B %d, %Y")

        scoring_instruction = (
            "BROAD CATEGORY SCORING — award marks based on how well the bid addresses each aspect:\n"
            "- 'Met' (marks_awarded = max_marks for that aspect): Bid clearly demonstrates this aspect "
            "with specific evidence (project names, numbers, descriptions, methodology).\n"
            "- 'Partial' (marks_awarded = max_marks * 0.5): Bid mentions or implies the aspect but "
            "without concrete evidence or detail.\n"
            "- 'Not Met' (marks_awarded = 0): Aspect is completely absent from the bid.\n"
            "Default to 'Partial' if there is ANY relevant content — only use 'Not Met' when the topic "
            "is truly not addressed at all in the document."
            if is_generic else
            "IMPORTANT CONTEXT: This is a BID DOCUMENT evaluation, not post-event scoring. "
            "For criteria that involve future scheduled events (presentations, demonstrations), "
            "evaluate based on the vendor's PLAN and CAPABILITY evidence in the bid:\n"
            "- 'Met': Vendor provides detailed plan/content AND has demonstrable live systems/capability. Set marks_awarded = max_marks.\n"
            "- 'Partial': Vendor confirms participation but lacks detail or supporting capability evidence. Set marks_awarded = 50% of max_marks.\n"
            "- 'Not Met': No mention of the criterion, or vendor explicitly cannot meet it. Set marks_awarded = 0.\n"
            "Do NOT score 'Not Met' simply because the event has not yet occurred."
            if is_future_event else
            f"PASS/FAIL SCORING (today is {today}):\n"
            "Evaluate each criterion as a simple binary check — there are no tiers.\n"
            "- 'Met' (marks_awarded = max_marks): The bid clearly satisfies the requirement.\n"
            "- 'Not Met' (marks_awarded = 0): The bid does not satisfy the requirement.\n"
            "Do NOT invent tiers or partial credit. For numeric minimums (e.g. 'minimum 5 years'), "
            "use today's date to calculate the duration and mark 'Met' if the vendor meets or exceeds it.\n"
            "If the requirement is 'must include X' and the bid includes X, mark as Met."
            if not rfp_scoring_text else
            "TIERED SCORING INSTRUCTIONS:\n"
            "Many criteria have tiered marks (e.g. 3+ BFSI cases = 10 marks, 2 cases = 6 marks, 1 case = 3 marks; "
            "or 1000+ users = 10 marks, 100-999 users = 6 marks; "
            "or 15+ implementations = 10 marks, 10-14 = 8 marks, 5-9 = 6 marks; "
            "or 50%+ team with 2+ certs = 5 marks, 50%+ with 1 cert = 3 marks). "
            "Read what the vendor ACTUALLY claims (number of cases, users, implementations, certification counts) "
            "and award marks_awarded based on the appropriate tier — NOT simply max_marks for any evidence. "
            "'Met' means the vendor clearly meets the HIGHEST tier. "
            "'Partial' means the vendor meets a LOWER tier but not the highest. "
            "'Not Met' means no qualifying evidence exists. "
            "ALWAYS set marks_awarded to the specific tiered value that matches the vendor's evidence."
        )

        # Append to every branch — LLMs (especially smaller ones) routinely invert
        # numeric comparisons. These explicit rules prevent the most common mistakes.
        scoring_instruction += (
            "\n\nNUMERIC COMPARISON RULES (apply these carefully before deciding Met/Not Met):\n"
            "1. MINIMUM requirements (e.g. 'at least X years', 'minimum X', 'not less than X'):\n"
            "   Met = vendor's value >= X.  Example: minimum 5 years, vendor has 8 years → MET.\n"
            "2. MAXIMUM / ceiling requirements (e.g. 'must not exceed X', 'maximum X', 'up to X'):\n"
            "   Met = vendor's value <= X.  Example: must not exceed INR 25,00,000, vendor quotes INR 21,50,000 → MET.\n"
            "3. Indian currency (INR lakhs/crores): read commas as Indian grouping.\n"
            "   1,00,000 = 1 lakh = 100 000.  21,50,000 = 21.5 lakhs = 2 150 000.\n"
            "   25,00,000 = 25 lakhs = 2 500 000.  So 21,50,000 < 25,00,000.\n"
            "4. Never swap the vendor value and the threshold when writing the justification.\n"
            "   Correct: 'Vendor has 8 years which meets the 5-year minimum.'\n"
            "   Wrong:   'Vendor has 8 years but minimum is 5 years — risk.'"
        )

        rfp_context = (
            f"\nRFP SCORING TIERS FOR REFERENCE (use these to determine the correct tier and marks):\n{rfp_scoring_text[:4000]}\n"
            if rfp_scoring_text and not is_future_event else ""
        )

        if is_generic:
            prompt = f"""Evaluate the vendor bid for the "{cat.category}" category (total: {cat.max_marks} marks).

VENDOR BID:
{relevant_bid}
{rfp_context}
IMPORTANT: This is a real vendor bid document. It may be a technical proposal, project report, company profile,
or similar. Evaluate what is actually present in the document — do NOT assume it is empty or irrelevant.

No specific subcriteria are defined in the RFP for this category.
Identify 3 to 5 specific evaluation aspects relevant to "{cat.category}" and evaluate each against the bid.
Distribute {cat.max_marks} marks proportionally across the aspects (marks must sum to exactly {cat.max_marks}).

{scoring_instruction}

Return ONLY a JSON array with 3-5 items (one per aspect):
[{{"criterion":"<specific aspect name>","category":"{cat.category}","max_marks":<proportional_max>,"marks_awarded":<actual_marks — use partial marks not just 0 or max>,"vendor_claim":"<direct quote or brief description from the bid, or 'Not found'>","source_reference":"<section heading or 'Not found'>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence citing specific bid evidence>"}}]"""
        else:
            prompt = f"""Evaluate the vendor bid for the "{cat.category}" category.

VENDOR BID:
{relevant_bid}
{rfp_context}
CRITERIA:
{json.dumps(criteria_list, indent=2)}

{scoring_instruction}

Return ONLY a JSON array. For each criterion include marks_awarded as the ACTUAL numeric marks (based on tiered scoring), NOT just max_marks:
[{{"criterion":"<name>","category":"<cat>","max_marks":<n>,"marks_awarded":<actual_tiered_marks>,"vendor_claim":"<quote or Not found>","source_reference":"<section or Not found>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence explaining the tier awarded>"}}]"""

        try:
            items = _parse_array(await _call(prompt))
            if not isinstance(items, list):
                items = []
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
        except Exception:
            for c in criteria_list:
                evals.append(CriterionEvaluation(
                    criterion=c["criterion"], category=c["category"],
                    max_marks=c["max_marks"], vendor_claim="Evaluation error",
                    source_reference="Not found", compliance_status="Not Met",
                    confidence="Low", justification="Parsing failed for this category.",
                ))
        return evals

    cat_eval_lists = await asyncio.gather(
        *[_eval_category(cat) for cat in rules.scoring_categories],
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
            )
        )

    return category_results


# ---------------------------------------------------------------------------
# Stage 5 — Gap Analysis & Risk Flagging
# ---------------------------------------------------------------------------

async def stage5_gap_analysis(
    criteria_evals: List[CriterionEvaluation],
) -> List[RiskItem]:
    summary = [
        {"criterion": ce.criterion, "category": ce.category,
         "compliance_status": ce.compliance_status,
         "marks_awarded": ce.marks_awarded, "max_marks": ce.max_marks,
         "vendor_claim": ce.vendor_claim}
        for ce in criteria_evals
    ]

    prompt = f"""Based on the evaluation results below, identify the top risks and gaps in the vendor's bid.

EVALUATION RESULTS:
{json.dumps(summary, indent=2)}

Focus on:
1. Criteria completely missed (Not Met)
2. Weak areas (scored below 50%)
3. High-risk compliance gaps
4. Any potential contradictions or red flags

Return ONLY a JSON array of up to 7 items:
[
  {{
    "risk_area": "<short label>",
    "severity": "High|Medium|Low",
    "description": "<one to two sentences describing the gap or risk>"
  }}
]"""

    items = _parse_array(await _call(prompt, max_tokens=500))
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

    prompt = f"""Write a 2–3 sentence executive summary for an RFP evaluation report.

Result: {"PASSED" if passed else "FAILED"}
Total Score: {total_score} / {max_score}
Category Breakdown: {'; '.join(cat_summary)}

Cover: overall result, key strengths, and key weaknesses. Use plain, non-technical language.
Return ONLY the summary text — no JSON, no headers."""

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
    prompt = (
        "You are reading a Pre-Bid Q&A / Clarification document from a government procurement process.\n\n"
        f"{prebid_text[:8000]}\n\n"
        "Extract ALL question-and-answer pairs from this document.\n"
        "Each entry should capture the vendor's question and the procuring authority's official answer.\n\n"
        "Return ONLY a JSON array (no prose, no markdown):\n"
        '[{"question": "<the vendor question>", "answer": "<the official answer>"}]\n\n'
        "If no clear Q&A pairs are found, return an empty array: []"
    )
    try:
        items = _parse_array(await _call(prompt, system=_QA_SYSTEM))
        return [PrebidQA(**item) for item in items if isinstance(item, dict) and "question" in item and "answer" in item]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Orchestrator — shared stages 3-6
# ---------------------------------------------------------------------------

async def stage_extract_pq_criteria(rfp_text: str) -> list:
    """Extract PQ/eligibility criteria from RFP as a plain list of dicts."""
    chunk = rfp_text[:MAX_RFP_CHARS]
    try:
        raw = await _call(_rfp_pq_extract_prompt(chunk))
        items = _parse_array(raw)
        return [i for i in items if isinstance(i, dict) and i.get("criterion")]
    except Exception:
        return []


async def stage_evaluate_pq_criteria(bid_text: str, pq_criteria: list) -> list:
    """Evaluate each PQ criterion against the bid and return PQCheck objects."""
    if not pq_criteria:
        return []
    chunk = bid_text[:MAX_BID_CHARS]
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
    passed = not disqualified and not category_fail and total_score >= threshold

    is_perfect = (total_score >= max_score) or (
        len(criteria_evals) > 0 and all(ce.marks_awarded >= ce.max_marks for ce in criteria_evals if ce.max_marks > 0)
    )
    async def _empty() -> list:
        return []

    risk_items, executive_summary, prebid_qa, pq_checks = await asyncio.gather(
        _empty() if is_perfect else stage5_gap_analysis(criteria_evals),
        stage6_executive_summary(total_score, max_score, passed, category_results),
        stage_extract_prebid_qa(prebid_text) if prebid_text.strip() else _empty(),
        stage_evaluate_pq_criteria(bid_text, pq_criteria),
    )
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


async def run_full_evaluation(rfp_text: str, bid_text: str, prebid_text: str = "") -> EvaluationReport:
    prebid_applied = bool(prebid_text.strip())
    if prebid_applied:
        rfp_text = (
            rfp_text
            + "\n\n=== PRE-BID CLARIFICATIONS (take precedence over original criteria above) ===\n\n"
            + prebid_text.strip()
        )
    # Fast text-level guard: if the RFP has no explicit numeric marks at all,
    # skip the expensive LLM stage2 call and go straight to custom-rules flow.
    if not _rfp_has_explicit_marks(rfp_text):
        print("[Pipeline] No explicit scoring marks found in RFP text — raising NO_RULES_FOUND without LLM call")
        raise ValueError("NO_RULES_FOUND")
    rules, pq_criteria = await asyncio.gather(
        stage2_extract_rules(rfp_text),
        stage_extract_pq_criteria(rfp_text),
    )
    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")
    rfp_scoring_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text, prebid_text=prebid_text, pq_criteria=pq_criteria)


async def run_evaluation_with_rules(bid_text: str, rules: EvaluationRules) -> EvaluationReport:
    """Run evaluation stages 3-6 using caller-supplied rules (no RFP needed)."""
    return await _run_pipeline(bid_text, rules)


# ---------------------------------------------------------------------------
# PQTQ evaluation — PQ/TQ-scoped rule extraction + lenient scoring
# ---------------------------------------------------------------------------

async def stage2_extract_pqtq_rules(rfp_text: str) -> EvaluationRules:
    """Like stage2_extract_rules but scoped to PQ/TQ criteria only."""
    chunks = [_extract_scoring_sections(rfp_text, MAX_RFP_CHARS)]
    for start in range(0, len(rfp_text), MAX_RFP_CHARS):
        chunk = rfp_text[start: start + MAX_RFP_CHARS]
        if chunk.strip():
            chunks.append(chunk)
    seen: set = set()
    unique: list = []
    for c in chunks:
        key = c[:200]
        if key not in seen:
            seen.add(key)
            unique.append(c)
    chunks = unique

    all_cats: dict[str, dict] = {}
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    any_explicit_rules = False

    chunk_results = await asyncio.gather(
        *[_call(_rfp_pqtq_prompt(c), max_tokens=2000) for c in chunks],
        return_exceptions=True,
    )
    for raw in chunk_results:
        try:
            if isinstance(raw, Exception):
                print(f"[Stage2-PQTQ chunk] error: {raw}")
                continue
            data = _parse_object(raw)
            chunk_has_rules = bool(data.get("rules_found", False))
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

    return EvaluationRules(
        rules_found=any_explicit_rules and len(all_cats) > 0,
        scoring_categories=categories,
        threshold=threshold,
    )


_PQ_KEYWORDS = ["pre-qualif", "pre qualif", "prequalif", "eligib", "pq —", "pq-", " pq ", "(pq)", "annexure 2", "annex 2"]
_TQ_KEYWORDS = ["technical qual", "technical eval", "tq —", "tq-", " tq ", "(tq)", "annexure 18", "annex 18", "technical criteria"]


async def run_pqtq_evaluation(rfp_text: str, bid_text: str) -> EvaluationReport:
    """Evaluate bid scoped to Pre-Qualification / Technical Qualification criteria only."""
    rules = await stage2_extract_pqtq_rules(rfp_text)
    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")

    for cat in rules.scoring_categories:
        if not cat.qualification_type:
            name = cat.category.lower()
            if any(k in name for k in _TQ_KEYWORDS):
                cat.qualification_type = "TQ"
            elif any(k in name for k in _PQ_KEYWORDS):
                cat.qualification_type = "PQ"
            else:
                cat.qualification_type = "TQ"

    rfp_scoring_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text)


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

    # PQ/TQ eligibility sections are concentrated at the start of the document.
    # Use 4 focused chunks: keyword-dense extraction + first 3 sequential windows.
    # Unlimited sweep causes 10+ chunks with overlapping content → 90+ duplicate PQ entries.
    chunks: list[str] = [_extract_scoring_sections(combined, MAX_RFP_CHARS)]
    for start in range(0, min(len(combined), MAX_RFP_CHARS * 3), MAX_RFP_CHARS):
        chunk = combined[start: start + MAX_RFP_CHARS]
        if chunk.strip():
            chunks.append(chunk)
    seen_keys: set[str] = set()
    unique_chunks: list[str] = []
    for c in chunks:
        key = c[:200]
        if key not in seen_keys:
            seen_keys.add(key)
            unique_chunks.append(c)
    chunks = unique_chunks

    seen_pq: set[str] = set()
    seen_tq: set[str] = set()
    raw_pq: list[dict] = []
    raw_tq: list[dict] = []

    chunk_results = await asyncio.gather(
        *[_call(_bid_readiness_prompt(c), max_tokens=2000) for c in chunks],
        return_exceptions=True,
    )
    for raw in chunk_results:
        try:
            if isinstance(raw, Exception):
                print(f"[BidReadiness chunk] error: {raw}")
                continue
            data = _parse_object(raw)
        except Exception:
            continue

        for item in (data.get("pq_criteria") or []):
            if not isinstance(item, dict):
                continue
            key = str(item.get("criterion", "")).strip().lower()[:120]
            if key and key not in seen_pq:
                seen_pq.add(key)
                raw_pq.append(item)

        for item in (data.get("tq_criteria") or []):
            if not isinstance(item, dict):
                continue
            key = str(item.get("criterion", "")).strip().lower()[:120]
            if key and key not in seen_tq:
                seen_tq.add(key)
                raw_tq.append(item)

    pq_items: List[ChecklistItem] = []
    for i, item in enumerate(raw_pq):
        criterion = str(item.get("criterion", "")).strip()
        if not criterion:
            continue
        pq_items.append(ChecklistItem(
            id=f"pq_{i}",
            type="PQ",
            category=str(item.get("category", "Eligibility")).strip(),
            criterion=criterion,
            detail=str(item.get("detail", "")).strip(),
            max_score=0.0,
            is_mandatory=True,
        ))

    tq_items: List[ChecklistItem] = []
    total_tq = 0.0
    for i, item in enumerate(raw_tq):
        criterion = str(item.get("criterion", "")).strip()
        if not criterion:
            continue
        try:
            score = float(item.get("max_score", 0) or 0)
        except (TypeError, ValueError):
            score = 0.0
        total_tq += score
        tq_items.append(ChecklistItem(
            id=f"tq_{i}",
            type="TQ",
            category=str(item.get("category", "Technical")).strip(),
            criterion=criterion,
            detail=str(item.get("detail", "")).strip(),
            max_score=score,
            is_mandatory=False,
        ))

    return BidReadinessResult(
        pq_items=pq_items,
        tq_items=tq_items,
        total_tq_score=round(total_tq, 2),
    )
