// #1769: the rare shark in Höje å, two real clients against the local Worker started with the shark's test schedule. Start both first:
//   python3 tools/devserve.py 8778 .      LUNDEN_SHARK_TEST=1 node cloudflare/dev.mjs 8779 testtoken   (a fresh Worker per run: it remembers the catch for a day)
//   tools/browsertest.sh node tools/sharktest.cjs http://localhost:8778 http://localhost:8779 OUT_DIR
// Checks: nothing of the shark is built at the start; near the river both clients see the fin in the same place (the room says it runs the
// test schedule); A hooks it with the rod (fish appetites set to 0 and the slip chance to 0 through the shared config module, so only the
// shark bites and the strike holds): the fin is in A's hand (held category 'sharkfin'), B sees the fin in A's hand, the fin is gone from the
// river for both, both draw the body on the bank at the same spot; with the room clock pushed forward the skeleton, then nothing; the fin
// in the hand is in keep.js's record. Screenshots: the fin in the river, the fin in the hand (A, and B looking at A), the body, the skeleton.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8778', worker = 'http://localhost:8779', out = '/tmp/shark'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, F = a.riverFish, Fi = a.fishing; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true; document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [sw, ss, cfg, hc, three] = await Promise.all([import('/src/riverfishswim.js'), import('/src/sharkswim.js'), import('/src/config.js'), import('/src/heldcategory.js'), import('three')]);
  window.T = { a, F, Fi, sw, ss, cfg, hc, async pump(ms, dt = 0.05, until = null) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); if (until?.()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    bank(x, z, off = 4.5, other = false) { const q = sw.riverProject(x, z), p = sw.riverPoint(q.s), side = (q.d >= 0 ? 1 : -1) * (other ? -1 : 1), d = p.hw + off, sx = p.x + p.nx * d * side, sz = p.z + p.nz * d * side; T.stand(sx, sz, Math.atan2(-(x - sx), -(z - sz))); },
    shark() { const w = F.sync.sharkWindow(); return w ? ss.sharkAt(w, F.sync.t, {}, F.sync.seed) : null; },
    clear(r = 1.2) { const c = a.camera.position, v = new a.camera.position.constructor(); a.scene.traverse((o) => { if (o.isMesh && o.visible && !o.isInstancedMesh && !o.name.startsWith('shark') && !o.name.startsWith('ghost-item')) { let p = o, mine = false; while (p) { if (p === a.camera) mine = true; p = p.parent; } if (mine) return; o.getWorldPosition(v); if (v.distanceTo(c) < r) o.visible = false; } }); },
    /** for a picture: hide whatever the camera's rays to the carcass meet first (bushes, trees, the other player), up to 30 objects */
    unblock(r) {
      const THREE = { V: three.Vector3 }, rc = new three.Raycaster(), c = a.camera.position; rc.camera = a.camera;
      for (let k = -2; k <= 2; k++) for (let n = 0; n < 6; n++) {
        const tx = Math.sin(r.r), tz = Math.cos(r.r), p = new THREE.V(r.p[0] + tx * k * 0.7, r.p[1] + 0.2, r.p[2] + tz * k * 0.7), d = p.clone().sub(c), len = d.length();
        rc.set(c, d.normalize()); rc.far = len - 0.6;
        const hit = rc.intersectObjects(a.scene.children, true).find((h) => h.object.visible && !h.object.name.startsWith('shark'));
        if (!hit) break;
        hit.object.visible = false;
      }
    },
    zoom(fov) { a.camera.userData.fov0 ??= a.camera.fov; a.camera.fov = fov ?? a.camera.userData.fov0; a.camera.updateProjectionMatrix(); },
    info() { const s = Fi.state_(); return { state: s.state, fins: s.fins, catches: s.catches, misses: s.misses, held: a.heldItem()?.name ?? null, heldCat: hc.heldCategory(a.heldItem()), shark: F.shark.state(), near: F.sync.near, label: document.getElementById('action').textContent }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=1.0,11.8,-40,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); localStorage.removeItem('lunden.shark'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.fishing && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x), both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    const zshot = async (page, file, fov = 40) => { await page.evaluate((f) => T.zoom(f), fov); await kit.shot(page, `${out}/${file}`); await page.evaluate(() => T.zoom()); };
    // 1. the start: nothing of the shark built or drawn
    await both(400);
    const start = await pa(() => ({ built: T.F.shark.built, names: T.a.scene.children.filter((o) => o.name.startsWith('shark')).length, state: T.F.shark.state() }));
    check(!start.built && start.names === 0, 'at the start nothing of the shark is built or drawn', start);
    // 2. near the river: the room's clock and test schedule; both see the fin in the same place
    await Promise.all([pa(() => T.stand(5, 118)), pb(() => T.stand(8, 118))]);
    await Promise.all([pa(() => T.pump(8000, 0.05, () => T.F.sync.synced && T.F.sync.sharkTestOn)), pb(() => T.pump(8000, 0.05, () => T.F.sync.synced && T.F.sync.sharkTestOn))]);
    const o = await pa(() => T.shark());
    await pa((o) => { T.bank(o.x, o.z, 3.5); T.look(o.x, o.y + 0.2, o.z); }, o);
    await pb((o) => { T.bank(o.x, o.z, 4, true); T.look(o.x, o.y + 0.2, o.z); }, o);
    await both(300);
    const finA = await pa(() => ({ ...T.F.shark.state(), t: T.F.sync.t })), finB = await pb(() => ({ ...T.F.shark.state(), t: T.F.sync.t }));
    const gap = finA.at && finB.at ? Math.hypot(finA.at.x - finB.at.x, finA.at.z - finB.at.z) : null;
    check(finA.test && finB.test && finA.finShown && finB.finShown && gap < 1.0, 'near the river both clients see the fin in the same place (the room runs the test schedule)', { a: finA.at, b: finB.at, gap, dt: finA.t - finB.t, tris: finA.tris });
    check(finA.tris && finA.tris.fin <= 40 && finA.tris.body <= 800 && finA.tris.bones <= 800, 'budgets: fin, body and skeleton within their triangle counts', finA.tris);
    await pa(() => { const o = T.shark(); T.look(o.x, o.y + 0.15, o.z); T.a.step(0.016); T.clear(); }); await zshot(A.page, 'fena-i-an.png', 32);
    // 3. A hooks the shark: take the rod, cast beside the fin, strike at the bite
    await pa(() => { for (const k of Object.keys(T.cfg.FISHING.species)) T.cfg.FISHING.species[k].bite = 0; Object.assign(T.cfg.FISHING.wait, { min: 0.5, rate: 3 }); T.cfg.SHARK.strike.slip = 0; T.Fi.rod.take(); });
    let bit = null;
    for (let i = 0; i < 4 && !bit; i++) {
      const c = await pa(() => { const o = T.shark(); T.bank(o.x, o.z, 2.5); T.look(o.x, o.y, o.z); T.a.step(0.016); return { aim: T.Fi.aim()?.toArray() ?? null, fire: T.a.click(0) }; });
      await pa(() => T.pump(3000, 0.05, () => T.Fi.state === 'wait'));
      const b = await pa(() => T.pump(15000, 0.05, () => T.Fi.state === 'bite').then(() => T.info()));
      if (b.state === 'bite') bit = { ...b, c }; else await pa(() => T.Fi.reelIn());
    }
    check(bit?.state === 'bite' && bit.label === 'Haka!', 'cast near the fin, the shark bites (Haka!)', bit);
    await pa(() => document.getElementById('action').click());
    await pa(() => T.pump(6000, 0.05, () => T.Fi.state === 'idle'));
    await Promise.all([pa(() => T.pump(2500)), pb(() => T.pump(10000, 0.05, () => [...__ghosts.others.values()].find((x) => x.name === 'Alma')?.hi === 'sharkfin' && !!T.F.sync.shark))]);
    const got = await pa(() => T.info()), gotB = await pb(() => { const g = [...__ghosts.others.values()].find((x) => x.name === 'Alma'); return { hi: g?.hi, prop: !!g?.itemProp?.visible, shark: T.F.shark.state() }; });
    check(got.held === 'hajfenan' && got.heldCat === 'sharkfin' && got.fins.length === 1 && got.fins[0].held, 'the shark caught: only the fin is in the hand (category sharkfin)', got);
    check(!got.shark.finShown && !gotB.shark.finShown && !got.shark.window && !gotB.shark.window, 'the fin is gone from the river for both', { a: got.shark.window, b: gotB.shark.window });
    check(gotB.hi === 'sharkfin' && gotB.prop, 'the other client sees the fin in the catcher\'s hand', gotB);
    const ra = got.shark.record, rb = gotB.shark.record;
    check(ra && rb && JSON.stringify(ra) === JSON.stringify(rb) && got.shark.shown === 'body' && gotB.shark.shown === 'body', 'both draw the shark\'s body on the bank at the same spot', { ra, rb, a: got.shark.shown, b: gotB.shark.shown });
    await pa(() => { T.a.camera.rotation.x = -0.3; T.a.step(0.016); }); await zshot(A.page, 'fena-i-handen.png', 60);
    await pb(() => { const g = [...__ghosts.others.values()].find((x) => x.name === 'Alma'), p = g.root.position, yaw = g.root.rotation.y; const sx = p.x - Math.sin(yaw) * 3.6 + Math.cos(yaw) * 2.2, sz = p.z - Math.cos(yaw) * 3.6 - Math.sin(yaw) * 2.2; T.stand(sx, sz); T.look(p.x, p.y + 1.1, p.z); T.a.step(0.016); T.look(p.x, p.y + 1.1, p.z); T.a.step(0.016); T.clear(); });
    await zshot(B.page, 'annan-spelare-fena.png', 45);
    // 4. the body on the bank (B walks up to it), then the skeleton and nothing with the room clock pushed forward
    const view = async (page, end) => page.evaluate(async (end) => { const r = T.F.sync.shark, q = T.sw.riverProject(r.p[0], r.p[2]), c = T.sw.riverPoint(q.s), s = q.d >= 0 ? 1 : -1, tx = Math.sin(r.r), tz = Math.cos(r.r); T.stand(r.p[0] + c.nx * s * 3, r.p[2] + c.nz * s * 3); await T.pump(200); T.a.camera.position.set(r.p[0] + c.nx * s * 3.2 + tx * end * 1.5, r.p[1] + 3.4, r.p[2] + c.nz * s * 3.2 + tz * end * 1.5); T.look(r.p[0], r.p[1], r.p[2]); T.clear(2); T.unblock(r); }, end); // (from above the bank, landwards; whatever stands in the line of sight is hidden for the picture)
    await view(B.page, 1); await zshot(B.page, 'haj-pa-stranden.png', 45);
    const S = await pa(() => T.cfg.SHARK);
    await Promise.all([pa((s) => { T.F.sync.offset += (s.body + 60) * 1000; }, S), pb((s) => { T.F.sync.offset += (s.body + 60) * 1000; }, S)]);
    await both(300);
    const bonesA = await pa(() => T.F.shark.state()), bonesB = await pb(() => T.F.shark.state());
    await pb(() => T.stand(T.a.player.pos.x + 30, T.a.player.pos.z)); // (B out of A's picture)
    await view(A.page, -1);
    check(bonesA.shown === 'bones' && bonesB.shown === 'bones', 'an hour later both see the skeleton', { a: bonesA.shown, b: bonesB.shown });
    await zshot(A.page, 'skelett.png', 45);
    await Promise.all([pa((s) => { T.F.sync.offset += s.bones * 1000; }, S), pb((s) => { T.F.sync.offset += s.bones * 1000; }, S)]);
    await both(300);
    const goneA = await pa(() => ({ ...T.F.shark.state(), body: T.F.shark.body.visible, bones: T.F.shark.bones.visible })), goneB = await pb(() => ({ ...T.F.shark.state(), body: T.F.shark.body.visible, bones: T.F.shark.bones.visible }));
    check(!goneA.shown && !goneB.shown && !goneA.body && !goneA.bones && !goneB.body && !goneB.bones, 'a day later the skeleton is gone for both', { a: goneA.phase, b: goneB.phase });
    // 5. kept: the fin in the hand is in keep.js's record and comes back
    const kept = await pa(() => { const w = T.a.keepWorld(), s = T.Fi.saveState(); for (const f of T.Fi.fins) f.remove(); T.Fi.fins.length = 0; T.Fi.loadState(s); return { rec: w?.fishing ?? null, s, back: T.Fi.fins.length, held: T.a.heldItem()?.name ?? null }; });
    check(kept.rec?.fins?.[0]?.h === 1 && kept.back === 1 && kept.held === 'hajfenan', 'the fin is kept (keep.js `fishing` fins) and comes back in the hand', kept);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
