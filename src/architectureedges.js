import * as THREE from 'three';

// A small construction-only triangle tree keeps union probes cheap even for
// fitted geometry baked into one large mesh. It is never used during frames.
function solidTree(geometry) {
  const p = geometry.attributes.position, index = geometry.index, triangles = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const vertices = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + k) : i + k));
    const triangle = new THREE.Triangle(...vertices), bounds = new THREE.Box3().setFromPoints(vertices);
    triangles.push({ triangle, bounds, center: bounds.getCenter(new THREE.Vector3()), normal: triangle.getNormal(new THREE.Vector3()) });
  }
  function build(items) {
    const bounds = new THREE.Box3(); for (const t of items) bounds.union(t.bounds);
    if (items.length <= 12) return { bounds, items };
    const size = bounds.getSize(new THREE.Vector3()), axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    items.sort((a, b) => a.center[axis] - b.center[axis]); const mid = Math.floor(items.length / 2);
    return { bounds, children: [build(items.slice(0, mid)), build(items.slice(mid))] };
  }
  return build(triangles);
}

// Classify the boundary of the union, rather than every construction block.
// Cross-sections distinguish a flat shared seam (half solid) from a genuine
// convex/concave corner. Never combine separate animated anchors.
function unionEdges(values, solids) {
  const sample = new THREE.Vector3(), local = new THREE.Vector3();
  const ray = new THREE.Ray(), directionProbe = new THREE.Vector3(.371, .529, .763).normalize(), intersection = new THREE.Vector3();
  const trees = new WeakMap();
  for (const s of solids) {
    s.inverse = s.transform.clone().invert();
    s.bounds = s.geometry.boundingBox.clone().applyMatrix4(s.transform);
    if ((s.geometry.type === 'PlaneGeometry' || s.geometry.userData.edgePlane)) {
      const p = s.geometry.attributes.position, index = s.geometry.index;
      s.triangles = [];
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const vertices = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + k) : i + k).applyMatrix4(s.transform));
        s.triangles.push(new THREE.Triangle(...vertices));
      }
    }
    if (!s.triangles && s.geometry.type !== 'BoxGeometry') {
      s.tree = trees.get(s.geometry);
      if (!s.tree) { s.tree = solidTree(s.geometry); trees.set(s.geometry, s.tree); }
    }
  }
  const inside = (p, nearby) => nearby.some(s => {
    if (s.triangles || !s.bounds.containsPoint(p)) return false;
    local.copy(p).applyMatrix4(s.inverse);
    if (!s.geometry.boundingBox.containsPoint(local)) return false;
    if (s.geometry.type === 'BoxGeometry') return true;
    // Signed intersections also handle baked, overlapping closed blocks:
    // each enclosing shell contributes one, outside shells contribute zero.
    ray.origin.copy(local); ray.direction.copy(directionProbe).transformDirection(s.inverse);
    let winding = 0;
    function probe(node) {
      if (!ray.intersectsBox(node.bounds)) return;
      if (node.children) { node.children.forEach(probe); return; }
      for (const { triangle: t, normal } of node.items) {
        if (ray.intersectTriangle(t.a, t.b, t.c, false, intersection)) winding += normal.dot(ray.direction) > 0 ? 1 : -1;
      }
    }
    probe(s.tree); return winding > 0;
  });
  const result = [], a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), bounds = new THREE.Box3();
  for (let i = 0; i < values.length; i += 6) {
    a.fromArray(values, i); b.fromArray(values, i + 3); direction.subVectors(b, a);
    const length = direction.length(); direction.divideScalar(length);
    bounds.setFromPoints([a, b]).expandByScalar(.002);
    const nearby = solids.filter(s => s.bounds.intersectsBox(bounds));
    // Split at block boundaries so a jamb remains below its lintel while the
    // coplanar continuation above the opening disappears.
    const cuts = [0, 1];
    for (const s of nearby) for (const axis of ['x', 'y', 'z']) {
      const delta = b[axis] - a[axis]; if (Math.abs(delta) < 1e-8) continue;
      for (const bound of [s.bounds.min[axis], s.bounds.max[axis]]) {
        const t = (bound - a[axis]) / delta; if (t > 1e-5 && t < 1 - 1e-5) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    u.set(Math.abs(direction.y) < .9 ? 0 : 1, Math.abs(direction.y) < .9 ? 1 : 0, 0).cross(direction).normalize();
    v.crossVectors(direction, u);
    let start = null;
    for (let j = 0; j < cuts.length - 1; j++) {
      if (cuts[j + 1] - cuts[j] < 1e-5) continue;
      const midpoint = a.clone().lerp(b, (cuts[j] + cuts[j + 1]) / 2);
      const occupied = [];
      for (let k = 0; k < 16; k++) {
        const angle = (k + .37) * Math.PI / 8;
        sample.copy(midpoint).addScaledVector(u, .001 * Math.cos(angle)).addScaledVector(v, .001 * Math.sin(angle));
        occupied.push(inside(sample, nearby));
      }
      const count = occupied.filter(Boolean).length;
      const transitions = occupied.reduce((n, x, k) => n + (x !== occupied[(k + 1) % 16] ? 1 : 0), 0);
      // The stairwell's baked walls are open planes, not closed solids.
      // Keep a plane's boundary only when no coplanar continuation covers its
      // other side; perpendicular planes still retain their shared corner.
      const planes = nearby.flatMap(s => s.triangles ?? []);
      const onPlane = (p, triangle) => Math.abs(triangle.getPlane(new THREE.Plane()).distanceToPoint(p)) < 1e-5 && triangle.containsPoint(p);
      const planarBoundary = planes.some(triangle => {
        if (!onPlane(midpoint, triangle)) return false;
        const normal = triangle.getNormal(new THREE.Vector3());
        if (Math.abs(normal.dot(direction)) > 1e-5) return false;
        const across = new THREE.Vector3().crossVectors(normal, direction).multiplyScalar(.001);
        const left = midpoint.clone().add(across), right = midpoint.clone().sub(across);
        const covered = p => planes.some(t => onPlane(p, t));
        return covered(left) !== covered(right);
      });
      const sharp = planarBoundary || count > 0 && count < 16 && !(count === 8 && transitions === 2);
      if (sharp && start === null) start = cuts[j];
      if (start !== null && (!sharp || j === cuts.length - 2)) {
        const end = sharp ? cuts[j + 1] : cuts[j];
        if ((end - start) * length >= .06) result.push(...a.clone().lerp(b, start).toArray(), ...a.clone().lerp(b, end).toArray());
        start = null;
      }
    }
  }
  return result;
}

// #474: only call on a construction-only scene, before furniture/decoration is added.
// Bake sharp edges once, in the nearest animated fitting's frame (or a floor batch).
export function architectureEdges(root, { moving = [], exclude = [], floor = 3, opacity = 0.3 } = {}) {
  const anchors = new Set(moving.filter(Boolean)), skipped = new Set(exclude.filter(Boolean));
  const batches = new Map(), solids = new Map(), cache = new WeakMap(), point = new THREE.Vector3();
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
        for (const geometry of o.userData.edgeSources ?? [o.geometry]) {
          let edges = cache.get(geometry);
          if (!edges) { edges = new THREE.EdgesGeometry(geometry, 30); cache.set(geometry, edges); }
          const transform = anchor.matrixWorld.clone().invert().multiply(o.matrixWorld);
          let bodies = solids.get(anchor); if (!bodies) solids.set(anchor, bodies = []);
          const pos = edges.getAttribute('position');
          geometry.computeBoundingBox();
          bodies.push({ geometry, transform });
          geometry.boundingBox.getCenter(point).applyMatrix4(o.matrixWorld);
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
    }
    for (const child of o.children) visit(child, anchor);
  }
  visit(root);
  const lines = [];
  for (const [anchor, cells] of batches) for (const raw of cells.values()) {
    const values = unionEdges(raw, solids.get(anchor));
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
