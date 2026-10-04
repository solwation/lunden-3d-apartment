// JYSK ABORG café set (#406, ABORG in config; docs/cafeset-jysk-aborg-*.jpg) in front of our kitchen window: a folding
// steel table (a flat square top with a turned-down edge on two crossed leg pairs, foot bars and a cross bar) and two
// folding chairs (a seat of narrow slats, a back of two wide slats between two slim rear posts, crossed legs seen from
// the side, foot bars), powder-coated "mörk sand". Each piece is one material: furniture.js merges it to one mesh.
import * as THREE from 'three';
import { ABORG } from './config.js';

const mats = new Map();
const steel = () => {
  if (!mats.has('steel')) mats.set('steel', new THREE.MeshStandardMaterial({ color: ABORG.color, roughness: ABORG.rough, metalness: ABORG.metal }));
  return mats.get('steel');
};

/** A thin round bar from a to b (local metres) into g. */
function rod(g, a, b, r = ABORG.tube) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), steel());
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  g.add(m);
}
function box(g, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel());
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** The table (a builder): local origin = the floor under the top's centre. `item.flower` = a little pot plant on it (a
 * Thing, kind 'plant', #185), built by furniture.js's `flower` (passed in). */
export function aborgtable(item, _lights, flower) {
  const T = ABORG.table, g = new THREE.Group(), h = T.h, hw = T.w / 2, t = 0.004;
  box(g, T.w, t, T.w, 0, h - t / 2, 0); // the top
  for (const s of [-1, 1]) { // the turned-down edge
    box(g, T.w, T.edge, t, 0, h - T.edge / 2, s * (hw - t / 2));
    box(g, t, T.edge, T.w - 2 * t, s * (hw - t / 2), h - T.edge / 2, 0);
  }
  // two crossed leg pairs on the left and right sides (x = ±lx), crossing along z; their feet on round foot bars
  const lx = hw - 0.035, fz = hw - 0.03, top = h - T.edge - 0.005, foot = 0.02;
  for (const x of [-lx, lx]) {
    rod(g, [x, foot, -fz], [x, top, fz - 0.06]);
    rod(g, [x, foot, fz], [x, top, -fz + 0.06]);
  }
  for (const z of [-fz, fz]) rod(g, [-lx, foot, z], [lx, foot, z]); // foot bars
  rod(g, [-lx, top - 0.02, 0], [lx, top - 0.02, 0]); // the cross bar under the top
  for (const z of [-(fz - 0.06), fz - 0.06]) rod(g, [-lx, top, z], [lx, top, z], ABORG.tube * 0.8); // rails under the top
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.surfaces = [{ x0: -hw + 0.04, x1: hw - 0.04, z0: -hw + 0.04, z1: hw - 0.04, y: h }];
  if (item.flower) {
    const f = flower();
    const [fx, fz2] = item.flowerAt ?? [0, 0];
    f.position.set(fx, h, fz2);
    g.add(f);
    g.userData.keep = [f];
    g.userData.things = [{ model: f, kind: 'plant', back: 'cafébordet' }];
  }
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -hw, z1: hw }];
  return g;
}

/** A chair (a builder): faces local +z, the origin on the floor under the seat's centre; a seat (#71). */
export function aborgchair() {
  const C = ABORG.chair, g = new THREE.Group(), hw = C.w / 2, hd = C.d / 2, s = C.seat;
  // the seat: narrow slats across, front to back, on two side rails
  const sd = C.seatD, n = C.slats, sw = (sd - (n - 1) * 0.008) / n;
  for (let i = 0; i < n; i++) box(g, C.w - 0.03, 0.012, sw, 0, s - 0.006, -sd / 2 + sw / 2 + i * (sw + 0.008) + 0.02);
  // the frame seen from the side (x = ±px): the rear post runs from the floor in front up past the seat and on, leaning
  // back, to the top of the back; the front leg from the seat's front edge down to the floor at the back; foot bars
  const px = hw - 0.012, lean = 0.1;
  const postFoot = [0.06, 0.012], postTop = [-hd + 0.02, C.h]; // [z, y]
  const legTop = [sd / 2 + 0.02, s - 0.015], legFoot = [-hd + 0.03, 0.012];
  for (const x of [-px, px]) {
    rod(g, [x, postFoot[1], postFoot[0]], [x, postTop[1], postTop[0]]);
    rod(g, [x, legTop[1], legTop[0]], [x, legFoot[1], legFoot[0]]);
    rod(g, [x, s - 0.02, -sd / 2 + 0.02], [x, s - 0.02, sd / 2 + 0.02], ABORG.tube * 0.8); // seat side rail
  }
  rod(g, [-px, postFoot[1], postFoot[0]], [px, postFoot[1], postFoot[0]]);
  rod(g, [-px, legFoot[1], legFoot[0]], [px, legFoot[1], legFoot[0]]);
  // the back: two wide slats between the posts, following their lean
  const zAt = (y) => postFoot[0] + (postTop[0] - postFoot[0]) * (y - postFoot[1]) / (postTop[1] - postFoot[1]);
  for (const y of C.backSlats) {
    const b = box(g, C.w - 0.01, C.backH, 0.01, 0, y, zAt(y) - 0.012);
    b.rotation.x = -lean;
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.rest = { kind: 'sit', name: 'caféstolen', verb: 'sätta dig på', spots: [{ x: 0, y: s, z: 0.02 }] };
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -hd, z1: hd }];
  return g;
}
