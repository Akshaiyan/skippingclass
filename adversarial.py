"""Adversarial suite: every single-field and pairwise case the policy text implies.

Expected labels come from check_differential.oracle_from_policy_text, which is written
from the policy text, not from triage.py. Agreement = engine matches the written policy
on each constructed case. Writes adversarial_claims.csv for reuse.
"""
import csv
import itertools
from pathlib import Path

import check_differential as cd
import triage
from gen_synthetic import FIELDS

HERE = Path(__file__).parent
BASE = {
    "case_id": "", "case_status": "open", "claim_summary": "adversarial",
    "policy_active_on_incident": "True", "claim_type": "motor_own_damage",
    "repair_type": "standard", "quote_eur": "800.00",
    "incident_report_present": "True", "itemized_quote_present": "True",
    "injury_reported": "False", "liability_disputed": "False",
    "duplicate_flag": "False", "evidence_conflict": "False",
}
REVIEW_TRIGGERS = {
    "policy_active_on_incident": "False",
    "claim_type": "theft",
    "injury_reported": "True",
    "liability_disputed": "True",
    "duplicate_flag": "True",
    "evidence_conflict": "True",
    "quote_eur": "1501.00",
}
EVIDENCE_GAPS = {
    "incident_report_present": "False",
    "itemized_quote_present": "False",
    "quote_eur": "",
}
BLANKABLE = [f for f in FIELDS if f not in ("case_id", "claim_summary")]


def case(cid, **changes):
    row = dict(BASE)
    row.update(changes)
    row["case_id"] = cid
    return row


def build():
    cases = []
    n = 0

    def add(**changes):
        nonlocal n
        n += 1
        cases.append(case(f"ADV-{n:04d}", **changes))

    add()  # clean routine
    add(quote_eur="1500.00")  # boundary inclusive
    add(quote_eur="1500.01")
    add(quote_eur="1499.99")

    for field, value in REVIEW_TRIGGERS.items():
        add(**{field: value})
    for field, value in EVIDENCE_GAPS.items():
        add(**{field: value})
    for field in BLANKABLE:
        add(**{field: ""})  # every field blank, one at a time

    # Pairwise: every pair of review triggers, and every trigger x evidence gap.
    for (f1, v1), (f2, v2) in itertools.combinations(REVIEW_TRIGGERS.items(), 2):
        add(**{f1: v1, f2: v2})
    for (f1, v1) in REVIEW_TRIGGERS.items():
        for (f2, v2) in EVIDENCE_GAPS.items():
            add(**{f1: v1, f2: v2})
    # Pairwise blanks: a blank plus each review trigger.
    for f1 in BLANKABLE:
        for (f2, v2) in REVIEW_TRIGGERS.items():
            if f1 != f2:
                add(**{f1: "", f2: v2})

    return cases


def run():
    cases = build()
    out = HERE / "adversarial_claims.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(cases)

    disagree = []
    for r in cases:
        got = triage.decide_v1(r)[0]
        exp = cd.oracle_from_policy_text(r)
        if got != exp:
            disagree.append((r["case_id"], got, exp))
    print(f"adversarial cases: {len(cases)}")
    print(f"disagreements with written policy: {len(disagree)}")
    for cid, got, exp in disagree[:25]:
        print(f"  {cid}: engine={got} policy={exp}")
    return disagree


if __name__ == "__main__":
    run()
