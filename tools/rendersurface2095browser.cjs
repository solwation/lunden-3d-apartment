// #2095: the actual rendered façades (Hus L's white render on the street side behind the loftgång and the set-back
// courtyard storey; the Å-husen A/B/C's white loggia / recess walls) before/after, by day: near views and street distance.
// node tools/rendersurface2095browser.cjs [base] [out] [mode]; THREE_DIR = a local three@0.170.0 package (CDN routed to it).
// "before" serves BASE_REV's versions of the touched modules (no rendersurface.js import). mode "probe": after phase only,
// prints the render meshes. VIEWS = JSON {name: [x, z, yaw, pitch, feet?]} overrides the default views.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8295', out = 'docs/verification/2095', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '80b8ba4', touched = ['config.js', 'exterior.js', 'surroundings.js'];
const VIEWS = { // [x, z, yaw°, pitch°, feet?] — yaw 180 looks south (+z)
  'husL-gata': [3, -14, 180, 14],          // street distance, north of Hus L, up at våning 3–4's render
  'husL-loftgang': [-30, 0.2, 200, -15, 6.4], // on the loftgång: the render round a window and a door, the splash band
  'husL-terrass': [2, 12.3, 300, -5, 9.46],   // on a roof terrace in the sun: the set-back courtyard storey
  'husA-loggia': [-13.4, 24.6, -140, 12],      // Hus A's north-west corner loggias from the courtyard
  'husC-gata': [-48, 8, -120, 8],              // Hus C's loggias at distance
};
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
  const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : VIEWS;
  try {
    for (const phase of mode === 'probe' || mode === 'after' ? ['after'] : ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|lampWash|uLampData|uLampVis/.test(m.text())) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=7&day=15&time=13&freeze&weather=clear&at=3,-14,180,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('south-roof'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      // the render meshes: Hus L's (colour f2efe7) and the Å-husen's white loggia mesh (NEIGHBOR_OPENINGS.site.frameColor, DoubleSide)
      const info = await page.evaluate(() => {
        const s = window.__app.scene, found = {}; let meshes = 0;
        s.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; if (!o.isMesh) return; const m = [].concat(o.material)[0]; if (!m?.color) return;
          const hex = m.color.getHexString(), husL = m.bumpMap?.name === 'render-surface' ? m.side === 0 : hex === 'f2efe7' && !m.map;
          const abc = m.bumpMap?.name === 'render-surface' ? m.side === 2 : hex === 'f0efeb' && m.side === 2 && !m.map;
          if (!husL && !abc) return;
          const g = o.geometry, p = g.attributes.position.array, c = g.attributes.color?.array; let h = 0, tri = 0, plain = 0, area = 0, dark = 0;
          for (let i = 0; i < p.length; i += 7) h = (h * 31 + Math.round(p[i] * 1000)) | 0;
          for (let t = 0; t < g.attributes.position.count; t += 3) { // area-weighted mean vertex colour (1 = the old façade)
            const ax = p[t * 3], ay = p[t * 3 + 1], az = p[t * 3 + 2], ux = p[t * 3 + 3] - ax, uy = p[t * 3 + 4] - ay, uz = p[t * 3 + 5] - az, vx = p[t * 3 + 6] - ax, vy = p[t * 3 + 7] - ay, vz = p[t * 3 + 8] - az;
            const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; tri++;
            const k = c ? (c[t * 3] + c[t * 3 + 3] + c[t * 3 + 6]) / 3 : 1; if (k === 1) plain++; area += a; dark += a * k;
          }
          found[husL ? 'husL' : 'aHouses'] = { vertices: g.attributes.position.count, hash: h, triangles: tri, dirtTriangles: tri - plain, meanColour: dark / area,
            uv: !!g.attributes.uv, color: !!c, bump: !!m.bumpMap, roughnessMap: !!m.roughnessMap, roughness: +m.roughness.toFixed(4), vertexColors: m.vertexColors, matColor: hex };
        });
        return { meshes, found };
      });
      info.loadMs = Date.now() - t0; report.phases[phase] = info;
      if (mode === 'probe') { console.log(JSON.stringify(info, null, 1)); }
      for (const [name, [x, z, yaw, pitch, feet]] of Object.entries(views)) {
        await page.evaluate(([x, z, yaw, pitch, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = 13; a.day.paused = true; }, [x, z, yaw, pitch, feet]);
        await page.waitForTimeout(1500);
        const file = path.join(out, `${name}-${phase}.png`);
        await kit.shot(page, file, { frames: 4 });
        const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length, eye: window.__app.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
        (info.views ??= {})[name] = calls;
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5), phases: Object.fromEntries(Object.entries(report.phases).map(([k, v]) => [k, { found: v.found, views: v.views }])) }, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
