// #2184: Olof's car lights (src/carlights.js). Function-level: the lamp targets from night/speed/braking/reversing, the
// easing, and the one merged decal (single mesh, hidden unless a group is lit, colours follow the levels).
// node --test tools/carlightstest.mjs (three resolvable as 'three').
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => ((t[p] = v), true) }) }) };
const { lampTargets, easeLamp, buildCarGlow, buildReverseLamps } = await import('../src/carlights.js');
const { CAR_LIGHTS: K } = await import('../src/config.js');
const base = { night: true, driving: true, speed: 9, decel: 0, reversing: false };

test('night driving: beam on, no brake, no reverse', () => {
  const t = lampTargets(base);
  assert.deepEqual([t.head, t.brake, t.reverse], [1, 0, 0]);
});
test('daylight or standing: no beam', () => {
  assert.equal(lampTargets({ ...base, night: false }).head, 0);
  assert.equal(lampTargets({ ...base, driving: false, speed: 0 }).head, 0);
});
test('braking: slowing harder than the threshold, or held at a stop while on its way', () => {
  assert.equal(lampTargets({ ...base, decel: K.brakeDecel + 0.5 }).brake, 1);
  assert.equal(lampTargets({ ...base, decel: K.brakeDecel - 0.1 }).brake, 0);
  assert.equal(lampTargets({ ...base, speed: 0 }).brake, 1);
  assert.equal(lampTargets({ ...base, driving: false, speed: 0 }).brake, 0, 'parked: no brake lamps');
});
test('reversing lights only while driving and reversing; also by day', () => {
  assert.equal(lampTargets({ ...base, reversing: true, speed: 1 }).reverse, 1);
  assert.equal(lampTargets({ ...base, reversing: true, night: false, speed: 1 }).reverse, 1);
  assert.equal(lampTargets({ ...base, reversing: true, driving: false }).reverse, 0);
});
test('tail level by night / day', () => {
  assert.equal(lampTargets(base).tail, K.tailNight);
  assert.equal(lampTargets({ ...base, night: false }).tail, K.tailDay);
});
test('easing: fast on, slower off, clamped, no overshoot', () => {
  assert.ok(easeLamp(0, 1, K.fadeOn / 2) - 0.5 < 1e-9);
  assert.equal(easeLamp(0.99, 1, 1), 1);
  assert.ok(Math.abs(easeLamp(1, 0, K.fadeOff / 2) - 0.5) < 1e-9);
  assert.equal(easeLamp(0.3, 0.3, 1), 0.3);
});
test('the decal is one hidden mesh until a group is lit, colours follow the levels', () => {
  const { mesh, set } = buildCarGlow(4.2);
  assert.equal(mesh.isMesh, true);
  assert.equal(mesh.visible, false);
  set({ head: 0, brake: 0, reverse: 0 }); assert.equal(mesh.visible, false);
  set({ head: 0, brake: 1, reverse: 0 }); assert.equal(mesh.visible, true);
  const c = mesh.geometry.attributes.color, lit = [];
  for (let i = 0; i < c.count; i++) if (c.getX(i) + c.getY(i) + c.getZ(i) > 0) lit.push([c.getX(i), c.getY(i), c.getZ(i)]);
  assert.ok(lit.length > 0 && lit.every(([r, g, b]) => r > g && r > b), 'braking lights only the red pool');
  const xs = mesh.geometry.attributes.position; let behind = true;
  for (let i = 0; i < c.count; i++) if (c.getX(i) > 0 && xs.getX(i) > 0) behind = false;
  assert.ok(behind, 'the red pool lies behind the car');
  set({ head: 1, brake: 0, reverse: 1 });
  let front = 0; for (let i = 0; i < c.count; i++) if (xs.getX(i) > 2.1 && c.getX(i) > 0) front++;
  assert.ok(front > 0, 'the beam reaches forward of the nose');
});
test('reverse lamps: a hidden mesh of two lenses', () => {
  const m = buildReverseLamps(4.2); assert.equal(m.visible, false); assert.ok(m.geometry.attributes.position.count >= 48);
});
