import * as THREE from 'three';
import { SITE } from './config.js';
import { lowMemory } from './lowmemory.js';

// #1676: roof detail of the old hospital pavilions (SITE.south.brickStyle.sources): rows of gabled dormers on the hipped
// slopes, a larger gable ("risalit") in the middle of each long eave, and brick chimneys. Everything is written as
// vertex-coloured triangles into southbackdrop's roof batch (one geometry per building, panes into the glass batch):
// no extra draw call, texture or light. Counts and positions are *guess* (SITE.south.pavilionRoof).

const ptSeg = (x, z, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const inRing = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };

/**
 * `rings` = [outer, ...holes] (open rings), `roofHeight([x, z])` the drawn roof's height. Pushes into parts.roof / parts.glass.
 * `lite` (phones): no panes, and every other dormer is left out when `R.liteSkip` says so.
 */
export function pavilionRoofDetail(b, rings, roofHeight, parts, lite = lowMemory) {
  const R = SITE.south.pavilionRoof, col = new THREE.Color(R.dormer), brick = new THREE.Color(R.chimney);
  const pos = [], cols = [], gpos = [];
  const tri = (a, c, d, ref, color) => { // wound so the geometric normal points away from `ref` (inside the solid)
    const n = [(c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]), (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]), (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0])];
    const out = n[0] * (a[0] - ref[0]) + n[1] * (a[1] - ref[1]) + n[2] * (a[2] - ref[2]) >= 0;
    for (const q of out ? [a, c, d] : [a, d, c]) { pos.push(...q); cols.push(color.r, color.g, color.b); }
  };
  const quad = (a, c, d, e, ref, color) => { tri(a, c, d, ref, color); tri(a, d, e, ref, color); };
  const outer = rings[0], area = outer.reduce((s, q, i) => { const r = outer[(i + 1) % outer.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0), orient = Math.sign(area);
  const clear = (x, z, min) => inRing(x, z, outer) && !rings.slice(1).some(h => inRing(x, z, h)) && rings.every(r => r.every((a, i) => ptSeg(x, z, a, r[(i + 1) % r.length]) >= min));
  const dormer = (x, z, ux, uz, nx, nz, w, hw, gh, dp) => { // (x,z) front centre on the slope, (nx,nz) outward
    const yf = roofHeight([x, z]), yb = yf - 0.1, yt = yf + hw, cx = x - nx * dp / 2, cz = z - nz * dp / 2, ref = [cx, yf + hw / 2, cz];
    const P = (s, d, y) => [x + ux * s - nx * d, y, z + uz * s - nz * d]; // s along the eave, d inward
    const hw2 = w / 2, fl = P(-hw2, 0, yb), fr = P(hw2, 0, yb), ftl = P(-hw2, 0, yt), ftr = P(hw2, 0, yt), bl = P(-hw2, dp, yb), br = P(hw2, dp, yb), btl = P(-hw2, dp, yt), btr = P(hw2, dp, yt);
    const rf = P(0, 0, yt + gh), rb = P(0, dp, yt + gh), ov = 0.12;
    quad(fl, fr, ftr, ftl, ref, col); quad(fl, bl, btl, ftl, ref, col); quad(fr, br, btr, ftr, ref, col);
    const eaveL = P(-hw2 - ov, 0, yt - 0.05), eaveR = P(hw2 + ov, 0, yt - 0.05), eaveLb = P(-hw2 - ov, dp, yt - 0.05), eaveRb = P(hw2 + ov, dp, yt - 0.05);
    const rr = [cx, yt - 0.3, cz];
    quad(eaveL, rf, rb, eaveLb, rr, new THREE.Color(R.roof)); quad(eaveR, rf, rb, eaveRb, rr, new THREE.Color(R.roof));
    tri(ftl, ftr, rf, ref, col); tri(btl, btr, rb, ref, col);
    if (!lite) { const pw = w * 0.5, ph = hw * 0.6, y0 = yf + hw * 0.18; gpos.push(...P(-pw / 2, -0.02, y0), ...P(pw / 2, -0.02, y0), ...P(pw / 2, -0.02, y0 + ph), ...P(-pw / 2, -0.02, y0), ...P(pw / 2, -0.02, y0 + ph), ...P(-pw / 2, -0.02, y0 + ph)); }
  };
  const chimney = (x, z) => {
    const s = R.chimneySize / 2, ys = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([a, c]) => roofHeight([x + a, z + c])), y0 = Math.min(...ys) - 0.4, y1 = Math.max(...ys) + R.chimneyRise, ref = [x, (y0 + y1) / 2, z];
    const c = [[-s, -s], [s, -s], [s, s], [-s, s]];
    for (let i = 0; i < 4; i++) { const a = c[i], d = c[(i + 1) % 4]; quad([x + a[0], y0, z + a[1]], [x + d[0], y0, z + d[1]], [x + d[0], y1, z + d[1]], [x + a[0], y1, z + a[1]], ref, brick); }
    const cap = R.chimneySize / 2 + 0.08, top = new THREE.Color(0x3b3f43);
    tri([x - cap, y1 + 0.12, z - cap], [x + cap, y1 + 0.12, z - cap], [x + cap, y1 + 0.12, z + cap], [x, y1, z], top); tri([x - cap, y1 + 0.12, z - cap], [x + cap, y1 + 0.12, z + cap], [x - cap, y1 + 0.12, z + cap], [x, y1, z], top);
  };
  const longest = Math.max(...outer.map((a, i) => Math.hypot(outer[(i + 1) % outer.length][0] - a[0], outer[(i + 1) % outer.length][1] - a[1])));
  let n = 0, edges = [];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], c = outer[(i + 1) % outer.length], dx = c[0] - a[0], dz = c[1] - a[1], d = Math.hypot(dx, dz);
    if (d < R.minEdge) continue;
    const ux = dx / d, uz = dz / d, nx = orient * uz, nz = -orient * ux; // outward normal of a ring wound with `orient`
    edges.push([a, ux, uz, nx, nz, d]);
    const mid = d / 2, gable = d >= R.risalitEdge && d >= 0.6 * longest, count = Math.max(1, Math.floor((d - 2 * R.endMargin) / R.spacing) + 1), step = count > 1 ? (d - 2 * R.endMargin) / (count - 1) : 0;
    for (let k = 0; k < count; k++) {
      const s = count > 1 ? R.endMargin + k * step : mid, isMid = gable && Math.abs(s - mid) < R.spacing * 0.6;
      if (gable && !isMid && Math.abs(s - mid) < R.risalitWidth / 2 + R.dormerWidth) continue;
      if (lite && R.liteSkip && k % 2 === 1 && !isMid) continue;
      const ins = isMid ? R.risalitInset : R.inset, x = a[0] + ux * (isMid ? mid : s) - nx * ins, z = a[1] + uz * (isMid ? mid : s) - nz * ins;
      if (!clear(x - nx * 0.2, z - nz * 0.2, ins - 0.3)) continue;
      if (isMid) dormer(x, z, ux, uz, nx, nz, R.risalitWidth, R.risalitHeight, R.risalitGable, R.risalitDepth);
      else dormer(x, z, ux, uz, nx, nz, R.dormerWidth, R.dormerHeight, R.dormerGable, R.dormerDepth);
      n++;
    }
  }
  // Chimneys: along the ridge zone, spaced out, on the highest roof points that lie well inside the footprint.
  const xs = outer.map(q => q[0]), zs = outer.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), cand = [];
  for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) if (clear(x, z, R.chimneyEdge)) cand.push([x, z, roofHeight([x, z])]);
  cand.sort((p, q) => q[2] - p[2]);
  const chosen = [];
  for (const c of cand) { if (chosen.length >= R.chimneys) break; if (c[2] < cand[0][2] - R.chimneyBand) break; if (chosen.every(o => Math.hypot(o[0] - c[0], o[1] - c[1]) >= R.chimneySpacing)) chosen.push(c); }
  if (!lite || R.liteChimneys) for (const c of chosen) chimney(c[0], c[1]);
  if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); parts.roof.push(g); }
  if (gpos.length && parts.glass) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); g.computeVertexNormals(); parts.glass.push(g); }
  return { dormers: n, chimneys: chosen.length };
}
