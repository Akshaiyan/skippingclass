"""Per-claim trace (method M7): the facts and rule behind each decision, one JSON line per claim.

Evidence status: OBSERVED for the round trip (test_all.py: reading the trace back reproduces the
decision from the stored facts alone).
"""
import json

import engine

FACT_FIELDS = [
    "policy_active_on_incident", "claim_type", "repair_type", "quote_eur",
    "incident_report_present", "itemized_quote_present", "injury_reported",
    "liability_disputed", "duplicate_flag", "evidence_conflict",
]


def write_trace(rows, path, policy_version="v1"):
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            rec, rule, why = engine.decide(row)
            entry = {
                "case_id": row["case_id"],
                "policy_version": policy_version,
                "decision": rec,
                "rule_id": rule,
                "explanation": why,
                "facts": {k: row.get(k, "") for k in FACT_FIELDS},
                "blank_fields": [k for k in FACT_FIELDS if (row.get(k) or "").strip() == ""],
            }
            f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")


def read_trace(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def replay_from_trace(entry):
    """Recompute the decision from the stored facts only (no access to the original row)."""
    return engine.decide(entry["facts"])[0]
