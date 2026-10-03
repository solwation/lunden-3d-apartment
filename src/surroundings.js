import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE as S, COLORS, SEASON, COURTYARD } from './config.js';
import { registerTrees, registerSnow } from './seasons.js';
import { buildStreet } from './street.js';
import { onRoad, pathStrip, filletGeometry } from './roads.js';

// The rest of Kv. Lunden and its neighbourhood (SITE in config): the brick point blocks Hus A, B, C
// with low hip roofs, the schools and buildings around the plot, Sankt Lars väg and Karpvägen,
// the courtyard walks, the 3 m drop to S:t Lars park, trees and Höje å, plus a sky with clouds.
// Everything is merged/instanced: a handful of draw calls.

const T = S.terrain;
/** On the garage box (the raised courtyard)? */
const onBox = (x, z) => T.box.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const E = T.east;
/** The ground east of the courtyard along Sankt Lars väg (#255): T.east.profile, linear in z. */
function eastY(z) {
  const P = E.profile;
  if (z <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (z <= P[i][0]) return P[i - 1][1] + ((z - P[i - 1][0]) / (P[i][0] - P[i - 1][0])) * (P[i][1] - P[i - 1][1]);
  return P[P.length - 1][1];
}
/** Ground height at plan (x, z): the street / courtyard level north of Hus L and on the garage box,
 * the park level around the box (reached over T.slope m south of Hus L), east of it Sankt Lars väg's gentler slope. */
export function groundY(x, z) {
  if (z <= T.north || onBox(x, z)) return 0;
  const park = T.park * THREE.MathUtils.clamp((z - T.north) / T.slope, 0, 1);
  if (x < E.x0) return park;
  return THREE.MathUtils.lerp(eastY(z), park, THREE.MathUtils.clamp((x - E.x1) / E.blend, 0, 1));
}

/** Terrain south of Hus L: a grid with lines on every box edge, so the step at the edges is vertical. */
function terrainGeometry() {
  const xs = new Set([-200, 200, E.x0 - 0.01, E.x0 + 0.01, E.x1, E.x1 + E.blend]), zs = new Set([T.north, 260, T.north + T.slope, ...E.profile.map((p) => p[0])]);
  for (let x = -200; x <= 200; x += 4) xs.add(x);
  for (let z = T.north; z <= 260; z += 4) zs.add(z);
  for (const b of T.box) { for (const x of [b.x0, b.x1]) { xs.add(x - 0.01); xs.add(x + 0.01); } for (const z of [b.z0, b.z1]) { zs.add(z - 0.01); zs.add(z + 0.01); } }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].filter((z) => z >= T.north).sort((a, b) => a - b);
  const pos = [], idx = [];
  for (const z of Z) for (const x of X) pos.push(x, groundY(x, z) - 0.01, z);
  const nx = X.length;
  for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Retaining walls of the garage box where the ground outside is lower, a coping and a railing on top,
 * and the garage door in the west face. */
function boxWalls() {
  const walls = [], rails = [], door = [];
  const quad = (ax, az, bx, bz, ya0, yb0) => { // vertical quad from the outside ground up to y 0
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([ax, ya0, az, bx, yb0, bz, bx, 0.12, bz, ax, ya0, az, bx, 0.12, bz, ax, 0.12, az], 3));
    const ua = (Math.abs(bx - ax) > Math.abs(bz - az) ? ax : az) / 2, ub = (Math.abs(bx - ax) > Math.abs(bz - az) ? bx : bz) / 2; // brick, 2 m per tile (#148)
    g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, ya0 / 2, ub, yb0 / 2, ub, 0.06, ua, ya0 / 2, ub, 0.06, ua, 0.06], 2));
    g.computeVertexNormals();
    return g;
  };
  const slats = [], segments = [];
  const atStairs = (x0, x1, z) => T.stairs.some((St) => Math.abs(z - St.z) < 0.05 && Math.max(x0, x1) > St.x0 - 0.05 && Math.min(x0, x1) < St.x1 + 0.05);
  const edges = [];
  for (const b of T.box) edges.push([b.x0, b.z0, b.x1, b.z0, 0, -1], [b.x1, b.z0, b.x1, b.z1, 1, 0], [b.x1, b.z1, b.x0, b.z1, 0, 1], [b.x0, b.z1, b.x0, b.z0, -1, 0]);
  for (const [ax, az, bx, bz, ox, oz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 1));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) / 2 + ox * 0.05, mz = (z0 + z1) / 2 + oz * 0.05; // just outside
      if (onBox(mx, mz)) continue; // an inner edge between two box parts
      const y0 = groundY(x0 + ox * 0.05, z0 + oz * 0.05), y1 = groundY(x1 + ox * 0.05, z1 + oz * 0.05);
      if (y0 > -0.005 && y1 > -0.005) continue; // no step here
      if (S.blocks.some((b) => mx > b.x0 && mx < b.x1 && mz > b.z0 && mz < b.z1)) continue; // a house's façade is the edge here (#246)
      segments.push([x0, z0, x1, z1]); // the visitor stays on the courtyard (#255), across the stairs' tops too
      if (y0 > -0.05 && y1 > -0.05) continue; // too small a step for a wall
      // the walls stand 4 cm outside the box edge, in front of the terrain's own (grass) step
      const wx0 = x0 + ox * 0.04, wz0 = z0 + oz * 0.04, wx1 = x1 + ox * 0.04, wz1 = z1 + oz * 0.04;
      const atDoor = ox < 0 && Math.abs(x0 - T.garageDoor.x) < 0.1 && (z0 + z1) / 2 > T.garageDoor.z0 && (z0 + z1) / 2 < T.garageDoor.z1;
      if (atDoor) { // the garage door: a dark opening with a grey roller door frame
        door.push(quad(wx0 + ox * 0.01, wz0, wx1 + ox * 0.01, wz1, y0, y1));
        walls.push(quad(wx0 + ox * 0.02, wz0, wx1 + ox * 0.02, wz1, y0 + T.garageDoor.h, y1 + T.garageDoor.h));
      } else walls.push(quad(wx0, wz0, wx1, wz1, y0, y1));
      if (atStairs(x0, x1, z0)) continue; // the stair goes down here: no railing
      // coping + a light slatted railing (posts every metre, a top rail) on the courtyard side
      const sl = new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), 0.85).rotateY(Math.abs(ox) > 0 ? Math.PI / 2 : 0).translate((x0 + x1) / 2 - ox * 0.08, 0.6, (z0 + z1) / 2 - oz * 0.08);
      slats.push(sl);
      const cop = new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.3 * Math.abs(oz), 0.06, Math.abs(z1 - z0) + 0.3 * Math.abs(ox));
      rails.push(cop.translate((x0 + x1) / 2, 0.15, (z0 + z1) / 2));
      rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(x0 - ox * 0.08, 0.6, z0 - oz * 0.08));
      rails.push(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.04, 0.04, Math.abs(z1 - z0) + 0.04).translate((x0 + x1) / 2 - ox * 0.08, 1.06, (z0 + z1) / 2 - oz * 0.08));
    }
  }
  const stairs = T.stairs.map(terraceStairs);
  return { walls, rails, door, slats, segments, stairs: { solid: stairs.flatMap((s) => s.solid), rails: stairs.flatMap((s) => s.rails), ends: stairs.map((s) => s.end) } };
}

/** A stair from the courtyard going south, down `drop` m (default: to the park level) (#148, #254, #255): treads, a
 * landing halfway if it has one, handrails. */
