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
Extract rows from the scoring table with explicit numeric marks/points/weightage.
Set qualification_type='TQ' for ALL scored criteria.
Copy criterion names and marks EXACTLY as written.

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

Return ONLY JSON:
{"rules_found":true,"scoring_categories":[{"category":"Name","max_marks":30,"weight_percent":30,"qualification_type":"TQ","subcriteria":[{"criterion":"<description>","max_marks":30}]}],"threshold":{"overall_pass_mark":70,"category_minimums":[]}}

If no criteria of any kind found: {"rules_found":false,"scoring_categories":[],"threshold":{"overall_pass_mark":0,"category_minimums":[]}}
