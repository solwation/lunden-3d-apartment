import test from 'node:test';
import assert from 'node:assert/strict';
import { subtractConvex, polygonCutter } from '../src/polygoncut.js';

const area = p => Math.abs(p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length]; return s + a[0] * b[2] - a[2] * b[0];
}, 0)) / 2;
const total = ps => ps.reduce((s, p) => s + area(p), 0);
const square = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
const plane = (x, z) => [x, 3 + x / 2 - z / 3, z];

test('oblique junction keeps both road-edge intersections and the original terrain plane', () => {
  const tri = [plane(-4, -1), plane(4, 1), plane(-4, 1)];
  for (const clip of [square, [...square].reverse()]) {
    const parts = subtractConvex(tri, clip);
    assert.ok(Math.abs(total(parts) - 4) < 1e-9);
    assert.ok(parts.flat().some(p => Math.abs(p[0] - 2) < 1e-9));
    assert.ok(parts.flat().some(p => Math.abs(p[0] + 2) < 1e-9));
    for (const p of parts.flat()) assert.ok(Math.abs(p[1] - plane(p[0], p[2])[1]) < 1e-9);
    // No emitted polygon lies inside the carriageway. This catches the former
    // full-width strip clipping that left the far corner on the asphalt.
    for (const p of parts) {
      const x = p.reduce((s, v) => s + v[0], 0) / p.length;
      const z = p.reduce((s, v) => s + v[2], 0) / p.length;
      assert.ok(Math.abs(x) >= 2 - 1e-9 || Math.abs(z) >= 2 - 1e-9);
    }
  }
});

test('inside, outside, tangent, containing and degenerate cutters', () => {
  assert.deepEqual(subtractConvex([plane(0, 0), plane(1, 0), plane(0, 1)], square), []);
  const outside = [plane(3, 0), plane(4, 0), plane(3, 1)];
  assert.equal(total(subtractConvex(outside, square)), area(outside));
  const tangent = [plane(2, -1), plane(4, 0), plane(2, 1)];
  assert.equal(total(subtractConvex(tangent, square)), area(tangent));
  const containing = [plane(-10, -10), plane(10, -10), plane(0, 10)];
  assert.ok(Math.abs(total(subtractConvex(containing, square)) - (area(containing) - 16)) < 1e-9);
  assert.deepEqual(subtractConvex(outside, [[0, 0], [1, 0], [2, 0]]), [outside]);
});

test('spatial clipping crosses negative cell boundaries, skips only its own road and subtracts the union', () => {
  const own = {}, other = {}, triangle = [plane(-4, -4), plane(4, -4), plane(-4, 4)];
  const pieces = [{ owner: own, poly: square }, { owner: other, poly: [[-4, -4], [-2, -4], [-2, 4], [-4, 4]] }];
  const cut = polygonCutter(pieces, 1);
  assert.ok(Math.abs(total(cut(triangle)) - 10) < 1e-9);
  assert.ok(Math.abs(total(cut(triangle, own)) - 18) < 1e-9);
  assert.ok(Math.abs(total(cut(triangle, other)) - 24) < 1e-9);
  // Repeated calls do not mutate subject coordinates or accumulate clipping.
  assert.deepEqual(cut(triangle), cut(triangle));
  assert.deepEqual(triangle[0], plane(-4, -4));
});
