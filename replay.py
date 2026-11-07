"""Replay a proposed policy change against stored decisions before release (method M1).

Evidence status: OBSERVED that the replay logic produces the flip list it claims (test_all.py).
PROXY for real use: the stored decisions here are recomputed from the claim rows with v1;
in production they would be read from the decision log. The v2 limit used by the demo is a
MADE-UP test change, not a policy.
"""
import engine


def replay(claims, new_quote_limit):
    """claims: list of dict rows with case_status. Returns (results, flips, blocked).

    results: one dict per claim with recommendation_v1, recommendation_v2, needs_recheck.
    flips: open claims whose recommendation changes under the new limit.
    blocked: flips that move a claim INTO routine_processing (need named sign-off before release).
    Closed claims keep their v1 decision and are never flipped.
    """
    results, flips = [], []
    for row in claims:
        v1_rec, v1_rule, _ = engine.decide(row)
        closed = (row.get("case_status") or "").strip() == "closed"
        if closed:
            results.append({
                "case_id": row["case_id"], "recommendation_v1": v1_rec,
                "recommendation_v2": v1_rec, "needs_recheck": False,
                "closed": True, "flipped": False,
            })
            continue
        v2_rec, v2_rule, v2_why = engine.decide(row, quote_limit=new_quote_limit)
        flipped = v2_rec != v1_rec
        results.append({
            "case_id": row["case_id"], "recommendation_v1": v1_rec,
            "recommendation_v2": v2_rec, "needs_recheck": flipped,
            "closed": False, "flipped": flipped,
        })
        if flipped:
            flips.append({
                "case_id": row["case_id"], "from": v1_rec, "to": v2_rec,
                "rule_v1": v1_rule, "rule_v2": v2_rule, "why": v2_why,
            })
    blocked = [f for f in flips if f["to"] == "routine_processing"]
    return results, flips, blocked
