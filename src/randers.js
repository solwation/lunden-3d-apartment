// JYSK RANDERS tray table by the living-room armchair (#405, RANDERS in config; docs/sidobord-jysk-randers-*.jpg): a
// round powder-coated steel tray with a raised rim lying on a square of thin rails, four thin straight legs on a 32 × 32
// square, a cross of two diagonal rails low down meeting in a small hub, small foot caps. Dark purple instead of JYSK's
// black (the user). One mesh for the steel, one for the caps (furniture.js merges per material).
import * as THREE from 'three';
import { RANDERS } from './config.js';

/** A builder (furniture.js BUILDERS): local origin = the floor under the tray's centre. `item.flower` = the little pot
 * plant at local `item.flowerAt` (a Thing, #185), built by furniture.js's `flower` (passed in). */
export function randers(item, _lights, flower) {
  const R = RANDERS, g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: R.color, roughness: R.rough, metalness: R.metal, side: THREE.DoubleSide });
  const caps = new THREE.MeshStandardMaterial({ color: R.caps, roughness: 0.7 });
  const r = R.d / 2, top = R.h, bottom = top - R.rim, t = R.sheet, hs = R.legs / 2, lr = R.leg / 2;
  // the tray: floor, the rim rising with a slight flare, a rolled lip (one lathe, open both sides)
  const prof = [[0, bottom + t], [r - 0.02, bottom + t], [r - 0.012, bottom + t + 0.004], [r - 0.006, top - 0.004], [r - 0.004, top],
    [r, top], [r, top - 0.004], [r - t - 0.002, bottom + 0.004], [r - 0.016, bottom], [0, bottom]];
  const tray = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 64), steel);
  g.add(tray);
  const rod = (x0, y0, z0, x1, y1, z1, rad) => { // a thin round bar from one point to another
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10), steel);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  };
  const corners = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
  const railY = bottom - R.rail; // the square the tray lies on
  for (const [x, z] of corners) {
    rod(x, R.cap, z, x, railY + R.rail * 0.5, z, lr);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(lr + 0.002, lr + 0.003, R.cap, 10), caps);
    c.position.set(x, R.cap / 2, z);
    g.add(c);
  }
  corners.forEach(([x, z], i) => { const [x1, z1] = corners[(i + 1) % 4]; rod(x, railY, z, x1, railY, z1, R.thin); });
  // the low cross and its hub
  rod(-hs, R.cross, -hs, hs, R.cross, hs, R.thin);
  rod(hs, R.cross, -hs, -hs, R.cross, hs, R.thin);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), steel);
  hub.position.y = R.cross;
  g.add(hub);
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  const floorY = bottom + t; // things stand on the tray's floor
  const s = r - 0.075; // a square well inside the rim (a cup stands clear of it)
  g.userData.surfaces = [{ x0: -s, x1: s, z0: -s, z1: s, y: floorY }];
  if (item.flower) {
    const f = flower();
    const [fx, fz] = item.flowerAt ?? [0, 0];
    f.position.set(fx, floorY, fz);
    g.add(f);
    g.userData.keep = [f];
    g.userData.things = [{ model: f, kind: 'plant', back: 'sidobordet' }];
  }
  // round: a square with its corners cut (three overlapping rects ≈ an octagon round the tray)
  const c45 = r * Math.SQRT1_2, q = r * 0.41;
  g.userData.footprint = [{ x0: -r, x1: r, z0: -q, z1: q }, { x0: -q, x1: q, z0: -r, z1: r }, { x0: -c45, x1: c45, z0: -c45, z1: c45 }];
  return g;
}
