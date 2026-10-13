// #887: actual Hus A entrance/lobby geometry; no apartment or WebGL in this probe.
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8875', output = process.argv[3] || '/tmp/lunden-entrance';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/docs/development/architecture.md');
    await page.setContent('<script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script>');
    const result = await page.evaluate(async () => {
      const T = await import('three'), { CoreHouse } = await import('/src/corehouse.js'), { Core } = await import('/src/core.js');
      const { CORE_A, CORE_B, CORE_C, PLAYER, POWER } = await import('/src/config.js');
      const lines = [], check = (ok, name) => lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
      const core = new Core(), a = core.attach(new CoreHouse(CORE_A)), b = core.attach(new CoreHouse(CORE_B)), c = core.attach(new CoreHouse(CORE_C));
      const camera = new T.PerspectiveCamera(), player = { pos: new T.Vector3(1.8, 0, 14), level: 0 };
      const move = z => { camera.position.set(1.8, PLAYER.eye, z); a.update(0, player, camera); core.object.updateMatrixWorld(true); };
      const counts = root => { let meshes = 0, triangles = 0; root.traverseVisible(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } }); return { meshes, triangles }; };
      const hits = () => { const ray = new T.Raycaster(camera.position, new T.Vector3(0, 0, 1)), all = []; for (const root of [a.object, a.exterior]) root.traverseVisible(o => { if (o.isMesh && !o.material.transparent && !o.userData.door) T.Mesh.prototype.raycast.call(o, ray, all); }); return all.sort((a, b) => a.distance - b.distance); };
      move(14);
      check(a.exterior.parent === core.object && !a.object.visible && a.exterior.visible, 'actual Core.attach retains exterior while patio hides full detail');
      const far = counts(a.exterior), bounds = new T.Box3().setFromObject(a.exterior);
      check(far.meshes <= 10 && far.triangles < 1000, `retained entrance bounded at ${far.meshes} meshes/${far.triangles} triangles`);
      check(bounds.min.y > -.3 && bounds.max.y < 3.01 && bounds.max.z < 39, 'retained geometry is only actual ground lobby, without upper stairs/lift');
      check(Math.abs(hits()[0]?.point.z - 38.9) < .001, 'through intentional glass, actual opaque lobby back wall occludes beyond house');
      move(16); check(!a.object.visible && hits().length > 0, 'occlusion survives just outside original detail boundary');
      move(17); check(a.object.visible && hits().length > 0, 'original near boundary activates detail without occlusion hole');
      const near = counts(a.object); check(near.triangles + far.triangles === 10946, 'partition preserves original 10946 triangles without duplicate solid/leaf');
      check(!b.exterior && !c.exterior, 'other houses retain existing ownership and culling');
      const fixed = a.exterior.children.find(o => o.isMesh && o.material.transparent);
      check(fixed.material.opacity === .35 && fixed.material.side === T.DoubleSide && !fixed.material.depthWrite, 'original intentional fixed glass opacity/sidedness/depth preserved');
      const door = a.doors[0].door, pivot = door.pivot;
      check(pivot.parent === a.exterior && a.targets[0].door === door, 'same real entrance pivot and interaction target retained');
      const closed = pivot.matrixWorld.clone(), beforeSegments = a.dynamic(0);
      door.target = door.max; move(14); a.update(.5, player, camera); core.object.updateMatrixWorld(true);
      check(!a.object.visible && door.angle === door.max && !pivot.matrixWorld.equals(closed), 'far actual door animation changes visible pivot without closed stand-in');
      check(JSON.stringify(a.dynamic(0)) !== JSON.stringify(beforeSegments), 'same animated leaf updates original collision segment');
      check(a.contains(1.8, 33, 0) && a.heights(1.8, 33).some(y => y === 0), 'actual lobby remains enterable with unchanged floor support');
      const wall = a.exterior.children.find(o => o.isMesh && o.material.vertexColors);
      a.setPower(false); check(wall.material === a.mats.wall && wall.material.color.r === POWER.emergency, 'far lobby uses same power-cut material');
      a.setPower(true); check(wall.material.color.r === 1, 'same power restoration restores lobby');
      check(a.exterior.children.filter(o => o.isMesh).every(o => o.frustumCulled && !o.castShadow && !o.receiveShadow), 'retained static batches keep native frustum culling and no added shadow work');
      return { lines, far, near, bounds: [bounds.min.toArray(), bounds.max.toArray()], camera: camera.position.toArray() };
    });
    result.errors = errors; result.pass = !errors.length && result.lines.every(l => l.startsWith('PASS'));
    fs.writeFileSync(path.join(output, 'entrance-native.json'), JSON.stringify(result, null, 2));
    console.log(result.lines.join('\n')); console.log(result.pass ? 'ALL PASS' : 'SOME FAILED');
    if (!result.pass) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
