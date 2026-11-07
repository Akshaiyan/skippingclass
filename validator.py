"""Validator for the batch results CSV, run before any upload (method M6).

Evidence status: OBSERVED on the failure cases in test_all.py (each defect is caught).
Checks only the file's shape and the decision vocabulary; it cannot check decision correctness.
"""
import csv
import hashlib

REQUIRED_COLUMNS = [
    "case_id", "recommendation_v1", "recommendation_v2", "needs_recheck",
    "rule_v1", "rule_v2", "explanation",
]
ALLOWED = {"routine_processing", "request_information", "human_review"}


def validate(results_path, input_case_ids):
    """Return a list of error strings. An empty list means the file may be uploaded."""
    errors = []
    with open(results_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != REQUIRED_COLUMNS:
            errors.append(f"columns are {reader.fieldnames}, expected {REQUIRED_COLUMNS}")
            return errors
        rows = list(reader)
    seen = set()
    for i, row in enumerate(rows, start=2):
        cid = row["case_id"]
        if cid in seen:
            errors.append(f"line {i}: duplicate case_id {cid}")
        seen.add(cid)
        for col in ("recommendation_v1", "recommendation_v2"):
            if row[col] not in ALLOWED:
                errors.append(f"line {i}: {col}={row[col]!r} not allowed")
        if row["needs_recheck"] not in ("True", "False"):
            errors.append(f"line {i}: needs_recheck={row['needs_recheck']!r} not boolean")
        if not row["explanation"].strip():
            errors.append(f"line {i}: empty explanation")
    expected = set(input_case_ids)
    missing = expected - seen
    extra = seen - expected
    if missing:
        errors.append(f"{len(missing)} input cases missing from results, e.g. {sorted(missing)[:3]}")
    if extra:
        errors.append(f"{len(extra)} result rows not in input, e.g. {sorted(extra)[:3]}")
    return errors


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
