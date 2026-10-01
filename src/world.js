import * as THREE from 'three';
import {
  LEVELS, SOFFITS, DOOR_HEIGHT, EXT_DOOR_HEAD, WINDOWS, CABINET_HEIGHT, BASE_CABINET, SHELF_HEIGHT,
  STAIR, COLORS, FENCE_HEIGHT,
} from './config.js';
import { buildStairs } from './stairs.js';
import { SwingDoor, SlidingDoor, wardrobeDoors } from './doors.js';
import { buildExterior } from './exterior.js';
import { buildFurniture } from './furniture.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  const plankW = 64, plankL = 512;
  for (let col = 0; col < c.width / plankW; col++) {
    const offset = (col * 197) % plankL;
    for (let y = -offset; y < c.height; y += plankL) {
      const shade = 200 + ((col * 37 + y) % 30);
      g.fillStyle = `rgb(${shade},${shade * 0.83},${shade * 0.62})`;
      g.fillRect(col * plankW, y, plankW, plankL);
      g.strokeStyle = 'rgba(80,55,30,0.35)';
      g.strokeRect(col * plankW + 0.5, y + 0.5, plankW - 1, plankL - 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / 1.2, 1 / 4.8); // 256 px = 1.2 m (planks ~ 30 cm wide)
  tex.anisotropy = 4;
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
  stair: mat(COLORS.stair, { roughness: 0.6 }),
  dark: mat(0x1d2023, { roughness: 0.3 }),
  grass: mat(COLORS.grass, { roughness: 1 }),
  patio: mat(COLORS.patio, { roughness: 0.95 }),
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

const insideRect = (f, r) => f.x0 >= r.x0 - 0.01 && f.x1 <= r.x1 + 0.01 && f.z0 >= r.z0 - 0.01 && f.z1 <= r.z1 + 0.01;

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
  for (const d of wardrobeDoors({ along, front, back, outward, a, b, y0, height: h, material: M.door })) {
    group.add(d.object);
    doors.push(d);
  }
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
  const width = Math.min(tank.x1 - tank.x0, tank.z1 - tank.z0) > 0.25
    ? Math.max(tank.x1 - tank.x0, tank.z1 - tank.z0) : 0.39;
  const tankD = 0.18, bowlL = 0.55;
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
    case 'west': return { tank: { x0: face, x1: face + tankD, z0: cz - h, z1: cz + h }, bowl: { x0: face + tankD - 0.05, x1: face + tankD + bowlL, z0: cz - h, z1: cz + h } };
    case 'east': return { tank: { x0: face - tankD, x1: face, z0: cz - h, z1: cz + h }, bowl: { x0: face - tankD - bowlL, x1: face - tankD + 0.05, z0: cz - h, z1: cz + h } };
    case 'north': return { tank: { x0: cx - h, x1: cx + h, z0: face, z1: face + tankD }, bowl: { x0: cx - h, x1: cx + h, z0: face + tankD - 0.05, z1: face + tankD + bowlL } };
    default: return { tank: { x0: cx - h, x1: cx + h, z0: face - tankD, z1: face }, bowl: { x0: cx - h, x1: cx + h, z0: face - tankD - bowlL, z1: face - tankD + 0.05 } };
  }
}

/** White window frame in the plane z = fz between x0..x1, y0..y1, with glass. */
function addWindowFrame(group, x0, x1, fz, y0, y1, transom) {
  const ft = 0.06, d = 0.05;
  const z0 = fz - d, z1 = fz + d;
  group.add(box(x0, x1, z0, z1, y0, y0 + ft, M.frame));
  group.add(box(x0, x1, z0, z1, y1 - ft, y1, M.frame));
  group.add(box(x0, x0 + ft, z0, z1, y0, y1, M.frame));
  group.add(box(x1 - ft, x1, z0, z1, y0, y1, M.frame));
  const ty = transom > 0 ? y1 - transom : y1;
  if (transom > 0) group.add(box(x0, x1, z0, z1, ty - ft / 2, ty + ft / 2, M.frame));
  // a mullion for anything wider than a single casement
  if (x1 - x0 > 0.9 && y1 - y0 > 1.2) {
    const mx = (x0 + x1) / 2;
    group.add(box(mx - ft / 2, mx + ft / 2, z0, z1, y0, ty, M.frame));
  }
  group.add(box(x0, x1, fz - 0.008, fz + 0.008, y0, y1, M.glass, { shadow: false }));
}

