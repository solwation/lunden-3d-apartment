// #2151: glossy surfaces indoors reflect the room. Before / after in the real game: the kitchen (mixer and sink, fridge, hood,
// oven) and the bathroom (mixer, WC, tiles) by day and in the evening with the lamps on. "Before" is the same frame with the
// tagged materials' env map removed (the old look); each image is before | after side by side. Also the probe's numbers.
//   tools/browsertest.sh node tools/roomprobe2151browser.cjs http://localhost:8223 docs/verification/2151
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8223', out = process.argv[3] || 'docs/verification/2151';
const W = 640, H = 460;
const result = { errors: [], scenes: {} };
fs.mkdirSync(out, { recursive: true });
const VIEWS = {
  kitchen: { spawn: [4.6, 2.4, 0], shots: {
    'kitchen-sink': { from: [4.62, 1.32, 2.55], at: [5.4, 1.0, 1.95], fov: 55 },
    'kitchen-hood-oven': { from: [3.9, 1.5, 3.9], at: [5.3, 1.25, 1.6], fov: 70 },
    'kitchen-fridge': { from: [4.4, 1.5, 3.0], at: [4.05, 1.0, 5.0], fov: 70 } } },
  bath: { spawn: [1.1, 5.6, 0], shots: { 'bath': { from: [1.45, 1.4, 5.15], at: [0.45, 0.85, 6.1], fov: 70 } } },
};
const SCENES = { day: 'time=12&month=6&day=15&freeze&weather=clear', evening: 'time=21.5&month=11&day=15&freeze&weather=clear&lights' };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const [sc, q] of Object.entries(SCENES)) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => result.errors.push({ sc, error: e.message }));
      await page.goto(`${base}/?shot&quality=3&${q}&at=4.6,2.4,-90,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.roomProbe, null, { timeout: 300000, polling: 250 });
      await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui, #note, #toast { display: none !important }' });
      result.scenes[sc] = {};
      for (const [room, v] of Object.entries(VIEWS)) {
        await page.evaluate((s) => { const a = window.__app; a.showOverlay?.(false); a.player.spawn(s[0], s[1], s[2]); }, v.spawn);
        const n0 = await page.evaluate(() => window.__app.roomProbe.stats.captures);
        await page.waitForFunction((n) => { const p = window.__app.roomProbe; return p.stats.captures > n && p.face < 0; }, n0, { timeout: 240000, polling: 250 });
        result.scenes[sc][room] = await page.evaluate(() => { const p = window.__app.roomProbe; return { mode: p.mode, zone: p.plan.current, sig: p.plan.cache.get(p.plan.current), captures: p.stats.captures, faces: p.stats.faces, mats: p.mats.size, maps: p.maps.size }; });
        for (const [name, view] of Object.entries(v.shots)) {
          const urls = await page.evaluate((view) => {
            const a = window.__app, P = a.roomProbe, c = a.camera, r = a.renderer;
            r.setAnimationLoop(null);
            c.position.set(...view.from); c.fov = view.fov; c.updateProjectionMatrix(); c.lookAt(...view.at); c.updateMatrixWorld(true);
            a.detail()?.update?.(c);
            const shoot = () => { r.render(a.scene, c); return r.domElement.toDataURL('image/png'); };
            shoot();
            const after = shoot();
            const saved = [...P.mats.keys()].map((m) => [m, m.envMap]);
            for (const [m] of saved) { m.envMap = null; m.needsUpdate = true; }
            shoot();
            const before = shoot();
            for (const [m, e] of saved) { m.envMap = e; m.needsUpdate = true; }
            return { before, after };
          }, view);
          const pair = await page.evaluate(async ({ before, after, W, H }) => {
            const load = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
            const [b, a] = await Promise.all([load(before), load(after)]);
            const c = document.createElement('canvas'); c.width = W * 2 + 6; c.height = H;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            g.drawImage(b, 0, 0, W, H); g.drawImage(a, W + 6, 0, W, H);
            g.font = 'bold 18px sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(8, 8, 74, 26); g.fillRect(W + 14, 8, 64, 26);
            g.fillStyle = '#fff'; g.fillText('FÖRE', 16, 28); g.fillText('EFTER', W + 21, 28);
            return c.toDataURL('image/png');
          }, { ...urls, W, H });
          fs.writeFileSync(path.join(out, `${name}-${sc}.png`), Buffer.from(pair.split(',')[1], 'base64'));
          await page.evaluate(() => { const a = window.__app; a.renderer.setAnimationLoop(() => a.frame(1 / 30)); });
        }
      }
      result.scenes[sc].programs = await page.evaluate(() => window.__app.renderer.info.programs.length);
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
