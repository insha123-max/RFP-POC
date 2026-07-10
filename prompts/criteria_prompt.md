You are reading a tender/RFP document section. Extract ONLY the SCORING MATRIX — the table that assigns numeric marks/score/points/weightage to evaluation criteria. Copy criterion names and marks EXACTLY as written. Do NOT rename, paraphrase, merge, split, or invent anything.

{{ chunk }}

=== RULE A — IGNORE ELIGIBILITY / PRE-QUALIFICATION SECTIONS ===
Sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria', 'Mandatory Requirements'
list pass/fail conditions WITHOUT marks. DO NOT extract these at all.
Example of what to IGNORE: 'Minimum turnover Rs 4.5 crore', 'At least 1 similar work of Rs 2 crore'

=== RULE B — EXTRACT FROM THE SCORING TABLE ONLY ===
Scoring tables may use column headers like: Max. Marks | Marks | Score | Points | Weightage | Max Score
Each ROW of this table becomes one scoring_category. Use the exact text from the criteria/description column as the category name.
Use the numeric value in the marks/score/points column as max_marks. Do not modify these values.

=== RULE C — TIERED SCORING (MOST IMPORTANT) ===
When a criterion has tiered/progressive marks (e.g. '1-3 projects=10 marks, 3-5 projects=20 marks, ≥5 projects=30 marks'),
this is ONE scoring_category. Create EXACTLY ONE subcriterion that describes ALL tiers in its 'criterion' text.
Set max_marks = the MAXIMUM tier value (highest possible marks for this criterion).
The tiers are MUTUALLY EXCLUSIVE — a vendor can only fall into one tier.
Example for 'Firm's Relevant Experience' (max 30):
  subcriteria: [{"criterion":"≥1 and <3 similar projects = 10 marks; ≥3 and <5 = 20 marks; ≥5 = 30 marks","max_marks":30}]
Example for 'Employee Certifications' (1 employee=4 marks, max 20):
  subcriteria: [{"criterion":"1 certified employee = 4 marks; each additional = 4 marks; maximum 20 marks (5 employees)","max_marks":20}]
Example for 'Average Annual Turnover' (Rs 4.5 crore=5 marks, +0.25 per crore above, max 10):
  subcriteria: [{"criterion":"Rs 4.5 crore = 5 marks; above Rs 4.5 crore: +0.25 marks per Rs 1 crore; maximum 10 marks","max_marks":10}]

=== RULE D — WHEN TO SET rules_found ===
Set rules_found=true if scoring_categories is non-empty — meaning you extracted EITHER:
  (a) rows from a numeric scoring table with explicit Max. Marks (per RULE B), OR
  (b) pass/fail eligibility conditions extracted per RULE A (with max_marks=1).
Set rules_found=false ONLY if scoring_categories is empty (no criteria of any kind found in this chunk).
Never guess marks. Never use eligibility thresholds as numeric scores.

=== RULE E — PRESERVE EXACT NAMES ===
Copy criterion and category names verbatim from the RFP. Do not rephrase or shorten.

=== RULE F — NO DOUBLE-COUNTING (HIERARCHICAL TABLES) ===
Some RFPs have multi-level tables where a top-level header row (e.g. 'Category A: 55 marks') contains
mid-level rows ('Criterion 1: 40 marks', 'Criterion 2: 15 marks') which contain leaf rows ('Sub-Criterion 1.a: 20 marks', etc.).
RULE: Create ONE scoring_category per TOP-LEVEL PARENT only (the rows whose marks sum to the grand total).
List ALL LEAF sub-criteria (the deepest level rows) inside that parent's subcriteria[] array.
Do NOT create a separate scoring_category for intermediate levels or leaf sub-criteria.
The sum of all scoring_category max_marks MUST equal the stated grand total (e.g., 100).

HIERARCHICAL EXAMPLE — RFP with Category A (55), Category B (20), Category C (25) = 100 total:
  Category A contains: Criterion 1 (40 marks) → [Sub-Crit 1.a (20), Sub-Crit 1.b (10), Sub-Crit 1.c (10)]
                       Criterion 2 (15 marks) → [Sub-Crit 2.a (10), Sub-Crit 2.b (5)]
  CORRECT output for Category A:
    {"category":"Category A: Bidder GenAI Delivery Capability","max_marks":55,"weight_percent":55,
     "subcriteria":[
       {"criterion":"Sub-Criterion 1.a: GenAI Experience in Organisation","max_marks":20},
       {"criterion":"Sub-Criterion 1.b: BFSI GenAI Experience","max_marks":10},
       {"criterion":"Sub-Criterion 1.c: Complexity & Scale of Implementations","max_marks":10},
       {"criterion":"Sub-Criterion 2.a: Banking Domain Expertise on GenAI use cases","max_marks":10},
       {"criterion":"Sub-Criterion 2.b: Cloud & Infrastructure Capabilities","max_marks":5}
     ]}
  WRONG: Creating 'Criterion 1 (40)' and 'Criterion 2 (15)' as separate scoring_categories — those are intermediate, not top-level.
  WRONG: Creating 13 scoring_categories (parent + all children) summing to 215.

Return ONLY JSON:
{"rules_found":true,"scoring_categories":[{"category":"<exact name>","max_marks":55,"weight_percent":55,"subcriteria":[{"criterion":"<leaf sub-criterion name>","max_marks":20},{"criterion":"<next leaf>","max_marks":10}]}],"threshold":{"overall_pass_mark":70,"category_minimums":[]}}

Set rules_found=false ONLY if scoring_categories is completely empty (no numeric criteria of any kind found).
If empty: {"rules_found":false,"scoring_categories":[],"threshold":{"overall_pass_mark":0,"category_minimums":[]}}
