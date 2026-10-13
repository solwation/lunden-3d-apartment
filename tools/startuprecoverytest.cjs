// Native index/bootstrap network failure recovery; scene imports are stubbed, no WebGL.
// Run against tools/devserve.py: node tools/startuprecoverytest.cjs http://localhost:8855
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    let mode = 'failure';
    await page.route('**/src/main.js*', async route => {
      if (mode === 'failure') return route.abort('failed');
      if (mode === 'stall') return; // Keep the real browser module request pending.
      return route.fulfill({ contentType: 'text/javascript', body: mode === 'covered' ? 'window.stubImported=true;' : "document.getElementById('loading').hidden=true;window.stubImported=true;" });
    });
    await page.addInitScript(() => {
      sessionStorage.setItem('lunden.recoveryTest','saved-place');
      localStorage.setItem('lunden.recoveryTest','saved-home');
    });
    await page.goto(process.argv[2] || 'http://localhost:8133', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-startup-retry]').waitFor();
    assert.equal(await page.locator('#loading').isVisible(), true);
    console.log('PASS real failed module request shows immediate covered retry');
    mode = 'success';
    await page.locator('[data-startup-retry]').click();
    await page.waitForFunction(() => window.stubImported && document.getElementById('loading').hidden);
    assert.deepEqual(await page.evaluate(() => [sessionStorage.getItem('lunden.recoveryTest'),localStorage.getItem('lunden.recoveryTest')]), ['saved-place','saved-home']);
    console.log('PASS actual retry reload succeeds and preserves saved storage');
    for (const scenario of ['stall','covered']) {
      mode=scenario;
      await page.clock.install();
      const moduleRequest = page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/src/main.js'), {timeout:15000});
      await page.goto(process.argv[2] || 'http://localhost:8133', {waitUntil:'commit'});
      await moduleRequest;
      if(scenario==='covered')await page.waitForFunction(()=>window.stubImported);
      await page.clock.fastForward(120001);
      await page.locator('[data-startup-retry]').waitFor();
      assert.equal(await page.locator('#loading').isVisible(),true);
      console.log(`PASS ${scenario==='stall'?'pending real module request':'completed import with stalled warmup cover'} offers retry after bounded wait`);
    }
    await context.close();
    console.log('ALL PASS');
  } finally { await browser.close(); }
})().catch(error=>{console.error('FAIL',error);process.exitCode=1;});
