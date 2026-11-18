// #2104: the street lamps at night before/after (halo round the heads, the ground pools), near and at a distance, plus a noon
// view (unchanged by day). node tools/lamphalo2104browser.cjs [base] [out] [mode]; THREE_DIR = a local three@0.170.0 package
// (CDN routed to it). "before" serves BASE_REV's versions of the touched modules. mode "probe": the after phase only, prints
// the lamp heads. VIEWS = JSON {name: [x, z, yaw, pitch, hour, feet?]}.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8304', out = 'docs/verification/2104', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'ef7dac5', touched = ['config.js', 'street.js', 'groundglow.js'];
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`]) });
    return r.continue();
  });
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), phases: {}, errors: [], external: [] };
  const views = JSON.parse(process.env.VIEWS || '{}');
  try {
    for (const phase of mode === 'probe' || mode === 'after' ? ['after'] : ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      // three's shader compile/link failures come as console warnings/errors ("THREE.WebGLProgram: Shader Error")
      page.on('console', (m) => { if (/Shader Error|WebGLProgram|ERROR: 0:/.test(m.text())) report.errors.push(phase + ' shader: ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=10&day=15&time=22&freeze&weather=clear&at=-20,-22,90,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('streetLampPools'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const probe = () => page.evaluate(() => { const s = window.__app.scene, heads = s.getObjectByName('streetLampHeads'), halos = s.getObjectByName('streetLampHalos'), pools = s.getObjectByName('streetLampPools');
        let lights = 0; s.traverse((o) => { if (o.isLight) lights++; });
        const m = new window.__app.camera.matrix.constructor(), at = [];
        for (let i = 0; i < Math.min(heads.count, 80); i++) { heads.getMatrixAt(i, m); at.push([m.elements[12], m.elements[14]].map((v) => +v.toFixed(1))); }
        return { lights, heads: heads.count, halos: halos ? { quads: halos.geometry.index.count / 6, visible: halos.visible, opacity: +halos.material.opacity.toFixed(3) } : null,
          pools: { vertices: pools.geometry.attributes.position.count, visible: pools.visible, opacity: +pools.material.opacity.toFixed(3) }, at }; });
      const info = { night: await probe(), loadMs: Date.now() - t0 }; report.phases[phase] = info;
      if (mode === 'probe') { console.log(JSON.stringify(info)); await ctx.close(); break; }
      for (const [name, [x, z, yaw, pitch, hour, feet]] of Object.entries(views)) {
        await page.evaluate(([x, z, yaw, pitch, hour, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = hour; a.day.paused = true; }, [x, z, yaw, pitch, hour, feet]);
        await page.waitForTimeout(3500); // the pools' / halos' 1.5 s fade after an hour change
        const file = path.join(out, `${name}-${phase}.png`);
        await kit.shot(page, file, { frames: 4 });
        const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length, eye: window.__app.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
        calls.state = await probe().then((p) => ({ lights: p.lights, halos: p.halos, pools: { visible: p.pools.visible, opacity: p.pools.opacity } }));
        (info.views ??= {})[name] = calls;
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
