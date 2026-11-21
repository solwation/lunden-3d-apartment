// #2291: the web side of the look picture pairs (tools/unreal-engine/avatar-looks.html), one PNG per code.
//   python3 -m http.server 8291 &   (from the repository root)
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/unreal-engine/capture-avatar-looks.cjs http://localhost:8291 OUT CODE…
// CODE:walk shows the figure walking; mirror:CODE the game itself in the hall, 0.8 m in front of the mirror
// (avatar-looks.json mirror.view.webAt) with the look saved as the player's (localStorage lunden.avatar), 1280 × 720.
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
    const view = JSON.parse(fs.readFileSync(path.join(__dirname, 'avatar-looks.json'), 'utf8')).mirror.view;
    for (const entry of codes) {
      if (entry.startsWith('mirror:')) {
        const code = entry.slice(7), game = await ctx.newPage();
        await game.setViewportSize({ width: 1280, height: 720 });
        await game.addInitScript((c) => { localStorage.setItem('lunden.avatar', c); localStorage.setItem('lunden.name', 'Spegeltest'); }, code);
        game.on('pageerror', (e) => errors.push(e.message));
        await game.goto(`${base}/?shot&freeze&time=12&month=6&weather=clear&mp=0&cloud=&at=${view.webAt},0`, { waitUntil: 'domcontentloaded' });
        await game.waitForFunction(() => window.__app?.camera, null, { timeout: 420000 });
        const skip = game.getByRole('button', { name: 'Hoppa över' });
        if (await skip.isVisible().catch(() => false)) await skip.click();
        await game.waitForFunction(() => (window.__app?.renderer?.info.render.triangles ?? 0) > 50000, null, { timeout: 420000 });
        await game.waitForTimeout(15000); // the reflector and the figure settle
        const file = path.join(out, 'web-mirror.png');
        await game.screenshot({ path: file });
        console.log('capture-avatar-looks:', file);
        await game.close();
        continue;
      }
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
