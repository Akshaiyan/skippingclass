// Policy change: rules on the left, their expected effect on open claims on the right, release at the bottom.
// Frontend only: everything is derived from the session's mock rules and claims; nothing is sent to a backend.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Check, ChevronRight, Pause, Pencil, Plus, RotateCcw, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Condition, PolicyDecision, PolicyRule, Rec } from "@/types";
import {
  ADD_RULE,
  FLOW_OF,
  HOLD_V2,
  IMPACT_COPY,
  POLICY_COPY,
  REC_LABEL,
  REC_ORDER,
  RELEASE_V2,
} from "@/copy";
import { PolicyImpact } from "@/components/PolicyImpact";
import { useStore } from "@/store";
import { canOpen } from "@/lib/roles";
import { conditionText, exhaustiveChecks, flipList, removedRules, ruleStatus } from "@/lib/report";
import { changedRuleCount, ruleChangeNote } from "@/lib/policy-view";
import { validateGate } from "@/lib/guards";
import { getAccounts } from "@/data/api";
import { FLOW_DOT } from "@/lib/flow-styles";
import { cn } from "@/lib/utils";
import { Chip, FlowBadge, PolicyStamp, Refusal, WhyDisabled } from "@/components/status";
import { ConditionBuilder } from "@/components/ConditionBuilder";
import { emptyLeaf } from "@/lib/conditions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy change · Motor claims triage" },
      { name: "description", content: "Edit triage rules and preview their expected impact." },
      { property: "og:title", content: "Policy change · Motor claims triage" },
      {
        property: "og:description",
        content: "Edit triage rules and preview their expected impact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PolicyRoute,
});

