# Pitch slides: Aegis claims triage (Taktile case)

This branch holds **only the pitch**. It shares no history with the app code. It is not connected to
Lovable, so nothing here reaches the frontend.

## Contents

| Path | What it is |
|---|---|
| `PITCH_MASTER_PROMPT.md` | Master prompt: story, revenue frame, slide structure, design system, sub-agent workflow |
| `slides/` | The slide deck itself (the source file plus exports such as PDF) |
| `assets/` | Screenshots of the app, logo, charts used on the slides |

## How we work together (Elias and Finn)

1. Pull before you start: `git pull --rebase`
2. Make small, focused commits, one topic each (for example "Slide 7: business case figures").
3. Push right away: `git push`. Do not keep large local changes.
4. **Never force push.**
5. To avoid conflicts in the deck file, say in chat which slides you are working on.
6. Every figure on a slide carries its tag (SOURCED / ASSUMED / DERIVED / MEASURED-PROXY), as the master prompt requires.

Set up the branch locally:

```sh
git fetch origin
git switch pitch-slides
```
