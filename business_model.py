"""Business case as code. Every headline number is computed here from assumptions.json and from
measured proxies. Nothing is typed in by hand.

Usage: python business_model.py   -> prints headline numbers and writes business_results.json

Status labels carried through to the output:
  ASSUMED         illustrative input, replace with insurer data
  MEASURED-PROXY  computed by our code on a synthetic/practice file; the distribution is assumed
"""
import csv
import triage
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import engine  # noqa: E402
import replay  # noqa: E402

A = json.loads((HERE / "assumptions.json").read_text(encoding="utf-8"))


def val(key):
    return A[key]["value"]


def routine_share(rows):
    rec = [engine.decide(r)[0] for r in rows]
    return sum(x == "routine_processing" for x in rec) / len(rec)


def flip_share(rows, v2_limit):
    results, flips, _ = replay.replay(rows, new_quote_limit=v2_limit)
    open_n = sum(1 for r in results if not r["closed"])
    return len(flips) / open_n if open_n else 0.0, len(flips), open_n


def annual_triage_cost(share_routine, share_request, share_review):
    n = val("claims_per_year")
    manual_min = n * val("minutes_manual_triage_per_claim")
    system_min = n * (share_routine * val("minutes_routine_confirm_per_claim")
                      + share_request * val("minutes_request_info_per_claim")
                      + share_review * val("minutes_manual_triage_per_claim"))
    rate = val("reviewer_cost_eur_per_hour") / 60
    return manual_min * rate, system_min * rate


def policy_change_cost(open_claims_affected_share, n_open_total):
    """Manual: every open claim is re-reviewed. System: only the flips are re-reviewed."""
    rate = val("reviewer_cost_eur_per_hour") / 60
    manual = n_open_total * val("minutes_recheck_per_affected_claim") * rate
    system = n_open_total * open_claims_affected_share * val("minutes_recheck_per_affected_claim") * rate
    return manual, system


def annual_summary(share_routine, share_request, share_review):
    """Annual triage today and with the system for one case mix, with the net benefit and the payback."""
    manual, system = annual_triage_cost(share_routine, share_request, share_review)
    saving = manual - system
    run = val("system_running_cost_eur_per_year")
    return {"manual_eur": round(manual), "with_system_eur": round(system), "saving_eur": round(saving),
            "net_benefit_eur": round(saving - run),
            "payback_months": round(run / saving * 12, 1) if saving > 0 else None}


def break_even_routine_share():
    """The routine share at which the saving just covers the running cost, if every other claim needs a full manual
    review. Below this share the system costs more than it saves, whatever the claim volume."""
    per_claim = (val("minutes_manual_triage_per_claim") - val("minutes_routine_confirm_per_claim")) * val("reviewer_cost_eur_per_hour") / 60
    return val("system_running_cost_eur_per_year") / (val("claims_per_year") * per_claim)


def max_possible_saving():
    """The ceiling: every claim routine. The saving cannot exceed this, so it cannot be 'twice as good'."""
    per_claim = (val("minutes_manual_triage_per_claim") - val("minutes_routine_confirm_per_claim")) * val("reviewer_cost_eur_per_hour") / 60
    return val("claims_per_year") * per_claim


def error_costs(share_routine):
    """What wrong routine decisions cost against what an unnecessary escalation costs, and where that sets the threshold.
    The cost of a wrong routine decision is ASSUMED. The error rate is swept, not claimed: the only independent labels
    are the 14 organiser cases, too few to measure a rate."""
    n = val("claims_per_year")
    rate_min = val("reviewer_cost_eur_per_hour") / 60
    wrong = val("wrong_routine_error_cost_eur")
    # An unnecessary escalation costs a full manual review instead of a one-minute confirmation.
    extra_escalation = (val("minutes_manual_triage_per_claim") - val("minutes_routine_confirm_per_claim")) * rate_min
    routine_claims = n * share_routine
    sweep = [{"wrong_routine_rate": r, "wrong_routine_claims": round(routine_claims * r),
              "annual_error_cost_eur": round(routine_claims * r * wrong)} for r in (0.0, 0.005, 0.01, 0.02)]
    return {
        "extra_cost_unnecessary_escalation_eur": round(extra_escalation, 2),
        "cost_wrong_routine_eur": wrong,
        # Routing to routine costs p * wrong in expectation; escalating costs extra_escalation. Escalate above this p.
        "escalate_above_error_probability": round(extra_escalation / wrong, 4),
        "routine_claims_per_year": round(routine_claims),
        "annual_cost_by_wrong_routine_rate": sweep,
    }


