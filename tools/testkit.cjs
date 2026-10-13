// Shared helper for the Playwright tests (#703): a tiny viewport, DPR 1 and the game's `&test` mode by default
// (src/testmode.js: lowest quality, no shadows / antialiasing / warm-up; game logic unchanged), and `shot()` for the rare
// moment a real picture is needed. Under SwiftShader a frame costs by pixels, so this is the biggest single speed-up.
//   const kit = require('./testkit.cjs');
//   const browser = await kit.launch();
//   const { ctx, page } = await kit.open(browser, `${game}/?cloud=${worker}&at=1,11.8,-40,0`, { init: (n) => …, arg: name });
//   await kit.shot(page, '/tmp/x.png');          // full size + shadows + quality 3, then back to the small test look
// Needs PLAYWRIGHT_MODULE (path to playwright) and optionally CHROME_PATH, like the other .cjs tests.
// Do NOT use it for tests that measure drawing (perfcount, turntest, phonememtest, glrestoretest, pixel comparisons):
// pass `{ test: false }` or open the page yourself.
const { waitForState } = require('./semanticwait.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const SMALL = { width: 480, height: 300 }, FULL = { width: 1280, height: 800 };

async function launch(extraArgs = []) {
  return chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...extraArgs] });
}

/** `url` gets `&test` (or `&test=lazy` with `lazy: true`) unless `test: false`. Returns { ctx, page }; waits for `__app.renderer` unless `wait: false`. */
async function open(browser, url, { viewport = SMALL, test = true, lazy = false, init, arg, wait = true, timeout = 1500000, contextOptions = {} } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...contextOptions });
  if (init) await ctx.addInitScript(init, arg);
  const page = await ctx.newPage();
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(test && !/[?&]test\b/.test(url) ? `${url}${sep}test${lazy ? '=lazy' : ''}` : url, { waitUntil: 'commit' });
  if (wait) await waitForState(page, () => window.__app?.renderer, null, { timeout });
  return { ctx, page };
}

/** A full-size screenshot of what the page shows now: raises the viewport, quality and shadows, waits `frames` rendered frames, restores. */
async function shot(page, path, { viewport = FULL, frames = 3, restore, timeout = 300000 } = {}) {
  const was = restore || page.viewportSize() || SMALL;
  await page.setViewportSize(viewport);
  const on = await page.evaluate(() => { const t = window.__app?.testMode; if (t) t.setFull(true); return !!t; });
  await page.evaluate(async (n) => { // let the game apply the resize, then render n frames (a lazy page is drawn by hand)
    const t = window.__app?.testMode;
    for (let i = 0; i < n; i++) { await new Promise((r) => requestAnimationFrame(() => r())); t?.draw(); }
  }, frames);
  await page.screenshot({ path, timeout });
  if (on) await page.evaluate(() => window.__app.testMode.setFull(false));
  await page.setViewportSize(was);
  return path;
}

module.exports = { chromium, launch, open, shot, SMALL, FULL };
