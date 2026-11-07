"""Agreement tests: the sheet hides engine output; kappa is correct on known cases; disagreements are listed.
Run: python test_agreement.py"""
import csv
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import agreement  # noqa: E402
import engine  # noqa: E402
import io_csv  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


with tempfile.TemporaryDirectory() as d:
    sheet = agreement.make_sheet(out_path=Path(d) / "sheet.csv")
    header = next(csv.reader(open(sheet, encoding="utf-8")))
    check("labelling sheet hides the engine output and the expected labels",
          "recommendation_v1" not in header and "expected_v1" not in header and header[-1] == "label", header)
    rows = list(csv.DictReader(open(sheet, encoding="utf-8")))
    check("sheet has the 12 practice cases with blank labels", len(rows) == 12 and all(r["label"] == "" for r in rows))

    # A labeller who agrees with the engine on every case: kappa 1, 100% agreement, no disagreements
    cases, _ = io_csv.read_claims(agreement.HERE / "unlabelled_practice_cases.csv")
    perfect = Path(d) / "perfect.csv"
    with open(perfect, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["case_id", "label"])
        for r in cases:
            w.writerow([r["case_id"], engine.decide(r)[0]])
    res = agreement.agreement(perfect)
    check("full agreement gives 100% and kappa 1.0 with no disagreements",
          res["percent_agreement"] == 1.0 and res["kappa"] == 1.0 and res["disagreements_for_adjudication"] == [], res)

    # A labeller who flips one case: agreement drops to 11/12 and that case is listed for adjudication
    flipped = Path(d) / "flipped.csv"
    first = cases[0]
    with open(flipped, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["case_id", "label"])
        for i, r in enumerate(cases):
            engine_label = engine.decide(r)[0]
            w.writerow([r["case_id"], "human_review" if i == 0 and engine_label != "human_review" else engine_label])
    res2 = agreement.agreement(flipped)
    listed = [x["case_id"] for x in res2["disagreements_for_adjudication"]]
    check("one disagreement is counted and listed for adjudication",
          listed == [first["case_id"]] and abs(res2["percent_agreement"] - 11 / 12) < 1e-4, res2)

    bad = Path(d) / "bad.csv"
    bad.write_text("case_id,label\nPRA-001,approve\n", encoding="utf-8")
    try:
        agreement.agreement(bad)
        check("a label outside the three allowed values is refused", False)
    except ValueError:
        check("a label outside the three allowed values is refused", True)

print("ALL AGREEMENT TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
