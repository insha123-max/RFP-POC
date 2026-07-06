"""FastAPI application for the RFP Evaluator."""

import json
import os
import uuid
from typing import Any, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from db.auth import create_token, decode_token, hash_password, verify_password
from db.database import Base, engine, get_db
from db.models import Evaluation, User

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
    convert_readiness_to_rules,
    extract_bid_readiness_checklist,
    run_evaluation_with_rules,
    run_full_evaluation,
    run_pqtq_evaluation,
)

load_dotenv()


# ---------------------------------------------------------------------------
# Pydantic schemas for auth / evaluations
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SaveEvaluationRequest(BaseModel):
    rfp_name: Optional[str] = None
    bid_name: Optional[str] = None
    evaluation_type: str = "General"
    score: Optional[float] = None
    passed: Optional[bool] = None
    report: Optional[Any] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# App lifespan — create tables on startup
# ---------------------------------------------------------------------------

def _create_tables():
    Base.metadata.create_all(bind=engine)


app = FastAPI(title="RFP Evaluator", version="1.0.0", on_startup=[_create_tables])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.execute(select(User).where(User.id == uuid.UUID(payload["sub"]))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/api/auth/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if not req.email.lower().endswith("@globallogic.com"):
        raise HTTPException(status_code=400, detail="Only @globallogic.com email addresses are allowed.")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len(req.password) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 characters or fewer.")
    if db.execute(select(User).where(User.email == req.email.lower())).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=req.name.strip(), email=req.email.lower(), password=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(str(user.id), user.email)
    return {"token": token, "user": {"id": str(user.id), "name": user.name, "email": user.email}}


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if not req.email.lower().endswith("@globallogic.com"):
        raise HTTPException(status_code=400, detail="Only @globallogic.com email addresses are allowed.")
    user = db.execute(select(User).where(User.email == req.email.lower())).scalar_one_or_none()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_token(str(user.id), user.email)
    return {"token": token, "user": {"id": str(user.id), "name": user.name, "email": user.email}}


@app.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "name": current_user.name, "email": current_user.email}


# ---------------------------------------------------------------------------
# Evaluation history endpoints
# ---------------------------------------------------------------------------

@app.get("/api/evaluations")
def list_evaluations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Evaluation)
        .where(Evaluation.user_id == current_user.id)
        .order_by(Evaluation.created_at.desc())
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "rfp_name": r.rfp_name,
            "bid_name": r.bid_name,
            "evaluation_type": r.evaluation_type,
            "score": r.score,
            "passed": r.passed,
            "report": r.report,
            "timestamp": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.post("/api/evaluations", status_code=201)
