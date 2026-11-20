// #2193: node --test tools/stepvarianttest.mjs  (pickStep: underfoot class + weather state -> footstep profile key; every key has a profile)
import test from 'node:test';
import assert from 'node:assert/strict';
const { FOOTSTEPS: F } = await import('../src/config.js');
const { pickStep } = await import('../src/footsteps.js');
const ground = (surface, extra = {}) => ({ surface, where: 'ground', road: false, stairs: false, ...extra });
const dry = { snow: 0, wet: 0, temp: 10, month: 6 };

test('plain surfaces are unchanged without weather state (#1519 kept)', () => {
  for (const s of ['wood', 'hard', 'grass', 'gravel']) assert.equal(pickStep(ground(s), dry), s);
  assert.equal(pickStep({ surface: 'wood', where: 'indoor' }, { ...dry, snow: 1, wet: 1, month: 10 }), 'wood');
  assert.equal(pickStep(undefined, undefined), 'wood');
});
test('snow crunches, squeaks at or below squeakTemp, but not on a ploughed road or indoors', () => {
  const s = { ...dry, snow: 0.8, month: 1 };
  assert.equal(pickStep(ground('grass'), { ...s, temp: -1 }), 'snow');
  assert.equal(pickStep(ground('hard'), { ...s, temp: F.squeakTemp }), 'snowCold');
  assert.equal(pickStep(ground('hard', { road: true }), { ...s, temp: -9 }), 'hard');
  assert.equal(pickStep(ground('grass'), { ...s, snow: F.snowMin - 0.01 }), 'grass');
  assert.equal(pickStep({ surface: 'hard', where: 'core', stairs: false }, { ...s, temp: -9 }), 'hard');
});
test('wet hard ground splashes; wet grass and dry hard ground do not', () => {
  assert.equal(pickStep(ground('hard'), { ...dry, wet: 0.9 }), 'wet');
  assert.equal(pickStep({ surface: 'hard', where: 'exposed' }, { ...dry, wet: F.wetMin }), 'wet');
  assert.equal(pickStep(ground('hard'), { ...dry, wet: F.wetMin - 0.01 }), 'hard');
  assert.equal(pickStep(ground('grass'), { ...dry, wet: 1 }), 'grass');
  assert.equal(pickStep({ surface: 'hard', where: 'core' }, { ...dry, wet: 1 }), 'hard');
});
test('stairwell treads are hollow, landings are not', () => {
  assert.equal(pickStep({ surface: 'hard', where: 'core', stairs: true }, dry), 'stair');
  assert.equal(pickStep({ surface: 'hard', where: 'core', stairs: false }, dry), 'hard');
});
test('leaves rustle on soft ground in the autumn months only; snow outranks leaves', () => {
  for (const m of F.leafMonths) { assert.equal(pickStep(ground('grass'), { ...dry, month: m }), 'leaves'); assert.equal(pickStep(ground('gravel'), { ...dry, month: m }), 'leaves'); }
  assert.equal(pickStep(ground('grass'), { ...dry, month: 7 }), 'grass');
  assert.equal(pickStep(ground('hard'), { ...dry, month: 10 }), 'hard');
  assert.equal(pickStep(ground('grass'), { ...dry, month: 11, snow: 0.5, temp: 0 }), 'snow');
});
test('every key pickStep can return has a profile with sane numbers', () => {
  for (const k of ['wood', 'hard', 'grass', 'gravel', 'snow', 'snowCold', 'wet', 'stair', 'leaves']) {
    const p = F.profiles[k]; assert.ok(p, k);
    assert.ok(p.duration + F.sourceTail <= F.voiceDuration, `${k} fits the voice slot`);
    if (p.partial) assert.ok(p.partial.duration <= p.duration + 0.05);
  }
});
