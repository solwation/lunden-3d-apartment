// Browser integration for #567. Run against tools/devserve.py; no project npm install needed.
// PLAYWRIGHT_MODULE=/path/to/playwright node tools/viewporttest.cjs http://localhost:8156
// Optional CHROME_PATH chooses an existing Chromium. Screenshots/logs go outside the checkout.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8137';
const output = process.env.VIEWPORT_OUTPUT || '/tmp/lunden-viewport';
const lines = [];
function check(ok, message) {
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  console.log(lines.at(-1));
  if (!ok) throw new Error(message);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    // Emulates iOS reporting pre-rotation innerWidth/innerHeight for a while (window.__stale = [w, h]).
    await page.addInitScript(() => {
      for (const [name, i] of [['innerWidth', 0], ['innerHeight', 1]]) {
        // innerWidth is a data property in Chromium; the layout size is the same without scrollbars.
        Object.defineProperty(window, name, { configurable: true, get() {
          const de = document.documentElement;
          return window.__stale ? window.__stale[i] : (i ? de.clientHeight : de.clientWidth);
        } });
      }
    });
    let releasePlan;
    const gate = new Promise(resolve => { releasePlan = resolve; });
    await page.route('**/data/plan.json', async route => { await gate; await route.continue(); });
    await page.goto(`${base}/?life&cloud=`, { waitUntil: 'commit' });
    await page.waitForSelector('#game-canvas', { timeout: 60000 });
    async function matchesSurface(loaded = false) {
      try { await page.waitForFunction(loaded => {
        const c = document.getElementById('game-canvas'), a = window.__app;
        if (!c || (loaded && !a)) return false;
        const ratio = a ? a.renderer.getPixelRatio() : Math.min(devicePixelRatio, 1.5);
        return c.width === Math.floor(c.clientWidth * ratio) && c.height === Math.floor(c.clientHeight * ratio)
          && (!loaded || Math.abs(a.camera.aspect - c.clientWidth / c.clientHeight) < 1e-10);
      }, loaded, { timeout: 20000 }); } catch (error) {
        console.log('page errors', errors); console.log('Viewport diagnostic', await page.evaluate(() => {
          const c=document.getElementById('game-canvas'),a=window.__app;
          return {window:[innerWidth,innerHeight],css:[c.clientWidth,c.clientHeight],buffer:[c.width,c.height],ratio:a?.renderer.getPixelRatio(),aspect:a?.camera.aspect,errors:window.viewportResizeCalls};
        }));
        await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(500);
        console.log('after manual resize', await page.evaluate(() => { const c = document.getElementById('game-canvas'); return { css: [c.clientWidth, c.clientHeight], buf: [c.width, c.height], gv: window.__gv }; }));
        throw error;
      }
    }
    await matchesSurface();
    check(await page.evaluate(() => !window.__app), 'canvas is synchronized while scene loading is blocked');
    await page.setViewportSize({ width: 844, height: 390 });
    await matchesSurface();
    check(await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return c.clientWidth === 844 && c.clientHeight === 390 && !window.__app;
    }), 'first portrait-to-landscape rotation fills the surface during startup');
    // Stale window metrics (iOS) while the plan is still loading: rotate back and forth with innerWidth/innerHeight lying.
    await page.evaluate(() => { window.__stale = [390, 844]; });
    await page.setViewportSize({ width: 844, height: 360 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await matchesSurface();
    check(await page.evaluate(() => { const c = document.getElementById('game-canvas'); return innerWidth === 390 && c.clientWidth === 844 && c.clientHeight === 360 && !window.__app; }), 'stale innerWidth/innerHeight during startup do not affect the surface');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => { window.__stale = null; });
    await matchesSurface();
    // Fire the early event, then change layout later without a second window event.
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const c = document.getElementById('game-canvas'); c.style.width = '812px'; c.style.height = '360px';
    });
    await matchesSurface();
    check(await page.evaluate(() => document.getElementById('game-canvas').width === 1218), 'late CSS layout without another window resize updates the drawing buffer');
    await page.evaluate(() => document.getElementById('game-canvas').removeAttribute('style'));
    await matchesSurface();
    releasePlan();
    await page.waitForFunction(() => !!window.__app, null, { timeout: 180000 });
    await page.evaluate(() => { __app.renderer.setAnimationLoop(null); document.documentElement.requestFullscreen = undefined; });
    await matchesSurface(true);
    check(true, 'camera projection matches the rotated surface after loading');
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 740 }, { width: 740, height: 360 }]) {
      await page.setViewportSize(size);
      await matchesSurface(true);
      check(await page.evaluate(({ width, height }) => {
        const c = document.getElementById('game-canvas'), r = c.getBoundingClientRect(), gl = __app.renderer.getContext();
        return r.left === 0 && r.top === 0 && r.width === width && r.height === height
          && gl.drawingBufferWidth === c.width && gl.drawingBufferHeight === c.height;
      }, size), `repeated rotation ${size.width}×${size.height}: CSS surface, buffer and camera agree`);
    }
    const adaptiveRatio = await page.evaluate(() => {
      for (let i = 0; i < 100; i++) __app.adaptResolution(.05);
      return __app.renderer.getPixelRatio();
    });
    await page.setViewportSize({ width: 844, height: 360 });
    await matchesSurface(true);
    check(await page.evaluate(ratio => __app.renderer.getPixelRatio() === ratio && ratio < 1.5, adaptiveRatio), 'resizing retains the lower adaptive rendering resolution');
    await page.evaluate(() => { document.getElementById('game-canvas').style.display = 'none'; });
    await page.waitForTimeout(100);
    check(await page.evaluate(() => Number.isFinite(__app.camera.aspect) && __app.renderer.domElement.width > 0), 'temporary zero-size layout retains a valid buffer and camera');
    await page.evaluate(() => { document.getElementById('game-canvas').style.display = ''; });
    await matchesSurface(true);
    await page.evaluate(() => {
      const renderer = __app.renderer, original = renderer.setSize;
      window.viewportResizeCalls = 0;
      renderer.setSize = function (...args) { window.viewportResizeCalls++; return original.apply(this, args); };
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('fullscreenchange'));
      window.visualViewport?.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    check(await page.evaluate(() => viewportResizeCalls === 0), 'unchanged viewport events do not reallocate the drawing buffer');
    await page.locator('#start-go').tap();
    await page.locator('#terminal-btn').tap();
    await page.locator('#terminal-code').fill('help');
    await page.locator('#terminal-form button[type=submit]').tap();
    check((await page.locator('#terminal-message').innerText()).includes('jetpack'), 'touch console hit target and submit work after rotation');
    await page.locator('#terminal-close').tap();
    await page.locator('#pause').tap();
    check(await page.locator('#overlay').isVisible(), 'touch pause menu opens at its displayed location after rotation');
    await page.locator('#start-go').tap();
    check(await page.locator('#overlay').isHidden(), 'touch resume remains usable after rotation');
    // Stale innerWidth/innerHeight after rotation (iOS): the joystick zone and the screen-space HUD follow the canvas, not the window.
    await page.setViewportSize({ width: 844, height: 390 });
    await matchesSurface(true);
    await page.evaluate(() => { window.__stale = [390, 844]; window.dispatchEvent(new Event('orientationchange')); });
    await page.waitForTimeout(300);
    check(await page.evaluate(() => {
      const fire = x => document.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true, cancelable: true }));
      fire(300); // 0.36 of 844 (left zone) but 0.77 of the stale 390
      const left = !document.getElementById('stick').hidden;
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 300, clientY: 200, bubbles: true }));
      return left;
    }), 'joystick zone uses the real surface width while window.innerWidth is stale');
    await page.evaluate(() => { window.__stale = null; });
    check(await page.evaluate(() => ['pause', 'terminal-btn', 'crouch-btn'].every(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    })), 'touch controls stay inside the rotated viewport');
    // A genuine WebGL draw for visual inspection; earlier tests check dimensions, not just CSS.
    await page.evaluate(() => { __app.step(0); __app.renderer.render(__app.scene, __app.camera); });
    await page.screenshot({ path: `${output}.png` });
    check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
    console.log('ALL PASS');
    lines.push('ALL PASS');
  } finally {
    fs.writeFileSync(`${output}.log`, lines.join('\n') + '\n');
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
