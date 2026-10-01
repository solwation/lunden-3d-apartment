import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TOILET as T } from './config.js';

// Floor-standing toilet (Ifö Spira 6260) with a seat and a lid that opens/closes with E.
// Local frame: back against the wall at z = 0, bowl towards +z, y up from the floor.

const porcelain = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12 });
const water = new THREE.MeshStandardMaterial({ color: 0xb9d3dc, roughness: 0.05 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dadc, roughness: 0.15, metalness: 0.6 });

const ellipse = (rx, rz) => {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
  return s;
};

const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

function mesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Elliptic disc/ring (`hole` = inner ellipse scale) of thickness h, lying flat at y. */
function flat(rx, rz, h, y, material, hole = 0) {
  const s = ellipse(rx, rz);
  if (hole) s.holes.push(ellipse(rx * hole, rz * hole * 0.95));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: h * 0.3, bevelSize: h * 0.3, bevelSegments: 2, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return mesh(geo, material);
}

export class Toilet {
  /** side = the wall the tank stands against; (x, z) = middle of the back on that wall. */
  constructor(side, x, z, y0) {
    this.name = 'toalettlocket';
    this.kind = 'lid';
    this.isOpen = false;
    this.t = 0; // 0 = lid down, 1 = up
    const g = new THREE.Group();
    const bowlZ = T.tankDepth + (T.depth - T.tankDepth) / 2 - 0.02; // centre of the bowl
    const rx = T.width / 2, rz = (T.depth - T.tankDepth) / 2 + 0.01;
    const seat = T.seatHeight;
    // tank with flush button
    g.add(at(mesh(new RoundedBoxGeometry(T.width, T.tankHeight - 0.4, T.tankDepth, 3, 0.03), porcelain),
      0, (T.tankHeight + 0.4) / 2, T.tankDepth / 2));
    g.add(at(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), chrome), 0, T.tankHeight + 0.004, T.tankDepth / 2));
    // pedestal (tapering towards the floor) + neck to the tank
    const ped = mesh(new THREE.CylinderGeometry(1, 0.62, seat - 0.05, 32), porcelain);
    ped.scale.set(rx * 0.95, 1, rz * 0.95);
    ped.position.set(0, (seat - 0.05) / 2, bowlZ - 0.03);
    g.add(ped);
    g.add(at(mesh(new RoundedBoxGeometry(T.width * 0.75, seat - 0.02, 0.2, 2, 0.04), porcelain),
      0, (seat - 0.02) / 2, T.tankDepth + 0.06));
    // rim, water, seat
    g.add(at(flat(rx, rz, 0.03, seat - 0.06, porcelain, 0.72), 0, 0, bowlZ));
    g.add(at(flat(rx * 0.68, rz * 0.66, 0.002, seat - 0.16, water), 0, 0, bowlZ + 0.02));
    g.add(at(flat(rx * 0.98, rz * 0.98, 0.016, seat - 0.025, porcelain, 0.66), 0, 0, bowlZ));
    // lid: hinged at the back of the seat
    this.hinge = new THREE.Group();
    this.hinge.position.set(0, seat + 0.002, T.tankDepth + 0.03);
    const lid = flat(rx * 0.98, rz * 0.98, 0.014, 0, porcelain);
    lid.position.z = bowlZ - T.tankDepth - 0.03;
    this.hinge.add(lid);
    g.add(this.hinge);
    g.rotation.y = { west: Math.PI / 2, east: -Math.PI / 2, north: 0, south: Math.PI }[side];
    g.position.set(x, y0, z);
    this.object = g;
    // the whole toilet is the pick target (looking at the bowl is enough)
    this.pickable = g;
    g.traverse((o) => { o.userData.door = this; });
  }

  toggle() { this.isOpen = !this.isOpen; }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.hinge.rotation.x = -e * THREE.MathUtils.degToRad(93); // rests just short of the tank
  }
}
