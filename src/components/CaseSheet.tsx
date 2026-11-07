import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, FileText, GitBranch, Lock, Plug } from "lucide-react";
import type { Rec } from "@/types";
import {
  CONFIRM_REC,
  CONFIRM_TOAST,
  COPY_TEXT,
  EMAIL_LABEL,
  INFO_FOOTNOTE,
  LOCKED_BANNER,
  LOCKED_TOOLTIP,
  OVERRIDE_REC,
  PREPARE_INFO,
  RULE_BASED,
  REC_LABEL,
} from "@/copy";
import { useStore } from "@/store";
import { fieldLabel, FIELD_MAP } from "@/lib/fields";
import type { DerivedClaim } from "@/lib/report";
import { cn } from "@/lib/utils";
import { Chip, FlowBadge, NotProvided, PolicyStamp, RuleChips, StatusChip, TriGlyph, WhyDisabled } from "./status";
import { OverrideFlow } from "./OverrideFlow";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard can be blocked; the label still confirms intent */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : COPY_TEXT}</span>
    </Button>
  );
}

function suggestion(claim: DerivedClaim, limit: number) {
  const absent = claim.rule_v1.startsWith("ABSENT(") ? claim.rule_v1.slice(7, -1).split(",") : [];
  if (absent.length === 0) {
    const fired = claim.checklist.filter((c) => c.result === "true" && c.outcome === "request_information");
    const doc = fired[0]?.id.includes("itemized") ? "Itemized repair quote" : fired[0]?.id.includes("incident_report") ? "Incident report" : fired[0]?.description ?? "Supporting document";
    return {
      field: null as string | null,
      title: `The missing item is a supporting document: ${doc}.`,
      outcomes: `If attached: ${REC_LABEL.routine_processing}. If still missing: ${REC_LABEL.request_information}.`,
    };
  }
  const field = absent.includes("quote_eur") ? "quote_eur" : absent[0];
  const meta = FIELD_MAP[field];
  let outcomes: string;
  if (field === "quote_eur") outcomes = `If provided and within limits: ${REC_LABEL.routine_processing}. If above EUR ${limit.toLocaleString("en-US")}: ${REC_LABEL.human_review}.`;
  else if (field.endsWith("_present")) outcomes = `If attached: ${REC_LABEL.routine_processing}. If not attached: ${REC_LABEL.request_information}.`;
  else if (meta?.type === "bool") outcomes = `If no: ${REC_LABEL.routine_processing}. If yes: ${REC_LABEL.human_review}.`;
  else outcomes = `Once provided, the rules can decide between ${REC_LABEL.routine_processing} and ${REC_LABEL.human_review}.`;
  return { field, title: `Ask for: ${fieldLabel(field).toLowerCase()}.`, outcomes };
}

function infoRequestText(claim: DerivedClaim) {
  const items: string[] = [];
  claim.blank_fields.forEach((f) => items.push(`- ${fieldLabel(f)} (${f})`));
  claim.checklist
    .filter((c) => c.result === "true" && c.outcome === "request_information")
    .forEach((c) => {
      const f = c.id.includes("itemized") ? "itemized_quote_present" : c.id.includes("incident_report") ? "incident_report_present" : c.id;
      if (!claim.blank_fields.includes(f)) items.push(`- ${fieldLabel(f)} (${f})`);
    });
  return `Claim ${claim.case_id}\n\nTo continue with your claim we need the following:\n${items.join("\n")}\n\nPlease reply with these at your convenience. Thank you.`;
}

function emailText(claim: DerivedClaim) {
  return `Subject: Your motor claim ${claim.case_id}\n\nHello,\n\nThank you for reporting your claim. A member of our team is looking at it. ${
    claim.flow === "yellow" ? "We will be in touch about one or two items we still need." : "We will update you on the next step shortly."
  }\n\nKind regards,\nClaims team`;
}

