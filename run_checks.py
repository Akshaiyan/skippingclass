"""One command for judges and teammates: runs every test file and the batch/policy runs. Exit 0 only if all pass."""
import subprocess, sys
from pathlib import Path
HERE = Path(__file__).parent
PY = sys.executable
STEPS = [
    ("generate seeded synthetic test data (not shipped in the repo)", ["gen_synthetic.py", "10000", "1", "final_synthetic_10k.csv"]),
    ("main engine + validator + trace + log tests", ["test_all.py"]),
    ("release gate and override report", ["test_release_gate.py"]),
    ("suggestion engine", ["test_suggest.py"]),
    ("messy-input invariance and messy batch run", ["test_io.py"]),
    ("policy-as-data parity and load validation", ["test_policy.py"]),
    ("hash-chained log and history diff", ["test_history.py"]),
    ("batch run, v1 (practice file)", ["run.py", "unlabelled_practice_cases.csv", "_out_v1.csv"]),
    ("batch run, policy v2 limit 1200", ["run.py", "unlabelled_practice_cases.csv", "_out_v2.csv", "--policy", "policies/v2_limit_1200.json"]),
    ("batch run, policy v2 new trigger", ["run.py", "unlabelled_practice_cases.csv", "_out_v3.csv", "--policy", "policies/v2_new_trigger_ev.json"]),
    ("batch run, policy v2 (the change notice: limit 1200 + EV battery)", ["run.py", "unlabelled_practice_cases.csv", "_out_v4.csv", "--policy", "policies/v2.json"]),
    ("policy v2 against the notice: 118,098 combinations, boundaries, closed claims kept", ["test_v2.py"]),
    ("flip report for each prepared change", ["compare_policies.py"]),
    ("every allowed field combination, including blank repair type", ["exhaustive_shapes.py"]),
    ("JSON API over real sockets (four-eyes, override record, replay)", ["test_server.py"]),
    ("agreement statistics for a blinded labeller", ["test_agreement.py"]),
    ("document boundary: documents propose, never decide", ["test_doc_facts.py"]),
    ("business saving per policy change", ["test_business.py"]),
    ("before-and-after quality report for the v2 change", ["quality_report.py"]),
    ("brief quality counts: unit checks on hand-built pairs", ["test_quality_metrics.py"]),
    ("app-facing API, policy change summary and the sign-off gate", ["test_ui_view.py"]),
    ("input robustness: refusals, amounts, spellings (red-team findings)", ["test_robustness.py"]),
    ("monitoring report runs without a decision log", ["monitor_report.py"]),
    ("demo readiness: files, Python, Bun and ports", ["demo_check.py"]),
    ("brief quality counts: v1 against labels, v2 against the notice, changed cases", ["quality_metrics.py"]),
]
failed = []
for label, cmd in STEPS:
    r = subprocess.run([PY, str(HERE / cmd[0])] + cmd[1:], cwd=HERE, capture_output=True, text=True)
    ok = r.returncode == 0
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok:
        failed.append(label)
        print(r.stdout[-800:], r.stderr[-800:])
for f in ["_out_v1.csv", "_out_v2.csv", "_out_v3.csv", "_out_v4.csv"]:
    (HERE / f).unlink(missing_ok=True)
print("\nALL CHECKS PASSED" if not failed else f"\nFAILED ({len(failed)}): " + "; ".join(failed))
sys.exit(1 if failed else 0)
