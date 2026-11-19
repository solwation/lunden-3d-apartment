// #2147: the outer layer in the real app. (1) the mirror's customizer: choose Jacka / Kappa and see the preview; (2) our own body outdoors: the automatic
// mode puts the layer on in cold snow, off again in mild weather, and keeps it a few seconds in a doorway (Ghost.updateOuter, the real code path).
// PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/avatarouterweargamebrowser.cjs http://localhost:8219 docs/verification/2147
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8219', out = 'docs/verification/2147'] = process.argv.slice(2);
const errors = [];
(async () => {
  fs.mkdirSync(out + '/before', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { localStorage.setItem('lunden.name', '2147'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /THREE.WebGLProgram/.test(m.text())) errors.push(m.text()); });
    await page.route('**/src/avatarpreview.js', async (r) => { const response = await r.fetch(); await r.fulfill({ response, body: (await response.text()).replace('this.canvas = canvas;', 'this.canvas = canvas; window.__preview = this;') }); });
    await page.goto(base + '/?shot&test=lazy&time=12&month=6&freeze&cloud=', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 });
    await page.evaluate(async () => {
      const a = window.__app, C = await import('/src/config.js'); a.renderer.setAnimationLoop(null); a.showOverlay(false);
      a.ghosts.setMyLook({ ...C.avatarLook('2147'), style: 2, gender: 1, hair: C.HAIR[2], top: C.TOPS[0], cut: 0, sleeves: 0, height: 172 });
      (await import('/src/customizer.js')).mirrorChoice().run();
    });
    await page.waitForFunction(() => window.__preview?.avatar);
    const flush = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.getByRole('tab', { name: 'Kläder', exact: true }).click(); await flush();
    await page.screenshot({ path: out + '/before/customizer-none.png' });
    const modeHidden0 = await page.locator('[data-group=outerMode]').isHidden();
    await page.locator('button[data-type=outer][data-index="1"]').click(); await flush();
    const jacket = await page.evaluate(() => ({ cut: __preview.avatar.look.cut, outer: __app.ghosts.myLook.outer }));
    await page.screenshot({ path: out + '/customizer-jacket.png' });
    await page.locator('button[data-type=outer][data-index="2"]').click(); await flush();
    await page.locator('button[data-type=outerMode][data-index="0"]').click(); await flush();
    const coat = await page.evaluate(() => ({ cut: __preview.avatar.look.cut, outer: __app.ghosts.myLook.outer, mode: __app.ghosts.myLook.outerMode, code: __app.ghosts.avatarCode }));
    await page.screenshot({ path: out + '/customizer-coat.png' });
    assert.equal(modeHidden0, true); assert.equal(jacket.cut, 3); assert.equal(jacket.outer, 1); assert.equal(coat.cut, 4);
    assert.match(coat.code, /m6$|m6[a-z]/, 'the code carries the coat in tag m');
    await page.getByRole('button', { name: 'Klar', exact: true }).click();
    // our body outdoors in cold snow: jacket on automatically
    const res = await page.evaluate(async () => {
      const a = window.__app, C = await import('/src/config.js'), W = await import('/src/avatarweather.js'), THREE = await import('three');
      a.ghosts.setMyLook({ ...a.ghosts.myLook, outer: 1, outerMode: 0, cut: 0, top: C.TOPS[0] });
      const g = a.ghosts.selfGhost(); a.ghosts.group.visible = true; g.root.visible = true;
      const cam = a.camera, d = new THREE.Vector3(); cam.getWorldDirection(d); d.y = 0; d.normalize();
      g.root.position.set(cam.position.x + d.x * 1.7, cam.position.y - 1.3, cam.position.z + d.z * 1.7);
      g.root.rotation.y = Math.atan2(-d.x, -d.z) + Math.PI;
      const snap = () => { g.root.updateMatrixWorld(true); a.renderer.render(a.scene, cam); return { worn: g.outer.worn, cut: g.avatar.look.cut }; };
      const out = {};
      Object.assign(W.wetEnv, { rain: 0, kind: null, temp: 20 }); g.updateOuter(1, true); out.mild = snap();
      out.mildImage = a.renderer.domElement.toDataURL('image/png');
      Object.assign(W.wetEnv, { rain: 0.8, kind: 'snow', temp: -3 }); g.updateOuter(0.5, true); out.snow = snap();
      out.snowImage = a.renderer.domElement.toDataURL('image/png');
      g.updateOuter(1, false); out.doorway = snap();
      for (let i = 0; i < 5; i++) g.updateOuter(1, false); out.indoors = snap();
      Object.assign(W.wetEnv, { rain: 0.8, kind: 'rain', temp: 14 }); g.updateOuter(1, true); out.rain = snap();
      g.updateOuter(1, true); out.stable = g.outer.worn;
      return out;
    });
    const save = (n, d) => fs.writeFileSync(n, Buffer.from(d.split(',')[1], 'base64'));
    save(out + '/before/outdoors-mild.png', res.mildImage); save(out + '/outdoors-snow.png', res.snowImage);
    const { mildImage, snowImage, ...rest } = res; console.log(JSON.stringify(rest));
    assert.deepEqual([res.mild.worn, res.snow.worn, res.doorway.worn, res.indoors.worn, res.rain.worn], [false, true, true, false, true]);
    assert.deepEqual([res.mild.cut | 0, res.snow.cut], [0, 3]);
    assert.deepEqual(errors, []);
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
