// #2426: the export carries the web's sun-shadow casting per mesh node (extras.castShadow false = three's castShadow off;
// absent = it casts), and import_world.py turns Cast Shadow off on exactly those actors (its LUNDEN_IMPORT_SHADOW check).
// Run after an export: node tools/unreal-engine/tests/shadow-flags.test.mjs [export-dir]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'unreal/Lunden/Import';
const glb = (zone) => {
  const buf = fs.readFileSync(path.join(dir, `${zone}.glb`));
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
};
const zones = Object.fromEntries(['kvarteret', 'hus-l', 'l1007', 'l1007-uteplats', 'gard'].map((z) => [z, glb(z)]));
const node = (zone, id) => {
  const n = zones[zone].nodes.find((x) => x.name === id);
  assert.ok(n, `${zone}: node ${id} missing from the export`);
  return n;
};
const casts = (n) => n.extras?.castShadow !== false;

// The flag sits only on mesh nodes, and only as false (the schema's const).
for (const [zone, json] of Object.entries(zones)) {
  for (const n of json.nodes) {
    if ('unrealArchitectureShadow' in (n.extras ?? {})) {
      assert.equal(n.extras.unrealArchitectureShadow, true, `${zone}/${n.name}: invalid architecture override`);
      assert.notEqual(n.mesh, undefined, `${zone}/${n.name}: architecture override without geometry`);
      assert.notEqual(n.extras.kind, 'collision', `${zone}/${n.name}: collision must not opt in`);
    }
    if (!('castShadow' in (n.extras ?? {}))) continue;
    assert.equal(n.extras.castShadow, false, `${zone}/${n.name}: castShadow is written only as false`);
    assert.notEqual(n.mesh, undefined, `${zone}/${n.name}: castShadow on a node without a mesh`);
  }
}

// What shadowed the courtyard walks and the lawn at entrance A at 14:00 in Unreal (#2392's sun rays): Hus A's loggia
// rails and the Å-husen's body (Hus A, B and C share it). On the web neither casts a sun shadow.
for (const id of ['mesh_loggiarails_l0_xm3059_z3498_y653', 'mesh_l0_xm3059_z3497_y600_2', 'mesh_l0_xm3059_z3497_y600']) {
  assert.equal(casts(node('kvarteret', id)), false, `kvarteret/${id} casts no sun shadow on the web`);
}
// Things that do cast on the web keep casting: the patio's screen walls (#2386/#2387 winter shadows), Hus L's loft
// rails, the flat's walls, the courtyard's parked bicycle.
for (const [zone, id] of [['l1007-uteplats', 'mesh_l0_x4_z1522_y90'], ['l1007-uteplats', 'mesh_l0_x571_z1522_y90'],
  ['hus-l', 'mesh_loftrails_l0_xm1667_zm25_y375'], ['l1007', 'wall_l0_x40_z23_y150'], ['gard', 'parked_courtyard_bicycle_9']]) {
  assert.equal(casts(node(zone, id)), true, `${zone}/${id} casts a sun shadow on the web`);
}

const counts = Object.entries(zones).map(([zone, json]) => {
  const meshes = json.nodes.filter((n) => n.mesh !== undefined && n.extras?.kind !== 'collision');
  return `${zone} ${meshes.filter((n) => !casts(n)).length}/${meshes.length}`;
});
console.log(`shadow-flags OK: mesh nodes without a sun shadow ${counts.join(', ')}`);
