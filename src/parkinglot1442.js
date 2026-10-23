import * as THREE from 'three';
import { cutAtTerrain, samples } from './roads.js';
import { SITE } from './config.js';

const SOURCE = '145221624';
const DEFAULTS = Object.freeze({ bayWidth: 2.5, bayDepth: 5, aisleWidth: 6, transition: 4 });
const ring = (p) => p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1] ? p.slice(0, -1) : p;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const area = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const cross = (a,b,p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
// #1444: exported for surroundings.js (a sub-plane lot's core pieces cut along its seams).
export function clipConvex(subject,cutter){
  const sign=Math.sign(area(cutter));let inside=subject;
  for(let i=0;i<cutter.length&&inside.length;i++){
    const a=cutter[i],b=cutter[(i+1)%cutter.length],out=[];
    for(let j=0;j<inside.length;j++){const p=inside[j],q=inside[(j+1)%inside.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q);if(dp>=-1e-8)out.push(p);if((dp< -1e-8&&dq>1e-8)||(dp>1e-8&&dq< -1e-8)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
    inside=out;
  }
  return inside;
}
function clipSegment(segment,poly){
  const sign=Math.sign(area(poly)),a0=segment[0],b0=segment[1],dx=b0[0]-a0[0],dz=b0[1]-a0[1];let lo=0,hi=1;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d0=sign*cross(a,b,a0),dd=sign*((b[0]-a[0])*dz-(b[1]-a[1])*dx);if(Math.abs(dd)<1e-12){if(d0<0)return null;continue;}const t=-d0/dd;if(dd>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}
  return[[a0[0]+dx*lo,a0[1]+dz*lo],[a0[0]+dx*hi,a0[1]+dz*hi]];
}
function insetConvex(poly,distance){
  const sign=Math.sign(area(poly)),lines=poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-sign*dz/len,nz=sign*dx/len;return[[a[0]+nx*distance,a[1]+nz*distance],[dx,dz]];});
  return lines.map((line,i)=>{const prev=lines[(i+lines.length-1)%lines.length],[p,r]=prev,[q,s]=line,den=r[0]*s[1]-r[1]*s[0],t=((q[0]-p[0])*s[1]-(q[1]-p[1])*s[0])/den;return[p[0]+r[0]*t,p[1]+r[1]*t];});
}

const simple = (p) => p.every((a, i) => { const b = p[(i + 1) % p.length]; return p.every((c, k) => { const d = p[(k + 1) % p.length]; if (k === i || (k + 1) % p.length === i || (i + 1) % p.length === k) return true; return !(cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0); }); });
const isConvex = (p) => { const s = Math.sign(area(p)); return p.every((a, i) => s * cross(a, p[(i + 1) % p.length], p[(i + 2) % p.length]) >= -1e-9); };
function solve(A, b) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let v = b[i]; for (let j = i + 1; j < n; j++) v -= A[i][j] * x[j]; x[i] = v / A[i][i]; }
  return x;
}
const slope = (a, b, c) => { const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]); return Math.hypot(((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / det, ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / det); };
const bary = (x, z, a, b, c) => { const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]), l1 = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (z - a[1])) / det, l2 = ((b[0] - a[0]) * (z - a[1]) - (x - a[0]) * (b[1] - a[1])) / det; return [1 - l1 - l2, l1, l2]; };
/** #1444: every triangulation of simple polygon P over its own corners (index triples; few for a hexagon). */
function triangulations(P) {
  const n = P.length, mid = (i, j) => [(P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2];
  const diagonal = (i, j) => { if ((j - i + n) % n <= 1 || (i - j + n) % n <= 1) return true; if (!pointIn(...mid(i, j), P)) return false; return P.every((a, k) => { const b = P[(k + 1) % n]; if (k === i || k === j || (k + 1) % n === i || (k + 1) % n === j) return true; return !(cross(P[i], P[j], a) * cross(P[i], P[j], b) < 0 && cross(a, b, P[i]) * cross(a, b, P[j]) < 0); }); };
  const rec = (ids) => {
    if (ids.length < 3) return [[]];
    const out = [], a = ids[0], b = ids.at(-1);
    for (let k = 1; k < ids.length - 1; k++) {
      const c = ids[k];
      if (!diagonal(a, c) || !diagonal(c, b) || Math.abs(area([P[a], P[c], P[b]])) < 1e-6) continue;
      for (const L of rec(ids.slice(0, k + 1))) for (const R of rec(ids.slice(k))) out.push([...L, [a, c, b], ...R]);
    }
    return out;
  };
  return rec(P.map((_, i) => i));
}
/**
 * #1444: least-squares heights for the corners of `core`, on its best triangulation; y(x, z) projects points outside
 * the core onto its edge. Triangulations whose steepest sub-plane exceeds `maxSlope` (a thin sliver tilts steeply)
 * lose to any that keep it; then the smallest largest residual wins. `candidates` keeps every one for inspection.
 */
function fitTin(core, samples, maxSlope = Infinity) {
  let best = null;const candidates = [];
  for (const triangles of triangulations(core)) {
    const n = core.length, A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
    // Inside the core a point weighs the corners of its triangle; outside (the band) the two ends of its nearest core edge.
    const weights = (x, z) => {
      let t0 = null, l0 = null, m0 = -Infinity;
      for (const t of triangles) { const l = bary(x, z, core[t[0]], core[t[1]], core[t[2]]), m = Math.min(...l); if (m > m0) { m0 = m; t0 = t; l0 = l; } }
      if (m0 >= -1e-9) return [[t0[0], l0[0]], [t0[1], l0[1]], [t0[2], l0[2]]];
      let w = null, d = Infinity;
      for (let k = 0; k < n; k++) { const p = core[k], q = core[(k + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], s = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz), 0, 1), e = Math.hypot(x - p[0] - dx * s, z - p[1] - dz * s); if (e < d) { d = e; w = [[k, 1 - s], [(k + 1) % n, s]]; } }
      return w;
    };
    for (const [x, z, y] of samples) { const w = weights(x, z); for (const [i, a] of w) { b[i] += a * y; for (const [j, c] of w) A[i][j] += a * c; } }
    if (A.some((row, i) => !(row[i] > 1e-6))) continue; // every corner needs its own samples
    const h = solve(A, b), y = (x, z) => weights(x, z).reduce((v, [i, a]) => v + a * h[i], 0);
    let max = 0, sq = 0; for (const [x, z, v] of samples) { const e = Math.abs(y(x, z) - v); max = Math.max(max, e); sq += e * e; }
    const rms = Math.sqrt(sq / samples.length), steepest = Math.max(...triangles.map(t => slope(...t.map(k => [...core[k], h[k]])))), ok = steepest <= maxSlope;
    candidates.push({ triangles, steepest, maxResidual: max, rms });
    if (!best || (ok && !best.ok) || (ok === best.ok && (max < best.maxResidual - 1e-9 || (Math.abs(max - best.maxResidual) <= 1e-9 && rms < best.rms)))) best = { triangles, heights: h, y, maxResidual: max, rms, steepest, ok };
  }
  if (best) best.candidates = candidates;
  return best;
}

