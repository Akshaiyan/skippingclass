// "Check a document": paste the text of a supporting document and see which facts it proposes, with the exact line
// each came from, and whether they agree with the claim form. Proposals only: nothing on the claim changes.
import { useState } from "react";
import { checkDocument, describeProposal, type DocCheck } from "@/data/documents";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Chip } from "./status";

const BADGE = { agrees: "Agrees", conflicts: "Disagrees", proposes_blank: "Proposed" } as const;

export function DocumentCheck({ caseId }: { caseId: string }) {
  const { state } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocCheck | null>(null);

  if (state.source !== "live")
    return <p className="text-sm text-muted-foreground">Checking a document needs the engine. It is not connected, so the app is showing demo data.</p>;

  const run = () => {
    setBusy(true);
    setError(null);
    checkDocument(caseId, text)
      .then(setResult)
      .catch((e: unknown) => {
        setResult(null);
        setError(e instanceof Error ? e.message : "The check failed.");
      })
      .finally(() => setBusy(false));
  };

  return (
    <section aria-label="Check a document" className="space-y-3">
      <div>
        <Label htmlFor={`doc-${caseId}`}>Text of a supporting document</Label>
        <Textarea
          id={`doc-${caseId}`}
          className="mt-2 min-h-24 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Total: EUR 1350.00\nSchadendatum: 01.11.2026"}
        />
      </div>
      <Button variant="outline" size="sm" disabled={busy || !text.trim()} onClick={run}>
        {busy ? "Checking…" : "Check document"}
      </Button>
      {error && <p role="alert" className="text-sm text-flow-red">{error}</p>}
      {result && (
        <div className="space-y-2" aria-live="polite">
          {result.proposals.length === 0 ? (
            <p className="text-sm text-text-2">
              No labelled facts found. It looks for lines such as “Total: EUR 1350.00” or “Gesamtbetrag: 1.350,00 EUR”.
            </p>
          ) : (
            <ul className="space-y-2">
              {result.proposals.map((p) => (
                <li key={p.fact} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <Chip tone={p.status === "conflicts" ? "amber" : "outline"}>{BADGE[p.status]}</Chip>
                    <span>{describeProposal(p)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From page {p.page}: <q>{p.source_text}</q>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{result.note}</p>
        </div>
      )}
    </section>
  );
}
