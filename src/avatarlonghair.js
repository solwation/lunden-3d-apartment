// #2053 (part of #2042): long hair in locks instead of one thick sheet with a straight-cut hem, inside the avatar's one draw call.
//  - locks: the curtain below the scalp (AVATAR_HAIR.long, from |azimuth| `long.from` round the back) is `perCol` ribbons per scalp
//    column. Each starts on the scalp shell's lowest row (shared positions and normals: no join), hangs clear of the head, ears, neck and
//    the sweater, overlaps its neighbours below the top, then tapers to a point at its own length: an uneven hem of tips. Every other lock
//    lies a few mm further out (the outer layer, a little shorter), so the layers part with some air between them and the silhouette breaks
//    up. The lock follows the curtain's flow (AVATAR_HAIR.flow: the long groups' ridges and their sideways sway), so a strand tangent taken
//    along a lock runs straight down it. Edge normals are bent across the lock (rounded), edges darker.
//  - the body: a lock ends where the surface below it juts out more steeply than `stop` (it rests on the shoulder instead of passing into
//    it). The clearance is a table of the real sweater (torso and sewn shoulders of both figures and the hoodie's ease, bind pose) by azimuth
//    and height, in the head's frame before faceWarp (which narrows the lower head part in x, so the table is un-warped to match).
//  - under-layer: a shorter, darker closed sheet just inside the locks (and its inner surface) so the curtain stays closed where the locks
//    part; the locks' lowest rows get a back face (seen from in front, beside the neck).
//  - front strands: a few locks per side brought forward over the shoulders onto the chest, two-sided, skinned from the head bone to the
//    torso along their length, so the part lying on the chest stays there when the head turns or nods.
// Sway (#2014) and the hair-length slider act on every hair vertex as before (facePart hair); flyaways (#2040) root on the locks' outer
// faces only (the under-layer and the front strands are marked userData.noFly). Numbers: config.js AVATAR_LONGHAIR. Pure geometry helpers.
import * as THREE from 'three';
import { AVATAR_LONGHAIR as LH, AVATAR_HAIR as HAIR, AVATAR_FACE as FACE } from './config.js';

const deg = Math.PI / 180;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hash = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // 0 … 1, the same per lock every build

/** The curtain's triangles for `cols` scalp columns: locks (front faces and the lowest rows' back faces), the under-layer and its inner surface,
 * the two-sided front strands (before #2053: the outer and inner sheet, 4 · cols · AVATAR_HAIR.long.rows). */
export const longHairTris = (cols) => cols * LH.perCol * 2 * (LH.rows + LH.backRows) + 2 * cols * LH.under.rows * 2 + 2 * LH.front.n * 2 * 2 * LH.front.rows;
/** faceWarp's x factor at head-frame (y, z) (avatar.js faceWarp: the lower face narrows towards the front). */
export function warpX(y, z) {
  const W = FACE.warp;
  return W.width * (1 - W.narrow * smooth(W.y[0], W.y[1], y) * smooth(W.z[0], W.z[1], z));
}

/** The sweater's clearance: `geos` (bind-pose BufferGeometries in the head bone's frame, after placement, i.e. as rendered, or
 * { geometry, minY }: only its triangles reaching above head-frame height minY, e.g. a sleeve's shoulder cap but not the hanging arm) sampled densely
 * on their triangles, un-warped (x / warpX), binned by azimuth (`da` degrees) and height (`dy` m). at(azimuth deg, y) = the largest horizontal
 * radius from the head's axis within one bin around it (0: nothing there). */
