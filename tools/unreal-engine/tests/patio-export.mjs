// Check the actual patio GLB against the web builders, including each individual fence bulb.
// node tools/unreal-engine/tests/patio-export.mjs <export directory>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FURNITURE, PATIO } from '../../../src/config.js';
import { buildStringLights, parasol, updateParasols } from '../../../src/patio.js';
import { glbJson } from '../json-schema.mjs';

const dir = process.argv[2];
if (!dir) throw Error('Expected a directory containing the patio export');
const plan = JSON.parse(fs.readFileSync(new URL('../../../data/plan.json', import.meta.url)));
const site = plan.floors[0].site;
const measurements = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const { nodes, meshes, materials } = glbJson(fs.readFileSync(path.join(dir, 'l1007-uteplats.glb')));
const near = (values, expected, tolerance = 0.0001) => {
  assert.equal(values.length, expected.length);
  values.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${values} vs ${expected}`));
};

// The composed map already references this palm and its four parts by the pre-season-check IDs.
const palmId = 'furn_planter_l0_x43_z1324';
const palm = nodes.find(n => n.extras?.webId === 'f-planter-0-0.45-13.25-0-0');
assert.equal(palm?.extras.id, palmId);
assert.deepEqual(palm.children.map(i => nodes[i].extras.id), [1, 2, 3, 4].map(i => `${palmId}__${i}`));

const item = FURNITURE.find(f => f.type === 'parasol');
const web = parasol(item);
updateParasols({ month: 6, sunDir: new THREE.Vector3(0, 1, 0), overcast: 0 }, 0, true);
const canopy = web.children.find(mesh => mesh.geometry?.type === 'ConeGeometry');
const root = nodes.find(node => node.extras?.name === 'parasol' && node.extras?.kind === 'furniture');
near(root.translation, [item.x, 0, item.z], 0.01);
const child = root.children.map(i => nodes[i]).find(n => n.scale);
near(child.scale, canopy.scale.toArray());
near(child.rotation, canopy.quaternion.toArray());
const strings = buildStringLights(site.fences, (site.patio.x0 + site.patio.x1) / 2);
const bulbs = strings.object.children.find(o => o.isInstancedMesh);
assert.equal(strings.mat.toneMapped, false);
const fixture = nodes.find(n => n.extras?.source === 'src/config.js#PATIO.stringLights');
assert.ok(fixture, 'Missing patio string light group');
const parts = fixture.children.map(i => nodes[i]);
const instances = parts.filter(n => n.translation);
assert.equal(parts.length, bulbs.count + 1, 'bulbs and cable');
assert.equal(instances.length, bulbs.count);
const matrix = new THREE.Matrix4();
for (let i = 0; i < bulbs.count; i++) {
  assert.equal(instances[i].extras.patioStringBulb, true);
  const material = materials[meshes[instances[i].mesh].primitives[0].material];
  assert.ok(material.extensions?.KHR_materials_unlit, 'UE must import the unlit factor for the runtime glow');
  bulbs.getMatrixAt(i, matrix);
  near(instances[i].translation, new THREE.Vector3().setFromMatrixPosition(matrix).toArray(), 0.01);
}
const lights = measurements.lights.filter(l => l.name === fixture.extras.name);
assert.equal(lights.length, strings.lamps.length);
assert.equal(lights.filter(l => l.patioBulbs).length, 1, 'a single dusk actor drives the shared bulb material');
for (const [i, lamp] of strings.lamps.entries()) {
  const row = lights[i];
  if (row.patioBulbs) assert.equal(row.patioBulbs.toneMapped, strings.mat.toneMapped);
  near(row.position.web, lamp.pos.toArray(), 0.01);
  assert.equal(row.color, '#' + lamp.color.toString(16).padStart(6, '0'));
  assert.equal(row.intensity, lamp.intensity);
  assert.equal(row.distance, lamp.range);
  assert.equal(row.auto, true);
  const { on, off, fade } = PATIO.stringLights;
  assert.deepEqual(row.patioDusk, { on, off, fade });
}
console.log(`Patio: canopy pose, ${instances.length} bulbs, cable and ${lights.length} light sources match the web`);
