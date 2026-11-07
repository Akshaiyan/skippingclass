"""Full-size sensitivity run with uncertainty, following standard ML evaluation practice:
  - full 10,000-claim file for the replay (S2), no subsampling
  - 5 seeds for each generated sweep (S1), mean and 95% t-interval
  - held-out split for the learned guard: train on 70%, evaluate on 30% (grouped by case_id)
  - bootstrap 95% CI for any rate computed on the full file
  - dev (n=14) is reported without CIs: the interval would be wider than the signal
Labels for synthetic/adversarial come from the written-policy oracle (circular for accuracy).
"""
import csv
import math
import random
import statistics
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import gen_synthetic as g  # noqa: E402
import engine  # noqa: E402
import replay  # noqa: E402
import ml_compare  # noqa: E402
import guard  # noqa: E402
from check_differential import oracle_from_policy_text  # noqa: E402

T975 = {2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571}  # t critical values, df = n-1, n=3..5 seeds


def ci(vals):
    m = statistics.mean(vals)
    if len(vals) < 2:
        return m, 0.0
    s = statistics.stdev(vals)
    return m, T975[len(vals) - 1] * s / math.sqrt(len(vals))


def bootstrap_ci(bools, reps=2000, seed=0):
    rng = np.random.default_rng(seed)
    arr = np.asarray(bools, dtype=float)
    stats = [rng.choice(arr, size=arr.size, replace=True).mean() for _ in range(reps)]
    return float(arr.mean()), float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))


def gen(n, blank_rate, seed):
    old = g.P["blank_rate"]
    g.P["blank_rate"] = blank_rate
    rng = random.Random(seed)
    rows = [g.make_claim(rng, i) for i in range(n)]
    g.P["blank_rate"] = old
    return rows


def unneeded_share(rows, blank_escalate):
    rr = gr = 0
    for r in rows:
        rec = engine.decide(r)[0]
        if blank_escalate:
            blank = any((r.get(k) or "").strip() == "" for k in g.FIELDS if k not in ("case_id", "claim_summary"))
            gr_rec = "human_review" if blank else rec
        else:
            gr_rec = rec
        rr += rec == "human_review"
        gr += gr_rec == "human_review"
    return (gr - rr) / len(rows)


def s1_blank_sweep():
    print("S1  blank rate -> unneeded-review share, 'any blank -> review'  (10,000 claims x 5 seeds)")
    print(f"    {'blank_rate':>10s} {'mean':>8s} {'95% CI (t)':>20s}")
    for br in (0.0, 0.01, 0.03, 0.05, 0.10):
        vals = [unneeded_share(gen(10000, br, seed), True) for seed in range(5)]
        m, h = ci(vals)
        print(f"    {br:>10.2f} {m:>8.1%} {'[' + f'{m - h:.1%}, {m + h:.1%}' + ']':>20s}")
    print()


def s2_replay_full():
    print("S2  replay of a made-up v2 quote limit on the FULL final_synthetic_10k.csv")
    rows = list(csv.DictReader(open(HERE / "final_synthetic_10k.csv", newline="", encoding="utf-8")))
    print(f"    {'v2_limit':>9s} {'open_flips':>11s} {'into_routine':>13s} {'closed_flipped':>15s} {'flip_rate_open':>15s}")
    n_open = sum(1 for r in rows if r["case_status"] == "open")
    for lim in (1000, 1200, 1300, 1400, 1450, 1500, 1550, 1600):
        results, flips, blocked = replay.replay(rows, new_quote_limit=lim)
        closed_flipped = sum(1 for r in results if r["closed"] and r["flipped"])
        rate, lo, hi = bootstrap_ci([f in flips for f in [x for x in rows if x["case_status"] == "open"]] if False else
                                    [1 if any(x["case_id"] == f["case_id"] for f in flips) else 0 for x in rows if x["case_status"] == "open"])
        print(f"    {lim:>9d} {len(flips):>11d} {len(blocked):>13d} {closed_flipped:>15d} {rate:>7.1%} [{lo:.1%},{hi:.1%}]")
    print(f"    open claims in file: {n_open}. closed_flipped must be 0.\n")


def s3_guard_holdout():
    print("S3  learned escalation guard, grouped 70/30 holdout on the full synthetic file (5 seeds)")
    import pandas as pd
    df = pd.read_csv(HERE / "final_synthetic_10k.csv", dtype=str, keep_default_na=False)
    X = ml_compare.featurise(df)
    y = np.array([engine.decide(r)[0] for r in df.to_dict("records")])
    rows = df.to_dict("records")
    res = {"logistic": [], "gradient_boost": []}
    for seed in range(5):
        rng = np.random.default_rng(seed)
        idx = rng.permutation(len(df))
        cut = int(0.7 * len(df))
        tr, te = idx[:cut], idx[cut:]
        base_te = [engine.decide(rows[i])[0] for i in te]
        for name in res:
            m = ml_compare.MODELS[name]
            m.fit(X.iloc[tr], y[tr])
            flags = m.predict(X.iloc[te]) == "human_review"
            out = [guard.escalate_only(b, f) for b, f in zip(base_te, flags)]
            ytrue = [oracle_from_policy_text(rows[i]) for i in te]
            acc = np.mean([o == t for o, t in zip(out, ytrue)])
            unsafe = sum(1 for o, t in zip(out, ytrue) if o == "routine_processing" and t != "routine_processing")
            res[name].append((acc, unsafe))
    for name, vals in res.items():
        accs = [a for a, _ in vals]
        unsafes = [u for _, u in vals]
        m, h = ci(accs)
        print(f"    {name:16s} holdout accuracy {m:.4f} (95% CI {m - h:.4f} to {m + h:.4f}); unsafe-routine per run {unsafes}")
    print("    Circular: labels are the rules. Shows the model can reproduce the rules, nothing about real claims.\n")


def main():
    s1_blank_sweep()
    s2_replay_full()
    s3_guard_holdout()
    print("Dev (n=14): no CI reported. With 14 cases, any interval would be wider than the effect being measured.")


if __name__ == "__main__":
    main()
