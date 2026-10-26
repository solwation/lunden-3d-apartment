// #1639: BIO reactions (cry / laugh / scream) between two real apps and an isolated local Worker.
//   node cloudflare/dev.mjs 8798 &  python3 tools/devserve.py 8744 . &
//   tools/browsertest.sh node tools/reactpeertest.cjs http://localhost:8744 http://localhost:8798 /tmp/w1639/out
// A (desktop) reacts with the keys / buttons in the BIO, standing and seated; B (phone, touch) watches A's avatar and has the buttons.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game, worker, out] = process.argv.slice(2);
if (!game || !worker || !out) throw Error('Usage: reactpeertest.cjs GAME WORKER OUT');
const log = (name, data) => console.log('PASS', name, data ? JSON.stringify(data) : '');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const make = async (name, mobile) => {
      const ctx = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1100, height: 760 }, isMobile: mobile, hasTouch: mobile });
      const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      p.on('console', (m) => { if (/THREE.WebGLProgram|GL_INVALID_OPERATION/.test(m.text())) errors.push(m.text()); });
      await p.addInitScript((name) => { localStorage.setItem('lunden.name', name); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
      await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`, { waitUntil: 'commit' });
      await p.waitForFunction(() => window.__app?.renderer, null, { timeout: 180000 });
      await p.evaluate(async (mobile) => { const a = __app; a.showOverlay(false); if (mobile) { a.touch.enabled = true; document.body.classList.add('touch'); } a.use({ kind: 'playhouse' }); }, mobile);
      await p.waitForFunction(() => __app.player.inPlayroom && __ghosts.connected, null, { timeout: 60000 });
      await p.waitForTimeout(600);
      return p;
    };
    const [A, B] = await Promise.all([make('Anna', false), make('Bo', true)]);
    await A.evaluate(() => document.getElementById('game-canvas').requestPointerLock()); await A.waitForFunction(() => !!document.pointerLockElement && document.getElementById('arm').hidden, null, { timeout: 20000 });
    log('two apps joined the local room');
    const place = (p, dx, dz, lookDx, lookDz, y = 1.45) => p.evaluate(async ([dx, dz, lx, lz, y]) => { const a = __app, { PLAYROOM: R } = await import('/src/config.js'); a.player.spawn(R.x + dx, R.z + dz, 0); for (let i = 0; i < 10; i++) a.player.update(1 / 60); a.camera.lookAt(R.x + lx, y, R.z + lz); a.camera.updateMatrixWorld(true); a.step(0); }, [dx, dz, lookDx, lookDz, y]);
    const bar = (p) => p.evaluate(() => { const bs = [...document.querySelectorAll('.react-btn')]; return { hidden: bs.map((b) => b.hidden), kbd: bs.map((k) => getComputedStyle(k.querySelector('kbd')).display), labels: bs.map((x) => x.textContent), rects: bs.map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }), at: bs.map((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b; }) }; });
    // A stands at the BIO's back, B in front of A looking at it
    await place(A, -5.8, -1.65, -9, -1.65); await place(B, -7.3, -1.65, -5.8, -1.1, 1.45);
    await A.waitForTimeout(500);
    const ia = await A.evaluate(() => __ghosts.me);
    await B.waitForFunction((id) => __ghosts.others.has(id), ia, { timeout: 20000 });
    for (const p of [A, B]) await p.waitForFunction(() => !document.getElementById('react-cry').hidden, null, { timeout: 10000 });
    const ba = await bar(A), bb = await bar(B);
    assert.deepEqual(ba.labels.map((l) => l.replace(/[YUI]$/, '')), ['Gråta', 'Skratta', 'Skrika']); assert.ok(ba.kbd.every((d) => d !== 'none')); assert.ok(bb.kbd.every((d) => d === 'none')); assert.ok(ba.at.every(Boolean) && bb.at.every(Boolean), 'the buttons are on top (hit-testable)');
    log('buttons in the BIO: desktop with key hints, phone without', { ba, bb });
    // outside the BIO (the hall) the controls are gone
    await place(A, 1, 4, 1, 6);
    await A.waitForFunction(() => document.getElementById('react-cry').hidden, null, { timeout: 10000 });
    await A.keyboard.press('KeyY'); await A.waitForTimeout(300);
    assert.equal(await A.evaluate(() => !!__ghosts.myReact), false); log('hidden and inert outside the BIO');
    await place(A, -5.8, -1.65, -9, -1.65); await A.waitForFunction(() => !document.getElementById('react-cry').hidden);
    const seen = (p, id) => p.evaluate((id) => { const g = __ghosts.others.get(id); return g?.react ? { kind: g.react.kind } : null; }, id);
    const handsFace = (p, id) => p.evaluate((id) => { const g = __ghosts.others.get(id); g.root.updateMatrixWorld(true); const T = g.avatar.hand('L').clone(), h = g.avatar.object.localToWorld(g.avatar.object.worldToLocal(T.clone())); return { y: T.y - g.root.position.y }; }, id);
    const names = ['cry', 'laugh', 'scream'], keys = ['KeyY', 'KeyU', 'KeyI'];
    const calls = () => B.evaluate(() => { __app.renderer.info.reset(); __app.renderer.render(__app.scene, __app.camera); return __app.renderer.info.render.calls; });
    const meshes = () => B.evaluate((id) => { let n = 0; __ghosts.others.get(id).root.traverse(() => n++); return n; }, ia), idle = Math.max(await calls(), await calls(), await calls()), idleMeshes = await meshes(), idleSeq = []; for (let i = 0; i < 6; i++) idleSeq.push(await calls()); const idleHand = await handsFace(B, ia);
    for (let k = 0; k < 3; k++) {
      await A.keyboard.press(keys[k]);
      await B.waitForFunction((id) => !!__ghosts.others.get(id)?.react, ia, { timeout: 10000 });
      const s = await seen(B, ia); assert.equal(s.kind, k);
      await B.waitForTimeout(1300); await B.evaluate(() => __app.testMode?.draw?.());
      const during = Math.max(await calls(), await calls(), await calls()), hand = await handsFace(B, ia);
      assert.equal(await meshes(), idleMeshes, 'no extra objects on the avatar'); const seq = []; for (let i = 0; i < 6; i++) seq.push(await calls()); console.log('calls idle', idleSeq, 'during', seq); assert.equal(Math.max(...seq), Math.max(...idleSeq), 'draw calls unchanged'); assert.ok(hand.y > idleHand.y + 0.2 && hand.y < 1.9, `hand raised for ${names[k]}`);
      await B.screenshot({ path: `${out}/b-sees-a-${names[k]}.png` });
      if (k === 0) await A.evaluate(() => __app.testMode?.draw?.()), await A.screenshot({ path: `${out}/a-desktop-controls.png` });
      log(`B sees A ${names[k]}`, { idle, during, hand, idleHand });
      await B.waitForFunction((id) => !__ghosts.others.get(id)?.react, ia, { timeout: 8000 });
      await A.waitForTimeout(k < 2 ? 4200 : 0);
    }
    await B.screenshot({ path: `${out}/b-phone-controls.png` });
    // rate limit: a second press within REACT.every does nothing
    await A.waitForTimeout(4200); await A.keyboard.press('KeyU'); const first = await A.evaluate(() => __ghosts.myReact.start); await A.waitForTimeout(500); await A.keyboard.press('KeyI');
    assert.equal(await A.evaluate(() => __ghosts.myReact.start), first); log('a second reaction within the gap is ignored');
    // B (touch) reacts, A sees it
    await B.locator('#touch-controls .react-btn[data-react="1"]').tap();
    await A.waitForFunction(() => [...__ghosts.others.values()].some((g) => g.react?.kind === 1), null, { timeout: 10000 }); log('phone buttons work, A sees B laugh');
    // seated: A sits in a BIO seat and reacts
    await A.waitForTimeout(4200);
    const sat = await A.evaluate(async () => { const a = __app, { PLAYROOM: R } = await import('/src/config.js'), c = R.furniture.cinema, x = c.seat.rowX[1], z = c.seat.z[1]; a.player.spawn(R.x + x + 0.78, R.z + z, 0); for (let i = 0; i < 10; i++) a.player.update(1 / 60); a.camera.lookAt(R.x + x, 0.48, R.z + z); a.camera.updateMatrixWorld(true); a.step(0); const f = a.focus().focused; if (f?.kind === 'rest') a.use(f); for (let i = 0; i < 12; i++) a.rest.update(0.1); return { f: f?.name, active: a.rest.active }; });
    assert.ok(sat.active, 'sitting ' + JSON.stringify(sat));
        await B.evaluate(async (id) => { const a = __app, { PLAYROOM: R } = await import('/src/config.js'), g = __ghosts.others.get(id), p = g.root.position; a.player.spawn(p.x - 1.7, p.z, 0); for (let i = 0; i < 10; i++) a.player.update(1 / 60); a.camera.lookAt(p.x, 1.0, p.z); a.camera.updateMatrixWorld(true); a.step(0); }, ia);
    await A.keyboard.press('KeyI');
    await B.waitForFunction((id) => __ghosts.others.get(id)?.react?.kind === 2 && __ghosts.others.get(id).pose === 1, ia, { timeout: 10000 });
    await B.waitForTimeout(1200); await B.evaluate(() => __app.testMode?.draw?.()); await B.screenshot({ path: `${out}/b-sees-a-seated-scream.png` }); log('seated reaction seen by B');
    assert.deepEqual(errors, []); log('no page or shader exceptions');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
