"""7-stage RFP evaluation pipeline powered by Groq (llama-3.3-70b-versatile)."""

import asyncio
import json
import os
import re
from datetime import date
from typing import List, Optional

from dotenv import load_dotenv
from groq import AsyncGroq

from models import (
    BidReadinessResult,
    CategoryMinimum,
    CategoryResult,
    ChecklistItem,
    CriterionEvaluation,
    DisqualifierCheck,
    EvaluationReport,
    EvaluationRules,
    PrebidQA,
    RiskItem,
    ScoringCategory,
    SubCriterion,
    Threshold,
)

load_dotenv()

# Model fallback list — tried in order when rate-limited or decommissioned.
# Only include models confirmed active on Groq (decommissioned models removed June 2026):
#   llama-3.1-70b-versatile   — DECOMMISSIONED (400)
#   gemma2-9b-it              — DECOMMISSIONED (400)
#   llama-3.2-3b-preview      — DECOMMISSIONED (400)
_MODELS = [
    "llama-3.3-70b-versatile",                        # best reasoning — use first
    "meta-llama/llama-4-scout-17b-16e-instruct",      # newer Llama 4, larger quota
    "meta-llama/llama-4-maverick-17b-128e-instruct",  # secondary Llama 4
    "qwen-qwq-32b",                                   # additional fallback
    "llama-3.1-8b-instant",                           # last resort — high quota, smaller
]
MODEL_NAME = _MODELS[0]

# Chunk sizes calibrated for llama-3.1-8b-instant's 6K TPM limit.
# At ~1.5 tokens/char for dense docs: 3000 chars ≈ 4500 tokens → safe under 6K.
# MAX_BID_CHARS / MAX_DISQ_CHARS kept at 4000 so each per-category call stays
# under ~7500 tokens (input + prompt overhead), within the 12K TPM fallback model.
# MAX_BID_CHARS_GENERIC is used for categories without subcriteria — these need a
# wider view of the bid since keyword extraction cannot target specific sections.
MAX_RFP_CHARS         =  15_000
MAX_BID_CHARS         =   4_000
MAX_BID_CHARS_GENERIC =   8_000   # 2× for generic categories; stays under 14K token context
MAX_DISQ_CHARS        =   4_000

SYSTEM = (
    "You are an expert RFP (Request for Proposal) / Tender Evaluation Assistant. "
    "You analyze procurement documents, extract scoring criteria, evaluate vendor bids, "
    "and produce structured evaluation reports. "
    "Respond with valid JSON only when asked for structured output — no prose, no markdown fences. "
    "Base every assessment solely on evidence found in the provided documents. "
    "If something is not found in the document, state 'Not found in document' and score it 0."
)

_client: Optional[AsyncGroq] = None


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    return _client


