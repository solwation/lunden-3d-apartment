import * as THREE from 'three';
import { ENTRANCE_PLANTS as C } from './config.js';
import { planter } from './patio.js';
import { windShadow, windMaterial } from './plantwind.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodRange, lodMembership, patchDitherLod, lodDepthMaterial, onLodUpdate } from './lod.js';
import { lowMemory } from './lowmemory.js';

// #1967: distance LOD (src/lod.js). Up close nothing changes: a pot, a soil and one or two swaying leaf meshes per plant.
// From C.lod.start m those fade out with the dithered pixel fade and beyond C.lod.end only `entrance-plants-far` is drawn:
// ONE still mesh with every plant's pot, soil and leaves (the same triangles, baked in place, vertex colours instead of
// eight materials), whose index holds just the plants that are far enough. It is not drawn at all while no far plant is in
// view, so there is never an extra draw call by the doors. Shadows follow through depth materials with the same fade.
// `&nolod` (as for the trees) and `group.userData.lod.setRange(1e6, 2e6)` keep the plants' own meshes at any distance.
// Desktop only: phones already draw the plants as a few instanced colour batches (src/entranceplantbatch.js), where the far
// copy saved 3 – 5 calls at 25 – 35 m and cost one in the zone (measured in #1967), so they keep the plain meshes.
const L = C.lod, _sphere = new THREE.Sphere();

/** The merged still copy of `records`' plants in the group's frame; `spans[i]` = [first vertex, vertices] of plant i. */
function farGeometry(records) {
  const parts = [], spans = [], colour = new THREE.Color(), matrix = new THREE.Matrix4();
  let first = 0;
  for (const { model } of records) {
    const from = first; model.updateMatrix();
    for (const mesh of model.children) {
      mesh.updateMatrix();
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position.clone());
      if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone()); else g.computeVertexNormals();
      g.applyMatrix4(matrix.multiplyMatrices(model.matrix, mesh.matrix));
      const n = g.attributes.position.count, tint = new Float32Array(n * 3), centre = new Float32Array(n * 3);
      const own = mesh.material.vertexColors ? src.attributes.color : null;
      colour.copy(mesh.material.color);
      for (let i = 0; i < n; i++) {
        tint.set([colour.r * (own?.getX(i) ?? 1), colour.g * (own?.getY(i) ?? 1), colour.b * (own?.getZ(i) ?? 1)], i * 3);
        centre.set([model.position.x, model.position.y, model.position.z], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(tint, 3)); g.setAttribute('lodCentre', new THREE.BufferAttribute(centre, 3));
      parts.push(g); first += n;
    }
    spans.push([from, first - from]);
  }
  const geo = mergeGeometries(parts);
  const index = new (first > 65535 ? Uint32Array : Uint16Array)(first);
  for (let i = 0; i < first; i++) index[i] = i; // every plant until the first update (the warm-up draws and compiles it)
  geo.setIndex(new THREE.BufferAttribute(index, 1).setUsage(THREE.DynamicDrawUsage));
  geo.computeBoundingSphere();
  return { geo, spans };
}

/** The far level and the per-frame switch between the plants' own meshes and it. */
function distanceLod(group, records, range) {
  const { geo, spans } = farGeometry(records);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: L.roughness, side: THREE.DoubleSide }); // (palm and banana leaves are two-sided)
  material.name = 'entrance-plants-far';
  patchDitherLod(material, { far: true, range, centre: 'attribute' });
  const far = new THREE.Mesh(geo, material); far.name = 'entrance-plants-far';
  far.castShadow = far.receiveShadow = true;
  far.customDepthMaterial = lodDepthMaterial({ far: true, range, centre: 'attribute', side: THREE.DoubleSide });
  far.userData.noDetail = true; // (not the DetailCuller's: it is the far level itself)
  far.raycast = () => {}; // rays hit the plants' own meshes, at any distance
  group.add(far);
  let centres = null, drawn = '';
  const lod = { range, far, plants: 0,
    /** `eye`: the camera in the world; `view.frustum`: what it sees (without it a far plant always counts as in view). */
    update(eye, view = null) {
      if (!centres) { group.updateWorldMatrix(true, false); centres = records.map((r) => r.model.position.clone().applyMatrix4(group.matrixWorld)); }
      let key = '', seen = false, plants = 0;
      records.forEach((r, i) => {
        const mem = lodMembership(centres[i].distanceTo(eye), range.value.x, range.value.y, L.margin);
        r.model.visible = mem.near;
        key += mem.far ? 1 : 0;
        if (!mem.far) return;
        plants++;
        seen ||= !view || view.frustum.intersectsSphere(_sphere.set(centres[i], L.pad));
      });
      if (key !== drawn) { // the index holds the far plants only: the triangles drawn are those of one level outside the zone
        drawn = key;
        const index = geo.index; let n = 0;
        spans.forEach(([first, count], i) => { if (key[i] === '1') for (let v = first; v < first + count; v++) index.array[n++] = v; });
        geo.setDrawRange(0, n); index.needsUpdate = true;
      }
      lod.plants = plants; far.visible = seen;
    },
    /** Tests and A/B measurements: `setRange(1e6, 2e6)` draws the plants' own meshes everywhere. */
    setRange(start, end) { range.value.set(start, end); },
  };
  onLodUpdate(lod.update);
  return lod;
}

