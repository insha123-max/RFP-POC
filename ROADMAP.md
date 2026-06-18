# BidEval AI — Product Roadmap

> **The Problem**
> Traditional RFP (Request for Proposal) evaluation is a manual, paper-heavy process. A procurement team typically spends **2–3 working days** reading through hundreds of pages, cross-checking vendor bids against eligibility criteria, scoring technical sections, and compiling a final report — all prone to human error, inconsistency, and fatigue.
>
> **BidEval AI cuts that to 30–90 seconds.**
> The AI reads the RFP, extracts every scoring rule, evaluates the vendor bid against each criterion, flags risks, and generates a full report — in the time it takes to make a cup of tea.

---

## How the 30–90 Second Pipeline Works

| Stage | What happens | Time |
|---|---|---|
| **1. Document ingestion** | RFP and vendor bid are parsed, chunked, and fed to the LLM | ~5s |
| **2. Rule extraction** | AI extracts all scoring categories, weights, and thresholds | ~10s |
| **3. PQ check** | Mandatory eligibility criteria verified against vendor evidence | ~10s |
| **4. TQ scoring** | Each technical category scored with justification | ~25s |
| **5. Gap analysis** | Unmet requirements identified with specific evidence gaps | ~10s |
| **6. Risk assessment** | Compliance, financial, delivery, and security risks flagged | ~10s |
| **7. Report generation** | Executive summary, PASS/FAIL verdict, full breakdown compiled | ~5s |

**Traditional manual equivalent: 2–3 working days (16–24 person-hours)**

---

## User Stories & Features

---

### 1. Dashboard
> *As a procurement officer, I want a single view of all my evaluations so I can track bid outcomes at a glance.*

- **KPI strip** — Total evaluations, average score, pass rate, high-risk items; all with animated count-up numbers
- **Recent evaluations list** — Each card shows RFP name, vendor, score %, pass/fail badge, evaluation type (General / PQTQ), and timestamp
- **Quick actions** — View full results or open the PDF report directly from the card
- **Delete with confirmation** — Two-step delete to prevent accidental removal
- **Activity chart** — Monthly bar chart of evaluation volume over the last 6 months
- **PQTQ self-assessments section** — Separate list of bid readiness checks (distinct from AI evaluations)
- **Empty state** — Guided call-to-action when no evaluations exist yet

---

### 2. New Evaluation
> *As a procurement officer, I want to upload an RFP and vendor bid and let AI score it, so I don't have to read 200 pages manually.*

- **RFP upload** — Drag-and-drop or click-to-browse; PDF, DOC, DOCX, PPTX supported
- **Vendor bid upload** — Supports multiple bid documents for a single evaluation
- **Optional pre-bid Q&A** — Attach clarification documents that refine the scoring context
- **Custom scoring criteria** — Add your own categories and questions beyond what the RFP specifies
- **Live progress tracker** — 7-stage pipeline with real-time step indicators (Extracting Rules → Scoring → Risk Assessment…)
- **30–90 second turnaround** — Powered by Groq LLaMA with a model waterfall for maximum reliability

---

### 3. Active Evaluation (Results Viewer)
> *As a procurement officer, I want to see the full scored breakdown of a vendor bid so I can justify the pass/fail decision.*

- **AI assessment banner** — Plain-English overall summary with score, category count, and risk count
- **Overall score display** — Large percentage with PASS / FAIL verdict
- **Category Breakdown** — Eligibility criteria with Met/Not Met status and evidence summary
- **Disqualifier checks** — Mandatory criteria that auto-fail a bid if unmet, highlighted prominently
- **Score override** — Manually adjust any category score with a justification note
- **Generate Report button** — One click to build the full PDF executive report
- **Empty + orphan state** — Graceful handling when no evaluation is loaded or history was cleared

---

### 4. PQTQ — Bid Readiness Checker
> *As a bidder, I want to upload an RFP and instantly know whether my company qualifies and how competitive our TQ score would be, before investing time in a full bid.*

