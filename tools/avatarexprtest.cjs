// #2031: facial expressions on tools/avatarexpr.html – the sheet (3 looks × front / three-quarter × neutral, smile, surprise, grimace),
// the bearded look in a mirror, a filmstrip of the eased smile and expr.json (weight trace, draw calls, render cost).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarexprtest.cjs http://localhost:8231 docs/verification/2031
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8231', out = 'docs/verification/2031'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarexpr-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 2100, height: 1100 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /shader|THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
    await page.goto(base + '/tools/avatarexpr.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    data.sheet = await page.evaluate(() => window.__sheet());
    await page.locator('canvas').screenshot({ path: path.join(out, 'expressions-sheet.png') });
    data.mirror = await page.evaluate(() => window.__mirror());
    await page.locator('canvas').screenshot({ path: path.join(out, 'expressions-mirror.png') });
    data.strip = await page.evaluate(() => window.__strip());
    await page.locator('canvas').screenshot({ path: path.join(out, 'smile-transition.png') });
    data.trace = await page.evaluate(() => window.__trace());
    data.cost = await page.evaluate(() => window.__cost());
    fs.writeFileSync(path.join(out, 'expr.json'), JSON.stringify(data, null, 1));
    if (data.sheet.calls !== 1) errors.push(`sheet: ${data.sheet.calls} draw calls for one avatar`);
    if (data.cost.calls !== data.cost.avatars) errors.push(`cost: ${data.cost.calls} draw calls for ${data.cost.avatars} avatars`);
    const t = data.trace;
    if (t.maxStep.some((v) => v > 0.13)) errors.push(`a weight jumped ${t.maxStep}`);
    if (t.end.some((v) => v !== 0)) errors.push(`not back to neutral: ${t.end}`);
    const peak = (k) => Math.max(...t.samples.map((r) => r[k + 1]));
    if (peak(0) < 0.8 || peak(1) < 0.8 || peak(2) < 0.8) errors.push(`peaks ${[0, 1, 2].map(peak)}`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ calls: data.sheet.calls, maxStep: t.maxStep, end: t.end, cost: data.cost }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