function terraceStairs(St) {
  const drop = St.drop ?? -T.park, foot = -drop, steps = St.steps ?? Math.round(drop / 0.17), rise = drop / steps, half = St.landing ? Math.floor(steps / 2) : -1;
  const solid = [], rails = [];
  let z = St.z, y = 0;
  for (let k = 0; k < steps; k++) {
    y -= rise;
    const run = k === half - 1 ? St.landing : St.step;
    solid.push(new THREE.BoxGeometry(St.x1 - St.x0, y - foot + 0.02, run).translate((St.x0 + St.x1) / 2, (y + foot) / 2, z + run / 2));
    z += run;
  }
  for (const x of [St.x0 - 0.06, St.x1 + 0.06]) { // handrails following the flight, posts at both ends
    const pts = [new THREE.Vector3(x, 0.95, St.z), new THREE.Vector3(x, foot + 0.95, z)];
    rails.push(new THREE.TubeGeometry(new THREE.LineCurve3(...pts), 1, 0.022, 6));
    for (const [pz, py] of [[St.z + 0.1, 0], [z - 0.1, foot]]) rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(x, py + 0.47, pz));
  }
  return { solid, rails, end: z };
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Bay width and storey height of a block (the old S:t Lars buildings are taller, narrower bays). */
const dims = (b) => (b.style ? S[b.style] ?? S : S); // the style's bay, storey (and rows); the Å-husen: SITE's

/** Old S:t Lars style bay: brick, a white string course at the floor line, a tall white-framed
 * window with a round-arched top (v = 0 is the bottom of the canvas). */
function oldFacadeTexture() {
  const { bay, storey } = S.old;
  const pw = 208, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d');
  const m = pw / bay;
  g.fillStyle = '#d6cfc2';
  g.fillRect(0, 0, pw, ph);
  const rand = rng(23);
  const bw = 0.26 * m, bh = 0.075 * m;
  const base = new THREE.Color(COLORS.brick).offsetHSL(0, 0.02, -0.02);
  for (let row = 0; row * bh < ph; row++) {
    for (let x = (row % 2) * -bw / 2; x < pw; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
  g.fillStyle = '#eeeae2'; // string course
  g.fillRect(0, ph - 0.14 * m, pw, 0.14 * m);
  const ww = 1.0 * m, wh = 1.9 * m, wx = (pw - ww) / 2, wy = ph - (0.95 * m + wh);
  const arch = (x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill(); };
  g.fillStyle = '#f4f2ec';
  arch(wx - 6, wy - 6, ww + 12, wh + 12);
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#61788a');
  glass.addColorStop(1, '#2a3843');
  g.fillStyle = glass;
  arch(wx, wy, ww, wh);
  g.fillStyle = '#f4f2ec';
  g.fillRect(wx + ww / 2 - 2, wy + ww / 2, 4, wh - ww / 2);           // mullion
  g.fillRect(wx, wy + ww / 2 + wh * 0.18, ww, 4);                      // transom
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const brickCourses = (g, pw, ph, m, seed, base = new THREE.Color(COLORS.brick)) => {
  const rand = rng(seed), bw = 0.26 * m, bh = 0.075 * m;
  for (let row = 0; row * bh < ph; row++) {
    for (let x = (row % 2) * -bw / 2; x < pw; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
};
const canvasTex = (c) => {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

/** One bay of the buildings east of us (#127): 'hepcat' = brick with a white pilaster at the bay edge and a
 * pair of white-framed windows; 'hepcatWhite' = white render, a pair below and a small window in the gable;
 * 'longhouse' = brick with a dark window in a yellow frame. */
function sideFacadeTexture(style) {
  const { bay, storey } = S[style];
  const pw = 160, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d'), m = pw / bay, Y = (y) => ph - y * m;
  if (style === 'hepcatWhite') { g.fillStyle = '#efede7'; g.fillRect(0, 0, pw, ph); }
  else { g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, pw, ph); brickCourses(g, pw, ph, m, style === 'hepcat' ? 37 : 41); }
  const win = (cx, y0, w, h, frame, bars = true) => {
    g.fillStyle = frame; g.fillRect(cx - w / 2 - 5, Y(y0 + h) - 5, w + 10, h * m + 10);
    const gr = g.createLinearGradient(0, Y(y0 + h), 0, Y(y0)); gr.addColorStop(0, '#61788a'); gr.addColorStop(1, '#2a3843');
    g.fillStyle = gr; g.fillRect(cx - w / 2, Y(y0 + h), w, h * m);
    if (bars) { g.fillStyle = frame; g.fillRect(cx - 2, Y(y0 + h), 4, h * m); }
  };
  if (style === 'hepcat') {
    g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 0.45 * m, ph);               // pilaster
    g.fillRect(0, Y(0.45), pw, 0.45 * m);                                    // plinth
    g.fillRect(pw / 2 - 0.95 * m, Y(2.65), 1.9 * m, 0.22 * m);               // lintel over the pair
    win(pw / 2 - 0.42 * m, 1.05, 0.62 * m, 1.35, '#f7f6f2'); win(pw / 2 + 0.42 * m, 1.05, 0.62 * m, 1.35, '#f7f6f2');
  } else if (style === 'hepcatWhite') {
    win(pw / 2 - 0.45 * m, 1.05, 0.66 * m, 1.35, '#ffffff'); win(pw / 2 + 0.45 * m, 1.05, 0.66 * m, 1.35, '#ffffff');
    win(pw / 2, 3.9, 0.5 * m, 0.95, '#ffffff');
  } else {
    g.fillStyle = '#6b5d4c'; g.fillRect(0, Y(0.5), pw, 0.5 * m);            // a stone plinth
    win(pw / 2, 0.9, 1.0 * m, 1.45, '#e8c43a', false);
  }
  return canvasTex(c);
}

/** Dormers on the street side (west) of the long brick building's roof (#127). */
function dormers(list) {
  const geos = [];
  for (const b of list) {
    const top = b.base + S.longhouse.storey, n = Math.max(1, Math.round(S.longhouse.dormers * (b.z1 - b.z0) / 37));
    for (let k = 0; k < n; k++) {
      const z = b.z0 + ((k + 0.5) * (b.z1 - b.z0)) / n, x = b.x0 + 1.6;
      geos.push(new THREE.BoxGeometry(1.4, 1.1, 1.6).translate(x, top + 0.75, z));
      const cap = new THREE.CylinderGeometry(0.0001, 1.1, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.05, 1, 1.15).translate(x, top + 1.55, z);
      geos.push(cap.index ? cap.toNonIndexed() : cap);
    }
  }
  return geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; return x; });
}

/** Plain brick, 2 × 2 m per tile (the wall along the street, #126). */
function brickTexture() {
  const pw = 256, c = document.createElement('canvas');
  c.width = c.height = pw;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, pw, pw);
  brickCourses(g, pw, pw, pw / 2, 31, new THREE.Color(COLORS.brick).offsetHSL(0.01, 0.06, 0.04));
  return canvasTex(c);
}

/** The school across the street (#126): one bay over the full two storeys — white plinth, a tall arched window
 * below, a white string course, a square window with a white surround and a cornice line above. */
function schoolFacadeTexture() {
  const { bay, storey } = S.school;
  const pw = 192, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d'), m = pw / bay, Y = (y) => ph - y * m; // y in metres from the ground
  g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, pw, ph);
  brickCourses(g, pw, ph, m, 29, new THREE.Color(COLORS.brick).offsetHSL(0.01, 0.04, 0.02));
  const white = '#f3f1eb';
  g.fillStyle = white;
  g.fillRect(0, Y(0.6), pw, 0.6 * m);               // plinth
  g.fillRect(0, Y(4.35), pw, 0.25 * m);             // string course
  g.fillRect(0, Y(8.6), pw, 0.45 * m);              // frieze under the cornice
  const glass = (y0, y1) => { const gr = g.createLinearGradient(0, Y(y1), 0, Y(y0)); gr.addColorStop(0, '#61788a'); gr.addColorStop(1, '#2a3843'); return gr; };
  const ww = 1.15 * m, wx = (pw - ww) / 2;
  // ground floor: arched, white surround and keystone
  const arch = (x, yb, w, yt) => { const r = w / 2; g.beginPath(); g.moveTo(x, Y(yb)); g.lineTo(x, Y(yt) + r); g.arc(x + r, Y(yt) + r, r, Math.PI, 0); g.lineTo(x + w, Y(yb)); g.closePath(); g.fill(); };
  g.fillStyle = white; arch(wx - 7, 0.85, ww + 14, 3.35);
  g.fillStyle = glass(0.95, 3.25); arch(wx, 0.95, ww, 3.25);
  g.fillStyle = white;
  g.fillRect(wx + ww / 2 - 2, Y(3.25) + ww / 2, 4, (2.3 * m) - ww / 2); // mullion
  g.fillRect(wx, Y(2.45), ww, 4);                                       // transom
  g.fillRect(pw / 2 - 6, Y(3.42), 12, 0.22 * m);                        // keystone
  // upper floor: square-headed, white surround, a small cornice over it
  g.fillStyle = white; g.fillRect(wx - 7, Y(6.95), ww + 14, 2.0 * m + 7);
  g.fillRect(wx - 12, Y(7.12), ww + 24, 0.14 * m);
  g.fillStyle = glass(5.05, 6.85); g.fillRect(wx, Y(6.85), ww, 1.8 * m);
  g.fillStyle = white;
  g.fillRect(wx + ww / 2 - 2, Y(6.85), 4, 1.8 * m);
  g.fillRect(wx, Y(6.3), ww, 4);
  return canvasTex(c);
}

