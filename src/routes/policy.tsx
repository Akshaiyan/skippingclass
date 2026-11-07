import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Pause, Pencil, Plus, RotateCcw, Rocket, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { Condition, PolicyDecision, PolicyRule, Rec } from "@/types";
import { ADD_RULE, HOLD_V2, REC_LABEL, REC_ORDER, RELEASE_V2, RULE_BASED } from "@/copy";
import { useStore } from "@/store";
import { exhaustiveChecks, flipList, ruleStatus } from "@/lib/report";
import { validateGate } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { Chip, FlowBadge, PageHeader, PolicyStamp, Refusal, WhyDisabled } from "@/components/status";
import { ConditionBuilder, emptyLeaf } from "@/components/ConditionBuilder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy overview · Motor claims triage" },
      { name: "description", content: "Edit and activate draft rules while expected claim volume updates live." },
      { property: "og:title", content: "Policy overview · Motor claims triage" },
      { property: "og:description", content: "A clear rule overview with live claim-volume impact and named sign-off." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PolicyPage,
});

const AUTHOR = "Lena Vogt";
const CHART_LABEL: Record<Rec, string> = {
  human_review: "Human review",
  request_information: "Request info",
  routine_processing: "Routine",
};

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
        <DialogDescription>The chart updates when you save.</DialogDescription>
        <div className="space-y-4">
          <div>
            <Label htmlFor="r-desc">Rule name</Label>
            <Input id="r-desc" className="mt-1.5" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
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
            <Label>Condition</Label>
            <div className="mt-1.5">
              {fixed ? (
                <p className="rounded-md bg-surface p-3 text-sm text-muted-foreground">Applies when no other rule decides the claim.</p>
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

function VolumeTip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-panel px-3 py-2 text-xs">
      {payload.map((p) => (
        <div key={p.name} className="tnum flex justify-between gap-5 text-text-2">
          <span>{p.name}</span>
          <span className="font-medium text-foreground">{p.value} claims</span>
        </div>
      ))}
    </div>
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
  const allPass = checks.every((c) => c.pass);
  const towardRoutine = flips.some((f) => f.towardRoutine);
  const gate = validateGate({ author: AUTHOR, approver, reason, checksPass: allPass });
  const openFlips = flips.filter((f) => f.status === "recheck");
  const visibleRules = rules.filter((r) => r.id !== "R3.routine");
  const activeCount = visibleRules.filter((r) => r.active !== false).length;

  const chartData = useMemo(() => REC_ORDER.map((rec) => ({
    name: CHART_LABEL[rec],
    current: derived.filter((c) => c.case_status === "open" && c.recommendation_v1 === rec).length,
    draft: derived.filter((c) => c.case_status === "open" && c.recommendation_v2 === rec).length,
  })), [derived]);
  const chartMax = Math.max(1, ...chartData.flatMap((d) => [d.current, d.draft])) + 1;
  const chartTicks = Array.from({ length: chartMax + 1 }, (_, i) => i);

  const save = (r: PolicyRule, prevId?: string) => {
    const next = prevId ? rules.map((x) => (x.id === prevId ? r : x)) : [...rules.filter((x) => x.id !== "R3.routine"), r, ...rules.filter((x) => x.id === "R3.routine")];
    dispatch({ type: "setRules", rules: next });
    setEditing(null);
  };

  const toggleRule = (id: string) => {
    dispatch({ type: "setRules", rules: rules.map((r) => r.id === id ? { ...r, active: r.active === false } : r) });
  };

  const decide = (type: PolicyDecision["type"]) => {
    setTouched(true);
    if (type === "policy_approved" ? !gate.canRelease : !gate.canHold) return;
    const record: PolicyDecision = { type, actor: approver.trim(), reason: reason.trim(), policy_version: "v2", policy_hash: draftHash, timestamp: new Date().toISOString() };
    dispatch({ type: "policyDecision", record });
    setDecision(record);
  };

  const quoteRule = rules.find((r) => r.id === "R1.quote_over_limit");
  const [limitText, setLimitText] = useState(String(state.quoteLimit));
  useEffect(() => {
    setLimitText((t) => (Number(t) === state.quoteLimit ? t : String(state.quoteLimit)));
  }, [state.quoteLimit]);
  const commitLimit = (v: string) => {
    setLimitText(v);
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n) && n >= 0) dispatch({ type: "setQuoteLimit", limit: Math.round(n) });
  };
  const releaseReason = !allPass ? "All exhaustive checks must pass" : gate.approverErr ?? gate.reasonErr ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy overview"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PolicyStamp version="v1" hash={v1Hash} /> <ArrowRight className="size-3.5" aria-hidden /> <PolicyStamp version="v2" hash={draftHash} />
            <span className="text-xs">Session only</span>
          </span>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-5" aria-labelledby="rules-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="rules-title" className="section-title">Rules, in order</h2>
              <p className="tnum text-xs text-muted-foreground">{activeCount} of {visibleRules.length} active</p>
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "resetDraft" })}>
                <RotateCcw aria-hidden /> Reset
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing({ rule: { id: "R1.custom", outcome: "human_review", description: "", condition: emptyLeaf(), active: true }, key: Date.now() })}>
                <Plus aria-hidden /> {ADD_RULE}
              </Button>
            </div>
          </div>

          <div className="card-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <label htmlFor="quote-limit" className="text-sm font-medium">Quote limit</label>
            <span className="relative inline-flex items-center">
              <span className="pointer-events-none absolute left-2.5 font-mono text-xs text-muted-foreground">EUR</span>
              <input
                id="quote-limit"
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                disabled={!quoteRule}
                value={limitText}
                onChange={(e) => commitLimit(e.target.value)}
                className="tnum h-8 w-32 rounded-md border border-border bg-background pl-11 pr-2 font-mono text-xs hover:border-border-strong focus:border-border-strong focus:outline-none"
              />
            </span>
          </div>

          <ol className="space-y-2">
            {visibleRules.map((r, index) => {
              const st = ruleStatus(v1Rules, r);
              const active = r.active !== false;
              return (
                <li key={r.id} className={cn("card-panel p-4 transition-colors hover:border-border-strong", !active && "bg-surface")}>
                  <div className="flex items-start gap-3">
                    <span className="tnum mt-0.5 w-5 shrink-0 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className={cn("text-sm font-medium leading-5", !active && "text-muted-foreground")}>{r.description || "Untitled rule"}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <FlowBadge rec={r.outcome} size="sm" />
                        {st === "changed" && <Chip tone="solid">Changed</Chip>}
                        {st === "added" && <Chip tone="solid">Added</Chip>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Label htmlFor={`active-${r.id}`} className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</Label>
                      <Switch
                        id={`active-${r.id}`}
                        checked={active}
                        aria-label={`${active ? "Deactivate" : "Activate"} ${r.description}`}
                        onCheckedChange={() => toggleRule(r.id)}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1.5 border-t border-border pt-3">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing({ rule: r, key: Date.now() })}>
                      <Pencil aria-hidden /> Edit
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          <Trash2 aria-hidden /> Delete
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 space-y-3 text-sm">
                        <p>Remove this rule from the draft?</p>
                        <Button size="sm" variant="destructive" onClick={() => dispatch({ type: "setRules", rules: rules.filter((x) => x.id !== r.id) })}>
                          <Trash2 aria-hidden /> Delete rule
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="space-y-4 lg:col-span-7" aria-labelledby="impact-title">
          <div className="card-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="impact-title" className="section-title">Expected claim volume</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Open stored claims · {RULE_BASED.toLowerCase()}</p>
              </div>
              <div className="text-right" aria-live="polite" aria-atomic="true">
                <div className="tnum text-2xl font-medium">{openFlips.length}</div>
                <div className="text-xs text-muted-foreground">open claims change</div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-2" aria-hidden />Current</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" aria-hidden />Draft</span>
            </div>
            <div className="mt-1 h-64 w-full" role="img" aria-label={chartData.map((d) => `${d.name}: current ${d.current}, draft ${d.draft}`).join(". ")}>
              <ResponsiveContainer>
                <BarChart data={chartData} barGap={5} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" interval={0} tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis domain={[0, chartMax]} ticks={chartTicks} allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <ChartTooltip cursor={{ fill: "var(--surface)" }} content={<VolumeTip />} />
                  <Bar isAnimationActive={false} dataKey="current" name="Current" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={42} />
                  <Bar isAnimationActive={false} dataKey="draft" name="Draft" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </section>
      </div>

      <section className="card-panel p-5" aria-labelledby="release-title">
        {decision ? (
          <div className="flex flex-wrap items-center justify-between gap-4" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden /></span>
              {decision.type === "policy_approved" ? "Policy released" : "Policy held"}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDecision(null)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="release-title" className="section-title">Review and release</h2>
              <details className="text-xs">
                <summary className="tnum cursor-pointer font-medium text-text-2">{checks.filter((c) => c.pass).length}/5 checks passing</summary>
                <ul className="mt-3 space-y-2 rounded-lg bg-surface p-3">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      {c.pass ? <Check className="mt-0.5 size-3.5 shrink-0 text-flow-green" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />}
                      <span>{c.label} <span className={cn("ml-1", c.pass ? "text-muted-foreground" : "text-destructive")}>{c.pass ? "Passing" : c.message ?? "Failing"}</span></span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
          </div>
        )}
      </section>

      {editing && (
        <RuleDialog key={editing.key} rule={editing.rule} open onClose={() => setEditing(null)} onSave={save} existingIds={rules.map((r) => r.id)} />
      )}
    </div>
  );
}
