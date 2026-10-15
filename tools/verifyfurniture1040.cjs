const fs = require('fs');
const path = require('path');

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const PREFIX = process.argv[3] || 'before';
const SHOTS_DIR = process.argv[4] || '/tmp/lunden-shots-furniture1040';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function renderAndShoot(page, filename, name, offset, aim, hour = 12) {
  if (process.env.CHECKS_ONLY) return;
  if (process.env.VIEWS && !process.env.VIEWS.split(',').includes(filename)) return;
  const pose = await page.evaluate(({ name, offset, aim, hour }) => {
    const app = window.__app;
    app.renderer.setAnimationLoop(null);
    const obj = app.world.furnitureTargets.find(t => t.name === name).pickable;
    const origin = obj.position;
    app.day.hour = hour; app.day.update(0);
    if (hour > 18) { app.lights.forced = true; app.lights.setAll(true); }
    app.player.pos.set(origin.x + offset[0], 0, origin.z + offset[2]);
    app.step(0);
    // Set the final camera AFTER physics; keep the animation loop stopped through capture.
    app.camera.position.set(origin.x + offset[0], offset[1], origin.z + offset[2]);
    app.camera.lookAt(origin.x + aim[0], aim[1], origin.z + aim[2]);
    app.camera.updateMatrixWorld(true);
    app.testMode.setFull(true);
    app.detail().last.set(1e9, 0, 0); app.detail().update(app.camera);
    app.testMode.draw();
    return { camera: app.camera.position.toArray(), rotation: app.camera.rotation.toArray(), object: origin.toArray(), hour, draws: app.renderer.info.render.calls, triangles: app.renderer.info.render.triangles };
  }, { name, offset, aim, hour });
  const fullPath = path.join(SHOTS_DIR, `${PREFIX}_${filename}`);
  fs.writeFileSync(fullPath + '.json', JSON.stringify(pose, null, 2));
  await page.screenshot({ path: fullPath, timeout: 120000 });
  await page.evaluate(() => window.__app.testMode.setFull(false));
  console.log('Saved:', fullPath);
}

async function waitForApp(page) {
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 200));
    const ready = await page.evaluate(() => !!window.__app?.renderer && !!window.__app?.world?.furnitureTargets);
    if (ready) { await page.evaluate(() => window.__app.renderer.setAnimationLoop(null)); return; }
  }
  throw new Error('Timeout waiting for app');
}