/** White corner quoins on a block: alternating long and short stones up both sides of every corner. */
function quoins(b, h) {
  const geos = [], step = 0.42;
  for (const [x, z, sx, sz] of [[b.x0, b.z0, 1, 1], [b.x1, b.z0, -1, 1], [b.x1, b.z1, -1, -1], [b.x0, b.z1, 1, -1]]) {
    for (let k = 0, y = 0.6; y + step <= h; k++, y += step) {
      const l = k % 2 ? 0.32 : 0.55;
      geos.push(new THREE.BoxGeometry(l, step - 0.05, 0.06).translate(x + sx * l / 2, b.base + y + step / 2, z - sz * 0.03)); // on the x face
      geos.push(new THREE.BoxGeometry(0.06, step - 0.05, l).translate(x - sx * 0.03, b.base + y + step / 2, z + sz * l / 2)); // on the z face
    }
  }
  return geos;
}

/** The brick wall along the far pavement, its black metal coping, the school's chimneys and greenhouse (#126). */
function schoolGrounds() {
  const W = S.school.wall, G = S.school.greenhouse;
  const wall = new THREE.BoxGeometry(W.x1 - W.x0, W.h, W.t).translate((W.x0 + W.x1) / 2, W.h / 2, W.z);
  const p = wall.attributes.position, n = wall.attributes.normal, uv = wall.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / 2, p.getY(i) / 2); // 2 × 2 m per tile
  const coping = new THREE.BoxGeometry(W.x1 - W.x0 + 0.06, 0.06, W.t + 0.08).translate((W.x0 + W.x1) / 2, W.h + 0.03, W.z);
  const chimneys = [], main = S.blocks.find((b) => b.style === 'school'), top = main.base + S.school.storey;
  const rise = S.school.roofPitch * Math.min(main.x1 - main.x0, main.z1 - main.z0) / 2 + 0.3;
  for (const x of S.school.chimneys) chimneys.push(new THREE.BoxGeometry(0.7, 1.6, 0.5).translate(x, top + rise + 0.2, (main.z0 + main.z1) / 2 + (x % 2 ? 0.8 : -0.8)));
  // greenhouse: a dark frame and glass panes under a pitched glass roof
  const frame = [], panes = [], cx = (G.x0 + G.x1) / 2, cz = (G.z0 + G.z1) / 2, d = G.z1 - G.z0;
  for (let x = G.x0; x <= G.x1 + 1e-6; x += (G.x1 - G.x0) / 8) for (const z of [G.z0, G.z1]) frame.push(new THREE.BoxGeometry(0.05, G.h, 0.05).translate(x, G.h / 2, z));
  for (const z of [G.z0, G.z1]) frame.push(new THREE.BoxGeometry(G.x1 - G.x0, 0.05, 0.05).translate(cx, G.h, z));
  frame.push(new THREE.BoxGeometry(G.x1 - G.x0, 0.06, 0.06).translate(cx, G.h + G.ridge, cz));
  const roofLen = Math.hypot(d / 2, G.ridge), tilt = Math.atan2(G.ridge, d / 2);
  for (const sgn of [-1, 1]) panes.push(new THREE.PlaneGeometry(G.x1 - G.x0, roofLen).rotateX(-Math.PI / 2 + sgn * tilt).translate(cx, G.h + G.ridge / 2, cz + sgn * d / 4));
  panes.push(new THREE.PlaneGeometry(G.x1 - G.x0, G.h).translate(cx, G.h / 2, G.z0), new THREE.PlaneGeometry(G.x1 - G.x0, G.h).translate(cx, G.h / 2, G.z1));
  for (const x of [G.x0, G.x1]) panes.push(new THREE.PlaneGeometry(d, G.h).rotateY(Math.PI / 2).translate(x, G.h / 2, cz));
  return { wall: [wall], coping: [coping, ...chimneys], frame, panes };
}

