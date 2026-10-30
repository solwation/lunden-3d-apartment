import * as THREE from 'three';
import { ELCABINET as E } from './config.js';

// The electrical cabinet's fixed sheet-metal body (#1707, elcabinet.js): plain geometry data without scene or audio imports,
// so street.js can merge it into its metal pole batch (the cabinet costs no draw call of its own) and farwalk.js can make it
// solid. Local frame: origin at the back's bottom centre, +x across, +y up, +z out of the front (the door side);
// `E.yaw` turns it into the world.

export const doorT = 0.015; // the door's thickness (m)
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Local → world placement for a cabinet whose bottom is at `y0`. */
export const placeCabinet = (g, y0) => g.rotateY(THREE.MathUtils.degToRad(E.yaw)).translate(E.x, y0, E.z);

/** The cabinet's corners on the ground [[x, z] …] (world). */
export function cabinetCorners() {
  const a = THREE.MathUtils.degToRad(E.yaw), c = Math.cos(a), s = Math.sin(a);
  return [[-E.w / 2, 0], [E.w / 2, 0], [E.w / 2, E.d], [-E.w / 2, E.d]].map(([u, v]) => [E.x + u * c + v * s, E.z - u * s + v * c]);
}

/** The bottom height: the highest ground under its corners, sunk `plinth` m into it (no gap on a slope). */
export const cabinetY = (ground) => Math.max(...cabinetCorners().map(([x, z]) => ground(x, z))) - E.plinth;

/** The fixed body (back, sides, bottom, shelf, lid with a small overhang, plinth) in world coordinates. `ground`: the
 * terrain height function the street uses (street.js `pathGround`; main.js passes the same one for the door). */
export function cabinetBodyParts(ground) {
  const { w, d, h, wall: t, roof, shelf } = E, y0 = cabinetY(ground);
  return [
    box(w, h, t, 0, h / 2, t / 2),                                   // the back
    box(t, h, d - doorT, -w / 2 + t / 2, h / 2, (d - doorT) / 2),     // the sides (the door closes in front of them)
    box(t, h, d - doorT, w / 2 - t / 2, h / 2, (d - doorT) / 2),
    box(w, t, d - doorT, 0, E.plinth + t / 2, (d - doorT) / 2),       // the bottom
    box(w - 2 * t, t, d - doorT - t, 0, shelf - t / 2, (d - doorT + t) / 2), // the shelf the cans stand on
    box(w + 0.03, roof, d + 0.03, 0, h + roof / 2, d / 2),            // the lid, a little proud all round
  ].map((g) => placeCabinet(g, y0));
}

/** The solid box at the ground for collision ({ x0, x1, z0, z1 }, farwalk.js), the door's swing not included. */
export function cabinetSolid() {
  const c = cabinetCorners(), xs = c.map((p) => p[0]), zs = c.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
