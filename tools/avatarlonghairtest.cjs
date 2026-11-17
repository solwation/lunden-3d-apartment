// #2053: long hair in locks, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the checkout) on
// tools/avatarlonghair.html: back, profile, three-quarter and front for light / medium / dark skin with blond, red and black hair, in
// daylight and backlight; walking, running and sitting; triangles, draw calls and a timing run.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarlonghairtest.cjs http://localhost:8153 docs/verification/2053
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8153', out = 'docs/verification/2053'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // (iterate on a subset of sheets)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarlonghair-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 400, height: 400 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline: execFileSync('git', ['rev-parse', baseline]).toString().trim() };
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 3000)); });
    await page.route('**/base/**', async (r) => {
      const u = new URL(r.request().url()), rel = u.pathname.replace(/^\/base\//, '');
      if (old[rel]) return r.fulfill({ contentType: 'text/javascript', body: old[rel] });
      const res = await r.fetch({ url: `${u.origin}/${rel}${u.search}` });
      return r.fulfill({ response: res });
    });
    const save = async (name, rows, cols) => {
      if (only && !only.includes(name)) return;
      const url = await page.evaluate(([r, c]) => window.__sheet(r, c), [rows, cols]);
      fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    const all = ['ljus, blond', 'mellan, röd', 'mörk, svart'];
    const pair = (view, kind, pose) => [['before', view, kind, pose], ['after', view, kind, pose]];
    await page.goto(site + '/tools/avatarlonghair.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('bakifran.jpg', all, [...pair('back', 'day'), ...pair('back', 'back')]);
    await save('profil.jpg', all, [...pair('side', 'day'), ...pair('side', 'back')]);
    await save('snett.jpg', all, [...pair('q34', 'day'), ...pair('q34', 'back'), ...pair('q34front', 'day')]);
    await save('rakt.jpg', all, [...pair('front', 'day'), ...pair('front', 'back')]);
    await save('rorelse.jpg', all, [...pair('back', 'day', 'walk'), ...pair('side', 'day', 'run'), ...pair('q34front', 'day', 'sit'), ['after', 'side', 'day', 'sit']]);
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    fs.writeFileSync(path.join(out, 'longhair.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, r] of Object.entries(data.info)) if (typeof r === 'object' && r.calls !== 1) errors.push(`${k}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
