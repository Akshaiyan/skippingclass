import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Flow } from "@/types";
import { ClaimsList, type FlowFilter } from "@/components/ClaimsList";
import { PageHeader } from "@/components/status";

export const Route = createFileRoute("/claims")({
  validateSearch: (s: Record<string, unknown>): { flow?: FlowFilter } => {
    const f = s["flow"];
    return f === "red" || f === "yellow" || f === "green" || f === "all" ? { flow: f } : {};
  },
  head: () => ({
    meta: [
      { title: "Claims · Motor claims triage" },
      {
        name: "description",
        content:
          "Reviewer cockpit: every claim with its recommended next step and the rules behind it.",
      },
      { property: "og:title", content: "Claims · Motor claims triage" },
      {
        property: "og:description",
        content:
          "A concise claims overview with complete case details and reviewer actions in a side window.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimsPage,
});

function ClaimsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/claims" });
  const flow: FlowFilter = search.flow ?? "all";
  const setFlow = (f: FlowFilter) =>
    navigate({ search: f === "all" ? {} : { flow: f }, replace: true });
  return <ClaimsList flow={flow} setFlow={setFlow} heading={<PageHeader title="Claims" />} />;
}
