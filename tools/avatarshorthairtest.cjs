// #2055: layered short hair and the wound bun, before (BASELINE's src/avatar.js + src/config.js, served under /base/) and after (the
// checkout) on tools/avatarshorthair.html: front / three-quarter / profile / back / top for light, medium and dark skin with black, blond,
// red, brown and grey hair; daylight and backlight; with a beard; cap, backwards cap, knitted hat, hat and headphones on both styles; a short walking /
// stopping / turning sequence of the bun (#2014 sway); triangles, draw calls, timings.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarshorthairtest.cjs http://localhost:8155 docs/verification/2055
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8155', out = 'docs/verification/2055'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const old = Object.fromEntries(['src/avatar.js', 'src/config.js', 'src/avatarhairline.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // (iterate on a subset of sheets)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarshorthair-'));
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
    const all = ['ljus, svart', 'ljus, blond', 'ljus, röd', 'mellan, brun', 'mörk, svart', 'mörk, grå'];
    const three = ['ljus, blond', 'mellan, brun', 'mörk, svart'];
    const pair = (view, kind, variant) => [['before', view, kind, variant], ['after', view, kind, variant]];
    await page.goto(site + '/tools/avatarshorthair.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('kort.jpg', all, [...pair('front', 'day', 'short'), ...pair('q34', 'day', 'short'), ...pair('side', 'day', 'short')]);
    await save('kort-bak.jpg', all, [...pair('back', 'day', 'short'), ...pair('top', 'day', 'short'), ...pair('nape', 'day', 'short')]);
    await save('kort-motljus.jpg', three, [...pair('q34', 'back', 'short'), ...pair('side', 'back', 'short'), ...pair('back', 'back', 'short')]);
    await save('knut.jpg', all, [...pair('front', 'day', 'bun'), ...pair('q34', 'day', 'bun'), ...pair('side', 'day', 'bun')]);
    await save('knut-bak.jpg', all, [...pair('back', 'day', 'bun'), ...pair('top', 'day', 'bun'), ...pair('side', 'back', 'bun')]);
    await save('tillbehor.jpg', three, [...pair('q34', 'day', 'cap'), ...pair('side', 'day', 'capBack'), ...pair('q34', 'day', 'knit'), ...pair('q34', 'day', 'hat'), ...pair('side', 'day', 'phones')]);
    await save('tillbehor-knut.jpg', three, [...pair('q34', 'day', 'bunCap'), ...pair('side', 'day', 'bunKnit'), ...pair('q34', 'day', 'bunHat'), ...pair('side', 'day', 'bunPhones')]);
    await save('skagg.jpg', three, [...pair('front', 'day', 'shortBeard'), ...pair('q34', 'day', 'shortBeard'), ...pair('side', 'back', 'shortBeard'), ...pair('q34', 'day', 'bunBeard'), ...pair('side', 'day', 'bunBeard')]);
    await save('andra-frisyrer.jpg', three, [...pair('q34', 'day', 'curly'), ...pair('back', 'back', 'curly'), ...pair('q34', 'day', 'long'), ...pair('back', 'back', 'long')]); // (unchanged by #2055)
    await save('samtal.jpg', all, [...pair('talk', 'day', 'short'), ...pair('talk', 'back', 'short'), ...pair('talk', 'day', 'bun')]);
    if (!only || only.includes('sway')) {
      const sw = await page.evaluate(() => window.__sway([0.5, 1.05, 1.2, 1.35, 1.8, 2.3]));
      fs.writeFileSync(path.join(out, 'knut-rorelse.jpg'), Buffer.from(sw.image.split(',')[1], 'base64'));
      data.swayBun = sw.bun;
      if (!sw.bun.some((p) => Math.hypot(...p) > 0.001)) errors.push('the bun did not sway');
    }
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    fs.writeFileSync(path.join(out, 'shorthair.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, v] of Object.entries(data.info)) if (typeof v === 'object') for (const [s, r] of Object.entries(v)) if (r.calls !== 1) errors.push(`${k} ${s}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
