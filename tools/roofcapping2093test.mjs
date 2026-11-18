// #2093: Hus L's light sheet-metal capping follows the roof's edge only; the felt roof (#2088) shows inside it.
// node --test tools/roofcapping2093test.mjs (needs `three` resolvable for the exterior.js import).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { VERTICAL, HUS_L } from '../src/config.js';
import { husLLayout, rectRing } from '../src/exterior.js';
const src = readFileSync(new URL('../src/exterior.js', import.meta.url), 'utf8');
const area = ([a, b, c, d]) => (b - a) * (d - c);
const overlap = (p, q) => Math.max(0, Math.min(p[1], q[1]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[2], q[2]));

test('rectRing tiles the band inside the outline without overlap', () => {
  const r = rectRing(0, 10, 0, 4, 0.3);
  assert.equal(r.length, 4);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.equal(overlap(r[i], r[j]), 0, 'no overlap');
  assert(Math.abs(r.reduce((s, q) => s + area(q), 0) - (40 - 9.4 * 3.4)) < 1e-9, 'outline minus the inner rect');
  for (const q of r) assert(q[0] >= 0 && q[1] <= 10 && q[2] >= 0 && q[3] <= 4);
  assert.equal(rectRing(0, 1, 0, 1, 5).reduce((s, q) => s + area(q), 0), 1, 'a band wider than the rect covers it, no more');
});

test('Hus L: the capping is an edge band, the felt is exposed, heights and walking unchanged', () => {
  const R = VERTICAL.roof, { xw, xe } = husLLayout(), D = 12.7, loftD = HUS_L.loftgangDepth, zs = D - HUS_L.court.setback;
  assert.equal(R.source, 'assumption'); assert(R.cappingWidth > 0.1 && R.cappingWidth < 0.6, 'a flange, not a cover');
  assert(R.cappingDrop > 0 && R.cappingDrop < R.buildUp, 'folds over the build-up face, above the structure');
  const outer = [xw - 0.13, xe + 0.13, loftD - 0.13, zs + 0.13], felt = [xw - 0.1, xe + 0.1, loftD - 0.1, zs + 0.1];
  const band = rectRing(...outer, R.cappingWidth), covered = band.reduce((s, q) => s + overlap(q, felt), 0);
  const share = 1 - covered / area(felt);
  assert(share > 0.85, `felt visible on ${(share * 100).toFixed(1)} % of the roof`);
  // the source: no slab over the whole roof any more; the band from rectRing; felt box and walk surface as before
  assert(!/boxGeo\(xw - 0\.13, xe \+ 0\.13, upperTop \+ rb, upperTop \+ rc/.test(src), 'the old full-roof slab is gone');
  assert(/rectRing\(xw - 0\.13, xe \+ 0\.13, loftD - 0\.13, zs \+ 0\.13, VERTICAL\.roof\.cappingWidth\)/.test(src));
  assert(/roofs\.push\(boxGeo\(xw - 0\.1, xe \+ 0\.1, upperTop, upperTop \+ rb, loftD - 0\.1, zs \+ 0\.1\)\)/.test(src), 'felt box unchanged');
  assert(/roofY = upperTop \+ rc/.test(src) && /surf\('L-roof', 'Hus L:s tak', xw - 0\.13, xe \+ 0\.13, loftD - 0\.13, zs \+ 0\.13, roofY\)/.test(src), 'walk surface unchanged');
  assert(/upperTop \+ rc \+ H\.solar\.lift/.test(src), 'solar panels unchanged');
  console.log(`# Hus L roof ${(xe - xw).toFixed(2)} × ${(zs - loftD).toFixed(2)} m; felt visible ${(share * 100).toFixed(1)} %`);
});
