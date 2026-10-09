import * as THREE from 'three';
import { STANDARD as S, KITCHEN as K, LAUNDRY_SINK } from './config.js';
import { Batch, tileTexture, std, frame, slabWithHole, sinkBowl, mixer, glassPanel, showerSet, tileWalls, skirting, doorwayTiles } from './interior.js';

// Peab's standard finish for a visitable flat (#574, STANDARD in config): the fixed kitchen, laundry and wet rooms of the
// floor plan — built where the plan's cabinet and fixture rectangles are, all static (nothing opens, nothing inside),
// merged into one mesh per material. Smooth white fronts and white appliances (the brochure); the rest generic and neutral.
// L1007's own interior (interior.js) is our choices and stays untouched: this module only borrows its geometry helpers.

const M = {
  front: std(S.front, { roughness: 0.42 }),
  carcass: std(0xf4f4f1, { roughness: 0.6 }),
  counter: std(S.counter, { roughness: 0.5 }),
  handle: std(S.handle, { roughness: 0.35, metalness: 0.6 }),
  appliance: std(S.appliance, { roughness: 0.3 }),
  glass: std(0x111213, { roughness: 0.12 }),
  steel: std(0xc3c7ca, { roughness: 0.32, metalness: 0.35 }),
  chrome: std(0xd7dadc, { roughness: 0.15, metalness: 0.6 }),
  porcelain: std(0xffffff, { roughness: 0.15 }),
  vanity: std(S.vanity, { roughness: 0.45 }),
  mirror: std(0xc6d0d4, { roughness: 0.06, metalness: 0.9 }),
  skirting: std(0xf6f6f3, { roughness: 0.45 }),
  splash: std(0xffffff, { map: tileTexture({ tw: 0.2, th: 0.1, nx: 2, ny: 2, bond: true, color: S.splash, vary: 0.02, grout: 0xd3d5d4, ppm: 400, seed: 21 }), roughness: 0.6 }),
  wet: std(0xffffff, { map: tileTexture({ tw: S.wetFloor.w, th: S.wetFloor.h, nx: 4, ny: 4, color: S.wetFloor.color, vary: 0.06, mottle: 0.05, grout: 0x75787a, ppm: 400, seed: 23 }), roughness: 0.75 }),
  wetWall: std(0xffffff, { map: tileTexture({ tw: S.wetWall.w, th: S.wetWall.h, nx: 3, ny: 3, color: S.wetWall.color, vary: 0.02, grout: 0xcfd1d0, ppm: 300, seed: 25 }), roughness: 0.55 }),
};
for (const k of ['splash', 'wet', 'wetWall']) M[k].userData.skin = true;

const inside = (r, a, tol = 0.02) => r.x0 >= a.x0 - tol && r.x1 <= a.x1 + tol && r.z0 >= a.z0 - tol && r.z1 <= a.z1 + tol;
const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const FT = 0.02, GAP = 0.003; // front thickness, the gap round a front

/** A smooth front a0..a1 × y0..y1 (3 mm gaps) with a bar handle: 'top' (drawers), 'v-lo' / 'v-hi' (by that edge). */
function front(F, a0, a1, y0, y1, handle, low = false) {
  F.box(a0 + GAP, a1 - GAP, -FT, 0, y0 + GAP, y1 - GAP, M.front);
  if (!handle) return;
  const L = 0.16, t = 0.01;
  if (handle === 'top') {
    const m = (a0 + a1) / 2, y = y1 - 0.05;
    F.box(m - L / 2, m + L / 2, 0.022, 0.022 + t, y - t / 2, y + t / 2, M.handle);
    for (const s of [-1, 1]) F.box(m + s * 0.064 - 0.004, m + s * 0.064 + 0.004, 0, 0.022, y - 0.004, y + 0.004, M.handle);
  } else {
    const a = handle === 'v-lo' ? a0 + 0.045 : a1 - 0.045, y = low ? y0 + 0.06 + L / 2 : y1 - 0.06 - L / 2;
    F.box(a - t / 2, a + t / 2, 0.022, 0.022 + t, y - L / 2, y + L / 2, M.handle);
    for (const s of [-1, 1]) F.box(a - 0.004, a + 0.004, 0, 0.022, y + s * 0.064 - 0.004, y + s * 0.064 + 0.004, M.handle);
  }
}

