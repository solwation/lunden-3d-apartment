// Wall AO faces the room (#1084): every triangle of each level's `wall-ao` overlay (src/ao.js buildWallAO) must be
// front-facing towards the room, i.e. just in front of it, looking back, a wall is right behind it. A triangle wound
// the other way is culled and its band silently missing (door lintels, window infills, mirrored flats like L1201).
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] node tools/wallaotest.cjs http://localhost:8000
const kit = require('./testkit.cjs');
(async () => {
  const game = process.argv[2] || 'http://localhost:8000';
  const browser = await kit.launch();
  const { page } = await kit.open(browser, `${game}/?shot&mess=0`, { lazy: true });
  const res = await page.evaluate(() => {
    const { scene } = window.__app, rc = window.__app.focus().raycaster;
    const near = rc.near, far = rc.far, V = rc.ray.origin.constructor;
    const meshes = [], others = [];
    scene.traverse((o) => { if (o.name === 'wall-ao') meshes.push(o); else if (o.isMesh && o.visible) others.push(o); });
    const out = meshes.map((m) => {
      m.updateWorldMatrix(true, false);
      const p = m.geometry.attributes.position, bad = [];
      for (let i = 0; i < p.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => new V().fromBufferAttribute(p, i + k).applyMatrix4(m.matrixWorld));
        const n = new V().subVectors(b, a).cross(new V().subVectors(c, a)).normalize();
        rc.near = 0; rc.far = 0.02;
        rc.ray.origin.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, 0.004);
        rc.ray.direction.copy(n).negate();
        if (!rc.intersectObjects(others, false).length) bad.push(rc.ray.origin.toArray().map((v) => +v.toFixed(2)));
      }
      return { tris: p.count / 3, bad };
    });
    rc.near = near; rc.far = far;
    return out;
  });
  let ok = res.length >= 6; // L1007, L1004 and L1201, two levels each
  console.log(`${ok ? 'PASS' : 'FAIL'} ${res.length} wall-AO meshes`);
  for (const [i, r] of res.entries()) {
    const pass = r.tris > 0 && r.bad.length === 0;
    ok &&= pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} mesh ${i}: ${r.tris} triangles, ${r.bad.length} facing into a wall${r.bad.length ? ` (e.g. ${JSON.stringify(r.bad.slice(0, 3))})` : ''}`);
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
