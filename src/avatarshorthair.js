// #2055 (part of #2042): short hair (style 0) and the bun (style 2) without the smooth helmet, inside the avatar's one draw call.
//  - layers: overlapping locks on the scalp shell (avatar.js hairParts), laid out in tiers from the crown down to the soft hairline. Each
//    lock follows the shell's own parametrisation (azimuth a + sweep · sin(πs), elevation edge + (90 − edge) · s, the clump twist along s:
//    avatarhairgloss.js glossFlow), so the #2052 strand gloss, which inverts that parametrisation, runs along the locks too. A lock's root
//    is sunk into the shell and its tip lifted and closed back down, so the tips overlap the tier below and break the silhouette.
//  - uneven nape and ears: the #2050 soft line is pulled down in irregular tufts behind the sideburns (a GLSL term added to the line's
//    distance, `jag`), and the short shell runs that much lower there (shortHairDrop) so there is hair under the tufts.
//  - parting: short hair's side parting (AVATAR_SURFACE.hair.part) is grooved deeper and tinted towards the skin's colour along its
//    middle in the fragment (the scalp faintly showing); the locks keep off it.
//  - bun: twisted ropes (three-ply, by radius) coiled round the bun's tilted axis over a darker core, instead of a smooth ball and torus;
//    they coil round the same axis the gloss's bun tangent uses (AVATAR_HAIR_GLOSS.bunTilt) and stay inside the #2014 sway radius. The
//    bun's thin shell gets a few flat combed-back locks.
// Numbers: config.js AVATAR_SHORT_HAIR. Pure geometry helpers plus GLSL avatar.js splices in. No attribute, texture, light or pass.
import * as THREE from 'three';
import { AVATAR_SHORT_HAIR as S, AVATAR_HAIR as HAIR, AVATAR_SURFACE as SURFACE } from './config.js';
import { glossFlow } from './avatarhairgloss.js';
import { hairlineShell } from './avatarhairline.js';

const f = (v) => (+v).toFixed(6);
const deg = Math.PI / 180;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const PART = SURFACE.hair.part[0];

/** The jag's envelope (0 … 1) at |azimuth| `A` (°): none in front, part over the ear, full at the nape. */
export function jagEnvelope(A) {
  const [, , , from, full, ear, back] = S.jag;
  A = Math.abs(A);
  return smooth(from, full, A) * (ear + (1 - ear) * smooth(back - 10, back + 10, A));
}
/** How far (m) the short hair's line is pulled down at signed azimuth `a` (°): irregular tufts (the JS twin of GLSL shJag). */
export function shortJag(a) {
  const [depth, teeth, sharp] = S.jag, r = a * deg;
  const tooth = (0.5 + 0.5 * Math.cos(r * teeth + 1.7 * Math.sin(r * 5 + 0.6))) ** sharp, amp = 0.65 + 0.35 * Math.sin(r * 11 + 2.1);
  return depth * jagEnvelope(a) * tooth * amp;
}
/** Degrees the short shell (style 0) starts below its usual edge at azimuth `a`, so the deepest tuft still lies on hair. */
export const shortHairDrop = (style, a) => (style === 0 ? (S.jag[0] * jagEnvelope(a)) / (0.07 * deg) : 0);
/** Extra shell lift (m, negative: a groove) at pre-sweep azimuth `a` (°) and elevation share `s`: short hair's deeper side parting. */
export function shortHairBump(style, a, s) {
  if (style !== 0) return 0;
  const [depth, half, , , [s0, s1], [s2, s3]] = S.part;
  return -depth * Math.exp(-(((a - PART) / half) ** 2)) * smooth(s0, s1, s) * (1 - smooth(s2, s3, s));
}

