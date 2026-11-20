// #2200: node --test tools/rainsurfacetest.mjs  (the rain's surround mix: roof drum under / inside a roof, metal ping near the car, leafy hiss
// near trees in leaf, splashes near Höje å, soft hiss over grass; nothing else changes the open-air layers under a roof.)
import test from 'node:test';
import assert from 'node:assert/strict';
const { RAIN_SURFACE: S } = await import('../src/config.js');
const R = await import('../src/rainsurface.js');
const m = (a = {}) => R.rainSurfaceMix({ riverDist: 500, ...a });

test('open hard ground with nothing near: the plain bright hiss, no layers', () => {
  const x = m();
  assert.deepEqual([x.roof, x.metal, x.leaf, x.water], [0, 0, 0, 0]);
  assert.equal(x.base, 1); assert.equal(x.baseHz, S.hardHz);
});
test('roof: under a roof or indoors drums, open air does not; indoors less than a roof right overhead', () => {
  assert.equal(m().roof, 0);
  assert.ok(m({ underRoof: true }).roof > m({ indoors: true }).roof && m({ indoors: true }).roof > 0);
});
test('trees: leafy hiss only with trees near AND leaves; bare winter trees add none; a roof keeps most of it off', () => {
  assert.ok(m({ trees: 1, leaves: 1 }).leaf > 0.5 && m({ trees: 1, leaves: 0 }).leaf === 0 && m({ trees: 0, leaves: 1 }).leaf === 0);
  assert.ok(m({ trees: 1, leaves: 1, underRoof: true }).leaf < m({ trees: 1, leaves: 1 }).leaf * 0.5);
});
test('water: splash rises as the river comes closer, full within waterFull, none beyond waterRange', () => {
  let prev = -1; for (const d of [S.waterRange + 1, 50, 30, 15, S.waterFull]) { const w = m({ riverDist: d }).water; assert.ok(w >= prev); prev = w; }
  assert.equal(m({ riverDist: S.waterRange + 1 }).water, 0); assert.ok(m({ riverDist: S.waterFull }).water >= S.water[2] - 1e-9);
});
test('metal: ping follows the metal nearness (metalNearness 1 inside the car box, 0 at `near` m)', () => {
  assert.equal(R.metalNearness(0), 1); assert.equal(R.metalNearness(S.near), 0);
  assert.ok(m({ metal: 1 }).metal > m({ metal: 0.3 }).metal && m({ metal: 0 }).metal === 0);
});
test('grass softens the base hiss only in the open; the base gives way to a busy mix but never vanishes', () => {
  assert.ok(m({ grass: 1 }).baseHz < m().baseHz && m({ grass: 1, indoors: true }).baseHz === S.hardHz);
  const busy = m({ underRoof: true, metal: 1, trees: 1 }); assert.ok(busy.base < 1 && busy.base > 0.4);
});
