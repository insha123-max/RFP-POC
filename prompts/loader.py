"""Loads and renders LLM prompt templates from the .md files in this folder.

Keeping prompt text in .md files (instead of embedded in pipeline.py) lets
prompts be reviewed/edited without touching Python code. Each template is a
Jinja2 file — {{ variable }} for interpolation, {% if %}/{% set %} for the
branching instruction blocks (e.g. scoring_prompt.md).
"""

import hashlib
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

_PROMPTS_DIR = Path(__file__).parent

_env = Environment(
    loader=FileSystemLoader(_PROMPTS_DIR),
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)

# Prompt names expected to exist — checked at startup so a missing/renamed
# file fails loudly at boot instead of surfacing mid-evaluation.
REQUIRED_PROMPTS = [
    "criteria_prompt",
    "pq_criteria_prompt",
    "pqtq_criteria_prompt",
    "scoring_prompt",
    "pq_scoring_prompt",
    "risk_prompt",
    "summary_prompt",
    "qa_prompt",
]


def _compute_prompt_version() -> str:
    """Fingerprint every .md file's content so PROMPT_VERSION changes automatically
    whenever a prompt is edited — no manual version bumping to forget.
    """
    digest = hashlib.sha256()
    for path in sorted(_PROMPTS_DIR.glob("*.md")):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


# Short content hash of every prompt file, recomputed at process start. Stored
# alongside each evaluation result so a past report can be traced back to the
# exact prompt wording that produced it — flip any .md file and this changes.
PROMPT_VERSION = _compute_prompt_version()


def render_prompt(name: str, **context) -> str:
    """Render `prompts/<name>.md` with the given context variables."""
    return _env.get_template(f"{name}.md").render(**context).rstrip("\n")


def validate_prompts() -> None:
    """Ensure every required prompt template exists and is parseable. Raises on failure."""
    for name in REQUIRED_PROMPTS:
        _env.get_template(f"{name}.md")
