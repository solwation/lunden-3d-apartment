// #2143: before (self shadow off) / after (on) shots of real avatars in a midday sun. tools/browsertest.sh node tools/avatarselfshadowbrowser.cjs http://localhost:8215 docs/verification/2143
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8215', out = process.argv[3] || 'docs/verification/2143';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], report = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 560 } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/tools/avatarselfshadow.html`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    report.rigged = await page.evaluate(() => window.__rigged);
    for (const view of ['body', 'head']) for (const on of [false, true]) report[`${view}-${on ? 'after' : 'before'}`] = await page.evaluate(([on, view]) => window.__draw(on, view), [on, view]); // draw calls / triangles: identical
    const pairs = [['cap', 1, [0.1, 0.12, 1.0], 1.62, 14], ['hat', 2, [0.1, 0.12, 1.0], 1.62, 14], ['arms-up', 3, [0.2, 0.2, 2.4], 1.4, 24], ['arms-fwd', 4, [0.2, 0.2, 2.6], 1.2, 26], ['plain', 0, [0.2, 0.2, 2.0], 1.4, 24]];
    for (const [name, i, off, ly, fov] of pairs) {
      await page.evaluate(([i, off, ly, fov]) => window.__pair(i, off, ly, fov), [i, off, ly, fov]);
      await page.screenshot({ path: `${out}/${name}.png` }); // left: before (off), right: after (on)
    }
    report.cpuUsPerUpdate = await page.evaluate(() => window.__cost());
  } finally { await browser.close(); }
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify({ report, errors }, null, 2) + '\n');
  console.log(JSON.stringify(report), errors.length ? 'FAIL ' + JSON.stringify(errors) : 'PASS');
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
