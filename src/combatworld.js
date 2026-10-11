import * as THREE from 'three';
import { COMBAT } from './config.js';

// Conservative empty-space rejection only: Three remains authoritative for every possible hit.
// Private bounds never change geometry.boundingBox (curtains and DetailCuller share authored boxes).
const C = COMBAT.collision;
const cache = new WeakMap(), jobs = [];
const nativeMeshes = new Set([THREE.Mesh.prototype.raycast, THREE.InstancedMesh.prototype.raycast, THREE.SkinnedMesh.prototype.raycast]);
const nativeNonMeshes = new Set([THREE.Object3D.prototype.raycast, THREE.Sprite.prototype.raycast, THREE.Line.prototype.raycast, THREE.Points.prototype.raycast]);
const metrics = { pending: 0, ready: 0, accountedBytes: 0, bitBytes: 0, clusterBytes: 0, spatialBytes: 0, spatialEntries: 0, spatialReady: 0, buildCpuMs: 0, maxChunkMs: 0, prunedQueries: 0, fallbackQueries: 0, pathInstances: 0, pathSelectedInstances: 0, asyncSlices: 0, maxAsyncSliceMs: 0 };
let scheduled = false, urgentScheduled = false;
const inverse = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

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
  return mesh.raycast === THREE.Mesh.prototype.raycast && mesh.getVertexPosition === THREE.Mesh.prototype.getVertexPosition && !mesh.isInstancedMesh && !mesh.isSkinnedMesh &&
    !mesh.morphTargetInfluences?.length && !mesh.geometry?.morphAttributes.position?.length;
}
function release(entry) {
  if (entry.cancelled) return;
  entry.cancelled = true;
  metrics.accountedBytes -= entry.charge;
  metrics.bitBytes -= entry.bits.byteLength;
  metrics.clusterBytes -= entry.clusterBounds.byteLength;
  metrics.spatialBytes -= entry.spatial?.bytes ?? 0;
  if (entry.spatial) metrics.spatialEntries--;
  if (entry.spatialReady) metrics.spatialReady--;
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
  const bytes = Math.ceil(C.cells ** 3 / 32) * 4;
  if (!position || count / 3 < C.minTriangles) return null;
  const triangles = Math.floor(count / 3), IndexArray = position.count <= 65536 ? Uint16Array : Uint32Array;
  const FaceArray = triangles <= 65536 ? Uint16Array : Uint32Array;
  const spatialBytes = triangles * (3 * IndexArray.BYTES_PER_ELEMENT + FaceArray.BYTES_PER_ELEMENT) + (64 + 65 + 64) * 4 + 64 * 6 * 8;
  const hasGrid = metrics.accountedBytes + bytes + C.recordReserve <= C.budgetBytes;
  const hasSpatial = metrics.spatialBytes + spatialBytes <= C.spatialBudgetBytes && metrics.spatialEntries < C.maxSpatialEntries;
  if (!hasGrid && !hasSpatial) return null;
  const charge = hasGrid ? bytes + C.recordReserve : 0;
  const entry = { geometry, stamp: stamp(geometry), position, index, bits: new Uint32Array(hasGrid ? bytes / 4 : 0), charge,
    min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], scan: 0, triangle: 0,
    clusterBounds: new Float64Array(hasGrid ? C.clusters * 6 : 0), clusterSpan: Math.ceil(Math.floor(count / 3) / C.clusters),
    count: Math.floor(count / 3), fill: null, ready: false, cancelled: false, valid: true };
  for (let cluster = 0; cluster < (hasGrid ? C.clusters : 0); cluster++) for (let axis = 0; axis < 3; axis++) {
    entry.clusterBounds[cluster * 6 + axis] = Infinity; entry.clusterBounds[cluster * 6 + axis + 3] = -Infinity;
  }
  if (hasSpatial) {
    entry.spatial = { bytes: spatialBytes, divisions: [1, 1, 1], counts: new Uint32Array(64),
      offsets: new Uint32Array(65), cursor: new Uint32Array(64), indices: new IndexArray(entry.count * 3),
      original: new FaceArray(entry.count), bounds: new Float64Array(64 * 6), triangle: 0, phase: 0 };
    for (let bucket = 0; bucket < 64; bucket++) for (let axis = 0; axis < 3; axis++) {
      entry.spatial.bounds[bucket * 6 + axis] = Infinity; entry.spatial.bounds[bucket * 6 + axis + 3] = -Infinity;
    }
    metrics.spatialBytes += spatialBytes; metrics.spatialEntries++;
  }
  entry.dispose = () => { release(entry); cache.delete(geometry); };
  geometry.addEventListener('dispose', entry.dispose);
  cache.set(geometry, entry);
  jobs.push(entry);
  metrics.pending++; metrics.accountedBytes += charge; metrics.bitBytes += entry.bits.byteLength; metrics.clusterBytes += entry.clusterBounds.byteLength;
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
function makeView(entry) {
  entry.view = Object.create(entry.geometry);
  entry.view.drawRange = { start: 0, count: 0 };
  entry.proxy = new THREE.Mesh(entry.view, null);
  entry.fallbackSphere = new THREE.Box3(new THREE.Vector3(...entry.min), new THREE.Vector3(...entry.max)).getBoundingSphere(new THREE.Sphere());
}
function advanceSpatial(entry) {
  const spatial = entry.spatial;
  if (!spatial.phase && !spatial.triangle) {
    for (let split = 0; split < 6; split++) {
      let axis = 0;
      for (let candidate = 1; candidate < 3; candidate++) if ((entry.max[candidate] - entry.min[candidate]) / spatial.divisions[candidate] >
          (entry.max[axis] - entry.min[axis]) / spatial.divisions[axis]) axis = candidate;
      spatial.divisions[axis] *= 2;
    }
  }
  if (spatial.triangle >= entry.count) {
    if (!spatial.phase) {
      for (let bucket = 0; bucket < 64; bucket++) spatial.offsets[bucket + 1] = spatial.offsets[bucket] + spatial.counts[bucket];
      spatial.cursor.set(spatial.offsets.subarray(0, 64)); spatial.triangle = 0; spatial.phase = 1;
    } else {
      spatial.attribute = new THREE.BufferAttribute(spatial.indices, 1);
      entry.spatialReady = true; metrics.spatialReady++; makeView(entry);
    }
    return;
  }
  const indices = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], center = [0, 0, 0];
  for (let corner = 0; corner < 3; corner++) {
    const at = spatial.triangle * 3 + corner, n = entry.index ? entry.index.getX(at) : at;
    if (!Number.isInteger(n) || n < 0 || n >= entry.position.count) { entry.valid = false; return; }
    indices[corner] = n;
    const values = [entry.position.getX(n), entry.position.getY(n), entry.position.getZ(n)];
    if (!values.every(Number.isFinite)) { entry.valid = false; return; }
    for (let axis = 0; axis < 3; axis++) { center[axis] += values[axis] / 3; lo[axis] = Math.min(lo[axis], values[axis]); hi[axis] = Math.max(hi[axis], values[axis]); }
  }
  const cell = center.map((value, axis) => Math.max(0, Math.min(spatial.divisions[axis] - 1,
    Math.floor((value - entry.min[axis]) / (entry.max[axis] - entry.min[axis] || 1) * spatial.divisions[axis]))));
  const bucket = cell[0] + spatial.divisions[0] * (cell[1] + spatial.divisions[1] * cell[2]);
  if (!spatial.phase) spatial.counts[bucket]++;
  else {
    const slot = spatial.cursor[bucket]++;
    spatial.indices.set(indices, slot * 3); spatial.original[slot] = spatial.triangle;
    for (let axis = 0; axis < 3; axis++) { spatial.bounds[bucket * 6 + axis] = Math.min(spatial.bounds[bucket * 6 + axis], lo[axis]);
      spatial.bounds[bucket * 6 + axis + 3] = Math.max(spatial.bounds[bucket * 6 + axis + 3], hi[axis]); }
  }
  spatial.triangle++;
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
  if (entry.valid && entry.spatial && !entry.spatialReady) { advanceSpatial(entry); return; }
  if (!entry.valid || !entry.bits.length || entry.triangle >= entry.count) {
    entry.ready = entry.valid && !!entry.bits.length;
    entry.settled = true;
    metrics.pending--;
    if (entry.ready) metrics.ready++;
    if (entry.ready) {
      if (!entry.view) makeView(entry);
    }
    entry.geometry = null; // No external strong registry; the private view refers to its key only inside this WeakMap entry.
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
    const cluster = Math.floor(entry.triangle / entry.clusterSpan) * 6;
    for (let axis = 0; axis < 3; axis++) {
      entry.clusterBounds[cluster + axis] = Math.min(entry.clusterBounds[cluster + axis], lo[axis]);
      entry.clusterBounds[cluster + axis + 3] = Math.max(entry.clusterBounds[cluster + axis + 3], hi[axis]);
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
      const urgent = jobs.findIndex(job => job.urgent && job.spatial && !job.spatialReady);
      const early = urgent >= 0 ? urgent : jobs.findIndex(job => job.spatial && !job.spatialReady);
      if (early > 0) jobs.unshift(...jobs.splice(early, 1));
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

function scheduleUrgent() {
  if (urgentScheduled || !jobs.some(entry => entry.urgent && !entry.spatialReady)) return;
  urgentScheduled = true;
  const run = () => {
    urgentScheduled = false;
    const start = performance.now();
    while (performance.now() - start < C.buildMs) {
      const at = jobs.findIndex(entry => entry.urgent && !entry.spatialReady);
      if (at === -1) break;
      if (at) jobs.unshift(...jobs.splice(at, 1));
      const entry = jobs[0];
      if (!same(entry, entry.geometry)) { const geometry = entry.geometry; release(entry); queue(geometry); }
      else advance(entry);
    }
    const elapsed = performance.now() - start;
    metrics.buildCpuMs += elapsed; metrics.maxChunkMs = Math.max(metrics.maxChunkMs, elapsed);
    scheduleUrgent(); schedule();
  };
  if (globalThis.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 0);
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
  return { spatialReady: !!entry?.spatialReady && same(entry, geometry), ready: !!entry?.ready && same(entry, geometry), pending: !!entry?.geometry, urgent: !!entry?.urgent, urgentUsers: entry?.urgentUsers ?? 0, valid: entry?.valid ?? false };
}
function outside(low, high, min, max) {
  const epsilon = 64 * Number.EPSILON * Math.max(1, Math.abs(low), Math.abs(high), Math.abs(min), Math.abs(max));
  return low > max + epsilon || high < min - epsilon;
}
function emptyPath(mesh, points, snapshot = null) {
  if (!safe(mesh) || !Number.isFinite(mesh.matrixWorld.determinant()) || mesh.matrixWorld.determinant() === 0) return false;
  const entry = snapshot?.entry ?? queue(mesh.geometry);
  inverse.copy(snapshot?.inverse ?? mesh.matrixWorld);
  if (!snapshot) inverse.invert();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    a.copy(point).applyMatrix4(inverse);
    const values = [a.x, a.y, a.z];
    for (let axis = 0; axis < 3; axis++) { lo[axis] = Math.min(lo[axis], values[axis]); hi[axis] = Math.max(hi[axis], values[axis]); }
  }
  if (![...lo, ...hi].every(Number.isFinite)) return false;
  const sphere = mesh.geometry.boundingSphere;
  if (sphere && Number.isFinite(sphere.radius)) {
    let distance = 0;
    for (let axis = 0; axis < 3; axis++) { const value = sphere.center.getComponent(axis); const delta = value - Math.max(lo[axis], Math.min(hi[axis], value)); distance += delta * delta; }
    if (distance > sphere.radius ** 2 + 64 * Number.EPSILON * Math.max(1, distance, sphere.radius ** 2)) return true;
  }
  if (entry?.valid && entry.scan >= entry.position.count) {
    for (let axis = 0; axis < 3; axis++) if (outside(lo[axis], hi[axis], entry.min[axis], entry.max[axis])) return true;
  }
  if (entry?.spatialReady) {
    let overlaps = false;
    for (let bucket = 0; bucket < 64 && !overlaps; bucket++) {
      const base = bucket * 6;
      overlaps = !lo.some((value, axis) => outside(value, hi[axis], entry.spatial.bounds[base + axis], entry.spatial.bounds[base + axis + 3]));
    }
    if (!overlaps) return true;
  }
  if (!entry?.ready) return false;
  for (let axis = 0; axis < 3; axis++) if (outside(lo[axis], hi[axis], entry.min[axis], entry.max[axis])) return true;
  const low = lo.map((v, axis) => cell(entry, v, axis)), high = hi.map((v, axis) => cell(entry, v, axis, true));
  if (high.reduce((volume, value, axis) => volume * (value - low[axis] + 1), 1) > C.queryCells) return false;
  for (let z = low[2]; z <= high[2]; z++) for (let y = low[1]; y <= high[1]; y++) for (let x = low[0]; x <= high[0]; x++) {
    const bit = x + C.cells * (y + C.cells * z);
    if (entry.bits[bit >>> 5] & (1 << (bit & 31))) return false;
  }
  return true;
}
function empty(mesh, ray) {
  if (!Number.isFinite(ray.near) || !Number.isFinite(ray.far)) return false;
  const start = ray.ray.at(ray.near, b), end = ray.ray.at(ray.far, c);
  return emptyPath(mesh, [start, end]);
}

function rangedHits(mesh, ray, hits, snapshot) {
  const entry = snapshot?.entry ?? cache.get(mesh.geometry), geometry = mesh.geometry;
  // Misaligned ranges/groups have a different triangle phase: retain the original native behavior.
  if (!safe(mesh) || !(entry?.ready || entry?.spatialReady) || !same(entry, geometry) || !Number.isFinite(ray.near) || !Number.isFinite(ray.far) ||
      !Number.isFinite(mesh.matrixWorld.determinant()) || mesh.matrixWorld.determinant() === 0 || geometry.drawRange.start % 3 ||
      geometry.groups.some((group, i, groups) => group.start % 3 || group.count % 3 || (i && group.start < groups[i - 1].start + groups[i - 1].count))) return mesh.raycast(ray, hits);
  inverse.copy(snapshot?.inverse ?? mesh.matrixWorld); if (!snapshot) inverse.invert();
  a.copy(ray.ray.origin).addScaledVector(ray.ray.direction, ray.near).applyMatrix4(inverse);
  b.copy(ray.ray.origin).addScaledVector(ray.ray.direction, ray.far).applyMatrix4(inverse);
  const lo = [Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z)], hi = [Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z)];
  const reordered = entry.spatialReady && !Array.isArray(mesh.material) && !geometry.groups.length && geometry.drawRange.start === 0 &&
    geometry.drawRange.count >= entry.count * 3;
  if (!reordered && !entry.ready) return mesh.raycast(ray, hits);
  const spatial = reordered ? entry.spatial : null;
  const view = entry.view, proxy = entry.proxy;
  proxy.matrixWorld = mesh.matrixWorld; proxy.material = mesh.material;
  view.attributes = geometry.attributes; view.index = spatial ? spatial.attribute : geometry.index; view.groups = geometry.groups;
  view.boundingBox = geometry.boundingBox; view.boundingSphere = geometry.boundingSphere ?? entry.fallbackSphere;
  const firstHit = hits.length;
  for (let cluster = 0; cluster < (spatial ? 64 : C.clusters); cluster++) {
    const box = cluster * 6, bounds = spatial ? spatial.bounds : entry.clusterBounds;
    if (lo.some((value, axis) => outside(value, hi[axis], bounds[box + axis], bounds[box + axis + 3]))) continue;
    const start = spatial ? spatial.offsets[cluster] * 3 : Math.max(geometry.drawRange.start, cluster * entry.clusterSpan * 3);
    const end = spatial ? spatial.offsets[cluster + 1] * 3 : Math.min(geometry.drawRange.start + geometry.drawRange.count, (cluster + 1) * entry.clusterSpan * 3, entry.count * 3);
    if (end <= start) continue;
    view.drawRange.start = start; view.drawRange.count = end - start;
    const before = hits.length;
    THREE.Mesh.prototype.raycast.call(proxy, ray, hits);
    for (let i = before; i < hits.length; i++) { hits[i].object = mesh; if (spatial) hits[i].faceIndex = spatial.original[hits[i].faceIndex]; }
  }
  if (spatial) { const ordered = hits.splice(firstHit).sort((a, b) => a.faceIndex - b.faceIndex); hits.push(...ordered); }
}

