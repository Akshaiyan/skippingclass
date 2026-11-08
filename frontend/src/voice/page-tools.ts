// Voice tools for the Policy change and Cost impact pages. They read what those pages show and change the
// same what-if inputs a person can change there: the draft v2 rules and the cost assumptions. Both are
// session-only. Nothing here releases, approves, rejects or signs off a policy: that stays with a named person.
import type { Claim, PolicyRule } from "@/types";
import { REC_LABEL } from "@/copy";
import { getCostImpact } from "@/data/api";
import { eur } from "@/lib/claim-view";
import { canOpen, ROLE_LABEL } from "@/lib/roles";
import { deriveClaims, diffLines, exhaustiveChecks, flipList, quoteLimitOf } from "@/lib/report";
import { sanitizeAssumption, type SavingsAssumptions } from "@/lib/savings";
import { withLimit } from "@/store";
import type { VoiceEnv } from "./tools";

type Params = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
/** A number from speech or a tool call. Blank or non-numeric input is NaN, never 0. */
const num = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const rec = (r: keyof typeof REC_LABEL) => REC_LABEL[r].toLowerCase();

const PAGE_NAME = {
  "/policy": "the policy change page",
  "/business": "the cost impact page",
} as const;

/** Both pages are for operations leads only, the same rule the app's menu follows. */
function blocked(env: VoiceEnv, path: keyof typeof PAGE_NAME): string | null {
  if (canOpen(env.user?.role, path)) return null;
  const who = env.user
    ? `${env.user.name} is signed in as ${ROLE_LABEL[env.user.role]}`
    : "Nobody is signed in";
  return `${who}, who can't use ${PAGE_NAME[path]}. It's for operations leads. Nothing was changed.`;
}

/** Which open claims the given rules would move, in a sentence. */
function flipsSentence(claims: Claim[], rules: PolicyRule[]): string {
  const flips = flipList(deriveClaims(claims, rules)).filter((f) => f.status === "recheck");
  if (!flips.length) return "No open claim would change.";
  const list = flips.map((f) => `${f.claim.case_id} ${rec(f.from)} to ${rec(f.to)}`).join("; ");
  const risky = flips.some((f) => f.towardRoutine)
    ? " Some move into routine processing, so a named second person must sign off before release."
    : "";
  return `${flips.length} open ${flips.length === 1 ? "claim would" : "claims would"} change: ${list}.${risky}`;
}

const ASSUMPTION_LABEL: Record<keyof SavingsAssumptions, string> = {
  eurPerMinute: "handler cost, euros per minute",
  reviewMinutes: "minutes for one human review",
  claimsPerMonth: "claims per month",
  growthPercent: "yearly volume growth, percent",
  unnecessaryReviewShare: "share of human reviews that were unnecessary, 0 to 1",
  wrongRoutineCost: "cost of one wrong routine decision, euros",
};
const ASSUMPTION_KEYS = Object.keys(ASSUMPTION_LABEL) as (keyof SavingsAssumptions)[];
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ASSUMPTION_ALIASES: Record<string, keyof SavingsAssumptions> = {
  ...Object.fromEntries(ASSUMPTION_KEYS.map((k) => [squash(k), k])),
  handlercost: "eurPerMinute",
  costperminute: "eurPerMinute",
  reviewtime: "reviewMinutes",
  minutesperreview: "reviewMinutes",
  volume: "claimsPerMonth",
  claimspermonth: "claimsPerMonth",
  growth: "growthPercent",
  unnecessaryreviews: "unnecessaryReviewShare",
  wrongroutine: "wrongRoutineCost",
};

/** The cost page's key figures in words, for a given set of assumptions. */
function costSummary(claims: VoiceEnv["claims"], a: SavingsAssumptions): string {
  const d = getCostImpact(claims, a);
  if (!d.figures)
    return "No claim is open, so there's no share to project from and no figures are shown.";
  const { live, draft } = d.figures;
  const diff = draft.twelveMonths - live.twelveMonths;
  const c = d.counts;
  return [
    `At ${a.claimsPerMonth.toLocaleString("en-US")} claims a month, from a sample of ${d.sampleSize} open claims:`,
    `human review cost per claim: live ${eur(live.perClaim)}, draft ${eur(draft.perClaim)};`,
    `share in human review: live ${pct(live.reviewShare)}, draft ${pct(draft.reviewShare)};`,
    `human review cost over the next 12 months: live ${eur(live.twelveMonths)}, draft ${eur(draft.twelveMonths)} (${diff <= 0 ? "a saving of" : "an extra"} ${eur(Math.abs(diff))});`,
    `${c.newlyEscalated} newly escalated and ${c.released} released from human review. These are assumptions, not measured costs.`,
  ].join(" ");
}

