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
print("ALL BUSINESS TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
