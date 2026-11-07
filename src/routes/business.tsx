import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/store";
import { PageHeader, SectionTitle } from "@/components/status";
import { AssumptionField } from "@/components/AssumptionField";
import { CostCharts } from "@/components/CostCharts";
import { Button } from "@/components/ui/button";
import { getCostImpact } from "@/data/api";
import { withLimit } from "@/store";
import { policySavings, reviewCost } from "@/lib/savings";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Cost impact · Motor claims triage" },
      {
        name: "description",
        content: "What the current policy draft does to Human review cost, and how it develops with volume.",
      },
    ],
  }),
  component: BusinessPage,
});

const euro = (v: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${euro(Math.abs(v))}`;

function BusinessPage() {
  const { state, dispatch, derived } = useStore();
  const a = state.assumptions;
  const s = policySavings(derived, a);
  const data = getCostImpact(derived, state.draftRules, a, withLimit);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Cost impact"
        description="What the current policy draft does to Human review cost at your volume. Inputs are labelled ASSUMED; nothing here is measured on real claims."
        action={
          <Button variant="outline" onClick={() => dispatch({ type: "resetAssumptions" })}>
            Reset
          </Button>
        }
      />

      <section aria-labelledby="settings-title" className="border-b border-border pb-8">
        <SectionTitle title="Your settings" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AssumptionField name="eurPerMinute" label="Handler cost" unit="EUR per minute" />
          <AssumptionField name="reviewMinutes" label="One Human review" unit="minutes" />
          <AssumptionField name="claimsPerMonth" label="Claims per month" unit="claims" />
          <AssumptionField name="growthPercent" label="Volume growth" unit="% per year" />
          <AssumptionField name="unnecessaryReviewShare" label="Unnecessary Human reviews" unit="%" percent />
          <AssumptionField name="wrongRoutineCost" label="One wrong routine decision" unit="EUR" />
        </div>
        <div className="mt-4">
          <label htmlFor="volume-slider" className="text-sm">
            What if volume changes: <span className="tnum font-mono">{a.claimsPerMonth.toLocaleString("en-IE")}</span> claims per month
          </label>
          <input
            id="volume-slider"
            type="range"
            min={100}
            max={50000}
            step={100}
            value={Math.min(Math.max(a.claimsPerMonth, 100), 50000)}
            onChange={(e) => dispatch({ type: "setAssumption", key: "claimsPerMonth", value: Number(e.target.value) })}
            className="mt-2 block w-full accent-[var(--chart-gray-1)]"
          />
        </div>
      </section>

      <section aria-labelledby="draft-title">
        <SectionTitle
          title="Current draft against live rules"
          subtitle="Open claims only. Missing information is not priced."
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" aria-live="polite">
          {[
            ["Newly to Human review", s.newlyEscalated],
            ["Released from Human review", s.released],
            ["Moved to Routine processing", s.movedToRoutine],
            ["Moved to Missing information", s.movedToInfo],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tnum font-mono text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
          <span>Extra cost of Human review per month</span>
          <span className="tnum font-mono font-semibold" aria-live="polite">
            {signed(s.extraReviewCostPerMonth)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">ASSUMED</span>
          </span>
        </div>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Formula</summary>
          <p className="mt-1 font-mono">
            ({s.newlyEscalated} − {s.released}) ÷ {s.openClaims} open claims × {a.claimsPerMonth.toLocaleString("en-IE")} claims × {euro(reviewCost(a))} per review
          </p>
        </details>
        <div className="mt-3 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Secondary: expected cost of wrong routine decisions per month</span>
          <span className="tnum font-mono">{euro(s.wrongRoutineCostPerMonth)} ASSUMED</span>
        </div>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Formula</summary>
          <p className="mt-1 font-mono">
            {s.movedToRoutine} claims start routine ÷ {s.openClaims} open × {a.claimsPerMonth.toLocaleString("en-IE")} claims × {Math.round((1 - a.unnecessaryReviewShare) * 100)}% rightly escalated × {euro(a.wrongRoutineCost)}
          </p>
        </details>
      </section>

      <section aria-labelledby="charts-title">
        <SectionTitle title="Charts" />
        <CostCharts data={data} a={a} quoteLimit={state.quoteLimit} />
      </section>
    </div>
  );
}
