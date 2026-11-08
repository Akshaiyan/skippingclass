// Decision memory for one claim: the reviewer's own corrections and the policy changes that moved this claim,
// newest first, with the integrity line from the engine's hash chain. Policy changes are labelled in words
// (EHL's "Recalibrated" marker, adapted: the engine never re-decides, a person approves the change).
import { REC_LABEL } from "@/copy";
import { Chip, FlowBadge } from "./status";
import { useStore } from "@/store";
import type { Rec } from "@/types";

type Affected = { case_id: string; from: Rec; to: Rec };
type OverrideItem = { kind: "override"; key: string; timestamp: string; actor: string; from: Rec; to: Rec; note: string; policy: string; hash: string };
type PolicyItem = { kind: "policy"; key: string; timestamp: string; actor: string; proposedBy: string; policy: string; from: Rec; to: Rec; hash: string };
type Item = OverrideItem | PolicyItem;

export function DecisionMemory({ caseId }: { caseId: string }) {
  const { state } = useStore();
  const items: Item[] = [];
  state.log.forEach((e, i) => {
    if (e.type === "reviewer_override" && e.case_id === caseId) {
      const h = e as unknown as { hash?: string };
      items.push({ kind: "override", key: `o${e.seq}-${i}`, timestamp: e.timestamp, actor: e.actor, from: e.from_rec, to: e.to_rec, note: e.note, policy: e.policy_version, hash: h.hash ?? "" });
    }
    if (e.type === "policy_approved") {
      const p = e as unknown as { affected?: Affected[]; proposed_by?: string; hash?: string; policy_version?: string };
      const hit = (p.affected ?? []).find((a) => a.case_id === caseId);
      if (hit) items.push({ kind: "policy", key: `p${e.seq}-${i}`, timestamp: e.timestamp, actor: e.actor, proposedBy: p.proposed_by ?? "", policy: p.policy_version ?? "", from: hit.from, to: hit.to, hash: p.hash ?? "" });
    }
  });
  // Server timestamps carry microseconds; Date parses milliseconds, so trim before comparing.
  const ts = (s: string) => Date.parse(s.replace(/(\.\d{3})\d+/, "$1")) || 0;
  items.sort((a, b) => ts(b.timestamp) - ts(a.timestamp) || (a.key < b.key ? 1 : -1));
  // A policy change is "awaiting a reviewer" only until a reviewer decides this claim after it.
  const reviewedAfter = (p: PolicyItem) => items.some((o) => o.kind === "override" && ts(o.timestamp) > ts(p.timestamp));
  const integrity = state.source === "live" ? state.integrity : null;

  return (
    <section aria-label="Decision memory" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-end gap-2">
        <span className="tnum text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      <p className="text-sm">
        {integrity ? (
          integrity.intact ? (
            <span className="font-medium text-flow-green">✓ Log intact, checked at {new Date(integrity.checkedAt).toLocaleTimeString("en-GB")}</span>
          ) : (
            <span className="font-medium text-flow-red">Log broken at entry {integrity.broken_at}: {integrity.reason}</span>
          )
        ) : (
          <span className="text-muted-foreground">Demo data: entries here are not written to the engine log.</span>
        )}
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No earlier decisions or policy changes on this claim. A correction recorded here appears at the top.
        </p>
      ) : (
        <ol className="space-y-4 border-l border-border pl-5">
          {items.map((it) => (
            <li key={it.key} className="relative">
              <span aria-hidden className="absolute -left-[26px] top-1.5 block size-2.5 rounded-full border-2 border-accent bg-background" />
              {it.kind === "policy" ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Chip tone="amber">
                      Policy {it.policy} moves this claim, {reviewedAfter(it) ? "reviewed since" : "awaiting reviewer"}
                    </Chip>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <FlowBadge rec={it.from} size="sm" />
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <FlowBadge rec={it.to} size="sm" />
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-text-2">
                    Approved by {it.actor}; proposed by {it.proposedBy || "unknown"}. The claim was not re-decided automatically.
                  </p>
                </>
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <strong>{it.actor}</strong>
                    <span className="text-muted-foreground">changed</span>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <FlowBadge rec={it.from} size="sm" />
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <FlowBadge rec={it.to} size="sm" />
                    </span>
                    <span className="sr-only">from {REC_LABEL[it.from]} to {REC_LABEL[it.to]}</span>
                  </p>
                  <p className="mt-1 text-sm text-text-2">“{it.note}”</p>
                </>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={it.timestamp} className="tnum">
                  {new Date(it.timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </time>
                {it.kind === "override" && <Chip tone="outline">policy {it.policy}</Chip>}
                {it.hash && (
                  <Chip tone="neutral" className="font-mono">
                    <span title="Record fingerprint">#{it.hash.slice(0, 12)}</span>
                  </Chip>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
