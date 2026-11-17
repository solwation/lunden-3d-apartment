// #2031: facial expressions, headless (three resolver needed). node --test tools/avatarexprtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newFace, faceGoal, stepFace, flinchFace, updateFace, flinch } from '../src/avatarface.js';
import { Avatar } from '../src/avatar.js';
import { AVATAR_EXPR as X, avatarLook } from '../src/config.js';

test('#2031 cues map to the three expressions; a grimace mutes the others', () => {
  assert.deepEqual(faceGoal({}), { smile: 0, surprise: 0, grimace: 0 });
  assert.equal(faceGoal({ wave: true }).smile, X.cues.wave);
  assert.equal(faceGoal({ hug: 1 }).smile, X.cues.hug);
  assert.equal(faceGoal({ react: 'laugh' }).smile, X.cues.laugh);
  assert.equal(faceGoal({ react: 'scream' }).surprise, X.cues.scream);
  assert.equal(faceGoal({ react: 'cry' }).grimace, X.cues.cry);
  assert.equal(faceGoal({ gym: 1 }).grimace, X.cues.gym);
  assert.equal(faceGoal({ run: 0.5 }).grimace, 0.5 * X.cues.run);
  const hit = faceGoal({ hug: 1 }, 0.3);
  assert.equal(hit.grimace, X.cues.hit); assert.equal(hit.smile, 0);
});

test('#2031 weights ease in and out without jumps and return to exactly neutral', () => {
  const s = newFace(); let prev = { ...s }, max = 0;
  const cue = (t) => (t < 2 ? { wave: true } : t < 3 ? { react: 'scream' } : {});
  for (let f = 0; f < 60 * 8; f++) {
    if (f === 60 * 4) flinchFace(s);
    stepFace(s, 1 / 60, cue(f / 60));
    for (const k of ['smile', 'surprise', 'grimace']) { assert(s[k] >= 0 && s[k] <= 1); max = Math.max(max, Math.abs(s[k] - prev[k])); }
    prev = { ...s };
  }
  assert(max <= X.rise / 60 + 1e-9, `largest frame step ${max}`);
  assert.deepEqual([s.smile, s.surprise, s.grimace], [0, 0, 0]);
  // a long frame or a bad dt never overshoots
  const t = newFace(); stepFace(t, 5, { hug: 1 }); assert(t.smile <= 1 && t.smile > 0.8); stepFace(t, NaN, {}); stepFace(t, -1, {}); assert(t.smile > 0.8);
});

test('#2031 the avatar material carries uExpr and its shader splices the expression after the face shape, before skinning', () => {
  const a = new Avatar(avatarLook('expr'));
  const u = a.material.userData.u;
  assert(u.uExpr?.value instanceof THREE.Vector3);
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  a.material.onBeforeCompile(sh);
  const vs = sh.vertexShader;
  assert(sh.uniforms.uExpr === u.uExpr);
  assert.match(vs, /uniform vec3 uExpr;/);
  const at = vs.indexOf('// #2031'), face = vs.indexOf('#2011: a blink'), morph = vs.indexOf('#include <morphtarget_vertex>'), project = vs.indexOf('#include <project_vertex>');
  assert(face > 0 && morph > face && at > morph && project > at, 'after the face shape and morph targets, before projection');
  assert.match(vs.slice(at, project), /skin/i, 'the skinning follows the expression');
  assert.match(a.material.customProgramCacheKey(), /expr2031/);
  // the hooks: a hit and the per-frame cue update reach the uniform; no face state before the first one
  updateFace(a, 1 / 60, { hug: 1 }); assert(u.uExpr.value.x > 0);
  flinch(a); for (let i = 0; i < 30; i++) updateFace(a, 1 / 60, { hug: 1 });
  assert(u.uExpr.value.z > 0.9 && u.uExpr.value.x < 0.2, `hit: ${u.uExpr.value.toArray()}`);
  flinch(null); updateFace(null, 1, {}); // harmless without an avatar
});
