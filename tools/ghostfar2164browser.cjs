// #2164: the far figure (src/ghostfar.js) in a browser: eight looks at 34 - 80 m through a telephoto lens (day, night, walking at night) and the real figure next
// to the far one at night for brightness. Uses tools/ghostfar2164.html (real GhostFar / Avatar / AvatarLight, stand-in lights and ground).
//   python3 -m http.server 8239      PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghostfar2164browser.cjs http://localhost:8239 OUT_DIR
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8239', out = '/tmp/ghostfar2164'] = process.argv.slice(2);
const save = (n, d) => fs.writeFileSync(n, Buffer.from(d.split(',')[1], 'base64'));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/tools/ghostfar2164.html'); await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const res = {};
  for (const [name, args] of [['lineup-day', { view: 'lineup', m: 'day' }], ['lineup-night', { view: 'lineup', m: 'night', lamp: 0.5 }], ['walk-night', { view: 'lineup', m: 'night', walk: true, lamp: 0.5 }],
    ['compare-night', { view: 'compare', m: 'night', lamp: 0.5 }], ['compare-night-nolamp', { view: 'compare', m: 'night' }], ['compare-day', { view: 'compare', m: 'day' }]]) {
    res[name] = await page.evaluate((a) => window.__show(a), args); save(`${out}/${name}.png`, await page.evaluate(() => window.__png()));
  }
  res.errors = errors; fs.writeFileSync(`${out}/measurements.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  await browser.close();
})();
