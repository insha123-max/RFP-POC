"""7-stage RFP evaluation pipeline powered by Groq (llama-3.3-70b-versatile)."""

import asyncio
import json
import os
import re
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
    RiskItem,
    ScoringCategory,
    SubCriterion,
    Threshold,
)

load_dotenv()

# Model fallback list — tried in order when daily/per-request limits are hit
# llama-3.1-8b-instant : 500K tokens/day,  6K TPM  (primary — highest daily quota)
# llama-3.3-70b-versatile: 100K tokens/day, 12K TPM  (fallback — better quality)
_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
MODEL_NAME     = _MODELS[0]

# Chunk sizes calibrated for llama-3.1-8b-instant's 6K TPM limit.
# At ~1.5 tokens/char for dense docs: 3000 chars ≈ 4500 tokens → safe under 6K.
MAX_RFP_CHARS  =  3_000
MAX_BID_CHARS  =  2_500
MAX_DISQ_CHARS =  2_500

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
            # Daily limit (TPD) or per-request limit (TPM) → try next model
            if "429" in err or "rate" in err.lower() or "quota" in err.lower():
                print(f"[_call] {model} rate-limited, trying next model. Error: {err[:120]}")
                last_exc = exc
                await asyncio.sleep(3)
                continue
            raise   # non-rate-limit error: raise immediately
    raise last_exc


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


def _extract_scoring_sections(text: str, max_chars: int) -> str:
    """Return the most scoring-relevant paragraphs from the RFP."""
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
        f"Extract scoring criteria, marks, and evaluation parameters from this tender document section.\n\n"
        f"{chunk}\n\n"
        f"Return ONLY JSON:\n"
        f'{{"rules_found":true,"scoring_categories":[{{"category":"Technical Bid","max_marks":70,"weight_percent":70,'
        f'"subcriteria":[{{"criterion":"Company experience","max_marks":20,"mandatory":false}}]}}],'
        f'"threshold":{{"overall_pass_mark":70,"category_minimums":[]}},"mandatory_disqualifiers":[]}}\n\n'
        f"Set rules_found=false only if this section has absolutely no evaluation criteria."
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
    for start in range(0, min(len(rfp_text), MAX_RFP_CHARS * 3), MAX_RFP_CHARS):
        chunks.append(rfp_text[start: start + MAX_RFP_CHARS])
    chunks = [c for c in chunks if c.strip()][:4]  # at most 4 calls

    # Merge categories from all chunks
    all_cats: dict[str, dict] = {}
    all_disq: list[str] = []
    pass_mark = 0.0
    cat_mins: dict[str, dict] = {}

    for chunk in chunks:
        try:
            data = _parse_object(await _call(_rfp_extract_prompt(chunk)))
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
            subcriteria=[SubCriterion(**s) for s in c.get("subcriteria", [])],
        )
        for c, m, w in raw_cats
    ]

    # Absolute fallback — use generic structure so evaluation never crashes
    if not categories:
        print("[Stage2] No criteria found — using generic fallback structure")
        categories = [
            ScoringCategory(category="Technical Bid", max_marks=70, weight_percent=70, subcriteria=[]),
            ScoringCategory(category="Commercial Bid", max_marks=30, weight_percent=30, subcriteria=[]),
        ]
        pass_mark = 70.0

    threshold = Threshold(
        overall_pass_mark=pass_mark,
        category_minimums=[
            CategoryMinimum(category=cm.get("category", ""), minimum_percent=float(cm.get("minimum_percent") or 0))
            for cm in cat_mins.values()
        ],
    )

    return EvaluationRules(
        rules_found=bool(all_cats),
        scoring_categories=categories,
        threshold=threshold,
        mandatory_disqualifiers=all_disq,
    )


# ---------------------------------------------------------------------------
# Stage 3 — Vendor Response Parsing
# ---------------------------------------------------------------------------

async def stage3_parse_vendor_response(
    bid_text: str, rules: EvaluationRules
) -> List[CriterionEvaluation]:
    """Evaluate each scoring category separately so bid extraction is focused."""
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
        prompt = f"""Evaluate the vendor bid for the "{cat.category}" category.

VENDOR BID:
{relevant_bid}

CRITERIA:
{json.dumps(criteria_list, indent=2)}

{"This is a broad category assessment. Award 'Met' if the bid clearly addresses this category, 'Partial' if the bid partially addresses it, 'Not Met' only if completely absent." if is_generic else
"Be specific: 'Met' requires explicit evidence matching the criterion. 'Partial' for partial evidence. 'Not Met' only when nothing relevant is found."}

Return ONLY a JSON array:
[{{"criterion":"<name>","category":"<cat>","max_marks":<n>,"vendor_claim":"<quote or Not found>","source_reference":"<section or Not found>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence>","is_mandatory":<true|false>}}]"""

        try:
            items = _parse_array(await _call(prompt))
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
        if ce.compliance_status == "Met":
            ce.marks_awarded = ce.max_marks
        elif ce.compliance_status == "Partial":
            ce.marks_awarded = round(ce.max_marks * 0.5, 2)
        else:
            ce.marks_awarded = 0.0

    category_results = []
    # Use overall pass mark as default category minimum when RFP doesn't specify one.
    # This ensures every category shows a meaningful minimum (e.g. 70%).
    overall_min = rules.threshold.overall_pass_mark or 0.0

    for cat in rules.scoring_categories:
        cat_criteria = [ce for ce in criteria_evals if ce.category == cat.category]
        marks_awarded = round(sum(ce.marks_awarded for ce in cat_criteria), 2)
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
# Orchestrator — full pipeline
# ---------------------------------------------------------------------------

async def run_full_evaluation(rfp_text: str, bid_text: str) -> EvaluationReport:
    rules = await stage2_extract_rules(rfp_text)

    # stage2 now has a built-in fallback — scoring_categories will always be non-empty

    criteria_evals      = await stage3_parse_vendor_response(bid_text, rules)
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

    risk_items        = await stage5_gap_analysis(criteria_evals)
    executive_summary = await stage6_executive_summary(
        total_score, max_score, passed, category_results
    )

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
    )
