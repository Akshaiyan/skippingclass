"""Escalation-only guard (method M2).

Evidence status: OBSERVED for the monotone property (test_all.py: the output is never less cautious
than the rule output, for every input combination). The BENEFIT of any learned guard is NOT shown by
this file; see simulate_all.py for the measured result. Off by default.
"""
ORDER = {"routine_processing": 0, "request_information": 1, "human_review": 2}


def escalate_only(rule_rec, model_flag):
    """A flagged claim is sent to human review. An unflagged claim keeps the rule's answer.
    The guard can never make a claim less cautious than the rule."""
    if rule_rec == "human_review" or model_flag:
        return "human_review"
    return rule_rec
