// #2180: the neighbours' windows with fake rooms before/after, day and evening, real app. "before" serves origin/main's versions of
// the touched modules. tools/browsertest.sh node tools/roommap2180browser.cjs http://localhost:8294 docs/verification/2180 [before|after|both]
// env: THREE_DIR (local three@0.170.0), VIEWS="name:x,z,yaw,pitch[,feetY];…", HOURS="12,21", MONTH (default 6), BASE_REV.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8294', out = process.argv[3] || 'docs/verification/2180', mode = process.argv[4] || 'both';
const REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'exterior.js', 'glasspanes.js', 'surroundings.js'];
const VIEWS = (process.env.VIEWS || 'court:0,75,0,8').split(';').map((s) => { const [name, at] = s.split(':'); return { name, at }; });
const HOURS = (process.env.HOURS || '12,21').split(',').map(Number), month = process.env.MONTH || 6;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), result = { rev: execFileSync('git', ['rev-parse', REV], { encoding: 'utf8' }).trim(), shots: [], errors: [] };
  try {
    for (const phase of mode === 'both' ? ['before', 'after'] : [mode]) for (const v of VIEWS) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.route('**/*', (r) => {
        const u = r.request().url(), m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
        if (m && process.env.THREE_DIR) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(process.env.THREE_DIR, m[1].split('?')[0])) });
        const f = u.startsWith(base + '/') && new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
        if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${REV}:src/${f[1]}`], { maxBuffer: 1 << 28 }) });
        return r.continue();
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => result.errors.push(`${phase}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) result.errors.push(`${phase}: ${m.text()}`); });
      await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=${month}&day=15&time=12&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
      for (const h of HOURS) {
        await page.evaluate((h) => { const A = __app; A.day.paused = true; A.day.hour = h; A.step(0); A.step(0); }, h);
        const file = path.join(out, phase === 'before' ? 'before' : '', `${v.name}-${h}-${phase}.png`); fs.mkdirSync(path.dirname(file), { recursive: true });
        await kit.shot(page, file);
        const info = await page.evaluate(() => { const A = __app, r = A.renderer; r.info.reset(); r.render(A.scene, A.camera);
          const t0 = performance.now(); for (let i = 0; i < 5; i++) r.render(A.scene, A.camera); const ms = (performance.now() - t0) / 5;
          return { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs.length, renderMs: +ms.toFixed(1) }; });
        result.shots.push({ phase, view: v.name, hour: h, file, ...info }); console.log(JSON.stringify(result.shots.at(-1)));
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, `browser-${mode}.json`), JSON.stringify(result, null, 1)); console.log(JSON.stringify({ errors: result.errors }));
})().catch((e) => { console.error(e); process.exitCode = 1; });
