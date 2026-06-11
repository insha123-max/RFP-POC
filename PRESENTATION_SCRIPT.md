# BidEval AI — Presentation Script

Slide-by-slide speaking notes. Use the **Short Version** for a quick 5-minute pitch. Use the **Long Version** for a detailed 15-minute walkthrough.

---

## Slide 1 — Title

### Short
*"This is BidEval AI — a platform that automates vendor bid evaluation. You upload two documents, the AI reads them, and gives you a complete PASS or FAIL result in under 90 seconds. Let me walk you through it."*

### Long
*"Good [morning/afternoon]. Today I'm going to walk you through a platform I've built called BidEval AI. In simple terms — it's a system that automates the evaluation of vendor bids against government or enterprise RFP documents. Instead of a committee spending days on manual review, this platform does it in under 90 seconds using AI. Let me start with the problem it solves."*

---

## Slide 2 — The Problem

### Short
*"When an organization publishes an RFP, someone has to manually read every vendor's bid and score it. This takes 2 to 3 days per vendor, it's inconsistent, and requirements often get missed. BidEval AI solves exactly this."*

### Long
*"So whenever a government bank or a large organization wants to procure a product or service, they publish an RFP — a Request for Proposal. Vendors respond with their bids. Now someone has to sit down and manually read both documents — check every requirement, assign marks, and decide who passes. This process has 4 big problems. First — it takes 2 to 3 days per vendor. If you have 10 vendors, that's potentially 30 days of committee time. Second — it's subjective. Two people evaluating the same bid will score it differently. Third — requirements get missed. Criteria are skipped. Mistakes happen. Fourth — when multiple bids come in together, the committee is completely overwhelmed. This is a very real problem in government procurement — and that's exactly what this platform is built to fix."*

---

## Slide 3 — The Solution

### Short
*"The process is three steps. Upload the RFP and the vendor bid. The AI extracts the scoring rules and evaluates every criterion. You get a full report in 90 seconds — no manual reading, no missed criteria."*

### Long
*"The solution is simple. Step one — you upload two documents. The RFP, and the vendor's bid. Step two — the AI reads both. It automatically extracts all the scoring rules from the RFP, then checks the vendor's bid against every single criterion. Step three — you get a complete report. It tells you the score, whether the vendor passed or failed, where they were strong, and where they fell short. The whole process takes 30 to 90 seconds. No manual reading. No missed criteria. No inconsistency — every bid is evaluated the same way."*

---

## Slide 4 — Upload Page

### Short
*"This is the upload screen. You upload the RFP on the left and the vendor bid on the right — PDF or Word, both work. Hit Run Evaluation and the system starts automatically. You'll see a progress indicator as each stage completes."*

### Long
*"This is the first screen you see when you open the platform — the Upload page. You have two upload zones. On the left, you upload the RFP — the document that contains the scoring rules and requirements. On the right, you upload the vendor's bid — their response document. The system accepts PDF and Word files — both formats work without any conversion. Once both files are uploaded, you click Run Evaluation. You'll then see a step-by-step animated progress screen showing each stage of the evaluation as it happens — document reading, rule extraction, scoring, risk analysis, and summary. The result is ready in under 90 seconds."*

---

## Slide 5 — Active Evaluation Results

### Short
*"This is the result screen. You see PASS or FAIL, the overall score, and a breakdown across each category. Every category must individually score above 70% — not just the total. There's also an AI-written summary in plain language."*

### Long
*"This is what you see after the evaluation is complete. At the top, you get the main verdict — in this case, PASSED with a score of 96%. Below that, you see the score broken down by category. For the PNB GenAI RFP, there are three categories — Category A for GenAI delivery capability, Category B for cloud service provider capabilities, and Category C for technical presentation and live demo. Each category shows its individual score. The system requires every category to score at least 70% — not just the overall total. If any one category falls below 70%, the vendor fails — even if the overall score is high. There's also an AI-written executive summary — a 2 to 3 sentence plain-language explanation of the result, written for stakeholders who don't want to read the full report."*

