import * as THREE from 'three';
import { COMBAT } from './config.js';

const raycast = THREE.Mesh.prototype.raycast, vertex = THREE.Mesh.prototype.getVertexPosition;
const intersections = THREE.Mesh.prototype._computeIntersections;
const getterNames = ['getX', 'getY', 'getZ'];
const plain = [THREE.BufferAttribute.prototype.getX, THREE.BufferAttribute.prototype.getY, THREE.BufferAttribute.prototype.getZ];
const interleaved = [THREE.InterleavedBufferAttribute.prototype.getX, THREE.InterleavedBufferAttribute.prototype.getY, THREE.InterleavedBufferAttribute.prototype.getZ];
const finite = a => a.every(Number.isFinite);
const sphereValues = s => s && [s.center.x, s.center.y, s.center.z, s.radius];
const boxValues = b => b && [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
function attribute(name, p) {
  if (!p) return null;
  const b = p.isInterleavedBufferAttribute ? p.data : p, getters = p.isInterleavedBufferAttribute ? interleaved : plain;
  if (p.isGLBufferAttribute || !ArrayBuffer.isView(b.array) || typeof b.array[0] !== 'number' ||
      !Number.isInteger(p.count) || p.count < 0 || !getters.every((f, i) => p[getterNames[i]] === f)) return null;
  return { name, p, b, array: b.array, version: b.version, count: p.count, itemSize: p.itemSize, normalized: p.normalized,
    offset: p.offset, stride: b.stride, getters };
}
function material(m) {
  return m?.isMaterial ? { m, version: m.version, side: m.side, visible: m.visible, transparent: m.transparent } : null;
}

/** Query-local borrowing only: no public geometry range, group, attribute or bound is changed. */
export function coldNativeView(mesh, entry) {
  const g = mesh.geometry, matrix = mesh.matrixWorld, determinant = matrix?.determinant();
  if (!entry || entry.cancelled || !entry.valid || entry.scan < entry.position.count || mesh.raycast !== raycast ||
      mesh.getVertexPosition !== vertex || mesh._computeIntersections !== intersections || mesh.isInstancedMesh || mesh.isSkinnedMesh ||
      mesh.morphTargetInfluences?.length || Object.values(g?.morphAttributes ?? {}).some(a => a.length) ||
      !matrix || !finite(matrix.elements) || !Number.isFinite(determinant) || !determinant ||
      g.groups.length > COMBAT.collision.maxSpatialEntries || !Number.isSafeInteger(COMBAT.collision.nativeChunkTriangles) || COMBAT.collision.nativeChunkTriangles <= 0 ||
      !g.boundingSphere || !finite(sphereValues(g.boundingSphere)) || g.boundingSphere.radius < 0 ||
      g.boundingBox && !finite(boxValues(g.boundingBox)) || !Number.isSafeInteger(g.drawRange.start) ||
      !(Number.isSafeInteger(g.drawRange.count) || g.drawRange.count === Infinity)) return null;
  const attrs = [];
  for (const name of Object.keys(g.attributes)) if (g.attributes[name]) {
    const a = attribute(name, g.attributes[name]); if (!a) return null; attrs.push(a);
  }
  if (!attrs.some(a => a.name === 'position' && a.itemSize === 3)) return null;
  const index = g.index && attribute('index', g.index); if (g.index && (!index || index.itemSize !== 1)) return null;
  const arrayMaterial = Array.isArray(mesh.material), refs = arrayMaterial ? mesh.material.slice() : [mesh.material];
  const materials = refs.map(material); if (materials.some(m => !m)) return null;
  const groups = g.groups.map(group => ({ group, start: group.start, count: group.count, materialIndex: group.materialIndex }));
  if (groups.some(group => !Number.isSafeInteger(group.start) || !(Number.isSafeInteger(group.count) || group.count === Infinity) ||
      arrayMaterial && (!Number.isInteger(group.materialIndex) || !materials[group.materialIndex]))) return null;
  const ancestors = []; for (let p = mesh; p; p = p.parent) ancestors.push({ p, parent: p.parent, visible: p.visible, moving: p.userData.moving });
  const geometry = Object.create(g); geometry.attributes = g.attributes; geometry.index = g.index;
  geometry.boundingSphere = g.boundingSphere; geometry.boundingBox = g.boundingBox;
  geometry.drawRange = { start: 0, count: 0 }; geometry.groups = arrayMaterial ? [null] : g.groups;
  const proxy = new THREE.Mesh(geometry, mesh.material); proxy.matrixWorld = matrix;
  const view = { mesh, g, entry, geometry, proxy, attrs, attributesRef: g.attributes, chunkTriangles: COMBAT.collision.nativeChunkTriangles, attributeNames: Object.keys(g.attributes), index, groups, groupsRef: g.groups,
    start: g.drawRange.start, count: g.drawRange.count, drawRef: g.drawRange, material: mesh.material, arrayMaterial, materials,
    layers: mesh.layers, layerMask: mesh.layers.mask, matrix, elements: matrix.elements.slice(), sphere: g.boundingSphere, sphereValues: sphereValues(g.boundingSphere),
    box: g.boundingBox, boxValues: boxValues(g.boundingBox), ancestors, disposed: false };
  view.dispose = () => { view.disposed = true; }; g.addEventListener('dispose', view.dispose);
  view.release = () => g.removeEventListener('dispose', view.dispose);
  return view;
}

export function coldNativeUnchanged(v) {
  const { mesh, g } = v;
  if (v.disposed || v.entry.cancelled || !v.entry.valid || mesh.geometry !== g || mesh.raycast !== raycast ||
      mesh.getVertexPosition !== vertex || mesh._computeIntersections !== intersections || mesh.material !== v.material ||
      mesh.layers !== v.layers || mesh.layers.mask !== v.layerMask || mesh.matrixWorld !== v.matrix || !v.elements.every((n, i) => n === mesh.matrixWorld.elements[i]) ||
      g.drawRange !== v.drawRef || g.drawRange.start !== v.start || g.drawRange.count !== v.count || g.groups !== v.groupsRef ||
      g.groups.length !== v.groups.length || g.index !== v.index?.p && !(g.index === null && v.index === null) ||
      g.boundingSphere !== v.sphere || g.boundingBox !== v.box ||
      g.boundingSphere.center.x !== v.sphereValues[0] || g.boundingSphere.center.y !== v.sphereValues[1] ||
      g.boundingSphere.center.z !== v.sphereValues[2] || g.boundingSphere.radius !== v.sphereValues[3] ||
      v.boxValues && (g.boundingBox.min.x !== v.boxValues[0] || g.boundingBox.min.y !== v.boxValues[1] || g.boundingBox.min.z !== v.boxValues[2] ||
        g.boundingBox.max.x !== v.boxValues[3] || g.boundingBox.max.y !== v.boxValues[4] || g.boundingBox.max.z !== v.boxValues[5]) ||
      g.attributes !== v.attributesRef || COMBAT.collision.nativeChunkTriangles !== v.chunkTriangles || Object.keys(g.attributes).length !== v.attributeNames.length || v.attributeNames.some(n => !g.attributes[n]) ||
      mesh.morphTargetInfluences?.length || Object.values(g.morphAttributes).some(a => a.length)) return false;
  for (const a of v.index ? [...v.attrs, v.index] : v.attrs) {
    const p = a.name === 'index' ? g.index : g.attributes[a.name], b = p?.isInterleavedBufferAttribute ? p.data : p;
    if (p !== a.p || b !== a.b || b.array !== a.array || b.version !== a.version || p.count !== a.count || p.itemSize !== a.itemSize ||
        p.normalized !== a.normalized || p.offset !== a.offset || b.stride !== a.stride ||
        !a.getters.every((f, i) => p[getterNames[i]] === f)) return false;
  }
  const refs = v.arrayMaterial ? mesh.material : [mesh.material];
  if (refs.length !== v.materials.length || v.materials.some((s, i) => refs[i] !== s.m || s.m.version !== s.version ||
      s.m.side !== s.side || s.m.visible !== s.visible || s.m.transparent !== s.transparent)) return false;
  if (v.groups.some((s, i) => g.groups[i] !== s.group || s.group.start !== s.start || s.group.count !== s.count || s.group.materialIndex !== s.materialIndex)) return false;
  return v.ancestors.every(s => s.p.parent === s.parent && s.p.visible === s.visible && s.p.userData.moving === s.moving);
}

/** Preserve each ORIGINAL native group's triangle phase and ordering, including partial final triangles. */
export function* coldNativeChunks(v, ray) {
  const count = v.index ? v.index.count : v.attrs.find(a => a.name === 'position').count;
  const ranges = v.arrayMaterial ? v.groups : [{ start: 0, count, materialIndex: 0 }];
  for (const group of ranges) {
    const start = Math.max(group.start, v.start), end = Math.min(count, Math.min(group.start + group.count, v.start + v.count));
    if (v.arrayMaterial) v.geometry.groups[0] = group.group;
    for (let at = start; at < end; at += v.chunkTriangles * 3) {
      v.geometry.drawRange.start = at; v.geometry.drawRange.count = Math.min(end - at, v.chunkTriangles * 3);
      const hits = []; raycast.call(v.proxy, ray, hits); for (const hit of hits) hit.object = v.mesh;
      yield hits;
    }
  }
}