/**
 * #1437: the u interval (lot coordinates) that a mapped access way's strip
 * occupies (absolute u) where it crosses the n0 row band [n0, n0 + depth], widened by its
 * half width over the crossing angle and by a guessed margin. Null without one.
 */
function entranceGap(lot, { u, n, n0, depth }) {
  const e = lot?.layout?.entrance;if (!e) return null;
  const road = [...(SITE.south.paths ?? []), ...(SITE.south.access ?? [])].find(r => r.source === e.road);
  if (!road) throw new RangeError(`Parking entrance road ${e.road} is not mapped`);
  const half = (Array.isArray(road.w) ? Math.max(...road.w) : road.w) / 2, margin = e.margin ?? .25, uv = ([x, z]) => [x * u[0] + z * u[1], x * n[0] + z * n[1] - n0];
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < road.path.length; i++) {
    const a = uv(road.path[i - 1]), b = uv(road.path[i]), dn = b[1] - a[1], len = Math.hypot(b[0] - a[0], dn);
    if (Math.abs(dn) < 1e-9) continue;
    const t0 = clamp((0 - a[1]) / dn, 0, 1), t1 = clamp((depth - a[1]) / dn, 0, 1);
    if (t0 === t1) continue;
    const widen = half * len / Math.abs(dn);
    for (const t of [t0, t1]) { const v = a[0] + (b[0] - a[0]) * t; lo = Math.min(lo, v - widen); hi = Math.max(hi, v + widen); }
  }
  return lo < hi ? [lo - margin, hi + margin] : null;
}

/**
 * Fit the smallest useful civil plane to the existing terrain samples inside one
 * sourced parking polygon. Both the fitted plane and its transition width are
 * guesses: OSM contains no floor levels. The returned sampler leaves the old
 * terrain unchanged outside the polygon and fades the correction to zero at
 * its edge, so neighboring lots, roads, buildings and surveyed controls remain
 * untouched. The caller supplies the unmodified terrain sampler.
 */
export function createParkingGrade(lot, sampleBase, options = {}) {
  const transition=options.transition??lot?.grade?.transition??DEFAULTS.transition;
  const poly = ring(lot?.polygon ?? []);
  if (poly.length < 3 || typeof sampleBase !== 'function' || !(transition > 0)) throw new TypeError('Parking grade needs a polygon, base sampler, and positive transition');
  const bounds = { x0: Math.min(...poly.map(([x]) => x)), x1: Math.max(...poly.map(([x]) => x)), z0: Math.min(...poly.map(([, z]) => z)), z1: Math.max(...poly.map(([, z]) => z) ) };
  const contains = (x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const points = [];
  for (let x = Math.ceil(bounds.x0); x <= bounds.x1; x++) for (let z = Math.ceil(bounds.z0); z <= bounds.z1; z++) if (contains(x, z)) points.push([x, z, sampleBase(x, z)]);
  if (points.length < 3) throw new RangeError(`Parking polygon ${lot.source ?? ''} contains too few terrain samples`);
  // #1436: an optional anchor pins the plane to a sourced height control inside the
  // lot (the unmodified sampler's value there); only the two slopes are then fitted.
  const anchor = options.anchor ?? lot?.grade?.anchor ?? null;
  if (anchor && !contains(anchor[0], anchor[1])) throw new RangeError(`Parking anchor ${anchor} lies outside polygon ${lot.source ?? ''}`);
  const mx = anchor ? anchor[0] : points.reduce((s, p) => s + p[0], 0) / points.length;
  const mz = anchor ? anchor[1] : points.reduce((s, p) => s + p[1], 0) / points.length;
  const my = anchor ? sampleBase(anchor[0], anchor[1]) : points.reduce((s, p) => s + p[2], 0) / points.length;
  let xx = 0, zz = 0, xz = 0, xy = 0, zy = 0;
  for (const [x, z, y] of points) { const dx = x - mx, dz = z - mz, dy = y - my; xx += dx * dx; zz += dz * dz; xz += dx * dz; xy += dx * dy; zy += dz * dy; }
  const det = xx * zz - xz * xz;
  if (Math.abs(det) < 1e-10) throw new RangeError(`Parking polygon ${lot.source ?? ''} cannot fit a stable plane`);
  let sx = (xy * zz - zy * xz) / det, sz = (zy * xx - xy * xz) / det, py = my, k = 0;
  // #1451: an optional `grade.crease` line [[x, z], [x, z]] (a guess) bends the plane along it: k · (distance on the
  // line's right-hand side) is added, so a pocket on a ridge of the drawn ground gets two planes meeting at the
  // ridge instead of one plane cutting through it. The least-squares start then fits all four parameters.
  const crease = anchor ? null : lot?.grade?.crease ?? null;
  let hinge = () => 0;
  if (crease) {
    const [[ax, az], [bx, bz]] = crease, len = Math.hypot(bx - ax, bz - az), cx = (bz - az) / len, cz = -(bx - ax) / len;
    hinge = (x, z) => Math.max(0, (x - ax) * cx + (z - az) * cz);
    const hm = points.reduce((s, [x, z]) => s + hinge(x, z), 0) / points.length, M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const [x, z, y] of points) { const r = [x - mx, z - mz, hinge(x, z) - hm], dy = y - my; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j]; M[i][3] += r[i] * dy; } }
    const d3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = d3(M), col = (c) => d3(M.map(r => r.map((v, j) => j === c ? r[3] : v)));
    if (Math.abs(D) < 1e-10) throw new RangeError(`Parking crease of ${lot.source ?? ''} cannot be fitted`);
    sx = col(0) / D; sz = col(1) / D; k = col(2) / D; py = my - k * hm;
  }
  let planeY = (x, z) => py + sx * (x - mx) + sz * (z - mz) + k * hinge(x, z);
  // #1443: a clipped lot is drawn on terrain cells cut along its outline and the outline inset by the
  // transition (its core). #1444: the outline may be concave; the inset then has a mitered reflex corner,
  // which lies inside the true inset (every core point is ≥ transition from the outline), and both are split
  // into convex parts for the cell clipping.
  const clip = !!lot?.grade?.clip, core = clip ? insetConvex(poly, transition) : null;
  if (clip && (Math.sign(area(core)) !== Math.sign(area(poly)) || core.some(([x, z]) => !contains(x, z)) || !simple(core))) throw new RangeError(`Parking polygon ${lot.source ?? ''} is too narrow for a ${transition} m clipped transition`);
  const edgeDistance = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return d;
  };
  // #1444: a sub-plane lot fades linearly across its band (the drawn band samples the fade only at its piece
  // corners, where the smooth step's 1.5× middle gradient steepened the edge); single planes keep the smooth step.
  const fade = lot?.grade?.fade === 'linear' ? (t) => t : (t) => t * t * (3 - 2 * t);
  // #1444: `grade.tin` replaces the single plane by a few civil sub-planes: the core triangulated over its
  // own corners only (no interior or terrain-following vertices), the corner heights least-squares fitted to the
  // existing ground along the core edge, preferring triangulations whose sub-planes stay ≤ `grade.maxSlope`, then
  // the smallest largest residual. Adjacent sub-planes share their seam edges, so the surface is continuous by
  // construction. All of it is a guess.
  let tin = null;
  if (clip && lot?.grade?.tin) {
    if (anchor || crease || lot.grade.fit === 'minimax') throw new RangeError(`Parking grade ${lot.source ?? ''}: tin is not combined with an anchor, crease or minimax fit`);
    tin = fitTin(core, points.filter(([x, z]) => Math.abs(edgeDistance(x, z) - transition) <= 1.5), lot.grade.maxSlope ?? Infinity);
    if (!tin) throw new RangeError(`Parking polygon ${lot.source ?? ''} cannot fit its civil sub-planes`);
    planeY = tin.y;
  }
  const grade = (x, z) => {
    const y = sampleBase(x, z);
    if (!contains(x, z)) return y;
    const weight = fade(clamp(edgeDistance(x, z) / transition, 0, 1));
    return y + (planeY(x, z) - y) * weight;
  };
  const maxResidual = Math.max(...points.map(([x, z, y]) => Math.abs(planeY(x, z) - y)));
  grade.contains = contains;
  grade.bounds = bounds;
  // #1443: the plane and the edge weight separately, so a refined terrain cell can fade from its
  // unchanged drawn surface (instead of the smooth sampler) to the plane.
  grade.planeY = planeY;
  grade.weight = (x, z) => { if (!contains(x, z)) return 0; return fade(clamp(edgeDistance(x, z) / transition, 0, 1)); };
  grade.edgeDistance = edgeDistance; // #1543: distance to the outline (either side), for groundY's seam outside the lot
  grade.clip = clip; // #1443: drawn on terrain cells clipped along the outline (gradedCellTriangles)
  grade.polygon = poly;
  // #1452: a concave clipped lot is cut as convex parts (convexParts); its inset core likewise. A convex lot keeps one part.
  if (clip) {
    grade.core = core; grade.inCore = (x, z) => pointIn(x, z, core);
    grade.parts = convexParts(poly); grade.coreCut = convexParts(core); grade.coreParts = grade.coreCut.flatMap(p => creaseSplit(p, crease));
    // The core's drawn polygons: the sub-plane triangles (#1444), else the convex core parts, each cut along a crease (#1451).
    grade.corePolys = tin ? tin.triangles.map(t => t.map(q => core[q])) : grade.coreParts;
    grade.weld = !!tin || grade.parts.length > 1; // #1444: weld T-junctions between the lot's cell pieces (see gradedCellTriangles)
  }
  grade.crease = crease;
  grade.hinge = hinge;
  grade.plane = tin
    ? { tin: { vertices: core, heights: tin.heights, triangles: tin.triangles, steepest: tin.steepest, candidates: tin.candidates }, maxResidual, rms: tin.rms, anchored: false, fit: 'tin' }
    : { origin: [mx, mz, py], slope: [sx, sz], maxResidual, anchored: !!anchor, fit: 'least-squares', ...(crease ? { crease: k } : {}) };
  // #1450: `grade.fit: 'minimax'` lets fitDrawnPlane replace the plane once the drawn terrain cells are known.
  grade.fit = tin ? 'tin' : lot?.grade?.fit ?? 'least-squares';
  grade.setPlane = (y, slopeX, slopeZ, fit, bend = k) => { if (anchor || tin) throw new RangeError(`Parking plane ${lot.source ?? ''} is ${tin ? 'on sub-planes' : 'anchored'}`); py = y; sx = slopeX; sz = slopeZ; k = crease ? bend : 0; grade.plane = { ...grade.plane, origin: [mx, mz, py], slope: [sx, sz], fit, ...(crease ? { crease: k } : {}) }; };
  grade.transition = transition;
  grade.source = lot.source;
  return grade;
}

