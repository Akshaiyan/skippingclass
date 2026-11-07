export type FieldType = "bool" | "number" | "date" | "enum" | "text";

export interface FieldMeta {
  name: string;
  type: FieldType;
  label: string; // human words
  options?: string[];
}

export const FIELDS: FieldMeta[] = [
  { name: "case_status", type: "enum", label: "Case status", options: ["open", "closed"] },
  { name: "policy_active_on_incident", type: "bool", label: "Policy active on the incident date" },
  {
    name: "claim_type",
    type: "enum",
    label: "Claim type",
    options: ["collision", "glass", "theft", "vandalism", "weather"],
  },
  {
    name: "repair_type",
    type: "enum",
    label: "Repair type",
    options: ["partner_garage", "independent_garage", "glass_repair", "total_loss"],
  },
  { name: "quote_eur", type: "number", label: "Repair quote (EUR)" },
  { name: "claimed_amount_eur", type: "number", label: "Claimed amount (EUR)" },
  { name: "incident_date", type: "date", label: "Incident date" },
  { name: "policy_start_date", type: "date", label: "Policy start date" },
  { name: "incident_report_present", type: "bool", label: "Incident report" },
  { name: "itemized_quote_present", type: "bool", label: "Itemized repair quote" },
  { name: "liability_disputed", type: "bool", label: "Whether liability is disputed" },
  { name: "duplicate_flag", type: "bool", label: "Duplicate check" },
  { name: "evidence_conflict", type: "bool", label: "Whether evidence conflicts with the description" },
];

export const FIELD_MAP: Record<string, FieldMeta> = Object.fromEntries(FIELDS.map((f) => [f.name, f]));
export const fieldLabel = (n: string) => FIELD_MAP[n]?.label ?? n;
