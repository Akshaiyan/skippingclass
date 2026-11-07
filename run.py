"""One command: claims CSV in -> validated results CSV + per-claim trace out.

Usage:
  python run.py <claims.csv> <results.csv> [--v2-limit 1200] [--trace trace.jsonl]

Without --v2-limit, recommendation_v2 repeats v1 and needs_recheck is False (no change proposed).
With --v2-limit, the replay runs and open claims whose recommendation changes get needs_recheck=True.
Closed claims always keep the v1 decision (method M1).

Evidence status: BUILT (not yet verified on the practice file by test_all.py; see the run output).
The results file is validated before it is reported as written (method M6).
"""
import argparse
import triage
import csv
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import engine  # noqa: E402
import io_csv  # noqa: E402
import replay  # noqa: E402
import trace as trace_mod  # noqa: E402
import validator  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("claims")
    ap.add_argument("results")
    ap.add_argument("--v2-limit", type=float, default=None)
    ap.add_argument("--trace", default=None)
    ap.add_argument("--policy", default=None, help="policy JSON (policies/*.json); v2 recommendations come from it")
    args = ap.parse_args(argv)

    try:
        claims, info = io_csv.read_claims(args.claims)
    except (ValueError, OSError) as exc:
        print(f"ERROR: cannot read claims file: {exc}")
        return 1
    quarantine = info.get("quarantine", [])
    if quarantine:
        rows_hit = len({x["line"] for x in quarantine})
        print(f"QUARANTINED {len(quarantine)} unreadable value(s) in {rows_hit} row(s). Each is decided as "
              "request_information, never guessed:")
        for x in quarantine[:20]:
            print(f"  line {x['line']}: {x['field']} = {x['value']!r}")
        if len(quarantine) > 20:
            print(f"  ... and {len(quarantine) - 20} more (see the trace)")
    if info.get("repaired_lines"):
        print(f"Repaired {len(info['repaired_lines'])} row(s): unquoted commas merged back into claim_summary "
              f"at line(s) {', '.join(map(str, info['repaired_lines'][:10]))}")
    if not claims:
        print("ERROR: input file has no claims")
        return 1
    print(f"Read {len(claims)} claims (encoding {info['encoding']}, delimiter {info['delimiter']!r}"
          + (f", missing columns treated as blank: {info['columns_missing']}" if info["columns_missing"] else "") + ")")

    if args.policy:
        import policy as policy_mod
        pol = policy_mod.load(args.policy)
        v1pol = policy_mod.load(HERE / "policies" / "v1.json")
        rows = []
        for r in claims:
            rec1, rule1, why = policy_mod.decide(r, v1pol)
            rec2, rule2, why2 = policy_mod.decide(r, pol)
            closed = triage.status_of(r) == "closed"
            if closed:
                rec2, rule2, changed = rec1, "closed: retained v1 decision", False
                explanation = why
            else:
                changed = rec2 != rec1
                rule2 = f"{pol['name']}: {rule2}"
                # The explanation must describe the recommendations it sits beside. When v2 differs, say both.
                explanation = why if not changed else f"v1: {why}; {pol['name']}: {why2}"
            rows.append({"case_id": r["case_id"], "recommendation_v1": rec1, "recommendation_v2": rec2,
                         "needs_recheck": changed, "rule_v1": f"v1:{rule1}", "rule_v2": rule2,
                         "explanation": explanation})
        flips = [x for x in rows if x["needs_recheck"]]
        blocked = [x for x in flips if x["recommendation_v2"] == "routine_processing"]
    elif args.v2_limit is None:
        rows = []
        for r in claims:
            rec, rule, why = engine.decide(r)
            rows.append({
                "case_id": r["case_id"],
                "recommendation_v1": rec,
                "recommendation_v2": rec,
                "needs_recheck": False,
                "rule_v1": f"v1:{rule}",
                "rule_v2": "no v2 proposed" if triage.status_of(r) != "closed"
                else "closed: retained v1 decision",
                "explanation": why,
            })
        flips = []
    else:
        results, flips, _ = replay.replay(claims, new_quote_limit=args.v2_limit)
        by_id = {r["case_id"]: r for r in claims}
        rows = []
        for res in results:
            r = by_id[res["case_id"]]
            v1_rec, v1_rule, why = engine.decide(r)
            v2_rec, v2_rule, _ = engine.decide(r, quote_limit=args.v2_limit)
            if res["closed"]:
                v2_rule_text = "closed: retained v1 decision"
            else:
                v2_rule_text = f"v2 limit {args.v2_limit:.0f}: {v2_rule}"
            rows.append({
                "case_id": res["case_id"],
                "recommendation_v1": v1_rec,
                "recommendation_v2": res["recommendation_v2"],
                "needs_recheck": res["needs_recheck"],
                "rule_v1": f"v1:{v1_rule}",
                "rule_v2": v2_rule_text,
                "explanation": why,
            })

    with open(args.results, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=validator.REQUIRED_COLUMNS)
        w.writeheader()
        w.writerows(rows)

    errors = validator.validate(args.results, [r["case_id"] for r in claims])
    if errors:
        print("VALIDATION FAILED - do not upload:")
        for e in errors[:10]:
            print("  " + e)
        return 2

    if args.trace:
        trace_mod.write_trace(claims, args.trace, policy_version="v1")

    counts = {}
    for row in rows:
        counts[row["recommendation_v1"]] = counts.get(row["recommendation_v1"], 0) + 1
    print(f"Wrote {len(rows)} results to {args.results}")
    print(f"sha256: {validator.sha256(args.results)}")
    print("v1 mix: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    if args.v2_limit is not None:
        blocked = [f for f in flips if f["to"] == "routine_processing"]
        print(f"v2 limit {args.v2_limit:.0f}: {len(flips)} flips, {len(blocked)} into routine (need sign-off)")
    print("VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
