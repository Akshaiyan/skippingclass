import { describe, expect, it } from "vitest";
import { describeProposal, type DocProposal } from "@/data/documents";

const base: DocProposal = {
  fact: "quote_total",
  field: "quote_eur",
  document_value: 1350,
  claim_value: "1201",
  status: "conflicts",
  source_text: "Total: EUR 1350.00",
  page: 1,
  confidence: "High",
};

describe("what a document proposal says", () => {
  it("a disagreement names both amounts and sends a person to the claim", () => {
    const s = describeProposal(base);
    expect(s).toContain("EUR 1,350");
    expect(s).toContain("EUR 1,201");
    expect(s).toContain("a person should look at this claim");
  });

  it("an agreement says so and asks for nothing", () => {
    const s = describeProposal({ ...base, status: "agrees", document_value: 1201 });
    expect(s).toContain("the same as the claim form");
    expect(s).not.toContain("person");
  });

  it("a proposal for a blank field says it is not used until a reviewer records it", () => {
    const s = describeProposal({ ...base, status: "proposes_blank", claim_value: null });
    expect(s).toContain("The claim form has no value");
    expect(s).toContain("not used until a reviewer records it");
  });
});
