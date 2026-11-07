"""Checks the brief's quality counts on hand-built pairs, so each count can be verified by hand.
Run: python test_quality_metrics.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import quality_metrics as q  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


R, I, H = q.ROUTINE, "request_information", q.REVIEW

# predicted, expected
pairs = [
    (R, R),  # correct
    (I, I),  # correct
    (H, H),  # correct
    (R, I),  # incorrect routine: sent to routine when information was needed
    (R, H),  # incorrect routine: sent to routine when review was needed
    (H, R),  # unnecessary review: review when routine was right
    (I, R),  # neither: asked for information when routine was right (not a routine error, not a review)
    (H, I),  # unnecessary review: review when information was right
]
s = q.score(pairs)
check("total counts every pair", s["total"] == 8, s)
check("correct counts only exact matches", s["correct"] == 3, s)
check("incorrect routine counts routine predictions with a non-routine expectation", s["incorrect_routine"] == 2, s)
check("unnecessary review counts review predictions with a non-review expectation", s["unnecessary_review"] == 2, s)
check("a request for information that should have been routine is in neither error count",
      q.score([(I, R)]) == {"total": 1, "correct": 0, "incorrect_routine": 0, "unnecessary_review": 0}, q.score([(I, R)]))
check("an empty set scores zero everywhere", q.score([])["total"] == 0 and q.score([])["correct"] == 0)

# Per-class metrics, checked by hand: red (human_review) predicted 3 times, 2 correct, 1 false positive, 1 missed.
pc = q.per_class([(q.REVIEW, q.REVIEW), (q.REVIEW, q.REVIEW), (q.REVIEW, R), (R, q.REVIEW)])
check("human review precision is 2 of 3", abs(pc[q.REVIEW]["precision"] - 2 / 3) < 1e-9, pc[q.REVIEW])
check("human review recall is 2 of 3", abs(pc[q.REVIEW]["recall"] - 2 / 3) < 1e-9, pc[q.REVIEW])
check("human review F1 is 2/3", abs(pc[q.REVIEW]["f1"] - 2 / 3) < 1e-9, pc[q.REVIEW])
check("one false positive and one false negative are counted for human review",
      pc[q.REVIEW]["fp"] == 1 and pc[q.REVIEW]["fn"] == 1, pc[q.REVIEW])
check("a class with no predictions has no precision", q.per_class([(R, R)])[q.REVIEW]["precision"] is None)

# Real data: the counts must be internally consistent and the changed-case list must match the notice
dev = q._load("labelled_development_cases.csv")
practice = q._load("unlabelled_practice_cases.csv")
v1 = q.v1_against_labels(dev)
check("v1 is scored on every labelled dev claim", v1["total"] == 14, v1)
check("v1 counts add up: correct + errors + other cases = total",
      v1["correct"] <= v1["total"] and v1["correct"] + v1["incorrect_routine"] + v1["unnecessary_review"] <= v1["total"], v1)
changed, same = q.changed_cases(dev + practice)
check("open claims are split into changed and unchanged with nothing lost",
      len(changed) + len(same) == len([r for r in dev + practice if r.get("case_status") != "closed"]), (len(changed), len(same)))
check("the four claims the notice changes are the ones flagged",
      {c for c, _, _ in changed} >= {"PRA-003", "PRA-004", "PRA-005", "PRA-006"}, [c for c, _, _ in changed])
closed_ids = {r["case_id"] for r in practice if r.get("case_status") == "closed"}
check("closed claims are never listed as changed", not (closed_ids & {c for c, _, _ in changed}), closed_ids)

print("ALL QUALITY METRIC TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
