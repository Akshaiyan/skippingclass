"""Check the two headline numbers against REAL given data (dev, practice) and synthetic data.

Real given data:
  dev (14, organiser labels in the case file) - the only independent labels
  practice (12, unlabelled) - used for predictions only
Synthetic (10,000) - assumed distribution

For each source: the outcome mix, the flip share of a v2 limit of 1200, and the headline numbers
recomputed with that mix. Headline 1 depends on flip share; headline 2 depends on outcome mix.
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import engine  # noqa: E402
import replay  # noqa: E402
import business_model as bm  # noqa: E402


def load(name):
    return list(csv.DictReader(open(HERE / name, newline="", encoding="utf-8")))


SOURCES = {
    "dev (organiser labels, n=14)": load("labelled_development_cases.csv"),
    "practice (predictions, n=12)": load("unlabelled_practice_cases.csv"),
    "synthetic (assumed, n=10000)": load("final_synthetic_10k.csv"),
}
V2 = 1200


def mix(rows):
    recs = [engine.decide(r)[0] for r in rows]
    n = len(recs)
    return (recs.count("routine_processing") / n, recs.count("request_information") / n,
            recs.count("human_review") / n)


def flip_share(rows):
    results, flips, _ = replay.replay(rows, new_quote_limit=V2)
    open_n = sum(1 for r in results if not r["closed"])
    return (len(flips) / open_n if open_n else 0.0), len(flips), open_n


def headline2(share_r, share_q, share_h):
    manual, with_sys = bm.annual_triage_cost(share_r, share_q, share_h)
    saving = manual - with_sys
    net = saving - bm.val("system_running_cost_eur_per_year")
    payback = (bm.val("system_running_cost_eur_per_year") / saving * 12) if saving > 0 else None
    return round(manual), round(with_sys), round(saving), round(net), (round(payback, 1) if payback else None)


def main():
    out = {}
    print(f"{'source':30s} {'routine':>8s} {'request':>8s} {'review':>8s} {'flip@1200':>10s} {'open':>6s}")
    for name, rows in SOURCES.items():
        r, q, h = mix(rows)
        fs, nf, nopen = flip_share(rows)
        print(f"{name:30s} {r:>8.1%} {q:>8.1%} {h:>8.1%} {fs:>10.1%} {nopen:>6d}")
        out[name] = {"mix": [r, q, h], "flip_share": fs, "flips": nf, "open": nopen}

    print("\nHeadline 1 (policy change, EUR): manual re-review of all open claims vs flips only")
    n_open_total = bm.val("claims_per_year") * bm.val("open_claims_share")
    for name in SOURCES:
        fs = out[name]["flip_share"]
        manual, system = bm.policy_change_cost(fs, n_open_total)
        print(f"  {name:30s} flip share {fs:6.1%}  manual EUR {manual:>9,.0f}  system EUR {system:>8,.0f}  "
              f"saving EUR {manual - system:>9,.0f}")

    print("\nHeadline 2 (annual triage, EUR): same assumptions, different outcome mix")
    print(f"  {'source':30s} {'manual':>9s} {'system':>9s} {'saving':>9s} {'year1 net':>10s} {'payback(m)':>11s}")
    for name in SOURCES:
        m, s, sv, net, pb = headline2(*out[name]["mix"])
        out[name]["headline2"] = {"manual": m, "system": s, "saving": sv, "net_year1": net, "payback_months": pb}
        print(f"  {name:30s} {m:>9,} {s:>9,} {sv:>9,} {net:>10,} {str(pb) if pb else 'n/a':>11s}")

    (HERE / "headline_check.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("\nwrote headline_check.json")


if __name__ == "__main__":
    main()
