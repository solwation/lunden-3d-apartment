// #2157: the skirt / dress skinning (src/avatarskirt.js). The skirt is skinned with linear blend skinning between the hips and both
// thighs (the shader's skinning, re-done here on plain arrays: hips fixed, each thigh rotated about its hip joint), with the drape the
// vertex shader applies before skinning. In every pose of the list — standing, a walking / running stride, sitting, a squat, the bicycle's
// pedal stroke, the swimming kick, the gym's step-up and a jump's tuck — no skirt vertex lies inside a thigh, and every ring below the hip
// crease goes round each thigh with the thigh's whole cross-section inside it (the knee cannot come through the cloth).
// Plus the look code: p3 / p4 roundtrip, older clients fall back to straight trousers. node --test tools/avatarskirttest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { skirtTube, skirtWeights, skirtKind, skirtUnder, skirtRegion, olderClientLegs, skirtRings, drapePoint, skirtHem, skirtGLSL, hemSag } from '../src/avatarskirt.js';
import { AVATAR_SURFACE as SURFACE, AVATAR_SKIRT as K, AVATAR_CLOTH, AVATAR_CLOTHES, encodeAvatarLook, decodeAvatarLook, SKIN, TOPS, PANTS, SHOES, HAIR } from '../src/config.js';

const THIGH_X = 0.085, THIGH = 0.44, EASE = 0.006, CREASE = -0.14; // olof.js's thigh joints / length; the shorts' ease and fold (SURFACE.trouser)
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** The leg's ellipse [rx, rz] at thigh-local height y (SURFACE.leg plus the garment's ease). */
function legAt(y) {
  const L = SURFACE.leg;
  for (let i = 1; i < L.length; i++) if (y >= L[i][0]) { const a = L[i - 1], b = L[i], t = (y - a[0]) / (b[0] - a[0]); return [a[1] + t * (b[1] - a[1]) + EASE, a[2] + t * (b[2] - a[2]) + EASE]; }
  return [L.at(-1)[1] + EASE, L.at(-1)[2] + EASE];
}
// rotation matrices (row-major 3×3): a thigh swung forward by `flex` (its -y towards +z) and out by `out` (the knee away from the middle)
const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const app = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const appT = (M, v) => [0, 1, 2].map((j) => M[0][j] * v[0] + M[1][j] * v[1] + M[2][j] * v[2]);
const thigh = (flex, out, side) => ({ R: mul(rx(-flex), rz(side * out)), J: [side * THIGH_X, 0, 0], swing: smooth(AVATAR_CLOTH.hip[0], AVATAR_CLOTH.hip[1], flex) });
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// [name, flex L, flex R, out L, out R] (rad): the activities' thigh angles (sit: olof.js / rest seats; squat: AVATAR_CROUCH; the pedal
// stroke's top / bottom; the flutter kick; the gym's step-up station 8; a jump's tucked legs; a running stride)
const POSES = [['stand', 0, 0, 0, 0], ['walk', 0.45, -0.3, 0, 0], ['walk mirrored', -0.3, 0.45, 0, 0], ['run', 0.85, -0.45, 0, 0],
  ['sit', 1.57, 1.57, 0.1, 0.1], ['sit, knees together', 1.6, 1.6, -0.02, -0.02], ['squat', 2.1, 2.1, 0.35, 0.35], ['deep squat', 2.4, 2.4, 0.45, 0.45],
  ['cycle top', 1.75, 0.75, 0.05, 0.05], ['cycle mirrored', 0.75, 1.75, 0.05, 0.05], ['cycle mid', 1.3, 1.1, 0.05, 0.05],
  ['swim kick', 0.15, -0.15, 0.05, 0.05], ['gym step-up', 1.25, 0, 0, 0], ['jump tuck', 1.3, 0.9, 0.1, 0.1]];

/** How far the posed knee is above the hip joint (the sag's input). */
const kneeUp = (b) => app(b.R, [0, -THIGH, 0])[1];

