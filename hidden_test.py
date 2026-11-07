"""Train/test with a SEALED hidden set, the way an ML benchmark is run.

Protocol:
  1. Split the synthetic file 70/30 with a fixed seed. The 30% hidden set is written to
     hidden_test_ids.txt and is never read by any training or tuning step below.
  2. Train on the 70% only: a decision tree, gradient boosting and logistic regression.
  3. Score each model ONCE on the hidden 30%, with a bootstrap 95% CI.
  4. Check what the trained models learned: do they split on quote near 1500?
  5. External check on the 14 real dev cases (never used for training).

Labels on synthetic data come from the written policy (circular for accuracy). What this
measures is whether a model can recover the policy from data it has seen, and how it generalises
to claims it has not seen.
"""
import csv
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import ml_compare  # noqa: E402
import engine  # noqa: E402
from check_differential import oracle_from_policy_text  # noqa: E402

SEED = 20261108
rng = np.random.default_rng(SEED)

syn = pd.read_csv(HERE / "final_synthetic_10k.csv", dtype=str, keep_default_na=False)
idx = rng.permutation(len(syn))
cut = int(0.7 * len(syn))
train_idx, hidden_idx = idx[:cut], idx[cut:]
(HERE / "hidden_test_ids.txt").write_text("\n".join(syn.iloc[hidden_idx]["case_id"]), encoding="utf-8")

X = ml_compare.featurise(syn)
y = np.array([engine.decide(r)[0] for r in syn.to_dict("records")])
y_written = np.array([oracle_from_policy_text(r) for r in syn.to_dict("records")])
assert (y == y_written).all(), "engine and written-policy oracle disagree"

Xtr, ytr = X.iloc[train_idx], y[train_idx]
Xh, yh = X.iloc[hidden_idx], y[hidden_idx]


def boot_ci(correct, reps=2000, seed=0):
    r = np.random.default_rng(seed)
    arr = np.asarray(correct, dtype=float)
    stats = [r.choice(arr, size=arr.size, replace=True).mean() for _ in range(reps)]
    return float(arr.mean()), float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))


models = {
    "decision_tree": DecisionTreeClassifier(random_state=0),
    "logistic": ml_compare.MODELS["logistic"],
    "gradient_boost": ml_compare.MODELS["gradient_boost"],
}

print(f"Train {len(train_idx):,} claims, sealed hidden test {len(hidden_idx):,} claims (seed {SEED})")
print(f"{'model':16s} {'train_acc':>10s} {'hidden_acc':>11s} {'95% CI':>20s} {'unsafe_routine':>15s}")
fitted = {}
for name, m in models.items():
    m.fit(Xtr, ytr)
    fitted[name] = m
    tr_acc = (m.predict(Xtr) == ytr).mean()
    pred = m.predict(Xh)
    correct = (pred == yh).astype(int)
    acc, lo, hi = boot_ci(correct)
    unsafe = int(np.sum((pred == "routine_processing") & (yh != "routine_processing")))
    print(f"{name:16s} {tr_acc:>10.4f} {acc:>11.4f} {f'[{lo:.4f}, {hi:.4f}]':>20s} {unsafe:>15d}")

print("\nWhat the decision tree learned from training data alone (top of the tree):")
tree = fitted["decision_tree"]
print(export_text(tree, feature_names=list(X.columns), max_depth=3))

quote_thresholds = []
for node, feat in enumerate(tree.tree_.feature):
    if feat >= 0 and X.columns[feat] == "quote":
        quote_thresholds.append(round(tree.tree_.threshold[node], 1))
print(f"Quote thresholds the tree split on: {sorted(set(quote_thresholds))}  (policy limit is 1500)")

dev = list(csv.DictReader(open(HERE / "labelled_development_cases.csv", newline="", encoding="utf-8")))
dev_df = pd.DataFrame(dev).astype(str)
Xd = ml_compare.featurise(dev_df)
yd = np.array([r["expected_v1"] for r in dev])
print("\nExternal check on 14 real dev cases (never used for training):")
for name, m in fitted.items():
    print(f"  {name:16s} {(m.predict(Xd) == yd).sum()}/{len(yd)} match the case-file labels")
