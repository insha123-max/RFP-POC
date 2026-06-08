# BidEval AI — Complete Project Explanation

---

## What Problem Does This Solve?

When a government or large company wants to buy a product or service, they publish an **RFP (Request for Proposal)** — a document that says "here is what we need, here are our requirements, and here is how we will score your response."

Vendors then submit a **Bid** — a document that says "here is what we offer and why you should pick us."

A procurement committee then has to **manually read both documents**, check every requirement, assign scores, and decide PASS or FAIL. This process:
- Takes **2–3 days** of committee time per bid
- Is **subjective** — different evaluators score differently
- Is **error-prone** — requirements get missed
- Becomes a **bottleneck** when multiple bids come in

**BidEval AI solves this.** Upload both documents, and the system evaluates the bid in **30–90 seconds** — automatically, consistently, and with full traceability.

---

## What the System Does (Simple Version)

1. You upload the **RFP** and the **Vendor Bid** (PDF or Word format)
2. The AI **reads the RFP** and extracts all the scoring rules, weights, and thresholds
3. The AI **reads the Bid** and checks it against every rule
4. The system **calculates a score** and delivers a detailed PASS / FAIL report
5. You can **export a Word report** to share with stakeholders

---

## Tech Stack — What Technologies Are Used

### Backend (Server Side)


| Technology | What It Is | Why We Use It |
|---|---|---|
| **Python** | Programming language | Clean, readable, great for AI integrations |
| **FastAPI** | Web framework | Handles API requests; fast and modern |
| **Groq API** | AI service | Runs the LLaMA language models in the cloud |
| **LLaMA 3.1 8B** | AI model (primary) | Faster, higher daily quota (500K tokens/day) |
| **LLaMA 3.3 70B** | AI model (fallback) | More accurate, used when primary hits limits |
| **pdfplumber** | PDF reader library | Extracts text from PDF documents page by page |
| **python-docx** | Word reader library | Extracts text and tables from .docx/.doc files |
| **Pydantic v2** | Data validation library | Ensures all data structures are correct and typed |
| **python-dotenv** | Config library | Loads secret keys (like the Groq API key) from `.env` |
| **Uvicorn** | Web server | Runs the FastAPI application |

### Frontend (Browser Side)

| Technology | What It Is | Why We Use It |
|---|---|---|
| **React 18** | UI framework | Builds the interactive web interface |
| **React Router v6** | Navigation library | Handles page routing (Dashboard, Evaluate, etc.) |
| **Vite** | Build tool | Fast development server and production bundler |

### How Frontend and Backend Connect

The React frontend is built into static files and served directly by the FastAPI backend. There is **one unified server** — no separate hosting needed. The frontend talks to the backend through REST API calls (e.g. `POST /api/evaluate`).

---

## Project File Structure

```
RFP-POC/
│
├── main.py              ← FastAPI server, API routes (/evaluate, /export, etc.)
├── pipeline.py          ← The 7-stage AI evaluation engine (core logic)
├── document.py          ← Reads PDF and Word files, extracts text
├── models.py            ← Data structures (EvaluationReport, CategoryResult, etc.)
├── export.py            ← Generates the downloadable Word report
├── requirements.txt     ← Python dependencies list
├── .env                 ← Secret keys (Groq API key) — not committed to git
│
├── bids/                ← Sample RFP and bid documents for testing
│   ├── RFP_NIC_DMS_2024.docx
│   ├── VendorA_InfoSurge_Passing_Bid.docx
│   └── VendorB_QuickDocs_Failing_Bid.docx
│
├── react-frontend/      ← React web application source code
│   ├── src/
│   │   ├── main.jsx              ← App entry point
│   │   ├── App.jsx               ← Root component with routing
│   │   ├── api.js                ← API calls to the backend
│   │   ├── vendors.js            ← Centralized vendor imports
│   │   ├── context/
│   │   │   └── EvaluationContext.jsx  ← Global state (current report, history)
│   │   ├── components/
│   │   │   └── Sidebar.jsx       ← Navigation sidebar
│   │   └── pages/
│   │       ├── DashboardPage.jsx        ← Overview and stats
│   │       ├── EvaluatePage.jsx         ← Upload files and run evaluation
│   │       ├── ActiveEvaluationPage.jsx ← View current evaluation results
│   │       ├── VendorAnalysisPage.jsx   ← Charts and analytics
│   │       ├── ExecutiveReportPage.jsx  ← Export report
│   │       └── AnalyticsPage.jsx        ← Historical evaluation data
│   └── package.json
│
└── frontend-react-dist/ ← Built/compiled React app (served by FastAPI)
```

---

## The 7-Stage AI Pipeline — Explained Simply

Think of the pipeline as an **assembly line**. Each stage does one job and passes the result to the next. Here is what happens after you click "Run Evaluation":

---

