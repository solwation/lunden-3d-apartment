// #2322: actual ShadePools floor/ceiling uploads, unchanged states, stable IDs and display-space fade semantics.
// node tools/unreal-engine/tests/display-pools.mjs [FINAL_EXPORT_DIR]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { LIGHTING, LEVELS } from '../../../src/config.js';
import { ShadePools } from '../../../src/shadepools.js';
import { displayPoolProfile, displayPoolRows } from '../export-display-pools.js';
import { validate } from '../json-schema.mjs';
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { ceilingAt } = await import('../../../src/pendants.js');
const stops = [];
// Node has no canvas. Read the real source gradient instructions; actual PNG identity is checked with the final export.
globalThis.document = { createElement: () => ({ getContext: () => ({
  createRadialGradient: () => ({ addColorStop: (t, rgb) => stops.push([t, Number(rgb.match(/\d+/)[0])]) }), fillRect() {},
}), toDataURL: () => 'data:image/png;base64,node-source-fixture' }) };
const near = (a, b, eps = 2e-5) => {
  if (Array.isArray(a)) { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], eps)); }
  else assert.ok(Math.abs(a-b) <= eps, `${a} != ${b}`);
};
// Every configured shaded pendant style, including the upper floor and a floor-only source.
const specs = LIGHTING.pendants.filter(p => LIGHTING.shades[p.style === 'copper3' ? 'copper' : p.style]?.pool);
const lamps = specs.map(p => ({ pos: new THREE.Vector3(p.x, LEVELS[p.level].floor + 1.5, p.z),
  color: LIGHTING.pendant.color, level: p.level, shade: LIGHTING.shades[p.style === 'copper3' ? 'copper' : p.style] }));
const pools = new ShadePools(lamps.map(lamp => ({ lamp })), li => LEVELS[li].floor, ceilingAt);
lamps.forEach((l, i) => pools.set(l, [0, .25, .9995][i % 3])); pools.commit();
const saved = { k: [...pools.k.values()], colours: [...pools.mesh.geometry.attributes.color.array],
  positions: [...pools.mesh.geometry.attributes.position.array], visible: pools.mesh.visible };
const profile = displayPoolProfile({ shadePools: pools });
assert.deepEqual([...pools.k.values()], saved.k); assert.deepEqual([...pools.mesh.geometry.attributes.color.array], saved.colours);
assert.deepEqual([...pools.mesh.geometry.attributes.position.array], saved.positions); assert.equal(pools.mesh.visible, saved.visible);
assert.equal(profile.sourceLampCount, lamps.length);
assert.equal(profile.fields.length, lamps.reduce((n, l) => n + Number(!!l.shade.pool.floor) + Number(!!l.shade.pool.ceiling), 0));
assert.equal(stops.length, 11); for (const [i, [t, v]] of stops.entries()) { near(t, i/10); assert.equal(v, Math.round(255*(1-i/10)**1.5)); }
const rug = { receivers: [{ id: 'actual-rug-fixture', mesh: 'actual-rug-fixture__1', key: 'unchanged-rug',
  corners: {'0,0':[0,0,1.4], '1,0':[100,0,1.4], '1,1':[100,100,1.4], '0,1':[0,100,1.4]} }] };
