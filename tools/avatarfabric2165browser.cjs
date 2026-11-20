// #2165: before/after images of the fabrics' own finish and the jeans' wear: the four figures in low sun, jeans and torso close-ups and the
// mirror preview; the same draws / triangles / textures before and after, no shader errors, the program count. The "before" pass serves the
// base revision's src/avatar.js, src/avatarcloth.js and src/config.js.
// tools/browsertest.sh node tools/avatarfabric2165browser.cjs http://127.0.0.1:8240 docs/verification/2165     (BASELINE: the base revision)
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://127.0.0.1:8240', out = 'docs/verification/2165'] = process.argv.slice(2);
const baseline = process.env.BASELINE || 'be173bd4';
const old = Object.fromEntries(['src/avatar.js', 'src/avatarcloth.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 })]));
const SHOTS = [['sun-group', (p) => p.evaluate(() => window.__group(false))], ['jeans-knee', (p) => p.evaluate(() => window.__close(0, 'knee'))],
  ['jeans-thigh', (p) => p.evaluate(() => window.__close(1, 'thigh'))], ['knit-torso', (p) => p.evaluate(() => window.__close(1, 'torso'))],
  ['fleece-torso', (p) => p.evaluate(() => window.__close(2, 'torso'))], ['cotton-torso', (p) => p.evaluate(() => window.__close(0, 'torso'))]];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline, source: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() };
  try {
    for (const tag of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', ''))) }));
      if (tag === 'before') await page.route('**/src/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); return old[f] ? r.fulfill({ contentType: 'text/javascript', body: old[f] }) : r.continue(); });
      await page.goto(site + '/tools/avatarfabric2165.html');
      await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
      const dir = path.join(out, tag === 'before' ? 'before' : ''); data[tag] = { shots: {} };
      for (const [name, run] of SHOTS) { data[tag].shots[name] = await run(page); await page.locator('canvas').first().screenshot({ path: path.join(dir, `${name}.png`) }); }
      await page.evaluate(() => window.__preview()); await page.locator('#sheet').screenshot({ path: path.join(dir, 'mirror-preview.png') });
      await page.evaluate(() => window.__showMain());
      data[tag].ms = await page.evaluate(() => window.__time(10));
      await page.close();
    }
    const brief = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v.calls, v.tris, v.textures]]));
    assert.deepEqual(brief(data.after.shots), brief(data.before.shots));
    data.errors = errors; fs.writeFileSync(path.join(out, 'fabric.json'), JSON.stringify(data, null, 2) + '\n');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS', JSON.stringify({ ms: [data.before.ms, data.after.ms], programs: [data.before.shots['sun-group'].programs, data.after.shots['sun-group'].programs] }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
