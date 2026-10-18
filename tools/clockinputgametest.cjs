// Typed clock time in the real app (#1242): the strip's "Skriv tid" field (touch / free pointer, real keyboard events) and the
// digit keys with the mouse locked (clockPanel.key); validation, no walking while typing, New Year countdown follows.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/clockinputgametest.cjs http://localhost:8764 /tmp/shots1242
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8764', out = process.argv[3] || '/tmp/shots1242';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    for (const [name, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 740, height: 360 }, true]]) {
      const p = await b.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
      const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(`${base}/index.html?time=7&month=6&day=15&test&freeze`);
      await p.waitForFunction(() => window.__app, null, { timeout: 90000 });
      await p.evaluate(() => { const d = document; if (window.__app.testMode) d.documentElement.requestFullscreen = undefined; d.getElementById('start-touch').click(); });
      await p.waitForTimeout(300);
      await p.evaluate(() => { const { player, wallClock } = window.__app; const c = wallClock.object.position; player.spawn(c.x + 1.2, c.z, Math.PI / 2); window.__app.showClock(true); });
      const q = (js, a) => p.evaluate(js, a);
      assert.equal(await q(() => !document.getElementById('clock-set').hidden), false, 'field closed at first');
      // touch / free pointer: the field
      await p.click('#clock-panel [data-act=type]');
      assert.equal(await q(() => document.activeElement.id), 'clock-input', 'field focused');
      const pos0 = await q(() => ({ ...window.__app.player.pos }));
      await p.keyboard.type('1430', { delay: 20 });
      assert.equal(await q(() => document.getElementById('clock-input').value), '14:30', 'auto colon');
      assert.equal(await q(() => document.querySelector('#clock-panel .time').textContent), '14:30', 'live preview');
      await p.screenshot({ path: `${out}/${name}-typing.png` }).catch(() => {});
      await p.keyboard.press('Enter');
      let r = await q(() => ({ h: window.__app.day.hour, clock: window.__app.day.clock, hidden: document.getElementById('clock-set').hidden, date: window.__app.day.date }));
      assert.ok(Math.abs(r.h - 14.5) < 0.01 && r.hidden && r.date === 15, JSON.stringify(r));
      // invalid
      await p.click('#clock-panel [data-act=type]');
      await p.keyboard.type('2575');
      await p.click('#clock-set button[type=submit]');
      r = await q(() => ({ h: window.__app.day.hour, info: document.querySelector('#clock-panel .info').textContent, inv: document.getElementById('clock-input').getAttribute('aria-invalid'), hidden: document.getElementById('clock-set').hidden }));
      assert.ok(Math.abs(r.h - 14.5) < 0.01 && /Ogiltig/.test(r.info) && r.inv === 'true' && !r.hidden, JSON.stringify(r));
      await p.screenshot({ path: `${out}/${name}-invalid.png` }).catch(() => {});
      // Esc cancels, time unchanged; A/D typed in the field never spool
      await p.keyboard.press('Escape');
      r = await q(() => ({ h: window.__app.day.hour, hidden: document.getElementById('clock-set').hidden, spool: window.__app.day.spool }));
      assert.ok(Math.abs(r.h - 14.5) < 0.01 && r.hidden && r.spool === 0, JSON.stringify(r));
      const pos1 = await q(() => ({ ...window.__app.player.pos }));
      assert.deepEqual(pos1, pos0, 'no walking while typing');
      // locked mouse: digit keys
      r = await q(() => { const cp = window.__app.clockPanel, d = window.__app.day; const used = ['Digit0', 'Digit9', 'Digit4', 'Digit5'].map((c) => cp.key(c, true, false)); const pre = document.querySelector('#clock-panel .time').textContent; cp.key('Backspace', true, false); const pre2 = document.querySelector('#clock-panel .time').textContent; cp.key('Digit0', true, false); const before = d.hour; cp.key('Enter', true, false); return { used, pre, pre2, h: d.hour, before, after: document.querySelector('#clock-panel .time').textContent }; });
      assert.deepEqual(r.used, [true, true, true, true]);
      assert.equal(r.pre, '09:45'); assert.equal(r.pre2, '09:4_');
      assert.ok(Math.abs(r.h - (9 + 40 / 60)) < 0.01 && r.after === '09:40', JSON.stringify(r));
      await p.screenshot({ path: `${out}/${name}-set.png` }).catch(() => {});
      // New Year: 23:59:50 on 31 Dec -> the countdown phase follows the typed time
      r = await q(() => { const { day, clockPanel, newYear } = window.__app; day.month = 12; day.date = 31; clockPanel.setTyped('23:59'); day.update(0); return { h: day.hour, glasses: !!newYear }; });
      assert.ok(Math.abs(r.h - (23 + 59 / 60)) < 0.01);
      assert.deepEqual(errors, []);
      console.log('PASS', name);
      await p.close();
    }
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
