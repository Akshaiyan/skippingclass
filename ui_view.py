"""JSON shapes for the team's web app. Every recommendation comes from the triage engine (policy.py), never from the browser.

to_ui_rules() turns a policy file into the app's rule format (first match wins, like the engine):
- each review trigger becomes a rule with the same outcome;
- an unknown review trigger (its field is blank) asks for information, as the engine does;
- a blank evidence field asks for information; a must-be-true field that is false asks for information;
- otherwise routine processing.
test_ui_view.py checks this against the engine on every combination of the policy's fields.
"""
import hashlib
from pathlib import Path

import io_csv
import triage
import policy
import suggest

HERE = Path(__file__).parent
V1_PATH = HERE / "policies" / "v1.json"
V2_PATH = HERE / "policies" / "v2.json"
FLOW = {"routine_processing": "green", "request_information": "yellow", "human_review": "red"}
# Columns that are never facts for the reviewer: the free-text summary, and reference labels (expected_v1 is an
# organiser label on the dev file; showing it would leak the answer key into the review screen).
NOT_FACTS = {"claim_summary", "expected_v1"}
BLANKABLE = ["policy_active_on_incident", "claim_type", "repair_type", "quote_eur", "incident_report_present",
             "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"]
OP_MAP = {"eq": "eq", "ne": "neq", "gt": "gt", "gte": "gte", "lt": "lt", "lte": "lte", "in": "in", "not_in": "not_in"}
WORDS = {"policy_active_on_incident": "Policy active on the incident date", "claim_type": "Claim type",
         "repair_type": "Repair type", "quote_eur": "Repair quote (EUR)", "incident_report_present": "Incident report",
         "itemized_quote_present": "Itemised repair quote", "injury_reported": "Injury reported",
         "liability_disputed": "Liability disputed", "duplicate_flag": "Duplicate flag",
         "evidence_conflict": "Evidence conflicts with the description"}


def policy_hash(path):
    return "sha256:" + hashlib.sha256(Path(path).read_bytes()).hexdigest()[:12]


def _condition(t):
    field, op = t["field"], t["op"]
    if op == "is_true":
        return {"field": field, "op": "eq", "right": {"kind": "value", "value": True}}
    if op == "is_false":
        return {"field": field, "op": "eq", "right": {"kind": "value", "value": False}}
    if op in ("gt_field", "lt_field"):
        return {"field": field, "op": "gt" if op == "gt_field" else "lt", "right": {"kind": "field", "field": t["value"]}}
    if op == "blank":
        return {"field": field, "op": "is_blank"}
    return {"field": field, "op": OP_MAP[op], "right": {"kind": "value", "value": t["value"]}}


def to_ui_rules(p):
    rules = []
    for t in p["review_triggers"]:
        rules.append({"id": t["id"], "outcome": t["outcome"], "description": t.get("description", t["id"]),
                      "condition": _condition(t)})
    for t in p["review_triggers"]:
        rules.append({"id": f"R2.unknown.{t['id']}", "outcome": "request_information",
                      "description": f"Cannot yet rule out: {t.get('description', t['id'])}",
                      "condition": {"field": t["field"], "op": "is_blank"}})
    for f in p["evidence"]:
        rules.append({"id": f"R2.blank.{f}", "outcome": "request_information",
                      "description": f"{WORDS.get(f, f)} not provided", "condition": {"field": f, "op": "is_blank"}})
    for f in p.get("must_be_true", []):
        rules.append({"id": f"R2.false.{f}", "outcome": "request_information",
                      "description": f"{WORDS.get(f, f)} is false",
                      "condition": {"field": f, "op": "eq", "right": {"kind": "value", "value": False}}})
    rules.append({"id": "R2.status_unknown", "outcome": "request_information",
                  "description": "Case status is not open or closed",
                  "condition": {"field": "case_status", "op": "not_in", "right": {"kind": "value", "value": ["open", "closed"]}}})
    rules.append({"id": "R2.status_blank", "outcome": "request_information", "description": "Case status not provided",
                  "condition": {"field": "case_status", "op": "is_blank"}})
    rules.append({"id": "R3.routine", "outcome": "routine_processing",
                  "description": "Otherwise: routine processing", "condition": None})
    return rules


