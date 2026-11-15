// #1977 (part of #1964): shared things together with the inventory (#1954) and its save (#1959). Two real clients against the local
// Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/thinginventorytest.cjs http://localhost:8196 http://localhost:8197
// Checks: a thing on a place of A's inventory is away for B and cannot be taken; swapping places sends nothing; A reloads the page:
// the saved inventory is restored and what A carries is A's again for B; A leaves with two things carried: they are home at B, B
// takes one; A comes back: the thing B took is dropped from A's saved inventory (never two of it), the other is carried as before.
const kit = require('./testkit.cjs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197'] = process.argv.slice(2);
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
  window.T = { a, S: __thingShare,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    it(id) { return __thingShare.items.get(id).item; },
    info(id) { const it = T.it(id), r = __thingShare.ledger.get(id); return { local: __thingShare.mode(it), room: r.m, mine: r.by === __ghosts.me, other: __thingShare.ledger.heldByOther(id), visible: it.model.visible, inHand: a.heldItem() === it, held: it.held }; },
    slots() { return __inventory.inventorySlots().map((s) => s.item?.name ?? null); },
    sent() { return __ghosts.messages; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&quality=0&cloud=${worker}`; // (no &at: a camera placed by the URL starts without the saved world; no &test: test mode neither reads nor writes the save)
    const ready = async (page, name) => { page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected && window.__thingShare?.live && window.__inventory, null, { timeout: 900000 }); await page.evaluate(setup); };
    const open = async (name) => { const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript((n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
      const page = await ctx.newPage(); await page.goto(q, { waitUntil: 'commit' }); await ready(page, name); return { ctx, page }; };
    const A = await open('Anna'), B = await open('Bo');
    const both = async (ms = 1500) => { await Promise.all([A.page.evaluate((ms) => T.pump(ms), ms), B.page.evaluate((ms) => T.pump(ms), ms)]); };
    const info = (c, id) => c.page.evaluate((id) => T.info(id), id);
    await both(1000);
    // A carries the saber on a place of the inventory and holds the bow
    await A.page.evaluate(async () => { T.it('s0').take(); await T.pump(500); T.it('a0').take(); }); await both();
    let a = { saber: await info(A, 's0'), bow: await info(A, 'a0'), slots: await A.page.evaluate(() => T.slots()) }, b = { saber: await info(B, 's0'), bow: await info(B, 'a0') };
    check(a.saber.local === 'held' && !a.saber.inHand && a.bow.inHand && a.saber.mine && a.bow.mine && b.saber.other && b.bow.other && !b.saber.visible && !b.bow.visible, 'a thing on a place of A\'s inventory and the one in the hand are both A\'s: away at B', { a, b });
    const tried = await B.page.evaluate(() => { const it = T.it('s0'); it.take(); return { held: it.held }; });
    check(!tried.held, 'B cannot take what A carries in the inventory', tried);
    // swapping places sends nothing about the things
    const sw = await A.page.evaluate(async () => { const n0 = T.S.ledger.n; __inventory.selectSlot(0); await T.pump(500); __inventory.selectSlot(1); await T.pump(500); return { requests: T.S.ledger.n - n0, hand: T.a.heldItem()?.name }; });
    check(sw.requests === 0, 'swapping inventory places sends nothing to the room', sw);
    // A reloads the page (a real reload: pagehide saves, the new page restores the inventory)
    await A.page.reload({ waitUntil: 'commit' }); await ready(A.page, 'Anna'); await both(2500);
    a = { saber: await info(A, 's0'), bow: await info(A, 'a0'), slots: await A.page.evaluate(() => T.slots()) }; b = { saber: await info(B, 's0'), bow: await info(B, 'a0') };
    check(a.slots.filter(Boolean).length === 2 && a.saber.local === 'held' && a.bow.local === 'held' && a.saber.mine && a.bow.mine && b.saber.other && b.bow.other, 'after A\'s reload the saved inventory is back and what A carries is A\'s again for B', { a, b });
    // A leaves with both carried; B takes the saber meanwhile; A comes back
    await A.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await A.page.close();
    await B.page.evaluate(() => T.pump(2500));
    b = { saber: await info(B, 's0'), bow: await info(B, 'a0') };
    check(b.saber.room === 'home' && b.bow.room === 'home' && b.saber.visible, 'A left: what A carried is home again at B', b);
    await B.page.evaluate(() => T.it('s0').take()); await B.page.evaluate(() => T.pump(1500));
    const page2 = await A.ctx.newPage(); A.page = page2; await page2.goto(q, { waitUntil: 'commit' }); await ready(page2, 'Anna'); await both(2500);
    a = { saber: await info(A, 's0'), bow: await info(A, 'a0'), slots: await A.page.evaluate(() => T.slots()) }; b = { saber: await info(B, 's0'), bow: await info(B, 'a0') };
    check(a.saber.other && a.saber.local === 'home' && !a.saber.visible && !a.saber.held && !a.slots.includes(await A.page.evaluate(() => T.it('s0').name)), 'A is back: the saber B took meanwhile is dropped from A\'s saved inventory (never two of it)', { a: a.saber, slots: a.slots });
    check(a.bow.local === 'held' && a.bow.mine && b.bow.other && b.saber.inHand && b.saber.mine, 'the bow is carried by A as before and away at B; B still holds the saber', { a: a.bow, b });
    check(errors.length === 0, 'no page errors', errors);
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
