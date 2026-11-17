// #2052: the anisotropic hair gloss, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the checkout) on
// tools/avatarhairgloss.html: matched front / three-quarter / profile / back close-ups in daylight, backlight and under a night street
// lamp for black, brown, blond, red and grey hair (short, long, curly, bun, beard), 3 m and 12 m views, a short camera orbit per distance
// with its frame-to-frame change (flicker), triangles and draw calls, and ms/frame with and without MSAA.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairglosstest.cjs http://localhost:8152 docs/verification/2052 [quick]
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8152', out = 'docs/verification/2052', mode = 'full'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const all = ['kort svart', 'kort brunt', 'långt blont', 'lockigt svart', 'knut rött', 'skägg grått'];
async function open(ctx, query, errors) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 4000)); });
  await page.route('**/base/**', async (r) => {
    const u = new URL(r.request().url()), rel = u.pathname.replace(/^\/base\//, '');
    if (old[rel]) return r.fulfill({ contentType: 'text/javascript', body: old[rel] });
    const res = await r.fetch({ url: `${u.origin}/${rel}${u.search}` });
    return r.fulfill({ response: res });
  });
  await page.goto(site + '/tools/avatarhairgloss.html' + query);
  await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  return page;
}
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hairgloss-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 400, height: 400 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline: execFileSync('git', ['rev-parse', baseline]).toString().trim(), head: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() };
  try {
    const page = await open(ctx, '', errors);
    const save = async (name, rows, cols) => {
      const url = await page.evaluate(([r, c]) => window.__sheet(r, c), [rows, cols]);
      fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    const pair = (view, kind) => [['before', view, kind], ['after', view, kind]];
    if (mode === 'quick') {
      await save('quick.jpg', all, [...pair('near', 'day'), ...pair('back', 'day'), ...pair('near', 'night')]);
    } else {
      await save('dagsljus.jpg', all, [...pair('front', 'day'), ...pair('near', 'day'), ...pair('back', 'day')]);
      await save('motljus-profil.jpg', all, [...pair('side', 'day'), ...pair('near', 'back'), ...pair('side', 'back')]);
      await save('gatlampa.jpg', all, [...pair('front', 'night'), ...pair('near', 'night'), ...pair('back', 'night')]);
      await save('avstand.jpg', all, [...pair('m3', 'day'), ...pair('m3', 'night'), ...pair('far', 'day')]);
      data.orbit = {};
      for (const [name, view] of [['kort brunt', 'm3'], ['långt blont', 'far'], ['kort svart', 'near']]) {
        const r = await page.evaluate(([n, v]) => window.__orbit(n, v, 'day', 8, v === 'near' ? 0.08 : 0.035), [name, view]);
        fs.writeFileSync(path.join(out, `orbit-${view}.jpg`), Buffer.from(r.image.split(',')[1], 'base64'));
        delete r.image; data.orbit[`${name} ${view}`] = r;
      }
      data.info = await page.evaluate(() => window.__info());
      for (const [k, v] of Object.entries(data.info)) if (v?.calls !== undefined && v.calls !== 1) errors.push(`${k}: ${v.calls} draw calls`);
      data.cost = { msaa: { crowd: await page.evaluate(() => window.__cost(16, 'crowd')), close: await page.evaluate(() => window.__cost(16, 'close')) } };
      await page.close();
      const p2 = await open(ctx, '?aa=0', errors);
      data.cost.noMsaa = { crowd: await p2.evaluate(() => window.__cost(16, 'crowd')), close: await p2.evaluate(() => window.__cost(16, 'close')) };
      fs.writeFileSync(path.join(out, 'gloss.json'), JSON.stringify(data, null, 1) + '\n');
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
