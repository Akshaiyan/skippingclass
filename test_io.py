"""Tier 1 tests: messy input gives identical decisions; run.py handles a messy file. Run: python test_io.py"""
import csv, io, random, subprocess, sys, tempfile, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import engine, io_csv

HERE = Path(__file__).parent
clean = list(csv.DictReader(open(HERE/'labelled_development_cases.csv', encoding='utf-8')))
clean += list(csv.DictReader(open(HERE/'unlabelled_practice_cases.csv', encoding='utf-8')))
base = {r['case_id']: engine.decide(r)[0] for r in clean}
cols = list(clean[0].keys())

def encode(rows, delim, bom, crlf, enc, shuffle, german, rng):
    buf = io.StringIO(newline=''); order = cols[:]
    if shuffle: rng.shuffle(order)
    w = csv.writer(buf, delimiter=delim, lineterminator='\r\n' if crlf else '\n')
    w.writerow(order)
    for r in rows:
        vals = []
        for c in order:
            v = r.get(c, '')
            if german and c == 'quote_eur' and v:
                v = f"{float(v):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
            if german and c in io_csv.BOOL_FIELDS and v:
                v = {'True': 'ja', 'False': 'nein'}.get(v, v)
            vals.append(v)
        w.writerow(vals)
    if bom and enc == 'utf-8':
        return b'\xef\xbb\xbf' + buf.getvalue().encode('utf-8')
    return buf.getvalue().encode(enc)

FAILS = []
rng = random.Random(1); n = bad = 0
for delim in [',', ';', '\t', '|']:
    for bom in [False, True]:
        for crlf in [False, True]:
            for enc in ['utf-8', 'cp1252']:
                for shuffle in [False, True]:
                    for german in [False, True]:
                        rows, _ = io_csv.read_claims_text(io_csv.decode_bytes(encode(clean, delim, bom, crlf, enc, shuffle, german, rng))[0])
                        got = {r['case_id']: engine.decide(r)[0] for r in rows}
                        n += 1; bad += got != base
print(("PASS" if bad == 0 else "FAIL") + f": {n} encodings of {len(clean)} claims, mismatches {bad}")
if bad: FAILS.append('invariance')

with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'messy.csv')
    open(p, 'wb').write(encode(clean, ';', True, True, 'utf-8', True, True, rng))
    out = os.path.join(d, 'out.csv')
    res = subprocess.run([sys.executable, str(HERE/'run.py'), p, out], capture_output=True, text=True)
    ok = res.returncode == 0 and 'VALIDATION PASSED' in res.stdout
    print(("PASS" if ok else "FAIL") + ": run.py on BOM + semicolon + German-format file validates")
    if not ok: FAILS.append('run.py messy'); print(res.stdout, res.stderr)
BOM_TEXT = "﻿case_id,case_status,quote_eur\nA,open,\"1.500,00\"\n"
rows_direct, _ = io_csv.read_claims_text(BOM_TEXT)
ok_bom = len(rows_direct) == 1 and rows_direct[0]["case_id"] == "A" and rows_direct[0]["quote_eur"] == "1500.00"
print(("PASS" if ok_bom else "FAIL") + ": parser alone strips a byte-order mark and reads German amounts")
if not ok_bom: FAILS.append("bom direct")
print("ALL IO TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