function buildLevel(floor, li, group) {
  const L = LEVELS[li];
  const y0 = L.floor;
  const yC = y0 + L.ceiling;
  const W = floor.size.x, D = floor.size.z;
  const segments = [];

  // Walls (polygons extruded floor → ceiling). Holes in the plan polygons are tiny
  // niches; walls are rendered solid.
  const wallBoxes = floor.walls.map((w) => bboxOf(w.outer));
  for (const w of floor.walls) {
    group.add(prism(w.outer, y0, yC, M.wall));
    segments.push(...polySegments(w.outer));
  }

  // Windows: sill/head infill, frame with mullion + optional transom, glass, inner sill board.
  // All windows are in the north/south façades (they run along x).
  const openings = { north: [], south: [] };
  for (const r of floor.windows) {
    const facade = r.z0 < D / 2 ? 'north' : 'south';
    const cx = (r.x0 + r.x1) / 2;
    const spec = WINDOWS.filter((w) => w.level === li && w.facade === facade)
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
    const sill = y0 + spec.sill, head = y0 + spec.head;
    group.add(box(r.x0, r.x1, r.z0, r.z1, y0, sill, M.wall));
    group.add(box(r.x0, r.x1, r.z0, r.z1, head, yC, M.wall));
    // frame sits towards the outside of the wall
    const fz = facade === 'north' ? r.z0 + 0.1 : r.z1 - 0.1;
    const inner = facade === 'north' ? r.z1 : r.z0;
    addWindowFrame(group, r.x0, r.x1, fz, sill, head, spec.transom);
    // inner window board (fönsterbänk)
    const iz0 = Math.min(fz, inner + (facade === 'north' ? 0.03 : -0.03));
    const iz1 = Math.max(fz, inner + (facade === 'north' ? 0.03 : -0.03));
    group.add(box(r.x0 - 0.02, r.x1 + 0.02, iz0, iz1, sill - 0.03, sill, M.porcelain));
    openings[facade].push({ x0: r.x0, x1: r.x1, y0: sill, y1: head });
    segments.push(...rectSegments(r));
  }

  // Doors: lintel over the gap + an interactive leaf that fills the whole gap. All start
  // closed (several open leaves block the passage by the stair, e.g. Badrum and Klk).
  // Exterior doors are glazed-transom doors like the windows.
  const doors = [];
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
    if (d.optional) continue; // Peab tillval — not built by default

    // Stretch the leaf to the full gap (the plan's swing is the nominal leaf width).
    let leaf = d;
    if (gap) {
      const hAlong = axis === 'x' ? hx : hz, wAlong = axis === 'x' ? wx : wz;
      const dir = Math.sign(wAlong - hAlong);
      const h2 = dir > 0 ? gap.lo + 0.005 : gap.hi - 0.005;
      const w2 = dir > 0 ? gap.hi - 0.005 : gap.lo + 0.005;
      const len = Math.abs(w2 - h2);
      leaf = axis === 'x'
        ? { hinge: [h2, hz], wall: [w2, hz], tip: [h2, hz + leafDir * len] }
        : { hinge: [hx, h2], wall: [hx, w2], tip: [hx + leafDir * len, h2] };
    }
    const door = new SwingDoor(leaf, y0, M.door, false, { glazed: exterior && tz > D, glass: M.glass, frame: M.frame });
    door.name = exterior ? 'ytterdörren' : 'dörren';
    group.add(door.object);
    doors.push(door);
    if (exterior && gap) {
      // transom above the leaf, in the plane of the closed leaf
      addWindowFrame(group, gap.lo, gap.hi, leaf.hinge[1] + (tz < 0 ? 0.03 : -0.03), y0 + DOOR_HEIGHT, head, 0);
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
    door.name = 'skjutdörren';
    group.add(door.object);
    doors.push(door);
  }

  // Wardrobes (G): adjacent units become one hollow wardrobe with sliding doors.
  const wardrobeCabs = floor.cabinets.filter((c) => c.label === 'G');
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
    buildWardrobe(group, g, y0, CABINET_HEIGHT.G, wallBoxes, doors);
    segments.push(...rectSegments(g));
  }

  // Fixed cabinets
  for (const cab of floor.cabinets) {
    const label = cab.label;
    if (label === 'G') continue;
    const h = label ? CABINET_HEIGHT[label] ?? BASE_CABINET
      : (cab.x1 - cab.x0 < 0.3 || cab.z1 - cab.z0 < 0.3) ? SHELF_HEIGHT : BASE_CABINET;
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
        group.add(box(t.tank.x0, t.tank.x1, t.tank.z0, t.tank.z1, y0, y0 + 0.82, M.porcelain));
        const rx = (t.bowl.x1 - t.bowl.x0) / 2, rz = (t.bowl.z1 - t.bowl.z0) / 2;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.8, 0.42, 24), M.porcelain);
        bowl.scale.set(rx, 1, rz);
        bowl.position.set((t.bowl.x0 + t.bowl.x1) / 2, y0 + 0.21, (t.bowl.z0 + t.bowl.z1) / 2);
        bowl.castShadow = bowl.receiveShadow = true;
        group.add(bowl);
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

  for (const s of SOFFITS.filter((s) => s.level === li)) {
    group.add(box(s.x0, s.x1, s.z0, s.z1, y0 + s.height, yC - 0.004, M.ceiling, { shadow: false }));
  }

  return { segments, doors, openings, ceiling: yC };
}

