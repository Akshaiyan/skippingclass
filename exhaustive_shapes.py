"""Every combination of field values the policy text can express, checked against the written-policy oracle
and the data-driven policy. Covers hidden-case shapes we have not seen. Consistency check, not accuracy."""
import itertools, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import engine, policy
from check_differential import oracle_from_policy_text
BOOLS = ["True", "False", ""]
ACTIVE = ["True", "False", ""]
CTYPE = ["motor_own_damage", "theft", "other_type", ""]
QUOTE = ["", "0", "1", "1199.99", "1200", "1500", "1500.00", "1500.01", "1600", "not-a-number"]
base_fields = ["injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict",
               "incident_report_present", "itemized_quote_present"]
pol = policy.load(Path("policies/v1.json"))
total = mis_oracle = mis_policy = 0
examples = []
for active, ctype, quote in itertools.product(ACTIVE, CTYPE, QUOTE):
    for combo in itertools.product(BOOLS, repeat=len(base_fields)):
        row = {"case_id": "S", "case_status": "open", "policy_active_on_incident": active,
               "claim_type": ctype, "quote_eur": quote}
        row.update(dict(zip(base_fields, combo)))
        total += 1
        e = engine.decide(row)[0]
        o = oracle_from_policy_text(row)
        p = policy.decide(row, pol)[0]
        if e != o:
            mis_oracle += 1
            if len(examples) < 3: examples.append(("oracle", row, e, o))
        if e != p:
            mis_policy += 1
            if len(examples) < 3: examples.append(("policy", row, e, p))
print(f"shapes checked: {total}")
print(f"engine vs written-policy oracle mismatches: {mis_oracle}")
print(f"engine vs data-driven policy v1 mismatches: {mis_policy}")
for ex in examples: print("  example:", ex)
sys.exit(1 if mis_oracle or mis_policy else 0)
