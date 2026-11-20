// #2232: retake icons/welcome-lunden.webp, the loading/welcome screen background = the real first frame at START
// (src/config.js). Daylight, clear weather, early June noon, no HUD/overlay, no other players.
//   python3 -m http.server 8700 &   then
//   tools/browsertest.sh node tools/welcomebg.cjs http://localhost:8700 icons/welcome-lunden.webp [width height quality]
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8700', out = 'icons/welcome-lunden.webp', w = '1920', h = '1080', q = '0.8'] = process.argv.slice(2);
(async () => {
  const start = fs.readFileSync(__dirname + '/../src/config.js', 'utf8').match(/export const START = \{ x: ([-\d.]+), z: ([-\d.]+), yawDeg: ([-\d.]+), pitchDeg: ([-\d.]+) \}/);
  if (!start) throw new Error('START not found in src/config.js');
  const at = start.slice(1, 5).join(',');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?shot&test&mp=0&at=${at}&time=12&month=6&day=10&weather=clear&freeze`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.renderer && document.querySelector('#loading')?.hidden, null, { timeout: 600000, polling: 200 });
  await page.evaluate(() => __app.testMode.setFull(true));
  await page.waitForTimeout(1500);
  const data = await page.evaluate(q => { __app.testMode.draw(); return __app.renderer.domElement.toDataURL('image/webp', +q); }, q);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(out, fs.statSync(out).size, 'bytes', at);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
