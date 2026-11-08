"""A recorded decision is forced to disk before the write returns, and the log stays intact and readable after a
restart (a fresh reader on the same file). Run: python test_durable.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import decision_log  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


REC = {"type": "reviewer_override", "case_id": "PRA-001", "actor": "Jonas Weber", "reason": "Quote confirmed by phone",
       "reason_code": "data_wrong", "policy_version": "v1", "original_recommendation": "request_information",
       "corrected_recommendation": "routine_processing"}

with tempfile.TemporaryDirectory() as d:
    path = Path(d) / "log.ndjson"
    synced = []
    real_fsync = decision_log.os.fsync
    decision_log.os.fsync = lambda fd: (synced.append(fd), real_fsync(fd))[1]
    try:
        log = decision_log.DecisionLog(path)
        for _ in range(3):
            log.append(dict(REC))
    finally:
        decision_log.os.fsync = real_fsync
    check("every record is forced to disk before append returns", len(synced) == 3, synced)
    # A restart is a new reader on the same file: nothing lost, nothing changed.
    again = decision_log.DecisionLog(path).read()
    check("after a restart all three records are there", len(again) == 3, len(again))
    check("the hash chain is intact after the restart", decision_log.verify_chain(path) is None, decision_log.verify_chain(path))
    check("the reviewer, the reason and the policy version are kept", again[0]["actor"] == "Jonas Weber" and again[0]["reason"] and again[0]["policy_version"] == "v1", again[0])

print("ALL DURABILITY TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
