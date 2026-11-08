"""Writes the cross-engine parity fixture for the team's web app.

The app evaluates the rules in its own TypeScript evaluator. This fixture holds the rules in the app's format
and our engine's recommendation for each claim, so the app's test can prove both agree on the same claims.
Claims: the labelled development file, the practice file and the adversarial file (no synthetic data, which is
regenerated and not shipped).
Run: python export_parity_fixture.py <output.json>"""
import json
import triage
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import io_csv  # noqa: E402
import policy  # noqa: E402
import ui_view  # noqa: E402


def main(out_path):
    v1 = policy.load(ui_view.V1_PATH)
    v2 = policy.load(ui_view.V2_PATH)
    rows = []
    for name in ("labelled_development_cases.csv", "unlabelled_practice_cases.csv", "adversarial_claims.csv"):
        data, _ = io_csv.read_claims(HERE / name)
        rows += data
    # Every claim that has a quote is also checked with a quote that cannot be read as an amount. The app's evaluator
    # once cleared such claims as routine while the engine asked for information; these variants keep both in step.
    UNREADABLE = ("not-a-number", "-5", "1e3", "NaN", "12,5")
    variants = [({**r, "case_id": f"{r['case_id']}~quote={bad}", "quote_eur": bad})
                for r in rows if (r.get("quote_eur") or "").strip() for bad in UNREADABLE]
    cases = []
    for r in rows + variants:
        open_ = triage.status_of(r) == "open"
        cases.append({
            "case_id": r["case_id"],
            "facts": {k: ui_view.typed(v) for k, v in r.items() if k not in ui_view.NOT_FACTS},
            "expected_v1": policy.decide(r, v1)[0],
            "expected_v2": policy.decide(r, v2)[0] if open_ else None,
            "open": open_,
        })
    fixture = {
        "source": "our engine (policy.py) on policies/v1.json and policies/v2.json",
        "rules_v1": ui_view.to_ui_rules(v1),
        "rules_v2": ui_view.to_ui_rules(v2),
        "cases": cases,
    }
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(fixture, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(cases)} claims to {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
