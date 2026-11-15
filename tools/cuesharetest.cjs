// #1982 (part of #1964): the billiard cues are shared between the players. Two real clients (A, B) in the playroom against the local
// Worker. Start both first:
//   python3 tools/devserve.py 8296 .      node cloudflare/dev.mjs 8297 testtoken
//   tools/browsertest.sh node tools/cuesharetest.cjs http://localhost:8296 http://localhost:8297 OUT_DIR
// Checks: the cues d0–d3 at both; A takes one: gone at B, B cannot take it and B's rack hands out another; A puts it back in its own
// slot: home at B; a cue put back in ANOTHER slot stands in that slot at the other client too (no slot holds two, no cue is missing);
// a cue laid on the floor lies there at B and B can take it; the holder can aim at the table; B leaves holding a cue: it is back in
// the rack at A. Screenshots: B's view of the rack while A holds a cue, and of the cue A laid on the floor.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8296', worker = 'http://localhost:8297', out = '/tmp/cueshare'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false); if (a.rest?.active) a.standUp();
  const V = a.camera.position.constructor, S = __thingShare, k = a.cueRack;
  window.T = { a, S, V, k,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    enter() { a.player.spawn(-28.85, 22.7, Math.PI); for (let i = 0; i < 60; i++) a.player.update(1 / 60); T.look(-28.85, 0.6, 23.6); a.touch.enabled = true; a.step(0); a.step(0); a.touch.enabled = false; a.use(a.focus().focused); },
    cue(i) { return a.billiardCues[i]; },
    slots() { return k.slots.map((c) => (c ? c.cueIndex : null)); },
    info(i) { const id = `d${i}`, it = a.billiardCues[i], p = it.model.getWorldPosition(new V()), r = S.ledger.get(id);
      return { local: S.mode(it), room: r.m, d: r.d ?? null, mine: r.by === __ghosts.me, other: S.ledger.heldByOther(id), visible: it.model.visible, inHand: a.heldItem() === it, slot: it.slotIndex, inRack: it.inRack,
        inGroup: it.model.parent === k.group, p: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100) }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=2.5,0,5,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected && window.__thingShare?.live, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Anna'), B = await open('Bo');
    const both = async (ms = 1500) => { await Promise.all([A.page.evaluate((ms) => T.pump(ms), ms), B.page.evaluate((ms) => T.pump(ms), ms)]); };
    const info = (c, i) => c.page.evaluate((i) => T.info(i), i), slots = (c) => c.page.evaluate(() => T.slots());
    const same = (p, q, tol = 0.02) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tol;
    await A.page.evaluate(() => T.enter()); await B.page.evaluate(() => T.enter()); await both(1500);
    await A.page.evaluate(() => T.stand(T.k.worldPos.x - 0.9, T.k.worldPos.z, Math.PI / 2)); await B.page.evaluate(() => T.stand(T.k.worldPos.x - 1.3, T.k.worldPos.z + 0.9, Math.PI / 2));
    await both(1500);
    const start = { a: await A.page.evaluate(() => ({ inside: T.a.player.inPlayroom, ids: [...T.S.items.keys()].filter((x) => x[0] === 'd').join(','), slots: T.slots() })), b: await B.page.evaluate(() => ({ inside: T.a.player.inPlayroom, ids: [...T.S.items.keys()].filter((x) => x[0] === 'd').join(','), slots: T.slots() })) };
    check(start.a.inside && start.b.inside && start.a.ids === 'd0,d1,d2,d3' && start.b.ids === start.a.ids && start.a.slots.join() === '0,1,2,3' && start.b.slots.join() === '0,1,2,3', 'both are in the playroom with the four cues registered and in the rack', start);
    // A takes cue 0
    await A.page.evaluate(() => T.cue(0).take()); await both();
    let a = await info(A, 0), b = await info(B, 0);
    check(a.inHand && a.room === 'held' && a.mine && b.other && !b.visible && !b.inRack && (await slots(B)).join() === ',1,2,3', 'A takes a cue: held by A in the room, gone from the rack at B', { a, b, slotsB: await slots(B) });
    await B.page.evaluate(() => { T.look(T.k.worldPos.x, T.k.worldPos.y, T.k.worldPos.z); T.a.step(0.05); });
    await kit.shot(B.page, `${out}/b-sees-three-cues-while-a-holds-one.png`);
    const refused = await B.page.evaluate(() => { const it = T.cue(0); it.take(); return { held: it.held, inHand: T.a.heldItem() === it }; });
    check(!refused.held && !refused.inHand, 'B cannot take the cue A holds', refused);
    // B takes "a cue from the rack": the rack hands out cue 1, not the one A has
    const got = await B.page.evaluate(() => { T.k.target.toggle(); return T.a.heldItem()?.cueIndex ?? null; }); await both();
    a = await info(A, 1);
    check(got === 1 && a.other && !a.visible && (await slots(A)).join() === ',,2,3', 'B takes a cue from the rack: another one, gone at A', { got, a, slotsA: await slots(A) });
    // A puts cue 0 back: its own slot is the first free one = plain home
    await A.page.evaluate(() => T.k.returnHeldCue(T.a.heldItem())); await both();
    a = await info(A, 0); b = await info(B, 0);
    check(a.slot === 0 && a.room === 'home' && b.room === 'home' && b.visible && b.inRack && b.slot === 0 && same(a.p, b.p), 'A puts it back in its own slot: home and visible at B', { a, b });
    // A takes cue 2 and puts it back: the first free slot is cue 1's (B has that one), so it stands in ANOTHER slot at both
    await A.page.evaluate(() => T.cue(2).take()); await both();
    await A.page.evaluate(() => T.k.returnHeldCue(T.a.heldItem())); await both();
    a = await info(A, 2); b = await info(B, 2);
    check(a.slot === 1 && a.local === 'home' && a.room === 'world' && a.d === '1' && b.slot === 1 && b.inRack && b.local === 'home' && b.visible && same(a.p, b.p), 'a cue put back in another slot stands in that slot at B too', { a, b });
    // B puts cue 1 back: at B the free slot is cue 2's old one
    await B.page.evaluate(() => T.k.returnHeldCue(T.a.heldItem())); await both();
    const sa = await slots(A), sb = await slots(B), all = await Promise.all([0, 1, 2, 3].map(async (i) => ({ a: await info(A, i), b: await info(B, i) })));
    check(sa.join() === '0,2,1,3' && sb.join() === sa.join() && all.every((x) => x.a.visible && x.b.visible && x.a.inRack && x.b.inRack && same(x.a.p, x.b.p)) && new Set(all.map((x) => x.a.p.join())).size === 4,
      'both racks hold the same four cues in the same slots: none missing, none twice', { sa, sb, at: all.map((x) => x.a.p) });
    // A lays cue 2 on the floor
    await A.page.evaluate(() => T.cue(2).take()); await both();
    const put = await A.page.evaluate(() => { const p = T.a.player.pos, at = new T.V(p.x - 0.6, p.y, p.z + 0.3); T.cue(2).placeAt(at, 0.7); return [at.x, at.y, at.z]; });
    await both();
    a = await info(A, 2); b = await info(B, 2);
    check(a.local === 'world' && b.local === 'world' && b.room === 'world' && b.visible && !b.inRack && b.inGroup && same(a.p, b.p) && Math.hypot(b.p[0] - put[0], b.p[2] - put[2]) < 0.05 && (await slots(B)).join() === '0,,1,3',
      'A lays a cue on the floor: it lies at the same place at B, and its slot is free', { a, b, put, slotsB: await slots(B) });
    await B.page.evaluate(([x, y, z]) => { T.look(x, y + 0.05, z); T.a.step(0.05); }, b.p);
    await kit.shot(B.page, `${out}/b-sees-the-cue-a-laid-on-the-floor.png`);
    // B takes it from the floor and puts it in the rack
    await B.page.evaluate(() => T.cue(2).take()); await both();
    a = await info(A, 2); b = await info(B, 2);
    check(b.inHand && b.mine && a.other && !a.visible, 'B takes it from the floor: in B\'s hand, gone at A', { a, b });
    await B.page.evaluate(() => T.k.returnHeldCue(T.a.heldItem())); await both();
    a = await info(A, 2); b = await info(B, 2);
    check(b.slot === 1 && a.slot === 1 && a.visible && same(a.p, b.p) && (await slots(A)).join() === '0,2,1,3', 'B puts it in the rack: in the same slot at A', { a, b });
    // the game still works for the holder: with a cue in the hand the table lets A aim
    const game1 = await A.page.evaluate(() => { const r = T.a.world.playroom, bl = r.billiards, c = bl.c, o = bl.object.position; T.cue(3).take(); T.stand(o.x, o.z + c.length / 2 + 0.65, 0); for (let i = 0; i < 30; i++) T.a.player.update(1 / 60);
      T.look(o.x, c.height, o.z); T.a.touch.enabled = true; T.a.step(0); T.a.step(0); T.a.touch.enabled = false; const kind = T.a.focus().focused?.kind; T.a.step(0);
      return { kind, hasCue: bl.hasCue(), blocked: !!bl.target.blocked, cue: bl.cue.visible }; });
    check(game1.kind === 'playroomBilliards' && game1.hasCue && !game1.blocked && game1.cue, 'the holder of a shared cue can aim at the table', game1);
    await both(800);
    // B takes cue 0 and leaves: it is back in the rack at A
    await B.page.evaluate(() => T.cue(0).take()); await both();
    a = await info(A, 0);
    const before = { other: a.other, visible: a.visible };
    await B.ctx.close(); await A.page.evaluate(() => T.pump(2500));
    a = await info(A, 0);
    check(before.other && !before.visible && a.room === 'home' && a.visible && a.inRack && a.slot === 0, 'B leaves holding a cue: it is back in the rack at A', { before, a, slotsA: await slots(A) });
    check(errors.length === 0, 'no page errors', errors);
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