async def _call(prompt: str, system: str = SYSTEM) -> str:
    """Try each model in _MODELS; fall back to next on rate-limit or decommission errors.

    Rate-limited models get one retry with exponential backoff before moving on.
    Decommissioned models are skipped immediately (no retry — they will never recover).
    """
    last_exc: Exception = RuntimeError("No models available")
    for model in _MODELS:
        for attempt in range(2):  # up to 2 attempts per model (for rate limits)
            try:
                resp = await get_client().chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user",   "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=2048,
                )
                return resp.choices[0].message.content
            except Exception as exc:
                err = str(exc)
                is_rate_limit     = "429" in err or "rate" in err.lower() or "quota" in err.lower()
                is_decommissioned = "decommission" in err.lower() or "deprecated" in err.lower() or "no longer supported" in err.lower()

                if is_decommissioned:
                    print(f"[_call] {model} decommissioned, skipping. Error: {err[:160]}")
                    last_exc = exc
                    break  # no retry — move to next model immediately

                if is_rate_limit:
                    last_exc = exc
                    if attempt == 0:
                        wait = 2 ** (attempt + 1)  # 2s first retry
                        print(f"[_call] {model} rate-limited, retrying in {wait}s. Error: {err[:160]}")
                        await asyncio.sleep(wait)
                        # loop continues for attempt=1
                    else:
                        # Second attempt also failed — move to next model
                        print(f"[_call] {model} rate-limited again, trying next model.")
                        break

                else:
                    raise  # auth, network, or unexpected errors — bubble up immediately

    # All models exhausted
    raise RuntimeError(
        "All Groq models are currently rate-limited. "
        "Please wait a few minutes and try again, or check https://console.groq.com "
        "to see your remaining daily quota. "
        f"Last error: {last_exc}"
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
    r"minimum\s+qualifying\s+marks\s*:?\s*bidder\s+must\s+score",
    r"scoring\s+summary",
    r"70%\s+in\s+each\s+category\s+separately",
    r"category\s+[ab]\s*:.*(?:marks|capability|experience)",
    r"sub.criterion\s+1\.a",
    r"genai\s+delivery\s+capability",
    r"\d+\s+or\s+more\s+production\s+gen.?ai",
    r"maximum\s+marks.*criterion.*shall\s+be\s+\d+",
    r"marks\s+allocated\s+to\s+categor",
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
        f"You are reading a tender/RFP document section. Your task is to extract the SCORING MATRIX only.\n\n"
        f"{chunk}\n\n"
        f"STRICT RULES — read carefully before responding:\n\n"
        f"RULE 0 — THE MOST IMPORTANT RULE:\n"
        f"  Set rules_found=false and return EMPTY scoring_categories if the document does NOT explicitly "
        f"state numeric marks, points, scores, or weightage against each criterion. "
        f"A document that merely lists requirements, questions, or section headings WITHOUT attaching "
        f"numeric marks to them is NOT a scoring rubric. Do NOT invent, guess, or assume any marks.\n"
        f"  Examples that should return rules_found=false:\n"
        f"    - 'Please provide your company overview and team details' (no marks stated)\n"
        f"    - 'Section 3: Technical Approach — describe your methodology' (no marks stated)\n"
        f"  Examples that should return rules_found=true:\n"
        f"    - 'Technical Experience: max 20 marks'\n"
        f"    - 'Criterion 1.a: GenAI Use Cases — 10 points'\n\n"
        f"RULE 1: Do NOT group categories under a single parent. Each scoring category is independent.\n"
        f"RULE 2: subcriteria must be a FLAT list — no nesting.\n"
        f"RULE 3: Preserve exact criterion names and prefixes as they appear in the document.\n"
        f"RULE 4: Set mandatory=true only for criteria the document explicitly labels as mandatory/compulsory/must-meet.\n"
        f"RULE 5: If a 'PRE-BID CLARIFICATIONS' section is present, treat it as authoritative — any criterion, "
        f"threshold, or requirement stated there overrides the corresponding original RFP value.\n\n"
        f"Return ONLY JSON:\n"
        f'{{"rules_found":true,"scoring_categories":[{{"category":"Category Name","max_marks":70,"weight_percent":70,'
        f'"subcriteria":[{{"criterion":"Sub-Criterion Name","max_marks":20,"mandatory":false}}]}}],'
        f'"threshold":{{"overall_pass_mark":70,"category_minimums":[]}},"mandatory_disqualifiers":[]}}\n\n'
        f"If no explicit numeric marks exist anywhere in this text: "
        f'return exactly {{"rules_found":false,"scoring_categories":[],"threshold":{{"overall_pass_mark":0,"category_minimums":[]}},"mandatory_disqualifiers":[]}}'
    )


def _normalize_disqualifiers(raw) -> list:
    if not isinstance(raw, list):
        return []
    result = []
    for d in raw:
        if isinstance(d, dict):
            d = d.get("criterion") or d.get("condition") or d.get("description") or str(d)
        if d:
            result.append(str(d))
    return result