// Match native InstancedMesh's per-instance Mesh raycast, selecting fresh matrices once for this path.
function pathInstances(object, points) {
  if (object.raycast !== THREE.InstancedMesh.prototype.raycast || object.getMatrixAt !== THREE.InstancedMesh.prototype.getMatrixAt ||
      object.isSkinnedMesh || object.morphTexture || object.morphTargetInfluences?.length || object.geometry.morphAttributes.position?.length ||
      !object.boundingSphere || object.material === undefined || !object.geometry.boundingSphere || !Number.isFinite(object.geometry.boundingSphere.radius) || object.geometry.boundingSphere.radius < 0) return null;
  const pathBox = new THREE.Box3().setFromPoints(points), matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const selected = [];
  metrics.pathInstances += object.count;
  for (let i = 0; i < object.count; i++) {
    object.getMatrixAt(i, matrix); world.multiplyMatrices(object.matrixWorld, matrix);
    sphere.copy(object.geometry.boundingSphere).applyMatrix4(world);
    const distance = pathBox.distanceToPoint(sphere.center);
    const padding = 64 * Number.EPSILON * Math.max(1, Math.abs(distance), Math.abs(sphere.radius));
    if (Number.isFinite(distance) && Number.isFinite(sphere.radius) && distance > sphere.radius + padding) continue;
    const proxy = new THREE.Mesh(object.geometry, object.material);
    proxy.matrixWorld.copy(world);
    selected.push({ proxy, id: i });
  }
  metrics.pathSelectedInstances += selected.length;
  return selected;
}
/** Prepare one synchronous arc query, without caching scene membership/transforms between shots.
 * Children remain under custom raycast nodes so their return-false propagation is evaluated for each segment.
 */
