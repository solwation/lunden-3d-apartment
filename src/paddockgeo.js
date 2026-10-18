// #1280: the pony paddock's plan geometry, with no three.js (collision in farwalk.js, the node test and paddock.js share it).
// The paddock is the mapped kidney-shaped meadow (SITE.south.fields, OSM way PADDOCK.field); the fence runs `PADDOCK.inset` m inside
// its outline. Everything is derived from that polygon, so what is drawn is what blocks and what the ponies stay inside.
import { SITE, PADDOCK as P } from './config.js';

const field = SITE.south.fields.find((f) => f.source === P.field);
const open = (p) => (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);
const area = (p) => p.reduce((a, q, i) => a + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0) / 2;

/** The mapped outline (counter-clockwise in x/z with z down, i.e. area > 0, no repeated closing point). */
export const outline = (() => { const p = open(field.polygon).map((q) => [q[0], q[1]]); return area(p) < 0 ? p.reverse() : p; })();

export const inPoly = (p, x, z) => {
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes;
  return yes;
};
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};
/** Distance from (x, z) to the nearest edge of the closed ring `p`. */
export const ringDist = (p, x, z) => { let d = Infinity; for (let i = 0; i < p.length; i++) d = Math.min(d, segDist(x, z, p[i], p[(i + 1) % p.length])); return d; };

/** `p` pushed `d` m inwards (mitred corners, clamped); points that would cross the outline or come nearer than 0.85 d to it are dropped. */
export function insetRing(p, d) {
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    // inward normal of a counter-clockwise (z down) ring is (dz, -dx)... checked below by `inPoly`, so take the side that is inside
    let n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2], bx = n1[0] + n2[0], bz = n1[1] + n2[1];
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) continue;
    const k = Math.min(d / (bl / 2), d * 2.5); // miter length d / cos(half angle), clamped
    let x = b[0] + (bx / bl) * k, z = b[1] + (bz / bl) * k;
    if (!inPoly(p, x, z)) { x = b[0] - (bx / bl) * k; z = b[1] - (bz / bl) * k; } // (the other side: concave corners and orientation)
    if (inPoly(p, x, z) && ringDist(p, x, z) >= d * 0.85) out.push([x, z]);
  }
  return out;
}

/** The fence line: the outline inset by PADDOCK.inset. */
export const fenceLine = insetRing(outline, P.inset);
/** The fence's posts: every corner plus equal divisions of each edge to at most PADDOCK.postStep m (a closed loop, no repeat). */
export const posts = (() => {
  const out = [], n = fenceLine.length;
  for (let i = 0; i < n; i++) {
    const a = fenceLine[i], b = fenceLine[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(len / P.postStep));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
})();
/** The span (index i: post i → post i+1) whose middle is nearest PADDOCK.gate.near; the closed gate fills it. */
export const gateSpan = (() => {
  let best = 0, bd = Infinity;
  posts.forEach((a, i) => { const b = posts[(i + 1) % posts.length], d = Math.hypot((a[0] + b[0]) / 2 - P.gate.near[0], (a[1] + b[1]) / 2 - P.gate.near[1]); if (d < bd) { bd = d; best = i; } });
  return best;
})();

/** Is (x, z) inside the fence line, at least `margin` m from it? */
export const insideFence = (x, z, margin = 0) => inPoly(fenceLine, x, z) && (margin <= 0 || ringDist(fenceLine, x, z) >= margin);
/** The stile (#1295): a step-over beside the gate in the neighbouring span (the next one after the gate, else the one before) that is long enough:
 *  centre (x, z) on the fence line, `t` along the fence, `n` the horizontal unit normal pointing into the paddock, `half` half its width, `t0`/`t1` its edges as fractions of its span. */
export const stile = (() => {
  const n = posts.length, W = P.stile.w / 2;
  for (const j of [(gateSpan + 1) % n, (gateSpan + n - 1) % n]) {
    const a = posts[j], b = posts[(j + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < P.stile.minSpan) continue;
    const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    let nx = tz, nz = -tx; if (!insideFence(cx + nx * 0.6, cz + nz * 0.6)) { nx = -nx; nz = -nz; }
    return { span: j, x: cx, z: cz, tx, tz, nx, nz, half: W, len, t0: 0.5 - W / len, t1: 0.5 + W / len };
  }
  return null;
})();

/** Collision segments [x0, z0, x1, z1]: the whole fence including the closed gate (nothing is walkable through it) except the stile's opening. */
export const fenceSegments = () => posts.flatMap((a, i) => {
  const b = posts[(i + 1) % posts.length];
  if (!stile || i !== stile.span) return [[a[0], a[1], b[0], b[1]]];
  const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [[a[0], a[1], ...p(stile.t0)], [...p(stile.t1), b[0], b[1]]];
});
/** The stile's two side walls (collision only): from `reach` m outside the fence line to `reach` m inside it, along both edges of the steps. */
export const stileWalls = () => !stile ? [] : [-1, 1].map((k) => {
  const x = stile.x + stile.tx * k * stile.half, z = stile.z + stile.tz * k * stile.half, r = P.stile.reach;
  return [x - stile.nx * r, z - stile.nz * r, x + stile.nx * r, z + stile.nz * r];
});
/** The point on the fence line nearest (x, z). */
export function nearestOnFence(x, z) {
  let best = null;
  for (let i = 0; i < fenceLine.length; i++) {
    const a = fenceLine[i], b = fenceLine[(i + 1) % fenceLine.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), qx = a[0] + t * dx, qz = a[1] + t * dz, d = Math.hypot(qx - x, qz - z);
    if (!best || d < best.d) best = { x: qx, z: qz, d };
  }
  return best;
}
/** A rough centre of the paddock (for the distance gate) and its radius. */
export const centre = (() => {
  const xs = fenceLine.map((q) => q[0]), zs = fenceLine.map((q) => q[1]), x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { x, z, r: Math.max(...fenceLine.map((q) => Math.hypot(q[0] - x, q[1] - z))) };
})();
