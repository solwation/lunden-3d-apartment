// #1752: fish in Höje å, shared between two real clients against the local Worker. Start both first:
//   python3 tools/devserve.py 8778 .      node cloudflare/dev.mjs 8779 testtoken
//   tools/browsertest.sh node tools/riverfishtest.cjs http://localhost:8778 http://localhost:8779 OUT_DIR
// Checks against the real river (riverbridge.js riverAt / waterYAt / riverGround / pierBoxes): every fish stays in the open channel, over the bed,
// under (or, rising, through) the surface and clear of the road bridge's piers; fish are drawn near the river and nothing far from it; both clients
// are on the room's clock and see the same fish and the same ring; a fish taken out of the room (the catch #1753 will use) is gone for both.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8778', worker = 'http://localhost:8779', out = '/tmp/riverfish'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, F = a.riverFish; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true; document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [rb, sw] = await Promise.all([import('/src/riverbridge.js'), import('/src/riverfishswim.js')]);
  window.T = { a, F, rb, sw, async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 50)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    /** stand on the bank `off` m beside (x, z) and look at it */
    bank(x, z, off = 4.5, other = false) { const q = sw.riverProject(x, z), p = sw.riverPoint(q.s), side = (q.d >= 0 ? 1 : -1) * (other ? -1 : 1), d = p.hw + off, sx = p.x + p.nx * d * side, sz = p.z + p.nz * d * side; T.stand(sx, sz, Math.atan2(-(x - sx), -(z - sz))); }, // (facing the spot, so our own avatar stays behind the camera)
    fish(id) { const f = sw.fishSpec(id, F.sync.born(id), F.sync.seed); return sw.fishAt(f, F.sync.t, {}, F.sync.seed); },
    /** what stands right in front of the lens (diagnostic for the pictures) */
    /** hide what stands right in front of the lens for a picture (an unnamed mesh at the eye showed a face in a downward view of client A) */
    clear() { const c = a.camera.position, v = new a.camera.position.constructor(); a.scene.traverse((o) => { if (o.isMesh && o.visible && !o.isInstancedMesh) { o.getWorldPosition(v); if (v.distanceTo(c) < 1.2) o.visible = false; } }); },
    /** a closer look for the pictures: the camera's field of view (degrees), and back */
    zoom(fov) { a.camera.userData.fov0 ??= a.camera.fov; a.camera.fov = fov ?? a.camera.userData.fov0; a.camera.updateProjectionMatrix(); },
    ahead() { const rc = new (Object.getPrototypeOf(a.focus().raycaster).constructor)(); rc.setFromCamera({ x: 0, y: 0 }, a.camera); rc.far = 6; return rc.intersectObjects(a.scene.children, true).slice(0, 4).map((h) => { let p = h.object, path = []; while (p && path.length < 5) { path.push(p.name || p.type); p = p.parent; } return [h.distance.toFixed(2), path.join('<')]; }); },
    blockers() { const c = a.camera.position, out = [], v = new a.camera.position.constructor(); a.scene.traverse((o) => { if (o.isMesh && o.visible && !o.isInstancedMesh) { o.getWorldPosition(v); if (v.distanceTo(c) < 1.2) { let p = o, path = []; while (p && path.length < 4) { path.push(p.name || p.type); p = p.parent; } out.push(path.join('<')); } } }); return out.slice(0, 8); },
    info() { return { near: F.sync.near, synced: F.sync.synced, seed: F.sync.seed, offset: F.sync.offset, drawn: F.fish.count, rings: F.rings.count, visible: F.fish.visible, me: __ghosts.me }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=1.0,11.8,-40,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.riverFish && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x), both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    // 1. far from the river (the start): nothing drawn, not joined
    await both(800);
    const far = await pa(() => T.info());
    check(!far.visible && far.drawn === 0 && far.near === false, 'far from the river: no fish drawn, nobody joined', far);
    // 2. every fish against the real river over two minutes of swim time
    const water = await pa(() => {
      const { rb, sw } = T, bad = [], piers = rb.pierBoxes(); let n = 0;
      for (let id = 0; id < 18; id++) for (const born of [0, 1]) { const f = sw.fishSpec(id, born); for (let k = 0; k < 240; k++) {
        const t = T.F.sync.t + k * 0.5, o = sw.fishAt(f, t), r = rb.riverAt(o.x, o.z), bed = rb.riverGround(o.x, o.z, -3), wy = rb.waterYAt(o.x, o.z); n++;
        if (r.distance + f.spec.len / 2 > r.width / 2) bad.push(['bank', id, born, t, r.distance, r.width]);
        if (o.y - f.spec.h / 2 < bed) bad.push(['bed', id, born, t, o.y, bed]);
        if (o.y > wy + 0.01) bad.push(['air', id, born, t, o.y, wy]);
        for (const p of piers) { const dx = o.x - p.x, dz = o.z - p.z, a = Math.abs(dx * p.dx + dz * p.dz), c = Math.abs(-dx * p.dz + dz * p.dx); if (a < 0.9 + f.spec.len / 2 && c < 0.9 + f.spec.len / 2) bad.push(['pier', id, born, t]); }
      } }
      return { n, bad: bad.slice(0, 5), count: bad.length };
    });
    check(water.count === 0, 'every fish stays in the open channel, over the bed, under the surface and clear of the piers (real riverAt / riverGround / waterYAt / pierBoxes)', water);
    // 3. both by the same fish (the biggest that is not under a bridge deck)
    await pa(() => T.stand(5, 118)); await pa(() => T.pump(2000)); // (A joins the room first, so it knows which fish are still in the river)
    const pick = await pa(() => { const L = [...Array(18).keys()].map((id) => ({ id, f: T.sw.fishSpec(id, T.F.sync.born(id), T.F.sync.seed), o: T.fish(id) })).filter((x) => !T.F.sync.isGone(x.id) && T.rb.deckAt(x.o.x, x.o.z) === null && Math.abs(x.o.x) < 230).sort((p, q) => q.f.spec.len - p.f.spec.len); return { id: L[0].id, name: L[0].f.spec.name, born: T.F.sync.born(L[0].id) }; }); // (a fish still in the river: the local Worker remembers earlier runs' catches)
    const go = async (page, off, other) => page.evaluate(({ id, off, other }) => { const o = T.fish(id); T.bank(o.x, o.z, off, other); T.look(o.x, o.water, o.z); }, { id: pick.id, off, other });
    await go(A.page, 3.5, false); await go(B.page, 3.5, true);
    await both(2500);
    const roles = [await pa(() => T.info()), await pb(() => T.info())];
    check(roles.every((r) => r.near && r.synced && r.seed === roles[0].seed && r.drawn > 0 && r.visible), 'near the river both join the room and draw fish', roles);
    const same = await Promise.all([pa((id) => ({ ms: T.F.sync.roomMs, o: T.fish(id), shown: T.F.state().fish.find((x) => x.id === id) }), pick.id), pb((id) => ({ ms: T.F.sync.roomMs, o: T.fish(id), shown: T.F.state().fish.find((x) => x.id === id) }), pick.id)]);
    const gap = Math.hypot(same[0].o.x - same[1].o.x, same[0].o.z - same[1].o.z);
    check(gap < 0.5 && Math.abs(same[0].ms - same[1].ms) < 400 && same[0].shown && same[1].shown, `both see the same fish (${pick.name} ${pick.id}) in the same place`, { gap, dms: same[0].ms - same[1].ms });
    // pictures: the fish under the surface from both clients
    const zshot = async (page, file, fov = 28) => { await page.evaluate((f) => T.zoom(f), fov); await kit.shot(page, `${out}/${file}`); await page.evaluate(() => T.zoom()); }; // (zoomed in: a fish is 0.2-0.75 m long)
    const frame = async (page, off, other, file) => { await page.evaluate(({ id, off, other }) => { const o = T.fish(id); T.bank(o.x, o.z, off, other); T.look(o.x, o.water, o.z); T.a.step(0.016); T.clear(); }, { id: pick.id, off, other }); await zshot(page, file); };
    await frame(A.page, 1.5, false, 'a-fisk-under-ytan.png'); await frame(B.page, 2.5, true, 'b-samma-fisk.png');
    // 4. a ring: wait by a fish that is about to rise
    const next = await pa(() => {
      const t0 = T.F.sync.t; let best = null;
      for (let id = 0; id < 18; id++) { if (T.F.sync.isGone(id)) continue; const f = T.sw.fishSpec(id, T.F.sync.born(id), T.F.sync.seed); for (let k = 40; k < 400; k++) { const t = t0 + k * 0.25; if (T.sw.ringsAt(f, t).length) { const o = T.sw.fishAt(f, t); if (T.rb.deckAt(o.x, o.z) === null && (!best || t < best.t)) best = { id, t, x: o.x, z: o.z, water: o.water }; break; } } }
      return best ? { ...best, wait: best.t - t0 } : null;
    });
    check(!!next, 'a fish rises within 100 s', next);
    if (next) {
      for (const [page, other] of [[A.page, false], [B.page, true]]) await page.evaluate(({ n, other }) => { T.bank(n.x, n.z, 3, other); T.look(n.x, n.water, n.z); }, { n: next, other }); // (opposite banks: B's avatar stood in A's lens when both stood on one spot)
      const ringNow = () => Promise.all([pa(() => ({ ms: T.F.sync.roomMs, list: T.F.state().rings, drawn: T.F.rings.count })), pb(() => ({ ms: T.F.sync.roomMs, list: T.F.state().rings, drawn: T.F.rings.count }))]);
      const until = Date.now() + next.wait * 1000 + 20000; let rs;
      do { await both(300); rs = await ringNow(); } while (Date.now() < until && !(rs[0].list.some((r) => r.id === next.id) && rs[1].list.some((r) => r.id === next.id)));
      const ra = rs[0].list.find((r) => r.id === next.id), rbng = rs[1].list.find((r) => r.id === next.id);
      check(!!ra && !!rbng && Math.hypot(ra.x - rbng.x, ra.z - rbng.z) < 0.01 && Math.abs(ra.y - rbng.y) < 0.01 && rs[0].drawn > 0 && rs[1].drawn > 0, 'both see the same ring on the water (same place, drawn)', { a: ra, b: rbng });
      console.log('DIAG blockers A', JSON.stringify(await pa((n) => { T.bank(n.x, n.z, 3); T.look(n.x, n.water, n.z); T.a.step(0.016); const b = [T.blockers(), T.ahead()]; T.clear(); return b; }, next)));
      await zshot(A.page, 'a-ring-pa-vattnet.png');
      await pb((n) => { T.bank(n.x, n.z, 3, true); T.look(n.x, n.water, n.z); T.a.step(0.016); T.clear(); }, next);
      await zshot(B.page, 'b-samma-ring.png');
    }
    // 5. a fish taken out of the room (#1753 will call this from the rod): gone for both
    await pa((id) => { const o = T.fish(id); T.bank(o.x, o.z, 3); }, pick.id); await both(1500); // (the room knows where A stands)
    const caught = await pa((id) => T.F.catchFish(id), pick.id);
    await both(2500);
    const after = await Promise.all([pa((id) => ({ gone: T.F.sync.isGone(id), born: T.F.sync.born(id), shown: T.F.state().fish.some((x) => x.id === id) }), pick.id), pb((id) => ({ gone: T.F.sync.isGone(id), born: T.F.sync.born(id), shown: T.F.state().fish.some((x) => x.id === id) }), pick.id)]);
    check(caught && after.every((x) => x.gone && x.born === pick.born + 1 && !x.shown), 'a fish taken out of the room is gone for both clients', after);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
