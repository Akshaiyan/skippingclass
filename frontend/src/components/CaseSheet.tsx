import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, GitBranch, Lock, Mail, Phone, Plug } from "lucide-react";
import type { Rec } from "@/types";
import {
  REVIEW_COPY,
  confirmAction,
  CONFIRM_TOAST,
  COPY_TEXT,
  INFO_FOOTNOTE,
  LOCKED_BANNER,
  LOCKED_TOOLTIP,
  NOT_PROVIDED,
  OVERRIDE_REC,
  RULE_BASED,
  REC_LABEL,
} from "@/copy";
import { useStore } from "@/store";
import { fieldLabel, FIELD_MAP } from "@/lib/fields";
import { eur, nextStep, quoteOf, shortDate, shortReason } from "@/lib/claim-view";
import { quoteMargins } from "@/lib/quote-margin";
import { draftAsText, draftEmail, mailtoHref, telHref } from "@/lib/outreach";
import { quoteLimitOf, type DerivedClaim } from "@/lib/report";
import { cn } from "@/lib/utils";
import {
  Chip,
  FlowBadge,
  NotProvided,
  PolicyStamp,
  RuleChips,
  StatusChip,
  TriGlyph,
  WhyDisabled,
} from "./status";
import { DecisionMemory } from "./DecisionMemory";
import { OverrideFlow } from "./OverrideFlow";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

