// Right side of Policy change: how open claims would flow under the draft, and which claims change and why.
// Numbers lead; the paired bars are thin and secondary. Flow colour appears only as small dots and delta arrows.
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { getPolicyImpact } from "@/data/api";
import { FLOW_OF, NOT_PROVIDED, POLICY_COPY, REC_LABEL, REC_ORDER, IMPACT_COPY } from "@/copy";
import { useStore } from "@/store";
import { flipList } from "@/lib/report";
import { policySavings } from "@/lib/savings";
import { causeLabel, causeRuleIds, isStricter } from "@/lib/policy-view";
import { FLOW_DOT } from "@/lib/flow-styles";
import { cn } from "@/lib/utils";
import { CaseSheet } from "@/components/CaseSheet";
import { Chip } from "@/components/status";
import type { Rec } from "@/types";

const euro = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function Dot({ rec }: { rec: Rec }) {
  return (
    <span className={cn("size-2 shrink-0 rounded-full", FLOW_DOT[FLOW_OF[rec]])} aria-hidden />
  );
}

function FlowLabel({ rec }: { rec: Rec }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Dot rec={rec} />
      {REC_LABEL[rec]}
    </span>
  );
}

export function PolicyImpact({
  released,
  highlightRule,
  onHoverRules,
}: {
  /** After release the draft is live: "Expected" reads "Now live". */
  released: boolean;
  /** Rule card under the pointer; rows it causes are highlighted. */
  highlightRule: string | null;
  /** Row under the pointer reports the rules that caused it (null on leave). */
  onHoverRules: (ids: string[] | null) => void;
}) {
  const { state, derived, v1Rules } = useStore();
  const rules = state.draftRules;
  const impact = getPolicyImpact(derived, state.handlingRates);
  const savings = policySavings(derived, state.assumptions);
  const flips = useMemo(
    () =>
      flipList(derived)
        .filter((f) => f.claim.case_status === "open")
        .map((f) => ({ ...f, ruleIds: causeRuleIds(f.cause, [...rules, ...v1Rules]) }))
        .sort((a, b) => Number(isStricter(b.from, b.to)) - Number(isStricter(a.from, a.to))),
    [derived, rules, v1Rules],
  );
  const [listOpen, setListOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedClaim = derived.find((c) => c.case_id === selected) ?? null;

  const rows = REC_ORDER.map((rec) => {
    const c = impact.counts.find((x) => x.flow === FLOW_OF[rec])!;
    return { rec, live: c.live, expected: c.expected, delta: c.expected - c.live };
  });
  const max = Math.max(1, ...rows.flatMap((r) => [r.live, r.expected]));
  const expectedLabel = released ? POLICY_COPY.nowLive : POLICY_COPY.expected;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="impact-title" className="section-title">
            {POLICY_COPY.expectations}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{POLICY_COPY.expectationsHelp}</p>
        </div>
        <Chip tone="outline">{released ? POLICY_COPY.nowLiveTag : POLICY_COPY.preview}</Chip>
      </header>

      {/* Case distribution: Expected and Δ are the headline; the bars only support them. */}
      <section aria-labelledby="dist-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h3 id="dist-title" className="eyebrow">
            {POLICY_COPY.distribution}
          </h3>
          <span className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-3 bg-border-strong" aria-hidden />
              {POLICY_COPY.live}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-3 bg-foreground" aria-hidden />
              {expectedLabel}
            </span>
          </span>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">
            {POLICY_COPY.distribution}: {POLICY_COPY.live} and {expectedLabel} per flow
          </caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="py-2 text-left font-normal">
                <span className="sr-only">Flow</span>
              </th>
              <th scope="col" className="w-12 py-2 text-right font-normal">
                {POLICY_COPY.live}
              </th>
              <th scope="col" className="w-20 py-2 pl-4 text-right font-normal">
                {expectedLabel}
              </th>
              <th scope="col" className="w-16 py-2 pl-4 text-right font-normal">
                {IMPACT_COPY.delta}
              </th>
            </tr>
          </thead>
          <tbody aria-live="polite">
            {rows.map((r) => (
              <tr key={r.rec} className="border-t border-border align-top">
                <th scope="row" className="w-full py-3 pr-4 text-left font-normal">
                  <FlowLabel rec={r.rec} />
                  <div className="mt-2 max-w-[240px] space-y-1" aria-hidden>
                    <div
                      className="h-1 bg-border-strong"
                      style={{ width: `${(r.live / max) * 100}%` }}
                      title={`${POLICY_COPY.live}: ${r.live} claims`}
                    />
                    <div
                      className="h-1 bg-foreground transition-[width] duration-500"
                      style={{ width: `${(r.expected / max) * 100}%` }}
                      title={`${expectedLabel}: ${r.expected} claims`}
                    />
                  </div>
                </th>
                <td className="tnum py-3 text-right text-muted-foreground">{r.live}</td>
                <td className="py-3 pl-4 text-right">
                  <span
                    key={`${r.rec}-${r.expected}`}
                    className="impact-change display-num text-[26px] font-semibold leading-8"
                  >
                    {r.expected}
                  </span>
                </td>
                <td className="py-3 pl-4 text-right">
                  <span
                    key={`${r.rec}-d-${r.delta}`}
                    className={cn(
                      "impact-change display-num inline-flex items-center justify-end gap-1 text-base font-medium leading-6",
                      r.delta === 0 && "text-muted-foreground",
                    )}
                  >
                    {r.delta > 0 ? (
                      <ArrowUp className={cn("size-4", deltaTone(r.rec))} aria-hidden />
                    ) : r.delta < 0 ? (
                      <ArrowDown className={cn("size-4", deltaTone(r.rec))} aria-hidden />
                    ) : (
                      <span aria-hidden>—</span>
                    )}
                    {signed(r.delta)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-xs text-muted-foreground">
              <td className="pt-2" colSpan={5}>
                {POLICY_COPY.openClaims(impact.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Claims that changed: hover a row to find its rule on the left; click to open the case. */}
      <section aria-labelledby="changed-title">
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          className="flex w-full items-baseline justify-between gap-2 border-b border-border pb-2 text-left"
        >
          <h3 id="changed-title" className="eyebrow">
            {POLICY_COPY.changedClaims}{" "}
            <span className="tnum">({POLICY_COPY.changedOf(flips.length, impact.total)})</span>
          </h3>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              listOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {listOpen &&
          (flips.length ? (
            <ul className="divide-y divide-border text-sm" onMouseLeave={() => onHoverRules(null)}>
              {flips.map((f) => {
                const stricter = isStricter(f.from, f.to);
                const lit = !!highlightRule && f.ruleIds.includes(highlightRule);
                return (
                  <li key={f.claim.case_id}>
                    <button
                      type="button"
                      onMouseEnter={() => onHoverRules(f.ruleIds)}
                      onFocus={() => onHoverRules(f.ruleIds)}
                      onBlur={() => onHoverRules(null)}
                      onClick={() => setSelected(f.claim.case_id)}
                      className={cn(
                        "grid w-full grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 px-2 py-3 text-left transition-colors hover:bg-surface sm:grid-cols-[5.5rem_1fr_auto]",
                        lit && "bg-surface-2",
                      )}
                    >
                      <span className="font-mono text-xs">{f.claim.case_id}</span>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-muted-foreground">
                          <FlowLabel rec={f.from} />
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
                        <span className={cn(f.to === "human_review" && "font-semibold")}>
                          <FlowLabel rec={f.to} />
                        </span>
                      </span>
                      <span className="col-span-2 inline-flex items-center gap-1 whitespace-nowrap text-xs text-text-2 sm:col-span-1">
                        {stricter ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )}
                        {stricter ? POLICY_COPY.stricter : POLICY_COPY.lessScrutiny}
                      </span>
                      <span
                        className={cn(
                          "col-span-2 truncate text-xs sm:col-start-2 sm:col-end-4",
                          lit ? "text-text-2" : "text-muted-foreground",
                        )}
                      >
                        {POLICY_COPY.causedBy}: {causeLabel(f.cause, rules, v1Rules)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {POLICY_COPY.noChangesYet}
            </p>
          ))}
        <p className="mt-3 text-xs text-muted-foreground">{POLICY_COPY.blankCaption}</p>
      </section>

      <dl className="grid gap-2 border-t border-border pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{POLICY_COPY.handlingCost}</dt>
          <dd className="tnum">
            {impact.expectedCost === null ? (
              <span className="text-xs text-muted-foreground">{NOT_PROVIDED}</span>
            ) : (
              <>
                {euro(impact.expectedCost)}
                <span className="ml-2 text-xs text-muted-foreground">{IMPACT_COPY.assumed}</span>
              </>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            {POLICY_COPY.extraReviewCost}{" "}
            <Link className="text-xs underline underline-offset-2" to="/business">
              Cost impact
            </Link>
          </dt>
          <dd className="tnum">
            {savings.extraReviewCostPerMonth > 0
              ? "+"
              : savings.extraReviewCostPerMonth < 0
                ? "−"
                : ""}
            {euro(Math.abs(savings.extraReviewCostPerMonth))}
            <span className="ml-2 text-xs text-muted-foreground">{IMPACT_COPY.assumed}</span>
          </dd>
        </div>
      </dl>

      <CaseSheet
        claim={selectedClaim}
        open={!!selectedClaim}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}

/** Delta arrows carry the row's flow colour as a small accent; the number itself stays in text ink. */
function deltaTone(rec: Rec) {
  return {
    human_review: "text-flow-red",
    request_information: "text-flow-yellow",
    routine_processing: "text-flow-green",
  }[rec];
}
