// #2157: the skirt and the dress in a browser. (1) tools/avatarskirt.html: the same female figure in straight trousers (before), the skirt
// and the dress mid-stride, sitting, squatting and pedalling, and the mirror preview (src/avatarpreview.js) of each; (2) the real app: the
// mirror's customizer choosing Kjol (the preview and the look code's p3), then our own body as a woman in a dress in the game view.
// PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/avatarskirtbrowser.cjs http://localhost:8232 docs/verification/2157
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8232', out = 'docs/verification/2157'] = process.argv.slice(2);
const errors = [];
const save = (n, d) => fs.writeFileSync(n, Buffer.from(d.split(',')[1], 'base64'));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { localStorage.setItem('lunden.name', '2157'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /THREE.WebGLProgram/.test(m.text())) errors.push(m.text()); });
    // (1) the component page: two poses per picture, stacked (trousers | skirt | dress in each row)
    await page.goto(base + '/tools/avatarskirt.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const info = { component: await page.evaluate(() => window.__info()) };
    for (const [name, rows] of [['walk-sit', [['walk', 'q'], ['sit', 'q']]], ['squat-cycle', [['squat', 'q'], ['cycle', 'q']]]]) {
      const res = await page.evaluate((rows) => {
        const c = document.createElement('canvas'); c.width = 900; c.height = 525 * rows.length; const g = c.getContext('2d'), stats = [];
        rows.forEach(([pose, view], i) => { const hip = window.__pose(pose), s = window.__shot(view); stats.push({ pose, hip, ...s }); g.drawImage(document.querySelector('canvas'), 0, i * 525, 900, 525); });
        return { url: c.toDataURL('image/png'), stats };
      }, rows);
      save(`${out}/${name}.png`, res.url); info[name] = res.stats;
    }
    save(`${out}/preview.png`, await page.evaluate(() => window.__preview()));
    // (2) the real app: the customizer's Kjol, then a woman in a dress in the game view
    await page.route('**/src/avatarpreview.js', async (r) => { const response = await r.fetch(); await r.fulfill({ response, body: (await response.text()).replace('this.canvas = canvas;', 'this.canvas = canvas; window.__preview = this;') }); });
    await page.setViewportSize({ width: 1000, height: 760 });
    await page.goto(base + '/?shot&test=lazy&time=12&month=6&freeze&cloud=', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 300000 });
    await page.evaluate(async () => {
      const a = window.__app, C = await import('/src/config.js'); a.renderer.setAnimationLoop(null); a.showOverlay(false);
      a.ghosts.setMyLook({ ...C.avatarLook('2157'), style: 1, gender: 1, hair: C.HAIR[2], top: C.TOPS[0], cut: 0, sleeves: 0, legs: 0, height: 170 });
      (await import('/src/customizer.js')).mirrorChoice().run();
    });
    await page.waitForFunction(() => window.__preview?.avatar);
    const flush = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.getByRole('tab', { name: 'Kläder', exact: true }).click(); await flush();
    await page.locator('button[data-type=legs][data-index="3"]').click(); await flush();
    info.customizer = await page.evaluate(() => ({ legs: __preview.avatar.look.legs, mine: __app.ghosts.myLook.legs, code: __app.ghosts.avatarCode }));
    await page.screenshot({ path: `${out}/customizer-skirt.png` });
    assert.equal(info.customizer.legs, 3); assert.match(info.customizer.code, /p3/, 'the code carries the skirt in tag p');
    await page.getByRole('button', { name: 'Klar', exact: true }).click();
    const game = await page.evaluate(async () => {
      const a = window.__app, THREE = await import('three'), C = await import('/src/config.js');
      a.ghosts.setMyLook({ ...a.ghosts.myLook, legs: 4, top: C.TOPS[3] });
      const g = a.ghosts.selfGhost(); a.ghosts.group.visible = true; g.root.visible = true;
      const cam = a.camera, d = new THREE.Vector3(); cam.getWorldDirection(d); d.y = 0; d.normalize();
      const side = new THREE.Vector3(-d.z, 0, d.x);
      g.root.position.set(cam.position.x + d.x * 2.3 + side.x * 0.35, cam.position.y - 1.62, cam.position.z + d.z * 2.3 + side.z * 0.35);
      g.root.rotation.y = Math.atan2(-d.x, -d.z) + Math.PI + 0.6;
      for (let k = 0; k < 47; k++) g.avatar.update(1 / 60, { speed: 1.4 });
      g.root.updateMatrixWorld(true); a.renderer.render(a.scene, cam);
      return { legs: g.avatar.look.legs, image: a.renderer.domElement.toDataURL('image/png') };
    });
    save(`${out}/game-dress.png`, game.image); info.game = { legs: game.legs };
    assert.equal(game.legs, 4);
    console.log(JSON.stringify(info));
    assert.deepEqual(errors, []);
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.stack); console.error(errors); process.exitCode = 1; });