def _rfp_pqtq_prompt(chunk: str) -> str:
    return (
        f"You are reading a tender/RFP document section. Extract Pre-Qualification (PQ) eligibility "
        f"conditions and Technical Qualification (TQ) scored criteria.\n\n"
        f"{chunk}\n\n"
        f"=== PART A — MANDATORY_DISQUALIFIERS (PQ eligibility, binary pass/fail) ===\n"
        f"Extract the following from Eligibility Criteria / Pre-Qualification / Annexure sections "
        f"as individual strings in mandatory_disqualifiers:\n"
        f"  • Financial requirements: minimum turnover, net worth thresholds\n"
        f"  • EMD / Bid Security: actual amount/percentage if stated\n"
        f"  • Registration / empanelment: specific registry or body\n"
        f"  • Experience: specific minimums\n"
        f"  • Certifications: specific standards required\n"
        f"  • Team / manpower minimums\n"
        f"  • Make-in-India compliance\n\n"
        f"CRITICAL RULES FOR PART A:\n"
        f"  1. Each string must state the REQUIREMENT only — do NOT include any assessment, outcome, or note.\n"
        f"  2. Only extract conditions explicitly stated in the document. Do NOT invent.\n"
        f"  3. Keep each condition concise (under 15 words). One condition per entry.\n"
        f"  4. If a requirement amount/threshold is not specified, OMIT that entry.\n\n"
        f"=== PART B — SCORING_CATEGORIES (TQ criteria with explicit numeric marks) ===\n"
        f"Extract ONLY Technical Qualification criteria that have EXPLICIT numeric marks/points/weightage.\n"
        f"RULE 0: Set rules_found=true ONLY if you find explicit numeric marks for TQ criteria. "
        f"Do NOT invent or guess marks.\n"
        f"RULE 1: Each scoring category is independent — do not group under a single parent.\n"
        f"RULE 2: subcriteria must be a FLAT list — no nesting.\n"
        f"RULE 3: Preserve exact criterion names as they appear.\n"
        f"RULE 4: Set qualification_type=\"TQ\" for all scored categories.\n\n"
        f"Return ONLY JSON:\n"
        f'{{"rules_found":true,"scoring_categories":[{{"category":"Category Name","max_marks":70,"weight_percent":70,"qualification_type":"TQ",'
        f'"subcriteria":[{{"criterion":"Sub-Criterion Name","max_marks":20,"mandatory":false}}]}}],'
        f'"threshold":{{"overall_pass_mark":70,"category_minimums":[]}},'
        f'"mandatory_disqualifiers":["Minimum average annual turnover Rs. 50 crores","Minimum 3 production GenAI use cases"]}}\n\n'
        f"If no explicit numeric TQ marks exist, still populate mandatory_disqualifiers:\n"
        f'{{"rules_found":false,"scoring_categories":[],"threshold":{{"overall_pass_mark":0,"category_minimums":[]}},'
        f'"mandatory_disqualifiers":["<concise requirement 1>","<concise requirement 2>"]}}'
    )


