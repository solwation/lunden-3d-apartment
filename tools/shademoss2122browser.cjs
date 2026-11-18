// #2122: moss low on the shaded north faces — the actual wall batches (Hus L brick/render, the Å-husen A/B/C brick façades,
// plinths and white render, the brick retaining walls, the park stairs) before/after, by day: near and at distance.
// node tools/shademoss2122browser.cjs [base] [out] [mode]; THREE_DIR = a local three@0.170.0 package (CDN routed to it).
// "before" serves BASE_REV's versions of the touched modules (no shademoss.js import). mode "probe": after phase only, prints
// the mossy meshes. VIEWS = JSON {name: [x, z, yaw, pitch, feet?]} overrides the default views. Also "&lowmem" (mode "phone").
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8322', out = 'docs/verification/2122', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '7dced376', touched = ['config.js', 'exterior.js', 'surroundings.js'];
const VIEWS = { // [x, z, yaw°, pitch°, feet?] — yaw 180 looks south (+z), at a north face
  'husL-nara': [-8, -2.6, 160, -22],   // Hus L's north brick, near: the foot of the street façade
  'husL-gata': [-6, -16, 180, -2],     // the same façade at street distance
  'husA-nord': [2, 23, 200, -6],       // Hus A's north face from the courtyard
  'husB-nord': [-32, 27, 180, -4],     // Hus B's north face
  'husC-nord': [-61, 4, 180, -4],      // Hus C's north face
};
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`], { maxBuffer: 1 << 26 }) });
    return r.continue();
  });
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), phases: {}, errors: [], external: [] };
  const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : VIEWS, phone = mode === 'phone';
  try {
    for (const phase of mode === 'probe' || mode === 'after' || phone ? ['after'] : ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=7&day=15&time=13&freeze&weather=clear&at=3,-14,180,0${phone ? '&lowmem' : ''}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('south-roof'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const info = await page.evaluate(() => {
        const s = window.__app.scene, found = []; let meshes = 0;
        s.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; if (!o.isMesh) return; const m = [].concat(o.material)[0];
          const a = o.geometry.attributes.mossHeight; if (!a && !m?.userData?.shadeMoss) return;
          let lo = Infinity, hi = -Infinity, low = 0; if (a) for (const v of a.array) { lo = Math.min(lo, v); hi = Math.max(hi, v); if (v - 100 < 1.3) low++; }
          o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
          found.push({ name: o.name || o.parent?.name || '?', kind: m.userData.shadeMoss, vertices: o.geometry.attributes.position.count, lowVertices: low, height: [+(lo - 100).toFixed(2), +(hi - 100).toFixed(2)],
            box: [b.min.toArray().map(Math.round), b.max.toArray().map(Math.round)], key: m.customProgramCacheKey().slice(-40) });
        });
        return { meshes, found };
      });
      info.loadMs = Date.now() - t0; report.phases[phase] = info;
      if (mode === 'probe') console.log(JSON.stringify(info, null, 1));
      for (const [name, [x, z, yaw, pitch, feet]] of Object.entries(views)) {
        await page.evaluate(([x, z, yaw, pitch, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = 13; a.day.paused = true; }, [x, z, yaw, pitch, feet]);
        await page.waitForTimeout(1500);
        const file = path.join(out, `${name}-${phone ? 'phone' : phase}.png`);
        await kit.shot(page, file, { frames: 4 });
        const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length, eye: window.__app.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
        (info.views ??= {})[name] = calls;
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, phone ? 'browser-phone.json' : 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5), phases: Object.fromEntries(Object.entries(report.phases).map(([k, v]) => [k, { meshes: v.meshes, mossy: v.found.length, loadMs: v.loadMs, views: v.views }])) }, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
