import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/store";
import { Dot, FLOW_DOT, SectionTitle } from "@/components/status";
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
        content:
          "Where reviewer time goes, which claims need attention, and an honest business case.",
      },
      { property: "og:title", content: "Dashboard · Motor claims triage" },
      {
        property: "og:description",
        content:
          "Explainable next-step recommendations for motor claims, with an evidence-labelled business case.",
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
            <span className="display-num text-5xl font-medium">{total}</span>
            <span className="tnum text-xs text-muted-foreground">{openOf()} open</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label htmlFor="horizon" className="sr-only">
            Time horizon
          </label>
          <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
            <SelectTrigger id="horizon" className="h-8 w-36 text-xs">
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

      <div
        className="mt-6 flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-surface-2"
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
        className="mt-4 grid gap-3 sm:grid-cols-3"
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
              className={`rounded-lg border px-4 py-3 text-left transition-colors duration-(--dur-fast) ease-(--ease-out) active:scale-[0.98] ${
                active
                  ? "border-foreground bg-surface"
                  : "border-border hover:border-border-strong hover:bg-surface"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-text-2">
                <Dot flow={s.flow} /> {s.label} claims
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="display-num text-2xl font-medium">{s.n}</span>
                <span className="tnum text-xs text-muted-foreground">of {total}</span>
                <span className="tnum ml-auto text-xs text-muted-foreground">
                  {openOf(s.flow)} open
                </span>
              </div>
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
          className="card-panel h-[264px] animate-pulse bg-surface-2"
          role="status"
          aria-label="Loading claims overview"
        />
      ) : (
        <ClaimsOverview flow={flow} setFlow={setFlow} />
      )}
      <ClaimsList
        flow={flow}
        setFlow={setFlow}
        hideFlowFilter
        heading={<SectionTitle title="Claims" />}
      />
    </div>
  );
}
