import * as THREE from 'three';

// #474: only call on a construction-only scene, before furniture/decoration is added.
// Bake sharp edges once, in the nearest animated fitting's frame (or a floor batch).
export function architectureEdges(root, { moving = [], exclude = [], floor = 3, opacity = 0.3 } = {}) {
  const anchors = new Set(moving.filter(Boolean)), skipped = new Set(exclude.filter(Boolean));
  const batches = new Map(), cache = new WeakMap(), point = new THREE.Vector3();
  const material = new THREE.LineBasicMaterial({ color: 0x394047, transparent: true, opacity, depthTest: true, depthWrite: false });
  // Move the depth by 1 mm toward the eye, not the geometry: stable on coplanar faces,
  // with ordinary depth testing still hiding edges behind walls and furniture.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      gl_Position = projectionMatrix * vec4(mvPosition.xyz * max(0.0, 1.0 - 0.001 / max(length(mvPosition.xyz), 0.001)), mvPosition.w);`);
  };
  root.updateWorldMatrix(true, true);
  function visit(o, anchor = root) {
    if (skipped.has(o) || !o.visible || o.name === 'contents' || o.userData.noArchitectureEdges) return;
    if (anchors.has(o)) anchor = o;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry.type !== 'PlaneGeometry') {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.every(m => m && !m.transparent && !m.userData.skin)) {
        let edges = cache.get(o.geometry);
        if (!edges) { edges = new THREE.EdgesGeometry(o.geometry, 30); cache.set(o.geometry, edges); }
        const transform = anchor.matrixWorld.clone().invert().multiply(o.matrixWorld);
        const pos = edges.getAttribute('position');
        o.geometry.computeBoundingBox();
        o.geometry.boundingBox.getCenter(point).applyMatrix4(o.matrixWorld);
        const cell = anchor === root ? (point.y < floor ? 'lower' : 'upper') : 'moving';
        let byCell = batches.get(anchor); if (!byCell) batches.set(anchor, byCell = new Map());
        let values = byCell.get(cell); if (!values) byCell.set(cell, values = []);
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        for (let i = 0; i < pos.count; i += 2) {
          a.fromBufferAttribute(pos, i).applyMatrix4(transform); b.fromBufferAttribute(pos, i + 1).applyMatrix4(transform);
          if (a.distanceToSquared(b) < 0.06 ** 2) continue; // no tiny handle/tessellation detail
          values.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
    for (const child of o.children) visit(child, anchor);
  }
  visit(root);
  const lines = [];
  for (const [anchor, cells] of batches) for (const values of cells.values()) {
    if (!values.length) continue;
    // Coincident box edges need only one segment (avoid darker seams/overdraw).
    const seen = new Set(), unique = [], key = (v, i) => v.slice(i, i + 3).map(x => Math.round(x * 10000)).join(',');
    for (let i = 0; i < values.length; i += 6) {
      const a = key(values, i), b = key(values, i + 3), k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!seen.has(k)) { seen.add(k); unique.push(...values.slice(i, i + 6)); }
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
    geometry.computeBoundingSphere();
    const line = new THREE.LineSegments(geometry, material);
    line.name = 'architecture-edges'; line.userData.architectureEdges = true;
    line.raycast = () => {}; anchor.add(line); lines.push(line);
  }
  return lines;
}
