import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER, POWER, CORE as CL } from './config.js';
import { box, panelX, panelZ, complement, labelTexture, makeDoor, buildFlatDoors, shade, Lift } from './core.js';
import { architectureEdges } from './architectureedges.js';

// Hus A's, Hus B's and Hus C's stair cores (#637, #638, #639, #652; CORE_A / CORE_B / CORE_C in config, which list the sources and the assumptions): a walkable
// stair hall and a lift from the basement (våning −1) to the top storey, the main entrance's glazed door in the courtyard recess
// (våning 1) and the lobby behind it. Same interface as Hus L's Core (core.js, #415), which asks these too (`Core.attach`):
// `covers` (plan), `contains` (plan + height: then walls collide), `heights` (every floor / flight /
// the car at a point), `segments` (the walls in the way), `dynamic` (the door leaf, the lift's doors), `snap` (riding), `roomAt`,
// `update`. The walls are DATA (#652: Hus A's too, CORE_A; the former corea.js is gone): wall runs with openings (config `walls`), drawn as boxes (or, `thin`, planes) with the lights baked
// into vertex colours (MeshBasic, like core.js) and drawn only near the camera. The stair is the same everywhere: two flights side by
// side along z from the hall's south end, the winders round the stringer's end (#644), the stringer between the flights.
// The lift is north of the hall with its door south (`lift.side` 's', Hus A and Hus B) or west of it with its door east ('e', Hus C: the
// shaft is built in its own frame turned 90°, see Lift's `rot`).

