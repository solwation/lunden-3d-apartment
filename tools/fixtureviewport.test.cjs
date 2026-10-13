// #862: real browser fullscreen/window transition with native DOM only, no apartment or WebGL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { setFixtureViewport } = require('./fixtureviewport.cjs');

test('native fullscreen exits before authored phone/screenshot dimensions; product entry remains real', { timeout: 60000 }, async () => {
  const out = process.env.FIXTURE_VIEWPORT_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-viewport-'));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
    await page.setContent(`<button id="start-touch">Start touch</button><input id="terminal-code" value="native text">
      <script>window.originalRequestFullscreen=document.documentElement.requestFullscreen;window.events=[];
      document.addEventListener('fullscreenchange',()=>events.push(document.fullscreenElement?'entered':'exited'));
      document.getElementById('start-touch').onclick=()=>{document.body.classList.add('touch');document.documentElement.requestFullscreen()};</script>`);
    const cdp = await page.context().newCDPSession(page);
    const state = async () => ({ dom: await page.evaluate(() => ({ fullscreen: !!document.fullscreenElement,
      width: innerWidth, height: innerHeight, touch: document.body.classList.contains('touch'),
      requestUnchanged: document.documentElement.requestFullscreen === originalRequestFullscreen, events: events.slice(),
      text: document.getElementById('terminal-code').value })), window: await cdp.send('Browser.getWindowForTarget') });
    await page.evaluate(() => document.getElementById('start-touch').click());
    await page.waitForFunction(() => !!document.fullscreenElement);
    const entered = await state();
    assert.equal(entered.dom.fullscreen, true);assert.equal(entered.window.bounds.windowState, 'fullscreen');
    const phone = await setFixtureViewport(page, { width: 667, height: 375 });
    await page.waitForFunction(() => events.length === 2);
    const after = await state();
    assert.equal(phone.leftFullscreen, true);
    assert.deepEqual(phone.viewport, { width: 667, height: 375 });
    assert.equal(after.window.bounds.windowState, 'normal');assert.equal(after.dom.fullscreen, false);
    assert.equal(after.dom.touch, true);assert.equal(after.dom.requestUnchanged, true);
    assert.deepEqual(after.dom.events, ['entered', 'exited']);assert.equal(after.dom.text, 'native text');
    await page.screenshot({ path: path.join(out, 'phone.png') });
    const restored = await setFixtureViewport(page, { width: 480, height: 300 });
    assert.equal(restored.leftFullscreen, false);assert.deepEqual(restored.viewport, { width: 480, height: 300 });
    const desktop = await setFixtureViewport(page, { width: 960, height: 600 });
    assert.equal(desktop.leftFullscreen, false);assert.deepEqual(desktop.viewport, { width: 960, height: 600 });
    await page.screenshot({ path: path.join(out, 'desktop.png') });
    // A later genuine touch entry still works after the helper, including repeated episodes.
    await page.evaluate(() => document.getElementById('start-touch').click());await page.waitForFunction(() => !!document.fullscreenElement);
    const second = await setFixtureViewport(page, { width: 667, height: 375 });assert.equal(second.leftFullscreen, true);
    await page.waitForFunction(() => events.length === 4);
    const final = await state();assert.deepEqual(final.dom.events, ['entered', 'exited', 'entered', 'exited']);
    assert.equal(final.dom.requestUnchanged, true);assert.equal(final.window.bounds.windowState, 'normal');
    fs.writeFileSync(path.join(out, 'native.json'), JSON.stringify({ browserVersion: browser.version(), entered, after, restored, desktop, final }, null, 2));
    console.log('native fullscreen evidence and DOM-only PNGs: ' + out);
    await cdp.detach();
  } finally { await browser.close(); }
});