def save_evaluation(
    req: SaveEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ev = Evaluation(
        user_id=current_user.id,
        rfp_name=req.rfp_name,
        bid_name=req.bid_name,
        evaluation_type=req.evaluation_type,
        score=req.score,
        passed=req.passed,
        report=req.report,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {
        "id": str(ev.id),
        "rfp_name": ev.rfp_name,
        "bid_name": ev.bid_name,
        "evaluation_type": ev.evaluation_type,
        "score": ev.score,
        "passed": ev.passed,
        "timestamp": ev.created_at.isoformat(),
    }


@app.delete("/api/evaluations/{evaluation_id}", status_code=204)
def delete_evaluation(
    evaluation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ev = db.execute(
        select(Evaluation).where(
            Evaluation.id == uuid.UUID(evaluation_id),
            Evaluation.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found.")
    db.delete(ev)
    db.commit()


@app.delete("/api/evaluations", status_code=204)
def clear_all_evaluations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.execute(delete(Evaluation).where(Evaluation.user_id == current_user.id))
    db.commit()


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.post("/api/evaluate", response_model=EvaluationReport)
async def evaluate(
    rfp_files: List[UploadFile] = File(..., description="RFP / Tender documents (first is main RFP; additional files are supporting docs such as scoring sheets)"),
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    readiness_rules_json: Optional[str] = Form(default=None, description="Pre-validated criteria from Bid Readiness tab (JSON)"),
    custom_threshold: Optional[float] = Form(default=None, description="Override pass threshold % extracted from RFP (e.g. 70 means 70%)"),
    _current_user: User = Depends(get_current_user),
):
    rfp_parts = []
    for i, rfp_file in enumerate(rfp_files):
        rfp_bytes = await rfp_file.read()
        rfp_text_part, rfp_err = extract_text(rfp_file.filename or f"rfp_{i+1}.pdf", rfp_bytes)
        if rfp_err:
            raise HTTPException(status_code=400, detail=f"RFP document '{rfp_file.filename}' error: {rfp_err}")
        if i == 0:
            rfp_parts.append(rfp_text_part)
        else:
            rfp_parts.append(
                f"\n\n=== SUPPORTING RFP DOCUMENT {i}: {rfp_file.filename} "
                f"(evaluation rules / scoring criteria / amendments) ===\n\n{rfp_text_part}"
            )
    rfp_text = "".join(rfp_parts)

    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        bid_text, bid_err = extract_text(bid_file.filename or f"bid_{i+1}.pdf", bid_bytes)
        if bid_err:
            raise HTTPException(status_code=400, detail=f"Bid document '{bid_file.filename}' error: {bid_err}")
        header = f"=== BID DOCUMENT {i+1}: {bid_file.filename} ===" if len(bid_files) > 1 else ""
        bid_parts.append(f"{header}\n{bid_text}".strip())
    combined_bid_text = "\n\n".join(bid_parts)

    # If pre-validated rules from the Bid Readiness tab are provided, convert
    # them into EvaluationRules so the same criteria are used for scoring.
    readiness_rules = None
    if readiness_rules_json:
        try:
            rd = json.loads(readiness_rules_json)
            readiness_rules = convert_readiness_to_rules(
                pq_items=rd.get("pq_items", []),
                tq_items=rd.get("tq_items", []),
            )
        except Exception:
            readiness_rules = None  # fallback to fresh extraction

    if custom_threshold is not None and custom_threshold < 50:
        raise HTTPException(status_code=422, detail="Custom threshold cannot be less than 50%.")

    try:
        report = await run_full_evaluation(
            rfp_text, combined_bid_text,
            readiness_rules=readiness_rules,
            custom_threshold=custom_threshold,
        )
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
    readiness_rules_json: Optional[str] = Form(default=None, description="Pre-validated criteria from Bid Readiness tab (JSON)"),
    custom_threshold: Optional[float] = Form(default=None, description="Override pass threshold % extracted from RFP (e.g. 70 means 70%)"),
    _current_user: User = Depends(get_current_user),
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

    # If pre-validated rules from the Bid Readiness tab are provided, convert
    # them into EvaluationRules so the same criteria are used for scoring.
    readiness_rules = None
    if readiness_rules_json:
        try:
            rd = json.loads(readiness_rules_json)
            readiness_rules = convert_readiness_to_rules(
                pq_items=rd.get("pq_items", []),
                tq_items=rd.get("tq_items", []),
            )
        except Exception:
            readiness_rules = None  # fallback to fresh extraction

    if custom_threshold is not None and custom_threshold < 50:
        raise HTTPException(status_code=422, detail="Custom threshold cannot be less than 50%.")

    import asyncio
    from db.database import SessionLocal
    from db.models import Evaluation

    async def _evaluate_and_save():
        report = await run_pqtq_evaluation(
            rfp_text, combined_bid_text, 
            readiness_rules=readiness_rules, custom_threshold=custom_threshold
        )
        db = SessionLocal()
        try:
            ev = Evaluation(
                user_id=_current_user.id,
                rfp_name=rfp_file.filename or "rfp.pdf",
                bid_name=bid_files[0].filename if bid_files else "bid.pdf",
                evaluation_type="PQTQ",
                score=report.total_score,
                passed=report.passed,
                report=report.model_dump()
            )
            db.add(ev)
            db.commit()
        except Exception as e:
            print("Auto-save failed:", e)
        finally:
            db.close()
        return report

    try:
        report = await asyncio.shield(_evaluate_and_save())
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

_fe_react  = os.path.join(os.path.dirname(__file__), "frontend-react-dist")
_fe_legacy = os.path.join(os.path.dirname(__file__), "frontend")
_frontend  = _fe_react if os.path.isdir(_fe_react) else _fe_legacy
if os.path.isdir(_frontend):
    app.mount("/", StaticFiles(directory=_frontend, html=True), name="frontend")
