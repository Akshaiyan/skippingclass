import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, DoorClosed, DoorOpen, ListChecks, Scale } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/store";
import { REC_LABEL } from "@/copy";
import { ASSUMPTIONS, BUSINESS_CASE as BC, LABEL_HELP, type EvidenceLabel } from "@/data/businessCase";
import { Dot, FLOW_DOT, SectionTitle, StatusChip } from "@/components/status";
import { CaseSheet } from "@/components/CaseSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { exhaustiveChecks } from "@/lib/report";
import type { Flow } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Motor claims triage" },
      { name: "description", content: "Where reviewer time goes, which claims need attention, and an honest business case." },
      { property: "og:title", content: "Dashboard · Motor claims triage" },
      { property: "og:description", content: "Explainable next-step recommendations for motor claims, with an evidence-labelled business case." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const WEEKS = [14, 17, 15, 19, 22, 18, 21, 24, 20, 23, 26, 25].map((v, i) => ({ week: `W${i + 1}`, claims: v }));

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-panel px-3 py-2 text-xs">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="tnum flex justify-between gap-4 text-text-2">
          <span>{p.name}</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

type Horizon = "daily" | "weekly" | "monthly" | "yearly" | "all";
const HORIZONS: { value: Horizon; label: string; days: number | null; caption: string }[] = [
  { value: "daily", label: "Daily", days: 1, caption: "Last day" },
  { value: "weekly", label: "Weekly", days: 7, caption: "Last 7 days" },
  { value: "monthly", label: "Monthly", days: 30, caption: "Last 30 days" },
  { value: "yearly", label: "Yearly", days: 365, caption: "Last 12 months" },
  { value: "all", label: "All time", days: null, caption: "All time" },
];

function ClaimsOverview() {
  const { derived } = useStore();
  const [horizon, setHorizon] = useState<Horizon>("weekly");
  const hz = HORIZONS.find((x) => x.value === horizon)!;
  // Mock data has no live clock: the window ends at the latest incident date on file.
  const latest = derived.reduce((m, c) => (String(c.facts["incident_date"] ?? "") > m ? String(c.facts["incident_date"]) : m), "");
  const list = derived.filter((c) => {
    if (hz.days === null) return true;
    const d = c.facts["incident_date"];
    if (typeof d !== "string" || !latest) return false;
    const diff = (Date.parse(latest) - Date.parse(d)) / 864e5;
    return diff >= 0 && diff < hz.days;
  });
  const total = list.length;
  const count = (f: Flow) => list.filter((c) => c.flow === f).length;
  const openOf = (f?: Flow) => list.filter((c) => c.case_status === "open" && (!f || c.flow === f)).length;
  const segs: { flow: Flow; label: string; n: number }[] = [
    { flow: "red", label: "Red", n: count("red") },
    { flow: "yellow", label: "Yellow", n: count("yellow") },
    { flow: "green", label: "Green", n: count("green") },
  ];

  return (
    <section className="card-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-text-2">Overall claims</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="tnum text-5xl font-medium tracking-tight">{total}</span>
            <span className="tnum text-xs text-muted-foreground">{openOf()} open</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label htmlFor="horizon" className="sr-only">Time horizon</label>
          <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
            <SelectTrigger id="horizon" className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {HORIZONS.map((x) => (
                <SelectItem key={x.value} value={x.value} className="text-xs">{x.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">{hz.caption}</span>
        </div>
      </div>

      <div className="mt-6 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={segs.map((s) => `${s.label} ${s.n} of ${total}`).join(", ")}>
        {total > 0 && segs.filter((s) => s.n > 0).map((s) => (
          <div key={s.flow} className={`h-full ${FLOW_DOT[s.flow]}`} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {segs.map((s) => (
          <Link
            key={s.flow}
            to="/claims"
            search={{ flow: s.flow }}
            className="group rounded-lg border border-border px-4 py-3 transition-colors duration-150 hover:border-border-strong hover:bg-surface"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-text-2">
              <Dot flow={s.flow} /> {s.label} claims
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum text-2xl font-medium">{s.n}</span>
              <span className="tnum text-xs text-muted-foreground">of {total}</span>
              <span className="tnum ml-auto text-xs text-muted-foreground">{openOf(s.flow)} open</span>
            </div>
          </Link>
        ))}
      </div>

      {total === 0 && <p className="mt-4 text-sm text-muted-foreground">No claims in this period.</p>}

      <Link to="/claims" search={{ flow: "all" }} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
        View claims <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </section>
  );
}

const h = (n: number) => Math.round(n).toLocaleString("en-US");

function RangeBar({ label, lo, hi, max, tone }: { label: string; lo: number; hi: number; max: number; tone: "strong" | "light" }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-text-2">{label}</span>
        <span className="tnum font-medium">
          {h(lo)} to {h(hi)} h
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface-2">
        <div
          className={`absolute inset-y-0 rounded-full ${tone === "strong" ? "bg-foreground" : "bg-border-strong"}`}
          style={{ left: `${(lo / max) * 100}%`, width: `${Math.max(((hi - lo) / max) * 100, 1.5)}%` }}
        />
      </div>
    </div>
  );
}

function DashboardClaims() {
  const { derived } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const order: Record<Flow, number> = { red: 0, yellow: 1, green: 2 };
  const rows = [...derived].sort((a, b) => order[a.flow] - order[b.flow] || (a.case_status === b.case_status ? a.case_id.localeCompare(b.case_id) : a.case_status === "open" ? -1 : 1));
  const openClaim = derived.find((c) => c.case_id === openId) ?? null;
  return (
    <section>
      <SectionTitle title="Claims" />
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup><col className="w-[29%]" /><col className="w-[23%]" /><col className="w-[48%]" /></colgroup>
          <thead className="bg-surface">
            <tr>{["Case", "Status", "Recommendation"].map((x) => <th key={x} scope="col" className="border-b border-border px-3 py-3 text-left text-xs font-medium text-muted-foreground sm:px-6">{x}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.case_id} tabIndex={0} aria-label={`Open case ${c.case_id}`} onClick={() => setOpenId(c.case_id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.case_id); }} className="h-16 cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface focus-visible:bg-surface">
                <td className="px-3 py-3 font-mono text-xs sm:px-6 sm:text-sm">{c.case_id}</td>
                <td className="px-3 py-3 sm:px-6"><StatusChip status={c.case_status} /></td>
                <td className="px-3 py-3 sm:px-6"><span className="inline-flex items-center gap-2 text-xs font-medium sm:text-sm"><Dot flow={c.flow} /><span>{REC_LABEL[c.recommendation_v1]}</span></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CaseSheet claim={openClaim} open={!!openClaim} onOpenChange={(o) => !o && setOpenId(null)} />
    </section>
  );
}

function Dashboard() {
  const { derived, state, v1Rules } = useStore();
  const checks = exhaustiveChecks(state.claims, v1Rules, state.draftRules);
  const passing = checks.filter((c) => c.pass).length;
  const flows: Flow[] = ["red", "yellow", "green"];
  const flowRec = { red: "human_review", yellow: "request_information", green: "routine_processing" } as const;
  const barData = flows.map((f) => ({
    flow: f,
    name: REC_LABEL[flowRec[f]],
    Open: derived.filter((c) => c.flow === f && c.case_status === "open").length,
    Closed: derived.filter((c) => c.flow === f && c.case_status === "closed").length,
  }));
  const pieData = flows.map((f) => ({ name: REC_LABEL[flowRec[f]], value: derived.filter((c) => c.flow === f).length, flow: f }));
  const pieColor = { red: "var(--chart-3)", yellow: "var(--chart-4)", green: "var(--chart-5)" };

  const before: [number, number] = [BC.openClaimsPortfolio * (BC.minutesPerRecheck[0] / 60), BC.openClaimsPortfolio * (BC.minutesPerRecheck[1] / 60)];
  const after: [number, number] = [before[0] * BC.flippedShare[0], before[1] * BC.flippedShare[1]];

  return (
    <div className="space-y-12">

      <ClaimsOverview />

      <DashboardClaims />

    </div>
  );
}
