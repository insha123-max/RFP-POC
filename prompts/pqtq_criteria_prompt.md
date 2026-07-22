You are reading a tender/RFP document section. Extract BOTH:
  (1) Pre-Qualification (PQ) pass/fail eligibility conditions
  (2) Technical Qualification (TQ) scored criteria with explicit numeric marks

{{ chunk }}

=== RULE A — PQ ELIGIBILITY CRITERIA ===
Sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria', 'Mandatory Requirements'
contain pass/fail conditions WITHOUT numeric marks. Extract EACH condition as a separate scoring_category with max_marks=1.
Set qualification_type='PQ' for ALL eligibility conditions.
Example: category='Minimum Annual Turnover', max_marks=1, qualification_type='PQ',
subcriteria=[{criterion:'Annual turnover >= Rs 4.5 crore in last 3 years', max_marks:1}]

=== RULE B — TQ SCORED CRITERIA ===
Extract rows ONLY from the formal bid EVALUATION / TECHNICAL SCORING table — the table whose
purpose is to award marks that determine which bidder wins, usually under a heading like
'Evaluation Criteria', 'Technical Scoring', 'Marking Scheme', 'Selection Criteria', or 'Section VII'.
Set qualification_type='TQ' for ALL scored criteria.
Copy criterion names and marks EXACTLY as written.

Do NOT extract from payment schedules, milestone-based payment/delivery tables, project
timelines, or implementation plans — even when they list percentages or numbers (e.g.
'Milestone 1 (D+1 Month): 10% payment', 'Milestone 3 (D+5 Months): 25%'). These percentages are
payment/delivery terms, not technical-merit marks, and must never become a scoring_category.

=== RULE C — HIERARCHICAL TABLES (categories with sub-criteria) ===
If a scoring table has CATEGORY rows (e.g. 'Category A') and SUB-CRITERION rows within each:
  - Create ONE scoring_category per CATEGORY
  - Place each sub-criterion row inside that category's subcriteria[] array
  - Do NOT create separate top-level scoring_categories for sub-criterion rows
  Example: Category A (20 marks) with Sub-Criterion 1.a (10 marks) + Sub-Criterion 1.b (10 marks)
  → ONE scoring_category: category='Category A', max_marks=20, qualification_type='TQ',
    subcriteria=[{criterion:'Sub-Criterion 1.a...', max_marks:10}, {criterion:'Sub-Criterion 1.b...', max_marks:10}]

=== RULE D — TIERED SCORING ===
When a TQ criterion has tiered/progressive marks (e.g. '1-2 projects=10pts; 3-5=20pts; 5+=30pts'),
create ONE scoring_category with ONE subcriterion describing ALL tiers in one string.
Set max_marks = the highest tier value.
TIERED = one criterion, multiple score levels. HIERARCHICAL (Rule C) = multiple separate sub-criteria.

=== RULE E — WHEN TO SET rules_found ===
Set rules_found=true if scoring_categories is non-empty (any PQ or TQ criteria found).
Set rules_found=false ONLY if no criteria of any kind were found in this chunk.
Never invent marks. Never use eligibility thresholds (e.g. Rs 4.5 Cr) as numeric scores.

=== RULE F — OVERALL / CATEGORY PASS MARKS ===
Separately from the scoring table, RFPs often state, in prose, the minimum a bidder must
score to qualify/proceed — e.g. "A Bidder must get a minimum of 70 marks (out of 100 marks)
in the Technical Evaluation to proceed", "Bidders scoring at least 70% shall be considered
technically qualified", "minimum of 60 marks required to qualify".
- If THIS CHUNK contains such a sentence stating an OVERALL minimum TQ score across the whole
  scoring table, extract that number into threshold.overall_pass_mark. If stated as a
  percentage of a 100-mark scale, use the number as-is; if the total isn't 100, convert to
  the equivalent out of 100.
- If it instead states a minimum for one SPECIFIC TQ scoring category only (e.g. "Firm's
  Relevant Experience: minimum 15 out of 30 marks required"), add
  {"category":"<exact category name>","min_percent":<minimum as % of that category's max>}
  to threshold.category_minimums instead.
- If this chunk contains no such statement, leave overall_pass_mark=0 and
  category_minimums=[] — do not guess or infer a number that isn't explicitly stated.

Return ONLY JSON:
{"rules_found":true,"scoring_categories":[{"category":"Name","max_marks":30,"weight_percent":30,"qualification_type":"TQ","subcriteria":[{"criterion":"<description>","max_marks":30}]}],"threshold":{"overall_pass_mark":70,"category_minimums":[]}}

If no criteria of any kind found: {"rules_found":false,"scoring_categories":[],"threshold":{"overall_pass_mark":0,"category_minimums":[]}}
