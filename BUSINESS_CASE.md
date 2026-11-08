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

## 2. Annual triage today and with the system, net benefit, payback

Command: `python business_model.py`. Every input is in the assumptions register below and in `assumptions.json`; replace them with the insurer's own figures and the model recomputes.

| Per year, 20,000 claims (ASSUMED) | EUR |
|---|---|
| Triage today: every claim handled by a person, 12 min at EUR 45/h | 180,000 |
| Triage with the system: routine confirmed in 1 min, information requests 4 min, human review 12 min | 63,750 |
| Saving | 116,250 |
| System running cost (ASSUMED) | 60,000 |
| **Net benefit, year 1** | **56,250** |
| **Payback** | **6.2 months** |

The case mix is the practice mix, 7 routine, 2 request information and 3 human review of 12 claims (MEASURED-PROXY, very small). A real portfolio will have a different mix, so the saving moves with it. These figures are before the cost of errors in section 3, which can use up the saving.

## 3. Cost of errors, and where it sets the threshold

A wrong routine decision is far more expensive than an unnecessary escalation, and the model shows by how much. Costs are ASSUMED: a wrong routine decision leaks EUR 2,000; an unnecessary escalation costs a full manual review instead of a one-minute confirmation, which is EUR 8.25 more. Same command as section 2.

**Measured error rates, by version.** On the 14 organiser labels, v1 agrees on 14 of 14: 0 wrong routine decisions and 0 unnecessary escalations (`quality_metrics.py`). Under v2, `quality_report.py` shows 2 of the 14 labelled claims (DEV-010, DEV-011) move from routine to human review, and no open claim gets worse. If v1 were left in place after the change notice, those 2 would be wrong routine decisions. Fourteen cases are too few to state a rate, so we do not extrapolate one. We sweep it instead:

| Wrong-routine rate | Wrong decisions a year | Leakage a year (EUR) |
|---|---|---|
| 0.0% | 0 | 0 |
| 0.5% | 58 | 116,667 |
| 1.0% | 117 | 233,333 |
| 2.0% | 233 | 466,667 |

**What this does to the threshold.**
- A wrong routine decision costs about 240 times an unnecessary escalation. Sending a claim to a person is cheaper than sending it to routine whenever the chance it is wrong is above **0.41%**. So the system sends a claim to routine only when every deciding fact is known and in range. A blank, unreadable or conflicting field never reaches routine.
- The year-1 net benefit in section 2 is used up if more than **0.24%** of routine decisions are wrong. The business case therefore depends on the wrong-routine rate staying very low, not on handling speed. That is why the next test before production is a sampled audit of routine decisions on real claims (see section 5).

## 4. Assumptions register

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

## 5. What is not measured, and the next test

- Real accuracy. The 14 organiser labels are the only independent labels, and they are too few to measure accuracy.
- The real flip share on real claims (see section 1).
- The cost of wrong routine decisions. It is an assumption, not an observed rate.
- Handler time. Every time in the register is ASSUMED.

**Next test before production.** Run the system in shadow on a few thousand real, recently closed claims and have a handler audit a random sample of its routine decisions against the final outcome. Pass only if the wrong-routine rate, with its confidence interval, stays below the 0.24% line in section 3. Until then the business case is a model on stated assumptions, not a forecast.
