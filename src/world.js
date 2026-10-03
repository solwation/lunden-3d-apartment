import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LEVELS, SOFFITS, DOOR_HEIGHT, DOOR_TRIM, EXT_DOOR_HEAD, WINDOWS, WINDOW_TOP_HUNG_MAX, BLINDS, CABINET_HEIGHT, BASE_CABINET, SHELF_HEIGHT, TOILET,
  STAIR, COLORS, FENCE_HEIGHT, SITE, OUTDOOR, CABINET_FIXES, SEASON, FINISH, OPTIONS, EXTRA_WALLS, ROOM_RENAMES, EXTRA_ROOMS, ROOM_DIVIDERS,
} from './config.js';
import { buildStairs } from './stairs.js';
import { Openable } from './openables.js';
import { sfx } from './audio.js';
import { SwingDoor, SlidingDoor, wardrobeDoors } from './doors.js';
import { buildExterior } from './exterior.js';
import { buildFurniture, surfaceBox } from './furniture.js';
import { buildWallShelves } from './shelves.js';
import { buildHallWall } from './keycabinet.js';
import { mergeStatic } from './merge.js';
import { Pack, frameMatrix, hallWardrobe } from './contents.js';
import { buildSillPlants } from './sillplants.js';
import { registerSnow } from './seasons.js';
import { buildCourtyard } from './courtyard.js';
import { buildStreetLife } from './streetlife.js';
import { pavingTexture } from './patio.js';
import { mirrorLamps, looseItems as interiorLoose, buildInterior, buildElCabinet, cupSurfaces, cupCabinet } from './interior.js';
import { Toilet } from './toilet.js';
import { RoomMap } from './rooms.js';
import { buildAO } from './ao.js';
import { buildSurroundings, terrainNorth } from './surroundings.js';
import { addDoorSigns } from './signs.js';
import { wardrobeFill, personFor } from './stuff.js';
import { Blinds } from './blinds.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

