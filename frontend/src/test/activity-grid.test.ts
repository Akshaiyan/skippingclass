import { describe, expect, it } from "vitest";
import { activityLevel, activityWeeks } from "@/components/ActivityGrid";

// 2026-11-08 is a Sunday.
const NOW = new Date("2026-11-08T12:00:00Z");
const at = (iso: string) => ({ timestamp: `${iso}T09:30:00.123456+00:00` });

describe("decision activity grid", () => {
  it("has 26 weeks of seven days, ending on this week's Sunday", () => {
    const weeks = activityWeeks([], NOW);
    expect(weeks).toHaveLength(26);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[25][6].date).toBe("2026-11-08");
    expect(weeks[25][0].date).toBe("2026-11-02");
  });

  it("counts records on the day they were written, and only those", () => {
    const weeks = activityWeeks([at("2026-11-08"), at("2026-11-08"), at("2026-11-02"), at("2026-05-12")], NOW);
    const byDate = Object.fromEntries(weeks.flat().map((d) => [d.date, d.count]));
    expect(byDate["2026-11-08"]).toBe(2);
    expect(byDate["2026-11-02"]).toBe(1);
    expect(byDate["2026-11-03"]).toBe(0);
    expect(weeks.flat().reduce((s, d) => s + d.count, 0)).toBe(4);
  });

  it("marks days after today as future and ignores records older than the window", () => {
    const midweek = new Date("2026-11-04T08:00:00Z"); // a Wednesday
    const weeks = activityWeeks([at("2025-01-01")], midweek);
    expect(weeks[25][2].date).toBe("2026-11-04");
    expect(weeks[25][2].future).toBe(false); // today is not in the future
    expect(weeks[25][3].date).toBe("2026-11-05");
    expect(weeks[25][3].future).toBe(true);
    expect(weeks.flat().reduce((s, d) => s + d.count, 0)).toBe(0);
  });

  it("shades by count: none, one, a few, several, many", () => {
    expect([0, 1, 2, 3, 4, 6, 7, 40].map(activityLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });
});
