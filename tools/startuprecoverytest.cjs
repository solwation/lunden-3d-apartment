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
        if (mode === 'abort' && !before) {
          // #1627: the failed import is retried after STARTUP.importRetryDelay (virtual time here), then once more after a reload
          for (let i = 0; i < 40 && !(await page.locator('[data-startup-retry]').count()); i++) { await page.clock.fastForward(1500).catch(() => {}); await page.waitForTimeout(150); }
          await page.locator('[data-startup-retry]').waitFor();
          // Error view (#1132): an import failure names the running step; bootstrap's own deps fail before any step.
          const view = await page.evaluate(() => { const e = document.querySelector('[data-startup-error]'); return e && [e.textContent, e.dataset.cause]; });
          assert.equal(view?.[1], 'import');
          assert.match(view[0], target === 'main' ? /^Fel i steget ”Hämtar programfilerna”: en programfil kunde inte hämtas\.$/ : /^Fel i steget ”Startar”: en programfil kunde inte hämtas\.$/);
          assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('lunden.startupFailure'))).cause, 'import');
        }
        // The deadline is not an error: it keeps the general recovery text without a failed-step line.
        if (mode === 'stall' && !before) assert.equal(await page.locator('[data-startup-error]').count(), 0);
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
          // CDP capture: page.screenshot waits for fonts/frames, which never come while page.clock is paused.
          if (target === 'bootstrap' && mode === 'stall') {
            const cdp = await context.newCDPSession(page);
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(output, 'early-resume-retry.png'), Buffer.from(data, 'base64'));
          }
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
    // Startup error view (#1132): the real main.js fails at a named step (plan network, WebGL context, scene build).
    // The message names the step, the single retry keeps saved resume/home, and the next load reports step + cause
    // through the crash log (a stub main imports src/crashlog.js with a fake cloud that only records POSTs).
    if (!before) {
      const gl = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      try {
        const noWebGL = () => {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : get.call(this, type, ...rest); };
        };
        for (const [name, step, cause, reason, setup] of [
          ['plan-network', 'Hämtar planritningen', 'network', 'nätverket svarade inte', page => page.route('**/data/plan.json*', route => route.abort('failed'))],
          ['webgl', 'Startar 3D-grafiken', 'webgl', 'webbläsaren kunde inte starta 3D-grafiken (WebGL)', page => page.addInitScript(noWebGL)],
          ['scene-build', 'Bygger huset', 'scene', 'ett oväntat fel uppstod', page => page.route('**/data/plan.json*', route => route.fulfill({ contentType: 'application/json', body: '{"broken":true}' }))],
        ]) {
          for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
            const phone = viewport.width < 600;
            const context = await gl.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const posts = [];
            await page.route('http://crash.test/**', route => {
              if (route.request().method() === 'POST') posts.push(JSON.parse(route.request().postData()));
              return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
            });
            let blocked = true;
            await page.route('**/src/main.js*', route => blocked ? route.continue()
              : route.fulfill({ contentType: 'text/javascript', body: "await import('./crashlog.js');window.stubImported=true;document.getElementById('loading').hidden=true;" }));
            await setup(page);
            const seed = new URL('/startup-recovery-seed', base).href;
            await page.route(seed, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
            await page.goto(seed);
            await page.evaluate(() => {
              sessionStorage.setItem('lunden.session', JSON.stringify({ ts: Date.now(), mode: 'touch', p: [1, 2, 3] }));
              localStorage.setItem('lunden.recoveryTest', 'saved-home');
            });
            await page.goto(new URL('/?cloud=http://crash.test', base).href);
            await page.locator('[data-startup-retry]').waitFor({ timeout: 60000 });
            const view = await page.evaluate(() => {
              const line = document.querySelector('[data-startup-error]');
              return { text: line?.textContent, cause: line?.dataset.cause, row: document.querySelector('.loading-step').hidden,
                visible: !document.getElementById('loading').hidden, resuming: document.documentElement.classList.contains('resuming'),
                buttons: document.querySelectorAll('[data-startup-retry]').length, record: JSON.parse(sessionStorage.getItem('lunden.startupFailure')),
                saved: [sessionStorage.getItem('lunden.session'), localStorage.getItem('lunden.recoveryTest')] };
            });
            assert.equal(view.text, `Fel i steget ”${step}”: ${reason}.`, name);
            assert.equal(view.cause, cause);
            assert.ok(view.row && view.visible && !view.resuming && view.buttons === 1, `${name}: covered error view with one retry`);
            assert.equal(view.record.step, step);
            assert.equal(view.record.cause, cause);
            assert.equal(JSON.parse(view.saved[0]).mode, 'touch');
            assert.equal(view.saved[1], 'saved-home');
            await page.screenshot({ path: path.join(output, `error-${name}-${phone ? 'phone' : 'desktop'}.png`) });
            blocked = false;
            await page.locator('[data-startup-retry]').click();
            await page.waitForFunction(() => window.stubImported && document.getElementById('loading').hidden);
            await page.waitForFunction(() => window.__crashlog?.stats.sent.includes('startup'));
            await page.waitForTimeout(300);
            const report = posts.find(r => r.kind === 'startup');
            assert.ok(report, `${name}: next load reports the failed start`);
            assert.equal(report.step, step);
            assert.equal(report.cause, cause);
            assert.ok(report.msg.startsWith(`[${step}] `), report.msg);
            assert.deepEqual(await page.evaluate(() => [sessionStorage.getItem('lunden.session'), localStorage.getItem('lunden.recoveryTest')]), view.saved);
            pass(`${name} (${phone ? 'phone' : 'desktop'}): error names "${step}", retry reloads with preserved resume/home, crash log gets step + cause`);
            await context.close();
          }
        }
      } finally { await gl.close(); }
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ before: !!before, checks: results.length, results }, null, 2));
    console.log('ALL PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
