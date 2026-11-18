// #2123: the snow cap on narrow upward faces — the actual batches (Hus L sills/cappings/copings/rails, the Å-husen A/B/C
// loggia slabs, parapets, rails and sheet metal, the box rails, the courtyard benches) before/after in January, and after in
// July (no change outside the snow months). node tools/snowcap2123browser.cjs [base] [out] [mode]; THREE_DIR = a local
// three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's versions of the touched modules (no snowcap.js import).
// mode "probe": after/January only, prints the capped meshes. VIEWS = JSON {name: [x, z, yaw, pitch, feet?]}. "phone": &lowmem.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8323', out = 'docs/verification/2123', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '5c578f1f', touched = ['config.js', 'exterior.js', 'surroundings.js', 'courtyard.js', 'busstop.js'];
const VIEWS = { // [x, z, yaw°, pitch°, feet?] — raised eyes look down onto the tops
  'husL-gata': [-6, -12, 180, -30, 7],  // Hus L's street façade from above the street: sill flashings, loftgång rail
  'husL-tak': [-6, -6, 180, -35, 15],   // Hus L's roof edge: the capping ring and copings
  'husA': [2, 23, 200, -30, 8],         // Hus A from the courtyard: loggia slabs, parapets, rails
  'husB': [-32, 27, 180, -30, 8],       // Hus B
  'husC': [-61, 4, 180, -30, 8],        // Hus C
  'gard-bankar': [-30, 24, 90, -40, 3], // the courtyard benches
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
    for (const [phase, month] of mode === 'probe' || phone ? [['after', 1]] : [['before', 1], ['after', 1], ['after-july', 7]]) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase.slice(0, 6) === 'before' ? 'before' : phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=${month}&day=15&time=13&freeze&weather=clear&at=3,-14,180,0${phone ? '&lowmem' : ''}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('south-roof'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const info = await page.evaluate(() => {
        const s = window.__app.scene, found = []; let meshes = 0;
        s.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; if (!o.isMesh) return; const m = [].concat(o.material)[0];
          if (!m?.userData?.snowCap) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
          found.push({ name: o.name || o.parent?.name || '?', vertices: o.geometry.attributes.position.count, box: [b.min.toArray().map(Math.round), b.max.toArray().map(Math.round)], key: m.customProgramCacheKey().slice(-60) });
        });
        let uSnowCap = null; s.traverse((o) => { const m = o.isMesh && [].concat(o.material)[0]; if (m?.userData?.snowCap && uSnowCap == null) uSnowCap = window.__app.renderer.properties.get(m).uniforms?.uSnowCap?.value ?? null; });
        return { meshes, found, uSnowCap };
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
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5), phases: Object.fromEntries(Object.entries(report.phases).map(([k, v]) => [k, { meshes: v.meshes, capped: v.found.length, uSnowCap: v.uSnowCap, loadMs: v.loadMs, views: v.views }])) }, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
