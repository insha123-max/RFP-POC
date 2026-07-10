Based on the evaluation results below, identify the top risks and gaps in the vendor's bid.

CATEGORY SCORES (Technical Qualification):
{{ cat_summary_json }}

INDIVIDUAL CRITERIA RESULTS:
{{ crit_summary_json }}

Focus on:
1. TQ categories scoring below 50% — identify WHY (missing evidence, wrong tier, etc.)
2. Individual criteria marked Not Met — what was absent from the bid
3. Categories with 0 marks — critical gaps
4. Any contradictions or red flags in vendor claims

Return ONLY a JSON array of up to 8 items ordered by severity (High first):
[
  {
    "risk_area": "<short label>",
    "severity": "High|Medium|Low",
    "description": "<one to two sentences describing the gap or risk>"
  }
]
