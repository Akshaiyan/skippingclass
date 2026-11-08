// The operations lead's three questions, answered from the data on screen: which policy is in force and what a
// pending change would do, what people have decided, and whether the record can be trusted.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { useStore } from "@/store";
import { REC_LABEL } from "@/copy";
import { canOpen } from "@/lib/roles";
import { changeGroups, changeSentence } from "@/lib/dashboard";
import { replaysStored } from "@/lib/report";
import { PolicyStamp } from "@/components/status";
import type { LogEntry, Rec } from "@/types";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="card-panel space-y-3 p-4">
      <h3 className="text-sm font-medium text-text-2">{title}</h3>
      {children}
    </section>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const isPolicyDecision = (e: LogEntry) => e.type === "policy_approved" || e.type === "policy_rejected";

export function DashboardPanels() {
  const { state, derived, draftHash, v1Rules } = useStore();
  const role = state.user?.role;
  const live = state.source === "live";

  // Policy
  const decision = [...state.log].reverse().find(isPolicyDecision);
  const released = decision?.type === "policy_approved";
  const held = decision?.type === "policy_rejected";
  const openTotal = derived.filter((c) => c.case_status === "open").length;
  const groups = changeGroups(derived);
  const proposer = decision ? (decision as { proposed_by?: string }).proposed_by : undefined;

  // Review activity
  const decisions = state.log.filter((e) => e.type === "reviewer_override" || isPolicyDecision(e));
  const overrides = decisions.filter((e) => e.type === "reviewer_override").length;
  const policyDecisions = decisions.length - overrides;
  const latest = [...decisions].reverse().slice(0, 3);

  // Trust
  const integrity = live ? state.integrity : null;
  const replayed = state.claims.filter((c) => replaysStored([c], v1Rules)).length;

  return (
    <div className="space-y-4" aria-label="Operations overview">
      <p className="max-w-[80ch] text-sm text-text-2">
        {changeSentence(openTotal, groups, released ? "v2" : "the draft")}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Policy">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{released ? "v2 approved" : "v1 in force"}</span>
            <PolicyStamp
              version={released ? "v2" : "v1"}
              hash={released ? (state.engineV2Hash ?? draftHash) : state.v1Hash}
            />
          </div>
          <p className="text-sm text-text-2">
            {released
              ? `Approved by ${decision?.actor}${proposer ? `, proposed by ${proposer}` : ""}. Claims keep their v1 recommendation until a reviewer acts on each.`
              : held
                ? `Draft v2 held by ${decision?.actor}.`
                : "Draft v2 is not released. Releasing it needs a second person to approve."}
          </p>
          {canOpen(role, "/policy") && (
            <Link to="/policy" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
              Review the policy change <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </Panel>

        <Panel title="Review activity">
          <p className="text-sm">
            <span className="tnum font-medium">{overrides}</span> reviewer {overrides === 1 ? "decision" : "decisions"},{" "}
            <span className="tnum font-medium">{policyDecisions}</span> policy {policyDecisions === 1 ? "decision" : "decisions"}
          </p>
          {latest.length === 0 ? (
            <p className="text-sm text-text-2">Nothing has been decided yet. Decisions appear here as soon as someone records one.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-text-2">
              {latest.map((e) => (
                <li key={e.seq}>
                  <span className="font-medium text-foreground">{e.actor}</span>{" "}
                  {e.type === "reviewer_override" && "from_rec" in e && "to_rec" in e
                    ? `changed ${e.case_id}: ${REC_LABEL[e.from_rec as Rec]} → ${REC_LABEL[e.to_rec as Rec]}`
                    : e.type === "policy_approved"
                      ? "approved a policy change"
                      : "held a policy change"}
                  <span className="tnum text-xs text-muted-foreground"> · {when(e.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
          {canOpen(role, "/log") && (
            <Link to="/log" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
              Open the decision log <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </Panel>

        <Panel title="Trust">
          {integrity ? (
            integrity.intact ? (
              <p className="inline-flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4" aria-hidden /> Log intact
              </p>
            ) : (
              <p className="inline-flex items-center gap-2 text-sm font-medium text-destructive">
                <ShieldAlert className="size-4" aria-hidden /> Log broken at entry {integrity.broken_at}
              </p>
            )
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-text-2">
              <ShieldAlert className="size-4" aria-hidden /> Demo data: no log to check
            </p>
          )}
          <p className="text-sm text-text-2">
            Every record is chained to the one before it, so an edit shows.{" "}
            {integrity?.intact && (
              <>Checked at {new Date(integrity.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. </>
            )}
            <span className="tnum">
              {replayed}/{state.claims.length}
            </span>{" "}
            claims replay from their stored facts.
          </p>
        </Panel>
      </div>
    </div>
  );
}
