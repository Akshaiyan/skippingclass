import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Pause, Pencil, Plus, RotateCcw, Rocket, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Condition, PolicyDecision, PolicyRule, Rec } from "@/types";
import { ADD_RULE, CONSISTENCY_CAPTION, HOLD_V2, REC_LABEL, REC_ORDER, RELEASE_V2 } from "@/copy";
import { useStore, type QuoteLimit } from "@/store";
import { conditionChips, diffLines, exhaustiveChecks, flipList, removedRules, ruleStatus } from "@/lib/report";
import { validateGate } from "@/lib/guards";
import { BUSINESS_CASE as BC } from "@/data/businessCase";
import { cn } from "@/lib/utils";
import { Chip, EvidenceChip, FlowBadge, PageHeader, PolicyStamp, Refusal, RuleChips, SectionTitle, WhyDisabled } from "@/components/status";
import { ConditionBuilder, emptyLeaf } from "@/components/ConditionBuilder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy change · Motor claims triage" },
      { name: "description", content: "Edit draft rules and see exactly which stored claims change before anything goes live." },
      { property: "og:title", content: "Policy change · Motor claims triage" },
      { property: "og:description", content: "Policy as criteria: a live impact report and a four-eyes release gate." },
    ],
  }),
  component: PolicyPage,
});

const AUTHOR = "Lena Vogt";

