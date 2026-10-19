// #1324: the first-person hand with the avatar's ring on tools/handring.html: every finger of both hands in the open (reach) pose, the metals, and the palm / closed (grip) / hug poses; fails on page errors
// or a ring mesh that is missing.  PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/handringtest.cjs http://localhost:9350 /tmp/shots-1324
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:9350', out = '/tmp/shots-1324'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handring-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 900, height: 600 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/tools/handring.html`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [ring, metal, pose] of [[0, 0, 'reach'], [1, 0, 'reach'], [2, 0, 'reach'], [3, 1, 'reach'], [4, 2, 'reach'], [5, 3, 'reach'], [6, 0, 'reach'], [7, 0, 'reach'], [8, 1, 'reach'], [9, 2, 'reach'], [10, 3, 'reach'], [3, 0, 'palm'], [9, 1, 'palm'], [4, 2, 'grip'], [9, 3, 'grip'], [2, 0, 'hug'], [4, 2, 'hug'], [7, 1, 'hug']]) {
      const r = await page.evaluate(([a, b, c]) => window.__go(a, b, c), [ring, metal, pose]);
      if (ring && !(r.ring === ring)) errors.push(`ring ${ring}: ${JSON.stringify(r)}`);
      await page.locator('canvas').screenshot({ path: path.join(out, `fp-ring${ring}-m${metal}-${pose}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