/** A strip of rows × 3 vertices; `at(j, k)` → [x, y, z], `shade(j, k)`; k = −1, 0, 1 across. */
function strip(rows, at, shade) {
  const p = [], sh = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let k = -1; k <= 1; k++) { p.push(...at(j, k)); sh.push(shade(j, k)); }
  for (let j = 0; j < rows; j++) for (let k = 0; k < 2; k++) {
    const a = j * 3 + k, b = a + 1, c = a + 3, d = a + 4;
    idx.push(a, c, b, b, c, d); // (outward: k runs left → right seen from outside, j from root to tip)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The overlapping locks of hairstyle `style` (0 short, 2 bun's combed-back ones; others none) as [geometry, 'hair', shade] parts.
 * `low(a)` the shell's lower edge (°) at pre-sweep azimuth a, `lift(a, e, s)` the shell's lift (m) there, `onSkull(a, e, lift)` a point.
 */
export function hairLocks(style, { low, lift, onSkull }) {
  if (style !== 0 && style !== 2) return [];
  const [sweep, twist] = glossFlow(style), out = [], R = S.rows;
  const tiers = style === 0 ? S.tiers : [[S.combed[0], S.combed[1], S.combed[2], S.combed[3], S.combed[4], 0.15]];
  const halfDeg = (w, e) => (w / 2) / (0.095 * Math.max(0.3, Math.cos(e * deg)) * deg);
  tiers.forEach(([count, t1, t0base, width, height, jitter], tier) => {
    for (let n = 0; n < count; n++) {
      const seed = tier * 97 + n * 13 + style * 7;
      let a0 = -180 + ((n + 0.5 + 0.4 * (hash(seed) - 0.5)) * 360) / count + tier * 137.5 % (360 / count);
      let t0 = t0base + jitter * (t1 - t0base) * (hash(seed + 1) - 0.5);
      if (style === 0 && tier === S.tiers.length - 1) { // the lowest tier: shorter over the ears (stays above them)
        const A = Math.abs(a0), [e0, e1] = S.ears;
        t0 += S.earLift * smooth(e0 - 8, e0, A) * (1 - smooth(e1, e1 + 8, A));
      }
      const t = (u) => t1 + (t0 - t1) * u, az = (u) => a0 + twist * (t(u) - t1);
      if (style === 0) for (let pass = 0; pass < 3; pass++) { // keep off the parting where it shows
        let worst = Infinity;
        for (let u = 0; u <= 1; u += 0.125) if (t(u) <= S.part[5][1]) { const d = az(u) - PART; if (Math.abs(d) < Math.abs(worst)) worst = d; }
        const need = S.partClear + halfDeg(width, 50);
        if (Math.abs(worst) >= need) break;
        a0 += (worst < 0 ? -1 : 1) * (need - Math.abs(worst) + 0.5);
      }
      const H = height * (0.8 + 0.4 * hash(seed + 2)), tone = 0.94 + 0.12 * hash(seed + 3), sink = S.sink;
      const rows = R + 1; // the last row closes the tip back down into the shell
      out.push([strip(rows, (j, k) => {
        const close = j === rows, u = close ? 1 : j / R, tt = close ? t(1) - 0.07 * (t1 - t0) : t(u), a = az(u);
        const e0 = low(a), e = e0 + (90 - e0) * tt;
        const half = halfDeg(width, e) * (1 - 0.5 * u ** 1.5) * (close ? 0.8 : 1);
        const aa = a + k * half, ee = low(aa) + (90 - low(aa)) * tt;
        const rise = smooth(0, 0.6, u), h = close ? -sink : -sink + ((k === 0 ? H : 0.2 * H) + sink) * rise;
        return onSkull(aa + sweep * Math.sin(Math.PI * tt), ee, lift(aa, ee, tt) + h);
      }, (j, k) => {
        const u = Math.min(1, j / R), close = j === R + 1;
        return tone * (close ? 0.95 : (0.8 + 0.22 * smooth(0, 0.5, u) + 0.03 * u)) * (k === 0 ? 1 : 0.92);
      }), 'hair', 1]);
      out.at(-1)[0].userData.noFly = true; // (#2040's flyaways keep growing from the shell, as before)
    }
  });
  return out;
}
/** Triangles #2055 adds to hairstyle `style` (its own +10 % head budget, tools/avatarshorthairtest.mjs): the locks, and the bun's ropes and
 * core in place of its old ball (SphereGeometry 10 × 7) and torus (6 × 12). */
export function shortHairTriangles(style) {
  const lock = (S.rows + 1) * 4, B = S.bun;
  if (style === 0) return S.tiers.reduce((n, t) => n + t[0] * lock, 0);
  if (style === 2) return S.combed[0] * lock + B.ropes * B.segs * B.sides * 2 + 2 * 8 * 5 - (2 * 10 * 6 + 6 * 12 * 2);
  return 0;
}

/** The bun (style 2) at `at` (head frame) tilted `tilt` rad about x: [geometry, region, shade] parts (hair ropes, core and its band). */
export function bunParts(at, tilt) {
  const B = S.bun, out = [], place = (g) => g.rotateX(tilt).translate(...at);
  out.push([place(new THREE.SphereGeometry(B.core, 8, 6).scale(1, 0.85, 1).translate(0, 0.002, 0)), 'hair', 0.78]);
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), up = new THREE.Vector3();
  const curve = (u, phi0) => {
    const phi = phi0 + 2 * Math.PI * B.turns * u, r = B.r[0] + (B.r[1] - B.r[0]) * u, y = B.y[0] + (B.y[1] - B.y[0]) * u ** 0.8;
    return new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi));
  };
  for (let k = 0; k < B.ropes; k++) {
    const phi0 = (k * 2 * Math.PI) / B.ropes + 0.4, p = [], sh = [], idx = [], n = B.sides;
    for (let j = 0; j <= B.segs; j++) {
      const u = j / B.segs, c = curve(u, phi0);
      T.subVectors(curve(Math.min(1, u + 0.01), phi0), curve(Math.max(0, u - 0.01), phi0)).normalize();
      up.set(c.x, 0, c.z).normalize(); N.copy(up).addScaledVector(T, -up.dot(T)).normalize(); Bn.crossVectors(T, N);
      const rho = (B.thick[0] + (B.thick[1] - B.thick[0]) * u) * (0.55 + 0.45 * smooth(0, 0.1, u)) * (0.3 + 0.7 * (1 - smooth(0.88, 1, u)));
      for (let i = 0; i < n; i++) {
        const th = (i / n) * 2 * Math.PI, ply = Math.cos(3 * th + 2 * Math.PI * B.ply[1] * u + k), r = rho * (1 + B.ply[0] * ply);
        p.push(c.x + r * (Math.cos(th) * N.x + Math.sin(th) * Bn.x), c.y + r * (Math.cos(th) * N.y + Math.sin(th) * Bn.y), c.z + r * (Math.cos(th) * N.z + Math.sin(th) * Bn.z));
        sh.push((0.92 + 0.12 * ply) * (0.86 + 0.14 * Math.cos(th)) * (0.82 + 0.18 * smooth(0, 0.15, u)));
      }
    }
    for (let j = 0; j < B.segs; j++) for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n), c = a + n, d = b + n;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
    g.setIndex(idx); g.computeVertexNormals();
    out.push([place(g), 'hair', 1.04]);
  }
  // the band round the knot's foot (as before #2055)
  out.push([new THREE.TorusGeometry(0.03, 0.0045, 4, 12).rotateX(Math.PI / 2).rotateX(tilt).translate(at[0], at[1] - 0.026, at[2] + 0.02), 'top', 0.85]);
  return out;
}

