// #2040: flyaway hairs and the backlit hair rim, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the
// checkout) on tools/avatarflyaway.html: backlit close-ups / profiles / 3 m views of short, long, curly, bun, beard and two hat cases, a
// daylight sheet, the far view, the canvas alpha (the page must never show through), triangles, draw calls and a crowd timing.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarflyawaytest.cjs http://localhost:8240 docs/verification/2040
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8240', out = 'docs/verification/2040'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim(); // the branch's base
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarfly-'));
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
    await page.goto(site + '/tools/avatarflyaway.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    const save = async (name, rows, cols) => {
      const url = await page.evaluate(([r, c]) => window.__sheet(r, c), [rows, cols]);
      fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    const all = ['kort', 'långt', 'lockigt', 'knut', 'skägg', 'keps', 'mössa'];
    await save('before/motljus-fore.jpg', all, [['before', 'near', 'back'], ['before', 'side', 'back'], ['before', 'm3', 'back']]);
    await save('motljus.jpg', all, [['before', 'near', 'back'], ['after', 'near', 'back'], ['before', 'side', 'back'], ['after', 'side', 'back']]);
    await save('motljus-3m-dagsljus.jpg', all, [['before', 'm3', 'back'], ['after', 'm3', 'back'], ['before', 'near', 'day'], ['after', 'near', 'day']]);
    await save('detalj.jpg', ['kort', 'långt', 'lockigt', 'knut', 'skägg'], [['before', 'detail', 'back'], ['after', 'detail', 'back'], ['before', 'detail', 'day'], ['after', 'detail', 'day']]);
    await save('langt-12m.jpg', ['långt', 'skägg'], [['before', 'far', 'back'], ['after', 'far', 'back']]);
    data.alpha = await page.evaluate(() => window.__alpha());
    data.info = await page.evaluate(() => window.__info());
    data.cost = await page.evaluate(() => window.__cost(20));
    fs.writeFileSync(path.join(out, 'flyaway.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, v] of Object.entries(data.alpha)) if (v !== 255) errors.push(`canvas alpha ${v} < 255 for ${k}`);
    for (const [k, v] of Object.entries(data.info)) if (v?.calls !== undefined && v.calls !== 1) errors.push(`${k}: ${v.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
