// #2033: the eyes' pupil and glint light, headless. node --test tools/avatareyestest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pupilScale, eyeLight, stepPupil, EyeLight, eyeAt, eyeGlint, eyeWet, eyeView, eyePupil } from '../src/avatareyes.js';
import { AvatarLight } from '../src/avatarlight.js';
import { AVATAR_EYES as E } from '../src/config.js';

const day = { day: 1, overcast: 0 }, night = { day: 0, overcast: 0 };

test('#2033 the pupil is small in open sun, large in a dark room, monotone in between', () => {
  const sun = pupilScale(eyeLight({ kind: 'outdoors' }, day).level), dark = pupilScale(eyeLight({ kind: 'room', lit: 0 }, night).level);
  assert.equal(sun, E.pupil.bright[1]);
  assert.ok(dark > 1.3 && dark <= E.pupil.dark[1], `dark ${dark}`);
  let last = Infinity;
  for (const l of [0.01, 0.05, 0.1, 0.2, 0.4, 0.7, 1, 2]) { const s = pupilScale(l); assert.ok(s <= last + 1e-9); last = s; }
  const shade = pupilScale(eyeLight({ kind: 'outdoors', shade: true }, day).level);
  assert.ok(shade > sun && shade < dark);
});

test('#2033 the sun glint shows in open sun only, dimmed by cloud', () => {
  assert.equal(eyeLight({ kind: 'outdoors' }, day).sun, 1);
  assert.equal(eyeLight({ kind: 'outdoors', shade: true }, day).sun, 0);
  assert.equal(eyeLight({ kind: 'room', lit: 1 }, day).sun, 0);
  assert.equal(eyeLight({ kind: 'outdoors' }, night).sun, 0);
  assert.ok(eyeLight({ kind: 'outdoors' }, { day: 1, overcast: 1 }).sun < 0.3);
});

test('#2033 the pupil narrows faster than it widens', () => {
  const narrow = stepPupil(1.4, 0.7, 0.25), widen = stepPupil(0.7, 1.4, 0.25);
  assert.ok(1.4 - narrow > widen - 0.7);
  assert.equal(stepPupil(undefined, 0.9, 0.1), 0.9);
  let p = 0.7; for (let i = 0; i < 600; i++) p = stepPupil(p, 1.4, 1 / 60);
  assert.ok(Math.abs(p - 1.4) < 0.02);
});

test('#2033 AvatarLight feeds the eyes; no reading keeps plain eyes', () => {
  const calls = [], avatar = { setLight: () => {}, setEyeLight: (z, e) => calls.push([z, e]) };
  const L = new AvatarLight(); L.zone = () => ({ kind: 'outdoors' }); L.env = () => day; L.lights = null;
  L.apply(avatar, {}, 0, 0, 0, 0);
  assert.equal(calls.length, 1); assert.equal(calls[0][0].kind, 'outdoors');
  const u = { uEyeLit: { value: { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } } };
  const eyes = new EyeLight(); eyes.step(u, 0.016);
  assert.deepEqual([u.uEyeLit.value.x, u.uEyeLit.value.y], [1, 1]);
  eyes.set(...calls[0]); eyes.step(u, 0.016);
  assert.deepEqual([u.uEyeLit.value.x, u.uEyeLit.value.y], [E.pupil.bright[1], 1]);
  assert.doesNotThrow(() => new AvatarLight().apply({ setLight() {} }, {}, 0, 0, 0, 0)); // an avatar without eyes (older callers)
  const L2 = new AvatarLight(); L2.zone = L.zone; L2.env = L.env; assert.doesNotThrow(() => L2.apply({ setLight() {} }, {}, 0, 0, 0, 0));
});

test('#2033 the GLSL pieces are self-contained', () => {
  for (const s of [eyeAt(), eyeView(), eyeWet(3, 26), eyeGlint(3, 26), eyePupil(26)]) {
    assert.ok(!/NaN|undefined|Infinity/.test(s), s);
    assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  }
  assert.match(eyeGlint(3, 26), /directionalLights\[i\]\.direction/);
});