def _bid_readiness_prompt(text: str) -> str:
    return (
        f"You are a procurement expert helping a vendor understand an RFP/tender.\n\n"
        f"Analyse the document below and extract ALL Pre-Qualification (PQ) eligibility "
        f"conditions and Technical Qualification (TQ) scored criteria.\n\n"
        f"DOCUMENT:\n{text}\n\n"
        f"=== OUTPUT RULES ===\n\n"
        f"PART A — PQ_CRITERIA (mandatory eligibility, pass/fail, NO marks attached):\n"
        f"  • Rewrite each requirement in plain English that a business executive understands.\n"
        f"  • Write the criterion as a short, direct statement (≤20 words).\n"
        f"  • Write the detail as a fuller explanation with specific numbers/documents required.\n"
        f"  • One entry per requirement — do NOT merge multiple conditions.\n"
        f"  • Include: financial thresholds, EMD/bid security, registrations, experience minimums,\n"
        f"    certifications, team/staff minimums, Make-in-India, blacklisting declarations.\n"
        f"  • Do NOT include scoring thresholds (like 'must score 70%') — those are TQ rules.\n\n"
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
    keyword_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    chunks = [keyword_text]
    scoring_start = _find_scoring_section_start(rfp_text)
    if scoring_start >= 0:
        # Anchor found: continue sequentially from that same offset so criteria
        # that span beyond the first MAX_RFP_CHARS window are captured without
        # bleeding into pre-bid Q&A at the document start.
        for i in range(1, 3):
            chunk_start = scoring_start + i * MAX_RFP_CHARS
            if chunk_start < len(rfp_text):
                chunks.append(rfp_text[chunk_start: chunk_start + MAX_RFP_CHARS])
    else:
        # No anchor — fall back to sequential chunks from the document start.
        for start in range(0, min(len(rfp_text), MAX_RFP_CHARS * 3), MAX_RFP_CHARS):
            chunks.append(rfp_text[start: start + MAX_RFP_CHARS])

    chunks = [c for c in chunks if c.strip()][:4]  # at most 4 LLM calls

    # Merge categories from all chunks
    all_cats: dict[str, dict] = {}
    all_disq: list[str] = []
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    # Trust the LLM's own rules_found signal — True only when it sees EXPLICIT numeric marks
    any_explicit_rules = False

    for chunk in chunks:
        try:
            data = _parse_object(await _call(_rfp_extract_prompt(chunk)))

            # Only accept categories from this chunk if the LLM confirmed explicit rules
            chunk_has_rules = bool(data.get("rules_found", False))
            if chunk_has_rules:
                any_explicit_rules = True
            else:
                # LLM said no explicit marks in this chunk — skip its categories
                print(f"[Stage2 chunk] rules_found=false — skipping fabricated categories")
                disqs = data.get("mandatory_disqualifiers", [])
                for d in _normalize_disqualifiers(disqs):
                    if d not in all_disq:
                        all_disq.append(d)
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
                    cat_subs = cat.get("subcriteria", [])
                    if not isinstance(cat_subs, list):
                        cat_subs = []
                    for sub in cat_subs:
                        if isinstance(sub, dict) and sub.get("criterion", "").lower() not in exist_subs:
                            all_cats[matched_key].setdefault("subcriteria", []).append(sub)

            disqs = data.get("mandatory_disqualifiers", [])
            for d in _normalize_disqualifiers(disqs):
                if d not in all_disq:
                    all_disq.append(d)

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
        if is_compliance:
            # Move to mandatory eligibility checks
            disq_text = f"Submission of {item[0]['category']} required"
            if disq_text not in all_disq:
                all_disq.append(disq_text)
            print(f"[Stage2] Moved '{item[0]['category']}' to eligibility checks")
        else:
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
                mand = bool(s.get("mandatory", False))
                subcriteria_list.append(SubCriterion(criterion=crit_name, max_marks=max_m, mandatory=mand))
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
        mandatory_disqualifiers=all_disq,
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
    all_evals: List[CriterionEvaluation] = []

    for cat in rules.scoring_categories:
        # Build criteria list for this category only
        criteria_list = []
        if cat.subcriteria:
            for sub in cat.subcriteria:
                criteria_list.append({
                    "category": cat.category, "criterion": sub.criterion,
                    "max_marks": sub.max_marks, "mandatory": sub.mandatory,
                })
        else:
            criteria_list.append({
                "category": cat.category,
                "criterion": f"{cat.category} — overall assessment",
                "max_marks": cat.max_marks, "mandatory": False,
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
[{{"criterion":"<specific aspect name>","category":"{cat.category}","max_marks":<proportional_max>,"marks_awarded":<actual_marks — use partial marks not just 0 or max>,"vendor_claim":"<direct quote or brief description from the bid, or 'Not found'>","source_reference":"<section heading or 'Not found'>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence citing specific bid evidence>","is_mandatory":false}}]"""
        else:
            prompt = f"""Evaluate the vendor bid for the "{cat.category}" category.

VENDOR BID:
{relevant_bid}
{rfp_context}
CRITERIA:
{json.dumps(criteria_list, indent=2)}

{scoring_instruction}

Return ONLY a JSON array. For each criterion include marks_awarded as the ACTUAL numeric marks (based on tiered scoring), NOT just max_marks:
[{{"criterion":"<name>","category":"<cat>","max_marks":<n>,"marks_awarded":<actual_tiered_marks>,"vendor_claim":"<quote or Not found>","source_reference":"<section or Not found>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence explaining the tier awarded>","is_mandatory":<true|false>}}]"""

        try:
            items = _parse_array(await _call(prompt))
            if not isinstance(items, list):
                items = []
            # Trust stage2's mandatory flag — don't let the scoring LLM override it
            mandatory_lookup = {c["criterion"]: c.get("mandatory", False) for c in criteria_list}
            for item in items:
                if not isinstance(item, dict):
                    continue
                crit_name = item.get("criterion", "")
                if crit_name in mandatory_lookup:
                    item["is_mandatory"] = mandatory_lookup[crit_name]
                # Default missing keys in item to satisfy CriterionEvaluation
                for k in ["criterion", "category", "vendor_claim", "source_reference", "compliance_status", "confidence", "justification"]:
                    if k not in item:
                        item[k] = "Not found" if k in ["vendor_claim", "source_reference"] else ""
                if "max_marks" not in item:
                    item["max_marks"] = 0.0
                if "marks_awarded" not in item:
                    item["marks_awarded"] = 0.0
                all_evals.append(CriterionEvaluation(**item))
        except Exception:
            for c in criteria_list:
                all_evals.append(CriterionEvaluation(
                    criterion=c["criterion"], category=c["category"],
                    max_marks=c["max_marks"], vendor_claim="Evaluation error",
                    source_reference="Not found", compliance_status="Not Met",
                    confidence="Low", justification="Parsing failed for this category.",
                    is_mandatory=c.get("mandatory", False),
                ))

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
# Stage 4b — Mandatory Disqualifier Checks
# ---------------------------------------------------------------------------

async def stage4b_check_disqualifiers(
    bid_text: str, disqualifiers: List[str]
) -> List[DisqualifierCheck]:
    if not disqualifiers:
        return []

    # Smart extraction using disqualifier keywords
    disq_criteria = [{"criterion": d} for d in disqualifiers]
    relevant_bid  = _extract_bid_sections(bid_text, disq_criteria, MAX_DISQ_CHARS)

    prompt = f"""Check whether the vendor bid satisfies each mandatory requirement below.

IMPORTANT RULES:
- For document submission requirements (e.g. "Submission of Bank Guarantee required", "Power of Attorney"),
  set met=true if the vendor mentions submitting or enclosing it, OR if the bid includes such documents.
  Set met=false ONLY if the vendor explicitly states they are NOT providing it.
- For eligibility criteria, set met=true if evidence exists in the bid.
- Default to met=true when evidence is unclear — only flag met=false on clear non-compliance.

VENDOR BID (relevant sections):
{relevant_bid}

MANDATORY REQUIREMENTS:
{json.dumps(disqualifiers, indent=2)}

Return ONLY a JSON array:
[
  {{
    "condition": "<exact requirement text>",
    "met": true,
    "note": "<evidence from bid, or 'Not mentioned but no explicit refusal'>"
  }}
]"""

    items = _parse_array(await _call(prompt))
    if not isinstance(items, list):
        items = []
    checks = []
    for item in items:
        if isinstance(item, dict):
            cond = item.get("condition", "")
            met = bool(item.get("met", True))
            note = item.get("note", "")
            checks.append(DisqualifierCheck(condition=cond, met=met, note=note))
    return checks


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

    items = _parse_array(await _call(prompt))
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

    return (await _call(prompt)).strip()


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

async def _run_pipeline(
    bid_text: str,
    rules: EvaluationRules,
    rfp_scoring_text: str = "",
    prebid_text: str = "",
) -> EvaluationReport:
    criteria_evals      = await stage3_parse_vendor_response(bid_text, rules, rfp_scoring_text)
    category_results    = stage4_calculate_scores(criteria_evals, rules)
    disqualifier_checks = await stage4b_check_disqualifiers(
        bid_text, rules.mandatory_disqualifiers
    )

    failed_disqs            = [d for d in disqualifier_checks if not d.met]
    failed_mandatory_criteria = [c for c in criteria_evals if c.is_mandatory and c.compliance_status == "Not Met"]
    disqualified            = bool(failed_disqs) or bool(failed_mandatory_criteria)
    
    if failed_disqs:
        disqualification_reason = failed_disqs[0].condition
    elif failed_mandatory_criteria:
        disqualification_reason = f"Mandatory requirement not met: {failed_mandatory_criteria[0].criterion}"
    else:
        disqualification_reason = None

    # Sync scored criteria with failed mandatory disqualifiers so the Requirements
    # Assessment stays consistent with the Mandatory Requirements section.
    # Stage 4b (binary check) is authoritative: if a disqualifier is NOT MET,
    # any scored criterion whose name appears in that condition gets zeroed out.
    if failed_disqs:
        failed_conditions_lower = [d.condition.lower() for d in failed_disqs]
        for ce in criteria_evals:
            crit_lower = ce.criterion.lower()
            if any(crit_lower in cond or cond in crit_lower for cond in failed_conditions_lower):
                ce.compliance_status = "Not Met"
                ce.marks_awarded = 0.0

    # Recalculate category scores after potential mark overrides above
    category_results = stage4_calculate_scores(criteria_evals, rules)

    # Auto-disqualify if any mandatory (Critical) scored criterion is Not Met
    if not disqualified:
        failed_mandatory = [
            ce for ce in criteria_evals
            if ce.is_mandatory and ce.compliance_status == "Not Met"
        ]
        if failed_mandatory:
            disqualified = True
            disqualification_reason = (
                f"Mandatory criterion not met: {failed_mandatory[0].criterion}"
            )

    total_score = round(sum(cr.weighted_score for cr in category_results), 2)
    max_score   = round(sum(cat.weight_percent for cat in rules.scoring_categories), 2)
    threshold   = rules.threshold.overall_pass_mark

    category_fail = any(
        not cr.passed for cr in category_results if cr.minimum_required is not None
    )
    passed = not disqualified and not category_fail and total_score >= threshold

    # If the score is 100% (overall score meets or exceeds max_score, or all criteria scored 100%), no gaps/risks are shown.
    is_perfect = (total_score >= max_score) or (
        len(criteria_evals) > 0 and all(ce.marks_awarded >= ce.max_marks for ce in criteria_evals if ce.max_marks > 0)
    )
    if is_perfect:
        risk_items = []
    else:
        risk_items = await stage5_gap_analysis(criteria_evals)

    executive_summary = await stage6_executive_summary(
        total_score, max_score, passed, category_results
    )
    prebid_qa      = await stage_extract_prebid_qa(prebid_text) if prebid_text.strip() else []
    prebid_applied = bool(prebid_text.strip())

    return EvaluationReport(
        total_score=total_score,
        max_score=max_score,
        threshold=threshold,
        passed=passed,
        disqualified=disqualified,
        disqualification_reason=disqualification_reason,
        category_results=category_results,
        disqualifier_checks=disqualifier_checks,
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
    rules = await stage2_extract_rules(rfp_text)
    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")
    rfp_scoring_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text, prebid_text=prebid_text)


async def run_evaluation_with_rules(bid_text: str, rules: EvaluationRules) -> EvaluationReport:
    """Run evaluation stages 3-6 using caller-supplied rules (no RFP needed)."""
    return await _run_pipeline(bid_text, rules)


# ---------------------------------------------------------------------------
# PQTQ evaluation — PQ/TQ-scoped rule extraction + lenient scoring
# ---------------------------------------------------------------------------

async def stage2_extract_pqtq_rules(rfp_text: str) -> EvaluationRules:
    """Like stage2_extract_rules but scoped to PQ/TQ criteria only."""
    keyword_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    chunks = [keyword_text]
    scoring_start = _find_scoring_section_start(rfp_text)
    if scoring_start >= 0:
        for i in range(1, 3):
            chunk_start = scoring_start + i * MAX_RFP_CHARS
            if chunk_start < len(rfp_text):
                chunks.append(rfp_text[chunk_start: chunk_start + MAX_RFP_CHARS])
    else:
        for start in range(0, min(len(rfp_text), MAX_RFP_CHARS * 3), MAX_RFP_CHARS):
            chunks.append(rfp_text[start: start + MAX_RFP_CHARS])

    chunks = [c for c in chunks if c.strip()][:4]

    all_cats: dict[str, dict] = {}
    all_disq: list[str] = []
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}
    any_explicit_rules = False

    for chunk in chunks:
        try:
            data = _parse_object(await _call(_rfp_pqtq_prompt(chunk)))
            chunk_has_rules = bool(data.get("rules_found", False))
            if chunk_has_rules:
                any_explicit_rules = True
            else:
                disqs = data.get("mandatory_disqualifiers", [])
                for d in _normalize_disqualifiers(disqs):
                    if d not in all_disq:
                        all_disq.append(d)
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
                    cat_subs = cat.get("subcriteria", [])
                    if not isinstance(cat_subs, list):
                        cat_subs = []
                    for sub in cat_subs:
                        if isinstance(sub, dict) and sub.get("criterion", "").lower() not in exist_subs:
                            all_cats[matched_key].setdefault("subcriteria", []).append(sub)

            disqs = data.get("mandatory_disqualifiers", [])
            for d in _normalize_disqualifiers(disqs):
                if d not in all_disq:
                    all_disq.append(d)

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
                    mandatory=bool(s.get("mandatory", False)),
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
        mandatory_disqualifiers=all_disq,
    )


_PQ_KEYWORDS = ["pre-qualif", "pre qualif", "prequalif", "eligib", "pq —", "pq-", " pq ", "(pq)", "annexure 2", "annex 2"]
_TQ_KEYWORDS = ["technical qual", "technical eval", "tq —", "tq-", " tq ", "(tq)", "annexure 18", "annex 18", "technical criteria"]


async def run_pqtq_evaluation(rfp_text: str, bid_text: str) -> EvaluationReport:
    """Evaluate bid scoped to Pre-Qualification / Technical Qualification criteria only."""
    if not _rfp_has_explicit_marks(rfp_text):
        raise ValueError("NO_RULES_FOUND")
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

    keyword_text  = _extract_scoring_sections(combined, MAX_RFP_CHARS)
    scoring_start = _find_scoring_section_start(combined)

    chunks: list[str] = [keyword_text]
    if scoring_start >= 0:
        for i in range(1, 4):
            chunk_start = scoring_start + i * MAX_RFP_CHARS
            if chunk_start < len(combined):
                chunks.append(combined[chunk_start: chunk_start + MAX_RFP_CHARS])
    else:
        for start in range(0, min(len(combined), MAX_RFP_CHARS * 4), MAX_RFP_CHARS):
            chunks.append(combined[start: start + MAX_RFP_CHARS])

    chunks = [c for c in chunks if c.strip()][:5]

    seen_pq: set[str] = set()
    seen_tq: set[str] = set()
    raw_pq: list[dict] = []
    raw_tq: list[dict] = []

    for chunk in chunks:
        try:
            data = _parse_object(await _call(_bid_readiness_prompt(chunk)))
        except Exception:
            continue

        for item in (data.get("pq_criteria") or []):
            if not isinstance(item, dict):
                continue
            key = str(item.get("criterion", "")).strip().lower()[:80]
            if key and key not in seen_pq:
                seen_pq.add(key)
                raw_pq.append(item)

        for item in (data.get("tq_criteria") or []):
            if not isinstance(item, dict):
                continue
            key = str(item.get("criterion", "")).strip().lower()[:80]
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
