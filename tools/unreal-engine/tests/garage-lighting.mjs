// #2404: execute the real garage setLevel method, including source endpoints and exact state restoration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { garageLightingMaterials } from '../export-garage-lighting.js';
import { glbJson } from '../json-schema.mjs';

const source = fs.readFileSync(new URL('../../../src/garage.js', import.meta.url), 'utf8');
const body = source.split('  setLevel(a, k) {')[1]?.split('\n  }')[0];
assert.ok(body, 'actual garage setLevel method must be found');
const setLevel = new Function('a', 'k', body);
const material = () => ({ isMeshBasicMaterial: true, color: {
  value: [1,1,1], setScalar(v) { this.value = [v,v,v]; },
  toArray() { return [...this.value]; }, fromArray(v) { this.value = [...v]; },
} });
const mats = { shell: material(), mesh: material(), signs: material(), tubes: material(), floors: [material()], plans: material() };
const area = { level: 0, mats };
const independent = material(), lit = { isMeshBasicMaterial: false };
const independentOff = material(); independentOff.color.setScalar(.035);
// Execute the actual garagelods shared-colour assignment, with a normal independent-colour clone beforehand.
const lodSource = fs.readFileSync(new URL('../../../src/garagelods.js', import.meta.url), 'utf8');
const cloneSource = lodSource.match(/const mat = shell\.clone\(\); mat\.color = shell\.color;/)?.[0];
assert.ok(cloneSource, 'actual garage LOD clone/shared Color contract must be found');
mats.shell.clone = () => material();
const clone = new Function('shell', cloneSource + ' return mat;')(mats.shell);
assert.notEqual(clone, mats.shell);
assert.equal(clone.color, mats.shell.color);
const garage = { areas: { actualArea: area }, setLevel,
  object: { traverse(fn) { fn({ material: independent }); fn({ material: independentOff }); fn({ material: clone }); fn({ material: lit }); } } };
setLevel(area, .9995); // a genuine source endpoint-near level, not silently rounded during restoration
mats.signs.color.setScalar(1); // #2435's full-on label snapshot is independent of area.level
const snapshot = () => JSON.stringify({ level: area.level, colors: Object.values(mats).flat().map(m => m.color.toArray()) });
const before = snapshot();
const result = garageLightingMaterials(garage);
assert.equal(snapshot(), before, 'export observation must not change levels or independently normalised label colours');
for (const m of [mats.shell, mats.mesh, mats.signs, ...mats.floors, mats.plans]) {
  assert.deepEqual(result.get(m).colour, [1,1,1]); assert.equal(result.get(m).powerCut, .035);
}
assert.equal(result.get(mats.tubes).powerCut, .25);
assert.deepEqual(result.get(clone), { colour: [1,1,1], powerCut: .035 },
  'a different material with the actual shared area Color follows full-on and power-off endpoints');
assert.deepEqual(clone.color.toArray(), mats.shell.color.toArray(), 'shared live colour must remain restored');
assert.deepEqual(result.get(independent), { colour: [1,1,1], powerCut: 1 });
assert.notEqual(independentOff.color, mats.shell.color);
assert.deepEqual(result.get(independentOff), { colour: [.035,.035,.035], powerCut: 1 },
  'an independent Color numerically equal to the source off endpoint must not inherit area lighting');
assert.equal(result.has(lit), false, 'lit parked cars/park doors must not get the Basic bake');
const original = garage.setLevel;
garage.setLevel = function(a,k) { original(a,k); if (k === 1) a.mats.shell.color.value[0] = 0; };
assert.throws(() => garageLightingMaterials(garage), /Invalid garage/);
assert.equal(snapshot(), before, 'even a rejected source contract must restore exact previous state');
console.log('Garage bake: actual setter + LOD shared Color, .035/.25 power ratios, PBR exclusion and exact restoration PASS');
if (process.argv[2]) {
  const folder = path.resolve(process.argv[2]);
  const data = JSON.parse(fs.readFileSync(path.join(folder, 'measurements.json')));
  const keys = new Map(Object.entries(data.materials).filter(([, v]) => v.garageBake));
  assert.ok(keys.size, 'export must contain actual garage bake metadata');
  const json = glbJson(fs.readFileSync(path.join(folder, 'kvarteret.glb'))), seen = new Set();
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const m = json.materials[p.material];
    if (!keys.has(m?.name)) continue;
    const info = keys.get(m.name); seen.add(m.name);
    assert.equal(info.type, 'bas'); assert.equal(info.unlit, true);
    assert.ok(info.powerCut >= 0 && info.powerCut <= 1);
    assert.ok(Number.isFinite(info.garageAlphaCutoff) && info.garageAlphaCutoff >= 0 && info.garageAlphaCutoff <= 1,
      'actual source alphaTest must accompany every garage bake, including zero for opaque surfaces');
    assert.ok(m.name.includes('_garage_baked_p'));
    assert.ok(m.extensions?.KHR_materials_unlit, 'Basic bake must not become a PBR material');
    if (info.vertexColors) assert.ok(p.attributes.COLOR_0 !== undefined, 'source baked vertex colours must survive');
    if (info.textured) assert.ok(m.pbrMetallicRoughness.baseColorTexture, 'source image/cut-out must survive');
    if (info.garageAlphaCutoff > 0) {
      assert.equal(m.alphaMode, 'MASK');
      assert.ok(Math.abs((m.alphaCutoff ?? .5) - info.garageAlphaCutoff) < 1e-8,
        'Generated native AlphaCutoff must use the same actual source threshold as the GLB');
    } else assert.notEqual(m.alphaMode, 'MASK');
    if (/garage_cage_mesh|parked_bicycle_spokes/.test(m.name)) assert.equal(m.alphaMode, 'MASK');
  }
  assert.deepEqual([...seen].sort(), [...keys.keys()].sort(), 'every declared source bake must be present');
  console.log('Actual kvarteret GLB: ' + seen.size + ' garage keys retain unlit, vertex light, maps and masks');
}
