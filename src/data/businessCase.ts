// Every number shown in the business case. Mock placeholders the team will replace.
export type EvidenceLabel = "ASSUMED" | "SOURCED" | "DERIVED" | "MEASURED" | "NOT MEASURED";

export const BUSINESS_CASE = {
  openClaimsPortfolio: 1200,
  minutesPerRecheck: [6, 10] as [number, number],
  flippedShare: [0.03, 0.08] as [number, number],
  efficiencyFloorHours: [3200, 6400] as [number, number],
  annualTriageCostEur: [400_000, 1_600_000] as [number, number],
  paybackEfficiencyMonths: 14.5,
  paybackWithErrorsMonths: 9,
  addedMinutesPerHumanReview: [15, 25] as [number, number],
  loadedCostPerHourEur: 34,
  labelled: { total: 40, v1: 34, v2: 36 },
};

export const LABEL_HELP: Record<EvidenceLabel, string> = {
  SOURCED: "Taken from a named external source.",
  DERIVED: "Calculated from other figures in this register.",
  ASSUMED: "A working estimate, not yet checked.",
  MEASURED: "Observed directly in this tool.",
  "NOT MEASURED": "Not known yet. Shown so the gap is visible.",
};

export const ASSUMPTIONS: { assumption: string; value: string; label: EvidenceLabel; source: string }[] = [
  { assumption: "Claims handler salary", value: "EUR 44,400 per year", label: "SOURCED", source: "StepStone salary data" },
  { assumption: "Claims involving fraud indicators", value: "~10% of claims", label: "SOURCED", source: "GDV" },
  { assumption: "Motor insurance contracts in Germany", value: "69.5M", label: "SOURCED", source: "GDV" },
  { assumption: "Loaded cost per reviewer hour", value: "EUR 34", label: "DERIVED", source: "Salary ÷ 1,650 hours × 1.25 assumed overhead" },
  { assumption: "Minutes per manual triage", value: "4 to 12", label: "ASSUMED", source: "Team estimate from reviewer interviews" },
  { assumption: "Share of claims routed routine", value: "40% to 60%", label: "ASSUMED", source: "Team estimate, to be checked on pilot data" },
  { assumption: "Recommendations replaying identically", value: "12 of 12", label: "MEASURED", source: "Decision log replay" },
  { assumption: "Real error rate of routine decisions", value: "Unknown", label: "NOT MEASURED", source: "Needs audited outcomes" },
];
