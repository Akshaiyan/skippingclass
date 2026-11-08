// Document check: a document PROPOSES facts; it never decides. The engine route is read-only.
import { API_BASE } from "@/data/live";
import { eur } from "@/lib/claim-view";

export type ProposalStatus = "agrees" | "conflicts" | "proposes_blank";

export interface DocProposal {
  fact: string;
  field: string;
  document_value: number | string;
  claim_value: string | null;
  status: ProposalStatus;
  source_text: string;
  page: number;
  confidence: string;
}

export interface DocCheck {
  case_id: string;
  proposals: DocProposal[];
  note: string;
}

export async function checkDocument(caseId: string, text: string): Promise<DocCheck> {
  const res = await fetch(`${API_BASE}/api/documents/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id: caseId, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `The check failed (${res.status}).`);
  return data as DocCheck;
}

const FACT_LABEL: Record<string, string> = { quote_total: "Quote total" };
const show = (fact: string, v: number | string | null) =>
  v === null ? "nothing" : fact === "quote_total" ? eur(Number(v)) : String(v);

/** One plain sentence per proposal, saying what the document says and what that means for the claim. */
export function describeProposal(p: DocProposal): string {
  const label = FACT_LABEL[p.fact] ?? p.fact;
  const doc = show(p.fact, p.document_value);
  if (p.status === "agrees") return `${label}: the document says ${doc}, the same as the claim form.`;
  if (p.status === "conflicts")
    return `${label}: the document says ${doc} but the claim form says ${show(p.fact, p.claim_value)}. They disagree, so a person should look at this claim.`;
  return `${label}: the document says ${doc}. The claim form has no value. This is a proposal and is not used until a reviewer records it.`;
}
