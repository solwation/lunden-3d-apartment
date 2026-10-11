import * as THREE from 'three';
import { COMBAT } from './config.js';

// Conservative empty-space rejection only: Three remains authoritative for every possible hit.
// Private bounds never change geometry.boundingBox (curtains and DetailCuller share authored boxes).
const C = COMBAT.collision;
const cache = new WeakMap(), jobs = [];
const nativeMeshes = new Set([THREE.Mesh.prototype.raycast, THREE.InstancedMesh.prototype.raycast, THREE.SkinnedMesh.prototype.raycast]);
const nativeNonMeshes = new Set([THREE.Object3D.prototype.raycast, THREE.Sprite.prototype.raycast, THREE.Line.prototype.raycast, THREE.Points.prototype.raycast]);
const metrics = { pending: 0, ready: 0, accountedBytes: 0, bitBytes: 0, buildCpuMs: 0, maxChunkMs: 0, prunedQueries: 0, fallbackQueries: 0 };
let scheduled = false;
const inverse = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();

function stamp(geometry) {
  const p = geometry.attributes.position, i = geometry.index;
  const buffer = p?.isInterleavedBufferAttribute ? p.data : p;
  return [p, buffer, buffer?.array, buffer?.version, p?.count, i, i?.array, i?.version, i?.count];
}
function same(entry, geometry) {
  const p = geometry.attributes.position, i = geometry.index;
  const buffer = p?.isInterleavedBufferAttribute ? p.data : p, s = entry.stamp;
  return p === s[0] && buffer === s[1] && buffer?.array === s[2] && buffer?.version === s[3] && p?.count === s[4] &&
    i === s[5] && i?.array === s[6] && i?.version === s[7] && i?.count === s[8];
}
function safe(mesh) {
  return mesh.raycast === THREE.Mesh.prototype.raycast && !mesh.isInstancedMesh && !mesh.isSkinnedMesh &&
    !mesh.morphTargetInfluences?.length && !mesh.geometry?.morphAttributes.position?.length;
}
function release(entry) {
  if (entry.cancelled) return;
  entry.cancelled = true;
  metrics.accountedBytes -= entry.charge;
  metrics.bitBytes -= entry.bits.byteLength;
  if (entry.ready) metrics.ready--; else if (!entry.settled) metrics.pending--;
  const at = jobs.indexOf(entry);
  if (at !== -1) jobs.splice(at, 1);
  entry.geometry = null;
}
function queue(geometry) {
  const old = cache.get(geometry);
  if (old && same(old, geometry)) return old;
  if (old) { release(old); geometry.removeEventListener('dispose', old.dispose); }
  const position = geometry.attributes.position, index = geometry.index;
  const count = index ? index.count : position?.count;
  const bytes = Math.ceil(C.cells ** 3 / 32) * 4, charge = bytes + C.recordReserve;
  if (!position || count / 3 < C.minTriangles || metrics.accountedBytes + charge > C.budgetBytes) return null;
  const entry = { geometry, stamp: stamp(geometry), position, index, bits: new Uint32Array(bytes / 4), charge,
    min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], scan: 0, triangle: 0,
    count: Math.floor(count / 3), fill: null, ready: false, cancelled: false, valid: true };
  entry.dispose = () => { release(entry); cache.delete(geometry); };
  geometry.addEventListener('dispose', entry.dispose);
  cache.set(geometry, entry);
  jobs.push(entry);
  metrics.pending++; metrics.accountedBytes += charge; metrics.bitBytes += bytes;
  schedule();
  return entry;
}
function cell(entry, value, axis, upper = false) {
  const extent = entry.max[axis] - entry.min[axis];
  if (!extent) return 0;
  // Expand both triangle and query intervals across exact grid boundaries.
  const normalized = (value - entry.min[axis]) / extent * C.cells;
  return Math.max(0, Math.min(C.cells - 1, Math.floor(normalized + (upper ? 1e-7 : -1e-7))));
}
function advance(entry) {
  if (entry.scan < entry.position.count) {
    const p = entry.position, n = entry.scan++;
    const values = [p.getX(n), p.getY(n), p.getZ(n)];
    for (let axis = 0; axis < 3; axis++) {
      if (!Number.isFinite(values[axis])) entry.valid = false;
      entry.min[axis] = Math.min(entry.min[axis], values[axis]);
      entry.max[axis] = Math.max(entry.max[axis], values[axis]);
    }
    return;
  }
  if (!entry.valid || entry.triangle >= entry.count) {
    entry.ready = entry.valid;
    entry.settled = true;
    metrics.pending--;
    if (entry.ready) metrics.ready++;
    entry.geometry = null; // Completed caches have no strong geometry registry.
    jobs.shift();
    return;
  }
  if (!entry.fill) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let corner = 0; corner < 3; corner++) {
      const at = entry.triangle * 3 + corner, n = entry.index ? entry.index.getX(at) : at;
      const p = entry.position, values = [p.getX(n), p.getY(n), p.getZ(n)];
      if (!values.every(Number.isFinite)) { entry.valid = false; return; }
      for (let axis = 0; axis < 3; axis++) { lo[axis] = Math.min(lo[axis], values[axis]); hi[axis] = Math.max(hi[axis], values[axis]); }
    }
    const low = lo.map((v, axis) => cell(entry, v, axis)), high = hi.map((v, axis) => cell(entry, v, axis, true));
    entry.fill = { low, high, x: low[0], y: low[1], z: low[2] };
  }
  const f = entry.fill, bit = f.x + C.cells * (f.y + C.cells * f.z);
  entry.bits[bit >>> 5] |= 1 << (bit & 31);
  if (++f.x > f.high[0]) {
    f.x = f.low[0];
    if (++f.y > f.high[1]) {
      f.y = f.low[1];
      if (++f.z > f.high[2]) { entry.fill = null; entry.triangle++; }
    }
  }
}
function schedule() {
  if (scheduled || !jobs.length) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    const start = performance.now();
    // Check between bounded scan/cell operations, including unusually large triangle AABBs.
    let checked = null;
    while (jobs.length && performance.now() - start < C.buildMs) {
      const entry = jobs[0];
      if (checked !== entry) {
        checked = entry;
        if (!same(entry, entry.geometry)) { const geometry = entry.geometry; release(entry); queue(geometry); continue; }
      }
      advance(entry);
    }
    const elapsed = performance.now() - start;
    metrics.buildCpuMs += elapsed; metrics.maxChunkMs = Math.max(metrics.maxChunkMs, elapsed);
    schedule();
  };
  if (globalThis.requestIdleCallback) requestIdleCallback(run, { timeout: 100 }); else setTimeout(run, 0);
}

