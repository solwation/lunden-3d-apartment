// Check a real vegetation-zone export: node tools/unreal-engine/tests/vegetation-look.test.mjs <export directory>.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FOLIAGE, GRASS, SEASON, SITE_WIND, WIND } from '../../../src/config.js';

const dir = process.argv[2] ?? 'unreal/Lunden/Import';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const { vegetation } = read(path.join(dir, 'measurements.json'));
const { look } = vegetation;
assert.deepEqual(look.months, SEASON.trees);
assert.deepEqual(look.blossomMonths, SEASON.blossomMonths);
assert.deepEqual(look.wind.power, WIND.power);
// #2432: the leaf atlas's mean tint (src/foliage.js leafAtlas), grey-green and darker on the opaque core
const { cards, core } = look.atlasTint ?? {};
assert.ok(cards?.length === 3 && core?.length === 3, 'look.atlasTint has cards and core');
for (const t of [cards, core]) assert.ok(t.every((v) => v > 0.2 && v < 1) && t[2] < t[0] && t[0] < t[1], `atlas tint ${t}`);
assert.ok(core[1] < cards[1], 'the core is darker than the cards');
// #2432: every crown lobe and pergola vine carries its tree's season seeds (src/seasons.js r1…r4)
const seeds = Object.values(vegetation.seeds ?? {});
assert.ok(seeds.length > 3000 && seeds.every((sd) => sd.length === 4 && sd.every((v) => v >= 0 && v <= 1)), `${seeds.length} seeds`);
assert.equal(look.wind.flutterCap, SITE_WIND.crown.flutterCap);
const grass = read(new URL('../material-map.json', import.meta.url)).materials['/Game/Lunden/Materials/M_LundenGrass'];
assert.equal(grass.autumn, '#' + GRASS.autumn.toString(16));
assert.deepEqual(grass.autumnMix, Array.from({ length: 12 }, (_, i) => GRASS.autumnMix[i + 1] ?? 0));

const bytes = fs.readFileSync(path.join(dir, 'vegetation.glb'));
const jsonSize = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString('utf8'));
const nodes = gltf.nodes.filter((n) => n.mesh !== undefined);
const keys = (n) => gltf.meshes[n.mesh].primitives.map((p) => gltf.materials[p.material].name);
const perennials = nodes.filter((n) => n.extras?.name === 'courtyard-shrubs');
assert.ok(perennials.length > 0);
assert.equal(perennials.length, vegetation.byWebName['courtyard-shrubs']);
assert.ok(perennials.every((n) => keys(n).every((k) => k.endsWith('_perennial') && look.leafKeys.includes(k))));
const perennialMeshes = new Set(perennials.map((n) => n.mesh));
assert.equal(nodes.filter((n) => perennialMeshes.has(n.mesh)).length, perennials.length);
assert.ok(nodes.some((n) => keys(n).some((k) => k.endsWith('_crown') && look.leafKeys.includes(k))));
assert.ok(nodes.some((n) => keys(n).some((k) => look.stillLeafKeys.includes(k))));
assert.ok(look.stillLeafKeys.every((k) => k.endsWith('_still') && look.leafKeys.includes(k)));

const barkImages = new Set();
for (const [kind, group] of [['bark', 'tree-trunks'], ['birch', 'tree-birches']]) {
  const trunks = nodes.filter((n) => n.name.startsWith('mesh_' + group + '-'));
  assert.ok(trunks.length > 0);
  for (const mesh of new Set(trunks.map((n) => n.mesh))) {
    for (const part of gltf.meshes[mesh].primitives) {
      const mat = gltf.materials[part.material], { baseColorTexture, metallicRoughnessTexture } = mat.pbrMetallicRoughness;
      assert.ok(mat.name.endsWith('_' + kind) && part.attributes.TEXCOORD_0 !== undefined);
      for (const slot of [baseColorTexture, metallicRoughnessTexture]) {
        assert.deepEqual(slot.extensions.KHR_texture_transform.scale, [1, 2]);
        const img = gltf.images[gltf.textures[slot.index].source], view = gltf.bufferViews[img.bufferView];
        const png = bytes.subarray(28 + jsonSize + (view.byteOffset ?? 0), 28 + jsonSize + (view.byteOffset ?? 0) + view.byteLength);
        assert.equal(img.mimeType, 'image/png');
        assert.equal(png.readUInt32BE(16), FOLIAGE.bark);
        assert.equal(png.readUInt32BE(20), FOLIAGE.bark * 2);
        barkImages.add(img.bufferView);
      }
    }
  }
}
assert.equal(barkImages.size, 4);
console.log(`VEGETATION_LOOK_OK: ${perennials.length} evergreen perennials, deciduous crowns, still vines, four bark images, twelve months, atlas tint ${cards} / ${core}, ${seeds.length} lobe seeds`);
