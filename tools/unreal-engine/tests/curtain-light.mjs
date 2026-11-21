// Compare the actual L1007 GLB and runtime Blueprint factors to the web cloth, using only local assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Color} from 'three';
import {CURTAINS} from '../../../src/config.js';
import {Blinds} from '../../../src/blinds.js';
import {Curtain} from '../../../src/curtains.js';
import {glbJson} from '../json-schema.mjs';

const directory = process.argv[2] || 'unreal/Lunden/Import';
const measures = JSON.parse(fs.readFileSync(path.join(directory, 'measurements.json')));
const glb = glbJson(fs.readFileSync(path.join(directory, 'l1007.glb')));
const profiles = measures.furnishing.curtains;
const lamps = new Map(measures.lights.map(row => [row.id, row]));
assert.equal(profiles.length, CURTAINS.length);
const nodes = new Set();
const vectors = [];
for (const spec of CURTAINS) {
  const row = profiles.find(r => r.id === spec.materialId);
  assert.equal(row.room, spec.room);
  assert.equal(row.level, spec.level);
  assert.ok(row.lamps.some(id => lamps.get(id)?.kind === 'room'), row.id);
  assert.ok(row.lamps.every(id => lamps.get(id)?.level === row.level));
  assert.equal(new Set(row.lamps).size, row.lamps.length);
  const mat = glb.materials.find(m => m.name === row.key);
  assert.equal(mat.alphaMode, 'BLEND');
  assert.equal(mat.doubleSided, true);
  assert.equal(mat.pbrMetallicRoughness.baseColorFactor[3], .94);
  assert.deepEqual(mat.emissiveTexture, mat.pbrMetallicRoughness.baseColorTexture);
  assert.equal(glb.images[glb.textures[mat.emissiveTexture.index].source].mimeType, 'image/png');
  assert.deepEqual(mat.emissiveFactor, row.daylight);
  for (const id of row.nodes) {
    assert.ok(!nodes.has(id)); nodes.add(id);
    const mesh = glb.meshes[glb.nodes.find(n => n.name === id).mesh];
    assert.ok(mesh.primitives.every(p => glb.materials[p.material].name === row.key && p.attributes.TEXCOORD_0 !== undefined));
  }

  const cloth = Object.assign(Object.create(Curtain.prototype), {spec, room: row.room, level: row.level, mat: {emissive: new Color()}});
  for (const daylight of [0, .35, 1]) for (const overcast of [0, .4, 1]) {
    for (const live of [false, true]) for (const supply of [0, .5, .51, 1]) {
      Blinds.prototype.update.call({list: [], curtains: [cloth], dim: 0}, 0,
        {daylight, overcast, outdoors: true, lit: (level, name) => level === row.level && name === row.room && live && supply > .5});
      const expected = cloth.mat.emissive.toArray();
      const fromRows = row.daylight.map((d, i) => d * daylight * (1 - .5 * overcast) + (live && supply > .5 ? row.lamp[i] : 0));
      assert.ok(expected.every((v, i) => Math.abs(v - fromRows[i]) < 1e-12), row.id);
      vectors.push({daylight, dusk: daylight * (1 - .6 * overcast), supply, lit: live,
        day: row.daylight, lamp: row.lamp, expected});
    }
  }
}
console.log(profiles.length + ' web fabrics, ' + nodes.size + ' GLB panels, identical colour/emission texture and UV; ' + vectors.length + ' web lighting samples.');
if (process.argv.includes('--blueprint')) {
  const python = fileURLToPath(new URL('./curtain-expression.py', import.meta.url));
  const result = spawnSync(process.env.PYTHON || 'python3', [python], {input: JSON.stringify(vectors), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  console.log(result.stdout.trim());
}
const captureIndex = process.argv.indexOf('--web-capture');
if (captureIndex >= 0) {
  const captures = JSON.parse(fs.readFileSync(process.argv[captureIndex + 1])).shots;
  let errors = [], seen = new Set();
  for (const shot of captures.filter(s => s.curtains)) {
    assert.equal(shot.curtains.length, profiles.length);
    for (const row of profiles) {
      const actual = shot.curtains.find(c => c.id === row.id);
      const day = shot.daylight * (1 - .5 * shot.overcast);
      const want = row.daylight.map((d, i) => d * day + (actual.lit ? row.lamp[i] : 0));
      errors.push(Math.hypot(...want.map((v, i) => v - actual.emission[i])));
    }
    seen.add(shot.name);
  }
  for (const name of ['living-room-day', 'living-room-evening', 'upper-floor-evening']) assert.ok(seen.has(name), name);
  const max = Math.max(...errors);
  assert.ok(max < 1e-6, 'Actual web curtain emission differed by ' + max);
  console.log(errors.length + ' captured Three.js material states; max linear RGB error ' + max.toPrecision(3) + '.');
}
