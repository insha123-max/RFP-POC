You are reviewing Pre-Qualification (PQ) eligibility conditions extracted from an RFP. Genuine PQ conditions are pass/fail requirements the BIDDER (the company submitting the bid) must meet to be eligible — e.g. minimum turnover, company registration status, no blacklisting, staff certifications, signing specific forms.

Conditions found:
{{ categories_json }}

Do TWO things:

=== PART 1 — MERGE TRUE DUPLICATES ===
Some conditions may describe the SAME underlying eligibility gate twice — once as the requirement itself, once as the document/evidence that proves it. Example: "must have turnover >= Rs 4.5 Cr" and "submit CA-certified turnover data for the last 3 years" are the SAME gate (prove turnover >= Rs 4.5 Cr) — merge them. Only merge when the underlying gate is genuinely identical, not just related in topic.

=== PART 2 — DROP ITEMS THAT AREN'T REAL ELIGIBILITY GATES ===
Some "conditions" may NOT actually be bidder pass/fail eligibility gates at all. Watch for:
  - Functional/operational requirements about how the proposed SYSTEM/software should behave (e.g. "the system shall provide confidence scores", "outputs must be traceable to source documents") — these are solution requirements, not bidder eligibility, and must be dropped.
  - Descriptive notes or qualifiers copied from a DIFFERENT part of the RFP — e.g. a technical-scoring table's supporting text such as "only completed projects count toward the score" or "bidders may be asked for a live demo" — these belong to the TQ scoring criteria, not the PQ eligibility checklist, and must be dropped.
Mark these for removal — do not merge them anywhere, just drop them.

=== OUTPUT FORMAT — IMPORTANT ===
Every value in "duplicates" and "not_eligibility_conditions" MUST be one of the exact "category" names from the list above (the short label, e.g. "Financial Capability") — NEVER the requirement_text sentences. The requirement_text is only there to help you judge intent; it is not a valid output value.

Return ONLY JSON:
{"merge_groups": [{"canonical": "<exact category name to keep>", "duplicates": ["<exact category name to drop>"]}], "not_eligibility_conditions": ["<exact category name to drop entirely>"]}

Example, given categories "Financial Turnover" and "Financial Capability" that describe the same turnover gate, and "Mandatory Requirements" that turns out to be a system functional requirement:
{"merge_groups": [{"canonical": "Financial Turnover", "duplicates": ["Financial Capability"]}], "not_eligibility_conditions": ["Mandatory Requirements"]}

If nothing to merge or drop: {"merge_groups": [], "not_eligibility_conditions": []}
