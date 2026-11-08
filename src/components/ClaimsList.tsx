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
import { cn } from "@/lib/utils";
import { Chip, FlowBadge, NotProvided, StatusChip, WhyDisabled } from "@/components/status";
import { FLOW_BORDER, FLOW_DOT, FLOW_EDGE, FLOW_NAME } from "@/lib/flow-styles";
import { CaseSheet } from "@/components/CaseSheet";
import { TextTabs } from "@/components/TextTabs";
import { Button } from "@/components/ui/button";
import {
  applyBaseFilters,
  DEFAULT_FILTERS,
  flowCounts,
  isDefaultFilters,
  type FlowFilter,
  type StatusFilter,
} from "@/lib/claims-filter";

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

function RecheckFlag() {
  return (
    <Chip tone="outline">
      <RefreshCw className="size-3" aria-hidden /> Recheck
    </Chip>
  );
}

const groupLabel = (f: Flow) => FLOW_NAME[f];

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
    "Recommendation",
    "Reason",
    "Quote",
    "Status",
    "Next step",
    ...(showDate ? ["Incident date"] : []),
    ...(compact ? [] : ["Move to"]),
  ];
  // Relative widths; the reason column takes what the optional columns leave.
  const width: Record<string, number> = {
    Case: 9,
    Recommendation: 15,
    Quote: 9,
    Status: 10,
    "Next step": 17,
    "Incident date": 10,
    "Move to": 33,
  };

  return (
    <div className="space-y-6">
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
                  label: f === "all" ? "All" : groupLabel(f),
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

      {state.source === "connecting" && derived.length === 0 ? (
        <div className="space-y-2" role="status" aria-label="Loading claims">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-panel h-16 animate-pulse bg-surface-2" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
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
          {(() => {
            // The grouped page drops the Recommendation column: the group already says it.
            const shown = compact ? cols : cols.filter((c) => c !== "Recommendation");
            const w = compact ? width : { ...width, Quote: 8, Status: 9, "Next step": 13, "Move to": 38 };
            const rw = 100 - shown.filter((c) => c !== "Reason").reduce((n, c) => n + w[c]!, 0);
            const colgroup = (
              <colgroup>
                {shown.map((c) => (
                  <col key={c} style={{ width: `${c === "Reason" ? rw : w[c]}%` }} />
                ))}
              </colgroup>
            );
            const head = (
              <thead>
                <tr className="text-left">
                  {shown.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        "border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground",
                        h === "Quote" && "text-right",
                      )}
                    >
                      <span className="whitespace-nowrap">{h === "Quote" ? "Quote, EUR" : h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
            );
            const row = (c: DerivedClaim, last: boolean) => {
              const quote = quoteOf(c);
              const date = incidentDate(c);
              const td = cn("px-4 py-3 align-top", !last && "border-b border-border");
              const cell: Record<string, ReactNode> = {
                Case: (
                  <span
                    className={cn(
                      "whitespace-nowrap font-mono text-sm text-foreground",
                      compact && "font-medium",
                    )}
                  >
                    {c.case_id}
                  </span>
                ),
                Recommendation: <FlowBadge rec={c.recommendation_v1} />,
                Reason: (
                  <p className="line-clamp-2 text-text-2" title={c.explanation}>
                    {shortReason(c, state.log)}
                  </p>
                ),
                Quote:
                  quote === null ? (
                    <span className="text-xs italic text-muted-foreground">not provided</span>
                  ) : (
                    quote.toLocaleString("en-US")
                  ),
                Status: (
                  <div className="flex flex-col items-start gap-2">
                    <StatusChip status={c.case_status} />
                    {c.case_status === "open" && c.needs_recheck && <RecheckFlag />}
                  </div>
                ),
                "Next step": <StepText step={nextStep(c, state.log)} />,
                "Incident date": date ?? (
                  <span className="text-xs italic text-muted-foreground">not provided</span>
                ),
                "Move to": <MoveTo c={c} onPick={(r) => open(c.case_id, r)} />,
              };
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
                  className={cn(
                    "cursor-pointer transition-colors duration-(--dur-fast) hover:bg-surface focus-visible:bg-surface",
                    !compact && "focus-visible:outline-2 focus-visible:-outline-offset-2",
                  )}
                >
                  {shown.map((col) => (
                    <td
                      key={col}
                      className={cn(
                        td,
                        col === "Quote" && "tnum text-right",
                        col === "Incident date" && "tnum whitespace-nowrap text-text-2",
                        col === "Move to" && "px-3",
                      )}
                    >
                      {cell[col]}
                    </td>
                  ))}
                </tr>
              );
            };

            if (compact)
              return (
                <div className="card-panel hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-sm">
                    {colgroup}
                    {head}
                    {groups.map((g) => (
                      <tbody key={g.flow}>
                        <tr>
                          <th
                            colSpan={shown.length}
                            scope="rowgroup"
                            className="border-b border-border bg-surface px-4 py-2 text-left text-xs font-semibold"
                          >
                            <span className="inline-flex items-center gap-2">
                              {groupLabel(g.flow)}
                              <span className="tnum font-normal text-muted-foreground">
                                {g.items.length} {g.items.length === 1 ? "claim" : "claims"}
                              </span>
                            </span>
                          </th>
                        </tr>
                        {g.items.map((c) => row(c, false))}
                      </tbody>
                    ))}
                  </table>
                </div>
              );

            // Work queue: one section per recommendation, human review first. The section header
            // outranks everything in the rows; colour is only the small dot next to its name.
            return (
              <div className="hidden space-y-8 md:block">
                {groups.map((g) => {
                  const openCount = g.items.filter((i) => i.case_status === "open").length;
                  return (
                    <section key={g.flow} aria-labelledby={`group-${g.flow}`}>
                      <header className="mb-3 flex items-baseline gap-3">
                        <h2
                          id={`group-${g.flow}`}
                          className="section-title inline-flex items-center gap-2 text-lg leading-7"
                        >
                          <span
                            className={cn("size-2.5 shrink-0 rounded-none", FLOW_DOT[g.flow])}
                            aria-hidden
                          />
                          {groupLabel(g.flow)}
                          <span className="tnum font-normal text-muted-foreground">
                            {g.items.length}
                          </span>
                        </h2>
                        {effectiveStatus !== "open" && (
                          <span className="tnum text-sm text-muted-foreground">
                            {openCount} open
                          </span>
                        )}
                      </header>
                      <div className="card-panel overflow-x-auto">
                        <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-sm">
                          {colgroup}
                          {head}
                          <tbody>{g.items.map((c, i) => row(c, i === g.items.length - 1))}</tbody>
                        </table>
                      </div>
                    </section>
                  );
                })}
              </div>
            );
          })()}

          <div className="space-y-6 md:hidden">
            {groups.map((g) => (
              <div key={g.flow} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {groupLabel(g.flow)}
                  <span className="tnum font-normal text-muted-foreground">
                    {g.items.length} {g.items.length === 1 ? "claim" : "claims"}
                  </span>
                </div>
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
                        "card-panel space-y-2 border-l-2 p-4 hover:bg-surface",
                        FLOW_BORDER[c.flow],
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{c.case_id}</span>
                        <FlowBadge rec={c.recommendation_v1} size="sm" />
                        <StatusChip status={c.case_status} />
                        <span className="tnum ml-auto text-sm">
                          {quote === null ? <NotProvided /> : eur(quote)}
                        </span>
                      </div>
                      <p className="text-sm text-text-2">{shortReason(c, state.log)}</p>
                      <StepText step={nextStep(c, state.log)} />
                      {c.case_status === "open" && c.needs_recheck && <RecheckFlag />}
                      {!compact && <MoveTo c={c} onPick={(r) => open(c.case_id, r)} />}
                    </div>
                  );
                })}
              </div>
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
