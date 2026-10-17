// Wall AO faces the room (#1084): every triangle of each level's `wall-ao` overlay (src/ao.js buildWallAO) must be
// front-facing towards the room, i.e. just in front of it, looking back, a wall is right behind it. A triangle wound
// the other way is culled and its band silently missing (door lintels, window infills, mirrored flats like L1201).
// #1129: none may sit inside a solid (a door jamb's band up inside the lintel: the overlay's polygon offset pulled it
// through the lintel's face as a stripe; caught by a ray straight down meeting a solid's underside from inside, all sides
// tested), and no two may overlap in one plane (a lintel's face over a wall block's end darkened that strip twice).
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
    // #1198: a shower screen's frosted glass sits flush with a wall end; only real (opaque) wall materials count as solids
    const glassy = (m) => !!m && (m.transparent || m.opacity < 1 || m.transmission > 0);
    const fix = (v) => v.toArray().map((q) => +q.toFixed(2));
    const sides = others.map((o) => [o.material, o.material?.side]), wallMats = new Set();
    const out = meshes.map((m) => {
      m.updateWorldMatrix(true, false);
      const p = m.geometry.attributes.position, bad = [], inside = [], twice = [], tris = [];
      for (let i = 0; i < p.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => new V().fromBufferAttribute(p, i + k).applyMatrix4(m.matrixWorld));
        const n = new V().subVectors(b, a).cross(new V().subVectors(c, a)).normalize();
        const mid = new V().copy(a).add(b).add(c).multiplyScalar(1 / 3);
        tris.push({ a, b, c, n, mid });
        rc.near = 0; rc.far = 0.02;
        rc.ray.origin.copy(mid).addScaledVector(n, 0.004);
        rc.ray.direction.copy(n).negate();
        const hits = rc.intersectObjects(others, false);
        if (!hits.length) bad.push(fix(rc.ray.origin));
        else if (!glassy(hits[0].object.material)) wallMats.add(hits[0].object.material); // #1198: glass is fixture, not wall
      }
      // inside a solid: straight down from just in front of the triangle to just above the floor (aDist.x = y - floor),
      // more wall faces pointing down (a solid's underside seen from inside) than up (both sides hit for this check)
      for (const [mat] of sides) if (mat && !Array.isArray(mat)) mat.side = 2; // THREE.DoubleSide
      const dy = m.geometry.attributes.aDist;
      for (const [k, t] of tris.entries()) {
        rc.ray.origin.copy(t.mid).addScaledVector(t.n, 0.004);
        rc.ray.direction.set(0, -1, 0);
        rc.far = rc.ray.origin.y - (t.a.y - dy.getX(k * 3)) - 0.001;
        const hits = rc.intersectObjects(others, false);
        let net = 0;
        for (const h of hits) if (h.face && wallMats.has(h.object.material)) net += Math.sign(h.face.normal.clone().transformDirection(h.object.matrixWorld).y);
        if (net < 0) inside.push(fix(rc.ray.origin));
      }
      for (const [mat, side] of sides) if (mat && !Array.isArray(mat)) mat.side = side;
      // overlapping in one plane: a triangle's centre strictly inside another with the same facing and plane
      const inTri = (q, t) => {
        const e = (u, v) => new V().subVectors(v, u).cross(new V().subVectors(q, u)).dot(t.n);
        const s = [e(t.a, t.b), e(t.b, t.c), e(t.c, t.a)];
        return s.every((x) => x > 1e-6) || s.every((x) => x < -1e-6);
      };
      for (const [i, t] of tris.entries()) {
        if (tris.some((u, j) => j !== i && u.n.dot(t.n) > 0.999 && Math.abs(u.n.dot(new V().subVectors(t.mid, u.a))) < 0.002 && inTri(t.mid, u))) twice.push(fix(t.mid));
      }
      return { tris: tris.length, bad, inside, twice };
    });
    rc.near = near; rc.far = far;
    return out;
  });
  let ok = res.length >= 6; // L1007, L1004 and L1201, two levels each
  console.log(`${ok ? 'PASS' : 'FAIL'} ${res.length} wall-AO meshes`);
  for (const [i, r] of res.entries()) {
    const pass = r.tris > 0 && !r.bad.length && !r.inside.length && !r.twice.length;
    ok &&= pass;
    const eg = (l) => (l.length ? ` (e.g. ${JSON.stringify(l.slice(0, 3))})` : '');
    console.log(`${pass ? 'PASS' : 'FAIL'} mesh ${i}: ${r.tris} triangles, ${r.bad.length} facing into a wall${eg(r.bad)}, `
      + `${r.inside.length} inside a solid${eg(r.inside)}, ${r.twice.length} overlapping another${eg(r.twice)}`);
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