// #1443: keep the part of convex `subject` on one side (side × cross ≥ 0) of line a→b.
function halfClip(subject, a, b, side) {
  const out = [];
  for (let j = 0; j < subject.length; j++) {
    const p = subject[j], q = subject[(j + 1) % subject.length], dp = side * cross(a, b, p), dq = side * cross(a, b, q);
    if (dp >= -1e-12) out.push(p);
    if ((dp < -1e-12 && dq > 1e-12) || (dp > 1e-12 && dq < -1e-12)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
// #1443: convex `subject` split by convex `cutter` into its inside part and convex outside pieces.
function splitConvex(subject, cutter) {
  const s = Math.sign(area(cutter)), outside = [];let inside = subject;
  for (let k = 0; k < cutter.length && inside.length >= 3; k++) {
    const a = cutter[k], b = cutter[(k + 1) % cutter.length], out = halfClip(inside, a, b, -s);
    if (out.length >= 3 && Math.abs(area(out)) > 1e-9) outside.push(out);
    inside = halfClip(inside, a, b, s);
  }
  return { inside: inside.length >= 3 && Math.abs(area(inside)) > 1e-9 ? inside : null, outside };
}
// #1443: a band piece cut by an inset line beyond the core corner carries that corner inside one
// edge; make it a vertex (and the fan's root) so the band meets the core there without a T-junction.
function withCorners(piece, corners) {
  for (const c of corners) for (let k = 0; k < piece.length; k++) {
    const a = piece[k], b = piece[(k + 1) % piece.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9 || Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-9 || Math.hypot(c[0] - b[0], c[1] - b[1]) < 1e-9) continue;
    const t = ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / (l * l);
    if (t > 0 && t < 1 && Math.abs(cross(a, b, c)) / l < 1e-9) return [c, ...piece.slice(k + 1), ...piece.slice(0, k + 1)];
  }
  return piece;
}
/**
 * #1452: a simple polygon split into convex parts: each reflex corner is cut along the extension of its incoming edge to
 * the first outline edge it meets (the corner then lies straight inside one part's edge). Convex input is returned as is.
 */
export function convexParts(poly) {
  const s = Math.sign(area(poly)), n = poly.length;
  const k = poly.findIndex((v, i) => s * cross(poly[(i + n - 1) % n], v, poly[(i + 1) % n]) < -1e-9);
  if (k < 0) return [poly];
  const v = poly[k], p = poly[(k + n - 1) % n], d = [v[0] - p[0], v[1] - p[1]];
  let best = null;
  for (let j = 0; j < n; j++) {
    const a = poly[j], b = poly[(j + 1) % n];
    if (j === k || (j + 1) % n === k) continue;
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - v[0]) * e[1] - (a[1] - v[1]) * e[0]) / den, u = ((a[0] - v[0]) * d[1] - (a[1] - v[1]) * d[0]) / den;
    if (t > 1e-9 && u >= -1e-12 && u <= 1 + 1e-12 && (!best || t < best.t)) best = { t, j, q: [v[0] + d[0] * t, v[1] + d[1] * t] };
  }
  if (!best) throw new RangeError('Parking outline cannot be split into convex parts');
  const walk = (from, to) => { const out = []; for (let i = from; ; i = (i + 1) % n) { out.push(poly[i]); if (i === to) return out; } };
  // drop repeated points and the straight corner (no degenerate fan triangle); both parts lie in one plane there
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9, clean = (q) => { q = q.filter((x, i) => !near(x, q[(i + 1) % q.length])); return q.filter((x, i) => Math.abs(cross(q[(i + q.length - 1) % q.length], x, q[(i + 1) % q.length])) > 1e-9 * Math.hypot(...[0, 1].map(c => q[(i + 1) % q.length][c] - q[(i + q.length - 1) % q.length][c]))); };
  // part A: v … poly[j], q; part B: q, poly[j+1] … v
  return [...convexParts(clean([...walk(k, best.j), best.q])), ...convexParts(clean([best.q, ...walk((best.j + 1) % n, k)]))];
}
// #1452 (the welded-edge idea of the unpublished #1444 candidate): insert the given points that lie strictly inside an edge of
// convex `piece`, so neighbouring band pieces of a concave lot share every vertex in the non-linear fade band.
function onEdges(piece, points) {
  const out = [];
  for (let k = 0; k < piece.length; k++) {
    const a = piece[k], b = piece[(k + 1) % piece.length], l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;out.push(a);
    if (l2 < 1e-18) continue;
    const on = [];
    for (const q of points) { const t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / l2; if (t > 1e-7 && t < 1 - 1e-7 && Math.abs(cross(a, b, q)) / Math.sqrt(l2) < 1e-7) on.push([t, q]); }
    on.sort((u, v) => u[0] - v[0]);
    for (const [, q] of on) if (Math.hypot(out.at(-1)[0] - q[0], out.at(-1)[1] - q[1]) > 1e-9) out.push(q);
  }
  return out;
}
// #1452: fan a convex polygon whose edges may carry collinear vertices from a true corner whose two edges carry none,
// otherwise from its centroid, so every vertex is used.
function safeFan(p) {
  if (p.length === 3) return fan(p);
  const n = p.length, corner = (k) => Math.abs(cross(p[(k + n - 1) % n], p[k], p[(k + 1) % n])) > 1e-9;
  const r = p.findIndex((_, k) => corner(k) && corner((k + 1) % n) && corner((k + n - 1) % n));
  if (r >= 0) return fan([...p.slice(r), ...p.slice(0, r)]);
  const m = [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n];
  return p.map((q, k) => [m, q, p[(k + 1) % n]]).filter(t => Math.abs(area(t)) > 1e-9);
}
const fan = (p) => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]).filter(t => Math.abs(area(t)) > 1e-9);
// #1451: a convex piece cut along a grade's crease line into its (at most two) planar parts.
function creaseSplit(piece, crease) {
  if (!crease) return [piece];
  return [1, -1].map(side => halfClip(piece, crease[0], crease[1], side)).filter(q => q.length >= 3 && Math.abs(area(q)) > 1e-9);
}

