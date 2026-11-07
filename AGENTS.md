<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Architecture rules
- Frontend only: no backend, network calls or persistence; all reads/writes go through `src/data/api.ts` so the mock layer can be swapped for the real JSON API.
- Recommendations are always computed by the pure three-valued evaluator in `src/lib/evaluate.ts` (seed data included) so seed and logic never disagree.
- All rule-bound UI copy lives in `src/copy.ts` for auditability.
- Session state lives in one reducer in `src/store.tsx`; derived v2 results are recomputed, never stored.
- Policy charts derive count shares and weighted handling costs through the mock API adapter; flow rates are nullable session state, so missing prices are never treated as zero.
- A module exports either components or non-components, never both: the provider lives in `src/store.provider.tsx` while `src/store.tsx` holds only the context, hook, reducer and types, because mixing them makes hot reload leave a stale context and blank the preview.
