// #1297: other players show what is in the hand (category proxy) on tools/ghostitem.html; per-category shots + checks.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostitemtest.cjs http://localhost:8791 OUTDIR
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8791', out = '/tmp/shots1297'] = process.argv.slice(2);
const CATS = ['cup', 'plate', 'food', 'bottle', 'book', 'paper', 'tool', 'plant', 'box'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostitem-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1800, height: 460 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostitem.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    const r = await page.evaluate(() => window.__shot());
    console.log(JSON.stringify(r));
    CATS.forEach((k, i) => { if (r.items[i] !== `ghost-item:${k}`) errors.push(`category ${k}: ${r.items[i]}`); });
    if (r.items[9] !== null) errors.push('no category must show no proxy: ' + r.items[9]);
    if (r.items[10] !== null) errors.push('a weapon must win over a category: ' + r.items[10]);
    for (const k of CATS) if (!(r.itemTris[k] > 0 && r.itemTris[k] <= 80)) errors.push(`${k} proxy ${r.itemTris[k]} triangles`);
    const bare = await page.evaluate(() => window.__shot(null, true)); // beyond poseFar: avatars without any proxy
    if (r.calls - bare.calls !== 9) errors.push(`proxies must cost one draw call each: ${r.calls} vs ${bare.calls}`); // 9 proxies (the saber prop is drawn in both)
    console.log('draw calls', r.calls, 'without proxies', bare.calls);
    await page.evaluate(() => window.__shot());
    await page.locator('canvas').screenshot({ path: path.join(out, 'ghostitem-all.png') });
    for (let i = 0; i < CATS.length; i++) { await page.evaluate((i) => window.__shot(i), i); await page.locator('canvas').screenshot({ path: path.join(out, `ghostitem-${CATS[i]}.png`) }); }
    const far = await page.evaluate(() => window.__shot(null, true)); // beyond AVATAR.poseFar: the proxies are hidden
    if (far.items.some(Boolean)) errors.push('far ghosts must not show proxies: ' + far.items);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