function RuleDialog({ rule, open, onClose, onSave, existingIds }: { rule: PolicyRule | null; open: boolean; onClose: () => void; onSave: (r: PolicyRule, prevId?: string) => void; existingIds: string[] }) {
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
        <DialogDescription>Edits stay in this session&apos;s draft. Nothing is released until a second person signs off.</DialogDescription>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="r-id">Rule id</Label>
              <Input id="r-id" className="mt-1.5 font-mono" value={draft.id} disabled={fixed} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
              {idErr && <Refusal>{idErr}</Refusal>}
            </div>
            <div>
              <Label htmlFor="r-out">Outcome</Label>
              <select id="r-out" disabled={fixed} className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value as Rec })}>
                {REC_ORDER.map((r) => (
                  <option key={r} value={r}>{REC_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="r-desc">Plain-English description</Label>
            <Input id="r-desc" className="mt-1.5" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div>
            <Label>Condition</Label>
            <div className="mt-1.5">
              {fixed ? (
                <p className="rounded-md bg-surface p-3 text-sm text-muted-foreground">Fixed fallback: applies when no other rule fires or is undecidable.</p>
              ) : (
                <ConditionBuilder value={draft.condition ?? emptyLeaf()} onChange={(c: Condition) => setDraft({ ...draft, condition: c })} />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <WhyDisabled disabled={!!idErr} reason={idErr ?? undefined}>
            <Button disabled={!!idErr} onClick={() => onSave({ ...draft, id: draft.id.trim() }, prevId)}>
              <Check aria-hidden /> Save to draft
            </Button>
          </WhyDisabled>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyPage() {
  const { state, dispatch, derived, v1Rules, v1Hash, draftHash } = useStore();
  const rules = state.draftRules;
  const [editing, setEditing] = useState<{ rule: PolicyRule; key: number } | null>(null);
  const [approver, setApprover] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);

  const flips = useMemo(() => flipList(derived), [derived]);
  const checks = useMemo(() => exhaustiveChecks(state.claims, v1Rules, rules), [state.claims, v1Rules, rules]);
  const diff = useMemo(() => diffLines(v1Rules, rules), [v1Rules, rules]);
  const removed = removedRules(v1Rules, rules);
  const allPass = checks.every((c) => c.pass);
  const towardRoutine = flips.some((f) => f.towardRoutine);
  const gate = validateGate({ author: AUTHOR, approver, reason, checksPass: allPass });

  const openFlips = flips.filter((f) => f.status === "recheck");
  const intoReview = openFlips.filter((f) => f.to === "human_review").length;
  const openCount = derived.filter((c) => c.case_status === "open").length;
  const recheckMin: [number, number] = [openFlips.length * BC.minutesPerRecheck[0], openFlips.length * BC.minutesPerRecheck[1]];
  const allMin: [number, number] = [openCount * BC.minutesPerRecheck[0], openCount * BC.minutesPerRecheck[1]];
  const addedMin: [number, number] = [intoReview * BC.addedMinutesPerHumanReview[0], intoReview * BC.addedMinutesPerHumanReview[1]];

  const fixedLast = [...rules.filter((r) => r.id !== "R3.routine"), ...rules.filter((r) => r.id === "R3.routine")];

  const save = (r: PolicyRule, prevId?: string) => {
    const next = prevId ? rules.map((x) => (x.id === prevId ? r : x)) : [...rules.filter((x) => x.id !== "R3.routine"), r, ...rules.filter((x) => x.id === "R3.routine")];
    dispatch({ type: "setRules", rules: next });
    setEditing(null);
  };

  const decide = (type: PolicyDecision["type"]) => {
    setTouched(true);
    if (type === "policy_approved" ? !gate.canRelease : !gate.canHold) return;
    const record: PolicyDecision = { type, actor: approver.trim(), reason: reason.trim(), policy_version: "v2", policy_hash: draftHash, timestamp: new Date().toISOString() };
    dispatch({ type: "policyDecision", record });
    setDecision(record);
  };

  const quoteRule = rules.find((r) => r.id === "R1.quote_over_limit");
  const releaseReason = !allPass ? "All exhaustive checks must pass" : gate.approverErr ?? gate.reasonErr ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy change"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Editing draft v2 (based on v1) <PolicyStamp version="v1" hash={v1Hash} /> <ArrowRight className="size-3.5" aria-hidden /> <PolicyStamp version="v2" hash={draftHash} />
            <span className="text-xs">Changes are kept for this session only</span>
          </span>
        }
        action={
          <WhyDisabled disabled={!gate.canRelease} reason={releaseReason}>
            <Button disabled={!gate.canRelease} onClick={() => decide("policy_approved")}>
              <Rocket aria-hidden /> {RELEASE_V2}
            </Button>
          </WhyDisabled>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-5">
          <div className="card-panel p-4">
            <div className="eyebrow mb-2">What-if sweep</div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Quote limit</span>
              <div role="radiogroup" aria-label="Quote limit" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                {([1000, 1200, 1500] as QuoteLimit[]).map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={state.quoteLimit === l}
                    disabled={!quoteRule}
                    onClick={() => dispatch({ type: "setQuoteLimit", limit: l })}
                    className={cn("tnum rounded-md px-3 py-1.5 text-xs font-medium transition-colors", state.quoteLimit === l ? "bg-background shadow-card" : "text-text-2 hover:text-foreground")}
                  >
                    {l.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Rules, in order</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => dispatch({ type: "resetDraft" })}>
                <RotateCcw aria-hidden /> Reset draft to v1
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing({ rule: { id: "R1.custom", outcome: "human_review", description: "", condition: emptyLeaf() }, key: Date.now() })}>
                <Plus aria-hidden /> {ADD_RULE}
              </Button>
            </div>
          </div>

          <ol className="space-y-2">
            {fixedLast.map((r) => {
              const st = ruleStatus(v1Rules, r);
              return (
                <li key={r.id} className="card-panel group p-4 transition-colors hover:border-border-strong">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium">{r.id}</span>
                    <FlowBadge rec={r.outcome} size="sm" />
                    {st === "changed" && <Chip tone="solid">Changed</Chip>}
                    {st === "added" && <Chip tone="solid">Added</Chip>}
                  </div>
                  <p className="mt-1.5 text-sm text-text-2">{r.description || <span className="italic text-muted-foreground">No description</span>}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {conditionChips(r.condition).map((t, i) => (
                      <span key={i} className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">{r.id === "R3.routine" ? "Otherwise: routine processing" : t}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing({ rule: r, key: Date.now() })}>
                      <Pencil aria-hidden /> Edit
                    </Button>
                    {r.id === "R3.routine" ? (
                      <WhyDisabled disabled reason="The fallback rule is fixed and cannot be deleted">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled>
                          <Trash2 aria-hidden /> Delete
                        </Button>
                      </WhyDisabled>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <Trash2 aria-hidden /> Delete
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 space-y-3 text-sm">
                          <p>Remove <span className="font-mono text-xs">{r.id}</span> from the draft?</p>
                          <Button size="sm" variant="destructive" onClick={() => dispatch({ type: "setRules", rules: rules.filter((x) => x.id !== r.id) })}>
                            <Trash2 aria-hidden /> Delete rule
                          </Button>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </li>
              );
            })}
            {removed.map((r) => (
              <li key={r.id} className="rounded-lg border border-dashed border-border p-4 opacity-70">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs line-through">{r.id}</span>
                  <Chip tone="outline">Removed</Chip>
                </div>
                <p className="mt-1 text-sm line-through text-muted-foreground">{r.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-6 lg:col-span-7">
          <div className="card-panel p-5">
            <SectionTitle title="What changes" />
            {diff.length ? (
              <ul className="space-y-1.5 text-sm">
                {diff.map((d) => (
                  <li key={d} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-foreground" aria-hidden />{d}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">The draft matches v1.</p>
            )}
          </div>

          <div className="card-panel p-5">
            <SectionTitle
              title="Impact on stored claims"
              subtitle={`${flips.length} of ${derived.length} claims change · ${openFlips.length} open flagged for recheck · ${flips.length - openFlips.length} locked, kept`}
            />
            {flips.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No stored claims change under this draft.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left">
                      {["Case", "Change", "Caused by", "Status"].map((h) => (
                        <th key={h} className="eyebrow border-b border-border py-2 pr-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flips.map((f) => (
                      <tr key={f.claim.case_id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs font-medium">{f.claim.case_id}</td>
                        <td className="py-2.5 pr-3">
                          {f.status === "locked" ? (
                            <span className="inline-flex items-center gap-1.5"><FlowBadge rec={f.from} size="sm" /><span className="text-xs text-muted-foreground">unchanged</span></span>
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1"><FlowBadge rec={f.from} size="sm" /><ArrowRight className="size-3 text-muted-foreground" aria-label="to" /><FlowBadge rec={f.to} size="sm" /></span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3"><RuleChips rule={f.cause} /></td>
                        <td className="py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {f.status === "locked" ? <Chip>Locked, kept</Chip> : <Chip tone="outline">Flagged for recheck</Chip>}
                            {f.towardRoutine && <Chip tone="amber">Needs named sign-off</Chip>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card-panel p-5">
            <SectionTitle title="Exhaustive checks" right={<span className="tnum text-xs text-muted-foreground">{checks.filter((c) => c.pass).length}/5 passing</span>} />
            <ul className="divide-y divide-border">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-3 py-2.5">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.pass ? "bg-flow-green-tint text-flow-green" : "bg-flow-red-tint text-flow-red")}>
                    {c.pass ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {c.label} <span className="sr-only">{c.pass ? "passing" : "failing"}</span>
                      <span className={cn("ml-2 text-xs font-normal", c.pass ? "text-muted-foreground" : "text-destructive")}>{c.pass ? "Passing" : "Failing"}</span>
                    </div>
                    <div className={cn("text-xs", c.message ? "text-destructive" : "text-muted-foreground")}>{c.message ?? c.explain}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card-panel p-5 sm:col-span-2">
              <SectionTitle title="Before / after on labelled cases" />
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-surface p-4">
                  <div className="eyebrow">v1</div>
                  <div className="tnum mt-1 text-2xl font-medium">{BC.labelled.v1} of {BC.labelled.total}</div>
                  <div className="text-xs text-muted-foreground">consistent with reviewer labels</div>
                </div>
                <div className="rounded-lg bg-surface p-4">
                  <div className="eyebrow">v2</div>
                  <div className="tnum mt-1 text-2xl font-medium">{BC.labelled.v2} of {BC.labelled.total}</div>
                  <div className="text-xs text-muted-foreground">consistent with reviewer labels</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{CONSISTENCY_CAPTION}</p>
            </div>

            <div className="card-panel p-5 sm:col-span-2">
              <SectionTitle title="Predicted cost impact" subtitle={`${BC.minutesPerRecheck[0]} to ${BC.minutesPerRecheck[1]} min per recheck`} />
              <dl className="divide-y divide-border text-sm">
                {[
                  { k: `Recheck effort for this change (${openFlips.length} flipped open claims)`, v: `${recheckMin[0]} to ${recheckMin[1]} min`, l: "DERIVED" as const },
                  { k: `Re-reviewing all ${openCount} open claims by hand`, v: `${allMin[0]} to ${allMin[1]} min`, l: "DERIVED" as const },
                  { k: "Saved by targeted recheck", v: `${allMin[0] - recheckMin[0]} to ${allMin[1] - recheckMin[1]} min`, l: "DERIVED" as const },
                  { k: `Added reviewer time (${intoReview} claims moving into human review)`, v: `+${addedMin[0]} to ${addedMin[1]} min`, l: "ASSUMED" as const },
                ].map((r) => (
                  <div key={r.k} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <dt className="text-text-2">{r.k}</dt>
                    <dd className="tnum flex items-center gap-2 font-medium">{r.v} <EvidenceChip label={r.l} /></dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="card-panel sticky bottom-4 z-10 space-y-4 p-5 shadow-sheet">
            {decision ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden /></span>
                  {decision.type === "policy_approved" ? "Policy released" : "Policy held"}
                </div>
                <pre className="overflow-x-auto rounded-md bg-surface p-3 font-mono text-[12px] leading-5 text-text-2">{JSON.stringify(decision, null, 2)}</pre>
                <p className="text-xs text-muted-foreground">Nothing is persisted. Reloading resets the draft.</p>
                <Button variant="outline" size="sm" onClick={() => setDecision(null)}>Done</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">Gate and commit</h2>
                  <Chip tone={state.gateOpen ? "solid" : "outline"}>Release gate: {state.gateOpen ? "OPEN" : "CLOSED"}</Chip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="g-author">Author</Label>
                    <Input id="g-author" className="mt-1.5" value={AUTHOR} readOnly disabled />
                  </div>
                  <div>
                    <Label htmlFor="g-appr">Approver</Label>
                    <Input id="g-appr" className="mt-1.5" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="A different person" />
                    {(touched || approver) && gate.approverErr && <Refusal>{gate.approverErr}</Refusal>}
                  </div>
                </div>
                <div>
                  <Label htmlFor="g-reason">{towardRoutine ? "Named sign-off for flips toward routine" : "Sign-off reason"}</Label>
                  <Textarea id="g-reason" className="mt-1.5" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this draft should or should not go live" />
                  {touched && gate.reasonErr && <Refusal>{gate.reasonErr}</Refusal>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <WhyDisabled disabled={!gate.canRelease} reason={releaseReason}>
                    <Button disabled={!gate.canRelease} onClick={() => decide("policy_approved")}>
                      <Rocket aria-hidden /> {RELEASE_V2}
                    </Button>
                  </WhyDisabled>
                  <WhyDisabled disabled={!gate.canHold} reason={gate.approverErr ?? gate.reasonErr ?? undefined}>
                    <Button variant="outline" disabled={!gate.canHold} onClick={() => decide("policy_rejected")}>
                      <Pause aria-hidden /> {HOLD_V2}
                    </Button>
                  </WhyDisabled>
                  <span className="text-xs text-muted-foreground">Nothing is persisted. Reloading resets the draft.</span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {editing && (
        <RuleDialog key={editing.key} rule={editing.rule} open onClose={() => setEditing(null)} onSave={save} existingIds={rules.map((r) => r.id)} />
      )}
    </div>
  );
}
