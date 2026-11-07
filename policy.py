"""Policy as data: a policy is a JSON file, so a policy change is a file edit, not a code edit.

Structure (order matters, first match wins):
  review_triggers: list of {id, field, op, value, outcome}; any True trigger gives its outcome
  evidence: fields that must be present; a blank or False evidence field gives request_information
  Blank fields are Unknown; an Unknown trigger or evidence field gives request_information.

Evidence status: BUILT, parity with engine.decide is tested (test_policy.py) before use.
ops: is_true, is_false, eq, ne, gt, gte, lt, lte, blank
ponytail: JSON, not YAML (stdlib only). Known ceiling: no date or cross-field ops yet.
Upgrade trigger: a v2 change that needs them.
"""
import json
from pathlib import Path

OPS = {"is_true", "is_false", "eq", "ne", "gt", "gte", "lt", "lte", "blank", "in", "not_in", "gt_field", "lt_field"}
OUTCOMES = {"routine_processing", "request_information", "human_review"}
BOOL_FIELDS = {"policy_active_on_incident", "incident_report_present", "itemized_quote_present",
               "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"}
NUM_FIELDS = {"quote_eur"}


class PolicyError(ValueError):
    pass


def _bool(v):
    s = (v or "").strip().lower()
    if s == "true":
        return True
    if s == "false":
        return False
    return None


def _num(v):
    try:
        return float((v or "").strip())
    except ValueError:
        return None


def _value(row, field):
    """Return (known, value). Known is False for blank or unreadable."""
    raw = (row.get(field) or "").strip()
    if field in BOOL_FIELDS:
        b = _bool(raw)
        return (b is not None), b
    if field in NUM_FIELDS:
        n = _num(raw)
        return (n is not None), n
    return (raw != ""), raw


def _check(cond, row):
    """Three-valued: returns True, False, or None (Unknown)."""
    field, op, value = cond["field"], cond["op"], cond.get("value")
    known, actual = _value(row, field)
    if op == "blank":
        return not known
    if not known:
        return None
    if op in ("in", "not_in"):
        member = str(actual).strip().lower() in {str(v).strip().lower() for v in value}
        return member if op == "in" else not member
    if op in ("gt_field", "lt_field"):
        other_known, other = _value(row, value)
        a, b = _num(str(actual)), _num(str(other))
        if not other_known or a is None or b is None:
            return None
        return a > b if op == "gt_field" else a < b
    if op in ("gt", "gte", "lt", "lte"):
        a = _num(str(actual))
        if a is None:
            return None
        return {"gt": a > value, "gte": a >= value, "lt": a < value, "lte": a <= value}[op]
    if op == "is_true":
        return actual is True
    if op == "is_false":
        return actual is False
    if op == "eq":
        return actual == value
    if op == "ne":
        return actual != value
    if op == "gt":
        return actual > value
    if op == "gte":
        return actual >= value
    if op == "lt":
        return actual < value
    if op == "lte":
        return actual <= value
    raise PolicyError(f"unknown op {op}")


def validate(policy):
    if not isinstance(policy, dict) or "review_triggers" not in policy or "evidence" not in policy:
        raise PolicyError("policy needs review_triggers and evidence")
    seen = set()
    for t in policy["review_triggers"]:
        if t.get("id") in seen:
            raise PolicyError(f"duplicate id {t.get('id')}")
        seen.add(t.get("id"))
        if t.get("op") not in OPS:
            raise PolicyError(f"{t.get('id')}: unknown op {t.get('op')}")
        if not isinstance(t.get("field"), str) or not t.get("field"):
            raise PolicyError(f"{t.get('id')}: field must be a non-empty column name")
        if t.get("outcome") not in OUTCOMES:
            raise PolicyError(f"{t.get('id')}: unknown outcome {t.get('outcome')}")
    for f in policy["evidence"]:
        if not isinstance(f, str) or not f:
            raise PolicyError("evidence entries must be non-empty column names")
    return policy


def load(path_or_dict):
    if isinstance(path_or_dict, dict):
        return validate(path_or_dict)
    return validate(json.loads(Path(path_or_dict).read_text(encoding="utf-8")))


def decide(row, policy):
    """Return (recommendation, rule_id, explanation). Same precedence as engine.decide."""
    fired, unknown = [], []
    for t in policy["review_triggers"]:
        r = _check(t, row)
        if r is True:
            fired.append(t)
        elif r is None:
            unknown.append(t["id"])
    if fired:
        ids = "+".join(t["id"] for t in fired)
        return fired[0]["outcome"], ids, "; ".join(t.get("description", t["id"]) for t in fired)
    missing = []
    for f in policy["evidence"]:
        known, val = _value(row, f)
        if not known:
            missing.append(f"{f} is blank")
        elif f in policy.get("must_be_true", []) and val is False:
            missing.append(f"{f} is false")
    if unknown or missing:
        return "request_information", "ABSENT", "; ".join(missing + [f"unknown: {u}" for u in unknown])
    return "routine_processing", "R3.routine", "no review trigger; evidence complete"
