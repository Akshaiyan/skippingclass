import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Flow, Rec } from "@/types";
import { REC_LABEL } from "@/copy";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { Dot, PageHeader, StatusChip } from "@/components/status";
import { CaseSheet } from "@/components/CaseSheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

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
      { property: "og:description", content: "A concise claims overview with complete case details and reviewer actions in a side window." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimsPage,
});

const FLOW_ORDER: Record<Flow, number> = { red: 0, yellow: 1, green: 2 };

function ClaimsPage() {
  const { derived } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/claims" });
  const flow: FlowFilter = search.flow ?? "all";
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [recheckOnly, setRecheckOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
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
  const counts = { all: derived.length, red: 0, yellow: 0, green: 0 } as Record<FlowFilter, number>;
  derived.forEach((c) => counts[c.flow]++);

  const openClaim = derived.find((c) => c.case_id === openId) ?? null;
  const open = (id: string) => {
    setOpenId(id);
  };

  const onRowKey = (e: KeyboardEvent, id: string) => {
    const idx = rows.findIndex((r) => r.case_id === id);
    if (e.key === "Enter") { e.preventDefault(); open(id); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) rowRefs.current[next.case_id]?.focus();
    }
  };

  const chips: { label: string; clear: () => void }[] = [];
  if (flow !== "all") chips.push({ label: `Flow: ${REC_LABEL[{ red: "human_review", yellow: "request_information", green: "routine_processing" }[flow] as Rec]}`, clear: () => setFlow("all") });
  if (status !== "all") chips.push({ label: `Status: ${status === "open" ? "Open" : "Locked"}`, clear: () => setStatus("all") });
  if (q.trim()) chips.push({ label: `Case: ${q.trim()}`, clear: () => setQ("") });
  if (recheckOnly) chips.push({ label: "Needs recheck only", clear: () => setRecheckOnly(false) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Claims"
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="relative flex w-fit items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search by case id</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case id"
            className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-2 font-mono text-xs hover:border-border-strong"
          />
        </label>
        <div role="radiogroup" aria-label="Flow" className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
          {(["all", "red", "yellow", "green"] as FlowFilter[]).map((f) => (
            <Button variant="ghost" size="sm"
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
            </Button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Status" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["open", "closed", "all"] as StatusFilter[]).map((s) => (
            <Button variant="ghost" size="sm"
              key={s}
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-150",
                status === s ? "bg-background text-foreground shadow-card" : "text-text-2 hover:text-foreground",
              )}
            >
              {s === "closed" ? "Locked" : s}
            </Button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-text-2">
          <Switch checked={recheckOnly} onCheckedChange={setRecheckOnly} /> Needs recheck only
        </label>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Button variant="ghost" size="sm" key={c.label} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs hover:border-border-strong">
              {c.label} <X className="size-3" aria-hidden /> <span className="sr-only">Remove filter</span>
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={clear} className="text-xs font-medium underline underline-offset-4 hover:text-text-2">
            Clear filters
          </Button>
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
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup><col className="w-[29%]" /><col className="w-[23%]" /><col className="w-[48%]" /></colgroup>
            <thead className="bg-surface">
              <tr>{["Case", "Status", "Recommendation"].map((heading) => <th key={heading} scope="col" className="border-b border-border px-3 py-3 text-left text-xs font-medium text-muted-foreground sm:px-6">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((claim) => <tr key={claim.case_id} ref={(element) => { rowRefs.current[claim.case_id] = element; }} tabIndex={0} aria-label={`Open case ${claim.case_id}`} onClick={() => open(claim.case_id)} onKeyDown={(event) => onRowKey(event, claim.case_id)} className="h-16 cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface focus-visible:bg-surface">
                <td className="px-3 py-3 sm:px-6"><Button variant="link" className="h-auto p-0 font-mono text-xs sm:text-sm" onClick={(event) => { event.stopPropagation(); open(claim.case_id); }}>{claim.case_id}</Button></td>
                <td className="px-3 py-3 sm:px-6"><StatusChip status={claim.case_status} /></td>
                <td className="px-3 py-3 sm:px-6"><span className="inline-flex items-center gap-2 text-xs font-medium sm:text-sm"><Dot flow={claim.flow} /><span>{REC_LABEL[claim.recommendation_v1]}</span></span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}

      <CaseSheet claim={openClaim} open={!!openClaim} onOpenChange={(o) => !o && setOpenId(null)} onReturnFocus={() => { if (openId) rowRefs.current[openId]?.focus(); }} />
    </div>
  );
}
