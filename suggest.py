"""Rule-derived next-best-information. No ML. Evidence: BUILT + TESTED (test_suggest.py).

For a claim, try filling each blank field with each plausible value and see whether the decision
changes. Blank fields interact, so single fills can be misleading: we report single-field flips and
also flag when the decision is still undecided after every single fill (needs two or more answers).
"""
import engine

FILL = {
    "policy_active_on_incident": ["True", "False"],
    "claim_type": ["motor_own_damage", "theft"],
    "quote_eur": ["800", "1600"],
    "incident_report_present": ["True", "False"],
    "itemized_quote_present": ["True", "False"],
    "injury_reported": ["True", "False"],
    "liability_disputed": ["True", "False"],
    "duplicate_flag": ["True", "False"],
    "evidence_conflict": ["True", "False"],
}


def suggest(row):
    base, _, _ = engine.decide(row)
    blanks = [k for k in FILL if (row.get(k) or "").strip() == ""]
    single = []
    for k in blanks:
        outcomes = set()
        for v in FILL[k]:
            r = dict(row)
            r[k] = v
            outcomes.add(engine.decide(r)[0])
        if outcomes != {base}:
            single.append({"field": k, "possible_outcomes": sorted(outcomes)})
    undecided = base == "request_information" and not single and blanks
    return {
        "case_id": row["case_id"],
        "current": base,
        "blank_fields": blanks,
        "decision_changing_single_answers": single,
        "needs_two_or_more_answers": undecided,
        "note": ("Ask for the decision-changing field(s) first." if single else
                 "No single answer changes the decision; more than one blank must be filled." if undecided
                 else "No blank fields: the missing item is a document or a False value. Request it." if not blanks
                 else "No blank field changes the decision."),
    }