export function clearanceTable(geos, { da = 2, dy = 0.005, y0 = 0.1, y1 = -0.45 } = {}) {
  const na = Math.round(360 / da), ny = Math.ceil((y0 - y1) / dy), tab = new Float32Array(na * ny);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const put = (q) => {
    const x = q.x / warpX(q.y, q.z), iy = Math.floor((y0 - q.y) / dy);
    if (iy < 0 || iy >= ny) return;
    const ia = ((Math.floor((Math.atan2(x, q.z) / deg + 180) / da) % na) + na) % na, k = ia * ny + iy;
    tab[k] = Math.max(tab[k], Math.hypot(x, q.z));
  };
  for (const item of geos) {
    const g = item.isBufferGeometry ? item : item.geometry, minY = item.minY ?? -Infinity, P = g.attributes.position, I = g.index, n = I ? I.count : P.count;
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(P, I ? I.getX(t) : t); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2);
      if (Math.max(a.y, b.y, c.y) < Math.max(y1, minY) || Math.min(a.y, b.y, c.y) > y0) continue;
      const m = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.003));
      for (let i = 0; i <= m; i++) for (let j = 0; i + j <= m; j++) put(p.set(0, 0, 0).addScaledVector(a, i / m).addScaledVector(b, j / m).addScaledVector(c, (m - i - j) / m));
    }
  }
  return {
    at(ad, y) {
      const ia = Math.floor((ad + 180) / da), iy = Math.floor((y0 - y) / dy);
      let r = 0;
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
        const jy = iy + v; if (jy < 0 || jy >= ny) continue;
        r = Math.max(r, tab[(((ia + u) % na) + na) % na * ny + jy]);
      }
      return r;
    },
  };
}

/** One indexed ribbon: `pts[j][k]` (rows j top → tip, `w` points across) with normals `nrm[j][k]` and shades `sh[j][k]`; front faces
 * wound to face along the normals, back faces (reversed, normals negated, shade × `back`) for rows ≥ `backFrom` (Infinity: none). */
function ribbon(pts, nrm, sh, backFrom = Infinity, back = 0.75) {
  const rows = pts.length, w = pts[0].length, pos = [], nor = [], shade = [], idx = [];
  const layer = (sign, k0) => {
    for (let j = 0; j < rows; j++) for (let k = 0; k < w; k++) {
      pos.push(...pts[j][k]); nor.push(...nrm[j][k].map((v) => v * sign)); shade.push(sh[j][k] * (sign < 0 ? back : 1));
    }
    const at = (j, k) => k0 + j * w + k;
    for (let j = 0; j + 1 < rows; j++) {
      if (sign < 0 && j < backFrom) continue;
      for (let k = 0; k + 1 < w; k++) {
        const q = [at(j, k), at(j, k + 1), at(j + 1, k), at(j, k + 1), at(j + 1, k + 1), at(j + 1, k)];
        // wind each triangle so it faces along its vertex normals (times `sign`)
        for (let t = 0; t < 6; t += 3) {
          const [i0, i1, i2] = q.slice(t, t + 3), P = (i) => pos.slice(i * 3, i * 3 + 3);
          const [p0, p1, p2] = [P(i0), P(i1), P(i2)], e1 = p1.map((v, d) => v - p0[d]), e2 = p2.map((v, d) => v - p0[d]);
          const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          let s = 0; for (const i of [i0, i1, i2]) for (let d = 0; d < 3; d++) s += fn[d] * nor[i * 3 + d];
          idx.push(...(s >= 0 ? [i0, i1, i2] : [i0, i2, i1]));
        }
      }
    }
  };
  layer(1, 0);
  if (backFrom < rows) layer(-1, rows * w);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  return g;
}
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const polar = (ad, y, r) => [Math.sin(ad * deg) * r, y, Math.cos(ad * deg) * r];

/**
 * The long curtain as [geometry, region, shade] parts (head bone frame, before placement / faceWarp).
 * `az`: the curtain's columns (degrees, the figure's left +x round the back to its right), `edge(i)` → { p, n, shade } the scalp shell's
 * lowest-row vertex of column i (position, normal, vertex shade), `body(aRad, y)` → how far the head, ears, neck and torso rings reach from the
 * axis (m), `table` from clearanceTable, `hem(aDeg)` the curtain's hem height (m), `strand(i)` a column's shade, `bones` { head, torso } indices.
 */
