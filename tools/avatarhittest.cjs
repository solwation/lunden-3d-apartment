// #2036: the hit flinch in the real consumers (Ghost = another player, Ghost with self = our own mirror image) on tools/avatarhit.html:
// a contact sheet of head / body hits from the front, the side and behind (frames 0 … 1100 ms after the hit), the head's crown offsets, no page errors.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhittest.cjs http://localhost:8236 docs/verification/2036
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8236', out = 'docs/verification/2036'] = process.argv.slice(2);
const SHEETS = {
  'hit-head': [{ from: 'front', head: true, view: 'side' }, { from: 'side', head: true, view: 'front' }, { from: 'back', head: true, view: 'side' }, { from: 'front', head: true, view: 'side', self: true }],
  'hit-body': [{ from: 'front', head: false, view: 'side' }, { from: 'side', head: false, view: 'front' }, { from: 'back', head: false, view: 'side' }, { from: 'side', head: false, view: 'front', self: true }],
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarhit-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1400, height: 1100 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => { errors.push(m); console.log('FAIL', m); }, data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarhit.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    for (const [name, rows] of Object.entries(SHEETS)) {
      const info = data[name] = await page.evaluate((r) => window.__sheet(r), rows);
      await page.locator('canvas').screenshot({ path: path.join(out, name + '.png') });
      for (const r of info.rows) {
        const mag = r.crown.map((c) => Math.hypot(...c)), peak = Math.max(...mag);
        console.log(name, r.self ? 'self' : 'ghost', r.from, 'crown peak', peak.toFixed(3), 'm, end', mag.at(-1).toFixed(4), 'm');
        if (peak < 0.04) fail(`${name} ${r.from}${r.self ? ' self' : ''}: too small (${peak})`);
        if (mag.at(-1) > 0.002 || r.active) fail(`${name} ${r.from}${r.self ? ' self' : ''}: not back at rest (${mag.at(-1)})`);
      }
      const peakOf = (r) => r.crown.reduce((a, c) => (Math.hypot(...c) > Math.hypot(...a) ? c : a));
      const [f, s, b] = info.rows.map(peakOf), d = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));
      if (d(f, s) < 0.04 || d(f, b) < 0.04 || d(s, b) < 0.04) fail(`${name}: front / side / back not distinct ${JSON.stringify([f, s, b])}`);
    }
    fs.writeFileSync(path.join(out, 'hit.json'), JSON.stringify(data, null, 1));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exit(1); }
  console.log('PASS');
})();
