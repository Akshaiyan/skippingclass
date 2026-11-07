import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from suggest import suggest
base = {"case_id": "T", "case_status": "open", "policy_active_on_incident": "True", "claim_type": "motor_own_damage",
        "repair_type": "standard", "quote_eur": "800", "incident_report_present": "", "itemized_quote_present": "True",
        "injury_reported": "", "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False"}
s = suggest(base)
fields = [x["field"] for x in s["decision_changing_single_answers"]]
assert s["current"] == "request_information"
assert "injury_reported" in fields, s
assert "incident_report_present" not in fields, s
print("PASS: injury is decision-changing; incident report alone is not (injury still blank)")

no_blank = dict(base, incident_report_present="False", injury_reported="False")
s2 = suggest(no_blank)
assert s2["blank_fields"] == [] and s2["current"] == "request_information"
assert s2["note"].startswith("No blank fields"), s2["note"]
print("PASS: a yellow case with no blank fields says the missing item is a document")
