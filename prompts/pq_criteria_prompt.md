You are reading a tender/RFP document. Extract ONLY the Pre-Qualification (PQ) / Eligibility criteria.

{{ text }}

These are pass/fail requirements a bidder must meet to be eligible (NOT scored criteria with marks).
Look for sections titled 'Eligibility Criteria', 'Pre-Qualification', 'PQ Criteria' etc.
Extract each requirement as a short criterion name and a brief detail describing what is required.
Do NOT extract scored criteria that have explicit marks/points — only eligibility conditions.

Return ONLY JSON array:
[{"criterion":"<short name>","detail":"<what the bidder must demonstrate or provide>"}]
If no PQ/eligibility criteria are found, return: []
