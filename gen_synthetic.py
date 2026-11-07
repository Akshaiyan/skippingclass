"""Seeded synthetic motor-claim generator for robustness testing (NOT accuracy testing).

Labels come from the policy, so they are circular for accuracy. This checks that the
engine is consistent across the input space: boundaries, blanks, combinations.

Distribution parameters are ASSUMPTIONS, not measured values. Replace them with
figures from public sources once they are checked (see the research notes).
"""
import csv
import random
import sys
from pathlib import Path

FIELDS = [
    "case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type",
    "repair_type", "quote_eur", "incident_report_present", "itemized_quote_present",
    "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict",
]

# EVIDENCE CHAIN (research-simulate-encode step 4, updated 2026-11-07).
# Step 1 findings:
#   - freMTPL2 (mabilton/fremtpl2 README) [FETCHED-FULL]: GPL-2.0; 678,013 policies;
#     "about 96% of policies have no associated claims". Frequency and severity NOT stated.
#     GPL-2.0 is copyleft: do not ship derived data in the submission without a licence review.
#   - Triple-I auto statistics (iii.org) [FETCHED-FULL]: US liability coverage only, ISO data.
#     BI frequency 0.80 and PD 2.50 per 100 car-years (2024); severity $28,278 BI, $6,770 PD.
#     Liability payouts, NOT own-damage repair quotes. Copyright notice; reuse terms not stated.
#   - Spanish portfolio dataset (ResearchGate): [NOT VERIFIED] (HTTP 403, not read).
# Consequence: no public source gives a per-claim rate for any field in our schema
# (injury share, dispute rate, duplicate rate, evidence conflict, missing documents, EV share,
# own-damage quote distribution). Every value below stays an ASSUMPTION. Step 2 cannot
# validate them against a public target, so the generator is for consistency testing only.
#
# ASSUMED rates. Each one is a placeholder chosen for coverage, not a measured value.
P = {
    "policy_inactive": 0.02,
    "claim_type_other": 0.04,
    "ev_battery": 0.08,
    "injury": 0.03,
    "liability_disputed": 0.05,
    "duplicate": 0.02,
    "evidence_conflict": 0.03,
    "missing_report": 0.10,
    "missing_itemized": 0.08,
    "blank_rate": 0.03,         # per field, for blank-handling coverage
    "closed": 0.30,
}
QUOTE_MEDIAN_EUR = 800.0       # ASSUMED
QUOTE_SIGMA = 0.9              # ASSUMED lognormal spread
BOUNDARY_RATE = 0.10           # extra mass exactly at / around the 1500 EUR limit


def sample_quote(rng):
    roll = rng.random()
    if roll < BOUNDARY_RATE / 3:
        return 1500.0
    if roll < 2 * BOUNDARY_RATE / 3:
        return 1501.0
    if roll < BOUNDARY_RATE:
        return 1499.0
    return round(rng.lognormvariate(__import__("math").log(QUOTE_MEDIAN_EUR), QUOTE_SIGMA), 2)


def bool_str(rng, p_true):
    return "True" if rng.random() < p_true else "False"


def maybe_blank(rng, value):
    return "" if rng.random() < P["blank_rate"] else value


def make_claim(rng, idx):
    claim_type = "theft" if rng.random() < P["claim_type_other"] else "motor_own_damage"
    repair = "ev_high_voltage_battery" if rng.random() < P["ev_battery"] else "standard"
    row = {
        "case_id": f"SYN-{idx:05d}",
        "case_status": "closed" if rng.random() < P["closed"] else "open",
        "claim_summary": "synthetic claim",
        "policy_active_on_incident": maybe_blank(rng, bool_str(rng, 1 - P["policy_inactive"])),
        "claim_type": maybe_blank(rng, claim_type),
        "repair_type": repair,
        "quote_eur": maybe_blank(rng, f"{sample_quote(rng):.2f}"),
        "incident_report_present": maybe_blank(rng, bool_str(rng, 1 - P["missing_report"])),
        "itemized_quote_present": maybe_blank(rng, bool_str(rng, 1 - P["missing_itemized"])),
        "injury_reported": maybe_blank(rng, bool_str(rng, P["injury"])),
        "liability_disputed": maybe_blank(rng, bool_str(rng, P["liability_disputed"])),
        "duplicate_flag": maybe_blank(rng, bool_str(rng, P["duplicate"])),
        "evidence_conflict": maybe_blank(rng, bool_str(rng, P["evidence_conflict"])),
    }
    return row


def main(n, seed, out_path):
    rng = random.Random(seed)
    rows = [make_claim(rng, i) for i in range(n)]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {n} claims to {out_path} (seed={seed})")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    out = sys.argv[3] if len(sys.argv) > 3 else str(Path(__file__).parent / "synthetic_claims.csv")
    main(n, seed, out)
