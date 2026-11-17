// #2032: living skin on the avatars, before (detail off) and after (on) for a light, a medium and a dark skin tone: close-ups in day light
// and in backlight (sheets), the frame-to-frame shimmer at 2 / 4 / 8 m while the camera creeps sideways, and the cost (close-up and crowd).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarskintest.cjs http://localhost:8232 docs/verification/2032
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8232', out = 'docs/verification/2032'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarskin-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 400, height: 400 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 2000)); });
    await page.goto(base + '/tools/avatarskin.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const save = async (name, kind, views) => {
      const url = await page.evaluate(([k, v]) => window.__sheet(k, v), [kind, views]);
      fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    await save('dagsljus.jpg', 'day', ['face', 'cheek', 'hand']);
    await save('motljus.jpg', 'back', ['face', 'ear']);
    data.shimmer = {};
    for (const d of [2, 4, 8]) data.shimmer[d] = await page.evaluate((x) => window.__shimmer(x), d);
    data.cost = await page.evaluate(() => window.__cost(30));
    fs.writeFileSync(path.join(out, 'skin.json'), JSON.stringify(data, null, 1));
    for (const d of [2, 4, 8]) if (!(data.shimmer[d].ratio <= 1.1)) errors.push(`shimmer at ${d} m: ratio ${data.shimmer[d].ratio}`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
