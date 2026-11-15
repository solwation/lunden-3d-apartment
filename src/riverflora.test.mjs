import test from 'node:test';
import assert from 'node:assert/strict';
import { floraLayout, floraWindow, floraSeason } from './riverflora.js';
import { RIVER_FLORA as F } from './config.js';

const hw = (s) => 2.5 + Math.sin(s / 40), L = 640;
const lay = floraLayout({ length: L, hw });

test('the same river every time, sorted along it', () => {
  assert.deepEqual(floraLayout({ length: L, hw }), lay);
  for (const list of Object.values(lay)) for (let i = 1; i < list.length; i++) assert.ok(list[i].s >= list[i - 1].s);
});

test('everything lies inside the channel and clear of the ends', () => {
  for (const [kind, list] of Object.entries(lay)) {
    assert.ok(list.length > 20, `${kind}: ${list.length}`);
    for (const p of list) {
      assert.ok(p.s >= F.ends && p.s <= L - F.ends, `${kind} at s ${p.s}`);
      assert.ok(Math.abs(p.u) <= hw(p.s) + 1e-9, `${kind} at u ${p.u} of ${hw(p.s)}`);
    }
  }
  for (const s of lay.stones) assert.ok(Math.abs(s.u) + s.size <= hw(s.s) + 1e-9 && s.size >= F.stones.size[0] && s.size <= F.stones.size[1]);
});

test('weeds grow in patches; most stones are small', () => {
  const cells = new Set(lay.weeds.map((w) => Math.floor(w.s / F.weeds.patch))), all = Math.floor((L - 2 * F.ends) / F.weeds.patch);
  assert.ok(cells.size < all * 0.8 && cells.size > all * 0.35, `${cells.size} of ${all} patches planted`);
  const small = lay.stones.filter((s) => s.size < 0.15).length;
  assert.ok(small > lay.stones.length * 0.5, `${small} of ${lay.stones.length} small`);
});

test('lily leaves keep to one side near the bank, do not overlap, some flower', () => {
  for (const p of lay.lilies) assert.ok(Math.abs(p.u) >= 0.2 * hw(p.s) && Math.abs(p.u) + p.r < hw(p.s), `${p.u} of ${hw(p.s)}`);
  for (let i = 0; i < lay.lilies.length; i++) for (let j = i + 1; j < lay.lilies.length; j++) {
    const a = lay.lilies[i], b = lay.lilies[j];
    assert.ok(Math.hypot(a.s - b.s, a.u - b.u) >= a.r + b.r - 1e-9);
  }
  const fl = lay.lilies.filter((p) => p.flower).length;
  assert.ok(fl > 0 && fl < lay.lilies.length * 0.6, `${fl} of ${lay.lilies.length} flower`);
});

test('nothing where a pier stands', () => {
  const blocked = (s, u, r) => Math.abs(s - 300) < 3 + r && Math.abs(u) < 1 + r, b = floraLayout({ length: L, hw, blocked });
  for (const list of Object.values(b)) for (const p of list) assert.ok(!(Math.abs(p.s - 300) < 3 && Math.abs(p.u) < 1));
  assert.ok(b.stones.length < lay.stones.length);
});

test('the window and the seasons', () => {
  const [a, b] = floraWindow(lay.stones, 200, 30);
  assert.ok(b > a);
  lay.stones.forEach((p, i) => assert.equal(i >= a && i < b, Math.abs(p.s - 200) <= 30));
  assert.deepEqual(floraWindow(lay.stones, -500, 30), [0, 0]);
  assert.deepEqual(floraSeason(1), { leaves: false, bloom: false });
  assert.deepEqual(floraSeason(5), { leaves: true, bloom: false });
  assert.deepEqual(floraSeason(7), { leaves: true, bloom: true });
});
