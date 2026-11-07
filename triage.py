"""Policy v1 claims triage: deterministic rules, batch CSV in, results CSV out.

Usage: python triage.py <claims.csv> <results.csv>
"""
import csv
import re
import sys

POLICY_VERSION = "v1"
QUOTE_LIMIT_EUR = 1500.0
REVIEW_BOOL_FIELDS = ["injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"]
EVIDENCE_BOOL_FIELDS = ["incident_report_present", "itemized_quote_present"]


_PLAIN_AMOUNT = re.compile(r"[0-9]+(\.[0-9]+)?")


def amount_or_none(raw):
    """A quote is read only as a plain, non-negative decimal. NaN, inf, exponents, signs, underscores and text are
    unreadable (None), so the rules treat them as absent. Decision record: float() accepted 'nan' and 'inf', which
    compare false against every limit and so passed as a known value (red-team finding 2)."""
    s = (raw or "").strip()
    if not _PLAIN_AMOUNT.fullmatch(s):
        return None
    return float(s)


def status_of(row):
    """The one definition of a claim's status: open, closed, or unknown (blank or other). Unknown is never guessed as open.
    Decision record: 'not closed' treated a blank status as open (red-team finding 8)."""
    s = (row.get("case_status") or "").strip().lower()
    return s if s in ("open", "closed") else "unknown"


def parse_bool(value):
    """Return True/False for a known value, None when the field is blank or unreadable."""
    v = (value or "").strip().lower()
    if v in ("true", "1", "yes"):
        return True
    if v in ("false", "0", "no"):
        return False
    return None


def decide_v1(row):
    """Return (recommendation, rule_id, explanation) under policy v1.

    Known review triggers take priority over missing evidence. Blank fields are
    treated as absent facts and are never filled in.
    """
    # Rule 1: known reasons for human review.
    reasons = []
    active = parse_bool(row.get("policy_active_on_incident"))
    if active is False:
        reasons.append("policy not active on incident date")
    claim_type = (row.get("claim_type") or "").strip()
    if claim_type and claim_type != "motor_own_damage":
        reasons.append(f"claim type is {claim_type}, not motor_own_damage")
    for field in REVIEW_BOOL_FIELDS:
        if parse_bool(row.get(field)) is True:
            reasons.append(f"{field} is true")
    quote = amount_or_none(row.get("quote_eur"))
    if quote is not None and quote > QUOTE_LIMIT_EUR:
        reasons.append(f"quote {quote:.0f} EUR is above {QUOTE_LIMIT_EUR:.0f} EUR")
    if reasons:
        return "human_review", "R1", "; ".join(reasons)

    # Rule 2: missing or unreadable facts request information.
    missing = []
    for field in EVIDENCE_BOOL_FIELDS:
        value = parse_bool(row.get(field))
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
    if status_of(row) == "unknown":
        missing.append("case_status is not open or closed")
    for field in REVIEW_BOOL_FIELDS:
        if parse_bool(row.get(field)) is None:
            missing.append(f"{field} is blank")
    if missing:
        return "request_information", "R2", "; ".join(missing)

    # Rule 3: otherwise routine processing (not an approval of payment).
    return "routine_processing", "R3", "no review trigger; evidence complete; quote within limit"


def main(src, dst):
    with open(src, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out_fields = [
        "case_id", "recommendation_v1", "recommendation_v2", "needs_recheck",
        "rule_v1", "rule_v2", "explanation",
    ]
    with open(dst, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        for row in rows:
            rec, rule, why = decide_v1(row)
            closed = status_of(row) == "closed"
            # v2 is not released yet: recommendation_v2 repeats v1 for now.
            writer.writerow({
                "case_id": row["case_id"],
                "recommendation_v1": rec,
                "recommendation_v2": rec,
                "needs_recheck": False,
                "rule_v1": f"{POLICY_VERSION}:{rule}",
                "rule_v2": "v2 not released" if not closed else "closed: retained v1 decision",
                "explanation": why,
            })


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
