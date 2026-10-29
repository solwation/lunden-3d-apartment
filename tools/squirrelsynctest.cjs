// #1686: squirrels and nuts shared between two real clients against the local Worker. Start both first:
//   python3 tools/devserve.py 8778 .      node cloudflare/dev.mjs 8779 testtoken
//   tools/browsertest.sh node tools/squirrelsynctest.cjs http://localhost:8778 http://localhost:8779 OUT_DIR
// A (the first near the squirrels) leads, B follows. Checks: same nuts and roughly the same squirrels at both; a nut B takes is gone at A
// (and A cannot take it); B feeding a squirrel that A's leader simulates scores for B only; hearts at both; a solo player sends nothing.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8778', worker = 'http://localhost:8779', out = '/tmp/squirrelsync'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app, S = a.squirrels; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true;
  window.T = { a, S, async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 50)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    aim(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; for (let i = 0; i < 3; i++) { a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); a.step(0.05); } },
    nuts() { return S.nuts.slots.map((s, i) => (s.alive && !(s.held && s.by) ? [i, Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10, s.born] : null)).filter(Boolean); },
    info() { return { lead: S.sync.lead, follow: S.sync.follow, near: S.sync.near, n: S.sync.n, sent: S.sync.sent, me: __ghosts.me, others: __ghosts.others.size }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=1.0,11.8,-40,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.squirrels && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x), both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    // both far from the squirrels first, then A (alone) near them
    const spot = await pa(() => { const b = T.S.animals[0].brain, t = T.S.trees[b.tree]; return { x: t.x + 12, z: t.z + 2 }; });
    await pb(() => T.stand(900, -300)); await pb(() => T.pump(2500)); // (B waits far away)
    await pa(({ x, z }) => T.stand(x, z), spot); await pa(() => T.pump(1500));
    const solo = await pa(() => T.info());
    check(solo.near && solo.lead && solo.n === 0 && solo.sent === 0, 'alone near the squirrels: leader, nobody to tell, nothing sent', solo);
    const soloNuts = await pa(() => T.nuts().length);
    await pb(({ x, z }) => T.stand(x - 9, z + 3), spot);
    await both(5000);
    const roles = [await pa(() => T.info()), await pb(() => T.info())];
    check(roles[0].lead && roles[0].n === 1 && !roles[1].lead && roles[1].follow && roles[0].sent > 0, 'the second visitor follows the first', roles);
    const [na, nb] = [await pa(() => T.nuts()), await pb(() => T.nuts())];
    const common = na.filter((n) => nb.some((m) => JSON.stringify(m) === JSON.stringify(n))).length; // (a nut may spawn between the two reads)
    check(na.length >= 6 && common >= Math.min(na.length, nb.length) - 2, 'both see the same nuts (slot, place, spawn)', { a: na.length, b: nb.length, soloNuts });
    const posA = await pa(() => T.S.animals.map((q) => [q.brain.x, q.brain.z, q.brain.state])), posB = await pb(() => T.S.animals.map((q) => [q.brain.x, q.brain.z, q.brain.state]));
    check(posA.every((p, i) => Math.hypot(p[0] - posB[i][0], p[1] - posB[i][1]) < 4), 'the squirrels are in about the same places for both', { posA, posB });
    // B takes a nut next to it
    const take = await pb(async (sp) => {
      const slot = T.S.nuts.slots.filter((s) => s.alive && !s.held).sort((p, q) => Math.hypot(p.x - sp.x, p.z - sp.z) - Math.hypot(q.x - sp.x, q.z - sp.z))[0], i = T.S.nuts.slots.indexOf(slot);
      T.stand(slot.x + 0.7, slot.z + 0.4); T.a.player.crouch = true; await T.pump(600); T.aim(slot.x, slot.y + 0.02, slot.z);
      const f = T.a.focus().focused; if (f?.item === T.S.nutItems[i]) T.a.use(f);
      return { i, born: slot.born, held: T.a.heldItem() === T.S.nutItems[i], me: __ghosts.me, x: slot.x, z: slot.z };
    }, spot);
    check(take.held, 'B takes a nut', take);
    await both(2500);
    const gone = await pa((t) => { const s = T.S.nuts.slots[t.i]; return { alive: s.alive, held: s.held, by: s.by, shown: T.S.nutItems[t.i].model.visible, listed: T.nuts().some((n) => n[0] === t.i) }; }, take);
    check(gone.held && gone.by === take.me && !gone.shown && !gone.listed, 'the nut B took is gone at A (kept out of play, held by B)', gone);
    const tryA = await pa(async (t) => { const s = T.S.nuts.slots[t.i], it = T.S.nutItems[t.i]; T.stand(s.x + 0.5, s.z + 0.3); T.aim(s.x, s.y + 0.02, s.z); const f = T.a.focus().focused; if (f?.item === it) T.a.use(f); return { held: T.a.heldItem() === it }; }, take);
    check(!tryA.held, 'A cannot pick the nut B holds');
    await pa(({ x, z }) => T.stand(x, z), spot);
    // B crouches still with the nut: A's squirrel (leader) comes and takes it
    await pb(() => { T.a.player.crouch = true; });
    await pa((t) => { const b = T.S.animals[0].brain; const gx = t.x + 4, gz = t.z + 2; Object.assign(b, { x: gx, z: gz, y: T.S.ground(gx, gz) }); b.startForage(); b.set('forage', 30); b.goal.x = gx; b.goal.z = gz; }, take);
    const f0 = [await pa(() => T.a.stats.squirrelFeeds ?? 0), await pb(() => T.a.stats.squirrelFeeds ?? 0)];
    let fed = null;
    for (let i = 0; i < 40 && !fed; i++) {
      await both(1000);
      const s = await pb(() => ({ feeds: T.a.stats.squirrelFeeds ?? 0, held: !!T.a.heldItem()?.isSquirrelNut }));
      if (s.feeds > f0[1]) fed = s;
    }
    if (!fed) console.log('DIAG', JSON.stringify(await pa(() => ({ remotes: T.S.net.remotes(), cand: T.S.cand, held: [...T.S.sync.remoteHeld], a0: [T.S.animals[0].brain.state, T.S.animals[0].brain.x, T.S.animals[0].brain.z, T.S.animals[0].brain.who], pl: T.S.player_, snaps: [...__ghosts.others.values()].map((g) => [g.snaps.length, g.snaps.at(-1)?.p?.toArray(), g.root.visible, g.dEye]), active: __ghosts.active() }))), JSON.stringify(await pb(() => ({ crouched: T.a.player.crouched, hi: T.a.heldItem()?.constructor.name, me: __ghosts.me, pos: T.a.camera.position.toArray(), msgs: __ghosts.messages, conn: __ghosts.connected, outbox: __ghosts.outbox.length, sentp: __ghosts.sent?.p, dropped: __ghosts.dropped }))));
    const aft = [await pa(() => ({ feeds: T.a.stats.squirrelFeeds ?? 0, nut: T.S.animals.some((q) => q.brain.hasNut), slot: T.S.nuts.slots[0].held })), await pb(() => ({ feeds: T.a.stats.squirrelFeeds ?? 0, held: !!T.a.heldItem()?.isSquirrelNut, nut: T.S.animals.some((q) => q.brain.hasNut) }))];
    check(!!fed && !aft[1].held && aft[0].feeds === f0[0] && aft[1].feeds === f0[1] + 1, 'B fed the squirrel A simulates: the point goes to B only, the nut leaves B\'s hand', { f0, fed, aft });
    check(aft[0].nut && aft[1].nut, 'both see the squirrel with the nut in its mouth', aft);
    // pictures
    await pa(() => { const q = T.S.animals.find((x) => x.brain.hasNut) ?? T.S.animals[0], b = q.brain; T.stand(b.x + 2.5, b.z + 1.5); T.look(b.x, b.y + 0.15, b.z); });
    await pb(() => { const q = T.S.animals.find((x) => x.brain.hasNut) ?? T.S.animals[0], b = q.brain; T.stand(b.x - 2.5, b.z - 1.5); T.look(b.x, b.y + 0.15, b.z); });
    await both(600);
    await kit.shot(A.page, `${out}/a-ekorre-och-not.png`); await kit.shot(B.page, `${out}/b-ekorre-och-not.png`);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
