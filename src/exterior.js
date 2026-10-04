import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HUS_L as H, COLORS, FENCE_HEIGHT, SEASON, VERTICAL, storeyFloor, CORE } from './config.js';
import { registerSnow } from './seasons.js';
import { wallLine, wallRect } from './roofs.js';
import { groundY } from './surroundings.js';
import { glowMaterial, poolGeometry, washGeometry, fadeGlow } from './groundglow.js';
import { pavingTexture } from './patio.js';

// Brick: 250 × 65 mm + 10 mm joints → 0.26 m per brick, 0.075 m per course.
const TILE_W = 1.04, TILE_H = 0.6; // one texture tile = 4 bricks × 8 courses

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const mortar = new THREE.Color(COLORS.mortar).getStyle();
  g.fillStyle = mortar;
  g.fillRect(0, 0, 512, 512);
  const base = new THREE.Color(COLORS.brick);
  const bw = 128, bh = 64, joint = 8;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let i = -1; i < 5; i++) {
      const col = base.clone().offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.07);
      g.fillStyle = col.getStyle();
      g.fillRect(i * bw + off + joint / 2, row * bh + joint / 2, bw - joint, bh - joint);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const brickMat = () => new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95, side: THREE.DoubleSide });

/** Rectangles covering [x0,x1]×[y0,y1] minus the holes (all axis-aligned). */
function complement(x0, x1, y0, y1, holes) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])]
    .filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1];
    if (xb - xa < 1e-4) continue;
    const ys = holes.filter((h) => h.x0 <= xa + 1e-4 && h.x1 >= xb - 1e-4)
      .map((h) => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).sort((a, b) => a[0] - b[0]);
    let y = y0;
    for (const [ha, hb] of ys) {
      if (ha > y) out.push([xa, xb, y, ha]);
      y = Math.max(y, hb);
    }
    if (y < y1) out.push([xa, xb, y, y1]);
  }
  return out;
}

/** Vertical quad in the plane z (facing −z if `north`), world-space UVs for brick. */
function quadZ(xa, xb, ya, yb, z, north) {
  const geo = new THREE.PlaneGeometry(xb - xa, yb - ya);
  if (north) geo.rotateY(Math.PI);
  geo.translate((xa + xb) / 2, (ya + yb) / 2, z);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TILE_W, pos.getY(i) / TILE_H);
  return geo;
}

/** Vertical quad in the plane x (facing −x if `west`). */
function quadX(za, zb, ya, yb, x, west) {
  const geo = new THREE.PlaneGeometry(zb - za, yb - ya);
  geo.rotateY(west ? -Math.PI / 2 : Math.PI / 2);
  geo.translate(x, (ya + yb) / 2, (za + zb) / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / TILE_W, pos.getY(i) / TILE_H);
  return geo;
}

function boxGeo(x0, x1, y0, y1, z0, z1) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}

/** Open brick drum (spiral stair tower) with world-space brick UVs; `gap` = { at, deg, y }: open above y over deg°
 * round the plan angle `at` (deg from +x towards +z) — the doorway onto the loftgång / landing (#444). */
function drum(x, z, r, h, gap) {
  const part = (y0, y1, a0 = 0, len = 2 * Math.PI) => { // a0 / len: CylinderGeometry's theta (x = r sin θ, z = r cos θ)
    const geo = new THREE.CylinderGeometry(r, r, y1 - y0, Math.max(3, Math.round((28 * len) / (2 * Math.PI))), 1, true, a0, len);
    geo.translate(x, (y0 + y1) / 2, z);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ((a0 + uv.getX(i) * len) * r) / TILE_W, (y0 + uv.getY(i) * (y1 - y0)) / TILE_H);
    return geo;
  };
  if (!gap) return [part(0, h)];
  const w = (gap.deg * Math.PI) / 180, a = (gap.at * Math.PI) / 180;
  return [part(0, gap.y), part(gap.y, h, Math.PI / 2 - (a + 2 * Math.PI - w / 2), 2 * Math.PI - w)];
}

/** A plan polygon ([x, z][]) extruded from y0 to y1. */
function prism(pts, y0, y1) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  return geo.rotateX(-Math.PI / 2).translate(0, y0, 0);
}

/** A ring sector round (cx, cz) from radius r0 to r1, angles a0 … a1 (rad, plan: from +x towards +z). */
function sector(cx, cz, r0, r1, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r1 * Math.cos(a), cz + r1 * Math.sin(a)]); }
  if (r0 <= 0) pts.push([cx, cz]);
  else for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r0 * Math.cos(a), cz + r0 * Math.sin(a)]); }
  return pts;
}

/**
 * The spiral stair inside a drum (#444, HUS_L.spiral; visual only): steel parts into `steel`, the floor and the top
 * landing into `slabs`. It climbs with the angle and arrives at the landing's near edge at `top`.
 */
