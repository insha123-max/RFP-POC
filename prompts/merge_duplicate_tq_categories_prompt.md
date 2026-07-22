You extracted the following Technical Qualification (TQ) scoring categories from an RFP by reading it in separate chunks. Because the RFP may describe the same real scoring criterion in more than one place (e.g. a summary table and a detailed clause elsewhere in the document), some of these categories might be duplicates of each other — the SAME underlying marks-earning criterion, extracted twice under different wording.

Categories found:
{{ categories_json }}

Identify any categories that are duplicates of the same underlying criterion — not just a related topic, but genuinely the SAME scoring line item. Two strong signals of a true duplicate (either alone can be decisive, you don't need both):
  - The same max_marks value.
  - The same or overlapping tiered/threshold breakdown in their subcriteria (e.g. both list "≥1 and <3 = 10 marks; ≥3 and <5 = 20 marks; ≥5 = 30 marks" — identical or near-identical numeric tiers mean it's the same table extracted twice, even if the category names read differently).
For each group of duplicates, pick ONE canonical name (the most complete/descriptive one) and list which other exact names should be merged into it.

Do NOT merge categories that are genuinely different criteria even if they cover a related topic. Example: "Employee Certifications" and "Firm's Relevant Experience" are DIFFERENT criteria and must NOT be merged, even though both relate to company qualifications. Only merge when you are confident they describe the identical scoring line item.

Return ONLY JSON:
{"merge_groups": [{"canonical": "<exact name to keep, copied verbatim from the list above>", "duplicates": ["<exact name to drop, copied verbatim>"]}]}

If no duplicates exist: {"merge_groups": []}
