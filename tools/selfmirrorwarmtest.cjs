// Mirror-avatar warm-up (#1558), headless SwiftShader (functional only, no timing evidence):
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/selfmirrorwarmtest.cjs http://localhost:8358 desktop|phone
// Our own mirror image (ghosts.js self Ghost, hidden outside the reflector pass) must be drawn by the desktop warm-up's
// full screen and mirror passes (`userData.warmDraw`), so its first mirror frame uploads nothing; phones (&lowmem +
// iPhone UA, sliced warm-up) must NOT draw it (stays lazy, #628) and the warm-up must still reach `done`. ~4 min desktop.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const [base, mode] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = mode === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' } : { viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => {
    let app;
    Object.defineProperty(window, '__app', { configurable: true, get: () => app, set(v) {
      app = v; const rep = window.__selfwarm = { draws: 0, statesDrawn: [], found: false };
      const root = v.scene.getObjectByName('ghosts')?.children.find((g) => g.isGroup && g.getObjectByProperty('isSkinnedMesh', true)?.name?.startsWith('ghost:'));
      if (!root) return; rep.found = true; rep.warmDraw = !!root.userData.warmDraw;
      const mesh = root.getObjectByProperty('isSkinnedMesh', true), r = v.renderer.renderBufferDirect;
      v.renderer.renderBufferDirect = function (c, s, g, m, o) { if (o === mesh) { rep.draws++; rep.statesDrawn.push(v.warm.detail); } return r.apply(this, arguments); };
    } });
  });
  const t0 = Date.now();
  await page.goto(`${base}/index.html?cloud=&life&warm&time=12&month=7&day=1&freeze&weather=clear&mess=0&at=2.8,9,180,0${phone ? '&lowmem' : '&quality=3'}`);
  await page.waitForFunction(() => window.__app?.warm?.done, null, { timeout: 900000, polling: 1000 });
  const out = await page.evaluate(() => ({ state: window.__app.warm.state, sliced: window.__app.warm.sliced, lazyHidden: window.__app.warm.lazyHidden, programs: window.__app.renderer.info.programs.length, ...window.__selfwarm }));
  const states = [...new Set(out.statesDrawn)];
  console.log(JSON.stringify({ mode, secs: Math.round((Date.now() - t0) / 1000), ...out, statesDrawn: states }));
  const ok = out.found && out.state === 'done' && (phone ? out.sliced && out.draws === 0 : !out.sliced && states.includes('draw') && states.includes('mirror-draw'));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mode}: ${phone ? 'sliced warm-up done, mirror avatar left lazy' : 'warm-up drew the mirror avatar on screen and into the mirror target'}`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('ERROR', e.message); process.exit(1); });
