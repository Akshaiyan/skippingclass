# Master prompt: Pitch deck, Aegis claims triage (Taktile case, thinc! Munich Hack)

> Owner: Elias. Created 2026-11-08. This prompt sets up a team of sub-agents. Together they build
> the base version of the pitch deck as a Claude Design slide deck (the Slides artifact type).
> Fill in the `[RESEARCH]` block below before running it.

---

## 0. Your role

You lead a small pitch studio: a story writer, a revenue strategist, a product/demo lead, a design-system
translator, a slide builder and a red-team jury. Your job is to produce the **base version** of a
hackathon pitch deck that the team will refine together. It does not need to be final. Every slide has
to be clean, consistent and easy to extend. Work in the phases in section 6. Run the parallel phases
with sub-agents, then merge their output yourself. Do not hand your conclusions to the sub-agents.
Give each one the source files it needs.

## 1. Sources of truth (read before writing anything)

| What | Where |
|---|---|
| Product (frontend, the app we demo) | `~/skippingclass`, branch `frontend-lovable`. Read `src/routes/*`, `src/components/*`, `src/copy.ts`, `src/styles.css`, `src/lib/savings.ts`, `AGENTS.md`, `roadmap.md` |
| Engine, evidence, business case | `git show origin/main:<file>` in `~/skippingclass`: `README.md`, `BUSINESS_CASE.md`, `DEMO_SCRIPT.md`, `DESIGN.md`, `MONITORING.md`, `PLAYBOOK_v2.md`, `assumptions.json` |
| Project context and copy rules | `~/taktile-claims-triage/PROJECT_CONTEXT.md` |
| Architecture | `~/Downloads/Taktile_Architecture.pdf` |
| Policy v2 change notice | `~/Downloads/20261105_Taktile_thinc! Hackathon policyv2.pdf` |
| UI screenshots | `~/taktile-claims-triage/Screenshot 2026-11-07 at *.png`. Take fresh screenshots of the running app if you can (`bun run dev` in `~/skippingclass`) |
| Logo | `src/components/AegisLogo.tsx` (wordmark "Aegis", tagline "Truth in triage") |

Where the repo and this prompt disagree, the repo wins. Report each disagreement.

## 2. The research block (filled in by the team)

```
[RESEARCH]
<!-- Paste the team's market research here: Taktile's positioning, customers and pricing model;
     insurance market size (DACH/EU motor claims, claims per year, handling cost per claim);
     competitors (Shift Technology, Guidewire, Duck Creek, in-house rules engines); quotes;
     sources with links. Every figure carries one of these tags: SOURCED (with link) / ASSUMED / DERIVED. -->
[/RESEARCH]
```

If this block is empty, do not invent any market figures. Leave a visible placeholder on the slide
instead: `[figure from research: …]`.

## 3. Strategic frame (the most important part)

### 3.1 We pitch a product feature, not a startup
We are **not** a startup that wants to raise money. We pitch **a feature, or a vertical, inside
Taktile's decision platform.** Taktile wants to build insurance (claims) into a vertical of its own.
Our story: *"This is what Taktile looks like in insurance claims, and it is ready to show today."*
- No "we are raising", no team-as-founders slide, no cap table, no "our startup".
- Instead: how the feature fits Taktile's platform (decision flows, rules as data, versioning,
  audit), which customer problem it opens up, and how it **grows Taktile's revenue**.
- Name: "Aegis" is the product name in our UI. On the slides, frame it as a feature, for example
  "Aegis: claims triage, built as a Taktile decision flow". Mark the naming as an
  **open decision** in the speaker notes.

### 3.2 The jury: VCs plus Taktile
Several jurors come from venture capital. They care about **revenue, market size, scalability and
expansion**. The Taktile jurors care about **product fit, the decision-platform logic, trust and
regulatory safety (auditability)**. Every slide must speak to at least one of the two groups. The
revenue logic runs through the whole deck. It is not hidden on one slide at the end.

Revenue thread for the VC jurors, always told as revenue **for Taktile**:
1. **Wedge:** one clear pain (triage plus policy changes) at motor insurers.
2. **Land:** usage-based pricing per decision or claim, or a platform licence. Pick the model that
   fits the research block. Mark it ASSUMED otherwise.
