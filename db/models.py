import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="evaluator", server_default="evaluator")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    evaluations: Mapped[list["Evaluation"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rfp_name: Mapped[str | None] = mapped_column(String(500))
    bid_name: Mapped[str | None] = mapped_column(String(500))
    evaluation_type: Mapped[str] = mapped_column(String(50), default="General")
    score: Mapped[float | None] = mapped_column(Float)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    report: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="evaluations")
    documents: Mapped[list["Document"]] = relationship(back_populates="evaluation", cascade="all, delete-orphan")


class Document(Base):
    """A copy of an uploaded RFP/bid file, kept on disk after processing so the
    original submission can be re-downloaded or re-processed later.
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evaluation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # "rfp", "bid", "extra_rfp", "additional"
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)  # path relative to DOCUMENT_STORAGE_DIR
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    evaluation: Mapped["Evaluation"] = relationship(back_populates="documents")


class Job(Base):
    """A queued evaluation request, processed asynchronously by the background
    worker (see jobs.py) so large RFPs don't tie up the HTTP request while the
    LLM pipeline runs.
    """
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "General", "Custom", "PQTQ", "BidReadiness"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)  # queued|running|completed|failed
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)  # inputs the worker needs to run the job
    result: Mapped[dict | None] = mapped_column(JSONB)  # the report/result once completed
    evaluation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="SET NULL"))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