/** Shared geometry/material templates; one merged foliage mesh per plant, handled by the normal DetailCuller. */
export function buildEntrancePlants(doors, groundY) {
  const group = new THREE.Group(); group.name = 'entrance-plants';
  const lodOn = !lowMemory, off = typeof location !== 'undefined' && /[?&]nolod\b/.test(location.search);
  const range = off ? lodRange(1e6, 2e6) : lodRange(L.start, L.end);
  // The entrance's own copies of the shared planter materials (patio.js): only these fade out by distance.
  const copies = new Map(), fading = (m) => {
    if (!copies.has(m)) {
      const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; // (the wind shader's)
      copies.set(m, patchDitherLod(c, { range, centre: 'origin' }));
    }
    return copies.get(m);
  };
  const potDepth = lodDepthMaterial({ range, centre: 'origin' });
  const leafDepth = patchDitherLod(windMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })), { range, centre: 'origin' });
  leafDepth.name = 'entrance-leaf-depth';
  const templates = C.variants.map(v => {
    const model = planter(v);
    // Keep every leaf clear of the wall and door jamb, including when the template rotates.
    const foliage = model.children.slice(2);
    let radius = 0;
    for (const m of foliage) {
      const p = m.geometry.attributes.position;
      for(let i=0;i<p.count;i++) radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));
    }
    const compress = Math.min(1,C.foliageRadius/radius);
    for (const m of foliage) {
      m.geometry.scale(compress,1,compress);
      // scale recomputes the static sphere; restore the full local shader sway after the final transform.
      m.geometry.userData.windBounds = false;
      windShadow(m);
    }
    const pot = model.children[0]; pot.material = pot.material.clone(); pot.material.color.setHex(v.color);
    if (lodOn) { patchDitherLod(pot.material, { range, centre: 'origin' }); for (const m of model.children.slice(1)) m.material = fading(m.material); }
    return model;
  });
  const records = [], groundSegments = [], walls = [];
  for (const d of doors) for (let slot = 0; slot < (C.counts[d.index % C.counts.length] ?? 1); slot++) {
    const variant = (d.index + slot + (d.y > 0 ? 1 : 0)) % templates.length, spec = C.variants[variant];
    const model = templates[variant].clone(); // Mesh.clone shares geometry and material, including the merged leaves.
    if (lodOn) for (const m of model.children) m.customDepthMaterial = m.geometry.attributes.plantWind ? leafDepth : potDepth; // the shadow fades like the plant
    const x = slot % 2 ? d.x1+C.doorGap : d.x0-C.doorGap;
    const z = d.y > 0 ? d.z-C.loftWallOffset : C.groundZ, y = d.y > 0 ? d.y : groundY(x,z);
    model.position.set(x,y,z); model.rotation.y = d.index*.71+slot*1.3;
    model.name = `entrance-plant-${d.unit}-${slot}`;
    group.add(model);
    const r = spec.pot.r;
    // Eight sides cover the round pot and its central stems. The broad leaf tips do not block walking.
    const plantTop = new THREE.Box3().setFromObject(model).max.y;
    const poly = Array.from({length:8},(_,i)=>[x+r*Math.cos(i*Math.PI/4),z+r*Math.sin(i*Math.PI/4)]);
    for (let i=0;i<8;i++) {
      const s = [...poly[i],...poly[(i+1)%8]];
      if(d.y > 0) walls.push({s,y0:y,y1:plantTop}); else groundSegments.push(s);
    }
    records.push({ unit:d.unit, slot, variant, x,y,z,r, door:d, model });
  }
  group.userData = {records,groundSegments,walls};
  if (lodOn && records.length) group.userData.lod = distanceLod(group, records, range);
  return group;
}
