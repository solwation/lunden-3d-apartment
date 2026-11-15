// #1981 (part of #1964): the life simulator's things (food, dishes …) are ONE kitchen for the room. Real clients against the local Worker:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/lifesharetest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// Checks: the first player's kitchen becomes the room's and the second gets the same; a plate with a sausage made by A stands at B;
// A carries it: gone at B; put down elsewhere: there at B with the sausage on it; B takes the sausage off: gone from A's plate; a
// changed amount and a dirty plate follow; both take one thing at once: one keeps it; a late C gets the same kitchen; A leaves with
// a thing in the hand: it is put down for the others; after everybody left, D finds the kitchen as it was (saved).
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197', out = '/tmp/lifeshare'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
  const V = a.camera.position.constructor, L = a.life, I = L.items;
  window.T = { a, V, L, I, S: __lifeShare,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    async calm(max = 60000) { const end = performance.now() + max; do { await T.pump(700); } while ((T.S.dirty.size || T.S.pending.size) && performance.now() < end); return T.S.state(); },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    map() { return I.all().map((i) => `${i.id}@${i.place.at === 'world' ? i.place.pos.map((v) => v.toFixed(2)).join(',') : i.place.at === 'slot' ? `${i.place.store}:${i.place.slot}` : i.place.at === 'on' ? `${i.place.parent}:${i.place.slot}` : 'hand'}`).sort().join(' '); },
    see(id) { const v = L.view(id), it = I.get(id); if (!v || !it) return null; const p = v.model.getWorldPosition(new V()); return { at: it.place.at, amount: it.amount, clean: it.clean, visible: v.model.visible, held: a.heldItem() === v, p: [p.x, p.y, p.z].map((n) => Math.round(n * 100) / 100), on: I.children(it).map((c) => c.type) }; },
    audit() { return I.audit(); } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=3.4,0,2.6,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected && window.__lifeShare?.live, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const ev = (c, fn, arg) => c.page.evaluate(fn, arg);
    const A = await open('Anna');
    const seeded = await ev(A, () => T.calm(120000));
    check(seeded.shadow === seeded.local && seeded.local > 20 && !seeded.dirty && !seeded.pending, 'an empty room takes A\'s whole kitchen', seeded);
    const B = await open('Bo');
    const calm = async (...cs) => { for (let i = 0; i < 2; i++) await Promise.all(cs.map((c) => ev(c, () => T.calm()))); };
    await calm(A, B);
    let ma = await ev(A, () => T.map()), mb = await ev(B, () => T.map());
    check(ma === mb, 'B has the same kitchen as A: every thing, the same place', { a: ma.split(' ').length, b: mb.split(' ').length });
    // A makes a plate with a sausage on the dining table
    const made = await ev(A, () => { const p = T.L.create('plate', { at: 'world', pos: [3.45, 0.755, 1.0], yaw: 0 }), s = T.L.create('sausage', { at: 'on', parent: p.id, slot: 0 }); return { plate: p.id, sausage: s?.id ?? null, why: T.I.lastReason }; });
    await calm(A, B);
    let b = await ev(B, (id) => T.see(id), made.plate);
    check(!!made.sausage && b?.at === 'world' && Math.hypot(b.p[0] - 3.45, b.p[2] - 1.0) < 0.02 && b.on.join() === 'sausage', 'A lays a plate with a sausage on the table: it stands at B too', { made, b });
    // A carries it
    await ev(A, (id) => T.L.view(id).take(), made.plate); await calm(A, B);
    const held = { a: await ev(A, (id) => T.see(id), made.plate), b: await ev(B, (id) => T.see(id), made.plate), bs: await ev(B, (id) => T.see(id), made.sausage) };
    check(held.a?.held && held.b === null && held.bs === null, 'A carries the plate: it and its sausage are gone at B', held);
    await ev(A, (id) => { T.L.view(id).placeAt(new T.V(3.8, 0.755, 1.6), 0.5); }, made.plate); await calm(A, B);
    b = await ev(B, (id) => T.see(id), made.plate);
    check(b?.at === 'world' && Math.hypot(b.p[0] - 3.8, b.p[2] - 1.6) < 0.02 && b.on.join() === 'sausage' && b.visible, 'A puts it down elsewhere: it stands there at B, the sausage on it', b);
    await ev(B, () => { T.stand(3.9, 2.5); T.look(3.8, 0.8, 1.6); T.a.step(0.05); T.look(3.8, 0.8, 1.6); });
    await kit.shot(B.page, `${out}/b-sees-the-plate-a-put-down.png`);
    // B takes the sausage off the plate
    await ev(B, (id) => T.L.view(id).take(), made.sausage); await calm(A, B);
    let a = await ev(A, (id) => T.see(id), made.plate);
    const bs = await ev(B, (id) => T.see(id), made.sausage);
    check(bs?.held && a?.on.length === 0 && (await ev(A, (id) => T.see(id), made.sausage)) === null, 'B takes the sausage: it is off A\'s plate and in nobody\'s sight but B\'s', { a, bs });
    await ev(B, (id) => { T.L.view(id).placeAt(new T.V(3.5, 0.755, 1.3), 0); T.I.consume(id, 0.5); T.I.set(T.I.all().find((i) => i.type === 'plate' && i.place.at === 'world'), { clean: 'dirty' }); }, made.sausage); await calm(A, B);
    const sa = await ev(A, (id) => T.see(id), made.sausage), sb = await ev(B, (id) => T.see(id), made.sausage); a = await ev(A, (id) => T.see(id), made.plate);
    check(sa && sb && sa.amount === sb.amount && sa.amount < 1 && a.clean === 'dirty', 'half eaten and a dirty plate: the same amount and dirt at A', { sa, sb, plate: a.clean });
    // both take the sausage at once
    await Promise.all([ev(A, (id) => T.L.view(id).take(), made.sausage), ev(B, (id) => T.L.view(id).take(), made.sausage)]); await calm(A, B);
    const race = [await ev(A, (id) => T.see(id), made.sausage), await ev(B, (id) => T.see(id), made.sausage)];
    check(race.filter((r) => r?.held).length === 1 && race.filter((r) => r === null).length === 1, 'both take it at once: exactly one keeps it, it is gone for the other', race);
    // the home's other state: an unmade bed, a watered plant, the milk, the dishwasher's programme
    const home = () => ({ beds: T.a.bedCare.units.filter((u) => !u.made).map((u) => u.id), plants: T.a.watering.plants.filter((p) => p.watered).map((p) => p.id), milk: Math.round(T.a.milk?.ml ?? -1), dw: T.a.dishProg?.state ?? null });
    const did = await ev(A, () => { const u = T.a.bedCare.units[0], p = T.a.watering.plants[0]; u.apply(false); p.apply(true); T.a.watering.rebuildSills(); T.a.milk?.drain(200); const d = T.a.dishProg; if (d) { d.state = 'running'; d.left = 500; d.ids = []; }
      return { bed: u.id, plant: p.id }; });
    for (let i = 0; i < 6; i++) await Promise.all([ev(A, () => T.pump(700)), ev(B, () => T.pump(700))]);
    const ha = await ev(A, home), hb = await ev(B, home);
    check(hb.beds.includes(did.bed) && hb.plants.includes(did.plant) && hb.milk === ha.milk && ha.milk > 0 && hb.dw === ha.dw && ['running', 'paused'].includes(hb.dw),
      'an unmade bed, a watered plant, less milk and a started dishwasher at A: the same at B', { did, ha, hb });
    await ev(B, (id) => { T.a.bedCare.units.find((u) => u.id === id).apply(true); }, did.bed);
    for (let i = 0; i < 4; i++) await Promise.all([ev(A, () => T.pump(700)), ev(B, () => T.pump(700))]);
    const ha2 = await ev(A, home);
    check(!ha2.beds.includes(did.bed), 'B makes the bed: made at A too', ha2);
    const C = await open('Cia'); await calm(A, B, C);
    const hc = await ev(C, home);
    check(!hc.beds.includes(did.bed) && hc.plants.includes(did.plant) && hc.milk === ha.milk && ['running', 'paused'].includes(hc.dw), 'a late C gets the home\'s state too', hc);
    const mc = await ev(C, () => T.map()); ma = await ev(A, () => T.map()); mb = await ev(B, () => T.map());
    const strip = (m) => m.split(' ').filter((r) => !r.startsWith(made.sausage)).join(' ');
    check(strip(mc) === strip(ma) && strip(mc) === strip(mb) && !mc.includes(made.sausage), 'a late C gets the same kitchen, without what is in somebody\'s hand', { c: mc.split(' ').length });
    const holder = race[0]?.held ? A : B, other = holder === A ? B : A;
    await holder.page.close(); await calm(other, C);
    const back = [await ev(other, (id) => T.see(id), made.sausage), await ev(C, (id) => T.see(id), made.sausage)];
    check(back.every((r) => r && r.at !== 'hand' && !r.held) && JSON.stringify(back[0].p) === JSON.stringify(back[1].p), 'the holder leaves: the sausage is put down, at the same place for those who stay', back);
    const audits = [await ev(other, () => T.audit()), await ev(C, () => T.audit())];
    check(audits.every((x) => !x.length), 'every kitchen is whole (one place per thing, nothing on a missing carrier)', audits);
    const last = await ev(C, () => T.map());
    await other.page.close(); await C.page.close();
    const D = await open('Dan'); await calm(D);
    const md = await ev(D, () => T.map());
    check(md === last, 'everybody left: a new player D finds the kitchen as it was (saved by the room)', { d: md.split(' ').length });
    const hd = await ev(D, home);
    check(hd.plants.includes(did.plant) && hd.milk === ha.milk, 'D finds the watered plant and the milk as they were', hd);
    await ev(D, () => { T.stand(3.9, 2.5); T.look(3.65, 0.8, 1.45); T.a.step(0.05); T.look(3.65, 0.8, 1.45); });
    await kit.shot(D.page, `${out}/d-finds-the-kitchen-as-it-was-left.png`);
    check(!errors.length, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
