// #2403: actual web folding/rule against the export contract; optionally validate the actual GLB canopy.
// node tools/unreal-engine/tests/parasol-export.mjs [EXPORT_DIR]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { parasol, parasolProfiles, updateParasols } = await import('../../../src/patio.js');
const { FURNITURE, PATIO } = await import('../../../src/config.js');
const { parasolRows, parasolPose } = await import('../export-parasols.js');
const { validate, glbJson } = await import('../json-schema.mjs');
const near = (a, b, eps = 1e-6) => {
  if (Array.isArray(a)) { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], eps)); }
  else assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
};
const item = FURNITURE.find(f => f.type === 'parasol');
const web = parasol(item), profile = parasolProfiles().find(p => p.object === web);
assert.ok(profile?.canopy && profile.canopy.parent === web, 'builder identifies the actual movable canopy');
const canopy = profile.canopy, uv = [...canopy.geometry.attributes.uv1.array];
const names = new Map([[canopy, 'source-parasol__canopy']]);
const row = parasolRows([profile], names, [{ object: web, id: 'source-parasol', zone: 'l1007-uteplats' }])[0];
assert.deepEqual(parasolRows([profile], names, []), [], 'no dangling patio data in an unrelated partial export');
assert.throws(() => parasolRows([profile], new Map(), [{ object: web, id: 'broken', zone: 'l1007-uteplats' }]), /missing/);
assert.deepEqual(row.rule.months, PATIO.parasol.months);
assert.deepEqual([row.rule.radius, row.rule.height, row.rule.openHeight, row.rule.sunThreshold,
  row.rule.maxOvercast, row.rule.automaticSpeed, row.rule.manualSpeed], [.09, 1.15, .38, .02, .6, .5, 2.5], 'existing source behavior is unchanged');
const day = (month = 6, sun = 1, overcast = 0) => ({ month, sunDir: new THREE.Vector3(0, sun, 0), overcast });
let cases = 0;
for (let month = 1; month <= 12; month++) for (const sun of [.02 - 1e-9, .02, .02 + 1e-9]) for (const oc of [.6 - 1e-9, .6, .6 + 1e-9]) {
  const expected = row.rule.months.includes(month) && sun > row.rule.sunThreshold && oc <= row.rule.maxOvercast;
  updateParasols(day(month, sun, oc), 0, true);
  const live = parasolProfiles().find(p => p.object === web);
  assert.equal(live.open, Number(expected), `month ${month}, sun ${sun}, overcast ${oc}`);
  const pose = parasolPose(row, Number(expected));
  near(canopy.scale.toArray(), pose.scale); near(canopy.position.toArray(), pose.position); near(canopy.rotation.x, pose.rotationX);
  cases++;
}
// Real manual animation exercises the smoothstep at intermediate fractions, not just the two endpoints.
updateParasols(day(1), 0, true);
web.userData.door.toggle();
for (const fraction of [.25, .5, .75, 1]) {
  updateParasols(day(1), .1, false);
  near(parasolProfiles().find(p => p.object === web).open, fraction);
  const pose = parasolPose(row, fraction);
  near(canopy.scale.toArray(), pose.scale); near(canopy.rotation.x, pose.rotationX);
}
assert.equal(web.userData.door.isOpen, true, 'manual opening holds while the automatic state is unchanged');
updateParasols(day(6), 0, true); // auto changes to open: the manual override is released
updateParasols(day(1), 0, true);
assert.equal(web.userData.door.isOpen, false, 'changing automatic state releases the manual override');
updateParasols(day(6), .5, false);
near(parasolProfiles().find(p => p.object === web).open, .25, 1e-9); // automatic speed .5/s
near(canopy.scale.toArray(), parasolPose(row, .25).scale);
assert.deepEqual([...canopy.geometry.attributes.uv1.array], uv, 'folding never stretches/replaces the source cloth metre UVs');
const schema = JSON.parse(fs.readFileSync(new URL('../../../shared/schema/measurements.schema.json', import.meta.url)));
const contractSchema = schema.properties.furnishing.properties.parasols;
assert.deepEqual(validate([row], contractSchema, schema), []);
const missing = structuredClone(row); delete missing.mesh;
assert.ok(validate([missing], contractSchema, schema).some(e => e.includes('mesh')), 'schema rejects a missing GLB binding');

if (process.argv[2]) {
  const dir = process.argv[2], measurements = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
  const buffer = fs.readFileSync(path.join(dir, 'l1007-uteplats.glb')), glb = glbJson(buffer);
  const rows = measurements.furnishing.parasols;
  assert.equal(rows?.length, FURNITURE.filter(f => f.type === 'parasol').length);
  const accessor = index => {
    const a = glb.accessors[index], view = glb.bufferViews[a.bufferView];
    assert.equal(a.componentType, 5126, 'float32 source geometry');
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const bin = 20 + buffer.readUInt32LE(12) + 8, start = bin + (view.byteOffset || 0) + (a.byteOffset || 0);
    return Array.from({ length: a.count * size }, (_, i) => buffer.readFloatLE(start + Math.floor(i / size) * (view.byteStride || size * 4) + (i % size) * 4));
  };
  for (const actual of rows) {
    assert.deepEqual(validate([actual], contractSchema, schema), []);
    const root = glb.nodes.find(n => n.extras?.id === actual.id), mesh = glb.nodes.find(n => n.extras?.id === actual.mesh);
    assert.ok(root && mesh && root.children.includes(glb.nodes.indexOf(mesh)), 'contract names the actual direct canopy child');
    assert.equal(root.extras.kind, 'furniture'); assert.equal(root.extras.zone, actual.zone);
    assert.equal(mesh.extras.parent, actual.id); assert.equal(mesh.extras.kind, 'part');
    assert.ok(root.extras.webId?.startsWith('f-parasol-'));
    const pose = parasolPose(actual, actual.exportedOpen);
    near(mesh.translation, pose.position); near(mesh.scale, pose.scale);
    near(mesh.rotation || [0, 0, 0, 1], new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotationX, 0, 0)).toArray());
    const primitive = glb.meshes[mesh.mesh].primitives[0];
    near(accessor(primitive.attributes.POSITION), [...canopy.geometry.attributes.position.array]);
    near(accessor(primitive.attributes.TEXCOORD_0), [...canopy.geometry.attributes.uv.array]);
    assert.deepEqual(actual.rule, row.rule);
  }
  console.log(`Parasol actual export: ${rows.length} canopy GLB IDs, parent links, original cone positions/UV0 and local poses pass`);
}
console.log(`Parasol source: ${cases} month/sun/cloud boundary cases, manual/automatic animation, fixed UV1 and schema checks pass (no native runtime acceptance)`);
