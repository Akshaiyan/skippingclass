"""Stress tests found by an adversarial red-team (input handling, amounts, spellings, refusals).
Each check reproduces one finding and fails if the fix is removed. Run: python test_robustness.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import engine  # noqa: E402
import io_csv  # noqa: E402
import policy  # noqa: E402
import triage  # noqa: E402
import ui_view  # noqa: E402

V1 = policy.load(Path(__file__).parent / "policies" / "v1.json")
V2 = policy.load(Path(__file__).parent / "policies" / "v2.json")
FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


HEADER = "case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict"
GOOD = "C1,open,Windshield,True,motor_own_damage,standard,800,True,True,False,False,False,False"


def refuses(text):
    try:
        io_csv.read_claims_text(text)
        return False, "accepted"
    except ValueError as exc:
        return True, str(exc)


# Finding 1: an unclosed quote swallowed the rows after it, and the validator could not see the loss
bad_quote = "\n".join([HEADER, GOOD, 'C2,open,"Panel repair,True,motor_own_damage,standard,900,True,True,False,False,False,False', GOOD.replace("C1", "C3")])
ok, msg = refuses(bad_quote)
check("an unclosed quote is refused, not read as fewer claims", ok, msg)

# Finding 4: a field over the size limit crashed with a traceback
ok, msg = refuses("\n".join([HEADER, GOOD.replace("Windshield", "x" * 140000)]))
check("an oversized field is a clear refusal", ok, msg)

# Finding 5, cleaning decision: extra cells from an unquoted comma are merged back into claim_summary, not lost
rows, info = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("Windshield", "Scrape, rear bumper")]))
check("an unquoted comma in claim_summary is repaired, with the text kept",
      rows[0]["claim_summary"] == "Scrape, rear bumper" and rows[0]["injury_reported"] == "False" and info["repaired_lines"] == [2],
      (rows[0]["claim_summary"], info))
ok, msg = refuses("\n".join([HEADER.replace("claim_summary", "notes"), GOOD.replace("Windshield", "Scrape, x")]))
check("extra cells with no claim_summary column are still refused", ok and "claim_summary" in msg, msg)

# Finding 6: a row with no case_id was accepted
ok, msg = refuses("\n".join([HEADER, GOOD.replace("C1", "")]))
check("a row with no case_id is refused", ok and "no case_id" in msg, msg)

# Finding 9: duplicate column names made values ambiguous
ok, msg = refuses("\n".join([HEADER + ",quote_eur", GOOD + ",9000"]))
check("a duplicate column name is refused", ok and "duplicate" in msg, msg)

# Red-team finding 10: a repeated case_id reached the results file before the validator refused it
ok, msg = refuses("\n".join([HEADER, GOOD, GOOD]))
check("a repeated case_id is refused at the reader", ok and "repeats" in msg, msg)
import subprocess
with tempfile.TemporaryDirectory() as d:
    src, out = Path(d) / "dup.csv", Path(d) / "results.csv"
    src.write_text("\n".join([HEADER, GOOD, GOOD]) + "\n", encoding="utf-8")
    r = subprocess.run([sys.executable, "-B", str(Path(__file__).parent / "run.py"), str(src), str(out)], capture_output=True, text=True)
    check("the batch command writes no results file for a repeated case_id", r.returncode != 0 and not out.exists(), (r.returncode, out.exists()))

# Red-team finding 8, decision: a blank or unknown status asks for information; it is never guessed as open
for raw_status, label in [("", "blank"), ("paid", "unknown")]:
    rows, _ = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("open", raw_status)]))
    got = policy.decide(rows[0], V1)[0]
    check(f"a {label} case_status asks for information", got == "request_information", got)
rows, _ = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("open", "Closed")]))
check("'Closed' is still read as closed", triage.status_of(rows[0]) == "closed")
# Decision: a blank repair type asks for information under v1, as the blank-field rule says
row = dict(rows[0]); row["case_status"] = "open"; row["repair_type"] = ""
check("a blank repair type asks for information under v1 (policy and engine)",
      policy.decide(row, V1)[0] == "request_information" and engine.decide(row)[0] == "request_information")
row["quote_eur"] = "1600"
check("a review trigger still beats a blank repair type", policy.decide(row, V1)[0] == "human_review")

# Quarantine: an unreadable value is listed with its line and field, and the row is still decided, not guessed
rows, info = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("False,False,False,False", "maybe,False,False,False")]))
q = info["quarantine"]
check("an unreadable boolean is quarantined with its line and field",
      len(q) == 1 and q[0]["line"] == 2 and q[0]["field"] == "injury_reported" and q[0]["value"] == "maybe", q)
check("a quarantined row is still decided as request information",
      policy.decide(rows[0], V1)[0] == "request_information", policy.decide(rows[0], V1))
rows, info = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("800", "lots")]))
check("an unreadable amount is quarantined", any(x["field"] == "quote_eur" for x in info["quarantine"]), info["quarantine"])
rows, info = io_csv.read_claims_text("\n".join([HEADER, GOOD]))
check("a clean file has nothing quarantined", info["quarantine"] == [], info["quarantine"])

# A short row (trailing blanks dropped by an export tool) is still read, with the missing cells blank
rows, _ = io_csv.read_claims_text("\n".join([HEADER, "C9,open,Short,True,motor_own_damage,standard,800,True,True"]))
check("a short row is read, with missing cells as absent facts",
      rows[0]["injury_reported"] == "" and rows[0]["case_id"] == "C9", rows)

# Finding 2: NaN, inf, exponents, underscores and negative amounts were read as known quotes and routed to routine
for raw in ["NaN", "nan", "-inf", "inf", "1e-9", "1_0", "-1200", "+5", "1200 EUR x"]:
    row = {"case_status": "open", "policy_active_on_incident": "True", "claim_type": "motor_own_damage",
           "repair_type": "standard", "quote_eur": io_csv.clean_amount(raw), "incident_report_present": "True",
           "itemized_quote_present": "True", "injury_reported": "False", "liability_disputed": "False",
           "duplicate_flag": "False", "evidence_conflict": "False"}
    got_policy = policy.decide(row, V1)[0]
    got_engine = engine.decide(row)[0]
    check(f"unreadable quote {raw!r} asks for information in the policy and the engine",
          got_policy == "request_information" and got_engine == "request_information", (got_policy, got_engine))

check("a plain quote is still read", triage.amount_or_none("1200") == 1200.0 and triage.amount_or_none("1200.50") == 1200.5)

# Finding 3: EV battery missed under v2 for some spellings
for spelling in ["EV High Voltage Battery", "EV High Voltage Battery (HV)", "EV HİGH VOLTAGE BATTERY",
                 "Hochvolt-Batterie", "ev-high-voltage-battery", "EV_HIGH_VOLTAGE_BATTERY", " ev high voltage battery "]:
    rows, _ = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("standard", spelling)]))
    row = rows[0]
    check(f"EV spelling {ascii(spelling)} is recognised under v2", policy.decide(row, V2)[0] == "human_review",
          (row["repair_type"], policy.decide(row, V2)))

# Finding 7: NaN in a fact made the JSON invalid for the app
rows, _ = io_csv.read_claims_text("\n".join([HEADER, GOOD.replace("800", "NaN")]))
view = ui_view.case_view(rows[0], V1, V2, "h1", "h2")
try:
    json.dumps(view, allow_nan=False)
    strict = True
except ValueError:
    strict = False
check("a non-finite amount never produces invalid JSON for the app", strict)

# Documented limit (not fixed): an unquoted comma that happens to fill the header's cell count cannot be told
# apart from a valid row, so the values can shift. The outcome is never routine on the wrong basis for those
# two inputs; the limit is recorded, not hidden.
print("ALL ROBUSTNESS TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