function spiralStair(t, top, steel, slabs) {
  const S = H.spiral, deg = Math.PI / 180, rc = S.column, ro = t.r - S.wall;
  const rises = Math.max(2, Math.round(top / S.rise)), rise = top / rises, n = rises - 1; // the landing is the last step
  const step = S.turn * deg, half = (S.landing * deg) / 2, door = t.door * deg, aEnd = door - half;
  steel.push(new THREE.CylinderGeometry(rc, rc, top + H.railHeight, 10).translate(t.x, (top + H.railHeight) / 2, t.z));
  for (let i = 0; i < n; i++) {
    const a1 = aEnd - (n - 1 - i) * step, a0 = a1 - step - S.overlap * deg, y = (i + 1) * rise;
    steel.push(prism(sector(t.x, t.z, rc, ro, a0, a1, 3), y - S.tread, y));
  }
  // the handrail along the drum wall, rising with the treads' nosings
  const hr = S.handrail, rr = t.r - 0.08, a00 = aEnd - (n - 1) * step - step;
  const helix = new THREE.Curve();
  helix.getPoint = (u, out = new THREE.Vector3()) => {
    const a = a00 + u * (aEnd - a00);
    return out.set(t.x + rr * Math.cos(a), Math.min(top, u * n * rise + rise * 0.5) + hr.h, t.z + rr * Math.sin(a));
  };
  steel.push(new THREE.TubeGeometry(helix, Math.ceil(n * 2.5), hr.r, 6, false));
  // the floor at the bottom, the top landing (a sector round the door) and a guard on its edge over the stairwell
  slabs.push(prism(sector(t.x, t.z, 0, t.r - 0.01, 0, 2 * Math.PI, 28), 0, 0.02));
  slabs.push(prism(sector(t.x, t.z, 0, t.r - 0.01, door - half, door + half, 10), top - S.slab, top));
  const ae = door + half, ca = Math.cos(ae), sa = Math.sin(ae), len = t.r - rc;
  const mid = (rc + t.r) / 2;
  steel.push(new THREE.CylinderGeometry(hr.r, hr.r, len, 6).rotateZ(Math.PI / 2).rotateY(-ae).translate(t.x + mid * ca, top + H.railHeight - hr.r, t.z + mid * sa));
  for (let d = rc + 0.12; d < t.r - 0.05; d += 0.12) steel.push(new THREE.CylinderGeometry(0.01, 0.01, H.railHeight, 4).translate(t.x + d * ca, top + H.railHeight / 2, t.z + d * sa));
}

/**
 * Hus L around the apartment (see HUS_L in config):
 *  - våning 1–2: brick, a row of units like ours on both sides of the stair core with the portik;
 *    the other units get our façade openings as glass, and our patio/hedge/screen walls
 *  - våning 3–4: the stacked two-storey units, white render with brick pilasters, set back behind
 *    the loftgång (their own street openings per flat type, HUS_L.street, #347) (grey-green railing, a light metal fascia, recessed white doors with a lantern each, #111) on the
 *    north side; on the courtyard side (#337, HUS_L.court) våning 3 in brick, våning 4 set back behind roof terraces,
 *    the core's brick loft rising through them; spiral stairs in brick drums at both ends
 *  - flat roof with solar panels and a light metal capping
 */
