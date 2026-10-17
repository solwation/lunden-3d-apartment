import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SABER, TOYS } from './config.js';
import { rifleModel } from './rifle.js';
import { buildSaber } from './saber.js';
import { bowGeometry } from './bow.js';
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

const SIMPLE = { // no first-person model to borrow (the ball is a sphere anyway; the jetpack sits on the back)
  ball: () => [new THREE.SphereGeometry(0.12, 14, 10).translate(0, 0, -0.08), new THREE.MeshLambertMaterial({ color: 0xd8641e })],
  jetpack: () => [new THREE.BoxGeometry(0.32, 0.46, 0.18), new THREE.MeshLambertMaterial({ color: 0xc8ccd0 })],
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
  if (key === 'jetpack') m.position.set(0, 1.2, 0.2); // (the others follow the hand, Ghost.animate)
  m.name = `ghost-prop:${key}`;
  return m;
}
