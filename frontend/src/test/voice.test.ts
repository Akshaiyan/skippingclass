import { describe, expect, it, vi } from "vitest";
import { getAccounts, getClaims, getDraftPolicy, getLog, getPolicy } from "@/data/api";
import { deriveClaims } from "@/lib/report";
import { DEFAULT_ASSUMPTIONS } from "@/lib/savings";
import { parseCaseId, resolveCaseId } from "@/voice/case-id";
import {
  customDiagram,
  policyChangeDiagram,
  policyFlowDiagram,
  routingDiagram,
} from "@/voice/diagrams";
import { layoutDiagram } from "@/voice/layout";
import { createVoiceTools, describeApp, type VoiceEnv } from "@/voice/tools";

const claims = deriveClaims(getClaims(), getDraftPolicy().rules);
const [claimer, lead] = [
  getAccounts().find((a) => a.role === "insurance_claimer")!,
  getAccounts().find((a) => a.role === "operations_lead")!,
];

function makeEnv(over: Partial<VoiceEnv> = {}): VoiceEnv {
  return {
    user: lead,
    path: "/claims",
    source: "live",
    claims,
    v1Rules: getPolicy().rules,
    draftRules: getDraftPolicy().rules,
    v1Hash: "abcdef0123456789",
    draftHash: "0123456789abcdef",
    log: getLog(),
    openClaimId: null,
    diagram: null,
    navigate: vi.fn(),
    openClaim: vi.fn(),
    showDiagram: vi.fn(),
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    gateOpen: false,
    setQuoteLimit: vi.fn(),
    setDraftRules: vi.fn(),
    resetDraft: vi.fn(),
    setAssumption: vi.fn(),
    closeClaim: vi.fn(),
    tour: { index: -1 },
    logIntact: true,
    ...over,
  };
}
const run = (env: VoiceEnv, tool: string, params?: Record<string, unknown>) =>
  createVoiceTools(() => env)[tool]!(params);

describe("spoken case ids", () => {
  it.each([
    ["PRA-007", "PRA-007"],
    ["practice seven", "PRA-007"],
    ["P R A zero zero seven", "PRA-007"],
    ["pra oh oh three", "PRA-003"],
    ["practice twelve", "PRA-012"],
    ["7", "PRA-007"],
    ["dev thirteen", "DEV-013"],
    ["doc one", "DOC-001"],
    ["case number twenty one", "PRA-021"],
    ["pra007", "PRA-007"],
  ])("%s -> %s", (said, id) => expect(parseCaseId(said).id).toBe(id));

  it("returns null for things that are not ids", () => {
    expect(parseCaseId("banana").id).toBeNull();
    expect(parseCaseId("").id).toBeNull();
  });
  it("matches only claims that exist", () => {
    expect(resolveCaseId("practice seven", claims).claim?.case_id).toBe("PRA-007");
    expect(resolveCaseId("dev thirteen", claims)).toEqual({ claim: null, parsed: "DEV-013" });
  });
});