const between = (v, a, b) => v > a && v < b;
const inR = (r, x, z) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const seg = (d) => Math.max(1, Math.ceil(d / 1.2));
/** A box with its faces cut up about every 1.2 m, so the baked lights vary along a long wall. */
const sbox = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, seg(x1 - x0), seg(y1 - y0), seg(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

export class CoreHouse {
  constructor(C) {
    this.C = C; this.house = C.house;
    const group = new THREE.Group(); this.object = group;
    const Y = this.Y = C.stops, LAB = C.labels, NS = Y.length, H = Y[1] - Y[0];
    const B = this.B = C.band, ST = this.ST = C.stair, SLAB = C.slab, CEILTOP = this.CEILTOP = Y[NS - 1] + C.ceilingTop;
    const [WL0, WL1] = ST.well, WM = (WL0 + WL1) / 2, XM = (B.x0 + B.x1) / 2;
    const yTop = (j) => (j < NS - 1 ? Y[j + 1] - SLAB : CEILTOP); // storey j's ceiling (the next floor's underside)
    // The stair (as Hus A's, #644): a storey's stair = ST.risers risers up in ONE run: `straight` straight treads (`tread` deep) in the west flight
    // (z top … ZW), the winders (NW treads round the stringer's south end P = (WM, ZP = stair.run): a rectangle each beside the stringer, NR fan-shaped
    // ones south of P, each an equal share of the walls' outline from the west to the east wall), then `straight` treads back in the east flight.
    // Tread n's top is n × RISE above the floor.
    const RISE = this.RISE = H / ST.risers, SN = ST.straight, TD = ST.tread, ZW = ST.top + SN * TD, ZP = ST.run, NW = ST.risers - 1 - 2 * SN, NR = NW - 2;
    const PERIM = [[B.x0, ZP], [B.x0, B.z1], [B.x1, B.z1], [B.x1, ZP]], PU = [0];
    for (let i = 1; i < PERIM.length; i++) PU.push(PU[i - 1] + Math.hypot(PERIM[i][0] - PERIM[i - 1][0], PERIM[i][1] - PERIM[i - 1][1]));
    const perimAt = (u) => { let i = 1; while (i < PERIM.length - 1 && u > PU[i]) i++; const t = (u - PU[i - 1]) / (PU[i] - PU[i - 1]); return [PERIM[i - 1][0] + t * (PERIM[i][0] - PERIM[i - 1][0]), PERIM[i - 1][1] + t * (PERIM[i][1] - PERIM[i - 1][1])]; };
    const phi = (x, z) => Math.atan2(z - ZP, WM - x); // the angle round P: 0 = west, π/2 = south, π = east
    const RAYS = Array.from({ length: NR + 1 }, (_, i) => perimAt(PU[PU.length - 1] * i / NR)), PHI = RAYS.map(([x, z]) => phi(x, z));
    const fanPoly = (i) => [[WM, ZP], RAYS[i - 1], ...PERIM.slice(1, -1).filter((c, n) => PU[n + 1] > PU[PU.length - 1] * (i - 1) / NR + 1e-6 && PU[n + 1] < PU[PU.length - 1] * i / NR - 1e-6), RAYS[i]];
    /** How far up the stair the walking line is at (x, z), in treads (0 at the hall's edge in the west flight … ST.risers − 1 in the east one), or null off the stair. */
    this.laneS = (x, z) => laneS(x, z); this.inHole = (x, z) => inHole(x, z); this.LN = C.lane ?? null;
    this.stairS = (x, z) => {
      if (z <= ST.top || z > B.z1 + 0.01 || x < B.x0 || x > B.x1) return null;
      if (z <= ZW) return x < WL0 ? (z - ST.top) / TD : x > WL1 ? SN + NW + (ZW - z) / TD : null;
      if (z < ZP) return x < WL0 ? SN + (z - ZW) / (ZP - ZW) : x > WL1 ? SN + NW - 1 + (ZP - z) / (ZP - ZW) : null;
      const a = phi(x, z);
      for (let i = 1; i <= NR; i++) if (a <= PHI[i] || i === NR) return SN + i + Math.min(1, Math.max(0, (a - PHI[i - 1]) / (PHI[i] - PHI[i - 1])));
      return null;
    };
    const stairY = (k, x, z) => { const s = this.stairS(x, z); return s === null ? null : Y[k] + RISE * (s + 0.5); }; // the line half a riser above the nosings (±9 cm)
    const prism = (poly, y0, y1) => new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
    const bar = (a, b, r) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
      return new THREE.CylinderGeometry(r, r, len, 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    };
    // #654 (Hus C): on −1 the stair is one straight flight in the east half (C.lane), through a hole in våning 1's floor, the west half a free lane
    const LN = C.lane ?? null, LT = LN?.tread ?? 0, ZH = LN ? LN.foot - (ST.risers - 1) * LT : 0;
    const laneS = (x, z) => (LN && x > WL1 && x < B.x1 && z > ZH && z <= LN.foot ? (LN.foot - z) / LT : null); // treads up the −1 flight
    const inHole = (x, z) => !!LN && x > WL1 && z > ZH; // (z up to ST.top, the floor's edge)
    const car = C.car, L = C.lift;
    this.car = [car.x0 - 0.02, car.x1 + 0.02, car.z0 - 0.02, car.z1 + 0.02];
    this.carIn = [car.x0 + 0.05, car.x1 - 0.05, car.z0 + 0.05, car.z1 - 0.05];

    // the lights baked into the colours: along the hall on every storey, under each landing, over the top landing, in the lobby
    const LIGHTS = [], nH = C.hallLights ?? Math.max(1, Math.round((ST.top - B.z0) / 3.4));
    for (let j = 0; j < NS; j++) for (let i = 0; i < nH; i++) LIGHTS.push([XM, yTop(j) - 0.05, B.z0 + (i + 0.5) * (ST.top - B.z0) / nH]);
    const GLOW = []; // baked only (no lamp drawn)
    for (let k = LN ? 1 : 0; k < NS - 1; k++) LIGHTS.push([XM, Y[k] + (SN + 1 + Math.floor(NW / 2) - 2) * RISE - 0.07, (ST.run + B.z1) / 2]); // (under the middle winder's underside)
    if (LN) GLOW.push([(B.x0 + WL0) / 2, Y[0] + 2.4, (ST.top + LN.foot) / 2]); // the lane under the winders on −1: light from the corridor lamps
    LIGHTS.push([XM, CEILTOP - 0.05, (ST.top + B.z1) / 2]);
    for (const [x, z] of C.lights ?? []) LIGHTS.push([x, Y[2] - SLAB - 0.05, z]);
    const light = (x, y, z) => {
      let s = 0.3;
      for (const [lx, ly, lz] of [...LIGHTS, ...GLOW]) s += 0.75 / (1 + ((x - lx) ** 2 + ((y - ly) * 1.2) ** 2 + (z - lz) ** 2) / 5);
      return Math.min(1.15, s);
    };
    const bake = (geo, hex) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.userData.edgePlane = geo.type === 'PlaneGeometry';
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.normal;
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const p = g.attributes.position, c = new THREE.Color(hex), col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const l = light(p.getX(i), p.getY(i), p.getZ(i)) * shade(n.getX(i), n.getY(i), n.getZ(i)); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
      g.deleteAttribute('normal');
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };

    const geo = { solid: [], light: [], glass: [] }, src = []; // `src`: plain construction boxes for the edge lines (cheaper than the cut-up ones)
    this.walls = []; // { s: [ax, az, bx, bz], y0, y1 }
    const FLATS = []; // the flats' doors { j: stop, x: the wall's hall face, sd: +1 on a wall the hall lies east of, z0, z1, h, hinge: 'n' | 's', label }
    // (#656: `az` = a door in a wall along x, the hall's north end: then x is that wall's z, sd +1 = the hall lies south, z0 … z1 its x range, hinge 'w' | 'e', `into` = swings away from the hall)
    this.zones = []; // the openings through the walls: { r: [x0, x1, z0, z1], j: stop }
    const WALL = 0xeeeeea, STAIR = 0xb9b6ae, RAIL = 0x7f868c, FRAME = 0x3b4247, CEILC = 0xdedcd6, CELL = 0x8c8982;
    /** A box that is only drawn (`plain` = false: its edges are taken from the baked, e.g. turned, geometry). */
    const draw = (x0, x1, y0, y1, z0, z1, hex) => { if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return; geo.solid.push(bake(sbox(x0, x1, y0, y1, z0, z1), hex)); src.push(box(x0, x1, y0, y1, z0, z1)); };
    const drawGeo = (g, hex) => { const b = bake(g, hex); geo.solid.push(b); src.push(b); };
    /** The four sides of a box as collision segments. */
    const block = (x0, x1, z0, z1, y0, y1) => {
      for (const s of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) this.walls.push({ s, y0, y1 });
    };
    // (a floor's top is 6 mm over its level: on Hus C's våning 1, y 0, the courtyard's grass inside the footprint lies at the same height and fought with it)
    const UP = 0.006, slab = (x0, x1, z0, z1, y) => { if (z1 > z0 + 1e-3 && x1 > x0 + 1e-3) draw(x0, x1, y - SLAB, y + UP, z0, z1, STAIR); };

    // ---- the wall runs (config `walls`): continuous from the first stop's floor to the last stop's ceiling, with the openings cut
    for (const w of C.walls) {
      const [s0, s1] = w.s, y0 = Y[s0], y1 = s1 >= NS - 1 ? CEILTOP : yTop(s1);
      const rect = (pa, pb) => (w.ax === 'x' ? [w.t[0], w.t[1], pa, pb] : [pa, pb, w.t[0], w.t[1]]);
      const hs = [];
      for (const h of w.holes ?? []) for (let j = h.s?.[0] ?? s0; j <= (h.s?.[1] ?? s1); j++) hs.push({ ...h, j });
      for (const [pa, pb, ya, yb] of complement(w.a[0], w.a[1], y0, y1, hs.map((h) => ({ a0: h.a[0], a1: h.a[1], y0: Y[h.j], y1: Y[h.j] + h.h })))) {
        const [x0, x1, z0, z1] = rect(pa, pb);
        if (w.thin) { // #652 (Hus A's): a wall of no thickness, a plane seen from both sides, one collision line (the openings' floors are the `floors`' / garage's)
          const m = w.t[0];
          drawGeo(w.ax === 'x' ? panelX(m, pa, pb, ya, yb) : panelZ(m, pa, pb, ya, yb), WALL);
          this.walls.push({ s: w.ax === 'x' ? [m, pa, m, pb] : [pa, m, pb, m], y0: ya, y1: yb });
          continue;
        }
        draw(x0, x1, ya, yb, z0, z1, WALL);
        block(x0, x1, z0, z1, ya, yb);
      }
      for (const h of hs) {
        const [d0, d1] = h.a, y = Y[h.j], [x0, x1, z0, z1] = rect(d0, d1);
        if (h.leaf && h.plain) { // #652: a door without a number, sign or entrance cell (Hus A's cross wall): its leaf with an architrave, no doorway collision
          const mid = (w.t[0] + w.t[1]) / 2, dir = mid < (B.z0 + B.z1) / 2 ? 1 : -1;
          if (w.ax !== 'z') throw new Error('plain doors only in walls along x');
          FLATS.push({ j: h.j, x: mid, sd: dir, z0: d0, z1: d1, h: h.h, hinge: h.hinge ?? 'w', label: null, az: true, into: !!h.into, plain: true });
          for (const [a, b, c, e] of [[d0 - 0.07, d0, y, y + h.h + 0.07], [d1, d1 + 0.07, y, y + h.h + 0.07], [d0, d1, y + h.h, y + h.h + 0.07]]) draw(a, b, c, e, mid - 0.03, mid + 0.03, 0xf0eee8);
        } else if (h.leaf) { // a flat's door (#653: openable, made below from FLATS): the doorway itself stops you
          const az = w.ax === 'z', dir = (w.t[0] + w.t[1]) / 2 < (az ? (B.z0 + B.z1) / 2 : XM) ? 1 : -1, f = dir > 0 ? w.t[1] : w.t[0], label = h.flats?.[h.j];
          if (!label) throw new Error(`${C.house}: no flat number for the door at ${w.ax === 'x' ? 'z' : 'x'} ${d0} on stop ${h.j}`);
          FLATS.push({ j: h.j, x: f, sd: dir, z0: d0, z1: d1, h: h.h, hinge: h.hinge ?? 'n', label, az, into: !!h.into });
          this.walls.push({ s: az ? [d0, f, d1, f] : [f, d0, f, d1], y0: y, y1: y + h.h });
        } else if (h.glass) { // a fixed pane in a frame, in the wall's middle plane
          const mid = (w.t[0] + w.t[1]) / 2, hh = h.h;
          const pane = w.ax === 'x' ? new THREE.PlaneGeometry(d1 - d0 - 0.08, hh - 0.1).rotateY(Math.PI / 2).translate(mid, y + hh / 2, (d0 + d1) / 2) : new THREE.PlaneGeometry(d1 - d0 - 0.08, hh - 0.1).translate((d0 + d1) / 2, y + hh / 2, mid);
          geo.glass.push(pane);
          const fr = (a0, a1, ya, yb) => (w.ax === 'x' ? draw(mid - 0.03, mid + 0.03, ya, yb, a0, a1, FRAME) : draw(a0, a1, ya, yb, mid - 0.03, mid + 0.03, FRAME));
          fr(d0, d0 + 0.05, y, y + hh); fr(d1 - 0.05, d1, y, y + hh); fr(d0, d1, y + hh - 0.05, y + hh); fr(d0, d1, y, y + 0.05);
          this.walls.push({ s: w.ax === 'x' ? [mid, d0, mid, d1] : [d0, mid, d1, mid], y0: y, y1: y + hh });
        } else { // an opening: a sill, and the floor here belongs to the core (`zones`)
          draw(x0, x1, y - 0.2, y + UP, z0, z1, STAIR);
          this.zones.push({ r: [x0, x1, z0, z1], j: h.j });
        }
      }
    }

    // ---- the flats' doors (#653): the architrave and the number sign (core.js buildFlatDoors), a dark entrance cell behind each that you cannot enter
    const NUM = FLATS.filter((f) => !f.plain); NUM.forEach((f, i) => { f.ci = i; }); // (the plain doors have no sign: their leaf takes the atlas' white texel)
    const FD = C.flatDoors, signs = NUM.length ? buildFlatDoors({ rail: geo.solid }, { doors: NUM.map((f) => [f.j, f.z0, f.z1, f.label, f.x, f.sd, f.hinge === 'n' || f.hinge === 'w', f.az]), Ys: Y, bk: bake, fixed: false, cols: 4, sc: FD.scale, strip: 8 }) : null;
    for (const f of NUM) {
      const y = Y[f.j];
      if (f.az) { // (the north end's door: the cell lies north of the wall's hall face)
        const za = f.sd > 0 ? f.x - FD.cell.depth : f.x, zb = f.sd > 0 ? f.x : f.x + FD.cell.depth, zf = f.sd > 0 ? za : zb, ch = FD.cell.height, e = 0.012;
        geo.solid.push(bake(box(f.z0, f.z1, y - 0.05, y, za, zb), STAIR), bake(box(f.z0, f.z1, y + ch, y + ch + 0.02, za, zb), CELL));
        geo.solid.push(bake(panelX(f.z0 + e, za, zb, y, y + ch), CELL), bake(panelX(f.z1 - e, za, zb, y, y + ch), CELL), bake(panelZ(zf, f.z0, f.z1, y, y + ch), CELL));
        continue;
      }
      const xa = f.sd > 0 ? f.x - FD.cell.depth : f.x, xb = f.sd > 0 ? f.x : f.x + FD.cell.depth, xf = f.sd > 0 ? xa : xb, ch = FD.cell.height, e = 0.012;
      geo.solid.push(bake(box(xa, xb, y - 0.05, y, f.z0, f.z1), STAIR), bake(box(xa, xb, y + ch, y + ch + 0.02, f.z0, f.z1), CELL));
      geo.solid.push(bake(panelZ(f.z0 + e, xa, xb, y, y + ch), CELL), bake(panelZ(f.z1 - e, xa, xb, y, y + ch), CELL), bake(panelX(xf, f.z0, f.z1, y, y + ch), CELL));
    }

    // ---- the floors: the hall (north end … the stair's top edge, a hole above every flight), the lobby's floor and its ceiling
    for (let j = 1; j < NS; j++) {
      if (LN && j === 1) { slab(B.x0, B.x1, B.z0, ZH, Y[1]); slab(B.x0, WL1, ZH, ST.top, Y[1]); } // (the −1 flight arrives through the hole x > WL1, z ZH … top)
      else slab(B.x0, B.x1, B.z0, ST.top, Y[j]);
    }
    draw(B.x0, B.x1, Y[0] - 0.05, Y[0] + 0.003, B.z0, B.z1, STAIR); // våning −1's floor (the garage leaves this rect's floor to us)
    this.floors = C.floors ?? [];
    for (const f of this.floors) { slab(...f.r, Y[f.s]); slab(...f.r, Y[f.s + 1]); }
    draw(B.x0, B.x1, CEILTOP, CEILTOP + 0.05, B.z0, B.z1, CEILC); // the top storey's ceiling over the hall and the stair
    if (C.cap) draw(C.cap[0], C.cap[1], CEILTOP, CEILTOP + 0.1, C.cap[2], C.cap[3], CEILC); // … and over the shaft

    // ---- the flights: solid treads (the straight ones in both flights, the winders round the stringer's end), a sloped soffit under each
    // straight flight, a handrail along the wall (it follows the winders round the corners) and on the stringer side with balusters
    const ang = Math.atan2(SN * RISE, SN * TD), slen = Math.hypot(SN * TD, SN * RISE), thick = 0.26, down = 2 * RISE + 0.02;
    for (let k = 0; k < NS - 1; k++) {
      const yk = Y[k], tread = (n) => yk + n * RISE;
      if (LN && k === 0) { // the −1 flight: solid treads in the east half from the foot north to the hole, a rail each side, the hole guarded on its west edge
        for (let i = 1; i < ST.risers; i++) draw(WL1, B.x1, yk, tread(i), LN.foot - i * LT, LN.foot - (i - 1) * LT, STAIR);
        const yl = (z) => yk + RISE * ((LN.foot - z) / LT + 0.5) + 0.9;
        for (const xr of [B.x1 - 0.05, WL1 + 0.03]) for (let z = LN.foot - 0.05; z > ZH + 0.01; z -= 0.5) drawGeo(bar([xr, yl(z), z], [xr, yl(Math.max(ZH, z - 0.5)), Math.max(ZH, z - 0.5)], 0.02), RAIL);
        const g = Y[1] + 0.001, xg = WL1 + 0.02;
        draw(xg - 0.025, xg + 0.025, g + ST.guard - 0.04, g + ST.guard, ZH, ST.top + 0.02, RAIL); draw(xg - 0.02, xg + 0.02, g - 0.2, g + 0.06, ZH, ST.top + 0.02, RAIL);
        for (let z = ZH + 0.06; z < ST.top; z += 0.125) draw(xg - 0.01, xg + 0.01, g, g + ST.guard - 0.02, z - 0.01, z + 0.01, RAIL);
        this.walls.push({ s: [WL1, ZH, WL1, LN.foot - 0.5], y0: Y[0] - 0.5, y1: Y[1] + 1.2 }); // the flight's west side: the lane is clear of it, the guard above
        continue;
      }
      for (let i = 1; i <= SN; i++) {
        const za = ST.top + (i - 1) * TD, zb = za + TD, e = SN + NW + SN + 1 - i;
        draw(B.x0, WL0, tread(i) - down, tread(i), za, zb, STAIR);   // west flight: 1 … SN
        draw(WL1, B.x1, tread(e) - down, tread(e), za, zb, STAIR);   // east flight: back down to the hall's edge
      }
      draw(B.x0, WL0, tread(SN + 1) - down, tread(SN + 1), ZW, ZP, STAIR); draw(WL1, B.x1, tread(SN + NW) - down, tread(SN + NW), ZW, ZP, STAIR);
      for (let i = 1; i <= NR; i++) drawGeo(prism(fanPoly(i), tread(SN + 1 + i) - down, tread(SN + 1 + i)), STAIR);
      const mz = (ST.top + ZW) / 2;
      for (const [xa, xb, s0, sgn] of [[B.x0, WL0, SN / 2, -1], [WL1, B.x1, SN + NW + SN / 2, 1]]) // the soffits
        drawGeo(new THREE.BoxGeometry(xb - xa, thick, slen).rotateX(sgn * ang).translate((xa + xb) / 2, yk + RISE * (s0 + 0.5) - RISE - (thick / 2) / Math.cos(ang), mz), STAIR);
      // the handrail along the wall: from the hall's edge down the west wall, along the south wall and up the east wall
      const wall = [[B.x0 + 0.05, ST.top + 0.01], [B.x0 + 0.05, B.z1 - 0.05], [B.x1 - 0.05, B.z1 - 0.05], [B.x1 - 0.05, ST.top + 0.01]], pts = [];
      for (let i = 1; i < wall.length; i++) {
        const [ax, az] = wall[i - 1], [bx, bz] = wall[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3));
        for (let m = i === 1 ? 0 : 1; m <= n; m++) { const x = ax + (bx - ax) * m / n, z = az + (bz - az) * m / n; pts.push([x, stairY(k, x, z) + 0.9, z]); }
      }
      for (let i = 1; i < pts.length; i++) drawGeo(bar(pts[i - 1], pts[i], 0.02), RAIL);
      // the stringer's two sides: a rail from the hall's edge to the stringer's end, balusters under it
      for (const [xr, f] of [[WL0 - 0.02, 1], [WL1 + 0.02, 2]]) {
        drawGeo(bar([xr, stairY(k, xr, ST.top + 0.01) + 0.9, ST.top + 0.01], [xr, stairY(k, xr, ZW) + 0.9, ZW], 0.025), RAIL);
        drawGeo(bar([xr, stairY(k, xr, ZW) + 0.9, ZW], [xr, stairY(k, xr, ZP - 0.01) + 0.9, ZP - 0.01], 0.025), RAIL);
        const xs = f === 1 ? WL0 - 0.03 : WL1 + 0.01;
        for (let z = ST.top + 0.06; z < ZP - 0.02; z += 0.2) { const yy = stairY(k, xr, z); draw(xs, xs + 0.02, yy - 0.05, yy + 0.9, z - 0.01, z + 0.01, RAIL); }
      }
      this.walls.push({ s: [WM, ST.top, WM, ST.run], y0: Y[k] - 0.5, y1: Y[k + 1] + 1.2 }); // the stringer between the flights
    }
    { // the top storey: the hole beside the arriving flight is guarded across the hall's south edge (as Hus L's #625)
      const y = Y[NS - 1], zr = ST.top + 0.02;
      draw(B.x0, WL0 + 0.05, y + ST.guard - 0.04, y + ST.guard, zr - 0.025, zr + 0.025, RAIL); draw(B.x0, WL0 + 0.04, y - 0.2, y + 0.06, zr - 0.02, zr + 0.02, RAIL);
      for (let x = B.x0 + 0.06; x < WL0; x += 0.125) draw(x - 0.01, x + 0.01, y, y + ST.guard - 0.02, zr - 0.01, zr + 0.01, RAIL);
      this.walls.push({ s: [B.x0, zr, WL1, zr], y0: y - 0.5, y1: y + 1.2 });
    }
    // våning −1: the space under the arriving flight is closed off (a wall at the hall's edge up to its soffit)
    if (!LN) {
      const soffit = Y[1] - 0.3;
      draw(WL1, B.x1, Y[0], soffit, ST.top - 0.02, ST.top + 0.02, WALL);
      this.walls.push({ s: [WL1, ST.top, B.x1, ST.top], y0: Y[0] - 0.5, y1: soffit });
    }

    // ---- the lights and the floor numbers (on the wall by the lift, clear of the flats' doors)
    for (const [x, y, z] of LIGHTS) geo.light.push(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16).translate(x, y + 0.02, z));
    const nums = labelTexture(128 * NS, 128, (g) => { g.fillStyle = '#eeeeea'; g.fillRect(0, 0, 128 * NS, 128); g.fillStyle = '#1d4f8c'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; LAB.forEach((l, i) => g.fillText(l, 64 + i * 128, 68)); });
    const N = C.numbers;
    const numGeos = Y.map((y, k) => {
      const g = new THREE.PlaneGeometry(0.5, 0.5).rotateY(N.dir * Math.PI / 2).translate(N.x + N.dir * 0.025, y + 1.7, N.z), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / NS, uv.getY(i));
      return g;
    });
    const add = (geos, mat, edgeSources) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); if (edgeSources) m.userData.edgeSources = edgeSources; m.raycast = () => {}; group.add(m); return m; };
    this.mats = { wall: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), light: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    add(geo.solid, this.mats.wall, src);
    add(geo.light, this.mats.light);
    add(numGeos, new THREE.MeshBasicMaterial({ map: nums.t }), numGeos); // (the plates, signs and panes get outlines, as Hus A's did, #652)
    if (signs) { this.mats.sign = new THREE.MeshBasicMaterial({ map: signs.tex }); add(signs.geos, this.mats.sign, signs.geos); }
    add(geo.glass, new THREE.MeshBasicMaterial({ color: 0xbfd3dc, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), geo.glass);

    // ---- the entrance door: glazed, hinged at its `hinge` end, opening out into the recess
    const E = C.entrance, nzf = E.face === 'n', hi = E.hinge === 'hi', hingeA = hi ? E.door[1] : E.door[0], sgn = hi ? -1 : 1;
    this.entrance = E;
    this.doors = [makeDoor(group, { hx: nzf ? hingeA : E.line, hz: nzf ? E.line : hingeA, dir: nzf ? [sgn, 0] : [0, sgn], out: nzf ? [0, -1] : [1, 0], w: E.door[1] - E.door[0], y: Y[1], name: E.name, glazed: true })];
    /** #653 (from Hus A's #643): merge a makeDoor leaf's parts into ONE mesh (vertex colours with the light baked in at the hinge, a white texel of the
     *  shared number atlas for the plain parts, the flat's brass number plate on its hall side) and drop the originals: one draw call a leaf. */
    const leafify = (t, mat, cell, hall) => {
      const d = t.door, leaf = d.pivot.children[0], L = light(d.hx, d.y + 1.1, d.hz);
      const FR = 0x8d7456, LF = 0x7a6248, STEEL = 0xb8bcbf, parts = leaf.children.filter((o) => o.visible), colors = [FR, FR, FR, FR, LF, STEEL];
      const paint = (g, hex) => {
        const c = new THREE.Color(hex ?? 0xffffff), n = g.attributes.normal, col = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < n.count; i++) { const l = L * (hex == null ? 1 : shade(n.getX(i), n.getY(i), n.getZ(i))); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      };
      const geos = parts.map((o, i) => {
        const g = o.geometry.clone().translate(o.position.x, o.position.y, o.position.z), uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.white[0], cell.white[1]);
        paint(g, colors[i]);
        return g;
      });
      const all = [...geos];
      if (hall) { // (no plate on a plain door)
        const sideZ = Math.sign(hall[0] * -d.dir[1] + hall[1] * d.dir[0]) || 1, P = CL.flatDoorParts.plate; // the plate faces the hall: which of the leaf's two faces (local ±z)?
        const q = new THREE.PlaneGeometry(P[0], P[1]).rotateY(sideZ > 0 ? 0 : Math.PI).translate(d.w / 2, d.y + P[2], sideZ * 0.0275), uv = q.attributes.uv, [u0, v0, u1, v1] = cell.plate;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
        paint(q, null); all.push(q);
      }
      for (const o of parts) { leaf.remove(o); o.geometry.dispose(); }
      const m = new THREE.Mesh(mergeGeometries(all), mat);
      m.userData.edgeSources = geos; m.userData.door = t;
      leaf.add(m);
    };
    if (signs) { // the flats' doors: hinged at the jamb the plans draw, swinging into the hall; one merged mesh per leaf
      const leafMat = this.mats.leaf = new THREE.MeshBasicMaterial({ map: signs.tex, vertexColors: true });
      FLATS.forEach((f) => {
        const sg = f.into ? -1 : 1, lo = f.hinge === 'n' || f.hinge === 'w'; // the hinge at the low end (north / west)?
        const t = f.az
          ? makeDoor(group, { hx: lo ? f.z0 : f.z1, hz: f.x, dir: lo ? [1, 0] : [-1, 0], out: [0, f.sd * sg], w: f.z1 - f.z0, y: Y[f.j], name: f.plain ? 'dörren mot trappan' : `dörren till ${f.label}`, glazed: false })
          : makeDoor(group, { hx: f.x, hz: lo ? f.z0 : f.z1, dir: lo ? [0, 1] : [0, -1], out: [f.sd * sg, 0], w: f.z1 - f.z0, y: Y[f.j], name: `dörren till ${f.label}`, glazed: false });
        leafify(t, leafMat, signs.cells[f.plain ? 0 : f.ci], f.plain ? null : f.az ? [0, f.sd] : [f.sd, 0]);
        this.doors.push(t);
      });
    }
    this.doors.forEach((t) => this.placeDoor(t.door));

    // ---- the lift: the car in its shaft, its door `side` ('s': south, car north of the front; 'e': east, car west of it)
    const spec = { speed: L.speed, accel: L.accel, doorTime: L.doorTime, wait: L.wait, rescue: L.rescue, Y, floors: LAB, dz: -1, start: 1 };
    if (L.side === 's') Object.assign(spec, { x0: car.x0, x1: car.x1, z0: L.front, z1: car.z0, door: L.door, landing: L.wall, btnX: L.door[0] - 0.22 });
    else Object.assign(spec, { rot: Math.PI / 2, x0: -car.z1, x1: -car.z0, z0: L.front, z1: car.x0, door: [-L.door[1], -L.door[0]], landing: L.wall, btnX: -L.door[0] + 0.22 });
    this.lift = new Lift(group, spec);
    this.targets = [...this.doors, ...this.lift.targets];
    this.edgeLines = architectureEdges(group, { moving: [...this.doors.map((t) => t.door.pivot), this.lift.car, ...this.lift.carDoors, ...this.lift.landing.flat()] });
    group.traverse((o) => { delete o.userData.edgeSources; });

    // where the camera must be for it to be drawn: within 6 m of the core, or out in front of the entrance (the lobby shows through the glass
    // door): 14 m out along the door's face, 5 m either side (a wider margin drew the lift's ~30 meshes from the whole courtyard, perfcount #592)
    const rs = [[B.x0, B.x1, B.z0, B.z1], this.car, ...this.floors.map((f) => f.r), ...this.zones.map((z) => z.r)], m = 6;
    this.near = rs.map((r) => [r[0] - m, r[1] + m, r[2] - m, r[3] + m]);
    const [d0, d1] = E.door, out = 14, side = 5;
    this.near.push(nzf ? [d0 - side, d1 + side, E.line - out, E.line + m] : [E.line - m, E.line + out, d0 - side, d1 + side]);
  }

  placeDoor(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
    d.pivot.rotation.y = Math.atan2(-dz, dx);
  }

  setPower(on) {
    this.mats.wall.color.setScalar(on ? 1 : POWER.emergency);
    this.mats.light.color.setScalar(on ? 1 : 0.2);
    if (this.mats.leaf) { this.mats.leaf.color.setScalar(on ? 1 : POWER.emergency); this.mats.sign.color.setScalar(on ? 1 : POWER.emergency); }
    this.lift.mains(on);
  }

  /** The hall, the lift, the openings and the lobby in plan (no height). */
  covers(x, z) {
    const B = this.B;
    return between(x, B.x0 - 0.02, B.x1 + 0.02) && between(z, B.z0 - 0.02, B.z1 + 0.02) || inR(this.car, x, z) || this.zones.some((o) => inR(o.r, x, z)) || this.floors.some((f) => inR(f.r, x, z));
  }

  /** Is the visitor (feet at y) in the hall, the lift, an opening or the lobby? */
  contains(x, z, y) {
    const { Y, B } = this;
    if (!(y > Y[0] - 0.4 && y < this.CEILTOP)) return false;
    if (inR(this.car, x, z)) return true;
    if (between(x, B.x0 - 0.02, B.x1 + 0.02) && between(z, B.z0 - 0.02, B.z1 + 0.02)) return true;
    if (this.zones.some((o) => y > Y[o.j] - 0.4 && y < Y[o.j] + 2.7 && inR(o.r, x, z))) return true;
    return this.floors.some((f) => y > Y[f.s] - 0.4 && y < Y[f.s + 1] - 0.2 && inR(f.r, x, z));
  }

  /** Every floor / flight surface at (x, z) (the player takes the highest it can step onto). */
  heights(x, z) {
    const { Y, B, ST } = this, NS = Y.length, out = [];
    if (inR(this.carIn, x, z)) { out.push(this.lift.y); return out; }
    for (const o of this.zones) if (inR(o.r, x, z)) out.push(Y[o.j]);
    for (const f of this.floors) if (inR(f.r, x, z)) out.push(Y[f.s]);
    if (!between(x, B.x0, B.x1) || z < B.z0 || z > B.z1) return out;
    const ls = this.laneS(x, z);
    if (ls !== null) out.push(Y[0] + this.RISE * (ls + 0.5)); // the −1 flight (#654)
    if (z <= ST.top) { for (let j = 0; j < NS; j++) if (!(j === 1 && this.inHole(x, z))) out.push(Y[j]); return out; }
    const sv = this.stairS(x, z);
    if (sv !== null) for (let k = this.LN ? 1 : 0; k < NS - 1; k++) out.push(Y[k] + this.RISE * (sv + 0.5));
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
    if (inR(this.car, x, z)) return 'Hiss';
    const { Y } = this, n = Y.reduce((best, yy, k) => (Math.abs(yy - y) < Math.abs(Y[best] - y) ? k : best), 0);
    return `Trapphus · våning ${this.C.labels[n]}`;
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
    this.object.visible = c.y > this.Y[0] - 1 && c.y < this.CEILTOP + 3 && this.near.some((n) => c.x > n[0] && c.x < n[1] && c.z > n[2] && c.z < n[3]);
  }
}
