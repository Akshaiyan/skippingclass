// How far a quote sits from the quote limit, in words. Pure and rule-derived: it uses only the real limits of the
// two policy versions and the quote on file, and it never invents a value. A quote that cannot be read as an amount
// gets no margin (the engine treats it as unknown).
import { eur } from "@/lib/claim-view";

const PLAIN_AMOUNT = /^[0-9]+(\.[0-9]+)?$/;

export function quoteAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw === "string" && PLAIN_AMOUNT.test(raw.trim())) return Number(raw.trim());
  return null;
}

/** One phrase for one limit. A quote exactly at the limit stays within it. */
export function marginPhrase(quote: number, limit: number, version: string): string {
  if (quote === limit) return `exactly at the ${version} limit of ${eur(limit)}, which stays within it`;
  const gap = Math.abs(quote - limit);
  return quote > limit
    ? `${eur(gap)} over the ${version} limit of ${eur(limit)}`
    : `${eur(gap)} under the ${version} limit of ${eur(limit)}`;
}

/** The margin against each limit that is known, v1 first. Empty when the quote is missing or unreadable. */
export function quoteMargins(
  rawQuote: unknown,
  limits: { v1?: number | null; v2?: number | null },
): string[] {
  const q = quoteAmount(rawQuote);
  if (q === null) return [];
  const out: string[] = [];
  if (typeof limits.v1 === "number") out.push(marginPhrase(q, limits.v1, "v1"));
  if (typeof limits.v2 === "number" && limits.v2 !== limits.v1) out.push(marginPhrase(q, limits.v2, "v2"));
  return out;
}
