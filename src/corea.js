import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CORE_A as C, SITE, PLAYER, POWER } from './config.js';
import { box, panelX, panelZ, complement, labelTexture, makeDoor, shade, Lift } from './core.js';
import { architectureEdges } from './architectureedges.js';

// Hus A's stair core (#637, CORE_A in config; the sources and the assumptions are listed there): a walkable stair hall and
// a lift from the basement (våning −1) to våning 4, the main entrance's glazed door in the courtyard recess (våning 1)
// and the lobby behind it. Same interface as Hus L's Core (core.js, #415), which asks this one too (`Core.attach`):
// `covers` (plan), `contains` (plan + height: then walls collide), `heights` (every floor / flight / the car at a point),
// `segments` (the walls in the way), `dynamic` (the door leaf, the lift's doors), `snap` (riding), `roomAt`, `update`.
// Drawing: MeshBasic with the lights baked into vertex colours, like core.js, drawn only near the camera.
// The basement's lobby east of the band, the förråd corridor and the west passage are the garage's rects (GARAGE
// `coreA*`); on våning −1 only the band (rect `coreA`) and the lift belong here.

const Y = C.stops, LAB = C.labels, NS = Y.length, H = Y[1] - Y[0];
const B = C.band, ST = C.stair, SH = C.shaft, LB = C.lobby, EN = C.entrance;
const CEILTOP = Y[NS - 1] + C.ceilingTop, SLAB = C.slab;
const [WL0, WL1] = ST.well, WM = (WL0 + WL1) / 2;
const A = SITE.blocks.find((b) => b.name === 'Hus A'), REC = A.recesses.find((r) => r.face === 'n' && r.door != null);
/** The recess's back wall (the entrance door's line). */
export const ENTRANCE_Z = A.z0 + REC.depth;
const XM = (B.x0 + B.x1) / 2, RUN = ST.run - ST.top, TREADS = ST.risers - 1, TD = RUN / TREADS, RISE = H / 2 / ST.risers;
const between = (v, a, b) => v > a && v < b;
/** Flight k's walking line at z: the west flight (up from the hall edge, 1) and the east one (back to the next floor, 2). */
const ramp1 = (k, z) => Y[k] + (z - ST.top) / RUN * (H / 2);
const ramp2 = (k, z) => Y[k] + H / 2 + (ST.run - z) / RUN * (H / 2);
/** våning 1's lobby as plan rectangles [x0, x1, z0, z1]: north of the shaft (from the door), beside it, in front of the lift. */
const LOBBY = [[LB.x0, LB.x1, ENTRANCE_Z - 0.06, LB.shaftNorth], [LB.shaftEast, LB.x1, LB.shaftNorth, B.z0], [B.x1, LB.x1, B.z0, LB.z1]];
const inRect = (r, x, z) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const DOOR_W = EN.door[1] - EN.door[0];

// the lights baked into the colours: over the hall on every storey, under each landing, over the top landing, in the lobby
const LIGHTS = [...Y.map((y, j) => [XM, (j < NS - 1 ? Y[j + 1] - SLAB : CEILTOP) - 0.05, (B.z0 + ST.top) / 2]),
  ...Y.slice(0, NS - 1).map((y) => [XM, y + H / 2 - SLAB - 0.05, (ST.run + B.z1) / 2]),
  [XM, CEILTOP - 0.05, (ST.top + B.z1) / 2],
  [1.35, Y[2] - SLAB - 0.05, 32.4], [1.8, Y[2] - SLAB - 0.05, 35.6], [1.6, Y[2] - SLAB - 0.05, 38.2]];
