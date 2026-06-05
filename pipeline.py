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

MODEL_NAME     = "llama-3.3-70b-versatile"   # 12,000 TPM, 100K tokens/day free tier
MAX_RFP_CHARS  =  8_000   # smart-filtered RFP text sent for rule extraction
MAX_BID_CHARS  =  4_000   # smart-filtered bid text sent per category evaluation call
MAX_DISQ_CHARS =  4_000   # smart-filtered bid text sent for disqualifier check

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


async def _call(prompt: str, max_retries: int = 4) -> str:
    """Call Groq with exponential backoff on rate-limit (429) errors."""
    for attempt in range(max_retries):
        try:
            resp = await get_client().chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                max_tokens=4096,
            )
            return resp.choices[0].message.content
        except Exception as exc:
            if attempt < max_retries - 1 and (
                "429" in str(exc) or "rate" in str(exc).lower()
            ):
                wait = 30 * (2 ** attempt)   # 30s, 60s, 120s
                await asyncio.sleep(wait)
            else:
                raise


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

async def stage2_extract_rules(rfp_text: str) -> EvaluationRules:
    relevant_text = _extract_scoring_sections(rfp_text, MAX_RFP_CHARS)

    prompt = f"""Extract ALL scoring criteria from this RFP/Tender document. Scoring may be distributed across sections — not necessarily in one table. Look for marks, percentages, weightages, points, or evaluation parameters anywhere in the text. Infer sub-criteria from descriptions even without explicit marks.

RFP (scoring-relevant sections):
{relevant_text}

Return ONLY JSON:
{{"rules_found":true,"scoring_categories":[{{"category":"Name","max_marks":70,"weight_percent":70,"subcriteria":[{{"criterion":"Name","max_marks":10,"mandatory":false}}]}}],"threshold":{{"overall_pass_mark":70,"category_minimums":[{{"category":"Technical Score","minimum_percent":70}}]}},"mandatory_disqualifiers":["condition"]}}

Set rules_found=false only if there is absolutely no scoring information."""

    data = _parse_object(await _call(prompt))

    categories = [
        ScoringCategory(
            category=cat["category"],
            max_marks=float(cat["max_marks"]),
            weight_percent=float(cat["weight_percent"]),
            subcriteria=[SubCriterion(**s) for s in cat.get("subcriteria", [])],
        )
        for cat in data.get("scoring_categories", [])
    ]

    raw_thresh = data.get("threshold", {})
    threshold = Threshold(
        overall_pass_mark=float(raw_thresh.get("overall_pass_mark", 0)),
        category_minimums=[
            CategoryMinimum(**m) for m in raw_thresh.get("category_minimums", [])
        ],
    )

    return EvaluationRules(
        rules_found=data.get("rules_found", False),
        scoring_categories=categories,
        threshold=threshold,
        mandatory_disqualifiers=data.get("mandatory_disqualifiers", []),
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

        prompt = f"""Evaluate the vendor bid against these criteria for the "{cat.category}" category.

VENDOR BID (sections most relevant to {cat.category}):
{relevant_bid}

CRITERIA TO EVALUATE:
{json.dumps(criteria_list, indent=2)}

Rules:
- "Met"     → vendor explicitly satisfies the criterion with clear evidence — quote it.
- "Partial" → vendor mentions or demonstrates a related capability but doesn't fully meet it.
- "Not Met" → no relevant evidence found anywhere in the bid.
- Use "Partial" generously when the vendor shows related work or capability.

Return ONLY a JSON array — one object per criterion:
[
  {{
    "criterion": "<exact name from list>",
    "category": "<category>",
    "max_marks": <number>,
    "vendor_claim": "<direct quote or description from bid, or 'Not found in document'>",
    "source_reference": "<Section/Page or 'Not found'>",
    "compliance_status": "Met|Partial|Not Met",
    "confidence": "High|Medium|Low",
    "justification": "<one sentence>",
    "is_mandatory": <true|false>
  }}
]"""

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
    for cat in rules.scoring_categories:
        cat_criteria = [ce for ce in criteria_evals if ce.category == cat.category]
        marks_awarded = round(sum(ce.marks_awarded for ce in cat_criteria), 2)
        pct = round(marks_awarded / cat.max_marks * 100, 1) if cat.max_marks else 0.0

        min_pct: Optional[float] = None
        for cm in rules.threshold.category_minimums:
            if cm.category == cat.category:
                min_pct = cm.minimum_percent
                break

        if min_pct is not None:
            cat_passed = pct >= min_pct
        else:
            # No category minimum set — pass unless the category scored absolute zero
            cat_passed = pct > 0
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

    prompt = f"""Check whether the vendor bid meets each mandatory requirement listed below.

VENDOR BID (relevant sections):
{relevant_bid}

MANDATORY REQUIREMENTS:
{json.dumps(disqualifiers, indent=2)}

Return ONLY a JSON array:
[
  {{
    "condition": "<exact requirement text>",
    "met": true,
    "note": "<evidence found or 'Not found in document'>"
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

    if not rules.scoring_categories:
        raise ValueError("NO_RULES_FOUND")

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