---

## Slide 6 — Requirements Assessment

### Short
*"Scrolling down, you get a detailed table of every single criterion — what was evaluated, the score, and whether it was Met, Partial, or Not Met. Each row also shows a short justification so you can see exactly why the AI gave that score."*

### Long
*"Scrolling down on the same results page, you get the detailed Requirements Assessment table. This is where you can see exactly how every single sub-criterion was evaluated. For the PNB RFP, there are 9 criteria across those 3 categories. Each row shows the criterion name, which category it belongs to, a confidence label — Critical or Low — the status — Met, Partial, or Not Met — and the exact marks awarded. For example — Sub-Criterion 1.a for GenAI experience was scored 20 out of 20, status Met, confidence Critical. Sub-Criterion 2.b for cloud certifications was scored 3 out of 5 because the vendor met a lower tier. This full transparency means the committee can see exactly what the AI found and why it gave each score — there's no black box."*

---

## Slide 7 — Vendor Analysis

### Short
*"The Vendor Analysis page gives a visual picture. The radar chart shows how balanced the vendor's scores are across categories. Below that you see their Strengths — what they did well — and Weaknesses — where they fell short, with evidence from their own bid."*

### Long
*"The Vendor Analysis page gives you a visual summary of the same evaluation. On the left, there's a radar chart — a triangle shape that shows how the vendor performed across all three categories. A strong, balanced vendor forms a large triangle. A weak vendor has a small, skewed shape. On the right, the bar chart shows requirement coverage — how many criteria were fully covered, partially addressed, or completely missing. Below that, you see two columns — Strengths and Weaknesses. Strengths shows which criteria the vendor clearly satisfied, with a one-line summary of what evidence was found in their bid. Weaknesses shows where the vendor fell short — again with evidence so the committee understands the specific gap. This page is useful for a quick visual comparison — especially when evaluating multiple vendors side by side."*

---

## Slide 8 — Risk Assessment

### Short
*"The AI also flags up to 7 risks found in the bid — each with a severity label: High, Medium, or Low. For example — no production experience, non-approved cloud provider, or a banned demo format. This helps the committee know what to question."*

### Long
*"Still on the Vendor Analysis page, below the strengths and weaknesses, is the Risk Assessment section. After evaluating the bid, the AI identifies up to 7 risk items — the most critical gaps or red flags in the vendor's proposal. Each risk card has a label, a severity level — High, Medium, or Low — and a short explanation of what the risk is and why it matters. For example, for a vendor we tested — the AI flagged: no production GenAI experience, team lacks banking domain expertise, the proposed cloud provider is not MeitY empaneled, and the vendor plans to show pre-recorded videos which is explicitly banned by the RFP. This section helps the procurement committee know what to ask the vendor about, or what to watch out for even if they technically passed the score threshold."*

---

## Slide 9 — Executive Report

### Short
*"This page is the committee-ready output. It shows the score, the AI summary, and the full category breakdown in a clean format. One click on Download Report exports it as a Word document — ready to share or archive."*

### Long
*"The Executive Report page is designed for committee members who need a clean, printable summary. It shows the vendor name, the RFP name, the date, and a Confidential label — making it ready to circulate internally. At the top, you see the key numbers — overall score, number of categories evaluated, number of criteria checked, and number of risk items. Below that is the AI-written executive summary — a clean paragraph explaining the result in plain language. Then it breaks down each category's performance in a structured format. When you click the Download Report button in the top right corner, the entire report is exported as a formatted Word document — which you can share with your committee, attach to meeting minutes, or archive for audit purposes."*

---

## Slide 10 — Analytics Dashboard

### Short
*"The Analytics page tracks everything over time — total evaluations, average scores, pass rate, and a leaderboard of top-scoring vendors. Useful when you're comparing multiple vendors across evaluation rounds."*

