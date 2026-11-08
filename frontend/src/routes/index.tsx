import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/store";
import { REC_LABEL, REC_OF } from "@/copy";
import { SectionTitle } from "@/components/status";
import { FLOW_DOT, FLOW_NAME } from "@/lib/flow-styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { ClaimsList, type FlowFilter } from "@/components/ClaimsList";
import type { Flow } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Motor claims triage" },
      {
        name: "description",
        content: "Open claims by recommended next step, with the most urgent at the top.",
      },
      { property: "og:title", content: "Dashboard · Motor claims triage" },
      {
        property: "og:description",
        content: "Explainable next-step recommendations for motor claims, sorted by urgency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Horizon = "daily" | "weekly" | "monthly" | "yearly" | "all";
const HORIZONS: { value: Horizon; label: string; days: number | null; caption: string }[] = [
  { value: "daily", label: "Daily", days: 1, caption: "Last day" },
  { value: "weekly", label: "Weekly", days: 7, caption: "Last 7 days" },
  { value: "monthly", label: "Monthly", days: 30, caption: "Last 30 days" },
  { value: "yearly", label: "Yearly", days: 365, caption: "Last 12 months" },
  { value: "all", label: "All time", days: null, caption: "Every claim on file" },
];

function ClaimsOverview({ flow, setFlow }: { flow: FlowFilter; setFlow: (f: FlowFilter) => void }) {
  const { derived } = useStore();
  const [horizon, setHorizon] = useState<Horizon>("all");
  const hz = HORIZONS.find((x) => x.value === horizon)!;
  // Mock data has no live clock: the window ends at the latest incident date on file.
  const latest = derived.reduce(
    (m, c) => (String(c.facts["incident_date"] ?? "") > m ? String(c.facts["incident_date"]) : m),
    "",
  );
  const list = derived.filter((c) => {
    if (hz.days === null) return true;
    const d = c.facts["incident_date"];
    if (typeof d !== "string" || !latest) return false;
    const diff = (Date.parse(latest) - Date.parse(d)) / 864e5;
    return diff >= 0 && diff < hz.days;
  });
  const total = list.length;
  const count = (f: Flow) => list.filter((c) => c.flow === f).length;
  const openOf = (f?: Flow) =>
    list.filter((c) => c.case_status === "open" && (!f || c.flow === f)).length;
  const segs: { flow: Flow; label: string; n: number }[] = [
    { flow: "red", label: FLOW_NAME.red, n: count("red") },
    { flow: "yellow", label: FLOW_NAME.yellow, n: count("yellow") },
    { flow: "green", label: FLOW_NAME.green, n: count("green") },
  ];

  const num = (n: number) => new Intl.NumberFormat("en-IE").format(n);

  return (
    <section aria-labelledby="overview-title" className="border-b border-border pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="overview-title" className="text-sm font-medium text-text-2">
            Overall claims
          </h2>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="display-num text-4xl font-medium">{num(total)}</span>
            <span className="tnum text-sm text-muted-foreground">
              {total === 1 ? "claim" : "claims"}, {num(openOf())} open
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label htmlFor="horizon" className="sr-only">
            Time horizon
          </label>
          <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
            <SelectTrigger id="horizon" className="h-8 w-36 text-base md:text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {HORIZONS.map((x) => (
                <SelectItem key={x.value} value={x.value} className="text-xs">
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{hz.caption}</span>
        </div>
      </div>

      {/* The flow line in flow colours; the labels under it carry the meaning too. Empty flows are not drawn. */}
      <div
        className="mt-6 flex h-1 w-full gap-px overflow-hidden bg-surface-2"
        role="img"
        aria-label={segs.map((s) => `${s.label} ${s.n} of ${total}`).join(", ")}
      >
        {total > 0 &&
          segs
            .filter((s) => s.n > 0)
            .map((s) => (
              <div
                key={s.flow}
                className={`h-full ${FLOW_DOT[s.flow]}`}
                style={{ width: `${(s.n / total) * 100}%` }}
              />
            ))}
      </div>

      <div
        className="mt-2 grid grid-cols-1 divide-y divide-border min-[400px]:grid-cols-3 min-[400px]:gap-x-6 min-[400px]:divide-y-0"
        role="group"
        aria-label="Filter claims by flow"
      >
        {segs.map((s) => {
          const active = flow === s.flow;
          return (
            <button
              key={s.flow}
              type="button"
              aria-pressed={active}
              onClick={() => setFlow(active ? "all" : s.flow)}
              className={`group relative min-h-11 touch-manipulation select-none py-3 text-left transition-[color,opacity] duration-(--dur-fast) ease-(--ease-out) [-webkit-tap-highlight-color:transparent] active:opacity-70 ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>{s.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="display-num text-2xl font-medium text-foreground">{num(s.n)}</span>
                <span className="tnum text-xs">of {num(total)}</span>
              </div>
              <div className="tnum mt-1 text-xs">{num(openOf(s.flow))} open</div>
              <span
                aria-hidden
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground transition-transform duration-(--dur-fast) ease-(--ease-out) ${
                  active ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      {total === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No claims in this period. Choose a longer time range.
        </p>
      )}
    </section>
  );
}

function Dashboard() {
  const { state } = useStore();
  const [flow, setFlow] = useState<FlowFilter>("all");
  return (
    <div className="space-y-12">
      {state.source === "connecting" && state.claims.length === 0 ? (
        <div
          className="h-[232px] border-b border-border pb-8"
          role="status"
          aria-label="Loading claims overview"
        >
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-28 bg-surface-2" />
            <div className="h-10 w-40 bg-surface-2" />
          </div>
          <div className="mt-6 h-1 w-full animate-pulse bg-surface-2" />
          <div className="mt-2 grid grid-cols-3 gap-x-6 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 w-24 bg-surface-2" />
                <div className="h-8 w-16 bg-surface-2" />
                <div className="h-3 w-14 bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ClaimsOverview flow={flow} setFlow={setFlow} />
      )}
      <ClaimsList
        compact
        flow={flow}
        setFlow={setFlow}
        hideFlowFilter
        heading={
          <SectionTitle
            title="Needs attention"
            subtitle={
              flow === "all"
                ? "Open claims, from human review to routine processing."
                : `Open claims recommended for ${REC_LABEL[REC_OF[flow]].toLowerCase()}.`
            }
          />
        }
      />
    </div>
  );
}
