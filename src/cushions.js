import * as THREE from 'three';
import { CUSHIONS as C } from './config.js';

// Decorative cushions and the waffle throw (#278). All cushions share one material: an atlas texture (leaf print |
// waffle | plain weave) tinted by vertex colours, so a sofa's cushions merge into one mesh (one draw call). The throws
// share one waffle material that repeats in metres.

const COLS = 3; // atlas columns: 0 = leaf print, 1 = waffle, 2 = plain
const COL = { print: 0, waffle: 1, plain: 2 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** One waffle cell pattern into a square of `n` px with `cells` cells: raised squares, darker grooves. */
function drawWaffle(ctx, x0, n, cells, bump) {
  const c = n / cells;
  ctx.fillStyle = bump ? '#202020' : '#bdbdbd';
  ctx.fillRect(x0, 0, n, n);
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const g = ctx.createRadialGradient(x0 + (i + 0.5) * c, (j + 0.5) * c, c * 0.05, x0 + (i + 0.5) * c, (j + 0.5) * c, c * 0.62);
    g.addColorStop(0, bump ? '#ffffff' : '#ffffff');
    g.addColorStop(0.7, bump ? '#b0b0b0' : '#f0f0f0');
    g.addColorStop(1, bump ? '#303030' : '#d2d2d2');
    ctx.fillStyle = g;
    const p = c * 0.1;
    ctx.beginPath(); ctx.roundRect(x0 + i * c + p, j * c + p, c - 2 * p, c - 2 * p, c * 0.3); ctx.fill();
  }
}

let atlas = null;
function cushionMaterial() {
  if (atlas) return atlas;
  const n = 256, cv = document.createElement('canvas'), bv = document.createElement('canvas');
  cv.width = bv.width = n * COLS; cv.height = bv.height = n;
  const ctx = cv.getContext('2d'), bx = bv.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, n * COLS, n);
  // leaf print: big leaves and petals in dusty reds, sage, pale blue and dark green on white (the user's photo)
  ctx.fillStyle = C.print.ground; ctx.fillRect(0, 0, n, n);
  const r = rng(7);
  for (let k = 0; k < 26; k++) {
    const x = r() * n, y = r() * n, len = 30 + r() * 60, wid = len * (0.25 + r() * 0.2), a = r() * Math.PI * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = C.print.colors[Math.floor(r() * C.print.colors.length)];
    ctx.beginPath(); ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -wid, len / 2, 0); ctx.quadraticCurveTo(0, wid, -len / 2, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,30,0.45)'; ctx.lineWidth = 1.5; // a vein / outline like the print's ink lines
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -wid * 0.15, len / 2, 0); ctx.stroke();
    ctx.restore();
  }
  // waffle (grey: the vertex colour tints it), and its bump
  drawWaffle(ctx, n, n, 14, false);
  drawWaffle(bx, n, n, 14, true);
  // plain weave: near-white with a faint cross-hatch
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(2 * n, 0, n, n);
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i < n; i += 3) {
    ctx.beginPath(); ctx.moveTo(2 * n + i, 0); ctx.lineTo(2 * n + i, n); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2 * n, i); ctx.lineTo(3 * n, i); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  atlas = new THREE.MeshStandardMaterial({ map, bumpMap: new THREE.CanvasTexture(bv), bumpScale: 1.5, vertexColors: true, roughness: 0.96 });
  return atlas;
}

let throwMat = null;
/** The grey waffle knit of the throws, repeating every 4 cells (UVs in metres / (4 × cell)). */
export function throwMaterial() {
  if (throwMat) return throwMat;
  const n = 128, cv = document.createElement('canvas'), bv = document.createElement('canvas');
  cv.width = cv.height = bv.width = bv.height = n;
  drawWaffle(cv.getContext('2d'), 0, n, 4, false);
  drawWaffle(bv.getContext('2d'), 0, n, 4, true);
  const map = new THREE.CanvasTexture(cv), bump = new THREE.CanvasTexture(bv);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  throwMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2, color: C.waffle.color, roughness: 1, side: THREE.DoubleSide });
  return throwMat;
}

/**
 * A plump cushion `s` × `s`, `t` thick at the middle, facing ±z: a subdivided box whose faces puff out and whose edges
 * close to a seam, the edge middles drawn in so the corners stick out; `crumple` dents it a little.
 */
