// #2013: how much the shoulder/armpit surface is squeezed or stretched when the arm is lifted, reaching forward or crossed.
// Usage: node tools/avatarshouldervolume.mjs [--json]   (also imported by tools/avatarshouldertest.mjs)
import * as THREE from 'three';
import { Avatar, armTarget } from '../src/avatar.js';
import { avatarLook } from '../src/config.js';

export const POSES = {
  up: { hands: { L: armTarget.up(1, .6), R: armTarget.up(-1, .6) } },
  wave: { hands: { R: { at: [-.3, 1.62, .2], pole: [-1, -.7, -.1] } } },
  forward: { hands: { L: armTarget.forward(1, .12), R: armTarget.forward(-1, .12) } },
  rifle: { hands: { L: { at: [.08, 1.28, .42], pole: [.6, -.6, -.5] }, R: { at: [-.12, 1.36, .3], pole: [-.8, -.6, -.5] } } },
  cross: { hands: { L: { at: [-.18, 1.2, .26], pole: [.3, -.8, -.4] }, R: { at: [.18, 1.2, .3], pole: [-.3, -.8, -.4] } } },
};
const posed = (av, state) => {
  av.gait = 0; av.phase = .8; av.time = 1; av.noIdle = true; av.update(0, state); av.update(1, state); // (#2035: the shoulders are measured in the plain rest pose)
  av.object.updateMatrixWorld(true); av.mesh.skeleton.update();
  const a = av.mesh.geometry.attributes.position, out = new Float32Array(a.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) { av.mesh.getVertexPosition(i, v); out.set([v.x, v.y, v.z], i * 3); }
  return out;
};
/** Edge length ratios (posed / rest) and triangle area ratios in the shoulder/armpit zone of `look`. */
export function shoulderMetrics(look, names = Object.keys(POSES)) {
  const av = new Avatar(look), g = av.mesh.geometry, ix = g.index, bind = g.attributes.position, res = {};
  const rest = posed(av, {}), pivot = av.bones.shoulderL.getWorldPosition(new THREE.Vector3()).y / av.object.scale.y;
  const inZone = i => { const x = Math.abs(bind.getX(i)), y = bind.getY(i); return x > .12 && x < .3 && y > pivot - .1 && y < pivot + .2; };
  const tri = [], n = ix ? ix.count / 3 : bind.count / 3;
  for (let t = 0; t < n; t++) { const k = [0, 1, 2].map(j => ix ? ix.getX(t * 3 + j) : t * 3 + j); if (k.every(inZone)) tri.push(k); }
  const len = (p, a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  const area = (p, [a, b, c]) => { const u = new THREE.Vector3(p[b*3]-p[a*3], p[b*3+1]-p[a*3+1], p[b*3+2]-p[a*3+2]), w = new THREE.Vector3(p[c*3]-p[a*3], p[c*3+1]-p[a*3+1], p[c*3+2]-p[a*3+2]); return u.cross(w).length() / 2; };
  for (const name of names) {
    const p = posed(av, POSES[name]);
    const E = [], A = [];
    for (const t of tri) {
      for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], l0 = len(rest, a, b); if (l0 < 8e-3) continue; const r = len(p, a, b) / l0; E.push(r); }
      const a0 = area(rest, t); if (a0 > 3e-5) { const r = area(p, t) / a0; A.push(r); }
    }
    const q = (arr, f) => { arr.sort((x, y) => x - y); return +arr[Math.min(arr.length - 1, Math.floor(f * arr.length))].toFixed(3); };
    const frac = (arr, f) => +(arr.filter(f).length / arr.length).toFixed(3);
    res[name] = { squashed: frac(A, r => r < .25), stretched: frac(E, r => r > 3), edgeP1: q(E, .01), edgeP99: q(E, .99), edgeMin: q(E, 0), edgeMax: q(E, 1), areaP1: q(A, .01), areaP99: q(A, .99), areaMin: q(A, 0), areaMax: q(A, 1) };
  }
  av.dispose();
  return res;
}
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('avatarshouldervolume.mjs')) {
  for (const gender of [0, 1]) for (const sleeves of [0, 1]) {
    console.log(`gender${gender} sleeves${sleeves}`, JSON.stringify(shoulderMetrics({ ...avatarLook('vol2013'), gender, sleeves, cut: 0 })));
  }
}