export function prepareCombatWorld(scene, ghosts, camera) {
  const candidates = new Map();
  scene.traverse((mesh) => {
    if (safe(mesh) && accepts(mesh, ghosts, camera)) {
      const geometry = mesh.geometry;
      candidates.set(geometry, geometry.index?.count ?? geometry.attributes.position?.count ?? 0);
    }
  });
  // Admit the large merged scenery first; this temporary list is discarded immediately.
  for (const [geometry] of [...candidates].sort((a, b) => b[1] - a[1])) queue(geometry);
}
export function combatWorldMetrics() { return { ...metrics }; }
export function combatWorldState(geometry) {
  const entry = cache.get(geometry);
  return { ready: !!entry?.ready && same(entry, geometry), pending: !!entry?.geometry, valid: entry?.valid ?? false };
}
function empty(mesh, ray) {
  if (!safe(mesh) || !Number.isFinite(ray.far) || mesh.matrixWorld.determinant() === 0) return false;
  const entry = queue(mesh.geometry);
  if (!entry?.ready) return false;
  inverse.copy(mesh.matrixWorld).invert();
  a.copy(ray.ray.direction).multiplyScalar(ray.near).add(ray.ray.origin).applyMatrix4(inverse);
  b.copy(ray.ray.direction).multiplyScalar(ray.far).add(ray.ray.origin).applyMatrix4(inverse);
  const lo = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)];
  const hi = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
  if (![...lo, ...hi].every(Number.isFinite)) return false;
  for (let axis = 0; axis < 3; axis++) if (hi[axis] < entry.min[axis] || lo[axis] > entry.max[axis]) return true;
  const low = lo.map((v, axis) => cell(entry, v, axis)), high = hi.map((v, axis) => cell(entry, v, axis, true));
  if (high.reduce((volume, value, axis) => volume * (value - low[axis] + 1), 1) > C.queryCells) return false;
  for (let z = low[2]; z <= high[2]; z++) for (let y = low[1]; y <= high[1]; y++) for (let x = low[0]; x <= high[0]; x++) {
    const bit = x + C.cells * (y + C.cells * z);
    if (entry.bits[bit >>> 5] & (1 << (bit & 31))) return false;
  }
  return true;
}
function accepts(object, ghosts, camera) {
  if (!object?.isMesh || object.material?.transparent || object.material?.visible === false) return false;
  for (let p = object; p; p = p.parent) if (!p.visible || p === ghosts || p === camera || p.userData.moving) return false;
  return true;
}
/** Sorted original solid hits; fresh traversal preserves changes to doors, layers, membership and custom raycasts. */
export function combatWorldHits(scene, ghosts, camera, ray) {
  const hits = [];
  const visit = (object) => {
    if (!object.visible || object === ghosts || object === camera || object.userData.moving) return;
    let propagate = true;
    if (ray.layers.test(object.layers)) {
      const nativeMesh = nativeMeshes.has(object.raycast);
      if (nativeMesh && accepts(object, ghosts, camera)) {
        if (empty(object, ray)) metrics.prunedQueries++;
        else { metrics.fallbackQueries++; propagate = object.raycast(ray, hits) !== false; }
      } else if (!nativeMesh && !nativeNonMeshes.has(object.raycast)) {
        propagate = object.raycast(ray, hits) !== false;
      }
    }
    if (propagate) for (const child of object.children) visit(child);
  };
  for (const child of scene.children) visit(child);
  return hits.filter((hit) => accepts(hit.object, ghosts, camera)).sort((a, b) => a.distance - b.distance);
}
