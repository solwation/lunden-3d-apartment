// #2014: secondary motion of long hair, the bun and the sweater hem. Pure helpers (no three.js, headless-testable; numbers AVATAR_SWAY in config.js).
// One damped spring per group, in the frame of the bone it hangs from. The drivers come from the rendered pose itself: the bone's world matrix
// gives its acceleration and yaw rate (finite differences, low-passed), so every player's hair moves locally without a network field.
import { AVATAR_SWAY as S } from './config.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A fresh group spring: offset `p` and velocity `v` ([x, y, z] m, m/s) in the bone's frame. */
const spring = () => ({ p: [0, 0, 0], v: [0, 0, 0] });
/** A fresh sway state for one avatar: the three groups and the previous sample of each bone ('head', 'torso'). */
export const newSway = () => ({ hair: spring(), bun: spring(), hem: spring(), head: null, torso: null });

/** One bone's drive from its world matrix `e` (Matrix4 elements, column-major) at time step `dt`: its acceleration in its own axes `a` (m/s², low-passed,
 * capped) and yaw acceleration `alpha` (rad/s²). The first sample, a teleport or a long gap resets the history and drives nothing. */
export function drive(h, e, dt) {
  const len = (i) => Math.hypot(e[i], e[i + 1], e[i + 2]) || 1;
  const ax = [e[0] / len(0), e[1] / len(0), e[2] / len(0)], ay = [e[4] / len(4), e[5] / len(4), e[6] / len(4)], az = [e[8] / len(8), e[9] / len(8), e[10] / len(8)];
  const pos = [e[12], e[13], e[14]], yaw = Math.atan2(az[0], az[2]);
  const out = h.out ??= { a: [0, 0, 0], alpha: 0 };
  out.a[0] = out.a[1] = out.a[2] = out.alpha = 0;
  if (!h.pos || dt <= 0 || dt > S.maxDt * 4 || Math.hypot(pos[0] - h.pos[0], pos[1] - h.pos[1], pos[2] - h.pos[2]) > S.resetDistance) {
    h.vel = [0, 0, 0]; h.accel = [0, 0, 0]; h.rate = 0; h.alpha = 0; h.has = false;
  } else {
    const v = [(pos[0] - h.pos[0]) / dt, (pos[1] - h.pos[1]) / dt, (pos[2] - h.pos[2]) / dt], rate = wrap(yaw - h.yaw) / dt;
    if (h.has) {
      const k = 1 - Math.exp(-dt / S.accelFilter);
      for (let i = 0; i < 3; i++) h.accel[i] += ((v[i] - h.vel[i]) / dt - h.accel[i]) * k;
      h.alpha += ((rate - h.rate) / dt - h.alpha) * k;
    }
    h.vel = v; h.rate = rate; h.has = true;
    const world = h.accel;
    for (const [i, ax_] of [ax, ay, az].entries()) out.a[i] = clamp(world[0] * ax_[0] + world[1] * ax_[1] + world[2] * ax_[2], -S.accelMax, S.accelMax);
    out.alpha = clamp(h.alpha, -S.accelMax * 3, S.accelMax * 3);
  }
  h.pos = pos; h.yaw = yaw;
  return out;
}

/** Advances one group spring by `dt` under the drive (`a` in the bone's axes, `alpha` yaw acceleration). The offset relaxes to −gain·a/ω² and
 * overshoots by its damping; it is held between the group's walls (min/max) with the velocity into a wall removed, so hair stops at the neck,
 * shoulders and head instead of passing through. Fixed sub-steps keep the integration stable for any frame time.
 * #2110 `push` ([x, y, z] m, bone frame, optional): a target the spring relaxes to on top of that (the outdoor wind, src/avatarwind.js). */
