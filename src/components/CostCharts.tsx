// Cost impact: three key figures and two charts. Inputs are ASSUMED, everything shown is DERIVED
// from the open sample claims; nothing is MEASURED. Flow colour appears only as small legend dots and delta arrows.
// Numbers lead, charts support them.
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COST_COPY, NOT_PROVIDED } from "@/copy";
import { FLOW_DOT, FLOW_NAME } from "@/lib/flow-styles";
import { reviewCost, type FlowShares, type SavingsAssumptions } from "@/lib/savings";
import { Chip } from "@/components/status";
import { cn } from "@/lib/utils";
import type { getCostImpact } from "@/data/api";
import type { Flow } from "@/types";

type CostData = ReturnType<typeof getCostImpact>;

const euro = (v: number, cents = false) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(v);
const round100 = (v: number) => Math.round(v / 100) * 100;
const round10c = (v: number) => Math.round(v * 10) / 10;
const fmt = (n: number) => n.toLocaleString("en-IE");

// One gray per flow, darkest for the flow that needs a person. Same token set as the Policy page.
const GRAY: Record<Flow, string> = {
  red: "var(--chart-gray-1)",
  yellow: "var(--chart-gray-2)",
  green: "var(--chart-gray-3)",
};
const FLOWS: Flow[] = ["red", "yellow", "green"];
const LIVE_STROKE = "var(--chart-gray-2)";
const DRAFT_STROKE = "var(--foreground)";

/** Whole percents that add up to exactly 100 (largest remainder), so the stacked bar never reads 99 or 101. */
function percents(s: FlowShares): Record<Flow, number> {
  const raw = FLOWS.map((f) => ({ f, v: s[f] * 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.f, Math.floor(r.v)])) as Record<Flow, number>;
  const total = s.red + s.yellow + s.green;
  if (total === 0) return out;
  let left = 100 - FLOWS.reduce((t, f) => t + out[f], 0);
  for (const r of [...raw].sort((x, y) => (y.v % 1) - (x.v % 1))) {
    if (left <= 0) break;
    out[r.f] += 1;
    left -= 1;
  }
  return out;
}

/** Arrow + sign + colour: up is more Human review cost, down is less. */
function Delta({ value, text }: { value: number; text: string }) {
  return (
    <span
      key={text}
      className={cn(
        "impact-change tnum inline-flex items-center gap-1 text-sm font-medium",
        value === 0 && "text-muted-foreground",
      )}
    >
      {value > 0 ? (
        <ArrowUp className="size-4 text-flow-red" aria-hidden />
      ) : value < 0 ? (
        <ArrowDown className="size-4 text-flow-green" aria-hidden />
      ) : (
        <span aria-hidden>—</span>
      )}
      {text}
    </span>
  );
}

function Tile({
  label,
  help,
  value,
  delta,
  deltaText,
  vsLive,
  tags,
}: {
  label: string;
  help: string;
  value: string | null;
  delta: number;
  deltaText: string;
  vsLive: string;
  tags: string[];
}) {
  return (
    <div className="min-w-0 border-t border-border pt-4">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="mt-1 text-xs text-muted-foreground lg:min-h-8">{help}</p>
      {value === null ? (
        <p className="mt-4 text-sm text-muted-foreground">{NOT_PROVIDED}</p>
      ) : (
        <>
          <p
            key={value}
            className="impact-change display-num mt-3 text-[26px] font-semibold leading-8 xl:text-[40px] xl:leading-[48px]"
          >
            {value}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Delta value={delta} text={deltaText} />
            <span className="tnum text-xs text-muted-foreground">{vsLive}</span>
          </p>
        </>
      )}
      <span className="mt-3 flex flex-wrap gap-1">
        {tags.map((t) => (
          <Chip key={t} tone="outline">
            {t}
          </Chip>
        ))}
      </span>
    </div>
  );
}

