// #2013: one browser run, shoulder/armpit poses before (baseline revision, --before) or after. Usage:
//   tools/browsertest.sh node tools/avatarshoulderbrowser.cjs http://localhost:8613 docs/verification/2013 [--before]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
  const base = process.argv[2], out = process.argv[3], before = process.argv.includes('--before');
  fs.mkdirSync(out + (before ? '/before' : ''), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 2100, height: 1700 } }), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); }); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}/tools/verify-avatar-shoulders.html`); await page.waitForFunction(() => window.__ready, null, { timeout: 40000 });
  const views = [['front', { az: .2, dist: 2.6, W: 340, H: 330 }], ['quarter', { az: .95, dist: 2.6, W: 340, H: 330 }],
    ['armpit-up', { names: ['up'], az: .35, dist: 1.0, ty: 1.3, W: 520, H: 420, lift: -.1 }], ['armpit-cross', { names: ['cross'], az: .35, dist: 1.0, ty: 1.3, W: 520, H: 420, lift: -.1 }]];
  for (const [name, v] of views) {
    await page.evaluate(v => window.shoulderView(v), v);
    await page.locator('canvas').screenshot({ path: `${out}/${before ? 'before/' : ''}shoulders-${name}.png` });
  }
  console.log(JSON.stringify({ errors })); await browser.close(); process.exit(errors.length ? 1 : 0);
})();
