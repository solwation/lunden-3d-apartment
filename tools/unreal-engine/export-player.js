// #2300: the player data of the Unreal export that the web computes from its own modules: the footstep surface sensor
// (src/stepsurface.js stepInfo, sampled), the outdoor sprint rule (src/player.js runSpeed), the rest spots and limits
// (src/rest.js, the furniture's `userData.rest`) and the places a death wakes you (src/respawn.js, src/fall.js).
// export-scene.js imports this module dynamically after every GLB is written, so nothing here can shift the seeded random
// sequence the zones are built with, and this module never calls Math.random (it has its own seeded generator).
import * as THREE from 'three';
import * as C from '../../src/config.js';
import { stepInfo } from '../../src/stepsurface.js';
import { Player } from '../../src/player.js';
import { safeRespawnPoint } from '../../src/respawn.js';
import { groundY } from '../../src/surroundings.js';
import { parkDeckAt } from '../../src/riverpark.js';
import { webToUnrealRounded, webYawToUnrealYaw, webPitchToUnrealPitch, roundCm } from './coordinates.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const deg = (rad) => (rad * 180) / Math.PI;
const P = (x, y, z) => ({ web: [r4(x), r4(y), r4(z)], unreal: webToUnrealRounded([x, y, z]) });

/** Surface code: surface | where << 2 | road << 4 | core << 5, the same in the ground raster and the boxes. `core` is
 *  src/core.js `contains` (the stairwells and lifts), which stepInfo's `stairs` needs together with the level list. */
export const SURFACES = ['grass', 'hard', 'gravel', 'wood'];
export const WHERES = ['ground', 'exposed', 'core', 'indoor'];
/** Plan cell (cm) of the boxes' bucket index: each bucket lists the boxes that overlap it, in box order. */
const BUCKET = 800;
/** Characters of the raster string: '0' + code (codes 0…63 stay inside printable ASCII). */
const CHAR0 = 48;
/** Sampling (m): the ground raster cell, the boxes' plan cell and height step. Our choice: finer than the narrowest walk
 *  or tiled room edge that matters for a footstep sound, coarse enough to keep the Blueprint data small. */
const GROUND_CELL = 0.5, BOX_CELL = 0.25, BOX_STEP = 0.1;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const encode = (info, inCore) => SURFACES.indexOf(info.surface) | (WHERES.indexOf(info.where) << 2) | (info.road ? 16 : 0) | (inCore ? 32 : 0);
const decode = (code) => ({ surface: SURFACES[code & 3], where: WHERES[(code >> 2) & 3], road: !!(code & 16), core: !!(code & 32) });

