// #2043 the head's silhouette: the authored head rings (AVATAR_SURFACE.head and AVATAR_FACE.jaw) are joined by a monotone
// cubic instead of straight lines, extra rings go only where the outline curves (jaw, chin, cheek, crown), the chin's flat
// underside is rounded off, and the neck is a tapered, slightly oval column with a hinted larynx instead of an 8-sided
// cylinder. Pure geometry helpers in the head bone's frame (metres, the face looks +z); numbers AVATAR_CONTOUR in config.js.
import * as THREE from 'three';
import { AVATAR_CONTOUR as C } from './config.js';

/** Fritsch–Carlson slopes for one value column of an ascending table: C1, never overshooting an authored row. */
function slopes(ys, vs) {
  const n = ys.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ys[i + 1] - ys[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * (ys[i + 1] - ys[i]) + (ys[i] - ys[i - 1]), w2 = (ys[i + 1] - ys[i]) + 2 * (ys[i] - ys[i - 1]);
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
}

/** A ring table [[y, rx, rz, z = 0], …] (ascending or descending y) sampled at `y` with a monotone cubic per column;
 * clamped to the end rows. Returns [y, rx, rz, z]. Exactly the authored values on the authored rows. */
export function profileAt(rows, y) {
  const t = rows[0][0] > rows.at(-1)[0] ? [...rows].reverse() : rows, ys = t.map(r => r[0]);
  if (y <= ys[0]) return [y, t[0][1], t[0][2], t[0][3] ?? 0];
  if (y >= ys.at(-1)) { const r = t.at(-1); return [y, r[1], r[2], r[3] ?? 0]; }
  const i = Math.max(0, ys.findIndex(v => v > y) - 1), h = ys[i + 1] - ys[i], s = (y - ys[i]) / h;
  const h00 = (1 + 2 * s) * (1 - s) ** 2, h10 = s * (1 - s) ** 2, h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
  const out = [y];
  for (let k = 1; k <= 3; k++) {
    const vs = t.map(r => r[k] ?? 0), m = slopes(ys, vs);
    out.push(h00 * vs[i] + h10 * h * m[i] + h01 * vs[i + 1] + h11 * h * m[i + 1]);
  }
  return out;
}

/** The head shell's rings, top first (as ringSurface takes them): the authored rows, the given extra heights (the nose
 * rings) and AVATAR_CONTOUR.rings on the cubic profile, then the chin's rounded underside below the lowest row
 * (a quarter ellipse of AVATAR_CONTOUR.chin.depth). */
export function contourRows(rows, extra = []) {
  const ys = new Set(rows.map(r => r[0])), out = rows.map(r => [r[0], r[1], r[2], r[3] ?? 0]);
  for (const y of [...extra, ...C.rings]) if (!ys.has(y)) { ys.add(y); out.push(profileAt(rows, y)); }
  out.sort((a, b) => b[0] - a[0]);
  const [y, rx, rz, z] = out.at(-1);
  for (const a of C.chin.angles) {
    const r = a * Math.PI / 180;
    out.push([y - C.chin.depth * Math.sin(r), rx * Math.cos(r), rz * Math.cos(r), z]);
  }
  return out;
}

/** Lowers ringSurface's bottom cap centre (its last vertex) to the chin's rounded bottom, so the underside is a dome. */
export function roundChinCap(g, rows) {
  const p = g.attributes.position, i = p.count - 1, low = rows.at(-1)[0], y = rows[rows.length - 1 - C.chin.angles.length][0] - C.chin.depth;
  if (Math.abs(p.getY(i) - low) < 1e-9) p.setY(i, y);
  return g;
}

/** The neck (#2043): an open, slightly oval column from inside the collar up into the head, set back under the jaw so the
 * underside of the chin shows, with a soft larynx bump at the front (fuller for a male figure). Shared ring columns wrap
 * round without a seam, so the normals are smooth all the way round. */
export function neckGeometry(female = false) {
  const N = C.neck, sides = N.sides, pos = [], index = [];
  const [ly, lh, lw] = N.larynx, amp = female ? N.larynxAmp[1] : N.larynxAmp[0];
  for (const [y, rx, rz, z] of N.rings) for (let j = 0; j < sides; j++) {
    const a = j / sides * Math.PI * 2, x = Math.sin(a) * rx, front = Math.cos(a);
    const bump = amp * Math.max(0, front) ** 2 * Math.exp(-(((y - ly) / lh) ** 2) - (x / lw) ** 2);
    pos.push(x, y, Math.cos(a) * rz + z + bump);
  }
  for (let i = 0; i < N.rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = a + sides, a1 = i * sides + (j + 1) % sides, b1 = a1 + sides;
    index.push(a, b, a1, a1, b, b1);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index); g.computeVertexNormals();
  return g;
}