export function CostKpis({ data, a }: { data: CostData; a: SavingsAssumptions }) {
  const f = data.figures;
  const c = data.counts;
  // Deltas come from the rounded figures, so what is shown always reconciles.
  const per = f && { live: round10c(f.live.perClaim), draft: round10c(f.draft.perClaim) };
  // Same whole percents as the flow-mix bar, so tile and chart never disagree.
  const share = f && { live: percents(data.live).red, draft: percents(data.draft).red };
  const year = f && { live: round100(f.live.twelveMonths), draft: round100(f.draft.twelveMonths) };
  const signedEuro = (v: number, cents = false) =>
    `${v > 0 ? "+" : v < 0 ? "−" : ""}${euro(Math.abs(v), cents)}`;
  const liveMonthly = data.live.red * a.claimsPerMonth * reviewCost(a);
  const draftMonthly = data.draft.red * a.claimsPerMonth * reviewCost(a);

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Tile
          label={COST_COPY.perClaim}
          help={COST_COPY.perClaimHelp}
          value={per && euro(per.draft, true)}
          delta={per ? per.draft - per.live : 0}
          deltaText={per ? signedEuro(round10c(per.draft - per.live), true) : ""}
          vsLive={per ? COST_COPY.vsLive(euro(per.live, true)) : ""}
          tags={[COST_COPY.derived]}
        />
        <Tile
          label={COST_COPY.inReview}
          help={COST_COPY.inReviewHelp}
          value={share && `${share.draft}%`}
          delta={share ? share.draft - share.live : 0}
          deltaText={
            share
              ? `${share.draft - share.live > 0 ? "+" : share.draft - share.live < 0 ? "−" : ""}${Math.abs(share.draft - share.live)} pp`
              : ""
          }
          vsLive={share ? COST_COPY.vsLive(`${share.live}%`) : ""}
          tags={[COST_COPY.derived]}
        />
        <Tile
          label={COST_COPY.twelveMonths}
          help={COST_COPY.twelveMonthsHelp}
          value={year && euro(year.draft)}
          delta={year ? year.draft - year.live : 0}
          deltaText={year ? signedEuro(year.draft - year.live) : ""}
          vsLive={year ? COST_COPY.vsLive(euro(year.live)) : ""}
          tags={[COST_COPY.derived, COST_COPY.growthTag(a.growthPercent)]}
        />
      </div>

      <details className="mt-6 border-t border-border pt-4 text-sm">
        <summary className="cursor-pointer font-medium">{COST_COPY.showMath}</summary>
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {(
              [
                ["Added to Human review", c.newlyEscalated],
                ["Released from Human review", c.released],
                ["Moved to Routine processing", c.movedToRoutine],
                ["Moved to Missing information", c.movedToInfo],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="display-num text-base font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {f ? (
            <ul className="space-y-2 text-xs text-text-2">
              <li>
                <span className="font-medium text-foreground">One Human review</span> ={" "}
                <span className="tnum">
                  {a.reviewMinutes} min × {euro(a.eurPerMinute, true)} = {euro(reviewCost(a), true)}
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">{COST_COPY.perClaim}</span> = share in
                Human review × cost of one review ={" "}
                <span className="tnum">
                  live {c.redLive}/{c.openClaims} → draft {c.redDraft}/{c.openClaims} ×{" "}
                  {euro(reviewCost(a), true)} = {per && euro(per.live, true)} →{" "}
                  {per && euro(per.draft, true)}
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">Human review cost per month</span> =
                share × {fmt(a.claimsPerMonth)} claims × {euro(reviewCost(a), true)} ={" "}
                <span className="tnum">
                  live {euro(round100(liveMonthly))} → draft {euro(round100(draftMonthly))}
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">Change per month</span> = (
                {c.newlyEscalated} added − {c.released} released) ÷ {c.openClaims} open ×{" "}
                {fmt(a.claimsPerMonth)} × {euro(reviewCost(a), true)} ={" "}
                <span className="tnum">
                  {signedEuro(round100(draftMonthly) - round100(liveMonthly))}
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">{COST_COPY.twelveMonths}</span> = sum
                of months 1–12, monthly cost × (1 + {a.growthPercent}%)^((month − 1) ÷ 12)
              </li>
              <li className="text-muted-foreground">
                Missing information is not priced. Closed claims are not counted. Figures are
                rounded to €0.10 and €100.
              </li>
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{NOT_PROVIDED}</p>
          )}
        </div>
      </details>
    </div>
  );
}

function Figure({
  title,
  help,
  tier,
  children,
}: {
  title: string;
  help: string;
  tier: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="min-w-0 border-t border-border pt-4">
      <figcaption>
        <h3 className="section-title">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      </figcaption>
      <div className="mt-4">{children}</div>
      <p className="mt-3 text-xs text-muted-foreground">{tier}</p>
    </figure>
  );
}

