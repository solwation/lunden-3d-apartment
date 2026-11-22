// #2308: the lawn materials in tools/unreal-engine/material-map.json against the web's own grass numbers. Every
// M_LundenGrass instance must carry the detail map's sizes and grey levels as src/config.js GRASS defines them for
// src/grass.js grassTexture (a textureSize-pixel canvas tiled every `tile` m), and the lawn instance the summer colour.
// test_materials.py checks that each lawn key of an export maps to a grass instance with the key's colour.
// Run: node tools/unreal-engine/tests/grass-material.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRASS, MUSSELS } from '../../../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(fs.readFileSync(path.join(here, '../material-map.json'), 'utf8'));
const px = GRASS.tile / GRASS.textureSize; // metres per canvas pixel
const want = {
  Cell: GRASS.tile / Math.sqrt(GRASS.blades), // one blade per cell: `blades` strokes per tile
  StrokeWidth: GRASS.strokeWidth * px,
  BladeLength: GRASS.bladeLength.map((n) => n * px),
  Ground: [GRASS.detailRange[1] / 255, GRASS.detailNoise / 255], // the ground: detailRange[1] - rand * detailNoise
  BladeRange: GRASS.detailRange.map((n) => n / 255),
  StrawTint: GRASS.strawTint,
  BladeTint: GRASS.bladeTint,
  Tile: GRASS.tile, // src/grassdetail.js applyGrassPatches: lattices per tile, contrast and dry / lush multipliers
  PatchCells: GRASS.detailPatches.octaves.map((o) => o.cells),
  PatchContrast: GRASS.detailPatches.contrast,
  Dry: GRASS.detailPatches.dry,
  Lush: GRASS.detailPatches.lush,
  TuftCount: GRASS.tufts.count, // src/grass.js: count tussocks per tile, radius in canvas pixels, shade = the dark base's alpha
  TuftRadius: GRASS.tufts.radius.map((n) => n * px),
  TuftShade: GRASS.tufts.shade,
};
assert.ok(GRASS.detailPatches.octaves.every((o) => o.amp === GRASS.detailPatches.octaves[0].amp), 'the shader weights both octaves equally');
const close = (a, b) => Math.abs(a - b) <= 1e-5;
const instances = Object.entries(table.materials).filter(([, s]) => s.parent === '/Game/Lunden/Materials/M_LundenGrass');
assert.ok(instances.length >= 2, 'material-map.json lists the grass instances');
for (const [name, spec] of instances) {
  for (const [key, value] of Object.entries(want)) {
    const got = spec.params[key];
    if (Array.isArray(value)) assert.ok(Array.isArray(got) && value.every((v, i) => close(v, got[i])), `${name} ${key}: ${JSON.stringify(got)} != ${JSON.stringify(value)}`);
    else assert.ok(close(value, got), `${name} ${key}: ${got} != ${value}`);
  }
}
const lawn = table.materials['/Game/Lunden/Materials/MI_LundenGrassLawn'];
assert.equal(lawn.params.Color.toLowerCase(), '#' + GRASS.summer.toString(16).padStart(6, '0'), 'the lawn colour is GRASS.summer');
// #2441: the site terrain's river-bed mud (src/grass.js grassMaterial's bed variant) on the lawn instance only, with the
// web's own bedTone patches in the master's code (the export's COLOR_0 red = 1 - bedMud)
assert.equal(lawn.params.BedColor?.toLowerCase(), '#' + MUSSELS.bed.color.toString(16).padStart(6, '0'), 'the lawn instance mixes MUSSELS.bed.color in');
assert.equal(lawn.params.BedWeight, 1, 'the lawn instance reads the terrain\'s bed share');
for (const [name, spec] of instances) if (spec !== lawn) assert.ok(!spec.params.BedWeight, `${name} has no river bed`);
const tone = fs.readFileSync(path.join(here, '../../../src/grass.js'), 'utf8').match(/float bedTone = ([^;]+);/)?.[1];
assert.ok(tone, 'src/grass.js has its bedTone');
const hlsl = fs.readFileSync(path.join(here, '../python/build_materials.py'), 'utf8');
assert.ok(hlsl.includes(`float bedTone = ${tone.replaceAll('grassMeters', 'UV')};`), 'M_LundenGrass draws the web\'s bedTone in UV metres');
console.log(`GRASS_MATERIAL_OK ${instances.length} grass instances match src/config.js GRASS, the lawn's river bed MUSSELS.bed`);
