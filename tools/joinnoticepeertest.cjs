// #1333: join / leave notices with two real Ghosts clients through a local Worker (node cloudflare/dev.mjs PORT):
// a join is announced to the other client (not to ourselves), a short disconnect (Alt+Tab) gives no notice, a longer one gives
// "lämnade spelet" only after the grace period. The notice is shown with the real badge() into a #badges element (screenshot).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/joinnoticepeertest.cjs GAME WORKER [SHOTDIR]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8133', worker = 'http://localhost:8793', shots = '/tmp'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 420 } });
  const page = await ctx.newPage(); let bad = 0;
  page.on('pageerror', (e) => { console.log('pageerror', e.message); bad++; });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
  await page.goto(game);
  await page.exposeFunction('__shot', (n) => page.screenshot({ path: `${shots}/${n}.png` }));
  const res = await page.evaluate(async (worker) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { JOIN_NOTICE } = await import('/src/config.js');
    const { badge, setBadgeElement } = await import('/src/stats.js');
    JOIN_NOTICE.graceMs = 4000; JOIN_NOTICE.batchMs = 500;
    document.body.style.background = '#6a7f5a';
    const el = document.createElement('div'); el.id = 'badges'; document.body.append(el); setBadgeElement(el);
    const style = document.createElement('style');
    style.textContent = 'body>*:not(#badges){display:none!important}#badges{z-index:99999;position:fixed;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px}#badges div{background:rgba(20,35,45,.7);color:#fff;padding:5px 12px;border-radius:16px;font:600 14px sans-serif;white-space:nowrap}';
    document.head.append(style);
    const run = { a: true };
    const mk = (name, active, at) => { const s = new T.Scene(), c = new T.PerspectiveCamera(); c.position.set(...at);
      return new Ghosts({ scene: s, camera: c, url: worker, name: () => name, state: () => ({ p: at.map((v, i) => i === 1 ? 0 : v), r: 0 }), score: () => 0, weapon: () => '', active }); };
    const A = mk('Anna', () => run.a, [0, 1.6, 0]), B = mk('Bertil', () => true, [0, 1.6, 3]);
    const notesA = [], notesB = []; A.onNotice = (t) => notesA.push(t);
    const t0 = performance.now(), stamp = () => Math.round(performance.now() - t0);
    B.onNotice = (t) => { notesB.push([stamp(), t]); badge(t, false); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, n = 200) => { for (let i = 0; i < n; i++) { if (f()) return true; await sleep(100); } return false; };
    const loop = setInterval(() => { A.update(); B.update(); }, 50);
    const out = {};
    // B first alone, then A joins
    run.a = false; await until(() => B.connected); await sleep(500); out.noneAlone = notesB.length === 0;
    run.a = true; out.joinSeen = await until(() => notesB.some(([, t]) => t === 'Anna kom in i spelet'), 60);
    out.noSelfNotice = notesA.length === 0;
    await sleep(800); window.__shot1 = true; await window.__shot?.('join');
    // a short Alt+Tab: A drops the connection and is back before the grace period
    const before = notesB.length; run.a = false; A.disconnect(); out.goneBriefly = await until(() => B.others.size === 0, 40);
    await sleep(1500); run.a = true; // (tab hidden for ~2 s, the way update() reconnects when playing again)
    out.backAgain = await until(() => B.others.size === 1, 80);
    await sleep(JOIN_NOTICE.graceMs + 1500); out.shortAbsenceSilent = notesB.length === before;
    // really gone: no reconnect
    run.a = false; A.disconnect(); const gone = stamp();
    out.leaveWaits = !(await until(() => notesB.length > before, 25)); // 2.5 s: still within the grace period
    out.leaveSeen = await until(() => notesB.some(([, t]) => t === 'Anna lämnade spelet'), 60);
    const when = notesB.find(([, t]) => t === 'Anna lämnade spelet')?.[0] - gone; out.leaveDelayMs = when; out.leaveAfterGrace = when >= JOIN_NOTICE.graceMs - 200;
    clearInterval(loop); A.disconnect(); B.disconnect(); out.texts = notesB.map(([, t]) => t).join(' | ');
    return out;
  }, worker);
  console.log(JSON.stringify(res));
  const ok = Object.entries(res).every(([k, v]) => typeof v !== 'boolean' || v) && !bad;
  console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})();