/** The material's own uniform: uShortHair = (the skin's colour, 1 for short hair). */
export const shortHairUniforms = () => ({ uShortHair: { value: new THREE.Vector4(0, 0, 0, 0) } });
/** From a look (avatar.js applyFaceShape). */
export function applyShortHairLook(u, lk) {
  if (!u.uShortHair) return;
  const c = new THREE.Color(lk?.skin ?? 0xd6a07c);
  u.uShortHair.value.set(c.r, c.g, c.b, (lk?.style ?? 0) === 0 ? 1 : 0);
}
/** The program cache key's suffix. */
export const shortHairKey = () => '-short2055';

/** Fragment declarations (global scope): the tufted line's pull (m) at azimuth `haz` (rad), for short hair only. */
export function shortHairFDecl() {
  const [depth, teeth, sharp, from, full, ear, back] = S.jag;
  return `uniform vec4 uShortHair;
float shJag(float haz) { // #2055 the nape's / ears' tufts (src/avatarshorthair.js shortJag)
  float A = abs(haz) * 57.29578;
  float env = smoothstep(${f(from)}, ${f(full)}, A) * (${f(ear)} + ${f(1 - ear)} * smoothstep(${f(back - 10)}, ${f(back + 10)}, A));
  float tooth = pow(0.5 + 0.5 * cos(haz * ${f(teeth)} + 1.7 * sin(haz * 5.0 + 0.6)), ${f(sharp)});
  return uShortHair.w * ${f(depth)} * env * tooth * (0.65 + 0.35 * sin(haz * 11.0 + 2.1));
}`;
}
/** The GLSL expression avatarhairline.js adds to its line distance (haz in scope). */
export const shortHairJag = () => 'shJag(haz)';
/** The GLSL expression (m) by which short hair's lower shell (shortHairDrop) reaches further below the line than #2053's cut-off for hanging
 * locks: the soft line still thins it there (short hair has no hanging locks). */
export const shortHairBelow = () => `(uShortHair.w * ${f(S.jag[0])})`;

/** Fragment colour after the hairline: the scalp faintly showing along short hair's parting. `hb` the head bone's bind position. */
export function shortHairColor({ hb, region }) {
  const c = HAIR.centre, [sweep] = glossFlow(0), e0 = hairlineShell(PART), [, , tint, w, [s0, s1], [s2, s3]] = S.part;
  return `if (uShortHair.w > 0.5 && uSuit < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5 && vFly.x < 0.5) { // #2055 the parting
      vec3 sq = vSuitAt - vec3(${f(hb.x + c[0])}, ${f(hb.y + c[1])}, ${f(hb.z + c[2])});
      float sR = length(sq.xz), sEl = degrees(atan(sq.y, max(sR, 0.0001)));
      float sS = clamp((sEl - ${f(e0)}) / ${f(90 - e0)}, 0.0, 1.0);
      float sD = radians(degrees(atan(sq.x, sq.z)) - ${f(PART)} - ${f(sweep)} * sin(3.14159265 * sS)) * sR;
      float sK = ${f(tint)} * exp(-(sD * sD) / ${f(w * w)}) * smoothstep(${f(s0)}, ${f(s1)}, sS) * (1.0 - smoothstep(${f(s2)}, ${f(s3)}, sS));
      diffuseColor.rgb = mix(diffuseColor.rgb, uShortHair.rgb, sK * (0.8 + 0.2 * sin(sEl * 0.9 + 1.0)));
    }`;
}
