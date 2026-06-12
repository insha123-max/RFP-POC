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
    CategoryMinimum,
    CategoryResult,
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
# Groq free-tier daily limits (approx):
#   llama-3.1-8b-instant       500K TPD,  6K TPM   — primary (highest quota)
#   llama-3.3-70b-versatile    100K TPD, 12K TPM   — best quality
#   gemma2-9b-it               500K TPD, 15K TPM   — Google Gemma, large quota
#   llama-3.1-70b-versatile    100K TPD,  6K TPM   — additional 70B pool
#   llama-3.2-3b-preview      14.4K TPD, 15K TPM   — small fast model
_MODELS = [
    "llama-3.3-70b-versatile",   # best reasoning — use first
    "llama-3.1-70b-versatile",   # second 70B pool
    "gemma2-9b-it",              # fallback
    "llama-3.1-8b-instant",      # last resort — weak at math
    "llama-3.2-3b-preview",
]
MODEL_NAME = _MODELS[0]

# Chunk sizes calibrated for llama-3.1-8b-instant's 6K TPM limit.
# At ~1.5 tokens/char for dense docs: 3000 chars ≈ 4500 tokens → safe under 6K.
# MAX_BID_CHARS / MAX_DISQ_CHARS kept at 4000 so each per-category call stays
# under ~7500 tokens (input + prompt overhead), within the 12K TPM fallback model.
MAX_RFP_CHARS  =  15_000
MAX_BID_CHARS  =   4_000
MAX_DISQ_CHARS =   4_000

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