def typed(v):
    """Turn a canonical CSV string into the value the app shows: bool, number, null for blank, or text."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    if s in ("True", "False"):
        return s == "True"
    import triage
    n = triage.amount_or_none(s)
    if n is None:
        return s
    return int(n) if n.is_integer() else n


def checklist(row, p):
    out = []
    for t in p["review_triggers"]:
        r = policy._check(t, row)
        result = "true" if r is True else "false" if r is False else "unknown"
        known, actual = policy._value(row, t["field"])
        ev = "blank" if not known else str(actual)
        out.append({"id": t["id"], "description": t.get("description", t["id"]), "outcome": t["outcome"],
                    "result": result, "evidence": ev})
    return out


def case_view(row, v1, v2, v1_hash, v2_hash):
    open_ = triage.status_of(row) == "open"
    rec1, rule1, why1 = policy.decide(row, v1)
    rec2, rule2, _ = policy.decide(row, v2) if open_ else (None, None, None)
    facts = {k: typed(v) for k, v in row.items() if k not in NOT_FACTS}
    return {
        "case_id": row["case_id"],
        "case_status": triage.status_of(row),
        "claim_summary": row.get("claim_summary", ""),
        "recommendation_v1": rec1,
        "recommendation_v2": rec2 if open_ else None,
        "flow": FLOW[rec1],
        "rule_v1": rule1,
        "rule_v2": rule2 if open_ else None,
        "explanation": why1,
        "checklist": checklist(row, v1),
        "facts": facts,
        "blank_fields": [f for f in BLANKABLE if (row.get(f) or "").strip() == ""],
        "policy_version": "v1",
        "policy_hash": v1_hash,
        "needs_recheck": bool(open_ and rec1 != rec2),
        "suggestion": suggest.suggest(row),
    }


def cases(cases_path, v1, v2, v1_hash, v2_hash):
    rows, _ = io_csv.read_claims(cases_path)
    return [case_view(r, v1, v2, v1_hash, v2_hash) for r in rows]


def ui_log_entry(e, seq):
    """A log record in the app's shape, keeping our hash-chain fields so the app can show the fingerprint."""
    base = {"seq": seq, "actor": e.get("actor", ""), "timestamp": e.get("timestamp", ""),
            "policy_version": e.get("policy_version", ""), "hash": e.get("hash", ""), "prev_hash": e.get("prev_hash", "")}
    if e.get("type") == "reviewer_override":
        return {**base, "type": "reviewer_override", "case_id": e["case_id"],
                "from_rec": e["original_recommendation"], "to_rec": e["corrected_recommendation"],
                "reason_code": e.get("reason_code") or "judgement", "note": e.get("reason", ""),
                "policy_hash": e.get("policy_hash", "")}
    if e.get("type") == "policy_decision":
        return {**base, "type": "policy_approved" if e.get("decision") == "approved" else "policy_rejected",
                "reason": e.get("reason", ""), "policy_hash": e.get("policy_hash", ""),
                "affected": e.get("affected", []), "proposed_by": e.get("proposed_by", "")}
    return {**base, "type": e.get("type", "unknown")}


def change_summary(cases_path, v1, v2, v1_hash, v2_hash):
    """What a policy change does, before anyone releases it.
    Open claims whose recommendation changes are listed, grouped by transition and by the v2 rule that decides.
    Closed claims are never re-decided (they keep v1). Any move into routine needs a named sign-off."""
    from collections import Counter
    rows, _ = io_csv.read_claims(cases_path)
    open_rows = [r for r in rows if triage.status_of(r) == "open"]
    flips = []
    for r in open_rows:
        a, rule_a, _ = policy.decide(r, v1)
        b, rule_b, _ = policy.decide(r, v2)
        if a != b:
            flips.append({"case_id": r["case_id"], "from": a, "to": b, "rule_from": rule_a, "rule_to": rule_b})
    transitions = Counter(f"{f['from']} -> {f['to']}" for f in flips)
    by_rule = Counter(f["rule_to"] for f in flips)
    into_routine = [f["case_id"] for f in flips if f["to"] == "routine_processing"]
    return {
        "from": "v1", "to": "v2", "v1_hash": v1_hash, "v2_hash": v2_hash,
        "open_total": len(open_rows), "open_changed": len(flips), "open_unchanged": len(open_rows) - len(flips),
        "closed_kept_as_v1": len(rows) - len(open_rows),
        "transitions": dict(transitions), "by_rule": dict(by_rule),
        "flips": flips, "into_routine": into_routine,
        "requires_signoff": bool(into_routine),
        "note": "Flagged claims need a reviewer to re-decide. Nothing changes a decision automatically.",
    }