/** One storey × one window bay of brick façade with a white-framed window. */
function facadeTexture() {
  const px = 256, c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const m = px / S.bay; // px per metre
  g.fillStyle = '#cfc6b8';
  g.fillRect(0, 0, px, px);
  const rand = rng(11);
  const bw = 0.26 * m, bh = 0.075 * m;
  const base = new THREE.Color(COLORS.brick);
  for (let row = 0; row * bh < px; row++) {
    for (let x = (row % 2) * -bw / 2; x < px; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
  // window: 1.3 × 1.5 m, sill 0.8 m above the storey floor (v = 0 is the bottom of the canvas); like Peab's
  // renders (#146): set back in a deep brick reveal (its shadow on the top and the left), white sashes with a
  // mullion and a transom, a soldier course of upright bricks under it and over it
  const ww = 1.3 * m, wh = 1.5 * m, wx = (px - ww) / 2, wy = px - (0.8 * m + wh);
  const soldiers = (y, h) => {
    for (let x = wx - 0.06 * m; x < wx + ww + 0.06 * m; x += 0.075 * m) {
      g.fillStyle = base.clone().offsetHSL(0, 0, -0.06 + (rand() - 0.5) * 0.06).getStyle();
      g.fillRect(x + 1, y, 0.075 * m - 2, h);
    }
  };
  g.fillStyle = '#cfc6b8'; g.fillRect(wx - 0.07 * m, wy + wh, ww + 0.14 * m, 0.2 * m); // mortar behind the soldiers
  soldiers(wy + wh + 0.01 * m, 0.18 * m);                                              // the sill: upright bricks
  g.fillStyle = '#cfc6b8'; g.fillRect(wx - 0.07 * m, wy - 0.2 * m, ww + 0.14 * m, 0.2 * m);
  soldiers(wy - 0.19 * m, 0.18 * m);                                                   // the lintel
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#6b8293');
  glass.addColorStop(1, '#2c3a45');
  g.fillStyle = '#f4f4f1'; g.fillRect(wx, wy, ww, wh);                                 // the white frame
  g.fillStyle = glass;
  g.fillRect(wx + 0.05 * m, wy + 0.05 * m, ww - 0.1 * m, wh - 0.1 * m);
  g.fillStyle = '#f4f4f1';
  g.fillRect(wx + ww * 0.62 - 3, wy, 6, wh);                 // mullion (a wide and a narrow light)
  g.fillRect(wx, wy + wh * 0.22, ww * 0.62, 5);              // transom over the wide light
  g.fillStyle = 'rgba(0,0,0,0.28)';                          // the deep reveal's shadow
  g.fillRect(wx, wy, ww, 0.07 * m);
  g.fillRect(wx, wy, 0.06 * m, wh);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Light slatted balcony railing (#108): vertical slats under a handrail, transparent between (alphaTest). */
function railTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bdbd';
  for (let x = 1; x < 128; x += 16) g.fillRect(x, 6, 7, 58);
  g.fillRect(0, 0, 128, 9); g.fillRect(0, 57, 128, 7);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Is a recess on storey `st` (-1 = on any)? */
const onStorey = (r, st) => st < 0 || (st >= (r.from ?? 0) && st <= (r.to ?? Infinity));

/** The cuts in an Å-hus façade (#258): [a0, a1] spans along face n|e|s|w (plan x on n/s, z on e/w) taken by a corner
 * loggia or by a recess on storey `st` (-1 = any storey). */
function cuts(b, face, st = -1) {
  const c = b.corners, i = face === 'n' || face === 's' ? 0 : 1;
  const [lo, hi] = i === 0 ? [b.x0, b.x1] : [b.z0, b.z1];
  const [first, last] = { n: [c.nw, c.ne], s: [c.sw, c.se], w: [c.nw, c.sw], e: [c.ne, c.se] }[face];
  return [[lo, lo + first[i]], [hi - last[i], hi], ...(b.recesses ?? []).filter((r) => r.face === face && onStorey(r, st)).map((r) => [r.a0, r.a1])];
}
/** Does [a0, a1] along a face overlap a loggia or recess there? */
const inCut = (b, face, a0, a1, st = -1) => cuts(b, face, st).some(([c0, c1]) => a1 > c0 && a0 < c1);

/** An Å-hus's plan outline on storey `st`: the rectangle with its corner loggias and the recesses of that storey. */
function outline(b, st) {
  const { nw, ne, se, sw } = b.corners;
  const rs = (f, desc) => (b.recesses ?? []).filter((r) => r.face === f && onStorey(r, st)).sort((p, q) => (desc ? q.a0 - p.a0 : p.a0 - q.a0));
  const pts = [[b.x0, b.z0 + nw[1]], [b.x0 + nw[0], b.z0 + nw[1]], [b.x0 + nw[0], b.z0]];
  for (const r of rs('n')) pts.push([r.a0, b.z0], [r.a0, b.z0 + r.depth], [r.a1, b.z0 + r.depth], [r.a1, b.z0]);
  pts.push([b.x1 - ne[0], b.z0], [b.x1 - ne[0], b.z0 + ne[1]], [b.x1, b.z0 + ne[1]]);
  for (const r of rs('e')) pts.push([b.x1, r.a0], [b.x1 - r.depth, r.a0], [b.x1 - r.depth, r.a1], [b.x1, r.a1]);
  pts.push([b.x1, b.z1 - se[1]], [b.x1 - se[0], b.z1 - se[1]], [b.x1 - se[0], b.z1]);
  for (const r of rs('s', true)) pts.push([r.a1, b.z1], [r.a1, b.z1 - r.depth], [r.a0, b.z1 - r.depth], [r.a0, b.z1]);
  pts.push([b.x0 + sw[0], b.z1], [b.x0 + sw[0], b.z1 - sw[1]], [b.x0, b.z1 - sw[1]]);
  for (const r of rs('w', true)) pts.push([b.x0, r.a1], [b.x0 + r.depth, r.a1], [b.x0 + r.depth, r.a0], [b.x0, r.a0]);
  return pts;
}

/** An Å-hus's brick body (#145, #258): its outline extruded band by band (a band = a run of storeys with the same
 * recesses), with the façade UVs of block(). */
function aHouse(b) {
  const geos = [], key = (st) => (b.recesses ?? []).map((r) => +onStorey(r, st)).join();
  for (let st = 0; st < b.storeys;) {
    let end = st + 1;
    while (end < b.storeys && key(end) === key(st)) end++;
    const shape = new THREE.Shape(outline(b, st).map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: (end - st) * S.storey, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2).translate(0, b.base + st * S.storey, 0); // shape (x, -z) → plan (x, z), extruded up
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
      uv.setXY(i, along / S.bay, (p.getY(i) - b.base) / S.storey);
    }
    geo.clearGroups();
    geos.push(geo);
    st = end;
  }
  return geos;
}

/** A vertical quad from (xa, za) to (xb, zb), y0…y1, facing (nx, nz), 1 cm proud of the wall behind it. */
function quad(xa, za, xb, zb, nx, nz, y0, y1) {
  return new THREE.PlaneGeometry(Math.abs(xb - xa) + Math.abs(zb - za), y1 - y0).rotateY(Math.atan2(nx, nz))
    .translate((xa + xb) / 2 + nx * 0.01, (y0 + y1) / 2, (za + zb) / 2 + nz * 0.01);
}

/** A slatted railing panel from (xa, za) to (xb, zb) standing on y (a slat every 12 cm). */
function railPanel(xa, za, xb, zb, y) {
  const len = Math.hypot(xb - xa, zb - za), rail = S.loggia.rail;
  const g = new THREE.PlaneGeometry(len, rail).rotateY(-Math.atan2(zb - za, xb - xa)).translate((xa + xb) / 2, y + rail / 2, (za + zb) / 2);
  const uv = g.attributes.uv;
  for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * len);
  return g;
}

/** The Å-husen's loggias and entrances (#145, #258): slabs, white-rendered inner walls, brick piers (façade texture),
 * railings, a few plants, the entrance doors. */
function loggias(blocks) {
  const L = S.loggia, p = L.pier, slabs = [], walls = [], piers = [], rails = [], plants = [], doors = [];
  const rand = rng(43);
  const pier = (b, x0, x1, z0, z1) => piers.push(block({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), base: b.base, storeys: b.storeys }).toNonIndexed());
  const plant = (x, y, z) => {
    if (rand() < L.plants) plants.push(new THREE.CylinderGeometry(0.17, 0.13, 0.38, 8).translate(x, y + 0.19, z), new THREE.IcosahedronGeometry(0.34, 0).translate(x, y + 0.62, z));
  };
  for (const b of blocks) {
    const top = b.base + b.storeys * S.storey, C = b.corners;
    for (const [cx, cz, sx, sz, [lx, lz]] of [[b.x0, b.z0, 1, 1, C.nw], [b.x1, b.z0, -1, 1, C.ne], [b.x1, b.z1, -1, -1, C.se], [b.x0, b.z1, 1, -1, C.sw]]) {
      // (cx, cz) = the outer corner; (sx, sz) point into the block; the loggia is lx along x, lz along z
      const ix = cx + sx * lx, iz = cz + sz * lz, mx = (cx + ix) / 2, mz = (cz + iz) / 2;
      pier(b, cx, cx + sx * p, cz, cz + sz * p);
      if (lx > L.mid) pier(b, cx + sx * (L.midAt - p / 2), cx + sx * (L.midAt + p / 2), cz, cz + sz * p); // part-way along a long front
      if (lz > L.mid) pier(b, cx, cx + sx * p, cz + sz * (L.midAt - p / 2), cz + sz * (L.midAt + p / 2));
      walls.push(quad(cx, iz, ix, iz, 0, -sz, b.base, top), quad(ix, cz, ix, iz, -sx, 0, b.base, top)); // the rendered inner walls
      for (let st = 0; st <= b.storeys; st++) {
        const y = b.base + st * S.storey;
        if (st > 0) slabs.push(new THREE.BoxGeometry(lx, 0.22, lz).translate(mx, y - 0.11, mz)); // floor above / ceiling below
        if (st === b.storeys || y < groundY(mx, mz) + 1.2) continue; // no railing on the roof or at the ground under the loggia (#246)
        rails.push(railPanel(cx + sx * p, cz + sz * 0.06, ix, cz + sz * 0.06, y), railPanel(cx + sx * 0.06, cz + sz * p, cx + sx * 0.06, iz, y));
        plant(ix - sx * 0.45, y, cz + sz * (p + 0.4));
      }
    }
    for (const r of b.recesses ?? []) {
      // `out` = +1 when the face looks towards +x / +z; `at(along, across)` → plan [x, z]
      const nz = r.face === 'n' || r.face === 's', out = r.face === 's' || r.face === 'e' ? 1 : -1;
      const line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[r.face], back = line - out * r.depth;
      const at = (a, c) => (nz ? [a, c] : [c, a]), nrm = (k) => (nz ? [0, k] : [k, 0]), side = (k) => (nz ? [k, 0] : [0, k]);
      const s0 = r.from ?? 0, s1 = Math.min(r.to ?? Infinity, b.storeys - 1), y0 = b.base + s0 * S.storey, y1 = b.base + (s1 + 1) * S.storey;
      walls.push(quad(...at(r.a0, back), ...at(r.a1, back), ...nrm(out), y0, y1), // the back wall and the sides
        quad(...at(r.a0, back), ...at(r.a0, line), ...side(1), y0, y1), quad(...at(r.a1, back), ...at(r.a1, line), ...side(-1), y0, y1));
      const [mx, mz] = at((r.a0 + r.a1) / 2, (line + back) / 2), [w, d] = nz ? [r.a1 - r.a0, r.depth] : [r.depth, r.a1 - r.a0];
      for (let st = s0; st <= s1 + 1; st++) {
        const y = b.base + st * S.storey;
        if (st > s0) slabs.push(new THREE.BoxGeometry(w, 0.22, d).translate(mx, y - 0.11, mz)); // a ceiling, a loggia floor
        else if (y > groundY(mx, mz) + 0.1) slabs.push(new THREE.BoxGeometry(w, 0.04, d).translate(mx, y + 0.02, mz)); // the floor over a storey below
        if (st > s1 || st === r.door || y < groundY(mx, mz) + 1.2) continue;
        const f = line - out * 0.06;
        rails.push(railPanel(...at(r.a0, f), ...at(r.a1, f), y));
        const [px, pz] = at(r.a0 + 0.5, back + out * 0.45);
        plant(px, y, pz);
      }
      if (r.door != null) { // a dark glazed entrance door on the back wall, a sidelight beside it in a wide recess
        const y = b.base + r.door * S.storey, mid = (r.a0 + r.a1) / 2, c = back + out * 0.04, dw = 1.2;
        const box = (a, wa, h, yy) => { const [x, z] = at(a, c); return new THREE.BoxGeometry(nz ? wa : 0.08, h, nz ? 0.08 : wa).translate(x, yy + h / 2, z); };
        doors.push(box(mid, dw, 2.3, y), box(mid, dw + 0.2, 0.12, y + 2.3)); // the leaf, the head
        if (r.a1 - r.a0 > 2.6) doors.push(box(mid + dw / 2 + 0.45, 0.6, 2.42, y));
      }
    }
  }
  return { slabs, walls, piers, rails, plants, doors };
}

/** The lowest ground under a block's footprint (sampled every 2 m). */
function lowestGround(b) {
  let lo = Infinity;
  for (let x = b.x0; x <= b.x1 + 1e-6; x += Math.max(0.5, (b.x1 - b.x0) / Math.ceil((b.x1 - b.x0) / 2)))
    for (let z = b.z0; z <= b.z1 + 1e-6; z += Math.max(0.5, (b.z1 - b.z0) / Math.ceil((b.z1 - b.z0) / 2))) lo = Math.min(lo, groundY(x, z));
  return lo;
}

/** A plinth under a block that stands on a slope, down to the lowest ground under it (#142), or null. */
function plinth(b) {
  const foot = lowestGround(b);
  if (foot > b.base - 0.05) return null;
  return new THREE.BoxGeometry(b.x1 - b.x0, b.base - foot + 0.05, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, (foot + b.base) / 2, (b.z0 + b.z1) / 2);
}

/** Box with façade UVs: u along the wall in bays, v in storeys from the ground. */
function block(b) {
  const { bay, storey } = dims(b), h = b.storeys * storey;
  const geo = new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0);
  geo.translate((b.x0 + b.x1) / 2, b.base + h / 2, (b.z0 + b.z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, along / bay, (p.getY(i) - b.base) / storey);
  }
  return geo;
}

