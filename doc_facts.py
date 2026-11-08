"""Document fact check: documents PROPOSE facts; they never change a structured field or the decision.

Each proposed fact keeps: value (or None), source_text (the exact matched line), page, confidence.
A proposed fact that disagrees with the structured field becomes an evidence conflict, which the
claim's review routes to a human. The engine is not called with document values at all.

Evidence status: DEMONSTRATION of the boundary (observed on constructed cases in test_doc_facts.py).
Extraction is deterministic regex over labelled lines. No accuracy claim is made for real documents.
Known ceiling: only the two labelled patterns below. Upgrade trigger: real documents with other layouts.
"""
import re

LABEL_PATTERNS = {
    # label -> (structured field, pattern, parser)
    "quote_total": ("quote_eur", re.compile(r"^\s*(?:Gesamtbetrag|Total)\s*:\s*(?:EUR|€)?\s*([0-9][0-9.,]*)\s*(?:EUR|€)?\s*$", re.I)),
    "incident_date": ("incident_date", re.compile(r"^\s*(?:Schadendatum|Incident date)\s*:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})\s*$", re.I)),
}


def _amount(text):
    t = text.strip()
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        return round(float(t), 2)
    except ValueError:
        return None


def extract(doc_pages):
    """doc_pages: list of page texts. Returns {fact_name: {value, source_text, page, confidence}}.
    A label with no matching line is returned as value None (missing stays missing)."""
    facts = {name: {"value": None, "source_text": None, "page": None, "confidence": None}
             for name in LABEL_PATTERNS}
    for page_no, text in enumerate(doc_pages, start=1):
        for line in text.splitlines():
            for name, (_field, pat) in LABEL_PATTERNS.items():
                m = pat.match(line)
                if m and facts[name]["value"] is None:
                    raw = m.group(1)
                    value = _amount(raw) if name == "quote_total" else raw
                    if value is None:
                        continue
                    facts[name] = {"value": value, "source_text": line.strip(), "page": page_no,
                                   "confidence": "High"}
    return facts


def conflicts(structured_row, doc_pages):
    """Compare proposed facts with the structured fields. Returns a list of conflicts (empty = none).
    Only conflicts are reported; this never writes to the structured row."""
    out = []
    facts = extract(doc_pages)
    for name, (field, _pat) in LABEL_PATTERNS.items():
        proposed = facts[name]["value"]
        if proposed is None:
            continue  # absent in the document: nothing to compare, nothing to infer
        raw = (structured_row.get(field) or "").strip()
        if not raw:
            continue  # structured field blank: the document cannot fill it (absent stays absent)
        if name == "quote_total":
            try:
                actual = _amount(raw)
            except ValueError:
                actual = None
        else:
            actual = raw
        if actual != proposed:
            out.append({"fact": name, "structured_field": field, "structured_value": actual,
                        "document_value": proposed, "source_text": facts[name]["source_text"],
                        "page": facts[name]["page"], "route": "human_review"})
    return out
