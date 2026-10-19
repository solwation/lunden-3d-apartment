// Convex polygon subtraction for road junctions. Subject vertices are [x, y, z];
// cutter vertices are [x, z]. Interpolate y on the original triangle's plane so
// clipping cannot undo the terrain subdivisions made by roads.js.
const EPS = 1e-9;
const area = (p) => p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1];
}, 0);

export function subtractConvex(subject, cutter) {
  const sign = Math.sign(area(cutter));
  if (!sign) return [subject];
  let inside = subject;
  const outside = [];
  for (let i = 0; i < cutter.length && inside.length >= 3; i++) {
    const a = cutter[i], b = cutter[(i + 1) % cutter.length];
    const distance = (p) => sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const yes = [], no = [];
    for (let j = 0; j < inside.length; j++) {
      const p = inside[j], q = inside[(j + 1) % inside.length], dp = distance(p), dq = distance(q);
      if (dp >= -EPS) yes.push(p);
      if (dp < -EPS) no.push(p);
      if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
        const t = dp / (dp - dq), v = p.map((n, k) => n + (q[k] - n) * t);
        yes.push(v); no.push(v);
      } else if (Math.abs(dp) <= EPS && dq < -EPS) no.push(p);
      else if (dp < -EPS && Math.abs(dq) <= EPS) no.push(q);
    }
    if (no.length >= 3) outside.push(no);
    inside = yes;
  }
  return outside;
}

/** Index the small convex pieces of the actual drawn road surface, once per
 * scene. Queries inspect only nearby pieces, including at negative coordinates. */
export function polygonCutter(pieces, cellSize) {
  const cells = new Map();
  const bounds = (p, z) => ({ x0: Math.min(...p.map(v => v[0])), x1: Math.max(...p.map(v => v[0])), z0: Math.min(...p.map(v => v[z])), z1: Math.max(...p.map(v => v[z])) });
  const keys = function* (b) {
    for (let x = Math.floor(b.x0 / cellSize); x <= Math.floor(b.x1 / cellSize); x++)
      for (let z = Math.floor(b.z0 / cellSize); z <= Math.floor(b.z1 / cellSize); z++) yield `${x},${z}`;
  };
  for (const piece of pieces) {
    piece.bounds = bounds(piece.poly, 1);
    for (const key of keys(piece.bounds)) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(piece);
    }
  }
  return (triangle, skip = null) => {
    const box = bounds(triangle, 2), candidates = new Set();
    for (const key of keys(box)) for (const p of cells.get(key) ?? []) if (p.owner !== skip) candidates.add(p);
    let result = [triangle];
    for (const { poly, bounds: b } of candidates) {
      if (b.x1 <= box.x0 || b.x0 >= box.x1 || b.z1 <= box.z0 || b.z0 >= box.z1) continue;
      result = result.flatMap(p => subtractConvex(p, poly));
      if (!result.length) break;
    }
    return result;
  };
}
