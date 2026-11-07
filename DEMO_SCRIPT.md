# Three-minute demo script (Taktile claims triage)

Run every command from the repository root. Each step shows the expected output so a presenter can see at a glance whether it worked.

## 0. Before the demo (one minute, once)
    python run_checks.py            # expect: ALL CHECKS PASSED
If anything fails, do not demo live: play the recorded fallback instead.

## 1. Easy claim, routed to routine (30 s)
    python -m json.tool <(python -c "import server,json; print(json.dumps(server.handle('GET','/api/case/PRA-001',{},{})[1]))") | head -20
Say: "This claim has complete evidence and no review trigger. The rule that decided is R3, routine. Routine does not mean payment is approved."

## 2. Incomplete claim with the suggestion (40 s)
    python -c "import server,json; print(json.dumps(server.handle('GET','/api/case/PRA-006',{},{})[1]['suggestion'], indent=1))"
Say: "The itemised quote is missing. The system does not guess. It names the document to request, and says it is not a prediction."

## 3. Policy change: flips and sign-off (60 s)
    python run.py unlabelled_practice_cases.csv out_v2.csv --policy policies/v2_limit_1200.json
Expected: "v2 ... 2 flips" lines and VALIDATION PASSED.
Say: "A proposed change is replayed on every stored claim before release. Closed claims keep their original decision. Any move into routine needs a named sign-off."

## 4. Live reviewer override (40 s)
    python -c "import server,json; print(json.dumps(server.handle('POST','/api/override',{},{'case_id':'PRA-001','actor':'reviewer-demo','reason':'demo override','policy_version':'v1','corrected_recommendation':'human_review'})[1], indent=1))"
Expect: correction, reason, reviewer and policy version echoed back.
Then: `python history.py verify` (expect: log intact).
Say: "The override is recorded with the four items judges check. The log is hash-chained, so an edit is detectable."

## 5. Honest measurement (20 s)
Show `README.md`, the evidence table. Say: "We match all 14 organiser labels; with 95% confidence accuracy on those cases is at least about 81%. We make no claim on the hidden set."

## Close (10 s)
"Every number here traces to a command you can rerun, and the parts that are not built are named as such."

## Fallback
Record the four steps once beforehand (screen capture). If a live command fails, play the recording and say so.
