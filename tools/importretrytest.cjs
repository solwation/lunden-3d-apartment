// #1627: a failed main.js import is retried (new URL) and a persistent failure ends in the error view, with the failed module in the record.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/importretrytest.cjs BASE
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://localhost:8165';
const stub = "document.getElementById('loading').hidden=true;window.mainStarted=(window.mainStarted||0)+1;";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  try {
    for (const mode of ['normal', 'once-404', 'once-network', 'always-404']) {
      const page = await browser.newPage(); const urls = []; const t0 = Date.now();
      await page.route('**/src/main.js*', route => {
        urls.push(route.request().url());
        if (mode === 'always-404' || (mode !== 'normal' && urls.length === 1)) return mode === 'once-network' ? route.abort('failed') : route.fulfill({ status: 404, body: 'nope' });
        return route.fulfill({ contentType: 'text/javascript', body: stub });
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.mainStarted || document.querySelector('[data-startup-retry]'), { timeout: 30000 });
      const started = await page.evaluate(() => !!window.mainStarted), ms = Date.now() - t0;
      if (mode === 'always-404') {
        assert.equal(started, false);
        const rec = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lunden.startupFailure')));
        assert.equal(rec.cause, 'import'); assert.match(rec.module, /\/src\/main\.js$/); assert.ok(!rec.module.includes('?')); assert.equal(rec.tries, 2);
        const taken = await page.evaluate(async () => (await import('./src/startuprecovery.js')).takeStartupFailure());
        assert.match(taken.module, /\/src\/main\.js$/); assert.equal(taken.tries, 2); // what crashlog.js sends as module/tries
        assert.ok(urls.length >= 3, 'retry + reload attempt'); console.log('PASS always-404', { urls: urls.length, ms, module: rec.module });
      } else {
        assert.equal(started, true); assert.equal(urls.length, mode === 'normal' ? 1 : 2);
        if (mode !== 'normal') assert.match(urls[1], /[?&]r=1/);
        if (mode === 'normal') assert.ok(ms < 2500, 'no extra delay'); console.log('PASS', mode, { urls: urls.length, ms });
      }
      await page.close();
    }
    // #1630: a hung import (never settles) counts as a load failure only while nothing finishes downloading.
    const page = await browser.newPage(); await page.goto(base, { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(async () => {
      const { importWithRetry } = await import('./src/startuprecovery.js');
      const fake = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
      const base = { retries: 1, delay: 10, stallTimeout: 300, storage: fake(), downloading: () => true, watchProgress: () => () => {} };
      const never = new Promise(() => {}), out = {};
      let calls = [];
      out.once = { value: await importWithRetry('http://x.test/src/main.js', { ...base, reload: () => { out.reloaded = 1; },
        importer: u => { calls.push(u); return calls.length === 1 ? never : Promise.resolve('ok'); } }), calls };
      calls = []; let reloads = 0;
      out.always = { value: await importWithRetry('http://x.test/src/main.js', { ...base, reload: () => { reloads++; }, importer: u => { calls.push(u); return never; } }), calls, reloads };
      const t0 = Date.now();
      out.notDownloading = await importWithRetry('http://x.test/src/main.js', { ...base, downloading: () => false, importer: () => new Promise(res => setTimeout(() => res('late'), 700)) });
      let arm;
      const slow = importWithRetry('http://x.test/src/main.js', { ...base, watchProgress: cb => { arm = setInterval(cb, 100); return () => clearInterval(arm); },
        importer: () => new Promise(res => setTimeout(() => res('slow-but-progressing'), 800)) });
      out.progressing = await slow;
      return out;
    });
    assert.equal(r.once.value, 'ok'); assert.equal(r.once.calls.length, 2); assert.match(r.once.calls[1], /[?&]r=1/); assert.equal(r.reloaded, undefined);
    assert.equal(r.always.value, true); assert.equal(r.always.calls.length, 2); assert.equal(r.always.reloads, 1);
    assert.equal(r.notDownloading, 'late'); assert.equal(r.progressing, 'slow-but-progressing');
    console.log('PASS stall: hung import retried once then guarded reload; no stall while building or while downloads finish', JSON.stringify({ once: r.once.calls.length, always: r.always.calls.length }));
    await page.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