/** The volumes (web m) that can hold anything but open ground: every branch of stepInfo before the ground ones. */
function volumes(world, core, garage) {
  const out = [], box3 = (o) => new THREE.Box3().setFromObject(o);
  const add = (what, b, pad = 0.3) => out.push({ what, x0: b.x0 - pad, x1: b.x1 + pad, y0: b.y0 - pad, y1: b.y1 + pad, z0: b.z0 - pad, z1: b.z1 + pad });
  const fromBox = (b) => ({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
  const { x: W, z: D } = world.size;
  add('l1007', { x0: 0, x1: W, z0: 0, z1: D, y0: -0.6, y1: C.UNIT_TOP });
  // A stairwell's or the garage's object box can miss parts of what its contains / inside answers (the passage from
  // the portik, the förråd corridor): each box grows to every 0.5 m plan point within 8 m that the web's test takes in.
  const grow = (b, test, reach = 8) => {
    const g = { ...b };
    for (let x = b.x0 - reach; x <= b.x1 + reach; x += 0.5) for (let z = b.z0 - reach; z <= b.z1 + reach; z += 0.5) if (test(x, z)) {
      g.x0 = Math.min(g.x0, x - 0.5); g.x1 = Math.max(g.x1, x + 0.5); g.z0 = Math.min(g.z0, z - 0.5); g.z1 = Math.max(g.z1, z + 0.5);
    }
    return g;
  };
  if (core) {
    const heights = [-0.5, 0, 0.5, 1, 1.5];
    const inCore = (x, z) => core.covers(x, z) || heights.some((y) => core.contains(x, z, y));
    add('core-l', grow(fromBox(box3(core.own)), inCore));
    for (const p of core.parts) add(`core-${p.spec?.house ?? 'abc'}`, grow(fromBox(box3(p.object)), inCore));
  }
  if (garage) {
    const b = grow(fromBox(box3(garage.object)), (x, z) => garage.inside(x, z), 30);
    add('garage', { ...b, y0: C.GARAGE.floor - 0.5, y1: C.GARAGE.floor + C.FOOTSTEPS.garageHeadroom });
  }
  for (const u of world.units ?? []) {
    const r = u.levels[0].rect;
    add('unit', { x0: u.ox + r.x0, x1: u.ox + r.x1, z0: u.oz + r.z0, z1: u.oz + r.z1, y0: u.bottom - 1, y1: u.top });
  }
  const band = C.FOOTSTEPS.floorBand;
  // The roofs of the surrounding OSM buildings (src/buildingroofs.js, ids bld-…) are left out: those buildings are not in
  // the Unreal world (#2280 SITE_SKIP leaves the backdrop houses out), so nobody can stand on them there.
  for (const s of world.roofs?.surfaces ?? []) {
    if (String(s.id ?? '').startsWith('bld-')) continue;
    const b = s.r != null ? { x0: s.cx - s.r, x1: s.cx + s.r, z0: s.cz - s.r, z1: s.cz + s.r } : { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
    if (![b.x0, b.x1, b.z0, b.z1].every(Number.isFinite)) continue;
    const ys = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const y = typeof s.y === 'function' ? s.y(b.x0 + (b.x1 - b.x0) * i / 4, b.z0 + (b.z1 - b.z0) * j / 4) : s.y;
      if (Number.isFinite(y)) ys.push(y);
    }
    if (ys.length) add('roof', { ...b, y0: Math.min(...ys) - band, y1: Math.max(...ys) + band }, 0.05);
  }
  for (const o of world.openings?.opaque ?? []) if (o.y0 === o.y1) add('opaque', { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, y0: o.y0 - band, y1: o.y0 + band }, 0.05);
  const B = C.SITE.riverPark?.woodBridge;
  if (B) {
    const [[ax, az], [bx, bz]] = B.ends, w = B.width / 2 + 0.3;
    add('deck', { x0: Math.min(ax, bx) - w, x1: Math.max(ax, bx) + w, z0: Math.min(az, bz) - w, z1: Math.max(az, bz) + w, y0: B.deckY - band, y1: B.deckY + band }, 0.05);
  }
  return out;
}

/** Equal-code cells of one sampled volume merged into boxes: runs along x, rectangles over z, boxes over y. */
function mergeCells(codes, nx, nz, ny) {
  const boxes = [];
  let open = new Map(); // "x0,x1,z0,z1,code" -> box, extended layer by layer in y
  for (let k = 0; k < ny; k++) {
    const rects = [];
    let rows = new Map(); // "x0,x1,code" -> rect, extended row by row in z
    for (let j = 0; j < nz; j++) {
      const next = new Map();
      for (let i = 0; i < nx;) {
        const c = codes[(k * nz + j) * nx + i];
        if (c < 0) { i++; continue; }
        let e = i + 1;
        while (e < nx && codes[(k * nz + j) * nx + e] === c) e++;
        const key = `${i},${e},${c}`, r = rows.get(key);
        if (r) { r.j1 = j + 1; next.set(key, r); rows.delete(key); } else next.set(key, { i0: i, i1: e, j0: j, j1: j + 1, c });
        i = e;
      }
      for (const r of rows.values()) rects.push(r);
      rows = next;
    }
    for (const r of rows.values()) rects.push(r);
    const nextOpen = new Map();
    for (const r of rects) {
      const key = `${r.i0},${r.i1},${r.j0},${r.j1},${r.c}`, b = open.get(key);
      if (b) { b.k1 = k + 1; nextOpen.set(key, b); open.delete(key); } else nextOpen.set(key, { ...r, k0: k, k1: k + 1 });
    }
    for (const b of open.values()) boxes.push(b);
    open = nextOpen;
  }
  for (const b of open.values()) boxes.push(b);
  return boxes;
}

/** The footstep surface data: a ground raster (open ground: grass, paving, gravel, road) and boxes for everything that
 *  depends on the height (stairwells, garage, flats, L1007's rooms, roofs, the patio, the river park's deck). */
function surfaceData(world, core, garage, player) {
  const full = { core, garage, unitAt: world.unitAt, size: world.size, roofs: world.roofs, openings: world.openings };
  const open = { size: { x: 0, z: 0 } }; // no building, roof or deck: only stepInfo's ground branches answer
  const groundCode = (x, z) => encode(stepInfo(open, { x, y: -1e4, z }), false);
  const fullCode = (x, y, z) => encode(stepInfo(full, { x, y, z }), !!core?.contains(x, z, y));
  // stepInfo's conditions for every branch before the open-ground ones (src/stepsurface.js, in its order; the playroom is
  // not exported). Where none holds stepInfo falls through to the ground branches, whose answer is the raster's: the
  // sampling below skips those cells instead of walking every road again.
  const F = C.FOOTSTEPS, band = F.floorBand, opaque = (world.openings?.opaque ?? []).filter((o) => o.y0 === o.y1);
  const special = (x, y, z) => !!core?.contains(x, z, y) || (!!garage?.inside(x, z) && y < C.GARAGE.floor + F.garageHeadroom)
    || !!world.unitAt?.(x, z, y)
    || (x > 0 && z > 0 && x < world.size.x && z < world.size.z && y < C.UNIT_TOP - F.indoorTopMargin)
    || (() => { const d = parkDeckAt(x, z); return d !== null && Math.abs(y - d) < band; })()
    || (() => { const r = world.roofs?.under(x, z, y, band); return !!r && Math.abs(y - r.y) < band; })()
    || opaque.some((o) => Math.abs(y - o.y0) < band && x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1);
  const t0 = performance.now();
  // ground raster over the walkable bounds (src/config.js WALK), rows along web z (Unreal Y), columns along x (Unreal X)
  const Wk = C.WALK, nx = Math.round((Wk.x1 - Wk.x0) / GROUND_CELL), nz = Math.round((Wk.z1 - Wk.z0) / GROUND_CELL);
  const chars = new Uint8Array(nx * nz), counts = {};
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c = groundCode(Wk.x0 + (i + 0.5) * GROUND_CELL, Wk.z0 + (j + 0.5) * GROUND_CELL);
    chars[j * nx + i] = CHAR0 + c;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const gridAt = (x, z) => {
    const i = Math.floor((x - Wk.x0) / GROUND_CELL), j = Math.floor((z - Wk.z0) / GROUND_CELL);
    return i < 0 || j < 0 || i >= nx || j >= nz ? 0 : chars[j * nx + i] - CHAR0;
  };
  const t1 = performance.now();
  // boxes: each volume sampled at cell centres; a cell is kept when its answer is not the open ground's
  const vols = volumes(world, core, garage), boxes = [];
  for (const v of vols) {
    const vx = Math.max(1, Math.ceil((v.x1 - v.x0) / BOX_CELL)), vz = Math.max(1, Math.ceil((v.z1 - v.z0) / BOX_CELL)), vy = Math.max(1, Math.ceil((v.y1 - v.y0) / BOX_STEP));
    const codes = new Int8Array(vx * vz * vy);
    for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
      const x = v.x0 + (i + 0.5) * BOX_CELL, z = v.z0 + (j + 0.5) * BOX_CELL, g = gridAt(x, z);
      for (let k = 0; k < vy; k++) {
        const y = v.y0 + (k + 0.5) * BOX_STEP, c = special(x, y, z) ? fullCode(x, y, z) : g;
        codes[(k * vz + j) * vx + i] = c === g ? -1 : c;
      }
    }
    for (const b of mergeCells(codes, vx, vz, vy)) boxes.push({ x0: v.x0 + b.i0 * BOX_CELL, x1: v.x0 + b.i1 * BOX_CELL, z0: v.z0 + b.j0 * BOX_CELL,
      z1: v.z0 + b.j1 * BOX_CELL, y0: v.y0 + b.k0 * BOX_STEP, y1: v.y0 + b.k1 * BOX_STEP, c: b.c, what: v.what });
  }
  const t2 = performance.now();
  // the bucket index (Unreal cm, X and Y = web x and z): bucket (i, j) lists, in box order, every box overlapping it
  const ub = boxes.map((b) => ({ lo: webToUnrealRounded([b.x0, b.y0, b.z0]), hi: webToUnrealRounded([b.x1, b.y1, b.z1]), c: b.c }));
  const bx0 = Math.floor(Math.min(...ub.map((b) => b.lo[0])) / BUCKET) * BUCKET, by0 = Math.floor(Math.min(...ub.map((b) => b.lo[1])) / BUCKET) * BUCKET;
  const bnx = Math.ceil((Math.max(...ub.map((b) => b.hi[0])) - bx0) / BUCKET), bny = Math.ceil((Math.max(...ub.map((b) => b.hi[1])) - by0) / BUCKET);
  const lists = Array.from({ length: bnx * bny }, () => []);
  ub.forEach((b, n) => {
    for (let j = Math.floor((b.lo[1] - by0) / BUCKET); j <= Math.min(bny - 1, Math.floor((b.hi[1] - by0) / BUCKET)); j++)
      for (let i = Math.floor((b.lo[0] - bx0) / BUCKET); i <= Math.min(bnx - 1, Math.floor((b.hi[0] - bx0) / BUCKET)); i++) lists[j * bnx + i].push(n);
  });
  const starts = [], sizes = [], items = [];
  for (const l of lists) { starts.push(items.length); sizes.push(l.length); items.push(...l); }
  // the lookup Unreal does (BPC_LundenStepSurface), in Unreal cm: the first box of the point's bucket that holds it
  // (IsPointInBox: bounds included), else the raster
  const lookupU = (X, Y, Z) => {
    const i = Math.floor((X - bx0) / BUCKET), j = Math.floor((Y - by0) / BUCKET);
    if (i >= 0 && j >= 0 && i < bnx && j < bny) for (let k = starts[j * bnx + i], e = k + sizes[j * bnx + i]; k < e; k++) {
      const b = ub[items[k]];
      if (X >= b.lo[0] && X <= b.hi[0] && Y >= b.lo[1] && Y <= b.hi[1] && Z >= b.lo[2] && Z <= b.hi[2]) return b.c;
    }
    return gridAt(X / 100, Y / 100);
  };
  const lookup = (x, y, z) => lookupU(x * 100, z * 100, y * 100);
  // stepInfo's stair test: a stairwell foot not within FOOTSTEPS.floorTol of a landing level
  const levels = [...new Set([C.GARAGE.floor, C.storeyFloor(1), C.storeyFloor(2), C.storeyFloor(3), ...(core?.parts ?? []).flatMap((p) => p.Y ?? [])].map(r4))].sort((a, b) => a - b);
  const stairsOf = (code, y) => !!(code & 32) && !levels.some((f) => Math.abs(y - f) < C.FOOTSTEPS.floorTol);
  const outdoorOf = (code) => ((code >> 2) & 3) < 2; // ground or exposed: src/player.js runSpeed's outdoors && !below && !inCore
  const webOutdoor = (x, y, z) => { player.pos.set(x, y, z); return player.runSpeed === C.PLAYER.runOutdoor; };
  // agreement with the web on random points: inside the volumes (any height) and on the open ground (at the ground)
  const zero = () => ({ n: 0, surface: 0, where: 0, road: 0, stairs: 0, outdoor: 0 });
  // volume: anywhere in the volumes (thin bands such as a roof's +-floorBand make their edges count a lot);
  // standing: where the web's player would stand there (src/player.js groundAt from a random height), what a foot meets
  const rand = mulberry32(2300), check = { standing: zero(), volume: zero(), ground: zero() };
  const samples = [];
  const misses = {};
  const compare = (bucket, x, y, z, what = 'ground') => {
    const web = stepInfo(full, { x, y, z }), got = decode(lookup(x, y, z)), stairs = stairsOf(lookup(x, y, z), y), s = check[bucket];
    if (web.surface !== got.surface || web.where !== got.where) {
      const key = `${what}: web ${web.surface}/${web.where} got ${got.surface}/${got.where}`, m = misses[key] ??= { n: 0, at: [] };
      m.n++; if (m.at.length < 3) m.at.push([r4(x), r4(y), r4(z), special(x, y, z)]);
    }
    s.n++; s.surface += +(web.surface === got.surface); s.where += +(web.where === got.where); s.road += +(web.road === got.road);
    s.stairs += +(web.stairs === stairs); s.outdoor += +(webOutdoor(x, y, z) === outdoorOf(lookup(x, y, z)));
    return web;
  };
  const volArea = vols.map((v) => (v.x1 - v.x0) * (v.z1 - v.z0) * (v.y1 - v.y0)), volSum = volArea.reduce((a, b) => a + b, 0);
  for (let n = 0; n < 20000; n++) {
    let pick = rand() * volSum, v = vols[0];
    for (let i = 0; i < vols.length; i++) { pick -= volArea[i]; if (pick <= 0) { v = vols[i]; break; } }
    const x = v.x0 + rand() * (v.x1 - v.x0), y = v.y0 + rand() * (v.y1 - v.y0), z = v.z0 + rand() * (v.z1 - v.z0);
    compare('volume', x, y, z, v.what);
    const fy = player.groundAt(x, z, y);
    if (!Number.isFinite(fy) || fy < v.y0 - 1 || fy > v.y1 + 1) continue;
    const web = compare('standing', x, fy, z, 'standing ' + v.what);
    if (samples.length < 150) samples.push({ ...P(x, fy, z), surface: web.surface, where: web.where, road: web.road, stairs: web.stairs, outdoor: webOutdoor(x, fy, z) });
  }
  for (let n = 0; n < 20000; n++) {
    const x = Wk.x0 + rand() * (Wk.x1 - Wk.x0), z = Wk.z0 + rand() * (Wk.z1 - Wk.z0), y = groundY(x, z);
    if (!Number.isFinite(y)) continue;
    const web = compare('ground', x, y, z);
    if (n < 150) samples.push({ ...P(x, y, z), surface: web.surface, where: web.where, road: web.road, stairs: web.stairs, outdoor: webOutdoor(x, y, z) });
  }
  for (const s of Object.values(check)) for (const k of ['surface', 'where', 'road', 'stairs', 'outdoor']) s[k] = r4(s[k] / Math.max(1, s.n));
  const t3 = performance.now();
  const string = new TextDecoder('latin1').decode(chars); // codes 48…111: the same characters in every 8-bit decoding
  return {
    data: {
      source: 'src/stepsurface.js stepInfo, sampled by tools/unreal-engine/export-player.js; outdoor = src/player.js runSpeed',
      surfaces: SURFACES, wheres: WHERES,
      code: 'surface | where << 2 | road << 4 | core << 5 (core = src/core.js contains, for the stair test)',
      grid: { x0: roundCm(Wk.x0 * 100), y0: roundCm(Wk.z0 * 100), cell: GROUND_CELL * 100, nx, ny: nz, char0: CHAR0,
        about: 'Unreal X columns from x0, Y rows from y0 (cm); index = row * nx + column; code = character - char0; outside: 0 (grass)', codes: string },
      boxes: ub.map((b) => [...b.lo, ...b.hi, b.c]),
      boxesAbout: '[minX, minY, minZ, maxX, maxY, maxZ, code] in Unreal cm; the first box (in this order) of the point\'s bucket holding it wins, else the grid',
      buckets: { x0: bx0, y0: by0, cell: BUCKET, nx: bnx, ny: bny, starts, counts: sizes, items,
        about: 'bucket (i, j) = (floor((X - x0) / cell), floor((Y - y0) / cell)) lists items[starts[j * nx + i] …] (box indices, ascending)' },
      levels: levels.map((y) => roundCm(y * 100)), floorTol: roundCm(C.FOOTSTEPS.floorTol * 100),
      check, samples,
    },
    report: { gridCells: nx * nz, gridCounts: counts, boxes: boxes.length, buckets: { nx: bnx, ny: bny, items: items.length, most: Math.max(...sizes) }, byVolume: Object.fromEntries(vols.map((v) => [v.what, boxes.filter((b) => b.what === v.what).length])),
      ms: { grid: Math.round(t1 - t0), boxes: Math.round(t2 - t1), check: Math.round(t3 - t2) }, check, misses },
    lookup, stairsOf, outdoorOf, webOutdoor, full,
  };
}

/** Named control points for the Unreal test: what the web says under the feet at each (acceptance #2300: parquet,
 *  tile, the patio's slabs, a stair, grass and gravel). Found from the web's own data, not typed in. */
function controlPoints(world, core, garage, S) {
  const pts = [], add = (name, x, y, z) => {
    const web = stepInfo(S.full, { x, y, z });
    pts.push({ name, ...P(x, y, z), surface: web.surface, where: web.where, road: web.road, stairs: web.stairs, outdoor: S.webOutdoor(x, y, z) });
  };
  const L0 = C.LEVELS[0].floor, L1 = C.LEVELS[1].floor;
  // parquet: the L1007 point (0.25 m grid) in the named room that lies farthest from the room's edge cells
  const inRoom = (re, level, y) => {
    let best = null;
    for (let x = 0.25; x < world.size.x; x += 0.25) for (let z = 0.25; z < world.size.z; z += 0.25) {
      const name = world.roomAt?.(level, x, z)?.name ?? world.roomAt?.(level, x, z);
      if (typeof name !== 'string' || !re.test(name) || stepInfo(S.full, { x, y, z }).surface !== 'wood') continue;
      let d = 0; while (d < 3 && [[d, 0], [-d, 0], [0, d], [0, -d]].every(([a, b]) => { const n = world.roomAt?.(level, x + a, z + b); return (n?.name ?? n) === name; })) d += 0.25;
      if (!best || d > best.d) best = { x, z, d, name };
    }
    return best;
  };
  const living = inRoom(/vardagsrum|kök/i, 0, L0);
  if (living) add(`parquet (L1007 ${living.name})`, living.x, L0, living.z);
  const bath = C.TILED_ROOMS.find((t) => t.level === 0 && /badrum/i.test(t.name));
  add('tile (L1007 Badrum)', (bath.x0 + bath.x1) / 2, L0, (bath.z0 + bath.z1) / 2);
  const bed = inRoom(/sovrum/i, 1, L1);
  if (bed) add(`parquet upstairs (L1007 ${bed.name})`, bed.x, L1, bed.z);
  const patio = world.openings?.opaque?.find((o) => o.y0 === o.y1 && o.y0 === 0 && o.z0 === world.size.z);
  if (patio) add('patio slabs (L1007)', (patio.x0 + patio.x1) / 2, 0, (patio.z0 + patio.z1) / 2);
  // a tread of Hus L's stairwell: the first plan point (scanning its box) whose floor heights include a tread
  if (core) {
    const b = new THREE.Box3().setFromObject(core.own);
    scan: for (let x = Math.ceil(b.min.x * 4) / 4; x < b.max.x; x += 0.25) for (let z = Math.ceil(b.min.z * 4) / 4; z < b.max.z; z += 0.25) {
      for (const y of core.heights(x, z)) if (stepInfo(S.full, { x, y, z }).stairs) { add('stairwell tread (Hus L)', x, y, z); break scan; }
    }
  }
  const g = C.COURTYARD.gravel[0], gx = (g.x0 + g.x1) / 2, gz = (g.z0 + g.z1) / 2;
  add('gravel (courtyard)', gx, groundY(gx, gz), gz);
  // grass: the first lawn point south of L1007's patio, along its centre line
  for (let z = (patio?.z1 ?? world.size.z) + 0.5; z < (patio?.z1 ?? world.size.z) + 30; z += 0.25) {
    const x = world.size.x / 2, y = groundY(x, z);
    if (stepInfo(S.full, { x, y, z }).surface === 'grass') { add('grass (south of the patio)', x, y, z); break; }
  }
  add('road (START)', C.START.x, groundY(C.START.x, C.START.z), C.START.z);
  if (garage) { const b = new THREE.Box3().setFromObject(garage.object), c = b.getCenter(new THREE.Vector3()); add('garage floor', c.x, C.GARAGE.floor, c.z); }
  return pts;
}

/** Rest spots (src/rest.js restTarget): every furniture target with `kind: 'rest'` whose piece is an exported node. */
function restData(world, idOf) {
  const spots = [], skipped = [];
  for (const t of world.furnitureTargets ?? []) {
    if (t.kind !== 'rest') continue;
    const id = idOf(t.pickable);
    if (!id) { skipped.push(t.name); continue; }
    t.spots.forEach((sp, index) => {
      if (sp.follow || sp.gymPose || sp.closed) { skipped.push(`${t.name}#${index}`); return; } // moving seats, the gym, the car
      const lim = C.REST[sp.kind];
      const look = sp.lookPos, eye = sp.pos, dx = look ? look.x - eye.x : 0, dz = look ? look.z - eye.z : 0;
      const startYaw = look ? Math.atan2(-dx, -dz) : sp.yaw; // Rest.begin
      const startPitch = sp.kind === 'lie' ? lim.startPitch : look ? Math.atan2(look.y - eye.y, Math.hypot(dx, dz)) : 0;
      const aim = sp.aimPos ?? sp.pos;
      spots.push({ item: id, name: t.name, verb: t.verbText ?? null, index, kind: sp.kind, eye: P(eye.x, eye.y, eye.z), aim: P(aim.x, aim.y, aim.z),
        yaw: roundCm(webYawToUnrealYaw(deg(sp.yaw))), startYaw: roundCm(webYawToUnrealYaw(deg(startYaw))), startPitch: roundCm(webPitchToUnrealPitch(deg(startPitch))) });
    });
  }
  const R = C.REST;
  return {
    source: 'src/rest.js (Rest, restTarget, chooseSpot), src/config.js REST, HOLD.reach; src/main.js sitOrLie / standUp',
    move: R.move, sitEye: roundCm(R.sitEye * 100), lieEye: roundCm(R.lieEye * 100), reach: roundCm(C.HOLD.reach * 100),
    limits: Object.fromEntries(['sit', 'lie'].map((k) => [k, { yaw: roundCm(deg(R[k].yaw)), pitch: R[k].pitch.map((p) => roundCm(deg(p))) }])),
    spots, skipped,
  };
}

/** Where a death wakes you (src/respawn.js chooseRespawn): the RESPAWN regions' grid candidates the web itself accepts
 *  (safeRespawnPoint against the web world), facing as respawnOutdoors spawns (yaw π, level view). */
function respawnData(player) {
  const R = C.RESPAWN, points = [];
  for (const region of R.regions) for (let ix = 0; ix < R.grid; ix++) for (let iz = 0; iz < R.grid; iz++) {
    const x = THREE.MathUtils.lerp(region.x0, region.x1, (ix + 0.5) / R.grid), z = THREE.MathUtils.lerp(region.z0, region.z1, (iz + 0.5) / R.grid);
    const p = safeRespawnPoint(player, x, z);
    if (p) points.push({ region: region.id, ...P(p.x, p.y, p.z) });
  }
  const F = C.FALL;
  return {
    source: 'src/respawn.js chooseRespawn / safeRespawnPoint (grid candidates), respawnOutdoors; src/fall.js paint / wake',
    yaw: roundCm(webYawToUnrealYaw(180)), pitch: 0, regions: R.regions.map((r) => ({ id: r.id, ...r })), points,
    blackout: { red: F.red, black: F.black, hold: F.hold, back: F.back, text: F.text, jolt: roundCm(F.jolt * 100),
      redColour: [150 / 255, 0, 0], redAlpha: 0.55,
      about: 'src/fall.js paint: 0..red alpha 0..redAlpha red; ..+black red fades to black, alpha to 1; ..+hold black; wake; ..+back alpha 1..0 black' },
  };
}

export function playerData({ world, core, garage, idOf }) {
  const pw = { ...world, core, garage };
  const player = new Player(pw, new THREE.PerspectiveCamera());
  const S = surfaceData(world, core, garage, player);
  const surface = { ...S.data, control: controlPoints(world, core, garage, S) };
  return { surface, rest: restData(world, idOf), respawn: respawnData(player), report: S.report };
}
