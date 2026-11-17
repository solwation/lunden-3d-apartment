// #2037: exertion (flush / sweat sheen), the breathing rhythm and the shared breath-puff pool, headless. node --test tools/avatarbreathtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newBreath, effortOf, coldness, breathRate, stepBreath, exertUniforms, exertShader, updateBreath, BreathPuffs } from '../src/avatarbreath.js';
import { wetEnv } from '../src/avatarweather.js';
import { AVATAR_BREATH as B } from '../src/config.js';

const run = (s, secs, effort, dt = 1 / 30) => { let n = 0; for (let t = 0; t < secs - 1e-9; t += dt) n += stepBreath(s, dt, effort); return n; };

test('#2037 effort reuses the face cues: running and a gym pose count, walking does not', () => {
  assert.equal(effortOf({ run: 0, gym: 0 }), 0);
  assert.equal(effortOf({ run: 1 }), 1);
  assert.equal(effortOf({ run: 0.4 }), 0.4);
  assert.equal(effortOf({ gym: 1 }), B.gym);
  assert.equal(effortOf({}), 0);
});

test('#2037 cold: none in mild weather, full in frost, at least snowMin while it snows', () => {
  assert.equal(coldness(15, null), 0);
  assert.equal(coldness(B.warm, 'rain'), 0);
  assert.equal(coldness(B.cold - 2, null), 1);
  assert(coldness(0, null) > 0.3 && coldness(0, null) < 0.7);
  assert(coldness(2, 'snow') >= B.snowMin);
});

test('#2037 a short dash does not flush, a long sprint does and it fades over about a minute', () => {
  const short = newBreath(0); run(short, 6, 1);
  assert.equal(short.flush, 0, `${short.flush}`);
  const s = newBreath(0); run(s, 35, 1);
  assert(s.flush > 0.9 && s.sheen > 0.6, `${s.flush} ${s.sheen}`);
  run(s, 20, 0); assert(s.flush > 0.3, `still flushed after 20 s: ${s.flush}`);
  run(s, 40, 0); assert(s.flush < 0.1, `mostly gone after 60 s: ${s.flush}`);
  run(s, 30, 0); assert.equal(s.flush, 0); assert.equal(s.sheen, 0); assert.equal(s.heat, 0);
  const g = newBreath(0); run(g, 60, effortOf({ gym: 1 })); assert(g.flush > 0.9, 'a gym session flushes too');
});

test('#2037 breathing: about 15 breaths a minute at rest, about three times faster running, and still fast just after', () => {
  const rest = run(newBreath(0), 60, 0), hard = run(newBreath(0), 60, 1);
  assert(rest >= 14 && rest <= 16, `${rest}`);
  assert(hard >= 44 && hard <= 50, `${hard}`);
  const s = newBreath(0); run(s, 40, 1);
  assert(breathRate(0, s.heat) > breathRate(0, 0) * 2);
  const t = newBreath(0.2); stepBreath(t, -1, 1); stepBreath(t, NaN, 1); assert.deepEqual(t, newBreath(0.2));
});

const fakeAvatar = () => {
  const head = new THREE.Object3D(); head.position.set(0, 1.54, 0); head.updateMatrixWorld(true);
  return { material: { userData: { u: { ...exertUniforms(), uLight: { value: 1 } } } }, bones: { head } };
};

test('#2037 puffs only for a figure outdoors in the cold; the uniform carries flush / sheen everywhere', () => {
  const pool = new BreathPuffs(null), fig = {};
  const breathe = (env, outdoors, figure = fig, secs = 20, cues = { run: 0 }) => {
    Object.assign(wetEnv, env, { outdoorAt: () => outdoors });
    const a = fakeAvatar(); pool.list.length = 0;
    for (let t = 0; t < secs; t += 1 / 30) updateBreath(a, 1 / 30, cues, figure, pool);
    return a;
  };
  assert(breathe({ temp: -5, kind: null }, true).breath.puffs >= 4, 'frost outdoors');
  assert(breathe({ temp: 1, kind: 'snow' }, true).breath.puffs >= 4, 'snowfall');
  assert.equal(breathe({ temp: -5, kind: null }, false).breath.puffs, 0, 'indoors');
  assert.equal(breathe({ temp: 18, kind: null }, true).breath.puffs, 0, 'warm');
  assert.equal(breathe({ temp: -5, kind: null }, true, null).breath.puffs, 0, 'our own mirror image');
  const runner = breathe({ temp: -5, kind: null }, true, fig, 20, { run: 1 }), walker = breathe({ temp: -5, kind: null }, true, fig, 20, { run: 0 });
  assert(runner.breath.puffs > walker.breath.puffs * 2, 'denser while running');
  const hot = breathe({ temp: 20, kind: null }, false, fig, 40, { run: 1 });
  assert(hot.material.userData.u.uExert.value.x > 0.8 && hot.material.userData.u.uExert.value.y > 0.3, 'flush indoors too');
  wetEnv.outdoorAt = () => false; wetEnv.temp = 10; wetEnv.kind = null;
});

test('#2037 the shared pool: one Points object, drifts forward from the mouth, fades, hides when empty, capped', () => {
  const parent = new THREE.Group(), pool = new BreathPuffs(parent, null, 8);
  assert.equal(parent.children.length, 1); assert(pool.points.isPoints);
  pool.update(1 / 60); assert.equal(pool.points.visible, false);
  pool.emit(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, 1), 0.3, 0);
  pool.update(1 / 60);
  assert.equal(pool.points.visible, true); assert.equal(pool.points.geometry.drawRange.count, 1);
  for (let i = 0; i < 30; i++) pool.update(1 / 60);
  const p = pool.list[0]; assert(p.z > 0.1 && p.y > 1.6, `${p.z} ${p.y}`);
  assert(pool.data.array[1] > 0 && pool.data.array[1] <= 0.3);
  for (let i = 0; i < 20; i++) pool.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0.3, 1);
  pool.update(1 / 60); assert.equal(pool.n, 8);
  for (let i = 0; i < 200; i++) pool.update(1 / 60);
  assert.equal(pool.n, 0); assert.equal(pool.points.visible, false);
  pool.dispose(); assert.equal(parent.children.length, 0);
});

test('#2037 the shader hook: uniform after <common>, the change before <normal_fragment_begin>, bare skin only', () => {
  const fs = '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <normal_fragment_begin>\n}';
  const out = exertShader(fs, { head: new THREE.Vector3(0, 1.54, 0) });
  assert(out.includes('uniform vec2 uExert;'));
  assert(out.indexOf('#2037') < out.indexOf('#include <normal_fragment_begin>'));
  assert(/vBare > 0\.5 && uSuit < 0\.5/.test(out));
  assert.equal(out.match(/#include <normal_fragment_begin>/g).length, 1);
});
