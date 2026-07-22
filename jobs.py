"""Background worker for evaluation jobs.

Upload endpoints in main.py write a Job row (status="queued") and return
immediately; a background asyncio task polls for queued jobs and runs the LLM
pipeline outside the request/response cycle, so large RFPs don't hold an HTTP
connection open for minutes while the AI responds.
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from db.database import SessionLocal
from db.models import Document, Evaluation, Job
from models import EvaluationRules
import pipeline

logger = logging.getLogger("rfp_evaluator.jobs")

POLL_SECONDS = float(os.getenv("WORKER_POLL_SECONDS", "2"))
CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "2"))

_semaphore = asyncio.Semaphore(CONCURRENCY)
_worker_task: Optional[asyncio.Task] = None
_stopping = False


# ---------------------------------------------------------------------------
# DB access (run off the event loop via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _claim_next_job() -> Optional[str]:
    """Atomically pick the oldest queued job and mark it running."""
    db = SessionLocal()
    try:
        job = db.execute(
            select(Job)
            .where(Job.status == "queued")
            .order_by(Job.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        ).scalar_one_or_none()
        if not job:
            return None
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()
        return str(job.id)
    finally:
        db.close()


def _load_job_payload(job_id: str):
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return None, None
        return job.job_type, job.payload
    finally:
        db.close()


def _finalize_success(
    job_id: str,
    report_dict: dict,
    score: Optional[float],
    passed: Optional[bool],
    rfp_name: Optional[str],
    bid_name: Optional[str],
    evaluation_type: str,
    documents: Optional[list],
) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        ev = Evaluation(
            user_id=job.user_id,
            rfp_name=rfp_name,
            bid_name=bid_name,
            evaluation_type=evaluation_type,
            score=score,
            passed=passed,
        )
        db.add(ev)
        db.flush()  # populates ev.id without ending the transaction

        final_report = {**report_dict, "evaluation_id": str(ev.id)}
        ev.report = final_report

        for doc in (documents or []):
            db.add(Document(
                evaluation_id=ev.id,
                role=doc["role"],
                filename=doc.get("filename") or "file",
                storage_path=doc["storage_path"],
                size_bytes=doc.get("size_bytes", 0),
            ))

        job.status = "completed"
        job.result = final_report
        job.evaluation_id = ev.id
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to finalize job %s", job_id)
        db.close()
        _mark_failed(job_id, "Failed to save the evaluation result.")
        return
    finally:
        db.close()


def _mark_failed(job_id: str, error_message: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        job.status = "failed"
        job.error_message = error_message[:2000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.exception("Failed to mark job %s as failed", job_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pipeline dispatch
# ---------------------------------------------------------------------------

async def _run_pipeline_for_job(job_type: str, payload: dict):
    """Returns (report_dict, score, passed)."""
    if job_type == "General":
        rules = EvaluationRules(**payload["readiness_rules"]) if payload.get("readiness_rules") else None
        report = await pipeline.run_full_evaluation(
            payload["rfp_text"], payload["bid_text"],
            readiness_rules=rules,
            custom_threshold=payload.get("custom_threshold"),
        )
    elif job_type == "Custom":
        rules = EvaluationRules(**payload["rules"])
        report = await pipeline.run_evaluation_with_rules(payload["bid_text"], rules)
    elif job_type == "PQTQ":
        rules = EvaluationRules(**payload["readiness_rules"]) if payload.get("readiness_rules") else None
        report = await pipeline.run_pqtq_evaluation(
            payload["rfp_text"], payload["bid_text"],
            readiness_rules=rules,
            custom_threshold=payload.get("custom_threshold"),
        )
    elif job_type == "BidReadiness":
        result = await pipeline.extract_bid_readiness_checklist(
            payload["rfp_text"], payload.get("additional_text", "")
        )
        return result.model_dump(), result.total_tq_score, None
    else:
        raise ValueError(f"Unknown job_type: {job_type}")

    return report.model_dump(), report.total_score, report.passed


def _error_message(job_type: str, exc: Exception) -> str:
    """Mirrors the user-facing error text the synchronous endpoints used to
    return directly as an HTTPException, so the frontend's existing
    NO_RULES_FOUND / rate-limit handling keeps working unchanged.
    """
    if isinstance(exc, ValueError) and str(exc) == "NO_RULES_FOUND":
        if job_type == "PQTQ":
            return (
                "NO_RULES_FOUND: No Pre-Qualification or Technical Qualification scoring "
                "criteria with explicit numeric marks were found in this RFP."
            )
        return (
            "NO_RULES_FOUND: The RFP document does not contain any explicit "
            "scoring rules or evaluation criteria. Please upload an RFP that "
            "includes a scoring matrix or weighted criteria table."
        )
    if isinstance(exc, RuntimeError):
        msg = str(exc)
        if "rate-limited" in msg or "All Ollama" in msg:
            return "The AI service is temporarily unavailable due to rate limits. Please wait 1–2 minutes and try again."
        return f"Evaluation failed: {msg}"
    return f"Evaluation failed: {exc}"


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

async def _process_job(job_id: str) -> None:
    job_type, payload = await asyncio.to_thread(_load_job_payload, job_id)
    if job_type is None:
        return

    print(f"\n===== [{datetime.now(timezone.utc).isoformat()}] START job {job_id} ({job_type}) =====")

    try:
        report_dict, score, passed = await _run_pipeline_for_job(job_type, payload)
    except Exception as exc:
        logger.exception("Job %s (%s) failed", job_id, job_type)
        await asyncio.to_thread(_mark_failed, job_id, _error_message(job_type, exc))
        print(f"===== [{datetime.now(timezone.utc).isoformat()}] FAILED job {job_id} ({job_type}) =====\n")
        return

    await asyncio.to_thread(
        _finalize_success,
        job_id, report_dict, score, passed,
        payload.get("rfp_name"), payload.get("bid_name"),
        job_type, payload.get("documents"),
    )
    print(f"===== [{datetime.now(timezone.utc).isoformat()}] SUCCESS job {job_id} ({job_type}) =====\n")


async def _run_and_release(job_id: str) -> None:
    try:
        await _process_job(job_id)
    finally:
        _semaphore.release()


async def _worker_loop() -> None:
    while not _stopping:
        await _semaphore.acquire()
        if _stopping:
            _semaphore.release()
            return
        job_id = await asyncio.to_thread(_claim_next_job)
        if job_id is None:
            _semaphore.release()
            await asyncio.sleep(POLL_SECONDS)
            continue
        asyncio.create_task(_run_and_release(job_id))


async def start_worker() -> None:
    global _worker_task, _stopping
    _stopping = False
    _worker_task = asyncio.create_task(_worker_loop())


async def stop_worker() -> None:
    global _stopping
    _stopping = True
    if _worker_task:
        _worker_task.cancel()
