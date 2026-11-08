// Client tools for the Aegis voice agent. The agent (elevenlabstest/aegis.config.js) calls these by name while
// you talk; each one runs in the browser and returns a short string the agent reads back to decide what to say.
// A change to a tool name or parameter here must be made in aegis.config.js too, then `npm run setup` there.
//
// The handlers are plain functions over an `env` snapshot, so they can be tested without a browser or a
// microphone. Nothing here can record a decision: propose_override only puts a draft on screen.
import type { Account, Flow, LogEntry, PolicyRule, Rec, ReasonCode } from "@/types";
import type { SavingsAssumptions } from "@/lib/savings";
import { REC_LABEL, REC_ORDER } from "@/copy";
import { shortReason, quoteOf } from "@/lib/claim-view";
import { flipList, type DerivedClaim } from "@/lib/report";
import { canOpen, ROLE_LABEL } from "@/lib/roles";
import { resolveCaseId } from "./case-id";
import {
  claimPathDiagram,
  customDiagram,
  policyChangeDiagram,
  policyFlowDiagram,
  routingDiagram,
  ruleText,
  type DiagramSpec,
} from "./diagrams";
import { changedRuleCount } from "@/lib/policy-view";
import { createPageTools } from "./page-tools";

export type AppPath = "/" | "/claims" | "/policy" | "/business" | "/log" | "/voice";

export interface OverrideDraft {
  to: Rec;
  note: string;
  reason_code?: ReasonCode;
}

/** Everything a tool may read or do. The component rebuilds this on every render. */
export interface VoiceEnv {
  user: Account | null;
  path: string;
  source: "connecting" | "live" | "demo";
  claims: DerivedClaim[];
  v1Rules: PolicyRule[];
  draftRules: PolicyRule[];
  v1Hash: string;
  draftHash: string;
  log: LogEntry[];
  openClaimId: string | null;
  diagram: DiagramSpec | null;
  navigate: (to: AppPath, flow?: Flow) => void;
  openClaim: (caseId: string, draft?: OverrideDraft) => void;
  showDiagram: (spec: DiagramSpec | null) => void;
  /** Cost impact inputs, and whether v2 has been released this session. */
  assumptions: SavingsAssumptions;
  gateOpen: boolean;
  /** What-if edits, the same ones the Policy change and Cost impact pages make. All session only. */
  setQuoteLimit: (limit: number) => void;
  setDraftRules: (rules: PolicyRule[]) => void;
  resetDraft: () => void;
  setAssumption: (key: keyof SavingsAssumptions, value: number) => void;
}

const PAGES: Record<string, { path: AppPath; name: string }> = {
  dashboard: { path: "/", name: "the dashboard" },
  claims: { path: "/claims", name: "the claims list" },
  policy: { path: "/policy", name: "the policy change page" },
  business: { path: "/business", name: "the cost impact page" },
  log: { path: "/log", name: "the decision log" },
  voice: { path: "/voice", name: "the Talk to Aegis page" },
};
const PAGE_ALIASES: Record<string, string> = {
  home: "dashboard",
  cost: "business",
  "cost impact": "business",
  "decision log": "log",
  "policy change": "policy",
  "talk to aegis": "voice",
};
const FLOW_FILTERS: Record<string, Flow> = { red: "red", yellow: "yellow", green: "green" };
const REASONS: ReasonCode[] = ["policy_wrong", "data_wrong", "judgement"];

const rec = (r: Rec) => REC_LABEL[r].toLowerCase();
const pathName = (p: string) =>
  Object.values(PAGES).find((x) => x.path === p)?.name ?? `the page ${p}`;

function notInApp(parsed: string | null, input: string, claims: DerivedClaim[]) {
  const ids = claims.map((c) => c.case_id);
  if (parsed?.startsWith("DEV-"))
    return `${parsed} is a development case. Those aren't loaded in the app, so it can't be opened or drawn. Explain it out loud instead.`;
  return `No claim in the app matches "${input}". The app has: ${ids.join(", ") || "no claims"}.`;
}

