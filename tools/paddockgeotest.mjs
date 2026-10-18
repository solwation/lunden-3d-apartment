// Pony paddock plan geometry (#1280, src/paddockgeo.js): `node --test tools/paddockgeotest.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, PADDOCK } from '../src/config.js';
import * as g from '../src/paddockgeo.js';

const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const cross = (a, b) => { const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const A = [a[0], a[1]], B = [a[2], a[3]], C = [b[0], b[1]], D = [b[2], b[3]]; return d(A, B, C) * d(A, B, D) < 0 && d(C, D, A) * d(C, D, B) < 0; };

test('the paddock is the mapped kidney-shaped field, fenced inside its outline', () => {
  assert.ok(g.outline.length > 20);
  assert.ok(g.fenceLine.length >= g.outline.length - 2, 'no corner lost');
  for (const [x, z] of g.fenceLine) { assert.ok(g.inPoly(g.outline, x, z), 'fence inside the field'); assert.ok(g.ringDist(g.outline, x, z) >= PADDOCK.inset * 0.85, 'inset kept'); }
});
test('posts are at most postStep apart and the fence never crosses itself', () => {
  const segs = g.fenceSegments();
  assert.equal(segs.length, g.posts.length);
  for (const s of segs) assert.ok(Math.hypot(s[2] - s[0], s[3] - s[1]) <= PADDOCK.postStep + 1e-6);
  for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) if (!(i === 0 && j === segs.length - 1)) assert.ok(!cross(segs[i], segs[j]), `segments ${i} and ${j} cross`);
});
test('the closed gate is on the footpath side and the fence leaves every path clear', () => {
  const a = g.posts[g.gateSpan], b = g.posts[(g.gateSpan + 1) % g.posts.length];
  assert.ok(Math.hypot((a[0] + b[0]) / 2 - PADDOCK.gate.near[0], (a[1] + b[1]) / 2 - PADDOCK.gate.near[1]) < 6);
  const ways = [...SITE.riverPark.paths, ...SITE.south.paths, ...(SITE.south.access ?? []).filter((p) => p.path)];
  for (const w of ways) for (const p of g.posts) for (let i = 1; i < w.path.length; i++) assert.ok(segDist(p[0], p[1], w.path[i - 1], w.path[i]) > w.w / 2 + 1.0, `fence clear of path ${w.source}`);
});
test('inside / nearest helpers', () => {
  assert.ok(g.insideFence(g.centre.x, g.centre.z) || g.insideFence(-150, 250));
  assert.ok(!g.insideFence(-100, 230));
  const n = g.nearestOnFence(-100, 235); assert.ok(n.d > 5 && n.d < 20);
});
