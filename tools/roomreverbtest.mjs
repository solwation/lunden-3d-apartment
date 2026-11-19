// #2153: zone → reverb profile, impulse-response generation and the crossfade plan (pure helpers, no AudioContext).
import test from 'node:test';
import assert from 'node:assert/strict';
import { reverbZone, profileFor, makeImpulse, measureRt60, planZone, initialPlan } from '../src/roomreverb.js';
import { ROOM_REVERB as R } from '../src/config.js';

const world = (over = {}) => ({ size: { x: 80, z: 60 }, ...over });
const unit = (room) => ({ levelAt: () => 0, roomAt: () => room });

test('zones from the existing room data', () => {
  assert.equal(reverbZone(world({ unitAt: () => unit('Badrum') }), { x: 5, y: 0, z: 5 }), 'bright');
  assert.equal(reverbZone(world({ unitAt: () => unit('Tvättstuga') }), { x: 5, y: 0, z: 5 }), 'bright');
  assert.equal(reverbZone(world({ unitAt: () => unit('Vardagsrum') }), { x: 5, y: 0, z: 5 }), 'soft');
  assert.equal(reverbZone(world({ playroom: { contains: () => true } }), { x: 5, y: 0, z: 5 }), 'soft');
  assert.equal(reverbZone(world({ core: { contains: () => true } }), { x: 5, y: 0, z: 5 }), 'concrete');
  assert.equal(reverbZone(world({ garage: { inside: () => true } }), { x: 5, y: -3, z: 5 }), 'concrete');
  assert.equal(reverbZone(world(), { x: -30, y: 0, z: 30 }), 'courtyard');
  assert.equal(reverbZone(world(), { x: 500, y: 0, z: 500 }), 'open');
  assert.equal(reverbZone(world(), { x: -30, y: 20, z: 30 }), 'open', 'high above the yard is not the yard');
});

test('profiles: ordering of tails and the phone cap', () => {
  const rt = (z) => profileFor(z).rt60;
  assert.ok(rt('soft') < rt('bright') && rt('bright') < rt('concrete'));
  assert.equal(profileFor('open').wet, 0);
  assert.ok(profileFor('courtyard').taps.length >= 1);
  const low = profileFor('concrete', true);
  assert.ok(low.rt60 <= R.lowMemory.rt60Cap && low.wet <= R.lowMemory.wetCap && !low.taps);
});

test('impulse responses: deterministic, decaying, measured RT60 near the profile', () => {
  for (const z of ['soft', 'bright', 'concrete', 'courtyard']) {
    const p = profileFor(z), a = makeImpulse(p), b = makeImpulse(p);
    assert.deepEqual(a[0], b[0], `${z} deterministic`);
    assert.equal(a.length, 2);
    assert.ok(a[0].some((v, i) => v !== a[1][i]), `${z} channels differ`);
    assert.ok(a[0].every(Number.isFinite));
    const rt = measureRt60(a[0], R.irRate);
    assert.ok(rt > p.rt60 * 0.5 && rt < p.rt60 * 1.4, `${z} rt60 ${rt.toFixed(2)} vs ${p.rt60}`);
    const n = a[0].length, e = (x, y) => a[0].slice(x, y).reduce((s, v) => s + v * v, 0);
    assert.ok(e(0, n >> 1) > 5 * e(n >> 1, n), `${z} first half holds the energy`);
  }
  assert.ok(makeImpulse(profileFor('concrete'))[0].length > 5 * makeImpulse(profileFor('soft'))[0].length);
});

test('bright tail keeps more high frequencies than soft', () => {
  const hf = (z) => { const d = makeImpulse(profileFor(z), R.irRate, 1)[0]; let s = 0, t = 0; for (let i = 1; i < d.length; i++) { s += (d[i] - d[i - 1]) ** 2; t += d[i] ** 2; } return s / t; };
  assert.ok(hf('bright') > hf('soft') * 1.3);
});

test('courtyard impulse has distinct slap taps', () => {
  const p = profileFor('courtyard'), d = makeImpulse(p, R.irRate, 1)[0], j = Math.floor(0.095 * R.irRate);
  const around = d.slice(j - 40, j - 10).reduce((m, v) => Math.max(m, Math.abs(v)), 0), tap = d.slice(j, j + 6).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(tap > 3 * around);
});

test('crossfade plan: idle slot loaded, previous slot fades, no reload on return', () => {
  let r = planZone(initialPlan(), 'soft');
  assert.deepEqual(r.load, { slot: 1, zone: 'soft' }); assert.equal(r.gains[1], profileFor('soft').wet); assert.equal(r.gains[0], 0);
  r = planZone(r.state, 'concrete');
  assert.deepEqual(r.load, { slot: 0, zone: 'concrete' }); assert.equal(r.gains[1], 0); assert.equal(r.gains[0], profileFor('concrete').wet);
  const same = planZone(r.state, 'concrete'); assert.equal(same.load, null); assert.equal(same.state, r.state);
  r = planZone(r.state, 'soft'); assert.equal(r.load, null, 'soft is still held by the idle slot'); assert.equal(r.gains[1], profileFor('soft').wet);
  r = planZone(r.state, 'open'); assert.deepEqual(r.gains, [0, 0]); assert.equal(r.load, null);
  r = planZone(r.state, 'soft'); assert.equal(r.load, null, 'back from open: buffer still there'); assert.ok(r.gains[1] > 0);
});

test('lowMemory: a single short convolver, zone changes only level and buffer', () => {
  let r = planZone(initialPlan(), 'concrete', true);
  assert.deepEqual(r.load, { slot: 0, zone: 'concrete' }); assert.equal(r.gains[1], 0); assert.ok(r.gains[0] <= R.lowMemory.wetCap);
  r = planZone(r.state, 'open', true); assert.equal(r.load, null); assert.equal(r.gains[0], 0);
  assert.ok(makeImpulse(profileFor('concrete', true), R.irRate, 1)[0].length < R.irRate * 0.7);
});