/** Doors of about `size` across a0..a1, handles paired. */
function doorRow(F, a0, a1, y0, y1, size, low = false) {
  const n = Math.max(1, Math.round((a1 - a0) / size)), w = (a1 - a0) / n;
  for (let i = 0; i < n; i++) front(F, a0 + i * w, a0 + (i + 1) * w, y0, y1, i % 2 ? 'v-lo' : 'v-hi', low);
}

function kitchen(B, floor, y0, yC, handled, area) {
  const cabs = floor.cabinets.filter((c) => inside(c, area));
  if (!cabs.length) return [];
  const fixtures = floor.fixtures.filter((f) => inside(f, area));
  for (const x of [...cabs, ...fixtures]) handled.add(x);
  const sinkF = fixtures.find((f) => f.kind === 'sink'), hobF = fixtures.find((f) => f.kind === 'hob');
  const eastWall = Math.max(...cabs.map((c) => c.x1)), southWall = Math.max(...cabs.map((c) => c.z1)), depth = 0.6;
  const dirOf = (c) => (Math.abs(c.x1 - c.x0 - depth) < 0.03 && c.x1 > eastWall - 0.02 ? 'w' : 'n');
  const yb = y0 + K.plinth, yt = y0 + K.baseTop, top = yt + K.worktop, yTop = y0 + S.wallCabinets.top;
  const tall = cabs.find((c) => c.label === 'U/M');
  const fridges = cabs.filter((c) => c.label === 'K' || c.label === 'F').sort((a, b) => a.x0 - b.x0);
  const east = cabs.filter((c) => dirOf(c) === 'w').sort((a, b) => a.z0 - b.z0);
  const ret = cabs.filter((c) => dirOf(c) === 'n' && !fridges.includes(c));
  const hobCab = hobF && cabs.find((c) => inside(hobF, c));
  const span = new Map(cabs.map((c) => [c, dirOf(c) === 'w' ? [c.z0, c.z1] : [c.x0, c.x1]]));
  for (const run of [east, ret]) for (let i = 1; i < run.length; i++) { // neighbouring rectangles meet in the middle
    const a = span.get(run[i - 1]), b = span.get(run[i]);
    if (a[1] > b[0]) a[1] = b[0] = (a[1] + b[0]) / 2;
  }
  for (const c of cabs) {
    const F = frame(B, c, dirOf(c)), [u0, u1] = span.get(c);
    if (c === tall) { // the tall unit: a door, the white oven, the white microwave, a door on top (Electrolux, white)
      const yOven = y0 + 0.78, yMicro = yOven + 0.6, yTopDoor = yMicro + 0.46;
      F.box(u0, u1, -F.depth, -FT, y0, yTop, M.carcass);
      front(F, u0, u1, yb, yOven, 'v-hi');
      for (const [a, b, win] of [[yOven, yMicro, 0.3], [yMicro, yTopDoor, 0.2]]) {
        F.box(u0 + GAP, u1 - GAP, -FT, 0, a + GAP, b - GAP, M.appliance);
        F.box(u0 + 0.07, u1 - 0.07, 0, 0.003, b - 0.1 - win, b - 0.1, M.glass);
        F.box(u0 + 0.08, u1 - 0.08, 0.02, 0.032, b - 0.07, b - 0.06, M.handle);
      }
      front(F, u0, u1, yTopDoor, yTop, 'v-hi', true);
      F.box(u0, u1, -0.07, -0.05, y0, yb, M.front);
      continue;
    }
    if (fridges.includes(c)) { // white fridge / freezer with a cabinet over it
      const yF = y0 + K.fridgeHeight, hi = c.label === 'K' ? 'v-hi' : 'v-lo';
      F.box(u0, u1, -F.depth, -FT, y0, yTop, M.carcass);
      F.box(u0 + GAP, u1 - GAP, -FT, 0, y0 + 0.01, yF - GAP, M.appliance);
      const a = hi === 'v-hi' ? u1 - 0.05 : u0 + 0.05;
      F.box(a - 0.008, a + 0.008, 0.02, 0.036, y0 + 0.9, y0 + 1.5, M.handle);
      front(F, u0, u1, yF, yTop, 'v-lo', true);
      continue;
    }
    F.box(u0, u1, -0.07, -0.05, y0, yb, M.front); // recessed plinth
    F.box(u0, u1, -F.depth, -FT, yb, yt, M.carcass);
    if (c.label === 'DM') { front(F, u0, u1, yb, yt, 'top'); continue; } // integrated dishwasher behind a white front
    if (sinkF && inside(sinkF, c)) { const m = (u0 + u1) / 2; front(F, u0, m, yb, yt, 'v-hi'); front(F, m, u1, yb, yt, 'v-lo'); continue; }
    if (ret.includes(c)) { const vis = Math.min(u1, east[0] ? east[0].x0 : u1); front(F, u0, vis, yb, yt, 'v-hi'); if (vis < u1) F.box(vis, u1, -FT, 0, yb, yt, M.carcass); continue; }
    let y = yt; for (const dh of [0.2, 0.4, 0.4].map((k) => k * (yt - yb))) { front(F, u0, u1, y - dh, y, 'top'); y -= dh; } // drawers
  }
  // worktop along the long run and in front of the corner unit, the sink in it, the hob
  const runZ0 = tall ? tall.z1 : Math.min(...east.map((c) => c.z0));
  const eFront = east.length ? Math.min(...east.map((c) => c.x0)) : eastWall - depth;
  const sinkC = sinkF && centre(sinkF), sinkX = sinkF && Math.min(sinkC[0], eastWall - K.sink.d / 2 - 0.08);
  const hole = sinkF && { x0: sinkX - K.sink.d / 2 + 0.02, x1: sinkX + K.sink.d / 2 - 0.02, z0: sinkC[1] - K.sink.w / 2 + 0.02, z1: sinkC[1] + K.sink.w / 2 - 0.02 };
  if (hole) slabWithHole(B, eFront - 0.02, eastWall, runZ0, southWall, yt, top, hole, M.counter);
  else B.box(eFront - 0.02, eastWall, runZ0, southWall, yt, top, M.counter);
  const retX0 = ret.length ? Math.min(...ret.map((c) => c.x0)) : eFront, retFront = ret.length ? Math.min(...ret.map((c) => c.z0)) : southWall - depth;
  if (retX0 < eFront) B.box(retX0, eFront - 0.02, retFront - 0.02, southWall, yt, top, M.counter);
  if (sinkF) { sinkBowl(B, hole, top, K.sink.depth, M.steel, 'x1'); mixer(B, eastWall - 0.06, sinkC[1], top, [-1, 0], M.chrome); }
  const hob = hobCab ? [hobCab.z0, hobCab.z1] : null;
  if (hob) { const hz = (hob[0] + hob[1]) / 2, hx0 = eFront + 0.04; B.box(hx0, hx0 + K.hob.d, hz - K.hob.w / 2, hz + K.hob.w / 2, top, top + K.hob.t, M.glass); }
  // wall cabinets (+ a hood over the hob, the boxing above it) and the splashback between them and the worktop
  const W = S.wallCabinets, wd = W.depth, yW = y0 + W.bottom, yHood = y0 + W.hood, wallX = eastWall - wd, visEnd = southWall - wd;
  const EW = frame(B, { x0: wallX, x1: eastWall, z0: runZ0, z1: southWall }, 'w');
  const spans = hob ? [[runZ0, hob[0]], [hob[1], visEnd]] : [[runZ0, visEnd]];
  for (const [a, b] of spans) if (b - a > 0.2) { EW.box(a, b, -wd, -FT, yW, yTop, M.carcass); doorRow(EW, a, b, yW, yTop, 0.5, true); }
  if (visEnd < southWall) EW.box(visEnd, southWall, -wd, -FT, yW, yTop, M.carcass);
  if (hob) {
    EW.box(hob[0] + 0.01, hob[1] - 0.01, -wd + 0.02, 0, yHood, yHood + 0.08, M.steel);           // the hood
    EW.box(hob[0], hob[1], -wd, -FT, yHood + 0.08, yTop, M.carcass); front(EW, hob[0], hob[1], yHood + 0.08, yTop, null);
    EW.box(hob[0], hob[1], -wd, 0, yTop, yC, M.carcass);                                           // boxing to the ceiling
  }
  const fridgeX1 = fridges.length ? Math.max(...fridges.map((c) => c.x1)) : retX0;
  if (fridgeX1 < wallX) { const RW = frame(B, { x0: fridgeX1, x1: wallX, z0: southWall - wd, z1: southWall }, 'n'); RW.box(fridgeX1, wallX, -wd, -FT, yW, yTop, M.carcass); doorRow(RW, fridgeX1, wallX, yW, yTop, 0.5, true); }
  const o = [0, top, 0];
  B.box(eastWall - 0.006, eastWall, runZ0, southWall, top, yW, M.splash, o);
  if (hob) B.box(eastWall - 0.006, eastWall, hob[0], hob[1], yW, yHood, M.splash, o);
  B.box(retX0, eastWall, southWall - 0.006, southWall, top, yW, M.splash, o);
  return cabs.map((c) => (fridges.includes(c) ? { ...c, z0: c.z0 - 0.04 } : c));
}

