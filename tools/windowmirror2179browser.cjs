// #2179: the window glass mirrors the lit room in the evening. Before | after in the real game: the living room towards the patio
// door (and a bedroom window) by day and in the evening with the lamps on. "Before" = the glass without env map at its day
// opacity (the old look). Also draw calls / triangles / programs.
//   tools/browsertest.sh node tools/windowmirror2179browser.cjs http://localhost:8286 docs/verification/2179
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8286', out = process.argv[3] || 'docs/verification/2179';
const W = 640, H = 460, result = { errors: [], scenes: {} };
fs.mkdirSync(out, { recursive: true });
const VIEWS = { 'living-patio': { spawn: [2.4, 9.2, 0], from: [2.6, 1.5, 9.0], at: [1.6, 1.15, 12.5], fov: 75 },
  'living-grazing': { spawn: [3.6, 9.2, 0], from: [3.6, 1.5, 9.4], at: [0.8, 1.3, 12.4], fov: 60 } };
const SCENES = { day: 'time=12&month=6&day=15&freeze&weather=clear', evening: 'time=21.5&month=11&day=15&freeze&weather=clear&lights' };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const [sc, q] of Object.entries(SCENES)) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => result.errors.push({ sc, error: e.message }));
      await page.goto(`${base}/?shot&quality=3&${q}&at=2.4,9.2,0,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.roomProbe, null, { timeout: 300000, polling: 250 });
      await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui, #note, #toast { display: none !important }' });
      result.scenes[sc] = {};
      for (const [name, v] of Object.entries(VIEWS)) {
        await page.evaluate((s) => { const a = window.__app; a.showOverlay?.(false); a.player.spawn(s[0], s[1], s[2]); }, v.spawn);
        const n0 = await page.evaluate(() => window.__app.roomProbe.stats.captures);
        await page.waitForFunction((n) => { const p = window.__app.roomProbe; return (p.stats.captures > n || (n > 0 && p.maps.size > 0)) && p.face < 0; }, n0, { timeout: 240000, polling: 250 }); // a second view in the same zone gets no new capture
        await page.waitForTimeout(1500); // the frame loop applies the window mirror
        const urls = await page.evaluate((view) => {
          const a = window.__app, P = a.roomProbe, c = a.camera, r = a.renderer;
          const wins = [...P.mats.keys()].filter((m) => m.userData.roomProbe === 'window');
          const info = { windows: wins.length, opacity: wins[0]?.opacity, intensity: wins[0]?.envMapIntensity, mode: P.mode, zone: P.plan.current };
          r.setAnimationLoop(null);
          c.position.set(...view.from); c.fov = view.fov; c.updateProjectionMatrix(); c.lookAt(...view.at); c.updateMatrixWorld(true);
          a.detail()?.update?.(c);
          const shoot = () => { r.render(a.scene, c); return r.domElement.toDataURL('image/png'); };
          shoot();
          const after = shoot(); info.after = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
          const saved = wins.map((m) => [m, m.envMap, m.opacity]);
          for (const [m] of saved) { m.envMap = null; m.opacity = 0.1; m.needsUpdate = true; }
          shoot();
          const before = shoot(); info.before = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
          for (const [m, e, o] of saved) { m.envMap = e; m.opacity = o; m.needsUpdate = true; }
          return { before, after, info };
        }, v);
        result.scenes[sc][name] = urls.info;
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
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
