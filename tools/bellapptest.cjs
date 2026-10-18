// #1302: the real app — riding a bicycle, B (and the touch 🔔 button) rings the bell: we hear it (sfx.bell) and a nearby peer
// (a second Ghosts in the page, through a local Worker `node cloudflare/dev.mjs PORT`) gets { t: 'snd', k: 'bell' }; not riding: nothing.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/bellapptest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8836', worker = 'http://localhost:8837'] = process.argv.slice(2);
let failed = 0;
const check = (ok, label, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d ? ' — ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Ringare'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
  try {
    await page.goto(`${game}/?lowmem&phone&quality=0&at=-56.4,3.1,90&time=12&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__ghosts && __app.loadingEl.hidden, null, { timeout: 600000, polling: 500 });
    await page.evaluate(() => { __app.showOverlay(false); if (__app.rest.active) __app.standUp(); const c = document.getElementById('game-canvas'); Object.defineProperty(document, 'pointerLockElement', { get: () => c, configurable: true }); document.dispatchEvent(new Event('pointerlockchange')); }); // (pretend the pointer is locked: the key handler needs it)
    await page.evaluate(async (worker) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
      const cam = new T.PerspectiveCamera(); const a = __app;
      const P = new Ghosts({ scene: new T.Scene(), camera: cam, url: worker, name: () => 'Lyssnare', state: () => ({ p: [a.player.pos.x + 3, a.player.pos.y, a.player.pos.z], r: 0 }), score: () => 0 });
      window.listener = { P, got: [] }; P.onPlayerSound = (m) => window.listener.got.push(m.k);
      window.listenerTimer = setInterval(() => P.update(), 100);
      window.bells = 0; const bell = a.sfx?.bell; // (sfx is module-private: count through the ghosts' outbox instead)
    }, worker);
    const waitFor = async (f, n = 100) => { for (let i = 0; i < n; i++) { if (await page.evaluate(f)) return true; await page.waitForTimeout(200); } return false; };
    check(await waitFor(() => __ghosts.connected && listener.P.others.size >= 1), 'app and listener connected and see each other');
    await page.keyboard.press('b');
    await page.waitForTimeout(1500);
    check(await page.evaluate(() => listener.got.length === 0), 'B while not riding: no bell is sent');
    const mounted = await page.evaluate(() => { const bike = __app.world.bicycles[0]; __app.player.pos.set(bike.position.x + 0.6, __app.player.pos.y, bike.position.z); return __app.player.mountBicycle(bike); });
    check(mounted, 'mounted a real bicycle');
    await page.waitForTimeout(800);
    await page.keyboard.press('b');
    check(await waitFor(() => listener.got.length === 1), 'B while riding: the nearby listener gets one bell', await page.evaluate(() => JSON.stringify(listener.got)));
    await page.keyboard.press('b'); await page.waitForTimeout(100);
    check(await page.evaluate(() => listener.got.length === 1), 'a second press within SOUNDS.every is ignored');
    await page.evaluate(() => { __app.touch.enabled = true; document.body.classList.add('touch'); __app.step(0); window.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(700);
    const vis = await page.evaluate(() => { const e = document.getElementById('bell-btn'), r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hidden: e.hidden, w: r.width, h: r.height, x: r.x, y: r.y, top: top?.id || top?.tagName, label: e.getAttribute('aria-label') }; });
    check(!vis.hidden && vis.w >= 44 && vis.h >= 44 && vis.top === 'bell-btn' && vis.x + vis.w <= 844 && vis.y + vis.h <= 390, 'the bell button shows while riding on touch', JSON.stringify(vis));
    await page.locator('#bell-btn').tap();
    check(await waitFor(() => listener.got.length === 2), 'the touch button rings it too');
    await page.evaluate(() => { __app.player.dismountBicycle(); __app.step(0); });
    check(await page.evaluate(() => document.getElementById('bell-btn').hidden), 'the button is hidden after dismounting');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await b.close(); }
  process.exit(failed ? 1 : 0);
})();
