import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('#1214 report modal textarea is focusable and typeable on touch after choosing photo', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
  await page.goto('http://localhost:8782');

  const ready = await page.evaluate(async () => {
    const { AdminReports } = await import('/src/adminreports.js');
    const { setupTouch } = await import('/src/touch.js');
    const touch = setupTouch({ onLook: () => {} });
    touch.enabled = true;

    const reportPanel = document.getElementById('admin-report');
    const reportInput = document.getElementById('admin-report-text');
    const reportStatus = document.getElementById('admin-report-status');
    const terminal = document.getElementById('terminal');
    const terminalInput = document.getElementById('terminal-code');

    const reports = new AdminReports({
      form: document.getElementById('terminal-form'),
      input: terminalInput,
      message: document.getElementById('terminal-message'),
      panel: document.getElementById('admin-login'),
      password: document.getElementById('admin-password'),
      login: document.getElementById('admin-signin'),
      cancel: document.getElementById('admin-cancel'),
      menu: document.getElementById('terminal-admin-menu'),
      reportPanel,
      reportInput,
      reportStatus
    });

    reports.token = 'dummy-token';
    reports.expires = Date.now() + 3600000;
    reports.openReport();
    return reportPanel.open;
  });

  assert.ok(ready, 'report dialog opened');

  // Verify touch pointerdown does not preventDefault on textarea
  const defaultPrevented = await page.evaluate(() => {
    const el = document.getElementById('admin-report-text');
    const ev = new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  assert.equal(defaultPrevented, false, 'touch pointerdown on reportInput is not prevented');

  // Simulate choosing a photo via choosePhoto
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg'));
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    const panel = document.getElementById('admin-report');
    const input = panel.querySelector('#admin-report-file');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Wait for preview image to appear
  await page.waitForFunction(() => {
    const img = document.getElementById('admin-report-preview-img');
    return img && img.src && !document.getElementById('admin-report-preview').hidden;
  });

  // Check that reportInput was automatically refocused
  const activeId = await page.evaluate(() => document.activeElement?.id);
  assert.equal(activeId, 'admin-report-text', 'reportInput is focused after photo is attached');

  // Type into textarea on touch device
  await page.type('#admin-report-text', 'Testmeddelande efter foto');
  const typedValue = await page.locator('#admin-report-text').inputValue();
  assert.equal(typedValue, 'Testmeddelande efter foto');

  await page.screenshot({ path: '/tmp/report-photo-touch-390.png' });
  await browser.close();
  assert.equal(errors.length, 0, 'no page errors');
});
