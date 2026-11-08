// Fallback recording: ordered screenshots of the standalone reviewer page with captions, plus index.html.
// Needs Chrome on CDP_PORT and reviewer.html in REVIEW_DIR (a folder path). Output: OUT_DIR (default demo_fallback).
// Usage: REVIEW_DIR=/path/to/folder API_PORT=8000 node tools/make_fallback.mjs
import fs from 'node:fs';
const OUT = process.env.OUT_DIR || 'demo_fallback';
const REVIEW_DIR = process.env.REVIEW_DIR || '';
const API_PORT = process.env.API_PORT || '8000';
const CDP = process.env.CDP_PORT || '9341';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result?.value;
fs.mkdirSync(OUT, { recursive: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const url = `file:///${REVIEW_DIR}/reviewer.html?port=${API_PORT}`;
const steps = [
  { caption: '1. The queue: the practice claims, grouped by outcome, with the count for each.', click: null },
  { caption: '2. A request-information claim: the missing item is named, and the next step says what would change the decision.', click: 'PRA-006' },
  { caption: '3. The decision memory for this claim: earlier corrections with reviewer, reason and policy version, and whether the log is intact.', click: 'PRA-006' },
];
const shots = [];
for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  await send('Page.navigate', { url });
  await sleep(2500);
  if (s.click) {
    await ev(`(() => { const b = [...document.querySelectorAll('button.case-btn')].find(x => x.dataset.id === '${s.click}'); b && b.click(); })()`);
    await sleep(1200);
  }
  const name = `step_${i + 1}.png`;
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  shots.push({ name, caption: s.caption });
}
const figures = shots.map((s) => `<figure><img src="${s.name}" alt="${s.caption}"><figcaption>${s.caption}</figcaption></figure>`).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fallback walkthrough</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px}figure{margin:0 0 28px}img{max-width:100%;border:1px solid #ccc}figcaption{margin-top:8px}</style>
</head><body>
<h1>Fallback walkthrough, recorded from the reviewer page</h1>
${figures}
</body></html>
`;
fs.writeFileSync(`${OUT}/index.html`, html, 'utf-8');
console.log(`wrote ${shots.length} frames and index.html to ${OUT}`);
ws.close();
