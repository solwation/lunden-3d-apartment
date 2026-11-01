// #1781: the fishing rod comes back under the road bridge when it has lain away from home for FISHING.respawn s (solo, no Worker).
//   python3 tools/devserve.py 8203 .
//   tools/browsertest.sh node tools/fishrespawntest.cjs http://localhost:8203 OUT_DIR
// Checks (the clock is `Fishing.now`, injected; frames are the real game): the rod lies at home; taken and put down elsewhere it stays there
// until the timeout; held, the timer never runs (even past the timeout) and starts again when put down; after the timeout the SAME rod is home
// (exactly one rod in holdables / scene), not placed, hidden quest step unaffected; a line out blocks it (rod held anyway); keep.js's `fishing`
// record carries the time it was left (`ra`): reloaded before the timeout it keeps lying and counts on, reloaded after it is home.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8203', out = '/tmp/fishrespawn'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, Fi = a.fishing; a.renderer.setAnimationLoop(null); a.touch.enabled = true; a.showOverlay?.(false); document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [cfg, THREE, rb] = await Promise.all([import('/src/config.js'), import('three'), import('/src/riverbridge.js')]);
  window.R = cfg.FISHING.respawn; let clock = 1e12; Fi.now = () => clock;
  window.T = { a, Fi, cfg, THREE, rb, adv(s) { clock += s * 1000; }, async pump(n = 5) { for (let i = 0; i < n; i++) { a.step(0.05); await new Promise((r) => setTimeout(r, 20)); } },
    standLow(x, z) { const P = a.player; P.spawn(x, z, 0); const g = P.groundAt(x, z, -4.5), d = P.eyeY - P.pos.y; P.pos.y = g; P.eyeY = g + d; a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    clear(r = 1.2) { const c = a.camera.position, v = new THREE.Vector3(); a.scene.traverse((o) => { if (o.isMesh && o.visible && !o.isInstancedMesh) { let p = o, mine = false; while (p) { if (p === a.camera) mine = true; p = p.parent; } if (mine) return; o.getWorldPosition(v); if (v.distanceTo(c) < r) o.visible = false; } }); },
    rods() { let n = 0; const items = new Set(); a.scene.updateMatrixWorld(); a.scene.traverse((o) => { if (o === Fi.rod.model) n++; const it = o.userData?.door?.item; if (it?.isFishingRod) items.add(it); }); a.camera.traverse((o) => { if (o === Fi.rod.model) n++; }); return { inHoldables: items.size, inScene: n, rodsNamed: items.size }; }, // (distinct rod Holdables wired to a mesh in the world / the hand; the model in the scene graph)
    st() { const r = Fi.rod, h = cfg.FISHING.home; return { held: r.held, placed: r.placed, d: Math.round(Math.hypot(r.model.position.x - h.x, r.model.position.z - h.z) * 100) / 100, since: Fi.awaySince, vis: r.model.visible, ...T.rods() }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const { page } = await kit.open(browser, `${game}/?life&shot&time=13&month=7&day=15&weather=clear&freeze&at=1.0,11.8,-40,0`, { init: () => { localStorage.setItem('lunden.name', 'Rut'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.fishing, null, { timeout: 1500000 });
    await page.evaluate(setup);
    const p = (f, ...x) => page.evaluate(f, ...x);
    const R = await p(() => window.R);
    check(R >= 180 && R <= 300, 'FISHING.respawn is 3-5 minutes (guess)', R);
    await p(() => T.pump());
    const s0 = await p(() => T.st());
    check(!s0.held && !s0.placed && s0.d < 0.01 && s0.since === null && s0.inHoldables === 1 && s0.inScene === 1, 'at the start the one rod lies at home under the bridge, no timer', s0);
    // take it with E and carry it to a place on the courtyard side
    const took = await p(async () => {
      const r = T.Fi.rod, c = new T.THREE.Vector3(); new T.THREE.Box3().setFromObject(r.model).getCenter(c);
      T.standLow(c.x + 0.4, c.z + 1.5); await T.pump(); T.look(c.x, c.y, c.z); T.a.step(0.016); const f = T.a.focus().focused;
      if (f?.item === r) T.a.use(f); T.a.step(0.05); return { held: T.a.heldItem()?.name, quest: T.a.stats.fishQuestSteps?.s ?? [] };
    });
    check(took.held === 'fiskespöet' && took.quest.includes('rod'), 'the rod is taken with E (quest step "find the rod" reached)', took);
    await p(() => { T.adv(window.R * 3); T.a.step(0.05); });
    const held = await p(() => T.st());
    check(held.held && held.since === null, 'held for 3x the timeout: it stays in the hand, no timer', held);
    // put it down far away (courtyard, on the ground)
    await p(async () => { T.Fi.rod.placeAt(new T.THREE.Vector3(60, T.a.player.groundAt(60, 40, -4) + 0.0, 40), 0.5); await T.pump(2); });
    const down = await p(() => T.st());
    check(!down.held && down.placed && down.d > 20 && down.since === 1e12 + R * 3000, 'put down elsewhere: the timer starts at that moment', down);
    await p(() => { T.adv(window.R - 10); T.a.step(0.05); });
    const before = await p(() => T.st());
    check(before.placed && before.d > 20 && before.inHoldables === 1, 'just before the timeout it is still where it was left', before);
    // keep.js: the time left is in the record; reloaded just before, it counts on
    const rec = await p(() => { const w = T.a.keepWorld(); return { fishing: w?.fishing ?? null, thing: JSON.stringify(w?.things ?? {}).includes('fisk') || true }; });
    check(rec.fishing?.v === 1 && rec.fishing.ra === 1e12 + R * 3000, 'keep.js `fishing` carries when the rod was left (ra)', rec.fishing);
    const reloadedEarly = await p((saved) => { T.Fi.awaySince = null; T.Fi.loadState(saved); return T.st(); }, rec.fishing);
    check(reloadedEarly.placed && reloadedEarly.since === rec.fishing.ra, 'a reload before the timeout: still lying, the timer carries on from the saved time', reloadedEarly);
    // a click on E near it picks it up and cancels the timer (then put it down again later)
    await p(() => { T.adv(20); T.a.step(0.05); });
    const home = await p(() => T.st());
    check(!home.held && !home.placed && home.d < 0.01 && home.since === null && home.inHoldables === 1 && home.inScene === 1 && home.rodsNamed === 1, 'after the timeout the same rod is back at home: exactly one rod', home);
    const quest = await p(() => T.a.stats.fishQuestSteps?.s ?? []);
    check(quest.includes('rod'), 'the quest keeps its "find the rod" step', quest);
    // it can be found and taken again at home
    const again = await p(async () => { const r = T.Fi.rod, c = new T.THREE.Vector3(); new T.THREE.Box3().setFromObject(r.model).getCenter(c); T.standLow(c.x + 0.4, c.z + 1.5); await T.pump(); T.look(c.x, c.y, c.z); T.a.step(0.016); const f = T.a.focus().focused; return { name: f?.name, item: f?.item === r }; });
    check(again.item, 'the returned rod is aimed at and takeable', again);
    await p(() => { T.clear(); });
    await kit.shot(page, `${out}/1-spo-tillbaka-under-bron.png`);
    // reload AFTER the timeout: put down again, save, long gap, load -> home
    const late = await p(async () => {
      const r = T.Fi.rod; r.take(); T.adv(5); r.placeAt(new T.THREE.Vector3(60, T.a.player.groundAt(60, 40, -4), 40), 0.2); T.a.step(0.05);
      const placed = T.st(), saved = T.Fi.saveState(); T.adv(T.cfg.FISHING.respawn + 1); T.Fi.awaySince = null; T.Fi.loadState(saved);
      return { placed, after: T.st(), saved };
    });
    check(late.placed.placed && late.saved?.ra > 0 && !late.after.placed && late.after.d < 0.01 && late.after.since === null && late.after.inHoldables === 1, 'a reload after the timeout: the rod is home (saved record + elapsed time)', late);
    // the line out: a held rod with the float out never returns (it is held)
    const out2 = await p(() => { const r = T.Fi.rod; r.take(); T.Fi.state = 'wait'; T.adv(T.cfg.FISHING.respawn * 2); T.Fi.rodWatch(); const s = T.st(); T.Fi.state = 'idle'; return s; });
    check(out2.held && out2.since === null, 'held with the line out: nothing happens', out2);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
