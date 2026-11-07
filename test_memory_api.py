"""Decision memory API contract: GET /api/cases/<id>/memory.
Shows a claim's own corrections (newest first), the policy changes that moved this claim, and the log's integrity.
Uses a temporary log only. Run: python test_memory_api.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import decision_log as dl  # noqa: E402
import server  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


server.LOG_PATH = Path(tempfile.mkdtemp()) / "log.ndjson"
OVERRIDE = {"actor": "Jonas Weber", "note": "Itemised quote confirmed", "reason_code": "data_wrong", "policy_version": "v1"}

st, out = server.handle("GET", "/api/cases/NOPE/memory", {}, {})
check("memory for an unknown case answers 404 JSON", st == 404 and "error" in out, (st, out))

st, out = server.handle("GET", "/api/cases/PRA-006/memory", {}, {})
check("a case with no decisions answers 200 with an empty list", st == 200 and out["decisions"] == [] and out["policy_events"] == [], (st, out))
check("the memory states integrity", out.get("integrity", {}).get("intact") is True, out)

server.handle("POST", "/api/override", {}, {**OVERRIDE, "case_id": "PRA-006", "to_rec": "human_review", "actor": "First"})
server.handle("POST", "/api/override", {}, {**OVERRIDE, "case_id": "PRA-006", "to_rec": "routine_processing", "actor": "Second"})
st, out = server.handle("GET", "/api/cases/PRA-006/memory", {}, {})
actors = [d["actor"] for d in out["decisions"]]
check("corrections are listed newest first", actors == ["Second", "First"], actors)
first = out["decisions"][0]
check("each correction carries who, what changed, why, policy and fingerprint",
      first["from_rec"] == "request_information" and first["to_rec"] == "routine_processing"
      and first["reason"] == "Itemised quote confirmed" and first["policy_version"] == "v1" and first["hash"], first)

st, other = server.handle("GET", "/api/cases/PRA-001/memory", {}, {})
check("a correction for one claim does not appear on another", other["decisions"] == [], other)

# A policy change that moves PRA-001 (a looser v2 over a temporary 1,600 EUR claim), approved by someone else
import json as _json
loose_dir = Path(tempfile.mkdtemp())
loose = _json.loads(server.ui_view.V2_PATH.read_text(encoding="utf-8"))
for trig in loose["review_triggers"]:
    if trig["id"] == "R1.quote_over_limit":
        trig["value"] = 2000
loose_path = loose_dir / "loose.json"
loose_path.write_text(_json.dumps(loose), encoding="utf-8")
header = "case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict"
cases = loose_dir / "cases.csv"
cases.write_text(header + "\nPRA-001,open,test,True,motor_own_damage,standard,1600,True,True,False,False,False,False\n", encoding="utf-8")
old_v2, old_cases = server.ui_view.V2_PATH, server.CASES_FILE
server.ui_view.V2_PATH, server.CASES_FILE = loose_path, cases
try:
    st, out = server.handle("POST", "/api/policy-decision", {}, {"decision": "approved", "actor": "Approver", "proposed_by": "Proposer",
                                                                  "reason": "loosen the limit", "policy_version": "v2", "signoff_for": ["PRA-001"]})
    check("the approval is recorded", st == 200, (st, out))
finally:
    server.ui_view.V2_PATH, server.CASES_FILE = old_v2, old_cases
st, out = server.handle("GET", "/api/cases/PRA-001/memory", {}, {})
events = out["policy_events"]
check("the policy change appears on the claim it moved, with its old and new recommendation",
      len(events) == 1 and events[0]["policy_version"] == "v2"
      and events[0]["changed"] == {"from": "human_review", "to": "routine_processing"}, events)
st, out2 = server.handle("GET", "/api/cases/PRA-002/memory", {}, {})
check("a policy change does not appear on claims it did not move", out2["policy_events"] == [], out2)

# A damaged log is a server-side fault, answered 503
server.LOG_PATH.write_text(server.LOG_PATH.read_text(encoding="utf-8") + "not json\n", encoding="utf-8")
st, out = server.handle("GET", "/api/cases/PRA-006/memory", {}, {})
check("a damaged log answers 503 for memory too", st == 503, (st, out))

print("ALL MEMORY API TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
