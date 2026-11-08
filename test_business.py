"""Business per-policy saving: must reproduce the earlier measured figure for the 1200 limit, and a
policy that flips nothing must save nothing. Run: python test_business.py"""
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import business_model as b
FAILS = []
def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok: FAILS.append(name)
r = b.policy_change_saving(str(Path(__file__).parent / "policies" / "v2_limit_1200.json"))
# Figure from the seeded generator (seed 1, 10,000 claims). An earlier file that could not be regenerated gave
# EUR 70,122; the saving changed when the data was regenerated, so the seed is the reference, not the old number.
check("1200-limit saving with the seeded synthetic file is EUR 69,722", r["saving_eur"] == 69722, r)
check("the result labels its status as proxy with ASSUMED costs", "proxy" in r["status"] and "ASSUMED" in r["status"], r)
with tempfile.TemporaryDirectory() as d:
    same = Path(d) / "same.json"
    v1 = json.loads((Path(__file__).parent / "policies" / "v1.json").read_text(encoding="utf-8"))
    v1["name"] = "same_as_v1"
    same.write_text(json.dumps(v1), encoding="utf-8")
    z = b.policy_change_saving(str(same))
    check("a policy identical to v1 flips nothing and saves nothing", z["flip_share"] == 0 and z["saving_eur"] == 0, z)
# Annual figures at the practice mix (7 routine, 2 request-information, 3 human review of 12), ASSUMED inputs.
manual, system = b.annual_triage_cost(7 / 12, 2 / 12, 3 / 12)
check("annual triage today is EUR 180,000 and with the system EUR 63,750", round(manual) == 180000 and round(system) == 63750, (manual, system))
saving = manual - system
payback = b.val("system_running_cost_eur_per_year") / saving * 12
check("year-1 net benefit is EUR 56,250 and payback 6.2 months", round(saving - b.val("system_running_cost_eur_per_year")) == 56250 and round(payback, 1) == 6.2, (saving, payback))
# Cost of errors and the threshold it sets.
e = b.error_costs(7 / 12)
check("an unnecessary escalation costs EUR 8.25 extra", e["extra_cost_unnecessary_escalation_eur"] == 8.25, e)
check("a claim goes to a person once the chance of a wrong routine decision exceeds 0.41%", e["escalate_above_error_probability"] == 0.0041, e)
half = next(r for r in e["annual_cost_by_wrong_routine_rate"] if r["wrong_routine_rate"] == 0.005)
check("a 0.5% wrong-routine rate costs EUR 116,667 a year", half["annual_error_cost_eur"] == 116667, half)
check("a zero error rate costs nothing", e["annual_cost_by_wrong_routine_rate"][0]["annual_error_cost_eur"] == 0, e)
print("ALL BUSINESS TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