export function createPageTools(getEnv: () => VoiceEnv) {
  return {
    get_policy_draft: (): string => {
      const env = getEnv();
      const stop = blocked(env, "/policy");
      if (stop) return stop;
      const lines = diffLines(env.v1Rules, env.draftRules);
      const checks = exhaustiveChecks(env.claims, env.v1Rules, env.draftRules);
      const failing = checks.filter((c) => !c.pass);
      return [
        `Draft v2, not released. Edits to it only last for this session. ${env.gateOpen ? "v2 has been released in this session." : ""}`.trim(),
        `Quote limit: draft EUR ${(quoteLimitOf(env.draftRules) ?? 0).toLocaleString("en-US")}, live EUR ${(quoteLimitOf(env.v1Rules) ?? 0).toLocaleString("en-US")}.`,
        lines.length
          ? `Differences from live: ${lines.join("; ")}.`
          : "No differences from the live rules.",
        flipsSentence(env.claims, env.draftRules),
        failing.length
          ? `Release checks failing: ${failing.map((c) => c.label).join("; ")}.`
          : `All ${checks.length} release checks pass.`,
        "Releasing or rejecting the draft is for a person, on the policy change page.",
      ].join(" ");
    },

    set_quote_limit: (p: Params = {}): string => {
      const env = getEnv();
      const stop = blocked(env, "/policy");
      if (stop) return stop;
      const n = Math.round(num(p["limit"]));
      if (!Number.isFinite(n) || n < 0)
        return `"${str(p["limit"])}" isn't a usable limit. Give a number of euros, zero or more. Nothing was changed.`;
      const next = withLimit(env.draftRules, n);
      if (quoteLimitOf(next) !== n)
        return "The draft has no active quote limit rule, so there is no limit to set. Switch that rule on first, or reset the draft. Nothing was changed.";
      env.setQuoteLimit(n);
      env.navigate("/policy");
      return `Draft quote limit is now EUR ${n.toLocaleString("en-US")} (live is EUR ${(quoteLimitOf(env.v1Rules) ?? 0).toLocaleString("en-US")}). Session only, not released. ${flipsSentence(env.claims, next)}`;
    },

    set_rule_active: (p: Params = {}): string => {
      const env = getEnv();
      const stop = blocked(env, "/policy");
      if (stop) return stop;
      const q = str(p["rule"]).trim().toLowerCase();
      const raw = p["active"];
      const active = typeof raw === "boolean" ? raw : str(raw).toLowerCase() === "true";
      if (
        raw === undefined ||
        (typeof raw !== "boolean" && !["true", "false"].includes(str(raw).toLowerCase()))
      )
        return "Say whether to switch the rule on or off (active true or false). Nothing was changed.";
      const hits = env.draftRules.filter(
        (r) =>
          r.id.toLowerCase() === q ||
          (q && (r.id.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))),
      );
      const exact = hits.filter((r) => r.id.toLowerCase() === q);
      const pick = exact.length === 1 ? exact : hits;
      if (pick.length !== 1)
        return pick.length
          ? `"${str(p["rule"])}" matches ${pick.length} rules (${pick.map((r) => r.id).join(", ")}). Ask which one. Nothing was changed.`
          : `No rule in the draft matches "${str(p["rule"])}". The rules are: ${env.draftRules.map((r) => r.id).join(", ")}. Nothing was changed.`;
      const rule = pick[0]!;
      if (rule.id === "R3.routine")
        return "The routine fallback can't be switched off: every claim needs an outcome. Nothing was changed.";
      const next = env.draftRules.map((r) => {
        if (r.id !== rule.id) return r;
        if (!active) return { ...r, active: false };
        const { active: _off, ...on } = r;
        return on;
      });
      env.setDraftRules(next);
      env.navigate("/policy");
      return `${rule.id} (${rule.description}) is now ${active ? "on" : "off"} in the draft. Session only, not released. ${flipsSentence(env.claims, next)}`;
    },

    reset_draft: (): string => {
      const env = getEnv();
      const stop = blocked(env, "/policy");
      if (stop) return stop;
      env.resetDraft();
      env.navigate("/policy");
      return "The draft is back to the live rules. Nothing was released or recorded.";
    },

    get_cost_impact: (): string => {
      const env = getEnv();
      const stop = blocked(env, "/business");
      if (stop) return stop;
      const set = ASSUMPTION_KEYS.map(
        (k) => `${ASSUMPTION_LABEL[k]}: ${env.assumptions[k]} (assumed)`,
      ).join("; ");
      return `Cost impact. Assumptions: ${set}. ${costSummary(env.claims, env.assumptions)}`;
    },

    set_cost_assumption: (p: Params = {}): string => {
      const env = getEnv();
      const stop = blocked(env, "/business");
      if (stop) return stop;
      const key = ASSUMPTION_ALIASES[squash(str(p["name"]))];
      if (!key)
        return `"${str(p["name"])}" isn't one of the cost assumptions. They are: ${ASSUMPTION_KEYS.join(", ")}. Nothing was changed.`;
      const value = sanitizeAssumption(key, num(p["value"]));
      if (value === null)
        return `"${str(p["value"])}" isn't usable for ${ASSUMPTION_LABEL[key]}: it must be a number, zero or more. Nothing was changed.`;
      env.setAssumption(key, value);
      env.navigate("/business");
      const next = { ...env.assumptions, [key]: value };
      return `${ASSUMPTION_LABEL[key]} is now ${value}${value !== num(p["value"]) ? ` (limited from ${str(p["value"])})` : ""}, session only. ${costSummary(env.claims, next)}`;
    },
  };
}
