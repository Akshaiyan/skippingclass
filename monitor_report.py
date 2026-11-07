"""Post-deployment signals from the decision log: overrides by direction, integrity, and policy sign-offs.
Stdlib only. Run: python monitor_report.py [log.ndjson]   (default: decision_log.ndjson in this folder)
Direction: an override to routine_processing is an incorrect-routine signal; an override to human_review is an
unnecessary-review signal. Other directions are reported as-is."""
import json
import sys
from collections import Counter
from pathlib import Path

import decision_log

HERE = Path(__file__).parent


def report(path):
    path = Path(path)
    if not path.exists():
        print(f"no decision log at {path}: nothing recorded yet")
        return 0
    bad = decision_log.verify_chain(path)
    entries = decision_log.DecisionLog(path).read()
    overrides = [e for e in entries if e.get("type") == "reviewer_override"]
    decisions = [e for e in entries if e.get("type") == "policy_decision"]
    by_dir = Counter((e["original_recommendation"], e["corrected_recommendation"]) for e in overrides)
    by_rule = Counter(e["case_id"] for e in overrides)
    print(f"log: {len(entries)} records; integrity: {'intact' if bad is None else f'BROKEN at entry {bad[0]}: {bad[1]}'}")
    print(f"overrides: {len(overrides)}; policy decisions: {len(decisions)}")
    print(f"incorrect-routine signal (override to routine): {sum(v for (a, b), v in by_dir.items() if b == 'routine_processing')}")
    print(f"unnecessary-review signal (override to human review): {sum(v for (a, b), v in by_dir.items() if b == 'human_review')}")
    for (a, b), v in sorted(by_dir.items()):
        print(f"  {a} -> {b}: {v}")
    print("claims with the most overrides:", by_rule.most_common(3) or "none")
    return 0 if bad is None else 1


if __name__ == "__main__":
    sys.exit(report(sys.argv[1] if len(sys.argv) > 1 else HERE / "decision_log.ndjson"))
