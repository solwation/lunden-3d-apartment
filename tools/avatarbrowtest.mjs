// #2046: brows of hairs (src/avatarbrow.js): budget, the slider pivot's vertex order, density towards the tail, the seat on the skin.
//   node --test tools/avatarbrowtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_BROW as B } from '../src/config.js';
import { browSurface, browBody, browHalf, browX, browY } from '../src/avatarbrow.js';

test('#2046 brow surface: budget, a pivot per vertex on the centre line in the same (indexed) order, lifted off a given face', () => {
  const front = (x, y) => 0.1 - 2 * x * x - 0.5 * (y - 0.12) ** 2;
  for (const s of [-1, 1]) {
    const { geometry: g, anchor: a } = browSurface(s, front), p = g.attributes.position, q = a.attributes.position;
    assert.equal(p.count, q.count); assert.deepEqual(Array.from(g.index.array), Array.from(a.index.array), 'expanded alike');
    for (let i = 0; i < p.count; i++) {
      assert.equal(p.getX(i), q.getX(i), 'pivot straight across the brow');
      assert(Math.abs(p.getZ(i) - front(p.getX(i), p.getY(i)) - B.lift) < 1e-6, 'seated lift m above the face');
      assert(Math.sign(p.getX(i)) === s);
    }
    for (let k = 0; k < g.index.count; k += 3) { // outward winding (+z) on both sides
      const [i, j, l] = [0, 1, 2].map((d) => g.index.getX(k + d)), ux = p.getX(j) - p.getX(i), uy = p.getY(j) - p.getY(i), vx = p.getX(l) - p.getX(i), vy = p.getY(l) - p.getY(i);
      assert(ux * vy - uy * vx > 0, 'faces outwards');
    }
  }
  assert(2 * 2 * B.cols * B.rows <= B.budget);
});
test('#2046 brow shape: dense and wide at the head, thin and sparse to the tail, soft edges', () => {
  assert(browHalf(0.2) > 3 * browHalf(0.95), 'tapers');
  assert(browBody(0.2, 0) > 0.99 && browBody(0.2, browHalf(0.2) * 1.2) === 0, 'soft edge within the body');
  assert(browBody(0.92, 0) < 0.5 && browBody(0.92, 0) > 0, 'the tail fades');
  assert(browY(B.peak) > browY(0) && browY(B.peak) > browY(1), 'arched'); assert(browX(1) > browX(0));
});
test('#2046 avatars: both brows within budget, every brow vertex a brow part, no new attribute', () => {
  for (const style of [0, 1, 4]) {
    const g = avatarModelGeometry({ ...avatarLook('2046'), style, facial: 0 }), a = g.attributes;
    let n = 0;
    for (let i = 0; i < a.position.count; i++) if (a.region.getX(i) === 9) { n++; assert.equal(a.facePart.getX(i), 6); }
    assert.equal(n / 3, 4 * B.cols * B.rows); assert(n / 3 <= B.budget);
    assert.equal(Object.keys(a).length, 17); g.dispose();
  }
});
