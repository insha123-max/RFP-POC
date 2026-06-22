"""FastAPI application for the RFP Evaluator."""

import json
import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from document import extract_text
from export import generate_word_report
from models import (
    BidReadinessResult,
    CategoryMinimum,
    EvaluationReport,
    EvaluationRules,
    OverrideRequest,
    ScoringCategory,
    SubCriterion,
    Threshold,
)
from pipeline import (
    extract_bid_readiness_checklist,
    run_evaluation_with_rules,
    run_full_evaluation,
    run_pqtq_evaluation,
)

load_dotenv()

app = FastAPI(title="RFP Evaluator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.post("/api/evaluate", response_model=EvaluationReport)
async def evaluate(
    rfp_file: UploadFile = File(..., description="RFP / Tender document"),
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    prebid_file: Optional[UploadFile] = File(None, description="Pre-Bid Q&A / clarification document (optional)"),
):
    rfp_bytes = await rfp_file.read()
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        bid_text, bid_err = extract_text(bid_file.filename or f"bid_{i+1}.pdf", bid_bytes)
        if bid_err:
            raise HTTPException(status_code=400, detail=f"Bid document '{bid_file.filename}' error: {bid_err}")
        header = f"=== BID DOCUMENT {i+1}: {bid_file.filename} ===" if len(bid_files) > 1 else ""
        bid_parts.append(f"{header}\n{bid_text}".strip())
    combined_bid_text = "\n\n".join(bid_parts)

    prebid_text = ""
    if prebid_file is not None:
        prebid_bytes = await prebid_file.read()
        pb_text, pb_err = extract_text(prebid_file.filename or "prebid.pdf", prebid_bytes)
        if pb_err:
            raise HTTPException(status_code=400, detail=f"Additional document error: {pb_err}")
        prebid_text = pb_text

    try:
        report = await run_full_evaluation(rfp_text, combined_bid_text, prebid_text=prebid_text)
        return report
    except ValueError as exc:
        if str(exc) == "NO_RULES_FOUND":
            raise HTTPException(
                status_code=422,
                detail=(
                    "NO_RULES_FOUND: The RFP document does not contain any explicit "
                    "scoring rules or evaluation criteria. Please upload an RFP that "
                    "includes a scoring matrix or weighted criteria table."
                ),
            )
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        msg = str(exc)
        if "rate-limited" in msg or "All Ollama" in msg:
            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI service is temporarily unavailable due to rate limits. "
                    "Please wait 1–2 minutes and try again."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


def _build_rules_from_custom(data: dict) -> EvaluationRules:
    """Convert the frontend custom-criteria payload into EvaluationRules."""
    threshold_pct = float(data.get("threshold", 70))
    cats_data = data.get("categories", [])

    total_marks = sum(
        sum(float(c.get("max_marks", 0)) for c in cat.get("criteria", []))
        for cat in cats_data
    )

    scoring_categories: list[ScoringCategory] = []
    category_minimums:  list[CategoryMinimum]  = []

    for i, cat in enumerate(cats_data):
        cat_marks = sum(float(c.get("max_marks", 0)) for c in cat.get("criteria", []))
        weight = (
            round(cat_marks / total_marks * 100, 2) if total_marks > 0
            else round(100 / len(cats_data), 2)
        )
        subcriteria = [
            SubCriterion(
                criterion=c.get("question") or f"Question {j + 1}",
                max_marks=float(c.get("max_marks", 10)),
                mandatory=bool(c.get("mandatory", False)),
            )
            for j, c in enumerate(cat.get("criteria", []))
        ]
        cat_name = cat.get("name") or f"Category {i + 1}"
        scoring_categories.append(
            ScoringCategory(
                category=cat_name,
                max_marks=cat_marks,
                weight_percent=weight,
                subcriteria=subcriteria,
            )
        )
        min_req = cat.get("minimum_required")
        if min_req is not None and float(min_req) > 0:
            category_minimums.append(
                CategoryMinimum(category=cat_name, minimum_percent=float(min_req))
            )

    return EvaluationRules(
        rules_found=True,
        scoring_categories=scoring_categories,
        threshold=Threshold(
            overall_pass_mark=threshold_pct,
            category_minimums=category_minimums,
        ),
    )


@app.post("/api/evaluate-custom", response_model=EvaluationReport)
async def evaluate_custom(
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    criteria_json: str = Form(..., description="JSON string of custom evaluation criteria"),
):
    try:
        criteria_data = json.loads(criteria_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="criteria_json is not valid JSON")

    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        bid_text, bid_err = extract_text(bid_file.filename or f"bid_{i + 1}.pdf", bid_bytes)
        if bid_err:
            raise HTTPException(status_code=400, detail=f"Bid document '{bid_file.filename}' error: {bid_err}")
        header = f"=== BID DOCUMENT {i + 1}: {bid_file.filename} ===" if len(bid_files) > 1 else ""
        bid_parts.append(f"{header}\n{bid_text}".strip())
    combined_bid_text = "\n\n".join(bid_parts)

    rules = _build_rules_from_custom(criteria_data)

    try:
        report = await run_evaluation_with_rules(combined_bid_text, rules)
        return report
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


@app.post("/api/evaluate-pqtq", response_model=EvaluationReport)
async def evaluate_pqtq(
    rfp_file: UploadFile = File(..., description="RFP / Tender document"),
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    extra_rfp_files: List[UploadFile] = File(default=[], description="Additional rule/scoring documents (annexures, scoring matrices)"),
):
    rfp_bytes = await rfp_file.read()
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    # Concatenate additional rule documents with the RFP text so Stage 2
    # can extract criteria from annexures / scoring matrices uploaded separately.
    for i, ef in enumerate(extra_rfp_files):
        ef_bytes = await ef.read()
        ef_text, ef_err = extract_text(ef.filename or f"extra_rfp_{i+1}.pdf", ef_bytes)
        if not ef_err and ef_text.strip():
            rfp_text += f"\n\n=== ADDITIONAL DOCUMENT: {ef.filename} ===\n{ef_text}"

    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        bid_text, bid_err = extract_text(bid_file.filename or f"bid_{i+1}.pdf", bid_bytes)
        if bid_err:
            raise HTTPException(status_code=400, detail=f"Bid document '{bid_file.filename}' error: {bid_err}")
        header = f"=== BID DOCUMENT {i+1}: {bid_file.filename} ===" if len(bid_files) > 1 else ""
        bid_parts.append(f"{header}\n{bid_text}".strip())
    combined_bid_text = "\n\n".join(bid_parts)

    try:
        report = await run_pqtq_evaluation(rfp_text, combined_bid_text)
        return report
    except ValueError as exc:
        if str(exc) == "NO_RULES_FOUND":
            raise HTTPException(
                status_code=422,
                detail=(
                    "NO_RULES_FOUND: No Pre-Qualification or Technical Qualification scoring "
                    "criteria with explicit numeric marks were found in this RFP."
                ),
            )
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        msg = str(exc)
        if "rate-limited" in msg or "All Ollama" in msg:
            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI service is temporarily unavailable due to rate limits. "
                    "Please wait 1–2 minutes and try again."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


@app.post("/api/bid-readiness", response_model=BidReadinessResult)
async def bid_readiness(
    rfp_file: UploadFile = File(..., description="RFP / Tender document"),
    additional_file: Optional[UploadFile] = File(default=None, description="Optional additional document (annexures, scoring matrix, etc.)"),
):
    """Extract PQ/TQ criteria from RFP as a plain-English self-assessment checklist."""
    rfp_bytes = await rfp_file.read()
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    additional_text = ""
    if additional_file and additional_file.filename:
        add_bytes = await additional_file.read()
        add_text, add_err = extract_text(additional_file.filename, add_bytes)
        if not add_err:
            additional_text = add_text

    try:
        result = await extract_bid_readiness_checklist(rfp_text, additional_text)
        return result
    except RuntimeError as exc:
        msg = str(exc)
        if "rate-limited" in msg or "All Ollama" in msg:
            raise HTTPException(
                status_code=503,
                detail="The AI service is temporarily unavailable. Please wait 1–2 minutes and try again.",
            )
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}")