### Stage 1 — Document Ingestion

**What it does:** Reads the uploaded files and converts them to plain text.

**How it works:**
- For **PDF files** — uses `pdfplumber` to read each page and extract the text
- For **Word files (.docx/.doc)** — uses `python-docx` to read paragraphs and tables
- Tables are extracted row-by-row with cells joined by `|` separators
- If a PDF appears to be a scanned image (no extractable text), an error is returned

**Example input:** `RFP_NIC_DMS_2024.docx`
**Example output:** A plain text string of ~5,000–50,000 characters

---

### Stage 2 — Criteria Extraction (AI reads the RFP)

**What it does:** The AI reads the RFP and figures out the scoring rules.

**How it works:**
1. A **keyword relevance extractor** scans the RFP text and finds paragraphs most likely to contain scoring rules (looks for words like "marks", "criteria", "weight", "threshold", "minimum", etc.)
2. For large documents, it also uses **anchor patterns** (specific regex patterns) to jump directly to the evaluation/scoring section — skipping pages of boilerplate
3. The relevant section (up to 15,000 characters) is sent to the LLM with a prompt asking it to extract the scoring structure as JSON

**What the AI extracts:**
```
Scoring Categories:
  - Functional Capability & Live Demo → 25% weight, 25 max marks
  - Commercial Bid                    → 20% weight, 20 max marks
  - Past Experience & Reference Clients → 15% weight, 15 max marks

Pass Threshold: 70% overall
Category Minimums: every category must score ≥ 70% individually

Mandatory Disqualifiers:
  - Valid ISO 27001 certification required
  - Minimum 5 years enterprise DMS experience
  - At least 3 BFSI reference clients
```

**Fallback:** If no scoring rules are found in the RFP, the system creates a generic structure (Technical Bid 70% + Commercial Bid 30%) so evaluation never crashes.

---

### Stage 3 — Bid Evaluation (AI reads the Bid)

**What it does:** For each scoring category, the AI reads the vendor's bid and decides how well it meets the criteria.

**How it works:**
- The pipeline loops through each scoring category one at a time
- For each category, the **keyword extractor** scans the bid and picks the most relevant ~4,000 characters (matching keywords from the criterion names)
- Those relevant sections, plus the list of criteria, are sent to the LLM
- The LLM returns a JSON array with a verdict for each criterion

**Three types of scoring instructions are given to the AI:**

| Situation | Instruction Given |
|---|---|
| **Tiered criteria** (most common) | "Read the vendor's actual numbers and award marks based on the correct tier — e.g. 3+ BFSI clients = 10 marks, 2 clients = 6 marks, 1 client = 3 marks" |
| **Future event criteria** (e.g. Live Demo) | "Evaluate based on the vendor's plan and capability evidence — don't penalize because the demo hasn't happened yet" |
| **Generic categories** (no sub-criteria in RFP) | "Award Met if the bid clearly addresses this category, Partial if partially, Not Met only if completely absent" |

**Example LLM output for one criterion:**
```json
{
  "criterion": "3 BFSI Reference Clients",
  "marks_awarded": 10,
  "compliance_status": "Met",
  "vendor_claim": "HDFC Life, PNB MetLife, SBI General Insurance",
  "justification": "Vendor lists 3 active BFSI clients with reference letters",
  "confidence": "High"
}
```

---

### Stage 4 — Score Calculation (No AI — Pure Math)

**What it does:** Takes the LLM's verdicts and calculates the final numbers deterministically.

**The rules:**
- `Not Met` → **0 marks** always
- `Met` → **full marks** for that criterion
- `Partial` → **50% of max marks**
- If the LLM already assigned a specific tiered mark (e.g. 6 out of 10) — that value is used directly
- Marks are **capped at the category maximum** to prevent double-counting
- Each category's percentage = `(marks awarded / max marks) × 100`
- Each category's weighted contribution = `(marks awarded / max marks) × weight %`
- Total score = sum of all weighted contributions

**Category minimum check:** If a category scores below its minimum (default: same as overall threshold), `passed = False` for that category — regardless of how well other categories scored.

---

### Stage 4b — Mandatory Disqualifier Check (AI)

**What it does:** Separately checks hard eligibility requirements that cause automatic disqualification if not met.

**How it works:**
- The disqualifier conditions extracted in Stage 2 (e.g. "Valid ISO 27001 certification") are checked one by one
- The bid is scanned for evidence using keyword extraction
- The LLM checks each condition: `met: true` or `met: false`
- **Default bias is toward `true`** — the LLM is instructed to only flag `false` on clear non-compliance, not on ambiguity

**Why separate from scoring?** Disqualifiers are binary — the vendor either has ISO 27001 or they don't. A 92% score means nothing if a mandatory requirement is missing. This stage runs independently to enforce that rule.

---

### Stage 5 — Gap Analysis (AI)