describe("navigate_to_page", () => {
  it("goes to a page and filters the claims list", () => {
    const env = makeEnv();
    expect(run(env, "navigate_to_page", { page: "claims", flow: "red" })).toMatch(/human review/);
    expect(env.navigate).toHaveBeenCalledWith("/claims", "red");
  });
  it("drops a filter on pages that have none", () => {
    const env = makeEnv();
    run(env, "navigate_to_page", { page: "log", flow: "red" });
    expect(env.navigate).toHaveBeenCalledWith("/log", undefined);
  });
  it("respects roles: a claimer cannot be taken to the policy page", () => {
    const env = makeEnv({ user: claimer });
    expect(run(env, "navigate_to_page", { page: "policy" })).toMatch(/can't open/);
    expect(env.navigate).not.toHaveBeenCalled();
  });
  it("takes you to the Talk to Aegis page, for either role", () => {
    for (const user of [lead, claimer]) {
      const env = makeEnv({ user });
      expect(run(env, "navigate_to_page", { page: "voice" })).toMatch(/Talk to Aegis/);
      expect(env.navigate).toHaveBeenCalledWith("/voice", undefined);
    }
  });
  it("says so for pages the app does not have", () => {
    const env = makeEnv();
    expect(run(env, "navigate_to_page", { page: "documents" })).toMatch(/no "documents" page/);
    expect(env.navigate).not.toHaveBeenCalled();
  });
});

describe("open_claim", () => {
  it("opens a claim from loose speech", () => {
    const env = makeEnv();
    expect(run(env, "open_claim", { case_id: "practice seven" })).toMatch(/^Opened PRA-007/);
    expect(env.openClaim).toHaveBeenCalledWith("PRA-007");
  });
  it("explains that development cases are not in the app", () => {
    const env = makeEnv();
    expect(run(env, "open_claim", { case_id: "dev thirteen" })).toMatch(/development case/);
    expect(env.openClaim).not.toHaveBeenCalled();
  });
});

describe("propose_override", () => {
  const open = claims.find(
    (c) => c.case_status === "open" && c.recommendation_v1 === "human_review",
  )!;
  const closed = claims.find((c) => c.case_status === "closed")!;

  it("drafts on screen and says it is not recorded", () => {
    const env = makeEnv();
    const out = run(env, "propose_override", {
      case_id: open.case_id,
      to: "request_information",
      note: "Quote looks inflated",
      reason_code: "judgement",
    });
    expect(env.openClaim).toHaveBeenCalledWith(open.case_id, {
      to: "request_information",
      note: "Quote looks inflated",
      reason_code: "judgement",
    });
    expect(out).toMatch(/NOT recorded/);
  });
  it("warns about the risky direction", () => {
    const out = run(makeEnv(), "propose_override", {
      case_id: open.case_id,
      to: "routine_processing",
      note: "fine",
    });
    expect(out).toMatch(/risky direction/);
  });
  it("refuses without a reason, so the agent has to ask", () => {
    const env = makeEnv();
    expect(
      run(env, "propose_override", {
        case_id: open.case_id,
        to: "request_information",
        note: "  ",
      }),
    ).toMatch(/Ask the reviewer/);
    expect(env.openClaim).not.toHaveBeenCalled();
  });
  it("refuses a closed claim, an unchanged step and a bogus step", () => {
    const env = makeEnv();
    expect(
      run(env, "propose_override", { case_id: closed.case_id, to: "human_review", note: "x" }),
    ).toMatch(/closed/);
    expect(
      run(env, "propose_override", { case_id: open.case_id, to: "human_review", note: "x" }),
    ).toMatch(/already/);
    expect(
      run(env, "propose_override", { case_id: open.case_id, to: "approve", note: "x" }),
    ).toMatch(/isn't a next step/);
    expect(env.openClaim).not.toHaveBeenCalled();
  });
});

describe("diagrams", () => {
  it("draws every ready-made kind from live data", () => {
    const env = makeEnv();
    for (const params of [
      { kind: "claim_path", case_id: "PRA-003" },
      { kind: "policy_flow" },
      { kind: "policy_flow", version: "v2" },
      { kind: "routing_breakdown" },
      { kind: "policy_change" },
    ]) {
      expect(run(env, "show_diagram", params)).toMatch(/^Diagram on screen/);
    }
    expect(env.showDiagram).toHaveBeenCalledTimes(5);
  });
  it("needs a case for claim_path and rejects unknown kinds", () => {
    const env = makeEnv();
    expect(run(env, "show_diagram", { kind: "claim_path" })).toMatch(/needs a case_id/);
    expect(run(env, "show_diagram", { kind: "pie" })).toMatch(/Unknown diagram kind/);
    expect(env.showDiagram).not.toHaveBeenCalled();
  });
  it("closes only when one is open", () => {
    expect(run(makeEnv(), "close_diagram")).toMatch(/No diagram/);
    const env = makeEnv({ diagram: routingDiagram(claims) });
    expect(run(env, "close_diagram")).toBe("Diagram closed.");
    expect(env.showDiagram).toHaveBeenCalledWith(null);
  });
  it("marks what the draft changes on the v2 ladder", () => {
    const spec = policyFlowDiagram("v2", getPolicy().rules, getDraftPolicy().rules);
    expect(
      spec.nodes.filter((n) => n.tag?.startsWith("Changed") || n.tag === "Added").length,
    ).toBeGreaterThan(0);
  });
  it("reports flips from the same data as the policy page", () => {
    const spec = policyChangeDiagram(claims);
    const moved = claims.filter(
      (c) => c.case_status === "open" && c.recommendation_v1 !== c.recommendation_v2,
    ).length;
    expect(spec.caption).toContain(moved ? `${moved} of` : "No open claim would move");
  });
});

describe("custom diagrams", () => {
  it("parses connections, labels, colours and chains", () => {
    const spec = customDiagram(
      "Intake",
      "Claim arrives > Check policy; Check policy > Human review #red | trigger found\nCheck policy > Routine #green | all clear",
    );
    if ("error" in spec) throw new Error(spec.error);
    expect(spec.nodes.map((n) => n.label)).toEqual([
      "Claim arrives",
      "Check policy",
      "Human review",
      "Routine",
    ]);
    expect(spec.nodes.find((n) => n.label === "Human review")).toMatchObject({
      tone: "red",
      tag: "Human review",
    });
    expect(spec.edges.find((e) => e.label === "all clear")).toBeTruthy();
    expect(customDiagram("x", "a > b > c")).toMatchObject({
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });
  });
  it("rejects empty and oversized flows", () => {
    expect(customDiagram("x", "  ")).toHaveProperty("error");
    const big = Array.from({ length: 15 }, (_, i) => `s${i} > s${i + 1}`).join("\n");
    expect(customDiagram("x", big)).toHaveProperty("error");
  });
  it("lays out cycles and gives every node a position", () => {
    const spec = customDiagram("loop", "a > b; b > c; c > a");
    if ("error" in spec) throw new Error(spec.error);
    const placed = layoutDiagram(spec);
    expect(placed.nodes).toHaveLength(3);
    expect(placed.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

describe("get_app_context", () => {
  it("lists every claim with its live result and the page the user is on", () => {
    const text = describeApp(makeEnv({ openClaimId: "PRA-002" }));
    for (const c of claims) expect(text).toContain(c.case_id);
    expect(text).toContain("Claim sheet open: PRA-002");
    expect(text).toContain("the claims list");
  });
  it("says plainly when the data is demo data", () => {
    expect(describeApp(makeEnv({ source: "demo" }))).toMatch(/not from the engine/);
  });
  it("keeps the tool summaries pointing at real lines", () => {
    const lines = describeApp(makeEnv()).split("\n");
    expect(lines[4]).toMatch(/^Open claims:/);
    expect(lines[5]).toMatch(/^Under the draft v2/);
  });
});

describe("push to talk wording", () => {
  it("says what the mic is doing, in words", async () => {
    const { voiceStatusLabel, readVoiceMode } = await import("@/voice/voice-context");
    expect(voiceStatusLabel("idle", "push", false)).toBe("Not on a call");
    expect(voiceStatusLabel("listening", "push", false)).toBe("Mic off: hold to talk");
    expect(voiceStatusLabel("listening", "push", true)).toBe("Listening to you");
    expect(voiceStatusLabel("listening", "conversation", false)).toBe("Listening");
    expect(voiceStatusLabel("speaking", "push", false)).toBe("Aegis is talking");
    window.localStorage.removeItem("aegis.voiceMode");
    expect(readVoiceMode()).toBe("push");
    window.localStorage.setItem("aegis.voiceMode", "conversation");
    expect(readVoiceMode()).toBe("conversation");
    window.localStorage.removeItem("aegis.voiceMode");
  });
});

describe("override follow-up", () => {
  it("tells Aegis what was recorded and what is left, and not to call tools", async () => {
    const { overrideFollowUp, APP_EVENT_MARK } = await import("@/voice/follow-up");
    const red = claims.filter(
      (c) => c.case_status === "open" && c.recommendation_v1 === "human_review",
    );
    const first = red[0]!;
    const text = overrideFollowUp(
      {
        type: "reviewer_override",
        case_id: first.case_id,
        actor: "Lena Vogt",
        from_rec: "human_review",
        to_rec: "request_information",
        reason_code: "judgement",
        note: "Need car details",
        policy_version: "v1",
        policy_hash: "x",
        timestamp: "t",
      },
      claims,
    );
    expect(text.startsWith(APP_EVENT_MARK)).toBe(true);
    expect(text).toContain(`${first.case_id}: human review to request information`);
    expect(text).toContain(`${red.length - 1} open human review`);
    expect(text).not.toContain(`starting with ${first.case_id}`);
    expect(text).toMatch(/do not call any tool/);
  });
});

describe("transcript cleanup", () => {
  it("drops delivery cues like [excited] and keeps the words", async () => {
    const { stripDeliveryCues } = await import("@/voice/transcript");
    expect(stripDeliveryCues("[excited] Oh nice, that one is routine!")).toBe(
      "Oh nice, that one is routine!",
    );
    expect(stripDeliveryCues("Hmm [curious] what's the reason? [laughs]")).toBe(
      "Hmm what's the reason?",
    );
    expect(stripDeliveryCues("[whispers]")).toBe("");
    expect(stripDeliveryCues("PRA-003 is human review.")).toBe("PRA-003 is human review.");
  });
});

describe("policy change tools", () => {
  it("sets the draft quote limit, shows the page and says what would change", () => {
    const env = makeEnv();
    const out = run(env, "set_quote_limit", { limit: 1000 });
    expect(env.setQuoteLimit).toHaveBeenCalledWith(1000);
    expect(env.navigate).toHaveBeenCalledWith("/policy");
    expect(out).toMatch(/Session only, not released/);
    expect(out).toMatch(/open claim|No open claim/);
  });
  it("refuses a bad limit and changes nothing", () => {
    const env = makeEnv();
    for (const limit of ["lots", -5, ""])
      expect(run(env, "set_quote_limit", { limit })).toMatch(/Nothing was changed/);
    expect(env.setQuoteLimit).not.toHaveBeenCalled();
  });
  it("is for operations leads only", () => {
    const env = makeEnv({ user: claimer });
    for (const [tool, params] of [
      ["get_policy_draft", {}],
      ["set_quote_limit", { limit: 1000 }],
      ["set_rule_active", { rule: "R1.duplicate", active: false }],
      ["reset_draft", {}],
      ["get_cost_impact", {}],
      ["set_cost_assumption", { name: "claimsPerMonth", value: 5000 }],
    ] as const)
      expect(run(env, tool, params)).toMatch(/operations leads/);
    expect(env.setQuoteLimit).not.toHaveBeenCalled();
    expect(env.setDraftRules).not.toHaveBeenCalled();
    expect(env.resetDraft).not.toHaveBeenCalled();
    expect(env.setAssumption).not.toHaveBeenCalled();
    expect(env.navigate).not.toHaveBeenCalled();
  });
  it("switches a rule off and on by id or by words, and keeps the routine fallback", () => {
    const env = makeEnv();
    const out = run(env, "set_rule_active", { rule: "possible duplicate", active: false });
    expect(out).toMatch(/R1\.duplicate .* is now off/);
    const rules = (env.setDraftRules as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      id: string;
      active?: boolean;
    }[];
    expect(rules.find((r) => r.id === "R1.duplicate")?.active).toBe(false);
    expect(run(env, "set_rule_active", { rule: "R3.routine", active: false })).toMatch(/fallback/);
    expect(run(env, "set_rule_active", { rule: "R1", active: false })).toMatch(/matches \d+ rules/);
    expect(run(env, "set_rule_active", { rule: "nonsense", active: false })).toMatch(/No rule/);
    expect(run(env, "set_rule_active", { rule: "R1.duplicate" })).toMatch(/on or off/);
  });
  it("reads the draft: differences, flips and release checks, and leaves release to a person", () => {
    const out = run(makeEnv(), "get_policy_draft");
    expect(out).toMatch(/not released/);
    expect(out).toMatch(/Differences from live/);
    expect(out).toMatch(/release checks/i);
    expect(out).toMatch(/for a person/);
  });
  it("resets the draft", () => {
    const env = makeEnv();
    expect(run(env, "reset_draft")).toMatch(/live rules/);
    expect(env.resetDraft).toHaveBeenCalled();
  });
  it("has no tool that releases, approves or signs anything off", () => {
    const names = Object.keys(createVoiceTools(() => makeEnv()));
    expect(names.filter((n) => /release|approve|reject|sign|record|confirm/.test(n))).toEqual([]);
  });
});

describe("cost impact tools", () => {
  it("reads the assumptions and the figures", () => {
    const out = run(makeEnv(), "get_cost_impact");
    expect(out).toMatch(/claims per month: 2000 \(assumed\)/);
    expect(out).toMatch(/12 months/);
    expect(out).toMatch(/not measured costs/);
  });
  it("sets an assumption by name or by words and shows the page", () => {
    const env = makeEnv();
    expect(run(env, "set_cost_assumption", { name: "claimsPerMonth", value: 5000 })).toMatch(
      /5,000 claims a month/,
    );
    expect(env.setAssumption).toHaveBeenCalledWith("claimsPerMonth", 5000);
    run(env, "set_cost_assumption", { name: "handler cost", value: 2 });
    expect(env.setAssumption).toHaveBeenCalledWith("eurPerMinute", 2);
    expect(env.navigate).toHaveBeenCalledWith("/business");
  });
  it("limits the review share to 0..1 and says so", () => {
    const env = makeEnv();
    expect(run(env, "set_cost_assumption", { name: "unnecessaryReviewShare", value: 5 })).toMatch(
      /limited from 5/,
    );
    expect(env.setAssumption).toHaveBeenCalledWith("unnecessaryReviewShare", 1);
  });
  it("refuses unknown names and unusable values", () => {
    const env = makeEnv();
    expect(run(env, "set_cost_assumption", { name: "profit", value: 3 })).toMatch(/isn't one of/);
    expect(run(env, "set_cost_assumption", { name: "claimsPerMonth", value: -1 })).toMatch(
      /must be a number/,
    );
    expect(run(env, "set_cost_assumption", { name: "claimsPerMonth", value: "many" })).toMatch(
      /must be a number/,
    );
    expect(env.setAssumption).not.toHaveBeenCalled();
  });
});

describe("blank values are never zero", () => {
  it("a blank cost value changes nothing", () => {
    const env = makeEnv();
    expect(run(env, "set_cost_assumption", { name: "claimsPerMonth", value: "" })).toMatch(
      /must be a number/,
    );
    expect(run(env, "set_cost_assumption", { name: "claimsPerMonth" })).toMatch(/must be a number/);
    expect(env.setAssumption).not.toHaveBeenCalled();
  });
});

describe("guided tour", () => {
  it("walks an operations lead through every page, in a fixed order", async () => {
    const { buildTour } = await import("@/voice/tour");
    const stops = buildTour(makeEnv());
    expect(stops.map((s) => s.path)).toEqual([
      "/",
      "/claims",
      "/claims",
      "/claims",
      "/log",
      "/policy",
      "/business",
      "/voice",
    ]);
    expect(stops[2]!.claimId).toBeTruthy();
    expect(stops[2]!.diagram?.kind).toBe("claim_path");
  });
  it("leaves out the pages a claimer cannot open, and says why", async () => {
    const { buildTour } = await import("@/voice/tour");
    const stops = buildTour(makeEnv({ user: claimer }));
    expect(stops.some((s) => s.path === "/policy" || s.path === "/business")).toBe(false);
    expect(stops[0]!.points.join(" ")).toMatch(/skips them/);
  });
  it("starts, moves on, goes back, repeats and stops, showing each stop", () => {
    const env = makeEnv();
    const first = run(env, "tour_step", { action: "start" });
    expect(first).toMatch(/^Tour stop 1 of 8: The dashboard/);
    expect(first).toMatch(/say next, back, repeat or stop/);
    expect(env.navigate).toHaveBeenLastCalledWith("/", undefined);
    expect(run(env, "tour_step", { action: "next" })).toMatch(/stop 2 of 8/);
    expect(run(env, "tour_step", { action: "next" })).toMatch(/stop 3 of 8: A human review claim/);
    expect(env.openClaim).toHaveBeenLastCalledWith(expect.stringMatching(/^PRA-/));
    expect(env.showDiagram).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "claim_path" }),
    );
    expect(run(env, "tour_step", { action: "back" })).toMatch(/stop 2 of 8/);
    expect(run(env, "tour_step", { action: "repeat" })).toMatch(/stop 2 of 8/);
    expect(run(env, "tour_step", { action: "stop" })).toMatch(/stopped/);
    expect(env.tour.index).toBe(-1);
    expect(env.showDiagram).toHaveBeenLastCalledWith(null);
  });
  it("clamps at both ends and treats next before start as start", () => {
    const env = makeEnv();
    expect(run(env, "tour_step", { action: "next" })).toMatch(/stop 1 of 8/);
    expect(run(env, "tour_step", { action: "back" })).toMatch(/stop 1 of 8/);
    for (let i = 0; i < 7; i++) run(env, "tour_step", { action: "next" });
    expect(run(env, "tour_step", { action: "next" })).toMatch(/already the last stop/);
    expect(run(env, "tour_step", { action: "dance" })).toMatch(/isn't a tour action/);
  });
  it("narrates only from live facts", () => {
    const env = makeEnv();
    const stop3 =
      (run(env, "tour_step", { action: "start" }),
      run(env, "tour_step", { action: "next" }),
      run(env, "tour_step", { action: "next" }));
    const red = claims
      .filter((c) => c.case_status === "open")
      .find((c) => c.recommendation_v1 === "human_review")!;
    expect(stop3).toContain(red.case_id);
    expect(stop3).toMatch(/never that it is approved/);
    const lastStops = run(makeEnv(), "tour_step", { action: "start" });
    expect(lastStops).toMatch(/\d+ claims are open/);
  });
});
