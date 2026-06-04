import io
from typing import Tuple

import pdfplumber
from docx import Document


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pages = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append(f"[Page {i + 1}]\n{text.strip()}")
    return "\n\n".join(pages)


def extract_text_from_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    parts = []

    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text.strip())

    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))

    return "\n".join(parts)


def extract_text(filename: str, file_bytes: bytes) -> Tuple[str, str]:
    """Return (text, error_message). If error_message is non-empty, text is empty."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        try:
            text = extract_text_from_pdf(file_bytes)
            if not text.strip():
                return (
                    "",
                    "This appears to be a scanned/image-only PDF. "
                    "Please upload a text-readable version or apply OCR first.",
                )
            return text, ""
        except Exception as exc:
            return "", f"Failed to read PDF: {exc}"

    if ext in ("doc", "docx"):
        try:
            text = extract_text_from_docx(file_bytes)
            if not text.strip():
                return "", "The Word document appears to be empty."
            return text, ""
        except Exception as exc:
            return "", f"Failed to read Word document: {exc}"

    return (
        "",
        f"Unsupported file format '.{ext}'. Please upload a PDF, DOC, or DOCX file.",
    )
