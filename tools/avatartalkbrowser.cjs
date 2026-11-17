// #2038: close-ups of free hands at rest / walking / running, a talk-gesture frame strip, held things keeping their grip while talking.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatartalkbrowser.cjs http://localhost:8238 docs/verification/2038
// (BEFORE=1: only the hand close-ups and the talk strip, no assertions about the new behaviour, for docs/verification/2038/before.)
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8238', out = 'docs/verification/2038'] = process.argv.slice(2);
const before = !!process.env.BEFORE;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = []; let checks = 0; const log = {};
  const check = (ok, label) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) errors.push(label); };
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatartalk.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const snap = async (name) => page.locator('canvas').first().screenshot({ path: path.join(out, name + '.png') });
    const ev = (fn, ...a) => page.evaluate(([fn, a]) => window[fn](...a), [fn, a]);
    // 1. free hands: thumb-side profile (the bend shows), and from the back of the hand
    for (const k of ['idle', 'walk', 'run']) for (const side of ['R', 'L']) {
      log[`${k}-${side}`] = await ev('__hand', k, side, [0.15, -0.25, side === 'R' ? 1 : -1], 0.38); await snap(`hand-${k}-${side}`);
    }
    await ev('__hand', 'idle', 'R', [-1, -0.3, 0.4], 0.4); await snap('hand-idle-R-back');
    await ev('__body', 'walk', 2.4); await snap('walk-body');
    // 2. a talk sequence: frames every 0.4 s while talking, then after it ends
    await ev('__say', 'talk', 'Hej! Vad roligt att se dig här, har du sett den nya lekstugan? Den är verkligen jättefin, kom och titta.');
    const trace = [];
    for (let k = 0; k < 16; k++) {
      await ev('__advance', 400); const s = await ev('__state', 'talk'); trace.push({ t: +(0.4 * (k + 1)).toFixed(1), ...s });
      if (k % 2 === 1 || k > 13) { await ev('__body', 'talk', 2.2); await snap(`talk-${String(k + 1).padStart(2, '0')}`); }
    }
    await ev('__advance', 3000); const after = await ev('__state', 'talk'); trace.push({ t: 'after+3s', ...after });
    await ev('__body', 'talk', 2.2); await snap('talk-after');
    log.trace = trace;
    // 3. held things while their holder talks
    await ev('__say', 'cup', 'Vill du ha lite kaffe? Det är nybryggt och jättegott.'); await ev('__say', 'nerf', 'Akta dig, jag har en Nerf-pistol och siktar på dig!');
    const held = [];
    for (let k = 0; k < 8; k++) { await ev('__advance', 400); held.push({ cup: (await ev('__state', 'cup')).R, nerf: (await ev('__state', 'nerf')).R }); }
    log.held = held; log.cylinder = await ev('__grip', 'cylinder'); log.pistol = await ev('__grip', 'pistol');
    await ev('__hand', 'cup', 'R', [0.15, -0.25, 1], 0.45); await snap('cup-talking');
    await ev('__hand', 'nerf', 'R', [0.15, -0.25, 1], 0.45); await snap('nerf-talking');
    log.calls = await ev('__calls');
    console.log('calls', log.calls);
    if (!before) {
      const flat = (a) => a.flat();
      const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 2e-3);
      check(held.every((h) => near(flat(h.cup), log.cylinder) && near(flat(h.nerf), log.pistol)), 'held cup / Nerf keep their exact grip while talking');
      const L = flat(log['idle-L'].fingers), R = flat(log['idle-R'].fingers);
      check(Math.min(...R.slice(0, 8)) > 0.3 && R[8] > 0.25 && L.some((v, i) => Math.abs(v - R[i]) > 0.02), 'idle free hands: bent fingers and thumb, left and right differ');
      const fingers = [0, 1, 2, 3].map((f) => R[f * 2] + R[f * 2 + 1]);
      check(new Set(fingers.map((v) => v.toFixed(2))).size === 4, 'unevenly bent fingers');
      const w = trace.slice(0, 12), heads = w.map((s) => s.head[0]), rolls = w.map((s) => s.head[2]), hy = w.map((s) => s.handR[1]);
      check(Math.max(...hy) - Math.min(...hy) > 0.05 || Math.max(...w.map((s) => s.handR[2])) - Math.min(...w.map((s) => s.handR[2])) > 0.05, 'a hand lifts while talking');
      check(Math.max(...heads) - Math.min(...heads) > 0.03 && Math.max(...rolls.map(Math.abs)) > 0.02, 'the head nods and tilts while talking');
      check(after.talk && after.talk.amt === 0 && !after.talking, 'gestures end when the talk ends');
    }
    fs.writeFileSync(path.join(out, before ? 'before.json' : 'talk.json'), JSON.stringify(log, null, 1));
    check(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  console.log(`${checks} checks`); if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
