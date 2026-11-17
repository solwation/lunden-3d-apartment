// #2035: two players standing still for 60 s as contact sheets (both side by side; player A's variations close up), the numbers per frame
// (idle.json: weight, hip roll, glance, gesture, ankle drift from the red rings) and the update cost with / without the rest.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avataridletest.cjs http://localhost:8235 docs/verification/2035
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8235', out = 'docs/verification/2035'] = process.argv.slice(2);
const sheets = [
  ['idle-60s-pair', [1, 3, 8.7, 11, 16, 18, 29.2, 39, 44, 57], { cols: 5, view: 'pair' }],
  ['idle-variations-a', [0.5, 5, 8.7, 12, 16, 29.2, 42, 56], { cols: 4, view: 'a' }],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avataridle-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 480 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const [name, times, opts] of sheets) {
      await page.goto(base + '/tools/avataridle.html');
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const r = await page.evaluate(([ts, o]) => window.__strip(ts, o), [times, opts]);
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
      data[name] = r.data;
    }
    data.cost = await page.evaluate(() => window.__cost(20, 600));
    fs.writeFileSync(path.join(out, 'idle.json'), JSON.stringify(data, null, 1));
    const rows = data['idle-60s-pair'], kinds = new Set(rows.flatMap((r) => [r.a.kind, r.b.kind]).filter(Boolean));
    const drift = Math.max(...Object.values(data).filter(Array.isArray).flat().flatMap((r) => [r.a.drift, r.b.drift]));
    if (kinds.size < 2) errors.push(`gestures on the sheet: ${[...kinds]}`);
    if (!(drift < 0.003)) errors.push(`ankle drift ${drift} m`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ kinds: [...kinds], drift, cost: data.cost }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