**What it does:** Identifies the top risks and weaknesses in the vendor's bid.

**How it works:**
- All criterion evaluation results (scores, verdicts, vendor claims) are summarized and sent to the LLM
- The LLM returns up to 7 risk items, each with:
  - A short label (e.g. "No Past Experience Evidence")
  - Severity: High / Medium / Low
  - A 1–2 sentence description of the gap or risk

This section helps the procurement officer understand *why* a vendor failed or what to watch out for even if they passed.

---

### Stage 6 — Executive Summary (AI)

**What it does:** Writes a plain-language 2–3 sentence summary of the entire evaluation.

**How it works:**
- The final score, PASS/FAIL result, and per-category breakdown are sent to the LLM
- The LLM writes a summary covering the overall result, the vendor's key strengths, and key weaknesses
- Written in non-technical language suitable for senior stakeholders

**Example output:**
> *"The evaluation resulted in a PASS, with a total score of 87%. The vendor demonstrated strong functional capability and competitive pricing. Minor gaps were noted in the past experience section, but all mandatory thresholds were met."*

---

## How the PASS / FAIL Decision Works

The final verdict requires **all three gates** to pass simultaneously:

```
                    ┌─────────────────────────────┐
                    │   PASS requires ALL THREE:  │
                    └─────────────────────────────┘

Gate 1: Overall Score ≥ 70%
  e.g. weighted total = 72% → ✓ Pass

Gate 2: Every category ≥ 70% individually
  e.g. Functional: 80% ✓  Commercial: 75% ✓  Experience: 65% ✗ → FAIL
  (Even if overall is 72%, one weak category fails the whole bid)

Gate 3: No mandatory disqualifiers failed
  e.g. ISO 27001 not found → Automatic disqualification regardless of score
```

This mirrors how real procurement committees work — a vendor cannot "average out" a critical weakness.

---

## Token Rate Limit Management

The AI models have usage limits:

| Model | Tokens Per Minute | Tokens Per Day |
|---|---|---|
| LLaMA 3.1 8B (primary) | 6,000 | 500,000 |
| LLaMA 3.3 70B (fallback) | 12,000 | 100,000 |

At roughly 1.5 tokens per character, a 4,000-character bid extract ≈ 6,000 tokens. The pipeline:
- Limits each bid extract to **4,000 characters** per LLM call
- Uses the **keyword extractor** to pick the most relevant 4,000 chars (not just the first 4,000)
- **Automatically falls back** from the primary model to the 70B model if a rate limit is hit
- If both models are rate-limited, the pipeline retries after a short wait

---

## The Web Application — Pages Explained

### Dashboard
Overview of all past evaluations — total evaluations run, average scores, pass/fail ratio, recent activity.

### New Evaluation
Upload zone for the RFP and Bid documents. Shows a 6-step animated progress indicator while the pipeline runs. Navigates automatically to results when done.

### Active Evaluation
Displays the full result of the most recent evaluation:
- PASS / FAIL verdict with overall score
- Per-category score breakdown with visual progress bars
- Pass Criteria section showing which gates passed/failed and by how much
- Mandatory requirements compliance status
- Risk items identified by the gap analysis
- AI executive summary

### Vendor Analysis
Charts showing score distribution across categories for visual comparison.

### Executive Report
Clean printable view of the evaluation with a one-click "Generate Report" button that downloads a formatted Word (.docx) file.

### Analytics
Historical data showing trends across all evaluations stored in the session.

---

## Sample Documents Included

| File | Description |
|---|---|
| `RFP_NIC_DMS_2024.docx` | RFP from National Insurance Corporation for a Document Management System |
| `VendorA_InfoSurge_Passing_Bid.docx` | A bid designed to pass — strong across all categories |
| `VendorB_QuickDocs_Failing_Bid.docx` | A bid designed to fail — weak in key areas |
| `PNB_Vendor_PASS.docx` / `PNB_Vendor_FAIL.docx` | Additional test bids for a PNB RFP |

---

## End-to-End Flow Summary

```
User uploads RFP + Bid
        │
        ▼
FastAPI receives files → extracts text (Stage 1)
        │
        ▼
AI reads RFP → extracts scoring rules (Stage 2)
        │
        ▼
AI reads Bid → evaluates each criterion (Stage 3)
        │
        ▼
Math engine calculates scores + checks minimums (Stage 4)
        │
        ▼
AI checks mandatory disqualifiers (Stage 4b)
        │
        ▼
AI identifies top risks and gaps (Stage 5)
        │
        ▼
AI writes executive summary (Stage 6)
        │
        ▼
FastAPI returns full EvaluationReport as JSON
        │
        ▼
React frontend renders results → user sees PASS/FAIL
        │
        ▼
User exports Word report → shares with committee
```

---

*Document generated for BidEval AI — RFP-POC project.*
