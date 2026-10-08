import * as THREE from 'three';
import { ENTRANCE_PLANTS as C } from './config.js';
import { planter } from './patio.js';

/** Shared geometry/material templates; one merged foliage mesh per plant, handled by the normal DetailCuller. */
export function buildEntrancePlants(doors, groundY) {
  const group = new THREE.Group(); group.name = 'entrance-plants';
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
    for (const m of foliage) m.geometry.scale(compress,1,compress);
    const pot = model.children[0]; pot.material = pot.material.clone(); pot.material.color.setHex(v.color);
    return model;
  });
  const records = [], groundSegments = [], walls = [];
  for (const d of doors) for (let slot = 0; slot < (C.counts[d.index % C.counts.length] ?? 1); slot++) {
    const variant = (d.index + slot + (d.y > 0 ? 1 : 0)) % templates.length, spec = C.variants[variant];
    const model = templates[variant].clone(); // Mesh.clone shares geometry and material, including the merged leaves.
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
  return group;
}
