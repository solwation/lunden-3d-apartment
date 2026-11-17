// #2061: the beard's sideburn meets the scalp's hairline sideburn (src/avatarbeard.js AVATAR_BEARD.sideburn), before (BASELINE) and after
// (the checkout) on tools/avatarbeard.html (every src module the branch changed is served from BASELINE under /base/): the sideburn in
// profile and three-quarter from behind, for every facial-hair option with short, long and curly hair, light and dark hair on light and
// dark skin; cap + headphones; the cost (triangles, draw calls, ms/frame before vs after).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarsideburntest.cjs http://localhost:8161 docs/verification/2061
// ONLY=a.jpg,b.jpg,cost renders a subset (iteration); PHASES=after skips the before columns.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://localhost:8161', out = 'docs/verification/2061'] = process.argv.slice(2);
const baseline = process.env.BASELINE || execFileSync('git', ['merge-base', 'HEAD', 'origin/main']).toString().trim();
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=M', baseline, '--', 'src']).toString().split('\n').filter(Boolean);
const old = Object.fromEntries(changed.map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 32e6 })]));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const phases = process.env.PHASES ? process.env.PHASES.split(',') : ['before', 'after'];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarsideburn-'));
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
    const ba = (view, light, variant) => phases.map((p) => [p, view, light, variant]);
    const cols = (light = 'day') => [...ba('side', light), ...ba('back34', light)];
    // every facial-hair option; light and dark hair on light and dark skin
    const rows = (s, h = '') => [['ljus, svart', `f1s${s}${h}`], ['mörk, grå', `f1s${s}${h}`], ['ljus, blond', `f2s${s}${h}`], ['mörk, svart', `f2s${s}${h}`], ['ljus, svart', `f3s${s}${h}`], ['mörk, grå', `f3s${s}${h}`]];
    await page.goto(site + '/tools/avatarbeard.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    await save('narbild.jpg', [['ljus, svart', 'f1s0'], ['mörk, grå', 'f3s0'], ['ljus, blond', 'f1s4']], [...ba('sidez', 'day'), ...ba('side', 'day'), ...ba('profile', 'day')]);
    await save('kort.jpg', rows(0), cols());
    await save('langt.jpg', rows(1), cols());
    await save('lockigt.jpg', rows(4), cols());
    await save('motljus.jpg', [['ljus, blond', 'f1s0'], ['mörk, svart', 'f3s0'], ['ljus, svart', 'f3s4'], ['mörk, grå', 'f1s1']], cols('back'));
    await save('tillbehor.jpg', [['ljus, svart', 'f3s0h'], ['mörk, grå', 'f1s4h'], ['ljus, blond', 'f2s1h']], cols());
    await save('oversikt.jpg', [['ljus, svart', 'f3s0'], ['mörk, grå', 'f1s0'], ['ljus, blond', 'f3s4']], [...ba('profile', 'day'), ...ba('q34', 'day'), ...ba('talk', 'day')]);
    if (!only || only.includes('cost')) { data.info = await page.evaluate(() => window.__info()); data.cost = await page.evaluate(() => window.__cost(20)); }
    if (!only) fs.writeFileSync(path.join(out, 'sideburn.json'), JSON.stringify(data, null, 1) + '\n');
    for (const [k, v] of Object.entries(data.info ?? {})) if (typeof v === 'object') for (const [f, r] of Object.entries(v)) if (r.calls !== 1) errors.push(`${k} ${f}: ${r.calls} draw calls`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