function RuleDialog({
  rule,
  open,
  onClose,
  onSave,
  existingIds,
}: {
  rule: PolicyRule | null;
  open: boolean;
  onClose: () => void;
  onSave: (r: PolicyRule, prevId?: string) => void;
  existingIds: string[];
}) {
  const [draft, setDraft] = useState<PolicyRule | null>(rule);
  const [prevId] = useState(rule?.id);
  if (!draft) return null;
  const fixed = draft.id === "R3.routine" && prevId === "R3.routine";
  const idTaken = draft.id !== prevId && existingIds.includes(draft.id);
  const idErr = !draft.id.trim() ? "Add a rule id." : idTaken ? "This id is already used." : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogTitle>{prevId ? "Edit rule" : ADD_RULE}</DialogTitle>
        <DialogDescription>The chart updates when you save.</DialogDescription>
        <div className="space-y-4">
          <div>
            <Label htmlFor="r-desc">Rule name</Label>
            <Input
              id="r-desc"
              className="mt-2"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="r-id">Rule id</Label>
              <Input
                id="r-id"
                className="mt-2 font-mono"
                value={draft.id}
                disabled={fixed}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
              {idErr && <Refusal>{idErr}</Refusal>}
            </div>
            <div>
              <Label htmlFor="r-out">Outcome</Label>
              <select
                id="r-out"
                disabled={fixed}
                className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={draft.outcome}
                onChange={(e) => setDraft({ ...draft, outcome: e.target.value as Rec })}
              >
                {REC_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {REC_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Condition</Label>
            <div className="mt-2">
              {fixed ? (
                <p className="rounded-md bg-surface p-3 text-sm text-muted-foreground">
                  Applies when no other rule decides the claim.
                </p>
              ) : (
                <ConditionBuilder
                  value={draft.condition ?? emptyLeaf()}
                  onChange={(c: Condition) => setDraft({ ...draft, condition: c })}
                />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <WhyDisabled disabled={!!idErr} reason={idErr ?? undefined}>
            <Button
              disabled={!!idErr}
              onClick={() => onSave({ ...draft, id: draft.id.trim() }, prevId)}
            >
              <Check aria-hidden /> Save to draft
            </Button>
          </WhyDisabled>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Policy change is limited to operations leads; anyone else is sent to the dashboard. */
function PolicyRoute() {
  const { state } = useStore();
  if (!canOpen(state.user?.role, "/policy")) return <Navigate to="/" replace />;
  return <PolicyPage />;
}

const selectClass =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm hover:border-border-strong focus:border-border-strong focus:outline-none";

function PolicyPage() {
  const { state, dispatch, derived, v1Rules, draftHash } = useStore();
  const rules = state.draftRules;
  const [editing, setEditing] = useState<{ rule: PolicyRule; key: number } | null>(null);
  const [approver, setApprover] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Cross-highlight: a rule card under the pointer lights its claims; a claim row lights its rules.
  const [hoverRule, setHoverRule] = useState<string | null>(null);
  const [hoverClaimRules, setHoverClaimRules] = useState<string[] | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  // The decision for this exact draft comes from the session audit log, so it survives navigation.
  const decision = useMemo(
    () =>
      [...state.log]
        .reverse()
        .find(
          (e): e is PolicyDecision & { seq: number } =>
            (e.type === "policy_approved" || e.type === "policy_rejected") &&
            "policy_hash" in e &&
            e.policy_hash === draftHash,
        ) ?? null,
    [state.log, draftHash],
  );

  const flips = useMemo(
    () => flipList(derived).filter((f) => f.claim.case_status === "open"),
    [derived],
  );
  const checks = useMemo(
    () => exhaustiveChecks(state.claims, v1Rules, rules),
    [state.claims, v1Rules, rules],
  );
  const failingCheck = checks.find((c) => !c.pass);
  const changed = changedRuleCount(v1Rules, rules);
  const intoRoutine = flips.filter((f) => f.towardRoutine).length;
  const released = decision?.type === "policy_approved";
  const showTags = !released;
  // A released draft is the live policy: it can no longer be edited here.
  const locked = released;

  const approvers = getAccounts().filter(
    (a) => a.name.trim().toLowerCase() !== state.reviewer.trim().toLowerCase(),
  );
  const gate = validateGate({
    author: state.reviewer,
    approver,
    reason,
    checksPass: !failingCheck,
  });
  const canRelease = changed > 0 && gate.canRelease;
  const canHold = changed > 0 && gate.canHold && !decision;
  const releaseHelp =
    changed === 0
      ? POLICY_COPY.needChange
      : gate.approverErr || gate.reasonErr
        ? POLICY_COPY.needReasonApprover
        : failingCheck
          ? `${failingCheck.label}: ${failingCheck.message ?? "failing"}`
          : null;

  const visibleRules = rules.filter((r) => r.id !== "R3.routine");
  const removed = removedRules(v1Rules, rules);
  const quoteRule = rules.find((r) => r.id === "R1.quote_over_limit");
  const [limitText, setLimitText] = useState(String(state.quoteLimit));
  useEffect(() => {
    setLimitText((t) => (Number(t) === state.quoteLimit ? t : String(state.quoteLimit)));
  }, [state.quoteLimit]);
  const commitLimit = (v: string) => {
    setLimitText(v);
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n) && n >= 0)
      dispatch({ type: "setQuoteLimit", limit: Math.round(n) });
  };

  // Hovering a claim row scrolls its first rule card into view.
  useEffect(() => {
    const id = hoverClaimRules?.[0];
    if (!id) return;
    document.getElementById(`rule-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hoverClaimRules]);

  const save = (r: PolicyRule, prevId?: string) => {
    const next = prevId
      ? rules.map((x) => (x.id === prevId ? r : x))
      : [
          ...rules.filter((x) => x.id !== "R3.routine"),
          r,
          ...rules.filter((x) => x.id === "R3.routine"),
        ];
    dispatch({ type: "setRules", rules: next });
    setEditing(null);
  };
  const toggleRule = (id: string) =>
    dispatch({
      type: "setRules",
      // Switching back on removes the flag instead of writing active: true, so the rule matches live again.
      rules: rules.map((r) => {
        if (r.id !== id) return r;
        if (r.active !== false) return { ...r, active: false };
        const { active: _off, ...on } = r;
        return on;
      }),
    });
  const addRule = () =>
    setEditing({
      rule: {
        id: "R1.custom",
        outcome: "human_review",
        description: "",
        condition: emptyLeaf(),
        active: true,
      },
      key: Date.now(),
    });

  // Mock decision: recorded in the session's audit log only. Nothing leaves the browser.
  const decide = (type: PolicyDecision["type"]) => {
    if (type === "policy_approved" ? !canRelease : !canHold) return;
    setConfirmOpen(false);
    const record: PolicyDecision = {
      type,
      actor: approver.trim(),
      reason: reason.trim(),
      policy_version: "v2",
      policy_hash: draftHash,
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: "policyDecision", record });
    // A later draft needs its own reason and approver.
    setReason("");
    setApprover("");
    if (type === "policy_approved") toast.success(POLICY_COPY.releasedToast);
    else toast(POLICY_COPY.heldToast);
  };

  const status = released
    ? POLICY_COPY.released
    : changed === 0
      ? POLICY_COPY.noChanges
      : `${POLICY_COPY.rulesChanged(changed)} · ${decision ? POLICY_COPY.statusHeld.toLowerCase() : POLICY_COPY.notReleased}`;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">{POLICY_COPY.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{POLICY_COPY.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={changed === 0 || locked}
              onClick={() => dispatch({ type: "resetDraft" })}
            >
              <RotateCcw aria-hidden /> {POLICY_COPY.discard}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={changed === 0 || released}
              onClick={() => {
                document
                  .getElementById("release-bar")
                  ?.scrollIntoView({ block: "end", behavior: "smooth" });
                reasonRef.current?.focus({ preventScroll: true });
              }}
            >
              {POLICY_COPY.reviewChanges} <ChevronRight aria-hidden />
            </Button>
          </div>
          <p className="tnum text-xs text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* LEFT: rules */}
        <section className="space-y-4 lg:col-span-2" aria-labelledby="rules-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="rules-title" className="section-title">
                {POLICY_COPY.rules}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{POLICY_COPY.rulesHelp}</p>
            </div>
            <Button variant="outline" size="sm" disabled={locked} onClick={addRule}>
              <Plus aria-hidden /> {ADD_RULE}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 border border-border bg-surface px-3 py-2">
            <label htmlFor="quote-limit" className="text-sm font-medium">
              {POLICY_COPY.quoteLimit}
            </label>
            <span className="relative inline-flex items-center">
              <span className="pointer-events-none absolute left-2 text-xs text-muted-foreground">
                €
              </span>
              <input
                id="quote-limit"
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                disabled={!quoteRule || locked}
                value={limitText}
                onChange={(e) => commitLimit(e.target.value)}
                className="tnum h-8 w-28 border border-border bg-background pl-6 pr-2 text-right text-sm hover:border-border-strong focus:border-border-strong focus:outline-none"
              />
            </span>
          </div>

          <ol className="space-y-2">
            {visibleRules.map((r, i) => {
              const st = ruleStatus(v1Rules, r);
              const active = r.active !== false;
              const note = st === "changed" ? ruleChangeNote(v1Rules, r) : null;
              const lit = !!hoverClaimRules?.includes(r.id);
              return (
                <li
                  key={r.id}
                  id={`rule-${r.id}`}
                  onMouseEnter={() => setHoverRule(r.id)}
                  onMouseLeave={() => setHoverRule(null)}
                  className={cn(
                    "border border-border bg-card px-3 py-3 transition-colors",
                    !active && "bg-surface",
                    active && "hover:bg-surface",
                    (lit || hoverRule === r.id) && "border-border-strong",
                    lit && "bg-surface-2",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="tnum w-4 shrink-0 text-right text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium leading-5",
                          !active && "text-muted-foreground",
                        )}
                      >
                        {r.description || "Untitled rule"}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                        <span
                          className={cn("size-2 rounded-full", FLOW_DOT[FLOW_OF[r.outcome]])}
                          aria-hidden
                        />
                        {REC_LABEL[r.outcome]}
                      </p>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {conditionText(r.condition ?? null)}
                      </p>
                      {showTags && (st !== "same" || !active) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {st === "changed" && <Chip tone="solid">{POLICY_COPY.tagChanged}</Chip>}
                          {st === "added" && <Chip tone="solid">{POLICY_COPY.tagAdded}</Chip>}
                          {!active && <Chip tone="outline">{POLICY_COPY.tagInactive}</Chip>}
                          {note && <span className="tnum text-xs text-text-2">{note}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        id={`active-${r.id}`}
                        checked={active}
                        disabled={locked}
                        aria-label={`${active ? "Deactivate" : "Activate"} ${r.description}`}
                        onCheckedChange={() => toggleRule(r.id)}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-1 size-8"
                            disabled={locked}
                            onClick={() => setEditing({ rule: r, key: Date.now() })}
                          >
                            <Pencil aria-hidden />
                            <span className="sr-only">Edit {r.description}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Popover>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                disabled={locked}
                              >
                                <Trash2 aria-hidden />
                                <span className="sr-only">Delete {r.description}</span>
                              </Button>
                            </PopoverTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                        <PopoverContent className="w-64 space-y-3 text-sm">
                          <p>Remove this rule from the draft?</p>
                          <p className="text-xs text-muted-foreground">
                            {POLICY_COPY.discard} restores the live rules.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              dispatch({
                                type: "setRules",
                                rules: rules.filter((x) => x.id !== r.id),
                              })
                            }
                          >
                            <Trash2 aria-hidden /> Delete rule
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {showTags && removed.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {removed.map((r) => (
                <li key={r.id} className="line-through">
                  {POLICY_COPY.removed}: {r.description}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* RIGHT: expectations */}
        <section
          className="border-t border-border pt-8 lg:col-span-3 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          aria-labelledby="impact-title"
        >
          <div className="lg:sticky lg:top-6">
            <PolicyImpact
              released={released}
              highlightRule={hoverRule}
              onHoverRules={setHoverClaimRules}
            />
          </div>
        </section>
      </div>

      {/* BOTTOM: review & release, always in reach */}
      <section
        id="release-bar"
        className="-mx-4 border-t border-border bg-background/95 px-4 py-3 md:sticky md:bottom-0 md:z-10 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8"
        aria-labelledby="release-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="release-title" className="section-title">
            {POLICY_COPY.reviewRelease}
          </h2>
          <span className="inline-flex items-center gap-2 text-xs text-text-2" role="status">
            <span
              className={cn("size-2 rounded-full", released ? "bg-flow-green" : "bg-border-strong")}
              aria-hidden
            />
            {released
              ? POLICY_COPY.statusReleased
              : decision
                ? POLICY_COPY.statusHeld
                : POLICY_COPY.statusNotReleased}
          </span>
        </div>

        {released ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <Check className="size-4" aria-hidden /> {POLICY_COPY.releasedToast}
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_16rem_auto] md:items-end">
            <div>
              <Label htmlFor="g-reason">
                {POLICY_COPY.reasonLabel}{" "}
                <span className="font-normal text-muted-foreground">(required)</span>
              </Label>
              <Input
                id="g-reason"
                ref={reasonRef}
                className="mt-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={POLICY_COPY.reasonPlaceholder}
              />
            </div>
            <div>
              <Label htmlFor="g-appr">{POLICY_COPY.approverLabel}</Label>
              <select
                id="g-appr"
                className={cn(selectClass, "mt-2", !approver && "text-muted-foreground")}
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
              >
                <option value="">{POLICY_COPY.approverPlaceholder}</option>
                {approvers.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 md:justify-end">
              <WhyDisabled
                disabled={!canHold}
                reason={
                  !canHold
                    ? changed === 0
                      ? POLICY_COPY.needChange
                      : decision
                        ? POLICY_COPY.statusHeld
                        : POLICY_COPY.needReasonApprover
                    : undefined
                }
              >
                <Button
                  variant="outline"
                  disabled={!canHold}
                  onClick={() => decide("policy_rejected")}
                >
                  <Pause aria-hidden /> {HOLD_V2}
                </Button>
              </WhyDisabled>
              <WhyDisabled disabled={!canRelease} reason={releaseHelp ?? undefined}>
                <Button disabled={!canRelease} onClick={() => setConfirmOpen(true)}>
                  <Rocket aria-hidden /> {RELEASE_V2}
                </Button>
              </WhyDisabled>
            </div>
            <div className="text-xs text-muted-foreground md:col-span-3" aria-live="polite">
              <span className="tnum">{POLICY_COPY.routedDifferently(flips.length)}</span>
              {intoRoutine > 0 && <span> {POLICY_COPY.intoRoutine(intoRoutine)}</span>}
              {releaseHelp && <span className="ml-1 text-text-2">· {releaseHelp}</span>}
            </div>
          </div>
        )}
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{POLICY_COPY.confirmTitle}</DialogTitle>
          <DialogDescription>
            {POLICY_COPY.routedDifferently(flips.length)} {IMPACT_COPY.locked}
          </DialogDescription>
          <ul className="space-y-2 text-sm">
            {REC_ORDER.map((rec: Rec) => (
              <li key={rec} className="flex items-center justify-between gap-3">
                <FlowBadge rec={rec} />
                <span className="tnum text-muted-foreground">
                  {flips.filter((f) => f.to === rec).length} moving in
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Author</dt>
            <dd>{state.reviewer}</dd>
            <dt className="text-muted-foreground">Second approver</dt>
            <dd>{approver.trim()}</dd>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="break-words">{reason.trim()}</dd>
          </dl>
          <PolicyStamp version="v2" hash={draftHash} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button disabled={!canRelease} onClick={() => decide("policy_approved")}>
              <Rocket aria-hidden /> {RELEASE_V2}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <RuleDialog
          key={editing.key}
          rule={editing.rule}
          open
          onClose={() => setEditing(null)}
          onSave={save}
          existingIds={rules.map((r) => r.id)}
        />
      )}
    </div>
  );
}
