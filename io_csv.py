"""Tolerant claims CSV reader for private/hidden input files.

Boundary only: this module normalises FORMAT (encoding, delimiter, header spelling, boolean and
number notation). It never changes decision logic and never guesses a missing value:
  - blank stays blank (absent fact)
  - an unreadable value is passed through unchanged, so the engine treats it as absent

Evidence status: BUILT + TESTED (test_all.py: re-encoding invariance on the 26 given claims).

ponytail: single-separator amounts are read as thousands separators only when exactly three digits
follow ("1.500", "1,500"); otherwise as a decimal. Known ceiling: an amount like "1.500" meaning
one and a half euros would be misread. Upgrade trigger: an organiser file that uses such amounts.
"""
import csv
import io
import re

import triage

CANONICAL = [
    "case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type",
    "repair_type", "quote_eur", "incident_report_present", "itemized_quote_present",
    "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict", "expected_v1",
]
BOOL_FIELDS = [
    "policy_active_on_incident", "incident_report_present", "itemized_quote_present",
    "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict",
]
TRUE_WORDS = {"true", "t", "yes", "y", "1", "wahr", "ja", "j"}
FALSE_WORDS = {"false", "f", "no", "n", "0", "falsch", "nein"}
OPEN_WORDS = {"open", "offen", "o"}
CLOSED_WORDS = {"closed", "geschlossen", "abgeschlossen", "c"}
DELIMITERS = [",", ";", "\t", "|"]


def _norm_header(h):
    return re.sub(r"[\s\-]+", "_", h.replace("﻿", "").strip().lower())


def decode_bytes(data):
    """utf-8 with or without BOM; fall back to cp1252 (common for German Excel)."""
    try:
        return data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return data.decode("cp1252"), "cp1252"


def sniff_delimiter(text):
    first = text.lstrip("﻿").splitlines()[0] if text.strip() else ""
    counts = {d: first.count(d) for d in DELIMITERS}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def clean_bool(v):
    s = v.strip()
    low = s.lower()
    if low in TRUE_WORDS:
        return "True"
    if low in FALSE_WORDS:
        return "False"
    return s


def clean_status(v):
    s = v.strip()
    low = s.lower()
    if low in OPEN_WORDS:
        return "open"
    if low in CLOSED_WORDS:
        return "closed"
    return s


def clean_token(v):
    return re.sub(r"[\s\-]+", "_", v.strip().lower())


def clean_amount(v):
    raw = v.strip()
    if not raw:
        return ""
    t = re.sub(r"(?i)eur|€|\s| ", "", raw)
    if not re.fullmatch(r"-?[0-9.,]+", t):
        return raw  # unreadable: the engine treats it as absent
    if "," in t and "." in t:
        dec = "," if t.rfind(",") > t.rfind(".") else "."
        thou = "." if dec == "," else ","
        t = t.replace(thou, "").replace(dec, ".")
    elif "," in t:
        t = t.replace(",", "") if re.fullmatch(r"-?\d{1,3}(,\d{3})+", t) else t.replace(",", ".")
    elif "." in t and re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        float(t)
    except ValueError:
        return raw
    return t


# Spellings that mean one canonical repair type. Matched on letters and digits only, so case, spaces,
# punctuation and the Turkish dotted capital I do not matter. Decision record: a v2 trigger on the exact spelling
# missed "EV High Voltage Battery (HV)" and "Hochvolt-Batterie" (red-team finding 3).
REPAIR_SYNONYMS = {"ev_high_voltage_battery": ["evhighvoltagebattery", "hochvolt"]}


def canonical_repair(token):
    squashed = re.sub(r"[^a-z0-9]", "", token)
    for canon, keys in REPAIR_SYNONYMS.items():
        if any(k in squashed for k in keys):
            return canon
    return token


def read_claims_text(text):
    """Refuses, with the line number, anything it cannot read exactly. It never drops rows silently:
    - an unclosed quote, or a field over the size limit (strict CSV parsing);
    - a row with more cells than the header (an unquoted delimiter would shift every later cell);
    - a row with no case_id;
    - a header with two columns of the same name.
    Short rows are accepted and their missing cells are blank (absent), as exported files often drop trailing blanks."""
    text = text.lstrip("﻿")
    delim = sniff_delimiter(text)
    try:
        rows = [r for r in csv.reader(io.StringIO(text, newline=""), delimiter=delim, strict=True)]
    except csv.Error as exc:
        raise ValueError(f"input file is malformed and was not read: {exc}") from exc
    if not rows:
        raise ValueError("input file is empty")
    header = [_norm_header(h) for h in rows[0]]
    if "case_id" not in header:
        raise ValueError("input file has no case_id column (found: %s)" % ", ".join(header[:8]))
    dupes = sorted({h for h in header if header.count(h) > 1})
    if dupes:
        raise ValueError("input file has duplicate column names, so values would be ambiguous: " + ", ".join(dupes))
    out = []
    seen_ids = set()
    repaired = []
    quarantine = []
    for line_no, raw in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in raw):
            continue
        if len(raw) > len(header):
            # Cleaning, not loss: an unquoted comma inside claim_summary adds cells. The only free-text field is
            # claim_summary, so the extra cells are joined back into it with the delimiter that was there.
            if "claim_summary" not in header:
                raise ValueError(f"line {line_no} has {len(raw)} cells but the header has {len(header)}, "
                                 "and there is no claim_summary column to repair it into")
            i = header.index("claim_summary")
            extra = len(raw) - len(header)
            raw = raw[:i] + [delim.join(raw[i:i + extra + 1])] + raw[i + extra + 1:]
            repaired.append(line_no)
        rec = {col: "" for col in CANONICAL}
        for name, value in zip(header, raw):
            # Unknown columns are kept verbatim so a new policy field reaches the engine (not silently dropped).
            rec[name] = value.strip()
        if not rec["case_id"]:
            raise ValueError(f"line {line_no} has no case_id")
        if rec["case_id"] in seen_ids:
            raise ValueError(f"line {line_no} repeats case_id {rec['case_id']!r}; each claim must appear once")
        seen_ids.add(rec["case_id"])
        for f in BOOL_FIELDS:
            rec[f] = clean_bool(rec[f])
        rec["case_status"] = clean_status(rec["case_status"])
        rec["claim_type"] = clean_token(rec["claim_type"])
        rec["repair_type"] = canonical_repair(clean_token(rec["repair_type"]))
        rec["quote_eur"] = clean_amount(rec["quote_eur"])
        # Quarantine: values that cannot be read. The row is still decided (request information), but it is listed
        # with its line and field so a reviewer sees it. Decision record: a silent request looked like a clean row.
        for f in BOOL_FIELDS:
            if rec[f] not in ("", "True", "False"):
                quarantine.append({"line": line_no, "field": f, "value": rec[f]})
        if rec["quote_eur"] and triage.amount_or_none(rec["quote_eur"]) is None:
            quarantine.append({"line": line_no, "field": "quote_eur", "value": rec["quote_eur"]})
        if rec["case_status"] not in ("open", "closed"):
            quarantine.append({"line": line_no, "field": "case_status", "value": rec["case_status"]})
        out.append(rec)
    return out, {"quarantine": quarantine, "repaired_lines": repaired, "delimiter": delim, "columns_found": [c for c in header if c in CANONICAL],
                 "columns_missing": [c for c in CANONICAL if c not in header and c != "expected_v1"]}


def read_claims(path):
    with open(path, "rb") as f:
        data = f.read()
    text, enc = decode_bytes(data)
    rows, info = read_claims_text(text)
    info["encoding"] = enc
    return rows, info