async function run() {
  console.log(`Running furniture verification (${PREFIX}) against ${BASE_URL}...`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  await page.route('**/src/furniture-before1040.js', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.BASELINE_FURNITURE, 'utf8') }));
  if (PREFIX === 'before') await page.route('**/src/furniture.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.BASELINE_FURNITURE, 'utf8') }));
  try {
  await page.goto(`${BASE_URL}/?test=lazy&shot&month=6&day=15&freeze&weather=clear&mess=0&time=12&at=3.8,10.0,0,0,0`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await renderAndShoot(page, '01_sofa_day.png', 'soffan', [-0.6, 1.15, -1.7], [0, 0.55, 0]);
  await renderAndShoot(page, '02_sofa_cushion_close.png', 'soffan', [-0.69, 0.75, -0.32], [-0.29, 0.5, 0.18]);
  await renderAndShoot(page, '03_armchair_day.png', 'fåtöljen', [1.12, 0.95, 1.12], [0, 0.55, 0]);
  await renderAndShoot(page, '04_armchair_close.png', 'fåtöljen', [0.52, 0.8, 0.52], [0, 0.52, 0]);
  await renderAndShoot(page, '05_livingroom_evening.png', 'soffan', [-1.69, 1.1, -2.02], [-0.59, 0.6, -0.32], 21);

  // --- 6. Functionality checks: rest spots, cushions, cat spot ---
  const catSource = fs.readFileSync(path.join(__dirname, '../src/cat.js'), 'utf8');
  const i = catSource.indexOf('function segIntersect(');
  const segmentSource = catSource.slice(i, catSource.indexOf('\n}', i) + 2);
  const checks = await page.evaluate(async segmentSource => {
    const T = await import('three'), C0 = await import('/src/config.js');
    const intersects = new Function('return ' + segmentSource)();
    const app = window.__app;
    const sofaT = app.world.furnitureTargets.find(t => t.name === 'soffan');
    const chairT = app.world.furnitureTargets.find(t => t.name === 'fåtöljen');

    const results = {
      sofaFound: !!sofaT,
      chairFound: !!chairT,
      sofaSpotsCount: sofaT?.spots?.length ?? 0,
      chairSpotsCount: chairT?.spots?.length ?? 0,
      sofaSpotsY: sofaT?.spots?.map(s => s.y),
      chairSpotsY: chairT?.spots?.map(s => s.y),
      sofaFootprintCount: sofaT?.pickable?.userData?.footprint?.length ?? 0,
      chairFootprintCount: chairT?.pickable?.userData?.footprint?.length ?? 0,
      sofaSurfaces: sofaT?.pickable?.userData?.surfaces?.length ?? 0,
      upholsterySofa: sofaT?.pickable?.userData?.materialSurfaces?.length ?? 0,
      upholsteryChair: chairT?.pickable?.userData?.materialSurfaces?.length ?? 0,
    };

    // Test sitting in the sofa
    let canSitSofa = false;
    let canSitChair = false;
    if (sofaT && app.rest) {
      app.rest.begin(sofaT, sofaT.spots[0], { x: app.player.pos.x, z: app.player.pos.z, y: app.player.pos.y, yaw: app.camera.rotation.y });
      canSitSofa = app.rest.active && app.rest.target === sofaT;
      app.rest.end?.();
    }
    if (chairT && app.rest) {
      app.rest.begin(chairT, chairT.spots[0], { x: app.player.pos.x, z: app.player.pos.z, y: app.player.pos.y, yaw: app.camera.rotation.y });
      canSitChair = app.rest.active && app.rest.target === chairT;
      app.rest.end?.();
    }
    results.canSitSofa = canSitSofa;
    results.canSitChair = canSitChair;

    // Real cat landing selection using an approach directly in front of a sofa seat.
    const sp = sofaT.spots[1].pos;
    results.catSpot = app.cat.furnitureSpot(0, 0, [sp.x, sp.z - 0.8], [0, 1]);
    results.catFoundSpot = results.catSpot?.on === 'sit';
    // Occupy all other candidates to exercise the actual cat ray/landing on each indoor seat.
    // This avoids a random successful patio landing masquerading as a sofa check.
    results.indoorLandings = [];
    const occupied = app.cat.seatTaken;
    try {
      for (const target of [sofaT, chairT]) for (const sp of target.spots) {
        app.cat.seatTaken = (x, z) => Math.hypot(x - sp.pos.x, z - sp.pos.z) > 0.01 || !!occupied?.(x, z);
        const dx = -Math.sin(sp.yaw), dz = -Math.cos(sp.yaw);
        const landing = app.cat.furnitureSpot(0, 0, [sp.pos.x + dx * 0.8, sp.pos.z + dz * 0.8], [-dx, -dz]);
        const y = sp.pos.y - C0.REST.sitEye;
        const ray = new T.Raycaster(new T.Vector3(sp.pos.x, y + 0.6, sp.pos.z), new T.Vector3(0, -1, 0), 0, 1);
        ray.camera = app.camera;
        const hit = ray.intersectObjects(app.world.looseItems, true).find(h => h.object.isMesh && app.cat.shownMesh(h.object));
        const walls = [...app.world.levels[0].wallSegments, ...app.world.doors.map(d => d.segment())];
        const diagnostics = { distance: 0.8, reach: C0.CAT_FURNITURE.reach, occupied: !!occupied?.(sp.pos.x, sp.pos.z),
          wallBlocked: walls.some(w => intersects(sp.pos.x + dx*0.8, sp.pos.z + dz*0.8, sp.pos.x, sp.pos.z, w)),
          hitY: hit?.point.y ?? null, expectedY: y, noCat: hit?.object.userData.noCat ?? false };
        results.indoorLandings.push({ diagnostics, target: target.name, seat: sp.pos.toArray(), landing,
          ok: landing?.on === 'sit' && Math.hypot(landing.x - sp.pos.x, landing.z - sp.pos.z) < 0.01 });
      }
    } finally { app.cat.seatTaken = occupied; }


    const current = await import('/src/furniture.js');
    const baseline = await import('/src/furniture-before1040.js');
    const C = await import('/src/config.js');
    const { mergeStatic } = await import('/src/merge.js');
    results.models = await Promise.all(C.FURNITURE.filter(i => ['sofa', 'armchair'].includes(i.type)).map(async item => {
      const now = current[item.type](item), old = baseline[item.type](item);
      const same = key => JSON.stringify(now.userData[key]) === JSON.stringify(old.userData[key]);
      const count = obj => { let n = 0; obj.traverse(m => { if (m.isMesh) n += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; }); return n; };
      const triangles = { before: count(old), after: count(now) };
      let inwardFaces = 0, shapedShells = 0;
      now.traverse(m => {
        if (!m.isMesh || !m.geometry.userData.upholsteryShell) return;
        shapedShells++;
        const p = m.geometry.attributes.position, ids = m.geometry.index;
        const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), centre = new T.Vector3(), n = new T.Vector3();
        for (let i = 0; i < ids.count; i += 3) {
          a.fromBufferAttribute(p, ids.getX(i)); b.fromBufferAttribute(p, ids.getX(i+1)); c.fromBufferAttribute(p, ids.getX(i+2));
          centre.copy(a).add(b).add(c).divideScalar(3);
          n.crossVectors(b.sub(a), c.sub(a));
          if (n.dot(centre) < -1e-9) inwardFaces++;
        }
      });
      const baseSurface = now.userData.materialSurfaces.find(s => s.id === 'textile');
      const cloth = []; now.traverse(m => { if(m.isMesh && m.geometry.attributes.uv1) cloth.push(m); });
      const finishes = cloth.map(m => ({ color: m.material.color.getHex(), map: m.material.map }));
      const { materialChoices } = await import('/src/materialcatalog.js');
      baseSurface.apply(materialChoices('klädsel').find(c => c.pattern)?.id);
      const patterned = cloth.filter(m => m.material.map?.channel === 1).length;
      baseSurface.apply('original');
      const restored = cloth.every((m,i) => m.material.color.getHex() === finishes[i].color && m.material.map === finishes[i].map);
      const sameRest = same('rest'), sameFootprint = same('footprint'), sameSurfaces = same('surfaces');
      return { type: item.type, inwardFaces, shapedShells, sameRest, sameFootprint, sameSurfaces, patterned, restored, triangles, draws: { before: mergeStatic(old).after, after: mergeStatic(now).after } };
    }));

    return results;
  }, segmentSource);

  fs.writeFileSync(path.join(SHOTS_DIR, `${PREFIX}_checks.json`), JSON.stringify(checks, null, 2));
  console.log('Verification checks:', JSON.stringify(checks, null, 2));



  if (!checks.sofaFound || !checks.chairFound || checks.sofaSpotsCount !== 4 || checks.chairSpotsCount !== 1) {
    throw new Error('Verification failed: sofa or chair spots missing');
  }
  if (!checks.canSitSofa || !checks.canSitChair) {
    throw new Error('Verification failed: cannot sit in sofa or chair');
  }

  if (checks.indoorLandings.length !== 5 || !checks.indoorLandings.some(l => l.ok)) throw new Error('Indoor landing fixture incomplete');
  if (PREFIX !== 'before' && !process.env.EXPECTED_LANDINGS) throw new Error('EXPECTED_LANDINGS must identify a recorded baseline');
  if (process.env.EXPECTED_LANDINGS) {
    const expected = JSON.parse(fs.readFileSync(process.env.EXPECTED_LANDINGS)).indoorLandings;
    if (expected.some((l,i) => l.ok && !checks.indoorLandings[i].ok)) throw new Error('An existing indoor cat landing was lost');
  }
  if (checks.models.some(m => !m.sameRest || !m.sameFootprint || !m.sameSurfaces || !m.restored || !m.patterned || m.inwardFaces > 0 || m.draws.after !== m.draws.before)) throw new Error('Cat/material/geometry contract failed');
  if (PREFIX !== 'before' && checks.models.some(m => m.shapedShells !== (m.type === 'sofa' ? 6 : 2))) throw new Error('New cushion shells were not checked');
  console.log('Verification passed successfully.');
  } finally { await browser.close(); }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
