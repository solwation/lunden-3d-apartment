// #2028 capture: SPEL room view, shelf/poster close-ups and rug, draw calls/triangles. node pcshots.cjs BASE OUTDIR [prefix]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const [base, out, prefix = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const result = { base, errors: [] };
  try {
    const W = +(process.env.W || 1200), H = +(process.env.H || 750);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => result.errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Barn'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const t0 = Date.now();
    await page.goto(`${base}/?shot&cloud=&mp=0&quality=3&time=12&month=6&freeze`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    result.loadSeconds = (Date.now() - t0) / 1000;
    await page.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.renderer.setAnimationLoop(null);
      const P = a.player, cam = a.camera;
      window.__t = {
        frames: (n) => { for (let i = 0; i < n; i++) P.update(1 / 60); },
        render: () => { a.step(0); a.renderer.render(a.scene, a.camera); },
        calls: () => { a.step(0); a.renderer.info.reset(); a.renderer.render(a.scene, a.camera); return { calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles }; },
        aim: (x, y, z) => { cam.updateMatrixWorld(true); const d = new cam.position.constructor(x, y, z).sub(cam.position); cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); },
      };
    });
    // enter through the real playhouse door
    const door = { x: -28.85, z: 23.8 };
    await page.evaluate((door) => { const t = window.__t, P = window.__app.player; P.spawn(door.x, door.z - 1.1, Math.PI); t.frames(60); t.aim(door.x, 0.6, door.z - 0.2); }, door);
    result.door = await page.evaluate(() => { const a = window.__app; a.touch.enabled = true; a.step(0); a.step(0); const f = a.focus(); a.touch.enabled = false; if (f.focused) a.use(f.focused); return f.focused?.kind ?? null; });
    await page.waitForTimeout(900);
    const views = JSON.parse(process.env.VIEWS || 'null') || [
      { name: 'room', from: [6, 1.3], to: [6, 0.9, -2.2] },
      { name: 'shelves-west', from: [5.6, -2.1], to: [3.1, 1.2, -2.6], eye: 1.1 },
      { name: 'shelves-east', from: [6.4, -2.0], to: [9, 1.2, -2.3], eye: 1.1 },
      { name: 'shelf-closeup', from: [4.3, -3.6], to: [3.1, 1.38, -4.0], eye: 1.2 },
      { name: 'poster-gap', from: [4.7, -2.1], to: [3.1, 1.0, -2.15], eye: 1.1 },
      { name: 'rug', from: [6, 1.3], to: [6, 0, -2.4], eye: 2.45 },
    ];
    result.views = {};
    for (const v of views) {
      const info = await page.evaluate((v) => {
        const t = window.__t, a = window.__app, P = a.player, RM = { x: -1500, z: -1500 };
        P.spawn(RM.x + v.from[0], RM.z + v.from[1], 0); t.frames(20);
        a.step(0);
        if (v.eye) a.camera.position.y = v.eye;
        t.aim(RM.x + v.to[0], v.to[1], RM.z + v.to[2]);
        const keep = a.step; a.step = () => {}; // keep the camera exactly where it was put
        a.renderer.info.reset(); a.renderer.render(a.scene, a.camera);
        const c = { calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles, inRoom: P.inPlayroom, cam: a.camera.position.toArray().map(n => +n.toFixed(2)) };
        a.step = keep; return c;
      }, v);
      result.views[v.name] = info;
      await page.screenshot({ path: `${out}/${prefix}${v.name}.png`, timeout: 180000 });
    }
    result.furniture = await page.evaluate(() => { const pr = window.__app.world.playroom; let big = null; pr.object.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) { const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; if (!big || t > big.tris) big = { name: o.name, tris: t }; } });
      const fp = pr.footprints.map(q => [q[0][0] + 1500, q[1][0] + 1500, q[0][1] + 1500, q[2][1] + 1500].map(v => +v.toFixed(3)));
      return { largestMesh: big, footprints: fp.length, segments: pr.segments.length, nearCyanPedestal: fp.filter(r => r[0] > 3 && r[1] < 3.7 && r[2] > -1.6 && r[3] < -1.0) }; });
  } catch (e) { result.fatal = e.stack; }
  finally { await browser.close(); fs.writeFileSync(`${out}/${prefix}result.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
})();
