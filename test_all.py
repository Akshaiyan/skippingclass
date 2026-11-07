"""Tests for every code object. Run: python test_all.py  (exit 0 = all pass).

Each test name states the claim it checks. Failures print the claim, not just a traceback.
"""
import csv
import itertools
import json
import os
import random
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import triage  # noqa: E402
import engine  # noqa: E402
import replay  # noqa: E402
import validator  # noqa: E402
import trace  # noqa: E402
import guard  # noqa: E402
from decision_log import DecisionLog  # noqa: E402
from check_differential import oracle_from_policy_text  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def load(name):
    return list(csv.DictReader(open(HERE / name, newline="", encoding="utf-8")))


DEV = load("labelled_development_cases.csv")
SYN = load("final_synthetic_10k.csv")
ADV = load("adversarial_claims.csv")
ALL = DEV + SYN + ADV


def t_engine_parity():
    mism = []
    for r in ALL:
        a = engine.decide(r)
        b = triage.decide_v1(r)
        if a[0] != b[0] or a[1] != b[1]:
            mism.append((r["case_id"], a[:2], b[:2]))
    check("engine(1500) agrees with triage.decide_v1 on all rows (decision and rule)",
          not mism, f"{len(mism)} mismatches, first {mism[:2]}")


def t_engine_matches_written_policy():
    mism = [r["case_id"] for r in SYN + ADV if engine.decide(r)[0] != oracle_from_policy_text(r)]
    check("engine agrees with the independent written-policy oracle on synthetic and adversarial",
          not mism, f"{len(mism)} mismatches")


def t_replay_zero_change_is_zero_flips():
    _, flips, _ = replay.replay(SYN, new_quote_limit=1500)
    check("replay with unchanged policy produces zero flips", len(flips) == 0, f"{len(flips)} flips")


def t_replay_closed_never_flipped():
    results, _, _ = replay.replay(SYN, new_quote_limit=1200)
    bad = [r["case_id"] for r in results if r["closed"] and (r["flipped"] or r["needs_recheck"])]
    check("closed claims are never flipped or flagged by a replay", not bad, f"{len(bad)} violations")


def t_replay_flip_reasons_hold():
    _, flips, _ = replay.replay(SYN, new_quote_limit=1200)
    byid = {r["case_id"]: r for r in SYN}
    bad = []
    for f in flips:
        q = float(byid[f["case_id"]]["quote_eur"] or "nan")
        if not (1200 < q <= 1500) or byid[f["case_id"]]["case_status"] != "open":
            bad.append(f["case_id"])
    check("every flip at limit 1200 is an open claim with quote in (1200, 1500]",
          not bad, f"{len(bad)} unexplained flips")


def t_replay_blocks_routine_regressions():
    _, flips, blocked = replay.replay(SYN, new_quote_limit=1200)
    check("flips into routine_processing are reported as blocked for sign-off",
          all(f["to"] == "routine_processing" for f in blocked) and len(blocked) <= len(flips))


def _write_results(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=validator.REQUIRED_COLUMNS)
        w.writeheader()
        w.writerows(rows)


def _good_row(cid):
    return {"case_id": cid, "recommendation_v1": "routine_processing",
            "recommendation_v2": "routine_processing", "needs_recheck": "False",
            "rule_v1": "v1:R3", "rule_v2": "v2 not released", "explanation": "ok"}


