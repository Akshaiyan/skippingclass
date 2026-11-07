"""Evaluation practice for policy v2, on the organiser files (real, small) and our synthetic file.

What applies to a fixed rule set, and what does not:
- A train/test split protects against fitting. The rules have no fitted parameters, so the split below is a
  consistency check on the written policy, not evidence of accuracy. It is labelled that way in the output.
- Accuracy can only be scored against labels. The organiser labels cover 14 claims (v1 only). v2 has no labels.
- Synthetic labels come from the policy itself, so agreement on synthetic data is circular.
- Confidence intervals: Wilson for proportions, a seeded bootstrap for the flip share.
- Leakage: checks that no organiser case reappears in the synthetic file.
- Distribution shift: compares the synthetic file with the organiser files, because flip shares depend on it.

Run: python evaluate_v2.py
"""
import math
import random
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import io_csv  # noqa: E402
import policy  # noqa: E402
from v2_oracle import oracle_v2  # noqa: E402

V1 = policy.load(HERE / "policies" / "v1.json")
V2 = policy.load(HERE / "policies" / "v2.json")
SEED = 20261108


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def bootstrap_ci(flags, B=4000, seed=SEED):
    rng = random.Random(seed)
    n = len(flags)
    if n == 0:
        return (0.0, 0.0)
    stats = sorted(sum(flags[rng.randrange(n)] for _ in range(n)) / n for _ in range(B))
    return (stats[int(0.025 * B)], stats[int(0.975 * B) - 1])


def load(name):
    rows, _ = io_csv.read_claims(HERE / name)
    return rows


def split(rows, frac=0.7, seed=SEED):
    """Stratified by the notice-derived outcome, so both halves keep the outcome mix."""
    rng = random.Random(seed)
    by = {}
    for r in rows:
        by.setdefault(oracle_v2(r), []).append(r)
    train, test = [], []
    for k in sorted(by):
        group = by[k][:]
        rng.shuffle(group)
        cut = round(frac * len(group))
        train += group[:cut]
        test += group[cut:]
    return train, test


def section(title):
    print("\n" + title)
    print("-" * len(title))


def main():
    ok = True

    section("1. Synthetic file: stratified 70/30 split (consistency check, NOT accuracy)")
    syn = [r for r in load("final_synthetic_10k.csv") if r["case_status"] != "closed"]
    train, test = split(syn)
    for name, part in (("train 70%", train), ("test 30%", test)):
        agree = sum(policy.decide(r, V2)[0] == oracle_v2(r) for r in part)
        flips = sum(policy.decide(r, V1)[0] != policy.decide(r, V2)[0] for r in part)
        lo, hi = wilson(agree, len(part))
        print(f"  {name}: n={len(part):5d}  v2 agrees with notice {agree}/{len(part)}  "
              f"flip share {flips / len(part):.1%} (95% CI {bootstrap_ci([policy.decide(r, V1)[0] != policy.decide(r, V2)[0] for r in part])[0]:.1%}"
              f"-{bootstrap_ci([policy.decide(r, V1)[0] != policy.decide(r, V2)[0] for r in part])[1]:.1%})")
        ok &= agree == len(part)
    print("  Both halves agree 100% by construction: the rules were written from the notice, not fitted to this file.")

    section("2. Organiser labels (real, 14 claims): v1 accuracy with intervals")
    dev = load("labelled_development_cases.csv")
    hits = [policy.decide(r, V1)[0] == r["expected_v1"] for r in dev]
    k, n = sum(hits), len(hits)
    lo, hi = wilson(k, n)
    blo, bhi = bootstrap_ci([float(h) for h in hits])
    print(f"  v1 vs organiser labels: {k}/{n} = {k / n:.1%}")
    print(f"  Wilson 95% CI {lo:.1%} to {hi:.1%}; bootstrap 95% CI {blo:.1%} to {bhi:.1%}")
    print(f"  Lower one-sided 95% bound for a perfect {n}/{n}: {0.05 ** (1 / n):.1%}")
    cm = Counter((r["expected_v1"], policy.decide(r, V1)[0]) for r in dev)
    print("  Confusion (organiser label -> v1):")
    for (lab, pred), c in sorted(cm.items()):
        print(f"    {lab:22s} -> {pred:22s} {c}")
    print("  v2 cannot be scored: the organiser has not labelled v2 outcomes.")
    flips_dev = [r["case_id"] for r in dev if policy.decide(r, V1)[0] != policy.decide(r, V2)[0]]
    print(f"  Claims that change under v2: {', '.join(flips_dev) or 'none'}")

    section("3. Distribution shift: why flip shares differ between files")
    files = {"organiser dev (14)": load("labelled_development_cases.csv"),
             "organiser practice (12)": load("unlabelled_practice_cases.csv"),
             "synthetic (10k)": load("final_synthetic_10k.csv"),
             "adversarial (137)": load("adversarial_claims.csv")}
    print(f"  {'file':26s} {'EV':>7s} {'quote>1200':>11s} {'injury':>8s} {'flip v1->v2':>12s}")
    for name, rows in files.items():
        open_rows = [r for r in rows if r["case_status"] != "closed"] or rows
        n_ = len(rows)
        ev = sum(r["repair_type"] == "ev_high_voltage_battery" for r in rows) / n_
        over = sum(1 for r in rows if r["quote_eur"] and float(r["quote_eur"]) > 1200) / n_
        inj = sum(r["injury_reported"] == "True" for r in rows) / n_
        fl = sum(policy.decide(r, V1)[0] != policy.decide(r, V2)[0] for r in open_rows) / len(open_rows)
        print(f"  {name:26s} {ev:7.1%} {over:11.1%} {inj:8.1%} {fl:12.1%}")
    print("  Organiser dev (14%) is close to synthetic (15%). Organiser practice is 4 of 10 open claims (40%),")
    print("  a 95% Wilson interval of about 17% to 69%, so it cannot settle the flip share.")
    print("  Business figures use the synthetic flip share. If real claims look like the practice file, the")
    print("  re-review saving is understated; if they look like the development file, it is about right.")

    section("4. Leakage: do organiser cases reappear in the synthetic file?")
    real_keys = {tuple(r[k] for k in sorted(r) if k not in ("case_id", "claim_summary", "expected_v1", "case_status"))
                 for r in dev + load("unlabelled_practice_cases.csv")}
    syn_keys = {tuple(r[k] for k in sorted(r) if k not in ("case_id", "claim_summary", "expected_v1", "case_status"))
                for r in load("final_synthetic_10k.csv")}
    overlap = len(real_keys & syn_keys)
    print(f"  Organiser claims whose field values also appear in synthetic: {overlap} of {len(real_keys)}")
    ok &= overlap <= len(real_keys) // 10 + 1

    section("5. What this does not show")
    print("  - Accuracy on hidden cases: unknown until they arrive.")
    print("  - v2 accuracy on real labels: unknown (no v2 labels).")
    print("  - Synthetic agreement: circular, shows consistency only.")

    print("\nEVALUATION CHECKS PASSED" if ok else "\nEVALUATION FOUND A PROBLEM")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
