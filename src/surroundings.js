import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE as S, COLORS, SEASON, COURTYARD } from './config.js';
import { registerTrees, registerSnow } from './seasons.js';

// The rest of Kv. Lunden and its neighbourhood (SITE in config): the brick point blocks Hus A, B, C
// with low hip roofs, the schools and buildings around the plot, Sankt Lars väg and Karpvägen,
// the courtyard walks, the 3 m drop to S:t Lars park, trees and Höje å, plus a sky with clouds.
// Everything is merged/instanced: a handful of draw calls.

const T = S.terrain;
/** On the garage box (the raised courtyard)? */
const onBox = (x, z) => T.box.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
/** Ground height at plan (x, z): the street / courtyard level north of Hus L and on the garage box,
 * the park level around the box (reached over T.slope m south of Hus L). */
export function groundY(x, z) {
  if (z <= T.north || onBox(x, z)) return 0;
  return T.park * THREE.MathUtils.clamp((z - T.north) / T.slope, 0, 1);
}

/** Terrain south of Hus L: a grid with lines on every box edge, so the step at the edges is vertical. */
function terrainGeometry() {
  const xs = new Set([-200, 200]), zs = new Set([T.north, 260, T.north + T.slope]);
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    g.computeVertexNormals();
    return g;
  };
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
      if (y0 > -0.05 && y1 > -0.05) continue; // no step here
      // the walls stand 4 cm outside the box edge, in front of the terrain's own (grass) step
      const wx0 = x0 + ox * 0.04, wz0 = z0 + oz * 0.04, wx1 = x1 + ox * 0.04, wz1 = z1 + oz * 0.04;
      const atDoor = ox < 0 && Math.abs(x0 - T.garageDoor.x) < 0.1 && (z0 + z1) / 2 > T.garageDoor.z0 && (z0 + z1) / 2 < T.garageDoor.z1;
      if (atDoor) { // the garage door: a dark opening with a grey roller door frame
        door.push(quad(wx0 + ox * 0.01, wz0, wx1 + ox * 0.01, wz1, y0, y1));
        walls.push(quad(wx0 + ox * 0.02, wz0, wx1 + ox * 0.02, wz1, y0 + T.garageDoor.h, y1 + T.garageDoor.h));
        continue;
      }
      walls.push(quad(wx0, wz0, wx1, wz1, y0, y1));
      // coping + a railing (posts every metre, a top rail) on the courtyard side
      const cop = new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.3 * Math.abs(oz), 0.06, Math.abs(z1 - z0) + 0.3 * Math.abs(ox));
      rails.push(cop.translate((x0 + x1) / 2, 0.15, (z0 + z1) / 2));
      rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(x0 - ox * 0.08, 0.6, z0 - oz * 0.08));
      rails.push(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.04, 0.04, Math.abs(z1 - z0) + 0.04).translate((x0 + x1) / 2 - ox * 0.08, 1.06, (z0 + z1) / 2 - oz * 0.08));
    }
  }
  return { walls, rails, door };
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Bay width and storey height of a block (the old S:t Lars buildings are taller, narrower bays). */
const dims = (b) => (b.style === 'old' ? S.old : S);

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
  // window: 1.3 × 1.5 m, sill 0.8 m above the storey floor (v = 0 is the bottom of the canvas)
  const ww = 1.3 * m, wh = 1.5 * m, wx = (px - ww) / 2, wy = px - (0.8 * m + wh);
  g.fillStyle = '#f2f2ef';
  g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#5d7486');
  glass.addColorStop(1, '#2c3a45');
  g.fillStyle = glass;
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#f2f2ef';
  g.fillRect(wx + ww / 2 - 3, wy, 6, wh);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
  const h = b.base + b.storeys * dims(b).storey, o = 0.3;
  const x0 = b.x0 - o, x1 = b.x1 + o, z0 = b.z0 - o, z1 = b.z1 + o;
  const r = Math.min(x1 - x0, z1 - z0) / 2;
  const rise = b.style === 'old' ? S.old.roofPitch * r : 1.4; // the Å-husen look flat, the old ones are steep
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
  // the trees the situation plan draws in the courtyard and the green (COURTYARD.trees), then the areas
  const spots = COURTYARD.trees.map(([x, z]) => ({ x, z, y: groundY(x, z), s: 0.85 + rand() * 0.35 }));
  for (const area of S.treeAreas) {
    for (let i = 0; i < area.n; i++) {
      const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
      if (S.blocks.some((b) => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2)) continue;
      if (S.roads.some((r) => x > r.x0 - 1 && x < r.x1 + 1 && z > r.z0 - 1 && z < r.z1 + 1)) continue;
      if (z > S.river.z0 - 2 && z < S.river.z1 + 2) continue;
      if (T.box.some((b) => Math.min(Math.abs(x - b.x0), Math.abs(x - b.x1)) < 1.5 && z > b.z0 && z < b.z1)) continue; // not on a retaining wall
      spots.push({ x, z, y: groundY(x, z), s: 0.75 + rand() * 0.6 });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 7).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), spots.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), seeds = [];
  spots.forEach((t, i) => {
    const h = 3.2 * t.s;
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, h, t.s));
    trunk.setMatrixAt(i, m);
    q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
    m.compose(new THREE.Vector3(t.x, t.y + h + 1.6 * t.s, t.z), q, new THREE.Vector3(2.4 * t.s, 2.6 * t.s, 2.4 * t.s));
    crown.setMatrixAt(i, m);
    // colours and leaf cover come from the season (seasons.js); keep each tree's own variation
    seeds.push({ pos: new THREE.Vector3(t.x, t.y + h + 1.6 * t.s, t.z), rot: q.clone(), scale: new THREE.Vector3(2.4 * t.s, 2.6 * t.s, 2.4 * t.s),
      r1: rand(), r2: rand(), r3: rand(), r4: rand() });
    crown.setColorAt(i, col.setHSL(0.27, 0.45, 0.3));
  });
  registerTrees(crown, seeds);
  trunk.castShadow = crown.castShadow = true;
  return [trunk, crown];
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
      { along: 'x', c: b.z0 - 0.03, a0: b.x0, a1: b.x1, n: [0, -1] }, { along: 'x', c: b.z1 + 0.03, a0: b.x0, a1: b.x1, n: [0, 1] },
      { along: 'z', c: b.x0 - 0.03, a0: b.z0, a1: b.z1, n: [-1, 0] }, { along: 'z', c: b.x1 + 0.03, a0: b.z0, a1: b.z1, n: [1, 0] },
    ];
    for (const f of faces) {
      // window centres sit mid-bay in the façade texture (u = along / bay)
      const { bay, storey } = dims(b), old = b.style === 'old';
      for (let k = Math.ceil(f.a0 / bay - 0.5); (k + 0.5) * bay < f.a1; k++) {
        const a = (k + 0.5) * bay;
        if (a - 0.7 < f.a0 || a + 0.7 > f.a1) continue;
        for (let st = 0; st < b.storeys; st++) {
          const y = b.base + st * storey + (old ? 1.9 : 1.55);
          if (y < groundY(f.along === 'x' ? a : f.c, f.along === 'x' ? f.c : a) + 0.8) continue; // below the ground
          const s = old ? [0.78, 1.3, 1] : [1, 1, 1]; // the old windows are narrow and tall
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
  const cuts = [z0, z1, T.north, T.north + T.slope, ...T.box.flatMap((b) => [b.z0, b.z1])];
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
  flat(bw.walls, concrete);
  flat(bw.rails, new THREE.MeshStandardMaterial({ color: 0x3b3e41, roughness: 0.5, metalness: 0.4 }));
  flat(bw.door, new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.8, side: THREE.DoubleSide }));
  flat(S.roads.map((r) => groundStrip(r.x0, r.x1, r.z0, r.z1, 0.012)), COLORS.asphalt, 0xd9dfe4); // ploughed, a little grey
  flat(S.paving.map((r) => groundStrip(r.x0, r.x1, r.z0, r.z1, 0.008)), COLORS.paving, SEASON.snow.paving);
  flat([groundStrip(S.river.x0, S.river.x1, S.river.z0, S.river.z1, 0.02)],
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.15, metalness: 0.2 }));
  // Kv. Lunden's own blocks and the old S:t Lars buildings: own façade texture and roof colour each,
  // plus a white cornice under the old roofs (#47)
  const modern = S.blocks.filter((b) => b.style !== 'old'), oldB = S.blocks.filter((b) => b.style === 'old');
  const mesh = (geos, material, snow) => {
    if (snow) registerSnow(material, snow);
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.receiveShadow = true;
    group.add(m);
  };
  mesh(modern.map(block), new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.95 }));
  mesh(modern.map(roof), new THREE.MeshStandardMaterial({ color: 0x51575c, roughness: 0.85, side: THREE.DoubleSide }), SEASON.snow.roof);
  if (oldB.length) {
    mesh(oldB.map(block), new THREE.MeshStandardMaterial({ map: oldFacadeTexture(), roughness: 0.95 }));
    mesh(oldB.map(roof), new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }), SEASON.snow.roof);
    mesh(oldB.map((b) => {
      const h = b.base + b.storeys * S.old.storey, o = 0.18;
      const g = new THREE.BoxGeometry(b.x1 - b.x0 + 2 * o, 0.32, b.z1 - b.z0 + 2 * o);
      return g.translate((b.x0 + b.x1) / 2, h - 0.16, (b.z0 + b.z1) / 2);
    }), new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.8 }));
  }
  group.add(...trees(rng(3)));
  group.userData.windows = buildWindowLights();
  group.add(group.userData.windows.object);
  return group;
}
