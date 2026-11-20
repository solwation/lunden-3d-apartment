// #2173: the avatar's glasses geometry and the env/lens maths. Frames: a round rim (a torus with more segments than the old 4-sided one), a
// square rim as a tube along a rounded rectangle (superellipse) instead of four boxes, round temples and bridge, and a thin clear lens in each
// rim (parts lensRound / lensSquare, collapsed unless that kind is chosen). The lens is drawn by alpha-to-coverage in the avatar's own material
// (see src/avatarenv.js); `lensAlpha` is its coverage. Numbers: AVATAR_ENV in config.js. Pure helpers first (tools/avatarglassestest.mjs).
import * as THREE from 'three';
import { AVATAR_ENV as ENV } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Fresnel-like factor of the lens: 0 looking straight through (cos θ = 1), 1 at grazing incidence. */
export const grazing = (cosTheta, power = ENV.lens.power) => Math.pow(1 - clamp(Math.abs(cosTheta), 0, 1), power);

/** The lens' coverage 0 … 1 (alpha-to-coverage): faint head-on, strong at a glancing angle, more where the reflected room is bright
 * (`envLuma`, 0 … 1 and over). `light` (uLight 0 … 1) scales the reflection, not the glass: a dark room still shows a faint lens. */
export function lensAlpha(cosTheta, envLuma = 0, light = 1, L = ENV.lens) {
  const g = grazing(cosTheta, L.power);
  const glare = L.glare * clamp((envLuma * clamp(light, 0, 1) - 0.55) / 0.35, 0, 1);
  return clamp(L.head + (L.graze - L.head) * g + glare, 0, 1);
}

/** What the surface reflects of the env: the schlick-Fresnel reflectance with base `f0`. */
export const fresnel = (f0, cosTheta) => f0 + (1 - f0) * Math.pow(1 - clamp(cosTheta, 0, 1), 5);

/** The reflection added for a fragment: env × reflectance × class strength × the local light level (uLight). */
export const envReflect = (env, f0, cosTheta, k, light) => env * fresnel(f0, cosTheta) * k * clamp(light, 0, 1);

/** Points of a closed superellipse |x/rx|^n + |y/hy|^n = 1 (n = 2 an ellipse, large n a rectangle), `count` of them, counter-clockwise. */
export function superellipse(rx, hy, n, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push([rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), hy * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  return out;
}

/** The round rim: a torus. */
export const roundRim = (rx, tube) => new THREE.TorusGeometry(rx, tube, ENV.frame.round[0], ENV.frame.round[1]);
/** The square rim: a tube along the rounded rectangle, in the xy plane. */
export function squareRim(rx, hy, tube) {
  const [radial, tubular] = ENV.frame.square;
  const pts = superellipse(rx, hy, ENV.frame.n, tubular).map(([x, y]) => new THREE.Vector3(x, y, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), tubular, tube, radial, true);
}
/** A clear lens filling a rim: a flat disc (kind 1) or rounded rectangle (kind 2) facing +z. */
export function lensShape(kind, rx, hy) {
  if (kind === 1) return new THREE.CircleGeometry(rx, 16);
  return new THREE.ShapeGeometry(new THREE.Shape(superellipse(rx, hy, ENV.frame.n, 24).map(([x, y]) => new THREE.Vector2(x, y))));
}
/** A round bar from a to b (Vector3). */
export function bar(a, b, radius) {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(radius, radius, d.length(), ENV.frame.temple);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** The triangles the glasses added in the shared head geometry over the old frames (#1165: a 4 × 16 torus and four boxes per round / square rim, a box
 * temple per side and a box bridge = 388) — for the budget tests, which count each earlier issue's triangles apart (like `teethExtraTriangles`).
 * The new count: both rims, a bar per temple, the bridge, and two lenses (round, square) per side. */
export function glassesExtraTriangles() {
  const OLD = 2 * 128 + 2 * 48 + 2 * 12 + 12, tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const rx = 0.0225, hy = 0.0165;
  const now = 2 * (tris(roundRim(rx, 0.001)) + tris(squareRim(rx, hy, 0.001)) + tris(bar(v(0, 0, 0), v(0, 0, 1), 0.001)) + tris(lensShape(1, rx, hy)) + tris(lensShape(2, rx, hy))) + tris(bar(v(0, 0, 0), v(1, 0, 0), 0.001));
  return now - OLD;
}