export function buildExterior({ W, D, roofTop, north, south, frame, wall, site, mats }) {
  const group = new THREE.Group();
  const bricks = [], renders = [], glassGeo = [], frames = [], solids = [], rails = [], roofs = [], pilasters = [], panels = [];
  const patios = [], hedges = [], fences = [], copings = [];
  const segments = []; // collision for the neighbours' screen walls and hedges (lawn side)
  const loftD = H.loftgangDepth;
  const upperTop = roofTop + H.upperStoreys * H.storeyHeight;
  const eps = 0.006;

  // the units along x: west row | core | east row (ours: ox = 0); each neighbour spans its own façade strip
  const { units, core: [coreX0, coreX1], xw, xe } = husLLayout(W);

  const fakeWindow = (o, z, northSide, glassOut = glassGeo) => {
    const s = northSide ? -1 : 1;
    glassOut.push(quadZ(o.x0, o.x1, o.y0, o.y1, z + s * 0.002, northSide));
    const f = 0.06;
    frames.push(
      boxGeo(o.x0, o.x1, o.y0, o.y0 + f, z - 0.02, z + 0.02),
      boxGeo(o.x0, o.x1, o.y1 - f, o.y1, z - 0.02, z + 0.02),
      boxGeo(o.x0, o.x0 + f, o.y0, o.y1, z - 0.02, z + 0.02),
      boxGeo(o.x1 - f, o.x1, o.y0, o.y1, z - 0.02, z + 0.02),
    );
    // our window's parts (#272, `win` = its WINDOWS spec): the transom bar, the living room's off-centre mullion,
    // the top-hung sash's rails standing a little proud of the frame
    const w = o.win;
    if (!w) return;
    const ty = w.transom > 0 ? o.y1 - w.transom : o.y1;
    if (w.transom > 0) frames.push(boxGeo(o.x0, o.x1, ty - f / 2, ty + f / 2, z - 0.02, z + 0.02));
    let a = o.x0 + f, b = o.x1 - f;
    if (w.split > 0) {
      const side = w.opens ?? 'a', mx = side === 'a' ? o.x0 + w.split * (o.x1 - o.x0) : o.x1 - w.split * (o.x1 - o.x0);
      frames.push(boxGeo(mx - f / 2, mx + f / 2, o.y0, ty, z - 0.02, z + 0.02));
      if (side === 'a') b = mx - f / 2; else a = mx + f / 2;
    }
    const lo = o.y0 + f, hi = w.transom > 0 ? ty - f / 2 : o.y1 - f, r = 0.045, zs = z + s * 0.02;
    frames.push(boxGeo(a, b, lo, lo + r, zs - 0.015, zs + 0.015), boxGeo(a, b, hi - r, hi, zs - 0.015, zs + 0.015),
      boxGeo(a, a + r, lo, hi, zs - 0.015, zs + 0.015), boxGeo(b - r, b, lo, hi, zs - 0.015, zs + 0.015));
  };
  const fakeWindowX = (o, x, west) => { // o: z0/z1/y0/y1 on a gable
    const s = west ? -1 : 1;
    glassGeo.push(quadX(o.z0, o.z1, o.y0, o.y1, x + s * 0.002, west));
    const f = 0.06;
    frames.push(
      boxGeo(x - 0.02, x + 0.02, o.y0, o.y0 + f, o.z0, o.z1), boxGeo(x - 0.02, x + 0.02, o.y1 - f, o.y1, o.z0, o.z1),
      boxGeo(x - 0.02, x + 0.02, o.y0, o.y1, o.z0, o.z0 + f), boxGeo(x - 0.02, x + 0.02, o.y0, o.y1, o.z1 - f, o.z1),
    );
  };
  const shift = (list, dx, dy) => list.map((o) => ({ x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy, win: o.win }));
  /** Façade quads around the holes into `out` (z plane), glass in the holes unless it is our unit. */
  const facade = (out, x0, x1, y0, y1, z, northSide, holes, glass = true) => {
    for (const [xa, xb, ya, yb] of complement(x0, x1, y0, y1, holes)) out.push(quadZ(xa, xb, ya, yb, z, northSide));
    if (glass) holes.forEach((o) => fakeWindow(o, z, northSide));
  };

  // våning 1–2 (L1008, the east end unit, has its own north façade: see HUS_L.endUnitNorthHidden)
  const endUnitX = units[units.length - 1].ox;
  const northOf = (ox) => (Math.abs(ox - endUnitX) < 1e-6
    ? north.filter((o) => !H.endUnitNorthHidden.some(([a, b]) => (o.x0 + o.x1) / 2 > a && (o.x0 + o.x1) / 2 < b))
    : north);
  for (const { ox, x0: ux0, x1: ux1 } of units) {
    const ours = Math.abs(ox) < 1e-6;
    facade(bricks, ux0, ux1, 0, roofTop, -eps, true, shift(northOf(ox), ox, 0), !ours);
    facade(bricks, ux0, ux1, 0, roofTop, D + eps, false, shift(south, ox, 0), !ours);
    if (ours) continue;
    solids.push(boxGeo(ux0 + 0.001, ux1 - 0.001, 0, roofTop, 0, D));
    // the neighbours' patios: same slab, hedge and screen walls as ours (within their own strip: no overlap with ours)
    if (site.patio) { // slab paving like ours: UVs in metres (x, z)
      const pg = boxGeo(Math.max(ux0, ox + site.patio.x0), Math.min(ux1, ox + site.patio.x1), -0.01, 0.0, D, site.patio.z1);
      const pp = pg.attributes.position, uv = pg.attributes.uv;
      for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
      patios.push(pg);
    }
    if (site.hedge) {
      const h = site.hedge;
      hedges.push(boxGeo(ox + h.x0, ox + h.x1, 0, 1.1, h.z0, h.z1));
      segments.push([ox + h.x0, h.z0, ox + h.x1, h.z0], [ox + h.x1, h.z0, ox + h.x1, h.z1],
        [ox + h.x1, h.z1, ox + h.x0, h.z1], [ox + h.x0, h.z1, ox + h.x0, h.z0]);
    }
    for (let f of site.fences ?? []) {
      // the screen walls stand on the party lines: snapped to the strip's edge; the one shared with our unit is ours
      const fx = (x) => (x < W / 2 ? ux0 : ux1) - ox;
      if (ox + fx(f.a[0]) > -0.25 && ox + fx(f.a[0]) < W + 0.25) continue;
      f = { a: [fx(f.a[0]), f.a[1]], b: [fx(f.b[0]), f.b[1]] };
      fences.push(boxGeo(ox + f.a[0] - 0.025, ox + f.b[0] + 0.025, 0, FENCE_HEIGHT, Math.min(f.a[1], f.b[1]), Math.max(f.a[1], f.b[1])));
      segments.push([ox + f.a[0], f.a[1], ox + f.b[0], f.b[1]]);
    }
  }
  // stair core with the portik through the ground floor, a flat (L1101) on våning 2
  {
    const [p0, p1] = H.core.portik.map((p) => coreX0 + p), ph = H.core.portikHeight;
    const y2 = storeyFloor(2); // våning 2's floor (VERTICAL, #344)
    const win = (xa) => ({ x0: coreX0 + xa, x1: coreX0 + xa + 1.2, y0: y2 + 0.8, y1: y2 + 2.4 });
    const holes = [{ x0: p0, x1: p1, y0: 0, y1: ph }, win(1.0), win(6.4)];
    facade(bricks, coreX0, coreX1, 0, roofTop, -eps, true, holes, false);
    facade(bricks, coreX0, coreX1, 0, roofTop, D + eps, false, holes, false);
    [win(1.0), win(6.4)].forEach((o) => { fakeWindow(o, -eps, true); fakeWindow(o, D + eps, false); });
    // #415: the stairwell (src/core.js) is hollow — the solid west of the portik leaves out the stair band (x CORE.x0 … x1,
    // from the mid-landings' line to the lift shaft; on våning 3 from the upper units' street face) and the passage from
    // the portik's door (z CORE.portikDoor.z, 2.2 m high); the portik's west wall has the door's opening
    const [dz0, dz1] = CORE.portikDoor.z, dh = 2.2;
    const g = 0.03; // (#448: kept a few cm off the stairwell's own walls — coplanar faces flickered)
    solids.push(boxGeo(coreX0, CORE.x0 - g, 0, roofTop, 0, D), boxGeo(CORE.x1 + g, p0, 0, roofTop, 0, dz0 - g), boxGeo(CORE.x1 + g, p0, 0, roofTop, dz1 + g, D),
      boxGeo(CORE.x1 + g, p0, dh + g, roofTop, dz0, dz1), boxGeo(CORE.x0, CORE.x1, 0, roofTop - 0.2, 0, CORE.mid[0] - g), boxGeo(CORE.x0, CORE.x1, roofTop - 0.2, roofTop, 0, CORE.top[0] - g),
      boxGeo(p1, coreX1, 0, roofTop, 0, D), boxGeo(p0, p1, ph, roofTop, 0, D));
    bricks.push(quadX(0, dz0, 0, ph, p0 + eps, false), quadX(dz1, D, 0, ph, p0 + eps, false), quadX(dz0, dz1, dh, ph, p0 + eps, false), quadX(0, D, 0, ph, p1 - eps, true));
  }

  // våning 3–4: the upper units (L1201–L1209), one over each lower unit and one (L1205) over the core
  const C = H.court, y3 = roofTop + H.storeyHeight, zs = D - C.setback, par = y3 + C.parapet, deckY = y3 + C.deck;
  const LT = C.core.loft, coreW = coreX0 - H.wall, loftX0 = coreW - LT.west, loftX1 = coreW + LT.w, loftTop = upperTop + LT.rise, zt = zs - LT.back, zf = D - LT.face;
  const uppers = [...units.map((u) => [u.x0, u.x1, u.ox, u.upper]), [coreX0, coreX1, null, 'L1205']];
  const Lf = H.loft, doors = [], lampBox = [], lampGlow = [], balc = [], litGlass = [];
  let seed = 337;
  const isLit = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) < C.lit;
  const open = (list, ox, base) => list.map((o) => ({ x0: ox + o.x0, x1: ox + o.x1, y0: base + o.sill, y1: base + o.head }));
  /** Courtyard window/door: glass + frame, a share of them lit at night (litGlass). */
  const courtWindow = (o, z) => fakeWindow(o, z, false, isLit() ? litGlass : glassGeo);
  const S = H.street;
  /** An upper flat's street openings (HUS_L.street, #347): its own type's list, its flat-internal floor index mapped
   * to the building storey (storeyFloor, VERTICAL #344), x from the flat's west outer face `west` (L1205's entrance floor: from `east` − 5.75). */
  const streetOpenings = (type, west, east) => (S[type] ?? S.std).map((o) => {
    const base = storeyFloor(S.storey + o.floor), ox = o.east ? east - 5.75 : west;
    return { x0: ox + o.x0, x1: ox + o.x1, y0: base + (o.door ? 0 : o.sill), y1: base + (o.door ? S.doorHead : S.head), door: !!o.door };
  });
  const terraces = husLTerraces(W, D); // each flat's terrace: id, x0, x1 (#350)
  for (const [x0, x1, ox, id] of uppers) {
    const core = ox == null;
    // street side (#347): both storeys in render behind the loftgång, each flat type with its own openings
    const holes = core ? [...streetOpenings(id, coreW, coreX1 + H.wall), { x0: CORE.loftDoor.x[0], x1: CORE.loftDoor.x[1], y0: roofTop, y1: roofTop + 2.2, door: true, hole: true }] // + the stairwell's door (#415, core.js draws it)
      : streetOpenings(id, ox);
    facade(renders, x0, x1, roofTop, upperTop, loftD - eps, true, holes, false);
    for (const o of holes) {
      if (!o.door) { fakeWindow(o, loftD - eps, true); continue; }
      if (o.hole) continue;
      // the entrance (#111): set back, a white door with a narrow glass light, render reveals, a lantern beside it
      const zr = loftD + Lf.recess;
      renders.push(boxGeo(o.x0, o.x0 + 0.01, o.y0, o.y1, loftD, zr), boxGeo(o.x1 - 0.01, o.x1, o.y0, o.y1, loftD, zr), boxGeo(o.x0, o.x1, o.y1 - 0.01, o.y1, loftD, zr));
      doors.push(boxGeo(o.x0 + 0.01, o.x1 - 0.01, o.y0, o.y1 - 0.01, zr, zr + 0.05));
      glassGeo.push(quadZ(o.x0 + 0.12, o.x0 + 0.24, o.y0 + 0.9, o.y1 - 0.25, zr - 0.002, true));
      frames.push(boxGeo(o.x1 - 0.2, o.x1 - 0.08, o.y0 + 1.0, o.y0 + 1.03, zr - 0.04, zr)); // the handle
      const lx = o.x1 + Lf.lamp.dx, ly = o.y0 + Lf.lamp.y, { w: lw, h: lh } = Lf.lamp;
      lampBox.push(boxGeo(lx - lw / 2, lx + lw / 2, ly + lh / 2, ly + lh / 2 + 0.03, loftD - 0.12, loftD), boxGeo(lx - 0.03, lx + 0.03, ly - lh / 2, ly + lh / 2, loftD - 0.02, loftD));
      lampGlow.push(boxGeo(lx - lw / 2 + 0.01, lx + lw / 2 - 0.01, ly - lh / 2, ly + lh / 2, loftD - 0.11, loftD - 0.02));
    }
    // courtyard side, våning 3 (#337): brick flush with ours, up to the terrace parapet
    const low = core ? open(C.core.lower, x1 + H.wall - C.core.lowerW, roofTop) : open(C.lower, ox, roofTop);
    facade(bricks, x0, x1, roofTop, par, D + eps, false, low, false);
    low.forEach((o) => courtWindow(o, D + eps));
    if (core) solids.push(boxGeo(x0 + 0.001, CORE.x0 - 0.03, roofTop, y3, loftD, D), boxGeo(CORE.x1 + 0.03, x1 - 0.001, roofTop, y3, loftD, D), boxGeo(CORE.x0, CORE.x1, roofTop + 2.68, y3, loftD, D)); // (the stairwell's top storey, #415)
    else solids.push(boxGeo(x0 + 0.001, x1 - 0.001, roofTop, y3, loftD, D));
    // våning 4, set back behind the terrace: white render with the window and the terrace door
    // the terrace door's threshold sits on the finished deck (#350)
    const ta = core ? loftX1 : x0, up = (core ? open(C.core.upper, coreW, y3) : open(C.upper, ox, y3)).map((o) => ({ ...o, y0: Math.max(o.y0, deckY) }));
    facade(renders, ta, x1, y3, upperTop, zs + eps, false, up, false);
    up.forEach((o) => courtWindow(o, zs + eps));
    solids.push(boxGeo(x0 + 0.001, x1 - 0.001, y3, upperTop, loftD, zs));
    if (!core) continue;
    // L1205's loft over the lift (#337, #349): its courtyard face `face` behind våning 3's (0: flush), in brick, rising
    // `rise` over the roof and reaching `back` north of the set-back line — breaks the terrace row
    const lw = open([LT.win], coreW, y3);
    facade(bricks, loftX0, loftX1, par, loftTop, zf + eps, false, lw, false);
    lw.forEach((o) => courtWindow(o, zf + eps));
    for (const [x, west] of [[loftX0, true], [loftX1, false]]) {
      bricks.push(quadX(zs, zf, y3, loftTop, x + (west ? -eps : eps), west), quadX(zt, zs, upperTop, loftTop, x + (west ? -eps : eps), west));
    }
    bricks.push(quadZ(loftX0, loftX1, upperTop, loftTop, zt - eps, true));
    solids.push(boxGeo(loftX0, loftX1, y3, loftTop, zs, zf), boxGeo(loftX0, loftX1, upperTop, loftTop, zt, zs));
    roofs.push(boxGeo(loftX0 - 0.03, loftX1 + 0.03, loftTop, loftTop + 0.05, zt - 0.03, zf + 0.03));
  }
  // the roof terraces (#337): a slab deck, the parapet's inner face + coping, a white railing on it (top rail, bottom
  // rail, bars every 11 cm; its top `rail` over the finished deck), skärmväggar between the units
  const zp = D - 0.25, trz = D - 0.1, capY = par + 0.05;
  for (const { x0: a, x1: b } of terraces) {
    const pg = boxGeo(a, b, y3, deckY, zs, zp);
    const pp = pg.attributes.position, uv = pg.attributes.uv;
    for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
    patios.push(pg);
    bricks.push(quadZ(a, b, deckY, par, zp - eps, true));
    copings.push(boxGeo(a - 0.02, b + 0.02, par, capY, zp - 0.02, D + 0.04));
    balc.push(boxGeo(a + 0.03, b - 0.03, deckY + C.rail - 0.04, deckY + C.rail, trz - 0.03, trz + 0.03), boxGeo(a + 0.03, b - 0.03, capY + 0.06, capY + 0.09, trz - 0.015, trz + 0.015));
    for (let x = a + 0.08; x < b - 0.05; x += 0.11) balc.push(boxGeo(x - 0.01, x + 0.01, capY, deckY + C.rail - 0.04, trz - 0.01, trz + 0.01));
  }
  for (const [x, s] of [[xw, 1], [xe, -1]]) { // along the gables: the parapet and a railing from the set-back wall to the edge
    copings.push(boxGeo(Math.min(x - 0.04 * s, x + 0.25 * s), Math.max(x - 0.04 * s, x + 0.25 * s), par, capY, zs, D + 0.04));
    const rx = x + 0.1 * s;
    balc.push(boxGeo(rx - 0.03, rx + 0.03, deckY + C.rail - 0.04, deckY + C.rail, zs, D - 0.07));
    for (let z = zs + 0.08; z < D - 0.12; z += 0.11) balc.push(boxGeo(rx - 0.01, rx + 0.01, capY, deckY + C.rail - 0.04, z - 0.01, z + 0.01));
  }
  for (let i = 0; i + 1 < terraces.length; i++) { // skärmvägg h 1.8 where two terraces meet (not at the loft, the gables)
    const x = terraces[i].x1;
    if (Math.abs(terraces[i + 1].x0 - x) < 1e-3) fences.push(boxGeo(x - 0.03, x + 0.03, deckY, deckY + C.screen, zs, zp));
  }
  const edges = [...new Set(uppers.flatMap(([a, b]) => [a, b]).map((x) => +x.toFixed(3)))];
  const pw = H.pilaster / 2;
  for (const x of edges) pilasters.push(boxGeo(x - pw, x + pw, roofTop, upperTop + 0.5, loftD - 0.1, loftD)); // street side only

  // gable ends (#351): each gable's openings from HUS_L.gableWindows by side and building storey — brick for våning 1–2
  // (the whole depth) and våning 3 (behind the loftgång, up to the terrace parapet), våning 4 in render behind the terrace
  const gw = gableOpenings(H.gableWindows, storeyFloor);
  for (const [gable, x, west] of [['west', xw, true], ['east', xe, false]]) {
    const xx = x + (west ? -eps : eps), on = (st) => gw.filter((g) => g.gable === gable && st.includes(g.storey)).map((g) => ({ x0: g.z0, x1: g.z1, y0: g.y0, y1: g.y1 }));
    for (const [za, zb, ya, yb] of complement(0, D, 0, roofTop, on([1, 2]))) bricks.push(quadX(za, zb, ya, yb, xx, west));
    for (const [za, zb, ya, yb] of complement(loftD, D, roofTop, par, on([3]))) bricks.push(quadX(za, zb, ya, yb, xx, west));
    for (const [za, zb, ya, yb] of complement(loftD, zs, y3, upperTop, on([4]))) renders.push(quadX(za, zb, ya, yb, xx, west));
    gw.filter((g) => g.gable === gable).forEach((g) => fakeWindowX(g, xx, west));
  }

  // flat roof over våning 4 with a parapet, solar panels
  const rb = VERTICAL.roof.buildUp, rc = rb + VERTICAL.roof.capping; // roof build-up + capping (assumption, #344)
  roofs.push(boxGeo(xw - 0.1, xe + 0.1, upperTop, upperTop + rb, loftD - 0.1, zs + 0.1));
  const capping = [boxGeo(xw - 0.13, xe + 0.13, upperTop + rb, upperTop + rc, loftD - 0.13, zs + 0.13), ...copings]; // light sheet-metal capping on the parapets (#110)
  for (const [xa, xb] of H.solar.x) for (const [za, zb] of H.solar.z) panels.push(boxGeo(xa, xb, upperTop + rc, upperTop + rc + 0.07, za, zb));

  // loftgång deck from the west drum to the east end, plus the landing to the east drum
  const towers = H.towers.map((t) => (t.gable === 'west' ? { ...t, x: xw - t.r } : t)); // right against the gable (#172)
  const [tw, te] = towers;
  const deckX0 = tw.x + tw.r * 0.8;
  solids.push(boxGeo(deckX0, xe, roofTop - 0.25, roofTop, -0.05, loftD));
  solids.push(boxGeo(te.x - 1.2, te.x + 1.2, roofTop - 0.25, roofTop, te.z + te.r * 0.7, 0));
  for (const t of towers) {
    bricks.push(...drum(t.x, t.z, t.r, roofTop + H.railHeight, { at: t.door, deg: t.gap, y: roofTop }));
    spiralStair(t, roofTop, rails, solids); // its stair inside (#444)
    for (let i = 0; i < 16; i++) { // collision: a 16-gon round the drum
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      segments.push([t.x + t.r * Math.cos(a0), t.z + t.r * Math.sin(a0), t.x + t.r * Math.cos(a1), t.z + t.r * Math.sin(a1)]);
    }
  }

  // loftgång railing: a round handrail + bottom rail + balusters every 12 cm (open at the east drum's landing)
  const rz = 0.04, rh = H.railHeight;
  const fascia = [boxGeo(deckX0, xe, roofTop - 0.27, roofTop + 0.02, -0.075, -0.05)]; // sheet-metal edge of the deck (#111)
  for (const [ra, rb] of [[deckX0, te.x - 1.2], [te.x + 1.2, xe]]) {
    rails.push(new THREE.CylinderGeometry(Lf.handrailR, Lf.handrailR, rb - ra, 10).rotateZ(Math.PI / 2).translate((ra + rb) / 2, roofTop + rh - Lf.handrailR, rz));
    rails.push(boxGeo(ra, rb, roofTop + 0.08, roofTop + 0.12, rz - 0.02, rz + 0.02));
    for (let x = ra + 0.06; x < rb; x += 0.12) rails.push(boxGeo(x - 0.01, x + 0.01, roofTop, roofTop + rh, rz - 0.01, rz + 0.01));
  }
  // the same railing on the loftgång's other open edges (#449): the east end, the east drum's landing's two sides from
  // the drum wall's doorway edges to the street railing, and the gap between the west drum's doorway and the deck's corner
  const railRun = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    rails.push(new THREE.CylinderGeometry(Lf.handrailR, Lf.handrailR, L, 10).rotateZ(Math.PI / 2).rotateY(-ang).translate(mx, roofTop + rh - Lf.handrailR, mz));
    rails.push(new THREE.BoxGeometry(L, 0.04, 0.04).rotateY(-ang).translate(mx, roofTop + 0.1, mz));
    for (let d = 0.06; d < L - 0.02; d += 0.12) {
      const u = d / L;
      rails.push(new THREE.BoxGeometry(0.02, rh, 0.02).rotateY(-ang).translate(ax + (bx - ax) * u, roofTop + rh / 2, az + (bz - az) * u));
    }
  };
  const gapEdge = (t, s) => { const a = ((t.door + (s * t.gap) / 2) * Math.PI) / 180; return [t.x + t.r * Math.cos(a), t.z + t.r * Math.sin(a)]; };
  const loftRails = [
    [xe - rz, rz, xe - rz, loftD],                    // the east end, up to the upper unit's gable
    [...gapEdge(te, -1), te.x + 1.2, rz],             // the east drum's landing: its east side …
    [...gapEdge(te, 1), te.x - 1.2, rz],              // … and its west side
    [...gapEdge(tw, -1), deckX0 + rz, rz],            // the west drum's doorway to the deck's street corner
  ];
  for (const r of loftRails) railRun(...r);

  // walking up there (#360, src/roofs.js): the surfaces and the walls standing on them, from the same measures as the
  // meshes above. Walls start under the ground (−10) where they are the building's own faces, so nobody falls into it.
  const surfaces = [], walls = [], low = -10, roofY = upperTop + rc, loftY = loftTop + 0.05;
  const surf = (id, name, x0, x1, z0, z1, y) => surfaces.push({ id, name, x0, x1, z0, z1, y });
  surf('L-loftgang', 'Loftgången', deckX0, xe, -0.05, loftD, roofTop);
  surf('L-loftgang', 'Loftgången', te.x - 1.2, te.x + 1.2, te.z + te.r * 0.7, 0, roofTop); // the landing to the east drum
  for (const t of terraces) surf(`L-terrace-${t.id}`, `Takterrassen ${t.id}`, t.x0, t.x1, zs, D - 0.1, deckY);
  surf('L-roof', 'Hus L:s tak', xw - 0.13, xe + 0.13, loftD - 0.13, zs + 0.13, roofY);
  for (const [xa, xb] of H.solar.x) for (const [za, zb] of H.solar.z) surf('L-roof', 'Hus L:s tak', xa, xb, za, zb, roofY + 0.07); // step over them
  surf('L-loft', 'Loftet över hisstoppet', loftX0 - 0.03, loftX1 + 0.03, zt - 0.03, zf + 0.03, loftY);
  wallRect(walls, xw, xe, 0, D, low, roofTop); // våning 1–2 (a fall past the façades stays outside)
  wallLine(walls, xw, loftD, CORE.loftDoor.x[0], loftD, roofTop, roofY); // the upper units' street face, over the loftgång (no way in) …
  wallLine(walls, CORE.loftDoor.x[1], loftD, xe, loftD, roofTop, roofY);
  wallLine(walls, CORE.loftDoor.x[0], loftD, CORE.loftDoor.x[1], loftD, roofTop + 2.2, roofY); // … but the stairwell's door (#415: its leaf is core.js's)
  for (const [ra, rb2] of [[deckX0, te.x - 1.2], [te.x + 1.2, xe]]) wallLine(walls, ra, rz, rb2, rz, roofTop - 0.3, roofTop + rh); // the loftgång railing
  for (const [ax, az, bx, bz] of loftRails) wallLine(walls, ax, az, bx, bz, roofTop - 0.3, roofTop + rh); // its other edges (#449)
  wallLine(walls, xw, D - 0.1, xe, D - 0.1, roofTop, deckY + C.rail); // våning 3's courtyard face + the terraces' parapet and railing
  for (const [x, s] of [[xw, 1], [xe, -1]]) {
    wallLine(walls, x, loftD, x, zs, roofTop, roofY); // the gables
    wallLine(walls, x, zs, x, D, roofTop, par);
    wallLine(walls, x + 0.1 * s, zs, x + 0.1 * s, D, deckY, deckY + C.rail); // the railing along the gable
  }
  wallLine(walls, xw, zs, loftX0, zs, y3, roofY); // våning 4's set-back wall behind the terraces
  wallLine(walls, loftX1, zs, xe, zs, y3, roofY);
  for (const x of [loftX0, loftX1]) { wallLine(walls, x, zs, x, zf, y3, loftY); wallLine(walls, x, zt, x, zs, upperTop, loftY); } // the loft
  wallLine(walls, loftX0, zf, loftX1, zf, y3, loftY);
  wallLine(walls, loftX0, zt, loftX1, zt, upperTop, loftY);
  for (let i = 0; i + 1 < terraces.length; i++) { // skärmväggar h 1.8
    const x = terraces[i].x1;
    if (Math.abs(terraces[i + 1].x0 - x) < 1e-3) wallLine(walls, x, zs, x, zp, deckY, deckY + C.screen);
  }
  for (const [t, name] of [[tw, 'west'], [te, 'east']]) { // the drums: their wall, open where the loftgång / landing goes in; a top landing inside
    surfaces.push({ id: `L-drum-${name}`, name: 'Spiraltrappans torn', cx: t.x, cz: t.z, r: t.r - 0.05, y: roofTop });
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      const s = [t.x + t.r * Math.cos(a0), t.z + t.r * Math.sin(a0), t.x + t.r * Math.cos(a1), t.z + t.r * Math.sin(a1)], mx = (s[0] + s[2]) / 2, mz = (s[1] + s[3]) / 2;
      const door = t === tw ? mx > deckX0 - 0.3 && mz > -0.05 && mz < loftD : mz > t.z + t.r * 0.6 && Math.abs(mx - t.x) < 1.2;
      walls.push({ s, y0: low, y1: door ? roofTop : roofTop + rh });
    }
  }
  group.userData.walk = { surfaces, walls };

  const add = (geos, material, shadow = true) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(bricks, brickMat());
  add(renders, new THREE.MeshStandardMaterial({ color: H.render, roughness: 0.95 }));
  add(pilasters, new THREE.MeshStandardMaterial({ color: COLORS.brick, roughness: 0.95 }));
  add(solids, wall);
  add(frames, frame);
  add(glassGeo, new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.1, metalness: 0.4 }), false);
  add(rails, new THREE.MeshStandardMaterial({ color: COLORS.balcony, roughness: 0.5, metalness: 0.3 }));
  add([...fascia, ...capping], new THREE.MeshStandardMaterial({ color: Lf.fascia, roughness: 0.4, metalness: 0.4 }));
  const railMesh = add(balc, new THREE.MeshStandardMaterial({ color: Lf.door, roughness: 0.45, metalness: 0.2 }));
  if (railMesh) railMesh.name = 'terraceRails'; // the terraces' railings (tools/terracetest.html)
  group.userData.terraces = { list: terraces, y3, deck: deckY, parapet: par }; // #350
  add(doors, new THREE.MeshStandardMaterial({ color: Lf.door, roughness: 0.4 }));
  // #433: a wall light by every street-side front door on våning 1 (ours too): the box joins the lanterns' housings,
  // the glass their glow; the façade wash and the ground pool are two additive meshes for the whole row
  const DL = H.doorLamp, frontDoor = north.find((o) => o.y0 < 0.05 && o.y1 > 2);
  const doorWash = [], doorPool = [];
  if (frontDoor) for (const { ox } of units) {
    const lx = ox + frontDoor.x1 + DL.dx, { w: lw, h: lh, d: ld, y: ly } = DL;
    lampBox.push(boxGeo(lx - lw / 2, lx + lw / 2, ly - lh / 2, ly + lh / 2, -ld, -eps), boxGeo(lx - lw / 2 - 0.015, lx + lw / 2 + 0.015, ly + lh / 2, ly + lh / 2 + 0.02, -ld - 0.015, -eps));
    lampGlow.push(boxGeo(lx - lw / 2 + 0.015, lx + lw / 2 - 0.015, ly - lh / 2 + 0.02, ly + lh / 2 - 0.02, -ld - 0.004, -ld + 0.01));
    doorWash.push(washGeometry(lx, DL.wash.y, -eps, 0, -1, DL.wash.w, DL.wash.h));
    doorPool.push(poolGeometry(lx - 0.3, DL.pool.z, 1, 0, DL.pool.rx, DL.pool.rz, groundY, { rings: 5, segs: 20 }));
  }
  // #451: the portik — paved through (UVs in metres like the courtyard walks; its own material, so no snow) and its ceiling
  // lamps (opal discs; their pools / washes join the door lights' meshes and fade with them)
  const PL = H.portikLamp, [pk0, pk1] = H.core.portik.map((p) => coreX0 + p), pkx = (pk0 + pk1) / 2, pkh = H.core.portikHeight;
  {
    const g = new THREE.PlaneGeometry(pk1 - pk0, D, 1, 1).rotateX(-Math.PI / 2).translate(pkx, groundY(pkx, D / 2) + 0.006, D / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }));
    m.receiveShadow = true; m.name = 'portikPaving';
    group.add(m);
  }
  const portikDiscs = [];
  for (const z of PL.z) {
    portikDiscs.push(new THREE.CylinderGeometry(PL.r, PL.r, 0.05, 24).translate(pkx, pkh - 0.025, z));
    doorPool.push(poolGeometry(pkx, z, 0, 1, PL.pool.ra, PL.pool.rb, groundY, { rings: 5, segs: 20 }),
      poolGeometry(pkx, z, 0, 1, PL.pool.ra * 0.7, PL.pool.rb * 0.85, () => pkh, { lift: -0.012, rings: 4, segs: 20 })); // (+ a glow on the ceiling round the disc)
    doorWash.push(washGeometry(pk0 + eps, PL.wash.y, z, 1, 0, PL.wash.w, PL.wash.h), washGeometry(pk1 - eps, PL.wash.y, z, -1, 0, PL.wash.w, PL.wash.h));
  }
  const portikMat = new THREE.MeshBasicMaterial({ color: PL.off, toneMapped: false }), portikLit = new THREE.Color(PL.lit), portikOff = new THREE.Color(PL.off);
  add(portikDiscs, portikMat, false).name = 'portikLamps';
  const glows = doorWash.length ? [[doorWash, DL.wash.peak, THREE.FrontSide], [doorPool, DL.pool.peak, THREE.DoubleSide]].map(([geos, peak, side]) => {
    const m = new THREE.Mesh(mergeGeometries(geos), glowMaterial(DL.color));
    m.material.side = side; m.visible = false; m.renderOrder = 2; m.userData.peak = peak;
    group.add(m);
    return m;
  }) : [];
  if (glows.length) { glows[0].name = 'doorLampWash'; glows[1].name = 'doorLampPools'; }
  let doorLit = false, doorGlow = 0, doorT = performance.now();
  add(lampBox, new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.4 }));
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x55534d, toneMapped: false }), lit = new THREE.Color(0xffd9a0), off = new THREE.Color(0x8d8b84);
  add(lampGlow, glowMat, false);
  /** night 0 … 1 (with the window lights): the lanterns by the loftgång doors glow after dusk. */
  // the upper units' courtyard windows (#337): a share of them lit after dusk (one material, its emissive switched)
  const litMat = new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.1, metalness: 0.4, emissive: 0xffc98a, emissiveIntensity: 0 });
  add(litGlass, litMat, false);
  group.userData.update = (night) => {
    glowMat.color.copy(night > 0.35 ? lit : off);
    litMat.emissiveIntensity = night > 0.35 ? 0.6 : 0;
    // the front-door lights (#433): on after dusk with a short fade (hysteresis: no flicker)
    const now = performance.now(), dt = Math.min(1, (now - doorT) / 1000);
    doorT = now;
    if (!doorLit && night > DL.on) doorLit = true; else if (doorLit && night < DL.off) doorLit = false;
    for (const m of glows) doorGlow = fadeGlow(m, doorGlow, doorLit, m === glows[0] ? dt : 0, DL.fade, m.userData.peak);
    portikMat.color.lerpColors(portikOff, portikLit, doorGlow);
  };
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: 0.9 });
  registerSnow(roofMat, SEASON.snow.roof);
  add(roofs, roofMat);
  add(panels, new THREE.MeshStandardMaterial({ color: COLORS.solar, roughness: 0.3, metalness: 0.5 }), false);
  add(patios, mats.patio, false);
  add(hedges, mats.hedge);
  add(fences, mats.fence);
  group.userData.segments = segments;
  return group;
}