3. **Expand:** more lines of business (motor, then home, health, liability), more decision points
   (FNOL, fraud flag, recovery), more insurers. The same engine runs each new one as a new policy file.
4. **Proof of value per customer:** the measurable saving per policy change (see 3.3). This is the
   ROI argument in the sales conversation.

### 3.3 Honesty rules (do not break them, and use them as a selling point)
Honesty is part of the product. "Every number traces to a command you can rerun" is a trust argument
that VCs and Taktile both respect. Rules:
- Every figure carries a tag: **SOURCED / ASSUMED / DERIVED / MEASURED-PROXY / NOT MEASURED**, set
  small, in the chip style of the app.
- Never claim "accurate", accuracy percentages on real claims, "predicts", "learns", "AI decides",
  "new" or "first". Allowed: "consistent with the written policy", "14 of 14 organiser cases",
  "118,098 field combinations checked against the v2 notice".
- On claim actions, never use Approve, Decline, Pay, Reject or Settle. The tool *recommends next
  steps*, and a person decides.
- Lead with the **efficiency floor**, then the upside as a range.
- Core numbers from the repo (check them in `BUSINESS_CASE.md` before you use them):
  - One policy change, checked by hand: about **EUR 78,750** (7,000 open claims × 15 min × EUR 45/h, ASSUMED)
  - With Aegis, only the flipped claims: about **EUR 12,423** (flip share 15.8%, MEASURED-PROXY)
  - **About EUR 66k saved per policy change** (DERIVED; range: practice flip share 17–69%, Wilson 95%)
  - Payback in the efficiency-only case: about 14.5 months; with assumed error savings about
    3.4 months (ASSUMED, check in the repo)
  - Do not state an annual triage figure. The repo deliberately does not claim one.

## 4. Pitch structure (best practice for hackathon product demos)

Format: **5 minutes of pitch plus Q&A** by default (change it if the team says otherwise). About
10 slides. One message per slide. The headline is a full statement, not a label. The live demo is
the centre of the pitch. The slides frame it; they do not replace it.

| # | Slide | Goal | Time |
|---|---|---|---|
| 1 | **Story opener** | A concrete scene: a claims handler on the morning a policy change takes effect (v2: limit drops to EUR 1,200, EV batteries go to review). Thousands of open claims, and no one knows which of them are affected. One human sentence, one number. Fictional, marked as such. | 30 s |
| 2 | **Problem** | The problem statement from `copy.ts` (no euro figure in the headline). Two pains: hand triage, and blind policy changes. | 20 s |
| 3 | **Why this matters to Taktile** | Insurance as Taktile's next vertical: same platform, new decision type. Market figures from `[RESEARCH]`. | 30 s |
| 4 | **The feature in one picture** | Claim, then three rules, then one of three next steps (green, yellow, red), with the human in control. The flow is shown as a Taktile decision flow. | 20 s |
| 5 | **Live demo** (transition slide) | The three demo moments: (a) open a red case and see why, (b) override with a reason, which lands in the log, (c) policy change v2 with flip list, four-eyes check and "Release v2". Fallback: a recorded video. | 2 min |
| 6 | **Policy change without flying blind** | Before-and-after: which open claims flip, closed claims stay locked, sign-off required. Screenshot of the Policy page. | 20 s |
| 7 | **Business case for the insurer** | EUR 78.75k → EUR 12.4k per policy change, with tags and the range. The ROI argument in Taktile's sales conversation. | 30 s |
| 8 | **Revenue for Taktile** | Land and expand: pricing model, expansion lines, decision points, sized with `[RESEARCH]` figures. The core slide for the VC jurors. | 30 s |
| 9 | **Why trust it** | 14/14, 118,098 combinations, hash-chained log, four-eyes check, "consistency, not accuracy". The honesty is part of the pitch. | 20 s |
| 10 | **Close** | One sentence that calls back to the opening story, plus a concrete next step with Taktile (for example a pilot with one insurer on one line of business). | 10 s |

