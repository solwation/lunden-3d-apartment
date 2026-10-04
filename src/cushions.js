import * as THREE from 'three';
import { CUSHIONS as C } from './config.js';

// Decorative cushions and the ribbed fleece throws (#278, #313). All cushions share one material: an atlas texture
// (leaf print | bobble knit | geometric patchwork | corduroy | the patio's outdoor weave and striped weave, #399)
// tinted by vertex colours, so a sofa's cushions merge into one mesh (one draw call). Each throw colour has its own fleece material that repeats in metres.

const COLS = 6; // atlas columns: 0 = leaf print, 1 = bobble knit, 2 = geometric, 3 = corduroy, 4 = outdoor weave, 5 = striped weave
const COL = { print: 0, knit: 1, geo: 2, cord: 3, weave: 4, stripe: 5 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The bobble knit: raised rectangular knobs (a little taller than wide) in a grid, deep grooves between. */
function drawKnit(ctx, x0, n, cells, bump) {
  const c = n / cells;
  ctx.fillStyle = bump ? '#101010' : '#ffffff'; // the grooves show the lighter yarn between the knobs
  ctx.fillRect(x0, 0, n, n);
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const cx = x0 + (i + 0.5) * c, cy = (j + 0.5) * c;
    const g = ctx.createRadialGradient(cx - c * 0.08, cy - c * 0.1, c * 0.04, cx, cy, c * 0.5);
    g.addColorStop(0, bump ? '#ffffff' : '#a8a8a8');
    g.addColorStop(0.6, bump ? '#c0c0c0' : '#8c8c8c');
    g.addColorStop(1, bump ? '#404040' : '#6a6a6a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(cx - c * 0.36, cy - c * 0.42, c * 0.72, c * 0.84, c * 0.25); ctx.fill();
  }
}

/** The geometric patchwork: squares whose corners are cut by diamonds at every grid point → octagons and diamonds,
 * each octagon halved along a diagonal into two shades; a faint weave over it all. */
function drawGeo(ctx, x0, n) {
  const k = 3, c = n / k, col = C.geo.colors, r = rng(31);
  const pick = (not) => { let v; do v = col[Math.floor(r() * col.length)]; while (v === not); return v; };
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, 0, n, n); ctx.clip();
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const x = x0 + i * c, y = j * c, a = pick(), b = pick(a);
    // two triangles (diagonal alternating per cell)
    const flip = (i + j) % 2 === 0;
    ctx.fillStyle = a; ctx.beginPath();
    if (flip) { ctx.moveTo(x, y); ctx.lineTo(x + c, y); ctx.lineTo(x, y + c); } else { ctx.moveTo(x, y); ctx.lineTo(x + c, y); ctx.lineTo(x + c, y + c); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = b; ctx.beginPath();
    if (flip) { ctx.moveTo(x + c, y); ctx.lineTo(x + c, y + c); ctx.lineTo(x, y + c); } else { ctx.moveTo(x, y); ctx.lineTo(x + c, y + c); ctx.lineTo(x, y + c); }
    ctx.closePath(); ctx.fill();
  }
  // diamonds on the grid points (wrapping, so the tile repeats), split in halves of two shades
  const d = c * 0.32;
  for (let i = 0; i <= k; i++) for (let j = 0; j <= k; j++) {
    const x = x0 + i * c, y = j * c, a = pick(), b = pick(a);
    ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = b; ctx.beginPath(); ctx.moveTo(x, y + d); ctx.lineTo(x + d, y); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill();
  }
  // the weave
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i += 2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.beginPath(); ctx.moveTo(x0 + i, 0); ctx.lineTo(x0 + i, n); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(x0, i); ctx.lineTo(x0 + n, i); ctx.stroke();
  }
  ctx.restore();
}

/** Soft ribs: `ribs` bands across a square (vertical when `across`, else horizontal), light on the crest, darker in
 * the furrow. Used for the corduroy (vertical ribs) and the fleece throws. */
function drawRibs(ctx, x0, n, ribs, { vertical = true, crest = '#ffffff', furrow = '#9c9c9c' } = {}) {
  const w = n / ribs;
  for (let i = 0; i < ribs; i++) {
    const a = i * w;
    const g = vertical ? ctx.createLinearGradient(x0 + a, 0, x0 + a + w, 0) : ctx.createLinearGradient(0, a, 0, a + w);
    g.addColorStop(0, furrow); g.addColorStop(0.18, crest); g.addColorStop(0.55, crest); g.addColorStop(0.92, furrow); g.addColorStop(1, furrow);
    ctx.fillStyle = g;
    if (vertical) ctx.fillRect(x0 + a, 0, w + 0.5, n); else ctx.fillRect(x0, a, n, w + 0.5);
  }
}

