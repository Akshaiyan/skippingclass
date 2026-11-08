// Cost impact: settings, then three key figures, then two charts. Frontend only, mock data.
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import { COST_COPY } from "@/copy";
import { Chip, PageHeader, SectionTitle } from "@/components/status";
import { AssumptionField } from "@/components/AssumptionField";
import { CostCharts, CostKpis } from "@/components/CostCharts";
import { Button } from "@/components/ui/button";
import { getCostImpact } from "@/data/api";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Cost impact · Motor claims triage" },
      { name: "description", content: COST_COPY.subtitle },
    ],
  }),
  component: BusinessPage,
});

const VOLUME_MIN = 100;
const VOLUME_MAX = 50000;

function BusinessPage() {
  const { state, dispatch, derived } = useStore();
  const a = state.assumptions;
  const data = getCostImpact(derived, a);
  return (
    <div className="space-y-8">
      <PageHeader
        title={COST_COPY.title}
        description={
          <>
            <span className="block">{COST_COPY.subtitle}</span>
            <span className="block text-xs">{COST_COPY.honesty}</span>
          </>
        }
        action={
          <Button variant="outline" onClick={() => dispatch({ type: "resetAssumptions" })}>
            <RotateCcw aria-hidden /> {COST_COPY.reset}
          </Button>
        }
      />

      <section aria-label={COST_COPY.settings} className="border-b border-border pb-8">
        <SectionTitle
          title={COST_COPY.settings}
          subtitle={COST_COPY.settingsHelp}
          right={<Chip tone="outline">{COST_COPY.assumed}</Chip>}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <AssumptionField name="eurPerMinute" label="Handler cost" unit="€ / min" />
          <AssumptionField name="reviewMinutes" label="One Human review" unit="min" />
          <AssumptionField name="growthPercent" label="Volume growth" unit="% / yr" />
        </div>
        {/* The one source of claims per month: every figure below reads this value. */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="volume-slider" className="text-sm font-medium">
              {COST_COPY.volume}
            </label>
            <span className="flex items-baseline gap-2">
              <span className="section-title tnum" aria-live="polite">
                {a.claimsPerMonth.toLocaleString("en-IE")}
              </span>
              <span className="text-xs text-muted-foreground">{COST_COPY.volumeUnit}</span>
            </span>
          </div>
          <input
            id="volume-slider"
            type="range"
            min={VOLUME_MIN}
            max={VOLUME_MAX}
            step={100}
            value={Math.min(Math.max(a.claimsPerMonth, VOLUME_MIN), VOLUME_MAX)}
            aria-valuetext={`${a.claimsPerMonth.toLocaleString("en-IE")} ${COST_COPY.volumeUnit}`}
            onChange={(e) =>
              dispatch({
                type: "setAssumption",
                key: "claimsPerMonth",
                value: Number(e.target.value),
              })
            }
            className="mt-2 block h-11 w-full accent-[var(--chart-gray-1)] sm:h-6"
          />
          <div className="tnum mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{VOLUME_MIN.toLocaleString("en-IE")}</span>
            <span>{VOLUME_MAX.toLocaleString("en-IE")}</span>
          </div>
        </div>
      </section>

      <section aria-label={COST_COPY.keyFigures}>
        <SectionTitle
          title={COST_COPY.keyFigures}
          subtitle={data.sampleSize ? COST_COPY.sample(data.sampleSize) : undefined}
          right={<Chip tone="outline">{COST_COPY.derived}</Chip>}
        />
        <CostKpis data={data} a={a} />
      </section>

      <section aria-label={`${COST_COPY.mixTitle} and ${COST_COPY.lineTitle}`}>
        <CostCharts data={data} a={a} />
      </section>
    </div>
  );
}
