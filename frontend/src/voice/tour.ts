// A guided tour of the whole app, driven by one tool. Aegis calls tour_step; the app does the walking (it moves to
// the page, opens a claim, draws the diagram) and hands back the facts for that stop, built from the live data.
// Aegis only narrates what the tool returns, so the tour never depends on the model improvising a good order or
// remembering a number. Stops that need the operations lead role are left out for other roles.
import type { Flow } from "@/types";
import { REC_LABEL } from "@/copy";
import { byUrgency, missingFacts, shortReason } from "@/lib/claim-view";
import { fieldLabel } from "@/lib/fields";
import { changedRuleCount } from "@/lib/policy-view";
import { canOpen, ROLE_LABEL } from "@/lib/roles";
import { claimPathDiagram, policyChangeDiagram, ruleText, type DiagramSpec } from "./diagrams";
import { costSummary, flipsSentence } from "./page-tools";
import type { AppPath, VoiceEnv } from "./tools";

export interface TourStop {
  title: string;
  path: AppPath;
  flow?: Flow;
  claimId?: string;
  diagram?: DiagramSpec;
  /** Facts for Aegis to say in its own words. */
  points: string[];
}

const rec = (r: keyof typeof REC_LABEL) => REC_LABEL[r].toLowerCase();

export function buildTour(env: VoiceEnv): TourStop[] {
  const open = env.claims.filter((c) => c.case_status === "open").sort(byUrgency);
  const counts = (["human_review", "request_information", "routine_processing"] as const)
    .map((r) => `${open.filter((c) => c.recommendation_v1 === r).length} ${rec(r)}`)
    .join(", ");
  const lead = canOpen(env.user?.role, "/policy");
  const red = open.find((c) => c.recommendation_v1 === "human_review");
  const info = open.find((c) => c.recommendation_v1 === "request_information");
  const kinds = new Map<string, number>();
  for (const e of env.log) kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);

  const stops: TourStop[] = [
    {
      title: "The dashboard",
      path: "/",
      points: [
        `Aegis recommends one next step for every motor claim: routine processing, request information, or human review. Right now ${open.length} claims are open: ${counts}.`,
        "It never approves or pays anything. It explains its recommendation and a person always makes the call.",
        lead
          ? `You're signed in as ${env.user?.name}, an operations lead, so the tour covers every page.`
          : `You're signed in as ${env.user ? `${env.user.name}, ${ROLE_LABEL[env.user.role]}` : "a guest"}. The policy change and cost impact pages are for operations leads, so this tour skips them. Signing in as Lena Vogt shows everything.`,
      ],
    },
    {
      title: "The claims queue",
      path: "/claims",
      points: [
        "Every claim in one list, most urgent first: human review, then request information, then routine. Each row shows the recommended next step, the rule that decided it, and a one line reason.",
        "Nothing is hidden behind a score. You can filter by colour, and open any claim to see exactly why.",
      ],
    },
  ];

  if (red)
    stops.push({
      title: `A human review claim, ${red.case_id}`,
      path: "/claims",
      claimId: red.case_id,
      diagram: claimPathDiagram(red),
      points: [
        `${red.case_id} is ${rec(red.recommendation_v1)}, decided by ${ruleText(red.rule_v1)}. ${shortReason(red, env.log)}.`,
        "The diagram shows every rule being checked against the claim's facts. Red flags outrank missing information, and routine processing only means it can enter the normal process, never that it is approved.",
        "The sheet shows the facts used, what is blank, and the audit trail. The reviewer can confirm the recommendation or override it with a reason.",
      ],
    });

  if (info) {
    const missing = missingFacts(info).map((f) => fieldLabel(f).toLowerCase());
    stops.push({
      title: `A missing information claim, ${info.case_id}`,
      path: "/claims",
      claimId: info.case_id,
      points: [
        `${info.case_id} is ${rec(info.recommendation_v1)}.${missing.length ? ` What's missing: ${missing.join(", ")}.` : ""}`,
        "A blank fact is never treated as a no. When something needed isn't there, Aegis asks for it instead of guessing, and the sheet drafts the request to the customer, which the reviewer sends from their own mailbox.",
      ],
    });
  }

  stops.push({
    title: "The decision log",
    path: "/log",
    points: [
      `Every system decision, reviewer override and policy sign-off is recorded here: ${env.log.length} records so far, including ${kinds.get("reviewer_override") ?? 0} reviewer overrides.`,
      env.logIntact === false
        ? "The log's integrity check is failing right now, and the page says so plainly."
        : "The log is append-only and hash-chained, so a past entry can't be quietly changed, and the page shows whether the chain is intact.",
      "An override needs a name and a reason. That's the human in the loop, on the record.",
    ],
  });

  if (lead) {
    stops.push({
      title: "Policy change",
      path: "/policy",
      diagram: policyChangeDiagram(env.claims),
      points: [
        `Before a new policy goes live, it's replayed on every claim. The draft v2 differs from live in ${changedRuleCount(env.v1Rules, env.draftRules)} rules. ${flipsSentence(env.claims, env.draftRules)}`,
        "Closed claims never change. A change that moves a claim into routine processing needs a named second person to sign off, and the draft here isn't released.",
        "You can try what-ifs by voice, for example: lower the quote limit to 1000.",
      ],
    });
    stops.push({
      title: "Cost impact",
      path: "/business",
      points: [
        costSummary(env.claims, env.assumptions),
        "Every input on this page is an editable assumption and is labelled as one. Nothing here is a measured cost on real claims.",
      ],
    });
  }

  stops.push({
    title: "That's the tour",
    path: "/voice",
    points: [
      "That's the whole app: one recommendation per claim with its rule, a person who decides, a log nobody can quietly edit, and a policy change you can check before it goes live.",
      "They can ask me anything now, for example: why is a particular claim in human review, or what would change if the quote limit were 1000.",
    ],
  });
  return stops;
}

