// #2139: the real Ghost before / after on a jittery 5 Hz series (component page tools/ghostjitter.html). The previous source is
// served from git at BEFORE under /before/. Writes before/jitter-before.png, jitter-after.png, jitter-compare.png and jitter.json.
//   python3 -m http.server 8211 &   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghostjitterbrowser.cjs http://localhost:8211 OUT [BEFORE]
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8211', out = 'docs/verification/2139', rev = 'c0be4dfd'] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript' };
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => { errors.push(m); console.log('FAIL', m); };
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', (r) => errors.push(`request failed ${r.url()}`));
    await page.route('**/before/**', (route) => {
      const rel = new URL(route.request().url()).pathname.slice('/before/'.length);
      let body; try { body = cp.execFileSync('git', ['show', `${rev}:${rel}`], { maxBuffer: 64 << 20 }); } catch { return route.abort(); }
      return route.fulfill({ contentType: types[path.extname(rel)] ?? 'application/octet-stream', body });
    });
    await page.goto(base + '/tools/ghostjitter.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch((e) => { throw Error(`${e.message}\n${errors.join('\n')}`); });
    const opts = { jitter: 140, drop: 0.05, seed: 3 };
    const runs = await page.evaluate((o) => ['before', 'after'].map((which) => window.__run({ ...o, which })), opts);
    const shot = async (list, title, file) => {
      await page.evaluate(([l, t]) => window.__plot(l, t), [list, title]);
      await page.locator('#plot').screenshot({ path: path.join(out, file) });
    };
    const title = `#2139 · annan spelare på ryckigt nät (5 Hz, 70 ms + upp till ${opts.jitter} ms jitter, ${opts.drop * 100} % tappade lägen)`;
    await shot([runs[0]], title, 'before/jitter-before.png');
    await shot([runs[1]], title, 'jitter-after.png');
    await shot(runs, title, 'jitter-compare.png');
    const summary = runs.map(({ which, frozen, slow, maxStep, stops }) => ({ which, frozen, slow, maxStep: +maxStep.toFixed(4), stops }));
    console.log(JSON.stringify(summary));
    const [b, a] = runs;
    if (a.frozen > Math.max(2, b.frozen / 10)) fail(`after: ${a.frozen} frozen frames while walking (before ${b.frozen})`); // (a lost state on top of the worst jitter may still hold a frame or two)
    if (b.frozen < 10) fail(`before froze in only ${b.frozen} frames: the series does not show the problem`);
    if (a.slow > b.slow / 5) fail(`after: ${a.slow} frames below 0.5 m/s (before ${b.slow})`);
    fs.writeFileSync(path.join(out, 'jitter.json'), JSON.stringify({ opts, revision: rev, summary }, null, 1));
  } finally { await browser.close(); }
  if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exit(1); }
  console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
