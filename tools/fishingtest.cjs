// #1753: the fishing rod under the road bridge, casting, bites and catches, two real clients against the local Worker. Start both first:
//   python3 tools/devserve.py 8778 .      node cloudflare/dev.mjs 8779 testtoken
//   tools/browsertest.sh node tools/fishingtest.cjs http://localhost:8778 http://localhost:8779 OUT_DIR
// Checks: nothing of the fishing is drawn at the start; the rod lies on the ground under the deck and is taken with E; a cast at the river
// lands the float with a ring; the other client sees the float; a missed bite gives no fish and leaves it in the river; a bite answered with
// the touch button ("Haka!") puts a fish with species and length in the hand, lays the rod down, takes the fish out of the river for both,
// and the other client sees the fish in the hand; the caught fish survives keep.js's save / load; the rod is no weapon.
// The bite waits are shortened through the shared config module (FISHING.wait), so the test does not wait minutes for a fish.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8778', worker = 'http://localhost:8779', out = '/tmp/fishing'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, F = a.riverFish, Fi = a.fishing; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true; document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [rb, sw, cfg, hc] = await Promise.all([import('/src/riverbridge.js'), import('/src/riverfishswim.js'), import('/src/config.js'), import('/src/heldcategory.js')]);
  window.T = { a, F, Fi, rb, sw, cfg, hc, async pump(ms, dt = 0.05, until = null) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); if (until?.()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    /** stand on the lowest walkable ground at (x, z) (under the bridge deck, not on it) */
    standLow(x, z) { const P = a.player; P.spawn(x, z, 0); const g = P.groundAt(x, z, -4.5), d = P.eyeY - P.pos.y; P.pos.y = g; P.eyeY = g + d; a.step(0.05); return [P.pos.y, a.camera.position.y]; },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    bank(x, z, off = 4.5, other = false) { const q = sw.riverProject(x, z), p = sw.riverPoint(q.s), side = (q.d >= 0 ? 1 : -1) * (other ? -1 : 1), d = p.hw + off, sx = p.x + p.nx * d * side, sz = p.z + p.nz * d * side; T.stand(sx, sz, Math.atan2(-(x - sx), -(z - sz))); },
    fish(id) { const f = sw.fishSpec(id, F.sync.born(id), F.sync.seed); return sw.fishAt(f, F.sync.t, {}, F.sync.seed); },
    clear(r = 1.2) { const c = a.camera.position, v = new a.camera.position.constructor(); a.scene.traverse((o) => { if (o.isMesh && o.visible && !o.isInstancedMesh && o.name !== 'fishing-float' && !o.name.startsWith('ghost-item')) { let p = o, mine = false; while (p) { if (p === a.camera) mine = true; p = p.parent; } if (mine) return; o.getWorldPosition(v); if (v.distanceTo(c) < r) o.visible = false; } }); },
    zoom(fov) { a.camera.userData.fov0 ??= a.camera.fov; a.camera.fov = fov ?? a.camera.userData.fov0; a.camera.updateProjectionMatrix(); },
    info() { const s = Fi.state_(); return { ...s, held: a.heldItem()?.name ?? null, heldCat: T.hc.heldCategory(a.heldItem()), float: Fi.float.visible, line: Fi.line.visible, ring: Fi.ring.visible, label: document.getElementById('action').textContent, near: F.sync.near }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=1.0,11.8,-40,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.fishing && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x), both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    const zshot = async (page, file, fov = 40) => { await page.evaluate((f) => T.zoom(f), fov); await kit.shot(page, `${out}/${file}`); await page.evaluate(() => T.zoom()); };
    // 1. the start: nothing of the fishing drawn
    await both(600);
    const start = await pa(() => ({ float: T.Fi.float.visible, line: T.Fi.line.visible, ring: T.Fi.ring.visible, rodHeld: T.Fi.rod.held, rodAt: T.Fi.rod.model.position.toArray(), ground: T.a.player.groundAt(T.Fi.rod.model.position.x, T.Fi.rod.model.position.z, -4), deck: T.rb.deckAt(T.Fi.rod.model.position.x, T.Fi.rod.model.position.z) }));
    check(!start.float && !start.line && !start.ring && !start.rodHeld, 'at the start no float, line or ring is drawn', start);
    check(start.deck !== null && Math.abs(start.rodAt[1] - start.ground) < 0.05, 'the rod lies on the ground under the road bridge deck', start);
    // 2. take the rod with E (aim at it)
    const center = () => pa(async () => { const c = new (T.a.camera.position.constructor)(); new (await import('three')).Box3().setFromObject(T.Fi.rod.model).getCenter(c); return c.toArray(); });
    const rc = await center();
    await pa(async (c) => { T.standLow(c[0] + 1.2, c[2] + 3.4); T.a.player.crouch = false; await T.pump(400); T.look(c[0], c[1] + 0.25, c[2]); T.a.step(0.016); T.clear(); }, rc);
    await zshot(A.page, 'spo-under-bron.png', 60);
    const deck = await pa(async (c) => { T.stand(c[0] + 0.4, c[2] + 1.5); await T.pump(300); T.look(c[0], c[1], c[2]); T.a.step(0.016); return { y: T.a.player.pos.y, focus: T.a.focus().focused?.name ?? null }; }, rc);
    check(deck.y > -3.5 && deck.focus !== 'fiskespöet', 'standing on the bridge deck above it, the rod cannot be taken through the deck', deck);
    const take = await pa(async (c) => {
      T.standLow(c[0] + 0.4, c[2] + 1.5); await T.pump(400); T.look(c[0], c[1], c[2]); T.a.step(0.016);
      const f = T.a.focus().focused; return { name: f?.name, kind: f?.kind, center: c };
    }, rc);
    const took = await pa(() => { const f = T.a.focus().focused; if (f?.item === T.Fi.rod) T.a.use(f); T.a.step(0.05); return T.info(); });
    check(take.name === 'fiskespöet' && took.held === 'fiskespöet' && took.heldCat === 'rod', 'the rod is aimed at and taken with E', { take, took });
    check(await pa(() => { const r = T.Fi.rod; return !r.clickIsUse && !r.shoots && !r.hitsTarget && !T.a.combat?.armed?.(); }), 'the rod is no weapon (no clickIsUse / shoots / hitsTarget)');
    // 3. by a fish: A on one bank, B on the other; cast at the fish
    await pa(() => { const w = T.cfg.FISHING.wait; Object.assign(w, { min: 1.5, rate: 3 }); });
    await pa(() => T.stand(5, 118)); await pa(() => T.pump(2000));
    const pick = await pa(() => { const L = [...Array(18).keys()].map((id) => ({ id, o: T.fish(id) })).filter((x) => !T.F.sync.isGone(x.id) && T.rb.deckAt(x.o.x, x.o.z) === null && Math.abs(x.o.x) < 200); return L.map((x) => x.id); });
    // keep the waits short and the fish near: freeze the room clock is impossible, so cast right at the chosen fish's current place
    const castAt = async (page, id, off, other) => page.evaluate(({ id, off, other }) => { const o = T.fish(id); T.bank(o.x, o.z, off, other); T.look(o.x, o.water, o.z); T.a.step(0.016); return { aim: T.Fi.aim()?.toArray() ?? null, o: [o.x, o.z], label: document.getElementById('action').textContent, place: T.a.focus().focused?.kind ?? null }; }, { id, off, other });
    let id = pick[0], c = await castAt(A.page, id, 2.5, false);
    check(!!c.aim && c.label === 'Kasta' && c.place !== 'place', 'looking at the river with the rod: a cast target on the water, the touch button says Kasta (not "put down")', c);
    // (#1759: B stands across from A's aim, not from its own idea of where the fish is: B's river clock is stale while only A runs frames, so its fish can be ~100 m away)
    await pb((aim) => { T.bank(aim[0], aim[2], 4, true); T.look(aim[0], aim[1], aim[2]); T.a.step(0.016); T.F.sync.setNear(true); }, c.aim);
    const fire = await pa(() => T.a.click(0));
    await pa(() => T.pump(3000, 0.05, () => T.Fi.state === 'wait'));
    const landed = await pa(() => T.info());
    check(fire === 'use' && landed.state === 'wait' && landed.float && landed.line && landed.ring && Math.hypot(landed.at[0] - c.aim[0], landed.at[2] - c.aim[2]) < 0.05, 'a click casts: the float lands on the water where aimed, with a ring and the line', { fire, landed });
    await pa(() => { T.clear(); }); await zshot(A.page, 'kast-flote-ring.png', 40);
    // (#1759: A runs frames until its state with the float is sent: a squirrel / paddock message in the outbox may take the first 5 Hz slot)
    await Promise.all([pa(() => T.pump(10000, 0.05, () => __ghosts.connected && __ghosts.sent === __ghosts.prev)), pb((at) => T.pump(10000, 0.05, () => __ghosts.connected && T.Fi.remote.some((x) => x.float.visible && Math.hypot(x.float.position.x - at[0], x.float.position.z - at[2]) < 0.05)), landed.at)]);
    const seen = await pb((at) => { T.a.step(0.016); const r = T.Fi.remote.find((x) => x.float.visible); return { n: T.Fi.remoteShown, at: r?.float.position.toArray(), gap: r ? Math.hypot(r.float.position.x - at[0], r.float.position.z - at[2]) : null, line: r?.line.visible }; }, landed.at);
    if (!(seen.n >= 1)) { seen.diagA = await pa(() => ({ con: __ghosts.connected, me: __ghosts.me, prevFb: __ghosts.prev?.fb ?? null, sentFb: __ghosts.sent?.fb ?? null, wire: T.Fi.wire, msgs: __ghosts.messages })); seen.diagB = await pb(() => ({ con: __ghosts.connected, me: __ghosts.me, cam: T.a.camera.position.toArray().map((v) => Math.round(v * 10) / 10), others: [...__ghosts.others.values()].map((g) => ({ id: g.id, n: g.name, hi: g.hi, bob: g.bob, p: g.root.position.toArray().map((v) => Math.round(v)) })) })); }
    check(seen.n >= 1 && seen.gap < 0.05 && seen.line, 'the other client sees the float (and the line) where it landed', seen);
    await pb((at) => { T.look(at[0], at[1], at[2]); T.a.step(0.016); T.clear(3.5); }, landed.at); await zshot(B.page, 'annan-spelare-flote.png', 30);
    // 4. a bite that is missed: no fish, the fish stays in the river
    let bit = await pa(() => T.pump(30000, 0.05, () => T.Fi.state === 'bite').then(() => T.info()));
    check(bit.state === 'bite' && !!bit.bite && bit.label === 'Haka!', 'after a short wait a fish bites; the touch button says Haka!', bit);
    if (bit.state === 'bite') { await pa(() => { T.clear(3); }); await zshot(A.page, 'napp.png', 30); }
    const missedId = bit.bite?.id;
    await pa(() => T.pump((T.cfg.FISHING.wait.window + 0.6) * 1000, 0.05, () => T.Fi.state === 'wait'));
    await both(800);
    const missed = await pa((mid) => ({ ...T.info(), gone: T.F.sync.isGone(mid) }), missedId);
    const missedB = await pb((mid) => T.F.sync.isGone(mid), missedId);
    check(missed.state === 'wait' && missed.held === 'fiskespöet' && missed.fish.length === 0 && missed.misses === 1 && !missed.gone && !missedB, 'a missed bite gives no fish; the fish stays in the river for both', missed);
    // 5. the next bite answered with the touch button: the fish in the hand, the rod on the bank, the fish gone for both
    await pa(() => T.Fi.shy.clear());
    bit = await pa(() => T.pump(40000, 0.05, () => T.Fi.state === 'bite').then(() => T.info()));
    if (bit.state !== 'bite') { // the fish swam off: cast again at another fish that is still near the bank
      for (const other of pick.slice(1, 4)) { await pa(() => T.Fi.reelIn()); c = await castAt(A.page, other, 2.5, false); await pa(() => T.a.click(0)); bit = await pa(() => T.pump(30000, 0.05, () => T.Fi.state === 'bite').then(() => T.info())); if (bit.state === 'bite') break; }
    }
    const caughtId = bit.bite?.id;
    await pa(() => document.getElementById('action').click());
    await pa(() => T.pump(6000, 0.05, () => T.Fi.state === 'idle'));
    await Promise.all([pa(() => T.pump(2500)), pb(() => T.pump(8000, 0.05, () => [...__ghosts.others.values()].find((x) => x.name === 'Alma')?.hi === 'fish'))]);
    const got = await pa((cid) => { const h = T.a.heldItem(), r = T.Fi.rod, p = T.a.player.pos; return { ...T.info(), isFish: !!h?.isCaughtFish, sp: h?.species, cm: h?.cm, raw: h?.raw, rodPlaced: r.placed && !r.held, rodGap: Math.hypot(r.model.position.x - p.x, r.model.position.z - p.z), gone: T.F.sync.isGone(cid) }; }, caughtId);
    const gotB = await pb((cid) => { const g = [...__ghosts.others.values()].find((x) => x.name === 'Alma'); return { gone: T.F.sync.isGone(cid), shown: T.F.state().fish.some((f) => f.id === cid), hi: g?.hi, bob: g?.bob ?? null, floats: T.Fi.remoteShown }; }, caughtId);
    check(got.isFish && /^en \S+, \d+ cm$/.test(got.held) && got.sp === bit.bite?.species && got.cm === bit.bite?.cm && got.raw === true && got.heldCat === 'fish' && got.catches === 1, `a bite answered in time: ${got.held} in the hand (species, length, raw)`, got);
    check(got.rodPlaced && got.rodGap < 1.2 && !got.float && !got.line, 'the rod is laid on the bank at the feet; the line is in', got);
    check(got.gone && gotB.gone && !gotB.shown, 'the caught fish is gone from the river for both clients', { a: got.gone, b: gotB });
    check(gotB.hi === 'fish' && gotB.bob === null && gotB.floats === 0, 'the other client sees the fish in the catcher\'s hand and the float gone', gotB);
    await pa(() => { T.a.camera.rotation.x = -0.25; T.a.step(0.016); }); await zshot(A.page, 'fangad-fisk.png', 60);
    await both(1500);
    await pb(() => { const g = [...__ghosts.others.values()].find((x) => x.name === 'Alma'), p = g.root.position, yaw = g.root.rotation.y; const sx = p.x - Math.sin(yaw) * 2.6 + Math.cos(yaw) * 0.6, sz = p.z - Math.cos(yaw) * 2.6 - Math.sin(yaw) * 0.6; T.stand(sx, sz); T.look(p.x, p.y + 1.0, p.z); T.a.step(0.016); T.look(p.x, p.y + 1.0, p.z); T.a.step(0.016); T.clear(); });
    await zshot(B.page, 'annan-spelare-fangst.png', 35);
    // 6. kept: the fish in the hand is in keep.js's record; laid down and loaded again it lies in the same place with the same name
    const kept = await pa(() => {
      const w = T.a.keepWorld(), rec = w?.fishing, h = T.a.heldItem(), name = h.name;
      const spot = T.Fi.dropSpot(0.6); h.placeAt(spot, 0.3); const s = T.Fi.saveState(), at = h.model.position.toArray();
      for (const f of T.Fi.fish) f.remove(); T.Fi.fish.length = 0;
      T.Fi.loadState(s); const back = T.Fi.fish[0];
      return { rec, s, name, back: back?.name, gap: back ? Math.hypot(back.model.position.x - at[0], back.model.position.y - at[1], back.model.position.z - at[2]) : null, placed: back?.placed, targetable: back?.target?.item === back, holdable: T.a.carryables?.length ?? null };
    });
    check(kept.rec?.v === 1 && kept.rec.fish?.[0]?.h === 1 && kept.back === kept.name && kept.gap < 0.01 && kept.placed && kept.targetable, 'the caught fish is kept (keep.js `fishing`): in the hand, and laid down it comes back in the same place', kept);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
