// UI stress in Chrome: rapid override clicks (at most one record may be written), an injected 500, and a timing-out API.
// Run after the app and the engine are up. Usage: APP_URL=... CDP_PORT=... node tools/stress_ui.mjs
const APP = process.env.APP_URL || 'http://127.0.0.1:3320';
const CDP = process.env.CDP_PORT || '9341';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ': ' + name + (ok ? '' : ' -> ' + String(detail).slice(0, 200)));
};
const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.text);
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result?.value;
const waitFor = async (e, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await ev(`!!(${e})`)) === true) return true; await sleep(150); }
  return false;
};
const decisionCount = () => ev(`(() => { const m = document.body.innerText.match(/(\\d+) decisions?/); return m ? Number(m[1]) : 0; })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: APP + '/claims' });
await waitFor('document.body.innerText.includes("LIVE POLICY") && /sha256:(?!a1b2c3)/.test(document.body.innerText)');

const openCase = async (caseId) => {
  await ev(`(() => { const el = [...document.querySelectorAll('td,span,div')].find(e => e.childElementCount === 0 && e.textContent.trim() === '${caseId}'); el?.closest('tr')?.click(); })()`);
  return waitFor(`(document.querySelector('[role=dialog]')?.innerText || '').includes('${caseId}')`);
};

// Failure modes are read from localStorage on every page load, so they survive the navigation.
const INJECT = `(() => { const mode = (() => { try { return localStorage.getItem('stressMode') || ''; } catch (e) { return ''; } })();
  if (!mode) return;
  const orig = window.fetch;
  window.fetch = async (u, o) => {
    if (!String(u).includes('/api/')) return orig(u, o);
    if (mode === 'fail500') return new Response('{"error":"boom"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
    if (mode === 'timeout') { await new Promise((r) => setTimeout(r, 1500)); throw new TypeError('Failed to fetch'); }
    return orig(u, o);
  };
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
const setMode = (mode) => ev(`(() => { try { mode => 0; } catch (e) {} localStorage.setItem('stressMode', '${mode}'); return true; })()`);

// 1. Rapid clicks on the override submit: at most one new decision may be recorded
check('a case opens for the rapid-click test', await openCase('PRA-007'));
await ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(x => x.textContent.trim() === 'Override recommendation'); b && b.click(); })()`);
await waitFor(`!!document.querySelector('[role=dialog] input[type=radio]')`);
const fill = await ev(`(() => {
  const groups = [...document.querySelectorAll('[role=dialog] [role=radiogroup]')];
  const pick = (g) => { const r = g && [...g.querySelectorAll('[role=radio]')].find((x) => !x.disabled); if (r) r.click(); return !!r; };
  const routine = groups[0] && [...groups[0].querySelectorAll('[role=radio]')].find((x) => !x.disabled && x.innerText.includes('Routine'));
  if (routine) routine.click();
  const toOk = !!routine;
  const reasonOk = pick(groups[1]);
  const name = [...document.querySelectorAll('[role=dialog] input')].find((i) => i.type === 'text');
  if (name) { name.value = 'Stress Tester'; name.dispatchEvent(new Event('input', { bubbles: true })); }
  const note = document.querySelector('[role=dialog] textarea');
  if (note) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(note, 'stress note'); note.dispatchEvent(new Event('input', { bubbles: true })); }
  return { to: toOk, reason: reasonOk, name: !!name, note: !!note };
})()`);
await sleep(400);
const recordEnabled = await ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(x => x.textContent.trim() === 'Record override'); return !!b && !b.disabled; })()`);
const why = await ev(`(() => (document.querySelector('[role=dialog]')?.innerText || '').split(String.fromCharCode(10)).join(' | ').slice(-500))()`);
console.log('DIALOG TAIL: ' + why);
check('the record button is enabled before the rapid clicks (so the test is not vacuous)', recordEnabled === true, 'see DIALOG TAIL');
check('override form is filled', fill && fill.to && fill.reason && fill.name && fill.note, JSON.stringify(fill));
await sleep(500);
const before = await decisionCount();
for (let i = 0; i < 200; i++) {
  await ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(x => x.textContent.trim() === 'Record override'); b && b.click(); })()`);
}
await sleep(4000);
const after = await decisionCount();
check('200 rapid clicks record at most one correction', after - before >= 0 && after - before <= 1, `before ${before}, after ${after}`);

// 2. An injected 500 on the case endpoint: a visible state, not a blank page
await setMode('fail500');
await send('Page.navigate', { url: APP + '/claims' });
await sleep(5000);
const shown500 = await ev(`document.body.innerText.includes('Demo data') || document.body.innerText.includes('not reachable')`);
check('an injected 500 shows a visible state, not a blank page', shown500 === true, shown500);

// 3. A timing-out API: after the timeout the page must say so
await setMode('timeout');
await send('Page.navigate', { url: APP + '/claims' });
await sleep(7000);
const visible = await ev(`document.body.innerText.includes('Demo data') || document.body.innerText.includes('not reachable')`);
check('an unreachable API shows the demo notice after the timeout', visible === true, visible);
await setMode('');
check('no uncaught page errors during the stress run', errs.length === 0, errs.join(' | '));
console.log(failures === 0 ? 'UI STRESS PASSED' : `FAILED: ${failures}`);
ws.close();
process.exit(failures ? 1 : 0);
