// #1512: Ultra (quality level 4) in a real browser. `node tools/ultrabrowser1512.cjs BASE OUT`
// Cases: desktop pin 3 vs 4 (shadow map, pixel ratio, settings buttons, Hög vs Ultra image), phone UA / &lowmem / &res=light pin 4 clamps to 3.
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8312', out = process.argv[3] || '/tmp/ultra1512';
const probe = () => {
  const a = window.__app; let sun = null;
  a.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow && !sun) sun = o; });
  return { level: a.quality.level, top: a.quality.top, mode: a.quality.mode, shadow: sun?.shadow.mapSize.x ?? null,
    shadowTarget: sun?.shadow.map?.width ?? null, pixelRatio: a.renderer.getPixelRatio(),
    buttons: [...document.querySelectorAll('#quality-level button')].map((b) => b.textContent) };
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), res = {}, errors = [];
  const run = async (name, query, opts = {}) => {
    const { page } = await kit.open(browser, `${base}/?cloud=&mp=0&${query}`, { test: false, viewport: { width: 900, height: 560 }, ...opts,
      init: () => { localStorage.setItem('lunden.name', 'Olof'); } });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.waitForFunction(() => __app.loadingEl.hidden, null, { timeout: 600000 });
    await page.waitForTimeout(3000);
    res[name] = await page.evaluate(probe); console.log(name, JSON.stringify(res[name]));
    return page;
  };
  try {
    let page = await run('desktop-q3', 'quality=3&at=1,11.8,-40,0');
    await page.screenshot({ path: `${out}/hog.png`, timeout: 300000 }); await page.context().close();
    page = await run('desktop-q4', 'quality=4&at=1,11.8,-40,0');
    await page.screenshot({ path: `${out}/ultra.png`, timeout: 300000 });
    await page.evaluate(() => document.getElementById('menu-settings')?.click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/settings-ultra.png`, timeout: 300000 }); await page.context().close();
    const phone = await run('phone-q4', 'quality=4', { viewport: { width: 390, height: 780 },
      contextOptions: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', hasTouch: true, isMobile: true } });
    await phone.context().close();
    page = await run('lowmem-q4', 'quality=4&lowmem'); await page.context().close();
    page = await run('light-q4', 'quality=4&res=light'); await page.context().close();
    // manual choice through the settings UI on the desktop, remembered across a reload
    page = await run('desktop-manual', 'at=1,11.8,-40,0');
    await page.evaluate(() => [...document.querySelectorAll('#quality-level button')].find((b) => b.textContent === 'Ultra').click());
    await page.waitForTimeout(1500); res.manualAfterClick = await page.evaluate(probe); console.log('manual', JSON.stringify(res.manualAfterClick));
    await page.context().close();
    const r = res;
    assert.equal(r['desktop-q3'].level, 3); assert.equal(r['desktop-q3'].shadow, 2048);
    assert.equal(r['desktop-q4'].level, 4); assert.equal(r['desktop-q4'].shadow, 4096);
    assert.deepEqual(r['desktop-q4'].buttons, ['Auto', 'Lägsta', 'Låg', 'Medel', 'Hög', 'Ultra']);
    assert.equal(r['desktop-q4'].pixelRatio, r['desktop-q3'].pixelRatio);
    for (const k of ['phone-q4', 'lowmem-q4', 'light-q4']) { assert.equal(r[k].level, 3, k); assert.ok(r[k].shadow <= 2048, k); assert.ok(!r[k].buttons.includes('Ultra'), k); }
    assert.equal(r.manualAfterClick.level, 4); assert.equal(r.manualAfterClick.mode, 'manual'); assert.equal(r.manualAfterClick.shadow, 4096);
    assert.equal(errors.length, 0, errors.join('|'));
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ res, errors }, null, 2)); console.log('ALL PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
