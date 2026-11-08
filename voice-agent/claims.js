// Applies claims policy v1 to every case in knowledge/*.csv and builds the knowledge
// block that gets baked into Aegis's instructions. Recommendations are computed here,
// deterministically, so Aegis explains checked results instead of doing rule logic in
// its head mid-conversation.

import { readFileSync } from "node:fs";

const DIR = new URL("./knowledge/", import.meta.url); // the policy text
// The cases are the repo's own files, so the agent and the engine can never disagree about the data.
const CASES = new URL("../", import.meta.url);
const CASE_FILES = ["labelled_development_cases.csv", "unlabelled_practice_cases.csv"];

const REVIEW_FLAGS = ["injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"];
const DOCUMENTS = ["incident_report_present", "itemized_quote_present"];
const QUOTE_LIMIT_EUR = 1500;
const FACT_FIELDS = [
  "policy_active_on_incident", "claim_type", "repair_type", "quote_eur",
  ...DOCUMENTS, ...REVIEW_FLAGS,
];

/** Minimal CSV parser: handles quoted fields with commas and doubled quotes. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// null means blank or unreadable: an absent fact, never a guessed value.
const toBool = (v) => (/^true$/i.test(v) ? true : /^false$/i.test(v) ? false : null);
const toNumber = (v) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const spoken = (field) => field.replace(/_/g, " ");

/** Policy v1. Returns { recommendation, rule, reason }. */
export function applyPolicyV1(c) {
  const absent = [];
  const read = (field, parse) => {
    const value = parse(c[field] ?? "");
    if (value === null) absent.push(field);
    return value;
  };

  const active = read("policy_active_on_incident", toBool);
  const claimType = read("claim_type", (v) => v || null);
  const quote = read("quote_eur", toNumber);
  const flags = REVIEW_FLAGS.map((f) => [f, read(f, toBool)]);
  const docs = DOCUMENTS.map((f) => [f, read(f, toBool)]);

  const missingDocs = docs.filter(([, v]) => v === false).map(([f]) => `${spoken(f).replace(" present", "")} missing`);
  const blanks = absent.length ? [`blank or unreadable: ${absent.map(spoken).join(", ")}`] : [];

  // Rule 1: any known review trigger wins over missing documents or blank fields.
  const triggers = [];
  if (active === false) triggers.push("policy not active on the incident date");
  if (claimType && claimType !== "motor_own_damage") triggers.push(`claim type is ${spoken(claimType)}, not motor own damage`);
  for (const [f, v] of flags) if (v === true) triggers.push(`${spoken(f)} is true`);
  if (quote !== null && quote > QUOTE_LIMIT_EUR) triggers.push(`quote of ${quote} euros is over the ${QUOTE_LIMIT_EUR} euro limit`);
  if (triggers.length) {
    const alsoGaps = [...missingDocs, ...blanks];
    const note = alsoGaps.length ? `; also ${alsoGaps.join("; ")}, but human review takes priority` : "";
    return { recommendation: "human_review", rule: "v1 rule 1", reason: triggers.join("; ") + note };
  }

  // Rule 2, plus the absent-field clause: missing documents or blank facts mean ask for more.
  if (missingDocs.length || blanks.length) {
    return {
      recommendation: "request_information",
      rule: missingDocs.length ? "v1 rule 2" : "v1 absent-field clause",
      reason: [...missingDocs, ...blanks].join("; "),
    };
  }

  return {
    recommendation: "routine_processing",
    rule: "v1 rule 3",
    reason: `no review trigger, both documents present, quote of ${quote} euros is within the ${QUOTE_LIMIT_EUR} euro limit`,
  };
}

/** Scores against labelled cases using the policy's three quality measures. */
function scorecard(checks) {
  if (!checks.length) return null;
  const correct = checks.filter((c) => c.got === c.expected);
  const wrongRoutine = checks.filter((c) => c.got === "routine_processing" && c.expected !== "routine_processing");
  const needlessReview = checks.filter((c) => c.got === "human_review" && c.expected !== "human_review");
  const misses = checks.filter((c) => c.got !== c.expected).map((c) => `${c.id} (got ${c.got}, expected ${c.expected})`);
  return {
    correct: correct.length,
    total: checks.length,
    wrongRoutine: wrongRoutine.length,
    needlessReview: needlessReview.length,
    misses,
  };
}

/** Builds the knowledge text for the agent prompt, plus the score on labelled cases. */
export function buildClaimsKnowledge() {
  const policy = readFileSync(new URL("policy_v1.md", DIR), "utf8").trim();
  const files = CASE_FILES;
  const checks = [];
  const sections = [];
  let caseCount = 0;

  for (const file of files) {
    const cases = parseCsv(readFileSync(new URL(file, CASES), "utf8"));
    caseCount += cases.length;
    const lines = cases.map((c) => {
      const r = applyPolicyV1(c);
      if (c.expected_v1) checks.push({ id: c.case_id, expected: c.expected_v1, got: r.recommendation });
      const facts = FACT_FIELDS.map((f) => `${f}=${c[f] === "" || c[f] === undefined ? "BLANK" : c[f]}`).join(", ");
      const label = c.expected_v1 ? ` | labelled answer: ${c.expected_v1}` : "";
      return `- ${c.case_id} (${c.case_status || "status blank"}): "${c.claim_summary}" | ${facts} | v1 result: ${r.recommendation} by ${r.rule} (${r.reason})${label}`;
    });
    sections.push(`## ${file.replace(/\.csv$/, "").replace(/_/g, " ")} (${cases.length} cases)\n${lines.join("\n")}`);
  }

  const score = scorecard(checks);
  const scoreText = score
    ? `## Score of the v1 check on labelled cases\n${score.correct} of ${score.total} correct, ${score.wrongRoutine} incorrect routine_processing, ${score.needlessReview} unnecessary human_review.` +
      (score.misses.length ? ` Mismatches: ${score.misses.join("; ")}.` : "")
    : "";

  const text = [
    "# Claims triage knowledge",
    "## Policy v1",
    policy,
    "## Cases",
    "Each v1 result below was computed by a deterministic check of the policy rules.",
    ...sections,
    scoreText,
  ].filter(Boolean).join("\n\n");

  return { text, score, caseCount };
}
