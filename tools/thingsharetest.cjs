// #1975 (part of #1964): the weapons and tools one player puts down are seen and can be taken by the others. Two real clients (A, B)
// and a late third (C) against the local Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/thingsharetest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// Checks: the same id list at every client; A takes the lightsaber: it is gone at B and B cannot take it; A puts it down: it lies at
// the same place at B; B takes it: gone at A; both take a wand at once: exactly one keeps it; a thing carried in A's inventory is away
// at B; a late C sees what is held and what lies; B leaves: what B held is home again at A. Screenshots: B's and C's view of the
// saber lying where A put it.
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
      drinks: [...T.S.items.values()].filter((e) => ['Bottle', 'Glass'].includes(e.item.constructor.name) || e.item.isCup).length, first: [...T.S.items.keys()].find((k) => k[0] === 't') }));
    check(kinds.book && kinds.remote && kinds.t > 0 && kinds.drinks === 0, 'the book, the remote and the loose ornaments are registered; nothing with contents', kinds);
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
    check(errors.length === 0, 'no page errors', errors);
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
