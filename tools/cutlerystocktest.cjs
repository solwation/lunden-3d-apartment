// #1052: actual plan kitchen/contents/Openable, bounded render without the full World.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8912';
const out = process.argv[3] || '/tmp/lunden-start-1052/candidate';
const baseline = process.argv.includes('--baseline');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js*', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
    if (baseline) await page.route('**/src/kitchenstuff.js', r => r.fulfill({
      body: fs.readFileSync(process.env.BASELINE_FILE || '/tmp/lunden-start-1052/baseline/kitchenstuff.js'), contentType: 'application/javascript' }));
    await page.goto(base + '/?cloud=');
    const result = await page.evaluate(async () => {
      const T = await import('three');
      const { buildInterior } = await import('/src/interior.js');
      const { KITCHEN: K, LEVELS } = await import('/src/config.js');
      const plan = await (await fetch('/data/plan.json')).json(), floor = structuredClone(plan.floors[0]);
      const inside = r => r.x0 >= K.area.x0 && r.x1 <= K.area.x1 && r.z0 >= K.area.z0 && r.z1 <= K.area.z1;
      floor.cabinets = floor.cabinets.filter(inside); floor.fixtures = floor.fixtures.filter(inside); floor.windows = [];
      const scene = new T.Scene(), group = new T.Group(), fronts = [];
      scene.background = new T.Color(0xe8e7e2); scene.add(group);
      buildInterior(group, floor, 0, LEVELS[0].floor, LEVELS[0].ceiling, [], new Set(), [], fronts);
      const drawer = fronts.find(o => o.stock === 'cutlery');
      if (!drawer) throw Error('Production cutlery drawer missing');
      scene.add(new T.HemisphereLight(0xeaf3ff, 0xd6d2ca, 2.5), new T.AmbientLight(0xffffff, .6));
      const sun = new T.DirectionalLight(0xfff1df, 2); sun.position.set(2, 5, 1); scene.add(sun);
      const camera = new T.PerspectiveCamera(42, 1100 / 760, .01, 30);
      const renderer = new T.WebGLRenderer({ antialias: true }); renderer.setSize(1100, 760); renderer.setPixelRatio(1);
      renderer.toneMapping = T.ACESFilmicToneMapping; document.body.replaceChildren(renderer.domElement);
      // Inspect each real builder output against its own compartment, not only the aggregate envelope.
      const { fillKitchen, KM } = await import('/src/kitchenstuff.js');
      const b = drawer.stockFrame.b, innerW = b.a1 - b.a0 - .028;
      const n = Math.min(6, Math.max(3, Math.floor(innerW / .10))), cw = innerW / n;
      let pieces = 0, piecesWithinCompartments = true;
      fillKitchen({ at: (u, d) => [u, d], box() {}, add(g, material) {
        if (material === KM.steel) {
          pieces++; g.computeBoundingBox(); const a = g.boundingBox;
          const cell = Math.floor(((a.min.x + a.max.x) / 2 - b.a0 - .014) / cw);
          const lo = b.a0 + .014 + cell * cw, hi = lo + cw;
          piecesWithinCompartments &&= a.min.x > lo + .002 && a.max.x < hi - .002
            && a.min.z > b.d0 + .014 && a.max.z < b.d1 - .014;
        }
        g.dispose();
      } }, 'cutlery', b);
      const meshes = drawer.contents.children.map(m => ({color: m.material.color.getHexString(), triangles: (m.geometry.index?.count || m.geometry.attributes.position.count) / 3}));
      scene.updateMatrixWorld(true);
      const steel = drawer.contents.children.find(m => m.material.color.getHexString() === 'c4c8cb');
      const plastic = drawer.contents.children.find(m => m.material.color.getHexString() === 'e8ecee');
      const steelBox = new T.Box3().setFromObject(steel), trayBox = new T.Box3().setFromObject(plastic);
      // The existing spoon shell reaches 1.5 mm below the insert bottom; record it separately.
      const contained = steelBox.min.x >= trayBox.min.x && steelBox.max.x <= trayBox.max.x
        && steelBox.min.z >= trayBox.min.z && steelBox.max.z <= trayBox.max.z && steelBox.max.y <= trayBox.max.y;
      const initiallyHidden = !drawer.contents.visible;
      drawer.toggle(); drawer.update(.1);
      const animated = drawer.t > 0 && drawer.t < 1 && drawer.contents.visible;
      drawer.update(1); scene.updateMatrixWorld(true);
      const openPosition = drawer.object.position.clone();
      const travel = openPosition.clone().sub(drawer.home).distanceTo(drawer.out) < 1e-9;
      const bounds = new T.Box3().setFromObject(drawer.contents), target = bounds.getCenter(new T.Vector3());
      function shoot(close = false) {
        camera.position.copy(target).add(new T.Vector3(close ? -.43 : -.72, close ? .64 : 1.1, close ? .05 : .10));
        camera.lookAt(target); renderer.render(scene, camera);
        return {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles};
      }
      window.cutleryFixture = { shoot, drawer, renderer, scene, camera };
      const openCost = shoot();
      drawer.toggle(); drawer.update(1); scene.updateMatrixWorld(true);
      const closed = drawer.t === 0 && !drawer.contents.visible && drawer.object.position.distanceTo(drawer.home) < 1e-9;
      renderer.render(scene, camera);
      const closedCost = {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles};
      drawer.toggle(); drawer.update(1);
      return {pieces, piecesWithinCompartments, meshes, contained, initiallyHidden, animated, travel, closed, openCost, closedCost,
        trayBounds: {min: trayBox.min.toArray(), max: trayBox.max.toArray()}, steelBounds: {min: steelBox.min.toArray(), max: steelBox.max.toArray()}};
    });
    fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result, null, 2));
    for (const key of ['piecesWithinCompartments', 'contained', 'initiallyHidden', 'animated', 'travel', 'closed']) assert.equal(result[key], true, key);
    assert.equal(result.pieces, baseline ? 24 : 36, 'household stock count');
    assert.equal(result.meshes.length, 2, 'tray and steel stay two batches');
    await page.evaluate(() => cutleryFixture.shoot());
    await page.screenshot({ path: path.join(out, 'drawer.png') });
    await page.evaluate(() => cutleryFixture.shoot(true));
    await page.screenshot({ path: path.join(out, 'detail.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({baseline, result, errors,
      limits: 'Production plan kitchen builders/Openable and real WebGL. Component lighting; no World, E/touch dispatch, FPS or physical phone claim.'}, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
