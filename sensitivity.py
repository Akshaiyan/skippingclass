"""Sensitivity sweeps: do the conclusions survive changes to our ASSUMED parameters?

Sweeps (all on seeded synthetic claims; labels from the rules, so these measure behaviour, not accuracy):
  S1  blank rate -> cost of 'any blank goes to review' (unneeded reviews)
  S2  quote limit for a made-up v2 -> replay flips (open / closed, into routine)
  S3  error-cost ratio -> break-even probability for escalation
"""
import csv
import random
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import gen_synthetic as g  # noqa: E402
import engine  # noqa: E402
import replay  # noqa: E402

N = 5000


def synth(blank_rate, seed=7):
    old = g.P["blank_rate"]
    g.P["blank_rate"] = blank_rate
    rng = random.Random(seed)
    rows = [g.make_claim(rng, i) for i in range(N)]
    g.P["blank_rate"] = old
    return rows


def blank_guard(rows):
    out = []
    for r in rows:
        rec = engine.decide(r)[0]
        blank = any((r.get(k) or "").strip() == "" for k in g.FIELDS if k not in ("case_id", "claim_summary"))
        out.append("human_review" if blank and rec != "human_review" else rec)
    return out


def s1():
    print("S1  blank rate -> unneeded reviews from 'any blank -> review' (5,000 claims)")
    print(f"    {'blank_rate':>10s} {'rule_review':>12s} {'guard_review':>13s} {'unneeded':>9s} {'share_unneeded':>15s}")
    for br in (0.0, 0.01, 0.03, 0.05, 0.10):
        rows = synth(br)
        base = [engine.decide(r)[0] for r in rows]
        guard_out = blank_guard(rows)
        rr = sum(b == "human_review" for b in base)
        gr = sum(x == "human_review" for x in guard_out)
        unneeded = gr - rr
        print(f"    {br:>10.2f} {rr:>12d} {gr:>13d} {unneeded:>9d} {unneeded / N:>15.1%}")
    print()


def s2():
    print("S2  quote limit for a made-up v2 -> replay flips (5,000 claims, blank rate 3%)")
    rows = synth(0.03)
    print(f"    {'v2_limit':>9s} {'open_flips':>11s} {'into_routine':>13s} {'closed_flipped_by_replay':>25s} {'closed_would_change_if_recomputed':>34s}")
    for lim in (1000, 1100, 1200, 1300, 1400, 1450, 1500, 1600):
        results, flips, blocked = replay.replay(rows, new_quote_limit=lim)
        closed_flipped = sum(1 for r in results if r["closed"] and r["flipped"])
        closed_would = sum(1 for r in rows if r.get("case_status") == "closed" and engine.decide(r)[0] != engine.decide(r, quote_limit=lim)[0])
        print(f"    {lim:>9d} {len(flips):>11d} {len(blocked):>13d} {closed_flipped:>25d} {closed_would:>34d}")
    print("    closed_flipped_by_replay must be 0. closed_would_change_if_recomputed shows what the")
    print("    retention rule protects: that many closed claims would change if they were recomputed.\n")


def s3():
    print("S3  break-even probability of a wrong routine call, by cost ratio")
    print("    escalate when p x C_wrong > C_review  =>  p* = C_review / C_wrong")
    print(f"    {'C_wrong / C_review':>20s} {'p* (break-even)':>17s}")
    for ratio in (1, 2, 5, 10, 20, 50):
        print(f"    {ratio:>20d} {1 / ratio:>17.1%}")
    print("    Read: at a 10x error cost, escalate any claim whose chance of a wrong routine call exceeds 10%.")
    print("    The p itself is UNMEASURED here (no real outcomes), so this is a threshold, not a result.\n")


if __name__ == "__main__":
    s1()
    s2()
    s3()
