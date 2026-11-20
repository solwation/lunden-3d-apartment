// #2173: close-ups of the clear lenses, frames, earrings, chain and the ring / bracelet / watch indoors and outdoors (tools/avatarglasses2173.html).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarglasses2173test.cjs http://localhost:8248 docs/verification/2173 [prefix]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8248', out = 'docs/verification/2173', prefix = 'after'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarglasses-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 840, height: 840 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`${base}/tools/avatarglasses2173.html`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    for (const env of ['indoor', 'outdoor']) {
      const r = await page.evaluate((e) => window.__sheet(e), env);
      await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-${env}.png`) });
      console.log(env, JSON.stringify(r), fs.statSync(path.join(out, `${prefix}-${env}.png`)).size, 'bytes');
    }
    console.log(JSON.stringify(await page.evaluate(() => window.__info())));
  } finally { await ctx.close(); }
  if (errors.length) { console.log('FAIL', errors.slice(0, 5)); process.exitCode = 1; } else console.log('PASS');
})();
