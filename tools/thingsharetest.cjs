// #1975 (part of #1964): the weapons and tools one player puts down are seen and can be taken by the others. Two real clients (A, B)
// and a late third (C) against the local Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/thingsharetest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// Checks: the same id list at every client; A takes the lightsaber: it is gone at B and B cannot take it; A puts it down: it lies at
// the same place at B; B takes it: gone at A; both take a wand at once: exactly one keeps it; a thing carried in A's inventory is away
// at B; a late C sees what is held and what lies; B leaves: what B held is home again at A. Screenshots: B's and C's view of the
// saber lying where A put it; #1978: after everybody has left, a new player D finds what was put down still lying there.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197', out = '/tmp/thingshare'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
  const V = a.camera.position.constructor;
  window.T = { a, S: __thingShare, V,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    ids() { return [...__thingShare.items.keys()].join(','); },
    it(id) { return __thingShare.items.get(id).item; },
    info(id) { const e = __thingShare.items.get(id), it = e.item, p = it.model.getWorldPosition(new V()), r = __thingShare.ledger.get(id);
      return { local: __thingShare.mode(it), room: r.m, mine: r.by === __ghosts.me, other: __thingShare.ledger.heldByOther(id), visible: it.model.visible, inHand: a.heldItem() === it, p: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100) }; } };
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
    const info = (c, id) => c.page.evaluate((id) => T.info(id), id);
    await A.page.evaluate(() => T.stand(2.5, 5)); await B.page.evaluate(() => T.stand(3.2, 5.6));
    await both(1500);
    const ids = [await A.page.evaluate(() => T.ids()), await B.page.evaluate(() => T.ids())];
    check(ids[0] === ids[1] && ids[0].split(',').length >= 15 && ids[0].startsWith('s0,'), 'the same thing ids at both clients', ids[0]);
    // #1976: things without contents are shared too: the book, the remote, ornaments / photos / plants (never a bottle or a glass)
    const kinds = await A.page.evaluate(() => ({ n: T.S.items.size, book: T.S.items.has('p0'), remote: T.S.items.has('e0'), t: [...T.S.items.keys()].filter((k) => k[0] === 't').length,
      glass: [...T.S.items.entries()].find(([, e]) => e.item.constructor.name === 'Glass')?.[0] ?? null, first: [...T.S.items.entries()].find(([k, e]) => k[0] === 't' && e.item.constructor.name === 'Trinket')?.[0] }));
    check(kinds.book && kinds.remote && kinds.t > 0 && !!kinds.glass && !!kinds.first, 'the book, the remote, the loose ornaments and the glasses are registered', kinds);
    await A.page.evaluate(() => T.it('p0').take()); await both();
    const bk = { a: await info(A, 'p0'), b: await info(B, 'p0') };
    const bookAt = await A.page.evaluate(() => { const p = T.a.player.pos, at = new T.V(p.x + 0.3, p.y, p.z + 0.5); T.it('p0').placeAt(at, 0.4); return [at.x, at.y, at.z]; });
    await both();
    const bk2 = await info(B, 'p0');
    check(bk.a.inHand && bk.b.other && !bk.b.visible && bk2.local === 'world' && bk2.visible && Math.hypot(bk2.p[0] - bookAt[0], bk2.p[2] - bookAt[2]) < 0.05, 'the book: gone at B while A holds it, lying at the same place when A puts it down', { held: bk.b, put: bk2.p });
    const orn = await A.page.evaluate((id) => { const it = T.it(id); it.take(); return { name: it.name, cls: it.constructor.name, held: it.held }; }, kinds.first); await both();
    const ob = await info(B, kinds.first);
    await A.page.evaluate((id) => T.it(id).putBack(), kinds.first); await both();
    const ob2 = await info(B, kinds.first);
    check(orn.held && ob.other && !ob.visible && ob2.room === 'home' && ob2.visible, `a loose thing (${orn.name}): gone at B while A holds it, home again when A puts it back`, { orn, ob, ob2 });
    // A takes the saber
    await A.page.evaluate(() => T.it('s0').take()); await both();
    let a = await info(A, 's0'), b = await info(B, 's0');
    check(a.inHand && a.room === 'held' && a.mine && b.other && !b.visible, 'A takes the lightsaber: held by A in the room, gone at B', { a, b });
    const refused = await B.page.evaluate(() => { const it = T.it('s0'); it.take(); return { held: it.held, inHand: T.a.heldItem() === it }; });
    check(!refused.held && !refused.inHand, 'B cannot take what A holds', refused);
    // A puts it down on the floor beside them
    const put = await A.page.evaluate(() => { const p = T.a.player.pos, at = new T.V(p.x + 0.6, p.y, p.z - 0.3); T.it('s0').placeAt(at, 0.7); return [at.x, at.y, at.z]; });
    await both();
    a = await info(A, 's0'); b = await info(B, 's0');
    const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
    check(a.local === 'world' && b.local === 'world' && b.room === 'world' && b.visible && d < 0.02 && Math.hypot(b.p[0] - put[0], b.p[2] - put[2]) < 0.05, 'A puts it down: it lies at the same place at B', { a: a.p, b: b.p, d });
    await B.page.evaluate(([x, y, z]) => { T.look(x, y + 0.05, z); T.a.step(0.05); }, b.p);
    await kit.shot(B.page, `${out}/b-sees-the-saber-a-put-down.png`);
    // B takes it from where it lies
    await B.page.evaluate(() => T.it('s0').take()); await both();
    a = await info(A, 's0'); b = await info(B, 's0');
    check(b.inHand && b.mine && a.other && !a.visible && a.local === 'home', 'B takes it: in B\'s hand, gone at A', { a, b });
    // both take a wand in the same moment: exactly one keeps it
    await Promise.all([A.page.evaluate(() => T.it('w0').take()), B.page.evaluate(() => T.it('w0').take())]); await both(2000);
    a = await info(A, 'w0'); b = await info(B, 'w0');
    check((a.local === 'held') !== (b.local === 'held') && (a.other || b.other) && a.room === 'held' && b.room === 'held', 'both take a wand at once: exactly one keeps it', { a, b });
    // the inventory: A takes two blasters, the first is carried; both are away at B
    await A.page.evaluate(async () => { T.it('b0').take(); await T.pump(400); T.it('b1').take(); }); await both(2000);
    const inv = { a0: await info(A, 'b0'), a1: await info(A, 'b1'), b0: await info(B, 'b0'), b1: await info(B, 'b1') };
    check(inv.a0.local === 'held' && !inv.a0.inHand && inv.a1.inHand && inv.b0.other && inv.b1.other && !inv.b0.visible && !inv.b1.visible, 'a blaster carried in A\'s inventory is still held: both are away at B', inv);
    // A puts the bow down; a late C sees what is held and what lies
    await A.page.evaluate(() => { const p = T.a.player.pos; T.it('a0').take(); });
    await both(1000);
    const bowAt = await A.page.evaluate(() => { const p = T.a.player.pos, at = new T.V(p.x - 0.5, p.y, p.z - 0.4); T.it('a0').placeAt(at, 0.2); return [at.x, at.y, at.z]; });
    await both();
    const C = await open('Cia');
    await C.page.evaluate(() => T.pump(1200));
    const c = { saber: await info(C, 's0'), bow: await info(C, 'a0'), b0: await info(C, 'b0') };
    check(c.saber.other && !c.saber.visible && c.b0.other && c.bow.local === 'world' && c.bow.visible && Math.hypot(c.bow.p[0] - bowAt[0], c.bow.p[2] - bowAt[2]) < 0.05, 'a late joiner sees what is held and what lies', c);
    await C.page.evaluate(([x, y, z]) => { T.stand(x + 0.2, z + 1.6); T.look(x, y + 0.05, z); T.a.step(0.05); }, c.bow.p);
    await kit.shot(C.page, `${out}/c-sees-the-bow-a-put-down.png`);
    // B leaves: the saber B held is home again at A and C
    await B.ctx.close();
    await Promise.all([A.page.evaluate(() => T.pump(2500)), C.page.evaluate(() => T.pump(2500))]);
    a = await info(A, 's0'); const cs = await info(C, 's0');
    check(a.room === 'home' && a.visible && a.local === 'home' && cs.room === 'home' && cs.visible, 'B leaves: what B held is home again for the others', { a, cs });
    // (B has left: A and C from here on)
    const ac = async (ms = 1500) => { await Promise.all([A.page.evaluate((ms) => T.pump(ms), ms), C.page.evaluate((ms) => T.pump(ms), ms)]); };
    await C.page.evaluate(() => T.stand(3.2, 5.6)); await ac(800);
    // #1976: what is in a glass follows it: wine poured into a standing glass at A is in C's glass; taken, drunk from and put down, it
    // stands there at C with what is left and marked as used
    await A.page.evaluate((id) => { const g = T.it(id); g.contents.set('wine', 0.5); g.show(); }, kinds.glass); await ac(1200);
    const g1 = await C.page.evaluate((id) => { const g = T.it(id); return { a: { ...g.contents.a }, used: !!g.used, room: T.S.ledger.get(id).m, local: T.S.mode(g) }; }, kinds.glass);
    await A.page.evaluate((id) => T.it(id).take(), kinds.glass); await ac();
    const gAt = await A.page.evaluate((id) => { const g = T.it(id), p = T.a.player.pos, at = new T.V(p.x - 0.4, p.y, p.z + 0.8); g.contents.set('wine', 0.2); g.used = true; g.show(); g.placeAt(at, 0); return [at.x, at.y, at.z]; }, kinds.glass); await ac();
    const g2 = await C.page.evaluate((id) => { const g = T.it(id), i = T.info(id); return { a: { ...g.contents.a }, used: !!g.used, local: i.local, p: i.p }; }, kinds.glass);
    check(g1.a.wine === 0.5 && !g1.used && g1.room === 'world' && g2.a.wine === 0.2 && g2.used && g2.local === 'world' && Math.hypot(g2.p[0] - gAt[0], g2.p[2] - gAt[2]) < 0.05, 'a glass carries its drink: poured at A it is in C\'s glass; drunk from and put down, it stands at C with what is left, used', { g1, g2 });
    await C.page.evaluate(([x, y, z]) => { T.look(x, y + 0.08, z); T.a.step(0.05); }, g2.p);
    await kit.shot(C.page, `${out}/c-sees-the-glass-of-wine-a-put-down.png`);
    // #1976: a coffee cup from the cabinet: out of C's pool while A holds it; put down with coffee it stands at C with A's pattern,
    // the coffee, warm and used; back in A's cabinet it is home (a clean cup) at C
    const cup = await A.page.evaluate(() => { const c = T.it('u0'); c.take(); return { held: c.held, design: c.design }; }); await ac();
    const cupC = await C.page.evaluate(() => { const c = T.it('u0'); return { other: T.S.ledger.heldByOther('u0'), state: c.state, away: !!c.sharedAway, inScene: !!c.model.parent }; });
    const cupAt = await A.page.evaluate(() => { const c = T.it('u0'), p = T.a.player.pos, at = new T.V(p.x - 0.7, p.y, p.z - 0.2); c.contents.set('coffee', 0.6); c.heat = 0.9; c.dirty = true; c.show(); c.placeAt(at, 0.5); return [at.x, at.y, at.z]; }); await ac();
    const cupC2 = await C.page.evaluate(() => { const c = T.it('u0'), i = T.info('u0'); return { state: c.state, design: c.design, a: { ...c.contents.a }, heat: c.heat, dirty: c.dirty, visible: c.model.visible, inScene: !!c.model.parent, p: i.p, away: !!c.sharedAway }; });
    check(cup.held && cupC.other && cupC.state === 'spare' && cupC.away && !cupC.inScene && cupC2.state === 'placed' && cupC2.design === cup.design && cupC2.a.coffee === 0.6 && cupC2.heat > 0.9 && cupC2.dirty && cupC2.visible && cupC2.inScene && !cupC2.away && Math.hypot(cupC2.p[0] - cupAt[0], cupC2.p[2] - cupAt[2]) < 0.05,
      'a coffee cup: out of C\'s pool while A holds it; put down it stands at C with A\'s pattern, the coffee, warm, used', { cup, cupC, cupC2 });
    await C.page.evaluate(([x, y, z]) => { T.look(x, y + 0.05, z); T.a.step(0.05); }, cupC2.p);
    await kit.shot(C.page, `${out}/c-sees-the-cup-of-coffee-a-put-down.png`);
    await A.page.evaluate(() => { const c = T.it('u0'); c.take(); }); await ac();
    await A.page.evaluate(() => { const c = T.it('u0'); c.contents.clear(); c.dirty = false; c.heat = 0; c.show(); c.goHome(); }); await ac();
    const cupC3 = await C.page.evaluate(() => { const c = T.it('u0'); return { room: T.S.ledger.get('u0').m, state: c.state, fill: c.fill, dirty: c.dirty, away: !!c.sharedAway }; });
    check(cupC3.room === 'home' && cupC3.state === 'cabinet' && cupC3.fill === 0 && !cupC3.dirty && !cupC3.away, 'washed and back in A\'s cabinet: a clean cup at home at C', cupC3);
    // #1976: a piece of fruit carries its bites; eaten up it is gone for everybody
    const ap = await A.page.evaluate(async () => { const f = T.it('q0'); f.take(); await T.pump(600); f.biteOff(); f.biteOff(); const p = T.a.player.pos, at = new T.V(p.x + 0.9, p.y, p.z + 0.4); f.placeAt(at, 0.3); return { kind: f.kind, bites: f.bites, scoops: f.scoops.length, at: [at.x, at.y, at.z] }; }); await ac();
    const apC = await C.page.evaluate(() => { const f = T.it('q0'), i = T.info('q0'); return { state: f.state, bites: f.bites, scoops: f.scoops.length, local: i.local, visible: f.model.visible, p: i.p }; });
    check(ap.bites === 2 && apC.state === 'placed' && apC.bites === 2 && apC.scoops === ap.scoops && apC.visible && Math.hypot(apC.p[0] - ap.at[0], apC.p[2] - ap.at[2]) < 0.05, `a piece of fruit (${ap.kind}): bitten twice by A, it lies at C with the same two bites`, { ap, apC });
    await C.page.evaluate(([x, y, z]) => { T.look(x, y + 0.03, z); T.a.step(0.05); }, apC.p);
    await kit.shot(C.page, `${out}/c-sees-the-bitten-fruit-a-put-down.png`);
    await C.page.evaluate(([x, , z]) => { T.stand(x + 0.3, z + 0.8); }, apC.p); await ac(900);
    const eat = await C.page.evaluate(async () => { const f = T.it('q0'); f.take(); await T.pump(700); const held = f.held; for (let k = 0; k < 6 && !f.completed; k++) { f.use(); for (let i = 0; i < 30; i++) T.a.step(1 / 60); } if (f.isRemnant) f.discard(); return { held, state: f.state, bites: f.bites }; }); await ac(2000);
    const apA = await A.page.evaluate(() => { const f = T.it('q0'); return { state: f.state, visible: f.model.visible, bites: f.bites }; });
    check(eat.held && eat.state === 'eaten' && apA.state === 'eaten' && !apA.visible, 'C eats it up: it is gone at A too', { eat, apA });
    // #1976: the coffee jug carries its level away from the machine; the frying pan whether it needs washing up
    const jug = await A.page.evaluate(async () => { const j = T.it('j0'); j.mocca.setFill(0.6); j.take(); await T.pump(600); const p = T.a.player.pos, at = new T.V(p.x + 0.2, p.y, p.z - 0.9); j.placeAt(at, 0); return { fill: j.fill, at: [at.x, at.y, at.z] }; }); await ac();
    const jugC = await C.page.evaluate(() => { const j = T.it('j0'), i = T.info('j0'); return { fill: j.fill, local: i.local, p: i.p }; });
    const panA = await A.page.evaluate(async () => { const n = T.S.items.get('n0')?.item; if (!n) return null; n.take(); await T.pump(600); n.setDirty(true); const p = T.a.player.pos, at = new T.V(p.x - 0.9, p.y, p.z - 0.6); n.placeAt(at, 0); return { at: [at.x, at.y, at.z] }; }); await ac();
    const panC = await C.page.evaluate(() => { const n = T.S.items.get('n0')?.item; if (!n) return null; const i = T.info('n0'); return { dirty: n.dirty, local: i.local, p: i.p, onHob: n.onHob }; });
    check(Math.abs(jugC.fill - 0.6) < 0.01 && jugC.local === 'world' && Math.hypot(jugC.p[0] - jug.at[0], jugC.p[2] - jug.at[2]) < 0.05 && !!panC && panC.dirty && panC.local === 'world' && !panC.onHob && Math.hypot(panC.p[0] - panA.at[0], panC.p[2] - panA.at[2]) < 0.05,
      'the coffee jug stands at C with its coffee, the frying pan with its dirt', { jug, jugC, panA, panC });
    // #1980: fish fingers come out of a carton and are used up: one A takes counts down C's carton and is skipped by C; bitten and
    // put down it lies at C with the bite; C eats it up: gone at A, not back in the carton; one put back in the carton is back for all
    const f0 = await A.page.evaluate(async () => { const pk = T.a.fish; if (!pk) return null; const left0 = pk.left; pk.press(); await T.pump(700); const f = pk.holding; const id = `x${pk.fingers.indexOf(f)}`;
      f.setBites(1); const p = T.a.player.pos, at = new T.V(p.x + 0.5, p.y, p.z + 1.1); f.placeAt(at, 0.4); return { id, left0, left: pk.left, at: [at.x, at.y, at.z] }; }); await ac();
    const fC = await C.page.evaluate((id) => { const pk = T.a.fish, e = T.S.items.get(id); if (!e) return { missing: true, left: pk.left }; const f = e.item, i = T.info(id); return { left: pk.left, state: f.state, bites: f.bites, out: !!f.sharedOut, visible: f.model.visible, p: i.p }; }, f0.id);
    check(!!f0 && f0.left === f0.left0 - 1 && fC.left === f0.left0 - 1 && fC.state === 'placed' && fC.bites === 1 && fC.out && fC.visible, 'a fish finger A took, bit and put down: it lies at C with the bite, and C\'s carton counts one less', { f0, fC });
    const next = await C.page.evaluate(async (id) => { const pk = T.a.fish; pk.press(); await T.pump(600); const f = pk.holding, mine = `x${pk.fingers.indexOf(f)}`; pk.putIn(f); await T.pump(600); return { mine, other: id, left: pk.left }; }, f0.id); await ac(800);
    check(next.mine !== next.other, 'C takes one out of the carton: not the one A has out; put back, the carton counts it again', next);
    await C.page.evaluate(([x, , z]) => { T.stand(x + 0.2, z + 0.7); }, fC.p); await ac(900);
    const ate = await C.page.evaluate(async (id) => { const pk = T.a.fish, f = T.it(id); f.take(); await T.pump(700); const held = f.held; pk.eaten(f); await T.pump(300); return { held, state: f.state, left: pk.left }; }, f0.id); await ac(1500);
    const fA = await A.page.evaluate((id) => { const pk = T.a.fish, f = T.it(id); return { state: f.state, visible: f.model.visible, left: pk.left, room: T.S.ledger.get(id).m }; }, f0.id);
    check(ate.held && fA.state === 'box' && !fA.visible && fA.room === 'home' && fA.left === f0.left, 'C eats it up: gone at A, and A\'s carton does not get it back', { ate, fA });
    // #1980: the bag of fries carries how many portions are left; a bunch out of the basket how many fries and how cooked; cleared away it is gone
    const fr = await A.page.evaluate(async () => { const F = T.a.fries; if (!F) return null; const C = (await import('/src/config.js')).FRIES, bag = F.bag; bag.take(); await T.pump(600); bag.left = 4; bag.shape();
      const p = T.a.player.pos, at = new T.V(p.x + 1.2, p.y, p.z - 0.4); bag.placeAt(at, 0); await T.pump(700);
      return { bagAt: [at.x, at.y, at.z], golden: C.golden }; });
    const bunch = await A.page.evaluate(async () => { const F = T.a.fries, M = await import('/src/fries.js'), C = (await import('/src/config.js')).FRIES;
      let b = F.bunches.find((x) => x.state === 'pool' && !x.sharedOut); if (!b) { b = new M.FriesBunch(F); F.bunches.push(b); F.onNew?.(b); }
      b.fill(3, C.golden + 1, 0); b.take(); await T.pump(700); const p = T.a.player.pos, at = new T.V(p.x + 1.0, p.y, p.z + 0.3); b.placeAt(at, 0.2); return { id: `y${F.bunches.indexOf(b)}`, at: [at.x, at.y, at.z], golden: C.golden }; }); await ac();
    const frC = await C.page.evaluate((id) => { const F = T.a.fries, b = T.S.items.get(id)?.item, bi = T.info('g0'); return { bagLeft: F.bag.left, bagLocal: bi.local, bagP: bi.p, bunch: b && { state: b.state, n: b.n, cook: b.cook, visible: b.model.visible, out: !!b.sharedOut } }; }, bunch.id);
    check(frC.bagLeft === 4 && frC.bagLocal === 'world' && !!frC.bunch && frC.bunch.state === 'placed' && frC.bunch.n === 3 && frC.bunch.cook >= bunch.golden && frC.bunch.visible && frC.bunch.out, 'the bag of fries stands at C with 4 portions left; a golden bunch of three lies there too', { bunch, frC });
    await A.page.evaluate(async (id) => { const b = T.it(id); b.take(); await T.pump(600); b.hide(); }, bunch.id); await ac();
    const frC2 = await C.page.evaluate((id) => { const b = T.it(id); return { state: b.state, visible: b.model.visible, room: T.S.ledger.get(id).m }; }, bunch.id);
    check(frC2.state === 'pool' && !frC2.visible && frC2.room === 'home', 'the bunch eaten / cleared away by A is gone at C', frC2);
    // #1980: a popcorn tub carries how much is left
    const tub = await A.page.evaluate(async () => { const t = T.S.items.get('m0')?.item; if (!t) return null; t.bites = 5; t.show(); t.take(); await T.pump(600); const p = T.a.player.pos, at = new T.V(p.x - 1.1, p.y, p.z + 0.5); t.placeAt(at, 0); return { at: [at.x, at.y, at.z] }; }); await ac();
    const tubC = await C.page.evaluate(() => { const t = T.S.items.get('m0')?.item; if (!t) return null; const i = T.info('m0'); return { bites: t.bites, away: t.away, local: i.local, visible: i.visible, p: i.p }; });
    check(!!tub && !!tubC && tubC.bites === 5 && !tubC.away && tubC.local === 'world' && tubC.visible && Math.hypot(tubC.p[0] - tub.at[0], tubC.p[2] - tub.at[2]) < 0.05, 'a popcorn tub stands at C with the popcorn that is left', { tub, tubC });
    // #1980: the whole chicken carries how far it is cooked and which pieces are gone
    const bird = await A.page.evaluate(async () => { const c = T.S.items.get('i0')?.item; if (!c) return null; c.take({ silent: true }); await T.pump(600);
      c.shareLoad(JSON.stringify({ c: 1, k: 0.2, g: 1, l: 2 })); const p = T.a.player.pos, at = new T.V(p.x + 0.1, p.y, p.z + 1.4); c.placeAt(at, 0); return { at: [at.x, at.y, at.z], done: c.done }; }); await ac();
    const birdC = await C.page.evaluate(() => { const c = T.S.items.get('i0')?.item; if (!c) return null; const i = T.info('i0'); return { done: c.done, burnt: c.burnt, gone: c.parts.map((p) => !!p.gone), body: c.bodyLeft, local: i.local, visible: i.visible, p: i.p, rewarded: c.rewarded }; });
    check(!!bird && bird.done && !!birdC && birdC.done && !birdC.burnt && birdC.gone[0] && !birdC.gone[1] && birdC.body === 2 && birdC.local === 'world' && birdC.visible && Math.hypot(birdC.p[0] - bird.at[0], birdC.p[2] - bird.at[2]) < 0.05,
      'the golden chicken A put down lies at C: cooked, one piece gone, two bites of the body left', { bird, birdC });
    await C.page.evaluate(([x, y, z]) => { T.look(x, y + 0.08, z); T.a.step(0.05); }, birdC.p);
    await kit.shot(C.page, `${out}/c-sees-the-golden-chicken-a-put-down.png`);
    await A.page.evaluate(async () => { const c = T.S.items.get('i0').item; c.take({ silent: true }); await T.pump(600); c.shareLoad(null); c.putBack(); }); await ac(); // (putBack: out of the hand and home)
    const birdC2 = await C.page.evaluate(() => { const c = T.S.items.get('i0').item; return { room: T.S.ledger.get('i0').m, done: c.done, gone: c.parts.some((p) => p.gone), local: T.S.mode(c) }; });
    check(birdC2.room === 'home' && birdC2.local === 'home' && !birdC2.done && !birdC2.gone, 'a fresh bird back in A\'s fridge is a raw whole bird at home at C', birdC2);
    // #1976: a pot from the window board (at home it is part of the merged sill mesh) and the basketball (B has left: A and C)
    const pot = await A.page.evaluate(() => { const it = T.it('l0'); it.take(); return { held: it.held, n: [...T.S.items.keys()].filter((k) => k[0] === 'l').length }; }); await ac();
    const potB = await C.page.evaluate(() => { const it = T.it('l0'); return { other: T.S.ledger.heldByOther('l0'), away: it.away.has(it.pot), groupVisible: it.model.visible }; });
    const potAt = await A.page.evaluate(() => { const p = T.a.player.pos, at = new T.V(p.x + 0.4, p.y, p.z + 0.9); T.it('l0').placeAt(at, 0); return [at.x, at.y, at.z]; }); await ac();
    const potB2 = await C.page.evaluate(() => { const it = T.it('l0'), i = T.info('l0'); return { ...i, away: it.away.has(it.pot), parts: it.model.children.every((m) => m.visible) }; });
    check(pot.held && pot.n > 3 && potB.other && potB.away && !potB.groupVisible && potB2.local === 'world' && potB2.visible && potB2.parts && potB2.away && Math.hypot(potB2.p[0] - potAt[0], potB2.p[2] - potAt[2]) < 0.05,
      'a window-board pot: out of the merged sill mesh and hidden at C while A holds it, its own model standing where A put it', { pot, potB, potB2: potB2.p });
    await C.page.evaluate(([x, y, z]) => { T.look(x, y + 0.1, z); T.a.step(0.05); }, potB2.p);
    await kit.shot(C.page, `${out}/c-sees-the-pot-a-put-down.png`);
    const ball = await A.page.evaluate(() => { const it = T.it('o0'); it.take(); return { held: it.held }; }); await ac();
    const ballB = await info(C, 'o0');
    await A.page.evaluate(() => T.it('o0').putBack()); await ac();
    const ballB2 = await info(C, 'o0');
    check(ball.held && ballB.other && !ballB.visible && ballB2.room === 'home' && ballB2.visible, 'the basketball: gone at C while A has it, home again when A puts it back', { ball, ballB, ballB2 });
    // #1978: everybody leaves; a new player later finds the bow where A put it (saved by the room), and nothing is held
    await A.ctx.close(); await C.ctx.close();
    await new Promise((r) => setTimeout(r, 1500));
    const D = await open('Dag');
    await D.page.evaluate(() => T.pump(1200));
    const dd = { bow: await info(D, 'a0'), saber: await info(D, 's0'), b0: await info(D, 'b0'), book: await info(D, 'p0') };
    check(dd.bow.local === 'world' && dd.bow.room === 'world' && dd.bow.visible && Math.hypot(dd.bow.p[0] - bowAt[0], dd.bow.p[2] - bowAt[2]) < 0.05 && dd.book.local === 'world' && dd.saber.room === 'home' && dd.b0.room === 'home' && dd.b0.visible,
      'everybody left: a new player finds what was put down still lying there; what was held is home', dd);
    await D.page.evaluate(([x, y, z]) => { T.stand(x + 0.2, z + 1.6); T.look(x, y + 0.05, z); T.a.step(0.05); }, dd.bow.p);
    await kit.shot(D.page, `${out}/d-finds-the-bow-after-everybody-left.png`);
    check(errors.length === 0, 'no page errors', errors);
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
