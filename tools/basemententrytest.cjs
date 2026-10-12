// #729: actual apartment, trusted mouse start/PointerLock, E/touch handlers and physical Player routes.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/basemententrytest.cjs http://localhost:8729
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8729';
const output = process.env.SHOTS || '/tmp/lunden-basement-entry';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 950, height: 950 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    console.log('Loading the bounded actual-apartment fixture…');
    await page.goto(new URL('/tools/basemententrytest.html', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.entryReady, null, { timeout: 240000, polling: 100 });
    const frame = page.frames().find(frame => frame.url().includes('?shot'));
    await frame.locator('#start-mouse').click();
    await frame.waitForFunction(() => document.pointerLockElement === window.__app.renderer.domElement, null, { timeout: 10000, polling: 100 });
    console.log('Running actual input and movement assertions…');
    const result = await page.evaluate(() => window.runBasementEntries());
    fs.writeFileSync(`${output}/result.json`, JSON.stringify({ ...result, pageErrors: errors }, null, 2));
    console.log(result.lines.join('\n'));
    const ok = result.failures === 0 && errors.length === 0;
    console.log(ok ? 'ALL PASS' : 'SOME FAILED');
    if (!ok) process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