Optional backup slides after the close (for Q&A): assumptions register, architecture, open questions
for the organiser, limits.

Best-practice rules for every slide:
- At most 1 headline, 1 visual and 3 supporting lines. Anything more goes in the speaker notes.
- Show product screenshots, not illustrations. Numbers as large display figures.
- Speaker notes on every slide: what to say (spoken English, short sentences), the time budget, the
  transition to the next slide.
- Close the story loop: the person from slide 1 reappears on slide 10.

## 5. Design system (identical to the software)

The deck must look as if it came out of the app. Use the tokens from `src/styles.css`:

- **Look:** a monochrome instrument panel, white, black and grey. Colour appears **only as small
  status signals** (dots, bars, chips), never as large fills.
- **Colours (oklch):** background `1 0 0`; surface `0.985 0 0`; surface-2 `0.967 0.001 286.4`;
  border `0.92 0.004 286.3`; foreground `0.145 0 0`; text-2 `0.37 0.012 285.8`; muted
  `0.552 0.014 285.9`. Status: green `0.627 0.17 149.2`, yellow `0.681 0.142 75.8`, red
  `0.577 0.215 27.3`, **Unknown/indigo** `0.54 0.184 278.3` (only for "not provided, not assumed").
  Charts: grey `0.42 / 0.82 0.005 286`, plus muted red, yellow and green at `0.65–0.75` lightness.
- **Typography:** **Oxanium** for headlines and large numbers (square letterforms that match the
  Aegis wordmark). **Inter** for body text. **JetBrains Mono** only for IDs and hashes (for example
  `PRA-007`, `sha256:…`). Eyebrows in sentence case, 12 px, muted, never all caps.
- **Shape:** border radius **0** everywhere. Square corners on boxes, chips and frames. Shadows only
  very soft (`0 1px 2px / 0.04, 0 4px 16px / 0.04`).
- **Spacing:** 4-point grid, a lot of whitespace, one focal point per slide.
- **Signature elements from the app:** the thin flow bar (red | yellow | green in proportion), tag
  chips like `ASSUMED` and `DERIVED` in outline style, the policy stamp `v1 · sha256:…`, the Aegis
  logo at the top left.
- Icons: lucide, always paired with a text label.

## 6. Workflow with sub-agents

**Phase A, in parallel (4 agents):**
1. **Product/demo lead:** reads the repo, runs the app and screenshots Dashboard, Claims plus Case
   sheet, Policy change, Cost impact and Decision log. Delivers: screenshot paths, the 3 strongest
   demo moments, the exact click path.
2. **Story writer:** writes 2 or 3 variants of the opening scene (at most 60 spoken words each)
   and the matching close. Concrete, human, no buzzwords, marked as fictional.
3. **Revenue strategist:** builds the land-and-expand logic for Taktile from `[RESEARCH]` and
   `BUSINESS_CASE.md`. Every figure tagged. Delivers: the content for slides 3, 7 and 8, plus 5 likely
   VC questions with answers.
4. **Design-system translator:** turns section 5 into a deck theme (master layouts: title,
   statement, screenshot, number, two-column, backup) and checks contrast.

**Phase B (you):** merge everything into a storyboard: one line of headline per slide, the visual,
the speaker notes. Pick the strongest story variant and give the reason.

**Phase C:** build the deck as a Claude Design slide deck (Slides artifact type) on the theme from A4.
Content in English.

**Phase D, red-team jury (2 agents, in parallel, each sees only the finished deck):**
- *VC juror:* "Where is the revenue? How big? Why Taktile? What scales?"
- *Taktile juror:* "Does this fit our platform? Is it audit-proof? Is it a feature and not a startup?"
- Plus a check of the copy rules: banned words, missing tags, numbers without a source.
Fix the findings that hold up.

## 7. Deliverable

1. The Claude Design deck (link), about 10 main slides plus backup, with speaker notes.
2. A short list: open decisions (product name, pricing model, demo length, story variant), figures
   still missing from research, and anything that could not be verified.

This is a **base version**. Prefer clear, easily editable layouts over finished detail.
