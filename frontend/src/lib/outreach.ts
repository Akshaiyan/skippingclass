// What a handler sends or says to the claimant. Pure functions: this tool drafts, it never sends.
import type { Claim } from "@/types";
import { fieldLabel } from "@/lib/fields";
import { missingFacts } from "@/lib/claim-view";

export interface Draft {
  subject: string;
  body: string;
}

/** The email for a claim. Missing information lists what is needed; other flows get a short update. */
export function draftEmail(claim: Claim): Draft {
  const subject = `Your motor claim ${claim.case_id}`;
  if (claim.flow === "yellow") {
    const items = missingFacts(claim).map((f) => `- ${fieldLabel(f)}`);
    return {
      subject,
      body: `Hello,\n\nTo continue with your claim ${claim.case_id} we need the following:\n${items.join("\n")}\n\nPlease reply with these at your convenience. Thank you.\n\nKind regards,\nClaims team`,
    };
  }
  return {
    subject,
    body: `Hello,\n\nThank you for reporting your claim. A member of our team is looking at it. We will update you on the next step shortly.\n\nKind regards,\nClaims team`,
  };
}

/** The draft as plain text with its subject line, for copying. */
export const draftAsText = (d: Draft) => `Subject: ${d.subject}\n\n${d.body}`;

/** Mail links stop working around 2,000 characters in many clients. */
export const MAILTO_LIMIT = 1900;

/** A mailto link, or null when the encoded link is too long to rely on (copy the text instead). */
export function mailtoHref(to: string | undefined, d: Draft): string | null {
  const href = `mailto:${to ? encodeURIComponent(to).replace(/%40/g, "@") : ""}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
  return href.length > MAILTO_LIMIT ? null : href;
}

/** A tel link for a phone number, keeping digits and a leading plus. Null when nothing dialable is left. */
export function telHref(phone: string | undefined): string | null {
  const cleaned = (phone ?? "").replace(/[^\d+]/g, "");
  return /\d/.test(cleaned) ? `tel:${cleaned}` : null;
}
