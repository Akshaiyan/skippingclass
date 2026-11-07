import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import type { Claim, ReasonCode, Rec } from "@/types";
import { REASON_LABEL, REC_LABEL, REC_ORDER } from "@/copy";
import { useStore } from "@/store";
import { validateOverride } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { Dot, FlowBadge, PolicyStamp, Refusal, WhyDisabled } from "./status";
import { FLOW_OF } from "@/copy";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReviewerOverride } from "@/types";
import { postOverride } from "@/data/live";

export function OverrideFlow({ claim, initialTarget, onCancel, onDone }: { claim: Claim; initialTarget?: Rec; onCancel: () => void; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const [to, setTo] = useState<Rec | null>(initialTarget && initialTarget !== claim.recommendation_v1 ? initialTarget : null);
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [actor, setActor] = useState(state.reviewer);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<ReviewerOverride | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const errors = validateOverride({ from: claim.recommendation_v1, to, reason, note, actor });
  const valid = Object.keys(errors).length === 0;

  const preview = {
    type: "reviewer_override",
    case_id: claim.case_id,
    actor: actor.trim() || "—",
    from_rec: claim.recommendation_v1,
    to_rec: to ?? "—",
    reason_code: reason ?? "—",
    note: note.trim() || "—",
    policy_version: claim.policy_version,
    policy_hash: claim.policy_hash,
    timestamp: "set on submit, UTC",
  };

  const submit = () => {
    setTouched(true);
    if (!valid || !to || !reason || sending || claim.case_status === "closed") return;
    const timestamp = new Date().toISOString();
    const record: ReviewerOverride = {
      type: "reviewer_override",
      case_id: claim.case_id,
      actor: actor.trim(),
      from_rec: claim.recommendation_v1,
      to_rec: to,
      reason_code: reason,
      note: note.trim(),
      policy_version: claim.policy_version,
      policy_hash: claim.policy_hash,
      timestamp,
    };
    // Live mode: the engine's log is the record. Only a recorded override changes the screen.
    if (state.source === "live") {
      setSending(true);
      setSendError(null);
      postOverride(record)
        .then(() => {
          dispatch({ type: "override", record, timestamp });
          setDone(record);
        })
        .catch((e: unknown) => setSendError(e instanceof Error ? e.message : "The override was not recorded."))
        .finally(() => setSending(false));
      return;
    }
    dispatch({ type: "override", record, timestamp });
    setDone(record);
  };

  if (done)
    return (
      <div className="card-panel space-y-4 p-5" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden /></span>
          Override recorded
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FlowBadge rec={done.from_rec} /> <ArrowRight className="size-4 text-muted-foreground" aria-label="to" /> <FlowBadge rec={done.to_rec} />
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Reason code</dt>
          <dd className="font-mono text-xs leading-5">{done.reason_code}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd>{done.note}</dd>
          <dt className="text-muted-foreground">Reviewer</dt>
          <dd>{done.actor}</dd>
          <dt className="text-muted-foreground">Policy</dt>
          <dd><PolicyStamp version={done.policy_version} hash={done.policy_hash} /></dd>
          <dt className="text-muted-foreground">Recorded</dt>
          <dd className="font-mono text-xs leading-5">{done.timestamp}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/log">View in decision log</Link>
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-6" onBlur={() => setTouched(true)}>
      <fieldset>
        <legend className="eyebrow mb-2">1 · Next step</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {REC_ORDER.map((r) => {
            const current = r === claim.recommendation_v1;
            const sel = to === r;
            return (
              <Button variant="outline"
                key={r}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={current || claim.case_status === "closed"}
                onClick={() => setTo(r)}
                className={cn(
                  "h-auto whitespace-normal flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors duration-150",
                  sel ? "border-foreground bg-surface ring-1 ring-foreground" : "border-border hover:border-border-strong hover:bg-surface",
                  current && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium"><Dot flow={FLOW_OF[r]} />{REC_LABEL[r]}</span>
                <span className="text-xs text-muted-foreground">{current ? "Current" : sel ? "Selected" : "Choose"}</span>
              </Button>
            );
          })}
        </div>
        {touched && errors.to && <Refusal>{errors.to}</Refusal>}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-2">2 · Reason code</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {(Object.keys(REASON_LABEL) as ReasonCode[]).map((rc) => (
            <Button variant="outline"
              key={rc}
              type="button"
              role="radio"
              aria-checked={reason === rc}
              onClick={() => setReason(rc)}
              className={cn(
                "h-auto whitespace-normal flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors duration-150",
                reason === rc ? "border-foreground bg-surface ring-1 ring-foreground" : "border-border hover:border-border-strong hover:bg-surface",
              )}
            >
              <div className="font-mono text-xs font-medium">{rc}</div>
              <div className="text-xs text-muted-foreground">{REASON_LABEL[rc].help}</div>
            </Button>
          ))}
        </div>
        {touched && errors.reason && <Refusal>{errors.reason}</Refusal>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="eyebrow mb-2">3 · Note and reviewer</legend>
        <div>
          <Label htmlFor="ov-note">Note</Label>
          <Textarea id="ov-note" className="mt-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the next person know?" />
          {(touched || note.length > 0) && errors.note && <Refusal>{errors.note}</Refusal>}
        </div>
        <div>
          <Label htmlFor="ov-actor">Reviewer</Label>
          <Input id="ov-actor" className="mt-2" value={actor} onChange={(e) => setActor(e.target.value)} />
          {errors.actor && (touched || actor.length === 0) && <Refusal>{errors.actor}</Refusal>}
        </div>
      </fieldset>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="eyebrow mb-2">This will be recorded</div>
        <pre className="overflow-x-auto font-mono text-xs leading-5 text-text-2">{JSON.stringify(preview, null, 2)}</pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <WhyDisabled disabled={!valid} reason={Object.values(errors)[0]}>
          {sendError && <Refusal>{sendError}</Refusal>}
          <Button onClick={submit} loading={sending} disabled={!valid || claim.case_status === "closed"}>{sending ? "Recording…" : "Record override"}</Button>
        </WhyDisabled>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
