// #1759: a player state the room drops is sent again. Two light module-level Ghosts clients (no full app) against the local Worker:
//   python3 tools/devserve.py 8188 .      node cloudflare/dev.mjs 8799 testtoken
//   tools/browsertest.sh node tools/resendtest.cjs http://localhost:8188 http://localhost:8799 [noresend]
// 1. traffic: A's messages per second standing still and walking (GHOSTS.hz at most);
// 2. a forced drop: A's socket stalls (messages queue, as over a lossy phone link) while its float (`fb`) changes, then the queue
//    arrives at once; the room passes perSecond and drops the rest, the last state with the final float and the rod among them;
//    B must still see A's final float and rod within GHOSTS.resendMs + 3 s.
const kit = require('./testkit.cjs');
const [game = 'http://localhost:8188', worker = 'http://localhost:8799', mode = ''] = process.argv.slice(2); // mode 'noresend': GHOSTS.resendMs = Infinity, the behaviour before #1759 (the drop check then fails)
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const open = async (name) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
      await page.goto(game);
      await page.evaluate(async ({ worker, name, mode }) => {
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { GHOSTS } = await import('/src/config.js');
        if (mode === 'noresend') GHOSTS.resendMs = Infinity;
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 2, 0.1, 100);
        const S = { p: [0, 0, 0], r: 0, hi: '', fb: null };
        const ghosts = new Ghosts({ scene, camera, url: worker, name: () => name, state: () => ({ ...S, p: S.p.slice() }), score: () => 0 });
        const got = [], message = ghosts.message.bind(ghosts);
        ghosts.message = (d) => { if (d !== 'q') { try { const m = JSON.parse(d); if (m.t === 's') got.push({ i: m.i, fb: m.fb ?? null, hi: m.hi ?? '' }); } catch {} } message(d); };
        window.R = { ghosts, S, got, G: GHOSTS, walk: null };
        setInterval(() => ghosts.update(0.05), 50); // the frames
      }, { worker, name, mode });
      await page.waitForFunction(() => window.R.ghosts.connected, null, { timeout: 120000 });
      return page;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, x) => A.evaluate(f, x), pb = (f, x) => B.evaluate(f, x);
    await pb(() => { R.S.p = [1, 0, 0]; });
    await sleep(1500);
    // 1. traffic standing still and walking
    const count = () => pa(() => ({ m: R.ghosts.messages, r: R.ghosts.resends ?? 0, t: performance.now() }));
    let c0 = await count(); await sleep(20000); let c1 = await count();
    const idle = { perSecond: +((c1.m - c0.m) / ((c1.t - c0.t) / 1000)).toFixed(2), messages: c1.m - c0.m, resends: c1.r - c0.r };
    await pa(() => { const t0 = performance.now(); R.walk = setInterval(() => { const s = (performance.now() - t0) / 1000; R.S.p = [Math.cos(s / 3) * 3, 0, Math.sin(s / 3) * 3]; R.S.r = s / 3; }, 50); });
    c0 = await count(); await sleep(10000); c1 = await count();
    await pa(() => clearInterval(R.walk));
    const moving = { perSecond: +((c1.m - c0.m) / ((c1.t - c0.t) / 1000)).toFixed(2), messages: c1.m - c0.m, resends: c1.r - c0.r };
    c0 = await count(); await sleep(8000); c1 = await count();
    const settle = { messages: c1.m - c0.m, resends: c1.r - c0.r };
    console.log('traffic', JSON.stringify({ idle, moving, afterStopping8s: settle }));
    check(idle.perSecond <= 0.1 && moving.perSecond <= 5.05 && settle.messages <= 2, 'traffic: standing still ~0 messages/s, walking at most GHOSTS.hz, at most one resend after stopping', { idle, moving, settle });
    // 2. a forced drop: stall, change the float every frame, then the burst
    await pa(() => {
      const ws = R.ghosts.ws, real = ws.send.bind(ws); R.queue = []; ws.send = (d) => R.queue.push(d);
      R.flush = () => { ws.send = real; for (const d of R.queue) real(d); return R.queue.length; };
      R.S.hi = 'rod'; R.S.fb = [10, -7.2, 20, 0];
      R.walk = setInterval(() => { R.S.fb = [Math.round((R.S.fb[0] + 0.05) * 100) / 100, -7.2, 20, 0]; }, 50);
    });
    await sleep(2500);
    const final = await pa(() => { clearInterval(R.walk); R.S.fb = [12.34, -7.2, 20, 0]; return R.S.fb; });
    await sleep(400); // the final state queues too
    await pb(() => { R.got.length = 0; });
    const flushed = await pa(() => ({ n: R.flush(), id: R.ghosts.me }));
    await sleep(800);
    const burst = await pb((id) => { const mine = R.got.filter((m) => m.i === id); return { delivered: mine.length, lastFb: mine.at(-1)?.fb ?? null }; }, flushed.id);
    console.log('burst', JSON.stringify({ queued: flushed.n, ...burst }));
    const t0 = Date.now();
    const seen = await pb(async ({ id, final, ms }) => {
      const end = performance.now() + ms;
      for (;;) {
        const g = R.ghosts.others.get(id);
        if (g?.bob && g.bob[0] === final[0] && g.hi === 'rod') return { ok: true, bob: g.bob, hi: g.hi };
        if (performance.now() > end) return { ok: false, bob: g?.bob ?? null, hi: g?.hi ?? null };
        await new Promise((r) => setTimeout(r, 100));
      }
    }, { id: flushed.id, final, ms: ((m) => Number.isFinite(m) ? m : 3000)(await pa(() => R.G.resendMs)) + 3000 });
    seen.afterMs = Date.now() - t0; seen.resends = await pa(() => R.ghosts.resends ?? 0); seen.connected = await pa(() => R.ghosts.connected);
    check(burst.delivered < flushed.n && burst.lastFb?.[0] !== final[0], 'the burst trips the room\'s per-second limit: the final float is among the dropped states', { queued: flushed.n, ...burst, final });
    check(seen.ok, 'B still sees A\'s final float and rod (sent again after GHOSTS.resendMs)', seen);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