def main():
    practice_claims = list(csv.DictReader(open(HERE / "unlabelled_practice_cases.csv", newline="", encoding="utf-8")))
    syn = list(csv.DictReader(open(HERE / "final_synthetic_10k.csv", newline="", encoding="utf-8")))

    recs = [engine.decide(r)[0] for r in practice_claims]
    share_routine = recs.count("routine_processing") / len(recs)
    share_request = recs.count("request_information") / len(recs)
    share_review = recs.count("human_review") / len(recs)

    share_flip, n_flips, n_open = flip_share(syn, v2_limit=1200)
    n_open_total = val("claims_per_year") * val("open_claims_share")

    manual_triage, system_triage = annual_triage_cost(share_routine, share_request, share_review)
    manual_change, system_change = policy_change_cost(share_flip, n_open_total)
    system_cost = val("system_running_cost_eur_per_year")
    triage_saving = manual_triage - system_triage
    net_benefit = triage_saving - system_cost
    payback_months = (system_cost / triage_saving * 12) if triage_saving > 0 else None

    out = {
        "inputs": {
            "claims_per_year": val("claims_per_year"),
            "routine_share_practice_mix": round(share_routine, 4),
            "request_info_share_practice_mix": round(share_request, 4),
            "review_share_practice_mix": round(share_review, 4),
            "flip_share_v2_1200_synthetic": round(share_flip, 4),
            "flips_v2_1200_synthetic": n_flips,
            "open_claims_synthetic": n_open,
        },
        "headline": {
            "policy_change_manual_eur": round(manual_change),
            "policy_change_with_system_eur": round(system_change),
            "policy_change_saving_eur": round(manual_change - system_change),
            "policy_change_manual_claims_rechecked": round(n_open_total),
            "policy_change_system_claims_rechecked": round(n_open_total * share_flip),
            "annual_triage_manual_eur": round(manual_triage),
            "annual_triage_with_system_eur": round(system_triage),
            "annual_triage_saving_eur": round(triage_saving),
            "system_running_cost_eur": system_cost,
            "net_benefit_year1_eur": round(net_benefit),
            "payback_months": round(payback_months, 1) if payback_months else None,
        },
        # The same annual figures under other case mixes, so the headline is never shown without its range.
        "sensitivity": {
            "practice_mix": annual_summary(share_routine, share_request, share_review),
            "synthetic_10k_mix": annual_summary(*[ [engine.decide(r)[0] for r in syn].count(k) / len(syn)
                                                  for k in ("routine_processing", "request_information", "human_review")]),
            "break_even_routine_share": round(break_even_routine_share(), 3),
            "max_possible_saving_eur": round(max_possible_saving()),
        },
        "errors": {
            **error_costs(share_routine),
            # The wrong-routine rate at which leakage uses up the whole year-1 net benefit.
            "wrong_routine_rate_that_erases_year1_net": round(
                net_benefit / (val("claims_per_year") * share_routine * val("wrong_routine_error_cost_eur")), 5),
        },
        "assumption_status": {k: v["status"] for k, v in A.items() if not k.startswith("_")},
        "not_measured": [
            "real error rate of routine decisions (needs the audit gate on real claims)",
            "real claim volume, handler time and cost (all ASSUMED)",
        ],
    }
    (HERE / "business_results.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    h = out["headline"]
    print("HEADLINE 1 - policy change (v2 at EUR 1,200 limit, proxy flip share "
          f"{share_flip:.1%} from synthetic)")
    print(f"  manual: re-review {h['policy_change_manual_claims_rechecked']:,} open claims "
          f"= EUR {h['policy_change_manual_eur']:,}")
    print(f"  system: re-review {h['policy_change_system_claims_rechecked']:,} flipped claims "
          f"= EUR {h['policy_change_with_system_eur']:,}")
    print(f"  saving per change: EUR {h['policy_change_saving_eur']:,}")
    print("HEADLINE 2 - annual triage (ASSUMED volume and handler time)")
    print(f"  manual EUR {h['annual_triage_manual_eur']:,} vs with system EUR {h['annual_triage_with_system_eur']:,}")
    print(f"  saving EUR {h['annual_triage_saving_eur']:,}; year-1 net EUR {h['net_benefit_year1_eur']:,}; "
          f"payback {h['payback_months']} months" if h["payback_months"] else
          "  no triage saving at these assumptions: payback not defined")
    s = out["sensitivity"]
    print("HEADLINE 2b - how far the annual figure holds")
    print(f"  practice mix:  net EUR {s['practice_mix']['net_benefit_eur']:,}, payback {s['practice_mix']['payback_months']} months")
    print(f"  synthetic mix: net EUR {s['synthetic_10k_mix']['net_benefit_eur']:,}, payback {s['synthetic_10k_mix']['payback_months']} months")
    print(f"  the saving covers the running cost only if more than {s['break_even_routine_share']:.1%} of claims are routine; "
          f"the most it can ever save is EUR {s['max_possible_saving_eur']:,}")
    e = out["errors"]
    print("HEADLINE 3 - cost of errors (wrong-routine cost ASSUMED; rate swept, not claimed)")
    print(f"  an unnecessary escalation costs EUR {e['extra_cost_unnecessary_escalation_eur']} extra; "
          f"a wrong routine decision EUR {e['cost_wrong_routine_eur']:,}")
    print(f"  so escalate whenever the chance of a wrong routine decision exceeds {e['escalate_above_error_probability']:.2%}")
    print(f"  year-1 net benefit is used up if more than {e['wrong_routine_rate_that_erases_year1_net']:.2%} "
          "of routine decisions are wrong")
    for row in e["annual_cost_by_wrong_routine_rate"]:
        print(f"  wrong-routine rate {row['wrong_routine_rate']:.1%}: {row['wrong_routine_claims']:,} claims, "
              f"EUR {row['annual_error_cost_eur']:,} a year")
    print("\nwrote business_results.json (every figure traces to assumptions.json or a named file)")



def policy_change_saving(policy_path):
    """Saving range for ONE policy change, using the file's own flips on the synthetic file (proxy: flip share
    depends on the assumed claim distribution). Returns labelled figures; no new assumptions."""
    import csv as _csv
    import policy as _policy
    base = _policy.load(HERE / "policies" / "v1.json")
    new = _policy.load(policy_path)
    rows = list(_csv.DictReader(open(HERE / "final_synthetic_10k.csv", newline="", encoding="utf-8")))
    open_rows = [r for r in rows if triage.status_of(r) == "open"]
    flips = sum(1 for r in open_rows if _policy.decide(r, base)[0] != _policy.decide(r, new)[0])
    share = flips / len(open_rows) if open_rows else 0.0
    n_open_total = val("claims_per_year") * val("open_claims_share")
    if flips == 0:
        # A change that moves no claim needs no re-review, manual or with the system.
        manual = system = 0.0
    else:
        manual, system = policy_change_cost(share, n_open_total)
    return {"policy": new["name"], "flip_share": round(share, 4),
            "manual_eur": round(manual), "system_eur": round(system), "saving_eur": round(manual - system),
            "status": "proxy: flip share from synthetic distribution; costs from assumptions.json (ASSUMED)"}


if __name__ == "__main__" and "--policy" in sys.argv:
    print(json.dumps(policy_change_saving(sys.argv[sys.argv.index("--policy") + 1]), indent=2))
    raise SystemExit(0)

if __name__ == "__main__":
    main()
