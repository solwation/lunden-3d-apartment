// #2328. Check the actual imported mesh primitives alongside the web builder's two latch positions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3, Quaternion, Matrix4, Box3 } from 'three';
import { ROOT } from '../sources.mjs';

const dir = process.argv[2] || path.join(ROOT, 'unreal/Lunden/Import');
const { doors } = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const leaves = doors.filter(d => d.leafType), overhead = doors.find(d => d.kind === 'overhead');
const wanted = new Set([...leaves.flatMap(d => d.parts), ...overhead.control.buttons.map(b => b.part)]);
const geometry = new Map();
for (const zone of new Set([...leaves.map(d => d.zone), overhead.zone])) {
  const bytes = fs.readFileSync(path.join(dir, zone + '.glb')), end = 20 + bytes.readUInt32LE(12);
  const g = JSON.parse(bytes.toString('utf8', 20, end)), base = end + 8;
  function visit(i, parent) {
    const n = g.nodes[i], local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
      new Vector3(...(n.translation || [0, 0, 0])), new Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new Vector3(...(n.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (wanted.has(n.name)) {
      assert(!geometry.has(n.name), n.name);
      const points = [];
      for (const p of g.meshes[n.mesh].primitives) {
        const a = g.accessors[p.attributes.POSITION], view = g.bufferViews[a.bufferView];
        assert(a.type === 'VEC3' && a.componentType === 5126);
        for (let j = 0; j < a.count; j++) {
          const at = base + (view.byteOffset || 0) + (a.byteOffset || 0) + j * (view.byteStride || 12);
          points.push(new Vector3(bytes.readFloatLE(at), bytes.readFloatLE(at + 4), bytes.readFloatLE(at + 8)).applyMatrix4(world));
        }
      }
      geometry.set(n.name, points);
    }
    for (const c of n.children || []) visit(c, world);
  }
  for (const i of g.scenes[g.scene || 0].nodes) visit(i, new Matrix4());
}
assert.equal(geometry.size, wanted.size, 'moving parts and both caps present in GLB');
assert.equal(new Set(doors.map(d => d.id).filter(Boolean)).size, doors.filter(d => d.id).length, 'unique interact IDs');
assert.equal(new Set(leaves.flatMap(d => d.parts)).size, leaves.flatMap(d => d.parts).length, 'independent leaves');
const counts = {}, max = { latchCm: 0, yawDeg: 0, closedCentreCm: 0 };
for (const d of leaves) {
  const kind = d.house || d.leafType;
  counts[kind] = (counts[kind] || 0) + 1;
  if (d.leafType === 'park') assert.equal(d.parts.length, 2, 'park door and its glass move together');
  const hinge = new Vector3(...d.hinge.web);
  for (const [state, point] of [['closed', 'checkClosed'], ['open', 'checkOpen']]) {
    const latch = new Vector3(...d[point].web), delta = latch.clone().sub(hinge);
    const angle = d[state].unrealYaw * Math.PI / 180;
    const predicted = hinge.clone().add(new Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(d.width));
    const error = 100 * predicted.distanceTo(latch), yaw = Math.abs((Math.atan2(delta.z, delta.x) * 180 / Math.PI - d[state].unrealYaw + 540) % 360 - 180);
    max.latchCm = Math.max(max.latchCm, error); max.yawDeg = Math.max(max.yawDeg, yaw);
    assert(error <= 1 && yaw <= 1, d.id + ' ' + state + ' ' + error + ' cm / ' + yaw + '°');
  }
  const points = d.parts.flatMap(p => geometry.get(p)), box = new Box3().setFromPoints(points);
  const centre = box.getCenter(new Vector3()), expected = hinge.clone().lerp(new Vector3(...d.checkClosed.web), .5);
  const error = 100 * Math.hypot(centre.x - expected.x, centre.z - expected.z);
  max.closedCentreCm = Math.max(max.closedCentreCm, error);
  assert(error <= 1, d.id + ': physical leaf bounds with hardware are ' + error + ' cm from the opening centre');
}
for (const b of overhead.control.buttons) {
  const centre = new Box3().setFromPoints(geometry.get(b.part)).getCenter(new Vector3());
  assert(centre.distanceTo(new Vector3(...b.position.web)) < .01, b.id);
}
for (const kind of ['a', 'b', 'c', 'park', 'steel', 'cage']) assert(counts[kind] > 0, kind + ' missing');
assert.equal(overhead.control.buttons.length, 2);
console.log('DOOR_EXPORT_OK', counts, max, overhead.control.buttons.length, 'buttons');
