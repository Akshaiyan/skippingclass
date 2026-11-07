"""The quality numbers the brief asks for, per policy version.

Definitions (predicted = our recommendation, expected = the reference label):
- correct                 predicted == expected
- incorrect_routine       predicted routine_processing, expected is not routine_processing
- unnecessary_review      predicted human_review, expected is not human_review

References:
- v1: organiser labels (expected_v1) on the labelled development file (14 claims).
- v2: the notice-derived oracle (v2_oracle.py) on open claims of the dev and practice files.
  Closed claims keep their v1 decision and are not scored under v2.
  The oracle is our reading of the notice, not an organiser label.

Changed cases (v1 != v2 on open claims) are listed apart from unchanged ones, with the open claims to revisit.
Run: python quality_metrics.py
"""
import sys
import triage
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import io_csv  # noqa: E402
import policy  # noqa: E402
from v2_oracle import oracle_v2  # noqa: E402

ROUTINE, REVIEW = "routine_processing", "human_review"


def score(pairs):
    """pairs: iterable of (predicted, expected). Returns the brief's three counts plus the total."""
    pairs = list(pairs)
    return {
        "total": len(pairs),
        "correct": sum(p == e for p, e in pairs),
        "incorrect_routine": sum(p == ROUTINE and e != ROUTINE for p, e in pairs),
        "unnecessary_review": sum(p == REVIEW and e != REVIEW for p, e in pairs),
    }


CLASSES = [ROUTINE, "request_information", REVIEW]


def per_class(pairs):
    """Precision, recall and F1 per class, plus the false positives and false negatives for human review (the red class).
    pairs: (predicted, expected). A class with no predictions has precision None; no expected cases, recall None."""
    pairs = list(pairs)
    out = {}
    for c in CLASSES:
        tp = sum(p == c and e == c for p, e in pairs)
        fp = sum(p == c and e != c for p, e in pairs)
        fn = sum(p != c and e == c for p, e in pairs)
        prec = tp / (tp + fp) if tp + fp else None
        rec = tp / (tp + fn) if tp + fn else None
        f1 = 2 * prec * rec / (prec + rec) if prec and rec else (0.0 if (prec is not None and rec is not None) else None)
        out[c] = {"tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec, "f1": f1}
    macro = [out[c]["f1"] for c in CLASSES if out[c]["f1"] is not None]
    out["macro_f1"] = sum(macro) / len(macro) if macro else None
    return out


def v1_against_labels(rows):
    return score((policy.decide(r, V1)[0], r["expected_v1"]) for r in rows if (r.get("expected_v1") or "").strip())


def v2_against_oracle(rows):
    open_rows = [r for r in rows if triage.status_of(r) == "open"]
    return score((policy.decide(r, V2)[0], oracle_v2(r)) for r in open_rows)


def changed_cases(rows):
    """Open claims whose recommendation changes from v1 to v2, and the open claims that stay the same."""
    open_rows = [r for r in rows if triage.status_of(r) == "open"]
    changed, same = [], []
    for r in open_rows:
        a, b = policy.decide(r, V1)[0], policy.decide(r, V2)[0]
        (changed if a != b else same).append((r["case_id"], a, b))
    return changed, same


def _load(name):
    rows, _ = io_csv.read_claims(HERE / name)
    return rows


V1 = policy.load(HERE / "policies" / "v1.json")
V2 = policy.load(HERE / "policies" / "v2.json")


def main():
    dev = _load("labelled_development_cases.csv")
    practice = _load("unlabelled_practice_cases.csv")
    rows = {"dev": dev, "practice": practice}
    print("v1 against organiser labels (labelled dev file, 14 claims: small sample)")
    print("  ", v1_against_labels(dev))
    pairs = [(policy.decide(r, V1)[0], r["expected_v1"]) for r in dev if (r.get("expected_v1") or "").strip()]
    for c, m in per_class(pairs).items():
        if c != "macro_f1":
            print(f"   {c}: precision {m['precision']} recall {m['recall']} F1 {m['f1']} FP {m['fp']} FN {m['fn']}")
    print("   macro F1", per_class(pairs)["macro_f1"])
    for name, data in rows.items():
        print(f"v2 against the notice-derived oracle ({name} file, open claims)")
        print("  ", v2_against_oracle(data))
    changed, same = changed_cases(dev + practice)
    print(f"changed under v2 (open claims): {len(changed)}")
    for cid, a, b in changed:
        print(f"  {cid}: {a} -> {b}")
    print(f"unchanged under v2 (open claims): {len(same)}")
    print("open claims to revisit (recommendation changes): " + (", ".join(c for c, _, _ in changed) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