function light(x, y, z) {
  let s = 0.3;
  for (const [lx, ly, lz] of LIGHTS) s += 0.75 / (1 + ((x - lx) ** 2 + ((y - ly) * 1.2) ** 2 + (z - lz) ** 2) / 5);
  return Math.min(1.15, s);
}
function bake(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.userData.edgePlane = geo.type === 'PlaneGeometry'; // keeps construction primitives for the edge filter (as core.js)
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position, c = new THREE.Color(hex), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const l = light(p.getX(i), p.getY(i), p.getZ(i)) * shade(n.getX(i), n.getY(i), n.getZ(i)); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
  g.deleteAttribute('normal');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class CoreA {
  constructor() {
    const group = new THREE.Group(); this.object = group; this.house = 'Hus A';
    const geo = { wall: [], stair: [], rail: [], light: [], glass: [] };
    this.walls = []; // { s: [ax, az, bx, bz], y0, y1 }
    const WALL = 0xeeeeea, STAIR = 0xb9b6ae, RAIL = 0x7f868c, FRAME = 0x3b4247, CEILC = 0xdedcd6;
    const wallX = (x, z0, z1, y0, y1, holes = [], collide = true) => {
      for (const [a, b, ya, yb] of complement(z0, z1, y0, y1, holes)) {
        geo.wall.push(bake(panelX(x, a, b, ya, yb), WALL));
        if (collide) this.walls.push({ s: [x, a, x, b], y0: ya, y1: yb });
      }
    };
    const wallZ = (z, x0, x1, y0, y1, holes = [], collide = true) => {
      for (const [a, b, ya, yb] of complement(x0, x1, y0, y1, holes)) {
        geo.wall.push(bake(panelZ(z, a, b, ya, yb), WALL));
        if (collide) this.walls.push({ s: [a, z, b, z], y0: ya, y1: yb });
      }
    };
    const slab = (x0, x1, z0, z1, y) => { if (z1 > z0 + 1e-3 && x1 > x0 + 1e-3) geo.stair.push(bake(box(x0, x1, y - SLAB, y, z0, z1), STAIR)); };
    const yTop = (j) => (j < NS - 1 ? Y[j + 1] - SLAB : CEILTOP); // storey j's ceiling (the next floor's underside)
    const dh = SH.door; // the lift doors' x range

    // ---- the hall band: west and east walls, south wall, the lift's front wall with a door at every stop
    const wb = C.basement, WEST0 = [{ a0: wb.west[0], a1: wb.west[1], y0: Y[0], y1: Y[0] + wb.height }];
    wallX(B.x0, B.z0, B.z1, Y[0], CEILTOP, WEST0);
    wallX(B.x1, B.z0, B.z1, Y[0], CEILTOP, [{ a0: wb.east[0], a1: wb.east[1], y0: Y[0], y1: Y[0] + wb.height }, { a0: B.z0, a1: LB.z1, y0: Y[1], y1: Y[1] + 2.3 }]);
    wallZ(B.z1, B.x0, B.x1, Y[0], CEILTOP);
    wallZ(B.z0, B.x0, B.x1, Y[0], CEILTOP, Y.map((y) => ({ a0: dh[0], a1: dh[1], y0: y, y1: y + 2.1 })));
    wallZ(B.z0, B.x1, LB.shaftEast, Y[1], Y[2] - SLAB); // (våning 1: the shaft's corner on the lobby's side)
    // the lift: a reveal through the front wall at every stop, the shaft's walls, its cap
    for (const y of Y) {
      for (const x of dh) { geo.wall.push(bake(panelX(x, SH.front, B.z0, y, y + 2.1), WALL)); this.walls.push({ s: [x, SH.front, x, B.z0], y0: y, y1: y + 2.1 }); }
      geo.wall.push(bake(box(dh[0], dh[1], y + 2.1, y + 2.12, SH.front, B.z0), WALL), bake(box(dh[0], dh[1], y - 0.2, y + 0.003, SH.front, B.z0), STAIR));
    }
    wallX(SH.x0, SH.back, SH.front, Y[0], CEILTOP); wallX(SH.x1, SH.back, SH.front, Y[0], CEILTOP); wallZ(SH.back, SH.x0, SH.x1, Y[0], CEILTOP);
    geo.stair.push(bake(box(SH.x0, SH.x1, CEILTOP, CEILTOP + 0.1, SH.back - SH.wall, B.z0), CEILC));
    // ---- våning 1's lobby (the basement's is the garage's): walls in y Y1 … Y2 − slab
    const y1a = Y[1], y1b = Y[2] - SLAB;
    wallX(LB.x0, ENTRANCE_Z, LB.shaftNorth, y1a, y1b);                                         // its west wall
    wallZ(LB.shaftNorth, LB.x0, LB.shaftEast, y1a, y1b);                                       // the shaft's north face
    wallX(LB.shaftEast, LB.shaftNorth, B.z0, y1a, y1b);                                        // … and east face
    wallX(LB.x1, ENTRANCE_Z, LB.z1, y1a, y1b);                                                 // the east wall
    wallZ(LB.z1, B.x1, LB.x1, y1a, y1b);                                                       // the south wall of the lift lobby
    // the entrance wall: the sidelight (fixed, glass in a frame), the door's opening, the solid rest; the recess back wall outside is cut the same
    const [sd0, sd1] = EN.side, [dr0, dr1] = EN.door, EH = EN.height;
    wallZ(ENTRANCE_Z, LB.x0, LB.x1, y1a, y1b, [{ a0: sd0, a1: dr1, y0: y1a, y1: y1a + EH }], false);
    this.walls.push({ s: [LB.x0, ENTRANCE_Z, sd0, ENTRANCE_Z], y0: y1a, y1: y1b }, { s: [sd0, ENTRANCE_Z, sd1, ENTRANCE_Z], y0: y1a, y1: y1a + EH }, { s: [dr1, ENTRANCE_Z, LB.x1, ENTRANCE_Z], y0: y1a, y1: y1b },
      { s: [sd1, ENTRANCE_Z, dr0, ENTRANCE_Z], y0: y1a, y1: y1a + EH }, { s: [LB.x0, ENTRANCE_Z, LB.x1, ENTRANCE_Z], y0: y1a + EH, y1: y1b });
    geo.glass.push(panelZ(ENTRANCE_Z + 0.02, sd0 + 0.04, sd1 - 0.04, y1a + 0.05, y1a + EH - 0.05));
    for (const [a, b, c, d] of [[sd0, sd0 + 0.05, y1a, y1a + EH], [sd1 - 0.05, dr0 + 0.05, y1a, y1a + EH], [sd0, sd1, y1a + EH - 0.05, y1a + EH], [sd0, sd1, y1a, y1a + 0.05]]) geo.rail.push(bake(box(a, b, c, d, ENTRANCE_Z, ENTRANCE_Z + 0.06), FRAME));
    // the doorway's jambs (the opening through the wall) and a sill
    geo.rail.push(bake(box(dr0 - 0.02, dr1, y1a + EH, y1a + EH + 0.05, ENTRANCE_Z - 0.04, ENTRANCE_Z + 0.06), FRAME));
    geo.stair.push(bake(box(dr0, dr1, y1a - 0.05, y1a + 0.003, ENTRANCE_Z - 0.2, ENTRANCE_Z + 0.2), STAIR));
    // ---- the flats' doors in the band's west wall (closed: a leaf, an architrave, a lever), every storey
    const FD = C.flatDoors, [fz0, fz1] = FD.west;
    for (const y of Y) {
      geo.rail.push(bake(box(B.x0, B.x0 + 0.035, y, y + FD.height, fz0, fz1), 0x7a6248), bake(box(B.x0, B.x0 + 0.045, y, y + FD.height + 0.07, fz0 - 0.07, fz0), 0xf0eee8),
        bake(box(B.x0, B.x0 + 0.045, y, y + FD.height + 0.07, fz1, fz1 + 0.07), 0xf0eee8), bake(box(B.x0, B.x0 + 0.045, y + FD.height, y + FD.height + 0.07, fz0, fz1), 0xf0eee8),
        bake(box(B.x0 + 0.035, B.x0 + 0.075, y + 1.04, y + 1.07, fz1 - 0.2, fz1 - 0.06), 0xb8bcbf));
    }
    geo.stair.push(bake(box(B.x0, B.x1, Y[0] - 0.05, Y[0] + 0.003, B.z0, B.z1), STAIR)); // våning −1's floor (the garage leaves this rect's floor to us)
    // ---- the floors: the hall (z B.z0 … the stair's top edge), the lobby on våning 1; the stair hole is open above every flight
    for (let j = 1; j < NS; j++) slab(B.x0, B.x1, B.z0, ST.top, Y[j]);
    for (const [x0, x1, z0, z1] of LOBBY) { slab(x0, x1, z0, z1, Y[1]); slab(x0, x1, z0, z1, Y[2]); }
    geo.stair.push(bake(box(B.x0, B.x1, CEILTOP, CEILTOP + 0.05, ST.top, B.z1), CEILC)); // the top storey's ceiling over the stair
    // ---- the flights: solid steps, a sloped soffit, a handrail on the wall, balusters and a rail on the stringer side
    const spanXs = [[B.x0, WL0], [WL1, B.x1]];
    for (let k = 0; k < NS - 1; k++) {
      slab(B.x0, B.x1, ST.run, B.z1, Y[k] + H / 2); // the landing
      const ang = Math.atan2(H / 2, RUN), slen = Math.hypot(RUN, H / 2), t = 0.26;
      for (const f of [1, 2]) {
        const [xa, xb] = spanXs[f - 1];
        for (let i = 1; i <= TREADS; i++) {
          const top = (f === 1 ? Y[k] : Y[k] + H / 2) + i * RISE;
          const za = f === 1 ? ST.top + (i - 1) * TD : ST.run - i * TD, zb = za + TD;
          geo.stair.push(bake(box(xa, xb, top - 2 * RISE - 0.02, top, za, zb), STAIR));
        }
        const my = (f === 1 ? Y[k] + H / 4 : Y[k] + H * 0.75) - RISE - (t / 2) / Math.cos(ang), mz = (ST.top + ST.run) / 2;
        geo.stair.push(bake(new THREE.BoxGeometry(xb - xa, t, slen).rotateX(f === 1 ? -ang : ang).translate((xa + xb) / 2, my, mz), STAIR));
        const my2 = (f === 1 ? Y[k] + H / 4 : Y[k] + H * 0.75) + 0.9;
        for (const [xr, rr] of f === 1 ? [[B.x0 + 0.05, 0.02], [WL0 - 0.02, 0.025]] : [[WL1 + 0.02, 0.025], [B.x1 - 0.05, 0.02]])
          geo.rail.push(bake(new THREE.CylinderGeometry(rr, rr, slen, 6).rotateX(Math.PI / 2).rotateX(f === 1 ? -ang : ang).translate(xr, my2, mz), RAIL));
        const xs = f === 1 ? WL0 - 0.03 : WL1 + 0.01;
        for (let z = ST.top + 0.06; z < ST.run - 0.02; z += 0.2) { const yy = f === 1 ? ramp1(k, z) : ramp2(k, z); geo.rail.push(bake(box(xs, xs + 0.02, yy - 0.05, yy + 0.9, z - 0.01, z + 0.01), RAIL)); }
      }
      this.walls.push({ s: [WM, ST.top, WM, ST.run], y0: Y[k] - 0.5, y1: Y[k + 1] + 1.2 }); // the stringer between the flights
    }
    // the top storey: the hole beside the arriving flight is guarded across the hall's south edge (as Hus L's #625)
    {
      const y = Y[NS - 1], zr = ST.top + 0.02;
      geo.rail.push(bake(box(B.x0, WL0 + 0.05, y + ST.guard - 0.04, y + ST.guard, zr - 0.025, zr + 0.025), RAIL), bake(box(B.x0, WL0 + 0.04, y - 0.2, y + 0.06, zr - 0.02, zr + 0.02), RAIL));
      for (let x = B.x0 + 0.06; x < WL0; x += 0.125) geo.rail.push(bake(box(x - 0.01, x + 0.01, y, y + ST.guard - 0.02, zr - 0.01, zr + 0.01), RAIL));
      this.walls.push({ s: [B.x0, zr, WL1, zr], y0: y - 0.5, y1: y + 1.2 });
    }
    // våning −1: the space under the arriving flight is closed off (a wall at the hall's edge up to its soffit)
    const soffit = Y[1] - 0.3;
    wallZ(ST.top, WL1, B.x1, Y[0], soffit, [], false);
    this.walls.push({ s: [WL1, ST.top, B.x1, ST.top], y0: Y[0] - 0.5, y1: soffit });
    // the lights and the floor numbers (on the hall's west wall by the lift, clear of the flats' door)
    for (const [x, y, z] of LIGHTS) geo.light.push(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16).translate(x, y + 0.02, z));
    const nums = labelTexture(128 * NS, 128, (g) => { g.fillStyle = '#eeeeea'; g.fillRect(0, 0, 128 * NS, 128); g.fillStyle = '#1d4f8c'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; LAB.forEach((l, i) => g.fillText(l, 64 + i * 128, 68)); });
    const numGeos = Y.map((y, k) => {
      const g = new THREE.PlaneGeometry(0.5, 0.5).rotateY(Math.PI / 2).translate(B.x0 + 0.025, y + 1.7, B.z0 + 1.9), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / NS, uv.getY(i));
      return g;
    });
    const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.userData.edgeSources = geos; m.raycast = () => {}; group.add(m); return m; };
    this.mats = { wall: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), light: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    add([...geo.wall, ...geo.stair, ...geo.rail], this.mats.wall);
    add(geo.light, this.mats.light);
    add(numGeos, new THREE.MeshBasicMaterial({ map: nums.t }));
    add(geo.glass, new THREE.MeshBasicMaterial({ color: 0xbfd3dc, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    // the entrance door: glazed, hinged at its east jamb, opening out into the recess
    this.doors = [makeDoor(group, { hx: dr1, hz: ENTRANCE_Z, dir: [-1, 0], out: [0, -1], w: DOOR_W, y: Y[1], name: 'porten till trapphus A', glazed: true })];
    this.doors.forEach((t) => this.placeDoor(t.door));
    // the lift: the car at the north end of the band, its door south
    this.lift = new Lift(group, { ...C.lift, x0: SH.x0, x1: SH.x1, z0: SH.front, z1: SH.back, door: SH.door, Y, floors: LAB, dz: -1, landing: B.z0, btnX: SH.door[0] - 0.22, start: 1 });
    this.targets = [...this.doors, ...this.lift.targets];
    this.edgeLines = architectureEdges(group, { moving: [...this.doors.map((t) => t.door.pivot), this.lift.car, ...this.lift.carDoors, ...this.lift.landing.flat()] });
    group.traverse((o) => { delete o.userData.edgeSources; });
  }

  placeDoor(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
    d.pivot.rotation.y = Math.atan2(-dz, dx);
  }

  setPower(on) {
    this.mats.wall.color.setScalar(on ? 1 : POWER.emergency);
    this.mats.light.color.setScalar(on ? 1 : 0.2);
    this.lift.mains(on);
  }

  /** The hall, the lift and the lobby in plan (no height). */
  covers(x, z) {
    return between(x, B.x0 - 0.02, B.x1 + 0.02) && between(z, B.z0 - 0.35, B.z1 + 0.02) || between(x, SH.x0, SH.x1) && between(z, SH.back, B.z0 + 0.01) || LOBBY.some((r) => inRect(r, x, z));
  }

  /** Is the visitor (feet at y) in the hall, the lift or the lobby? */
  contains(x, z, y) {
    if (!(y > Y[0] - 0.4 && y < CEILTOP)) return false;
    if (between(x, SH.x0, SH.x1) && between(z, SH.back, B.z0 + 0.01)) return true;
    if (between(x, B.x0 - 0.02, B.x1 + 0.02) && between(z, B.z0 - 0.01, B.z1 + 0.02)) return true;
    return y > Y[1] - 0.4 && y < Y[2] - 0.2 && LOBBY.some((r) => inRect(r, x, z));
  }

  /** Every floor / flight surface at (x, z) (the player takes the highest it can step onto). */
  heights(x, z) {
    const out = [];
    if (between(x, SH.x0 + 0.05, SH.x1 - 0.05) && between(z, SH.back, SH.front)) { out.push(this.lift.y); return out; }
    if (between(x, SH.door[0], SH.door[1]) && z >= SH.front - 0.01 && z <= B.z0 + 0.01) out.push(...Y); // the doorway through the front wall
    if (LOBBY.some((r) => inRect(r, x, z))) out.push(Y[1]);
    if (!between(x, B.x0, B.x1) || z < B.z0 || z > B.z1) return out;
    if (z <= ST.top) { for (let j = 0; j < NS; j++) out.push(Y[j]); return out; }
    for (let k = 0; k < NS - 1; k++) {
      if (z >= ST.run) out.push(Y[k] + H / 2);
      else if (x < WL0) out.push(ramp1(k, z));
      else if (x > WL1) out.push(ramp2(k, z));
    }
    return out;
  }

  /** The walls in the way of a body with its feet at `feet` ([walls, doors + the lift]). */
  segments(feet) {
    const a = feet + PLAYER.stepUp, b = feet + PLAYER.headroom;
    return [this.walls.filter((w) => w.y1 > a && w.y0 < b).map((w) => w.s), this.dynamic(feet)];
  }

  /** The door's leaf and the lift's doors and car. */
  dynamic(feet) {
    const out = [];
    for (const { door: d } of this.doors) {
      if (!(feet + PLAYER.stepUp < d.y + 2.2 && feet + PLAYER.headroom > d.y)) continue;
      const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
      out.push([d.hx, d.hz, d.hx + dx * d.w, d.hz + dz * d.w]);
    }
    return [...out, ...this.lift.segments(feet)];
  }

  /** The visitor in the lift's car rides with it. */
  snap(player) {
    if (this.lift.carHas(player.pos)) { player.pos.y = this.lift.y; player.vy = 0; player.fall = null; return true; }
    return false;
  }

  /** 'Hiss' in the car, else 'Trapphus · våning N'. */
  roomAt(x, z, y) {
    if (between(x, SH.x0, SH.x1) && between(z, SH.back, SH.front)) return 'Hiss';
    const n = Y.reduce((best, yy, k) => (Math.abs(yy - y) < Math.abs(Y[best] - y) ? k : best), 0);
    return `Trapphus · våning ${LAB[n]}`;
  }

  /** Each frame: the door swings, the lift, drawn only near (the lobby shows through the entrance glass from the courtyard). */
  update(dt, player, camera) {
    for (const { door: d } of this.doors) {
      if (Math.abs(d.target - d.angle) < 1e-4) continue;
      d.angle += Math.sign(d.target - d.angle) * Math.min(Math.abs(d.target - d.angle), 3 * dt);
      this.placeDoor(d);
    }
    this.lift.update(dt, player);
    const c = camera.position;
    this.object.visible = c.x > B.x0 - 16 && c.x < LB.x1 + 16 && c.z > LB.z0 - 24 && c.z < B.z1 + 3 && c.y > Y[0] - 1 && c.y < CEILTOP + 3; // (from the courtyard the doorway shows the lobby)
  }
}
