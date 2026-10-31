// #1747: binoculars magnification steps (2x/4x/8x), the phone button + +/- buttons, wheel capture. Usage: node tools/binocularstest.cjs [url] [outDir]
const kit = require('./testkit.cjs');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8766', out = process.argv[3] || '/tmp/binoc1747';
fs.mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok, label, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${data === undefined ? '' : ' ' + JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch();
  try {
    for (const mobile of [false, true]) {
      const tag = mobile ? 'mobile' : 'desktop';
      const { page } = await kit.open(browser, `${game}/?freeze&time=12&at=42,-128,90,5,0${mobile ? '&phone' : '&shot'}`, { viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 }, contextOptions: mobile ? { hasTouch: true, isMobile: true } : {}, init: () => { localStorage.setItem('lunden.name', 'Kikartest'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await kit.skipNameDialog(page);
      if (mobile) { await page.evaluate(() => __app.showOverlay?.(false)); await page.touchscreen.tap(600, 100); } // a touch turns the touch controls on
      await page.waitForTimeout(1500);
      const s = async () => { await page.waitForTimeout(300); return page.evaluate(() => { const b = __binoculars, c = document.getElementById('binoculars-zoom'), p = document.getElementById('power-btn'); return { zoomed: b.zoomed, zoom: b.zoom, fov: __app.camera.fov, look: b.lookScale(), read: c?.querySelector('.binoc-read').textContent, ctlShown: !!c && c.style.display !== 'none', step: [...(c?.querySelectorAll('.binoc-step') ?? [])].map((x) => getComputedStyle(x).display !== 'none'), power: p && !p.hidden && getComputedStyle(p).display !== 'none', powerLabel: p?.getAttribute('aria-label'), box: p && JSON.stringify(p.getBoundingClientRect()) }; }); };
      const fovIs = (v) => page.waitForFunction((v) => Math.abs(__app.camera.fov - v) < 0.2, v, { timeout: 60000 }).catch(() => {});
      await page.evaluate(() => { __binoculars.take(); });
      await page.waitForTimeout(600);
      let st = await s();
      if (mobile) check(st.power && st.powerLabel === 'Kika', `${tag}: the Kika button is visible with the binoculars in hand`, st);
      if (mobile) await page.locator('#power-btn').tap({ timeout: 20000 }); else await page.evaluate(() => __binoculars.useAlt());
      await page.waitForTimeout(500);
      await fovIs(18); st = await s();
      check(st.zoomed && st.zoom === 4 && Math.abs(st.fov - 72 / 4) < 0.1 && st.read === '4×' && st.ctlShown, `${tag}: raising starts at 4x`, st);
      if (mobile) check(st.step.length === 2 && st.step.every(Boolean), `${tag}: +/- buttons are visible on touch`, st.step);
      else check(st.step.every((x) => !x), `${tag}: +/- buttons hidden without touch`, st.step);
      const set = async (dir) => { if (mobile) await page.locator(`#binoculars-zoom [data-step="${dir}"]`).tap(); else await page.mouse.wheel(0, -dir * 100); await page.waitForTimeout(500); };
      await set(-1); await fovIs(36); st = await s();
      check(st.zoom === 2 && Math.abs(st.fov - 36) < 0.1 && Math.abs(st.look - 0.5) < 1e-6 && st.read === '2×', `${tag}: 2x`, st);
      await page.screenshot({ path: `${out}/${tag}-2x.png` });
      await set(-1); st = await s(); check(st.zoom === 2, `${tag}: clamped at 2x`);
      await set(1); await set(1); await fovIs(9); st = await s();
      check(st.zoom === 8 && Math.abs(st.fov - 9) < 0.1 && Math.abs(st.look - 0.125) < 1e-6 && st.read === '8×', `${tag}: 8x`, st);
      await page.screenshot({ path: `${out}/${tag}-8x.png` });
      await set(1); st = await s(); check(st.zoom === 8, `${tag}: clamped at 8x`);
      await page.evaluate(() => __binoculars.putBack()); await fovIs(72); st = await s();
      check(!st.zoomed && !st.ctlShown && Math.abs(st.fov - 72) < 5, `${tag}: put down releases zoom and controls`, st);
      check(errors.length === 0, `${tag}: no page errors`, errors);
    }
  } finally { await browser.close(); }
  process.exit(failed ? 1 : 0);
})();
