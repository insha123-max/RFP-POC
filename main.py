"""FastAPI application for the RFP Evaluator."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from document import extract_text
from export import generate_word_report
from models import EvaluationReport, OverrideRequest
from pipeline import run_full_evaluation

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
    bid_file: UploadFile = File(..., description="Vendor bid / response document"),
):
    rfp_bytes = await rfp_file.read()
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    bid_bytes = await bid_file.read()
    bid_text, bid_err = extract_text(bid_file.filename or "bid.pdf", bid_bytes)
    if bid_err:
        raise HTTPException(status_code=400, detail=f"Bid document error: {bid_err}")

    try:
        report = await run_full_evaluation(rfp_text, bid_text)
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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


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

                # Update compliance_status to reflect the new marks
                if crit.marks_awarded >= crit.max_marks:
                    crit.compliance_status = "Met"
                elif crit.marks_awarded > 0:
                    crit.compliance_status = "Partial"
                else:
                    crit.compliance_status = "Not Met"

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

    # Recalculate overall totals
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