/** What the app shows right now, written for the agent to read, not for display. */
export function describeApp(env: VoiceEnv): string {
  const open = env.claims.filter((c) => c.case_status === "open");
  const counts = REC_ORDER.map(
    (r) => `${open.filter((c) => c.recommendation_v1 === r).length} ${rec(r)}`,
  ).join(", ");
  const closed = env.claims.length - open.length;
  const flips = flipList(env.claims).filter((f) => f.status === "recheck");
  const changed = changedRuleCount(env.v1Rules, env.draftRules);
  const lines = [
    `App: motor claims triage. ${env.user ? `Signed in as ${env.user.name}, ${ROLE_LABEL[env.user.role]}.` : "Nobody is signed in."}`,
    env.source === "live"
      ? "Data: live from the triage engine."
      : "Data: demo seed, because the triage service isn't reachable. Decisions shown are not from the engine and are not recorded.",
    `Page: ${pathName(env.path)}. ${env.openClaimId ? `Claim sheet open: ${env.openClaimId}.` : "No claim sheet open."} ${env.diagram ? `Diagram on screen: "${env.diagram.title}".` : "No diagram on screen."}`,
    `Live policy v1 (hash ${env.v1Hash.slice(0, 8)}). Draft v2: ${changed ? `${changed} ${changed === 1 ? "rule differs" : "rules differ"} from live` : "same as live"}, not released.`,
    `Open claims: ${open.length} (${counts}). Closed: ${closed}.`,
    flips.length
      ? `Under the draft v2, ${flips.length} open ${flips.length === 1 ? "claim would" : "claims would"} change: ${flips
          .map((f) => `${f.claim.case_id} ${rec(f.from)} to ${rec(f.to)}`)
          .join("; ")}.`
      : "Under the draft v2, no open claim would change.",
    "Claims (id, status, live result, deciding rule, draft result if different, quote):",
  ];
  for (const c of env.claims) {
    const quote = quoteOf(c);
    const v2 =
      c.case_status === "open" && c.recommendation_v2 !== c.recommendation_v1
        ? `; draft: ${rec(c.recommendation_v2)} (${ruleText(c.rule_v2)})`
        : "";
    lines.push(
      `${c.case_id} | ${c.case_status}${c.ui_status === "reviewed" ? ", reviewed" : ""} | ${rec(c.recommendation_v1)} | ${ruleText(c.rule_v1)}${v2} | ${quote === null ? "quote blank" : `quote ${quote} euros`} | ${shortReason(c, env.log)}`,
    );
  }
  return lines.join("\n");
}

