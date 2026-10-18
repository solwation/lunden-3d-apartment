// #1214/#1226: the report field must be typeable after a photo/camera return, on touch (portrait + landscape) and with a mouse.
// GAME=http://localhost:PORT PLAYWRIGHT_MODULE=… CHROME_PATH=… node --test tools/adminreportphototest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const GAME = process.env.GAME || 'http://localhost:8779/';

async function open(browser, opts) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(GAME);
  await page.evaluate(async () => {
    const { AdminReports } = await import('/src/adminreports.js');
    const g = id => document.getElementById(id);
    g('terminal').hidden = false;
    window.reports = new AdminReports({ form: g('terminal-form'), input: g('terminal-code'), message: g('terminal-message'), panel: g('admin-login'), password: g('admin-password'), login: g('admin-signin'), cancel: g('admin-cancel'), menu: g('terminal-admin-menu'), reportPanel: g('admin-report'), reportInput: g('admin-report-text'), reportStatus: g('admin-report-status') });
    reports.token = 'x'; reports.expires = Date.now() + 36e5; reports.menuState(); reports.openReport();
  });
  return { context, page, errors };
}
async function choosePhoto(page) {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4032; c.height = 3024;
    const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg')); return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page.setInputFiles('#admin-report-file', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => !document.getElementById('admin-report-preview').hidden);
  // the page comes back from the camera sheet
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
test.after(() => browser.close());

for (const [w, h] of [[390, 844], [844, 390]]) {
  test(`touch ${w}x${h}: type in the report after a photo, also when a tap lands on a field that is already focused`, async () => {
    const { context, page, errors } = await open(browser, { viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    assert.ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer emulated');
    await choosePhoto(page);
    const st = await page.evaluate(() => {
      const t = document.getElementById('admin-report-text'), b = t.getBoundingClientRect();
      return { open: document.getElementById('admin-report').open, disabled: t.disabled, readOnly: t.readOnly, hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.id, focused: document.activeElement === t };
    });
    assert.equal(st.open, true); assert.equal(st.disabled, false); assert.equal(st.readOnly, false);
    assert.equal(st.hit, 'admin-report-text', 'nothing covers the field');
    assert.equal(st.focused, false, 'no script focus on touch (it would not raise the iOS keyboard)');
    // #1269: no capture attribute so mobile browsers allow choosing an image from the photo album/gallery
    assert.equal(await page.getAttribute('#admin-report-file', 'capture'), null, 'no capture attribute on file input');
    assert.equal(await page.getAttribute('#admin-report-file', 'accept'), 'image/*');
    const box = await page.locator('#admin-report-text').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 20);
    await page.keyboard.type('efter foto');
    // iOS: field focused without keyboard, a second tap must re-focus it
    await page.evaluate(() => { window.refocus = 0; document.getElementById('admin-report-text').addEventListener('focus', () => window.refocus++); });
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 20);
    assert.ok(await page.evaluate(() => window.refocus) >= 1, 'a tap on the already focused field focuses it again');
    await page.keyboard.type(' igen');
    assert.equal(await page.inputValue('#admin-report-text'), 'efter foto igen');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('mouse: the field is focused after a photo (#1214)', async () => {
  const { context, page, errors } = await open(browser, { viewport: { width: 1280, height: 800 } });
  await choosePhoto(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'admin-report-text');
  await page.keyboard.type('mus');
  assert.equal(await page.inputValue('#admin-report-text'), 'mus');
  assert.deepEqual(errors, []);
  await context.close();
});
