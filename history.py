"""Git-like view of the audit log: per-case timeline, policy-version log, rule diff between policies.

Evidence: BUILT + TESTED (test_history.py). Read-only over the decision log and policy files.
CLI: python history.py timeline CASE_ID | policy-log | diff v1.json v2.json | verify
"""
import json, sys
from pathlib import Path
import decision_log
import policy

HERE = Path(__file__).parent
DEFAULT_LOG = HERE / "decision_log.ndjson"


def timeline(case_id, log_path=DEFAULT_LOG):
    return [e for e in decision_log.DecisionLog(log_path).read() if e.get("case_id") == case_id]


def policy_log(log_path=DEFAULT_LOG):
    return [e for e in decision_log.DecisionLog(log_path).read() if e.get("type") == "policy_decision"]


def diff(a, b):
    """Rules added, removed, or changed between two policy dicts, keyed by trigger id."""
    ta = {t["id"]: t for t in a["review_triggers"]}
    tb = {t["id"]: t for t in b["review_triggers"]}
    added = sorted(set(tb) - set(ta))
    removed = sorted(set(ta) - set(tb))
    changed = sorted(i for i in set(ta) & set(tb) if ta[i] != tb[i])
    evidence = {"added": sorted(set(b["evidence"]) - set(a["evidence"])),
                "removed": sorted(set(a["evidence"]) - set(b["evidence"]))}
    return {"added": added, "removed": removed, "changed": changed, "evidence": evidence}


def main(argv):
    if not argv:
        print(__doc__); return 0
    cmd = argv[0]
    if cmd == "timeline":
        for e in timeline(argv[1]):
            print(e["timestamp"], e["type"], e.get("actor", "system"), e.get("reason", ""), e.get("policy_version", ""))
    elif cmd == "policy-log":
        for e in policy_log():
            print(e["timestamp"], e["actor"], e["decision"], e["policy_version"], "-", e["reason"])
    elif cmd == "diff":
        a = policy.load(argv[1]); b = policy.load(argv[2])
        print(json.dumps(diff(a, b), indent=2))
    elif cmd == "verify":
        bad = decision_log.verify_chain(DEFAULT_LOG)
        print("log intact" if bad is None else f"BROKEN at entry {bad[0]}: {bad[1]}")
        return 0 if bad is None else 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
