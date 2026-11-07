"""Tests for release_gate.py and override_report.py. Run: python test_release_gate.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from release_gate import ReleaseGate, required_clean, upper_bound  # noqa: E402
from override_report import override_report  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("[PASS] " if cond else "[FAIL] ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


# Required clean streak matches the closed form and the known table (2% -> 149 one-sided)
check("required_clean(0.02) == 149", required_clean(0.02) == 149, required_clean(0.02))
check("required_clean(0.05) == 59", required_clean(0.05) == 59, required_clean(0.05))
check("required_clean(0.01) == 299", required_clean(0.01) == 299, required_clean(0.01))

# Zero-error upper bound matches 1 - 0.05^(1/n)
n = 150
check("upper_bound(0, 150) matches 1-0.05^(1/n)",
      abs(upper_bound(0, n) - (1 - 0.05 ** (1 / n))) < 1e-6, upper_bound(0, n))

# Gate stays closed until the streak is met
g = ReleaseGate(target_rate=0.02)
for _ in range(148):
    g.record(True)
check("gate closed at 148 clean audits", not g.is_open, g.status())
g.record(True)
check("gate opens at 149 clean audits", g.is_open, g.status())

# One error closes the gate and resets the streak (no resampling to pass)
g.record(False)
check("gate closes after one error", not g.is_open)
check("streak resets to 0 after an error", g.streak == 0, g.streak)
check("error stays in history", g.errors == 1, g.errors)
for _ in range(149):
    g.record(True)
check("gate reopens only after a fresh 149 clean audits", g.is_open and g.streak == 149, g.status())
check("error still counted in the bound after reopening (1 error in 299 audits)",
      g.status()["upper_bound_all_audits"] == round(upper_bound(1, 299), 4), g.status())

# Bound with errors is larger than without (1 error in 150 -> ~3.7% one-sided per earlier maths)
b1 = upper_bound(1, 150)
check("upper_bound(1,150) between 3% and 4.5%", 0.03 < b1 < 0.045, b1)

# Override report never reassuring without an audit
g2 = ReleaseGate(target_rate=0.02)
r = override_report(decisions_reviewed=500, overrides=0, gate=g2)
check("zero overrides with no audit is NOT reassuring", r["verdict"].startswith("not reassuring"), r["verdict"])
for _ in range(149):
    g2.record(True)
r = override_report(decisions_reviewed=500, overrides=0, gate=g2)
check("zero overrides with a clean audit is consistent, not proof",
      r["verdict"].startswith("consistent"), r["verdict"])
g2.record(False)
r = override_report(decisions_reviewed=500, overrides=0, gate=g2)
check("zero overrides with an audit error is not reassuring", r["verdict"].startswith("not reassuring"))
check("override rate shown with audit", "audit" in r and r["override_rate"] == 0.0)

try:
    override_report(10, 11, g2)
    check("rejects overrides > reviewed", False)
except ValueError:
    check("rejects overrides > reviewed", True)

print()
print("ALL RELEASE-GATE TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
