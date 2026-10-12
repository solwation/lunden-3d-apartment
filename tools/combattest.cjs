// Combat between players (#667): three headless pages against a local Worker. Start both first:
//   python3 tools/devserve.py 8137 .          node cloudflare/dev.mjs 8146 testtoken
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/combattest.cjs http://localhost:8137 http://localhost:8146 testtoken
// A (Olof) and B (no name) stand 2.5 m apart facing each other, C (Tuva) watches. Checks: unarmed B is a ghost and cannot be
// hit; armed A and B (and C) are drawn solid for each other, the hearts show only then; each hit gives A points and B a
// deduction and a life less; out of lives B is back at the start with all lives, still holding its weapon and keeping its
// score. Screenshot (C's view) of two solid armed players into SHOTS. SwiftShader frames take seconds: the pages drive
// ghosts / combat updates themselves where timing matters.
const kit = require('./testkit.cjs'); // (#703) `&test` mode, small viewport; full quality only around the screenshots
const { chromium } = kit;
const game = process.argv[2] || 'http://localhost:8137', worker = process.argv[3] || 'http://localhost:8146';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log(`  … +${Math.round((Date.now() - T0) / 1000)}s ${msg}`); // progress, so a slow run is never silent
const TOTAL = Number(process.env.TOTAL_MIN || 90) * 60000; // a hard stop for the whole run
setTimeout(() => { console.log(`FAIL total timeout ${TOTAL / 60000} min\nSOME FAILED`); process.exit(2); }, TOTAL).unref();
async function until(fn, ms = 60000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (name, at) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
    await ctx.addInitScript((n) => { if (n) localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    // (#721) every socket close with its code, so a dropped connection says who closed it (1000: our idle / hidden; 40xx: the room)
    await ctx.addInitScript((n) => { const W = window.WebSocket; window.WebSocket = class extends W { constructor(...a) { super(...a); const t0 = Date.now();
      this.addEventListener('close', (e) => console.log(`[ws ${n}] closed ${e.code} ${e.reason} after ${Math.round((Date.now() - t0) / 1000)} s`)); } }; }, name || 'anon');
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.text().startsWith('[ws ')) console.log(`  +${Math.round((Date.now() - T0) / 1000)}s ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    page.on('pageerror', (e) => console.log(`  [${name || 'anon'} pageerror] ${e.message}`));
    await page.goto(`${game}/?shot&test&quality=0&cloud=${worker}&at=${at}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__combat && window.__app?.renderer, null, { timeout: 1500000 });
    return { ctx, page };
  };
  try {
    step('loading three pages, one after another');
    const A = await open('Olof', '1.0,11.8,-40,0'), B = await open('', '2.6,9.9,140,0'), C = await open('Tuva', '4.9,10.2,97,-5'); // one at a time: three loading at once starve each other under SwiftShader
    const pages = [A.page, B.page, C.page];
    let wiggle = 0.05;
    let nudgeErr = 0;
    const nudge = async () => { wiggle = -wiggle; for (const p of pages) await p.evaluate((w) => { window.__app.camera.rotation.y += w; window.__ghosts.update(); window.__combat.update(0); }, wiggle).catch((e) => { if (nudgeErr++ < 3) console.log('  nudge error:', e.message); }); };
    const view = (p) => p.evaluate(() => window.__ghosts.list().map((g) => ({ n: g.name, h: g.h, solid: g.solid, op: g.opacity })));
    const sees = (p, test, ms = 600000) => until(async () => { await nudge(); const l = await view(p); return test(l) ? l : null; }, ms);
    // (#721) A shoots only at a foe it has drawn (combat.foes()). A pause longer than GHOSTS.idleMs (a slow screenshot under
    // load) disconnects the still pages; B can see A again before A has B's first state, so wait until both have the other.
    const foe = (p, n) => p.evaluate((name) => window.__ghosts.connected && window.__combat.foes().some((g) => g.name === name), n);
    // (#721) A and B keep moving a little while C's screenshot renders: a reconnect would start B with full lives again
    // (Combat.reset) and lose the bow's hit
    const keepAlive = (ps) => { let on = true; const run = (async () => { while (on) { await sleep(5000); wiggle = -wiggle; for (const p of ps) if (on) await p.evaluate((w) => { window.__app.camera.rotation.y += w; window.__ghosts.update(); }, wiggle).catch(() => {}); } })(); return () => { on = false; return run; }; }; // (one sign per round for all: the views swing back and forth, never drift)
    const ready = async () => { const ok = await until(async () => { await nudge(); return (await foe(A.page, 'Anonym')) && (await foe(B.page, 'Olof')); }, 600000);
      if (!ok) console.log('  not ready:', await A.page.evaluate(() => JSON.stringify({ conn: window.__ghosts.connected, foes: window.__combat.foes().length, list: window.__ghosts.list() }))); return ok; };
    step('pages loaded; waiting for A and B to see each other');
    const t1 = Date.now(), aB = await sees(A.page, (l) => l.some((g) => g.n === 'Anonym'), 1800000), t2 = Date.now(), bA = await sees(B.page, (l) => l.some((g) => g.n === 'Olof'));
    check(!!aB && !!bA, 'A and B connected and see each other', `${Math.round((t2 - t1) / 1000)} s + ${Math.round((Date.now() - t2) / 1000)} s; A: ${JSON.stringify(await view(A.page))} B: ${JSON.stringify(await view(B.page))} A state: ${await A.page.evaluate(() => { const g = window.__ghosts, t = performance.now(); return JSON.stringify({ conn: g.connected, ws: g.ws?.readyState ?? null, me: g.me, connects: g.connects, retryIn: Math.round(g.retryAt - t), still: Math.round(t - g.lastMove), backoff: g.backoff, overlay: document.getElementById('overlay').hidden }); })}`);
    step('A takes a blaster');
    // A takes a blaster; B has nothing: B stays a ghost and cannot be hit
    await A.page.evaluate(() => window.__app.toys.blasters[0].take());
    const aSeesB = await sees(A.page, (l) => l.some((g) => g.n === 'Anonym' && !g.solid));
    const bSeesA = await sees(B.page, (l) => l.some((g) => g.n === 'Olof' && g.h === 'nerf' && !g.solid));
    check(!!aSeesB && !!bSeesA, 'armed A and unarmed B see each other as ghosts (B sees A carry the blaster)', JSON.stringify(bSeesA));
    const fire = () => A.page.evaluate(() => { const b = window.__app.heldItem(); b.cool = 0; window.__app.click(0); return window.__ghosts.pendingShot || window.__ghosts.shots; });
    const aimed = await A.page.evaluate(() => { window.__app.heldItem().cool = 0; window.__app.click(0); return window.__ghosts.shots; });
    await sleep(3000);
    check(aimed === 0 && (await B.page.evaluate(() => window.__combat.hurts)) === 0, 'an unarmed player cannot be hit (no shot even sent)');
    check(await B.page.evaluate(() => document.getElementById('lives').hidden), 'no hearts without a fight');
    check(await B.page.evaluate(() => window.__combat.seen === 0), 'unarmed B is shown no shots');
    step('B takes the saber, C a wand');
    // B takes the lightsaber, C a wand: all solid for each other
    await B.page.evaluate(() => window.__app.saber.take());
    await C.page.evaluate(() => window.__app.toys.wands[0].take());
    check(!!(await sees(A.page, (l) => l.length === 2 && l.every((g) => g.solid && g.op === 1))), 'A sees B (saber) and C (wand) fully visible');
    check(!!(await sees(B.page, (l) => l.find((g) => g.n === 'Olof')?.solid)), 'B sees A fully visible');
    check(!!(await sees(C.page, (l) => l.length === 2 && l.every((g) => g.solid))), 'C sees both fully visible');
    check(await B.page.evaluate(() => { window.__combat.update(0); const e = document.getElementById('lives'); return !e.hidden && e.textContent.includes('10/10'); }), 'the hearts show during the fight (10/10)');
    step('A misses with a dart');
    // the others' shots (#667): a miss from A (turned away) flies on B's screen the way it flew for A
    const shotSeen = (n) => until(async () => { await A.page.evaluate(() => { window.__ghosts.update(); window.__ghosts.sendShot(); }); return B.page.evaluate((k) => { window.__ghosts.update(); return window.__combat.seen >= k ? window.__combat.lastSeen : null; }, n); }, 180000);
    const miss = await A.page.evaluate(() => { const app = window.__app; app.camera.rotation.y += 0.5; app.heldItem().cool = 0; app.click(0); app.camera.rotation.y -= 0.5;
      const L = app.toys.darts.list, d = L[(app.toys.darts.next - 1) % L.length]; return { shot: window.__combat.lastShot, from: d.from.toArray(), v: d.v.toArray() }; });
    const seenMiss = await shotSeen(1);
    const close = (a, b, e) => a && b && a.every((x, i) => Math.abs(x - b[i]) <= e);
    const vn = Math.hypot(...miss.v), dartDir = miss.v.map((x) => x / vn);
    check(!!seenMiss && seenMiss.w === 'nerf' && miss.shot.to === null && close(seenMiss.o, miss.from, 0.01) && close(seenMiss.d, dartDir, 0.002) && Math.abs(seenMiss.s - vn) < 0.02,
      'B sees A\'s missed dart start where A\'s did, same direction and speed', JSON.stringify({ seenMiss, a: { from: miss.from, d: dartDir, s: vn } }));
    const remoteDart = await B.page.evaluate(() => { const L = window.__app.toys.darts.list, d = L.find((x) => x.remote); return d ? { visible: d.g.visible, pos: d.g.position.toArray() } : null; });
    check(remoteDart?.visible, 'a dart from the blasters\' own pool flies on B\'s screen (drawn only)', JSON.stringify(remoteDart));
    check(await B.page.evaluate(() => window.__combat.hurts === 0 && window.__app.toys.darts.fired === 0), 'a miss hurts nobody; the other\'s dart is not B\'s own (not counted)');
    step('A throws the ball');
    // a thrown ball (a miss past B, so it stays in view): B's screenshot with A's ball in the air
    await A.page.evaluate(() => { const app = window.__app; app.heldItem().putBack(); app.ball.take(); });
    await sees(B.page, (l) => l.find((g) => g.n === 'Olof')?.h === 'ball');
    // B's frames are driven by hand from here to the screenshot (a SwiftShader frame takes seconds, the ball ~0.3 s to fly by)
    await B.page.evaluate(() => window.__app.testMode.setFull(true)); // full quality only for the picture (#703)
    await B.page.setViewportSize({ width: 960, height: 600 });
    const fb = await B.page.evaluate(() => window.__app.renderer.info.render.frame);
    await until(() => B.page.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, fb), 180000);
    await B.page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    await ready(); // (B's frames above can take minutes)
    await A.page.evaluate(() => { const app = window.__app; app.camera.rotation.y += 0.3; app.camera.rotation.x = 0.15; app.ball.cool = 0; app.click(0); app.camera.rotation.y -= 0.3; app.camera.rotation.x = 0; });
    const seenBall = await shotSeen(2);
    check(seenBall?.w === 'ball' && seenBall.s > 1, 'B sees A\'s ball thrown on its arc', JSON.stringify(seenBall));
    await B.page.evaluate(() => { for (let i = 0; i < 3; i++) window.__app.frame(0.05); }); // 0.15 s of its flight
    const ballOnB = await B.page.evaluate(() => window.__combat.balls.filter((b) => b.m.visible).map((b) => { const c = b.m.position.clone().project(window.__app.camera);
      return { pos: b.m.position.toArray().map((x) => +x.toFixed(2)), ndc: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(3)], layer: b.m.layers.mask, flying: b.flying, life: +b.life.toFixed(2) }; }));
    await B.page.screenshot({ path: `${shots}/combat-B-sees-A-ball.png`, timeout: 240000 });
    await B.page.evaluate(() => window.__app.renderer.setAnimationLoop(() => window.__app.frame(0.016)));
    await B.page.evaluate(() => window.__app.testMode.setFull(false));
    await B.page.setViewportSize({ width: 320, height: 200 });
    check(ballOnB.length === 1 && ballOnB[0].ndc.every((x) => Math.abs(x) < 1), 'the ball is in view on B\'s screen (screenshot)', JSON.stringify(ballOnB));
    // #690: the bow — A draws fully and looses at B: B sees the arrow and loses a life
    step('A shoots the bow');
    await A.page.evaluate(() => window.__bow.take());
    await sees(B.page, (l) => l.find((g) => g.n === 'Olof')?.h === 'bow');
    await ready();
    const bowShot = await A.page.evaluate(() => { const b = window.__bow; b.trigger(true); b.draw = 1; b.trigger(false); const c = window.__combat;
      return { ...c.lastShot, state: { held: b.held, conn: window.__ghosts.connected, weapon: c.weapon(), foes: c.foes().length, shots: b.shots } }; });
    const seenArrow = await shotSeen(3);
    await until(async () => { await A.page.evaluate(() => { window.__ghosts.update(); window.__ghosts.sendShot(); }); return B.page.evaluate(() => window.__combat.hurts === 1); }, 180000);
    const bowB = await B.page.evaluate(() => ({ lives: window.__combat.lives, arrow: window.__arrows.list.some((a) => a.remote && a.m.visible) }));
    check(bowShot?.w === 'bow' && bowShot.to && seenArrow?.w === 'bow' && Math.abs(seenArrow.s - 42) < 0.1 && bowB.arrow && bowB.lives === 9,
      'the bow: A\'s arrow hits B, B sees it fly (same speed) and has a life less', JSON.stringify({ bowShot, seenArrow, bowB }));
    await A.page.evaluate(() => { window.__bow.putBack(); window.__app.toys.blasters[0].take(); }); // (the blaster again)
    step('C\'s screenshot');
    // screenshot: C's view of two solid armed players
    await sees(C.page, (l) => l.length === 2 && l.every((g) => g.solid));
    const stopKeep = keepAlive([A.page, B.page]);
    await C.page.evaluate(() => window.__app.testMode.setFull(true));
    await C.page.setViewportSize({ width: 960, height: 600 });
    const f0 = await C.page.evaluate(() => window.__app.renderer.info.render.frame);
    await until(() => C.page.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, f0), 180000);
    await C.page.screenshot({ path: `${shots}/combat-two-armed-players.png`, timeout: 240000 });
    await C.page.evaluate(() => window.__app.testMode.setFull(false));
    await C.page.setViewportSize({ width: 320, height: 200 });
    await stopKeep();
    await sees(A.page, (l) => l.length === 2 && l.every((g) => g.solid)); // (back from any idle while the screenshot rendered)
    // ten hits (one arrow, nine darts): points for A, deductions and lives off for B, then B back at the start with all lives
    const before = { a: await A.page.evaluate(() => window.__app.stats.pvpHits ?? 0), bScore: await B.page.evaluate(() => window.__app.totalScore()) };
    await B.page.evaluate(() => { window.__app.stats.target = (window.__app.stats.target ?? 0) + 200; }); // something to deduct from
    const lives = [];
    await ready();
    const connects = await A.page.evaluate(() => window.__ghosts.connects);
    step('ten hits');
    for (let i = 0; i < 9; i++) { // (the bow took the first life)
      step(`hit ${i + 2}`);
      const n = await B.page.evaluate(() => window.__combat.hurts), tf = Date.now();
      await fire();
      const got = await until(async () => { wiggle = -wiggle; await A.page.evaluate((w) => { window.__app.camera.rotation.y += w; window.__ghosts.update(); window.__ghosts.sendShot(); }, wiggle); await B.page.evaluate((w) => { window.__app.camera.rotation.y += w; window.__ghosts.update(); }, wiggle); return (await B.page.evaluate(() => window.__combat.hurts)) > n; }, 180000);
      if (!got) {
        check(false, `hit ${i + 2} arrives`, await A.page.evaluate(() => { const g = window.__ghosts, c = window.__combat; return JSON.stringify({ conn: g.connected, connects: g.connects, shots: g.shots, outbox: g.outbox, lastShot: c.lastShot, fired: c.fired, hits: c.hits, pending: c.nerfPending.length, aim: window.__combat.aim('nerf')?.name ?? null, held: window.__app.heldItem()?.name, list: g.list() }); }));
        break;
      }
      lives.push(await B.page.evaluate(() => window.__combat.lives));
      step(`hit ${i + 2} arrived after ${Math.round((Date.now() - tf) / 1000)} s; B has ${lives.at(-1)} lives`);
      await sleep(500);
    }
    check(await A.page.evaluate((n) => window.__ghosts.connected && window.__ghosts.connects === n, connects), 'A stays connected through the fight (never dropped for shooting)',
      await A.page.evaluate(() => JSON.stringify({ conn: window.__ghosts.connected, connects: window.__ghosts.connects, messages: window.__ghosts.messages })));
    check(JSON.stringify(lives) === JSON.stringify([8, 7, 6, 5, 4, 3, 2, 1, 10]), 'each hit takes a life; the tenth sends B back with all lives', JSON.stringify(lives));
    const a = await A.page.evaluate(() => ({ hits: window.__combat.hits, pvp: window.__app.stats.pvpHits }));
    check(a.hits === 10 && a.pvp - before.a === 9, 'A scores each hit (stats pvpHits, SCORE.each; the bow\'s hit came before `before`)', JSON.stringify(a));
    const b = await B.page.evaluate(() => ({ pen: window.__app.stats.penalties['pvpHurt'], deaths: window.__combat.deaths, pos: [window.__app.player.pos.x, window.__app.player.pos.z], held: window.__app.heldItem() === window.__app.saber, target: window.__app.stats.target }));
    check(b.pen === 10, 'B gets a deduction per hit', JSON.stringify(b));
    check(b.deaths === 1 && Math.hypot(b.pos[0] - 2.875, b.pos[1] + 12) < 0.6, 'out of lives: B is at the start', JSON.stringify(b.pos));
    check(b.held && b.target >= 200, 'nothing else is reset: B still holds the saber and keeps its stats');
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
