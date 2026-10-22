// Focused real-Three component test; native E/touch belongs to Santa's integrated route check.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(process.argv[2] || 'http://localhost:8000', { waitUntil: 'domcontentloaded' });
    const first = await page.evaluate(async () => {
      const T = await import('three'), { ChristmasGifts } = await import('/src/santagifts.js');
      const { heldItem, stowBicycleHand, restoreBicycleHand } = await import('/src/holdable.js');
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(), messages = [], registry = [];
      scene.add(camera); camera.position.set(0, 1.7, 0);
      const g = new ChristmasGifts(scene, camera, { random: () => 0, onMessage: m => messages.push(m), onItem: h => registry.push(h), floorY: () => 0 });
      const a = g.give(), busy = g.give() === null && heldItem() === a && g.items.length === 1;
      stowBicycleHand(); const stowedBusy = g.give() === null; restoreBicycleHand();
      const before = g.saveState(); a.use(); const one = heldItem() === a && a.opened && a.name === 'leksaksbilen';
      const count = a.model.children.length; a.cool = 0; a.use();
      const once = a.model.children.length === count && messages.filter(m => m.startsWith('Du fick')).length === 1;
      a.placeAt(new T.Vector3(1, .75, 2), .3); const after = g.saveState();
      a.take(); a.putBack(); const lastHome = Math.abs(a.model.position.y - after.items[0].p[1]) < 1e-8;
      const kinds = [a.name];
      for (const r of [.4, .9]) { g.random = () => r; const item = g.give(); item.use(); kinds.push(item.name); item.placeAt(new T.Vector3(2, 0, 1), 0); }
      const pile = new ChristmasGifts(scene, camera), bottom = pile.give();
      bottom.placeAt(new T.Vector3(4, 0, 4), 2.2);
      const ray = new T.Raycaster(new T.Vector3(4, 2, 4), new T.Vector3(0, -1, 0), 0, 3);
      const middle = pile.give(), hit1 = pile.stackHit(ray, middle);
      middle.placeAt(hit1.point, hit1.stackYaw);
      const upper = pile.give(), hit2 = pile.stackHit(ray, upper);
      upper.placeAt(hit2.point, hit2.stackYaw);
      const box = h => new T.Box3().setFromObject(h.model);
      const fits = (upper, lower) => {
        const a = box(upper), b = box(lower);
        return a.min.x >= b.min.x - 1e-8 && a.max.x <= b.max.x + 1e-8 && a.min.z >= b.min.z - 1e-8 && a.max.z <= b.max.z + 1e-8 && Math.abs(a.min.y - b.max.y - .001) < 1e-8;
      };
      const stack3 = hit1.stackSupport === bottom && hit2.stackSupport === middle && fits(middle, bottom) && fits(upper, middle) && Math.abs(hit1.stackYaw - 2.2) < 1e-8;
      const pileState = pile.saveState();
      middle.take(); const reflow = fits(upper, bottom) && upper.stackSupport === bottom.giftId;
      const self = pile.stackHit(new T.Raycaster(new T.Vector3(10, 2, 10), new T.Vector3(0, -1, 0)), middle) === null;
      const underside = pile.stackHit(new T.Raycaster(new T.Vector3(4, -1, 4), new T.Vector3(0, 1, 0)), middle) === null;
      const side = pile.stackHit(new T.Raycaster(new T.Vector3(3, .05, 4), new T.Vector3(1, 0, 0)), middle) === null;
      middle.putBack();
      const returnFits = fits(middle, upper) && middle.stackSupport === upper.giftId;
      return { busy, stowedBusy, one, once, lastHome, kinds, before, after, registered: registry.length, pileState, stack3, reflow, self, underside, side, returnFits };
    });
    for (const k of ['busy', 'stowedBusy', 'one', 'once', 'lastHome']) assert(first[k], k);
    assert.deepEqual(first.kinds, ['leksaksbilen', 'kritorna', 'kristallen']); assert.equal(first.registered, 3);
    for (const k of ['stack3', 'reflow', 'self', 'underside', 'side', 'returnFits']) assert(first[k], k);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = await page.evaluate(async ({ before, after, pileState }) => {
      const T = await import('three'), { ChristmasGifts } = await import('/src/santagifts.js'), { heldItem, setHeld } = await import('/src/holdable.js');
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(); scene.add(camera);
      const g = new ChristmasGifts(scene, camera, { random: () => { throw Error('restore must never reroll'); } });
      g.loadState(before); const item = heldItem(); item.use();
      const stable = item.giftKind === 'car' && item.opened && g.items.length === 1;
      g.loadState(before); const idempotent = g.items.length === 1 && item.opened;
      setHeld(null);
      const p = new ChristmasGifts(scene, camera); p.loadState(after);
      const placed = p.items[0], pose = placed.model.position.toArray().every((v, i) => Math.abs(v - after.items[0].p[i]) < 1e-8);
      const noWrapping = placed.opened && placed.model.children.length === 6 && placed.model.children.every(o => o.userData.door === placed.takeTarget);
      placed.take(); const takeable = heldItem() === placed;
      setHeld(null);
      const pile = new ChristmasGifts(scene, camera); pile.loadState(pileState);
      const pilePose = pile.items.every((h, i) => h.model.position.toArray().every((n, axis) => Math.abs(n - pileState.items[i].p[axis]) < 1e-8));
      const pileLinks = pile.items[1].stackSupport === pile.items[0].giftId && pile.items[2].stackSupport === pile.items[1].giftId;
      pile.items[0].take();
      const baseRemoved = Math.abs(new T.Box3().setFromObject(pile.items[1].model).min.y - .001) < 1e-8;
      return { stable, idempotent, pose, noWrapping, takeable, pilePose, pileLinks, baseRemoved };
    }, first);
    for (const [k, v] of Object.entries(restored)) assert(v, k);
    assert.deepEqual(errors, []);
    console.log('PASS gifts: hands, three trinkets, one opening, save/reload, no paper; three-parcel pile, fitted tops, side/underside rejection, support removal and restored pile');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
