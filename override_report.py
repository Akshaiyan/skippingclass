"""Override report: never shows an override rate without the audit result beside it.

Why: a low override rate can mean the reviewers are not catching errors (deskilling / automation
bias), not that the system is right. So the report only says 'reassuring' when the audit
sample is large enough AND shows no errors. Evidence status: BUILT + TESTED (test_release_gate.py).
"""
from release_gate import ReleaseGate


def override_report(decisions_reviewed: int, overrides: int, gate: ReleaseGate) -> dict:
    if decisions_reviewed < 0 or overrides < 0 or overrides > decisions_reviewed:
        raise ValueError("invalid counts")
    rate = overrides / decisions_reviewed if decisions_reviewed else None
    st = gate.status()
    audit_ok = st["gate_open"] and st["errors_total"] == 0
    if rate is None:
        verdict = "no reviewed decisions yet"
    elif not audit_ok:
        verdict = "not reassuring: audit sample incomplete or contains errors"
    else:
        verdict = "consistent with the audit: override rate is not the only evidence"
    return {
        "override_rate": None if rate is None else round(rate, 4),
        "decisions_reviewed": decisions_reviewed,
        "overrides": overrides,
        "audit": st,
        "verdict": verdict,
        "rule": "override rate is always shown with the audit result; never alone",
    }
