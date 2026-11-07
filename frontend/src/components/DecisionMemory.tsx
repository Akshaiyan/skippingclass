// Decision memory for one claim: every recorded override, newest first, with the reviewer, the change, the reason,
// the policy version and a record fingerprint. The integrity line comes from the engine's hash chain.
import { REC_LABEL } from "@/copy";
import { useStore } from "@/store";
import type { LogEntry, ReviewerOverride } from "@/types";

type Hashed = LogEntry & { hash?: string; prev_hash?: string };

export function DecisionMemory({ caseId }: { caseId: string }) {
  const { state } = useStore();
  const events = state.log
    .filter((e): e is ReviewerOverride & Hashed => e.type === "reviewer_override" && e.case_id === caseId)
    .slice()
    .reverse();

  return (
    <section aria-labelledby="memory-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="memory-title" className="section-title">Decision memory</h3>
        <span className="tnum text-sm text-muted-foreground">
          {events.length} {events.length === 1 ? "decision" : "decisions"}
        </span>
      </div>

      <p className="mt-1 text-sm">
        {state.source === "live" && state.integrity ? (
          state.integrity.intact ? (
            <span className="font-medium text-flow-green">
              ✓ Log intact, checked at {new Date(state.integrity.checkedAt).toLocaleTimeString("en-GB")}
            </span>
          ) : (
            <span className="font-medium text-flow-red">
              Log broken at entry {state.integrity.broken_at}: {state.integrity.reason}
            </span>
          )
        ) : (
          <span className="text-muted-foreground">Demo data: decisions here are not written to the engine log.</span>
        )}
      </p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No earlier decisions on this claim. A correction recorded here appears at the top.
        </p>
      ) : (
        <ol className="mt-4 space-y-4 border-l border-border pl-5">
          {events.map((e) => (
            <li key={e.seq} className="relative">
              <span aria-hidden className="absolute -left-[26px] top-1.5 block size-2.5 rounded-full border-2 border-accent bg-background" />
              <p className="text-sm">
                <strong>{e.actor}</strong> changed {REC_LABEL[e.from_rec]} to <strong>{REC_LABEL[e.to_rec]}</strong>
              </p>
              <p className="mt-1 text-sm text-text-2">“{e.note}”</p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <time className="tnum">{e.timestamp}</time>
                <span>policy {e.policy_version}</span>
                {e.hash && <code className="font-mono" title="Record fingerprint">{e.hash.slice(0, 12)}</code>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
