// #2169: shoe models beyond the trainer (config.js AVATAR_SHOES): leather low shoe, sandal; the boot's shaft and the socks are
// leg-skinned tubes built in avatar.js. All in the trainer's shoe-local frame (sole top y -0.442, foot centre z 0.055), no new render path.
import * as THREE from 'three';
import { AVATAR_SHOES as S } from './config.js';
import { patch, ribbon } from './avatartrainers.js';
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SOLE_TOP = -0.442, CENTRE_Z = 0.055;
const dome = (size, taper = 0) => {
  const g = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(...size), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), t = smooth(-0.02, 0.16, z);
    p.setY(i, p.getY(i) * (1 - 0.58 * t) + SOLE_TOP); p.setX(i, p.getX(i) * (1 - taper * smooth(0.04, 0.14, z))); p.setZ(i, z + CENTRE_Z);
  }
  g.computeVertexNormals(); return g;
};
/** The leather low shoe: a lower, slimmer, pointed upper with a dark lace throat and a toe-cap seam. Returns [{ geometry, shade }] (first = the upper). */
export function leatherShoe() {
  const L = S.leather, upper = dome(L.size, L.toeTaper), T = L.throat;
  const throat = [[-T.x, T.z[0]], [T.x, T.z[0]], [T.x * 0.8, T.z[1]], [-T.x * 0.8, T.z[1]]];
  const cap = [[-0.05, L.cap.z], [-0.025, L.cap.z + 0.022], [0.025, L.cap.z + 0.022], [0.05, L.cap.z]];
  const seam = [0, 1, 2].map(i => ribbon(cap[i], cap[i + 1], L.cap.width)).flat();
  return [{ geometry: upper, shade: 1 }, { geometry: patch(upper, [throat], T.lift), shade: T.shade }, { geometry: patch(upper, seam, T.lift), shade: L.cap.shade }];
}
/** A band (rim `thick` m out of the surface, `width` m wide along `axis`) swept along the closed or open path `pts` ([x, y, z]) with outward normals `nrm`. */
function band(pts, nrm, axis, width, thick, closed) {
  const n = pts.length, pos = [], idx = [], a = new THREE.Vector3(...axis).multiplyScalar(width / 2), cols = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3(...pts[i]), o = p.clone().addScaledVector(new THREE.Vector3(...nrm[i]), thick);
    pos.push(...o.clone().sub(a).toArray(), ...o.clone().add(a).toArray(), ...p.clone().sub(a).toArray(), ...p.clone().add(a).toArray());
  }
  const q = (a0, b0, c0, d0) => idx.push(a0, b0, c0, b0, d0, c0);
  for (let i = 0; i < cols; i++) {
    const j = (i + 1) % n, A = i * 4, B = j * 4;
    q(A, B, A + 1, B + 1); // the outer face
    q(A + 2, A, B + 2, B); // the edge on the -axis side
    q(A + 1, A + 3, B + 1, B + 3); // the edge on the +axis side
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setIndex(idx);
  g.computeVertexNormals(); return g;
}
/** A strap over the foot: a half ellipse round the foot dome's cross-section at `z` (the dome's width / height there). */
function strap(z, width) {
  const [w, h, l] = S.sandal.foot, f = Math.sqrt(Math.max(0.02, 1 - ((z - CENTRE_Z) / (l / 2)) ** 2)), t = S.sandal.thick;
  const rx = w / 2 * f, ry = h / 2 * f * (1 - 0.58 * smooth(-0.02, 0.16, z - CENTRE_Z)), pts = [], nrm = [], N = 12;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * i / N, c = Math.cos(a), s = Math.sin(a), len = Math.hypot(c / rx, s / ry);
    pts.push([rx * c, SOLE_TOP + ry * s, z]); nrm.push([c / rx / len, s / ry / len, 0]);
  }
  return band(pts, nrm, [0, 0, 1], width, t, false);
}
/** The sandal: a bare foot (skin), a forefoot and an instep strap and an ankle strap. Returns { foot, straps: [geometry] }. */
export function sandal() {
  const [rx, rz, width, dy] = S.sandal.ankle, pts = [], nrm = [], N = 16;
  for (let i = 0; i < N; i++) { const a = Math.PI * 2 * i / N, c = Math.cos(a), s = Math.sin(a); pts.push([rx * c, dy - 0.41 + 0.0, rz * s]); nrm.push([c, 0, s]); }
  return { foot: dome(S.sandal.foot), straps: [...S.sandal.straps.map(([z, w]) => strap(z, w)), band(pts, nrm, [0, 1, 0], width, S.sandal.thick, true)] };
}