/** Low hip roof (Å-husen: flat-looking, the plans draw the hips). */
function hipRoof(b) {
  const ah = !b.style, o = ah ? S.hipRoof.overhang : 0.3; // the Å-husen's eaves sit on the metal edge (#258)
  const h = b.base + b.storeys * dims(b).storey + (ah ? 0.32 : 0);
  const x0 = b.x0 - o, x1 = b.x1 + o, z0 = b.z0 - o, z1 = b.z1 + o;
  const r = Math.min(x1 - x0, z1 - z0) / 2;
  const rise = ah ? S.hipRoof.rise : dims(b).roofPitch * r; // the Å-husen look nearly flat, the old ones are steep
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const [ra0, ra1] = x1 - x0 >= z1 - z0 ? [[x0 + r, cz], [x1 - r, cz]] : [[cx, z0 + r], [cx, z1 - r]];
  const v = (x, y, z) => [x, y, z];
  const A = v(x0, h, z0), B = v(x1, h, z0), C = v(x1, h, z1), Dd = v(x0, h, z1);
  const P = v(ra0[0], h + rise, ra0[1]), Q = v(ra1[0], h + rise, ra1[1]);
  // P is the ridge end nearer x0/z0
  const tris = x1 - x0 >= z1 - z0
    ? [[A, P, Q], [A, Q, B], [B, Q, C], [C, Q, P], [C, P, Dd], [Dd, P, A]]
    : [[A, P, B], [B, P, Q], [B, Q, C], [C, Q, Dd], [Dd, Q, P], [Dd, P, A]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(tris.length * 6).fill(0), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Gable roof along the block's long side. */
function roof(b) {
  if (b.roof === 'hip') return hipRoof(b);
  const h = b.base + b.storeys * dims(b).storey, alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const [a0, a1] = alongX ? [b.z0, b.z1] : [b.x0, b.x1];
  const len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
  const ridge = Math.min(4, (a1 - a0) * 0.35);
  const shape = new THREE.Shape([new THREE.Vector2(-a0 + 0.3, 0), new THREE.Vector2(-a1 - 0.3, 0), new THREE.Vector2(-(a0 + a1) / 2, ridge)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false });
  if (alongX) {
    geo.rotateY(Math.PI / 2); // (sx, sy, d) → (d, sy, −sx)
    geo.translate(b.x0 - 0.3, h, 0);
  } else {
    geo.scale(-1, 1, 1); // shape x = +x for blocks along z
    geo.translate(0, h, b.z0 - 0.3);
  }
  return geo; // ExtrudeGeometry is already non-indexed
}

function trees(rand) {
  // the trees the situation plan draws in the courtyard and the green (COURTYARD.trees), then the areas;
  // young street maples are slim, the big old trees by the school have broad crowns of several lobes (#130)
  const spots = COURTYARD.trees.map(([x, z]) => ({ x, z, y: groundY(x, z), s: 0.85 + rand() * 0.35, kind: 'tree' }));
  for (const area of S.treeAreas) {
    for (let i = 0; i < area.n; i++) {
      const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
      if (S.blocks.some((b) => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2)) continue;
      if (onRoad(x, z, 1)) continue;
      if (z > S.river.z0 - 2 && z < S.river.z1 + 2) continue;
      if (T.box.some((b) => Math.min(Math.abs(x - b.x0), Math.abs(x - b.x1)) < 1.5 && z > b.z0 && z < b.z1)) continue; // not on a retaining wall
      const birch = !area.young && rand() < S.birchShare; // slim birches with white trunks among the others (#115)
      spots.push({ x, z, y: groundY(x, z), s: area.young ? 0.8 + rand() * 0.25 : 0.75 + rand() * 0.6, kind: area.young ? 'young' : birch ? 'birch' : 'tree' });
    }
  }
  for (const [x, z, s] of S.bigTrees) spots.push({ x, z, y: groundY(x, z), s, kind: 'big' });
  for (const [x, z] of S.vergeTrees) spots.push({ x, z, y: groundY(x, z), s: 0.8 + rand() * 0.3, kind: 'tree' }); // by Karpvägen (#257)
  // crowns: one per tree, three to five lobes per big tree, an ellipsoid per young maple
  const lobes = [];
  const trunkM = [], birchM = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const t of spots) {
    const r = { r1: rand(), r2: rand(), r3: rand(), r4: rand() }; // one tree, one colour (seasons.js)
    if (t.kind === 'big') {
      const h = 4.6 * t.s;
      trunkM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(2.0 * t.s, h, 2.0 * t.s)));
      const n = 4 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.28 + rand() * 0.6, d = (k === 0 ? 0 : 1.9) * t.s;
        lobes.push({ pos: new THREE.Vector3(t.x + Math.cos(a) * d, t.y + h + (k === 0 ? 3.0 : 1.8 + rand() * 1.4) * t.s, t.z + Math.sin(a) * d),
          rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: new THREE.Vector3(3.0, 2.6, 3.0).multiplyScalar(t.s * (0.8 + rand() * 0.3)), ...r });
      }
    } else if (t.kind === 'birch') { // a tall white trunk, a narrow crown high up
      const h = 4.4 * t.s;
      birchM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(0.55 * t.s, h, 0.55 * t.s)));
      lobes.push({ pos: new THREE.Vector3(t.x, t.y + h + 1.2 * t.s, t.z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: new THREE.Vector3(1.4, 2.6, 1.4).multiplyScalar(t.s), ...r, r1: 0.75 + r.r1 * 0.25 }); // r1 high: they go yellow in autumn
    } else {
      const young = t.kind === 'young', h = (young ? 2.6 : 3.2) * t.s;
      trunkM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(young ? 0.6 * t.s : t.s, h, young ? 0.6 * t.s : t.s)));
      const sc = young ? new THREE.Vector3(1.3, 2.1, 1.3).multiplyScalar(t.s) : new THREE.Vector3(2.4, 2.6, 2.4).multiplyScalar(t.s);
      lobes.push({ pos: new THREE.Vector3(t.x, t.y + h + (young ? 1.7 : 1.6) * t.s, t.z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: sc, ...r });
    }
  }
  // ornamental shrubs along our pavement: small round bushes, coloured with the season like the trees
  const sh = S.shrubs;
  for (let x = sh.x0; x <= sh.x1; x += sh.step) {
    if (sh.gaps.some(([a, b]) => x > a && x < b)) continue;
    const s = 0.45 + rand() * 0.2;
    lobes.push({ pos: new THREE.Vector3(x + (rand() - 0.5) * 0.2, 0.42 * s / 0.55, sh.z + (rand() - 0.5) * 0.15), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)),
      scale: new THREE.Vector3(s * 1.2, s, s * 1.1), r1: 0.2 + rand() * 0.15, r2: 0.9, r3: 0.15 + rand() * 0.2, r4: 1 }); // one red-brown hedge; r2 high: some leaves stay; r4: no blossom
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 7).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), trunkM.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), lobes.length);
  trunkM.forEach((mm, i) => trunk.setMatrixAt(i, mm));
  const col = new THREE.Color();
  lobes.forEach((l, i) => { crown.setMatrixAt(i, m.compose(l.pos, l.rot, l.scale)); crown.setColorAt(i, col.setHSL(0.27, 0.45, 0.3)); });
  // colours and leaf cover come from the season (seasons.js); keep each tree's own variation
  registerTrees(crown, lobes);
  const birches = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.9 }), Math.max(1, birchM.length));
  birchM.forEach((mm, i) => birches.setMatrixAt(i, mm));
  birches.count = birchM.length;
  trunk.castShadow = crown.castShadow = birches.castShadow = true;
  return [trunk, birches, crown];
}

