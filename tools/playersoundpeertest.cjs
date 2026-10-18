// #1302: sounds from other players through a local Worker (node cloudflare/dev.mjs PORT) with real Ghosts clients in one page:
// the bicycle bell (`ghosts.sound('bell')`) reaches the nearby peer, not a far one, once per SOUNDS.every; footsteps and the
// jetpack roar are derived from the peer's state (walking on a circle: steps at the stride cadence; crouched, seated, riding: none;
// jp 2: roar bursts). PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/playersoundpeertest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8792', worker = 'http://localhost:8793'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage(); let bad = 0;
  page.on('pageerror', (e) => { console.log('pageerror', e.message); bad++; });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
  await page.goto(game);
  const res = await page.evaluate(async (worker) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { SOUNDS } = await import('/src/config.js');
    const mk = (name, st, at) => { const s = new T.Scene(), c = new T.PerspectiveCamera(); c.position.set(...at);
      return new Ghosts({ scene: s, camera: c, url: worker, name: () => name, state: () => st.v(), score: () => 0, weapon: () => '' }); };
    const t0 = performance.now();
    const walk = (extra = {}) => { const w = (performance.now() - t0) / 1000 * 0.47; return { p: [3 * Math.cos(w), 0, 3 * Math.sin(w)], r: 0, ...extra }; };
    const sa = { v: () => walk() }, sb = { v: () => ({ p: [0, 0, 5], r: 0 }) }, sc = { v: () => ({ p: [90, 0, 0], r: 0 }) };
    const A = mk('Sender', sa, [0, 1.6, 0]), B = mk('Nära', sb, [0, 1.6, 5]), C = mk('Långt', sc, [90, 1.6, 0]);
    const log = { bell: 0, farBell: 0, steps: 0, jets: 0 };
    B.onPlayerSound = (m) => { if (m.k === 'bell') log.bell++; }; C.onPlayerSound = () => { log.farBell++; };
    B.onStep = () => log.steps++; B.onJet = () => log.jets++;
    const t = setInterval(() => { A.update(); B.update(); C.update(); }, 50);
    const until = async (f, n = 200) => { for (let i = 0; i < n; i++) { if (f()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const peer = () => [...B.others.values()].find((g) => g.name === 'Sender');
    const out = {};
    out.seen = await until(() => peer() && A.connected && C.others.size >= 1);
    out.sentOnce = A.sound('bell'); out.sentTwice = A.sound('bell'); out.badKind = A.sound('boom');
    out.bellNear = await until(() => log.bell === 1, 60);
    await sleep(1500); out.bellFarSilent = log.farBell === 0; out.bellOnce = log.bell === 1;
    await sleep(SOUNDS.every * 1000 + 100); out.sentAgain = A.sound('bell'); out.bellTwo = await until(() => log.bell === 2, 60);
    // footsteps: walking
    log.steps = 0; await sleep(4000); out.stepsWalking = log.steps; out.stepsOk = log.steps >= 3 && log.steps <= 14;
    // crouched, seated, riding, thrusting: none
    for (const [k, extra] of [['crouch', { c: true }], ['seated', { pose: 1 }], ['riding', { bk: 1 }], ['jet', { jp: 2 }]]) {
      sa.v = () => walk(extra); await sleep(1500); log.steps = 0; log.jets = 0; await sleep(3000);
      out['no_steps_' + k] = log.steps === 0;
      if (k === 'jet') out.jetBursts = log.jets;
    }
    out.jetOk = out.jetBursts >= 4 && out.jetBursts <= 14;
    sa.v = () => ({ p: [3, 0, 0], r: 0 }); await sleep(1500); log.steps = 0; await sleep(2000); out.no_steps_standing = log.steps === 0;
    clearInterval(t); A.disconnect?.(); B.disconnect?.(); C.disconnect?.(); return out;
  }, worker);
  console.log(JSON.stringify(res)); const ok = Object.entries(res).every(([k, v]) => typeof v === 'number' || (k === 'sentTwice' || k === 'badKind' ? v === false : v === true)) && !bad;
  console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})();
