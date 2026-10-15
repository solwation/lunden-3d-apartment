// #1056: actual FruitBowl, Life waste actions, persistence and bicycle hand adapter in native Chromium.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8951', out = process.argv[3] || '/tmp/lunden-fruit-1056/native';
const root = path.resolve(__dirname, '..');
const files = ['src/fruit.js', 'src/main.js', 'src/config.js', 'src/life.js', 'src/cooking.js', 'src/waste.js', 'src/keep.js', 'src/holdable.js', 'tools/fruitremainstest.cjs'];
const hashes = () => Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')]));
const source = hashes(), checks = [], errors = [];
fs.mkdirSync(out, { recursive: true });
function check(ok, label, data) { checks.push({ ok: !!ok, label, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); fs.writeFileSync(out + '/checkpoint.json', JSON.stringify({ checks, errors, source }, null, 2)); }
let browser;
(async () => { try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } }), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(10000);
  await page.route('**/src/bootstrap.js*', r => r.fulfill({ contentType: 'text/javascript', body: '// component fixture, no World' }));
  async function setup() {
    await page.goto(base);
    await page.evaluate(async () => {
      window.T = await import('three'); window.H = await import('/src/holdable.js'); window.K = await import('/src/keep.js');
      const { FruitBowl } = await import('/src/fruit.js'), { Life } = await import('/src/life.js');
      window.scene = new T.Scene(); window.camera = new T.PerspectiveCamera(45, 800 / 500, .01, 10); scene.add(camera);
      window.bowl = new FruitBowl(scene, camera); window.life = new Life({ scene, camera }); bowl.initLife(life);
      window.events = []; bowl.onEaten = f => events.push(['eaten', f.kind]); bowl.onConsume = (f, id) => events.push(['consume', id]);
      life.onEvent((k, d) => events.push([k, d]));
      window.banana = bowl.fruit.find(f => f.kind === 'banana'); window.apple = bowl.fruit.find(f => f.kind === 'apple');
      window.eat = f => { f.use(); f.update(.21); f.update(.21); };
      window.finish = f => { f.take(); for (let i = 0; i < 4; i++) eat(f); };
      window.binFood = life.create('binFood', { at: 'world', pos: [0, 0, 0], yaw: 0 });
      window.binPack = life.create('binPack', { at: 'world', pos: [1, 0, 0], yaw: 0 });
      window.trashRow = bin => life.options(life.view(bin).target).find(a => a.id === 'throwAway');
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0; background:#b7c5cc';
    });
  }
  await setup();
  let data = await page.evaluate(() => {
    banana.take(); const label = banana.useLabel, row = trashRow(binFood); eat(banana);
    const peeled = banana.peeled && banana.bites === 1; const before = banana.model.geometry.attributes.position.array.slice();
    const rot = banana.model.quaternion.clone(); const high = new T.Vector3(-.095, 0, 0).applyQuaternion(rot).y, low = new T.Vector3(.095, 0, 0).applyQuaternion(rot).y;
    eat(banana); const p = banana.model.geometry.attributes.position;
    const xs = [...Array(p.count)].map((_, i) => p.getX(i)), beforeXs = [...Array(p.count)].map((_, i) => before[i * 3]);
    return { label, wholeRejected: !!row?.reason, peeled, high, low, min: Math.min(...xs), initialMin: Math.min(...beforeXs), max: Math.max(...xs), initialMax: Math.max(...beforeXs), normalX: banana.scoops[0].n.x };
  });
  check(data.label === 'Ät' && data.wholeRejected && data.peeled, 'whole fruit cannot be discarded and first banana action peels', data);
  check(data.high > data.low && data.min > data.initialMin && data.max === data.initialMax && data.normalX < 0, 'banana clipping removes held top while retaining bottom', data);
  async function shot(name, kind, state) {
    await page.evaluate(({ kind, state }) => {
      const f = kind === 'banana' ? banana : apple; H.heldItem()?.putBack(); bowl.reset();
      f.take(); const bites = state === 'whole' ? 0 : state === 'peeled' ? 1 : state === 'bite' ? 2 : 4;
      for (let i = 0; i < bites; i++) eat(f);
      scene.background = new T.Color(0xb7c5cc); bowl.group.visible = false;
      if (!window.renderer) { window.renderer = new T.WebGLRenderer({ antialias: true }); renderer.setSize(800, 500); document.body.append(renderer.domElement); scene.add(new T.HemisphereLight(0xffffff, 0x665747, 3)); const light = new T.DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 3); scene.add(light); }
      renderer.render(scene, camera);
    }, { kind, state });
    await page.screenshot({ path: out + '/' + name + '.png' });
  }
  await shot('banana-peeled', 'banana', 'peeled'); await shot('banana-top-bite', 'banana', 'bite'); await shot('banana-peel', 'banana', 'remains'); await shot('apple-core', 'apple', 'remains');
  await setup();
  for (const kind of ['banana', 'apple']) {
    data = await page.evaluate(kind => {
      const f = kind === 'banana' ? banana : apple; finish(f);
      const beforeEvents = events.length; f.use(); f.update(1); bowl.eaten(f);
      const retained = H.heldItem() === f && f.held && f.model.visible && (f.model.geometry === f.remains) && !f.useLabel && f.wasteKind === 'food';
      const quiet = events.length === beforeEvents;
      f.placeAt(new T.Vector3(2, .8, 3), .5); const pose = f.model.position.toArray(); const picked = bowl.targets().includes(f.model); f.target.toggle();
      f.model.updateWorldMatrix(true, true);
      const center = new T.Box3().setFromObject(f.model).getCenter(new T.Vector3()), ray = new T.Raycaster(camera.getWorldPosition(new T.Vector3()), center.clone().sub(camera.getWorldPosition(new T.Vector3())).normalize());
      const hits = ray.intersectObject(f.model, true), remnantHit = hits.some(h => h.object === f.model && h.object.userData.door === f.target);
      const wrong = trashRow(binPack); const saved = life.serialize(); f.placeAt(new T.Vector3(2, .8, 3), .5); window.saved = life.serialize();
      const counts = events.filter(e => e[0] === 'consume').length; return { retained, quiet, picked, remnantHit, name: f.name, wrong: wrong?.reason, counts, pose, kept: saved.x.fruitRemains };
    }, kind);
    check(data.retained && data.quiet && data.picked && data.remnantHit && data.counts === 1 && data.wrong?.includes('Matavfall'), kind + ' leaves named non-edible remains that can be placed, picked up and correctly sorted', data);
    // Genuine document reload, with actual Life serialize/load; no consume event can replay.
    await page.evaluate(() => sessionStorage.setItem('fruit-remains-test', JSON.stringify(saved)));
    await page.reload(); await setup();
    data = await page.evaluate(kind => {
      life.load(JSON.parse(sessionStorage.getItem('fruit-remains-test')));
      binFood = life.items.get(binFood.id); binPack = life.items.get(binPack.id);
      const f = kind === 'banana' ? banana : apple; const pose = f.model.position.toArray(); const quiet = !events.length;
      f.take(); H.stowBicycleHand();
      const app = { life, bicycleStow: { fruit: bowl } }; window.bikeSaved = K.saveWorld(app);
      H.restoreBicycleHand(); f.putBack();
      return { pose, quiet, state: f.state, saved: bikeSaved.bicycleHand, waste: f.wasteKind };
    }, kind);
    check(data.pose[0] === 2 && data.pose[1] === .801 && data.pose[2] === 3 && data.quiet && data.waste === 'food', kind + ' actual reload restores exact placed remains silently', data);
    check(data.saved?.kind === 'fruit' && data.saved.state.bites === 4 && data.saved.state.scoops.length === 0, kind + ' Life-restored remains serialize canonical terminal bicycle hand', data.saved);
    await page.evaluate(() => sessionStorage.setItem('fruit-bike-test', JSON.stringify(bikeSaved)));
    await page.reload(); await setup();
    data = await page.evaluate(kind => {
      K.loadWorld({ life, bicycleStow: { fruit: bowl } }, JSON.parse(sessionStorage.getItem('fruit-bike-test')));
      binFood = life.items.get(binFood.id); binPack = life.items.get(binPack.id);
      const f = kind === 'banana' ? banana : apple; const restored = H.heldItem() === f && f.held && f.isRemnant && !events.length;
      const fullAmount = life.items.def(binFood).capacity; life.items.setAmount(binFood, fullAmount);
      const fullBlocked = !!trashRow(binFood)?.reason && f.held; life.items.setAmount(binFood, 0);
      const row = trashRow(binFood); const ready = !row.reason; row.run();
      const gone = !H.heldItem() && !f.model.visible && f.state === 'eaten'; const amount = binFood.amount;
      f.discard(); const noDouble = binFood.amount === amount;
      window.discarded = life.serialize(); return { restored, fullBlocked, ready, gone, noDouble, amount, consumes: events.filter(e => e[0] === 'consume').length, thrown: events.filter(e => e[0] === 'thrown').length };
    }, kind);
    check(data.restored && data.fullBlocked && data.ready && data.gone && data.noDouble && data.amount === 2 && data.consumes === 0 && data.thrown === 1, kind + ' bike reload restores same non-edible remains; actual food bin accepts once and full bin preserves hand', data);
    await page.evaluate(() => sessionStorage.setItem('fruit-discarded-test', JSON.stringify(discarded)));
    await page.reload(); await setup();
    data = await page.evaluate(kind => { life.load(JSON.parse(sessionStorage.getItem('fruit-discarded-test'))); const f = kind === 'banana' ? banana : apple;
      const gone = f.state === 'eaten' && !f.model.visible && !bowl.targets().includes(f.model) && !events.length;
      bowl.reset(); const fresh = f.state === 'bowl' && !f.isRemnant && f.bites === 0 && f.useLabel === null && !(f.model.geometry === f.remains) && f.model.geometry.drawRange.count === Infinity;
      return { gone, fresh, saved: bowl.saveRemains() }; }, kind);
    check(data.gone && data.fresh && data.saved.pieces.length === 0, kind + ' discarded remains stay gone on reload and F replenishes whole fruit', data);
  }
  data = await page.evaluate(() => {
    bowl.reset(); finish(apple); apple.putBack(); const before = JSON.stringify(bowl.saveRemains());
    for (const bad of [{ v: 2, pieces: [] }, { v: 1, pieces: [{ slot: 0, state: 'placed', generation: 0, pos: [NaN, 1, 0], yaw: 0 }] }, { v: 1, pieces: [{ slot: 0, state: 'bowl', generation: 0 }, { slot: 0, state: 'bowl', generation: 0 }] }]) bowl.loadRemains(bad);
    const unchanged = before === JSON.stringify(bowl.saveRemains());
    const orange = bowl.fruit.find(f => f.kind === 'orange'); finish(orange); const original = orange.state === 'eaten' && !orange.model.visible && !H.heldItem();
    return { unchanged, original };
  });
  check(data.unchanged && data.original, 'malformed optional remains saves are atomic; other fruit keeps original completion behavior', data);
  check(errors.length === 0, 'zero native browser exceptions', errors);
  check(JSON.stringify(source) === JSON.stringify(hashes()), 'all executed sources and producer remain frozen');
  fs.writeFileSync(out + '/result.json', JSON.stringify({ checks, errors, source, limits: 'Native FruitBowl/Life/waste/keep with minimal bin placement; screenshots render actual held fruit in a component scene. No World, physical-phone, production or FPS claim.' }, null, 2));
  process.exitCode = checks.every(c => c.ok) ? 0 : 1;
} catch (e) { console.error(e); fs.writeFileSync(out + '/failure.json', JSON.stringify({ checks, errors, error: e.stack }, null, 2)); process.exitCode = 1; } finally { await browser?.close(); } })();
