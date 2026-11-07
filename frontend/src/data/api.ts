// Single adapter for all reads and writes. Today it returns mock data synchronously;
// swap the bodies for the documented JSON API later without touching the UI.
import type { Claim, LogEntry, Policy, PolicyRule } from "@/types";
import { SEED_CLAIMS, SEED_LOG, POLICY_V1, POLICY_V2_DRAFT } from "./seed";
import { evaluate as evaluateLocal, type Facts, type Evaluation } from "@/lib/evaluate";

export const getClaims = (): Claim[] => structuredClone(SEED_CLAIMS);
export const getPolicy = (): Policy => structuredClone(POLICY_V1);
export const getDraftPolicy = (): Policy => structuredClone(POLICY_V2_DRAFT);
export const getLog = (): LogEntry[] => structuredClone(SEED_LOG);

export function appendLog<T extends Omit<LogEntry, "seq">>(log: LogEntry[], entry: T): LogEntry[] {
  const seq = (log.at(-1)?.seq ?? 0) + 1;
  return [...log, { ...entry, seq } as LogEntry];
}

export const evaluate = (rules: PolicyRule[], facts: Facts): Evaluation => evaluateLocal(rules, facts);
