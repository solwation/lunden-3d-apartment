// #2010: the soft contact shadow under avatars on tools/avatarshadow.html: grass, a light floor by a wall, stairs, a jump; extra draw calls with / without.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarshadowtest.cjs http://localhost:8611 OUTDIR
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8611', out = 'docs/verification/2010'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'avsh-')), { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 540, height: 420 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => { errors.push(m); console.log('FAIL', m); };
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarshadow.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    for (const v of ['grass', 'floor', 'walk', 'stairs', 'jump']) {
      const off = await page.evaluate((n) => window.__view(n, false), v), on = await page.evaluate((n) => window.__view(n, true), v);
      await page.locator('canvas').screenshot({ path: path.join(out, v + '.png') });
      await page.evaluate((n) => window.__view(n, false), v); await page.locator('canvas').screenshot({ path: path.join(out, v + '-before.png') });
      console.log(v, 'without', off.calls, 'calls', off.triangles, 'tris; with', on.calls, 'calls', on.triangles, 'tris; blobs', on.blobs, JSON.stringify(on.alphas));
      if (on.blobs && on.calls - off.calls > 1) fail(`${v}: ${on.calls - off.calls} extra draw calls`);
      if (v === 'jump' && on.blobs && Math.max(...on.alphas) > 0.1) fail('jump: shadow not faded');
      if (v !== 'jump' && on.blobs < 3) fail(`${v}: expected 3 blobs, got ${on.blobs}`);
    }
  } finally { await ctx.close(); }
  if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exit(1); }
  console.log('PASS');
})();
