// #2400: the web's unlit signs and labels (MeshBasicMaterial with a colour map) keep their image in the Unreal export.
//   node tools/unreal-engine/tests/sign-textures.mjs [export dir, default unreal/Lunden/Import]
// Before #2400 every such canvas (the flats' number signs in Hus A, B, C and L, the garage plates and exit pictograms, the
// stairwells' floor numbers) collapsed into the plain key bas_ffffff_r100_m0_tex without a baseColorTexture, so the A1004
// sign rendered as a white square in Unreal. This fails when an unlit textured key has no kept texture, when a flat-door
// atlas key lacks its image in the GLB, or when the four houses' atlases (each paints its own numbers) share one image.
// #2435: they also stay unlit (KHR_materials_unlit, measurements.json `unlit`) with the web's power-cut share: Hus A/B/C
// dim their number signs and door leaves to POWER.emergency, Hus L keeps its; the garage's labels are written at the lit
// level of their tubes (white factor) and fall to the off level in a power cut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../sources.mjs';
import { glbJson } from '../json-schema.mjs';

const dir = path.resolve(process.argv[2] || path.join(ROOT, 'unreal/Lunden/Import'));
const M = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json'), 'utf8'));
const mats = Object.entries(M.materials);

// 1. no unlit key with a colour map may lose it (the site cut-outs keep theirs by name: material-map.json)
const site = /_(site_slatted_rail|site_house_letters|garage_cage_mesh|parked_bicycle_spokes)$/;
const lost = mats.filter(([k, v]) => v.type === 'bas' && v.textured && !v.texture && !site.test(k)).map(([k]) => k);
assert.deepEqual(lost, [], `unlit textured keys without their image: ${lost.join(', ')}`);

// 2. the flats' number signs and name plates: one textured key per house atlas, its image in the GLB
const atlas = mats.filter(([, v]) => v.map === 'flat-door-atlas' && !v.vertexColors); // (the leaves are the _vc keys)
const ids = new Set(atlas.map(([, v]) => v.texture));
assert.ok(atlas.length >= 4 && ids.size === atlas.length, `flat-door atlas keys ${atlas.map(([k]) => k)}: want one per house (A, B, C, L)`);
const wanted = new Map(atlas.map(([k]) => [k, null]));
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  const j = glbJson(fs.readFileSync(path.join(dir, f)));
  for (const m of j.materials ?? []) {
    if (!wanted.has(m.name)) continue;
    const t = m.pbrMetallicRoughness?.baseColorTexture;
    assert.ok(t, `${f}: ${m.name} has no baseColorTexture`);
    const img = j.images?.[j.textures?.[t.index]?.source];
    assert.ok(img, `${f}: ${m.name}'s baseColorTexture has no image`);
    wanted.set(m.name, `${f} ${img.name ?? img.mimeType}`);
  }
}
const missing = [...wanted].filter(([, v]) => !v).map(([k]) => k);
assert.deepEqual(missing, [], `flat-door atlas keys in no GLB material: ${missing.join(', ')}`);

// 3. every kept sign texture is listed for test_furnishing.py, which checks it on its mesh actors in Unreal
const listed = new Set(M.furnishing.textures.map((t) => t.id));
for (const [k, v] of atlas) assert.ok(listed.has(v.texture), `${k}: texture ${v.texture} not in furnishing.textures`);

// 4. #2435: unlit, with the web's power-cut share
const emergency = Number(/\bemergency:\s*([\d.]+)/.exec(fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8'))[1]);
const lit = mats.filter(([, v]) => v.type === 'bas' && v.texture && v.unlit !== true).map(([k]) => k);
assert.deepEqual(lit, [], `web unlit labels exported lit: ${lit.join(', ')}`);
const cuts = atlas.map(([, v]) => v.powerCut).sort();
assert.deepEqual(cuts, [emergency, emergency, emergency, 1], `flat-door atlas power-cut shares ${cuts}: want A/B/C ${emergency}, L 1`);
const leaves = mats.filter(([, v]) => v.map === 'flat-door-atlas' && v.vertexColors);
assert.ok(leaves.length === 3 && leaves.every(([, v]) => v.powerCut === emergency), `A/B/C door leaves ${leaves.map(([k, v]) => `${k} ${v.powerCut}`)}: want ${emergency}`);
const dark = mats.filter(([k, v]) => v.type === 'bas' && v.texture && v.color !== '#ffffff').map(([k]) => k);
assert.deepEqual(dark, [], `unlit labels with a dark factor (the garage's must show their lit level): ${dark.join(', ')}`);
const garage = mats.filter(([, v]) => v.unlit && v.vertexColors && v.powerCut > 0 && v.powerCut < emergency);
assert.ok(garage.length >= 3, `garage labels dimmed to the tubes' off level: ${garage.length}`);
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  for (const m of glbJson(fs.readFileSync(path.join(dir, f))).materials ?? []) {
    if (M.materials[m.name]?.unlit) assert.ok(m.extensions?.KHR_materials_unlit, `${f}: ${m.name} lacks KHR_materials_unlit`);
  }
}

console.log(`sign textures OK: ${mats.filter(([, v]) => v.type === 'bas' && v.texture).length} unlit textured keys keep their image; `
  + `flat-door atlases ${[...wanted].map(([k, v]) => `${k} (${v})`).join(', ')}; all unlit, `
  + `${atlas.length + leaves.length - 1} dimmed to ${emergency} and ${garage.length} garage labels to ${garage[0]?.[1].powerCut} in a power cut`);
