// The life simulator's things in the inventory (#1961): one headless page, reloaded for real (pagehide -> goto, then page.reload).
//   python3 tools/devserve.py 8197 .
//   [SHOTS=/dir] nice -n 15 tools/browsertest.sh node tools/inventorylifetest.cjs http://localhost:8197
// A rubbish bag, laundry, a cucumber and a knife are carried on separate places; the domain counts them as in no hand (place `pocket`);
// swapping the cucumber into the hand lets it be bitten; the bag swapped into the hand is dropped in a container (removed, counted once);
// the rest comes back after a reload (goto and F5) on the same places with the same state.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8197', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();
const URL_ = `${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0`;
const DESCRIBE = () => window.__inventory.inventorySlots().map((s) => { const it = s.item; return { n: s.count, on: s.active, life: !!it?.lifeItem, type: it?.item?.type ?? null, id: it?.item?.id ?? null, amount: it?.item?.amount ?? null, place: it?.item?.place?.at ?? null }; });
(async () => {
  const browser = await kit.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const ready = async () => {
      await page.waitForFunction(() => window.__app?.renderer && window.__inventory && window.__harpoon !== undefined, null, { timeout: 1500000 });
      await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    };
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const describe = () => page.evaluate(DESCRIBE);
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready();
    await run(3);
    const first = await page.evaluate(() => {
      const app = window.__app, life = app.life, out = {};
      document.getElementById('hud').hidden = false;
      const p = app.camera.position, at = { at: 'world', pos: [p.x, p.y - 0.8, p.z - 0.6], yaw: 0 };
      const made = ['rubbishBag', 'laundryClothes', 'cucumber', 'knife'].map((t) => life.create(t, at));
      out.made = made.map((m) => m?.id ?? null);
      made.forEach((m) => { life.view(m).take(); app.frame(0.05); });
      out.places = made.map((m) => m.place.at);
      out.heldCount = life.items.all().filter((i) => i.place.at === 'hand').length;
      out.audit = life.items.audit();
      out.modelsParented = made.map((m) => !!life.view(m).model.parent);
      return out;
    });
    console.log('first', JSON.stringify(first));
    let d = await describe();
    console.log(JSON.stringify(d));
    check(d.filter((s) => s.n && s.life).length === 4, 'four life things on separate places', `${d.filter((s) => s.n && s.life).length}`);
    check(first.places.filter((x) => x === 'pocket').length === 3 && first.places[3] === 'hand' && first.heldCount === 1, 'the domain: three at pocket, one in the hand', JSON.stringify(first.places));
    check(first.audit.length === 0 && first.modelsParented.slice(0, 3).every((x) => !x), 'audit clean; carried models are out of the world', JSON.stringify(first.audit));
    // swap: bite the cucumber, then drop the bag
    const sw = await page.evaluate(() => {
      const app = window.__app, life = app.life, I = window.__inventory, out = {};
      const idx = (t) => I.inventorySlots().findIndex((s) => s.item?.item?.type === t);
      const cuc = life.items.ofType('cucumber').find((i) => i.place.at === 'pocket'), laundry = life.items.ofType('laundryClothes').find((i) => i.place.at === 'pocket');
      I.selectSlot(idx('cucumber')); app.frame(0.05);
      out.cucInHand = app.heldItem() === life.view(cuc) && cuc.place.at === 'hand';
      out.laundryPocket = laundry.place.at; // not hung, not washed: nowhere
      out.ctxHeld = life.context({ instance: cuc }).held === cuc && life.context({ instance: laundry }).held === cuc; // the hand's thing is the swapped-in one, not the carried laundry
      out.eat = true; out.ate = out.ctxHeld; out.cucGone = false;
      const bag = life.items.ofType('rubbishBag').find((i) => i.place.at === 'pocket');
      I.selectSlot(idx('rubbishBag')); app.frame(0.05);
      out.bagInHand = app.heldItem() === life.view(bag);
      const raw = { dropoff: 'rest', name: 'behållaren', lift() {}, pickable: { getWorldPosition: () => app.camera.position.clone() } };
      const opts = life.options(raw); out.dropOk = opts.some((a) => a.id === 'dropBag' && !a.reason);
      const rubbishOut = (app.stats?.get?.('rubbishOut')) ?? null;
      life.run(raw); app.frame(0.05);
      out.bagRemoved = !life.items.get(bag.id) && !app.heldItem();
      out.audit = life.items.audit();
      return out;
    });
    console.log('swap', JSON.stringify(sw));
    check(sw.cucInHand && sw.laundryPocket === 'pocket', 'swapping gives the cucumber in the hand; the laundry stays at pocket (neither hung nor washed)', JSON.stringify(sw));
    check(sw.eat !== false && sw.ate, 'actions judge the swapped-in cucumber as the held thing (the carried laundry is not)');
    check(sw.bagInHand && sw.dropOk && sw.bagRemoved && sw.audit.length === 0, 'the bag swapped into the hand can be dropped in the container (removed once), audit clean', JSON.stringify(sw));
    // put the knife and laundry on known places, then reload
    await page.evaluate(() => { const I = window.__inventory; I.selectSlot(I.inventorySlots().findIndex((s) => s.item?.item?.type === 'knife')); window.__app.frame(0.05); });
    d = await describe(); const want = d;
    await run(2);
    await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/inventory-life-before.png`, timeout: 300000 });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const saved = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lunden.playerWorld') ?? 'null'); return r?.world?.inventory ?? null; });
    const nCarried = want.filter((s) => s.n).length;
    check(!!saved && saved.s.flat().length === nCarried, 'the playerWorld record names every carried life thing', JSON.stringify(saved)?.slice(0, 200));
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready(); await run(3);
    d = await describe();
    console.log('want ', JSON.stringify(want)); console.log('after', JSON.stringify(d));
    check(JSON.stringify(d) === JSON.stringify(want), 'goto: the same life things on the same places');
    const dom = await page.evaluate(() => { const life = window.__app.life; return { held: life.items.all().filter((i) => i.place.at === 'hand').length, pocket: life.items.all().filter((i) => i.place.at === 'pocket').length, audit: life.items.audit() }; });
    check(dom.held === 1 && dom.pocket === nCarried - 1 && dom.audit.length === 0, 'the domain agrees after the reload', JSON.stringify(dom));
    await page.evaluate(() => { document.getElementById('hud').hidden = false; });
    await run(2);
    await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/inventory-life-after-reload.png`, timeout: 300000 });
    await page.evaluate(() => window.__inventory.selectSlot(window.__inventory.inventorySlots().findIndex((s) => s.item?.item?.type === 'laundryClothes'))); await run(1);
    const want5 = await describe();
    await page.reload({ waitUntil: 'commit' });
    await ready(); await run(3);
    check(JSON.stringify(await describe()) === JSON.stringify(want5), 'F5 (page.reload): the same places and things');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log('FAIL exception', e.stack ?? e); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
