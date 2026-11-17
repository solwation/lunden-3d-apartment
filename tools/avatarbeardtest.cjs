// #2051: beards and moustaches that grow from the skin, before (BASELINE) and after
// (the checkout) on tools/avatarbeard.html (every src module the branch changed is served from BASELINE under /base/): front / three-quarter / profile / from below for light, medium and dark skin with black, grey and
// red beards; every facial-hair option; smile, talking and kiss; cap + headphones; the cheek edge and the moustache up close in daylight
// and backlight; 1.5 m / 3 m at the game's pixel density; the no-MSAA fallback; triangles, draw calls and timings with and without MSAA.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbeardtest.cjs http://localhost:8151 docs/verification/2051
// ONLY=a.jpg,b.jpg,cost renders a subset (iteration).
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8151', out = 'docs/verification/2051'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=M', baseline, '--', 'src']).toString().split('\n').filter(Boolean); // (every module this branch changed)
const old = Object.fromEntries(changed.map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarbeard-'));
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
    const looks = ['ljus, svart', 'ljus, röd', 'mellan, grå', 'mellan, svart', 'mörk, svart', 'mörk, grå'];
    const ba = (view, light, variant) => [['before', view, light, variant], ['after', view, light, variant]];
    await page.goto(site + '/tools/avatarbeard.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('before/fore.jpg', [['mellan, grå', 'f1'], ['mellan, grå', 'f2'], ['mellan, grå', 'f3']], [['before', 'close', 'day'], ['before', 'q34', 'day'], ['before', 'profile', 'day'], ['before', 'low', 'day'], ['before', 'cheek', 'day'], ['before', 'lip', 'day']]);
    await save('nara.jpg', looks.map((l) => [l, 'f3']), [...ba('close', 'day'), ...ba('q34', 'day'), ...ba('profile', 'day')]);
    await save('varianter.jpg', [['ljus, röd', 'f1'], ['ljus, röd', 'f2'], ['mörk, svart', 'f1'], ['mörk, svart', 'f2'], ['mellan, grå', 'f3']], [...ba('close', 'day'), ...ba('q34', 'day'), ...ba('profile', 'day'), ...ba('low', 'day')]);
    await save('motljus.jpg', [['ljus, röd', 'f3'], ['mellan, grå', 'f1'], ['mörk, svart', 'f2'], ['mörk, grå', 'f3']], [...ba('q34', 'back'), ...ba('profile', 'back'), ...ba('talk', 'back')]);
    await save('detalj.jpg', [['ljus, svart', 'f3'], ['mellan, grå', 'f1'], ['mörk, grå', 'f2'], ['ljus, röd', 'f3']], [...ba('cheek', 'day'), ...ba('lip', 'day'), ...ba('cheek', 'back')]);
    await save('mimik.jpg', [['mellan, svart', 'f1'], ['ljus, röd', 'f2'], ['mörk, grå', 'f3']], ['+smile', '+talk', '+kiss'].flatMap((x) => [...ba('lip', 'day', x), ['after', 'q34', 'day', x]]));
    await save('tillbehor.jpg', [['ljus, svart', 'f3acc'], ['mellan, grå', 'f1acc'], ['mörk, svart', 'f2acc']], [...ba('close', 'day'), ...ba('q34', 'day'), ...ba('profile', 'back')]);
    await save('samtal.jpg', [['ljus, röd', 'f3'], ['mellan, grå', 'f1'], ['mörk, svart', 'f2'], ['mörk, grå', 'f3']], [...ba('talk', 'day'), ...ba('talk', 'back'), ...ba('talk3', 'day')]);
    data.info = await page.evaluate(() => window.__info());
    if (!only || only.includes('cost')) data.cost = await page.evaluate(() => window.__cost(20));
    // the no-MSAA fallback (the beard's edge mixes towards the skin's colour)
    if (!only || only.includes('utan-msaa.jpg') || only.includes('cost')) {
      await page.goto(site + '/tools/avatarbeard.html?aa=0');
      await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
      await save('utan-msaa.jpg', [['ljus, röd', 'f3'], ['mellan, grå', 'f1'], ['mörk, svart', 'f2']], [...ba('close', 'day'), ...ba('q34', 'day'), ['after', 'cheek', 'day'], ['after', 'talk', 'day']]);
      data.infoNoMsaa = await page.evaluate(() => window.__info());
      if (!only || only.includes('cost')) data.costNoMsaa = await page.evaluate(() => window.__cost(20));
    }
    if (!only) fs.writeFileSync(path.join(out, 'beard.json'), JSON.stringify(data, null, 1) + '\n');
    for (const info of [data.info, data.infoNoMsaa]) for (const [k, v] of Object.entries(info ?? {})) if (typeof v === 'object') for (const [f, r] of Object.entries(v)) if (r.calls !== 1) errors.push(`${k} ${f}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
