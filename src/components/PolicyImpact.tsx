import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "@tanstack/react-router";
import { getPolicyImpact } from "@/data/api";
import { IMPACT_COPY, NOT_PROVIDED, REC_LABEL } from "@/copy";
import { useStore } from "@/store";
import { useMemo, useState } from "react";
import { claimCostEffect, policySavings, reviewCost } from "@/lib/savings";
import { flipList } from "@/lib/report";
import { CaseSheet } from "@/components/CaseSheet";

const euro = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
// Pies stay neutral: flow colour appears only as the small dot next to each legend label.
const flowGray = {
  red: "var(--chart-gray-1)",
  yellow: "var(--chart-gray-2)",
  green: "var(--chart-gray-3)",
};

export function PolicyImpact() {
  const { state, derived } = useStore();
  const impact = getPolicyImpact(derived, state.handlingRates);
  const savings = policySavings(derived, state.assumptions);
  const flips = useMemo(() => flipList(derived), [derived]);
  const openFlips = flips.filter((f) => f.claim.case_status === "open");
  const [selected, setSelected] = useState<string | null>(null);
  const selectedClaim = derived.find((c) => c.case_id === selected) ?? null;
  const versions = [
    { key: "live" as const, label: IMPACT_COPY.live, cost: impact.liveCost },
    { key: "expected" as const, label: IMPACT_COPY.expected, cost: impact.expectedCost },
  ];
  const hasRates = Object.values(state.handlingRates).some((r) => typeof r === "number");
  const costsAvailable = versions.every((version) => version.cost !== null);
  return (
    <div className="space-y-6">
      <header>
        <h2 id="impact-title" className="text-base font-semibold">
          {IMPACT_COPY.title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{IMPACT_COPY.subtitle}</p>
      </header>
      <section className="border-b border-border pb-6" aria-labelledby="volume-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="volume-title" className="section-title">
            {IMPACT_COPY.volume}
          </h3>
          <span className="tnum text-xs text-muted-foreground">{impact.total} open claims</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {versions.map((version) => {
            const data = impact.counts.map((row) => ({
              name: IMPACT_COPY.flows[row.flow],
              value: row[version.key],
              flow: row.flow,
            }));
            return (
              <figure key={version.key} className="min-w-0">
                <figcaption className="text-center text-sm font-semibold">
                  {version.label}
                </figcaption>
                <div
                  className="h-[190px] sm:h-[220px]"
                  role="img"
                  aria-label={`${version.label}: ${data.map((row) => `${row.name} ${row.value} claims`).join(", ")}`}
                >
                  {impact.total ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="85%"
                          stroke="var(--background)"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {data.map((row) => (
                            <Cell key={row.flow} fill={flowGray[row.flow]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} claims`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      0 claims
                    </div>
                  )}
                </div>
              </figure>
            );
          })}
        </div>
        <div
          className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-2 text-xs"
          aria-live="polite"
        >
          <span />
          {versions.map((version) => (
            <span key={version.key} className="text-muted-foreground">
              {version.label}
            </span>
          ))}
          <span className="text-muted-foreground">{IMPACT_COPY.delta}</span>
          {impact.counts.map((row) => (
            <div key={row.flow} className="contents">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-md"
                  style={{ background: flowGray[row.flow] }}
                  aria-hidden
                />
                {IMPACT_COPY.flows[row.flow]}
              </span>
              <span className="tnum text-right font-mono">{row.live}</span>
              <span
                key={`${row.flow}-${row.expected}`}
                className="impact-change tnum text-right font-mono"
              >
                {row.expected}
              </span>
              <span
                key={`${row.flow}-delta-${row.expected}`}
                className="impact-change tnum text-right font-mono"
              >
                {row.expected - row.live > 0 ? "+" : ""}
                {row.expected - row.live}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t border-border pt-6" aria-labelledby="changed-title">
        <h3 id="changed-title" className="section-title">
          Changed claims
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4" aria-live="polite">
          {[
            ["Newly to Human review", savings.newlyEscalated],
            ["Released from Human review", savings.released],
            ["Moved to Routine processing", savings.movedToRoutine],
            ["Moved to Missing information", savings.movedToInfo],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tnum font-mono text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {openFlips.length ? (
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {openFlips.map((flip) => {
              const effect = claimCostEffect(flip.from, flip.to, state.assumptions);
              return (
                <li key={flip.claim.case_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(flip.claim.case_id)}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1 py-2 text-left hover:bg-surface"
                  >
                    <span className="font-mono">{flip.claim.case_id}</span>
                    <span className="min-w-0">
                      {REC_LABEL[flip.from]} to {REC_LABEL[flip.to]}
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {flip.cause}
                      </span>
                    </span>
                    <span className="tnum font-mono">
                      {effect > 0 ? "+" : effect < 0 ? "−" : ""}
                      {euro(Math.abs(effect))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No open claim changes with this draft.</p>
        )}
        <div className="mt-4 flex items-baseline justify-between gap-3 text-sm" aria-live="polite">
          <span>Extra cost of Human review per month</span>
          <span className="tnum font-mono font-semibold">
            {savings.extraReviewCostPerMonth > 0 ? "+" : savings.extraReviewCostPerMonth < 0 ? "−" : ""}
            {euro(Math.abs(savings.extraReviewCostPerMonth))}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{IMPACT_COPY.assumed}</span>
          </span>
        </div>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Formula</summary>
          <p className="mt-1 font-mono">
            ({savings.newlyEscalated} newly to Human review − {savings.released} released) ÷{" "}
            {savings.openClaims} open claims × {state.assumptions.claimsPerMonth.toLocaleString("en-IE")} claims per month ×{" "}
            {euro(reviewCost(state.assumptions))} per review
          </p>
          <p className="mt-1">
            Missing information is not priced. Closed claims stay locked and are not counted. Inputs are on{" "}
            <Link className="underline" to="/business">Cost impact</Link>.
          </p>
        </details>
      </section>
      {/* Handling cost needs a rate per flow; without rates there is nothing honest to chart. */}
      {hasRates && (
        <section aria-labelledby="handling-cost-title">
          <h3 id="handling-cost-title" className="section-title">
            {IMPACT_COPY.cost}
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {versions.map((version) => (
              <div key={version.key} className="min-w-0">
                <div className="text-xs text-muted-foreground">{version.label}</div>
                <div
                  key={`${version.key}-${version.cost}`}
                  className="impact-change tnum mt-1 text-base font-semibold"
                  aria-live="polite"
                >
                  {version.cost === null ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {NOT_PROVIDED}
                    </span>
                  ) : (
                    <>
                      {euro(version.cost)}
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                        {IMPACT_COPY.assumed}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-3 h-[180px]"
            role="img"
            aria-label={versions
              .map(
                (version) =>
                  `${version.label} handling cost per claim: ${version.cost === null ? NOT_PROVIDED : euro(version.cost)}`,
              )
              .join(". ")}
          >
            {costsAvailable ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={versions.map((version) => ({ name: version.label, cost: version.cost }))}
                  margin={{ top: 20, right: 10, bottom: 0, left: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `€${value}`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number) => [euro(value), IMPACT_COPY.cost]}
                    cursor={{ fill: "var(--surface)" }}
                  />
                  <Bar
                    dataKey="cost"
                    fill="var(--chart-1)"
                    maxBarSize={60}
                    isAnimationActive={false}
                    radius={[3, 3, 0, 0]}
                  >
                    <Cell fill="var(--chart-1)" />
                    <Cell fill="var(--chart-2)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center border-b border-border text-xs text-muted-foreground">
                {NOT_PROVIDED}
              </div>
            )}
          </div>
        </section>
      )}
      <CaseSheet
        claim={selectedClaim}
        open={!!selectedClaim}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
