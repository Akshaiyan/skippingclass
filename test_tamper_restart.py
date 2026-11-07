"""Tampering and restart: edits, deletions and reordering are detected; a torn last line from a crash mid-write
is reported, answered with 503, and repairable without losing a record; damage in the middle is never repaired
automatically. Uses a temporary log only. Run: python test_tamper_restart.py"""
import json
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


def fresh_log(n=4):
    d = Path(tempfile.mkdtemp()) / "log.ndjson"
    log = dl.DecisionLog(d)
    for i in range(n):
        log.append({"type": "reviewer_override", "case_id": f"C{i}", "actor": "a", "reason": "r", "policy_version": "v1",
                    "original_recommendation": "routine_processing", "corrected_recommendation": "human_review"})
    return d


d = fresh_log()
lines = d.read_text(encoding="utf-8").splitlines()
check("an intact log verifies", dl.verify_chain(d) is None)

t = d.with_name("edit.ndjson")
x = json.loads(lines[1]); x["reason"] = "changed afterwards"
t.write_text("\n".join([lines[0], json.dumps(x, sort_keys=True)] + lines[2:]) + "\n", encoding="utf-8")
check("an edited record is detected at its line", dl.verify_chain(t) == (2, "hash does not match the entry contents"), dl.verify_chain(t))

t = d.with_name("delete.ndjson")
t.write_text("\n".join([lines[0]] + lines[2:]) + "\n", encoding="utf-8")
check("a deleted record is detected", dl.verify_chain(t) is not None, dl.verify_chain(t))

t = d.with_name("swap.ndjson")
t.write_text("\n".join([lines[0], lines[2], lines[1]] + lines[3:]) + "\n", encoding="utf-8")
check("reordered records are detected", dl.verify_chain(t) is not None, dl.verify_chain(t))

torn = d.with_name("torn.ndjson")
torn.write_text("\n".join(lines[:3]) + "\n" + lines[3][:30], encoding="utf-8")
check("a torn last line is reported at its line, not a crash", dl.verify_chain(torn) is not None and dl.verify_chain(torn)[0] == 4, dl.verify_chain(torn))

old_path = server.LOG_PATH
server.LOG_PATH = torn
try:
    st, body = server.handle("GET", "/api/log", {}, {})
    check("with a torn log, the log endpoint answers 503 with the line", st == 503 and "line 4" in body["error"], (st, body))
    st, body = server.handle("POST", "/api/override", {}, {"case_id": "PRA-001", "actor": "x", "note": "n", "to_rec": "human_review", "policy_version": "v1"})
    check("with a torn log, a write answers 503 and is not recorded", st == 503, (st, body))
finally:
    server.LOG_PATH = old_path

check("repair moves only the torn line aside", dl.repair(torn) is not None)
check("after repair the chain verifies and all intact records are kept",
      dl.verify_chain(torn) is None and len(dl.DecisionLog(torn).read()) == 3)
check("the torn text is kept beside the log, not discarded", torn.with_name("torn.ndjson.torn").exists())

middle = d.with_name("middle.ndjson")
middle.write_text("\n".join([lines[0], "not json", lines[2]]) + "\n", encoding="utf-8")
try:
    dl.repair(middle)
    check("damage in the middle is never repaired automatically", False, "repair ran")
except dl.LogDamaged:
    check("damage in the middle is never repaired automatically", middle.read_text(encoding="utf-8").splitlines()[1] == "not json")

print("ALL TAMPER AND RESTART TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
