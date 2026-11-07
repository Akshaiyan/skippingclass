import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Flow, Rec } from "@/types";
import { CHANGE_REC, FLOW_OF, LOCKED_TOOLTIP, REC_LABEL, REC_ORDER, changeTo } from "@/copy";
import { useStore } from "@/store";
import type { DerivedClaim } from "@/lib/report";
import { cn } from "@/lib/utils";
import { Chip, Dot, FLOW_BORDER, FlowBadge, PageHeader, RecheckChip, RuleChips, StatusChip, WhyDisabled } from "@/components/status";
import { CaseSheet } from "@/components/CaseSheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type FlowFilter = "all" | Flow;
type StatusFilter = "open" | "closed" | "all";

export const Route = createFileRoute("/claims")({
  validateSearch: (s: Record<string, unknown>): { flow?: FlowFilter } => {
    const f = s["flow"];
    return f === "red" || f === "yellow" || f === "green" || f === "all" ? { flow: f } : {};
  },
  head: () => ({
    meta: [
      { title: "Claims · Motor claims triage" },
      { name: "description", content: "Reviewer cockpit: every claim with its recommended next step and the rules behind it." },
      { property: "og:title", content: "Claims · Motor claims triage" },
      { property: "og:description", content: "Every motor claim with its recommended next step, evidence and an audited override flow." },
    ],
  }),
  component: ClaimsPage,
});

const FLOW_ORDER: Record<Flow, number> = { red: 0, yellow: 1, green: 2 };

