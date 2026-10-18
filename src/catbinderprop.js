import * as THREE from 'three';
import { CAT_BINDER as B } from './config.js';
import { mergeStatic } from './merge.js';

// The cat card binder as an object (#1255): a small ring binder lying on the coffee table's slat shelf. Three flat-colour
// materials, merged into three meshes, no texture, no light, no shadow casting (it sits in the table's shade). Built into
// furniture.js `coffeetable`, so it moves with the table (F rearranging, saved layouts). E on it opens the browse UI (main.js
// `showBinder`); `occluded` refuses a pick through the table top from above, because the pick ray has no table in it.

const mats = {
  cover: new THREE.MeshStandardMaterial({ color: B.cover, roughness: 0.55 }),
  pages: new THREE.MeshStandardMaterial({ color: B.pages, roughness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: B.gold, roughness: 0.35, metalness: 0.6 }),
};

/** `y` = the shelf's top (the table's local frame), `tableTop` = the underside of the table's top, `hx` / `hz` its half extents. */
export function buildBinderProp({ y, tableTop, hx, hz, level = 0 }) {
  const g = new THREE.Group();
  const { w, d, h } = B, t = 0.004;
  const box = (sx, sy, sz, x, yy, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, yy, z); g.add(o); return o; };
  box(w, t, d, 0, t / 2, 0, mats.cover);                                   // back cover
  box(w, t, d, 0, h - t / 2, 0, mats.cover);                               // front cover
  box(0.014, h, d, -w / 2 + 0.007, h / 2, 0, mats.cover);                  // the spine
  box(w - 0.024, h - 2 * t - 0.004, d - 0.012, 0.006, h / 2, -0.002, mats.pages); // the sheets, a little inside the covers
  // a gold paw on the front cover: one pad and four toes
  const paw = (r, x, z) => { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2), mats.gold); c.position.set(x, h + 0.0006, z); g.add(c); };
  paw(0.026, 0.012, 0.012);
  [[-0.026, -0.022], [-0.009, -0.038], [0.014, -0.038], [0.032, -0.022]].forEach(([x, z]) => paw(0.011, x + 0.012, z + 0.012));
  mergeStatic(g); // three meshes (one per material)
  g.position.set(B.x, y, B.z);
  g.rotation.y = THREE.MathUtils.degToRad(B.turn);
  const target = { name: 'kattpärmen', kind: 'binder', verb: 'bläddra i', pickable: g, object: g, level,
    /** True when the line from the eye to the hit point passes through the table top (the ray itself has no table in it). */
    occluded(from, to) {
      const p = g.parent;
      if (!p) return false;
      p.updateWorldMatrix(true, false);
      const inv = p.matrixWorld.clone().invert(), a = from.clone().applyMatrix4(inv), b = to.clone().applyMatrix4(inv);
      if ((a.y - tableTop) * (b.y - tableTop) > 0) return false; // both on one side of the top's plane
      const k = (tableTop - a.y) / (b.y - a.y), x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      return Math.abs(x) < hx && Math.abs(z) < hz;
    } };
  g.traverse((m) => { if (m.isMesh) { m.userData.door = target; m.receiveShadow = true; } });
  return { group: g, target };
}