export function CaseSheet({
  claim,
  open,
  onOpenChange,
  initialOverride,
}: {
  claim: DerivedClaim | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialOverride?: Rec | "open";
}) {
  const { dispatch, state } = useStore();
  const [mode, setMode] = useState<"view" | "override">("view");
  const [target, setTarget] = useState<Rec | undefined>();
  const [infoOpen, setInfoOpen] = useState(false);
  const [showPassed, setShowPassed] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialOverride ? "override" : "view");
      setTarget(initialOverride && initialOverride !== "open" ? initialOverride : undefined);
      setInfoOpen(false);
      setShowPassed(false);
    }
  }, [open, claim?.case_id, initialOverride]);

  if (!claim) return null;
  const locked = claim.case_status === "closed";
  const yellow = claim.flow === "yellow";
  const order = { true: 0, unknown: 1, false: 2 } as const;
  const sorted = [...claim.checklist].sort((a, b) => order[a.result] - order[b.result]);
  const passed = sorted.filter((c) => c.result === "false");
  const notPassed = sorted.filter((c) => c.result !== "false");
  const sug = yellow ? suggestion(claim, state.quoteLimit === 1500 ? 1500 : 1500) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 shadow-sheet sm:max-w-[680px]">
        <div className="border-b border-border px-6 pb-5 pt-6">
          <div className="flex flex-wrap items-center gap-2 pr-20">
            <SheetTitle className="font-mono text-2xl font-semibold tracking-tight">{claim.case_id}</SheetTitle>
            <FlowBadge rec={claim.recommendation_v1} />
            <StatusChip status={claim.case_status} />
            <PolicyStamp version={claim.policy_version} hash={claim.policy_hash} />
          </div>
          <SheetDescription className="mt-2 text-sm text-text-2">{claim.claim_summary}</SheetDescription>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
          {locked && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-2">
              <Lock className="size-4 shrink-0" aria-hidden /> {LOCKED_BANNER}
            </div>
          )}

          {mode === "override" ? (
            <section>
              <h3 className="section-title mb-4">{OVERRIDE_REC}</h3>
              <OverrideFlow
                key={`${claim.case_id}-${target}`}
                claim={claim}
                initialTarget={target}
                onCancel={() => setMode("view")}
                onDone={() => onOpenChange(false)}
              />
            </section>
          ) : (
            <>
              <section>
                <h3 className="section-title mb-3">Why this recommendation</h3>
                <RuleChips rule={claim.rule_v1} />
                <p className="mt-3 text-sm text-text-2">{claim.explanation}</p>
                {!locked && claim.needs_recheck && (
                  <p className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-xs text-text-2">
                    Under draft v2 this becomes: <FlowBadge rec={claim.recommendation_v2} size="sm" /> via <RuleChips rule={claim.rule_v2} />
                  </p>
                )}
                <ul className="mt-4 space-y-2">
                  {[...notPassed, ...(showPassed ? passed : [])].map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "rounded-lg border p-3",
                        c.result === "unknown" ? "border-unknown/30 bg-unknown-tint" : c.result === "true" ? "border-border-strong bg-background" : "border-border bg-background",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="w-20 shrink-0"><TriGlyph result={c.result} outcome={c.outcome} /></span>
                        <span className="font-mono text-xs text-foreground">{c.id}</span>
                        <span className="text-sm text-text-2">{c.description}</span>
                        <span className="ml-auto"><FlowBadge rec={c.outcome} size="sm" /></span>
                      </div>
                      <div className={cn("mt-2 rounded-md px-2 py-1.5 font-mono text-[12px] leading-5 text-text-2", c.result === "unknown" ? "bg-background/70" : "bg-surface")}>{c.evidence}</div>
                    </li>
                  ))}
                </ul>
                {passed.length > 0 && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowPassed((s) => !s)} aria-expanded={showPassed}>
                    <ChevronDown className={cn("transition-transform", showPassed && "rotate-180")} aria-hidden />
                    {showPassed ? "Hide passed rules" : `Show ${passed.length} passed rules`}
                  </Button>
                )}
              </section>

              <section>
                <h3 className="section-title mb-3">Facts</h3>
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  {Object.entries(claim.facts).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm">
                      <dt className="font-mono text-[12px] text-muted-foreground">{k}</dt>
                      <dd className="tnum text-right">
                        {claim.blank_fields.includes(k) || v === null ? (
                          <NotProvided />
                        ) : k === "case_status" ? (
                          v === "closed" ? "Locked" : "Open"
                        ) : typeof v === "boolean" ? (
                          v ? "Yes" : "No"
                        ) : typeof v === "number" ? (
                          v.toLocaleString("en-US")
                        ) : (
                          String(v)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {sug && (
                <section className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="section-title">One question that would change the outcome</h3>
                    <Chip tone="outline">{RULE_BASED}</Chip>
                  </div>
                  <p className="mt-2 text-sm font-medium">
                    {sug.title} {sug.field && <span className="font-mono text-xs font-normal text-muted-foreground">({sug.field})</span>}
                  </p>
                  <p className="mt-1 text-sm text-text-2">{sug.outcomes}</p>
                </section>
              )}

              {infoOpen && yellow && (
                <section className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="section-title">Information request</h3>
                    <CopyButton text={infoRequestText(claim)} />
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md bg-surface p-3 font-sans text-sm text-text-2">{infoRequestText(claim)}</pre>
                  <p className="mt-2 text-xs text-muted-foreground">{INFO_FOOTNOTE}</p>
                </section>
              )}

              <section className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="section-title">Draft email (placeholder)</h3>
                    <p className="text-xs text-muted-foreground">{EMAIL_LABEL}</p>
                  </div>
                  <CopyButton text={emailText(claim)} />
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-text-2">{emailText(claim)}</pre>
              </section>

              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong p-4">
                <div>
                  <h3 className="section-title">HubSpot integration</h3>
                  <p className="text-sm text-muted-foreground">Planned: sync this case to your CRM</p>
                </div>
                <WhyDisabled disabled reason="Not available in this demo">
                  <Button variant="outline" size="sm" disabled>
                    <Plug aria-hidden /> Connect
                  </Button>
                </WhyDisabled>
              </section>
            </>
          )}
        </div>

        {mode === "view" && (
          <div className="flex flex-wrap gap-2 border-t border-border bg-background px-6 py-4">
            <WhyDisabled disabled={locked} reason={LOCKED_TOOLTIP}>
              <Button
                disabled={locked}
                onClick={() => {
                  dispatch({ type: "confirm", case_id: claim.case_id });
                  toast(CONFIRM_TOAST);
                }}
              >
                <Check aria-hidden /> {CONFIRM_REC}
              </Button>
            </WhyDisabled>
            <WhyDisabled disabled={locked} reason={LOCKED_TOOLTIP}>
              <Button variant="outline" disabled={locked} onClick={() => setMode("override")}>
                <GitBranch aria-hidden /> {OVERRIDE_REC}
              </Button>
            </WhyDisabled>
            {yellow && (
              <WhyDisabled disabled={locked} reason={LOCKED_TOOLTIP}>
                <Button variant="outline" disabled={locked} onClick={() => setInfoOpen(true)}>
                  <FileText aria-hidden /> {PREPARE_INFO}
                </Button>
              </WhyDisabled>
            )}
            {claim.ui_status === "reviewed" && (
              <span className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden /> Reviewed
              </span>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
