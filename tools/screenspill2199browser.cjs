// #2199: coloured spill from TVs and the playhouse neon. Real-game shots in the evening, TV on.
//   tools/browsertest.sh node tools/screenspill2199browser.cjs http://localhost:8494 docs/verification/2199 [view-prefix]
// Run against a checkout of the parent commit with another out dir for the "before" images. Bounded waits only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2], out = process.argv[3], only = process.argv[4];
const W = 800, H = 560;
fs.mkdirSync(out, { recursive: true });
const LIVING = {
  'living-tv': { from: [4.25, 1.3, 11.4], at: [4.25, 0.9, 8.0], fov: 85 },
  'living-tv-wide': { from: [3.2, 1.6, 11.7], at: [4.25, 0.7, 8.2], fov: 105 },
};
const PLAY = { // local metres from the playhouse's centre (x, z), eye 1.4 m
  'spel-north': { from: [6, 0.9], at: [6, 1.8, -5.2] },
  'spel-corner': { from: [3.9, -3.6], at: [8.4, 1.2, 1.2] },
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const shot = async (page, name, fn, arg) => {
    const r = await page.evaluate(fn, arg);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(name, JSON.stringify(r.info));
    await page.evaluate(() => { const a = window.__app; a.renderer.setAnimationLoop(() => a.frame(1 / 30)); });
  };
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&quality=3&perf&time=21.5&month=11&day=15&freeze&weather=clear&lights&tv&at=4.25,11.4,0,0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.lights, null, { timeout: 300000, polling: 250 });
    await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui, #note, #toast { display: none !important }' });
    await page.waitForTimeout(1500);
    // a colourful, steady programme on the living-room TV
    await page.evaluate(async () => {
      const a = window.__app, { PROGRAMS } = await import('/src/screens.js');
      for (const t of a.world.furnitureTargets) if (t.kind === 'tv') { if (!t.isOpen) t.toggle(); t.screen.channel = PROGRAMS.findIndex((p) => p.name === 'neonracet'); t.screen.snow = 0; t.screen.t = 3; }
    });
    // the room dark but for the TV: every other lamp off, so the picture's colour is what lights it
    await page.evaluate(() => { const L = window.__app.lights; for (const f of L.floorLamps) { f.auto = false; f.set(false); } for (const R of L.rooms.values()) R.on = false; });
    for (const [name, v] of Object.entries(LIVING)) {
      if (only && !name.startsWith(only)) continue;
      await shot(page, name, (view) => {
        const a = window.__app, c = a.camera, r = a.renderer;
        r.setAnimationLoop(null);
        a.player.spawn(view.from[0], view.from[2], 0, 0);
        for (let i = 0; i < 40; i++) { for (const t of a.world.furnitureTargets) if (t.kind === 'tv') t.update(0.1); a.lights.update(0, { x: view.from[0], y: 1.4, z: view.from[2] }, 1 / 30); }
        c.position.set(...view.from); c.fov = view.fov; c.updateProjectionMatrix(); c.lookAt(...view.at); c.updateMatrixWorld(true);
        a.detail()?.update?.(c);
        r.render(a.scene, c); r.render(a.scene, c);
        return { url: r.domElement.toDataURL('image/png'), info: { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length } };
      }, v);
    }
    if (!only || 'spel'.startsWith(only) || only.startsWith('spel')) {
      await page.evaluate(() => { const a = window.__app; a.showOverlay?.(false); a.use({ kind: 'playhouse' }); });
      await page.waitForFunction(() => window.__app.player.inPlayroom, null, { timeout: 120000, polling: 250 }).catch(() => errors.push('playhouse entry timed out'));
      await page.waitForTimeout(500);
      await page.evaluate(() => { window.__app.world.playroom.setDisco(false); });
      for (const [name, v] of Object.entries(PLAY)) {
        if (only && !name.startsWith(only)) continue;
        await shot(page, name, async (view) => {
          const a = window.__app, { PLAYROOM: R } = await import('/src/config.js'), c = a.camera, r = a.renderer;
          r.setAnimationLoop(null);
          a.player.spawn(R.x + view.from[0], R.z + view.from[1], 0);
          c.position.set(a.player.pos.x, 1.4, a.player.pos.z); c.fov = 85; c.updateProjectionMatrix(); c.lookAt(R.x + view.at[0], view.at[1], R.z + view.at[2]); c.updateMatrixWorld(true);
          a.detail()?.update?.(c);
          r.render(a.scene, c); r.render(a.scene, c);
          return { url: r.domElement.toDataURL('image/png'), info: { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length } };
        }, v);
      }
    }
  } finally { await browser.close(); console.log('errors', JSON.stringify(errors)); }
})();
