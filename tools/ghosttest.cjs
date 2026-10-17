// Other players as ghosts (#666): two headless pages against a local Worker. Start both first:
//   python3 tools/devserve.py 8137 .          node cloudflare/dev.mjs 8146 testtoken
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/ghosttest.cjs http://localhost:8137 http://localhost:8146 testtoken
// Checks: off with ?mp=0 and without the cloud; two players see each other as see-through ghosts with name tags (Olof /
// "Anonym"); a move arrives and is drawn smoothly (interpolated); standing still sends nothing but the heartbeat; the
// Worker's room counts the traffic; a closed tab removes its ghost. Screenshots of a ghost with its tag into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8137', worker = process.argv[3] || 'http://localhost:8146', token = process.argv[4] || 'testtoken';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
const room = async () => (await fetch(`${worker}/admin/players`, { headers: { Authorization: `Bearer ${token}` } })).json();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (name, query) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } }); // small: SwiftShader frames take seconds at 960 × 600
    await ctx.addInitScript((n) => { if (n) localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('pageerror', (e) => console.log(`  [${name || 'anon'} pageerror] ${e.message}`));
    await page.goto(`${game}/?${query}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ghosts && window.__app?.renderer, null, { timeout: 1500000 });
    await page.evaluate(() => { const g = window.__ghosts, m = g.message.bind(g); g._log = []; g.message = (d) => { g._log.push(String(d).slice(0, 120)); if (g._log.length > 12) g._log.shift(); return m(d); };
      const ws = g.ws; g._sent = []; const send = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { g._sent.push(String(d).slice(0, 100)); if (g._sent.length > 8) g._sent.shift(); return send.call(this, d); }; });
    return { ctx, page };
  };
  try {
    // off: ?mp=0, and without &cloud
    if (!process.env.QUICK) {
      const { ctx, page } = await open('', `shot&mp=0&cloud=${worker}`);
      await sleep(1500);
      check(await page.evaluate(() => window.__ghosts.on === false && !window.__ghosts.ws), '?mp=0: no ghosts, no socket');
      await ctx.close();
      const b = await open('', 'shot');
      check(await b.page.evaluate(() => window.__ghosts.on === false), 'no cloud: ghosts off');
      await b.ctx.close();
    }
    const before = await room();
    // A (Olof) at the patio door looking north-east; B (no name) 2.5 m in front of A, facing A
    const A = await open('Olof', `shot&quality=0&cloud=${worker}&at=1.0,11.8,-40,0`);
    await A.page.evaluate(() => window.__app.renderer.setAnimationLoop(null)); // (A's frames would starve B's loading under SwiftShader)
    const B = await open('', `shot&quality=0&cloud=${worker}&at=2.6,9.9,140,0`);
    await A.page.evaluate(() => window.__app.renderer.setAnimationLoop(() => window.__app.frame(0.016)));
    // both stood still while the other page loaded (> GHOSTS.idleMs under SwiftShader): a small turn brings them back
    // (each poll turns both a little, back and forth, so neither counts as idle while the other catches up)
    let wiggle = 0.05;
    const nudge = async () => { wiggle = -wiggle; for (const p of [A.page, B.page]) await p.evaluate((w) => { window.__app.camera.rotation.y += w; window.__ghosts.update(); }, wiggle).catch(() => {}); };
    const seen = (p, name) => until(async () => { await nudge(); return p.evaluate((n) => { const l = window.__ghosts.list(); return l.length === 1 && l[0].name === n && l[0].visible ? l[0] : null; }, name); }, 600000); // (the first frame with an avatar compiles the skinned program: minutes under SwiftShader when the machine is busy)
    const ga = await seen(A.page, 'Anonym'), gb = await seen(B.page, 'Olof');
    const diag = (p) => p.evaluate(() => { const g = window.__ghosts; return JSON.stringify({ on: g.on, url: g.url, ws: g.ws?.readyState, me: g.me, connects: g.connects, retryIn: Math.round(g.retryAt - performance.now()), others: g.list(), overlay: document.getElementById('overlay').hidden, lastMove: Math.round(performance.now() - g.lastMove), log: g._log, sent: g._sent, frame: window.__app.renderer.info.render.frame, rot: window.__app.camera.rotation.y, now: Math.round(performance.now()), vis: document.visibilityState }); }).catch((e) => e.message);
    if (!ga || !gb) console.log('  A:', await diag(A.page), '\n  B:', await diag(B.page));
    check(!!ga, 'A sees B as a ghost tagged "Anonym"', JSON.stringify(ga));
    check(!!gb, 'B sees A as a ghost tagged "Olof"', JSON.stringify(gb));
    check(ga?.outline === false && ga?.opacity === 1 && ga?.tag, 'the ghost is solid (#1025) and its tag shows near');
    const info = await A.page.evaluate(() => { const g = [...window.__ghosts.others.values()][0]; return { shadow: g.mesh.castShadow, calls: g.root.children.length, skinned: g.mesh.isSkinnedMesh, score:g.score,scale:g.tag.scale.toArray(),tagTex: g.tag.material.map.image.width + 'x' + g.tag.material.map.image.height }; });
    check(info.scale[0]<.8&&info.scale[1]<.2&&Number.isInteger(info.score),'smaller name/score badge (#672)',JSON.stringify(info));
    check(info.shadow === false && info.skinned && info.tagTex === '256x64', 'no shadow, one skinned avatar mesh + one 256×64 tag sprite', JSON.stringify(info));
    const bPos = await B.page.evaluate(() => [window.__app.player.pos.x, window.__app.player.pos.y, window.__app.player.pos.z]);
    check(Math.hypot(ga.pos[0] - bPos[0], ga.pos[2] - bPos[2]) < 0.05 && Math.abs(ga.pos[1] - bPos[1]) < 0.05, 'the ghost stands where B is', `${ga.pos} vs ${bPos.map((v) => v.toFixed(2))}`);
    for (const [p, file] of [[A.page, 'ghost-A-sees-anonym'], [B.page, 'ghost-B-sees-olof']]) { // a bigger frame for the screenshot
      await p.setViewportSize({ width: 960, height: 600 });
      const f0 = await p.evaluate(() => window.__app.renderer.info.render.frame);
      await until(() => p.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, f0), 120000);
      await p.screenshot({ path: `${shots}/${file}.png`, timeout: 240000 });
      await p.setViewportSize({ width: 320, height: 200 });
    }
    check(!!(await seen(A.page, 'Anonym')) && !!(await seen(B.page, 'Olof')), 'still connected after the screenshots');
    // standing still: nothing but heartbeats
    const m0 = await B.page.evaluate(() => window.__ghosts.messages);
    await sleep(4000);
    const m1 = await B.page.evaluate(() => window.__ghosts.messages);
    check(m1 === m0, 'standing still sends no states', `${m0} → ${m1}`);
    // a move: B walks 1 m east in 1 s. SwiftShader frames take seconds, so both pages drive ghosts.update() themselves
    // every 50 ms here (as frames at 20 fps would): B sends ≤ 5 states, A's ghost passes through in-between positions
    for (const p of [A.page, B.page]) await p.evaluate(() => window.__app.renderer.setAnimationLoop(null)); // (no slow frames in between)
    const [sent, samples] = await Promise.all([
      B.page.evaluate(async () => { const g = window.__ghosts, p = window.__app.player.pos, n0 = g.messages;
        for (let i = 0; i < 20; i++) { p.x += 0.05; g.update(); await new Promise((r) => setTimeout(r, 50)); }
        for (let i = 0; i < 6; i++) { g.update(); await new Promise((r) => setTimeout(r, 50)); } // the last change goes out
        return g.messages - n0; }),
      A.page.evaluate(async () => { const g = window.__ghosts, xs = [];
        for (let i = 0; i < 80; i++) { g.update(); xs.push(g.list()[0]?.pos[0]); await new Promise((r) => setTimeout(r, 50)); }
        return xs; }),
    ]);
    for (const p of [A.page, B.page]) await p.evaluate(() => window.__app.renderer.setAnimationLoop(() => window.__app.frame(0.016)));
    const moved = await until(() => A.page.evaluate(() => { window.__ghosts.update(); return window.__ghosts.list()[0]?.pos; }).then((l) => (l && Math.abs(l[0] - (bPos[0] + 1)) < 0.03 ? l : null)), 20000);
    check(!!moved, 'A sees B arrive 1 m east', JSON.stringify(moved));
    const xs = samples.filter((x) => typeof x === 'number'), mid = new Set(xs.filter((x) => x > bPos[0] + 0.02 && x < bPos[0] + 0.98)).size;
    check(sent >= 3 && sent <= 7, 'a 1 s walk is ~5 states (≤ 5 Hz, only on change)', `${sent} states`);
    check(mid >= 8 && xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-6), 'A draws it smoothly: many in-between positions, never backwards', `${mid} distinct in-between x`);
    const r = await room();
    if (r.players !== 2) console.log('  A:', await diag(A.page), '\n  B:', await diag(B.page));
    check(r.players === 2 && r.billed > before.billed, 'the room counts 2 players and the traffic', JSON.stringify(r));
    // #673: greeting. B steps 1.6 m in front of A; A looks at B: "hälsa på Anonym"; E greets: A says a line, B sees A's
    // avatar wave with the line in a bubble over it; once per player and session for points, not more often than greetEvery
    await B.page.evaluate(async () => { const g = window.__ghosts, p = window.__app.player.pos; p.x = 2.03; p.z = 10.57; for (let i = 0; i < 6; i++) { g.update(); await new Promise((r) => setTimeout(r, 220)); } });
    await until(() => A.page.evaluate(() => { window.__ghosts.update(); const q = window.__ghosts.list()[0]?.pos; return q && Math.abs(q[0] - 2.03) < 0.03 && Math.abs(q[2] - 10.57) < 0.03; }), 30000);
    const focus = await A.page.evaluate(() => { window.__app.touch.enabled = true; /* (focus runs while playing: pointer lock or touch, as on a phone) */ window.__app.camera.rotation.set(0, -40 * Math.PI / 180, 0, 'YXZ'); window.__app.frame(0.016); window.__app.frame(0.016); /* (the first frame after switching to touch sets the touch HUD up) */ const f = window.__app.focus().focused; return f ? { kind: f.kind, name: f.name, verb: f.verb } : null; });
    const fdiag = focus ? '' : await A.page.evaluate(() => { const app = window.__app, g = window.__ghosts, c = app.camera; const t = g.targets(); const r = new c.position.constructor(0, 0, -1).applyQuaternion(c.quaternion);
      const ray = new (Object.getPrototypeOf(app.focus().raycaster).constructor)(c.position.clone(), r, 0, 5); const hits = ray.intersectObjects(t, false).map((h) => +h.distance.toFixed(2));
      return JSON.stringify({ cam: c.position.toArray().map((x) => +x.toFixed(2)), touch: app.touch.enabled, targets: t.length, list: g.list().map((x) => x.pos), hits, active: app.activeMode, fall: !!app.fall?.active, rest: !!app.rest?.active, drawing: !!app.drawing?.active, overlay: document.getElementById("overlay").hidden, focusNow: (() => { app.frame(0.016); const f = app.focus().focused; return f ? f.kind + ":" + f.name : null; })() }); });
    check(focus?.kind === 'ghost' && focus.name === 'Anonym' && focus.verb === 'hälsa på', 'looking at B within reach: "hälsa på Anonym"', JSON.stringify(focus) + ' ' + fdiag);
    if (!focus) throw new Error('no focus');
    const g0 = await A.page.evaluate(() => window.__app.stats.greets ?? 0);
    const said = await A.page.evaluate(() => { window.__app.use(window.__app.focus().focused); const el = window.__app.greet.mine; return el.hidden ? null : el.textContent; });
    check(!!said && /Anonym|Hej hej|Tjenare/.test(said), 'A says a greeting at the bottom', said);
    await A.page.evaluate(() => { window.__app.touch.enabled = false; });
    const again = await A.page.evaluate(() => { const f = [...window.__ghosts.others.values()][0].door; window.__app.use(f); return window.__ghosts.greetAt; });
    const g1 = await A.page.evaluate(() => window.__app.stats.greets ?? 0);
    check(g1 - g0 === 1, 'points once per player and session (a second greeting within greetEvery is not even sent)', `${g0} → ${g1}`);
    await until(async () => { await A.page.evaluate(() => { window.__ghosts.update(); window.__ghosts.sendShot(); }); return B.page.evaluate(() => window.__ghosts.greetsSeen === 1); }, 30000);
    const onB = await B.page.evaluate(() => { const g = [...window.__ghosts.others.values()][0]; g.draw(performance.now(), window.__app.camera.position); window.__app.greet.update(0.016);
      const b = window.__app.greet.bubbles[0]; return { waveT: +g.waveT.toFixed(2), hand: +(g.avatar.hand('R').y - g.root.position.y).toFixed(2), bubble: b?.el.textContent ?? null }; });
    check(onB.waveT > 0 && onB.bubble && (/Hej|Tjen|Hallå/.test(onB.bubble)), 'B sees A wave, the line in a bubble over A', JSON.stringify(onB));
    // B's view of the wave: a few frames by hand (the arm going up), then the screenshot
    await B.page.setViewportSize({ width: 960, height: 600 });
    const fw = await B.page.evaluate(() => window.__app.renderer.info.render.frame);
    await until(() => B.page.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, fw), 180000); // (the resize lands in a frame)
    await seen(B.page, 'Olof'); // (back in the room if the resize or the wait let it go)
    await B.page.evaluate(() => { window.__app.renderer.setAnimationLoop(null); [...window.__ghosts.others.values()][0].wave(); /* the wave once more for frozen frames: SwiftShader frames take longer than GHOSTS.wave */ window.__app.camera.rotation.set(0, 140 * Math.PI / 180, 0, 'YXZ'); for (let i = 0; i < 6; i++) window.__app.frame(0.05); });
    const armUp = await B.page.evaluate(() => { const g = [...window.__ghosts.others.values()][0]; g.avatar.object.updateMatrixWorld(true); return +(g.avatar.hand('R').y - g.root.position.y).toFixed(2); }); // the right hand's height over the feet (m)
    await B.page.screenshot({ path: `${shots}/ghost-greeting-wave.png`, timeout: 240000 });
    await B.page.evaluate(() => window.__app.renderer.setAnimationLoop(() => window.__app.frame(0.016)));
    await B.page.setViewportSize({ width: 320, height: 200 });
    check(armUp > 1.5, 'the arm is up in B\'s screenshot', String(armUp));
    // B closes its tab: A's ghost goes
    await B.ctx.close();
    check(!!(await until(() => A.page.evaluate(() => window.__ghosts.list().length === 0), 30000)), 'B closed the tab: its ghost is gone on A');
    // hidden tab disconnects
    await A.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(!!(await until(async () => (await room()).players === 0, 20000)), 'a hidden tab disconnects');
    await A.ctx.close();
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