def t_validator():
    with tempfile.TemporaryDirectory() as d:
        ids = ["A", "B"]
        good = os.path.join(d, "good.csv")
        _write_results(good, [_good_row("A"), _good_row("B")])
        check("validator passes a complete, valid file", validator.validate(good, ids) == [])

        cols = os.path.join(d, "cols.csv")
        open(cols, "w").write("case_id,recommendation_v1\nA,routine_processing\n")
        check("validator fails on wrong columns", bool(validator.validate(cols, ids)))

        dup = os.path.join(d, "dup.csv")
        _write_results(dup, [_good_row("A"), _good_row("A")])
        check("validator fails on a duplicate case_id", any("duplicate" in e for e in validator.validate(dup, ids)))

        bad = os.path.join(d, "bad.csv")
        r = _good_row("A")
        r["recommendation_v2"] = "approve_payment"
        _write_results(bad, [r, _good_row("B")])
        check("validator rejects a decision outside the allowed vocabulary",
              any("not allowed" in e for e in validator.validate(bad, ids)))

        miss = os.path.join(d, "miss.csv")
        _write_results(miss, [_good_row("A")])
        check("validator fails when an input case is missing from the results",
              any("missing" in e for e in validator.validate(miss, ids)))

        empty = os.path.join(d, "empty.csv")
        r = _good_row("A")
        r["explanation"] = "  "
        _write_results(empty, [r, _good_row("B")])
        check("validator fails on an empty explanation", any("empty explanation" in e for e in validator.validate(empty, ids)))


def t_trace_round_trip():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "trace.jsonl")
        trace.write_trace(DEV + ADV[:50], p)
        entries = trace.read_trace(p)
        ok = all(trace.replay_from_trace(e) == e["decision"] for e in entries)
        check("trace round trip: decision recomputed from stored facts equals the recorded decision",
              ok and len(entries) == len(DEV) + 50)


def t_decision_log_append_only():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "log.ndjson")
        log = DecisionLog(p)
        rec = {"type": "reviewer_override", "case_id": "DEV-001", "actor": "reviewer-1",
               "reason": "checked photos", "policy_version": "v1",
               "original_recommendation": "routine_processing",
               "corrected_recommendation": "human_review"}
        log.append(rec)
        before = open(p, "rb").read()
        log.append({**rec, "case_id": "DEV-002"})
        after = open(p, "rb").read()
        check("decision log: earlier bytes are unchanged after a later append", after.startswith(before))
        check("decision log: both entries are readable", len(log.read()) == 2)
        check("decision log: the correction itself is recorded",
              log.read()[0]["original_recommendation"] == "routine_processing"
              and log.read()[0]["corrected_recommendation"] == "human_review")
        pol = {"type": "policy_decision", "actor": "policy-owner", "reason": "replay reviewed, 760 flips accepted",
               "policy_version": "v2", "decision": "approved", "proposed_by": "policy-author"}
        log.append(pol)
        check("decision log: a policy decision is recorded", log.read()[-1]["decision"] == "approved")
        for bad, label in [({**rec, "type": "delete"}, "unknown type"),
                           ({k: v for k, v in rec.items() if k != "reason"}, "missing reason"),
                           ({**rec, "reason": " "}, "empty reason"),
                           ({k: v for k, v in rec.items() if k != "corrected_recommendation"}, "missing correction"),
                           ({**rec, "corrected_recommendation": "routine_processing"}, "override that changes nothing"),
                           ({**rec, "corrected_recommendation": "approve_payment"}, "recommendation outside the three"),
                           ({**pol, "decision": "maybe"}, "policy decision other than approved or rejected"),
                           ({**pol, "actor": " "}, "empty actor"),
                           ({**pol, "actor": "Policy-Author"}, "four-eyes: approver is the proposer (case-insensitive)"),
                           ({k: v for k, v in pol.items() if k != "proposed_by"}, "policy decision without proposer")]:
            try:
                log.append(bad)
                check(f"decision log refuses a {label}", False)
            except ValueError:
                check(f"decision log refuses a {label}", True)


def t_guard_monotone():
    bad = []
    for rule, flag in itertools.product(guard.ORDER, [False, True]):
        out = guard.escalate_only(rule, flag)
        if guard.ORDER[out] < guard.ORDER[rule]:
            bad.append((rule, flag, out))
    check("escalation-only guard is never less cautious than the rule (all combinations)", not bad, str(bad))


def run():
    t_engine_parity()
    t_engine_matches_written_policy()
    t_replay_zero_change_is_zero_flips()
    t_replay_closed_never_flipped()
    t_replay_flip_reasons_hold()
    t_replay_blocks_routine_regressions()
    t_validator()
    t_trace_round_trip()
    t_decision_log_append_only()
    t_guard_monotone()
    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {FAILURES}")
        return 1
    print("ALL TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(run())