/** A fuzz of faint specks over a square (the pile of the cord / fleece). */
function fuzz(ctx, x0, n, seed, alpha) {
  const r = rng(seed);
  for (let k = 0; k < n * 6; k++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x0 + r() * n, r() * n, 1, 1 + r() * 2);
  }
}

/** A coarse outdoor fabric (#399): a basket weave of thick yarns, pairs of threads turning every cell, light grey (the
 * vertex colour tints it) or, as a bump, its relief. */
function drawWeave(ctx, x0, n, cells, bump, seed) {
  const c = n / cells, r = rng(seed);
  ctx.fillStyle = bump ? '#303030' : '#b8b8b8';
  ctx.fillRect(x0, 0, n, n);
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = x0 + i * c, y = j * c, across = (i + j) % 2 === 0;
    for (let k = 0; k < 2; k++) { // two yarns side by side per cell
      const v = bump ? 200 + r() * 40 : 225 + r() * 25;
      const g = across ? ctx.createLinearGradient(0, y + k * c / 2, 0, y + (k + 1) * c / 2) : ctx.createLinearGradient(x + k * c / 2, 0, x + (k + 1) * c / 2, 0);
      g.addColorStop(0, `rgb(${v * 0.75},${v * 0.75},${v * 0.75})`); g.addColorStop(0.5, `rgb(${v},${v},${v})`); g.addColorStop(1, `rgb(${v * 0.75},${v * 0.75},${v * 0.75})`);
      ctx.fillStyle = g;
      if (across) ctx.fillRect(x + 0.5, y + k * c / 2 + 0.5, c - 1, c / 2 - 1); else ctx.fillRect(x + k * c / 2 + 0.5, y + 0.5, c / 2 - 1, c - 1);
    }
  }
}

/** The striped outdoor cushion (#399): the weave on an off-white ground with our own simple stripe — a broad charcoal
 * band between two thin ones, twice across the cushion (the vertex colour is a near-white, so the stripes stay dark). */
function drawStripes(ctx, x0, n) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const base of [0.12, 0.62]) {
    for (const [o, w] of [[0, 0.025], [0.06, 0.09], [0.185, 0.025]]) {
      ctx.fillStyle = C.stripe.band;
      ctx.fillRect(x0, (base + o) * n, n, w * n);
    }
  }
  ctx.restore();
}

let atlas = null;
function cushionMaterial() {
  if (atlas) return atlas;
  const n = 256, cv = document.createElement('canvas'), bv = document.createElement('canvas');
  cv.width = bv.width = n * COLS; cv.height = bv.height = n;
  const ctx = cv.getContext('2d'), bx = bv.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, n * COLS, n);
  // leaf print (#313): big flat leaves and petals in grey-blue / sage, burgundy-plum, mustard-olive and black on cream
  ctx.fillStyle = C.print.ground; ctx.fillRect(0, 0, n, n);
  const r = rng(7);
  for (let k = 0; k < 22; k++) {
    const x = r() * n, y = r() * n, len = 40 + r() * 70, wid = len * (0.28 + r() * 0.22), a = r() * Math.PI * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = C.print.colors[Math.floor(r() * C.print.colors.length)];
    ctx.beginPath(); ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -wid, len / 2, 0); ctx.quadraticCurveTo(0, wid, -len / 2, 0); ctx.fill();
    ctx.restore();
  }
  // a few round plum petals, as on the photo's flower heads
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = '#5e1f33';
    ctx.beginPath(); ctx.ellipse(r() * n, r() * n, 9 + r() * 7, 7 + r() * 5, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // bobble knit (grey: the vertex colour tints it), and its bump
  drawKnit(ctx, n, n, C.knit.cells, false);
  drawKnit(bx, n, n, C.knit.cells, true);
  // geometric patchwork in its own colours, a slight weave in the bump
  drawGeo(ctx, 2 * n, n);
  for (let i = 0; i < n; i += 2) { bx.fillStyle = i % 4 ? '#8a8a8a' : '#767676'; bx.fillRect(2 * n + i, 0, 1, n); }
  // corduroy: wide soft vertical ribs, a little fuzz (the vertex colour tints it pink)
  drawRibs(ctx, 3 * n, n, C.cord.ribs, { crest: '#ffffff', furrow: '#cdc6c4' });
  fuzz(ctx, 3 * n, n, 5, 0.05);
  drawRibs(bx, 3 * n, n, C.cord.ribs, { crest: '#ffffff', furrow: '#202020' });
  // the patio's outdoor fabrics (#399): a coarse weave, plain and striped
  for (const k of [4, 5]) { drawWeave(ctx, k * n, n, C.weave.cells, false, 3 + k); drawWeave(bx, k * n, n, C.weave.cells, true, 3 + k); }
  drawStripes(ctx, 5 * n, n);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  atlas = new THREE.MeshStandardMaterial({ map, bumpMap: new THREE.CanvasTexture(bv), bumpScale: 1.5, vertexColors: true, roughness: 0.96 });
  return atlas;
}