function CopyButton({
  text,
  label = COPY_TEXT,
  onCopy,
}: {
  text: string;
  label?: string;
  onCopy?: () => void;
}) {
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
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

function suggestion(claim: DerivedClaim, limit: number) {
  const absent = claim.rule_v1.startsWith("ABSENT(") ? claim.rule_v1.slice(7, -1).split(",") : [];
  if (absent.length === 0) {
    const fired = claim.checklist.filter(
      (c) => c.result === "true" && c.outcome === "request_information",
    );
    const doc = fired[0]?.id.includes("itemized")
      ? "Itemized repair quote"
      : fired[0]?.id.includes("incident_report")
        ? "Incident report"
        : (fired[0]?.description ?? "Supporting document");
    return {
      field: null as string | null,
      title: `The missing item is a supporting document: ${doc}.`,
      outcomes: `If attached: ${REC_LABEL.routine_processing}. If still missing: ${REC_LABEL.request_information}.`,
    };
  }
  const field: string = absent.includes("quote_eur") ? "quote_eur" : (absent[0] ?? "");
  const meta = FIELD_MAP[field];
  let outcomes: string;
  if (field === "quote_eur")
    outcomes = `If provided and within limits: ${REC_LABEL.routine_processing}. If above EUR ${limit.toLocaleString("en-US")}: ${REC_LABEL.human_review}.`;
  else if (field.endsWith("_present"))
    outcomes = `If attached: ${REC_LABEL.routine_processing}. If not attached: ${REC_LABEL.request_information}.`;
  else if (meta?.type === "bool")
    outcomes = `If no: ${REC_LABEL.routine_processing}. If yes: ${REC_LABEL.human_review}.`;
  else
    outcomes = `Once provided, the rules can decide between ${REC_LABEL.routine_processing} and ${REC_LABEL.human_review}.`;
  return { field, title: `Ask for: ${fieldLabel(field).toLowerCase()}.`, outcomes };
}

function FactValue({ k, v, blank }: { k: string; v: unknown; blank: boolean }) {
  if (blank || v === null || v === undefined || v === "") return <NotProvided />;
  if (k === "case_status") return <>{v === "closed" ? "Closed" : "Open"}</>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (typeof v === "number") return <>{v.toLocaleString("en-US")}</>;
  return <>{String(v)}</>;
}

const SECTION = "border-b border-border";
const TRIGGER = "py-4 text-sm font-semibold hover:no-underline";

export function CaseSheet({
  claim,
  open,
  onOpenChange,
  initialOverride,
  onReturnFocus,
}: {
  claim: DerivedClaim | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialOverride?: Rec | "open";
  onReturnFocus?: () => void;
}) {
  const { state, dispatch, v1Rules } = useStore();
  const [mode, setMode] = useState<"view" | "override">("view");
  const [target, setTarget] = useState<Rec | undefined>();
  const [draftOpen, setDraftOpen] = useState(false);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{
    timestamp: string;
    caseId: string;
    previousStatus?: "reviewed";
  } | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 6000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  useEffect(() => {
    if (open) {
      setMode(initialOverride ? "override" : "view");
      setTarget(initialOverride && initialOverride !== "open" ? initialOverride : undefined);
      setDraftOpen(false);
      setOpenItems([]);
      setConfirmation(null);
    }
  }, [open, claim?.case_id, initialOverride]);

  if (!claim) return null;
  const locked = claim.case_status === "closed";
  const yellow = claim.flow === "yellow";
  const order = { true: 0, unknown: 1, false: 2 } as const;
  const checks = [...claim.checklist].sort((a, b) => order[a.result] - order[b.result]);
  // The limit in force: the session's v2 limit once v2 is released, otherwise the live v1 rule.
  const liveLimit = state.gateOpen ? state.quoteLimit : (quoteLimitOf(v1Rules) ?? state.quoteLimit);
  const sug = yellow ? suggestion(claim, liveLimit) : null;
  const reviewed = claim.ui_status === "reviewed";
  const quote = quoteOf(claim);
  // How far the quote is from each version's limit, so a claim just over the new limit reads as "EUR 1 over".
  const margins = quoteMargins(claim.facts.quote_eur, {
    v1: quoteLimitOf(v1Rules),
    v2: quoteLimitOf(state.draftRules),
  });
  const step = nextStep(claim, state.log);

  const confirm = () => {
    if (locked || reviewed || mode !== "view" || !state.reviewer.trim()) return;
    const timestamp = new Date().toISOString();
    const previousStatus = claim.ui_status;
    dispatch({ type: "confirm", case_id: claim.case_id, timestamp });
    setConfirmation({ timestamp, caseId: claim.case_id, previousStatus });
    toast.success(CONFIRM_TOAST, {
      duration: 6000,
      action: {
        label: REVIEW_COPY.undo,
        onClick: () => {
          dispatch({
            type: "undoConfirm",
            case_id: claim.case_id,
            confirmationTimestamp: timestamp,
            timestamp: new Date().toISOString(),
            previousStatus,
          });
          toast.success(REVIEW_COPY.undone);
          setConfirmation(null);
        },
      },
    });
  };

  const draft = draftEmail(claim);
  const mailHref = mailtoHref(claim.contact?.email, draft);
  const callHref = telHref(claim.contact?.phone);
  const sent = step.label === "Email sent, waiting for reply";
  const drafted = step.label === "Information request drafted";

  const prepareInfo = () => {
    if (locked) return;
    dispatch({ type: "prepareInfo", case_id: claim.case_id, timestamp: new Date().toISOString() });
  };
  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftAsText(draft));
      return true;
    } catch {
      return false;
    }
  };
  // Opens the reviewer's mail program with the draft. When the link would be too long to rely on, the text is copied instead.
  const sendDraft = async () => {
    if (locked) return;
    prepareInfo();
    if (mailHref) {
      window.location.href = mailHref;
      return;
    }
    const ok = await copyDraft();
    toast(
      ok
        ? "Draft is too long for a mail link. Copied instead."
        : "Draft is too long for a mail link. Copy it from the draft below.",
    );
  };
  const markSent = () => {
    if (locked || sent) return;
    prepareInfo();
    dispatch({ type: "markInfoSent", case_id: claim.case_id, timestamp: new Date().toISOString() });
    toast.success("Marked as sent");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 shadow-sheet sm:max-w-[680px]"
        onCloseAutoFocus={(event) => {
          if (onReturnFocus) {
            event.preventDefault();
            onReturnFocus();
          }
        }}
        onKeyDown={(event) => {
          const target = event.target;
          if (
            event.key === "Enter" &&
            !(
              target instanceof HTMLElement &&
              target.closest(
                "button, input, textarea, select, summary, a, [role=radio], [contenteditable=true]",
              )
            )
          ) {
            event.preventDefault();
            confirm();
          }
        }}
      >
        {/* Header, always visible: who, what it is about, and what the rules decided */}
        <div className="flex-1 overflow-y-auto">
          {/* Overview: the four things a handler needs first, stacked in reading order */}
          <section aria-label="Case overview" className="border-b border-border px-6 pb-2 pt-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-16">
              <SheetTitle className="font-mono text-xl font-semibold">{claim.case_id}</SheetTitle>
              <FlowBadge rec={claim.recommendation_v1} />
              <StatusChip status={claim.case_status} />
              {reviewed && (
                <Chip tone="outline">
                  <Check className="size-3" aria-hidden />
                  {REVIEW_COPY.reviewed}
                </Chip>
              )}
            </div>

            <dl className="mt-6 divide-y divide-border border-t border-border">
              <div className="grid gap-1 py-4 sm:grid-cols-[112px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                <dd className="text-sm">
                  <SheetDescription className="text-sm text-foreground">
                    {claim.claim_summary || NOT_PROVIDED}
                  </SheetDescription>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Repair quote{" "}
                    {quote === null ? (
                      <NotProvided />
                    ) : (
                      <span className="tnum font-medium text-foreground">{eur(quote)}</span>
                    )}
                  </p>
                </dd>
              </div>

              <div className="grid gap-1 py-4 sm:grid-cols-[112px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">Reason</dt>
                <dd className="text-sm">
                  <p className="font-medium">{shortReason(claim, state.log)}</p>
                  {margins.length > 0 && (
                    <p className="mt-1 text-xs text-text-2">Quote: {margins.join("; ")}.</p>
                  )}
                  {!locked && claim.needs_recheck && (
                    <p className="mt-1 text-xs text-text-2">
                      Under draft v2 this becomes{" "}
                      <FlowBadge rec={claim.recommendation_v2} size="sm" />
                    </p>
                  )}
                </dd>
              </div>

              <div className="grid gap-1 py-4 sm:grid-cols-[112px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">Next step</dt>
                <dd className="min-w-0 space-y-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {step.kind === "done" && (
                        <Check
                          className="mr-1 inline size-3.5 -translate-y-px text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      {step.label}
                    </p>
                    {step.timestamp && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recorded {shortDate(step.timestamp)}
                      </p>
                    )}
                  </div>

                  {!locked && yellow && (
                    <div className="space-y-3">
                      <p className="text-text-2">
                        {sent
                          ? "Waiting for the customer to reply."
                          : "Information is missing. A request is drafted."}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {drafted && !sent ? (
                          <>
                            <Button onClick={markSent}>
                              <Check aria-hidden /> Mark as sent
                            </Button>
                            <Button variant="outline" onClick={sendDraft}>
                              <Mail aria-hidden /> Open email again
                            </Button>
                          </>
                        ) : (
                          <Button variant={sent ? "outline" : "default"} onClick={sendDraft}>
                            <Mail aria-hidden /> {sent ? "Open email again" : "Send drafted email"}
                          </Button>
                        )}
                        {callHref ? (
                          <Button variant="outline" asChild>
                            <a href={callHref}>
                              <Phone aria-hidden /> Call {claim.contact?.phone}
                            </a>
                          </Button>
                        ) : (
                          <WhyDisabled disabled reason="No phone number on file">
                            <Button variant="outline" disabled>
                              <Phone aria-hidden /> Call
                            </Button>
                          </WhyDisabled>
                        )}
                        <CopyButton
                          text={draftAsText(draft)}
                          label="Copy email"
                          onCopy={prepareInfo}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {claim.contact?.email
                          ? `To: ${claim.contact.email}`
                          : "No recipient on file. Add it in your mail app."}{" "}
                        {INFO_FOOTNOTE}
                      </p>
                      <div>
                        <pre
                          className={cn(
                            "whitespace-pre-wrap bg-surface p-3 font-sans text-sm text-text-2",
                            !draftOpen && "line-clamp-6",
                          )}
                        >
                          {draftAsText(draft)}
                        </pre>
                        <button
                          type="button"
                          onClick={() => setDraftOpen(!draftOpen)}
                          aria-expanded={draftOpen}
                          className="touch-target mt-1 text-xs font-medium underline underline-offset-4 hover:text-text-2"
                        >
                          {draftOpen ? "Show less" : "Show full email"}
                        </button>
                      </div>
                    </div>
                  )}

                  {!locked && claim.flow === "red" && (
                    <div className="space-y-2">
                      <p className="text-text-2">
                        Review the checks, then confirm or change the recommendation.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpenItems((v) => (v.includes("why") ? v : [...v, "why"]))}
                      >
                        Open checklist
                      </Button>
                    </div>
                  )}

                  {!locked && claim.flow === "green" && (
                    <p className="text-text-2">Nothing is missing and no rule raised a concern.</p>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <div className="px-6 py-4">
            {locked && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-2">
                <Lock className="size-4 shrink-0" aria-hidden /> {LOCKED_BANNER}
              </div>
            )}

            {mode === "override" ? (
              <section className="py-2">
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
                <Accordion
                  type="multiple"
                  className="w-full"
                  value={openItems}
                  onValueChange={setOpenItems}
                >
                  <AccordionItem value="why" className={SECTION}>
                    <AccordionTrigger className={TRIGGER}>{REVIEW_COPY.why}</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <PolicyStamp version={claim.policy_version} hash={claim.policy_hash} />
                        <RuleChips rule={claim.rule_v1} />
                      </div>
                      <p className="text-text-2">{claim.explanation}</p>
                      {sug && (
                        <div className="rounded-lg border border-border bg-surface p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold">
                              One question that would change the outcome
                            </h4>
                            <Chip tone="outline">{RULE_BASED}</Chip>
                          </div>
                          <p className="mt-2 text-sm font-medium">{sug.title}</p>
                          <p className="mt-1 text-sm text-text-2">{sug.outcomes}</p>
                        </div>
                      )}
                      <ul className="space-y-2">
                        {checks.map((c) => (
                          <li
                            key={c.id}
                            className={cn(
                              "rounded-lg border p-3",
                              c.result === "unknown"
                                ? "border-unknown/30 bg-unknown-tint"
                                : "border-border bg-background",
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="w-20 shrink-0">
                                <TriGlyph result={c.result} outcome={c.outcome} />
                              </span>
                              <span className="text-sm">{c.description}</span>
                              <span className="ml-auto">
                                <FlowBadge rec={c.outcome} size="sm" />
                              </span>
                            </div>
                            <div className="mt-2 rounded-md bg-surface px-2 py-1 font-mono text-xs leading-5 text-text-2">
                              {c.evidence}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="facts" className={SECTION}>
                    <AccordionTrigger className={TRIGGER}>All case information</AccordionTrigger>
                    <AccordionContent>
                      <dl className="grid gap-x-6 sm:grid-cols-2">
                        {Object.entries(claim.facts).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm"
                          >
                            <dt className="text-xs text-muted-foreground">{fieldLabel(k)}</dt>
                            <dd className="tnum min-w-0 break-words text-right">
                              <FactValue k={k} v={v} blank={claim.blank_fields.includes(k)} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="memory" className={SECTION}>
                    <AccordionTrigger className={TRIGGER}>Decision memory</AccordionTrigger>
                    <AccordionContent>
                      <DecisionMemory caseId={claim.case_id} />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="connections" className={SECTION}>
                    <AccordionTrigger className={TRIGGER}>Connections</AccordionTrigger>
                    <AccordionContent className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-medium">HubSpot</h4>
                        <p className="text-sm text-muted-foreground">
                          Planned: sync this case to your CRM
                        </p>
                      </div>
                      <WhyDisabled disabled reason="Not available in this demo">
                        <Button variant="outline" size="sm" disabled>
                          <Plug aria-hidden /> Connect
                        </Button>
                      </WhyDisabled>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
          </div>
        </div>

        {mode === "view" && (
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-background px-6 py-4">
            <p className="mb-3 text-xs text-muted-foreground">{REVIEW_COPY.audit}</p>
            <div className="flex flex-wrap items-center gap-2">
              <WhyDisabled
                disabled={locked || reviewed}
                reason={locked ? LOCKED_TOOLTIP : "Already confirmed"}
              >
                <Button
                  variant={yellow && !sent ? "outline" : "default"}
                  disabled={locked || reviewed || !state.reviewer.trim()}
                  onClick={confirm}
                >
                  <Check aria-hidden /> {confirmAction(claim.recommendation_v1)}
                </Button>
              </WhyDisabled>
              <WhyDisabled disabled={locked} reason={LOCKED_TOOLTIP}>
                <Button variant="outline" disabled={locked} onClick={() => setMode("override")}>
                  <GitBranch aria-hidden /> {OVERRIDE_REC}
                </Button>
              </WhyDisabled>
              {confirmation?.caseId === claim.case_id && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    dispatch({
                      type: "undoConfirm",
                      case_id: confirmation.caseId,
                      confirmationTimestamp: confirmation.timestamp,
                      timestamp: new Date().toISOString(),
                      previousStatus: confirmation.previousStatus,
                    });
                    setConfirmation(null);
                    toast.success(REVIEW_COPY.undone);
                  }}
                >
                  {REVIEW_COPY.undo}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