@app.post("/api/override", response_model=EvaluationReport)
async def apply_override(request: OverrideRequest):
    """Apply reviewer score overrides and recalculate totals."""
    report = request.report

    for override in request.overrides:
        for cat_result in report.category_results:
            if cat_result.category != override.category:
                continue
            for crit in cat_result.criteria:
                if crit.criterion != override.criterion:
                    continue
                old = crit.marks_awarded
                crit.marks_awarded = min(override.new_marks, crit.max_marks)

                # Update compliance_status + threshold_logic to reflect the new marks
                min_required = cat_result.minimum_required
                if crit.max_marks > 0:
                    if min_required is not None:
                        threshold = crit.max_marks * (min_required / 100)
                        crit.compliance_status = "Met" if crit.marks_awarded >= threshold else "Not Met"
                        crit.threshold_logic = f"RFP Min ({min_required}%)"
                    else:
                        crit.compliance_status = "Met" if crit.marks_awarded > crit.max_marks / 2 else "Not Met"
                        crit.threshold_logic = "50% Fallback"
                else:
                    crit.compliance_status = "Not Met"
                    crit.threshold_logic = "N/A"

                note = f" [REVIEWER OVERRIDE: {old} → {crit.marks_awarded}"
                if override.reason:
                    note += f". Reason: {override.reason}"
                note += "]"
                crit.justification += note

            # Recalculate category totals
            cat_result.marks_awarded = round(
                sum(c.marks_awarded for c in cat_result.criteria), 2
            )
            cat_result.percent_achieved = round(
                cat_result.marks_awarded / cat_result.max_marks * 100, 1
            ) if cat_result.max_marks else 0.0
            cat_result.weighted_score = round(
                (cat_result.marks_awarded / cat_result.max_marks) * cat_result.weight_percent, 2
            ) if cat_result.max_marks else 0.0
            if cat_result.minimum_required is not None:
                cat_result.passed = (
                    cat_result.percent_achieved >= cat_result.minimum_required
                )
            else:
                cat_result.passed = cat_result.percent_achieved > 0

            # Ensure override recalculates weighted score correctly
            cat_result.weighted_score = round(
                (cat_result.marks_awarded / cat_result.max_marks) * cat_result.weight_percent, 2
            ) if cat_result.max_marks else 0.0

    # Recalculate overall totals
    report.disqualified = False
    report.disqualification_reason = None

    report.total_score = round(
        sum(cr.weighted_score for cr in report.category_results), 2
    )
    category_fail = any(
        not cr.passed
        for cr in report.category_results
        if cr.minimum_required is not None
    )
    report.passed = (
        not report.disqualified
        and not category_fail
        and report.total_score >= report.threshold
    )

    # If the score is 100% after overrides (overall score meets or exceeds max_score, or all criteria achieved 100%), clear risk items.
    all_criteria = [ce for cr in report.category_results for ce in cr.criteria]
    is_perfect = (report.total_score >= report.max_score) or (
        len(all_criteria) > 0 and all(ce.marks_awarded >= ce.max_marks for ce in all_criteria if ce.max_marks > 0)
    )
    if is_perfect:
        report.risk_items = []

    return report


@app.post("/api/export/word")
async def export_word(report: EvaluationReport):
    """Generate and return a Word (.docx) evaluation report."""
    try:
        doc_bytes = generate_word_report(report)
        filename  = f"RFP_Evaluation_{'PASSED' if report.passed else 'FAILED'}.docx"
        return Response(
            content=doc_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve frontend — must come AFTER all API routes
# ---------------------------------------------------------------------------

_frontend = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.isdir(_frontend):
    app.mount("/", StaticFiles(directory=_frontend, html=True), name="frontend")
