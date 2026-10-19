import { Billiards } from './billiards.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R, COURTYARD } from './config.js';
import { restTarget } from './rest.js';

// #1319 / #1326: the playhouse's secret children's room. A hidden interior, far outside the walkable area (see PLAYROOM in
// config.js): the playhouse door teleports a player shorter than PLAYROOM.maxCm in, the door in the room's south wall back out.
// Nothing here is drawn (or has a draw call) while the visitor is outside: the whole group is hidden until `setInside(true)`.
// #1327: child-sized furniture (a sofa you can sit in, a stool, a TV, a gaming desk, a disco ball with sweeping light spots), no TV/game
// function yet (#1330) and the billiard table (#1328, billiards.js) stays in the middle. Everything is a few
// merged meshes (one vertex-coloured mesh for the shell, furniture and screens, the lamp, the ball, the spots): 4 draw calls, no extra lights, nothing outside.
// Rules/network: #1329, sound: #1330.

const X0 = R.x - R.w / 2, X1 = R.x + R.w / 2, Z0 = R.z - R.d / 2, Z1 = R.z + R.d / 2;
const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const hexRgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
/** A box with a vertex colour, so one material draws every piece (local metres from the room's centre). */
const paint = (g0, color) => {
  const g = g0.index ? g0.toNonIndexed() : g0, n = g.attributes.position.count, [r, gr, b] = hexRgb(color), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
};
const cbox = (color, x0, x1, y0, y1, z0, z1) => paint(box(R.x + x0, R.x + x1, y0, y1, R.z + z0, R.z + z1), color);
const rect = (x0, x1, z0, z1) => [[R.x + x0, R.z + z0], [R.x + x1, R.z + z0], [R.x + x1, R.z + z1], [R.x + x0, R.z + z1]]; // a footprint (convex, world)
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
    const walls = [box(X0 - t, X1 + t, 0, h, Z0 - t, Z0), box(X0 - t, X1 + t, 0, h, Z1, Z1 + t), box(X0 - t, X0, 0, h, Z0, Z1), box(X1, X1 + t, 0, h, Z0, Z1)];
    const trim = [box(X0, X1, 0, 0.12, Z0, Z0 + 0.02), box(X0, X1, 0, 0.12, Z1 - 0.02, Z1), box(X0, X0 + 0.02, 0, 0.12, Z0, Z1), box(X1 - 0.02, X1, 0, 0.12, Z0, Z1), // skirting
      box(R.x - dw - 0.07, R.x - dw, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x + dw, R.x + dw + 0.07, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x - dw - 0.07, R.x + dw + 0.07, dh, dh + 0.07, Z1 - 0.04, Z1)]; // door frame
    const door = [box(R.x - dw, R.x + dw, 0, dh, Z1 - 0.03, Z1)];
    const handle = [box(R.x + dw - 0.2, R.x + dw - 0.12, 0.72, 0.78, Z1 - 0.07, Z1 - 0.03)];
    const lamp = [box(R.x - 0.6, R.x + 0.6, h - 0.03, h, R.z - 0.6, R.z + 0.6)]; // a ceiling lamp panel (so the empty room reads lit)
    // ---- furniture (#1327), local metres from the room's centre: x east, z south (the door), y up
    const F = R.furniture, sf = F.sofa, sx0 = sf.x - sf.d / 2, sx1 = sf.x + sf.d / 2, sz0 = sf.z - sf.w / 2, sz1 = sf.z + sf.w / 2, seat = F.seatHeight;
    const col = { sofa: 0x2f7f86, cushion: 0x4bb0b6, back: 0xf2b84b, rug: 0xd96a4b, wood: 0x8a5a33, dark: 0x25272e, white: 0xf2f2f2, red: 0xd33a2c, blue: 0x2f6fd0, steel: 0x8b9099 };
    const DS = F.discoSwitch, third = sf.w / 3, tv = F.tv, tvz = sf.z, tvx = -R.w / 2, cd = 0.35; // the TV cabinet, as deep as `cd`, faces the sofa across the rug
    const fur = [
      cbox(col.rug, -2.8, sx1 + 0.1, 0, 0.012, tvz - 0.9, tvz + 0.9), // a rug under the sofa and the TV
      // the sofa: frame, back, arms, three seat cushions and three back cushions
      cbox(col.sofa, sx0, sx1, 0.04, seat - 0.14, sz0, sz1), cbox(col.sofa, sx1 - 0.17, sx1, seat - 0.14, 0.72, sz0, sz1),
      cbox(col.sofa, sx0, sx1 - 0.17, seat - 0.14, 0.54, sz0, sz0 + 0.14), cbox(col.sofa, sx0, sx1 - 0.17, seat - 0.14, 0.54, sz1 - 0.14, sz1),
      ...[0, 1, 2].flatMap((k) => [cbox(col.cushion, sx0 + 0.03, sx1 - 0.19, seat - 0.14, seat, sz0 + 0.14 + (third - 0.1) * k, sz0 + 0.14 + (third - 0.1) * (k + 1) - 0.01),
        cbox(col.back, sx1 - 0.25, sx1 - 0.17, seat, 0.64, sz0 + 0.16 + (third - 0.1) * k, sz0 + 0.14 + (third - 0.1) * (k + 1) - 0.03)]),
      // the TV cabinet on the west wall with a soundbar, the TV on a short stand, a frame round the (separate) screen
      cbox(col.wood, tvx, tvx + cd, 0, 0.42, tvz - 0.75, tvz + 0.75), cbox(col.dark, tvx + cd, tvx + cd + 0.002, 0.05, 0.38, tvz - 0.73, tvz + 0.73),
      cbox(col.dark, tvx + 0.1, tvx + 0.18, 0.42, 0.52, tvz - 0.15, tvz + 0.15), cbox(col.dark, tvx + 0.18, tvx + 0.28, 0.42, 0.47, tvz - 0.5, tvz + 0.5),
      cbox(col.dark, tvx + 0.03, tvx + 0.1, tv.y, tv.y + tv.h + 0.04, tvz - tv.w / 2 - 0.02, tvz + tv.w / 2 + 0.02),
      // the gaming desk on the east wall: top, two side panels, monitor on a stand, console, two controllers, keyboard
      cbox(col.wood, 2.65, 3.2, 0.54, 0.58, 0.3, 1.7), cbox(col.wood, 2.65, 3.2, 0, 0.54, 0.3, 0.34), cbox(col.wood, 2.65, 3.2, 0, 0.54, 1.66, 1.7),
      cbox(col.dark, 2.98, 3.08, 0.58, 0.72, 0.95, 1.05), cbox(col.dark, 2.96, 3.1, 0.58, 0.6, 0.85, 1.15), cbox(col.dark, 2.96, 3.02, 0.7, 1.08, 0.7, 1.3),
      cbox(col.white, 2.85, 3.12, 0.58, 0.64, 1.38, 1.62), cbox(col.blue, 2.85, 3.12, 0.64, 0.655, 1.38, 1.62),
      cbox(col.red, 2.78, 2.88, 0.58, 0.615, 0.4, 0.5), cbox(col.blue, 2.78, 2.88, 0.58, 0.615, 0.55, 0.65), cbox(col.dark, 2.72, 2.84, 0.58, 0.6, 0.85, 1.25),
      // the stool at the desk (its seat is a rest spot)
      cbox(col.red, F.stool.x - 0.2, F.stool.x + 0.2, F.stool.seat - 0.06, F.stool.seat, F.stool.z - 0.2, F.stool.z + 0.2),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cbox(col.steel, F.stool.x + a * 0.17 - 0.02, F.stool.x + a * 0.17 + 0.02, 0, F.stool.seat - 0.06, F.stool.z + b * 0.17 - 0.02, F.stool.z + b * 0.17 + 0.02)),
      // #1365: the light switch by the door (the disco ball, TV and PC are also targets themselves)
      cbox(col.white, DS.x - 0.05, DS.x + 0.05, DS.y - 0.07, DS.y + 0.07, R.d / 2 - 0.012, R.d / 2),
      // the disco ball's mount and cord
      cbox(col.steel, F.ball.x - 0.04, F.ball.x + 0.04, h - 0.03, h, F.ball.z - 0.04, F.ball.z + 0.04), cbox(col.steel, F.ball.x - 0.005, F.ball.x + 0.005, F.ball.y + F.ball.r, h - 0.03, F.ball.z - 0.005, F.ball.z + 0.005),
    ];
    const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const screens = [cbox(0x0b0f16, tvx + 0.1, tvx + 0.105, tv.y + 0.02, tv.y + tv.h + 0.02, tvz - tv.w / 2, tvz + tv.w / 2), cbox(0x0b0f16, 2.94, 2.96, 0.72, 1.06, 0.72, 1.28)];
    // collision: the furniture's footprints (convex polygons; getting up and `isFree` use them) and their edges as wall segments
    this.footprints = [rect(sx0, sx1, sz0, sz1), rect(tvx, tvx + cd, tvz - 0.75, tvz + 0.75), rect(2.65, 3.2, 0.3, 1.7), rect(F.stool.x - 0.2, F.stool.x + 0.2, F.stool.z - 0.2, F.stool.z + 0.2)];
    for (const q of this.footprints) for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; this.segments.push([a[0], a[1], b[0], b[1]]); }
    // the seats: the sofa (three places, facing the TV, west) and the stool (facing the desk, east); invisible pick boxes carry the E target
    this.targets = [];
    const seatAt = (name, verb, x, z, w, d, yaw, spots) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(R.x + x, 0.25, R.z + z); pick.rotation.y = yaw; pick.updateMatrixWorld(true);
      pick.userData.rest = { kind: 'sit', name, verb, spots };
      pick.userData.door = pick.userData.interact = restTarget(pick, { x: R.x + x, z: R.z + z, level: 0 }, 0);
      this.object.add(pick); this.targets.push(pick.userData.interact);
    };
    seatAt('soffan', 'sätta dig i', sf.x, sf.z, sf.w, sf.d, -Math.PI / 2, [0.5, 1.5, 2.5].map((k) => ({ x: -sf.w / 2 + third * k, y: seat, z: -0.08 })));
    seatAt('pallen', 'sätta dig på', F.stool.x, F.stool.z, 0.4, 0.4, Math.PI / 2, [{ x: 0, y: F.stool.seat, z: 0, aim: [0, 0] }]);
    this.object.userData.furnitureCount = fur.length;
    // the disco ball: a faceted silver sphere that turns, and light spots sweeping over the walls, floor and ceiling (one mesh, no real light)
    const bg0 = new THREE.IcosahedronGeometry(F.ball.r, 2), bg = bg0.index ? bg0.toNonIndexed() : bg0, bn = bg.attributes.position.count, bc = new Float32Array(bn * 3);
    for (let i = 0; i < bn; i += 3) { const f = Math.sin(i * 12.9898) * 43758.5453, v = 0.55 + 0.45 * (f - Math.floor(f)); for (let j = 0; j < 3; j++) bc.set([v, v, v * 1.04], (i + j) * 3); }
    bg.setAttribute('color', new THREE.BufferAttribute(bc, 3)); bg.deleteAttribute('uv');
    this.ball = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.ball.position.set(R.x + F.ball.x, F.ball.y, R.z + F.ball.z);
    this.object.add(this.ball);
    const N = F.ball.spots;
    this.rays = Array.from({ length: N }, (_, i) => { // fixed directions (a golden-angle spiral over the lower hemisphere + a little up), hue each
      const u = (i + 0.5) / N, y = 0.3 - 1.25 * u, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      return { d: [r * Math.cos(a), y, r * Math.sin(a)], c: new THREE.Color().setHSL((i * 0.137) % 1, 1, 0.5) };
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 12), 3));
    sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 8).map((_, k) => [0, 0, 1, 0, 1, 1, 0, 1][k % 8]), 2));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 12), 3));
    for (let k = 0; k < N; k++) for (let v = 0; v < 4; v++) this.rays[k].c.toArray(sg.attributes.color.array, k * 12 + v * 3);
    sg.setIndex(Array.from({ length: N }, (_, k) => [k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3]).flat());
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
    this.spots = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.spots.frustumCulled = false; this.spots.renderOrder = 2;
    this.object.add(this.spots);
    this.spin = 0;
    // #1365: the disco light can be switched off and on: from the wall switch by the door or by aiming at the ball itself. `onSwitch(name, on)` is the hook
    // for sound (#1330) and for syncing the state later; nothing is saved (the room persists no state) nor shared (local, like the room's props).
    this.discoOn = true; this.onSwitch = null; this.controlPickables = [];
    this.discoTarget = { kind: 'playroomDisco', name: 'discolampan', get verb() { return self.discoOn ? 'släcka' : 'tända'; } };
    const self = this;
    for (const [w, x, y, z, d] of [[0.16, DS.x, DS.y, F.discoSwitch.z, 0.06], [F.ball.r * 3, F.ball.x, F.ball.y, F.ball.z, F.ball.r * 3]]) {
      const pk = new THREE.Mesh(new THREE.BoxGeometry(w, w, d), new THREE.MeshBasicMaterial({ visible: false }));
      pk.position.set(R.x + x, y, R.z + z); pk.userData.door = this.discoTarget; this.discoTarget.pickable ??= pk;
      this.object.add(pk); this.controlPickables.push(pk);
    }
    this.disco(0);
    const C = R.colors, shell = [...walls.map((g) => paint(g, C.wall)), ...trim.map((g) => paint(g, C.trim)), ...door.map((g) => paint(g, C.door)), paint(box(X0, X1, -0.1, 0, Z0, Z1), C.floor), paint(box(X0, X1, h, h + 0.1, Z0, Z1), C.ceiling), ...handle.map((g) => paint(g, 0x2a2a2a))];
    const parts = [merged([...shell, ...fur, ...screens], furMat), merged(lamp, new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false }))]; // the shell, the furniture and the screens are one vertex-coloured mesh
    for (const m of parts) { m.matrixAutoUpdate = false; this.object.add(m); }
    // the way out: an invisible pick box in front of the door (the raycaster ignores `visible: false` materials)
    this.exitTarget = { name: 'lekstugan', kind: 'playroomExit', verb: 'gå ut ur' };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(R.door.w + 0.1, R.door.h + 0.1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(R.x, (R.door.h + 0.1) / 2, Z1 - 0.2);
    pick.userData.door = this.exitTarget;
    this.exitTarget.pickable = pick;
    this.object.add(pick);
    this.billiards = new Billiards();this.object.add(this.billiards.object);this.segments.push(...this.billiards.segments);
    this.inside = false;
  }

  update(dt,camera,aimed) { if(this.inside){this.billiards.update(dt,camera,aimed);if(this.discoOn)this.disco(dt);} }

  /** #1365: switch the disco light on or off (the ball stops and goes dull, the light spots vanish). Returns the badge text. */
  setDisco(on) {
    this.discoOn = !!on;
    this.ball.material.color.setScalar(this.discoOn ? 1 : 0.28);
    this.spots.visible = this.discoOn;
    this.onSwitch?.('disco', this.discoOn);
    return this.discoOn ? 'Discolampan är tänd' : 'Discolampan är släckt';
  }
  toggleDisco() { return this.setDisco(!this.discoOn); }

  /** Ambient light inside (day.lit): a touch dimmer with the disco on, so its colours read. */
  get lit() { return R.lit * (this.discoOn ? R.litDisco : 1); }

  /** The disco ball turns and its light spots sweep round the room (only while inside; each spot is where a fixed ray from the ball meets a wall, the floor or the ceiling). */
  disco(dt) {
    const F = R.furniture.ball, h = R.ceiling;
    this.spin += dt;
    this.ball.rotation.y = this.spin * F.spin * Math.PI * 2;
    const ox = R.x + F.x, oy = F.y, oz = R.z + F.z, a = this.spin * F.spotSpin * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), pos = this.spots.geometry.attributes.position.array;
    this.rays.forEach((ry, k) => {
      const dx = ry.d[0] * ca - ry.d[2] * sa, dy = ry.d[1], dz = ry.d[0] * sa + ry.d[2] * ca;
      let t = Infinity, nx = 0, ny = 0, nz = 0;
      const hit = (tt, ax, ay, az) => { if (tt > 0 && tt < t) { t = tt; nx = ax; ny = ay; nz = az; } };
      if (dx > 1e-6) hit((X1 - ox) / dx, -1, 0, 0); else if (dx < -1e-6) hit((X0 - ox) / dx, 1, 0, 0);
      if (dz > 1e-6) hit((Z1 - oz) / dz, 0, 0, -1); else if (dz < -1e-6) hit((Z0 - oz) / dz, 0, 0, 1);
      if (dy > 1e-6) hit((h - oy) / dy, 0, -1, 0); else if (dy < -1e-6) hit((0 - oy) / dy, 0, 1, 0);
      const px = ox + dx * t + nx * 0.012, py = oy + dy * t + ny * 0.012, pz = oz + dz * t + nz * 0.012, sz = 0.1 + 0.035 * t;
      // the quad's axes in the surface plane: side walls u = z, v = y; end walls u = x, v = y; floor / ceiling u = x, v = z
      const u = nx !== 0 ? [0, 0, 1] : [1, 0, 0], v = ny !== 0 ? [0, 0, 1] : [0, 1, 0];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let c = 0; c < 4; c++) {
        const [cu, cv] = corners[c], i = k * 12 + c * 3;
        pos[i] = px + (u[0] * cu + v[0] * cv) * sz * 0.5; pos[i + 1] = py + (u[1] * cu + v[1] * cv) * sz * 0.5; pos[i + 2] = pz + (u[2] * cu + v[2] * cv) * sz * 0.5;
      }
    });
    this.spots.geometry.attributes.position.needsUpdate = true;
  }

  contains(x, z) { return inPlayroom(x, z); }

  /** Where you stand when you come in (the door behind you, facing into the room). */
  get arrival() { return { x: R.x, z: Z1 - R.standOff, yaw: 0 }; }

  /** Drawn (and its exit pickable live) only while inside. */
  setInside(on) { this.inside = on; this.billiards.active = on; this.object.visible = on; }

  /** Where you stand when you come out: just north of the playhouse's door, facing away from it. */
  static get outsideSpot() {
    const P = COURTYARD.playhouse;
    return { x: (P.x0 + P.x1) / 2, z: P.z0 - R.outside, yaw: 0 };
  }
}
