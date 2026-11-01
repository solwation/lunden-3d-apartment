// #1763: the squirrel leader's 'sq' snapshots must not starve its own player state. Two real clients against the local Worker:
//   python3 tools/devserve.py 8190 .      node cloudflare/dev.mjs 8801 testtoken
//   tools/browsertest.sh node tools/squirrelratetest.cjs http://localhost:8190 http://localhost:8801 [OUT_DIR] [seconds] [before]
// A (the first near the squirrels) leads and walks a circle near them, B follows next to A. Measured: A's messages per second by
// type, the largest gap between A's state messages and between their arrival at B (5 Hz = 200 ms; the issue allows ~400 ms extra),
// and how often A's sending would pass the room's per-connection limit (PLAYERS.perSecond, the room's own window rule replayed on
// A's send times). Checks: the state gap at B stays within 200 + 400 ms, the room limit is never passed, squirrel snapshots still
// reach B (B follows).
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8190', worker = 'http://localhost:8801', out = '/tmp/squirrelrate', secs = '20', mode = ''] = process.argv.slice(2); // mode 'before': GHOSTS.stateEvery = Infinity at A, the sending order before #1763 fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app, S = a.squirrels; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true;
  window.T = { a, S, sends: [], states: [], frames: [],
    async pump(ms, walk = null, dt = 0.05) {
      const end = performance.now() + ms;
      while (performance.now() < end) {
        if (walk) { walk.ang += dt * 1.4 / walk.r; a.player.spawn(walk.x + Math.cos(walk.ang) * walk.r, walk.z + Math.sin(walk.ang) * walk.r, -walk.ang); }
        a.step(dt); __ghosts.update(dt); T.frames.push(performance.now()); await new Promise((r) => setTimeout(r, 50));
      }
    },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    tap() { // A: every message sent, by type and time
      const ws = __ghosts.ws, send = ws.send.bind(ws);
      ws.send = (d) => { let k = 'p'; if (d !== 'p') { const m = JSON.parse(d); k = m.t ? (m.t === 'sq' ? `sq.${m.k}` : m.t) : 'state'; } T.sends.push([performance.now(), k]); send(d); };
    },
    listen(id) { // B: arrival times of A's states
      const message = __ghosts.message.bind(__ghosts);
      __ghosts.message = (d) => { if (d !== 'q') { try { const m = JSON.parse(d); if (m.t === 's' && m.i === id) T.states.push(performance.now()); } catch {} } message(d); };
    },
    info() { return { lead: S.sync.lead, follow: S.sync.follow, near: S.sync.near, n: S.sync.n, sent: S.sync.sent, me: __ghosts.me }; } };
};
const gaps = (ts) => ts.slice(1).map((t, i) => t - ts[i]);
const pct = (v, p) => { const s = [...v].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : null; };
/** The room's window rule (cloudflare/players.js webSocketMessage): a window opens at the first message ≥ 1 s after the last opening. */
const roomOver = (ts, perSecond = 6) => { let w = -1e9, c = 0, over = 0; for (const t of ts) { if (t - w >= 1000) { w = t; c = 0; } if (++c > perSecond) over++; } return over; };
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=1.0,11.8,-40,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.squirrels && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x);
    const spot = await pa(() => { const b = T.S.animals[0].brain, t = T.S.trees[b.tree]; return { x: t.x + 12, z: t.z + 2 }; });
    await pa(({ x, z }) => T.stand(x, z), spot); await pa(() => T.pump(1500));
    await pb(({ x, z }) => T.stand(x - 6, z + 3), spot);
    await Promise.all([pa(() => T.pump(4000)), pb(() => T.pump(4000))]);
    const roles = [await pa(() => T.info()), await pb(() => T.info())];
    check(roles[0].lead && roles[0].n === 1 && !roles[1].lead, 'A leads, B follows', roles);
    if (mode === 'before') await pa(async () => { (await import('/src/config.js')).GHOSTS.stateEvery = Infinity; });
    await pa(() => T.tap()); await pb((id) => T.listen(id), roles[0].me);
    const ms = Number(secs) * 1000, walk = { x: spot.x, z: spot.z, r: 4, ang: 0 };
    const snap0 = await pb(() => T.S.sync.lastSnap);
    await Promise.all([pa(({ ms, walk }) => T.pump(ms, walk), { ms, walk }), pb((ms) => T.pump(ms), ms)]);
    await pa(() => { T.frames = T.frames.filter((t) => t >= T.sends[0]?.[0]); });
    const frames = gaps(await pa(() => T.frames)), sends = await pa(() => T.sends), arrive = await pb(() => T.states), fol = await pb(() => ({ ...T.info(), lastSnap: T.S.sync.lastSnap, t: T.S.sync.t }));
    const span = (sends.at(-1)[0] - sends[0][0]) / 1000, by = {};
    for (const [, k] of sends) by[k] = (by[k] ?? 0) + 1;
    const rate = Object.fromEntries(Object.entries(by).map(([k, n]) => [k, Math.round(n / span * 100) / 100]));
    const st = sends.filter(([, k]) => k === 'state').map(([t]) => t), sg = gaps(st), ag = gaps(arrive);
    const res = { seconds: Math.round(span * 10) / 10, total: Math.round(sends.length / span * 100) / 100, rate,
      stateGapSent: { p50: pct(sg, 0.5), p95: pct(sg, 0.95), max: Math.round(Math.max(...sg)) }, stateGapAtB: { n: arrive.length, p50: pct(ag, 0.5), p95: pct(ag, 0.95), max: Math.round(Math.max(...ag)) },
      frameMs: { p50: pct(frames, 0.5), p95: pct(frames, 0.95) }, roomOver: roomOver(sends.map(([t]) => t)) };
    console.log('TRAFFIC', JSON.stringify(res));
    { const i = sg.indexOf(Math.max(...sg)), t0 = st[i]; console.log('AROUND MAX', JSON.stringify(sends.filter(([t]) => t >= t0 - 500 && t <= t0 + 1300).map(([t, k]) => [Math.round(t - t0), k]))); }
    fs.writeFileSync(`${out}/traffic.json`, JSON.stringify(res, null, 2));
    check(res.stateGapAtB.max <= 200 + 400 + 150, 'A\'s states reach B with at most ~400 ms extra delay (max gap ≤ 750 ms incl. jitter)', res.stateGapAtB);
    check(res.roomOver === 0, 'A never passes the room\'s per-second limit', res.roomOver);
    check(fol.follow && fol.lastSnap > snap0 && (rate['sq.s'] ?? 0) >= 1, 'squirrel snapshots still reach B (B follows)', fol);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