/** 100% stacked bar, one row per version. Grays carry the segments; the legend dot carries flow identity. */
function FlowMix({ data }: { data: CostData }) {
  const rows = [
    { label: COST_COPY.live, p: percents(data.live) },
    { label: COST_COPY.draft, p: percents(data.draft) },
  ];
  const pp = rows[1]!.p.red - rows[0]!.p.red;
  return (
    <Figure
      title={COST_COPY.mixTitle}
      help={COST_COPY.mixHelp}
      tier={`${COST_COPY.derived} · ${COST_COPY.sample(data.sampleSize)}`}
    >
      {data.sampleSize === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{NOT_PROVIDED}</p>
      ) : (
        <>
          <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
            {FLOWS.map((f) => (
              <li key={f} className="inline-flex items-center gap-2">
                <span
                  className={cn("size-3 shrink-0", f === "green" && "border border-border-strong")}
                  style={{ background: GRAY[f] }}
                  aria-hidden
                />
                <span className={cn("size-2 shrink-0", FLOW_DOT[f])} aria-hidden />
                {FLOW_NAME[f]}
              </li>
            ))}
          </ul>
          <div
            className="space-y-3"
            role="img"
            aria-label={rows
              .map(
                (r) => `${r.label}: ${FLOWS.map((f) => `${FLOW_NAME[f]} ${r.p[f]}%`).join(", ")}`,
              )
              .join(". ")}
          >
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[3rem_1fr] items-center gap-3">
                <span className="text-sm text-text-2">{r.label}</span>
                <div className="flex h-8 gap-px">
                  {FLOWS.filter((f) => r.p[f] > 0).map((f) => (
                    <div
                      key={f}
                      className={cn(
                        "flex items-center justify-center text-xs font-medium transition-[width] duration-500",
                        f === "red" ? "text-background" : "text-foreground",
                      )}
                      style={{ width: `${r.p[f]}%`, background: GRAY[f] }}
                      title={`${r.label} · ${FLOW_NAME[f]}: ${r.p[f]}%`}
                    >
                      {r.p[f] >= 10 && <span className="tnum">{r.p[f]}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm">{COST_COPY.mixCaption(pp)}</p>
        </>
      )}
    </Figure>
  );
}

/** Two lines, live solid and draft dashed, labelled at month 12 instead of a legend. */
function TwelveMonths({ data, a }: { data: CostData; a: SavingsAssumptions }) {
  const last = data.months.at(-1);
  const top = Math.max(1, ...data.months.flatMap((m) => [m.live, m.draft]));
  const step = top > 20000 ? 5000 : top > 5000 ? 1000 : 100;
  const max = Math.ceil(top / step) * step;
  const draftAbove = (last?.draft ?? 0) >= (last?.live ?? 0);
  // Plot height ≈ 220 − 16 top − 30 x-axis. Labels sit centred on their line and are pushed 16px apart when close.
  const gapPx = last ? (Math.abs(last.draft - last.live) / max) * 174 : 99;
  const nudge = gapPx < 16 ? (16 - gapPx) / 2 : 0;
  const endLabel =
    (key: "live" | "draft", above: boolean) =>
    (props: {
      x?: number | string;
      y?: number | string;
      index?: number;
      value?: number | string;
    }) => {
      if (props.index !== data.months.length - 1) return <g />;
      return (
        <text
          x={Number(props.x) + 8}
          y={Number(props.y) + (above ? -nudge : nudge)}
          dy={4}
          fontSize={12}
          fontWeight={key === "draft" ? 500 : 400}
          fill={key === "draft" ? "var(--foreground)" : "var(--muted-foreground)"}
        >
          {key === "draft" ? COST_COPY.draft : COST_COPY.live} {euro(round100(Number(props.value)))}
        </text>
      );
    };
  return (
    <Figure
      title={COST_COPY.lineTitle}
      help={COST_COPY.lineHelp}
      tier={`${COST_COPY.lineTier} (${a.growthPercent}%/yr) · ${COST_COPY.sample(data.sampleSize)}`}
    >
      {data.sampleSize === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{NOT_PROVIDED}</p>
      ) : (
        <div
          className="h-[220px]"
          role="img"
          aria-label={`Month 12: live ${euro(round100(last?.live ?? 0))}, draft ${euro(round100(last?.draft ?? 0))} per month.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.months} margin={{ top: 16, right: 112, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                ticks={[1, 6, 12]}
                tickFormatter={(m: number) => `M${m}`}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                domain={[0, max]}
                ticks={[0, max]}
                tickFormatter={(v: number) => euro(v)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                width={64}
              />
              <Tooltip
                formatter={(v: number, n: string) => [euro(round100(v)), n]}
                labelFormatter={(m: number) => `Month ${m}`}
                contentStyle={{
                  borderRadius: 0,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                  padding: "8px 12px",
                }}
                cursor={{ stroke: "var(--border-strong)" }}
              />
              <Line
                type="linear"
                dataKey="live"
                name={COST_COPY.live}
                stroke={LIVE_STROKE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                label={endLabel("live", !draftAbove)}
              />
              <Line
                type="linear"
                dataKey="draft"
                name={COST_COPY.draft}
                stroke={DRAFT_STROKE}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
                label={endLabel("draft", draftAbove)}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Figure>
  );
}

export function CostCharts({ data, a }: { data: CostData; a: SavingsAssumptions }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <FlowMix data={data} />
      <TwelveMonths data={data} a={a} />
    </div>
  );
}
