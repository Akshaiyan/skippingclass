"""Checks the app-facing API: rules in the app's format, rich case rows, and an override sent with the app's field names.
Uses a temporary decision log, so the real log is never touched. Run: python test_ui_view.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402
import ui_view  # noqa: E402
import engine  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


# 1. Rules in the app's format
st, rules = server.handle("GET", "/api/policy/ui", {"name": ["v1"]}, {})
check("policy endpoint answers for v1", st == 200 and rules["version"] == "v1" and rules["hash"].startswith("sha256:"), st)
ids = [r["id"] for r in rules["rules"]]
check("the last rule is the routine default with no condition",
      rules["rules"][-1]["id"] == "R3.routine" and rules["rules"][-1]["condition"] is None)
check("every review trigger keeps its outcome", all(r["outcome"] == "human_review" for r in rules["rules"] if r["id"].startswith("R1.")))
check("unknown review triggers ask for information",
      any(r["id"].startswith("R2.unknown.") and r["outcome"] == "request_information" for r in rules["rules"]))
st_bad, _ = server.handle("GET", "/api/policy/ui", {"name": ["../x"]}, {})
check("a policy name outside v1 and v2 is refused", st_bad == 400)
st2, rules2 = server.handle("GET", "/api/policy/ui", {"name": ["v2"]}, {})
check("v2 has the EV battery trigger", any(r["id"] == "R1.ev_battery" for r in rules2["rules"]), [r["id"] for r in rules2["rules"]])

# 2. Rich case rows, with recommendations from the engine
st, cases = server.handle("GET", "/api/cases", {}, {})
check("case list answers with the twelve practice claims", st == 200 and len(cases) == 12, len(cases))
sample = cases[0]
need = {"case_id", "case_status", "claim_summary", "recommendation_v1", "flow", "rule_v1", "explanation",
        "checklist", "facts", "blank_fields", "policy_version", "policy_hash", "needs_recheck", "suggestion"}
check("each case row carries the fields the app needs", need <= set(sample), need - set(sample))
check("recommendations match the engine on every practice claim",
      all(c["recommendation_v1"] == engine.decide(server._cases()[c["case_id"]])[0] for c in cases))
check("flow follows the recommendation", all(c["flow"] == {"routine_processing": "green", "request_information": "yellow",
      "human_review": "red"}[c["recommendation_v1"]] for c in cases))
check("checklist results are true, false or unknown only",
      all(x["result"] in ("true", "false", "unknown") for c in cases for x in c["checklist"]))
check("facts are typed: booleans and numbers, blanks as null",
      isinstance(sample["facts"]["policy_active_on_incident"], bool) and isinstance(sample["facts"]["quote_eur"], (int, float)))
check("reference labels never appear as facts on the review screen",
      all("expected_v1" not in c["facts"] and "claim_summary" not in c["facts"] for c in cases), [k for c in cases for k in c["facts"] if k.startswith("expected")][:3])
closed = [c for c in cases if c["case_status"] == "closed"]
check("closed cases carry no v2 recommendation", all(c["recommendation_v2"] is None and not c["needs_recheck"] for c in closed))

# 2b. Policy change summary: counts agree with the quality report on the practice file
st_c, chg = server.handle("GET", "/api/policy/change", {}, {})
check("change summary answers", st_c == 200, st_c)
check("practice file: four open claims change under v2", chg["open_changed"] == 4 and chg["open_total"] == 10, (chg["open_changed"], chg["open_total"]))
check("no change moves a claim into routine on the practice file, so no sign-off is needed", chg["into_routine"] == [] and chg["requires_signoff"] is False, chg["into_routine"])
check("closed claims are counted apart and never listed as flips", chg["closed_kept_as_v1"] == 2 and not any(f["case_id"] in ("PRA-009", "PRA-010") for f in chg["flips"]))
check("every flip is a real change", all(f["from"] != f["to"] for f in chg["flips"]))
check("transitions add up to the flips", sum(chg["transitions"].values()) == chg["open_changed"], chg["transitions"])

# 3. Override with the app's field names, written to a temporary log
with tempfile.TemporaryDirectory() as d:
    old_log = server.LOG_PATH
    server.LOG_PATH = Path(d) / "log.ndjson"
    try:
        st, out = server.handle("POST", "/api/override", {}, {
            "case_id": "PRA-001", "actor": "Jonas Weber", "note": "Checked against the invoice",
            "reason_code": "judgement", "policy_version": "v1", "policy_hash": "sha256:test",
            "from_rec": "routine_processing", "to_rec": "human_review"})
        check("override accepts the app's field names", st == 200 and out["reason"] == "Checked against the invoice", out)
        st_log, log = server.handle("GET", "/api/log", {}, {})
        check("log returns the record in the app's shape with the hash chain intact",
              st_log == 200 and log["intact"] and log["entries"][-1]["type"] == "reviewer_override"
              and log["entries"][-1]["from_rec"] == "routine_processing" and log["entries"][-1]["to_rec"] == "human_review"
              and log["entries"][-1]["reason_code"] == "judgement" and log["entries"][-1]["hash"], log)
        st_e, empty = server.handle("POST", "/api/override", {}, {"case_id": "PRA-002", "actor": "x", "note": "", "to_rec": "human_review"})
        check("an override with no reason is refused", st_e == 400, empty)
    finally:
        server.LOG_PATH = old_log

# 4. The sign-off gate, proved on a change that really moves a claim into routine.
# The shipped v2 only tightens rules, so no shipped change moves a claim into routine. To test the gate, build a
# temporary, looser policy (limit 2,000) and a temporary case file with a 1,600 EUR claim that v1 sends to review.
import json as _json
with tempfile.TemporaryDirectory() as d:
    loose = _json.loads(ui_view.V2_PATH.read_text(encoding="utf-8"))
    for trig in loose["review_triggers"]:
        if trig["id"] == "R1.quote_over_limit":
            trig["value"] = 2000
    loose_path = Path(d) / "loose.json"
    loose_path.write_text(_json.dumps(loose), encoding="utf-8")
    cases_path = Path(d) / "cases.csv"
    header = ["case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type", "repair_type",
              "quote_eur", "incident_report_present", "itemized_quote_present", "injury_reported", "liability_disputed",
              "duplicate_flag", "evidence_conflict"]
    row = ["GATE-1", "open", "test", "True", "motor_own_damage", "standard", "1600", "True", "True", "False", "False", "False", "False"]
    cases_path.write_text(",".join(header) + "\n" + ",".join(row) + "\n", encoding="utf-8")
    old_v2, old_cases, old_log = ui_view.V2_PATH, server.CASES_FILE, server.LOG_PATH
    ui_view.V2_PATH, server.CASES_FILE, server.LOG_PATH = loose_path, cases_path, Path(d) / "log.ndjson"
    try:
        st_nosign, out_nosign = server.handle("POST", "/api/policy-decision", {}, {
            "decision": "approved", "actor": "Approver", "proposed_by": "Proposer", "reason": "test", "policy_version": "v2"})
        check("an approval that moves a claim into routine without a named sign-off is refused",
              st_nosign == 400 and "GATE-1" in out_nosign.get("error", ""), out_nosign)
        st_wrong, _ = server.handle("POST", "/api/policy-decision", {}, {
            "decision": "approved", "actor": "Approver", "proposed_by": "Proposer", "reason": "test", "policy_version": "v2",
            "signoff_for": ["SOMEONE-ELSE"]})
        check("a sign-off that names a different claim does not satisfy the gate", st_wrong == 400)
        st_ok, _ = server.handle("POST", "/api/policy-decision", {}, {
            "decision": "approved", "actor": "Approver", "proposed_by": "Proposer", "reason": "test", "policy_version": "v2",
            "signoff_for": ["GATE-1"]})
        check("an approval that names the claim is recorded", st_ok == 200, st_ok)
        st_rej, _ = server.handle("POST", "/api/policy-decision", {}, {
            "decision": "rejected", "actor": "Approver", "proposed_by": "Proposer", "reason": "test", "policy_version": "v2"})
        check("rejecting a change never needs a sign-off", st_rej == 200, st_rej)
    finally:
        ui_view.V2_PATH, server.CASES_FILE, server.LOG_PATH = old_v2, old_cases, old_log

print("ALL UI VIEW TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
