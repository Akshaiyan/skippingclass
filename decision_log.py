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
from pathlib import Path
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


class LogDamaged(ValueError):
    """The log has a line that is not a valid record. Raised instead of crashing, so the server can answer 503."""

    def __init__(self, line_number, reason):
        super().__init__(f"log line {line_number} is damaged: {reason}")
        self.line_number = line_number
        self.reason = reason


def _parse(path):
    """Return [(line_number, entry)] for every record. Raises LogDamaged on the first line that is not valid JSON."""
    try:
        with open(path, encoding="utf-8") as f:
            raw = [(n, l) for n, l in enumerate(f, start=1) if l.strip()]
    except FileNotFoundError:
        return []
    out = []
    for n, line in raw:
        try:
            out.append((n, json.loads(line)))
        except json.JSONDecodeError as exc:
            raise LogDamaged(n, f"not a valid record ({exc.msg})")
    return out


def verify_chain(path):
    """Return None if the log is intact, else (line_number, reason) of the first broken entry."""
    expected_prev = "GENESIS"
    try:
        parsed = _parse(path)
    except LogDamaged as exc:
        return (exc.line_number, exc.reason)
    for n, entry in parsed:
        if entry.get("prev_hash") != expected_prev:
            return (n, "prev_hash does not match the previous entry")
        if entry.get("hash") != _digest(entry):
            return (n, "hash does not match the entry contents")
        expected_prev = entry["hash"]
    return None


def repair(path):
    """Recover from a crash mid-write. Only a damaged LAST line is moved, to <log>.torn, so nothing is lost silently.
    A damaged line in the middle is never repaired automatically: that is tampering, and it needs a person.
    Returns the moved text, or None if there was nothing to repair."""
    path = Path(path)
    with open(path, encoding="utf-8") as f:
        lines = [l for l in f if l.strip()]
    try:
        _parse(path)
        return None
    except LogDamaged as exc:
        if exc.line_number != len(lines):
            raise
    torn = lines[-1]
    keep = lines[:-1]
    with open(path.with_name(path.name + ".torn"), "a", encoding="utf-8") as f:
        f.write(torn)
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(keep)
    return torn


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
        return [entry for _, entry in _parse(self.path)]



if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == "repair":
        moved = repair(sys.argv[2])
        print("nothing to repair" if moved is None else f"moved the torn last line to {sys.argv[2]}.torn: {moved.strip()[:80]}")
    elif len(sys.argv) == 3 and sys.argv[1] == "verify":
        bad = verify_chain(sys.argv[2])
        print("intact" if bad is None else f"BROKEN at line {bad[0]}: {bad[1]}")
        sys.exit(0 if bad is None else 1)
    else:
        print("usage: python decision_log.py verify|repair <log.ndjson>")
        sys.exit(2)
