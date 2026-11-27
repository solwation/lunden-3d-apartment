// #2322: real export against ShadePools geometry, linear falloff, original rug and lamp fade.
// This is a source/render-contract check, not a native colour or depth acceptance test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { FURNITURE, LIGHTING, LEVELS } from '../../../src/config.js';
import { ShadePools } from '../../../src/shadepools.js';
import { glbJson } from '../json-schema.mjs';

const dir = process.argv[2] || 'unreal/Lunden/Import';
const measurements = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const field = measurements.furnishing.rugFloorPool;
assert.ok(field, 're-export the source rug floor pool');
const lamp = measurements.lights.find(l => l.id === field.lamp);
assert.equal(lamp.room, 'Vardagsrum');
assert.equal(lamp.kind, 'room');
const stops = [];
globalThis.document = { createElement: () => ({ getContext: () => ({
  createRadialGradient: () => ({ addColorStop: (t, rgb) => stops.push([t, Number(rgb.match(/\d+/)[0])]) }), fillRect() {},
}) }) };
const sourceLamp = { pos: new THREE.Vector3(...lamp.position.web), color: new THREE.Color(lamp.color).getHex(),
  level: lamp.level, shade: LIGHTING.shades.silvia };
const pools = new ShadePools([{ lamp: sourceLamp }], level => LEVELS[level].floor, () => 2.7);
const position = pools.mesh.geometry.attributes.position, colour = pools.mesh.geometry.attributes.color;
const near = (got, want, tolerance = 1e-5) => assert.ok(Math.abs(got - want) < tolerance, `${got} != ${want}`);
for (const k of [1, .75, .25, 0]) {
  pools.set(sourceLamp, k); pools.commit();
  for (let i = 0; i < 4; i++) {
    const uv = pools.mesh.geometry.attributes.uv;
    const key = [uv.getX(i), uv.getY(i)].join(',');
    [position.getX(i), position.getZ(i), position.getY(i)].forEach((v, j) => near(field.corners[key][j], v * 100));
    [colour.getX(i), colour.getY(i), colour.getZ(i)].forEach((v, j) => near(v, field.colour[j] * k, 1e-7));
  }
  assert.equal(pools.mesh.visible, k > .001);
}
const mat = pools.mesh.material;
assert.equal(field.opacity, mat.opacity);
assert.deepEqual(field.depth, { write: mat.depthWrite, test: mat.depthTest, polygonOffset: mat.polygonOffset,
  factor: mat.polygonOffsetFactor, units: mat.polygonOffsetUnits, renderOrder: pools.mesh.renderOrder });
assert.deepEqual(field.mask, { width: 128, height: 128, colorSpace: 'linear', flipY: true });

// Decode the actual canvas PNG; test the source gradient stops at interior, edge and exterior texels.
const b = Buffer.from(field.maskPng, 'base64'), idat = [];
assert.equal(b.subarray(1, 4).toString(), 'PNG');
assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20), b[24], b[25]], [128, 128, 8, 6]);
for (let o = 8; o < b.length;) {
  const n = b.readUInt32BE(o);
  if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n));
  o += n + 12;
}
const raw = zlib.inflateSync(Buffer.concat(idat)), stride = 128 * 4, pixels = Buffer.alloc(128 * stride);
for (let y = 0; y < 128; y++) for (let x = 0; x < stride; x++) {
  const f = raw[y * (stride + 1)], a = x >= 4 ? pixels[y * stride + x - 4] : 0;
  const up = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
  const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
  pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
}
const maskAt = (u, v) => {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  return pixels[(Math.min(127, Math.floor((1 - v) * 128)) * 128 + Math.min(127, Math.floor(u * 128))) * 4] / 255;
};
for (const [x, y] of [[64, 64], [78, 64], [96, 64], [118, 64], [127, 127], [0, 64]]) {
  const r = Math.hypot(x + .5 - 64, y + .5 - 64) / 64;
  const i = Math.min(9, Math.floor(r * 10)), t = Math.min(1, Math.max(0, r * 10 - i));
  const expected = r >= 1 ? 0 : stops[i][1] * (1 - t) + stops[i + 1][1] * t;
  near(pixels[(y * 128 + x) * 4], expected, 2);
}

const [receiver] = field.receivers;
assert.equal(field.receivers.length, 1);
const rug = FURNITURE.find(f => f.type === 'rug' && f.materialFamily === 'living-room');
const item = measurements.furnishing.items.find(f => f.id === receiver.id);
assert.equal(item.source, `src/config.js#FURNITURE[${FURNITURE.indexOf(rug)}]`);
assert.equal(measurements.materials[receiver.key].color, '#ffffff');
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
near(distance(receiver.corners['0,0'], receiver.corners['1,0']), rug.w * 100);
near(distance(receiver.corners['0,0'], receiver.corners['0,1']), rug.d * 100);
for (const p of Object.values(receiver.corners)) near(p[2], (LEVELS[rug.level].floor + rug.h + .002) * 100);
const glb = glbJson(fs.readFileSync(path.join(dir, 'l1007.glb')));
const node = glb.nodes.find(n => n.name === receiver.mesh);
assert.equal(node.extras.parent, receiver.id);
const textile = glb.materials[glb.meshes[node.mesh].primitives[0].material];
assert.equal(textile.name, receiver.key);
assert.ok(!textile.extensions?.KHR_materials_unlit);
assert.ok(textile.pbrMetallicRoughness.baseColorTexture);

const uvAt = (p, quad) => {
  const origin = quad['0,0'], delta = p.map((v, i) => v - origin[i]);
  return ['1,0', '0,1'].map(key => {
    const edge = quad[key].map((v, i) => v - origin[i]);
    return delta.reduce((n, v, i) => n + v * edge[i], 0) / edge.reduce((n, v) => n + v * v, 0);
  });
};
const inside = (p, quad) => uvAt(p, quad).every(v => v >= 0 && v <= 1);
const contribution = (p, k, supply) => inside(p, receiver.corners) ? maskAt(...uvAt(p, field.corners)) * k * supply : 0;
const top = receiver.corners['0,0'][2], centre = [lamp.position.unreal[0], lamp.position.unreal[1], top];
assert.ok(contribution(centre, 1, 1) > .95, 'pool centre actually reaches rug');
for (const [k, supply] of [[0, 1], [1, 0], [0, 0]]) assert.equal(contribution(centre, k, supply), 0);
near(contribution(centre, .25, .5), contribution(centre, 1, 1) * .125);
assert.equal(contribution([rug.x * 100 + 160, rug.z * 100, top], 1, 1), 0, 'outside rug receives nothing');
assert.equal(contribution([rug.x * 100 + 145, rug.z * 100 + 95, top], 1, 1), 0, 'inside rug but outside pool receives nothing');
console.log('LUNDEN_RUG_POOL_SOURCE_OK: source quad/UV/linear mask/tint, unchanged rug, receiver clipping and lamp/power fades; native colour/depth pending');
