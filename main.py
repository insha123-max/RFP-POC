"""FastAPI application for the RFP Evaluator."""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import delete, or_, select, text
from sqlalchemy.orm import Session

import jobs
from db.auth import create_token, decode_token, hash_password, verify_password
from db.database import Base, engine, get_db
from db.models import Document, Evaluation, Job, Role, User
from storage import delete_document_dirs, resolve_document_path, save_document

logger = logging.getLogger("rfp_evaluator")

from document import extract_text
from export import generate_word_report
from models import (
    CategoryMinimum,
    EvaluationReport,
    EvaluationRules,
    OverrideRequest,
    ScoringCategory,
    SubCriterion,
    Threshold,
)
from pipeline import convert_readiness_to_rules
from prompts.loader import validate_prompts

# Emails in this allow-list get role="admin" at signup. Comma-separated env var —
# e.g. ADMIN_EMAILS=lead1@globallogic.com,lead2@globallogic.com
_ADMIN_EMAILS = {
    e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()
}


# ---------------------------------------------------------------------------
# Pydantic schemas for auth / evaluations
# ---------------------------------------------------------------------------

_VALID_ROLES = {"admin", "evaluator"}

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "evaluator"

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


def _migrate_schema():
    """Additive column migrations for tables that already existed before a
    field was introduced — create_all() only creates missing tables, it never
    alters existing ones.
    """
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'evaluator'"
        ))
        # Seed roles reference table
        conn.execute(text("""
            INSERT INTO roles (name, label, description) VALUES
              ('admin',     'Admin',     'Full access including team activity and user management'),
              ('evaluator', 'Evaluator', 'Can run evaluations and view personal history')
            ON CONFLICT (name) DO NOTHING
        """))


app = FastAPI(
    title="RFP Evaluator",
    version="1.0.0",
    on_startup=[_create_tables, _migrate_schema, validate_prompts, jobs.start_worker],
    on_shutdown=[jobs.stop_worker],
)

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


