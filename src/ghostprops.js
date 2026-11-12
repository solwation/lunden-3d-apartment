import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SABER, TOYS, FISH_SURFACE } from './config.js';
import { buildFishSurface } from './fishsurface.js';
import { rifleModel } from './rifle.js';
import { buildSaber } from './saber.js';
import { bowGeometry } from './bow.js';
import { packGeometry, flameGeometry } from './jetpack.js';
import { bikeGeometry } from './streetlife.js';
import { blasterModel, wandModel } from './toys.js';

// What an armed player carries, seen by the others (#667, #1126): the same models the player holds in first person,
// each baked once into one vertex-coloured geometry (one draw call per prop, one shared Lambert material; textures,
// muzzle flashes and other hidden parts left out). Prop space: the origin in the right hand, pointing forward (−z).
// The room's state only says which weapon (`h`), not which of the three blasters / wands: the first one stands for all.
// Built lazily, the first time some player holds that weapon.

const vmat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** All visible, untextured, opaque meshes under `obj` as one non-indexed geometry with position, normal and color. */
function bake(obj) {
  obj.updateMatrixWorld(true);
  const parts = [];
  obj.traverseVisible((m) => {
    if (!m.isMesh || Array.isArray(m.material) || m.material.map || m.material.transparent) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!m.material.vertexColors || !g.attributes.color) {
      const c = m.material.color, n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    parts.push(g);
  });
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  return geo;
}

/** `obj` placed in prop space by `pose` (position of the grip moved to the origin, then turned), baked. */
function baked(obj, { grip = [0, 0, 0], rot = [0, 0, 0] } = {}) {
  const holder = new THREE.Group();
  obj.position.set(-grip[0], -grip[1], -grip[2]);
  const turn = new THREE.Group();
  turn.rotation.set(...rot);
  turn.add(obj);
  holder.add(turn);
  return bake(holder);
}

const UP_TO_FORWARD = [-Math.PI / 2, 0, 0]; // models built along +y (saber, wand) held pointing forward

const BUILD = {
  rifle: () => baked(rifleModel().g, { grip: [0, -0.062, 0.09] }), // the pistol grip (rifle.js)
  nerf: () => baked(blasterModel(TOYS.nerf.models[0], TOYS.nerf.colors[0], TOYS.nerf.accents[0], true), { grip: TOYS.nerf.grip }),
  wand: () => baked(wandModel(TOYS.wands.colors[0]), { grip: TOYS.wands.grip, rot: UP_TO_FORWARD }),
  bow: () => baked(new THREE.Mesh(bowGeometry(), vmat)), // upright, the grip at its origin (bow.js)
  saber: () => {
    const { g, blade } = buildSaber();
    blade.visible = false; // the hilt here; the lit blade is drawn separately below (unshaded)
    return baked(g, { grip: [0, SABER.hilt * 0.4, 0], rot: UP_TO_FORWARD });
  },
};

// the saber's lit blade (#667's glowing stick, now on the hilt): unshaded so it reads as light
const bladeGeo = () => new THREE.CylinderGeometry(0.016, 0.016, SABER.blade, 8).rotateX(-Math.PI / 2).translate(0, 0, -(SABER.hilt * 0.6 + SABER.blade / 2));
const bladeMat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff });

const SIMPLE = { // no first-person model to borrow (the ball is a sphere anyway; the jetpack is worn, ghostJetpack)
  ball: () => [new THREE.SphereGeometry(0.12, 14, 10).translate(0, 0, -0.08), new THREE.MeshLambertMaterial({ color: 0xd8641e })],
};

