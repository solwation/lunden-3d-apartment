// #2053: does long hair go into the body? Poses an avatar (rest, walk, run, sitting, looking down / up, head turned), skins every
// vertex on the CPU and measures how far curtain hair vertices (below the head's centre) lie behind the nearest body surface
// (sweater, skin of torso / shoulders / arms, the neck), signed along that surface's posed normal.
// Usage: node tools/avatarlonghairpose.mjs [src dir, default ../src] [--json]   (also imported by tools/avatarlonghairtest.mjs)
import * as THREE from 'three';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export async function load(src = path.join(here, '../src')) {
  const url = (f) => pathToFileURL(path.join(path.resolve(src), f)).href;
  return { av: await import(url('avatar.js')), cfg: await import(url('config.js')), olof: await import(url('olof.js')) };
}
/** name → (avatar, mods) poses it (after a settle) */
export const POSES = {
  rest: (a) => step(a, {}, 20),
  walk: (a) => step(a, { speed: 1.4 }, 47),
  walk2: (a) => step(a, { speed: 1.4 }, 61),
  run: (a) => step(a, { speed: 4.5 }, 41),
  run2: (a) => step(a, { speed: 4.5 }, 53),
  lookDown: (a) => step(a, { pitch: -0.55 }, 20),
  lookUp: (a) => step(a, { pitch: 0.45 }, 20),
  turnL: (a) => step(a, { turn: 0.6 }, 20),
  turnR: (a) => step(a, { turn: -0.6 }, 20),
  sit: (a, m) => { step(a, {}, 5); m.olof.poseOlof(a, m.olof.seatedPose(0.45)); },
  sitDrink: (a, m) => { step(a, {}, 5); m.olof.poseOlof(a, m.olof.seatedPose(0.45, { w: 1 })); },
};
function step(a, state, frames) { a.noIdle = true; for (let i = 0; i < frames; i++) a.update(1 / 30, state); }

/** Per pose: hair vertices checked, how many lie more than `tol` m inside the body, and the deepest (m). */
export function penetration(m, look, { poses = Object.keys(POSES), tol = 0.002 } = {}) {
  const res = {};
  for (const name of poses) {
    const a = new m.av.Avatar(look);
    a.noSway = true;
    POSES[name](a, m);
    a.object.updateMatrixWorld(true); a.mesh.skeleton.update();
    const g = a.mesh.geometry, A = g.attributes, n = A.position.count, mesh = a.mesh, sk = mesh.skeleton;
    const P = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); P.set([v.x, v.y, v.z], i * 3); }
    const bm = sk.bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(mesh.bindMatrixInverse, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[k])).multiply(mesh.bindMatrix)), nm = new THREE.Matrix3(); // (in the mesh's own frame, as getVertexPosition)
    const head = sk.bones.findIndex((b) => b.name === 'head'), hb = m.olof.bindAt('head');
    const region = A.region, part = A.facePart, hairPart = 7; // (FACE_PART.hair)
    const isHair = (i) => region.getX(i) === 3 && part.getX(i) === hairPart;
    // body: sweater / skin / trousers on any bone but the head, and the neck
    const cell = 0.012, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = region.getX(i), bone = A.skinIndex.getX(i), neck = part.getX(i) === 2;
      if (!(r <= 2 && (bone !== head || neck)) || isHair(i)) continue;
      v.fromBufferAttribute(A.normal, i); const w = new THREE.Vector3();
      for (let j = 0; j < 4; j++) { const wt = A.skinWeight.getComponent(i, j); if (wt) w.addScaledVector(v.clone().applyMatrix3(nm.setFromMatrix4(bm[A.skinIndex.getComponent(i, j)])), wt); }
      w.normalize(); N.set([w.x, w.y, w.z], i * 3);
      const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
    }
    let checked = 0, inside = 0, deepest = 0; const worst = [];
    for (let i = 0; i < n; i++) {
      if (!isHair(i) || A.position.getY(i) - hb.y > 0.06 || A.faceAnchor.getX(i) !== 0) continue; // the curtain (no flyaways)
      checked++;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let best = Infinity, bi = -1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy},${Math.floor(z / cell) + dz}`) ?? []) {
          const d = (P[j * 3] - x) ** 2 + (P[j * 3 + 1] - y) ** 2 + (P[j * 3 + 2] - z) ** 2; if (d < best) { best = d; bi = j; }
        }
      }
      if (bi < 0) continue;
      const s = (x - P[bi * 3]) * N[bi * 3] + (y - P[bi * 3 + 1]) * N[bi * 3 + 1] + (z - P[bi * 3 + 2]) * N[bi * 3 + 2];
      if (s < -tol) { inside++; if (worst.length < 3 || s < worst[2][0]) { worst.push([+s.toFixed(4), i, A.position.getY(i) - hb.y]); worst.sort((p, q) => p[0] - q[0]); worst.length = Math.min(3, worst.length); } }
      deepest = Math.min(deepest, s);
    }
    res[name] = { checked, inside, deepest: +deepest.toFixed(4) };
    a.dispose?.();
  }
  return res;
}
if (process.argv[1]?.endsWith('avatarlonghairpose.mjs')) {
  const src = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined, m = await load(src);
  for (const gender of [0, 1]) console.log(`gender ${gender}`, JSON.stringify(penetration(m, { ...m.cfg.avatarLook('pose2053'), style: 1, gender, hat: 0, tall: 1, build: 1 })));
}