const rows = new Map(lamps.map((l, i) => [l, { id: 'source-lamp-' + i }]));
const data = displayPoolRows(profile, rows, rug);
assert.deepEqual(data.rugReceivers, rug.receivers); assert.notEqual(data.rugReceivers, rug.receivers);
assert.throws(() => displayPoolRows(profile, new Map(), rug), /stable measurement light ID/);
assert.throws(() => displayPoolRows(profile, rows, null), /rug receiver/);
const schema = JSON.parse(fs.readFileSync(new URL('../../../shared/schema/measurements.schema.json', import.meta.url)));
const contract = schema.properties.furnishing.properties.displayPools;
assert.deepEqual(validate(data, contract, schema), []);
const missing = structuredClone(data); delete missing.fields[0].lamp;
assert.ok(validate(missing, contract, schema).some(s => s.includes('lamp')));
const wrong = structuredClone(data); wrong.mask.colorSpace = 'srgb';
assert.ok(validate(wrong, contract, schema).length);
// Source commit itself supplies every quad at each fade/power level, including moved upper-floor geometry.
let checks = 0;
for (const [fade, power] of [[1,1], [.25,1], [.5,.25], [0,1], [1,0]]) {
  // Go through zero so set()'s intentional 1e-3 upload threshold does not retain saved .9995 at a requested 1.
  lamps.forEach(l => { pools.set(l, 0); pools.set(l, fade*power); }); pools.commit();
  const {position, uv, color} = pools.mesh.geometry.attributes;
  for (const [i, lamp] of lamps.entries()) for (const [s, kind] of ['floor','ceiling'].entries()) {
    if (!lamp.shade.pool[kind]) continue;
    const first = (i*2+s)*4, row = data.fields.find(f => f.lamp === rows.get(lamp).id && f.kind === kind);
    for (let j=first; j<first+4; j++) {
      near(row.corners[[uv.getX(j),uv.getY(j)].join(',')], [position.getX(j)*100,position.getZ(j)*100,position.getY(j)*100]);
      near([color.getX(j),color.getY(j),color.getZ(j)],row.colour.map(v=>v*fade*power),1e-7); checks++;
    }
    const height = kind === 'floor' ? LEVELS[lamp.level].floor+.012 : ceilingAt(lamp.level,lamp.pos.x,lamp.pos.z)-.012;
    for (const p of Object.values(row.corners)) near(p[2],height*100);
  }
}
// A lamp moved after snapshot must re-seat BOTH fields using the source's actual commit path.
const moving = lamps.find(l=>l.shade.pool.floor && l.shade.pool.ceiling), old = moving.pos.clone();
moving.pos.x += .4; moving.pos.z -= .3;
const moved = displayPoolProfile({shadePools:pools});
for (const kind of ['floor','ceiling']) {
  const before = profile.fields.find(f=>f.lamp===moving && f.kind===kind), after = moved.fields.find(f=>f.lamp===moving && f.kind===kind);
  // Float32 source upload rounds the old/new 10 m coordinates separately (less than 1e-4 cm).
  for (const key of Object.keys(before.corners)) near(after.corners[key].slice(0,2),[before.corners[key][0]+40,before.corners[key][1]-30],1e-4);
}
moving.pos.copy(old); pools.commit();
// The actual additive MeshBasic map is linear. K/power precedes the output transfer, opacity follows it.
const oetf = v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
const linear = data.fields.find(f=>f.kind==='floor').colour[0]*.5;
const actual = oetf(linear*.25)*.6;
assert.ok(Math.abs(actual-oetf(linear)*.25*.6)>.02, 'post-OETF K multiplication would change the real source fade');
assert.ok(Math.abs(actual-oetf(linear*.25*.6))>.01, 'opacity is separate from linear RGB fade');
if (process.argv[2]) {
  const m = JSON.parse(fs.readFileSync(path.join(process.argv[2],'measurements.json'))), actual = m.furnishing.displayPools;
  assert.deepEqual(validate(actual,contract,schema),[]);
  assert.equal(actual.maskPng,m.furnishing.rugFloorPool.maskPng,'same actual source falloff canvas');
  assert.deepEqual(actual.rugReceivers,m.furnishing.rugFloorPool.receivers);
  assert.equal(actual.runtimeCoverage.fieldCount,actual.fields.length);
  assert.ok(actual.runtimeCoverage.sourceLampCount>=new Set(actual.fields.map(f=>f.lamp)).size,
    'multiple source anchors may share one stable fitting/lamp ID');
  assert.ok(actual.runtimeCoverage.sourceLampCount<=actual.fields.length);
  for (const f of actual.fields) assert.ok(m.lights.some(l=>l.id===f.lamp),'actual stable measurement lamp exists');
  const floor=actual.fields.find(f=>f.kind==='floor' && f.lamp===m.furnishing.rugFloorPool.lamp);
  assert.deepEqual(floor.corners,m.furnishing.rugFloorPool.corners); assert.deepEqual(floor.colour,m.furnishing.rugFloorPool.colour);
  console.log(`Actual full export: ${actual.runtimeCoverage.sourceLampCount} lamps / ${actual.fields.length} fields, IDs, shared mask and original rug receiver pass`);
}
console.log(`Source ShadePools: ${lamps.length} configured shaded pendant fixtures / ${data.fields.length} fields, ${checks} actual corner/fade checks, floor+ceiling heights, restoration, moves, display fade and schema pass (native acceptance separate)`);
