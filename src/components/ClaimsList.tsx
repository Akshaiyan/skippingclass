import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, RefreshCw, Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Flow, Rec } from "@/types";
import { FLOW_OF, LOCKED_TOOLTIP, REC_LABEL, REC_ORDER } from "@/copy";
import { useStore } from "@/store";
import type { DerivedClaim } from "@/lib/report";
import {
  byUrgency,
  eur,
  incidentDate,
  nextStep,
  quoteOf,
  shortReason,
  type NextStep,
} from "@/lib/claim-view";
import {
  applyBaseFilters,
  DEFAULT_FILTERS,
  flowCounts,
  isDefaultFilters,
  type FlowFilter,
  type StatusFilter,
} from "@/lib/claims-filter";
import { cn } from "@/lib/utils";
import { NotProvided, WhyDisabled } from "@/components/status";
import { FLOW_BORDER, FLOW_EDGE, FLOW_NAME } from "@/lib/flow-styles";
import { CaseSheet } from "@/components/CaseSheet";
import { TextTabs } from "@/components/TextTabs";
import { Button } from "@/components/ui/button";

export type { FlowFilter };

/** How many claims the compact dashboard list shows before linking to the full list. */
const COMPACT_LIMIT = 8;

/**
 * The two other flows as side by side buttons. The colour edge under each one is the flow it moves the
 * claim to; a click opens the override with that target chosen.
 */
function MoveTo({ c, onPick }: { c: DerivedClaim; onPick: (r: Rec) => void }) {
  const locked = c.case_status === "closed";
  const others = REC_ORDER.filter((r) => r !== c.recommendation_v1);
  return (
    <div
      className="flex flex-wrap gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {others.map((r) => (
        <WhyDisabled key={r} disabled={locked} reason={LOCKED_TOOLTIP}>
          <button
            type="button"
            disabled={locked}
            onClick={() => onPick(r)}
            aria-label={`Move ${c.case_id} to ${REC_LABEL[r]}`}
            className={cn(
              "touch-target inline-flex h-9 touch-manipulation select-none items-center whitespace-nowrap border border-b-[3px] border-border bg-background px-3 text-sm font-medium text-foreground transition-[background-color,border-color,opacity] duration-(--dur-fast) ease-(--ease-out) [-webkit-tap-highlight-color:transparent] hover:border-border-strong hover:bg-surface active:opacity-70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background",
              FLOW_EDGE[FLOW_OF[r]],
            )}
          >
            {REC_LABEL[r]}
          </button>
        </WhyDisabled>
      ))}
    </div>
  );
}

function StepText({ step }: { step: NextStep }) {
  return (
    <span
      className={cn("text-sm", step.kind === "done" ? "text-foreground" : "text-muted-foreground")}
    >
      {step.kind === "done" && (
        <Check className="mr-1 inline size-3.5 -translate-y-px text-muted-foreground" aria-hidden />
      )}
      {step.label}
    </span>
  );
}

function RecheckText() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-2">
      <RefreshCw className="size-3" aria-hidden /> Recheck
    </span>
  );
}

const statusText = (c: DerivedClaim) => (c.case_status === "open" ? "Open" : "Closed");

/** Flow name with its count on one baseline, the strong rule directly under it. */
function GroupHeading({ flow, count }: { flow: Flow; count: number }) {
  return (
    <span className="flex items-baseline gap-3">
      <span className="font-display text-2xl font-semibold text-foreground">{FLOW_NAME[flow]}</span>
      <span className="tnum text-base font-normal text-muted-foreground">
        {count} {count === 1 ? "claim" : "claims"}
      </span>
    </span>
  );
}