/**
 * #1450: for a clipped lot with `grade.fit: 'minimax'` (a *guess*, like every lot plane), replace the
 * least-squares plane by the plane (height at the fit origin and both slopes) that makes the steepest drawn
 * band/core triangle of the lot's terrain cells as gentle as possible. A shallow pocket's 1.5 m band otherwise
 * steepens the old ground where the least-squares plane leaves its edge. `cells` are the terrain cells
 * ({x0, x1, z0, z1, c} as for gradedCellTriangles) touching the lot. Deterministic Nelder–Mead from the
 * least-squares plane; returns the steepest slope before and after.
 */
export function fitDrawnPlane(grade, cells, { iterations = 200 } = {}) {
  const [mx, mz, y0] = grade.plane.origin, [sx0, sz0] = grade.plane.slope, k0 = grade.plane.crease ?? 0, bend = !!grade.crease, S = bend ? 5 : 4;
  // The cut pieces do not depend on the plane and every drawn height is linear in it (old + (plane − old) · weight):
  // cut once at the least-squares plane and once 1 m higher, then each candidate only re-weights the vertex heights.
  // #1451: a creased plane adds its bend k as a fourth parameter (each vertex also keeps its hinge distance).
  const drawn = (dy) => { grade.setPlane(y0 + dy, sx0, sz0, 'least-squares', k0); return cells.flatMap(cell => gradedCellTriangles(grade, grade.polygon, cell).filter(t => t.kind !== 'out').map(t => t.tri)); };
  const lo = drawn(0), hi = drawn(1), base = (x, z) => y0 + sx0 * (x - mx) + sz0 * (z - mz) + k0 * grade.hinge(x, z);
  const V = Float64Array.from(lo.flatMap((t, i) => t.flatMap(([x, z, y], q) => [x - mx, z - mz, y - base(x, z) * (hi[i][q][2] - y), hi[i][q][2] - y, ...(bend ? [grade.hinge(x, z)] : [])])));
  const steepest = (p) => {
    let m = 0;
    for (let i = 0; i < V.length; i += 3 * S) {
      const h = (o) => { let b = y0 + p[0] + p[1] * V[o] + p[2] * V[o + 1]; if (bend) b += p[3] * V[o + 4]; return V[o + 2] + b * V[o + 3]; }, ax = V[i], az = V[i + 1], bx = V[i + S] - ax, bz = V[i + S + 1] - az, cx = V[i + 2 * S] - ax, cz = V[i + 2 * S + 1] - az, det = bx * cz - cx * bz;
      if (Math.abs(det) < 1e-10) continue;
      const ay = h(i), by = h(i + S) - ay, cy = h(i + 2 * S) - ay;
      m = Math.max(m, Math.hypot((by * cz - cy * bz) / det, (bx * cy - cx * by) / det));
    }
    return m;
  };
  const start = bend ? [0, sx0, sz0, k0] : [0, sx0, sz0], D = start.length, step = [.05, .01, .01, .01];
  const before = steepest(start);
  let simplex = [start, ...start.map((_, d) => start.map((v, e) => e === d ? v + step[d] : v))].map(p => ({ p, f: steepest(p) }));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.f - b.f);
    const worst = simplex[D], c = start.map((_, d) => { let sum = 0; for (let q = 0; q < D; q++) sum += simplex[q].p[d]; return sum / D; }), at = (t) => c.map((v, d) => v + t * (worst.p[d] - v)), r = { p: at(-1) };r.f = steepest(r.p);
    if (r.f < simplex[0].f) { const e = { p: at(-2) };e.f = steepest(e.p);simplex[D] = e.f < r.f ? e : r; }
    else if (r.f < simplex[D - 1].f) simplex[D] = r;
    else { const kk = { p: at(.5) };kk.f = steepest(kk.p);if (kk.f < worst.f) simplex[D] = kk;else for (let q = 1; q <= D; q++) { simplex[q].p = simplex[q].p.map((v, j) => simplex[0].p[j] + (v - simplex[0].p[j]) * .5);simplex[q].f = steepest(simplex[q].p); } }
  }
  simplex.sort((a, b) => a.f - b.f);
  const best = before <= simplex[0].f ? { p: start, f: before } : simplex[0];
  grade.setPlane(y0 + best.p[0], best.p[1], best.p[2], best.f < before ? 'minimax' : 'least-squares', bend ? best.p[3] : 0);
  return { before, after: best.f };
}

