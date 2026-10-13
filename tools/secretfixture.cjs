#!/usr/bin/env node
// External HTML companion: provision only tools fixture inputs, preserve authored app setup.
// LUNDEN_SECRET_TEST_INPUTS=/absolute/private.json node tools/secretfixture.cjs BASE fixture OUTDIR
const fs = require('fs'), path = require('path');
const input = require('./secret-test-inputs.cjs');
async function main() {
  const inputs = input.loadSecretTestInputs(); // Missing/invalid input is FAIL before launching a browser.
  const [base, fixture, out] = process.argv.slice(2);
  if (!base || !out || !/^[a-z][a-z0-9]*test$/.test(fixture || '')) throw new Error('Usage: secretfixture.cjs BASE fixture OUTDIR');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  fs.mkdirSync(out, { recursive: true });
  const errors = [], records = [], started = Date.now();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(value => {
      if (/^\/tools\//.test(location.pathname)) Object.defineProperty(window, '__lundenSecretTestInputs', { value, configurable: false });
    }, inputs);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(input.redact(error.message, inputs)));
    await page.goto(new URL(`tools/${fixture}.html`, base.endsWith('/') ? base : base + '/').href, { waitUntil: 'commit' });
    let result = '', succeeded = false;
    while (Date.now() - started < 1200000) {
      const snapshot = await page.evaluate(() => {
        const apps = [...document.querySelectorAll('iframe')].flatMap(frame => {
          const win = frame.contentWindow, app = win?.__app;
          return app ? [{ url: win.location.href, timeOrigin: win.performance.timeOrigin,
            width: win.innerWidth, height: win.innerHeight, testMode: !!app.testMode,
            fullscreen: !!win.document.fullscreenElement }] : [];
        });
        return { text: document.querySelector('#out')?.textContent || '', apps };
      });
      for (const app of snapshot.apps) if (!records.some(row => row.timeOrigin === app.timeOrigin)) records.push({ phase: 'ready', ...app });
      // The rearrangement fixtures' authored catches writes a terminal Error stack without a verdict.
      // Ordinary FAIL assertion rows never stop remaining fixture actions/reloads.
      const caughtFixtureFailure = ['rearrangetest', 'rearrangeuitest'].includes(fixture) && /^FAIL (?:[A-Za-z]*Error):/m.test(snapshot.text);
      if (/^(ALL PASS|SOME FAILED)$/m.test(snapshot.text) || caughtFixtureFailure) {
        succeeded = /^ALL PASS$/m.test(snapshot.text) && !/^FAIL\b/m.test(snapshot.text);
        result = input.redact(snapshot.text, inputs);
        records.push(...snapshot.apps.map(app => ({ phase: 'final', ...app })));
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!result) throw new Error('Private fixture timed out.');
    fs.writeFileSync(path.join(out, `${fixture}.log`), result + '\n');
    await page.screenshot({ path: path.join(out, `${fixture}.png`), fullPage: true, timeout: 180000 });
    fs.writeFileSync(path.join(out, `${fixture}.json`), JSON.stringify({ records, errors, wallMs: Date.now() - started }, null, 2));
    console.log(result);
    if (!succeeded || errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch(() => { console.error('FAIL private fixture: input, runner or browser error (private values omitted).'); process.exitCode = 1; });
