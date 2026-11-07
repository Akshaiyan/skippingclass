// What a policy change does, as the engine computes it, before anyone releases it.
// Open claims whose recommendation changes are listed by transition and by the rule that decides.
// Closed claims are never re-decided. A move into routine needs a named sign-off by someone other than the proposer.
import { useEffect, useState } from "react";
import { REC_LABEL } from "@/copy";
import { fetchChange, type EngineChange as Change } from "@/data/live";
import { useStore } from "@/store";
import type { Rec } from "@/types";

export function EngineChange() {
  const { state } = useStore();
  const [change, setChange] = useState<Change | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.source !== "live") return;
    let cancelled = false;
    fetchChange()
      .then((c) => !cancelled && setChange(c))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "The change check failed."));
    return () => {
      cancelled = true;
    };
  }, [state.source, state.log.length]);

  return (
    <section aria-labelledby="engine-change-title" className="rounded-lg border border-border bg-surface p-4">
      <h3 id="engine-change-title" className="section-title">Engine check: v2 against v1</h3>

      {state.source !== "live" && (
        <p className="mt-2 text-sm text-muted-foreground">Connect the triage service to see the engine’s check of this change.</p>
      )}
      {state.source === "live" && error && <p className="mt-2 text-sm font-medium text-flow-red">{error}</p>}
      {state.source === "live" && !error && !change && <p className="mt-2 text-sm text-muted-foreground">Checking the change…</p>}

      {change && (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            <strong className="tnum">{change.open_changed}</strong> of <span className="tnum">{change.open_total}</span> open claims change under v2.{" "}
            <span className="tnum">{change.closed_kept_as_v1}</span> closed claims keep their v1 decision.
          </p>

          {change.requires_signoff ? (
            <p className="font-medium text-flow-red">
              {change.into_routine.length} {change.into_routine.length === 1 ? "claim moves" : "claims move"} into routine processing ({change.into_routine.join(", ")}).
              A second person must sign this off before release.
            </p>
          ) : (
            <p className="text-muted-foreground">No claim moves into routine processing, so no routine sign-off is needed.</p>
          )}

          {change.flips.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {change.flips.map((f) => (
                <li key={f.case_id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-xs">{f.case_id}</span>
                  <span>
                    {REC_LABEL[f.from as Rec]} → <strong>{REC_LABEL[f.to as Rec]}</strong>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{f.rule_to}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{change.note}</p>
        </div>
      )}
    </section>
  );
}
