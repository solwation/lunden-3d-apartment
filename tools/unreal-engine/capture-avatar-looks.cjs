// #2291: the web side of the look picture pairs (tools/unreal-engine/avatar-looks.html), one PNG per code.
//   python3 -m http.server 8291 &   (from the repository root)
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/unreal-engine/capture-avatar-looks.cjs http://localhost:8291 OUT CODE…
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base, out, ...codes] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarlooks-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 600, height: 800 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    for (const entry of codes) {
      const [code, walk] = entry.split(':');
      await page.goto(`${base}/tools/unreal-engine/avatar-looks.html?code=${encodeURIComponent(code)}${walk ? '&walk=1' : ''}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
      await page.evaluate(() => window.__shot());
      const file = path.join(out, `web-${code}${walk ? '-walk' : ''}.png`);
      await page.locator('canvas').screenshot({ path: file });
      console.log('capture-avatar-looks:', file);
    }
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  if (errors.length) { console.error('page errors:', errors); process.exit(1); }
})();