const cache = new Map();
/** A new prop mesh for weapon `key` (COMBAT.weapons), sharing geometry and material with every other ghost; null for none. */
export function ghostProp(key) {
  if (!BUILD[key] && !SIMPLE[key]) return null;
  if (!cache.has(key)) {
    let entry;
    try { entry = BUILD[key] ? [BUILD[key](), vmat] : SIMPLE[key](); } catch (e) { console.warn('ghost prop', key, e); entry = [new THREE.BoxGeometry(0.05, 0.1, 0.4).translate(0, 0, -0.15), vmat]; }
    if (key === 'saber') entry.push(bladeGeo());
    cache.set(key, entry);
  }
  const [geo, mat, blade] = cache.get(key), m = new THREE.Mesh(geo, mat);
  if (blade) { const b = new THREE.Mesh(blade, bladeMat); b.name = 'ghost-prop-blade'; m.add(b); }
  m.name = `ghost-prop:${key}`;
  return m;
}

let packGeo = null, flameGeo = null, flameMat = null, packMat = null;
/** The jetpack worn on an avatar's back (#1286), for the torso bone (origin at the hips, +z forward): the real model (jetpack.js)
 * at 0.8 scale, the tanks behind the back; child 0 = the flames (additive, shown while thrusting). Geometry/materials shared. */
export function ghostJetpack() {
  packGeo ??= packGeometry(); flameGeo ??= flameGeometry();
  packMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  flameMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(packGeo, packMat);
  const f = new THREE.Mesh(flameGeo, flameMat);
  f.visible = false; f.raycast = () => {};
  m.add(f); m.raycast = () => {};
  m.rotation.y = Math.PI; m.scale.setScalar(0.8); m.position.set(0, 0.1, -0.09);
  m.name = 'ghost-jetpack';
  return m;
}

let bikeGeo = null;
/** A bicycle under a riding avatar (#1286): the storage bikes' own near model (streetlife.js bikeGeometry, spokes left out),
 * frame / tyres / metal baked into one vertex-coloured mesh (one draw call). Origin at the bike, its x forward, like Bicycle.place. */
export function ghostBike() {
  bikeGeo ??= (() => {
    const paint = (geo, hex) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(), c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.deleteAttribute('uv'); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const [frame, tyres, metal] = bikeGeometry();
    return mergeGeometries([paint(frame, 0x1d3c6e), paint(tyres, 0x1c1c1e), paint(metal, 0xb4b9bd)]);
  })();
  packMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  const m = new THREE.Mesh(bikeGeo, packMat);
  m.raycast = () => {}; m.name = 'ghost-bike';
  return m;
}