export function longHairParts({ az, edge, body, table, hem, strand, bones }) {
  const L = HAIR.long, F = HAIR.flow, cols = az.length - 1, out = [];
  const span = (i) => { let d = az[i + 1] - az[i]; if (d < -180) d += 360; return d; }; // (the seam at ±180)
  const azAt = (i, f) => { let a = az[i] + span(i) * f; if (a >= 180) a -= 360; return a; };
  const edgeAt = (i, f) => { // the scalp row between columns i and i + 1 (a straight chord: the shell's edge)
    const A = edge(i), B = edge(i + 1);
    return { p: A.p.map((v, d) => v + (B.p[d] - v) * f), n: unit(A.n.map((v, d) => v + (B.n[d] - v) * f)), shade: A.shade + (B.shade - A.shade) * f };
  };
  // what the hair must clear at (azimuth deg, y): the head / ears / neck / torso rings (with the curtain's gap near the top) and the sweater
  const head = (ad, y, t) => body(ad * deg, y) + L.gap * smooth(0, 0.15, t), sweater = (ad, y) => table.at(ad, y) + LH.clear;
  const need = (ad, y, t) => Math.max(head(ad, y, t), sweater(ad, y));
  /** A hanging column from `p0` down towards `yHem` over azimuths `as`: radius only grows (it falls, never back in) unless the body below
   * juts out more steeply than `stop`, where it ends. → { rAt(y), end } */
  const column = (as, p0, yHem) => {
    const dy = 0.004, ys = [p0[1]], rs = [Math.hypot(p0[0], p0[2])];
    let r = rs[0], pushed = 0;
    for (let y = p0[1] - dy; y > yHem - 1e-9; y -= dy) {
      const t = (p0[1] - y) / (p0[1] - yHem), s = Math.max(...as.map((a) => sweater(a, y)));
      if ((s - r > LH.stop[0] * dy || pushed + s - r > LH.stop[1]) && p0[1] - y > 0.03) break; // (the shoulder's top: rest on it)
      const h = Math.max(r, ...as.map((a) => head(a, y, t)));
      pushed += Math.max(0, s - h); r = Math.max(h, s); ys.push(y); rs.push(r);
    }
    return { end: ys.at(-1), rAt: (y) => { const u = Math.min(ys.length - 1, Math.max(0, (ys[0] - y) / dy)), k = Math.floor(u), f = u - k; return k + 1 < rs.length ? rs[k] + (rs[k + 1] - rs[k]) * f : rs.at(-1); } };
  };
  const ridge = (ad, t) => F.longRidge * (0.5 + 0.5 * Math.cos(ad * deg * F.longGroups + t * 2)) * Math.sin(Math.PI * t);
  const sway = (ad, t) => F.longSway * Math.sin(ad * deg * F.longGroups + t * 2) * Math.sin(Math.PI * t); // degrees
  const R = LH.rows, rowT = (j) => (j / R) ** LH.rowPower;

  // --- the locks ---
  const locks = [];
  for (let i = 0; i < cols; i++) for (let s = 0; s < LH.perCol; s++) {
    const k = locks.length, f0 = s / LH.perCol, f1 = (s + 1) / LH.perCol, c0 = azAt(i, (f0 + f1) / 2), half = span(i) * (f1 - f0) / 2;
    const outer = k % 2 === 1, top = edgeAt(i, (f0 + f1) / 2);
    const want = hem(c0) + LH.jag * (2 * hash(k) - 1) * (0.4 + 0.6 * smooth(L.from, 100, Math.abs(c0))) + (outer ? LH.outerShort : 0);
    const col = column([c0 - half * (1 + LH.overlap), c0, c0 + half * (1 + LH.overlap)], top.p, Math.min(want, top.p[1] - 0.04));
    const tip = col.end, ts = LH.taper[0] + (LH.taper[1] - LH.taper[0]) * hash(k + 0.5);
    const air = (t) => (outer ? LH.air[0] * smooth(0, 0.08, t) + (LH.air[1] - LH.air[0]) * smooth(0.05, 0.5, t) : 0);
    const radius = (y, t) => col.rAt(y) + ridge(c0, t) + air(t);
    const pts = [], nrm = [], sh = [];
    for (let j = 0; j <= R; j++) {
      const t = rowT(j);
      if (j === 0) { // on the scalp's row: its positions and normals
        const e = [edgeAt(i, f0), edgeAt(i, f1)];
        pts.push(e.map((x) => x.p)); nrm.push(e.map((x) => x.n)); sh.push(e.map((x) => x.shade)); continue;
      }
      const width = (1 + LH.overlap * smooth(LH.overlapAt[0], LH.overlapAt[1], t)) * (1 - (1 - LH.tip) * smooth(ts, 1, t));
      const c = c0 + sway(c0, t), y0 = top.p[1], y = y0 + (tip - y0) * t, r = radius(y, t);
      const row = [-1, 1].map((side) => polar(c + side * half * width, y, r));
      pts.push(row);
      sh.push([0, 1].map(() => strand(i + 3) * (0.94 + 0.08 * hash(k + 0.25)) * (1 - (1 - LH.edgeShade) * smooth(0, 0.3, t))));
    }
    // normals below the top row: across × along, outward, the edges bent across the lock (rounded)
    for (let j = 1; j <= R; j++) {
      const mid = (q) => q[0].map((v, d) => (v + q[1][d]) / 2), along = sub(mid(pts[Math.min(R, j + 1)]), mid(pts[j - 1]));
      const across = unit(sub(pts[j][1], pts[j][0]));
      let n = unit(cross(along, across)); const m = mid(pts[j]);
      if (n[0] * m[0] + n[2] * m[2] < 0) n = n.map((v) => -v);
      const b = LH.bend * smooth(0, 0.3, rowT(j));
      nrm.push([-1, 1].map((side) => unit(n.map((v, d) => v + side * b * across[d]))));
    }
    out.push([ribbon(pts, nrm, sh, R - LH.backRows), 'hair', 1]);
    locks.push({ i, c0, half, tip, y0: top.p[1], ts, outer, col, radius });
  }
  // the outermost lock surface at (azimuth, y) (0: no lock there), for what lies on top of them
  const lockAt = (ad, y) => {
    let r = 0;
    for (const l of locks) {
      if (y > l.y0 || y < l.tip) continue;
      const t = (l.y0 - y) / (l.y0 - l.tip), d = Math.abs(((ad - l.c0 - sway(l.c0, t)) % 360 + 540) % 360 - 180);
      if (d <= l.half * (1 + LH.overlap) + 2) r = Math.max(r, l.radius(y, t));
    }
    return r;
  };

  // --- the under-layer: closed, shorter, darker, just inside the locks; its inner surface faces the neck ---
  const U = LH.under, upts = [], ush = [], ipts = [];
  for (let i = 0; i <= cols; i++) {
    const near = locks.filter((l) => l.i === i || l.i === i - 1);
    const e = edge(i), y0 = e.p[1], tip = Math.max(...near.map((l) => l.y0 + (l.tip - l.y0) * Math.min(l.ts, U.length)));
    const colPts = [], colSh = [], colIn = [];
    for (let j = 0; j <= U.rows; j++) {
      const t = j / U.rows, y = y0 + (tip - y0) * t;
      if (j === 0) { const k = 1 - U.depth / Math.hypot(e.p[0], e.p[2]); colPts.push(e.p); colSh.push(e.shade); colIn.push([e.p[0] * k, y, e.p[2] * k]); continue; } // (the inner top inside the head, as before)
      const lockR = Math.min(...near.map((l) => l.radius(y, Math.min(1, (l.y0 - y) / (l.y0 - l.tip)))));
      const r = Math.max(need(az[i], y, 1) - LH.clear * 0.5, lockR - U.inset * smooth(0, 0.25, t));
      const depth = Math.max(0.002, Math.min(U.depth, r - Math.max(body(az[i] * deg, y), table.at(az[i], y)) - 0.001));
      colPts.push(polar(az[i], y, r)); colIn.push(polar(az[i], y, r - depth));
      colSh.push(e.shade + (U.shade - e.shade) * smooth(0, 0.8, t));
    }
    upts.push(colPts); ush.push(colSh); ipts.push(colIn);
  }
  // as ribbons across the columns: rows j (top → bottom) × columns i
  const T = (m) => m[0].map((_, j) => m.map((c) => c[j]));
  const unormals = (P, sign) => { // per vertex: across × down, outward (sign 1) / inward (−1)
    const nr = P.map(() => []);
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= U.rows; j++) {
      const a = sub(P[Math.min(cols, i + 1)][j], P[Math.max(0, i - 1)][j]), d = sub(P[i][Math.min(U.rows, j + 1)], P[i][Math.max(0, j - 1)]);
      let n = unit(cross(a, d)); const p = P[i][j];
      if ((n[0] * p[0] + n[2] * p[2]) * sign < 0) n = n.map((v) => -v);
      nr[i][j] = j === 0 && sign > 0 ? edge(i).n : n;
    }
    return nr;
  };
  const under = ribbon(T(upts), T(unormals(upts, 1)), T(ush));
  const inner = ribbon(T(ipts), T(unormals(ipts, -1)), T(ipts.map((c) => c.map(() => 0.7))));
  under.userData.noFly = inner.userData.noFly = true;
  out.push([under, 'hair', 1], [inner, 'hair', 1]);

  // --- strands in front of the shoulders: over the locks, then forward and down onto the chest; skinned head → torso ---
  const S = LH.front;
  for (const side of [1, -1]) for (let k = 0; k < S.n; k++) {
    const a0 = side * (S.root[0] + S.root[1] * k), a1 = side * (S.end[0] + S.step[0] * k), yEnd = S.end[1] + S.step[1] * k;
    const from = (n) => ((a0 - az[n]) % 360 + 360) % 360, i = az.findIndex((a, n) => n < cols && from(n) <= span(n)), e = edgeAt(i, from(i) / span(i));
    const y0 = e.p[1] - 0.004, pts = [], nrm = [], sh = [];
    let r = Math.hypot(e.p[0], e.p[2]) - 0.001;
    for (let j = 0; j <= S.rows; j++) {
      const t = j / S.rows, y = y0 + (yEnd - y0) * t, ad = a0 + (a1 - a0) * smooth(0.25, 0.85, t);
      const q = Math.max(lockAt(ad, y) + S.lift, need(ad, y, t) + S.lift);
      r = j === 0 ? r : Math.max(r, q); // (it falls from the head's widest and only moves out over the shoulder: no kink in at the neck)
      const half = (S.width / 2) * (1 - 0.88 * smooth(0.5, 1, t)) / r / deg;
      pts.push([-1, 1].map((s) => polar(ad + s * half, y, r)));
      sh.push([0.92, 0.92].map((v) => v * strand(k + (side > 0 ? 5 : 9))));
    }
    for (let j = 0; j <= S.rows; j++) {
      const mid = (q) => q[0].map((v, d) => (v + q[1][d]) / 2), along = sub(mid(pts[Math.min(S.rows, j + 1)]), mid(pts[Math.max(0, j - 1)]));
      const across = unit(sub(pts[j][1], pts[j][0])), m = mid(pts[j]);
      let n = unit(cross(along, across));
      if (n[0] * m[0] + n[2] * m[2] < 0) n = n.map((v) => -v);
      nrm.push([-1, 1].map((s) => unit(n.map((v, d) => v + s * LH.bend * across[d]))));
    }
    const g = ribbon(pts, nrm, sh, 0, 0.8);
    g.userData.noFly = true;
    out.push([skinTo(g, (y) => smooth(S.torso[0], S.torso[1], y), bones), 'hair', 1]);
  }
  // the curtain's lower part rests on the back and shoulders: shared with the torso bone, so a nod or a turn of the head bends it there
  // instead of swinging it into the body (the front strands have their own, fuller blend)
  const W = LH.torso;
  for (const part of out) if (!part[0].attributes.skinIndex) skinTo(part[0], (y) => W[2] * smooth(W[0], W[1], y), bones);
  return out;
}
/** Head → torso skin weights by head-frame height: `w(y)` = the torso's share. */
function skinTo(g, w, bones) {
  const P = g.attributes.position, n = P.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { const t = w(P.getY(v)); si.set([bones.head, bones.torso, 0, 0], v * 4); sw.set([1 - t, t, 0, 0], v * 4); }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}
