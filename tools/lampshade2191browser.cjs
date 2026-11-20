// #2191: shaded lamps throw light up and down. Real-game shots in the evening with every lamp on, one image per view.
//   tools/browsertest.sh node tools/lampshade2191browser.cjs http://localhost:8398 docs/verification/2191
// Run it against the old tree (a checkout of the parent commit) with another out dir for the "before" images.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2], out = process.argv[3], only = process.argv[4]; // only: a view-name prefix
const W = 800, H = 560;
fs.mkdirSync(out, { recursive: true });
const VIEWS = {
  'living-pendant': { spawn: [3.6, 8.2, 0, 0], from: [3.64, 1.45, 8.3], at: [3.64, 1.5, 10.6], fov: 85 },
  'living-up': { spawn: [3.6, 8.2, 0, 0], from: [3.64, 1.0, 9.3], at: [3.64, 2.5, 10.6], fov: 100 },
  'living-ceiling': { spawn: [3.6, 8.2, 0, 0], from: [3.64, 1.1, 8.7], at: [3.64, 2.1, 10.6], fov: 90 },
  'kitchen-copper': { spawn: [3.5, 3.3, 0, 0], from: [3.5, 1.5, 3.4], at: [3.5, 1.5, 1.4], fov: 85 },
  // the pendant alone (every other lamp off): where its light goes shows, a dome / open shade in the dark
  'solo-living': { solo: 'Vardagsrum', spawn: [3.6, 8.2, 0, 0], from: [3.64, 1.2, 8.55], at: [3.64, 1.0, 10.6], fov: 100 },
  'solo-living-up': { solo: 'Vardagsrum', spawn: [3.6, 8.2, 0, 0], from: [3.64, 1.0, 9.3], at: [3.64, 2.5, 10.6], fov: 100 },
  'solo-kitchen': { solo: 'Kök / matplats', spawn: [3.5, 3.3, 0, 0], from: [3.5, 1.3, 3.4], at: [3.5, 1.3, 1.4], fov: 95 },
  'sovrum2-paper': { spawn: [3.2, 8.9, 0, 3.25], from: [3.1, 4.45, 8.8], at: [3.8, 4.9, 9.9], fov: 95 },
  'sovrum2-reading': { spawn: [3.9, 11.4, 0, 3.25], from: [3.9, 4.5, 11.0], at: [5.5, 4.3, 12.0], fov: 85 },
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&quality=3&perf&time=21.5&month=11&day=15&freeze&weather=clear&lights&at=3.6,8.2,0,0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.lights, null, { timeout: 300000, polling: 250 });
    await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui, #note, #toast { display: none !important }' });
    for (const [name, v] of Object.entries(VIEWS)) {
      if (only && !name.startsWith(only)) continue;
      await page.evaluate((s) => { const a = window.__app; a.showOverlay?.(false); a.player.spawn(s[0], s[1], s[2], s[3] || undefined); }, v.spawn);
      if (v.solo) await page.evaluate((room) => {
        const L = window.__app.lights;
        for (const f of L.floorLamps) { f.auto = false; f.set(false); }
        for (const R of L.rooms.values()) R.on = R.name === room;
      }, v.solo);
      await page.waitForTimeout(1500);
      const url = await page.evaluate((view) => {
        const a = window.__app, c = a.camera, r = a.renderer;
        r.setAnimationLoop(null);
        for (let i = 0; i < 40; i++) a.lights.update(view.from[1] > 3 ? 1 : 0, { x: view.from[0], y: view.from[1], z: view.from[2] }, 1 / 30);
        c.position.set(...view.from); c.fov = view.fov; c.updateProjectionMatrix(); c.lookAt(...view.at); c.updateMatrixWorld(true);
        a.detail()?.update?.(c);
        r.render(a.scene, c); r.render(a.scene, c);
        const info = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
        return { url: r.domElement.toDataURL('image/png'), info };
      }, v);
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.url.split(',')[1], 'base64'));
      console.log(name, JSON.stringify(url.info));
      await page.evaluate(() => { const a = window.__app; a.renderer.setAnimationLoop(() => a.frame(1 / 30)); });
    }
  } finally { await browser.close(); console.log('errors', JSON.stringify(errors)); }
})();
