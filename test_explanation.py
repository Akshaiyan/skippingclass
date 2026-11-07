"""A results row's explanation must describe its own recommendations. Found by the judge simulator: under v2 a claim
sent to review kept the v1 'no review trigger' explanation. Run: python test_explanation.py"""
import csv
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
FAILS = []
HEADER = "case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict"
with tempfile.TemporaryDirectory() as d:
    src, out = Path(d) / "c.csv", Path(d) / "r.csv"
    src.write_text("\n".join([HEADER, "X1,open,Panel,True,motor_own_damage,standard,1300,True,True,False,False,False,False"]) + "\n", encoding="utf-8")
    r = subprocess.run([sys.executable, "-B", str(HERE / "run.py"), str(src), str(out), "--policy", str(HERE / "policies" / "v2.json")], capture_output=True, text=True)
    row = next(csv.DictReader(open(out, encoding="utf-8")))
    ok = row["recommendation_v1"] == "routine_processing" and row["recommendation_v2"] == "human_review"
    ok = ok and "v1: " in row["explanation"] and "v2:" in row["explanation"].lower() and "no review trigger" not in row["explanation"].split(";")[-1]
    print(("PASS" if ok else "FAIL") + ": a claim that v2 sends to review explains the v2 decision, not only v1")
    if not ok:
        FAILS.append("explanation")
print("ALL EXPLANATION TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
