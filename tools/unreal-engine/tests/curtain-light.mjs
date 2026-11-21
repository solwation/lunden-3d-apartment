// Compare the actual L1007 GLB factors to the web cloth, using only local assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
let samples = 0;
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
      samples++;
    }
  }
}
console.log(profiles.length + ' web fabrics, ' + nodes.size + ' GLB panels, identical colour/emission texture and UV; ' + samples + ' web lighting samples.');