const throwMats = {};
/** Ribbed fleece (#313) in one of CUSHIONS.fleece's colours, two ribs per tile (UVs in metres / (2 × rib)). */
export function throwMaterial(color = 'grey') {
  if (throwMats[color]) return throwMats[color];
  const n = 128, cv = document.createElement('canvas'), bv = document.createElement('canvas');
  cv.width = cv.height = bv.width = bv.height = n;
  const ctx = cv.getContext('2d');
  drawRibs(ctx, 0, n, 2, { vertical: false, crest: '#ffffff', furrow: '#8a8a8a' });
  fuzz(ctx, 0, n, 9, 0.06);
  drawRibs(bv.getContext('2d'), 0, n, 2, { vertical: false, crest: '#ffffff', furrow: '#1a1a1a' });
  const map = new THREE.CanvasTexture(cv), bump = new THREE.CanvasTexture(bv);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  // a slightly shiny pile: lower roughness than the cushions
  throwMats[color] = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, color: C.fleece[color] ?? C.fleece.grey, roughness: 0.72, side: THREE.DoubleSide });
  return throwMats[color];
}
const RIB_TILE = () => 2 * C.fleece.rib;

/**
 * A plump cushion `s` × `s`, `t` thick at the middle, facing ±z: a subdivided box whose faces puff out and whose edges
 * close to a seam, the edge middles drawn in so the corners stick out; `crumple` dents it a little.
 */
function cushionGeometry(s, t, kind, crumple, seed, w = s, color) {
  const g = new THREE.BoxGeometry(2, 2, 2, 12, 12, 2);
  const p = g.attributes.position, uv = g.attributes.uv, r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = p.getY(i), c = p.getZ(i);
    const f = Math.sqrt(Math.max(0, (1 - a * a) * (1 - b * b)));          // 0 at the seam, 1 in the middle
    const dent = crumple * f * 0.35 * (Math.sin(a * 3.1 + ph[0]) * Math.sin(b * 2.7 + ph[1]) + 0.5 * Math.sin(a * 5.3 + b * 4.1 + ph[2]));
    const sag = crumple * 0.04 * Math.sin(a * 4 + b * 3 + ph[3]);       // the edges wave a little
    p.setXYZ(i, a * w / 2 * (1 - 0.08 * (1 - b * b)), b * s / 2 * (1 - 0.08 * (1 - a * a)), (c * f * (1 + dent) * t) / 2 + sag * s * (1 - f));
  }
  // atlas column, and a tint per vertex
  const col = COL[kind] ?? 0;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (col + 0.02 + uv.getX(i) * 0.96) / COLS);
  const tint = new THREE.Color(color ?? C[kind]?.color ?? 0xffffff); // print and geo carry their own colours; `color` = per cushion
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { cols[i * 3] = tint.r; cols[i * 3 + 1] = tint.g; cols[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Cushions leaning against a seat's back (#278): `list` from CUSHIONS, `backZ` = local z of the back cushion's front at
 * seat level, `seatY` = the seat's top. Added to `g` as plain meshes (merged per material with the rest of the piece);
 * returns them. A cushion may have its own `color` (the vertex tint) and a width `w` ≠ its height `size` (a lumbar, #399).
 */
export function addCushions(g, list, { backZ, seatY }) {
  const mat = cushionMaterial();
  return list.map((c, i) => {
    const s = c.size ?? C.size, t = C.thick * (c.size ? c.size / C.size : 1);
    const m = new THREE.Mesh(cushionGeometry(s, t, c.kind, c.crumple ?? 0.3, 11 + i * 17, c.w ?? s, c.color), mat);
    // stand it up, lean it back, turn it; its bottom edge on the seat, its back against the back cushion
    m.rotation.set(-c.lean, c.yaw, 0, 'YXZ');
    m.position.set(c.x, seatY - 0.02 + (s / 2) * Math.cos(c.lean) * 0.96, backZ + c.z);
    m.castShadow = m.receiveShadow = true;
    m.userData.cushion = true;
    g.add(m);
    return m;
  });
}

/** A throw folded into a neat soft slab: `layers` rounded sheets stacked, the top one a little short (the fold). */
export function addFoldedThrow(g, { w, d, layer, layers, x, z, y, yaw, color }) {
  const mat = throwMaterial(color), per = RIB_TILE();
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
export function addDrapedThrow(g, pts, z0, z1, seed = 3, color = 'grey') {
  // resample the path evenly
  const path = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(path), N = 40, M = 18, len = curve.getLength(), per = RIB_TILE();
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
  const m = new THREE.Mesh(geo, throwMaterial(color));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
