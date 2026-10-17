// #1126: other players hold their chosen weapon's own model (not a box): screenshots of tools/ghostprops.html (front,
// side and a close-up per weapon) and a draw-call check (one call per prop, the saber's blade one more).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostpropstest.cjs http://localhost:8727 /tmp/shots-1126
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8727', out = '/tmp/shots-1126'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostprops-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1500, height: 520 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => errors.push(m);
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostprops.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const empty = await page.evaluate(() => { const g = window.__shot('front'); return g; });
    console.log(JSON.stringify(empty));
    if (empty.props.join() !== 'ghost-prop:rifle,ghost-prop:nerf,ghost-prop:saber,ghost-prop:wand,ghost-prop:bow,ghost-prop:ball') fail('props ' + empty.props);
    if (empty.calls !== 6 + 6 + 1) fail(`draw calls ${empty.calls}, expected 13 (6 avatars, 6 props, the saber's blade)`);
    if (Math.max(...empty.propTris) > 4000) fail('a prop over 4 000 triangles: ' + empty.propTris);
    for (const v of ['front', 'side']) { await page.evaluate((v) => window.__shot(v), v); await page.locator('canvas').screenshot({ path: path.join(out, `ghostprops-${v}.png`) }); }
    for (let i = 0; i < 6; i++) { await page.evaluate((i) => window.__shot('side', i), i); await page.locator('canvas').screenshot({ path: path.join(out, `ghostprops-close${i}.png`) }); }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