export function ClaimsList({
  flow,
  setFlow,
  heading,
  hideFlowFilter,
  compact,
}: {
  flow: FlowFilter;
  setFlow: (f: FlowFilter) => void;
  heading?: ReactNode;
  hideFlowFilter?: boolean;
  /** Dashboard mode: open claims only, no filter bar, no row actions, a link to the full list. */
  compact?: boolean;
}) {
  const { derived, state } = useStore();
  const [status, setStatus] = useState<StatusFilter>(DEFAULT_FILTERS.status);
  const [q, setQ] = useState(DEFAULT_FILTERS.q);
  const [recheckOnly, setRecheckOnly] = useState(DEFAULT_FILTERS.recheckOnly);
  const [openId, setOpenId] = useState<string | null>(null);
  const [initialOverride, setInitialOverride] = useState<Rec | undefined>();
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const clear = () => {
    setFlow("all");
    setStatus(DEFAULT_FILTERS.status);
    setQ(DEFAULT_FILTERS.q);
    setRecheckOnly(DEFAULT_FILTERS.recheckOnly);
  };

  const effectiveStatus: StatusFilter = compact ? "open" : status;
  const filters = { status: effectiveStatus, q, recheckOnly };
  const base = useMemo(
    () => applyBaseFilters(derived, filters),
    [derived, effectiveStatus, q, recheckOnly],
  );
  const counts = flowCounts(base);
  const recheckCount = useMemo(
    () =>
      applyBaseFilters(derived, { ...filters, recheckOnly: false }).filter((c) => c.needs_recheck)
        .length,
    [derived, effectiveStatus, q],
  );
  const filtered = useMemo(
    () => base.filter((c) => flow === "all" || c.flow === flow).sort(byUrgency),
    [base, flow],
  );
  const rows = compact ? filtered.slice(0, COMPACT_LIMIT) : filtered;
  const hidden = filtered.length - rows.length;
  const groups = (["red", "yellow", "green"] as Flow[])
    .map((f) => ({ flow: f, items: rows.filter((r) => r.flow === f) }))
    .filter((g) => g.items.length);

  const openClaim = derived.find((c) => c.case_id === openId) ?? null;
  const open = (id: string, target?: Rec) => {
    setInitialOverride(target);
    setOpenId(id);
  };

  const onRowKey = (e: KeyboardEvent, id: string) => {
    const idx = rows.findIndex((r) => r.case_id === id);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(id);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) rowRefs.current[next.case_id]?.focus();
    }
  };

  // Live engine cases carry no incident date; drop the column rather than fill it with blanks.
  const showDate = derived.some((c) => incidentDate(c) !== null);
  const cols = [
    "Case",
    "Reason",
    "Quote",
    "Next step",
    ...(showDate ? ["Incident date"] : []),
    ...(compact ? [] : ["Move to"]),
  ];
  // Relative widths; the reason column takes what the others leave.
  const width: Record<string, number> = {
    Case: 12,
    Quote: 8,
    "Next step": 14,
    "Incident date": 10,
    "Move to": 34,
  };
  const reasonWidth = 100 - cols.filter((c) => c !== "Reason").reduce((n, c) => n + width[c]!, 0);
  const loading = state.source === "connecting" && derived.length === 0;

  return (
    <div className="space-y-8">
      {heading}

      {!compact && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-border">
            {!hideFlowFilter ? (
              <TextTabs
                label="Recommendation"
                value={flow}
                onChange={setFlow}
                options={(["all", "red", "yellow", "green"] as FlowFilter[]).map((f) => ({
                  value: f,
                  count: counts[f],
                  label: f === "all" ? "All" : FLOW_NAME[f],
                }))}
              />
            ) : (
              <span />
            )}
            <label className="relative mb-2 flex items-center">
              <Search
                className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
                aria-hidden
              />
              <span className="sr-only">Search by case id</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search case id"
                className="h-9 w-48 rounded-md border border-border bg-background pl-8 pr-2 text-base hover:border-border-strong md:text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <div className="flex flex-wrap items-center gap-x-6">
              <TextTabs
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                  { value: "all", label: "All" },
                ]}
              />
              {(recheckCount > 0 || recheckOnly) && (
                <button
                  type="button"
                  aria-pressed={recheckOnly}
                  onClick={() => setRecheckOnly(!recheckOnly)}
                  className={cn(
                    "relative inline-flex min-h-11 touch-manipulation select-none items-baseline gap-2 py-2 text-sm transition-[color,opacity] duration-(--dur-fast) ease-(--ease-out) [-webkit-tap-highlight-color:transparent] active:opacity-70",
                    recheckOnly
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  Needs recheck
                  <span className="tnum text-xs font-normal">{recheckCount}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground transition-transform duration-(--dur-fast) ease-(--ease-out)",
                      recheckOnly ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="tnum" aria-live="polite">
                {rows.length} of {derived.length} claims
              </span>
              {!isDefaultFilters(flow, { status, q, recheckOnly }) && (
                <button
                  onClick={clear}
                  className="touch-target font-medium text-foreground underline underline-offset-4 hover:text-text-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Loading claims">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-b border-border py-5">
              <div className="h-4 w-1/3 animate-pulse bg-surface-2" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-3 border-y border-border py-10">
          <p className="text-sm text-text-2">
            {derived.length === 0
              ? "There are no claims to show. They appear here once the triage service returns cases."
              : compact
                ? "No open claims in this group."
                : "No claims match these filters."}
          </p>
          {derived.length > 0 && !compact && (
            <Button variant="outline" size="sm" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                {cols.map((c) => (
                  <col key={c} style={{ width: `${c === "Reason" ? reasonWidth : width[c]}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-left">
                  {cols.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        "px-4 pb-2 text-xs font-medium text-muted-foreground first:pl-3",
                        h === "Quote" && "text-right",
                      )}
                    >
                      <span className="whitespace-nowrap">{h === "Quote" ? "Quote, EUR" : h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.flow}>
                  <tr>
                    <th
                      colSpan={cols.length}
                      scope="rowgroup"
                      className="border-b-2 border-foreground px-0 pb-2 pt-10 text-left"
                    >
                      <GroupHeading flow={g.flow} count={g.items.length} />
                    </th>
                  </tr>
                  {g.items.map((c) => {
                    const quote = quoteOf(c);
                    const date = incidentDate(c);
                    return (
                      <tr
                        key={c.case_id}
                        ref={(el) => {
                          rowRefs.current[c.case_id] = el;
                        }}
                        tabIndex={0}
                        aria-label={`Open case ${c.case_id}, ${REC_LABEL[c.recommendation_v1]}`}
                        onClick={() => open(c.case_id)}
                        onKeyDown={(e) => onRowKey(e, c.case_id)}
                        className="group cursor-pointer transition-colors duration-(--dur-fast) hover:bg-surface focus-visible:bg-surface"
                      >
                        <td
                          className={cn(
                            "border-b border-l-2 border-border px-4 py-4 pl-3 align-top",
                            FLOW_BORDER[c.flow],
                          )}
                        >
                          <div className="whitespace-nowrap font-mono text-base font-semibold">
                            {c.case_id}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{statusText(c)}</span>
                            {c.case_status === "open" && c.needs_recheck && <RecheckText />}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-4 align-top">
                          <p className="line-clamp-2 text-foreground" title={c.explanation}>
                            {shortReason(c, state.log)}
                          </p>
                        </td>
                        <td className="tnum border-b border-border px-4 py-4 text-right align-top">
                          {quote === null ? (
                            <span className="text-xs italic text-muted-foreground">
                              not provided
                            </span>
                          ) : (
                            quote.toLocaleString("en-US")
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-4 align-top">
                          <StepText step={nextStep(c, state.log)} />
                        </td>
                        {showDate && (
                          <td className="tnum whitespace-nowrap border-b border-border px-4 py-4 align-top text-text-2">
                            {date ?? (
                              <span className="text-xs italic text-muted-foreground">
                                not provided
                              </span>
                            )}
                          </td>
                        )}
                        {!compact && (
                          <td className="border-b border-border px-4 py-3 align-top">
                            <MoveTo c={c} onPick={(r) => open(c.case_id, r)} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>

          <div className="space-y-10 xl:hidden">
            {groups.map((g) => (
              <section key={g.flow} aria-label={FLOW_NAME[g.flow]}>
                <h2 className="border-b-2 border-foreground pb-2">
                  <GroupHeading flow={g.flow} count={g.items.length} />
                </h2>
                {g.items.map((c) => {
                  const quote = quoteOf(c);
                  return (
                    <div
                      key={c.case_id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open case ${c.case_id}, ${REC_LABEL[c.recommendation_v1]}`}
                      onClick={() => open(c.case_id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(c.case_id)}
                      className={cn(
                        "space-y-2 border-b border-l-2 border-border py-4 pl-3 hover:bg-surface",
                        FLOW_BORDER[c.flow],
                      )}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-base font-semibold">{c.case_id}</span>
                        <span className="text-xs text-muted-foreground">{statusText(c)}</span>
                        {c.case_status === "open" && c.needs_recheck && <RecheckText />}
                        <span className="tnum ml-auto text-sm">
                          {quote === null ? <NotProvided /> : eur(quote)}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-sm text-foreground">
                        {shortReason(c, state.log)}
                      </p>
                      <StepText step={nextStep(c, state.log)} />
                      {!compact && <MoveTo c={c} onPick={(r) => open(c.case_id, r)} />}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}

      {compact && (
        <Link
          to="/claims"
          search={flow === "all" ? {} : { flow }}
          className="group inline-flex items-center gap-2 text-sm font-medium"
        >
          {hidden > 0 ? `View all claims (${hidden} more open)` : "View all claims"}
          <ArrowRight
            className="size-4 transition-transform duration-(--dur-fast) group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      )}

      <CaseSheet
        claim={openClaim}
        open={!!openClaim}
        onOpenChange={(o) => !o && setOpenId(null)}
        initialOverride={initialOverride}
        onReturnFocus={() => {
          if (openId) rowRefs.current[openId]?.focus();
        }}
      />
    </div>
  );
}