/**
 * #1443: the drawn ground of one terrain cell [x0,x1]×[z0,z1] (corner heights `c` = [x0z0, x1z0, x0z1, x1z1],
 * split along the (x1,z0)–(x0,z1) diagonal like every terrain cell) under a graded lot, clipped
 * along the lot outline and along its outline inset by the grade's transition. Outside the outline the
 * pieces keep the cell's old planar triangles (the drawn ground there is unchanged); inside the inset
 * outline they lie exactly on the lot plane; only the transition band between them fades from the old
 * surface to the plane. Returns triangles of [x, z, y] with their kind ('out', 'band' or 'core'); the
 * caller draws the whole core once as `grade.corePolys` (a few triangles) instead of its per-cell pieces.
 * #1451: `others` are further clipped lots touching the same cell (the lots never overlap). Each lot's band and
 * core pieces are cut from the whole cell half exactly as if it were alone (so a minimax fit on single-lot cells
 * stays exact); only the outside pieces are cut by every lot in turn. Band/core entries carry their `grade`.
 * #1444: `welds` (Map grade → points, from gradedCellPieces over all the lot's cells) makes a welded lot's band and
 * the outside pieces beside it carry every neighbouring piece vertex lying on their edges, so the non-linear fade
 * band has no T-junction cracks between cells.
 */
