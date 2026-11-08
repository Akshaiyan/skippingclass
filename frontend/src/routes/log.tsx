import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { LogEntry } from "@/types";
import { SORT_RECENT, LOG_TYPE_LABEL } from "@/copy";
import { useStore } from "@/store";
import { replaysStored } from "@/lib/report";
import { cn } from "@/lib/utils";
import { Chip, FlowBadge, PageHeader, PolicyStamp } from "@/components/status";
import { Button } from "@/components/ui/button";
import { ActivityGrid } from "@/components/ActivityGrid";

export const Route = createFileRoute("/log")({
  head: () => ({
    meta: [
      { title: "Decision log · Motor claims triage" },
      {
        name: "description",
        content:
          "Append-only record of every system decision, reviewer override and policy sign-off.",
      },
      { property: "og:title", content: "Decision log · Motor claims triage" },
      {
        property: "og:description",
        content: "An append-only, replayable audit trail for claim recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogPage,
});

function CopyJson({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* ignore */
        }
        setC(true);
        setTimeout(() => setC(false), 2000);
      }}
    >
      {c ? <Check aria-hidden /> : <Copy aria-hidden />} {c ? "Copied" : "Copy JSON"}
    </Button>
  );
}

/** The log as a story: when, who, what changed, why. Same records as the table, read top to bottom. */
function Timeline({ rows }: { rows: LogEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="relative space-y-4 border-l border-border pl-6" aria-label="Decision timeline">
      {rows.map((e) => {
        const note = "reason" in e ? e.reason : "note" in e ? e.note : undefined;
        const hash = (e as { hash?: string }).hash;
        const isOpen = open === e.seq;
        return (
          <li key={e.seq} className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.85rem] top-4 size-2.5 rounded-full border-2 border-background bg-foreground"
            />
            <div className="card-panel space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Chip
                  tone={
                    e.type === "reviewer_override" ||
                    e.type.startsWith("policy_a") ||
                    e.type === "policy_rejected"
                      ? "solid"
                      : "neutral"
                  }
                >
                  {LOG_TYPE_LABEL[e.type]}
                </Chip>
                <span className="text-sm font-medium">{e.actor}</span>
                {"case_id" in e && e.case_id && (
                  <span className="font-mono text-xs">{e.case_id}</span>
                )}
                <time className="tnum ml-auto font-mono text-xs text-text-2">
                  {e.timestamp.replace("T", " ").slice(0, 19)} UTC
                </time>
              </div>
              {"to_rec" in e && e.to_rec && (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {"from_rec" in e && e.from_rec && (
                    <>
                      <FlowBadge rec={e.from_rec} size="sm" />
                      <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
                    </>
                  )}
                  <FlowBadge rec={e.to_rec} size="sm" />
                </span>
              )}
              {note && (
                <p className="text-sm">
                  <span className="font-medium">Reason:</span> {note}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <PolicyStamp version={e.policy_version} hash={e.policy_hash} />
                {hash && (
                  <span className="font-mono" title="Record fingerprint">
                    #{hash.slice(0, 12)}
                  </span>
                )}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : e.seq)}
                  className="inline-flex items-center gap-1 text-text-2 underline-offset-2 hover:underline"
                >
                  <ChevronRight
                    className={cn("size-3 transition-transform", isOpen && "rotate-90")}
                    aria-hidden
                  />
                  Inspect record
                </button>
              </div>
              {isOpen && (
                <div className="flex items-start justify-between gap-4 rounded-md bg-surface p-3">
                  <pre className="overflow-x-auto font-mono text-xs leading-5 text-text-2">
                    {JSON.stringify(e, null, 2)}
                  </pre>
                  <CopyJson text={JSON.stringify(e, null, 2)} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LogPage() {
  const { state, v1Rules } = useStore();
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [type, setType] = useState<"all" | LogEntry["type"]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  // Replay: the live rules run on each claim's stored facts and must reproduce every stored rule result.
  const replayed = state.claims.filter((c) => replaysStored([c], v1Rules)).length;
  const integrity = state.source === "live" ? state.integrity : null;

  const rows = useMemo(
    () =>
      [...state.log]
        .reverse()
        .filter((e) => type === "all" || e.type === type)
        .filter((e) => {
          const needle = q.trim().toLowerCase();
          if (!needle) return true;
          // Search the case, the person and the written reason, as a reviewer looks for "who decided this, and why".
          const reason = "reason" in e ? e.reason : "note" in e ? e.note : "";
          const caseId = "case_id" in e ? (e.case_id ?? "") : "";
          return [caseId, e.actor, reason ?? ""].some((s) => s.toLowerCase().includes(needle));
        }),
    [state.log, type, q],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Decision log" />
      <p className="-mt-3 max-w-[70ch] text-sm text-text-2">
        Every override and policy decision is recorded here with who decided, why, and the policy in force. Records
        are append-only and hash-chained, so none can be edited without showing.
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        {integrity ? (
          integrity.intact ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4" aria-hidden /> Hash chain intact
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 font-medium text-destructive">
              <ShieldAlert className="size-4" aria-hidden /> Hash chain broken at entry{" "}
              {integrity.broken_at}: {integrity.reason}
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-2 text-text-2">
            <ShieldAlert className="size-4" aria-hidden /> Demo data: no hash chain to check
          </span>
        )}
        <span className="inline-flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4" aria-hidden />
          <span className="tnum">
            {replayed}/{state.claims.length}
          </span>
          claims replay from their stored facts
        </span>
      </div>

      <ActivityGrid log={state.log} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-text-2">
          <span className="sr-only">Record type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs hover:border-border-strong"
          >
            <option value="all">All types</option>
            {(Object.keys(LOG_TYPE_LABEL) as LogEntry["type"][]).map((t) => (
              <option key={t} value={t}>
                {LOG_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search by case, person or reason</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case, person or reason"
            className="h-8 w-64 rounded-md border border-border bg-background pl-8 pr-2 text-xs hover:border-border-strong"
          />
        </label>
        <span className="tnum text-xs text-muted-foreground">
          {rows.length} of {state.log.length} records
        </span>
        <span className="text-xs text-muted-foreground">{SORT_RECENT}</span>
        <div className="ml-auto inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          {(["timeline", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-7 rounded px-3 text-xs font-medium capitalize",
                view === v ? "bg-foreground text-background" : "text-text-2 hover:bg-surface",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {state.source === "connecting" && state.log.length === 0 ? (
        <div className="space-y-2" role="status" aria-label="Loading the decision log">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-panel h-12 animate-pulse bg-surface-2" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-text-2">
            {state.log.length === 0
              ? "No decisions are recorded yet. Overrides and policy decisions appear here as soon as someone records one."
              : "No records match these filters."}
          </p>
          {state.log.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setType("all");
                setQ("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : view === "timeline" ? (
        <Timeline rows={rows} />
      ) : (
        <div className="card-panel overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-left">
                {[
                  "",
                  "Seq",
                  "Timestamp (UTC)",
                  "Type",
                  "Case",
                  "Actor",
                  "From → to",
                  "Reason code",
                  "Note",
                  "Policy",
                ].map((h, i) => (
                  <th key={i} className="eyebrow border-b border-border px-3 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isOpen = open === e.seq;
                const note = "reason" in e ? e.reason : "note" in e ? e.note : undefined;
                return (
                  <Fragment key={e.seq}>
                    <tr
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : e.seq)}
                      onKeyDown={(k) =>
                        (k.key === "Enter" || k.key === " ") &&
                        (k.preventDefault(), setOpen(isOpen ? null : e.seq))
                      }
                      className="cursor-pointer border-b border-border hover:bg-surface"
                    >
                      <td className="px-3 py-3">
                        <ChevronRight
                          className={cn(
                            "size-3.5 text-muted-foreground transition-transform",
                            isOpen && "rotate-90",
                          )}
                          aria-hidden
                        />
                      </td>
                      <td className="tnum px-3 py-3 font-mono text-xs">{e.seq}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-text-2">
                        {e.timestamp.replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-3 py-3">
                        <Chip
                          tone={
                            e.type === "reviewer_override" ||
                            e.type.startsWith("policy_a") ||
                            e.type === "policy_rejected"
                              ? "solid"
                              : "neutral"
                          }
                        >
                          {LOG_TYPE_LABEL[e.type]}
                        </Chip>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                        {"case_id" in e ? (e.case_id ?? "—") : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{e.actor}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {"from_rec" in e && e.from_rec && (
                            <>
                              <FlowBadge rec={e.from_rec} size="sm" />
                              <ArrowRight
                                className="size-3 text-muted-foreground"
                                aria-label="to"
                              />
                            </>
                          )}
                          {"to_rec" in e && e.to_rec ? (
                            <FlowBadge rec={e.to_rec} size="sm" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {"reason_code" in e ? e.reason_code : "—"}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-text-2">
                        {note ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <PolicyStamp version={e.policy_version} hash={e.policy_hash} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-surface">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <pre className="overflow-x-auto font-mono text-xs leading-5 text-text-2">
                              {JSON.stringify(e, null, 2)}
                            </pre>
                            <CopyJson text={JSON.stringify(e, null, 2)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
