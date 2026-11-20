// #2165: the fabric finish table and the jeans' wear zones. node --test tools/avatarfabrictest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fabricFinish, wearAt, fabricDecl, fabricShade, fabricLight, FABRIC } from '../src/avatarfabric.js';
import { AVATAR_FABRIC as FB, AVATAR_SURFACE as S } from '../src/config.js';
import { bindAt } from '../src/olof.js';

const K = bindAt('kneeL'), hemY = 0.05;
const at = (nx, nz, qy, r = 0.065) => ({ x: K.x + nx * r, y: K.y + qy, z: nz * r }); // a point on the left leg's surface (nx outward, nz forward)

test('every weave kind has its own finish; knit and fleece are the fuzziest, denim the least', () => {
  const k = [0, 1, 2, 3, 4].map(fabricFinish);
  assert.equal(new Set(k.map((x) => x.rough)).size, 5);
  for (const x of k) { assert.ok(x.rough > 0.3 && x.rough <= 1); assert.ok(x.sheen >= 0 && x.white >= 0 && x.white <= 1); }
  assert.ok(k[1].sheen > k[0].sheen && k[2].sheen > k[1].sheen && k[3].sheen < k[0].sheen);
  assert.ok(k[4].rough < k[3].rough && k[3].rough < k[0].rough && k[0].rough < k[1].rough); // twill sleekest, then denim, jersey, knit
  assert.ok(Math.abs(k[0].rough - S.finish.cloth) < 0.1 && fabricFinish(9).rough === k[0].rough);
});

test('jeans wear: the front of the knee and thigh fade more than the back, the seams and hem are pale', () => {
  const kneeFront = wearAt(at(0, 1, 0), hemY), kneeBack = wearAt(at(0, -1, 0.15), hemY);
  assert.ok(kneeFront > 0.5 && kneeFront > kneeBack + 0.35, `${kneeFront} vs ${kneeBack}`);
  const thighFront = wearAt(at(0, 1, FB.wear.thighY), hemY), thighBack = wearAt(at(0, -1, FB.wear.thighY), hemY);
  assert.ok(thighFront > thighBack + 0.25);
  const seam = wearAt(at(1, 0, 0.1), hemY), off = wearAt(at(0.35, 0.94, 0.1), hemY); // the outseam vs a point 20° round the front
  assert.ok(seam > FB.wear.base + 0.2 && seam > wearAt(at(0.6, 0.8, 0.1), hemY) - 1e-9 + 0.1 && off < seam + 0.5);
  const inseam = wearAt(at(-1, 0, 0.1), hemY); assert.ok(inseam > FB.wear.base + 0.2);
  const hem = wearAt(at(0, -0.9, hemY - K.y + FB.wear.hemAt), hemY), above = wearAt(at(0, -0.9, hemY - K.y + 0.1), hemY);
  assert.ok(hem > above + 0.2);
});

test('wear stays within 0 … 1, honeycombs and whiskers fade out with the pixel footprint', () => {
  for (let i = 0; i < 400; i++) { const a = i * 2.399, w = wearAt({ x: K.x + Math.cos(a) * 0.065, y: i * 0.0025, z: Math.sin(a) * 0.065 }, hemY, (i % 5) * 0.001); assert.ok(w >= 0 && w <= 1, String(w)); }
  const lines = (fp) => { const v = []; for (let y = 0; y < 0.012; y += 0.0001) v.push(wearAt(at(0, 0.8, FB.wear.lapY + y - 0.006), hemY, fp)); return Math.max(...v) - Math.min(...v); };
  assert.ok(lines(0) > 0.1 && lines(0.01) < 0.3 * lines(0), `${lines(0)} ${lines(0.01)}`); // line contrast at full detail vs at distance
  assert.ok(wearAt(at(0, 1, 0), hemY, 0.01) > 0.5); // the broad fade stays
});

test('GLSL strings carry every kind and are empty when off', () => {
  const d = fabricDecl(); assert.ok(d.includes('fabricOf') && d.includes('fabricWear'));
  assert.ok(fabricShade().includes('uSeamKind.y') && fabricLight().includes('reflectedLight.directSpecular'));
  FABRIC.on = false; assert.equal(fabricDecl() + fabricShade() + fabricLight(), ''); FABRIC.on = true;
});