### Long
*"The Analytics page gives you a high-level view across all evaluations that have been run on the platform. At the top, you see four key numbers — total evaluations run, average score across all of them, the overall pass rate, and the total number of risk items identified. The bar chart shows monthly evaluation activity — how many bids were evaluated each month. The donut chart shows the pass/fail distribution — in our testing, 4 out of 18 evaluations passed, giving a 22% pass rate — which reflects how strict the PNB RFP's 70% per-category requirement is. And at the bottom, there's a leaderboard of top-scoring evaluations — showing which vendor, which RFP, what score, and when it was evaluated."*

---

## Slide 11 — How the AI Works

### Short
*"Behind the scenes, there are 6 stages. The AI reads the RFP and extracts scoring rules. Then it reads the bid and scores each criterion. The final calculation is pure math — no AI — so scores are always consistent and auditable."*

### Long
*"Let me briefly explain what's happening behind the scenes — in simple terms. The system runs through 6 stages, one after another. Stage 1 — it reads the files. PDFs are read page by page, Word files are read paragraph by paragraph. Stage 2 — the AI reads the RFP and extracts the scoring rules. It figures out the categories, the marks, the weights, and the thresholds. Nothing is hardcoded — it works for any RFP. Stage 3 — the AI reads the vendor's bid and evaluates each criterion. It searches for evidence and decides: Met, Partial, or Not Met. Stage 4 — this stage has no AI. It's pure math. It calculates the percentage for each category and checks whether it meets the 70% minimum. Stage 5 — the AI identifies the top risks and gaps. Stage 6 — the AI writes the executive summary. The reason we separate the math from the AI is to keep the scoring consistent and auditable. The AI provides judgement, but the final numbers are calculated deterministically."*

---

## Slide 12 — Tech Stack

### Short
*"The frontend is React, the backend is Python with FastAPI, and the AI runs on Groq's LLaMA models. It all runs as a single application — straightforward to deploy, no complex infrastructure needed."*

### Long
*"Very quickly on the technology side. The frontend is built in React — that's the web interface you'll see in the demo. The backend is Python with FastAPI — that's the server that handles the file uploads and runs the AI pipeline. For the AI, we're using Groq's API with Meta's LLaMA models. We use the 8B model as the primary and the 70B model as a fallback for better accuracy when needed. For reading documents, we use pdfplumber for PDFs and python-docx for Word files. Everything runs as a single unified application — one server, no separate hosting needed."*

---

## Slide 13 — Thank You

### Short
*"So that's BidEval AI — 2 to 3 days of manual evaluation reduced to 90 seconds, with full transparency on every score. I'll now do a live demo with a real RFP. Happy to take any questions."*

### Long
*"So to summarize — BidEval AI takes a process that used to take 2 to 3 days of manual committee work and reduces it to under 90 seconds. It's consistent — every bid is evaluated the same way. It's transparent — every score comes with evidence and justification. And it's practical — the output is a downloadable Word report that a committee can use directly. I'll now show you a live demo of the platform with a real RFP and two vendor bids — one that passes and one that fails — so you can see the full evaluation in action. Thank you — happy to take any questions."*

---

## Demo Flow (After Slide 13)

1. Open the **New Evaluation** page
2. Upload the PNB RFP + **PNB_Vendor_PASS.docx** → Run Evaluation
3. Show the PASS result — point out the 96% score and all 3 categories above 70%
4. Show the Requirements Assessment table — highlight a Met and a Partial criterion
5. Show the Vendor Analysis page — radar chart and risk cards
6. Show the Executive Report and click Download
7. Now upload the same RFP + **PNB_Vendor_FAIL.docx** → Run Evaluation
8. Show the FAIL result — point out which category dropped below 70%
9. Show the risk cards — the AI caught every weakness that was written into the bid
