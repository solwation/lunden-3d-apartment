import { GLASS_PANES } from './config.js';
// #2087: opaque façade glass gets a calm, fixed variation between panes and a soft vertical gradient inside each pane,
// written once into a vertex colour (the materials multiply it); no texture, uniform, draw or per-frame work.
// Plain arithmetic (no three.js import) so tools/glasspanestest.mjs runs in Node.
const hash = (x, y, z) => { // deterministic 0…1 pair from a pane's centre rounded to cm
  let h = Math.imul(Math.round(x * 100) | 0, 73856093) ^ Math.imul(Math.round(y * 100) | 0, 19349663) ^ Math.imul(Math.round(z * 100) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return [(h & 0xffff) / 0xffff, ((h >>> 16) & 0xffff) / 0xffff];
};
/** sRGB hex → linear [r, g, b], as THREE.Color(hex) gives with colour management on (vertex colours are linear). */
const linear = (hex) => [16, 8, 0].map((s) => { const c = ((hex >> s) & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** A pane's colour function of relative height t (0 bottom … 1 top), for a pane centred at (x, y, z). */
function pane(x, y, z, base, sky, P) {
  const [a, b] = hash(x, y, z), l0 = 1 + P.lightness * (2 * a - 1), k = P.tone * (2 * b - 1), c = [base[0] * (1 - k), base[1], base[2] * (1 + k)];
  return (t, out, o) => { const l = l0 * (1 + P.gradient * (t - 0.5)), m = P.sky * t; for (let i = 0; i < 3; i++) out[o + i] = c[i] * l + (sky[i] - c[i] * l) * m; };
}
/** The linear colour of a point at relative height t (0 bottom … 1 top) of a pane centred at (x, y, z). */
export function paneColor(x, y, z, t, baseHex = 0xffffff, P = GLASS_PANES.near) {
  const out = [0, 0, 0]; pane(x, y, z, linear(baseHex), linear(P.skyColor), P)(t, out, 0); return out;
}
/** Gives every geometry a `color` attribute (replacing one it has) and returns the list; a geometry larger than
 * GLASS_PANES.paneMax is a merged batch: made non-indexed and varied per triangle (a rectangle's two triangles share
 * its bounding box, so a pane stays one colour). `rooms` (#2180, interiormap.js roomVertex) also bakes each pane's fake room into
 * the roomC / roomA / roomB vec4 attributes (a function of the pane's bounding box; omit it for glass without the room shader). */
export function paneTints(geos, baseHex = 0xffffff, P = GLASS_PANES.near, rooms = null) {
  const base = linear(baseHex), sky = linear(P.skyColor);
  return geos.map((g) => {
    let p = g.attributes.position;
    const box = (from, to) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = from; i < to; i++) for (let j = 0; j < 3; j++) { const v = p.getComponent(i, j); if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
      return [lo, hi]; };
    const [lo, hi] = box(0, p.count), whole = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) <= GLASS_PANES.paneMax;
    if (!whole && g.index) { g = g.toNonIndexed(); p = g.attributes.position; }
    const c = new Float32Array(p.count * 3), room = rooms ? new Float32Array(p.count * 12) : null;
    const paint = (from, to, [x0, y0, z0], [x1, y1, z1]) => {
      if (room) { const v = rooms([x0, y0, z0], [x1, y1, z1]); for (let i = from; i < to; i++) room.set(v, i * 12); }
      const f = pane((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, base, sky, P);
      for (let i = from; i < to; i++) f(y1 - y0 > 1e-4 ? (p.getY(i) - y0) / (y1 - y0) : 0.5, c, i * 3);
    };
    if (whole) paint(0, p.count, lo, hi);
    else for (let i = 0; i + 2 < p.count; i += 3) paint(i, i + 3, ...box(i, i + 3));
    g.setAttribute('color', new p.constructor(c, 3));
    if (room) for (const [k, i] of [['roomC', 0], ['roomA', 4], ['roomB', 8]]) g.setAttribute(k, new p.constructor(room.filter((_, j) => j % 12 >= i && j % 12 < i + 4), 4));
    return g;
  });
}
