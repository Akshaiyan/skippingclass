"""Flip report for each prepared policy change, from the same claims. Evidence: computed, not assumed."""
import sys, io_csv, policy
from pathlib import Path
HERE = Path(__file__).parent
claims, _ = io_csv.read_claims(HERE / 'unlabelled_practice_cases.csv')
claims2, _ = io_csv.read_claims(HERE / 'final_synthetic_10k.csv')
v1 = policy.load(HERE / 'policies' / 'v1.json')
print(f"{'change':22s} {'claims':>7s} {'open flips':>11s} {'into routine':>13s} {'out of routine':>15s}")
for name in ['v2_limit_1200.json', 'v2_new_trigger_ev.json']:
    v2 = policy.load(HERE / 'policies' / name)
    for label, rows in [('practice', claims), ('synthetic', claims2)]:
        flips = into = out = closed_changed = 0
        open_n = 0
        for r in rows:
            a = policy.decide(r, v1)[0]; b = policy.decide(r, v2)[0]
            closed = (r.get('case_status') or '').strip() == 'closed'
            if closed:
                closed_changed += a != b
                continue
            open_n += 1
            if a != b:
                flips += 1
                into += b == 'routine_processing'
                out += a == 'routine_processing'
        print(f"{name+' ('+label+')':22s} {len(rows):>7d} {flips:>7d}/{open_n:<4d} {into:>13d} {out:>15d}  closed that would change if recomputed (kept as v1 in the real replay): {closed_changed}")
