// #1286: other players wear the jetpack (flames while thrusting) on tools/ghostattach.html; shots + draw-call check.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostattachtest.cjs http://localhost:8782 OUTDIR
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8782', out = '/tmp/shots-1286'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostattach-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1500, height: 520 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostattach.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const v of ['front', 'back', 'side']) {
      const r = await page.evaluate((v) => window.__shot(v), v);
      console.log(v, JSON.stringify(r));
      if (v === 'front') {
        if (r.packs.join() !== ',ghost-jetpack,ghost-jetpack,ghost-jetpack') errors.push('packs ' + r.packs);
        if (r.calls !== 11) errors.push(`draw calls ${r.calls}`); // 4 avatars, 3 packs, 1 flame, the saber and its blade, +1 (the room)
      }
      await page.locator('canvas').screenshot({ path: path.join(out, `ghostattach-${v}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
