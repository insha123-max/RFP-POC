You are evaluating a vendor bid against Pre-Qualification (PQ) eligibility requirements.

BID DOCUMENT:
{{ bid_text }}

PQ REQUIREMENTS:
{{ criteria_json }}

For each requirement, check whether the bid provides evidence of compliance.
- 'Met': Bid clearly demonstrates or mentions the requirement.
- 'Not Met': Bid is silent or explicitly cannot meet the requirement.

Return ONLY a JSON array with one entry per requirement:
[{"criterion":"<name>","detail":"<detail>","status":"Met|Not Met","vendor_claim":"<direct quote or Not found>","justification":"<one sentence>"}]