/** The posed skirt: every vertex draped (bind space) then skinned. */
function posed(kind, pose, rigid = false, noSag = false) {
  const [, fl, fr, ol, or] = pose, L = thigh(fl, ol, 1), Rt = thigh(fr, or, -1), t = skirtTube(kind);
  const out = [];
  for (let i = 0; i < t.position.length / 3; i++) {
    const p0 = t.position.slice(i * 3, i * 3 + 3), d = t.drape.slice(i * 3, i * 3 + 3), w = rigid ? [1, 0, 0] : t.weights[i];
    const p = drapePoint(p0, d, L.swing, Rt.swing);
    if (!noSag) p[1] += hemSag(p0[1], (p0[0] >= 0 ? L : Rt).swing, p0[2] / (Math.hypot(p0[0], p0[2]) || 1)); // the shader's shortening on raised thighs (bind pose; side: the split's half)
    const sk = (b) => add(app(b.R, sub(p, b.J)), b.J);
    const a = sk(L), b = sk(Rt);
    out.push([0, 1, 2].map((k) => w[0] * p[k] + w[1] * a[k] + w[2] * b[k]));
  }
  return { t, v: out, L, R: Rt };
}

/** Smallest normalised radius (1 = on the leg's surface) of any skirt vertex inside a thigh's visible length (below the hip crease, `CREASE`
 * m down the thigh, where a deep squat folds the thigh into the belly whatever is worn). */
function deepest({ t, v, L, R }) {
  let min = Infinity, at = null;
  for (const [name, b] of [['L', L], ['R', R]]) for (const [i, q] of v.entries()) {
    const l = appT(b.R, sub(q, b.J));
    if (l[1] > CREASE || l[1] < -THIGH || t.weights[i][0] > 0.999) continue; // (the waist rows are the hips', like the trousers' seat)
    const [ex, ez] = legAt(l[1]), e = Math.hypot(l[0] / ex, l[2] / ez);
    if (e < min) { min = e; at = `${name} vertex ${i} local y ${l[1].toFixed(3)}`; }
  }
  return { min, at };
}

/** For each ring below the crease and each thigh: the ring, seen along the thigh, must enclose the thigh's ellipse there. Returns the
 * smallest clearance (1 = the ellipse just touches the ring's polygon; < 1 = cloth through the leg; 0 = the axis outside the ring). */
function enclosure({ t, v, L, R }) {
  let min = Infinity, at = null;
  for (let row = 0; row < t.rows; row++) {
    const y = t.position[row * (t.sides + 1) * 3 + 1];
    if (y > CREASE) continue;
    const loop = v.slice(row * (t.sides + 1), row * (t.sides + 1) + t.sides);
    for (const [name, b] of [['L', L], ['R', R]]) {
      const P = add(app(b.R, [0, y, 0]), b.J), U = app(b.R, [1, 0, 0]), V = app(b.R, [0, 0, 1]), [ex, ez] = legAt(y);
      const pts = loop.map((q) => { const d = sub(q, P); return [dot(d, U) / ex, dot(d, V) / ez]; });
      let wind = 0, clear = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        wind += Math.atan2(a[0] * c[1] - a[1] * c[0], a[0] * c[0] + a[1] * c[1]);
        const e = sub([...c, 0], [...a, 0]), s = Math.max(0, Math.min(1, -(a[0] * e[0] + a[1] * e[1]) / (e[0] * e[0] + e[1] * e[1] || 1)));
        clear = Math.min(clear, Math.hypot(a[0] + s * e[0], a[1] + s * e[1]));
      }
      const c = Math.abs(wind) > Math.PI ? clear : 0;
      if (c < min) { min = c; at = `${name} ring ${row} (y ${y.toFixed(3)})`; }
    }
  }
  return { min, at };
}

for (const kind of ['skirt', 'dress']) for (const pose of POSES) {
  test(`#2157 ${kind}, ${pose[0]}: no thigh through the cloth`, () => {
    const s = posed(kind, pose), d = deepest(s), e = enclosure(s);
    const sagged = /squat/.test(pose[0]); // (the sag's transition on a raised thigh may sink up to ~1 cm, 15 %, into it)
    assert.ok(d.min >= (sagged ? 0.85 : 1), `a skirt vertex inside the thigh: ${d.min.toFixed(3)} at ${d.at}`);
    assert.ok(e.min >= (sagged ? 0.9 : 1), `a thigh not inside a ring: clearance ${e.min.toFixed(3)} at ${e.at}`);
  });
}