- **RFP upload + optional additional document** — Corrigendum, annexure, scoring matrix
- **AI extracts PQ criteria** — Every mandatory eligibility condition in plain English (turnover, experience, certifications, EMD, registration)
- **AI extracts TQ criteria** — All technical scoring items grouped by evaluation category
- **Self-assessment checklist** — Checkboxes for each criterion; user marks what their company can fulfil
- **Check All / Uncheck All** — Per section (PQ) and per category (TQ) for fast bulk selection
- **Collapsible TQ categories** — Each category can be expanded/collapsed independently; partial progress badge shown
- **Live summary strip** — PQ eligibility progress bar + TQ criteria count update as you check items
- **Calculate Readiness Score** — On-demand score card showing PQ %, TQ %, and Overall % (weighted 30/70)
- **Go / No-Go recommendation** — Colour-coded verdict with actionable advice
- **Unchecked criteria list** — Tags showing which criteria are still unconfirmed
- **Saved to dashboard** — Completed assessments appear in the PQTQ Checks section of Dashboard

---

### 5. Vendor Analysis
> *As a procurement manager, I want a visual breakdown of a vendor's strengths and weaknesses so I can make a defensible selection decision.*

- **Radar / spider chart** — Visual coverage map across all evaluation categories
- **Bar chart** — Criteria count per category
- **Score summary tiles** — Overall score, total marks, met criteria count, gaps found
- **Score breakdown table** — Per-category scores with progress bars and weights
- **Requirement coverage** — Met vs Not Met count with visual ring chart
- **Strengths panel** — AI-identified areas where the vendor excels with evidence
- **Weaknesses panel** — Specific gaps and unmet requirements
- **Supporting evidence** — Verbatim excerpts from the bid document justifying each score
- **Risk assessment** — Compliance, financial, delivery, and security risks with severity ratings

---

### 6. Executive Report
> *As a procurement director, I want a formal PDF report I can send to stakeholders without having to write it myself.*

- **One-click generation** — Pulls all evaluation data and formats into a professional document
- **Executive summary** — AI-written plain-English overview of the evaluation outcome
- **Full scoring breakdown** — All categories, scores, weights, and justifications
- **Risk register** — Flagged risks with severity and recommended mitigations
- **PASS / FAIL recommendation** — Clear verdict with supporting rationale
- **Printable layout** — Clean formatting suitable for board presentations and audit trails

---

### 7. Analytics
> *As a procurement team lead, I want aggregated statistics across all evaluations to spot patterns and improve our vendor selection process.*

- **Summary KPIs** — Total evaluations, average score, pass rate %, high-risk item count
- **Monthly volume chart** — Bar chart of evaluation activity over the last 6 months
- **Pass vs Fail donut** — Visual split with counts
- **Evaluation history table** — All evaluations with score, type, verdict, and date; sortable
- **Empty state** — Prompted to run the first evaluation when no data exists

---


## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + React Router, plain CSS (DM Sans font, muted indigo palette) |
| Backend | FastAPI (Python), async pipeline |
| AI Inference | Groq API — LLaMA 3.3 70B (primary) with LLaMA 4 / Qwen fallbacks |
| Storage | Browser localStorage (evaluation history, PQTQ checks) |
| Document parsing | Python-docx, PyPDF2 for text extraction |
| Deployment | Local dev (Vite + Uvicorn); production-ready for containerisation |

---

## Status Summary

| Feature | Status |
|---|---|
| Dashboard | ✅ Live |
| New Evaluation (General) | ✅ Live |
| New Evaluation (PQTQ pipeline) | ✅ Live |
| Active Evaluation results viewer | ✅ Live |
| PQTQ Bid Readiness Checker | ✅ Live |
| Vendor Analysis | ✅ Live |
| Executive Report | ✅ Live |
| Analytics | ✅ Live |
| Search & Notifications | ✅ Live |
| Multi-vendor comparison | 🔜 Planned |
| User authentication & teams | 🔜 Planned |
| Cloud storage for documents | 🔜 Planned |
| Export to Excel / CSV | 🔜 Planned |