export function gradedCellTriangles(grade, polygon, { x0, x1, z0, z1, c }, others = [], welds = null) {
  const out = [], inCell = ([x, z]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6;
  const weldOf = new Map([grade, ...others].filter(g => welds?.has(g)).map(g => [g, welds.get(g).filter(inCell)]));
  const old = (h, x, z) => { const f = (x - x0) / (x1 - x0), g = (z - z0) / (z1 - z0); return h === 0 ? c[0] + (c[1] - c[0]) * f + (c[2] - c[0]) * g : c[3] + (c[2] - c[3]) * (1 - f) + (c[1] - c[3]) * (1 - g); };
  for (const { kind, h, g, piece } of gradedCellPieces(grade, { x0, x1, z0, z1 }, others, polygon)) {
    if (kind === 'out') { for (const t of fan(piece)) out.push({ kind, tri: t.map(([x, z]) => [x, z, old(h, x, z)]) }); continue; }
    if (kind === 'core') { for (const t of fan(piece)) out.push({ kind, grade: g, tri: t.map(([x, z]) => [x, z, g.planeY(x, z)]) }); continue; }
    const weld = weldOf.get(g), p = weld ? onEdges(piece, weld) : withCorners(piece, g.core ?? insetConvex(g.polygon, g.transition));
    for (const t of weld ? safeFan(p) : fan(p)) out.push({ kind, grade: g, tri: t.map(([x, z]) => { const y = old(h, x, z); return [x, z, y + (g.planeY(x, z) - y) * g.weight(x, z)]; }) });
  }
  return out;
}
/**
 * #1444: the convex pieces of one terrain cell under clipped lots ({kind: 'out' | 'band' | 'core', h: cell half, g: grade
 * (null outside), piece}), split along each lot's convex parts and core parts (one each for a convex lot) and crease.
 * `polygon` overrides the first lot's outline (#1443's callers pass it explicitly).
 */
export function gradedCellPieces(grade, { x0, x1, z0, z1 }, others = [], polygon = grade.polygon) {
  const out = [], halves = [[[x0, z0], [x1, z0], [x0, z1]], [[x1, z0], [x1, z1], [x0, z1]]];
  const cut = (pieces, cutters) => { let rest = pieces; const inside = []; for (const P of cutters) { const next = []; for (const q of rest) { const sp = splitConvex(q, P); if (sp.inside) inside.push(sp.inside); next.push(...sp.outside); } rest = next; } return { inside, outside: rest }; };
  const lots = [{ g: grade, poly: ring(polygon) }, ...others.map(g => ({ g, poly: g.polygon }))];
  for (let h = 0; h < 2; h++) {
    let rest = [halves[h]];
    for (const { g, poly } of lots) {
      const own = poly === g.polygon, parts = own && g.parts ? g.parts : [poly], coreParts = own && g.coreParts ? g.coreParts : [insetConvex(poly, g.transition)];
      rest = cut(rest, parts).outside;
      const inner = cut(cut([halves[h]], parts).inside, coreParts);
      for (const piece of inner.inside) for (const part of creaseSplit(piece, g.crease)) out.push({ kind: 'core', h, g, piece: part });
      for (const piece of inner.outside) for (const part of creaseSplit(piece, g.crease)) out.push({ kind: 'band', h, g, piece: part });
    }
    for (const piece of rest) out.push({ kind: 'out', h, g: null, piece });
  }
  return out;
}

/**
 * Lay a guessed double-loaded aisle and bay separators inside the existing
 * Nattsländegatan parking polygon. The 15-bay count follows the current guessed
 * capacity; 8+7 bays use 2.5×5 m footprints and a 6 m clear aisle. No road or
 * surveyed driveway is created.
 */
export function createParkingLayout(lot, { bayWidth = lot?.layout?.bayWidth ?? DEFAULTS.bayWidth, bayDepth = lot?.layout?.bayDepth ?? DEFAULTS.bayDepth, aisleWidth = DEFAULTS.aisleWidth, start = lot?.layout?.start ?? null, boxes = !!lot?.layout?.boxes } = {}) {
  if (lot?.layout?.aisle) return createAisleLayout(lot, { bayWidth, bayDepth });
  // #1451: `layout.bayDepth`/`bayWidth` (guess) size one lot's boxes, so a pocket shallower than 5 m keeps whole boxes inside its outline.
  // #1443: `layout.row` ('north' = the n0 long edge, 'south' = n1) lays one row of `layout.count`
  // boxes along that edge only; the rest of the lot's width is the clear aisle (no second row).
  const single = lot?.layout?.row ?? null;
  // #1450: a street-side pocket (`layout.street.road`) has no aisle of its own: the mapped street in front of
  // its single row is the driving lane, so only one box depth must fit and the row stands on the far edge.
  const street = single ? lot?.layout?.street ?? null : null;
  const poly = ring(lot?.polygon ?? []);
  if (poly.length !== 4 || !(bayWidth > 0 && bayDepth > 0 && aisleWidth > 0)) throw new TypeError('Nattsländegatan layout needs its four-corner lot and positive dimensions');
  const edges = poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  const long = edges.reduce((best, e) => e.len > best.len ? e : best);
  let u = [(long.b[0] - long.a[0]) / long.len, (long.b[1] - long.a[1]) / long.len];
  if (u[0] < 0) u = [-u[0], -u[1]];
  const n = [-u[1], u[0]], proj = (p, v) => p[0] * v[0] + p[1] * v[1];
  const us = poly.map((p) => proj(p, u)), ns = poly.map((p) => proj(p, n));
  const u0 = Math.min(...us), u1 = Math.max(...us), n0 = Math.min(...ns), n1 = Math.max(...ns), width = n1 - n0;
  // #1437: a `boxes` layout keeps bays exactly bayDepth deep (the remaining width
  // widens the clear aisle) and also paints each row's two end dividers, so every
  // bay is a box closed by the lot edge behind it. An aisle-side front line per
  // row was tried and dropped: following the terrain it cost 332 triangles,
  // more than the old full-width lines saved.
  const rowDepth = boxes || single ? bayDepth : (width - aisleWidth) / 2;
  const need = street ? 0 : aisleWidth;
  if (street) {
    const road = [...(SITE.south.paths ?? []), ...(SITE.south.access ?? [])].find(r => r.source === street.road);
    if (!road) throw new RangeError(`Parking street ${street.road} is not mapped`);
    const near = road.path.reduce((best, p) => Math.abs(proj(p, u) - (u0 + u1) / 2) < Math.abs(proj(best, u) - (u0 + u1) / 2) ? p : best);
    const streetSide = proj(near, n) < n0 ? 'north' : proj(near, n) > n1 ? 'south' : null;
    if (!streetSide || streetSide === single) throw new RangeError(`Parking row ${single} must face street ${street.road} across the lot (street side ${streetSide})`);
  }
  if (single ? width - need + 1e-6 < bayDepth : (width - aisleWidth) / 2 + 1e-6 < bayDepth) throw new RangeError(`Parking polygon is too narrow for ${single ? 'one' : 'two'} guessed bay row${single ? '' : 's'}${street ? '' : ' and a clear aisle'}`);
  // #1443: a single row stands on its long edge's inner corner (the edges are not exactly parallel), so no box pokes out.
  const sortedN = [...ns].sort((a, b) => a - b), rowEdge = single === 'north' ? sortedN[1] : sortedN.at(-2);
  // The clear aisle is the guaranteed width: from the row's front to the opposite edge's inner corner.
  const clear = single === 'south' ? rowEdge - rowDepth - sortedN[1] : single === 'north' ? sortedN.at(-2) - rowEdge - rowDepth : width - 2 * rowDepth, mid = single === 'south' ? rowEdge - rowDepth - clear / 2 : single === 'north' ? rowEdge + rowDepth + clear / 2 : (n0 + n1) / 2, aisleRect = [[u0,mid-clear/2],[u1,mid-clear/2],[u1,mid+clear/2],[u0,mid+clear/2]].map(([v,w])=>[u[0]*v+n[0]*w,u[1]*v+n[1]*w]), aisle=clipConvex(aisleRect,poly);
  // #1437: an optional `start` (m from the lot's u0 end) aligns both rows there
  // instead of centring them, freeing the other end for an entrance and turning.
  const rowStart = (count) => start == null ? (u0 + u1 - count * bayWidth) / 2 : u0 + start;
  // #1437: a mapped way crossing the n0 row (`lot.layout.entrance.road`) keeps its
  // own strip, plus `margin`, free of bays; later bays in that row move past it.
  const skip = entranceGap(lot, { u, n, n0, depth: boxes ? bayDepth : (width - aisleWidth) / 2 });
  const centers = (count, side) => { let at = rowStart(count); return Array.from({ length: count }, () => { if (side === 'north' && skip && at < skip[1] && at + bayWidth > skip[0]) at = skip[1]; const c = at + bayWidth / 2; at += bayWidth; return c; }); };
  const rowSpecs = single ? [{ side: single, edge: rowEdge, count: lot.layout.count, inward: single === 'north' ? 1 : -1 }] : [{ side: 'north', edge: n0, count: Math.ceil(lot.capacity / 2), inward: 1 }, { side: 'south', edge: n1, count: Math.floor(lot.capacity / 2), inward: -1 }];
  const stalls = [], segments = [], markingSegments = [];
  for (const row of rowSpecs) {
    const rowNear = row.edge + row.inward * rowDepth, rowFar = row.edge;
    const rowCenters = centers(row.count, row.side);
    for (const center of rowCenters) {
      const half = bayWidth / 2, a = center - half, b = center + half;
      const corners = [
        [u[0]*a+n[0]*rowFar,u[1]*a+n[1]*rowFar], [u[0]*b+n[0]*rowFar,u[1]*b+n[1]*rowFar],
        [u[0]*b+n[0]*rowNear,u[1]*b+n[1]*rowNear], [u[0]*a+n[0]*rowNear,u[1]*a+n[1]*rowNear],
      ];
      const footprint=clipConvex(corners,poly);
      if(footprint.length>=3)stalls.push({ polygon: footprint, center: [u[0]*center+n[0]*(rowFar+rowNear)/2, u[1]*center+n[1]*(rowFar+rowNear)/2], width: bayWidth, depth: bayDepth, side: row.side, area: Math.abs(area(footprint)) });
    }
    const count = row.count;
    // The polygon's long edges delimit the outer bays, so render only the
    // internal aisle-side dividers. Keeping the two edge segments in the
    // layout still helps footprint inspection without spending draw triangles.
    // (#1437 `boxes` paints those outer dividers too.) Divider positions: both
    // edges of every bay, shared where bays touch.
    const cuts = rowCenters.flatMap(c => [c - bayWidth / 2, c + bayWidth / 2]).filter((v, i, all) => i === 0 || Math.abs(v - all[i - 1]) > 1e-6);
    for (let i = 0; i < cuts.length; i++) {
      const at = cuts[i], outer = i === 0 || i === cuts.length - 1;
      const segment=clipSegment([[u[0]*at+n[0]*rowFar,u[1]*at+n[1]*rowFar],[u[0]*at+n[0]*rowNear,u[1]*at+n[1]*rowNear]],poly);if(segment){segments.push(segment);if(boxes||!outer)markingSegments.push(segment);}
    }
  }
  return { aisle: street ? null : aisle, stalls, segments, markingSegments, entrance: skip, street: street?.road ?? null, axes: { u, n }, origin: { u0, n0, n1 }, dimensions: { bayWidth, bayDepth, aisleWidth: street ? 0 : aisleWidth, lotWidth: width, rowDepth, clearAisle: clear, length: u1-u0 } };
}

const segDist = (p, q, a, b) => {
  const d = (s, t, v) => { const dx = t[0] - s[0], dz = t[1] - s[1], k = clamp(((v[0] - s[0]) * dx + (v[1] - s[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(v[0] - s[0] - dx * k, v[1] - s[1] - dz * k); };
  const c1 = cross(p, q, a), c2 = cross(p, q, b), c3 = cross(a, b, p), c4 = cross(a, b, q);
  if (c1 * c2 < 0 && c3 * c4 < 0) return 0;
  return Math.min(d(p, q, a), d(p, q, b), d(a, b, p), d(a, b, q));
};
const pointIn = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };

/**
 * #1441: rows of whole guessed boxes along a mapped way that runs through a
 * concave lot (`lot.layout.aisle.road`). The way's straight centre line is the
 * aisle axis; each `rows` entry is one side (−1/+1 along n) at a guessed
 * `offset` from that line, optionally limited to `from`…`to` m along the way.
 * Boxes are packed from the start of each range and kept only where the whole
 * box (widened by half a paint line) lies inside the polygon and clear of the
 * aisle way and every `clear` way strip (half width + margin), so the rows
 * break around the lot's necks, notches, the house edge and the mapped entrance.
 */
function createAisleLayout(lot, { bayWidth, bayDepth }) {
  const poly = ring(lot.polygon ?? []), L = lot.layout, ways = [...(SITE.south.paths ?? []), ...(SITE.south.access ?? [])], way = (s) => { const r = ways.find(w => w.source === s); if (!r) throw new RangeError(`Parking layout way ${s} is not mapped`); return r; };
  // #1452: `aisle.from` (a path vertex index) uses only the way's straight end from that vertex on as the aisle axis
  // (service way 335403605 bends before it enters 1379042188); the whole way stays clear.
  const road = way(L.aisle.road), axis = road.path.slice(L.aisle.from ?? 0), a = axis[0], b = axis.at(-1), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-u[1], u[0]], proj = (p, v) => p[0] * v[0] + p[1] * v[1];
  const c = axis.reduce((s, p) => s + proj(p, n), 0) / axis.length, ua = proj(a, u);
  if (axis.some(p => Math.abs(proj(p, n) - c) > .1)) throw new RangeError(`Parking aisle way ${road.source} is not straight`);
  const margin = L.margin ?? .25, paint = (L.paint ?? .08) / 2, at = (v, w) => [u[0] * v + n[0] * w, u[1] * v + n[1] * w];
  const clear = [road, ...(L.clear ?? []).map(way)].map(r => ({ source: r.source, path: r.path, keep: (Array.isArray(r.w) ? Math.max(...r.w) : r.w) / 2 + margin }));
  const us = poly.map(p => proj(p, u)), lotU0 = Math.min(...us), lotU1 = Math.max(...us), boxArea = (bayWidth + 2 * paint) * bayDepth;
  const fits = (box) => box.every(([x, z]) => pointIn(x, z, poly)) && Math.abs(area(clipConvex(poly, box))) >= boxArea - 1e-6 && clear.every(r => r.path.slice(1).every((q, i) => box.every((p, k) => segDist(r.path[i], q, p, box[(k + 1) % 4]) >= r.keep - 1e-6) ) && r.path.every(q => !pointIn(q[0], q[1], box)));
  const stalls = [], segments = [], runs = [];
  for (const row of L.rows ?? []) {
    const side = Math.sign(row.side), near = c + side * row.offset, far = near + side * bayDepth;
    const lo = row.from == null ? lotU0 : ua + row.from, hi = row.to == null ? lotU1 : ua + row.to;
    let run = null;
    for (let t = lo; t + bayWidth <= hi + 1e-9;) {
      const box = [at(t - paint, near), at(t + bayWidth + paint, near), at(t + bayWidth + paint, far), at(t - paint, far)];
      if (!fits(box)) { t = Math.round((t + .01) * 100) / 100; run = null; continue; }
      if (!run) runs.push(run = { side, offset: row.offset, cuts: [t] });
      const footprint = [at(t, near), at(t + bayWidth, near), at(t + bayWidth, far), at(t, far)];
      stalls.push({ polygon: footprint, center: at(t + bayWidth / 2, (near + far) / 2), width: bayWidth, depth: bayDepth, side, offset: row.offset, area: Math.abs(area(footprint)) });
      t += bayWidth; run.cuts.push(t); run.near = near; run.far = far;
    }
  }
  for (const r of runs) for (const v of r.cuts) segments.push([at(v, r.near), at(v, r.far)]);
  return { aisle: null, stalls, segments, markingSegments: segments, entrance: null, clear: clear.map(r => r.source), runs, axes: { u, n }, origin: { u0: ua, n0: c, n1: c }, dimensions: { bayWidth, bayDepth, aisleWidth: Math.min(...(L.rows ?? []).map(r => r.offset)) * 2, length: lotU1 - lotU0 } };
}

/**
 * #1441: a polygon's surface triangles cut along the terrain mesh, as cutAtTerrain
 * does, but every terrain half-cell whose pieces together form one convex polygon
 * is emitted as a fan over that polygon. renderedTerrainY is linear inside a
 * half-cell, so the drawn surface is unchanged; only the pieces from the
 * polygon's own triangulation seams disappear. Refined cells keep their pieces.
 */
export function cellTriangles(polygon, grid) {
  const poly = ring(polygon), idx = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pieces = idx.flatMap(t => grid ? cutAtTerrain(t.map(k => poly[k]), grid) : [t.map(k => poly[k])]);
  if (!grid) return pieces;
  const X = [grid.X[0] - 1e3, ...grid.X, grid.X.at(-1) + 1e3], Z = [grid.Z[0] - 1e3, ...grid.Z, grid.Z.at(-1) + 1e3], groups = new Map(), out = [];
  for (const tri of pieces) {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    let i = 0; while (i < X.length - 2 && X[i + 1] <= cx) i++;
    let j = 0; while (j < Z.length - 2 && Z[j + 1] <= cz) j++;
    // #1443: a refined cell is grouped per half of each of its n×n sub-cells (renderedTerrainY is linear there).
    const s = grid.refined?.(i - 1, j - 1) ?? 1, fx = (cx - X[i]) / (X[i + 1] - X[i]) * s, fz = (cz - Z[j]) / (Z[j + 1] - Z[j]) * s, a = Math.min(s - 1, Math.floor(fx)), b = Math.min(s - 1, Math.floor(fz));
    const key = `${i},${j},${a},${b},${fx - a + fz - b < 1 ? 0 : 1}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(tri);
  }
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const list of groups.values()) {
    if (list.length === 1) { out.push(list[0]); continue; }
    const pts = list.flat().sort((a, b) => a[0] - b[0] || a[1] - b[1]), lo = [], up = [];
    for (const q of pts) { while (lo.length > 1 && turn(lo.at(-2), lo.at(-1), q) <= 1e-9) lo.pop(); lo.push(q); }
    for (const q of pts.reverse()) { while (up.length > 1 && turn(up.at(-2), up.at(-1), q) <= 1e-9) up.pop(); up.push(q); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1)), sum = list.reduce((s, t) => s + Math.abs(area(t)), 0);
    if (hull.length >= 3 && hull.length - 2 < list.length && Math.abs(Math.abs(area(hull)) - sum) < 1e-6) for (let k = 1; k < hull.length - 1; k++) out.push([hull[0], hull[k], hull[k + 1]]);
    else out.push(...list);
  }
  return out;
}

function lineGeometry(segment, width, ground, lift, grid, boundary, merge = false, cells = null) {
  const [p0,p1]=segment, dx=p1[0]-p0[0], dz=p1[1]-p0[1], len=Math.hypot(dx,dz);
  if (len < 1e-8) return null;
  const nx=-dz/len*width/2,nz=dx/len*width/2,quad=[[p0[0]-nx,p0[1]-nz],[p0[0]+nx,p0[1]+nz],[p1[0]+nx,p1[1]+nz],[p1[0]-nx,p1[1]-nz]],poly=boundary?clipConvex(quad,boundary):quad,triangles=cells?cells.flatMap(t=>fan(clipConvex(poly,t))):merge?cellTriangles(poly,grid):poly.slice(1,-1).flatMap((_,i)=>{const tri=[poly[0],poly[i+1],poly[i+2]];return grid?cutAtTerrain(tri,grid):[tri];}),positions=[];
  for(const tri of triangles)for(const [x,z] of tri)positions.push(x,ground(x,z)+lift,z);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const color=new THREE.Color(0xeeeeea);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:positions.length/3},()=>[color.r,color.g,color.b]).flat(),3));g.computeVertexNormals();
  return g;
}

/** #1443: a clipped lot's drawn terrain pieces inside its outline (its whole planar core and the band's triangles), as convex [x, z] polygons; null for other lots. */
export function lotCells(lot, ground) {
  if (!lot?.grade?.clip) return null;
  const poly = ring(lot.polygon);
  return (ground.lotTriangles?.() ?? []).filter(t => pointIn(t.reduce((s, q) => s + q[0], 0) / t.length, t.reduce((s, q) => s + q[1], 0) / t.length, poly)).map(t => t.map(([x, z]) => [x, z]));
}
/** #1443: the same pieces as triangles, for the lot's asphalt. */
export const lotTriangles = (lot, ground) => lotCells(lot, ground).flatMap(fan);
/** Return paint meshes following the existing emitted terrain sampler. Asphalt itself is already drawn by southbackdrop. */
export function parkingLayoutParts(lot, ground) {
  const layout=createParkingLayout(lot),grid=ground.grid?.()??null,aisle=!!lot.layout?.aisle,cells=lotCells(lot,ground),markings=layout.markingSegments.map(s=>lineGeometry(s,.08,ground,.052+.024,grid,aisle?null:insetConvex(ring(lot.polygon),.01),aisle,cells)).filter(Boolean); // #1441: concave aisle lots keep each box (widened by half a line) inside the outline instead of clipping. #1443: a clipped lot's lines are cut along its own drawn terrain triangles
  return{surface:null,markings,layout};
}
/**
 * #1450: a street-side pocket's narrow apron (`layout.street.apron`, *guess*) over the existing grass gap
 * between its street edge and the mapped street's emitted strip edge, so its boxes open onto the asphalt.
 * Neither the street nor the pocket outline moves: the apron runs from the pocket edge (the lot edge nearest
 * the street) to the strip's offset polyline (road samples at half width, as pathStrip draws it), reaching
 * `overlap` m under the street. Where the street bends away the strip is only followed up to `maxGap` m from
 * the pocket edge; the apron then closes straight back to the pocket's corner. Returns the polygon and a lift
 * that falls linearly from the lot asphalt's lift at the pocket edge to the street's at the strip edge, or null.
 */
export function streetApron(lot, { overlap = .02, maxGap = 2, lotLift = .052, streetLift = .025 } = {}) {
  const st = lot?.layout?.street;if (!st?.apron) return null;
  const road = [...(SITE.south.paths ?? []), ...(SITE.south.access ?? [])].find(r => r.source === st.road);
  if (!road) throw new RangeError(`Parking street ${st.road} is not mapped`);
  const poly = ring(lot.polygon), d2 = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
  const toRoad = p => Math.min(...road.path.slice(1).map((q, i) => d2(p, road.path[i], q)));
  const e = poly.map((a, i) => [a, poly[(i + 1) % poly.length]]).reduce((best, s) => toRoad([(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2]) < toRoad([(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2]) ? s : best);
  const [a, b] = e, len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let v = [-u[1], u[0]];const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] > 0) v = [-v[0], -v[1]]; // v points away from the lot, towards the street
  const uv = p => [(p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], (p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]], xz = ([s, t]) => [a[0] + u[0] * s + v[0] * t, a[1] + u[1] * s + v[1] * t];
  const S = samples(road), half = (Array.isArray(road.w) ? Math.max(...road.w) : road.w) / 2;
  const sides = [1, -1].map(k => S.map(p => uv([p.x + p.nx * (p.w ?? half * 2) / 2 * k, p.z + p.nz * (p.w ?? half * 2) / 2 * k])));
  const edge = sides.reduce((best, s) => Math.min(...s.filter(q => q[0] >= 0 && q[0] <= len).map(q => Math.abs(q[1])), Infinity) < Math.min(...best.filter(q => q[0] >= 0 && q[0] <= len).map(q => Math.abs(q[1])), Infinity) ? s : best);
  // the strip edge inside [0, len] × [0, maxGap] (u along the pocket edge, v towards the street)
  const box = [[0, 0], [len, 0], [len, maxGap], [0, maxGap]], pieces = [];
  for (let i = 1; i < edge.length; i++) { const seg = clipSegment([edge[i - 1], edge[i]], box); if (seg && Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > 1e-9) pieces.push(seg); }
  if (!pieces.length) return null;
  // the strip edge's sample points along a straight street are collinear: keep only its corners
  const line = [pieces[0][0], ...pieces.map(s => s[1])].sort((p, q) => p[0] - q[0]).filter((p, i, all) => i === 0 || i === all.length - 1 || Math.abs(cross(all[i - 1], all[i + 1], p)) / Math.hypot(all[i + 1][0] - all[i - 1][0], all[i + 1][1] - all[i - 1][1]) > 1e-4);
  if (line.some(([, t]) => t < 0)) throw new RangeError(`Street ${st.road} overlaps parking ${lot.source}`);
  const gapAt = s => { if (s <= line[0][0]) return line[0][1]; for (let i = 1; i < line.length; i++) if (s <= line[i][0]) { const p = line[i - 1], q = line[i], f = (s - p[0]) / (q[0] - p[0] || 1); return p[1] + (q[1] - p[1]) * f; } return line.at(-1)[1]; };
  // reach `overlap` under the street: push the strip edge outward along v
  const far = line.map(([s, t]) => [s, t + overlap]);
  const polygon = [[0, 0], [len, 0], ...far.slice().reverse()].map(xz).filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6);
  const lift = (x, z) => { const [s, t] = uv([x, z]), g = gapAt(s); return lotLift - (lotLift - streetLift) * clamp(t / (g || 1), 0, 1 + overlap / (g || 1)); };
  return { polygon, lift, edge: [a, b], gaps: line.map(([s, t]) => [s, t]), road: road.source, overlap, maxGap };
}
export function parking1442Parts(ground) {
  const lot=SITE.south.parking.find(p=>p.source===SOURCE);if(!lot)return{surface:null,markings:[],layout:null};
  return parkingLayoutParts(lot,ground);
}
