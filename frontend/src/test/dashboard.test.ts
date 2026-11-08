import { describe, expect, it } from "vitest";
import { changeGroups, changeSentence, type ChangeInput } from "@/lib/dashboard";

const c = (over: Partial<ChangeInput>): ChangeInput => ({
  case_status: "open",
  recommendation_v1: "routine_processing",
  recommendation_v2: "routine_processing",
  needs_recheck: false,
  ...over,
});

const claims: ChangeInput[] = [
  c({}),
  c({ recommendation_v2: "human_review", needs_recheck: true }),
  c({ recommendation_v2: "human_review", needs_recheck: true }),
  c({ recommendation_v2: "human_review", needs_recheck: true }),
  c({ recommendation_v1: "request_information", recommendation_v2: "human_review", needs_recheck: true }),
  c({ case_status: "closed", recommendation_v2: "human_review", needs_recheck: false }),
];

describe("what a pending policy change does to open claims", () => {
  it("groups the open claims that change by the move, largest first", () => {
    expect(changeGroups(claims)).toEqual([
      { from: "routine_processing", to: "human_review", n: 3 },
      { from: "request_information", to: "human_review", n: 1 },
    ]);
  });

  it("never counts a closed claim", () => {
    expect(changeGroups([c({ case_status: "closed", recommendation_v2: "human_review", needs_recheck: true })])).toEqual([]);
  });

  it("says the counts in one sentence and that nothing is re-decided", () => {
    const s = changeSentence(5, changeGroups(claims));
    expect(s).toBe(
      "4 of 5 open claims change under the draft: 3 routine processing → human review, 1 request information → human review. No claim is re-decided until a reviewer acts.",
    );
  });

  it("names v2 once it is approved, not the draft", () => {
    expect(changeSentence(5, changeGroups(claims), "v2")).toContain("under v2:");
    expect(changeSentence(5, [], "v2")).toBe("No open claim has a recommendation that changes under v2.");
  });

  it("says plainly when nothing changes", () => {
    expect(changeSentence(5, [])).toBe("No open claim has a recommendation that changes under the draft.");
  });
});