function laundry(B, floor, room, y0, handled) {
  const cabs = floor.cabinets.filter((c) => (c.label === 'TT' || c.label === 'TM') && inside(c, room));
  if (!cabs.length) return [];
  const sinkF = floor.fixtures.find((f) => f.kind === 'sink' && inside(f, room));
  const all = [...cabs, sinkF].filter(Boolean);
  for (const x of all) handled.add(x);
  const run = { x0: Math.min(...all.map((c) => c.x0)), x1: Math.max(...all.map((c) => c.x1)), z0: Math.min(...all.map((c) => c.z0)), z1: Math.max(...all.map((c) => c.z1)) };
  const yt = y0 + 0.88;
  for (const c of cabs) { // white washer / dryer, the round door
    const F = frame(B, c, 'e'), m = (F.u0 + F.u1) / 2;
    F.box(m - 0.3, m + 0.3, -F.depth + 0.02, 0, y0 + 0.01, y0 + 0.85, M.appliance);
    const [dx, dz] = F.at(m, 0.012);
    B.add(new THREE.TorusGeometry(0.17, 0.022, 10, 32).rotateY(Math.PI / 2).translate(dx, y0 + 0.42, dz), M.chrome);
    B.add(new THREE.CylinderGeometry(0.15, 0.15, 0.016, 32).rotateZ(Math.PI / 2).translate(dx, y0 + 0.42, dz), M.glass);
    F.box(m - 0.27, m + 0.27, 0, 0.004, y0 + 0.74, y0 + 0.82, M.steel);
  }
  const s = sinkF && (() => { const [sx, sz] = centre(sinkF), { w, d } = LAUNDRY_SINK; return { x0: sx - d / 2, x1: sx + d / 2, z0: sz - w / 2, z1: sz + w / 2 }; })();
  if (s) slabWithHole(B, run.x0, run.x1 + 0.02, run.z0, run.z1, yt, yt + 0.03, s, M.counter);
  else B.box(run.x0, run.x1 + 0.02, run.z0, run.z1, yt, yt + 0.03, M.counter);
  if (sinkF) {
    const F = frame(B, { ...run, z0: sinkF.z0, z1: run.z1 }, 'e');
    F.box(F.u0, F.u1, -F.depth, -FT, y0, yt, M.carcass);
    front(F, F.u0, F.u1, y0 + 0.1, yt, 'v-lo');
    sinkBowl(B, s, yt + 0.03, LAUNDRY_SINK.depth, M.steel, 'x0');
    mixer(B, run.x0 + 0.06, centre(sinkF)[1], yt + 0.03, [1, 0], M.chrome, { h: 0.28, r: 0.08 });
  }
  return [run];
}

