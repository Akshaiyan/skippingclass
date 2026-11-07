"""Policy engine with a parameterised quote limit.

Evidence status: OBSERVED for quote_limit=1500 (test_all.py checks it agrees with triage.decide_v1
on every dev, synthetic and adversarial row). A quote limit other than 1500 is a TEST ASSUMPTION
used only to exercise the replay; it is not a policy decision.
"""
import triage

RULE_REVIEW, RULE_REQUEST, RULE_ROUTINE = "R1", "R2", "R3"


def _quote(row):
    return triage.amount_or_none(row.get("quote_eur"))


def decide(row, quote_limit=triage.QUOTE_LIMIT_EUR):
    """Return (recommendation, rule_id, explanation). Same order and blank handling as policy v1."""
    reasons = []
    active = triage.parse_bool(row.get("policy_active_on_incident"))
    claim_type = (row.get("claim_type") or "").strip()
    if active is False:
        reasons.append("policy not active on incident date")
    if claim_type and claim_type != "motor_own_damage":
        reasons.append(f"claim type is {claim_type}, not motor_own_damage")
    for field in triage.REVIEW_BOOL_FIELDS:
        if triage.parse_bool(row.get(field)) is True:
            reasons.append(f"{field} is true")
    quote = _quote(row)
    if quote is not None and quote > quote_limit:
        reasons.append(f"quote {quote:.0f} EUR is above {quote_limit:.0f} EUR")
    if reasons:
        return "human_review", RULE_REVIEW, "; ".join(reasons)

    missing = []
    for field in triage.EVIDENCE_BOOL_FIELDS:
        value = triage.parse_bool(row.get(field))
        if value is False:
            missing.append(f"{field} is false")
        elif value is None:
            missing.append(f"{field} is blank")
    if quote is None:
        missing.append("quote_eur is blank or unreadable")
    if active is None:
        missing.append("policy_active_on_incident is blank")
    if not claim_type:
        missing.append("claim_type is blank")
    if not (row.get("repair_type") or "").strip():
        missing.append("repair_type is blank")
    if triage.status_of(row) == "unknown":
        missing.append("case_status is not open or closed")
    for field in triage.REVIEW_BOOL_FIELDS:
        if triage.parse_bool(row.get(field)) is None:
            missing.append(f"{field} is blank")
    if missing:
        return "request_information", RULE_REQUEST, "; ".join(missing)
    return "routine_processing", RULE_ROUTINE, "no review trigger; evidence complete; quote within limit"
