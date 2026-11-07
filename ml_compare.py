"""Compare ML models as an ESCALATION-ONLY guard on top of the rules.

Labels are the written policy's decisions, so a model that learns the labels is learning
the rules. Accuracy here is circular and says nothing about the hidden set. The useful
questions are: (a) can a model reproduce the rules at all, and (b) does it fail on
shifted inputs in a way that would make it unsafe as a guard.
"""
import csv
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import triage  # noqa: E402

BOOL_COLS = [
    "policy_active_on_incident", "incident_report_present", "itemized_quote_present",
    "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict",
]


def featurise(df):
    X = pd.DataFrame(index=df.index)
    for c in BOOL_COLS:
        v = df[c].astype(str).str.strip().str.lower()
        X[c + "_true"] = (v == "true").astype(int)
        X[c + "_blank"] = (v.isin(["", "nan"])).astype(int)
    q = pd.to_numeric(df["quote_eur"], errors="coerce")
    X["quote"] = q.fillna(0.0)
    X["quote_blank"] = q.isna().astype(int)
    X["quote_over_1500"] = (q > 1500).astype(int)
    ct = df["claim_type"].astype(str).str.strip()
    X["claim_type_own"] = (ct == "motor_own_damage").astype(int)
    X["claim_type_blank"] = ct.isin(["", "nan"]).astype(int)
    X["ev"] = (df["repair_type"].astype(str).str.strip() == "ev_high_voltage_battery").astype(int)
    return X


def labels_from_rules(df):
    recs = df.fillna("").astype(str).to_dict("records")
    return [triage.decide_v1(r)[0] for r in recs]


MODELS = {
    "logistic": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
    "tree_depth4": DecisionTreeClassifier(max_depth=4, random_state=0),
    "random_forest": RandomForestClassifier(n_estimators=200, random_state=0),
    "gradient_boost": GradientBoostingClassifier(random_state=0),
}


def main():
    train = pd.read_csv(HERE / "final_synthetic_10k.csv", dtype=str, keep_default_na=False)
    adv = pd.read_csv(HERE / "adversarial_claims.csv", dtype=str, keep_default_na=False)
    X, y = featurise(train), np.array(labels_from_rules(train))
    Xa, ya = featurise(adv), np.array(labels_from_rules(adv))

    print("(a) 5-fold CV accuracy on the synthetic set (circular: labels are the rules)")
    for name, m in MODELS.items():
        s = cross_val_score(m, X, y, cv=5)
        print(f"   {name:16s} {s.mean():.4f} +/- {s.std():.4f}")

    print("\n(b) Train on synthetic, test on the adversarial suite (boundary-heavy, shifted)")
    for name, m in MODELS.items():
        m.fit(X, y)
        pred = m.predict(Xa)
        wrong = pred != ya
        # The dangerous error for a guard: model says routine_processing where policy says otherwise.
        unsafe = int(np.sum((pred == "routine_processing") & (ya != "routine_processing")))
        print(f"   {name:16s} accuracy {1 - wrong.mean():.4f}  unsafe-routine {unsafe}  of {len(ya)}")


if __name__ == "__main__":
    main()
