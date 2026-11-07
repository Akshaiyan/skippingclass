"""What policy v2 should recommend, written straight from the change notice and the v1 rules.
Shares no code with policy.py or engine.py, so agreement between them means something.
Rows are the canonical strings that io_csv produces: "True", "False" or "" for booleans, "" for blank."""

import re


def _amount(s):
    """Own strict rule (kept separate from the engine on purpose): a plain non-negative decimal, else unreadable."""
    s = (s or "").strip()
    return float(s) if re.fullmatch(r"[0-9]+(\.[0-9]+)?", s) else None


REQUIRED = ["policy_active_on_incident", "claim_type", "quote_eur", "injury_reported",
            "liability_disputed", "duplicate_flag", "evidence_conflict", "repair_type"]


def oracle_v2(r):
    t = lambda k: r[k] == "True"
    f = lambda k: r[k] == "False"
    q = _amount(r["quote_eur"])
    over = q is not None and q > 1200                                     # exactly 1,200 stays within the limit
    if (f("policy_active_on_incident") or r["claim_type"] not in ("", "motor_own_damage")
            or t("injury_reported") or t("liability_disputed") or t("duplicate_flag") or t("evidence_conflict")
            or over or r["repair_type"] == "ev_high_voltage_battery"):     # EV battery: review whatever the quote
        return "human_review"
    # SOURCE: participant policy v1, blank-field rule: "If an input field is absent or unreadable, do not invent a
    # value. Request information unless another known fact already requires human review." A blank repair_type
    # therefore cannot be ruled out as an EV battery repair, so an otherwise routine claim asks for information.
    if not t("incident_report_present") or not t("itemized_quote_present") or q is None or any(r[k] == "" for k in REQUIRED if k != "quote_eur") or r.get("case_status", "").strip().lower() not in ("open", "closed"):
        return "request_information"
    return "routine_processing"