function QuickActions({ c, onPick }: { c: DerivedClaim; onPick: (r: Rec) => void }) {
  const locked = c.case_status === "closed";
  const others = REC_ORDER.filter((r) => r !== c.recommendation_v1);
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="hidden flex-wrap gap-1.5 2xl:flex">
        {others.map((r) => (
          <WhyDisabled key={r} disabled={locked} reason={LOCKED_TOOLTIP}>
            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={locked} onClick={() => onPick(r)}>
              <Dot flow={FLOW_OF[r]} className="size-1.5" /> {changeTo(r)}
            </Button>
          </WhyDisabled>
        ))}
      </div>
      <div className="2xl:hidden">
        <WhyDisabled disabled={locked} reason={LOCKED_TOOLTIP}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={locked}>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={locked}>
                {CHANGE_REC} <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {others.map((r) => (
                <DropdownMenuItem key={r} onSelect={() => onPick(r)} className="gap-2 text-xs">
                  <Dot flow={FLOW_OF[r]} /> {changeTo(r)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </WhyDisabled>
      </div>
    </div>
  );
}

function ClaimsPage() {
  const { derived } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/claims" });
  const flow: FlowFilter = search.flow ?? "all";
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [recheckOnly, setRecheckOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [initialOverride, setInitialOverride] = useState<Rec | undefined>();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const setFlow = (f: FlowFilter) => navigate({ search: f === "all" ? {} : { flow: f }, replace: true });
  const clear = () => {
    setFlow("all");
    setStatus("all");
    setQ("");
    setRecheckOnly(false);
  };

  const rows = useMemo(
    () =>
      derived
        .filter((c) => flow === "all" || c.flow === flow)
        .filter((c) => status === "all" || c.case_status === status)
        .filter((c) => !q.trim() || c.case_id.toLowerCase().includes(q.trim().toLowerCase()))
        .filter((c) => !recheckOnly || c.needs_recheck)
        .sort((a, b) => FLOW_ORDER[a.flow] - FLOW_ORDER[b.flow] || (a.case_status === b.case_status ? a.case_id.localeCompare(b.case_id) : a.case_status === "open" ? -1 : 1)),
    [derived, flow, status, q, recheckOnly],
  );
  const groups = (["red", "yellow", "green"] as Flow[]).map((f) => ({ flow: f, items: rows.filter((r) => r.flow === f) })).filter((g) => g.items.length);
  const counts = { all: derived.length, red: 0, yellow: 0, green: 0 } as Record<FlowFilter, number>;
  derived.forEach((c) => counts[c.flow]++);

  const openClaim = derived.find((c) => c.case_id === openId) ?? null;
  const open = (id: string, target?: Rec) => {
    setInitialOverride(target);
    setOpenId(id);
  };

  const onRowKey = (e: KeyboardEvent, id: string) => {
    const idx = rows.findIndex((r) => r.case_id === id);
    if (e.key === "Enter") open(id);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) rowRefs.current[next.case_id]?.focus();
    }
  };

  const chips: { label: string; clear: () => void }[] = [];
  if (flow !== "all") chips.push({ label: `Flow: ${REC_LABEL[{ red: "human_review", yellow: "request_information", green: "routine_processing" }[flow] as Rec]}`, clear: () => setFlow("all") });
  if (status !== "all") chips.push({ label: `Status: ${status === "open" ? "Open" : "Closed"}`, clear: () => setStatus("all") });
  if (q.trim()) chips.push({ label: `Case: ${q.trim()}`, clear: () => setQ("") });
  if (recheckOnly) chips.push({ label: "Needs recheck only", clear: () => setRecheckOnly(false) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Claims"
        description="Each claim gets one recommended next step. Human review first, then requests for information, then routine."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div role="radiogroup" aria-label="Flow" className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
          {(["all", "red", "yellow", "green"] as FlowFilter[]).map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={flow === f}
              onClick={() => setFlow(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                flow === f ? "bg-background text-foreground shadow-card" : "text-text-2 hover:text-foreground",
              )}
            >
              {f !== "all" && <Dot flow={f} />}
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="tnum text-muted-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Status" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["open", "closed", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-150",
                status === s ? "bg-background text-foreground shadow-card" : "text-text-2 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search by case id</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case id"
            className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-2 font-mono text-xs hover:border-border-strong"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-text-2">
          <Switch checked={recheckOnly} onCheckedChange={setRecheckOnly} /> Needs recheck only
        </label>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.label} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs hover:border-border-strong">
              {c.label} <X className="size-3" aria-hidden /> <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button onClick={clear} className="text-xs font-medium underline underline-offset-4 hover:text-text-2">
            Clear filters
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card-panel flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">No claims match these filters</p>
          <Button variant="outline" size="sm" onClick={clear}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className="card-panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left">
                  {["Case", "Status", "Recommendation", "Rule", "Explanation", "Recheck", "Quick actions"].map((h) => (
                    <th key={h} scope="col" className="eyebrow border-b border-border px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.flow}>
                  <tr>
                    <th colSpan={7} scope="rowgroup" className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-2 text-left text-xs font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <Dot flow={g.flow} />
                        {REC_LABEL[{ red: "human_review", yellow: "request_information", green: "routine_processing" }[g.flow] as Rec]}
                        <span className="font-normal text-muted-foreground">· {g.items.filter((i) => i.case_status === "open").length} open</span>
                      </span>
                    </th>
                  </tr>
                  {g.items.map((c) => (
                    <tr
                      key={c.case_id}
                      ref={(el) => {
                        rowRefs.current[c.case_id] = el;
                      }}
                      tabIndex={0}
                      onClick={() => open(c.case_id)}
                      onKeyDown={(e) => onRowKey(e, c.case_id)}
                      className="group cursor-pointer transition-colors duration-150 hover:bg-surface focus-visible:bg-surface"
                    >
                      <td className={cn("border-b border-l-2 border-border px-4 py-3", FLOW_BORDER[c.flow])}>
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap font-mono text-[13px] font-medium">{c.case_id}</span>
                          {c.ui_status === "reviewed" && (
                            <Chip><Check className="size-3" aria-hidden /> Reviewed</Chip>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3"><StatusChip status={c.case_status} /></td>
                      <td className="border-b border-border px-4 py-3"><FlowBadge rec={c.recommendation_v1} /></td>
                      <td className="max-w-[210px] border-b border-border px-4 py-3"><RuleChips rule={c.rule_v1} /></td>
                      <td className="max-w-[200px] border-b border-border px-4 py-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate text-text-2">{c.explanation}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">{c.explanation}</TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="border-b border-border px-4 py-3">
                        {c.case_status === "open" && c.needs_recheck && <RecheckChip from={c.recommendation_v1} to={c.recommendation_v2} />}
                      </td>
                      <td className="border-b border-border px-4 py-3">
                        <QuickActions c={c} onPick={(r) => open(c.case_id, r)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <div className="space-y-6 md:hidden">
            {groups.map((g) => (
              <div key={g.flow} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Dot flow={g.flow} />
                  {REC_LABEL[{ red: "human_review", yellow: "request_information", green: "routine_processing" }[g.flow] as Rec]}
                  <span className="font-normal text-muted-foreground">· {g.items.filter((i) => i.case_status === "open").length} open</span>
                </div>
                {g.items.map((c) => (
                  <div
                    key={c.case_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => open(c.case_id)}
                    onKeyDown={(e) => e.key === "Enter" && open(c.case_id)}
                    className={cn("card-panel space-y-2 border-l-2 p-4 hover:bg-surface", FLOW_BORDER[c.flow])}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{c.case_id}</span>
                      <StatusChip status={c.case_status} />
                      <FlowBadge rec={c.recommendation_v1} size="sm" />
                    </div>
                    <RuleChips rule={c.rule_v1} />
                    <p className="line-clamp-2 text-sm text-text-2">{c.explanation}</p>
                    {c.case_status === "open" && c.needs_recheck && <RecheckChip from={c.recommendation_v1} to={c.recommendation_v2} />}
                    <QuickActions c={c} onPick={(r) => open(c.case_id, r)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <CaseSheet claim={openClaim} open={!!openClaim} onOpenChange={(o) => !o && setOpenId(null)} initialOverride={initialOverride} />
    </div>
  );
}
