// #2013: one browser run, shoulder/armpit poses before (baseline revision, --before) or after. Usage:
//   tools/browsertest.sh node tools/avatarshoulderbrowser.cjs http://localhost:8613 docs/verification/2013 [--before]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
  const base = process.argv[2], out = process.argv[3], before = process.argv.includes('--before');
  fs.mkdirSync(out + (before ? '/before' : ''), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1320 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}/tools/verify-avatar-shoulders.html`); await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  for (const [name, az] of [['front', Math.PI + .2], ['quarter', Math.PI + .95]]) {
    await page.evaluate(a => window.shoulderView(a), az);
    await page.locator('canvas').screenshot({ path: `${out}/${before ? 'before/' : ''}shoulders-${name}.png` });
  }
  console.log(JSON.stringify({ errors })); await browser.close(); process.exit(errors.length ? 1 : 0);
})();
