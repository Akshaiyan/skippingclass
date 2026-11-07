"""Before-and-after quality comparison for the v2 change notice.
Before = policy v1, after = policy v2, both from the policy files. Expected = the independent notice-derived
oracle in v2_oracle.py. Open and closed claims are reported apart: closed claims are history and must keep v1.

  fixed       v1 disagreed with the notice and v2 agrees        (the intended cases)
  worsened    v1 agreed with the notice and v2 disagrees         (collateral damage; must be 0)
  still wrong v2 disagrees with the notice
  unchanged   v1 and v2 both agree with the notice

Usage: python quality_report.py [claims.csv ...]   Exit 1 if any open claim is worsened or still wrong.
Labels: on the labelled development file, v1 is also scored against the organiser labels (expected_v1).
On the synthetic file the expectation comes from the same written policy, so it shows consistency, not accuracy."""
import sys
import triage
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import io_csv  # noqa: E402
import policy  # noqa: E402
from v2_oracle import oracle_v2  # noqa: E402

V1 = policy.load(HERE / "policies" / "v1.json")
V2 = policy.load(HERE / "policies" / "v2.json")
DEFAULT = ["labelled_development_cases.csv", "unlabelled_practice_cases.csv", "final_synthetic_10k.csv"]


def report(path):
    rows, _ = io_csv.read_claims(HERE / path)
    open_rows = [r for r in rows if triage.status_of(r) == "open"]
    closed = [r for r in rows if triage.status_of(r) == "closed"]
    tally, moved = Counter(), []
    for r in open_rows:
        before, after, want = policy.decide(r, V1)[0], policy.decide(r, V2)[0], oracle_v2(r)
        if before != want and after == want:
            tally["fixed"] += 1
        elif before == want and after != want:
            tally["worsened"] += 1
        elif after != want:
            tally["still wrong"] += 1
        else:
            tally["unchanged"] += 1
        if before != after:
            moved.append((r["case_id"], before, after))
    # Closed claims are not re-decided here: they keep their v1 decision by design (method M1). test_v2.py checks
    # that through run.py, which is the code path that writes the results file.
    label_line = ""
    labelled = [r for r in rows if (r.get("expected_v1") or "").strip()]
    if labelled:
        hit = sum(policy.decide(r, V1)[0] == r["expected_v1"] for r in labelled)
        label_line = f"  v1 against organiser labels: {hit}/{len(labelled)} labelled claims\n"
    print(f"{path}: {len(open_rows)} open (awaiting action), {len(closed)} closed (history, kept as v1)")
    print(label_line, end="")
    print("  open claims -> " + ", ".join(f"{k} {tally[k]}" for k in ("fixed", "worsened", "still wrong", "unchanged")))
    print(f"  open claims whose next step changes: {len(moved)}")
    if len(moved) <= 12:
        for cid, b, a in moved:
            print(f"    {cid}: {b} -> {a}")
    return tally["worsened"] == 0 and tally["still wrong"] == 0


if __name__ == "__main__":
    ok = all([report(p) for p in (sys.argv[1:] or DEFAULT)])
    print("\nNO OPEN CLAIM WORSENED; EVERY OPEN CLAIM NOW MATCHES THE NOTICE" if ok else "\nQUALITY REPORT FOUND A PROBLEM")
    sys.exit(0 if ok else 1)
