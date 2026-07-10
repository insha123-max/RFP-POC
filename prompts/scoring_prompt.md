{% set scoring_instruction %}
{% if qualification_type == "PQ" -%}
PASS/FAIL SCORING — this is an eligibility/pre-qualification criterion (today is {{ today }}):
- 'Met' (marks_awarded = max_marks): Bid clearly satisfies this requirement.
- 'Not Met' (marks_awarded = 0): Bid does not satisfy this requirement.
Binary decision only — no partial credit. For numeric thresholds (e.g. 'minimum 5 years', 'turnover >= Rs 4.5 Cr'), mark Met if the vendor meets or exceeds the stated minimum.
{%- elif is_generic -%}
BROAD CATEGORY SCORING — award marks based on how well the bid addresses each aspect:
- 'Met' (marks_awarded = max_marks for that aspect): Bid clearly demonstrates this aspect with specific evidence (project names, numbers, descriptions, methodology).
- 'Partial' (marks_awarded = max_marks * 0.5): Bid mentions or implies the aspect but without concrete evidence or detail.
- 'Not Met' (marks_awarded = 0): Aspect is completely absent from the bid.
Default to 'Partial' if there is ANY relevant content — only use 'Not Met' when the topic is truly not addressed at all in the document.
{%- elif is_future_event -%}
IMPORTANT CONTEXT: This is a BID DOCUMENT evaluation, not post-event scoring. For criteria that involve future scheduled events (presentations, demonstrations), evaluate based on the vendor's PLAN and CAPABILITY evidence in the bid:
- 'Met': Vendor provides detailed plan/content AND has demonstrable live systems/capability. Set marks_awarded = max_marks.
- 'Partial': Vendor confirms participation but lacks detail or supporting capability evidence. Set marks_awarded = 50% of max_marks.
- 'Not Met': No mention of the criterion, or vendor explicitly cannot meet it. Set marks_awarded = 0.
Do NOT score 'Not Met' simply because the event has not yet occurred.
{%- elif not has_rfp_scoring_text -%}
PASS/FAIL SCORING (today is {{ today }}):
Evaluate each criterion as a simple binary check — there are no tiers.
- 'Met' (marks_awarded = max_marks): The bid clearly satisfies the requirement.
- 'Not Met' (marks_awarded = 0): The bid does not satisfy the requirement.
Do NOT invent tiers or partial credit. For numeric minimums (e.g. 'minimum 5 years'), use today's date to calculate the duration and mark 'Met' if the vendor meets or exceeds it.
If the requirement is 'must include X' and the bid includes X, mark as Met.
{%- else -%}
TIERED SCORING INSTRUCTIONS:
Many criteria have tiered marks (e.g. 3+ BFSI cases = 10 marks, 2 cases = 6 marks, 1 case = 3 marks; or 1000+ users = 10 marks, 100-999 users = 6 marks; or 15+ implementations = 10 marks, 10-14 = 8 marks, 5-9 = 6 marks; or 50%+ team with 2+ certs = 5 marks, 50%+ with 1 cert = 3 marks). Read what the vendor ACTUALLY claims (number of cases, users, implementations, certification counts) and award marks_awarded based on the appropriate tier — NOT simply max_marks for any evidence. 'Met' means the vendor clearly meets the HIGHEST tier. 'Partial' means the vendor meets a LOWER tier but not the highest. 'Not Met' means no qualifying evidence exists. ALWAYS set marks_awarded to the specific tiered value that matches the vendor's evidence.
{%- endif %}


NUMERIC COMPARISON RULES (apply these carefully before deciding Met/Not Met):
1. MINIMUM requirements (e.g. 'at least X years', 'minimum X', 'not less than X'):
   Met = vendor's value >= X.  Example: minimum 5 years, vendor has 8 years → MET.
2. MAXIMUM / ceiling requirements (e.g. 'must not exceed X', 'maximum X', 'up to X'):
   Met = vendor's value <= X.  Example: must not exceed INR 25,00,000, vendor quotes INR 21,50,000 → MET.
3. Indian currency (INR lakhs/crores): read commas as Indian grouping.
   1,00,000 = 1 lakh = 100 000.  21,50,000 = 21.5 lakhs = 2 150 000.
   25,00,000 = 25 lakhs = 2 500 000.  So 21,50,000 < 25,00,000.
4. Never swap the vendor value and the threshold when writing the justification.
   Correct: 'Vendor has 8 years which meets the 5-year minimum.'
   Wrong:   'Vendor has 8 years but minimum is 5 years — risk.'
{%- endset %}
{% if is_generic %}
Evaluate the vendor bid for the "{{ category }}" category (total: {{ max_marks }} marks).

VENDOR BID:
{{ relevant_bid }}
{{ rfp_context }}
IMPORTANT: This is a real vendor bid document. It may be a technical proposal, project report, company profile,
or similar. Evaluate what is actually present in the document — do NOT assume it is empty or irrelevant.

No specific subcriteria are defined in the RFP for this category.
Identify 3 to 5 specific evaluation aspects relevant to "{{ category }}" and evaluate each against the bid.
Distribute {{ max_marks }} marks proportionally across the aspects (marks must sum to exactly {{ max_marks }}).

{{ scoring_instruction }}

Return ONLY a JSON array with 3-5 items (one per aspect):
[{"criterion":"<specific aspect name>","category":"{{ category }}","max_marks":<proportional_max>,"marks_awarded":<actual_marks — use partial marks not just 0 or max>,"vendor_claim":"<direct quote or brief description from the bid, or 'Not found'>","source_reference":"<section heading or 'Not found'>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence citing specific bid evidence>"}]
{% else %}
Evaluate the vendor bid for the "{{ category }}" category.

VENDOR BID:
{{ relevant_bid }}
{{ rfp_context }}
CRITERIA:
{{ criteria_list_json }}

{{ scoring_instruction }}

Return ONLY a JSON array. For each criterion include marks_awarded as the ACTUAL numeric marks (based on tiered scoring), NOT just max_marks:
[{"criterion":"<name>","category":"<cat>","max_marks":<n>,"marks_awarded":<actual_tiered_marks>,"vendor_claim":"<quote or Not found>","source_reference":"<section or Not found>","compliance_status":"Met|Partial|Not Met","confidence":"High|Medium|Low","justification":"<one sentence explaining the tier awarded>"}]
{% endif %}
