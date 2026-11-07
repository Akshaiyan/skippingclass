"""Tier 3 tests: hash chain detects tampering; diff lists rules changed between policies."""
import sys, tempfile, os, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import decision_log, history, policy
HERE = Path(__file__).parent
FAILS = []
def check(name, ok):
    print(("PASS" if ok else "FAIL") + ": " + name)
    if not ok: FAILS.append(name)
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'log.ndjson')
    log = decision_log.DecisionLog(p)
    for i in range(3):
        log.append({"type": "reviewer_override", "case_id": f"C{i}", "actor": "rev", "reason": f"r{i}",
                    "policy_version": "v1", "original_recommendation": "routine_processing",
                    "corrected_recommendation": "human_review"})
    check("intact log verifies", decision_log.verify_chain(p) is None)
    lines = open(p, encoding='utf-8').read().splitlines()
    lines[1] = lines[1].replace('"reason": "r1"', '"reason": "edited"')
    open(p, 'w', encoding='utf-8').write("\n".join(lines) + "\n")
    bad = decision_log.verify_chain(p)
    check("tampered middle line is pinpointed to entry 2", bad is not None and bad[0] == 2)
v1 = policy.load(HERE/'policies'/'v1.json'); v2 = policy.load(HERE/'policies'/'v2_new_trigger_ev.json')
d12 = history.diff(v1, v2)
check("diff of v1 vs new-trigger v2 shows exactly the added EV rule", d12['added'] == ['R1.ev_battery'] and not d12['removed'] and not d12['changed'])
d_self = history.diff(v1, v1)
check("diff of a policy with itself is empty", not any(d_self[k] for k in ['added','removed','changed']) and not d_self['evidence']['added'])
print("ALL HISTORY TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
