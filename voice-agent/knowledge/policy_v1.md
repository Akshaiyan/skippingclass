Fictional motor claims policy v1 (thinc! Munich hackathon participant material)

Purpose and scope: an invented policy for a hackathon. Not legal advice, not a real insurer policy, not a Taktile customer workflow. The system recommends the next handling step; it never approves or pays a claim. The input is one claim record. The claim_summary is descriptive text; the structured fields are the source of truth. The three outputs are routine_processing, request_information and human_review.

Decision order (apply in order; a known reason for human review takes priority over a missing document; record which policy version and rule produced each recommendation):
1. human_review if the policy was not active on the incident date; or claim_type is not motor_own_damage; or injury_reported, liability_disputed, duplicate_flag or evidence_conflict is true; or quote_eur is greater than 1,500 euros.
2. Otherwise request_information if incident_report_present or itemized_quote_present is false.
3. Otherwise routine_processing. The case may enter the insurer's normal downstream process. It does not mean payment is approved.

Field definitions: case_status is open (still in process) or closed (completed). claim_type is the kind of claim. repair_type distinguishes standard repair from ev_high_voltage_battery work. quote_eur is the itemized repair estimate in euros. The other Boolean fields say whether evidence is present or a review trigger is known. If a field is absent or unreadable, do not invent a value: request information unless another known fact already requires human review. A blank field is an absent fact.

Deliverable: the prototype reads a CSV in this format and writes a results CSV with columns case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2 and explanation. Judges run every team on the same hidden evaluation cases.

Quality to report: total correct next-step recommendations, incorrect routine_processing recommendations, and unnecessary human_review recommendations. After a policy change, report the changed cases separately and identify open cases whose recommendation must be revisited. There are no reviewer corrections in the data, so show how the system records an override rather than reporting a rate. Explain what to monitor after deployment once reviewer corrections and final outcomes arrive later.

Datasets: 14 labelled development cases (with expected_v1 answers) for testing, 12 unlabelled practice cases for the team's own predictions, and a separate hidden evaluation set for judging. Policy v2 has not been released yet.