type Params = Record<string, unknown>;

/** One stop's effect on screen: the page, the claim sheet and the diagram. */
function show(env: VoiceEnv, stop: TourStop) {
  env.closeClaim();
  env.showDiagram(stop.diagram ?? null);
  env.navigate(stop.path, stop.flow);
  if (stop.claimId) env.openClaim(stop.claimId);
}

export function createTourTool(getEnv: () => VoiceEnv) {
  return {
    tour_step: (p: Params = {}): string => {
      const env = getEnv();
      const action = typeof p["action"] === "string" ? p["action"].toLowerCase() : "next";
      const stops = buildTour(env);
      const last = stops.length - 1;
      const at = env.tour.index;

      if (action === "stop") {
        env.tour.index = -1;
        env.closeClaim();
        env.showDiagram(null);
        return "The tour is stopped and the claim sheet and diagram are closed. Offer to carry on from where they left off, or to answer questions.";
      }
      if (!["start", "next", "back", "repeat"].includes(action))
        return `"${action}" isn't a tour action. Use start, next, back, repeat or stop.`;

      let index: number;
      if (action === "start" || at < 0) index = 0;
      else if (action === "next") index = Math.min(at + 1, last);
      else if (action === "back") index = Math.max(at - 1, 0);
      else index = at;

      if (action === "next" && at >= last)
        return "That was already the last stop. Offer to answer questions, or to start the tour again.";

      env.tour.index = index;
      const stop = stops[index]!;
      show(env, stop);
      const next = stops[index + 1];
      return [
        `Tour stop ${index + 1} of ${stops.length}: ${stop.title}. The app is now showing it.`,
        `Say this in your own words, in two or three short sentences, using only these facts: ${stop.points.join(" ")}`,
        next
          ? `Then ask if they're ready for the next stop (${next.title}).${index === 0 ? " Tell them once they can say next, back, repeat or stop." : ""}`
          : "That was the last stop. Offer to answer questions or to start again.",
      ].join(" ");
    },
  };
}