/** HUS_L.gableWindows (#351) with absolute heights: y0 / y1 over their building storey's floor (`floorOf` = config's
 * storeyFloor). */
export function gableOpenings(list, floorOf) {
  return list.map((g) => ({ ...g, y0: floorOf(g.storey) + g.sill, y1: floorOf(g.storey) + g.head }));
}

/**
 * The roof terraces in front of våning 4 (#350), west → east: one per upper flat with its id, the strip [x0, x1] from
 * party-wall centre to party-wall centre (the end flats out to the gable; L1204 to the loft's west wall, L1205 from its
 * east wall), z from the set-back wall (D − setback) to the parapet's outer face (D); `poly` (plan x/z), `area` (m²) and
 * `target` = the brochure's figure (HUS_L.court.areas).
 */
export function husLTerraces(W = 5.75, D = 12.7) {
  const C = H.court, { units, core: [cx0, cx1] } = husLLayout(W), coreW = cx0 - H.wall, zs = D - C.setback;
  // between the party-wall centres (not the façade strips, which keep our own unit's full 5.75 m: W)
  const list = units.map((u, i) => ({ id: u.upper, x0: i === 0 ? u.x0 : u.ox + H.wall, x1: i === units.length - 1 ? u.x1 : u.ox + H.wall + H.pitch }));
  list.find((t) => Math.abs(t.x1 - cx0) < 1e-6).x1 = coreW - C.core.loft.west; // L1204: up to the loft's west wall
  list.push({ id: 'L1205', x0: coreW + C.core.loft.w, x1: cx1 });
  list.sort((a, b) => a.x0 - b.x0);
  for (const t of list) {
    t.poly = [[t.x0, zs], [t.x1, zs], [t.x1, D], [t.x0, D]];
    t.area = Math.abs(t.poly.reduce((s, [x, z], i, p) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * z, 0)) / 2;
    t.target = C.areas[t.id] ?? C.areas.std;
  }
  return list;
}

