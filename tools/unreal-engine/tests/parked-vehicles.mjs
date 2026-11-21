// Read exported binary vertices and transformed unit boxes, independently of Unreal/Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const dir = process.argv[2] ?? 'unreal/Lunden/Import';
const {vehicles, blockers} = JSON.parse(fs.readFileSync(path.join(dir,'measurements.json'))).site.parkedVehicles;
const groups = {}, paints = new Set(), masks = new Set();
let max = 0, anchors = 0;
for (const zone of ['omgivning','gard','kvarteret']) {
  const bytes = fs.readFileSync(path.join(dir,zone+'.glb'));
  const end = 20 + bytes.readUInt32LE(12), glb = JSON.parse(bytes.toString('utf8',20,end)), binary = end + 8;
  const nodes = new Map();
  const visit = (i, parent) => {
    const n = glb.nodes[i], local = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation ?? [0,0,0])), new THREE.Quaternion(...(n.rotation ?? [0,0,0,1])),
      new THREE.Vector3(...(n.scale ?? [1,1,1])));
    const matrix = parent.clone().multiply(local);
    nodes.set(n.name,{n,matrix});
    for (const j of n.children ?? []) visit(j,matrix);
  };
  for (const i of glb.scenes[glb.scene ?? 0].nodes) visit(i,new THREE.Matrix4());
  for (const row of vehicles.filter(v=>v.zone===zone)) {
    const kind = row.area + (row.id.includes('-car-') ? ' car' : ' bicycle');
    groups[kind] = (groups[kind] ?? 0)+1;
    assert.ok(row.parts.length, row.id+' missing geometry');
    for (const part of row.parts) {
      const {n,matrix} = nodes.get(part.node), primitive = glb.meshes[n.mesh].primitives[0];
      const attr = glb.accessors[primitive.attributes.POSITION], view = glb.bufferViews[attr.bufferView];
      assert.equal(attr.componentType,5126);
      const material = glb.materials[primitive.material];
      if (row.id.includes('-car-')) paints.add(JSON.stringify(material.pbrMetallicRoughness?.baseColorFactor));
      if (material.alphaMode === 'MASK' && material.pbrMetallicRoughness?.baseColorTexture) masks.add(row.area);
      for (const {index, web} of part.anchors) {
        assert.ok(index>=0 && index<attr.count,part.node+' missing vertex '+index);
        const start = binary+(view.byteOffset ?? 0)+(attr.byteOffset ?? 0)+index*(view.byteStride ?? 12);
        const point = new THREE.Vector3(...[0,4,8].map(k=>bytes.readFloatLE(start+k))).applyMatrix4(matrix);
        const error = point.distanceTo(new THREE.Vector3(...web));
        assert.ok(error <= .01, `${row.id} / ${part.node} / vertex ${index}: ${100*error} cm`);
        max = Math.max(error, max); anchors++;
      }
    }
  }
  for (const row of blockers.filter(b=>b.zone===zone)) {
    const {n,matrix}=nodes.get(row.id);
    assert.equal(n.extras.kind,'collision');
    for (const [floor,y] of [[row.base,-.5],[row.top,.5]]) for (const [x,z] of row.foot) {
      const target=new THREE.Vector3(x,floor,z);
      const err=Math.min(...[-.5,.5].flatMap(i=>[-.5,.5].map(j=>new THREE.Vector3(i,y,j).applyMatrix4(matrix).distanceTo(target))));
      assert.ok(err<=.01,`${row.id}: collision corner ${100*err} cm`); max=Math.max(max,err);
    }
  }
}
assert.equal(new Set(vehicles.map(v=>v.id)).size,vehicles.length);
for(const area of ['street','eastlot','garage']) {
  const cars=vehicles.filter(v=>v.area===area && v.id.includes('-car-'));
  const feet=blockers.filter(b=>b.area===area && b.id.includes('_car_'));
  assert.ok(cars.length>0 && cars.length===feet.length,area+' painted cars vs web footprints');
  for(const c of cars) assert.ok(feet.some(b=>Math.hypot(c.feet[0]-(b.foot[0][0]+b.foot[2][0])/2,
    c.feet[2]-(b.foot[0][1]+b.foot[2][1])/2)<=.01),c.id+' missing its footprint');
}
for (const area of ['yard','courtyard','garage','storage']) {
  assert.ok(groups[area+' bicycle']>0,area+' missing bicycles');
  assert.ok(masks.has(area),area+' missing textured spoke cutouts');
}
assert.ok(paints.size>4,'missing source paint colours');
console.log(JSON.stringify({vehicles:groups,blockers:blockers.length,anchors,maxErrorCm:max*100,carColoursAndTrim:paints.size,maskedSpokes:[...masks]}));
