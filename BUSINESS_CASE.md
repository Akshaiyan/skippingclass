# Business case: what a policy change costs, and what the system saves

Every number here comes from a command in this repository. Inputs are labelled. Nothing is measured on real claims.

## 1. Cost of one policy change (the number we can defend)

Command: `python business_model.py --policy policies/v2.json` (needs the seeded synthetic file, which `run_checks.py` regenerates).

| | Claims re-reviewed | Cost at EUR 45/h, 15 min per claim |
|---|---|---|
| Manual: re-review every open claim | 7,000 (20,000 claims x 35% open, ASSUMED) | EUR 78,750 |
| With the system: re-review only the flips | about 1,105 (flip share 15.8%, MEASURED-PROXY) | EUR 12,423 |
| **Saving per change, full v2** | | **EUR 66,327** |

The limit-only change (quote limit 1,200, no EV trigger) gives a flip share of 11.5% and a saving of EUR 69,722. This is checked in `test_business.py`.

**What the flip share depends on.** The flip share is measured on synthetic claims, whose distribution is ASSUMED. On the 12 practice claims the share is 40% (4 of 10 open), and the Wilson 95% interval is 17% to 69%. Real claims may sit anywhere in that range, so the saving may be larger or smaller. Treat EUR 66k as a central estimate, not a forecast.

## 2. Annual triage (not claimed)

`business_model.py` also computes annual handling cost, but it depends on the routine share of real claims, which we do not have. We do not state an annual figure. The formula is in `business_model.py`, and the inputs are in `assumptions.json`.

## 3. Assumptions register

| Input | Value | Status |
|---|---|---|
| Claims per year | 20,000 | ASSUMED: illustrative mid-sized motor insurer |
| Handler time, manual triage | 12 min per claim | ASSUMED |
| Handler time, confirm routine | 1 min per claim | ASSUMED |
| Handler time, information request | 4 min per claim | ASSUMED |
| Re-review time per affected claim | 15 min | ASSUMED |
| Handler cost | EUR 45 per hour | ASSUMED: fully loaded |
| System running cost | EUR 60,000 per year | ASSUMED: licence, hosting, maintenance |
| Open claims at any time | 35% | ASSUMED |
| Cost of one wrong routine decision | EUR 2,000 | ASSUMED: illustrative leakage |
| Flip share at v2 | 15.8% | MEASURED-PROXY: replay on synthetic claims |
| Routine share of claims | from practice mix | MEASURED-PROXY: 7 of 12 practice claims route to routine under v1 |

## 4. What is not measured

- Real accuracy. The 14 organiser labels are the only independent labels, and they are too few to measure accuracy.
- The real flip share on real claims (see section 1).
- The cost of wrong routine decisions. It is an assumption, not an observed rate.
- Handler time. Every time in the register is ASSUMED.
