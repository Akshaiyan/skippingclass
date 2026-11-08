import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ClaimsList, type FlowFilter } from "@/components/ClaimsList";
import { StoreProvider } from "@/store.provider";

function Controlled() {
  const [flow, setFlow] = useState<FlowFilter>("all");
  return <ClaimsList flow={flow} setFlow={setFlow} />;
}

const page = () =>
  render(
    <TooltipProvider>
      <StoreProvider>
        <Controlled />
      </StoreProvider>
    </TooltipProvider>,
  );

describe("Claims page", () => {
  it("shows the three flows as large group headings with their counts", () => {
    page();
    for (const name of ["Human review", "Missing information", "Routine processing"])
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+ claims?$/).length).toBeGreaterThan(0);
  });

  it("offers the two other flows as visible actions, never a dropdown", () => {
    page();
    expect(screen.getAllByRole("button", { name: "Move PRA-005 to Human review" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Move PRA-005 to Routine processing" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Change recommendation for/ })).toBeNull();
  });

  it("opens the override with the target chosen after one click", () => {
    page();
    fireEvent.click(screen.getAllByRole("button", { name: "Move PRA-005 to Human review" })[0]!);
    expect(screen.getByRole("heading", { name: "Override recommendation" })).toBeInTheDocument();
  });

  it("walks a Missing information claim from drafted email to sent", () => {
    page();
    fireEvent.click(screen.getAllByLabelText(/^Open case PRA-005/)[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Send drafted email/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/No recipient on file|^To: /)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Copy email/ }));
    expect(within(dialog).getByRole("button", { name: /Mark as sent/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Mark as sent/ }));
    expect(within(dialog).getAllByText("Email sent, waiting for reply").length).toBeGreaterThan(0);
  });

  it("filters by flow tab and reports the result count", () => {
    const { container } = page();
    fireEvent.click(screen.getByRole("radio", { name: /^Routine processing/ }));
    const headings = [...container.querySelectorAll('h2[id^="group-"]')].map((n) => n.textContent ?? "");
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every((h) => h.startsWith("Routine processing"))).toBe(true);
    expect(screen.getByText(/ of \d+ claims$/)).toBeInTheDocument();
  });
});
