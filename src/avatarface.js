// #2031: facial expressions – a smile, surprise (raised brows) and a grimace – as vertex offsets in the avatars' own shader.
// The three weights (`smile`, `surprise`, `grimace`, 0 … 1) are derived locally from what a figure already does (a greeting wave,
// a hug, a kiss, a BIO reaction, a hit, gym work, running); nothing is sent, no new mesh, texture or draw call. Pure helpers
// (headless-testable) plus the GLSL that avatar.js splices in after its face shape. Numbers: AVATAR_EXPR in config.js.
import * as THREE from 'three';
import { AVATAR_EXPR as X } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** A fresh, neutral face. */
export const newFace = () => ({ smile: 0, surprise: 0, grimace: 0, flinch: 0 });

/** The goal weights for the figure's current `cues`: { wave, hug, kiss (0 … 1 or booleans), react ('cry' | 'laugh' | 'scream' | null),
 * gym (0 … 1: the effort of a rep), run (0 … 1) } and a running `flinch` (s left of a hit). A grimace mutes the smile and the surprise. */
export function faceGoal(cues = {}, flinch = 0) {
  const C = X.cues, r = cues.react;
  let smile = Math.max(clamp01(cues.wave) * C.wave, clamp01(cues.hug) * C.hug, clamp01(cues.kiss) * C.kiss, r === 'laugh' ? C.laugh : 0);
  let surprise = r === 'scream' ? C.scream : 0;
  const grimace = Math.max(flinch > 0 ? C.hit : 0, r === 'cry' ? C.cry : 0, clamp01(cues.gym) * C.gym, clamp01(cues.run) * C.run);
  smile *= 1 - grimace; surprise *= 1 - grimace;
  return { smile, surprise, grimace };
}

/** Advances face `s` by `dt` s towards the goal of `cues`: each weight eases in at AVATAR_EXPR.rise and out at .fall (1/s). */
export function stepFace(s, dt, cues) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), 0.25);
  if (!(dt > 0)) return s;
  const g = faceGoal(cues, s.flinch);
  s.flinch = Math.max(0, s.flinch - dt);
  for (const k of ['smile', 'surprise', 'grimace']) {
    const rate = g[k] > s[k] ? X.rise : X.fall;
    s[k] += (g[k] - s[k]) * (1 - Math.exp(-rate * dt));
    if (s[k] < 1e-3 && g[k] === 0) s[k] = 0;
  }
  return s;
}

/** A hit: the face grimaces for AVATAR_EXPR.flinch s (then eases back). */
export function flinchFace(s) { s.flinch = X.flinch; return s; }

/** The avatar's expression uniform (added to its material's uniforms). */
export const faceExprUniforms = () => ({ uExpr: { value: new THREE.Vector3() } });

/** Once per frame for a posed avatar (Ghost.animate): steps its face from `cues` and sets the uniform. */
export function updateFace(avatar, dt, cues) {
  const u = avatar?.material?.userData.u;
  if (!u?.uExpr) return;
  const s = avatar.face ??= newFace();
  stepFace(s, dt, cues);
  u.uExpr.value.set(s.smile, s.surprise, s.grimace);
}

/** The figure was hit (src/combat.js): a short grimace. */
export function flinch(avatar) { if (avatar) flinchFace(avatar.face ??= newFace()); }

const f = (v) => Number(v).toFixed(5);
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
/** Splices the expression into an avatar vertex shader `vs`: the declaration after <common>, the offsets after <morphtarget_vertex>
 * (after the face shape, sway, kiss and talking mouth, before skinning). `hb` the head bone's bind position, `chinY` the head-local
 * height its length scales from (avatar.js CHIN_Y), `P` FACE_PART. Only the face's skin, eyes, nose, brows and lips / beard move
 * (hair, glasses, hats and earrings stay put); nothing under the Spider-Man mask. */
export function faceExprShader(vs, { hb, chinY, P }) {
  const [cx, cy, csx, csy] = X.corner, [kx, ky, ksx, ksy] = X.cheek, [b0, b1, b2, b3] = X.band, H = v3([hb.x, hb.y, hb.z]);
  const isEye = `abs(facePart - ${P.eye}.0) < 0.5 || abs(facePart - ${P.iris}.0) < 0.5`;
  const body = `
  if (uSuit < 0.5 && uExpr.x + uExpr.y + uExpr.z > 0.0005 && (abs(facePart - ${P.head}.0) < 0.5 || ${isEye} || abs(facePart - ${P.nose}.0) < 0.5 || abs(facePart - ${P.brow}.0) < 0.5 || abs(facePart - ${P.cowlHide}.0) < 0.5)) { // #2031
    vec3 q = position - ${H};
    float ax = abs(q.x), front = smoothstep(${f(X.front[0])}, ${f(X.front[1])}, q.z), out1 = q.x / ${f(cx)};
    float wc = exp(-pow((ax - ${f(cx)}) / ${f(csx)}, 2.0) - pow((q.y - ${f(cy)}) / ${f(csy)}, 2.0)) * front;
    float wk = exp(-pow((ax - ${f(kx)}) / ${f(ksx)}, 2.0) - pow((q.y - ${f(ky)}) / ${f(ksy)}, 2.0)) * front;
    float wb = smoothstep(${f(b0)}, ${f(b1)}, q.y) * (1.0 - smoothstep(${f(b2)}, ${f(b3)}, q.y)) * front;
    float arch = exp(-pow((ax - ${f(X.arch[0])}) / ${f(X.arch[1])}, 2.0)), inner = 1.0 - smoothstep(${f(X.inner[0])}, ${f(X.inner[1])}, ax);
    float sm = uExpr.x * (1.0 - uKiss), su = uExpr.y, gr = uExpr.z;
    vec3 c = sm * ${v3(X.smile)} + su * ${v3(X.surprise)} + gr * ${v3(X.grimace)};
    vec3 d = wc * vec3(c.x * out1, c.y, c.z);
    d.y += wk * dot(uExpr, ${v3(X.cheekLift)}); d.z += wk * uExpr.x * ${f(X.cheekPuff)};
    d.y += wb * (su * ${f(X.browUp)} * arch - gr * ${f(X.browDown)} * (0.4 + 0.6 * inner));
    d.x -= wb * gr * ${f(X.browIn)} * inner * q.x;
    transformed += d;
    transformed.y -= su * mouth * ${f(X.jaw)};
    if (${isEye}) { // squint / widen about the eye's centre where the face shape put it (head length, neck)
      float ey = ${f(hb.y + chinY)} + (faceAnchor.y - ${f(hb.y + chinY)}) * uHead.y + uNeck + d.y;
      transformed.y = ey + (transformed.y - ey) * (1.0 - dot(uExpr, ${v3(X.squint)})) * (1.0 + su * ${f(X.widen)});
    }
  }`;
  return vs.replace('#include <common>', '#include <common>\nuniform vec3 uExpr;')
    .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>' + body);
}
