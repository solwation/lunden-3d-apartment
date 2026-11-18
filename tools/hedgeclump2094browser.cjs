// #2094: the actual hedges (entrance boxwood, Hus L/neighbour patio hedges) before/after, summer and winter, near and
// walk views (harness from #2088 roofsurface2088browser.cjs). node tools/hedgeclump2094browser.cjs [base] [out] [mode];
// THREE_DIR = a local three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's hedge modules.
// mode "probe": only the after phase. VIEWS = JSON {name: [x, z, yaw, pitch, feet?]}.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8294', out = 'docs/verification/2094', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '80b8ba4', touched = ['hedgeform.js', 'boxwood.js', 'patiohedge.js'];
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
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|lampWash|uLampData|uLampVis/.test(m.text())) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=7&day=15&time=13&freeze&weather=clear&at=3,-14,180,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('front-boxwood'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const probe = () => page.evaluate(() => { // hedge meshes: vertices, position hash, material, compiled program key
        const out = {}, r = window.__app.renderer; window.__app.scene.traverse((o) => { if (!o.isMesh) return; const m = [].concat(o.material)[0];
          if (!/hedge|boxwood/.test(m?.name || '')) return; const p = o.geometry.attributes.position.array; let h = 0; for (let i = 0; i < p.length; i += 7) h = (h * 31 + Math.round(p[i] * 1000)) | 0;
          out[(o.parent?.name || '?') + '/' + m.name + '#' + Object.keys(out).length] = { vertices: o.geometry.attributes.position.count, hash: h, map: !!m.map, visible: o.visible, key: m.customProgramCacheKey?.() }; });
        return { hedges: out, programs: r.info.programs.length };
      });
      const info = { summer: await probe() }; info.loadMs = Date.now() - t0; report.phases[phase] = info;
      if (mode === 'probe') { console.log(JSON.stringify(info, null, 1)); await ctx.close(); break; }
      for (const [season, month] of [['sommar', 7], ['vinter', 1]]) {
        await page.evaluate((month) => { window.__app.day.month = month; window.__app.day.paused = true; }, month); await page.waitForTimeout(1500);
        if (season === 'vinter') info.winter = await probe();
        for (const [name, [x, z, yaw, pitch, feet]] of Object.entries(views)) {
          await page.evaluate(([x, z, yaw, pitch, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = 13; a.day.paused = true; }, [x, z, yaw, pitch, feet]);
          await page.waitForTimeout(1500);
          const file = path.join(out, `${name}-${season}-${phase}.png`);
          await kit.shot(page, file, { frames: 4 });
          const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length, eye: window.__app.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
          (info.views ??= {})[`${name}-${season}`] = calls;
        }
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
