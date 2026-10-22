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
      return { busy, stowedBusy, one, once, lastHome, kinds, before, after, registered: registry.length };
    });
    for (const k of ['busy', 'stowedBusy', 'one', 'once', 'lastHome']) assert(first[k], k);
    assert.deepEqual(first.kinds, ['leksaksbilen', 'kritorna', 'kristallen']); assert.equal(first.registered, 3);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = await page.evaluate(async ({ before, after }) => {
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
      return { stable, idempotent, pose, noWrapping, takeable };
    }, first);
    for (const [k, v] of Object.entries(restored)) assert(v, k);
    assert.deepEqual(errors, []);
    console.log('PASS gifts: occupied/stowed hands, three existing trinkets, one opening, registry, save/reload, stable result, placement and no paper');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
