"""Tier 2 parity: policy-as-data v1 must match engine.decide on every test row (decision and rule class)."""
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import engine, policy
HERE = Path(__file__).parent
rows = []
for f in ['labelled_development_cases.csv', 'unlabelled_practice_cases.csv', 'adversarial_claims.csv', 'final_synthetic_10k.csv']:
    rows += list(csv.DictReader(open(HERE / f, newline='', encoding='utf-8')))
pol = policy.load(HERE / 'policies' / 'v1.json')
mism = []
for r in rows:
    a = engine.decide(r)
    b = policy.decide(r, pol)
    if a[0] != b[0]:
        mism.append((r['case_id'], a[0], b[0]))
print(("PASS" if not mism else "FAIL") + f": policy v1 decision parity on {len(rows)} rows, mismatches {len(mism)}")
if mism: print(mism[:5])
# Load-time validation refuses bad policies
bad = [{"review_triggers": [{"id": "x", "field": "injury_reported", "op": "bogus", "outcome": "human_review"}], "evidence": []},
       {"review_triggers": [{"id": "x", "field": "", "op": "is_true", "outcome": "human_review"}], "evidence": []},
       {"review_triggers": [{"id": "x", "field": "injury_reported", "op": "is_true", "outcome": "approve"}], "evidence": []},
       {"review_triggers": [{"id": "x", "field": "injury_reported", "op": "is_true", "outcome": "human_review"},
                            {"id": "x", "field": "injury_reported", "op": "is_true", "outcome": "human_review"}], "evidence": []}]
refused = 0
for p in bad:
    try:
        policy.load(p); print('FAIL: accepted a bad policy')
    except policy.PolicyError:
        refused += 1
print(("PASS" if refused == len(bad) else "FAIL") + f": {refused}/{len(bad)} bad policies refused at load")
# New operators and an unknown (new) column name are accepted and evaluated
row = {"case_id": "N", "channel": "phone", "claim_type": "motor_own_damage", "quote_eur": "900", "injury_reported": "False",
       "policy_active_on_incident": "True", "incident_report_present": "True", "itemized_quote_present": "True",
       "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False", "bonus_class": "3", "claim_limit": "1000"}
v2x = policy.load({"review_triggers": [
    {"id": "R1.channel_web_only", "field": "channel", "op": "not_in", "value": ["web", "app"], "outcome": "human_review", "description": "claim not from web or app"},
    {"id": "R1.quote_over_claim_limit", "field": "quote_eur", "op": "gt_field", "value": "claim_limit", "outcome": "human_review", "description": "quote above claim limit"}],
  "evidence": ["quote_eur"]})
r1 = policy.decide(row, v2x)
check_new = r1[0] == "human_review" and r1[1] == "R1.channel_web_only"
print(("PASS" if check_new else "FAIL") + f": new column and not_in operator fire ({r1[1]})")
r2 = policy.decide({**row, "channel": "app", "quote_eur": "1200"}, v2x)
check_cross = r2[0] == "human_review" and r2[1] == "R1.quote_over_claim_limit"
print(("PASS" if check_cross else "FAIL") + ": cross-field gt_field operator fires on quote above claim_limit")
r3 = policy.decide({**row, "channel": "app", "quote_eur": "900"}, v2x)
print(("PASS" if r3[0] == "routine_processing" else "FAIL") + ": nothing fires when no trigger applies")
sys.exit(1 if mism or refused != len(bad) or not (check_new and check_cross) else 0)
