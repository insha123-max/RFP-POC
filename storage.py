"""On-disk storage for uploaded RFP/bid documents.

Files are kept after processing (under STORAGE_ROOT/<namespace>/) so the
original submission can be re-downloaded or re-processed later, instead of
being discarded once text extraction finishes. `namespace` is typically a job
id at upload time (files are saved before the job runs) and later referenced
by the Document rows created once the job's evaluation exists.
"""

import os
import re
import shutil
import uuid

STORAGE_ROOT = os.path.abspath(
    os.getenv("DOCUMENT_STORAGE_DIR", os.path.join(os.path.dirname(__file__), "storage", "documents"))
)


def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "file")
    name = re.sub(r"[^A-Za-z0-9_.\-]", "_", name)
    return name or "file"


def save_document(namespace: str, role: str, filename: str, content: bytes) -> str:
    """Write an uploaded file to disk and return its path relative to STORAGE_ROOT."""
    dir_path = os.path.join(STORAGE_ROOT, str(namespace))
    os.makedirs(dir_path, exist_ok=True)
    stored_name = f"{role}_{uuid.uuid4().hex[:8]}_{_safe_filename(filename)}"
    full_path = os.path.join(dir_path, stored_name)
    with open(full_path, "wb") as f:
        f.write(content)
    return os.path.relpath(full_path, STORAGE_ROOT)


def delete_namespace_files(namespace: str) -> None:
    """Remove all files stored under a namespace (a job id)."""
    shutil.rmtree(os.path.join(STORAGE_ROOT, str(namespace)), ignore_errors=True)


def delete_document_dirs(storage_paths) -> None:
    """Remove the on-disk directories containing the given stored document
    paths (each path is `<job_id>/<file>` relative to STORAGE_ROOT) — used
    when deleting evaluations, since documents are namespaced by the job that
    produced them, not by the evaluation id itself.
    """
    dirs = {os.path.dirname(p) for p in storage_paths if p}
    for d in dirs:
        if not d:
            continue
        full_dir = os.path.abspath(os.path.join(STORAGE_ROOT, d))
        if os.path.commonpath([full_dir, STORAGE_ROOT]) == STORAGE_ROOT:
            shutil.rmtree(full_dir, ignore_errors=True)


def resolve_document_path(storage_path: str) -> str:
    """Resolve a stored relative path to an absolute path, rejecting any path
    that would escape STORAGE_ROOT (defense in depth against a corrupted path).
    """
    full_path = os.path.abspath(os.path.join(STORAGE_ROOT, storage_path))
    if os.path.commonpath([full_path, STORAGE_ROOT]) != STORAGE_ROOT:
        raise ValueError("Invalid storage path")
    return full_path
