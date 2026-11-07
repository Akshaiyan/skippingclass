import type { Claim, LogEntry, Policy, PolicyRule } from "@/types";
import { evaluate, hashRules } from "@/lib/evaluate";
import { FLOW_OF } from "@/copy";

export const V1_RULES: PolicyRule[] = [
  {
    id: "R1.policy_inactive",
    outcome: "human_review",
    description: "Policy not active on the incident date",
    condition: { field: "policy_active_on_incident", op: "eq", right: { kind: "value", value: false } },
  },
  {
    id: "R1.incident_before_start",
    outcome: "human_review",
    description: "Incident date is before the policy start",
    condition: { field: "incident_date", op: "before", right: { kind: "field", field: "policy_start_date" } },
  },
  {
    id: "R1.quote_over_limit",
    outcome: "human_review",
    description: "Quote above the EUR 1,500 routine limit",
    condition: { field: "quote_eur", op: "gt", right: { kind: "value", value: 1500 } },
  },
  {
    id: "R1.liability_disputed",
    outcome: "human_review",
    description: "Liability is disputed",
    condition: { field: "liability_disputed", op: "eq", right: { kind: "value", value: true } },
  },
  {
    id: "R1.duplicate",
    outcome: "human_review",
    description: "Possible duplicate claim",
    condition: { field: "duplicate_flag", op: "eq", right: { kind: "value", value: true } },
  },
  {
    id: "R1.evidence_conflict",
    outcome: "human_review",
    description: "Evidence conflicts with the claim description",
    condition: { field: "evidence_conflict", op: "eq", right: { kind: "value", value: true } },
  },
  {
    id: "R2.incident_report_missing",
    outcome: "request_information",
    description: "Incident report not attached",
    condition: { field: "incident_report_present", op: "eq", right: { kind: "value", value: false } },
  },
  {
    id: "R2.itemized_quote_missing",
    outcome: "request_information",
    description: "Itemized repair quote not attached",
    condition: { field: "itemized_quote_present", op: "eq", right: { kind: "value", value: false } },
  },
  { id: "R3.routine", outcome: "routine_processing", description: "Otherwise: routine processing", condition: null },
];

export const POLICY_V1: Policy = { version: "v1", author: "Lena Vogt", hash: "sha256:a1b2c3…", rules: V1_RULES };

export function buildV2Rules(limit = 1200): PolicyRule[] {
  const rules = V1_RULES.map((r) => structuredClone(r));
  const q = rules.find((r) => r.id === "R1.quote_over_limit")!;
  q.condition = { field: "quote_eur", op: "gt", right: { kind: "value", value: limit } };
  q.description = `Quote above the EUR ${limit.toLocaleString("en-US")} routine limit`;
  const it = rules.find((r) => r.id === "R2.itemized_quote_missing")!;
  it.description = "Itemized quote missing on quotes above EUR 500";
  it.condition = {
    all: [
      { field: "itemized_quote_present", op: "eq", right: { kind: "value", value: false } },
      { field: "quote_eur", op: "gt", right: { kind: "value", value: 500 } },
    ],
  };
  const added: PolicyRule = {
    id: "R1.quote_above_claimed",
    outcome: "human_review",
    description: "Quote more than 10% above the claimed amount",
    condition: { field: "quote_eur", op: "gt", right: { kind: "field", field: "claimed_amount_eur", factor: 1.1 } },
  };
  const idx = rules.findIndex((r) => r.id === "R1.quote_over_limit");
  rules.splice(idx + 1, 0, added);
  return rules;
}

export const POLICY_V2_DRAFT: Policy = (() => {
  const rules = buildV2Rules(1200);
  return { version: "v2", author: "Lena Vogt", hash: hashRules(rules), rules };
})();

type F = Claim["facts"];
const base = (o: Partial<F>): F => ({
  policy_active_on_incident: true,
  claim_type: "collision",
  repair_type: "partner_garage",
  quote_eur: 900,
  claimed_amount_eur: 900,
  incident_date: "2026-09-12",
  policy_start_date: "2025-01-01",
  incident_report_present: true,
  itemized_quote_present: true,
  liability_disputed: false,
  duplicate_flag: false,
  evidence_conflict: false,
  ...o,
});

