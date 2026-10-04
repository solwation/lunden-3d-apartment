import * as THREE from 'three';
import { DISHWASHER as D } from './config.js';
import { Openable, pivotAround } from './openables.js';

// The dishwasher's racks (#384, LIFE-020): the integrated KEZA9310W (interior.js) gets two wire racks that roll out with E
// while its door is folded down — an Openable 'drawer' each, in world.lids — and a cutlery tray riding on the upper one.
// Each rack carries slots for the life sim (stores.js): the lower rack plates standing on edge, the upper one glasses upside
// down, the tray the knives and the cheese slicer lying along it. Only the door down lets a rack out, and the door does not
// fold up while a rack is out (their `blocked`). Numbers: DISHWASHER in config (our picks; no product drawing).

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Build the racks inside the machine. ctx: { F (interior.js frame), u0, u1, yb (the tub's bottom), door (its flap
 * Openable), open ({ group, list }), batch () → a Batch, onBatch, chrome (material), FT }. Returns the racks.
 */
export function buildRacks({ F, u0, u1, yb, door, open, batch, onBatch, chrome, FT }) {
  const d0 = -F.depth + 0.05, d1 = -FT - 0.035, w = 0.003; // the racks' depth range (in front of the plane = 0); wire thickness
  const world = (u, d, y) => { const [x, z] = F.at(u, d); return new THREE.Vector3(x, y, z); };
  const out = new THREE.Vector3().subVectors(world(u0, 1, 0), world(u0, 0, 0)).normalize(); // the way the front faces
  const along = new THREE.Vector3().subVectors(world(u0 + 1, 0, 0), world(u0, 0, 0)).normalize(); // across the front (u)
  const a0 = u0 + 0.03, a1 = u1 - 0.03;
  const racks = [];
  const rack = (name, y, h, build) => {
    const OB = batch(), P = onBatch(F, OB);
    // a wire basket: the rim top and bottom, the corners, wires across the floor
    for (const yy of [y, y + h]) {
      P.box(a0, a1, d0, d0 + w, yy, yy + w, chrome); P.box(a0, a1, d1 - w, d1, yy, yy + w, chrome);
      P.box(a0, a0 + w, d0, d1, yy, yy + w, chrome); P.box(a1 - w, a1, d0, d1, yy, yy + w, chrome);
    }
    for (const [u, d] of [[a0, d0], [a1, d0], [a0, d1 - w], [a1 - w, d1 - w]]) P.box(u, u + w, d, d + w, y, y + h, chrome);
    for (let k = 1; k < 12; k++) { const u = a0 + (a1 - a0) * k / 12; P.box(u, u + w, d0, d1, y, y + w, chrome); }
    for (let k = 1; k < 8; k++) { const d = d0 + (d1 - d0) * k / 8; P.box(a0, a1, d, d + w, y, y + w, chrome); }
    const slots = build(P, y, h);
    const at = world((a0 + a1) / 2, 0, y);
    const o = new Openable({ name, object: pivotAround(OB.meshes(), at), mode: 'drawer', out: out.clone().multiplyScalar(D.out).toArray(), speed: 2 });
    o.normal = out.clone();
    o.stock = 'own'; // (the life sim's slots: no static contents)
    o.slots = slots;
    o.box = [world(a0, d0, y), world(a1, d1, y + h)].reduce((b, p) => b.expandByPoint(p), new THREE.Box3());
    Object.defineProperties(o, {
      verb: { get: () => (o.isOpen ? 'skjuta in' : 'dra ut'), configurable: true },
      blocked: { get: () => !door.isOpen && !o.isOpen, configurable: true },
      blockedText: { get: () => 'Fäll ner luckan först', configurable: true },
    });
    o.door = door;
    open.group.add(o.object);
    open.list.push(o);
    racks.push(o);
    return o;
  };
  // a slot: its world pose (position + the turn of the thing in it), size, what it takes
  const slot = (p, q, size, accepts) => ({ pos: p, quat: q, size, accepts });
  // plates on edge: their face across the machine (the plate's axis along u), in a row along u
  const plateQ = new THREE.Quaternion().setFromUnitVectors(UP, along);
  const glassQ = new THREE.Quaternion().setFromAxisAngle(along, Math.PI); // upside down
  const toolQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), out.clone().negate()); // lying along the depth
  const dm = (d0 + d1) / 2;
  rack('underkorgen', yb + D.lower.y, D.lower.h, (P, y) => {
    const n = D.lower.plates, list = [];
    for (let k = 0; k < n; k++) {
      const u = a0 + 0.06 + (a1 - a0 - 0.12) * k / Math.max(1, n - 1);
      for (const dd of [dm - 0.11, dm + 0.11]) P.box(u - 0.016, u - 0.013, dd - 0.002, dd + 0.002, y, y + 0.07, chrome); // the tines between the plates
      list.push(slot(world(u, dm, y + 0.137), plateQ, 'm', ['plate']));
    }
    return list;
  });
  rack('överkorgen', yb + D.upper.y, D.upper.h, (P, y, h) => {
    const list = [];
    for (const dd of [dm - 0.1, dm + 0.1]) for (let k = 0; k < D.upper.glasses / 2; k++) {
      const u = a0 + 0.09 + (a1 - a0 - 0.18) * k / Math.max(1, D.upper.glasses / 2 - 1);
      list.push(slot(world(u, dd, y + 0.112), glassQ, 's', ['glass']));
    }
    // the cutlery tray on top of it (rides with it): a shallow wire tray, the tools lying front to back
    const ty = y + h + 0.02;
    for (let k = 0; k <= 10; k++) { const u = a0 + 0.02 + (a1 - a0 - 0.04) * k / 10; P.box(u, u + w, d0 + 0.02, d1 - 0.02, ty, ty + w, chrome); } // its floor: wires front to back
    for (const d of [d0 + 0.02, d1 - 0.02 - w]) P.box(a0 + 0.02, a1 - 0.02, d, d + w, ty, ty + w, chrome);
    for (const [ua, ub] of [[a0 + 0.02, a0 + 0.023], [a1 - 0.023, a1 - 0.02]]) P.box(ua, ub, d0 + 0.02, d1 - 0.02, ty, ty + 0.02, chrome);
    for (let k = 0; k < D.tray; k++) list.push(slot(world(a0 + 0.12 + k * 0.09, dm, ty + 0.004), toolQ, 's', ['tool']));
    return list;
  });
  // the door does not fold up over a rack that is out
  Object.defineProperties(door, {
    blocked: { get: () => door.isOpen && racks.some((r) => r.isOpen || r.t > 0.02), configurable: true },
    blockedText: { get: () => 'Skjut in korgarna först', configurable: true },
  });
  door.racks = racks;
  return racks;
}