test('#2157 the checks see a knee through a skirt that hangs on the hips alone (as #2147\'s coat on the torso)', () => {
  for (const name of ['sit', 'cycle top', 'run']) {
    const s = posed('skirt', POSES.find((p) => p[0] === name), true);
    assert.ok(Math.min(deepest(s).min, enclosure(s).min) < 1, name);
  }
});

test('#2157 weights: the hips\' at the waist, the thighs\' from the crease (later behind), split across the middle, sum 1', () => {
  const [y0] = K.waist[0];
  assert.deepEqual(skirtWeights(0.1, y0, 0.1).map((w) => +w.toFixed(6)), [1, 0, 0]);
  const front = skirtWeights(0, K.ramp.front - 0.01, 0.15), back = skirtWeights(0, K.ramp.front - 0.01, -0.15);
  assert.ok(front[0] < 1e-6 && back[0] > 0.3, `front ${front}, back ${back}`);
  assert.ok(Math.abs(front[1] - front[2]) < 1e-9, 'the middle line is shared equally');
  const side = skirtWeights(0.24, -0.3, 0);
  assert.ok(side[1] > 0.999 && side[2] < 1e-3, `the left side follows the left thigh: ${side}`);
  for (const p of [[0.2, -0.1, 0.05], [-0.13, -0.25, -0.1], [0.01, 0, 0.12]]) assert.ok(Math.abs(skirtWeights(...p).reduce((a, b) => a + b) - 1) < 1e-9);
});

test('#2157 geometry: an open A-line tube under the top\'s hem, wider than the hips and the thighs, a lining at the hem', () => {
  for (const kind of ['skirt', 'dress']) {
    const t = skirtTube(kind), r = skirtRings(kind);
    assert.equal(t.position.length / 3, (t.rows + t.lining) * (t.sides + 1));
    assert.equal(t.index.length / 3, 2 * t.sides * (t.rows - 1 + t.lining - 1), 'no caps: open at the waist and the hem');
    for (let i = 1; i < r.length; i++) assert.ok(r[i][0] < r[i - 1][0] && r[i][1] >= r[i - 1][1] && r[i][2] >= r[i - 1][2], `ring ${i} lower and not narrower`);
    assert.equal(r.at(-1)[0], skirtHem(kind));
    for (const [y, rxx, rzz] of r) if (y < -0.03) { const [ex, ez] = legAt(y); assert.ok(rxx > THIGH_X + ex + 0.01 && rzz > ez + 0.03, `y ${y}: clear of the thighs`); }
    // the drape's slim target still clears the thighs
    for (let i = 0; i < t.position.length / 3; i++) {
      const y = t.drape[i * 3 + 1]; if (y > -0.12) continue;
      const [ex, ez] = legAt(y), x = Math.abs(t.drape[i * 3]), z = Math.abs(t.drape[i * 3 + 2]);
      if (x > THIGH_X) assert.ok(Math.hypot((x - THIGH_X) / ex, z / ez) >= 1, `drape target ${i} inside a thigh`);
    }
  }
  assert.ok(skirtHem('dress') < skirtHem('skirt'), 'the dress is longer');
});

