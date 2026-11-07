"""Policy v2 against the change notice. The oracle below is written straight from the notice text
(limit 1,200 with exactly 1,200 inside; EV battery repairs always go to human review and beat missing
documents; everything else as v1) and shares no code with policy.py. Run: python test_v2.py"""
import csv
import itertools
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import policy  # noqa: E402

V2 = policy.load(HERE / "policies" / "v2.json")
V1 = policy.load(HERE / "policies" / "v1.json")
FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


def oracle_v2(r):
    t = lambda k: r[k] == "True"
    f = lambda k: r[k] == "False"
    over = r["quote_eur"] != "" and float(r["quote_eur"]) > 1200
    if (f("policy_active_on_incident") or r["claim_type"] not in ("", "motor_own_damage")
            or t("injury_reported") or t("liability_disputed") or t("duplicate_flag") or t("evidence_conflict")
            or over or r["repair_type"] == "ev_high_voltage_battery"):
        return "human_review"
    # SOURCE: participant policy v1, blank-field rule: "If an input field is absent or unreadable, do not invent a
    # value. Request information unless another known fact already requires human review." A blank repair_type
    # therefore cannot be ruled out as an EV battery repair, so an otherwise routine claim asks for information.
    required = ["policy_active_on_incident", "claim_type", "quote_eur", "injury_reported",
                "liability_disputed", "duplicate_flag", "evidence_conflict", "repair_type"]
    if not t("incident_report_present") or not t("itemized_quote_present") or any(r[k] == "" for k in required):
        return "request_information"
    return "routine_processing"


TRI = ["True", "False", ""]
GRID = itertools.product(TRI, ["motor_own_damage", "motor_third_party", ""], ["standard", "ev_high_voltage_battery", ""],
                         ["", "1199", "1200", "1201", "1500", "1501"], TRI, TRI, TRI, TRI, TRI, TRI)
KEYS = ["policy_active_on_incident", "claim_type", "repair_type", "quote_eur", "incident_report_present",
        "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"]
n = bad = 0
first_bad = None
for combo in GRID:
    row = dict(zip(KEYS, combo))
    n += 1
    got = policy.decide(row, V2)[0]
    if got != oracle_v2(row):
        bad += 1
        first_bad = first_bad or (row, got, oracle_v2(row))
check(f"policy v2 matches the notice-derived oracle on all {n:,} field combinations", bad == 0, first_bad)

BASE = {"policy_active_on_incident": "True", "claim_type": "motor_own_damage", "repair_type": "standard",
        "quote_eur": "800", "incident_report_present": "True", "itemized_quote_present": "True",
        "injury_reported": "False", "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False"}


def case(**kw):
    return {**BASE, **kw}


check("a quote of exactly 1,200 stays routine under v2", policy.decide(case(quote_eur="1200"), V2)[0] == "routine_processing")
check("a quote of 1,201 needs human review under v2", policy.decide(case(quote_eur="1201"), V2)[0] == "human_review")
check("a quote of 1,201 is still routine under v1 (the change is real)", policy.decide(case(quote_eur="1201"), V1)[0] == "routine_processing")
ev = case(repair_type="ev_high_voltage_battery", quote_eur="100")
check("an EV battery repair needs human review whatever the quote", policy.decide(ev, V2)[0] == "human_review")
ev_nodoc = case(repair_type="ev_high_voltage_battery", incident_report_present="False")
rec, rule, _ = policy.decide(ev_nodoc, V2)
check("the EV trigger beats missing documents and names itself as the rule",
      rec == "human_review" and "R1.ev_battery" in rule, (rec, rule))
check("v1 would have asked for the missing document instead", policy.decide(ev_nodoc, V1)[0] == "request_information")
check("a standard claim with a missing document still requests information",
      policy.decide(case(incident_report_present="False"), V2)[0] == "request_information")
check("the policy version is retained on the policy used", V2["name"] == "v2" and V1["name"] == "v1")

# Closed claims keep their v1 decision; open claims whose next step changes are flagged for recheck.
HEADER = ["case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type", "repair_type", "quote_eur",
          "incident_report_present", "itemized_quote_present", "injury_reported", "liability_disputed",
          "duplicate_flag", "evidence_conflict"]


def line(cid, status, **kw):
    c = case(**kw)
    return [cid, status, "test claim"] + [c[k] for k in HEADER[3:]]


with tempfile.TemporaryDirectory() as d:
    src, out = Path(d) / "claims.csv", Path(d) / "out.csv"
    with open(src, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(HEADER)
        w.writerow(line("OPEN-EV", "open", repair_type="ev_high_voltage_battery"))
        w.writerow(line("CLOSED-EV", "closed", repair_type="ev_high_voltage_battery"))
        w.writerow(line("OPEN-1200", "open", quote_eur="1200"))
        w.writerow(line("OPEN-1201", "open", quote_eur="1201"))
        w.writerow(line("CLOSED-1201", "closed", quote_eur="1201"))
        w.writerow(line("OPEN-EV-NODOC", "open", repair_type="ev_high_voltage_battery", incident_report_present="False"))
    r = subprocess.run([sys.executable, str(HERE / "run.py"), str(src), str(out), "--policy", str(HERE / "policies" / "v2.json")],
                       capture_output=True, text=True, cwd=HERE)
    check("run.py accepts policy v2 and passes its own validator", r.returncode == 0 and "VALIDATION PASSED" in r.stdout, r.stdout[-300:] + r.stderr[-300:])
    res = {x["case_id"]: x for x in csv.DictReader(open(out, encoding="utf-8"))}
    check("an open EV claim flips to human review and is flagged for recheck",
          res["OPEN-EV"]["recommendation_v1"] == "routine_processing" and res["OPEN-EV"]["recommendation_v2"] == "human_review"
          and res["OPEN-EV"]["needs_recheck"] == "True", res["OPEN-EV"])
    check("a closed claim keeps its v1 decision and is not flagged",
          all(res[c]["recommendation_v2"] == res[c]["recommendation_v1"] == "routine_processing" and res[c]["needs_recheck"] == "False"
              for c in ("CLOSED-EV", "CLOSED-1201")), (res["CLOSED-EV"], res["CLOSED-1201"]))
    check("1,200 is unchanged and 1,201 is flagged", res["OPEN-1200"]["needs_recheck"] == "False"
          and res["OPEN-1201"]["recommendation_v2"] == "human_review" and res["OPEN-1201"]["needs_recheck"] == "True")
    check("the EV-with-missing-document claim moves from request information to human review",
          res["OPEN-EV-NODOC"]["recommendation_v1"] == "request_information"
          and res["OPEN-EV-NODOC"]["recommendation_v2"] == "human_review" and "R1.ev_battery" in res["OPEN-EV-NODOC"]["rule_v2"], res["OPEN-EV-NODOC"])

print("ALL V2 TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
