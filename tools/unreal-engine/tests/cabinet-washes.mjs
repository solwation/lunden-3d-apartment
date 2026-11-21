// Check the render-only BESTÅ geometry against the same source dimensions the web cabinet uses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FURNITURE } from '../../../src/config.js';

const dir = process.argv[2] || 'unreal/Lunden/Import';
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const [lamp] = spec.lights.filter(l => l.cabinetWashes);
assert.ok(lamp?.id && lamp.name === 'spotsen');
const { fans, maskPng } = lamp.cabinetWashes;
const cabinet = FURNITURE.find(item => item.type === 'besta');
const veneer = spec.materials[lamp.cabinetWashes.veneerKey];
assert.equal(veneer.color, '#' + cabinet.walnut.toString(16).padStart(6, '0'));
assert.equal(veneer.roughness, .6);
assert.equal(veneer.metalness, 0);
const png = Buffer.from(maskPng, 'base64');
assert.equal(png.subarray(1, 4).toString(), 'PNG');
assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [128, 256]);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const near = (a, b) => assert.ok(Math.abs(a - b) < .02, `${a} != ${b} cm`);
const front = fans.filter(f => f.opacity === cabinet.wash.opacity), inner = fans.filter(f => f.opacity === cabinet.inside);
assert.equal(front.length, cabinet.spots.length);
assert.equal(inner.length, 2);
for (const f of fans) {
  const p = f.corners;
  const width = distance(p['0,0'], p['1,0']), height = distance(p['0,0'], p['0,1']);
  // The illuminated end of the canvas is at v=1 after the web plane's half-turn.
  near(p['0,1'][2] - p['0,0'][2], height);
  near(width, 100 * (front.includes(f) ? cabinet.wash.w : cabinet.w / 2 - .04));
  near(height, 100 * (front.includes(f) ? cabinet.wash.h : cabinet.sections[1] - .016));
  assert.equal(f.colour.length, 3);
  assert.ok(f.colour[0] > f.colour[1] && f.colour[1] > f.colour[2]);
}
console.log('LUNDEN_CABINET_EXPORT_OK: three door fields and two interior fields, original sRGB canvas and UVs');
