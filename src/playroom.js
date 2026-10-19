import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R, COURTYARD } from './config.js';

// #1319 / #1326: the playhouse's secret children's room. A hidden interior, far outside the walkable area (see PLAYROOM in
// config.js): the playhouse door teleports a player shorter than PLAYROOM.maxCm in, the door in the room's south wall back out.
// Nothing here is drawn (or has a draw call) while the visitor is outside: the whole group is hidden until `setInside(true)`.
// The room is empty for now (furniture: #1327, billiards: #1328 / #1329, sound: #1330).

const X0 = R.x - R.w / 2, X1 = R.x + R.w / 2, Z0 = R.z - R.d / 2, Z1 = R.z + R.d / 2;
const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const merged = (list, material) => { const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), material); mesh.receiveShadow = false; return mesh; };

/** Is (x, z) in the room (a metre of margin, so the whole body and the camera count)? */
export const inPlayroom = (x, z) => x > X0 - 1 && x < X1 + 1 && z > Z0 - 1 && z < Z1 + 1;

export class Playroom {
  constructor() {
    const t = 0.2, h = R.ceiling, dw = R.door.w / 2, dh = R.door.h;
    this.object = new THREE.Group();
    this.object.name = 'playroom';
    this.object.visible = false; // drawn only while the visitor is inside
    this.floorY = 0;
    this.ceiling = h;
    this.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
    // collision: the four inner walls (the exit is a door you use, not an opening)
    this.segments = [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X1, Z1, X0, Z1], [X0, Z1, X0, Z0]];
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    const walls = [box(X0 - t, X1 + t, 0, h, Z0 - t, Z0), box(X0 - t, X1 + t, 0, h, Z1, Z1 + t), box(X0 - t, X0, 0, h, Z0, Z1), box(X1, X1 + t, 0, h, Z0, Z1)];
    const trim = [box(X0, X1, 0, 0.12, Z0, Z0 + 0.02), box(X0, X1, 0, 0.12, Z1 - 0.02, Z1), box(X0, X0 + 0.02, 0, 0.12, Z0, Z1), box(X1 - 0.02, X1, 0, 0.12, Z0, Z1), // skirting
      box(R.x - dw - 0.07, R.x - dw, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x + dw, R.x + dw + 0.07, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x - dw - 0.07, R.x + dw + 0.07, dh, dh + 0.07, Z1 - 0.04, Z1)]; // door frame
    const door = [box(R.x - dw, R.x + dw, 0, dh, Z1 - 0.03, Z1)];
    const handle = [box(R.x + dw - 0.2, R.x + dw - 0.12, 0.72, 0.78, Z1 - 0.07, Z1 - 0.03)];
    const lamp = [box(R.x - 0.6, R.x + 0.6, h - 0.03, h, R.z - 0.6, R.z + 0.6)]; // a ceiling lamp panel (so the empty room reads lit)
    const parts = [
      merged(walls, mat(R.colors.wall)), merged(trim, mat(R.colors.trim)), merged(door, mat(R.colors.door)),
      merged([box(X0, X1, -0.1, 0, Z0, Z1)], mat(R.colors.floor)), merged([box(X0, X1, h, h + 0.1, Z0, Z1)], mat(R.colors.ceiling)),
      merged(handle, mat(0x2a2a2a, { metalness: 0.5, roughness: 0.5 })), merged(lamp, new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false })),
    ];
    for (const m of parts) { m.matrixAutoUpdate = false; this.object.add(m); }
    // the way out: an invisible pick box in front of the door (the raycaster ignores `visible: false` materials)
    this.exitTarget = { name: 'lekstugan', kind: 'playroomExit', verb: 'gå ut ur' };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(R.door.w + 0.1, R.door.h + 0.1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(R.x, (R.door.h + 0.1) / 2, Z1 - 0.2);
    pick.userData.door = this.exitTarget;
    this.exitTarget.pickable = pick;
    this.object.add(pick);
    this.inside = false;
  }

  contains(x, z) { return inPlayroom(x, z); }

  /** Where you stand when you come in (the door behind you, facing into the room). */
  get arrival() { return { x: R.x, z: Z1 - R.standOff, yaw: 0 }; }

  /** Drawn (and its exit pickable live) only while inside. */
  setInside(on) { this.inside = on; this.object.visible = on; }

  /** Where you stand when you come out: just north of the playhouse's door, facing away from it. */
  static get outsideSpot() {
    const P = COURTYARD.playhouse;
    return { x: (P.x0 + P.x1) / 2, z: P.z0 - R.outside, yaw: 0 };
  }
}
