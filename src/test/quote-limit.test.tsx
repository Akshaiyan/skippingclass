import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStore } from "@/store";
import { StoreProvider } from "@/store.provider";
import type { PolicyRule } from "@/types";

function Probe() {
  const { state, dispatch } = useStore();
  const rule = state.draftRules.find((r: PolicyRule) => r.id === "R1.quote_over_limit")!;
  return (
    <div>
      <span data-testid="limit">{state.quoteLimit}</span>
      <span data-testid="value">{(rule.condition as { right: { value: number } }).right.value}</span>
      <span data-testid="desc">{rule.description}</span>
      <button onClick={() => dispatch({ type: "setQuoteLimit", limit: 900 })}>set 900</button>
      <button onClick={() => dispatch({ type: "setQuoteLimit", limit: 2500 })}>set 2500</button>
    </div>
  );
}

// The quote limit is a typed number, so any amount must reach the rule it drives.
describe("Quote limit", () => {
  it("starts at the draft policy's 1200", () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    expect(screen.getByTestId("limit").textContent).toBe("1200");
    expect(screen.getByTestId("value").textContent).toBe("1200");
  });

  it("applies a typed amount that was never a preset choice", () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByText("set 900"));
    expect(screen.getByTestId("limit").textContent).toBe("900");
    expect(screen.getByTestId("value").textContent).toBe("900");
    expect(screen.getByTestId("desc").textContent).toBe("Quote above the EUR 900 routine limit");
  });

  it("applies an amount above the old presets", () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByText("set 2500"));
    expect(screen.getByTestId("value").textContent).toBe("2500");
    expect(screen.getByTestId("desc").textContent).toBe("Quote above the EUR 2,500 routine limit");
  });
});