export function stepSpring(s, G, dt, a, alpha, push = null) {
  dt = Math.min(dt, S.maxDt);
  const n = Math.max(1, Math.ceil(dt / S.step)), h = dt / n, w2 = G.omega * G.omega, c = 2 * G.zeta * G.omega;
  // a head that accelerates forward leaves the hair behind (−a); turning left drags a point behind it to the right: +x of the pseudo-force is +alpha·r
  const f = [G.gain * (-a[0] + alpha * G.r), G.gain * -a[1], G.gain * -a[2]];
  if (push) for (let i = 0; i < 3; i++) f[i] += w2 * push[i];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) {
    s.v[i] += (-w2 * s.p[i] - c * s.v[i] + f[i]) * h;
    s.p[i] += s.v[i] * h;
    if (s.p[i] < G.min[i]) { s.p[i] = G.min[i]; if (s.v[i] < 0) s.v[i] = 0; }
    else if (s.p[i] > G.max[i]) { s.p[i] = G.max[i]; if (s.v[i] > 0) s.v[i] = 0; }
  }
  return s;
}

/** Steps all three groups from the head's and the torso's world matrix elements. True while anything still moves.
 * `wind` (#2110, optional): src/avatarwind.js' state, whose per-group targets the springs swing round. */
export function stepSway(sw, dt, headE, torsoE, wind = null) {
  sw.head ??= {}; sw.torso ??= {};
  const hd = drive(sw.head, headE, dt), td = drive(sw.torso, torsoE, dt);
  stepSpring(sw.hair, S.hair, dt, hd.a, hd.alpha, wind?.hair);
  stepSpring(sw.bun, S.bun, dt, hd.a, hd.alpha, wind?.bun);
  stepSpring(sw.hem, S.hem, dt, td.a, td.alpha, wind?.hem);
  return true;
}

/** Vertex-shader declarations: the three offsets (the bone's own frame, bind pose) and which groups this look has (x hair, y bun, z hem). */
export const SWAY_DECL = 'uniform vec3 uSwayHair, uSwayBun, uSwayHem, uSwayOn;';

/** Vertex-shader code, run after the face shape on `transformed` (bind pose): the hair curtain below its hairline swings from the scalp with a weight
 * that grows with depth, the bun as a whole, the torso garment's hem from the waist down (only vertices skinned wholly to the torso: sleeves stay).
 * `g`: { head [x, y, z] bind position, hairY (hair centre height), bun [y, z] offset from the head, torsoY, torso (bone index), hat (uniform name) }. */
export function swayGLSL(g) {
  const f = (v) => v.toFixed(4);
  return `
#ifdef USE_SKINNING
if (facePart > 0.5 && abs(facePart - ${g.hair}.0) < 0.5) {
  float sy = transformed.y - ${f(g.head[1] + g.hairY)}, sw = pow(clamp(-sy / ${f(S.hairDepth)}, 0.0, 1.0), 1.6) * (1.0 - step(0.5, ${g.hat}));
  vec3 bc = vec3(${f(g.head[0])}, ${f(g.head[1] + g.bun[0])}, ${f(g.head[2] + g.bun[1])});
  float bw = 1.0 - smoothstep(${f(S.bunRadius[0])}, ${f(S.bunRadius[1])}, distance(transformed, bc));
  // only away from the body: the sway is a flare along the outward direction (from the head's axis, resp. the bun's centre), so hair lying on the
  // neck, shoulders and back never goes into them (no z-fighting, no spikes)
  vec2 hn = normalize(transformed.xz - vec2(${f(g.head[0])}, ${f(g.head[2])}) + vec2(0.0, -0.0001)), bn = normalize(transformed.xz - bc.xz + vec2(0.0, -0.0001));
  vec3 hs = uSwayHair * sw * uSwayOn.x, bs = uSwayBun * bw * uSwayOn.y;
  transformed.xz += hn * max(0.0, dot(hn, hs.xz)) + bn * max(0.0, dot(bn, bs.xz));
  transformed.y += max(0.0, hs.y) + max(0.0, bs.y);
}
if (region > 0.5 && region < 1.5 && int(skinIndex.x + 0.5) == ${g.torso} && skinWeight.x > 0.99) {
  vec2 en = normalize(transformed.xz + vec2(0.0, 0.0001));
  float hw = (1.0 - smoothstep(${f(S.hemFade[0])}, ${f(S.hemFade[1])}, transformed.y - ${f(g.torsoY)})) * uSwayOn.z; // (a flare: only outward, so the hem never goes into the trousers)
  transformed.xz += en * max(0.0, dot(en, uSwayHem.xz)) * hw;
}
#endif`;
}
