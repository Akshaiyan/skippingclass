"""Compare candidate design choices on three sources and print one table + results.json.

Sources:
  DEV  = 14 labelled dev cases, labels from the case file (expected_v1). Real, very small.
  SYN  = final_synthetic_10k.csv. Labels from the written-policy oracle (circular for accuracy).
  ADV  = adversarial_claims.csv (137). Labels from the written-policy oracle (circular for accuracy).

Metrics: correct, wrong_routine (routine given where label is not routine), unneeded_review
(human_review given where label is not review). Circular sources measure consistency, not accuracy.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import engine  # noqa: E402
import replay  # noqa: E402
import guard  # noqa: E402
from check_differential import oracle_from_policy_text  # noqa: E402
import ml_compare  # noqa: E402


def load(name):
    return list(csv.DictReader(open(HERE / name, newline="", encoding="utf-8")))


DEV = load("labelled_development_cases.csv")
SYN = load("final_synthetic_10k.csv")
ADV = load("adversarial_claims.csv")
DEV_LABEL = {r["case_id"]: r["expected_v1"] for r in DEV}


def label(row, source):
    return DEV_LABEL[row["case_id"]] if source == "DEV" else oracle_from_policy_text(row)


def metrics(preds, rows, source):
    c = wr = un = 0
    for p, r in zip(preds, rows):
        y = label(r, source)
        c += p == y
        wr += p == "routine_processing" and y != "routine_processing"
        un += p == "human_review" and y != "human_review"
    return {"n": len(rows), "correct": int(c), "wrong_routine": int(wr), "unneeded_review": int(un)}


def rule_preds(rows):
    return [engine.decide(r)[0] for r in rows]


def blank_escalate_preds(rows):
    out = []
    for r in rows:
        rec = engine.decide(r)[0]
        blank = any((r.get(k) or "").strip() == "" for k in ml_compare.BOOL_COLS + ["quote_eur", "claim_type"])
        out.append("human_review" if blank else rec)
    return out


def learned_guard_preds(rows, model, base_rules):
    X = ml_compare.featurise(_df(rows))
    model_out = model.predict(X)
    return [guard.escalate_only(rule, m == "human_review") for rule, m in zip(base_rules, model_out)]


def _df(rows):
    import pandas as pd
    return pd.DataFrame(rows).astype(str).fillna("")


def main():
    import pandas as pd
    syn_df = pd.read_csv(HERE / "final_synthetic_10k.csv", dtype=str, keep_default_na=False)
    Xs = ml_compare.featurise(syn_df)
    ys = np.array([engine.decide(r)[0] for r in SYN])
    models = {name: ml_compare.MODELS[name] for name in ("logistic", "gradient_boost")}
    for m in models.values():
        m.fit(Xs, ys)

    table = {}
    for src, rows in (("DEV", DEV), ("SYN", SYN), ("ADV", ADV)):
        base = rule_preds(rows)
        table.setdefault("rules (policy v1)", {})[src] = metrics(base, rows, src)
        table.setdefault("guard: any blank -> review", {})[src] = metrics(blank_escalate_preds(rows), rows, src)
        for name, m in models.items():
            table.setdefault(f"guard: learned {name}", {})[src] = metrics(
                learned_guard_preds(rows, m, base), rows, src)

    print(f"{'candidate':30s} {'source':4s} {'n':>5s} {'correct':>8s} {'wrong_routine':>14s} {'unneeded_review':>16s}")
    print("-" * 84)
    for cand, per in table.items():
        for src in ("DEV", "SYN", "ADV"):
            m = per[src]
            print(f"{cand:30s} {src:4s} {m['n']:>5d} {m['correct']:>8d} {m['wrong_routine']:>14d} {m['unneeded_review']:>16d}")

    # Replay of a made-up v2 (quote limit 1200) on the open synthetic claims.
    _, flips, blocked = replay.replay(SYN, new_quote_limit=1200)
    _, dflips, dblocked = replay.replay(DEV, new_quote_limit=1200)
    replay_row = {"synthetic_flips": len(flips), "synthetic_blocked": len(blocked),
                  "dev_flips": len(dflips), "dev_blocked": len(dblocked)}
    print("\nReplay of made-up v2 (quote limit 1200):", replay_row)

    out = {"candidates": table, "replay_v2_1200": replay_row,
           "note": "DEV labels are from the case file; SYN and ADV labels are from the written policy (circular)."}
    (HERE / "results.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("wrote results.json")


if __name__ == "__main__":
    main()