def require_role(*roles: str):
    """Dependency factory — raises 403 unless the authenticated user's role is in `roles`."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
        return current_user
    return _check


def _user_out(user: User) -> dict:
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role}


def _save_uploaded_documents(namespace: str, documents_to_save: List[dict]) -> List[dict]:
    """Write uploaded files to disk under `namespace` (a job id) and return the
    Document-row-ready metadata (role/filename/storage_path/size_bytes) to
    stash in the job payload — the worker creates the actual Document rows
    once the evaluation they belong to exists.
    """
    saved = []
    for doc in documents_to_save:
        storage_path = save_document(namespace, doc["role"], doc["filename"], doc["content"])
        saved.append({
            "role": doc["role"],
            "filename": doc["filename"] or "file",
            "storage_path": storage_path,
            "size_bytes": len(doc["content"]),
        })
    return saved


def _enqueue_job(db: Session, job_id: uuid.UUID, user_id: uuid.UUID, job_type: str, payload: dict) -> None:
    db.add(Job(id=job_id, user_id=user_id, job_type=job_type, status="queued", payload=payload))
    db.commit()


def _parse_date(value: str, end_of_day: bool = False) -> datetime:
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {value!r}. Use YYYY-MM-DD.")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


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
    requested_role = req.role.lower() if req.role else "evaluator"
    if requested_role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Choose from: {', '.join(_VALID_ROLES)}")
    # ADMIN_EMAILS env var always overrides to admin regardless of chosen role
    role = "admin" if req.email.lower() in _ADMIN_EMAILS else requested_role
    user = User(name=req.name.strip(), email=req.email.lower(), password=hash_password(req.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(str(user.id), user.email)
    return {"token": token, "user": _user_out(user)}


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if not req.email.lower().endswith("@globallogic.com"):
        raise HTTPException(status_code=400, detail="Only @globallogic.com email addresses are allowed.")
    user = db.execute(select(User).where(User.email == req.email.lower())).scalar_one_or_none()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_token(str(user.id), user.email)
    return {"token": token, "user": _user_out(user)}


@app.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


# ---------------------------------------------------------------------------
# Evaluation history endpoints
# ---------------------------------------------------------------------------

@app.get("/api/evaluations")
def list_evaluations(
    q: Optional[str] = None,
    evaluation_type: Optional[str] = None,
    passed: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's evaluation history.

    Optional filters: `q` (substring match on RFP/bid name), `evaluation_type`,
    `passed`, and `date_from`/`date_to` (YYYY-MM-DD, inclusive).
    """
    conditions = [Evaluation.user_id == current_user.id]
    if q:
        like = f"%{q}%"
        conditions.append(or_(Evaluation.rfp_name.ilike(like), Evaluation.bid_name.ilike(like)))
    if evaluation_type:
        conditions.append(Evaluation.evaluation_type == evaluation_type)
    if passed is not None:
        conditions.append(Evaluation.passed == passed)
    if date_from:
        conditions.append(Evaluation.created_at >= _parse_date(date_from))
    if date_to:
        conditions.append(Evaluation.created_at <= _parse_date(date_to, end_of_day=True))

    rows = db.execute(
        select(Evaluation)
        .where(*conditions)
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


@app.get("/api/evaluations/all")
def list_all_evaluations(
    q: Optional[str] = None,
    evaluation_type: Optional[str] = None,
    passed: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_email: Optional[str] = None,
    _admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin-only: view every user's evaluation history, not just your own.

    Supports the same filters as `/api/evaluations` plus `user_email`.
    """
    conditions = []
    if q:
        like = f"%{q}%"
        conditions.append(or_(Evaluation.rfp_name.ilike(like), Evaluation.bid_name.ilike(like)))
    if evaluation_type:
        conditions.append(Evaluation.evaluation_type == evaluation_type)
    if passed is not None:
        conditions.append(Evaluation.passed == passed)
    if date_from:
        conditions.append(Evaluation.created_at >= _parse_date(date_from))
    if date_to:
        conditions.append(Evaluation.created_at <= _parse_date(date_to, end_of_day=True))
    if user_email:
        conditions.append(User.email.ilike(f"%{user_email}%"))

    rows = db.execute(
        select(Evaluation, User)
        .join(User, Evaluation.user_id == User.id)
        .where(*conditions)
        .order_by(Evaluation.created_at.desc())
    ).all()
    return [
        {
            "id": str(r.Evaluation.id),
            "rfp_name": r.Evaluation.rfp_name,
            "bid_name": r.Evaluation.bid_name,
            "evaluation_type": r.Evaluation.evaluation_type,
            "score": r.Evaluation.score,
            "passed": r.Evaluation.passed,
            "timestamp": r.Evaluation.created_at.isoformat(),
            "user_name": r.User.name,
            "user_email": r.User.email,
        }
        for r in rows
    ]


@app.delete("/api/evaluations/{evaluation_id}", status_code=204)
def delete_evaluation(
    evaluation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conditions = [Evaluation.id == uuid.UUID(evaluation_id)]
    if current_user.role != "admin":
        conditions.append(Evaluation.user_id == current_user.id)
    ev = db.execute(select(Evaluation).where(*conditions)).scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found.")
    storage_paths = [d.storage_path for d in ev.documents]
    db.delete(ev)
    db.commit()
    delete_document_dirs(storage_paths)


@app.delete("/api/evaluations", status_code=204)
def clear_all_evaluations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage_paths = db.execute(
        select(Document.storage_path)
        .join(Evaluation, Document.evaluation_id == Evaluation.id)
        .where(Evaluation.user_id == current_user.id)
    ).scalars().all()
    db.execute(delete(Evaluation).where(Evaluation.user_id == current_user.id))
    db.commit()
    delete_document_dirs(storage_paths)


@app.get("/api/evaluations/{evaluation_id}/documents")
def list_evaluation_documents(
    evaluation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the original uploaded files kept for an evaluation."""
    ev_conditions = [Evaluation.id == uuid.UUID(evaluation_id)]
    if current_user.role != "admin":
        ev_conditions.append(Evaluation.user_id == current_user.id)
    ev = db.execute(select(Evaluation).where(*ev_conditions)).scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found.")

    docs = db.execute(
        select(Document).where(Document.evaluation_id == ev.id).order_by(Document.created_at)
    ).scalars().all()
    return [
        {
            "id": str(d.id),
            "role": d.role,
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "timestamp": d.created_at.isoformat(),
        }
        for d in docs
    ]


@app.get("/api/documents/{document_id}/download")
def download_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download the original uploaded file for a previously-run evaluation."""
    doc = db.execute(select(Document).where(Document.id == uuid.UUID(document_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    ev = db.get(Evaluation, doc.evaluation_id)
    if not ev or (current_user.role != "admin" and ev.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        full_path = resolve_document_path(doc.storage_path)
    except ValueError:
        raise HTTPException(status_code=500, detail="Invalid stored file path.")
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Stored file is missing.")
    return FileResponse(full_path, filename=doc.filename, media_type="application/octet-stream")


# ---------------------------------------------------------------------------
# Job status endpoints — the background worker (jobs.py) processes evaluation
# jobs asynchronously; the frontend polls these to learn when a job finishes.
# ---------------------------------------------------------------------------

def _job_out(job: Job) -> dict:
    return {
        "id": str(job.id),
        "job_type": job.job_type,
        "status": job.status,
        "result": job.result if job.status == "completed" else None,
        "evaluation_id": str(job.evaluation_id) if job.evaluation_id else None,
        "error_message": job.error_message if job.status == "failed" else None,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


@app.get("/api/jobs/{job_id}")
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = db.get(Job, uuid.UUID(job_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job_id.")
    if not job or (current_user.role != "admin" and job.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Job not found.")
    return _job_out(job)


@app.get("/api/jobs")
def list_jobs(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's jobs, most recent first (useful for a
    'processing' indicator that survives navigating away from the page that
    started the evaluation).
    """
    conditions = [Job.user_id == current_user.id]
    if status:
        conditions.append(Job.status == status)
    jobs_rows = db.execute(
        select(Job).where(*conditions).order_by(Job.created_at.desc()).limit(50)
    ).scalars().all()
    return [_job_out(j) for j in jobs_rows]


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.post("/api/evaluate", status_code=202)
async def evaluate(
    rfp_files: List[UploadFile] = File(..., description="RFP / Tender documents (first is main RFP; additional files are supporting docs such as scoring sheets)"),
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    readiness_rules_json: Optional[str] = Form(default=None, description="Pre-validated criteria from Bid Readiness tab (JSON)"),
    custom_threshold: Optional[float] = Form(default=None, description="Override pass threshold % extracted from RFP (e.g. 70 means 70%)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validates and enqueues an evaluation job; the LLM pipeline runs in the
    background worker (jobs.py). Poll GET /api/jobs/{job_id} for the result.
    """
    documents_to_save: List[dict] = []

    rfp_parts = []
    for i, rfp_file in enumerate(rfp_files):
        rfp_bytes = await rfp_file.read()
        documents_to_save.append({"role": "rfp" if i == 0 else "rfp_supporting", "filename": rfp_file.filename, "content": rfp_bytes})
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
        documents_to_save.append({"role": "bid", "filename": bid_file.filename, "content": bid_bytes})
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

    job_id = uuid.uuid4()
    payload = {
        "rfp_text": rfp_text,
        "bid_text": combined_bid_text,
        "readiness_rules": readiness_rules.model_dump() if readiness_rules else None,
        "custom_threshold": custom_threshold,
        "rfp_name": rfp_files[0].filename if rfp_files else None,
        "bid_name": bid_files[0].filename if bid_files else None,
        "documents": _save_uploaded_documents(str(job_id), documents_to_save),
    }
    _enqueue_job(db, job_id, current_user.id, "General", payload)
    return {"job_id": str(job_id), "status": "queued"}


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


@app.post("/api/evaluate-custom", status_code=202)
async def evaluate_custom(
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    criteria_json: str = Form(..., description="JSON string of custom evaluation criteria"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        criteria_data = json.loads(criteria_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="criteria_json is not valid JSON")

    documents_to_save: List[dict] = []
    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        documents_to_save.append({"role": "bid", "filename": bid_file.filename, "content": bid_bytes})
        bid_text, bid_err = extract_text(bid_file.filename or f"bid_{i + 1}.pdf", bid_bytes)
        if bid_err:
            raise HTTPException(status_code=400, detail=f"Bid document '{bid_file.filename}' error: {bid_err}")
        header = f"=== BID DOCUMENT {i + 1}: {bid_file.filename} ===" if len(bid_files) > 1 else ""
        bid_parts.append(f"{header}\n{bid_text}".strip())
    combined_bid_text = "\n\n".join(bid_parts)

    rules = _build_rules_from_custom(criteria_data)

    job_id = uuid.uuid4()
    payload = {
        "bid_text": combined_bid_text,
        "rules": rules.model_dump(),
        "bid_name": bid_files[0].filename if bid_files else None,
        "documents": _save_uploaded_documents(str(job_id), documents_to_save),
    }
    _enqueue_job(db, job_id, current_user.id, "Custom", payload)
    return {"job_id": str(job_id), "status": "queued"}


@app.post("/api/evaluate-pqtq", status_code=202)
async def evaluate_pqtq(
    rfp_file: UploadFile = File(..., description="RFP / Tender document"),
    bid_files: List[UploadFile] = File(..., description="Vendor bid / response documents"),
    extra_rfp_files: List[UploadFile] = File(default=[], description="Additional rule/scoring documents (annexures, scoring matrices)"),
    readiness_rules_json: Optional[str] = Form(default=None, description="Pre-validated criteria from Bid Readiness tab (JSON)"),
    custom_threshold: Optional[float] = Form(default=None, description="Override pass threshold % extracted from RFP (e.g. 70 means 70%)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    documents_to_save: List[dict] = []

    rfp_bytes = await rfp_file.read()
    documents_to_save.append({"role": "rfp", "filename": rfp_file.filename, "content": rfp_bytes})
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    # Concatenate additional rule documents with the RFP text so Stage 2
    # can extract criteria from annexures / scoring matrices uploaded separately.
    for i, ef in enumerate(extra_rfp_files):
        ef_bytes = await ef.read()
        documents_to_save.append({"role": "rfp_supporting", "filename": ef.filename, "content": ef_bytes})
        ef_text, ef_err = extract_text(ef.filename or f"extra_rfp_{i+1}.pdf", ef_bytes)
        if not ef_err and ef_text.strip():
            rfp_text += f"\n\n=== ADDITIONAL DOCUMENT: {ef.filename} ===\n{ef_text}"

    bid_parts = []
    for i, bid_file in enumerate(bid_files):
        bid_bytes = await bid_file.read()
        documents_to_save.append({"role": "bid", "filename": bid_file.filename, "content": bid_bytes})
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

    job_id = uuid.uuid4()
    payload = {
        "rfp_text": rfp_text,
        "bid_text": combined_bid_text,
        "readiness_rules": readiness_rules.model_dump() if readiness_rules else None,
        "custom_threshold": custom_threshold,
        "rfp_name": rfp_file.filename or "rfp.pdf",
        "bid_name": bid_files[0].filename if bid_files else "bid.pdf",
        "documents": _save_uploaded_documents(str(job_id), documents_to_save),
    }
    _enqueue_job(db, job_id, current_user.id, "PQTQ", payload)
    return {"job_id": str(job_id), "status": "queued"}


@app.post("/api/bid-readiness", status_code=202)
async def bid_readiness(
    rfp_file: UploadFile = File(..., description="RFP / Tender document"),
    additional_file: Optional[UploadFile] = File(default=None, description="Optional additional document (annexures, scoring matrix, etc.)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract PQ/TQ criteria from RFP as a plain-English self-assessment checklist."""
    documents_to_save: List[dict] = []

    rfp_bytes = await rfp_file.read()
    documents_to_save.append({"role": "rfp", "filename": rfp_file.filename, "content": rfp_bytes})
    rfp_text, rfp_err = extract_text(rfp_file.filename or "rfp.pdf", rfp_bytes)
    if rfp_err:
        raise HTTPException(status_code=400, detail=f"RFP document error: {rfp_err}")

    additional_text = ""
    if additional_file and additional_file.filename:
        add_bytes = await additional_file.read()
        documents_to_save.append({"role": "additional", "filename": additional_file.filename, "content": add_bytes})
        add_text, add_err = extract_text(additional_file.filename, add_bytes)
        if not add_err:
            additional_text = add_text

    job_id = uuid.uuid4()
    payload = {
        "rfp_text": rfp_text,
        "additional_text": additional_text,
        "rfp_name": rfp_file.filename or "rfp.pdf",
        "documents": _save_uploaded_documents(str(job_id), documents_to_save),
    }
    _enqueue_job(db, job_id, current_user.id, "BidReadiness", payload)
    return {"job_id": str(job_id), "status": "queued"}


@app.post("/api/override", response_model=EvaluationReport)
async def apply_override(
    request: OverrideRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply reviewer score overrides and recalculate totals.

    If `evaluation_id` is supplied, the corresponding saved evaluation's score/
    passed/report are updated in place so the override survives a restart.
    """
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

    if request.evaluation_id:
        try:
            ev_id = uuid.UUID(request.evaluation_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid evaluation_id.")
        conditions = [Evaluation.id == ev_id]
        if current_user.role != "admin":
            conditions.append(Evaluation.user_id == current_user.id)
        ev = db.execute(select(Evaluation).where(*conditions)).scalar_one_or_none()
        if not ev:
            raise HTTPException(status_code=404, detail="Evaluation not found.")
        ev.score = report.total_score
        ev.passed = report.passed
        ev.report = report.model_dump()
        db.commit()

    return report


@app.post("/api/export/word")
async def export_word(report: EvaluationReport, _current_user: User = Depends(get_current_user)):
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
