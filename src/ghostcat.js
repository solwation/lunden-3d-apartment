import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GHOST_CAT as C } from './config.js';
import { BREEDS, createHeldCatVisual } from './cat.js';

/** Compact appearance only: no names, position, gameplay or cat ownership crosses the wire. */
export function heldCatState(holder, cat) {
  if (!holder.held || !cat.held || !cat.visible) return null;
  const b = BREEDS.indexOf(cat.breed), v = cat.breed.coats.indexOf(cat.variant);
  return b < 0 || v < 0 ? null : [b, v, cat.kitten === true];
}

const cache = new Map();
const left = new THREE.Vector3(), right = new THREE.Vector3();
/** Snapshot geometry grouped by material: reuse coat textures, avoid one draw call per body part. */
function build(state) {
  const [b, v, kitten] = state, source = createHeldCatVisual(BREEDS[b], BREEDS[b].coats[v], kitten);
  source.updateMatrixWorld(true);
  const groups = new Map(), materials = new Set(), geometries = new Set();
  source.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  source.traverseVisible(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
  });
  const object = new THREE.Group(); object.name = 'ghost-held-cat';
  for (const [material, parts] of groups) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.raycast = () => {}; object.add(mesh);
    parts.forEach(g => g.dispose());
  }
  geometries.forEach(g => g.dispose());
  for (const m of materials) if (!groups.has(m)) m.dispose();
  return { object, users: 0, size: source.scale.x };
}

export class GhostCat {
  set(state, parent) {
    const [b, v, k] = Array.isArray(state) ? state : [];
    const valid = Number.isInteger(b) && BREEDS[b] && Number.isInteger(v) && BREEDS[b].coats[v] && typeof k === 'boolean';
    const key = valid ? `${b}:${v}:${k && !BREEDS[b].superRare}` : '';
    if (this.key === key) return;
    this.dispose(); this.key = key;
    if (!key) return;
    if (!cache.has(key)) cache.set(key, build([b, v, k && !BREEDS[b].superRare]));
    this.entry = cache.get(key); this.entry.users++;
    this.object = this.entry.object.clone();
    this.object.traverse(o => { o.raycast = () => {}; });
    parent.add(this.object);
  }

  hands() {
    // Guessed cradle: palms beneath the cat's sides in the avatar's unscaled figure frame.
    const width = C.gripWidth * (this.entry?.size ?? 1);
    return { L: { at: [width, C.gripY, C.gripZ], pole: C.elbow }, R: { at: [-width, C.gripY, C.gripZ], pole: [-C.elbow[0], ...C.elbow.slice(1)] } };
  }

  update(avatar, parent) {
    if (!this.object) return;
    avatar.object.updateMatrixWorld(true);
    avatar.hand('L', left); avatar.hand('R', right);
    parent.worldToLocal(left.add(right).multiplyScalar(.5));
    this.object.position.copy(left);
    // The cat looks back at its carrier; its natural size is independent of avatar height.
    this.object.quaternion.copy(avatar.object.quaternion);
    this.object.rotateY(Math.PI);
  }

  dispose() {
    this.object?.removeFromParent(); this.object = null;
    if (this.entry && --this.entry.users === 0) {
      this.entry.object.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      cache.delete(this.key);
    }
    this.entry = null; this.key = '';
  }
}
