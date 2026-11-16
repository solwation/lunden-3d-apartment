// #2003: the avatar gait in the real consumers (Ghost = a remote avatar, Ghost with self = our own mirror image) on tools/ghostgait.html:
// forward -> run -> backward -> sideways contact sheet, the footfall sounds against the avatar's footfalls, no page errors.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostgaittest.cjs http://localhost:8723 OUTDIR [NAME]   (NAME: the image's basename, default 'gait-sequence')
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8723', out = '/tmp/shots-2003', name = 'gait-sequence'] = process.argv.slice(2);
const SIDE = [{ left: 1.6, view: 'front' }, { left: 3.2, view: 'front' }, { left: 4.8, view: 'front' }, { left: 3.2, view: 'side' }]; // NAME 'gait-side' (#2006): the side-step at three speeds
const ROWS = name === 'gait-side' ? SIDE : [{ fwd: 1.6, view: 'side' }, { fwd: 3.2, view: 'side' }, { fwd: -1.6, view: 'side' }, { left: 1.6, view: 'front' }, { fwd: 3.2, view: 'side', self: true }];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostgait-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1380, height: 1500 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => { errors.push(m); console.log('FAIL', m); };
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostgait.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const info = await page.evaluate((r) => window.__sheet(r), ROWS);
    await page.locator('canvas').screenshot({ path: path.join(out, name + '.png') });
    info.forEach((r, i) => { const y = r.feet.flatMap((f) => [f.L[1], f.R[1]]); console.log('row', i, JSON.stringify(ROWS[i]), 'ankle y', Math.min(...y).toFixed(3), '…', Math.max(...y).toFixed(3)); if (Math.min(...y) < 0.03) fail(`row ${i}: an ankle below the ground (${Math.min(...y)})`); });
    const steps = [];
    for (const r of (name === 'gait-side' ? [ROWS[1], ROWS[2]] : [ROWS[0], ROWS[1], ROWS[4]])) { const s = await page.evaluate(([a, b]) => window.__steps(a, b), [r, 8]); steps.push(s); console.log('steps', JSON.stringify(r), JSON.stringify(s)); }
    for (const s of steps) if (s.footfalls && Math.abs(s.heard - s.footfalls) > 1) fail(`footfall sounds ${s.heard} vs footfalls ${s.footfalls}`);
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ rows: ROWS, info, steps }, null, 1));
  } finally { await ctx.close(); }
  if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exit(1); }
  console.log('PASS');
})();
