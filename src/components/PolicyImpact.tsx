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
import { getPolicyImpact } from "@/data/api";
import { IMPACT_COPY, NOT_PROVIDED } from "@/copy";
import { useStore } from "@/store";

const euro = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
const flowSwatches = { green: "bg-flow-green", yellow: "bg-flow-yellow", red: "bg-flow-red" };

export function PolicyImpact() {
  const { state, derived } = useStore();
  const impact = getPolicyImpact(derived, state.handlingRates);
  const versions = [
    { key: "live" as const, label: IMPACT_COPY.live, cost: impact.liveCost },
    { key: "expected" as const, label: IMPACT_COPY.expected, cost: impact.expectedCost },
  ];
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
                            <Cell key={row.flow} fill={`var(--${row.flow})`} />
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
                  className={`size-2.5 shrink-0 rounded-md ${flowSwatches[row.flow]}`}
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
                  <span className="text-xs font-normal text-muted-foreground">{NOT_PROVIDED}</span>
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
    </div>
  );
}
