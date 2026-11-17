// #2050: the soft hairline, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the checkout) on
// tools/avatarhairline.html: front / three-quarter / profile for light, medium and dark skin with black, blond, grey and brown hair; every
// hairstyle; cap, knitted hat, hat, glasses + headphones; daylight and backlight; the no-MSAA fallback; triangles, draw calls, timings.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairlinetest.cjs http://localhost:8150 docs/verification/2050
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8150', out = 'docs/verification/2050'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // (iterate on a subset of sheets)
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarhairline-'));
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
    const all = ['ljus, svart', 'ljus, blond', 'ljus, grå', 'mörk, svart', 'mörk, blond', 'mörk, grå'];
    const pair = (view, kind, variant) => [['before', view, kind, variant], ['after', view, kind, variant]];
    await page.goto(site + '/tools/avatarhairline.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('before/kort-fore.jpg', all, [['before', 'front', 'day', 'short'], ['before', 'q34', 'day', 'short'], ['before', 'side', 'day', 'short']]);
    await save('kort.jpg', all, [...pair('front', 'day', 'short'), ...pair('q34', 'day', 'short'), ...pair('side', 'day', 'short')]);
    await save('motljus.jpg', all, [...pair('q34', 'back', 'short'), ...pair('side', 'back', 'short'), ...pair('back', 'day', 'short')]);
    await save('halvnara.jpg', all, [...pair('mid', 'day', 'short'), ...pair('mid', 'back', 'short'), ...pair('mid', 'day', 'long')]);
    await save('detalj.jpg', all, [...pair('detail', 'day', 'short'), ...pair('detail', 'back', 'short'), ...pair('detail', 'day', 'bun')]);
    for (const v of ['long', 'bun', 'beanie', 'curly'])
      await save(`frisyr-${v}.jpg`, ['ljus, blond', 'mellan, brun', 'mörk, svart'], [...pair('front', 'day', v), ...pair('q34', 'day', v), ...pair('side', 'day', v), ...pair('back', 'back', v)]);
    await save('tillbehor.jpg', ['ljus, svart', 'mellan, brun', 'mörk, grå'], [...pair('q34', 'day', 'cap'), ...pair('side', 'day', 'knit'), ...pair('q34', 'day', 'hat'), ...pair('q34', 'day', 'specs'), ...pair('side', 'day', 'specsLong')]);
    await save('samtal.jpg', all, [...pair('talk', 'day', 'short'), ...pair('talk', 'back', 'short'), ...pair('talk', 'day', 'long')]);
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    // the no-MSAA fallback (a dithered cut-out)
    await page.goto(site + '/tools/avatarhairline.html?aa=0');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('utan-msaa.jpg', ['ljus, svart', 'mellan, brun', 'mörk, blond'], [...pair('front', 'day', 'short'), ...pair('side', 'day', 'short'), ['after', 'detail', 'day', 'short'], ['after', 'talk', 'day', 'short']]);
    data.infoNoMsaa = await page.evaluate(() => window.__info());
    fs.writeFileSync(path.join(out, 'hairline.json'), JSON.stringify(data, null, 1) + '\n');
    for (const info of [data.info, data.infoNoMsaa]) for (const [k, v] of Object.entries(info)) if (typeof v === 'object') for (const [s, r] of Object.entries(v)) if (r.calls !== 1) errors.push(`${k} ${s}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
