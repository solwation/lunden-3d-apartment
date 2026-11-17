// #2046: brows of hairs, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the checkout) on
// tools/avatarbrow.html: face close-ups front / three-quarter / brow detail for light, medium and dark skin with blond, red, black and grey
// hair; the brow slider's extremes and the expressions; 1.5 m / 3 m at the game's pixel density in daylight and backlight; the no-MSAA
// fallback; triangles, draw calls and timings.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbrowtest.cjs http://localhost:8146 docs/verification/2046
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8146', out = 'docs/verification/2046'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // (iterate on a subset of sheets)
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarbrow-'));
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
    const all = ['ljus, blond', 'ljus, röd', 'mellan, svart', 'mellan, grå', 'mörk, svart', 'mörk, grå'];
    await page.goto(site + '/tools/avatarbrow.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('before/nara-fore.jpg', all, [['before', 'close', 'day'], ['before', 'q34', 'day'], ['before', 'detail', 'day']]);
    await save('nara.jpg', all, [['before', 'close', 'day'], ['after', 'close', 'day'], ['before', 'q34', 'day'], ['after', 'q34', 'day']]);
    await save('detalj.jpg', all, [['before', 'detail', 'day'], ['after', 'detail', 'day'], ['before', 'detail', 'back'], ['after', 'detail', 'back']]);
    await save('reglage-mimik.jpg', ['ljus, blond', 'mellan, svart', 'mörk, grå'], [['after', 'close', 'day', 'thin'], ['after', 'close', 'day', 'thick'], ['after', 'close', 'day', 'low'], ['after', 'close', 'day', 'high'], ['before', 'close', 'day', 'surprise'], ['after', 'close', 'day', 'surprise'], ['after', 'q34', 'day', 'grimace']]);
    await save('samtal.jpg', all, [['before', 'talk', 'day'], ['after', 'talk', 'day'], ['before', 'talk', 'back'], ['after', 'talk', 'back'], ['before', 'talk3', 'day'], ['after', 'talk3', 'day']]);
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    // the no-MSAA fallback (the brow mixes towards the skin's colour)
    await page.goto(site + '/tools/avatarbrow.html?aa=0');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('utan-msaa.jpg', ['ljus, blond', 'mellan, svart', 'mörk, grå'], [['before', 'close', 'day'], ['after', 'close', 'day'], ['after', 'detail', 'day'], ['after', 'talk', 'day']]);
    data.infoNoMsaa = await page.evaluate(() => window.__info());
    fs.writeFileSync(path.join(out, 'brow.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, v] of Object.entries(data.info)) if (v?.calls !== undefined && v.calls !== 1) errors.push(`${k}: ${v.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
