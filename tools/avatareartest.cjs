// #2047: the avatar ear, before (BASELINE's src/avatar.js, src/config.js and src/avatarskin.js, served under /base/) and after (the checkout)
// on tools/avatarear.html: the head from the front, three-quarter, profile and behind, and the ear up close, in daylight and backlight for
// light / medium / dark skin; the accessories at the ear (earrings, headphones, beanie, cap, glasses, long and curly hair); triangles,
// draw calls (1 per avatar) and a crowd / close-up timing. MODE=quick renders only the close-up sheet (iteration).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatareartest.cjs http://localhost:8147 docs/verification/2047
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8147', out = 'docs/verification/2047'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim(); // the branch's base
const old = Object.fromEntries(['src/avatar.js', 'src/config.js', 'src/avatarskin.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarear-'));
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
    await page.goto(site + '/tools/avatarear.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
    const save = async (name, rows, cols) => {
      const url = await page.evaluate(([r, c]) => window.__sheet(r, c), [rows, cols]);
      fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    const ba = (views, light) => views.flatMap((v) => [['before', v, light], ['after', v, light]]);
    const tones = ['ljus', 'mellan', 'mörk'];
    if (process.env.MODE === 'quick') {
      await save('quick.jpg', ['ljus', 'mörk'], ba(['near', 'nside', 'nback'], 'day'));
      await save('quick-head.jpg', ['ljus', 'mörk'], ba(['front', 'q', 'bq'], 'day'));
      await save('quick-acc.jpg', ['knoppar', 'ringar', 'hörlurar', 'mössa', 'glasögon', 'långt', 'lockigt'], ba(['front', 'q', 'side'], 'day'));
      await save('quick-back.jpg', tones, ba(['nside', 'near'], 'back'));
    } else {
      await save('before/huvud-fore.jpg', tones, ['front', 'q', 'side', 'bq', 'rear'].map((v) => ['before', v, 'day']));
      await save('huvud-dagsljus.jpg', tones, ba(['front', 'q', 'side', 'bq', 'rear'], 'day'));
      await save('ora-nara.jpg', tones, ba(['near', 'nside', 'nback'], 'day'));
      await save('ora-motljus.jpg', tones, ba(['nside', 'near', 'side'], 'back'));
      await save('tillbehor.jpg', ['knoppar', 'ringar', 'hängen', 'hörlurar', 'mössa', 'keps', 'glasögon', 'långt', 'lockigt'], ba(['front', 'q', 'side', 'bq'], 'day'));
      data.info = await page.evaluate(() => window.__info());
      data.cost = await page.evaluate(() => window.__cost(20));
      fs.writeFileSync(path.join(out, 'ear.json'), JSON.stringify(data, null, 1) + '\n');
      for (const [k, v] of Object.entries(data.info)) if (v.calls !== 1) errors.push(`${k}: ${v.calls} draw calls`);
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