// What an unarmed player holds (#1297): one simple proxy per category (heldcategory.js), flat colours, a few dozen triangles,
// baked once into one vertex-coloured geometry (one draw call, the shared Lambert material, no textures). Prop space as the weapons':
// the origin in the right hand, forward = -z; the things sit just in front of / above the palm.
const ROD_LEN = 1.8, ROD_UP = 0.65; // #1753: the rod proxy's length (m) and elevation (rad) above level
/** #1753: the rod proxy's tip in prop space. */
export const ROD_PROXY_TIP = new THREE.Vector3(0, (ROD_LEN - 0.15) * Math.sin(ROD_UP), -(ROD_LEN - 0.15) * Math.cos(ROD_UP));
const ITEM_PARTS = {
  cup: () => [[new THREE.CylinderGeometry(0.04, 0.034, 0.09, 8), 0xe9e6dc, [0, 0.02, -0.07]], [new THREE.BoxGeometry(0.012, 0.05, 0.03), 0xe9e6dc, [0.052, 0.02, -0.07]], [new THREE.CylinderGeometry(0.034, 0.034, 0.004, 8), 0x4a2c1a, [0, 0.062, -0.07]]],
  plate: () => [[new THREE.CylinderGeometry(0.12, 0.09, 0.016, 10), 0xf3f1ea, [0, 0, -0.14]], [new THREE.CylinderGeometry(0.06, 0.06, 0.012, 7), 0xd9a441, [0, 0.012, -0.14]]],
  food: () => [[new THREE.IcosahedronGeometry(0.05, 0), 0xc8321f, [0, 0.03, -0.08]], [new THREE.BoxGeometry(0.008, 0.03, 0.008), 0x5a3a1c, [0, 0.092, -0.08]]],
  bottle: () => [[new THREE.CylinderGeometry(0.035, 0.035, 0.17, 6), 0x2f6b3a, [0, 0.05, -0.08]], [new THREE.CylinderGeometry(0.014, 0.018, 0.08, 6), 0x2f6b3a, [0, 0.175, -0.08]], [new THREE.CylinderGeometry(0.017, 0.017, 0.016, 6), 0xd8d2c0, [0, 0.223, -0.08]]],
  book: () => [[new THREE.BoxGeometry(0.15, 0.03, 0.21), 0x24457a, [0, 0, -0.13]], [new THREE.BoxGeometry(0.14, 0.024, 0.2), 0xf1ead6, [0.004, 0, -0.13]]],
  paper: () => [[new THREE.BoxGeometry(0.21, 0.003, 0.297), 0xf7f6f0, [0, 0, -0.17]]],
  tool: () => [[new THREE.BoxGeometry(0.022, 0.022, 0.3), 0x8a8f94, [0, 0, -0.14]], [new THREE.BoxGeometry(0.075, 0.035, 0.07), 0xd1862a, [0, 0, -0.3]]],
  plant: () => [[new THREE.CylinderGeometry(0.065, 0.048, 0.1, 8), 0xb5603a, [0, 0.02, -0.1]], [new THREE.IcosahedronGeometry(0.085, 0), 0x3f8a3c, [0, 0.13, -0.1]]],
  // #1687: a billiard cue (1.2 m, as the local one in playroomcues.js), gripped 0.35 m from the butt, pointing ahead and a little down (the local held pose)
  cue: () => { const L = 1.2, tilt = -Math.PI / 2 - 0.3, bit = (g) => g.translate(0, -0.35, 0).rotateX(tilt);
    return [[bit(new THREE.CylinderGeometry(0.004, 0.009, L - 0.05, 6).translate(0, (L - 0.05) / 2, 0)), 0x976333, [0, 0, 0]], [bit(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6).translate(0, L - 0.025, 0)), 0xe9dfc4, [0, 0, 0]]]; },
  box: () => [[new THREE.BoxGeometry(0.13, 0.09, 0.13), 0xb98f5c, [0, 0.02, -0.1]]],
  // #1755: a recognisable nut instead of a faceted lump: an ovoid hazel-brown body with a darker acorn cup and a stalk (~60 triangles)
  nut: () => [[new THREE.SphereGeometry(0.024, 6, 4).scale(1, 1.35, 1), 0xb9823f, [0, 0.03, -0.1]], [new THREE.SphereGeometry(0.026, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.012, 0), 0x5b3b1f, [0, 0.03, -0.1]], [new THREE.BoxGeometry(0.006, 0.014, 0.006), 0x3b2814, [0, 0.077, -0.1]]],
  // #1755: binoculars (#1706): two barrels and a bridge, the lenses facing ahead
  binoculars: () => [[new THREE.CylinderGeometry(0.03, 0.026, 0.13, 6).rotateX(Math.PI / 2), 0x2a2d31, [-0.04, 0.03, -0.12]], [new THREE.CylinderGeometry(0.03, 0.026, 0.13, 6).rotateX(Math.PI / 2), 0x2a2d31, [0.04, 0.03, -0.12]], [new THREE.BoxGeometry(0.05, 0.02, 0.05), 0x444a50, [0, 0.03, -0.12]]],
  // #1755: a spray can (#1707): body, a coloured cap and the nozzle
  spray: () => [[new THREE.CylinderGeometry(0.033, 0.033, 0.15, 6), 0xc9ccd0, [0, 0.04, -0.1]], [new THREE.CylinderGeometry(0.03, 0.033, 0.035, 6), 0xd23b3b, [0, 0.135, -0.1]], [new THREE.BoxGeometry(0.014, 0.012, 0.02), 0x222222, [0, 0.16, -0.108]]],
  // #1755: a wrapped Christmas gift: a red box with a crossed ribbon
  gift: () => [[new THREE.BoxGeometry(0.14, 0.12, 0.14), 0xb02a2a, [0, 0.03, -0.12]], [new THREE.BoxGeometry(0.146, 0.126, 0.026), 0xe8c24a, [0, 0.03, -0.12]], [new THREE.BoxGeometry(0.026, 0.126, 0.146), 0xe8c24a, [0, 0.03, -0.12]]],
  // #1755: a rubbish / laundry bag: a soft sack with a knotted neck
  bag: () => [[new THREE.IcosahedronGeometry(0.085, 0).scale(1, 1.15, 1), 0x56606b, [0, 0.03, -0.12]], [new THREE.CylinderGeometry(0.014, 0.022, 0.04, 5), 0x56606b, [0, 0.14, -0.12]]],
  // #1753: the fishing rod, pointing ahead and up from the hand (ROD_PROXY_TIP: where src/fishing.js starts another player's line), and a caught fish hanging from the hand
  rod: () => { const up = (g) => g.rotateX(-(Math.PI / 2 - ROD_UP));
    return [[up(new THREE.CylinderGeometry(0.004, 0.009, ROD_LEN - 0.3, 5, 1, true).translate(0, 0.15 + (ROD_LEN - 0.3) / 2, 0)), 0x1f3d2c, [0, 0, 0]],
      [up(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 6).translate(0, 0, 0)), 0xb98a55, [0, 0, 0]], [new THREE.BoxGeometry(0.03, 0.05, 0.05), 0x3a3f44, [0, -0.045, -0.02]]]; },
  // #1769: a shark fin held up by its base: a grey swept-back blade (a flattened, sheared three-sided cone) over a dark-red cut
  sharkfin: () => [[new THREE.ConeGeometry(0.12, 0.42, 3).scale(0.25, 1, 1).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, -0.5, 0, 0)), 0x59626b, [0, 0.24, -0.14]], [new THREE.BoxGeometry(0.04, 0.025, 0.2), 0x8a2a24, [0, 0.02, -0.14]]],
};
// #1922: one generic fish because hi=fish carries no species. Preserve the old
// hanging envelope and hand frame; retain indices/colours in the shared cache.
function ghostFishGeometry() {
  const c=FISH_SURFACE.ghost,g=buildFishSurface(c.species,false,c.density);
  g.rotateX(Math.PI/2); // recipe +z nose points down (-y) in the hanging proxy
  g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3()),min=g.boundingBox.min;
  const scale=c.max.map((v,i)=>(v-c.min[i])/size.getComponent(i)),p=g.attributes.position;
  for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++)p.array[i*3+axis]=c.min[axis]+(p.array[i*3+axis]-min.getComponent(axis))*scale[axis];
  g.attributes.normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().makeScale(...scale)));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
const itemCache = new Map();
/** A new proxy mesh for held-item category `key`, or null for an unknown one; geometry and material shared by every ghost. */
export function ghostItem(key) {
  if (key !== 'fish' && !ITEM_PARTS[key]) return null;
  if (key === 'fish' && !itemCache.has(key)) itemCache.set(key,ghostFishGeometry());
  if (!itemCache.has(key)) {
    const parts = ITEM_PARTS[key]().map(([geo, hex, at]) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone(), c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.deleteAttribute('uv'); g.translate(...at); g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    });
    const geo = mergeGeometries(parts); geo.computeBoundingSphere();
    itemCache.set(key, geo);
  }
  packMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  const m = new THREE.Mesh(itemCache.get(key), packMat);
  m.raycast = () => {}; m.name = `ghost-item:${key}`;
  return m;
}

/** Triangle count of a category's proxy (for tests / budgets). */
export const ghostItemTriangles = (key) => { const m = ghostItem(key); return m ? (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 : 0; };
