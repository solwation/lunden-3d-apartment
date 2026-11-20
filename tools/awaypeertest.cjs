// #2216: away presence with two real Ghosts clients through a local Worker (LUNDEN_AWAY_MS=6000 node cloudflare/dev.mjs PORT):
// A hides the tab (the socket closes at once); B still sees A's figure where it stood, marked away (looking down at the phone);
// A comes back within the time under the same id with no notice and no second figure; hidden again for good, B gets
// "Anna lämnade spelet" right after the (shortened) away time. Screenshots: B's view of the away figure, after the return, the notice.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/awaypeertest.cjs GAME WORKER AWAY_MS [SHOTDIR]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8270', worker = 'http://localhost:8271', awayMs = '6000', shots = '/tmp'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 480 } });
  const page = await ctx.newPage(); let bad = 0;
  page.on('pageerror', (e) => { console.log('pageerror', e.message); bad++; });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
  await page.goto(game);
  await page.exposeFunction('__snap', (n) => page.screenshot({ path: `${shots}/${n}.png`, timeout: 120000 }));
  const res = await page.evaluate(async ([worker, awayMs]) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { JOIN_NOTICE } = await import('/src/config.js');
    const { badge, setBadgeElement } = await import('/src/stats.js');
    JOIN_NOTICE.graceMs = 4000; JOIN_NOTICE.batchMs = 500; // (the old client-side grace: an away leave must not wait for it again)
    const el = document.createElement('div'); el.id = 'badges'; document.body.append(el); setBadgeElement(el);
    const style = document.createElement('style');
    style.textContent = 'body>*:not(#badges):not(#view){display:none!important}#view{position:fixed;inset:0}#badges{z-index:99999;position:fixed;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px}#badges div{background:rgba(20,35,45,.7);color:#fff;padding:5px 12px;border-radius:16px;font:600 14px sans-serif;white-space:nowrap}';
    document.head.append(style);
    const run = { a: false };
    const mk = (name, active, at, r) => { const s = new T.Scene(), c = new T.PerspectiveCamera(35, 640 / 480, 0.05, 100); c.position.set(...at);
      const g = new Ghosts({ scene: s, camera: c, url: worker, name: () => name, state: () => ({ p: at.map((v, i) => i === 1 ? 0 : v), r }), score: () => 0, weapon: () => '', active });
      return Object.assign(g, { scene: s, cam: c }); };
    const A = mk('Anna', () => run.a, [0, 1.6, 0], Math.PI), B = mk('Bertil', () => true, [0, 1.6, 3.2], 0);
    A.awayTok = 'annatab00000001'; B.awayTok = 'bertiltab000001'; // (two tabs: each has its own sessionStorage token)
    // B's view, rendered: A's figure in front of B
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(640, 480); renderer.domElement.id = 'view'; document.body.append(renderer.domElement);
    B.scene.background = new T.Color(0x9fb3a0); B.scene.add(new T.HemisphereLight(0xffffff, 0x6a6050, 1.8));
    const sun = new T.DirectionalLight(0xfff2e0, 2); sun.position.set(2, 4, 3); B.scene.add(sun);
    B.cam.lookAt(0, 1.05, 0);
    const notesB = [], t0 = performance.now(), stamp = () => Math.round(performance.now() - t0);
    B.onNotice = (t) => { notesB.push([stamp(), t]); badge(t, false); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, n = 200) => { for (let i = 0; i < n; i++) { if (f()) return true; await sleep(100); } return false; };
    const loop = setInterval(() => { A.update(); B.update(); }, 50);
    window.__shot = async (n) => { renderer.render(B.scene, B.cam); await window.__snap(n); }; // (rendered only for a shot: SwiftShader is slow)
    const anna = () => B.list().find((g) => g.name === 'Anna');
    const out = {};
    await until(() => B.connected); run.a = true;
    out.joinSeen = await until(() => notesB.some(([, t]) => t === 'Anna kom in i spelet'), 60);
    await until(() => anna()?.visible, 40); await sleep(800);
    const id = A.me; out.annaId = id;
    // 1) A hides the tab: the socket closes at once, B keeps the figure, away
    run.a = false; A.disconnect(); const hid = stamp();
    out.aSocketClosed = A.ws === null;
    out.awaySeen = await until(() => anna()?.away === true, 30);
    await sleep(1200); // the phone pose eases in
    const g = B.others.get(id);
    out.stillOneFigure = B.others.size === 1 && !!g && g.root.visible;
    out.phonePose = (g?.typeW ?? 0) > 0.9; out.typeW = Math.round((g?.typeW ?? 0) * 100) / 100;
    out.noNoticeWhileAway = notesB.length === 1;
    await window.__shot('away-b-view');
    // 2) back within the time: the same id, away cleared, no notice, no second figure
    run.a = true;
    out.backSameId = await until(() => A.me === id, 60);
    out.awayCleared = await until(() => anna()?.away === false, 30);
    await sleep(1500);
    out.backOneFigure = B.others.size === 1 && B.others.has(id);
    out.typeWBack = Math.round((B.others.get(id)?.typeW ?? 0) * 100) / 100; out.poseGone = out.typeWBack < 0.1;
    await window.__shot('back-b-view');
    await sleep(Number(awayMs) + 1000); out.returnSilent = notesB.length === 1 && B.others.size === 1;
    // 3) hidden for good: away until the time is up, then the leave notice at once
    run.a = false; A.disconnect(); const gone = stamp();
    out.awayAgain = await until(() => anna()?.away === true, 30);
    out.stillThereBeforeTime = !(await until(() => B.others.size === 0, (Number(awayMs) - 1500) / 100));
    out.leaveSeen = await until(() => notesB.some(([, t]) => t === 'Anna lämnade spelet'), 120);
    const when = notesB.find(([, t]) => t === 'Anna lämnade spelet')?.[0] - gone; out.leaveDelayMs = when;
    out.leaveAfterAway = when >= Number(awayMs) - 300;
    out.leaveNotDoubleWaited = when < Number(awayMs) + JOIN_NOTICE.graceMs - 500; // announced at once, not after another client grace
    out.figureGone = B.others.size === 0;
    await sleep(300); await window.__shot('left-notice-b-view');
    clearInterval(loop); A.disconnect(); B.disconnect(); out.texts = notesB.map(([, t]) => t).join(' | '); out.hidAt = hid;
    return out;
  }, [worker, awayMs]);
  console.log(JSON.stringify(res));
  const ok = Object.entries(res).every(([k, v]) => typeof v !== 'boolean' || v) && !bad;
  console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})();
