import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, DoorClosed, DoorOpen, ListChecks, Scale } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/store";
import { PROBLEM_SUBLINE, REC_LABEL } from "@/copy";
import { ASSUMPTIONS, BUSINESS_CASE as BC, LABEL_HELP, type EvidenceLabel } from "@/data/businessCase";
import { Dot, EvidenceChip, SectionTitle } from "@/components/status";
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

function Tile({ title, flow, filter }: { title: string; flow?: Flow; filter: "all" | "yellow" | "red" }) {
  const { derived } = useStore();
  const list = flow ? derived.filter((c) => c.flow === flow) : derived;
  const open = list.filter((c) => c.case_status === "open").length;
  return (
    <Link
      to="/claims"
      search={{ flow: filter }}
      className="card-panel group flex flex-col justify-between gap-6 p-5 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-sheet"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-text-2">
        {flow && <Dot flow={flow} />}
        {title}
      </div>
      <div>
        <div className="tnum text-5xl font-medium tracking-tight">{list.length}</div>
        <div className="tnum mt-1 text-xs text-muted-foreground">
          {open} open / {list.length - open} closed
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        View claims <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
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
      <section className="pt-4 md:pt-10">
        <p className="eyebrow">The problem</p>
        <p className="mt-3 max-w-[640px] text-muted-foreground">{PROBLEM_SUBLINE}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile title="Overall Claims" filter="all" />
        <Tile title="Yellow Claims" flow="yellow" filter="yellow" />
        <Tile title="Red Claims" flow="red" filter="red" />
      </section>

      <section>
        <SectionTitle title="Claims at a glance" right={<span className="eyebrow">Illustrative data</span>} />
        <div className="grid gap-4 lg:grid-cols-3">
          <figure className="card-panel p-5">
            <figcaption className="mb-4 text-sm font-medium">Claims by flow, open vs closed</figcaption>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="flow"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={({ x, y, payload }) => (
                      <g transform={`translate(${x},${y + 12})`}>
                        <circle cx={-26} cy={-4} r={3.5} fill={`var(--${payload.value})`} />
                        <text x={-18} y={0} fontSize={11} fill="var(--muted-foreground)">
                          {payload.value === "red" ? "Review" : payload.value === "yellow" ? "Info" : "Routine"}
                        </text>
                      </g>
                    )}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <RTooltip cursor={{ fill: "var(--surface)" }} content={<ChartTip />} />
                  <Bar isAnimationActive={false} dataKey="Open" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="Closed" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" />Open</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-2" />Closed</span>
            </div>
          </figure>
          <figure className="card-panel p-5">
            <figcaption className="mb-4 text-sm font-medium">Claim volume, last 12 weeks</figcaption>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={WEEKS}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} width={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <RTooltip content={<ChartTip />} cursor={{ stroke: "var(--border-strong)" }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="claims" name="Claims" stroke="var(--foreground)" strokeWidth={1.75} dot={false} activeDot={{ r: 3.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <figure className="card-panel p-5">
            <figcaption className="mb-4 text-sm font-medium">Distribution by flow</figcaption>
            <div className="relative h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie isAnimationActive={false} data={pieData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="86%" paddingAngle={2} stroke="var(--background)">
                    {pieData.map((d) => (
                      <Cell key={d.flow} fill={pieColor[d.flow]} />
                    ))}
                  </Pie>
                  <RTooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="tnum text-2xl font-medium">{derived.length}</div>
                  <div className="text-[11px] text-muted-foreground">claims</div>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {pieData.map((d) => (
                <span key={d.flow} className="inline-flex items-center gap-1.5">
                  <Dot flow={d.flow} /> {d.name} <span className="tnum">{d.value}</span>
                </span>
              ))}
            </div>
          </figure>
        </div>
      </section>

      <section>
        <SectionTitle title="Business case" subtitle="Honest ranges. Every number carries its evidence label." />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-panel p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Efficiency-only floor</span>
              <EvidenceChip label="DERIVED" />
            </div>
            <div className="tnum mt-3 text-3xl font-medium tracking-tight">
              {h(BC.efficiencyFloorHours[0])} to {h(BC.efficiencyFloorHours[1])} reviewer hours a year
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">What the tool is worth even if it prevents zero errors: time no longer spent hand-triaging claims that clear rules can route.</p>
          </div>

          <div className="card-panel p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="section-title">Cost of a policy change</h3>
              <EvidenceChip label="DERIVED" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {h(BC.openClaimsPortfolio)} open claims × {BC.minutesPerRecheck[0]} to {BC.minutesPerRecheck[1]} min per recheck.
            </p>
            <div className="mt-6 space-y-5">
              <RangeBar label="Before: every open claim re-reviewed by hand" lo={before[0]} hi={before[1]} max={before[1]} tone="light" />
              <RangeBar
                label={`After: only flipped claims (${BC.flippedShare[0] * 100}% to ${BC.flippedShare[1] * 100}%) rechecked`}
                lo={after[0]}
                hi={after[1]}
                max={before[1]}
                tone="strong"
              />
            </div>
          </div>

          <div className="card-panel flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="section-title">Annual triage cost</h3>
                <EvidenceChip label="ASSUMED" />
              </div>
              <div className="tnum mt-3 text-3xl font-medium tracking-tight">EUR 0.4M to 1.6M</div>
              <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface px-3 py-2 text-xs text-text-2">
                Wide on purpose: minutes per claim and the share of routine claims are assumed, not measured.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <div className="eyebrow">Payback</div>
                <div className="tnum mt-1 text-xl font-medium">≈{BC.paybackEfficiencyMonths} months</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  Efficiency only <EvidenceChip label="DERIVED" />
                </div>
              </div>
              <div>
                <div className="eyebrow">Payback</div>
                <div className="tnum mt-1 text-xl font-medium">≈{BC.paybackWithErrorsMonths} months</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  With assumed error savings <EvidenceChip label="ASSUMED" />
                </div>
              </div>
            </div>
          </div>

          <div className="card-panel overflow-hidden lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
              <h3 className="section-title">Assumption register</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {(Object.keys(LABEL_HELP) as EvidenceLabel[]).map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <EvidenceChip label={l} /> {LABEL_HELP[l]}
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Assumption", "Value", "Label", "Source / derivation"].map((c) => (
                      <th key={c} scope="col" className="eyebrow px-6 py-2.5 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ASSUMPTIONS.map((a) => (
                    <tr key={a.assumption} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-6 py-3 font-medium">{a.assumption}</td>
                      <td className="tnum px-6 py-3">{a.value}</td>
                      <td className="px-6 py-3"><EvidenceChip label={a.label} /></td>
                      <td className="px-6 py-3 text-muted-foreground">{a.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: state.gateOpen ? DoorOpen : DoorClosed, text: `Release gate: ${state.gateOpen ? "OPEN" : "CLOSED"}`, tip: "Draft v2 is not live until a second person releases it on the Policy change page." },
            { icon: ListChecks, text: `Exhaustive checks: ${passing}/5 passing`, tip: "Five properties are checked on every stored claim for the current draft." },
            { icon: Scale, text: "Consistency, not accuracy", tip: "We count agreement with past reviewer outcomes. Those labels are not ground truth." },
          ].map((c) => (
            <Tooltip key={c.text}>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-border-strong">
                  <c.icon className="size-3.5" aria-hidden /> {c.text}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{c.tip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </section>
    </div>
  );
}