/**
 * Hus L along x (#252, våningsöversikterna): the units share their party walls, so they follow each other at
 * HUS_L.pitch between the wall centres (our own plan draws both 0.2 m walls in full: W = 5.75). Unit k's openings
 * sit at ox = k × pitch, like ours at 0; its façade strip runs between its wall centres (ox + wall … ox + wall +
 * pitch), clipped against our unit [0, W]; the end units reach `gableExtra` past their last wall centre (thicker
 * gables). The core lies between the wall centres either side of it. Returns the units (ox, x0, x1, the flat ids
 * `lower` (våning 1–2) / `upper` (våning 3–4); west → east),
 * the core [x0, x1] and the gables xw / xe.
 */
export function husLLayout(W = 5.75) {
  const P = H.pitch, c = H.wall, units = [];
  const span = (ox) => (Math.abs(ox) < 1e-6 ? { ox, x0: 0, x1: W }
    : ox < 0 ? { ox, x0: ox + c, x1: Math.min(ox + c + P, 0) } : { ox, x0: Math.max(ox + c, W), x1: ox + c + P });
  const coreX1 = -H.before * P, coreX0 = coreX1 - H.core.w;
  for (let k = H.west; k >= 1; k--) units.push(span(coreX0 - k * P));
  for (let k = -H.before; k <= H.after; k++) units.push(span(k * P));
  // the flats' numbers (våningsöversikterna): våning 1–2 L1001… west → east (L1101 over the portik), våning 3–4 L1201…
  // with L1205 over the core
  const id = (n) => `L1${String(n).padStart(3, '0')}`;
  units.forEach((u, i) => Object.assign(u, { lower: id(i + 1), upper: id(200 + i + (i < H.west ? 1 : 2)) }));
  units[0].x0 -= H.gableExtra;
  units[units.length - 1].x1 += H.gableExtra;
  return { units, core: [coreX0 + c, coreX1 + c], portik: H.core.portik.map((p) => coreX0 + c + p), xw: units[0].x0, xe: units[units.length - 1].x1 };
}
