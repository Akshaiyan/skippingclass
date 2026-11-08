import { describe, expect, it } from "vitest";
import { matchesLogQuery, parseLogQuery } from "@/lib/log-query";
import type { LogEntry } from "@/types";

const override = {
  seq: 2, type: "reviewer_override", timestamp: "2026-11-08T07:22:40+00:00", actor: "Jonas Weber", case_id: "PRA-006",
  from_rec: "request_information", to_rec: "routine_processing", reason_code: "data_wrong",
  note: "Itemised quote confirmed by phone", policy_version: "v1", policy_hash: "sha256:abc",
} as unknown as LogEntry;
const approval = {
  seq: 3, type: "policy_approved", timestamp: "2026-11-08T00:30:00+00:00", actor: "Jonas Weber", policy_version: "v2",
  policy_hash: "sha256:def", reason: "Quote limit and EV rule",
} as unknown as LogEntry;

const run = (q: string) => [override, approval].filter((e) => matchesLogQuery(e, parseLogQuery(q))).map((e) => e.seq);

describe("log search with GitHub-style qualifiers", () => {
  it("parses qualifiers and keeps the rest as text", () => {
    expect(parseLogQuery("actor:Jonas case:PRA-006 quote phone")).toEqual({
      actor: "jonas", case: "pra-006", text: "quote phone",
    });
  });

  it("author is an alias for actor", () => {
    expect(parseLogQuery("author:lena").actor).toBe("lena");
  });

  it("an empty query matches everything", () => {
    expect(run("")).toEqual([2, 3]);
  });

  it("each qualifier narrows by its own field", () => {
    expect(run("type:override")).toEqual([2]);
    expect(run("type:policy")).toEqual([3]);
    expect(run("policy:v2")).toEqual([3]);
    expect(run("case:PRA-006")).toEqual([2]);
    expect(run("actor:jonas")).toEqual([2, 3]);
    expect(run("actor:lena")).toEqual([]);
  });

  it("qualifiers combine, and free text searches the reason", () => {
    expect(run("actor:jonas type:override")).toEqual([2]);
    expect(run("actor:jonas policy:v2 type:override")).toEqual([]);
    expect(run("itemised quote")).toEqual([2]);
    expect(run("quote itemised")).toEqual([]);
    expect(run("phone")).toEqual([2]);
    expect(run("type:policy EV")).toEqual([3]);
  });
});
