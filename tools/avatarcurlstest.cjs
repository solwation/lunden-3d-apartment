// #2054: curly hair as curl volumes, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the checkout) on
// tools/avatarcurls.html: front / three-quarter / profile / back for light and dark skin with black, brown and blond hair; short and long
// curly; cap, knitted hat, hat and headphones; daylight and backlight; a turn-and-stop sway sequence; triangles, draw calls, timings.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarcurlstest.cjs http://localhost:8154 docs/verification/2054
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8154', out = 'docs/verification/2054'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // (iterate on a subset of sheets)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarcurls-'));
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
    const write = (name, url) => fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    const save = async (name, rows, cols) => {
      if (only && !only.includes(name)) return;
      write(name, await page.evaluate(([r, c]) => window.__sheet(r, c), [rows, cols]));
    };
    const six = ['ljus, svart', 'ljus, brun', 'ljus, blond', 'mörk, svart', 'mörk, brun', 'mörk, blond'], three = ['ljus, blond', 'mellan, brun', 'mörk, svart'];
    const pair = (view, kind, variant) => [['before', view, kind, variant], ['after', view, kind, variant]];
    await page.goto(site + '/tools/avatarcurls.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('lockigt.jpg', six, [...pair('front', 'day', 'mid'), ...pair('q34', 'day', 'mid'), ...pair('side', 'day', 'mid'), ...pair('back', 'day', 'mid')]);
    await save('motljus.jpg', six, [...pair('front', 'back', 'mid'), ...pair('q34', 'back', 'mid'), ...pair('side', 'back', 'mid'), ...pair('back', 'back', 'mid')]);
    await save('kort.jpg', three, [...pair('front', 'day', 'short'), ...pair('q34', 'day', 'short'), ...pair('side', 'day', 'short'), ...pair('back', 'back', 'short')]);
    await save('langt.jpg', three, [...pair('front', 'day', 'long'), ...pair('q34', 'day', 'long'), ...pair('side', 'day', 'long'), ...pair('back', 'back', 'long')]);
    await save('nara.jpg', three, [...pair('zoom', 'day', 'mid'), ...pair('zoom', 'back', 'mid'), ...pair('talk', 'day', 'long')]);
    await save('tillbehor.jpg', three, [...pair('q34', 'day', 'cap'), ...pair('side', 'day', 'capBack'), ...pair('side', 'day', 'knit'), ...pair('back', 'day', 'knit')]);
    await save('tillbehor-2.jpg', three, [...pair('q34', 'day', 'hat'), ...pair('front', 'day', 'phones'), ...pair('side', 'day', 'phones'), ...pair('q34', 'day', 'phonesKnit')]);
    await save('mossa-kant.jpg', three, [...pair('cuff', 'day', 'knit'), ...pair('cuff', 'day', 'phonesKnit'), ...pair('cuff', 'day', 'cap'), ...pair('cuff', 'day', 'hat')]);
    if (!only || only.includes('sway.jpg')) {
      const s = await page.evaluate(() => window.__swaySheet(['before', 'after'], [0.15, 0.4, 0.6, 0.75, 0.95, 1.6], 'long'));
      write('sway.jpg', s.url); data.sway = s.data;
      if (!(Math.max(...s.data.filter((d) => d.phase === 'after').flatMap((d) => d.hair.map(Math.abs))) > 0.004)) errors.push('the curly curtain did not sway');
    }
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    fs.writeFileSync(path.join(out, 'curls.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, v] of Object.entries(data.info)) if (typeof v === 'object') for (const [s, r] of Object.entries(v)) if (r.calls !== 1) errors.push(`${k} ${s}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ info: data.info, cost: data.cost }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
