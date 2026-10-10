// Crash reports (#629): headless browser test against a local Worker. Start both first:
//   python3 tools/devserve.py 8137 .          node cloudflare/dev.mjs 8144 tok
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] node tools/crashtest.cjs http://localhost:8137 http://localhost:8144 tok
// Checks: off without the cloud (no storage, no request); the heartbeat's content and cost; a killed renderer
// (CDP Page.crash) gives a 'död' report at the next start; a clean close and a backgrounded page do not; a thrown error,
// an unhandled rejection and webglcontextlost / restored give 'fel' reports; duplicates and a flood are capped.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8137', worker = process.argv[3] || 'http://localhost:8144', token = process.argv[4] || 'tok';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = async () => {
  const list = await (await fetch(`${worker}/crash?limit=100`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return Promise.all(list.map(async (x) => (await fetch(`${worker}/crash/${x.id}`, { headers: { Authorization: `Bearer ${token}` } })).json()));
};
async function until(fn, ms = 30000) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
/** Kill the page's renderer process (no JS runs afterwards, as when iOS kills the tab). */
async function kill(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  cdp.send('Page.crash').catch(() => {}); // never answers
  await sleep(1500);
  await Promise.race([page.close().catch(() => {}), sleep(3000)]);
}
const beat = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lunden.crash.beat')); } catch { return null; } });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (ctx, query) => {
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(`${game}/?${query}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 120000 });
    return page;
  };
  try {
    // 1. off without the cloud
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const posts = [];
      ctx.on('request', (r) => { if (new URL(r.url()).pathname === '/crash') posts.push(r.url()); });
      const page = await open(ctx, '');
      await sleep(2500);
      check(await page.evaluate(() => window.__crashlog.on === false && localStorage.getItem('lunden.crash.beat') === null && localStorage.getItem('lunden.crash.pid') === null),
        'no cloud: crashlog is off and writes nothing');
      await page.evaluate(() => setTimeout(() => { throw new Error('quiet'); }));
      await sleep(500);
      check(posts.length === 0, 'no cloud: an error sends nothing');
      await ctx.close();
    }

    // 2. heartbeat, then a killed renderer
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    let page = await open(ctx, `cloud=${worker}&lowmem`);
    const b = await until(async () => { const x = await beat(page); return x?.at && x.gpuMB && x.gpuMB.tex > 0 ? x : null; }, 60000);
    check(!!b, 'heartbeat has place, quality, renderer.info and a GPU estimate', JSON.stringify({ at: b?.at, q: b?.q, fps: b?.fps, px: b?.px, gl3: b?.gl3, gpuMB: b?.gpuMB }));
    check(b?.s === 'run' && typeof b.build === 'string' && /Mobi|Headless|Chrome/.test(b.ua) && b.scr?.length === 3, 'heartbeat: state run, build, user agent, screen', b?.ua);
    const size = b ? JSON.stringify(b).length : 0;
    check(size > 0 && size < 8000, 'heartbeat including bounded history is small', `${size} B`);
    await sleep(5000);
    const per = await page.evaluate(() => { const c = window.__crashlog, t = performance.now(); for (let i = 0; i < 200; i++) c.beat(); return (performance.now() - t) / 200; });
    check(per < 1, 'a beat (snapshot + localStorage write, every 2 s) costs under 1 ms', `${per.toFixed(3)} ms`);
    check(await page.evaluate(() => { const h = JSON.parse(localStorage.getItem('lunden.crash.beat')).history; return h.length === 12 && h.every(s => 'frame' in s && 'lagMs' in s); }),
      'heartbeat retains only twelve pre-failure samples with frame progress and timer lag');
    check(b?.gpuMB?.basis === 'source-images' && b.gpuMB.complete === false, 'memory numbers explicitly marked incomplete source-image estimates');
    const before = (await reports()).length;
    await kill(ctx, page);
    await sleep(6500); // older than deadIfWithinMs
    page = await open(ctx, `cloud=${worker}&lowmem`);
    const dead = await until(async () => (await reports()).find((r) => r.typ === 'död'));
    check(!!dead, 'a killed renderer gives a död report at the next start', dead && JSON.stringify({ room: dead.beat.at.room, q: dead.beat.q, gpu: dead.beat.gpuMB.total, gap: dead.gap }));
    check(dead?.beat?.s === 'run' && dead.beat.at && dead.beat.gl3 && dead.pid, 'the död report carries the last beat (place, renderer.info) and a random id');
    const afterDead = (await reports()).length;
    check(afterDead === before + 1, 'exactly one report');

    // 3. caught errors, duplicates, flood
    await page.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('boom same'); }); });
    await page.evaluate(() => { Promise.reject(new Error('rejected once')); });
    await page.evaluate(() => sessionStorage.setItem('lunden.glReloadAt', String(Date.now()))); // phone profile reloads on a restored context (#628, glrestoretest): not here
    await page.evaluate(() => { const e = window.__app.renderer.getContext().getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(() => e.restoreContext(), 300); });
    await sleep(2500);
    let rs = (await reports()).filter((r) => r.typ === 'fel');
    check(rs.filter((r) => String(r.msg).includes('boom same')).length === 1, 'the same thrown error three times = one report');
    const boom = rs.find((r) => String(r.msg).includes('boom same'));
    check(!!boom?.stack && !!boom.snap?.at && boom.errs !== undefined, 'a fel report carries stack, a fresh snapshot with place and the console.error ring');
    check(rs.some((r) => r.kind === 'rejection' && String(r.msg).includes('rejected once')), 'unhandled rejection reported');
    check(rs.some((r) => r.kind === 'webglcontextlost'), 'webglcontextlost reported');
    check(rs.some((r) => r.kind === 'webglcontextrestored'), 'webglcontextrestored reported');
    const firstLost = rs.find(r => r.kind === 'webglcontextlost');
    const firstRestored = rs.find(r => r.kind === 'webglcontextrestored');
    check(firstLost?.context?.episode === 1 && firstRestored?.context?.episode === 1 && firstRestored.context.durationMs >= 0,
      'loss and restore share an episode and retain recovery duration');
    check(firstLost?.snap?.history?.some(s => s.gl === 'ok' && s.frame > 0), 'loss carries pre-failure rendering history');
    await page.evaluate(() => { const c = document.createElement('canvas'); document.body.append(c); c.dispatchEvent(new Event('webglcontextlost')); c.remove(); });
    check(await page.evaluate(() => !window.__crashlog.glLost), 'unrelated canvas events do not alter game diagnostics');
    await page.evaluate(() => { const e = window.__app.renderer.getContext().getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(() => e.restoreContext(), 300); });
    await until(async () => (await reports()).filter(r => r.kind === 'webglcontextrestored').length === 2);
    rs = (await reports()).filter(r => r.typ === 'fel');
    check(rs.filter(r => r.kind === 'webglcontextlost').length === 2 && rs.filter(r => r.kind === 'webglcontextrestored').length === 2,
      'two genuine context loss/recovery cycles on the same day produce four reports');
    const publicRows = await (await fetch(`${worker}/crash/public`)).json();
    check(publicRows.filter(r => r.context?.episode === 2).length === 2 && publicRows.some(r => r.context?.episode === 2 && r.state?.history?.length),
      'public endpoint preserves second episode and pre-failure history');
    // 3b. layout (#567): a normal rotation is no false alarm; a canvas that does not fill the surface is reported once
    const layouts = async () => (await reports()).filter((r) => r.typ === 'layout');
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(500);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await sleep(4500);
    check((await layouts()).length === 0, 'normal rotation (resize + orientationchange): no layout report');
    await page.evaluate(() => { const c = document.getElementById('game-canvas'); c.style.width = '200px'; });
    await until(async () => (await layouts()).length > 0, 60000);
    const lay = await layouts();
    check(lay.length === 1, 'a canvas not filling the window is reported once', lay[0]?.msg);
    const L = lay[0]?.layout;
    check(!!L && L.css && L.rect && L.buf && L.inner && L.doc && L.vv && L.scr && 'dpr' in L && 'portrait' in L && 'standalone' in L && Array.isArray(L.safe) && 'aspect' in L && 'up' in L && L.loaded === 1,
      'the layout report carries canvas, rect, buffer, aspect, window, document, visualViewport, screen, orientation, dpr, standalone, safe-area', JSON.stringify(L));
    await page.evaluate(() => { document.getElementById('game-canvas').style.width = ''; });
    await sleep(500);
    await page.evaluate(() => { document.getElementById('game-canvas').style.width = '200px'; });
    await sleep(4500);
    check((await layouts()).length === 1, 'the same fault again: deduplicated');
    await page.evaluate(() => { document.getElementById('game-canvas').style.width = ''; });
    await page.evaluate(() => { for (let i = 0; i < 40; i++) setTimeout(() => { throw new Error(`flood ${i}`); }); });
    await sleep(2500);
    const st = await page.evaluate(() => ({ sent: window.__crashlog.stats.sent.length, dropped: window.__crashlog.stats.dropped.length }));
    check(st.sent <= 12 && st.dropped >= 30, 'flood is capped per session', JSON.stringify(st));
    rs = await reports();
    check(rs.length <= before + 1 + 12, 'the Worker got no more than the cap', String(rs.length));
    check(rs.every((r) => JSON.stringify(r).length < 16384) && rs.every((r) => !('name' in r)), 'reports are small and carry no name');

    // 4. a backgrounded page that is then killed is not a crash; a clean close is not either
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(500);
    check((await beat(page))?.s === 'bg', 'hidden marks the beat bg');
    const n0 = (await reports()).length;
    await kill(ctx, page);
    await sleep(6500);
    page = await open(ctx, `cloud=${worker}&lowmem`);
    await sleep(3000);
    check((await reports()).length === n0, 'killed while in the background: no död report');
    await page.goto('about:blank'); // a real navigation: pagehide marks the beat clean
    await sleep(6500);
    page = await open(ctx, `cloud=${worker}&lowmem`);
    await sleep(3000);
    check((await reports()).length === n0, 'clean close: no död report');
    await ctx.close();
  } catch (e) {
    console.log('ERROR', e);
    failed++;
  } finally {
    await browser.close();
  }
  console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
