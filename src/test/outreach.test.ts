import { describe, expect, it } from "vitest";
import { getClaims } from "@/data/api";
import { draftAsText, draftEmail, mailtoHref, MAILTO_LIMIT, telHref } from "@/lib/outreach";

const claims = getClaims();
const yellow = claims.find((c) => c.flow === "yellow")!;
const green = claims.find((c) => c.flow === "green")!;

describe("Draft email", () => {
  it("lists what is missing for a Missing information claim", () => {
    const d = draftEmail(yellow);
    expect(d.subject).toBe(`Your motor claim ${yellow.case_id}`);
    expect(d.body).toContain("we need the following");
    expect(d.body).toContain("- ");
  });
  it("is a short update for other flows", () => {
    expect(draftEmail(green).body).not.toContain("we need the following");
  });
  it("puts the subject on its own line when copied", () => {
    expect(draftAsText({ subject: "S", body: "B" })).toBe("Subject: S\n\nB");
  });
});

describe("Mail link", () => {
  const d = { subject: "Your motor claim PRA-001", body: "Hello,\nline & more" };
  it("has an empty recipient when none is on file", () => {
    expect(mailtoHref(undefined, d)).toMatch(/^mailto:\?subject=/);
  });
  it("prefills the recipient and encodes the text", () => {
    const href = mailtoHref("a.b@example.com", d)!;
    expect(href.startsWith("mailto:a.b@example.com?subject=")).toBe(true);
    expect(href).toContain("Hello%2C%0Aline%20%26%20more");
  });
  it("returns null when the link would be too long", () => {
    expect(mailtoHref(undefined, { subject: "S", body: "x".repeat(MAILTO_LIMIT) })).toBeNull();
  });
});

describe("Call link", () => {
  it("keeps digits and a leading plus", () => {
    expect(telHref("+49 89 0000 0005")).toBe("tel:+498900000005");
  });
  it("is null without a dialable number", () => {
    expect(telHref(undefined)).toBeNull();
    expect(telHref("n/a")).toBeNull();
  });
});