/** Parquet (1-stav planks, FINISH.parquet): one texture repeat = `n` planks across. */
function plankTexture() {
  const { base: [r0, g0, b0], width, length } = FINISH.parquet;
  const ppm = 300, n = 6;
  const pw = Math.round(width * ppm), pl = Math.round(length * ppm);
  const c = document.createElement('canvas');
  c.width = pw * n; c.height = pl * 2;
  const g = c.getContext('2d');
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let col = 0; col < n; col++) {
    const offset = Math.round(((col * 0.37) % 1) * pl); // staggered end joints
    for (let y = -offset; y < c.height; y += pl) {
      const k = 0.95 + rand() * 0.08;
      g.fillStyle = `rgb(${r0 * k},${g0 * k},${b0 * k})`;
      g.fillRect(col * pw, y, pw, pl);
      // faint grain along the plank
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(120,95,70,${0.04 + rand() * 0.05})`;
        g.fillRect(col * pw + rand() * pw, y, 1 + rand() * 1.5, pl);
      }
      g.strokeStyle = 'rgba(90,70,50,0.3)';
      g.strokeRect(col * pw + 0.5, y + 0.5, pw - 1, pl - 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / (width * n), 1 / (length * 2));
  tex.anisotropy = 8;
  return tex;
}

const M = {
  wall: mat(COLORS.wall),
  ceiling: mat(COLORS.ceiling),
  floor: mat(0xffffff, { map: plankTexture(), roughness: 0.7 }),
  tile: mat(COLORS.tile, { roughness: 0.4 }),
  cabinet: mat(COLORS.cabinet, { roughness: 0.5 }),
  counter: mat(COLORS.counter, { roughness: 0.35 }),
  appliance: mat(COLORS.appliance, { roughness: 0.3 }),
  porcelain: mat(COLORS.porcelain, { roughness: 0.15 }),
  frame: mat(COLORS.frame, { roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: COLORS.glass, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0, depthWrite: false,
  }),
  door: mat(COLORS.door, { roughness: 0.6 }),
  rail: mat(COLORS.rail, { roughness: 0.4, metalness: 0.3 }),
  riser: mat(COLORS.riser, { roughness: 0.6 }), // stair risers and stringers (white)
  dark: mat(0x1d2023, { roughness: 0.3 }),
  grass: mat(COLORS.grass, { roughness: 1 }),
  patio: mat(0xffffff, { map: pavingTexture(), roughness: 0.95 }), // slab paving (PATIO.paving)
  hedge: mat(COLORS.hedge, { roughness: 1 }),
  fence: mat(COLORS.fence, { roughness: 0.9 }),
};

/** Axis-aligned box from plan ranges (x, z) and height range y. */
function box(x0, x1, z0, z1, y0, y1, material, { shadow = true } = {}) {
  const geo = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function polygonShape(points) {
  return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
}

function prism(points, y0, y1, material) {
  const geo = new THREE.ExtrudeGeometry(polygonShape(points), { depth: y1 - y0, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Horizontal plate (floor/ceiling). */
function plate(x0, x1, z0, z1, y, material, faceDown = false) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(faceDown ? Math.PI / 2 : -Math.PI / 2);
  // planar UVs in metres so textures tile by world size
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + (x0 + x1) / 2, pos.getZ(i) + (z0 + z1) / 2);
  geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Plate split into rectangles around one rectangular opening (avoids triangulating holes). */
function plateAround(x0, x1, z0, z1, h, y, material, faceDown = false) {
  if (!h) return [plate(x0, x1, z0, z1, y, material, faceDown)];
  return [
    [x0, x1, z0, h.z0], [x0, x1, h.z1, z1], [x0, h.x0, h.z0, h.z1], [h.x1, x1, h.z0, h.z1],
  ].map(([a, b, c, d]) => plate(a, b, c, d, y, material, faceDown));
}

const bboxOf = (pts) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};

/**
 * Find the wall gap an opening sits in. `axis` is the direction along the wall ('x' or 'z'),
 * `c` the perpendicular coordinate of a line through the gap, [a, b] a span known to lie
 * inside the gap. Returns the gap span and the wall thickness range.
 */
function findGap(wallBoxes, axis, c, a, b) {
  const along = axis === 'x' ? ['x0', 'x1'] : ['z0', 'z1'];
  const perp = axis === 'x' ? ['z0', 'z1'] : ['x0', 'x1'];
  const tol = 0.02;
  const crossing = wallBoxes.filter((w) => w[perp[0]] - tol <= c && w[perp[1]] + tol >= c);
  let lo = -Infinity, hi = Infinity, loW = null, hiW = null;
  for (const w of crossing) {
    if (w[along[1]] <= a + tol && w[along[1]] > lo) { lo = w[along[1]]; loW = w; }
    if (w[along[0]] >= b - tol && w[along[0]] < hi) { hi = w[along[0]]; hiW = w; }
  }
  if (!loW || !hiW) return null;
  let p0 = Math.max(loW[perp[0]], hiW[perp[0]]), p1 = Math.min(loW[perp[1]], hiW[perp[1]]);
  if (p1 - p0 < 0.03) { p0 = Math.min(loW[perp[0]], hiW[perp[0]]); p1 = Math.max(loW[perp[1]], hiW[perp[1]]); }
  return { lo, hi, p0, p1, axis };
}

/**
 * Architraves (dörrfoder) around a door opening on both wall faces: two jambs and a head piece,
 * DOOR_TRIM.width wide. `slideFace` = the wall face a sliding panel runs along (thinner trim there).
 */
function architraves(gap, y0, head, slideFace = null) {
  const { width: w, thickness: t, slideThickness } = DOOR_TRIM;
  const out = [];
  // a box from along a0..a1, height ya..yb, across the wall p0..p1, in world axes
  const geo = (a0, a1, ya, yb, p0, p1) => {
    const [sx, sz, cx, cz] = gap.axis === 'x'
      ? [a1 - a0, p1 - p0, (a0 + a1) / 2, (p0 + p1) / 2]
      : [p1 - p0, a1 - a0, (p0 + p1) / 2, (a0 + a1) / 2];
    return new THREE.BoxGeometry(sx, yb - ya, sz).translate(cx, (ya + yb) / 2, cz);
  };
  for (const [face, dir] of [[gap.p0, -1], [gap.p1, 1]]) {
    const slide = slideFace !== null && Math.sign(slideFace - (gap.p0 + gap.p1) / 2) === dir;
    const th = slide ? slideThickness : t;
    const [p0, p1] = dir > 0 ? [face, face + th] : [face - th, face];
    out.push(geo(gap.lo - w, gap.lo, y0, head + w, p0, p1), geo(gap.hi, gap.hi + w, y0, head + w, p0, p1),
      geo(gap.lo, gap.hi, head, head + w, p0, p1));
  }
  return out;
}
function gapBox(gap, y0, y1, material) {
  return gap.axis === 'x'
    ? box(gap.lo, gap.hi, gap.p0, gap.p1, y0, y1, material)
    : box(gap.p0, gap.p1, gap.lo, gap.hi, y0, y1, material);
}

function rectSegments(r) {
  return [
    [r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1],
    [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0],
  ];
}

function polySegments(pts) {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return [p[0], p[1], q[0], q[1]];
  });
}

// Cabinets built hollow with sliding fronts: G (garderob) and L (the wardrobe in Sovrum 2).
const WARDROBE_LABELS = ['G', 'L'];

const gapRect = (g) => (g.axis === 'x' ? { x0: g.lo, x1: g.hi, z0: g.p0, z1: g.p1 } : { x0: g.p0, x1: g.p1, z0: g.lo, z1: g.hi });

const insideRect = (f, r) => f.x0 >= r.x0 - 0.01 && f.x1 <= r.x1 + 0.01 && f.z0 >= r.z0 - 0.01 && f.z1 <= r.z1 + 0.01;

const wardrobeSpecs = []; // the wardrobes buildWardrobe made (their contents come later, #230)

/** Hollow wardrobe (carcass, hat shelf, rod) + two sliding doors on the open side. */
function buildWardrobe(group, g, y0, h, wallBoxes, doors) {
  const along = g.x1 - g.x0 > g.z1 - g.z0; // doors run along x?
  // the front is the long side that doesn't back onto a wall
  const backed = (side) => wallBoxes.some((w) => (along
    ? w.x1 > g.x0 + 0.05 && w.x0 < g.x1 - 0.05 && Math.abs((side < 0 ? w.z1 : w.z0) - (side < 0 ? g.z0 : g.z1)) < 0.05
    : w.z1 > g.z0 + 0.05 && w.z0 < g.z1 - 0.05 && Math.abs((side < 0 ? w.x1 : w.x0) - (side < 0 ? g.x0 : g.x1)) < 0.05));
  const outward = backed(+1) && !backed(-1) ? -1 : backed(-1) ? +1 : -1;
  const t = 0.02, y1 = y0 + h;
  const [a, b] = along ? [g.x0, g.x1] : [g.z0, g.z1];
  const [p0, p1] = along ? [g.z0, g.z1] : [g.x0, g.x1];
  const front = outward > 0 ? p1 : p0, back = outward > 0 ? p0 : p1;
  const piece = (a0, a1, q0, q1, ya, yb) => group.add(along
    ? box(a0, a1, Math.min(q0, q1), Math.max(q0, q1), ya, yb, M.cabinet)
    : box(Math.min(q0, q1), Math.max(q0, q1), a0, a1, ya, yb, M.cabinet));
  piece(a, b, back, back + outward * t, y0, y1);                // back
  piece(a, a + t, back, front, y0, y1);                         // ends
  piece(b - t, b, back, front, y0, y1);
  piece(a, b, back, front, y1 - t, y1);                         // top
  piece(a, b, back, front, y0, y0 + 0.08);                      // plinth
  piece(a + t, b - t, back, front - outward * 0.05, y0 + 1.78, y0 + 1.8); // hat shelf
  const mid = (back + front) / 2;
  piece(a + t, b - t, mid - 0.012, mid + 0.012, y0 + 1.7, y0 + 1.724); // clothes rod
  // what goes inside (#230/#231) is added once the rooms are known (buildWorld): who sleeps here
  wardrobeSpecs.push({ group, along, a0: a + t, a1: b - t, mid, front, back, depth: Math.abs(front - back) - t - 0.05, outward, y0, rodY: y0 + 1.7, shelfY: y0 + 1.8, topY: y1 - t });
  for (const d of wardrobeDoors({ along, front, back, outward, a, b, y0, height: h, material: M.door })) {
    group.add(d.object);
    doors.push(d);
  }
  return { along, outward, a, b, back, front, y0, y1, t };
}

/** What hangs and stands in the hall wardrobe (#231, contents.js), in the wardrobe's frame: x along the rod, z from
 * the back out to the front. Peab's fixed wardrobe: it stays with F like the wardrobe itself. */
function hallWardrobeContents(group, w) {
  const dir = w.along ? (w.outward > 0 ? 's' : 'n') : (w.outward > 0 ? 'e' : 'w'), m = (w.a + w.b) / 2;
  const origin = w.along ? new THREE.Vector3(m, w.y0, w.back) : new THREE.Vector3(w.back, w.y0, m);
  const P = new Pack();
  hallWardrobe(P, { hl: (w.b - w.a) / 2 - w.t, depth: Math.abs(w.front - w.back), rodY: 1.712, rodZ: Math.abs(w.front - w.back) / 2, shelfY: 1.8, topY: w.y1 - w.y0 - w.t });
  group.add(...P.meshes(frameMatrix(dir, origin)));
}

/**
 * Re-orient a toilet so the tank stands against the nearest wall and the bowl points
 * into the room. Keeps the fixture centred where the plan has it along that wall.
 */
function toiletAgainstWall(tank, bowl, wallBoxes) {
  const g = {
    x0: Math.min(tank.x0, bowl.x0), x1: Math.max(tank.x1, bowl.x1),
    z0: Math.min(tank.z0, bowl.z0), z1: Math.max(tank.z1, bowl.z1),
  };
  const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
  const width = TOILET.width;
  const tankD = TOILET.tankDepth, bowlL = TOILET.depth - TOILET.tankDepth + 0.05;
  const near = (lo, hi, c) => lo - 0.05 <= c && hi + 0.05 >= c;
  let best = null;
  for (const w of wallBoxes) {
    const cands = [];
    if (near(w.z0, w.z1, cz) && w.x1 <= g.x0 + 0.05) cands.push(['west', g.x0 - w.x1, w.x1]);
    if (near(w.z0, w.z1, cz) && w.x0 >= g.x1 - 0.05) cands.push(['east', w.x0 - g.x1, w.x0]);
    if (near(w.x0, w.x1, cx) && w.z1 <= g.z0 + 0.05) cands.push(['north', g.z0 - w.z1, w.z1]);
    if (near(w.x0, w.x1, cx) && w.z0 >= g.z1 - 0.05) cands.push(['south', w.z0 - g.z1, w.z0]);
    for (const c of cands) if (!best || c[1] < best[1]) best = c;
  }
  const [side, , face] = best ?? ['west', 0, g.x0];
  const h = width / 2;
  switch (side) {
    case 'west': return { side, face, tank: { x0: face, x1: face + tankD, z0: cz - h, z1: cz + h }, bowl: { x0: face + tankD - 0.05, x1: face + tankD + bowlL, z0: cz - h, z1: cz + h } };
    case 'east': return { side, face, tank: { x0: face - tankD, x1: face, z0: cz - h, z1: cz + h }, bowl: { x0: face - tankD - bowlL, x1: face - tankD + 0.05, z0: cz - h, z1: cz + h } };
    case 'north': return { side, face, tank: { x0: cx - h, x1: cx + h, z0: face, z1: face + tankD }, bowl: { x0: cx - h, x1: cx + h, z0: face + tankD - 0.05, z1: face + tankD + bowlL } };
    default: return { side, face, tank: { x0: cx - h, x1: cx + h, z0: face - tankD, z1: face }, bowl: { x0: cx - h, x1: cx + h, z0: face - tankD - bowlL, z1: face - tankD + 0.05 } };
  }
}

/** White window frame in the plane z = fz between x0..x1, y0..y1, with glass. Below the (fixed) transom one top-hung
 * sash opens outwards with E (#103, #272): hinged along its head, the bottom swings out; `out` = ±1 the way out along
 * z. `split` (the living room): an off-centre mullion, the sash takes that share of the width on side `opens`
 * ('a' = x0, 'b' = x1), the other side is a fixed pane. Returns the Openables. */
function addWindowFrame(group, x0, x1, fz, y0, y1, transom, out = -1, opens = true, { split = 0, opens: side = 'a' } = {}) {
  const ft = 0.06, d = 0.05;
  const z0 = fz - d, z1 = fz + d;
  group.add(box(x0, x1, z0, z1, y0, y0 + ft, M.frame));
  group.add(box(x0, x1, z0, z1, y1 - ft, y1, M.frame));
  group.add(box(x0, x0 + ft, z0, z1, y0, y1, M.frame));
  group.add(box(x1 - ft, x1, z0, z1, y0, y1, M.frame));
  const ty = transom > 0 ? y1 - transom : y1;
  if (transom > 0) group.add(box(x0, x1, z0, z1, ty - ft / 2, ty + ft / 2, M.frame));
  if (!opens) { group.add(box(x0, x1, fz - 0.008, fz + 0.008, y0, y1, M.glass, { shadow: false })); return []; } // a fixed light
  if (transom > 0) group.add(box(x0, x1, fz - 0.008, fz + 0.008, ty, y1, M.glass, { shadow: false })); // fixed transom light
  const lo = y0 + ft, hi = (transom > 0 ? ty - ft / 2 : y1 - ft);
  // the sash's span; with `split` a mullion and a fixed pane beside it
  let a = x0 + ft, b = x1 - ft;
  if (split > 0) {
    const mx = side === 'a' ? x0 + split * (x1 - x0) : x1 - split * (x1 - x0);
    group.add(box(mx - ft / 2, mx + ft / 2, z0, z1, y0, ty, M.frame));
    const [fa, fb] = side === 'a' ? [mx + ft / 2, x1 - ft] : [x0 + ft, mx - ft / 2];
    group.add(box(fa, fb, fz - 0.008, fz + 0.008, lo, hi, M.glass, { shadow: false }));
    if (side === 'a') b = mx - ft / 2; else a = mx + ft / 2;
  }
  // the sash: a slim frame with its glass, in a pivot along the head on the outer face of the frame
  const zo = fz + out * 0.03, s = 0.045;
  const pivot = new THREE.Group();
  pivot.position.set((a + b) / 2, hi, zo);
  const rails = [box(a, b, zo - 0.02, zo + 0.02, lo, lo + s, M.frame), box(a, b, zo - 0.02, zo + 0.02, hi - s, hi, M.frame),
    box(a, a + s, zo - 0.02, zo + 0.02, lo, hi, M.frame), box(b - s, b, zo - 0.02, zo + 0.02, lo, hi, M.frame)];
  const sash = new THREE.Mesh(mergeGeometries(rails.map((m) => m.geometry.translate(...m.position.clone().sub(pivot.position).toArray()))), M.frame);
  sash.castShadow = sash.receiveShadow = true; // one mesh for the sash (#48)
  const pane = box(a + s, b - s, zo - 0.006, zo + 0.006, lo + s, hi - s, M.glass, { shadow: false });
  pane.position.sub(pivot.position);
  pivot.add(sash, pane);
  group.add(pivot);
  // top-hung: turning +y about +x sends the bottom towards −z
  const o = new Openable({ name: 'fönstret', object: pivot, mode: 'flap', axis: [1, 0, 0], sign: -out, max: WINDOW_TOP_HUNG_MAX, speed: 1.6 });
  o.normal = new THREE.Vector3(0, 0, -out); // the room side (tests stand there)
  const toggle = o.toggle.bind(o), at = new THREE.Vector3((a + b) / 2, (lo + hi) / 2, zo);
  o.toggle = () => { toggle(); o.wind?.stop(); o.wind = o.isOpen ? sfx.wind(at) : null; }; // the wind blows in while it is open
  return [o];
}

/** The letter box in the front door (#103): a brass plate with a flap on the outside (hinged at its top, lifts
 * out with E), a dark slot and a brushed plate inside. Built in the door's local frame (x = thickness, z along the
 * leaf from the hinge); the flap is an Openable in a pivot kept out of the door's merge (`door.keep`). */
function letterFlap(door) {
  door.object.updateMatrix();
  const outX = new THREE.Vector3(1, 0, 0).applyQuaternion(door.object.quaternion).z < 0 ? 1 : -1; // the street side
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a650, roughness: 0.3, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.7 });
  const zc = door.len / 2, y = 0.85, w = 0.3, h = 0.06;
  const part = (sx, sy, sz, px, py, pz, m, parent = door.object) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(px, py, pz);
    mesh.userData.door = door;
    parent.add(mesh);
    return mesh;
  };
  part(0.004, h + 0.03, w + 0.03, outX * 0.022, y, zc, brass);                      // outer plate
  part(0.006, h - 0.02, w - 0.03, outX * 0.022, y, zc, dark);                     // the slot behind the flap
  part(0.004, h + 0.02, w + 0.02, -outX * 0.022, y, zc, dark);                    // inner brush plate
  const pivot = new THREE.Group();
  pivot.position.set(outX * 0.026, y + h / 2, zc);
  part(0.004, h, w, 0, -h / 2, 0, brass, pivot);
  part(0.01, 0.008, 0.08, outX * 0.006, -h + 0.008, 0, brass, pivot);                // a little lip to lift it by
  door.object.add(pivot);
  door.keep = [pivot];
  // about the leaf's z axis: +angle swings the bottom edge towards +x
  return new Openable({ name: 'brevinkastet', object: pivot, mode: 'flap', axis: [0, 0, 1], sign: outX, max: 70, speed: 3 });
}

function buildLevel(floor, li, group) {
  const L = LEVELS[li];
  const y0 = L.floor;
  const yC = y0 + L.ceiling;
  const W = floor.size.x, D = floor.size.z;
  const segments = [];

  // Walls (polygons extruded floor → ceiling). Holes in the plan polygons are tiny
  // niches; walls are rendered solid.
  const walls = [...floor.walls, ...EXTRA_WALLS.filter((w) => w.level === li && OPTIONS[w.option])
    .map((r) => ({ outer: [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] }))];
  const wallBoxes = walls.map((w) => bboxOf(w.outer));
  const wallSegments = []; // walls only: line of sight for E (main.js)
  for (const w of walls) {
    group.add(prism(w.outer, y0, yC, M.wall));
    segments.push(...polySegments(w.outer));
    wallSegments.push(...polySegments(w.outer));
  }

  // Windows: sill/head infill, frame with optional transom, one top-hung sash, glass, inner sill board.
  // All windows are in the north/south façades (they run along x).
  const openings = { north: [], south: [] };
  const sills = []; // the inner window boards (flower pots, #136)
  const windows = []; // casements that open (#103), E targets with the appliances
  const blindSpecs = []; // pleated blinds (#273), built by buildWorld
  for (const pr of floor.windows) {
    const facade = pr.z0 < D / 2 ? 'north' : 'south';
    const cx = (pr.x0 + pr.x1) / 2;
    const spec = WINDOWS.filter((w) => w.level === li && w.facade === facade)
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
    const sill = y0 + spec.sill, head = y0 + spec.head;
    // `width` narrows the PDF opening around its centre; the rest is solid wall
    let r = pr;
    if (spec.width && spec.width < pr.x1 - pr.x0) {
      r = { ...pr, x0: cx - spec.width / 2, x1: cx + spec.width / 2 };
      group.add(box(pr.x0, r.x0, pr.z0, pr.z1, y0, yC, M.wall), box(r.x1, pr.x1, pr.z0, pr.z1, y0, yC, M.wall));
    }
    group.add(box(r.x0, r.x1, r.z0, r.z1, y0, sill, M.wall));
    group.add(box(r.x0, r.x1, r.z0, r.z1, head, yC, M.wall));
    // frame sits towards the outside of the wall
    const fz = facade === 'north' ? r.z0 + 0.1 : r.z1 - 0.1;
    const inner = facade === 'north' ? r.z1 : r.z0;
    windows.push(...addWindowFrame(group, r.x0, r.x1, fz, sill, head, spec.transom, facade === 'north' ? -1 : 1, true, spec));
    // a pleated blind in the reveal on the room side of the frame (#273): one per window, two where a mullion splits it
    {
      const out = facade === 'north' ? -1 : 1, bz = fz - out * BLINDS.gap, g = 0.004;
      const mx = spec.split > 0 ? (spec.opens === 'b' ? r.x1 - spec.split * (r.x1 - r.x0) : r.x0 + spec.split * (r.x1 - r.x0)) : null;
      for (const [x0, x1] of mx === null ? [[r.x0, r.x1]] : [[r.x0, mx], [mx, r.x1]]) {
        blindSpecs.push({ level: li, x0: x0 + g, x1: x1 - g, z: bz, out, y0: sill, y1: head, tone: spec.blind ?? (li ? 'dark' : 'light') });
      }
    }
    // inner window board (fönsterbänk)
    const iz0 = Math.min(fz, inner + (facade === 'north' ? 0.03 : -0.03));
    const iz1 = Math.max(fz, inner + (facade === 'north' ? 0.03 : -0.03));
    group.add(box(r.x0 - 0.02, r.x1 + 0.02, iz0, iz1, sill - 0.03, sill, M.porcelain));
    sills.push({ x0: r.x0, x1: r.x1, z0: Math.min(iz0, iz1), z1: Math.max(iz0, iz1), y: sill });
    openings[facade].push({ x0: r.x0, x1: r.x1, y0: sill, y1: head, win: spec }); // `win`: the neighbours copy its parts
    segments.push(...rectSegments(pr));
  }

  // Doors: lintel over the gap + an interactive leaf that fills the whole gap. All start
  // closed (several open leaves block the passage by the stair, e.g. Badrum and Klk).
  // Exterior doors are glazed-transom doors like the windows.
  const doors = [];
  const barriers = [...wallBoxes, ...floor.windows]; // closed off for room detection (rooms.js)
  const lids = []; // toilet lids (E opens/closes them, see toilet.js)
  const trims = []; // architrave geometry around the interior doors (merged below)
  for (const d of floor.doors) {
    const [hx, hz] = d.hinge, [tx, tz] = d.tip, [wx, wz] = d.wall;
    const axis = Math.abs(wx - hx) > Math.abs(wz - hz) ? 'x' : 'z';
    // The wall lies on the opposite side of the opening from where the leaf swings.
    const leafDir = axis === 'x' ? Math.sign(tz - hz) : Math.sign(tx - hx);
    const c = (axis === 'x' ? hz : hx) - leafDir * 0.03;
    const [a, b] = axis === 'x' ? [Math.min(hx, wx), Math.max(hx, wx)] : [Math.min(hz, wz), Math.max(hz, wz)];
    const gap = findGap(wallBoxes, axis, c, a + 0.02, b - 0.02);
    const exterior = tz < 0 || tz > D;
    const head = y0 + (exterior ? EXT_DOOR_HEAD : DOOR_HEIGHT);
    if (gap) group.add(gapBox(gap, head, yC, M.wall));
    if (gap) barriers.push(gapRect(gap));
    if (d.optional && !OPTIONS.allrumDoor) continue; // Peab tillval (dashed door), see OPTIONS

    // Stretch the leaf to the full gap (the plan's swing is the nominal leaf width).
    let leaf = d;
    if (gap) {
      const hAlong = axis === 'x' ? hx : hz, wAlong = axis === 'x' ? wx : wz;
      const dir = Math.sign(wAlong - hAlong);
      const g = DOOR_TRIM.gap;
      const h2 = dir > 0 ? gap.lo + g : gap.hi - g;
      const w2 = dir > 0 ? gap.hi - g : gap.lo + g;
      const len = Math.abs(w2 - h2);
      leaf = axis === 'x'
        ? { hinge: [h2, hz], wall: [w2, hz], tip: [h2, hz + leafDir * len] }
        : { hinge: [hx, h2], wall: [hx, w2], tip: [hx + leafDir * len, h2] };
    }
    if (gap && !exterior) trims.push(...architraves(gap, y0, head));
    const door = new SwingDoor(leaf, y0, M.door, false, { glazed: exterior && tz > D, glass: M.glass, frame: M.frame });
    door.name = exterior ? 'ytterdörren' : 'dörren';
    if (exterior && tz < 0) lids.push(letterFlap(door)); // the front door's letter box (#103)
    group.add(door.object);
    doors.push(door);
    if (exterior && gap) {
      // transom above the leaf, in the plane of the closed leaf
      addWindowFrame(group, gap.lo, gap.hi, leaf.hinge[1] + (tz < 0 ? 0.03 : -0.03), y0 + DOOR_HEIGHT, head, 0, -1, false);
      openings[tz < 0 ? 'north' : 'south'].push({ x0: gap.lo, x1: gap.hi, y0, y1: head });
    }
  }

  for (const s of floor.sliding) {
    const [ax, az] = s.a, [bx, bz] = s.b;
    const axis = Math.abs(bx - ax) > Math.abs(bz - az) ? 'x' : 'z';
    const c = axis === 'x' ? az : ax;
    const [a, b] = axis === 'x' ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
    const gap = findGap(wallBoxes, axis, c, a + 0.02, b - 0.02);
    if (!gap) continue;
    group.add(gapBox(gap, y0 + DOOR_HEIGHT, yC, M.wall));
    barriers.push(gapRect(gap));
    // Slide towards the side with enough wall to park the panel (the plan arrow alone sent
    // the Tvätt door through the 19 cm wall stub into the hall). Arrow decides only if both fit.
    const along = axis === 'x' ? ['x0', 'x1'] : ['z0', 'z1'];
    const perp = axis === 'x' ? ['z0', 'z1'] : ['x0', 'x1'];
    const onLine = wallBoxes.filter((w) => w[perp[0]] - 0.02 <= c && w[perp[1]] + 0.02 >= c);
    const wallLen = (end, dir) => {
      // contiguous wall from the gap end outwards
      let pos = end, len = 0;
      for (;;) {
        const w = onLine.find((w) => (dir > 0 ? Math.abs(w[along[0]] - pos) < 0.03 : Math.abs(w[along[1]] - pos) < 0.03));
        if (!w) return len;
        len += w[along[1]] - w[along[0]];
        pos = dir > 0 ? w[along[1]] : w[along[0]];
        if (len > 5) return len;
      }
    };
    const need = gap.hi - gap.lo;
    const room = { [-1]: wallLen(gap.lo, -1), [1]: wallLen(gap.hi, 1) };
    let dir = s.arrow ? Math.sign(axis === 'x' ? s.arrow.head[0] - s.arrow.tail[0] : s.arrow.head[1] - s.arrow.tail[1]) || 1 : 1;
    if (room[dir] < need * 0.9 && room[-dir] > room[dir]) dir = -dir;
    // don't run past the first wall piece (e.g. into the exterior wall)
    const first = onLine.find((w) => (dir > 0 ? Math.abs(w[along[0]] - gap.hi) < 0.03 : Math.abs(w[along[1]] - gap.lo) < 0.03));
    const travel = first ? first[along[1]] - first[along[0]] - 0.02 : undefined;
    const door = new SlidingDoor(gap, s.arrow, y0, M.door, false, dir, travel);
    trims.push(...architraves(gap, y0, y0 + DOOR_HEIGHT, door.face));
    door.name = 'skjutdörren';
    group.add(door.object);
    doors.push(door);
  }

  if (trims.length) {
    const mesh = new THREE.Mesh(mergeGeometries(trims), M.door);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Wardrobes (G): adjacent units become one hollow wardrobe with sliding doors.
  const wardrobeCabs = floor.cabinets.filter((c) => WARDROBE_LABELS.includes(c.label));
  const groups = [];
  for (const c of wardrobeCabs) {
    const g = groups.find((g) => (Math.abs(g.x0 - c.x0) < 0.02 && Math.abs(g.x1 - c.x1) < 0.02
      && (Math.abs(g.z1 - c.z0) < 0.02 || Math.abs(c.z1 - g.z0) < 0.02))
      || (Math.abs(g.z0 - c.z0) < 0.02 && Math.abs(g.z1 - c.z1) < 0.02
      && (Math.abs(g.x1 - c.x0) < 0.02 || Math.abs(c.x1 - g.x0) < 0.02)));
    if (g) Object.assign(g, { x0: Math.min(g.x0, c.x0), x1: Math.max(g.x1, c.x1), z0: Math.min(g.z0, c.z0), z1: Math.max(g.z1, c.z1) });
    else groups.push({ ...c });
  }
  for (const g of groups) {
    const wf = buildWardrobe(group, g, y0, CABINET_HEIGHT[g.label] ?? CABINET_HEIGHT.G, wallBoxes, doors);
    if (li === 0 && g.label === 'G') hallWardrobeContents(group, wf); // coats, hats and shoes in the hall (#231)
    segments.push(...rectSegments(g));
  }

  // Kitchen, laundry, bathroom fittings and tiles from our material choices (interior.js)
  const handled = new Set();
  const taps = []; // tap/shower outlets for running water (main.js)
  const appliances = [...windows]; // things that open with E but aren't doors (the fridge, the windows)
  for (const r of buildInterior(group, floor, li, y0, yC, wallBoxes, handled, taps, appliances)) segments.push(...rectSegments(r));

  // Other fixed cabinets
  for (const cab of floor.cabinets) {
    const label = cab.label;
    if (WARDROBE_LABELS.includes(label) || handled.has(cab)) continue;
    const h = label ? CABINET_HEIGHT[label] ?? BASE_CABINET
      : (cab.x1 - cab.x0 < 0.3 || cab.z1 - cab.z0 < 0.3) ? SHELF_HEIGHT : BASE_CABINET;
    if (label === 'EL' && li === 0) { // the hall's EL/C cabinet opens (#103)
      appliances.push(buildElCabinet(group, cab, 'e', y0, h, []));
      segments.push(...rectSegments(cab));
      continue;
    }
    const appliance = label === 'TT' || label === 'TM';
    const inset = 0.01;
    group.add(box(cab.x0 + inset, cab.x1 - inset, cab.z0 + inset, cab.z1 - inset, y0, y0 + h,
      appliance ? M.appliance : M.cabinet));
    if (h === BASE_CABINET || label === 'DM') {
      group.add(box(cab.x0, cab.x1, cab.z0, cab.z1, y0 + h, y0 + h + 0.03, M.counter));
    }
    segments.push(...rectSegments(cab));
  }

  // Sanitary fixtures, sinks, hob, shower floor
  for (const f of floor.fixtures) {
    if (handled.has(f)) continue;
    const onCounter = floor.cabinets.some((c) => insideRect(f, c));
    const top = y0 + BASE_CABINET + 0.03;
    switch (f.kind) {
      case 'sink':
        if (onCounter) {
          group.add(box(f.x0 + 0.03, f.x1 - 0.03, f.z0 + 0.03, f.z1 - 0.03, top - 0.002, top + 0.002, M.rail));
        } else {
          group.add(box(f.x0, f.x1, f.z0, f.z1, y0 + 0.72, y0 + 0.86, M.porcelain));
          segments.push(...rectSegments(f));
        }
        break;
      case 'hob':
        group.add(box(f.x0 - 0.05, f.x1 + 0.05, f.z0 - 0.05, f.z1 + 0.05, top, top + 0.006, M.dark));
        break;
      case 'toilet_tank': {
        // The redrawn plan shows tank + bowl schematically and sometimes rotated; Peab's
        // bofakta has the tank against a wall. Put it against the nearest wall.
        const bowlF = floor.fixtures.find((b) => b.kind === 'toilet_bowl'
          && Math.hypot((b.x0 + b.x1) / 2 - (f.x0 + f.x1) / 2, (b.z0 + b.z1) / 2 - (f.z0 + f.z1) / 2) < 0.6);
        if (!bowlF) break;
        const t = toiletAgainstWall(f, bowlF, wallBoxes);
        const [tx, tz] = [(t.tank.x0 + t.tank.x1) / 2, (t.tank.z0 + t.tank.z1) / 2];
        const ew = t.side === 'west' || t.side === 'east';
        const toilet = new Toilet(t.side, ew ? t.face : tx, ew ? tz : t.face, y0);
        group.add(toilet.object);
        lids.push(toilet, toilet.flush); // the lid, and the flush button (#155)
        segments.push(...rectSegments(t.tank), ...rectSegments(t.bowl));
        break;
      }
      case 'shower':
        group.add(box(f.x0, f.x1, f.z0, f.z1, y0, y0 + 0.004, M.tile, { shadow: false }));
        break;
    }
  }

  // Floor of this level (upper level has the stair opening)
  group.add(...plateAround(0, W, 0, D, li === 1 ? STAIR.hole : null, y0 + 0.002, M.floor));
  // Ceiling: underside of the slab / roof
  group.add(...plateAround(0, W, 0, D, li === 0 ? STAIR.hole : null, yC - 0.002, M.ceiling, true));

  // contact shadows along walls and cabinets (floor) and in the ceiling corners
  group.add(buildAO({ x: W, z: D }, y0, yC, [...wallBoxes, ...floor.windows, ...floor.cabinets], wallBoxes,
    { floorHole: li === 1 ? STAIR.hole : null, ceilHole: li === 0 ? STAIR.hole : null }));

  for (const s of SOFFITS.filter((s) => s.level === li)) {
    group.add(box(s.x0, s.x1, s.z0, s.z1, y0 + s.height, yC - 0.004, M.ceiling, { shadow: false }));
  }

  return { segments, wallSegments, doors, lids, taps, appliances, openings, sills, barriers, blindSpecs, ceiling: yC };
}

export function buildWorld(plan) {
  mirrorLamps.length = 0; // filled by buildInterior
  interiorLoose.length = 0;
  cupSurfaces.length = 0;
  const scene = new THREE.Group();
  const [lower, upper] = plan.floors;
  // plan corrections for fixed cabinets (CABINET_FIXES): the hall's EL cabinet is smaller than drawn
  plan.floors.forEach((f, li) => {
    for (const fix of CABINET_FIXES.filter((x) => x.level === li)) {
      const c = f.cabinets.find((k) => k.label === fix.label);
      if (c) Object.assign(c, { ...fix, level: undefined });
    }
  });
  const W = lower.size.x, D = lower.size.z;

  const l0 = buildLevel(lower, 0, scene);
  const l1 = buildLevel(upper, 1, scene);

  // Slab between the levels (façade band + stair opening), and roof
  const slabY0 = LEVELS[0].floor + LEVELS[0].ceiling, slabY1 = LEVELS[1].floor;
  const h = STAIR.hole;
  for (const [x0, x1, z0, z1] of [[0, W, 0, h.z0], [0, W, h.z1, D], [0, h.x0, h.z0, h.z1], [h.x1, W, h.z0, h.z1]]) {
    scene.add(box(x0, x1, z0, z1, slabY0, slabY1, M.wall));
  }
  const roofY = LEVELS[1].floor + LEVELS[1].ceiling;
  scene.add(box(0, W, 0, D, roofY, roofY + 0.35, M.wall));

  // Stairs + upstairs railing around the opening above flight A
  // treads: the very same Ek Chalk parquet material as the floors (our Peab choice, #54); white risers
  scene.add(buildStairs([M.floor, M.riser]));
  const y1 = LEVELS[1].floor, rail = STAIR.railHeight;
  const midZ = (STAIR.aZ[0] + STAIR.bZ[1]) / 2; // the line between flight A (below) and flight B (above)
  const railSegs = [
    [STAIR.hole.x0, midZ, STAIR.hole.x0, STAIR.hole.z1],
    [STAIR.hole.x0, midZ, STAIR.center[0], midZ],
  ];
  // The middle run stands over Entréplan's wall between the flights, which stops at the level's ceiling,
  // a slab thickness below y1 (no slab in the hole). Carry that wall on up to the upstairs floor as an
  // upstand, so the balusters stand on it instead of hanging in the air above the turn (#232).
  const midWall = lower.walls.map((w) => {
    const xs = w.outer.map((q) => q[0]), zs = w.outer.map((q) => q[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }).find((b) => b.z0 <= midZ && b.z1 >= midZ && b.x0 <= STAIR.hole.x0 && b.x1 >= STAIR.center[0] - 0.1);
  if (midWall) scene.add(box(Math.max(midWall.x0, STAIR.hole.x0), midWall.x1, midWall.z0, midWall.z1, slabY0 - 0.01, y1, M.wall));
  for (const [ax, az, bx, bz] of railSegs) {
    scene.add(box(Math.min(ax, bx) - 0.02, Math.max(ax, bx) + 0.02, Math.min(az, bz) - 0.02, Math.max(az, bz) + 0.02,
      y1 + rail - 0.05, y1 + rail, M.rail));
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 0.12));
    for (let i = 1; i < n; i++) { // the ends are newel posts
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      scene.add(box(x - 0.01, x + 0.01, z - 0.01, z + 0.01, y1, y1 + rail, M.rail));
    }
  }
  // newel posts at the corner and both ends (Peab's 3D plan), on the slab edge / the upstand's end
  const np = STAIR.newel / 2, endX = Math.min(STAIR.center[0], (midWall?.x1 ?? STAIR.center[0]) - np);
  for (const [x, z] of [[STAIR.hole.x0, midZ], [STAIR.hole.x0, STAIR.hole.z1 - np], [endX, midZ]]) {
    scene.add(box(x - np, x + np, z - np, z + np, y1 - 0.01, y1 + rail + 0.03, M.rail));
  }
  l1.segments.push(...railSegs);

  // Loose furniture (IKEA LANDSKRONA etc., see FURNITURE in config)
  const furniture = buildFurniture();
  scene.add(furniture.object);
  // the kitchen worktop as cup surfaces (fitted, so they stay with F; the first one is where a fresh cup stands)
  const kitchenSurfaces = cupSurfaces.map((r, i) => { const m = surfaceBox(r); if (i === 0) m.userData.counter = true; scene.add(m); return m; });
  const sillPlants = buildSillPlants([...l0.sills, ...l1.sills]); // flower pots on every window board (#136)
  scene.add(sillPlants);
  const sillSurfaces = [...l0.sills, ...l1.sills].map((r) => { const m = surfaceBox(r); scene.add(m); return m; }); // things go down on window boards too (#185)
  // pleated blinds in every window (#273): fittings (F keeps them); the rails and cords are baked below
  const blinds = new Blinds();
  for (const sp of [...l0.blindSpecs, ...l1.blindSpecs]) blinds.add(sp);
  scene.add(blinds.object, blinds.statics);
  const shelves = buildWallShelves(); // kitchen wall shelves (WALL_SHELVES)
  scene.add(shelves);
  shelves.updateMatrixWorld(true);
  const hallWall = buildHallWall(); // mirror + Solstickan key cabinet (HALL_WALL)
  scene.add(hallWall.object);

  // Site: ground, patio, hedge, fences
  const site = lower.site;
  // the street side; south of it and where the streets slope (#256): surroundings.js's terrain (#79)
  const T = SITE.terrain;
  scene.add(plate(-200, 200, -200, terrainNorth, -0.01, M.grass), plate(T.west.stair.x1, T.east.gable, terrainNorth, T.north, -0.01, M.grass),
    plate(T.west.x, T.west.stair.x1, T.west.stair.z1, T.north, -0.01, M.grass));
  if (site.patio) scene.add(plate(site.patio.x0, site.patio.x1, D, site.patio.z1, 0.0, M.patio)); // UVs in metres
  const outdoor = [];
  if (site.hedge) {
    scene.add(box(site.hedge.x0, site.hedge.x1, site.hedge.z0, site.hedge.z1, 0, 1.1, M.hedge));
    outdoor.push(...rectSegments(site.hedge));
  }
  for (const f of site.fences ?? []) {
    const [ax, az] = f.a, [bx, bz] = f.b;
    scene.add(box(ax - 0.025, bx + 0.025, Math.min(az, bz), Math.max(az, bz), 0, FENCE_HEIGHT, M.fence));
    outdoor.push([ax, az, bx, bz]);
  }
  // Hus L: brick façades, the neighbouring units, the stacked units above and the loftgång
  const north = [...l0.openings.north, ...l1.openings.north];
  const south = [...l0.openings.south, ...l1.openings.south];
  const exterior = buildExterior({ W, D, roofTop: roofY + 0.35, north, south, frame: M.frame, wall: M.wall, site, mats: M });
  scene.add(exterior);
  const surroundings = buildSurroundings({ grass: M.grass });
  const courtyard = buildCourtyard(); // walks, pergola, grill, sandboxes, boule, benches, beds (#80)
  scene.add(courtyard.object);
  outdoor.push(...courtyard.segments);
  const life = buildStreetLife(); // parked cars, bikes, the square in front of Hus C (#113)
  scene.add(life.object);
  outdoor.push(...life.segments);
  // snow in the winter months (seasons.js): the lawn, the hedges and the patio paving
  registerSnow(M.grass, SEASON.snow.ground);
  registerSnow(M.hedge, SEASON.snow.hedge);
  registerSnow(M.patio, SEASON.snow.paving);
  scene.add(surroundings);
  // keep the visitor near the house: the area in front of Hus L's north façade and the strip behind
  // it (patios + lawn), each closed off by the façade line beside our unit; the neighbours' screen
  // walls and hedges block like ours
  const o = OUTDOOR;
  outdoor.push(
    [o.x0, o.z0, o.x1, o.z0], [o.x0, o.z0, o.x0, 0], [o.x1, o.z0, o.x1, 0], [o.x0, 0, 0, 0], [W, 0, o.x1, 0],
    [o.x0, D, 0, D], [W, D, o.x1, D], [o.x0, D, o.x0, o.z1], [o.x1, D, o.x1, o.z1], [o.x0, o.z1, o.x1, o.z1],
    ...exterior.userData.segments,
    ...surroundings.userData.segments.filter((s) => Math.max(s[0], s[2]) > o.x0 - 1 && Math.min(s[0], s[2]) < o.x1 + 1 && Math.min(s[1], s[3]) < o.z1 + 1), // the courtyard's edge, Hus A / B (#255, #259)
  );
  l0.segments.push(...outdoor);

  const rooms = plan.floors.map((f, li) => [...f.rooms, ...EXTRA_ROOMS.filter((r) => r.level === li)].map((r) => {
    const re = ROOM_RENAMES.find((x) => x.level === li && x.from === r.name && OPTIONS[x.option]);
    return re ? { ...r, name: re.to } : r;
  }));
  const roomMaps = [l0, l1].map((l, li) => new RoomMap({ x: W, z: D },
    [...l.barriers, ...ROOM_DIVIDERS.filter((d) => d.level === li)], rooms[li]));

  blinds.init((lv, x, z) => roomMaps[lv]?.at(x, z) ?? null); // their rooms, and the state from the last visit
  const signs = addDoorSigns([...l0.doors, ...l1.doors], (lv, x, z) => roomMaps[lv]?.at(x, z) ?? null,
    (d) => (d.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0));

  // the wardrobes' contents (#230/#231): clothes on the rod, folded things on the hat shelf, shoes — by who lives there
  wardrobeSpecs.forEach((w, i) => {
    const lv = w.y0 > LEVELS[0].floor + 1.6 ? 1 : 0, ac = (w.a0 + w.a1) / 2, fz = w.front + w.outward * 0.4;
    const room = roomMaps[lv].at(w.along ? ac : fz, w.along ? fz : ac);
    const who = personFor(room);
    const m = who ? wardrobeFill(w, who, 11 + i * 7) : null;
    if (m) { m.userData.room = room; w.group.add(m); }
  });
  wardrobeSpecs.length = 0;

  // bake the static fittings into one mesh per material and level (draw calls, #48)
  const box3 = new THREE.Box3(), mid = new THREE.Vector3();
  const merged = mergeStatic(scene, [
    ...l0.doors, ...l1.doors, ...l0.lids, ...l1.lids, ...l0.appliances, ...l1.appliances,
  ].map((d) => d.object).concat([blinds.object, sillPlants, hallWall.object, furniture.object, exterior, surroundings, shelves, ...interiorLoose]), (o) => { // loose items stay separate (F hides them)
    box3.setFromObject(o).getCenter(mid);
    if (mid.x < 0 || mid.x > W || mid.z < 0 || mid.z > D) return 'out';
    return mid.y < LEVELS[1].floor - 0.05 ? 'l0' : 'l1';
  });
  scene.userData.merged = merged;
  for (const d of [...l0.doors, ...l1.doors]) mergeStatic(d.object, d.keep ?? [], () => '', { tagged: true }); // leaf + handles (not the letter flap)

  // furniture can be switched off (F): keep its collision separate from the fixed segments
  const fixed = [l0.segments, l1.segments];
  const levels = [l0, l1];
  // F (#75) shows the bare flat: everything we furnished and decorated is a loose item — furniture,
  // shelves and what is on them, the hall mirror + key cabinet + coat rack, door signs, the coffee
  // machine (main.js adds the cat board and hides the cat). Kept: Peab's kitchen, wet rooms, built-in
  // wardrobes, doors, stair, ceiling lamps, switches, the wall clock and the note on the freezer.
  const looseItems = [furniture.object, sillPlants, shelves, hallWall.object, ...signs, ...interiorLoose];
  const setFurniture = (on) => {
    for (const o of looseItems) o.visible = on;
    levels.forEach((l, i) => { l.segments = on ? [...fixed[i], ...furniture.segments[i]] : fixed[i]; });
  };
  setFurniture(true);

  return {
    object: scene,
    setFurniture,
    looseItems, // hidden by F (main.js may add more)
    cupSurfaces: [...furniture.surfaces, ...kitchenSurfaces, ...sillSurfaces], // table tops a cup can be put on (#90), the window boards (#185)
    cupCabinet,
    things: [...furniture.things, ...shelves.userData.plants], // bottles, glasses, pot plants main.js turns into Holdables (#152, #185)
    sillPlants, // the window boards' pots (main.js makes each one a Holdable, #185)
    furnitureTargets: furniture.interactives, // E targets among the furniture (the TV), hidden with F
    /** Collision of moving furniture parts (the secretary's open flap, #118) on `level`. */
    movingSegments(level) {
      if (!furniture.object.visible) return [];
      return furniture.interactives.filter((t) => t.segments && t.level === level).flatMap((t) => t.segments());
    },
    lamps: [...furniture.lights, ...mirrorLamps], // floor lamps + mirror LED strips (lights.js makes them switchable)
    windowLights: { object: surroundings.userData.windows.object, update(h, n) { surroundings.userData.windows.update(h, n); courtyard.update(n); exterior.userData.update(n); } }, // neighbours' lit windows, the pergola's bulbs, the loftgång lanterns (daycycle)
    get furnitureOn() { return furniture.object.visible; },
    size: { x: W, z: D },
    levels,
    doors: [...l0.doors, ...l1.doors],
    lids: [...l0.lids, ...l1.lids, ...l0.appliances, ...l1.appliances, hallWall.cabinet], // toggled with E, not doors
    hob: [...l0.appliances, ...l1.appliances].find((a) => a.kind === 'hob') ?? null, // the induction hob (#158)
    hood: [...l0.appliances, ...l1.appliances].find((a) => a.kind === 'hood') ?? null, // the cooker hood's fan (#194)
    panDrawer: [...l0.appliances, ...l1.appliances].find((a) => a.panHome) ?? null, // the drawer under the hob (#159)
    openings: { north, south, roof: roofY + 0.35 }, // the façade openings (plan x, absolute y) and the roof height: what the flat can be seen through from outside (#189)
    blinds, // the pleated blinds (#273, src/blinds.js)
    carKey: hallWall.key, // only a target while the key cabinet is open (main.js)
    taps: [...l0.taps, ...l1.taps],
    rooms,
    roomMaps,
    /** Room name at a plan point on a level (null outside the house). */
    roomAt: (level, x, z) => roomMaps[level]?.at(x, z) ?? null,
  };
}
