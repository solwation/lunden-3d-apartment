// #2017: the avatars' light level, headless. node --test tools/avatarlighttest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneLevel, zoneLevel, lightFactor, approach, AvatarLight } from '../src/avatarlight.js';
import { AVATAR_LIGHT as C } from '../src/config.js';

const L = (hemi, ambient, fill, sun) => ({ hemi: { intensity: hemi }, ambient: { intensity: ambient }, fill: { intensity: fill }, sun: { intensity: sun } });
const clearDay = L(1.5, 0.25, 0.35, 3.0), night = L(0.05, 0.025, 0, 0.2);
const day = { day: 1, overcast: 0 }, dark = { day: 0, overcast: 0 };

test('#2017 scene level: a clear day is about 1, night is near 0', () => {
  assert.ok(Math.abs(sceneLevel(clearDay) - 1) < 0.15);
  assert.ok(sceneLevel(night) < 0.1);
});

test('#2017 sun is brighter than shade, a room by day dimmer than outdoors, the stairwell dim, a lit room at night above a dark one', () => {
  const s = zoneLevel({ kind: 'outdoors' }, day), sh = zoneLevel({ kind: 'outdoors', shade: true }, day);
  assert.ok(s > sh && sh > 0.4);
  assert.ok(zoneLevel({ kind: 'room', lit: 0 }, day) < s);
  assert.ok(zoneLevel({ kind: 'room', lit: 1 }, dark) > zoneLevel({ kind: 'room', lit: 0 }, dark));
  assert.ok(zoneLevel({ kind: 'core' }, day) < 0.6);
  assert.ok(zoneLevel({ kind: 'outdoors' }, dark) < 0.2);
});

test('#2017 factor: dimmed in a room / stairwell / shade under a sunny scene, ~1 in the sun, bounded, never NaN', () => {
  const sc = sceneLevel(clearDay);
  assert.ok(Math.abs(lightFactor({ kind: 'outdoors' }, day, sc) - 1) < 0.2);
  assert.ok(lightFactor({ kind: 'core' }, day, sc) < 0.6);
  assert.ok(lightFactor({ kind: 'room', lit: 0 }, day, sc) < 0.8);
  assert.ok(lightFactor({ kind: 'outdoors', shade: true }, day, sc) < 0.8);
  for (const z of [{ kind: 'garage' }, { kind: 'playroom', lit: 0 }, null, {}]) for (const s of [0, 0.05, 1, 2]) {
    const f = lightFactor(z, dark, s); assert.ok(f >= C.min && f <= C.max);
  }
  assert.equal(lightFactor({ kind: 'outdoors' }, dark, sceneLevel(night)) >= C.min, true);
});

test('#2017 smoothing: snaps first, then eases frame-rate independently, no overshoot', () => {
  assert.equal(approach(undefined, 0.6, 0.016), 0.6);
  let a = 1, b = 1;
  for (let i = 0; i < 60; i++) a = approach(a, 0.5, 1 / 60);
  for (let i = 0; i < 30; i++) b = approach(b, 0.5, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9 && a > 0.5 && a < 1);
  for (let i = 0; i < 600; i++) a = approach(a, 0.5, 1 / 60);
  assert.ok(Math.abs(a - 0.5) < 1e-3);
});

test('#2017 AvatarLight: probes the zone at C.probe, sets the avatar factor', () => {
  const al = new AvatarLight(); let probes = 0; const got = [];
  al.lights = clearDay; al.env = () => day; al.zone = () => { probes++; return { kind: 'core' }; };
  const avatar = { setLight: (f) => got.push(f) }, st = {};
  for (let i = 0; i < 30; i++) al.apply(avatar, st, 1, 0, 1, 1000 + i * 16);
  assert.equal(probes, 2); // first, then after C.probe s (30 frames of 16 ms = 0.48 s)
  assert.ok(got[0] < 0.6 && got.every((f) => f >= C.min));
  assert.equal(new AvatarLight().apply(avatar, {}, 0, 0, 0, 0), 1); // not wired: unchanged
});
