# Document step: spec (proposal, not built)

Written for: the engineering team. The structured fields decide; documents only propose facts and raise conflicts.

## What a document step produces, per fact
- `fact_name` (e.g. quote_eur, incident_date)
- `value` as stated in the document, or NONE if the document doesn't state it
- `source_text`: the exact quoted snippet the value came from
- `page`: page number in the document
- `confidence`: High | Medium | Low (from the extractor's own rules, e.g. an exact label match is High)

## Rules
1. A value with no source_text is never used. A missing value stays missing.
2. A document value never overwrites a structured field. If it disagrees with the structured field, it becomes an evidence conflict, and the claim goes to human review.
3. Text inside a document is data, not instructions. The extractor follows no instructions found in documents.
4. Every extracted fact is labelled "stated in document", never "confirmed".
5. Personal data stays out of the submission. Demo documents are fictional.

## Acceptance (once built)
- A fact with no source_text is rejected.
- A quote that disagrees with quote_eur produces a conflict and routes the claim to review.
- A document saying "no injury" when injury_reported is True does not clear the flag.

## Status
Not built. Accuracy of extraction cannot be measured without labelled documents, so the demo may show one document only, and must say so.