const RAW: { case_id: string; case_status: "open" | "closed"; claim_summary: string; facts: F }[] = [
  { case_id: "PRA-001", case_status: "open", claim_summary: "Rear-end collision at a junction, bumper and tailgate replaced.", facts: base({ quote_eur: 4800, claimed_amount_eur: 4600, duplicate_flag: true, incident_date: "2026-10-04" }) },
  { case_id: "PRA-002", case_status: "open", claim_summary: "Side impact in a car park; the other driver disputes who reversed.", facts: base({ liability_disputed: true, evidence_conflict: true, quote_eur: 1100, claimed_amount_eur: 1100, repair_type: "independent_garage", incident_date: "2026-10-09" }) },
  { case_id: "PRA-003", case_status: "open", claim_summary: "Collision reported shortly after the policy was taken out.", facts: base({ policy_active_on_incident: false, incident_date: "2026-03-02", policy_start_date: "2026-03-15", quote_eur: 1250, claimed_amount_eur: 1250 }) },
  { case_id: "PRA-004", case_status: "closed", claim_summary: "Wing mirror damage, matching an earlier claim on the same vehicle.", facts: base({ case_status: "closed", duplicate_flag: true, quote_eur: 420, claimed_amount_eur: 420, claim_type: "vandalism", incident_date: "2026-08-21" }) },
  { case_id: "PRA-005", case_status: "open", claim_summary: "Front-end damage after a low-speed collision; quote and report outstanding.", facts: base({ quote_eur: null, incident_report_present: null, incident_date: "2026-10-18" }) },
  { case_id: "PRA-006", case_status: "open", claim_summary: "Two-vehicle collision on a roundabout; liability position not yet stated.", facts: base({ liability_disputed: null, quote_eur: 1320, claimed_amount_eur: 1300, incident_date: "2026-10-20" }) },
  { case_id: "PRA-007", case_status: "open", claim_summary: "Door and sill dent from a slow collision with a bollard.", facts: base({ quote_eur: 1450, claimed_amount_eur: 1400, incident_date: "2026-10-22" }) },
  { case_id: "PRA-008", case_status: "open", claim_summary: "Stone chip turned windscreen crack; glass partner quote received.", facts: base({ claim_type: "glass", repair_type: "glass_repair", quote_eur: 380, claimed_amount_eur: 380, itemized_quote_present: false, incident_date: "2026-10-24" }) },
  { case_id: "PRA-009", case_status: "closed", claim_summary: "Scratched paintwork in a residential street; photo check outstanding.", facts: base({ case_status: "closed", claim_type: "vandalism", evidence_conflict: null, quote_eur: 610, claimed_amount_eur: 600, incident_date: "2026-08-30" }) },
  { case_id: "PRA-010", case_status: "open", claim_summary: "Windscreen replacement after a highway stone strike.", facts: base({ claim_type: "glass", repair_type: "glass_repair", quote_eur: 640, claimed_amount_eur: 520, incident_date: "2026-10-26" }) },
  { case_id: "PRA-011", case_status: "open", claim_summary: "Hail damage to roof and bonnet during a summer storm.", facts: base({ claim_type: "weather", quote_eur: 1180, claimed_amount_eur: 1150, incident_date: "2026-10-27" }) },
  { case_id: "PRA-012", case_status: "closed", claim_summary: "Front bumper scrape while parking, repaired at a partner garage.", facts: base({ case_status: "closed", quote_eur: 1300, claimed_amount_eur: 1300, incident_date: "2026-09-02" }) },
];

for (const r of RAW) r.facts["case_status"] = r.case_status;

export const SEED_CLAIMS: Claim[] = RAW.map((r) => {
  const ev = evaluate(V1_RULES, r.facts);
  return {
    case_id: r.case_id,
    case_status: r.case_status,
    claim_summary: r.claim_summary,
    recommendation_v1: ev.recommendation,
    flow: FLOW_OF[ev.recommendation],
    rule_v1: ev.rule,
    explanation: ev.explanation,
    checklist: ev.checklist,
    facts: r.facts,
    blank_fields: Object.entries(r.facts)
      .filter(([, v]) => v === null)
      .map(([k]) => k),
    policy_version: POLICY_V1.version,
    policy_hash: POLICY_V1.hash,
    needs_recheck: false,
  };
});

const BASE_TS = Date.UTC(2026, 10, 7, 9, 0, 0);
const daysAgo = (d: number, h = 0) => new Date(BASE_TS - d * 864e5 + h * 36e5).toISOString();

export const SEED_LOG: LogEntry[] = (() => {
  const out: Record<string, unknown>[] = [];
  SEED_CLAIMS.forEach((c, i) => {
    out.push({
      type: "system_decision",
      case_id: c.case_id,
      actor: "system",
      to_rec: c.recommendation_v1,
      note: c.rule_v1,
      policy_version: "v1",
      policy_hash: POLICY_V1.hash,
      timestamp: daysAgo(21 - i * 1.5, 1),
    });
  });
  out.push({
    type: "reviewer_override",
    case_id: "PRA-004",
    actor: "Jonas Weber",
    from_rec: "routine_processing",
    to_rec: "human_review",
    reason_code: "data_wrong",
    note: "Duplicate flag was missing on intake; same mirror claimed in August.",
    policy_version: "v1",
    policy_hash: POLICY_V1.hash,
    timestamp: daysAgo(12, 3),
  });
  SEED_CLAIMS.filter((c) => c.case_status === "closed").forEach((c, i) => {
    out.push({
      type: "final_decision",
      case_id: c.case_id,
      actor: "Jonas Weber",
      to_rec: c.recommendation_v1,
      note: "Case closed after review.",
      policy_version: "v1",
      policy_hash: POLICY_V1.hash,
      timestamp: daysAgo(9 - i * 2, 5),
    });
  });
  out.push({
    type: "policy_proposed",
    actor: "Lena Vogt",
    note: "Draft v2: lower quote limit, quote vs claimed check, itemized quote only above EUR 500.",
    policy_version: "v2",
    policy_hash: POLICY_V2_DRAFT.hash,
    timestamp: daysAgo(1, 2),
  });
  return out
    .sort((a, b) => String(a["timestamp"]).localeCompare(String(b["timestamp"])))
    .map((e, i) => ({ ...e, seq: i + 1 }) as LogEntry);
})();