test('#2157 look code: p3 / p4 roundtrip, the under layer and colour, older clients draw straight trousers', () => {
  const lk = { skin: SKIN[1], top: TOPS[2], pants: PANTS[1], shoes: SHOES[0], hair: HAIR[3], style: 1, sleeves: 0, gender: 1, facial: 0 };
  assert.deepEqual(AVATAR_CLOTHES.legs.names.slice(3), ['Kjol', 'Klänning']);
  for (const legs of [3, 4]) {
    const code = encodeAvatarLook({ ...lk, legs });
    assert.match(code, new RegExp(`p${legs}`));
    assert.equal(decodeAvatarLook(code).legs, legs);
    assert.equal(olderClientLegs(legs), 0, 'an older client skips the unknown value');
  }
  assert.equal(decodeAvatarLook(encodeAvatarLook(lk) + 'p5').legs ?? 0, 0, 'beyond the list: ignored');
  assert.deepEqual([0, 1, 2, 3, 4].map(skirtKind), [null, null, null, 'skirt', 'dress']);
  assert.deepEqual([0, 1, 2, 3, 4].map(skirtUnder), [0, 1, 2, 1, 1]);
  assert.deepEqual([3, 4].map(skirtRegion), ['pants', 'top']);
  assert.deepEqual([0, 1, 2].map((v) => olderClientLegs(v)), [0, 1, 2]);
});

test('#2157 GLSL: the drape and sway block is gated to skirt vertices and uses ascending smoothstep edges', () => {
  const g = skirtGLSL({ hipY: 0.9, hips: 0, thighs: [{ i: 1, knee: [0.085, 0.5, 0] }, { i: 2, knee: [-0.085, 0.5, 0] }] });
  assert.match(g, /facePart < 0\.5 && dot\(faceAnchor, faceAnchor\) > 0\.0/);
  for (const m of g.matchAll(/smoothstep\(([-\d.]+), ([-\d.]+),/g)) assert.ok(+m[1] < +m[2], `edges ${m[1]} < ${m[2]}`);
  assert.match(g, /uClothHip/); assert.match(g, /uSwayHem/);
});

const hemRows = (s) => { const n = s.t.sides + 1, r = s.t.rows - 1; return s.v.slice(r * n, r * n + n); };
const ys = (a) => a.map((q) => q[1]);

test('#2157 squat: the hem rides up onto the lap instead of ringing the knees (shortened on fully flexed thighs)', () => {
  const reach = (hem, J = [0, 0, 0]) => Math.max(...hem.map((q) => Math.hypot(q[0] - Math.sign(q[0]) * 0.085, q[1], q[2])));
  for (const kind of ['skirt', 'dress']) for (const name of ['squat', 'deep squat']) {
    const pose = POSES.find((p) => p[0] === name), a = posed(kind, pose, false, true), b = posed(kind, pose);
    assert.ok(reach(hemRows(b)) < reach(hemRows(a)) - 0.08, `${kind} ${name}: hem reach ${reach(hemRows(b)).toFixed(3)} vs ${reach(hemRows(a)).toFixed(3)}`);
    assert.ok(reach(hemRows(b)) < 0.36, `${kind} ${name}: the hem stays above the knee ring (${reach(hemRows(b)).toFixed(3)} m from the hip)`);
  }
  assert.equal(hemSag(-0.4, 0.24), 0, 'a half-flexed thigh (the sit pose of the page): no shortening'); assert.equal(hemSag(-0.1, 1), 0, 'the upper rows stay');
  assert.ok(hemSag(-0.4, 1) > 0.14);
});

test('#2157 sitting: the back hem stays above the seat (the thighs\' underside) and no vertex is lower than it', () => {
  for (const kind of ['skirt', 'dress']) for (const name of ['sit', 'sit, knees together']) {
    const s = posed(kind, POSES.find((p) => p[0] === name)), n = s.t.sides + 1;
    let worst = Infinity, at = '';
    for (let row = 0; row < s.t.rows; row++) for (let j = 0; j < s.t.sides; j++) {
      const p0 = s.t.position.slice((row * n + j) * 3, (row * n + j) * 3 + 3);
      if (p0[2] > -0.02 || s.t.weights[row * n + j][0] > 0.05) continue; // the back half where the thighs carry it
      const q = s.v[row * n + j], seat = -(legAt(-q[2])[1]); // a horizontal thigh: its underside (= the seat) at -rz
      if (q[1] - seat < worst) { worst = q[1] - seat; at = `ring ${row} col ${j}`; }
    }
    const low = worst, seat = 0;
    assert.ok(low >= -0.025, `${kind} ${name}: the back hem is ${(-low * 1000).toFixed(0)} mm below the seat at ${at}`);
  }
});