function bathroom(B, floor, room, y0, handled) {
  const rects = [];
  const sinkF = floor.fixtures.find((f) => f.kind === 'sink' && inside(f, room));
  const shower = floor.fixtures.find((f) => f.kind === 'shower' && inside(f, room));
  const up = room.level === 1;
  if (sinkF) { // a white wall-hung vanity with a porcelain top, a mixer, a plain mirror over it
    handled.add(sinkF);
    const [, cz] = centre(sinkF), w = up ? 0.5 : 0.6, d = up ? 0.36 : 0.45, x0 = room.x0 + 0.005;
    const r = { x0, x1: x0 + d, z0: cz - w / 2, z1: cz + w / 2 };
    B.box(r.x0, r.x1 - FT, r.z0, r.z1, y0 + 0.4, y0 + 0.76, M.vanity);
    B.box(r.x1 - FT, r.x1, r.z0 + GAP, r.z1 - GAP, y0 + 0.4 + GAP, y0 + 0.76 - GAP, M.vanity);
    B.box(r.x0, r.x1 + 0.01, r.z0, r.z1, y0 + 0.76, y0 + 0.86, M.porcelain);
    B.box(r.x0 + 0.12, r.x1 - 0.05, cz - w / 2 + 0.06, cz + w / 2 - 0.06, y0 + 0.86, y0 + 0.862, M.chrome); // the bowl's rim
    mixer(B, r.x0 + 0.06, cz, y0 + 0.86, [1, 0], M.chrome, { h: 0.14, r: 0.05, tube: 0.009 });
    B.box(room.x0 + 0.005, room.x0 + 0.012, cz - w / 2 + 0.05, cz + w / 2 - 0.05, y0 + 1.15, y0 + 1.95, M.mirror);
    rects.push(r);
  }
  if (shower) {
    handled.add(shower);
    const s = shower;
    if (up) glassPanel(B, [s.x0, s.z1], [s.x0 + 0.78, s.z1], y0);
    else { const zOpen = Math.abs(s.z0 - room.z0) < 0.05 ? s.z1 : s.z0; glassPanel(B, [s.x0, zOpen], [s.x1, zOpen], y0); glassPanel(B, [s.x1, s.z0], [s.x1, s.z1], y0); }
    showerSet(B, room.x0, (s.z0 + s.z1) / 2, y0, false);
    B.box(s.x0, s.x1, s.z0, s.z1, y0 + 0.001, y0 + 0.005, M.wet);
  }
  return rects;
}

/** The fixed interior of one level of a standard flat, into `group` (plan coordinates). Returns collision rectangles. */
export function buildStandardInterior(group, floor, li, y0, yC, wallBoxes, handled, doorways = [], area = K.area) {
  const B = new Batch(), rects = [];
  if (li === K.level) rects.push(...kitchen(B, floor, y0, yC, handled, area));
  const tiled = S.tiled.filter((r) => r.level === li).map((r) => ({ ...r, floor: 'wet' }));
  for (const room of tiled) {
    B.box(room.x0, room.x1, room.z0, room.z1, y0 + 0.001, y0 + 0.004, M.wet);
    if (room.wallTile) { tileWalls(B, room, wallBoxes, y0, room.wallTile, M.wetWall); rects.push(...bathroom(B, floor, room, y0, handled)); }
    else rects.push(...laundry(B, floor, room, y0, handled));
  }
  doorwayTiles(B, tiled, doorways, y0, { wet: M.wet });
  skirting(B, [...wallBoxes, ...floor.windows], li, floor.size, y0, tiled, M.skirting);
  group.add(...B.meshes());
  return rects;
}
