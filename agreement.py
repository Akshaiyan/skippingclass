"""Agreement between a blinded human labeller and the engine, for the 12 practice cases.

make_sheet(): writes labelling_sheet.csv (claim fields only, no engine output, blank label column).
agreement(labels_csv): percent agreement, Cohen's kappa with a bootstrap 95% CI, and a list of disagreements
to send to a second senior reviewer for adjudication. With n=12 the intervals are WIDE; say so when reporting.

Evidence status: BUILT + TESTED (test_agreement.py). It produces numbers only once a human has labelled.
"""
import csv
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import engine  # noqa: E402
import io_csv  # noqa: E402

LABELS = ["routine_processing", "request_information", "human_review"]
SHEET_HIDE = {"expected_v1", "recommendation_v1"}


def make_sheet(cases_path=HERE / "unlabelled_practice_cases.csv", out_path=HERE / "labelling_sheet.csv"):
    rows, _ = io_csv.read_claims(cases_path)
    cols = [c for c in rows[0].keys() if c not in SHEET_HIDE]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols + ["label"], extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({**{c: r.get(c, "") for c in cols}, "label": ""})
    return out_path


def cohen_kappa(a, b):
    a, b = np.asarray(a), np.asarray(b)
    po = np.mean(a == b)
    pe = sum(np.mean(a == l) * np.mean(b == l) for l in LABELS)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def agreement(labels_path, cases_path=HERE / "unlabelled_practice_cases.csv", reps=2000, seed=0):
    cases, _ = io_csv.read_claims(cases_path)
    by_id = {r["case_id"]: r for r in cases}
    with open(labels_path, newline="", encoding="utf-8") as f:
        labelled = [r for r in csv.DictReader(f) if (r.get("label") or "").strip()]
    if not labelled:
        raise ValueError("no labels found in the labelling sheet")
    human, engine_out, ids = [], [], []
    for r in labelled:
        lab = r["label"].strip()
        if lab not in LABELS:
            raise ValueError(f"{r['case_id']}: label {lab!r} is not one of {LABELS}")
        human.append(lab)
        engine_out.append(engine.decide(by_id[r["case_id"]])[0])
        ids.append(r["case_id"])
    human, engine_out = np.array(human), np.array(engine_out)
    pct = float(np.mean(human == engine_out))
    kappa = float(cohen_kappa(human, engine_out))
    rng = np.random.default_rng(seed)
    n = len(human)
    boots = []
    for _ in range(reps):
        i = rng.integers(0, n, n)
        boots.append(cohen_kappa(human[i], engine_out[i]))
    lo, hi = np.percentile(boots, [2.5, 97.5])
    disagree = [{"case_id": c, "human": h, "engine": e} for c, h, e in zip(ids, human, engine_out) if h != e]
    return {"n": n, "percent_agreement": round(pct, 4), "kappa": round(kappa, 4),
            "kappa_95ci": [round(float(lo), 4), round(float(hi), 4)],
            "disagreements_for_adjudication": disagree,
            "note": "n is small; intervals are wide. Report the interval, not only the point value."}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "sheet":
        print("wrote", make_sheet())
    elif len(sys.argv) > 1:
        import json
        print(json.dumps(agreement(sys.argv[1]), indent=2))
    else:
        print(__doc__)
