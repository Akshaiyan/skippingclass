"""The parity fixture the web app is tested against is derived from the engine. It must be exactly what the engine
produces today, otherwise the app could pass its test against stale answers. Run: python test_parity_fixture.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import export_parity_fixture  # noqa: E402

HERE = Path(__file__).parent
COMMITTED = HERE / "frontend" / "src" / "test" / "fixtures" / "engine_parity.json"
FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


with tempfile.TemporaryDirectory() as d:
    fresh_path = Path(d) / "engine_parity.json"
    export_parity_fixture.main(str(fresh_path))
    fresh = json.loads(fresh_path.read_text(encoding="utf-8"))
    committed = json.loads(COMMITTED.read_text(encoding="utf-8"))
    check("the committed fixture is what the engine produces now", fresh == committed,
          "run: python export_parity_fixture.py frontend/src/test/fixtures/engine_parity.json")
    bad = [c for c in fresh["cases"] if "~quote=" in c["case_id"]]
    check("the fixture includes claims whose quote cannot be read as an amount", len(bad) > 0, len(bad))
    check("none of those is expected to be routine", all(c["expected_v1"] != "routine_processing" for c in bad),
          [c["case_id"] for c in bad if c["expected_v1"] == "routine_processing"][:3])

print("ALL PARITY FIXTURE TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