function cushionGeometry(s, t, kind, color, crumple, seed) {
  const g = new THREE.BoxGeometry(2, 2, 2, 12, 12, 2);
  const p = g.attributes.position, uv = g.attributes.uv, r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = p.getY(i), c = p.getZ(i);
    const f = Math.sqrt(Math.max(0, (1 - a * a) * (1 - b * b)));          // 0 at the seam, 1 in the middle
    const dent = crumple * f * 0.35 * (Math.sin(a * 3.1 + ph[0]) * Math.sin(b * 2.7 + ph[1]) + 0.5 * Math.sin(a * 5.3 + b * 4.1 + ph[2]));
    const sag = crumple * 0.04 * Math.sin(a * 4 + b * 3 + ph[3]);       // the edges wave a little
    p.setXYZ(i, a * s / 2 * (1 - 0.08 * (1 - b * b)), b * s / 2 * (1 - 0.08 * (1 - a * a)), (c * f * (1 + dent) * t) / 2 + sag * s * (1 - f));
  }
  // atlas column, and a tint per vertex
  const col = COL[kind] ?? 2;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (col + 0.02 + uv.getX(i) * 0.96) / COLS);
  const tint = new THREE.Color(kind === 'print' ? 0xffffff : color);
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { cols[i * 3] = tint.r; cols[i * 3 + 1] = tint.g; cols[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Cushions leaning against a seat's back (#278): `list` from CUSHIONS, `backZ` = local z of the back cushion's front at
 * seat level, `seatY` = the seat's top. Added to `g` as plain meshes (merged per material with the rest of the piece).
 */
export function addCushions(g, list, { backZ, seatY }) {
  const mat = cushionMaterial();
  list.forEach((c, i) => {
    const s = c.size ?? C.size, t = C.thick * (c.size ? c.size / C.size : 1);
    const m = new THREE.Mesh(cushionGeometry(s, t, c.kind, c.color, c.crumple ?? 0.3, 11 + i * 17), mat);
    // stand it up, lean it back, turn it; its bottom edge on the seat, its back against the back cushion
    m.rotation.set(-c.lean, c.yaw, 0, 'YXZ');
    m.position.set(c.x, seatY - 0.02 + (s / 2) * Math.cos(c.lean) * 0.96, backZ + c.z);
    m.castShadow = m.receiveShadow = true;
    m.userData.cushion = true;
    g.add(m);
  });
}

/** A throw folded into a neat soft slab: `layers` rounded sheets stacked, the top one a little short (the fold). */
export function addFoldedThrow(g, { w, d, layer, layers, x, z, y, yaw }) {
  const mat = throwMaterial(), per = 4 * C.waffle.cell;
  for (let k = 0; k < layers; k++) {
    const sh = new THREE.BoxGeometry(w - k * 0.01, layer, d - (k === layers - 1 ? 0.04 : 0), 8, 1, 6);
    const p = sh.attributes.position, uv = sh.attributes.uv, nx = sh.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), u = (px / (w / 2)) ** 2, v = (pz / (d / 2)) ** 2;
      p.setY(i, p.getY(i) * (1 - 0.35 * Math.max(u, v) ** 4) + 0.004 * Math.sin(px * 30 + k));
      // planar UVs in metres: the top/bottom from above, the sides along their length
      const side = Math.abs(nx.getX(i)) > 0.5 ? pz : px;
      uv.setXY(i, (Math.abs(nx.getY(i)) > 0.5 ? px : side) / per, (Math.abs(nx.getY(i)) > 0.5 ? pz : p.getY(i) + k * layer) / per);
    }
    sh.computeVertexNormals();
    const m = new THREE.Mesh(sh, mat);
    m.position.set(x, y + layer * (k + 0.5), z + (k === layers - 1 ? 0.02 : 0));
    m.rotation.y = yaw;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
}

/**
 * A throw draped over an arm: a cross-section path `pts` ([x, y] pairs, local, from the hanging edge outside over the
 * arm to the end lying on the seat), swept along z from `z0` to `z1`, with soft folds. One double-sided sheet.
 */
export function addDrapedThrow(g, pts, z0, z1, seed = 3) {
  // resample the path evenly
  const path = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(path), N = 40, M = 18, len = curve.getLength(), per = 4 * C.waffle.cell;
  const r = rng(seed), ph = [r() * 6, r() * 6, r() * 6];
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, q = curve.getPointAt(s), tan = curve.getTangentAt(s), n = new THREE.Vector2(-tan.y, tan.x);
    for (let j = 0; j <= M; j++) {
      const v = j / M;
      // folds: ripples along the sheet that grow towards the free ends, the edges flaring a little
      const free = Math.min(1, Math.abs(s - 0.35) * 2.2);
      const w = 0.012 + 0.012 * Math.sin(v * 9 + s * 3 + ph[0]) * free + 0.01 * Math.sin(v * 21 + ph[1]) * free + 0.006 * Math.sin(s * 30 + ph[2]);
      const zz = z0 + (z1 - z0) * v + 0.025 * free * Math.sin(s * 5 + ph[1]) * (v - 0.5);
      pos.push(q.x + n.x * w, q.y + n.y * w, zz);
      uvs.push((s * len) / per, (zz - z0) / per);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, throwMaterial());
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