/** Sky for scene.background: vertical gradient with a few soft clouds (equirectangular). */
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5f97cf');
  grad.addColorStop(1, `#${COLORS.sky.toString(16).padStart(6, '0')}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = `#${COLORS.sky.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 256, 1024, 256);
  const rand = rng(5);
  for (let i = 0; i < 26; i++) {
    const cx = rand() * 1024, cy = 120 + rand() * 120, r = 18 + rand() * 40;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * r * 2.5, y = cy + (rand() - 0.5) * r * 0.5, rr = r * (0.6 + rand() * 0.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.75)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Clouds only (alpha), equirectangular, for the day-cycle sky shader (row 0 = straight up). */
export function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const rand = rng(5);
  for (let i = 0; i < 30; i++) {
    const cx = rand() * 1024, cy = 110 + rand() * 130, r = 18 + rand() * 40;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * r * 2.5, y = cy + (rand() - 0.5) * r * 0.5, rr = r * (0.6 + rand() * 0.6);
      for (const xx of [x, x - 1024, x + 1024]) { // wrap around
        const rg = g.createRadialGradient(xx, y, 0, xx, y, rr);
        rg.addColorStop(0, 'rgba(255,255,255,0.8)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.fillRect(xx - rr, y - rr, rr * 2, rr * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  // no mipmaps: the atan() seam in the sky shader would pick the smallest mip there (a dashed line)
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Lit windows in the neighbouring blocks: one additive quad per window (instanced), each with
 * its own evening routine, so windows light up and go dark one by one as the day passes.
 */
export function buildWindowLights() {
  const spots = [];
  for (const b of S.blocks) {
    const faces = [
      { along: 'x', c: b.z0 - 0.03, a0: b.x0, a1: b.x1, n: [0, -1], f: 'n' }, { along: 'x', c: b.z1 + 0.03, a0: b.x0, a1: b.x1, n: [0, 1], f: 's' },
      { along: 'z', c: b.x0 - 0.03, a0: b.z0, a1: b.z1, n: [-1, 0], f: 'w' }, { along: 'z', c: b.x1 + 0.03, a0: b.z0, a1: b.z1, n: [1, 0], f: 'e' },
    ];
    for (const f of faces) {
      // window centres sit mid-bay in the façade texture (u = along / bay)
      const { bay, storey } = dims(b), old = b.style === 'old';
      // window rows: one per storey (the old windows are narrow and tall), or the school's own two (#126)
      const rows = dims(b).rows ? dims(b).rows.map((r) => ({ y: b.base + r.y, s: r.s }))
        : [...Array(b.storeys)].map((_, st) => ({ y: b.base + st * storey + (old ? 1.9 : 1.55), s: old ? [0.78, 1.3, 1] : [1, 1, 1], st }));
      for (let k = Math.ceil(f.a0 / bay - 0.5); (k + 0.5) * bay < f.a1; k++) {
        const a = (k + 0.5) * bay;
        if (a - 0.7 < f.a0 || a + 0.7 > f.a1) continue;
        const [px, pz] = f.along === 'x' ? [a, f.c] : [f.c, a];
        if (b.style === 'school' && S.blocks.some((o) => o !== b && o.style === 'school' && px > o.x0 && px < o.x1 && pz > o.z0 && pz < o.z1)) continue; // inside a pavilion
        for (const { y, s, st } of rows) {
          if (b.corners && inCut(b, f.f, a - 0.95, a + 0.95, st)) continue; // a loggia or an entrance recess there (#145, #258)
          if (y < groundY(f.along === 'x' ? a : f.c, f.along === 'x' ? f.c : a) + 0.8) continue; // below the ground
          spots.push(f.along === 'x' ? { x: a, y, z: f.c, n: f.n, s } : { x: f.c, y, z: a, n: f.n, s });
        }
      }
    }
  }
  const geo = new THREE.PlaneGeometry(1.25, 1.45);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); // fog would add its colour to black (unlit) quads
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const rand = rng(17);
  const habits = spots.map((p, i) => {
    q.setFromAxisAngle(up, Math.atan2(p.n[0], p.n[1]));
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one.set(...p.s)));
    mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    const home = rand() > 0.2; // some flats are empty tonight
    return {
      home,
      on: 15.5 + rand() * 4, off: 21 + rand() * 3.5, // evening
      early: rand() < 0.4, wake: 5.5 + rand() * 1.5, leave: 7 + rand() * 1.5, // morning
      tint: rand(), // warm … cool (TV)
    };
  });
  const col = new THREE.Color();
  let last = -1;
  return {
    object: mesh,
    /** hour 0–24, night 0 (day) … 1 (night): switch windows as their routines say. */
    update(hour, night) {
      if (Math.abs(hour - last) < 0.05 && last >= 0) return;
      last = hour;
      habits.forEach((h, i) => {
        const lit = h.home && ((hour > h.on && hour < h.off) || (h.off > 24 && hour < h.off - 24) || (h.early && hour > h.wake && hour < h.leave));
        const k = lit ? 0.25 + 0.75 * night : 0;
        col.setRGB(1.0 * k, (0.78 + 0.12 * h.tint) * k, (0.5 + 0.45 * h.tint) * k);
        mesh.setColorAt(i, col);
      });
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

/** Horizontal strip that follows the ground (its height at the strip's centre line in x). */
function groundStrip(x0, x1, z0, z1, lift) {
  const cx = (x0 + x1) / 2;
  const cuts = [z0, z1, T.north, T.north + T.slope, ...E.profile.map((p) => p[0]), ...T.box.flatMap((b) => [b.z0, b.z1])];
  for (let z = Math.ceil(z0); z < z1; z += 2) cuts.push(z);
  const zs = [...new Set(cuts)].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
  const pos = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-3) continue;
    const ya = groundY(cx, za + 1e-3) + lift, yb = groundY(cx, zb - 1e-3) + lift;
    pos.push(x0, ya, za, x0, yb, zb, x1, ya, za, x1, ya, za, x0, yb, zb, x1, yb, zb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.computeVertexNormals();
  return geo;
}

export function buildSurroundings({ grass }) {
  const group = new THREE.Group();
  const flat = (geos, color, snow) => {
    const mat = color.isMaterial ? color : new THREE.MeshStandardMaterial({ color, roughness: 1 });
    if (snow) registerSnow(mat, snow);
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  // the ground south of Hus L: the raised courtyard on the garage box and the park level around it (the
  // street side north of Hus L is world.js's ground); retaining walls, railings and the garage door
  flat([terrainGeometry()], grass, SEASON.snow.ground);
  const bw = boxWalls();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.95, side: THREE.DoubleSide });
  flat(bw.walls, new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95, side: THREE.DoubleSide })); // brick retaining walls (#148)
  const lightRail = new THREE.MeshStandardMaterial({ color: 0xb9bdbd, roughness: 0.5, metalness: 0.3 });
  flat([...bw.rails, ...bw.stairs.rails.map((g) => g.toNonIndexed())].map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }), lightRail);
  group.add(new THREE.Mesh(mergeGeometries(bw.slats.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 })));
  flat(bw.stairs.solid, concrete, SEASON.snow.paving); // the stairs down to the park level (#148, #254)
  flat(T.stairs.filter((St) => St.walk).map((St) => groundStrip(St.walk.x0, St.walk.x1, St.walk.z0, St.walk.z1, 0.01)), COLORS.paving); // from a stair's foot on
  group.userData.segments = bw.segments; // the box edge: collision for the courtyard (world.js)
  flat(bw.door, new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.8, side: THREE.DoubleSide }));
  // roads (#257, src/roads.js): rectangles, centre lines with rounded corners, fillets at the junctions
  const gd = T.garageDoor; // + the drive from Karpvägen to the garage door (#254)
  const asphalt = [...S.roads, { x0: gd.drive, x1: gd.x + 0.05, z0: gd.z0 - 0.5, z1: gd.z1 + 0.5 }].flatMap((r) => r.path ? [pathStrip(r, (w) => -w / 2, (w) => w / 2, 0.012, groundY)]
    : r.fillets ? r.fillets.map((f) => filletGeometry(f, 0.012, groundY)) : [groundStrip(r.x0, r.x1, r.z0, r.z1, 0.012)]);
  flat(asphalt, new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.7 }), 0xd9dfe4); // ploughed, a little grey; damp (#128)
  // pavements along the roads (left out where they would lie on another road's asphalt: a junction's mouth)
  const walks = S.roads.flatMap((r) => (r.walks || []).map((k) => k.side > 0
    ? pathStrip(r, (w) => w / 2, (w) => w / 2 + k.w, 0.008, groundY, true) : pathStrip(r, (w) => -w / 2 - k.w, (w) => -w / 2, 0.008, groundY, true)));
  flat([...S.paving.map((r) => groundStrip(r.x0, r.x1, r.z0, r.z1, 0.008)), ...walks], COLORS.paving, SEASON.snow.paving);
  flat([groundStrip(S.river.x0, S.river.x1, S.river.z0, S.river.z1, 0.02)],
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.15, metalness: 0.2 }));
  // Kv. Lunden's own blocks and the old S:t Lars buildings: own façade texture and roof colour each,
  // plus a white cornice under the old roofs (#47)
  const modern = S.blocks.filter((b) => !b.style), oldB = S.blocks.filter((b) => b.style === 'old'), school = S.blocks.filter((b) => b.style === 'school');
  const side = (st) => S.blocks.filter((b) => b.style === st);
  const mesh = (geos, material, snow) => {
    if (snow) registerSnow(material, snow);
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.receiveShadow = true;
    group.add(m);
  };
  const lg = loggias(modern); // corner loggias and entrances (#145, #258)
  mesh([...modern.flatMap(aHouse), ...lg.piers], new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.95 }));
  const white = new THREE.MeshStandardMaterial({ color: 0xf0efeb, roughness: 0.85, side: THREE.DoubleSide });
  mesh([...lg.slabs.map((g) => g.toNonIndexed()), ...lg.walls.map((g) => g.toNonIndexed())].map((g) => { g.deleteAttribute('uv'); return g; }), white);
  const railMesh = new THREE.Mesh(mergeGeometries(lg.rails.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
  group.add(railMesh);
  if (lg.plants.length) mesh(lg.plants.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }), new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.9, flatShading: true }));
  if (lg.doors.length) mesh(lg.doors.map((g) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.25, metalness: 0.35 })); // glazed entrance doors (#258)
  // low hip roofs of roofing felt (#258; Peab's aerial render, Q&A) over the light metal edge, a few vent hoods along the ridge
  mesh(modern.flatMap((b) => {
    const o = S.hipRoof.overhang, eave = b.base + b.storeys * S.storey + 0.32, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = rng(Math.round(b.x0 * 7 + b.z0 * 13));
    const hx = (b.x1 - b.x0) / 2 + o, hz = (b.z1 - b.z0) / 2 + o, k = S.hipRoof.rise / Math.min(hx, hz);
    const roofY = (x, z) => eave + k * Math.min(hx - Math.abs(x - cx), hz - Math.abs(z - cz)); // on the hip roof
    const geos = [hipRoof(b)];
    for (let i = 0; i < 5; i++) {
      const s2 = 0.6 + r() * 0.9, hgt = 0.5 + r() * 0.7, x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * Math.max(2, 2 * (hz - hx) + 2);
      geos.push(new THREE.BoxGeometry(s2, hgt, s2 * (0.7 + r() * 0.6)).translate(x, roofY(x, z) - 0.15 + hgt / 2, z).toNonIndexed());
    }
    return geos.map((g) => { g.deleteAttribute('uv'); return g; });
  }), new THREE.MeshStandardMaterial({ color: 0x6d7175, roughness: 0.9, side: THREE.DoubleSide }), SEASON.snow.roof);
  // details (#109, #146): a light grey metal edge round the flat roofs, grey downpipes at the corners and every ~12 m
  mesh(modern.map((b) => {
    const h = b.base + b.storeys * S.storey, o = 0.32;
    return new THREE.BoxGeometry(b.x1 - b.x0 + 2 * o, 0.42, b.z1 - b.z0 + 2 * o).translate((b.x0 + b.x1) / 2, h + 0.1, (b.z0 + b.z1) / 2);
  }), new THREE.MeshStandardMaterial({ color: 0xc7cacb, roughness: 0.45, metalness: 0.2 })); // light grey sheet metal (#146)
  const pipes = [];
  for (const b of modern) {
    const h = b.storeys * S.storey, y = b.base + h / 2;
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x + Math.sign((b.x0 + b.x1) / 2 - x) * 0.35, y, z + Math.sign((b.z0 + b.z1) / 2 - z) * -0.07));
    // (none in front of a loggia or a recess, #258)
    for (const [z, sgn, f] of [[b.z0, -1, 'n'], [b.z1, 1, 's']]) for (let x = b.x0 + 12; x < b.x1 - 4; x += 12) if (!inCut(b, f, x - 0.1, x + 0.1)) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x, y, z + sgn * 0.07));
    for (const [x, sgn, f] of [[b.x0, -1, 'w'], [b.x1, 1, 'e']]) for (let z = b.z0 + 12; z < b.z1 - 4; z += 12) if (!inCut(b, f, z - 0.1, z + 0.1)) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x + sgn * 0.07, y, z));
  }
  mesh(pipes, new THREE.MeshStandardMaterial({ color: 0x8f9396, roughness: 0.5, metalness: 0.3 }));
  if (school.length) { // the school across the street, its wall and greenhouse (#126)
    const white = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.8 });
    mesh(school.map(block), new THREE.MeshStandardMaterial({ map: schoolFacadeTexture(), roughness: 0.95 }));
    mesh(school.map(roof), new THREE.MeshStandardMaterial({ color: 0x5c6369, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }), SEASON.snow.roof);
    mesh(school.flatMap((b) => [...quoins(b, S.school.storey), new THREE.BoxGeometry(b.x1 - b.x0 + 0.36, 0.32, b.z1 - b.z0 + 0.36)
      .translate((b.x0 + b.x1) / 2, b.base + S.school.storey - 0.16, (b.z0 + b.z1) / 2)]), white); // quoins + cornice
    const sg = schoolGrounds();
    mesh(sg.wall, new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 }));
    mesh(sg.coping, new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.5, metalness: 0.3 }), SEASON.snow.roof);
    mesh(sg.frame, new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.4 }));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const gm = new THREE.Mesh(mergeGeometries(sg.panes), glassMat);
    group.add(gm);
  }
  if (side('hepcat').length) { // HepCat Store and the long brick building behind it (#127)
    const metal = new THREE.MeshStandardMaterial({ color: 0x737a81, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }); // standing-seam grey
    for (const st of ['hepcat', 'hepcatWhite', 'longhouse']) mesh(side(st).map(block), new THREE.MeshStandardMaterial({ map: sideFacadeTexture(st), roughness: 0.95 }));
    mesh([...['hepcat', 'hepcatWhite', 'longhouse'].flatMap((st) => side(st).map(roof)), ...dormers(side('longhouse'))], metal, SEASON.snow.roof);
    mesh(side('hepcat').flatMap((b) => (b.chimneys ?? []).map((dz) => new THREE.BoxGeometry(0.6, 1.4, 0.6).translate((b.x0 + b.x1) / 2, b.base + S.hepcat.storey + 2.3, (b.z0 + b.z1) / 2 + dz))),
      new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.8 }));
  }
  if (oldB.length) {
    mesh(oldB.map(block), new THREE.MeshStandardMaterial({ map: oldFacadeTexture(), roughness: 0.95 }));
    mesh(oldB.map(roof), new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }), SEASON.snow.roof);
    mesh(oldB.map((b) => {
      const h = b.base + b.storeys * S.old.storey, o = 0.18;
      const g = new THREE.BoxGeometry(b.x1 - b.x0 + 2 * o, 0.32, b.z1 - b.z0 + 2 * o);
      return g.translate((b.x0 + b.x1) / 2, h - 0.16, (b.z0 + b.z1) / 2);
    }), new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.8 }));
  }
  // blocks on the slope south of Hus L stand on a plinth down to the ground (#142)
  const plinths = S.blocks.map(plinth).filter(Boolean);
  if (plinths.length) mesh(plinths, new THREE.MeshStandardMaterial({ color: 0x6e3326, roughness: 0.95 }));
  group.add(...trees(rng(3)));
  const windows = buildWindowLights(), street = buildStreet(groundY); // street lamps, crossing, curbs … (#128)
  group.add(windows.object, street.object);
  group.userData.windows = { object: windows.object, update(hour, night) { windows.update(hour, night); street.update(night); } };
  return group;
}