type Params = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function createVoiceTools(getEnv: () => VoiceEnv) {
  const tools: Record<string, (p?: Params) => string> = {
    ...createPageTools(getEnv),
    get_app_context: () => describeApp(getEnv()),

    navigate_to_page: (p = {}) => {
      const env = getEnv();
      const raw = str(p["page"]).trim().toLowerCase();
      const key = PAGES[raw] ? raw : PAGE_ALIASES[raw];
      const page = key ? PAGES[key] : undefined;
      if (!page)
        return `There's no "${raw}" page in this app. The pages are: dashboard, claims, policy change, cost impact, decision log and Talk to Aegis.`;
      if (!canOpen(env.user?.role, page.path))
        return `${env.user?.name ?? "This user"} is signed in as ${env.user ? ROLE_LABEL[env.user.role] : "nobody"}, who can't open ${page.name}. It's for operations leads.`;
      const flowRaw = str(p["flow"]).trim().toLowerCase();
      const flow = page.path === "/claims" ? FLOW_FILTERS[flowRaw] : undefined;
      env.navigate(page.path, flow);
      return flow
        ? `Now on ${page.name}, filtered to ${rec(flow === "red" ? "human_review" : flow === "yellow" ? "request_information" : "routine_processing")}.`
        : `Now on ${page.name}.`;
    },

    open_claim: (p = {}) => {
      const env = getEnv();
      const input = str(p["case_id"]);
      const { claim, parsed } = resolveCaseId(input, env.claims);
      if (!claim) return notInApp(parsed, input, env.claims);
      env.openClaim(claim.case_id);
      return `Opened ${claim.case_id}${claim.case_status === "closed" ? " (closed)" : ""}: ${rec(claim.recommendation_v1)} by ${ruleText(claim.rule_v1)}. ${shortReason(claim, env.log)}.`;
    },

    show_diagram: (p = {}) => {
      const env = getEnv();
      const kind = str(p["kind"]);
      let spec: DiagramSpec | { error: string };
      let said: string;
      if (kind === "claim_path") {
        const input = str(p["case_id"]);
        const { claim, parsed } = resolveCaseId(input, env.claims);
        if (!input.trim()) return "claim_path needs a case_id. Ask which claim.";
        if (!claim) return notInApp(parsed, input, env.claims);
        spec = claimPathDiagram(claim);
        const fired = claim.checklist.filter((k) => k.result === "true").map((k) => k.description);
        said = `${claim.case_id} is ${rec(claim.recommendation_v1)} by ${ruleText(claim.rule_v1)}. Fired: ${fired.join("; ") || "nothing"}.`;
      } else if (kind === "policy_flow") {
        const v2 = str(p["version"]) === "v2";
        spec = policyFlowDiagram(v2 ? "v2" : "v1", env.v1Rules, env.draftRules);
        said = v2
          ? `Draft v2 ladder, not released. ${spec.caption}`
          : `Live v1 ladder with ${env.v1Rules.length} rules.`;
      } else if (kind === "routing_breakdown") {
        spec = routingDiagram(env.claims);
        said = `Breakdown of open claims. ${describeApp(env).split("\n")[4]}`;
      } else if (kind === "policy_change") {
        spec = policyChangeDiagram(env.claims);
        said = `${spec.caption} ${describeApp(env).split("\n")[5]}`;
      } else if (kind === "custom") {
        const flow = str(p["flow"]);
        if (!flow.trim())
          return "custom needs a flow. Write one connection per line as 'step > next step'.";
        spec = customDiagram(str(p["title"]), flow, str(p["direction"]));
        if ("error" in spec) return spec.error;
        said = `Drew "${spec.title}" with ${spec.nodes.length} steps.`;
      } else {
        return `Unknown diagram kind "${kind}". Use claim_path, policy_flow, routing_breakdown, policy_change or custom.`;
      }
      env.showDiagram(spec);
      return `Diagram on screen: ${spec.title}. ${said}`;
    },

    close_diagram: () => {
      const env = getEnv();
      if (!env.diagram) return "No diagram was open.";
      env.showDiagram(null);
      return "Diagram closed.";
    },

    propose_override: (p = {}) => {
      const env = getEnv();
      const input = str(p["case_id"]);
      const { claim, parsed } = resolveCaseId(input, env.claims);
      if (!claim) return notInApp(parsed, input, env.claims);
      if (claim.case_status === "closed")
        return `${claim.case_id} is closed, and a closed claim can't be overridden. Nothing is on screen.`;
      const to = str(p["to"]) as Rec;
      if (!REC_ORDER.includes(to))
        return `"${str(p["to"])}" isn't a next step. Use human_review, request_information or routine_processing.`;
      if (to === claim.recommendation_v1)
        return `${claim.case_id} is already ${rec(to)}, so there's nothing to override. Nothing is on screen.`;
      const note = str(p["note"]).trim();
      if (!note)
        return "No reason was given, so nothing is on screen. Ask the reviewer for their reason, then call this again with it.";
      const code = str(p["reason_code"]) as ReasonCode;
      env.openClaim(claim.case_id, {
        to,
        note,
        ...(REASONS.includes(code) ? { reason_code: code } : {}),
      });
      return (
        `Draft is on screen: ${claim.case_id} from ${rec(claim.recommendation_v1)} to ${rec(to)}, note "${note}". ` +
        `NOT recorded: the reviewer has to check it and press Record override. ` +
        (REASONS.includes(code) ? "" : "The reviewer still has to pick a reason code. ") +
        (to === "routine_processing"
          ? "Warn them briefly: routine processing is the risky direction."
          : "")
      ).trim();
    },
  };
  return tools;
}

/** Wraps each handler so a bug returns a sentence to the agent instead of leaving it waiting for a timeout. */
export function safeTools(
  getEnv: () => VoiceEnv,
  onCall?: (name: string, params: Params, result: string) => void,
) {
  const raw = createVoiceTools(getEnv);
  return Object.fromEntries(
    Object.entries(raw).map(([name, fn]) => [
      name,
      async (params?: Params) => {
        let result: string;
        try {
          result = fn(params ?? {});
        } catch (err) {
          console.error(`[voice] ${name} failed`, err);
          result = `That didn't work: ${err instanceof Error ? err.message : "unknown error"}. Tell the user plainly.`;
        }
        console.info(`[voice] ${name}`, params, "->", result);
        onCall?.(name, params ?? {}, result);
        return result;
      },
    ]),
  ) as Record<string, (params?: Params) => Promise<string>>;
}
