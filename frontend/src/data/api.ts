// Single adapter for all reads and writes. Today it returns mock data synchronously;
// swap the bodies for the documented JSON API later without touching the UI.
import type { Account, Claim, LogEntry, Policy, PolicyRule } from "@/types";
import { DEMO_ACCOUNTS, SEED_CLAIMS, SEED_LOG, POLICY_V1, POLICY_V2_DRAFT } from "./seed";
import { evaluate as evaluateLocal, type Facts, type Evaluation } from "@/lib/evaluate";
import { policyImpact, type HandlingRates } from "@/lib/policy-impact";
import type { DerivedClaim } from "@/lib/report";
import {
  costFigures,
  flowShares,
  policySavings,
  projectTwelveMonths,
  type SavingsAssumptions,
} from "@/lib/savings";

export const getClaims = (): Claim[] => structuredClone(SEED_CLAIMS);
export const getPolicy = (): Policy => structuredClone(POLICY_V1);
export const getDraftPolicy = (): Policy => structuredClone(POLICY_V2_DRAFT);
export const getLog = (): LogEntry[] => structuredClone(SEED_LOG);

export function appendLog<T extends Omit<LogEntry, "seq">>(log: LogEntry[], entry: T): LogEntry[] {
  const seq = (log.at(-1)?.seq ?? 0) + 1;
  return [...log, { ...entry, seq } as LogEntry];
}

export const evaluate = (rules: PolicyRule[], facts: Facts): Evaluation =>
  evaluateLocal(rules, facts);
export const getHandlingRates = (): HandlingRates => ({ green: null, yellow: null, red: null });
export const getPolicyImpact = (claims: DerivedClaim[], rates: HandlingRates) =>
  policyImpact(claims, rates);

// Mock sign-in: the email picks the stored profile, and the role comes with it.
// The real API would verify the password; the demo accepts any non-empty one.
export const getAccounts = (): Account[] => structuredClone(DEMO_ACCOUNTS);
export function signIn(email: string, password: string): Account | null {
  if (!password) return null;
  const match = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  return match ? structuredClone(match) : null;
}
export const getAccount = (id: string): Account | null =>
  structuredClone(DEMO_ACCOUNTS.find((a) => a.id === id) ?? null);

/**
 * All datasets of the Cost impact page. Today they are projected from the sample claims.
 * Swap this one function for real insurer data; the page only reads its result.
 */
export function getCostImpact(claims: DerivedClaim[], assumptions: SavingsAssumptions) {
  const live = flowShares(claims, "live");
  const draft = flowShares(claims, "draft");
  const months = projectTwelveMonths(live, draft, assumptions);
  const sampleSize = claims.filter((c) => c.case_status === "open").length;
  return {
    source: "sample" as const,
    sampleSize,
    live,
    draft,
    months,
    figures: costFigures(live, draft, months, sampleSize, assumptions),
    counts: policySavings(claims, assumptions),
  };
}
