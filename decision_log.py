"""Append-only decision log (method: reviewer override recording, decision history).

Evidence status: BUILT + TESTED (test_all.py): earlier bytes never change; invalid records are refused.
The log has no update or delete method by design.

Two record types, each with its own required fields:
  reviewer_override  case_id, actor, reason, policy_version, original_recommendation,
                     corrected_recommendation  (the correction itself is recorded, as the brief requires)
  policy_decision    actor, reason, policy_version, decision ('approved' | 'rejected')
"""
import hashlib
import json
import threading

_APPEND_LOCK = threading.Lock()  # one writer at a time within this process
from datetime import datetime, timezone

RECOMMENDATIONS = {"routine_processing", "request_information", "human_review"}
POLICY_DECISIONS = {"approved", "rejected"}

REQUIRED_FIELDS = {
    "reviewer_override": {
        "case_id", "actor", "reason", "policy_version",
        "original_recommendation", "corrected_recommendation",
    },
    "policy_decision": {"actor", "reason", "policy_version", "decision", "proposed_by"},
}
ALLOWED_TYPES = set(REQUIRED_FIELDS)


def _validate(record):
    rtype = record.get("type")
    if rtype not in ALLOWED_TYPES:
        raise ValueError(f"type {rtype!r} is not an allowed decision type")
    missing = REQUIRED_FIELDS[rtype] - set(record)
    if missing:
        raise ValueError(f"missing fields: {sorted(missing)}")
    for field in ("reason", "actor", "policy_version"):
        if not str(record[field]).strip():
            raise ValueError(f"{field} must not be empty")
    if rtype == "reviewer_override":
        orig, corr = record["original_recommendation"], record["corrected_recommendation"]
        if orig not in RECOMMENDATIONS or corr not in RECOMMENDATIONS:
            raise ValueError("recommendations must be one of the three allowed next steps")
        if orig == corr:
            raise ValueError("an override must change the recommendation")
    if rtype == "policy_decision":
        if record["decision"] not in POLICY_DECISIONS:
            raise ValueError("decision must be 'approved' or 'rejected'")
        if not str(record["proposed_by"]).strip():
            raise ValueError("proposed_by must not be empty")
        if record["actor"].strip().lower() == record["proposed_by"].strip().lower():
            raise ValueError("four-eyes: the approver must not be the person who proposed the change")


def _digest(entry):
    body = {k: v for k, v in entry.items() if k != "hash"}
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def verify_chain(path):
    """Return None if the log is intact, else (line_number, reason) of the first broken entry."""
    expected_prev = "GENESIS"
    try:
        with open(path, encoding="utf-8") as f:
            lines = [l for l in f if l.strip()]
    except FileNotFoundError:
        return None
    for i, line in enumerate(lines, start=1):
        entry = json.loads(line)
        if entry.get("prev_hash") != expected_prev:
            return (i, "prev_hash does not match the previous entry")
        if entry.get("hash") != _digest(entry):
            return (i, "hash does not match the entry contents")
        expected_prev = entry["hash"]
    return None


class DecisionLog:
    def __init__(self, path):
        self.path = path

    def append(self, record):
        """Append one record and return the entry as written. The previous hash is read, the record hashed and
        written under one lock, so two concurrent writers cannot both chain to the same record (a fork)."""
        _validate(record)
        entry = dict(record)
        with _APPEND_LOCK:
            entry["timestamp"] = datetime.now(timezone.utc).isoformat()
            entry["prev_hash"] = self._last_hash()
            entry["hash"] = _digest(entry)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
        return entry

    def _last_hash(self):
        entries = self.read()
        return entries[-1]["hash"] if entries else "GENESIS"

    def read(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                return [json.loads(line) for line in f if line.strip()]
        except FileNotFoundError:
            return []
