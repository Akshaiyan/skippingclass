import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FLOW_NAME } from "@/lib/flow-styles";
import { monthlyReviewCost, type SavingsAssumptions } from "@/lib/savings";
import type { getCostImpact } from "@/data/api";

type CostData = ReturnType<typeof getCostImpact>;

const euro = (v: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const axis = { fill: "var(--muted-foreground)", fontSize: 11 };
const LIVE = "var(--chart-gray-2)";
const DRAFT = "var(--chart-gray-1)";

/** Chart frame: title, direct description, provenance line and the formula one click away. */
function Chart({
  title,
  description,
  provenance,
  formula,
  summary,
  children,
}: {
  title: string;
  description: string;
  provenance: string;
  formula: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 border-t border-border pt-4">
      <figcaption>
        <h3 className="section-title">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </figcaption>
      <div className="mt-3 h-[240px]" role="img" aria-label={`${title}. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{provenance}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Formula</summary>
        <p className="mt-1 font-mono">{formula}</p>
      </details>
    </figure>
  );
}

export function CostCharts({
  data,
  a,
  quoteLimit,
}: {
  data: CostData;
  a: SavingsAssumptions;
  quoteLimit: number;
}) {
  const proj = `Projected from ${data.sampleSize} sample claims`;
  const illustrative = `${proj}. Illustrative supplementary data beyond the sample`;
  const perReview = a.reviewMinutes * a.eurPerMinute;
  const liveCost = monthlyReviewCost(data.live.red, a);
  const draftCost = monthlyReviewCost(data.draft.red, a);
  const reviewBars = [
    { name: "Live policy", cost: liveCost },
    { name: "Draft policy", cost: draftCost },
  ];
  const mix = [
    { name: "Live policy", ...pct(data.live) },
    { name: "Draft policy", ...pct(data.draft) },
  ];
  const ruleBars = data.rules.map((r) => ({ rule: r.rule, net: r.net }));
  const grayFor = { green: "var(--chart-gray-3)", yellow: "var(--chart-gray-2)", red: "var(--chart-gray-1)" };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Chart
        title="Human review cost per month"
        description="Live policy against the draft, at your claims per month."
        provenance={proj}
        formula={`share in Human review × ${a.claimsPerMonth.toLocaleString("en-IE")} claims × ${euro(perReview)} per review`}
        summary={`Live ${euro(liveCost)}, draft ${euro(draftCost)}.`}
      >
        <BarChart data={reviewBars} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} />
          <YAxis tickFormatter={(v: number) => euro(v)} tickLine={false} axisLine={false} tick={axis} width={64} />
          <Tooltip formatter={(v: number) => [euro(v), "Human review cost"]} cursor={{ fill: "var(--surface)" }} />
          <Bar dataKey="cost" fill={DRAFT} maxBarSize={72} isAnimationActive={false} radius={0} label={{ position: "top", formatter: (v: number) => euro(v), fontSize: 11 }} />
        </BarChart>
      </Chart>

      <Chart
        title="Flow mix"
        description="Share of open claims per flow."
        provenance={proj}
        formula="open claims per flow ÷ all open claims, for the live rules and for the draft"
        summary={mix.map((m) => `${m.name}: Human review ${m.red}%, Missing information ${m.yellow}%, Routine processing ${m.green}%`).join(". ")}
      >
        <BarChart data={mix} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} />
          <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tickLine={false} axisLine={false} tick={axis} width={40} />
          <Tooltip formatter={(v: number, n: string) => [`${v}%`, n]} cursor={{ fill: "var(--surface)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {(["red", "yellow", "green"] as const).map((f) => (
            <Bar key={f} dataKey={f} name={FLOW_NAME[f]} stackId="mix" fill={grayFor[f]} stroke="var(--background)" maxBarSize={72} isAnimationActive={false} radius={0} />
          ))}
        </BarChart>
      </Chart>

      <Chart
        title="Human review cost, next 12 months"
        description={`Live against draft, volume growing ${a.growthPercent}% per year.`}
        provenance={illustrative}
        formula={`share in Human review × claims per month × (1 + ${a.growthPercent}%) ^ (month ÷ 12) × ${euro(perReview)}`}
        summary={`Month 12: live ${euro(data.months.at(-1)?.live ?? 0)}, draft ${euro(data.months.at(-1)?.draft ?? 0)}.`}
      >
        <LineChart data={data.months} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axis} label={{ value: "Month", position: "insideBottomRight", offset: -4, fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => euro(v)} tickLine={false} axisLine={false} tick={axis} width={64} />
          <Tooltip formatter={(v: number, n: string) => [euro(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="live" name="Live policy" stroke={LIVE} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="draft" name="Draft policy" stroke={DRAFT} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </Chart>

      <Chart
        title="Human review cost against quote limit"
        description="Draft rules with the quote limit swept from low to high. The line marks your current limit."
        provenance={illustrative}
        formula={`for each limit: open sample claims in Human review ÷ open claims × ${a.claimsPerMonth.toLocaleString("en-IE")} claims × ${euro(perReview)}`}
        summary={`At the current limit of EUR ${quoteLimit}, ${euro(draftCost)} per month.`}
      >
        <LineChart data={data.limits} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="limit" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `${v / 1000}k`} tickLine={false} axisLine={false} tick={axis} />
          <YAxis tickFormatter={(v: number) => euro(v)} tickLine={false} axisLine={false} tick={axis} width={64} />
          <Tooltip labelFormatter={(l: number) => `Quote limit EUR ${l}`} formatter={(v: number) => [euro(v), "Human review cost"]} />
          <Line type="stepAfter" dataKey="cost" name="Draft policy" stroke={DRAFT} strokeWidth={2} dot={false} isAnimationActive={false} />
          <ReferenceLine x={Math.min(Math.max(quoteLimit, data.limits[0]?.limit ?? quoteLimit), data.limits.at(-1)!.limit)} stroke={LIVE} strokeDasharray="4 4" label={{ value: `Current ${quoteLimit}`, position: "top", fontSize: 11 }} />
        </LineChart>
      </Chart>

      <div className="lg:col-span-2">
        <Chart
          title="Rules that add or remove Human reviews"
          description="Net open claims per rule. Positive adds Human reviews, negative removes them."
          provenance={proj}
          formula="claims newly in Human review minus claims leaving it, grouped by the rule that caused the change"
          summary={ruleBars.length ? ruleBars.map((r) => `${r.rule} ${r.net}`).join(", ") : "No rule changes a claim."}
        >
          {ruleBars.length ? (
            <BarChart data={ruleBars} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axis} />
              <YAxis type="category" dataKey="rule" tickLine={false} axisLine={false} tick={axis} width={180} />
              <Tooltip formatter={(v: number) => [`${v > 0 ? "+" : ""}${v} claims`, "Net Human reviews"]} cursor={{ fill: "var(--surface)" }} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Bar dataKey="net" fill={DRAFT} isAnimationActive={false} radius={0} maxBarSize={28} label={{ position: "right", fontSize: 11 }} />
            </BarChart>
          ) : (
            <BarChart data={[]}>
              <XAxis />
            </BarChart>
          )}
        </Chart>
      </div>
    </div>
  );
}

function pct(s: { green: number; yellow: number; red: number }) {
  return { green: Math.round(s.green * 100), yellow: Math.round(s.yellow * 100), red: Math.round(s.red * 100) };
}
