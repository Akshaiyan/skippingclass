# Motor Claims Triage — frontend build plan

Build the full cockpit from your master brief, frontend only: hardcoded mock data, in-session state, no backend, no network calls.

## One deviation from the brief
- Routing uses TanStack Router (this project's fixed router) instead of react-router. Same URLs: `/`, `/claims`, `/policy`, plus the decision log view. No visible difference.

## Design direction
- Calm, editorial "regulated instrument" look: warm off-white paper, ink text, hairline rules, generous whitespace.
- Type: a refined serif for headings with a clean grotesk for UI and a mono for ids, hashes, evidence.
- Flow colors as tokens: Red (human review), Amber (request information), Green (routine), Indigo for Unknown, gray for Locked. All colors as design tokens in the stylesheet; light and dark.
- Every icon paired with a text label; designed hover, focus, active, disabled and empty states.

## What gets built
1. Data layer exactly as specified: types, seed claims (incl. PRA-007, PRA-008), policy v1 + draft v2, decision log seed, business case numbers, single adapter file, store (context + reducer), pure three-valued evaluator with Kleene logic and the stated precedence.
2. Copy file holding every rule-bound string (no Approve/Deny/Pay, no accuracy, "not provided, not assumed", "Locked", "Release v2"/"Hold v2", "Rule-based, not a prediction").
3. Overview page (`/`): business case section, evidence-labelled figures, legend, trust chip row.
4. Claims page (`/claims`): grouped sortable table, filters with chips, quick-change actions, keyboard row navigation, empty state; right-side case sheet with "Why this recommendation", facts, suggestion panel, information request, draft email placeholder, HubSpot placeholder; inline override flow with live record preview, inline refusals, and confirmation card.
5. Policy page (`/policy`): rule cards with Changed/Added/Removed chips, rule editor dialog with full condition builder, quote-limit sweep, live proposal report (diff, flip list, exhaustive checks, before/after counts, cost impact), four-eyes gate with Release v2 / Hold v2.
6. Decision log page: latest-first list, type filters, display names for policy entries.
7. Shared shell: header nav, "Signed in as" reviewer name, toasts.

## Technical details
- Files: `src/types.ts`, `src/copy.ts`, `src/data/{seed,businessCase,api}.ts`, `src/store.tsx`, `src/lib/evaluate.ts`, route files under `src/routes/`, components under `src/components/`.
- shadcn/ui components added as needed; recharts for charts; lucide-react icons.
- Unit tests for the evaluator (blank → unknown, red precedence, ABSENT string, closed claims never change) and the override/four-eyes guards.
- Per-route head metadata.
