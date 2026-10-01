import * as THREE from 'three';
import {
  LEVELS, SLAB, SOFFITS, DOOR_HEIGHT, WINDOW, CABINET_HEIGHT, BASE_CABINET, SHELF_HEIGHT,
  STAIR, COLORS,
} from './config.js';
import { buildStairs } from './stairs.js';
import { SwingDoor, SlidingDoor } from './doors.js';

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
    color: COLORS.glass, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false,
  }),
  door: mat(COLORS.door, { roughness: 0.6 }),
  rail: mat(COLORS.rail, { roughness: 0.4, metalness: 0.3 }),
  stair: mat(COLORS.stair, { roughness: 0.6 }),
  dark: mat(0x1d2023, { roughness: 0.3 }),
  grass: mat(COLORS.grass, { roughness: 1 }),
  patio: mat(COLORS.patio, { roughness: 0.95 }),
  hedge: mat(COLORS.hedge, { roughness: 1 }),
  fence: mat(COLORS.fence, { roughness: 0.9 }),
  neighbour: mat(COLORS.neighbour, { roughness: 0.9 }),
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

  // Windows: sill + head infill, frame, glass. Windows block movement.
  const win = WINDOW[li];
  for (const r of floor.windows) {
    group.add(box(r.x0, r.x1, r.z0, r.z1, y0, y0 + win.sill, M.wall));
    group.add(box(r.x0, r.x1, r.z0, r.z1, y0 + win.head, yC, M.wall));
    const along = r.x1 - r.x0 > r.z1 - r.z0;
    const mid = along ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const t = 0.06;
    const fx = along ? [r.x0, r.x1, mid - t, mid + t] : [mid - t, mid + t, r.z0, r.z1];
    const ft = 0.05; // frame profile
    group.add(box(fx[0], fx[1], fx[2], fx[3], y0 + win.sill, y0 + win.sill + ft, M.frame));
    group.add(box(fx[0], fx[1], fx[2], fx[3], y0 + win.head - ft, y0 + win.head, M.frame));
    if (along) {
      for (const x of [r.x0, (r.x0 + r.x1) / 2 - ft / 2, r.x1 - ft]) {
        group.add(box(x, x + ft, fx[2], fx[3], y0 + win.sill, y0 + win.head, M.frame));
      }
    } else {
      for (const z of [r.z0, (r.z0 + r.z1) / 2 - ft / 2, r.z1 - ft]) {
        group.add(box(fx[0], fx[1], z, z + ft, y0 + win.sill, y0 + win.head, M.frame));
      }
    }
    const g = along ? [fx[0], fx[1], mid - 0.01, mid + 0.01] : [mid - 0.01, mid + 0.01, fx[2], fx[3]];
    group.add(box(g[0], g[1], g[2], g[3], y0 + win.sill, y0 + win.head, M.glass, { shadow: false }));
    segments.push(...rectSegments(r));
  }

  // Doors: lintel over the gap + an interactive leaf. All start closed (several open leaves
  // block the passage by the stair, e.g. Badrum and Klk on Entréplan).
  const doors = [];
  for (const d of floor.doors) {
    const [hx, hz] = d.hinge, [tx, tz] = d.tip, [wx, wz] = d.wall;
    const axis = Math.abs(wx - hx) > Math.abs(wz - hz) ? 'x' : 'z';
    // The wall lies on the opposite side of the opening from where the leaf swings.
    const leafDir = axis === 'x' ? Math.sign(tz - hz) : Math.sign(tx - hx);
    const c = (axis === 'x' ? hz : hx) - leafDir * 0.03;
    const [a, b] = axis === 'x' ? [Math.min(hx, wx), Math.max(hx, wx)] : [Math.min(hz, wz), Math.max(hz, wz)];
    const gap = findGap(wallBoxes, axis, c, a + 0.02, b - 0.02);
    if (gap) group.add(gapBox(gap, y0 + DOOR_HEIGHT, yC, M.wall));
    if (d.optional) continue; // Peab tillval — not built by default
    const exterior = tz < 0 || tz > D;
    const door = new SwingDoor(d, y0, M.door, false);
    door.name = exterior ? 'ytterdörren' : 'dörren';
    group.add(door.object);
    doors.push(door);
  }

  for (const s of floor.sliding) {
    const [ax, az] = s.a, [bx, bz] = s.b;
    const axis = Math.abs(bx - ax) > Math.abs(bz - az) ? 'x' : 'z';
    const c = axis === 'x' ? az : ax;
    const [a, b] = axis === 'x' ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
    const gap = findGap(wallBoxes, axis, c, a + 0.02, b - 0.02);
    if (!gap) continue;
    group.add(gapBox(gap, y0 + DOOR_HEIGHT, yC, M.wall));
    const door = new SlidingDoor(gap, s.arrow, y0, M.door, false);
    door.name = 'skjutdörren';
    group.add(door.object);
    doors.push(door);
  }

  // Fixed cabinets
  for (const cab of floor.cabinets) {
    const label = cab.label;
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
      case 'toilet_tank':
        group.add(box(f.x0, f.x1, f.z0, f.z1, y0, y0 + 0.85, M.porcelain));
        segments.push(...rectSegments(f));
        break;
      case 'toilet_bowl': {
        const rx = (f.x1 - f.x0) / 2, rz = (f.z1 - f.z0) / 2;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.8, 0.42, 24), M.porcelain);
        bowl.scale.set(rx, 1, rz);
        bowl.position.set((f.x0 + f.x1) / 2, y0 + 0.21, (f.z0 + f.z1) / 2);
        bowl.castShadow = bowl.receiveShadow = true;
        group.add(bowl);
        segments.push(...rectSegments(f));
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

  return { segments, doors, ceiling: yC };
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

  // Site: ground, patio, hedge, fences, neighbouring row houses (placeholders)
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
    scene.add(box(ax - 0.02, bx + 0.02, Math.min(az, bz), Math.max(az, bz), 0, 1.1, M.fence));
    outdoor.push([ax, az, bx, bz]);
  }
  for (const x of [-W, W]) scene.add(box(x + 0.001, x + W - 0.001, 0, D, 0, roofY + 0.35, M.neighbour));
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
