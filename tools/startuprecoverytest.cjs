// Native index/bootstrap failures; only scene imports are stubbed, no WebGL or test mode.
// PLAYWRIGHT_MODULE=… node tools/startuprecoverytest.cjs BASE [ARTIFACT_DIR]
// BEFORE_INDEX=/absolute/old-index.html reproduces the missing early recovery against old HTML.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://localhost:8875';
const output = process.argv[3] || '/tmp/lunden-startup-recovery';
const before = process.env.BEFORE_INDEX && fs.readFileSync(process.env.BEFORE_INDEX, 'utf8');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const results = [];
  const pass = text => { results.push(text); console.log(`PASS ${text}`); };
  try {
    for (const target of ['bootstrap', 'startup', 'config', 'startuprecovery', 'version', 'main']) {
      for (const mode of ['abort', 'stall']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        let blocked = true;
        let requests = 0;
        if (before) await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: before }));
        await page.route('**/src/*.js*', route => {
          const file = new URL(route.request().url()).pathname.split('/').pop();
          if (blocked && file === `${target}.js`) {
            requests++;
            return mode === 'abort' ? route.abort('failed') : undefined;
          }
          if (file === 'main.js') return route.fulfill({ contentType: 'text/javascript', body: "window.stubImported=true;document.getElementById('loading').hidden=true;" });
          return route.continue();
        });
        // Seed once on the same origin; a reload must preserve the exact existing values.
        const seed = new URL('/startup-recovery-seed', base).href;
        await page.route(seed, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
        await page.goto(seed);
        await page.evaluate(() => {
          // Valid real resume key, plus a persistent home sentinel. Recovery must not consume either.
          sessionStorage.setItem('lunden.session', JSON.stringify({ ts: Date.now(), mode: 'touch', p: [1, 2, 3] }));
          localStorage.setItem('lunden.recoveryTest', 'saved-home');
        });
        const requested = page.waitForRequest(r => new URL(r.url()).pathname.endsWith(`/${target}.js`));
        await page.goto(base, { waitUntil: 'commit' });
        await page.waitForFunction(() => !!document.getElementById('loading'));
        if (mode === 'stall') assert.equal(await page.evaluate(() => document.documentElement.classList.contains('resuming')), true);
        await requested;
        // Stalls must keep their normal cover throughout the configured grace period.
        if (mode === 'stall') {
          await page.clock.fastForward(119999);
          assert.equal(await page.locator('[data-startup-retry]').count(), 0);
          // #1131: long before the hard limit, the unchanged step shows the stall notice above the still-running cover.
          if (!before) assert.equal(await page.locator('[data-startup-slow]').isVisible(), true);
        }
        if (mode === 'abort' && !before) await page.locator('[data-startup-retry]').waitFor();
        await page.clock.fastForward(mode === 'stall' ? 2 : 120001);
        const shouldRecover = !before || target === 'main';
        if (!shouldRecover) {
          assert.equal(await page.locator('[data-startup-retry]').count(), 0);
          assert.equal(await page.evaluate(() => !!window.stubImported), false);
          pass(`before: ${target} ${mode} remains stuck after 120 s`);
        } else {
          await page.locator('[data-startup-retry]').waitFor();
          assert.equal(await page.locator('#loading').isVisible(), true);
          assert.equal(await page.locator('[data-startup-retry]').count(), 1);
          assert.equal(await page.evaluate(() => !!window.stubImported), false);
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('resuming')), false);
          if (!before) assert.equal(await page.locator('[data-startup-slow]').isVisible(), false);
          const saved = await page.evaluate(() => [sessionStorage.getItem('lunden.session'), localStorage.getItem('lunden.recoveryTest')]);
          assert.ok(JSON.parse(saved[0]).mode === 'touch');
          assert.equal(saved[1], 'saved-home');
          if (target === 'bootstrap' && mode === 'stall') await page.screenshot({ path: path.join(output, 'early-resume-retry.png') });
          blocked = false;
          await page.locator('[data-startup-retry]').click();
          await page.waitForFunction(() => window.stubImported && document.getElementById('loading').hidden);
          await page.clock.fastForward(240001);
          assert.equal(await page.locator('[data-startup-retry]').count(), 0);
          assert.deepEqual(await page.evaluate(() => [sessionStorage.getItem('lunden.session'), localStorage.getItem('lunden.recoveryTest')]), saved);
          pass(`${target} ${mode}: one covered retry, preserved resume/home, actual reload succeeds and cancels watchdog`);
        }
        await context.close();
      }
    }
    // A normally loaded import can still stall during warmup; both normal dismissal signals cancel.
    for (const ending of before ? [] : ['covered', 'hidden', 'done']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await page.route('**/src/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.stubImported=true;${ending === 'hidden' ? "document.getElementById('loading').hidden=true;" : ending === 'done' ? "document.getElementById('loading').classList.add('done');" : ''}` }));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.stubImported);
      assert.equal(await page.evaluate(async () => {
        const { watchStartup } = await import('./src/startuprecovery.js');
        const { STARTUP } = await import('./src/config.js');
        return watchStartup() === window.__lundenStartupRecovery && STARTUP.recoveryTimeout === 120000;
      }), true);
      await page.clock.fastForward(240001);
      assert.equal(await page.locator('[data-startup-retry]').count(), ending === 'covered' ? 1 : 0);
      if (ending === 'covered') {
        await page.evaluate(() => {
          document.getElementById('loading').hidden = true;
          window.__lundenStartupRecovery.fail();
        });
        assert.equal(await page.locator('#loading').isVisible(), false);
        pass('late successful completion dismisses the failure cover; subsequent fail does not reopen it');
      }
      pass(`completed import ${ending}: shared watchdog and correct cancellation`);
      await context.close();
    }
    // #1131: a real blocking loop inside a step (real clock; only the inline stall time is shortened) freezes the
    // heartbeat, then shows "Det här tar ovanligt lång tid" while loading continues; Försök igen reloads and keeps saved data.
    if (!before) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      let block = true;
      await page.route(base + '/', async route => {
        const body = (await (await route.fetch()).text()).replace('api.stallMs = 40000;', 'api.stallMs = 1500;');
        assert.ok(body.includes('api.stallMs = 1500;'));
        route.fulfill({ contentType: 'text/html', body });
      });
      await page.route('**/src/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: block
        ? `const api=window.__lundenLoading;api.step('Bygger huset',0.25);const beat=api.beat,end=performance.now()+2500;
           while(performance.now()<end){}window.blockResult={frozen:api.beat===beat,hiddenDuring:document.querySelector('[data-startup-slow]').hidden};`
        : "window.stubImported=true;document.getElementById('loading').hidden=true;" }));
      const seed = new URL('/startup-recovery-seed', base).href;
      await page.route(seed, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
      await page.goto(seed);
      await page.evaluate(() => { localStorage.setItem('lunden.recoveryTest', 'saved-home'); sessionStorage.setItem('lunden.recoveryPlace', 'saved-place'); });
      await page.goto(base, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.blockResult);
      assert.deepEqual(await page.evaluate(() => window.blockResult), { frozen: true, hiddenDuring: true });
      await page.locator('[data-startup-slow]').waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await page.locator('[data-startup-retry]').count(), 0);
      assert.equal(await page.locator('[data-loading-step]').textContent(), 'Bygger huset');
      const beat = await page.evaluate(() => window.__lundenLoading.beat);
      await page.waitForFunction(b => window.__lundenLoading.beat > b, beat);
      await page.screenshot({ path: path.join(output, 'stall-notice.png') });
      block = false;
      await page.locator('[data-startup-slow] button').click();
      await page.waitForFunction(() => window.stubImported && document.getElementById('loading').hidden);
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('lunden.recoveryTest'), sessionStorage.getItem('lunden.recoveryPlace')]), ['saved-home', 'saved-place']);
      pass('blocking step freezes the heartbeat, then shows the stall notice; its retry reloads and keeps saved data');
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before: !!before, checks: results.length, results }, null, 2));
    console.log('ALL PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
