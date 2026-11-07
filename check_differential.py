"""Differential test: compare triage.py against an independent implementation written
straight from the policy text. Agreement catches coding errors, not misreadings
of the policy itself.
"""
import csv
import sys
from pathlib import Path

import triage


def parse(v):
    """True / False / None (absent). Blank and unreadable are absent."""
    s = (v or "").strip().lower()
    if s == "true":
        return True
    if s == "false":
        return False
    return None


def oracle_from_policy_text(r):
    """Written from the policy's three numbered rules, not from triage.py."""
    # Rule 1: any KNOWN reason for human review.
    known_review = []
    if parse(r["policy_active_on_incident"]) is False:
        known_review.append("inactive")
    if r["claim_type"].strip() not in ("", "motor_own_damage"):
        known_review.append("type")
    for k in ("injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"):
        if parse(r[k]) is True:
            known_review.append(k)
    q = r["quote_eur"].strip()
    if q:
        try:
            if float(q) > 1500:
                known_review.append("quote")
        except ValueError:
            pass
    if known_review:
        return "human_review"
    # Rule 2: any missing or unknown evidence -> request information.
    if parse(r["incident_report_present"]) is not True:
        return "request_information"
    if parse(r["itemized_quote_present"]) is not True:
        return "request_information"
    if not q:
        return "request_information"
    try:
        float(q)
    except ValueError:
        return "request_information"
    # Rule 3.
    if parse(r["policy_active_on_incident"]) is None or not r["claim_type"].strip():
        return "request_information"
    for k in ("injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"):
        if parse(r[k]) is None:
            return "request_information"
    return "routine_processing"


def main(path):
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    disagree = []
    for r in rows:
        a = triage.decide_v1(r)[0]
        b = oracle_from_policy_text(r)
        if a != b:
            disagree.append((r["case_id"], a, b))
    print(f"cases: {len(rows)}  disagreements: {len(disagree)}")
    for case_id, a, b in disagree[:20]:
        print(f"  {case_id}: triage={a}  oracle={b}")
    return len(disagree)


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1]) else 0)
