import { RIVER_FLORA } from './config.js';
import { driftHash } from './riverdrift.js';

// #1956: where the river's plants and stones are, the pure part (no three.js, no terrain: `node --test src/riverflora.test.mjs`).
// Everything is a fixed function of RIVER_FLORA.seed and the river's own frame (`s` m along the smoothed centre line of
// src/riverdrift.js `driftPath`, `u` m off it), so it is the same on every visit and for every player; nothing is saved or sent.
// src/riverfloraview.js turns the lists into instances on the real bed.

const lerp = (a, b, k) => a + (b - a) * k;

/** `length`: the line's length (m); `hw(s)`: half the open channel's width there; `blocked(s, u, r)`: no room (a pier).
 * Returns { stones: [{ s, u, size, yaw, flat, tone }], weeds: [{ s, u, h, tone, phase }], lilies: [{ s, u, r, yaw, flower }] }, each sorted by `s`. */
export function floraLayout({ length, hw, blocked = () => false, cfg = RIVER_FLORA }) {
  const { seed, ends } = cfg, span = length - 2 * ends, out = { stones: [], weeds: [], lilies: [] };
  if (!(span > 0)) return out;
  const S = cfg.stones;
  for (let i = 0, n = Math.round(span * S.perM); i < n; i++) {
    const s = ends + span * driftHash(i, 1, seed), k = driftHash(i, 3, seed), size = lerp(S.size[0], S.size[1], k * k * k), u = (driftHash(i, 2, seed) * 2 - 1) * Math.max(0, hw(s) - size);
    if (blocked(s, u, size)) continue;
    out.stones.push({ s, u, size, yaw: driftHash(i, 4, seed) * Math.PI * 2, flat: lerp(0.45, 0.8, driftHash(i, 5, seed)), tone: Math.floor(driftHash(i, 6, seed) * S.colors.length) });
  }
  const W = cfg.weeds;
  for (let i = 0, n = Math.round(span * W.perM); i < n; i++) {
    const s = ends + span * driftHash(i, 11, seed);
    if (driftHash(Math.floor(s / W.patch), 12, seed) >= W.share) continue; // (they grow in patches, with bare bed between)
    const u = (driftHash(i, 13, seed) * 2 - 1) * hw(s) * 0.9;
    if (blocked(s, u, 0.3)) continue;
    out.weeds.push({ s, u, h: lerp(W.h[0], W.h[1], driftHash(i, 14, seed)), tone: Math.floor(driftHash(i, 15, seed) * W.colors.length), phase: driftHash(i, 16, seed) * Math.PI * 2 });
  }
  const L = cfg.lilies;
  for (let c = 0, n = Math.floor(span / L.every); c < n; c++) {
    if (driftHash(c, 21, seed) >= L.chance) continue;
    const s0 = ends + (c + 0.2 + 0.6 * driftHash(c, 22, seed)) * L.every, side = driftHash(c, 23, seed) < 0.5 ? -1 : 1, h0 = hw(s0);
    const u0 = side * h0 * lerp(L.bank[0], L.bank[1], driftHash(c, 24, seed)), pads = Math.round(lerp(L.pads[0], L.pads[1], driftHash(c, 25, seed)));
    for (let j = 0; j < pads; j++) {
      const a = driftHash(c, 30 + j, seed) * Math.PI * 2, d = L.spread * Math.sqrt(driftHash(c, 50 + j, seed)), r = lerp(L.r[0], L.r[1], driftHash(c, 70 + j, seed));
      const s = s0 + Math.cos(a) * d, u = u0 + Math.sin(a) * d * 0.5, lim = hw(s) - r - 0.1;
      if (s < ends || s > length - ends || Math.abs(u) > lim || Math.sign(u) !== side || blocked(s, u, r)) continue;
      if (out.lilies.some((p) => Math.hypot(p.s - s, p.u - u) < p.r + r)) continue; // (leaves do not overlap)
      out.lilies.push({ s, u, r, yaw: driftHash(c, 90 + j, seed) * Math.PI * 2, flower: driftHash(c, 110 + j, seed) < L.flower });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.s - b.s);
  return out;
}

/** The indices [from, to) of the entries of a list sorted by `s` that lie within `range` m of `s0`. */
export function floraWindow(list, s0, range) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].s < s0 - range) lo = m + 1; else hi = m; }
  let to = lo; while (to < list.length && list[to].s <= s0 + range) to++;
  return [lo, to];
}

/** Are the river's leaves out / its flowers open in `month` (1 … 12)? */
export const floraSeason = (month, cfg = RIVER_FLORA.lilies) => ({ leaves: month >= cfg.months[0] && month <= cfg.months[1], bloom: month >= cfg.bloom[0] && month <= cfg.bloom[1] });