async def _call(prompt: str) -> str:
    """Try each model in _MODELS; fall back to next on rate-limit errors."""
    last_exc: Exception = RuntimeError("No models available")
    for model in _MODELS:
        try:
            resp = await get_client().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                max_tokens=2048,
            )
            return resp.choices[0].message.content
        except Exception as exc:
            err = str(exc)
            # Skip to next model on: rate limits (429) OR decommissioned models (400)
            is_rate_limit    = "429" in err or "rate" in err.lower() or "quota" in err.lower()
            is_decommissioned = "decommission" in err.lower() or "deprecated" in err.lower() or "no longer supported" in err.lower()
            if is_rate_limit or is_decommissioned:
                reason = "decommissioned" if is_decommissioned else "rate-limited"
                print(f"[_call] {model} {reason}, trying next model. Error: {err[:160]}")
                last_exc = exc
                if is_rate_limit:
                    await asyncio.sleep(2)
                continue
            raise   # other errors (auth, network, etc.) — raise immediately
    # All models exhausted — wait a moment and raise a clear error
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
        name = c.get("criterion", "").lower()
        keywords.update(w.strip("(),.:;-") for w in name.split() if len(w) > 3)

    # General evidence keywords common in bid documents
    keywords.update([
        "experience", "project", "years", "turnover", "revenue", "annual",
        "crore", "lakh", "team", "delivered", "completed", "implemented",
        "developed", "certified", "empanelled", "registered", "client",
        "customer", "reference", "case study", "production", "deployment",
        "solution", "system", "platform", "award", "contract", "government",
        "bfsi", "banking", "financial", "insurance", "genai", "llm", "ai",
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


def _normalize_disqualifiers(raw: list) -> list:
    result = []
    for d in raw:
        if isinstance(d, dict):
            d = d.get("criterion") or d.get("condition") or d.get("description") or str(d)
        if d:
            result.append(str(d))
    return result


async def stage2_extract_rules(rfp_text: str) -> EvaluationRules:
    # Build 3 chunks: keyword-filtered + raw sequential chunks
    keyword_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    chunks = [keyword_text]
    # For large documents where an anchor was found, `keyword_text` already targets
    # the exact scoring section — additional sequential chunks would bleed into
    # pre-bid Q&A tables that repeat old scoring formulas and look like new categories.
    # For small documents (no anchor found) fall back to sequential chunks from the start.
    scoring_start = _find_scoring_section_start(rfp_text)
    if scoring_start < 0:
        for start in range(0, min(len(rfp_text), MAX_RFP_CHARS * 3), MAX_RFP_CHARS):
            chunks.append(rfp_text[start: start + MAX_RFP_CHARS])

    chunks = [c for c in chunks if c.strip()][:4]  # at most 4 calls

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
                for d in _normalize_disqualifiers(data.get("mandatory_disqualifiers", [])):
                    if d not in all_disq:
                        all_disq.append(d)
                continue

            for cat in data.get("scoring_categories", []):
                key = cat.get("category", "").strip().lower()
                if not key:
                    continue
                if key not in all_cats:
                    all_cats[key] = {**cat}
                else:
                    exist_subs = {s["criterion"].lower() for s in all_cats[key].get("subcriteria", [])}
                    for sub in cat.get("subcriteria", []):
                        if sub.get("criterion", "").lower() not in exist_subs:
                            all_cats[key].setdefault("subcriteria", []).append(sub)
            for d in _normalize_disqualifiers(data.get("mandatory_disqualifiers", [])):
                if d not in all_disq:
                    all_disq.append(d)
            thresh = data.get("threshold", {})
            pm = float(thresh.get("overall_pass_mark") or 0)
            if pm > pass_mark:
                pass_mark = pm
            for cm in thresh.get("category_minimums", []):
                cat_mins[cm.get("category", "").lower()] = cm
        except Exception as e:
            print(f"[Stage2 chunk] error: {e}")
            continue

    # Normalise weights to sum to 100
    raw_cats = []
    for cat in all_cats.values():
        mm = float(cat.get("max_marks") or 0)
        wp = float(cat.get("weight_percent") or 0)
        if mm == 0 and cat.get("subcriteria"):
            mm = sum(float(s.get("max_marks") or 0) for s in cat["subcriteria"])
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

    categories = [
        ScoringCategory(
            category=c["category"], max_marks=m, weight_percent=w,
            subcriteria=[
                SubCriterion(**s) if isinstance(s, dict)
                else SubCriterion(criterion=str(s), max_marks=0)
                for s in c.get("subcriteria", [])
                if s
            ],
        )
        for c, m, w in raw_cats
    ]

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
        ],
    )

    return EvaluationRules(
        rules_found=any_explicit_rules,
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

        # Extract bid sections most relevant to THIS category's criteria
        relevant_bid = _extract_bid_sections(bid_text, criteria_list, MAX_BID_CHARS)

        is_generic = not cat.subcriteria  # True when no specific subcriteria found
        # Detect whether this is a presentation/demo category that will be evaluated
        # during a future scheduled event. At bid stage, a detailed plan with committed
        # content and live-system evidence should be scored as 'Met', not 'Not Met'.
        _FUTURE_EVENT_KEYWORDS = ["presentation", "demonstration", "demo", "live demo", "showcase"]
        is_future_event = any(kw in cat.category.lower() for kw in _FUTURE_EVENT_KEYWORDS)

        today = date.today().strftime("%B %d, %Y")

        scoring_instruction = (
            "This is a broad category assessment. Award 'Met' if the bid clearly addresses "
            "this category, 'Partial' if the bid partially addresses it, 'Not Met' only if "
            "completely absent."
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
            # Trust stage2's mandatory flag — don't let the scoring LLM override it
            mandatory_lookup = {c["criterion"]: c.get("mandatory", False) for c in criteria_list}
            for item in items:
                crit_name = item.get("criterion", "")
                if crit_name in mandatory_lookup:
                    item["is_mandatory"] = mandatory_lookup[crit_name]
            all_evals.extend([CriterionEvaluation(**item) for item in items])
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
    for ce in criteria_evals:
        # If LLM said Met but gave no valid marks, award full marks
        if ce.compliance_status == "Met" and not (0 < ce.marks_awarded <= ce.max_marks):
            ce.marks_awarded = ce.max_marks
        # Clamp to valid range
        ce.marks_awarded = max(0.0, min(ce.marks_awarded, ce.max_marks))
        # Determine compliance status by 50% threshold: >50% of max = Met, <=50% = Not Met
        if ce.max_marks > 0:
            ce.compliance_status = "Met" if ce.marks_awarded > ce.max_marks / 2 else "Not Met"
        else:
            ce.compliance_status = "Not Met"

    category_results = []
    # Use overall pass mark as default category minimum when RFP doesn't specify one.
    # This ensures every category shows a meaningful minimum (e.g. 70%).
    overall_min = rules.threshold.overall_pass_mark or 0.0

    for cat in rules.scoring_categories:
        cat_criteria = [ce for ce in criteria_evals if ce.category == cat.category]
        raw_marks    = round(sum(ce.marks_awarded for ce in cat_criteria), 2)
        # Cap at category max — duplicate/overlapping criteria extracted across chunks
        # can push the raw sum above max_marks, causing >100% scores.
        marks_awarded = min(raw_marks, cat.max_marks)
        pct = round(marks_awarded / cat.max_marks * 100, 1) if cat.max_marks else 0.0

        # Find explicit category minimum from RFP; ignore 0% (meaningless)
        min_pct: Optional[float] = None
        for cm in rules.threshold.category_minimums:
            if cm.category == cat.category and cm.minimum_percent > 0:
                min_pct = cm.minimum_percent
                break

        # Fall back to overall threshold % so every category shows a clear minimum
        if min_pct is None and overall_min > 0:
            min_pct = overall_min

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
    return [DisqualifierCheck(**item) for item in items]


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
    return [RiskItem(**item) for item in items]


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
        items = _parse_array(await _call(prompt))
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
    disqualified            = bool(failed_disqs)
    disqualification_reason = failed_disqs[0].condition if disqualified else None

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


async def run_full_evaluation(rfp_text: str, bid_text: str, prebid_text: str = "") -> EvaluationReport:
    prebid_applied = bool(prebid_text.strip())
    if prebid_applied:
        rfp_text = (
            rfp_text
            + "\n\n=== PRE-BID CLARIFICATIONS (take precedence over original criteria above) ===\n\n"
            + prebid_text.strip()
        )
    rules = await stage2_extract_rules(rfp_text)
    if not rules.rules_found:
        raise ValueError("NO_RULES_FOUND")
    rfp_scoring_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)
    return await _run_pipeline(bid_text, rules, rfp_scoring_text, prebid_text=prebid_text)


async def run_evaluation_with_rules(bid_text: str, rules: EvaluationRules) -> EvaluationReport:
    """Run evaluation stages 3-6 using caller-supplied rules (no RFP needed)."""
    return await _run_pipeline(bid_text, rules)