export function combatWorldPath(scene, ghosts, camera, points, layers) {
  const build = (object) => {
    if (!object.visible || object === ghosts || object === camera || object.userData.moving) return [];
    const children = object.children.flatMap(build);
    if (!layers.test(object.layers)) return children;
    const native = nativeMeshes.has(object.raycast);
    if (native && accepts(object, ghosts, camera)) {
      const instances = object.isInstancedMesh ? pathInstances(object, points) : null;
      if (instances) return instances.length ? [{ object, children, native: true, instances, instanceSphere: new THREE.Sphere() }] : children;
      if (emptyPath(object, points)) return children;
      const entry = safe(object) ? cache.get(object.geometry) : null;
      const snapshot = (entry?.ready || entry?.spatialReady) ? { entry, inverse: object.matrixWorld.clone().invert() } : null;
      return [{ object, children, native: true, snapshot }];
    }
    if (!native && !nativeNonMeshes.has(object.raycast)) return [{ object, children }];
    return children;
  };
  const roots = scene.children.flatMap(build);
  return (ray) => {
    const hits = [];
    const visit = ({ object, children, native, snapshot, instances, instanceSphere }) => {
      if (instances) {
        instanceSphere.copy(object.boundingSphere).applyMatrix4(object.matrixWorld);
        if (!ray.ray.intersectsSphere(instanceSphere)) { for (const child of children) visit(child); return; }
        for (const { proxy, id } of instances) {
          const before = hits.length;
          THREE.Mesh.prototype.raycast.call(proxy, ray, hits);
          for (let i = before; i < hits.length; i++) { hits[i].object = object; hits[i].instanceId = id; }
        }
        for (const child of children) visit(child);
        return;
      }
      const start = ray.ray.at(ray.near, b), end = ray.ray.at(ray.far, c);
      const skip = native && Number.isFinite(ray.near) && Number.isFinite(ray.far) && emptyPath(object, [start, end], snapshot);
      const propagate = skip ? true : (native ? rangedHits(object, ray, hits, snapshot) : object.raycast(ray, hits)) !== false;
      if (propagate) for (const child of children) visit(child);
    };
    for (const root of roots) visit(root);
    return hits.filter((hit) => accepts(hit.object, ghosts, camera)).sort((a, b) => a.distance - b.distance);
  };
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

/** Cold and warm Nerf validation yields between current-world nodes; null is cancellation/deadline. */
export async function combatWorldPathBlocked(scene, ghosts, camera, points, layers, { cancelled = () => false, deadline = performance.now() + 2000 } = {}) {
  let expired = false, slice = performance.now();
  const timer = setTimeout(() => { expired = true; }, Math.max(0, deadline - performance.now()));
  const stopped = () => expired || performance.now() >= deadline || cancelled();
  const pause = async (force = false) => {
    const elapsed = performance.now() - slice;
    if (force || elapsed >= C.buildMs) {
      metrics.asyncSlices++; metrics.maxAsyncSliceMs = Math.max(metrics.maxAsyncSliceMs, elapsed);
      await new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; clearTimeout(timeout); resolve(); } };
        // CPU work yields a task without spending one whole frame per 2 ms slice.
        // Cache waits keep frame pacing instead of polling an unfinished build.
        const timeout = setTimeout(finish, force ? Math.max(0, Math.min(32, deadline - performance.now())) : 0);
        if (force && globalThis.requestAnimationFrame) requestAnimationFrame(finish);
      });
      slice = performance.now();
    }
    return stopped();
  };
  const excluded = object => {
    for (let p = object; p; p = p.parent) if (!p.visible || p === ghosts || p === camera || p.userData.moving) return true;
    return false;
  };
  const pending = new Set(), instanceCache = new WeakMap(), pathBox = new THREE.Box3().setFromPoints(points);
  const query = new THREE.Raycaster(); query.camera = camera; query.layers.mask = layers.mask;
  try {
    // Only potentially overlapping native geometry is promoted; no synchronous triangle build.
    const stack = [...scene.children];
    while (stack.length) {
      if (stopped()) return null;
      const object = stack.pop();
      if (!excluded(object)) {
        if (safe(object) && accepts(object, ghosts, camera) && query.layers.test(object.layers) && !emptyPath(object, points)) {
          const entry = cache.get(object.geometry);
          if (entry?.spatial && !entry.spatialReady && !entry.settled) { if (!pending.has(entry)) { entry.urgentUsers = (entry.urgentUsers ?? 0) + 1; entry.urgent = true; pending.add(entry); } scheduleUrgent(); }
        }
        stack.push(...object.children);
      }
      if (performance.now() - slice >= C.buildMs && await pause()) return null;
    }
    while ([...pending].some(entry => !entry.spatialReady && !entry.settled && !entry.cancelled)) if (await pause(true)) return null;
    if ([...pending].some(entry => entry.cancelled)) return null;
    for (let segment = 1; segment < points.length; segment++) {
      const delta = points[segment].clone().sub(points[segment - 1]), length = delta.length();
      query.set(points[segment - 1], length ? delta.divideScalar(length) : new THREE.Vector3(0, 0, -1)); query.far = length;
      const nodes = [...scene.children].reverse();
      while (nodes.length) {
        if (stopped()) return null;
        const object = nodes.pop(); let propagate = true;
        if (excluded(object)) continue;
        if (query.layers.test(object.layers)) {
          const native = nativeMeshes.has(object.raycast), hits = [];
          if (native && accepts(object, ghosts, camera)) {
            let instances = null;
            if (object.isInstancedMesh && object.raycast === THREE.InstancedMesh.prototype.raycast && object.getMatrixAt === THREE.InstancedMesh.prototype.getMatrixAt &&
                object.boundingSphere && object.material !== undefined && object.geometry.boundingSphere && object.geometry.boundingSphere.radius >= 0 && Number.isFinite(object.geometry.boundingSphere.radius) &&
                !object.morphTexture && !object.morphTargetInfluences?.length && !object.geometry.morphAttributes.position?.length) {
              const old = instanceCache.get(object), signature = [object.raycast, object.getMatrixAt, object.morphTexture, object.morphTargetInfluences, object.morphTargetInfluences?.length, object.geometry.morphAttributes.position, object.geometry.morphAttributes.position?.length,
                object.count, object.instanceMatrix, object.instanceMatrix.array, object.instanceMatrix.version, object.geometry, object.material,
                ...object.matrixWorld.elements, ...object.geometry.boundingSphere.center.toArray(), object.geometry.boundingSphere.radius];
              if (old && signature.every((v, i) => v === old.signature[i])) instances = old.instances;
              else {
                instances = [];
                const local = new THREE.Matrix4(), world = new THREE.Matrix4(), sphere = new THREE.Sphere();
                metrics.pathInstances += object.count;
                for (let i = 0; i < object.count; i++) {
                  object.getMatrixAt(i, local); world.multiplyMatrices(object.matrixWorld, local);
                  sphere.copy(object.geometry.boundingSphere).applyMatrix4(world);
                  const distance = pathBox.distanceToPoint(sphere.center), padding = 64 * Number.EPSILON * Math.max(1, Math.abs(distance), Math.abs(sphere.radius));
                  if (!(Number.isFinite(distance) && Number.isFinite(sphere.radius) && distance > sphere.radius + padding)) {
                    const proxy = new THREE.Mesh(object.geometry, object.material); proxy.matrixWorld.copy(world); instances.push({ proxy, id: i });
                  }
                  if (i % 128 === 127 && performance.now() - slice >= C.buildMs && await pause()) return null;
                }
                metrics.pathSelectedInstances += instances.length;
                const current = [object.raycast, object.getMatrixAt, object.morphTexture, object.morphTargetInfluences, object.morphTargetInfluences?.length, object.geometry.morphAttributes.position, object.geometry.morphAttributes.position?.length,
                object.count, object.instanceMatrix, object.instanceMatrix.array, object.instanceMatrix.version, object.geometry, object.material,
                  ...object.matrixWorld.elements, ...object.geometry.boundingSphere.center.toArray(), object.geometry.boundingSphere.radius];
                if (!signature.every((value, i) => value === current[i])) return null;
                instanceCache.set(object, { signature, instances });
              }
              const sphere = object.boundingSphere.clone().applyMatrix4(object.matrixWorld);
              if (query.ray.intersectsSphere(sphere)) for (const { proxy, id } of instances) {
                const before = hits.length; THREE.Mesh.prototype.raycast.call(proxy, query, hits);
                for (let i = before; i < hits.length; i++) { hits[i].object = object; hits[i].instanceId = id; }
                if (performance.now() - slice >= C.buildMs && await pause()) return null;
              }
            } else if (!empty(object, query)) rangedHits(object, query, hits, null);
            if (hits.some(hit => accepts(hit.object, ghosts, camera))) return stopped() ? null : true;
          } else if (!native && !nativeNonMeshes.has(object.raycast)) {
            propagate = object.raycast(query, hits) !== false;
            if (hits.some(hit => accepts(hit.object, ghosts, camera))) return stopped() ? null : true;
          }
        }
        if (propagate) for (let i = object.children.length - 1; i >= 0; i--) nodes.push(object.children[i]);
        if (performance.now() - slice >= C.buildMs && await pause()) return null;
      }
    }
    metrics.maxAsyncSliceMs = Math.max(metrics.maxAsyncSliceMs, performance.now() - slice);
    return stopped() ? null : false;
  } finally {
    for (const entry of pending) { entry.urgentUsers--; entry.urgent = entry.urgentUsers > 0; }
    metrics.maxAsyncSliceMs = Math.max(metrics.maxAsyncSliceMs, performance.now() - slice); clearTimeout(timer);
  }
}