export function buildWorld(plan) {
  const scene = new THREE.Group();
  const [lower, upper] = plan.floors;
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
  scene.add(buildStairs(M.stair));
  const y1 = LEVELS[1].floor, rail = STAIR.railHeight;
  const railSegs = [
    [STAIR.hole.x0, (STAIR.aZ[0] + STAIR.bZ[1]) / 2, STAIR.hole.x0, STAIR.hole.z1],
    [STAIR.hole.x0, (STAIR.aZ[0] + STAIR.bZ[1]) / 2, STAIR.center[0], (STAIR.aZ[0] + STAIR.bZ[1]) / 2],
  ];
  for (const [ax, az, bx, bz] of railSegs) {
    scene.add(box(Math.min(ax, bx) - 0.02, Math.max(ax, bx) + 0.02, Math.min(az, bz) - 0.02, Math.max(az, bz) + 0.02,
      y1 + rail - 0.05, y1 + rail, M.rail));
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 0.12));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      scene.add(box(x - 0.01, x + 0.01, z - 0.01, z + 0.01, y1, y1 + rail, M.rail));
    }
  }
  l1.segments.push(...railSegs);

  // Loose furniture (IKEA LANDSKRONA etc., see FURNITURE in config)
  const furniture = buildFurniture();
  scene.add(furniture.object);
  l0.segments.push(...furniture.segments[0]);
  l1.segments.push(...furniture.segments[1]);

  // Site: ground, patio, hedge, fences
  const site = lower.site;
  const ground = plate(-30, W + 30, -25, D + 30, -0.01, M.grass);
  scene.add(ground);
  if (site.patio) scene.add(box(site.patio.x0, site.patio.x1, D, site.patio.z1, -0.01, 0.0, M.patio, { shadow: false }));
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
  // Brick façades, the stacked units above, the loftgång and the neighbouring units
  const north = [...l0.openings.north, ...l1.openings.north];
  const south = [...l0.openings.south, ...l1.openings.south];
  scene.add(buildExterior({ W, D, roofTop: roofY + 0.35, north, south, frame: M.frame, wall: M.wall }));
  // keep the visitor near the house
  const bounds = { x0: 0.05, x1: W - 0.05, z0: -6, z1: site.patio ? site.patio.z1 : D + 4 };
  outdoor.push(
    [bounds.x0, bounds.z0, bounds.x1, bounds.z0], [bounds.x1, bounds.z0, bounds.x1, bounds.z1],
    [bounds.x1, bounds.z1, bounds.x0, bounds.z1], [bounds.x0, bounds.z1, bounds.x0, bounds.z0],
  );
  l0.segments.push(...outdoor);

  return {
    object: scene,
    size: { x: W, z: D },
    levels: [l0, l1],
    doors: [...l0.doors, ...l1.doors],
    rooms: plan.floors.map((f) => f.rooms),
  };
}
