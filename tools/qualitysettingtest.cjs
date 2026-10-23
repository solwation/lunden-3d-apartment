// #1509: graphics choice in the settings dialog, desktop (mouse + keyboard) and touch 390 wide; reload restores; level applied; URL lock wins.
// Touch runs landscape 844x390: portrait phones show the rotate cover. ONLY=touch|desktop. PLAYWRIGHT_MODULE=… node tools/qualitysettingtest.cjs BASE OUT
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8761', out = process.argv[3] || '/tmp/quality-setting';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), checks = [], errors = [];
  const check = (v, n) => { assert.ok(v, n); checks.push(n); console.log('PASS', n); };
  const wait = (page) => page.waitForFunction(() => __app.loadingEl.hidden, null, { timeout: 300000 });
  const st = (page) => page.evaluate(() => ({ level: __app.quality.level, mode: __app.quality.mode, target: __app.quality.target, ls: Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('lunden.quality')).map((k) => [k, localStorage.getItem(k)])),
    checked: [...document.querySelectorAll('#quality-level [aria-checked=true], #quality-fps [aria-checked=true]')].map((b) => b.textContent), ratio: __app.renderer.getPixelRatio(), note: document.getElementById('quality-note').textContent }));
  try {
    for (const [label, vp, touch] of [['desktop', { width: 1100, height: 850 }, false], ['touch', { width: 844, height: 390 }, true]].filter(([l]) => !process.env.ONLY || l === process.env.ONLY)) {
      const url = `${base}/?cloud=&mp=0&lowmem=0`;
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: touch });
      await ctx.addInitScript(() => { if (!localStorage.getItem('lunden.name')) { localStorage.setItem('lunden.name', 'Olof'); localStorage.setItem('lunden.avatar', '240302101h8q3'); localStorage.setItem('lunden.quality', '2'); } });
      const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url); await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 }); await wait(page);
      let s = await st(page);
      check(s.mode === 'auto' && s.level === 2 && s.checked.includes('Auto') && s.checked.includes('60 FPS'), `${label}: old saved level 2 migrates to Auto at Medel, 60 FPS default`);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
      await tap('#menu-settings');
      if (!touch) { await page.keyboard.press('Tab'); }
      await page.screenshot({ path: `${out}/${label}-settings-auto.png` });
      await tap('#quality-level button[data-value="0"]');
      s = await st(page);
      check(s.mode === 'manual' && s.level === 0 && s.ls['lunden.quality'] === '2' && s.ls['lunden.quality.manual'] === '0' && s.ratio < 0.7, `${label}: Lägsta applied (pixel ratio ${s.ratio}), last auto level untouched`);
      await tap('#quality-fps button[data-fps="30"]');
      s = await st(page); check(s.target === 30 && s.ls['lunden.quality.fps'] === '30' && s.checked.includes('30 FPS'), `${label}: 30 FPS target saved`);
      await page.screenshot({ path: `${out}/${label}-settings-manual.png` });
      if (!touch) { await page.locator('#quality-level button[data-value="3"]').focus(); await page.keyboard.press('Enter'); s = await st(page); check(s.level === 3 && s.mode === 'manual', 'desktop: keyboard Enter on a level button selects it'); }
      await tap('#quality-level button[data-value="1"]');
      await page.reload(); await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 }); await wait(page);
      s = await st(page);
      check(s.mode === 'manual' && s.level === 1 && s.target === 30 && s.checked.includes('Låg') && s.checked.includes('30 FPS'), `${label}: reload restores manual Låg and 30 FPS`);
      await page.goto(`${url}&quality=3`); await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 }); await wait(page);
      await tap('#menu-settings'); s = await st(page);
      const dis = await page.evaluate(() => [...document.querySelectorAll('#quality-level button, #quality-fps button')].every((b) => b.disabled));
      check(s.level === 3 && dis && s.checked.length === 0 && /låst/.test(s.note) && s.ls['lunden.quality.manual'] === '1', `${label}: quality=3 lock wins, controls disabled, saved choice untouched`);
      await page.screenshot({ path: `${out}/${label}-settings-locked.png` });
      await page.goto(url); await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 }); await wait(page);
      await tap('#menu-settings'); await tap('#quality-level button[data-value="auto"]'); s = await st(page);
      check(s.mode === 'auto' && s.level === 2 && s.ratio > 0.85, `${label}: back to Auto resumes the last auto level 2`);
      await ctx.close();
    }
    check(errors.length === 0, 'zero browser errors');
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ checks, errors }, null, 2));
  } catch (e) { console.error(e, errors); throw e; } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
