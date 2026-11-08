// Turns what a person said ("practice seven", "P R A zero zero seven", "7") into a case id like PRA-007.
// Speech-to-text hands the agent loose wording, so the match is forgiving but never guesses between claims.

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const FILLER = new Set([
  "case",
  "claim",
  "number",
  "no",
  "the",
  "id",
  "please",
  "open",
  "show",
  "me",
]);

const PREFIXES: { prefix: string; spoken: string[][] }[] = [
  { prefix: "PRA", spoken: [["pra"], ["practice"], ["p", "r", "a"]] },
  { prefix: "DEV", spoken: [["dev"], ["development"], ["d", "e", "v"]] },
  { prefix: "DOC", spoken: [["doc"], ["document"], ["d", "o", "c"]] },
];

export interface ParsedCaseId {
  /** Canonical id such as "PRA-007", or null when nothing usable was said. */
  id: string | null;
}

export function parseCaseId(input: string): ParsedCaseId {
  const tokens = String(input ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !FILLER.has(t));
  if (!tokens.length) return { id: null };

  // "pra007" and "dev13" arrive as one token: split the letters from the digits.
  const glued = /^([a-z]+)(\d+)$/.exec(tokens[0]!);
  if (glued && tokens.length === 1) tokens.splice(0, 1, glued[1]!, glued[2]!);

  let prefix = "PRA";
  let rest = tokens;
  for (const p of PREFIXES) {
    const hit = p.spoken.find((s) => s.every((w, i) => tokens[i] === w));
    if (hit) {
      prefix = p.prefix;
      rest = tokens.slice(hit.length);
      break;
    }
  }

  let digits = "";
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]!;
    if (/^\d+$/.test(t)) digits += t;
    else if (t in TENS) {
      const next = rest[i + 1];
      const unit = next !== undefined && next in UNITS && UNITS[next]! >= 1 && UNITS[next]! <= 9;
      digits += String(TENS[t]! + (unit ? UNITS[next!]! : 0));
      if (unit) i++;
    } else if (t in UNITS) digits += String(UNITS[t]);
    else return { id: null };
  }
  if (!digits) return { id: null };
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n)) return { id: null };
  return { id: `${prefix}-${String(n).padStart(3, "0")}` };
}

/** The claim a spoken id points at, or null. `parsed` is set even when the claim isn't loaded. */
export function resolveCaseId<T extends { case_id: string }>(
  input: string,
  claims: T[],
): { claim: T | null; parsed: string | null } {
  const exact = claims.find(
    (c) =>
      c.case_id.toLowerCase() ===
      String(input ?? "")
        .trim()
        .toLowerCase(),
  );
  if (exact) return { claim: exact, parsed: exact.case_id };
  const { id } = parseCaseId(input);
  return { claim: (id && claims.find((c) => c.case_id === id)) || null, parsed: id };
}
