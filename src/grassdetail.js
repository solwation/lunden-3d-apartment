// #2086: soft patchy tone (drier / lusher spots) and small tussocks for the shared grass detail map (src/grass.js).
// Pure helpers without imports, so tools/grassdetailtest.mjs can check them in Node. All strengths are artistic *guesses*.
const TAU = Math.PI * 2;
const toLinear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => toLinear(v));
const toByteExact = (l) => { const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const ENCODE = Uint8Array.from({ length: 4097 }, (_, i) => toByteExact((i / 4096) ** 2));
const toByte = (l) => ENCODE[Math.min(4096, Math.round(Math.sqrt(Math.max(0, l)) * 4096))]; // sqrt-spaced LUT: < 1 step error

/** Deterministic tile-periodic value-noise lattices (one per octave): `cells` x `cells` random values that wrap at the tile
 *  edge, so the field is seamless and reads as soft irregular blotches rather than waves. */
export function grassPatchNoise(P) {
  let seed = P.seed; const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  return P.octaves.map(({ cells, amp }) => ({ cells, amp, v: Float32Array.from({ length: cells * cells }, () => rand() * 2 - 1) }));
}

/** Smooth field, about −1 … 1, at (u, v) in tile units (0 … 1, wraps). */
export function grassPatchField(u, v, noise) {
  let f = 0, total = 0;
  for (const { cells, amp, v: g } of noise) {
    const x = (((u % 1) + 1) % 1) * cells, y = (((v % 1) + 1) % 1) * cells, x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = x - x0, sy = y - y0, ex = sx * sx * (3 - 2 * sx), ey = sy * sy * (3 - 2 * sy);
    const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * ex, bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * ex;
    f += amp * (top + (bottom - top) * ey); total += amp;
  }
  return f / total;
}

/** Linear-light per-channel mean of RGBA bytes: the same reading grassMeanColor() does. */
export function linearMean(data) {
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += LINEAR[data[i + k]];
  const n = data.length / 4; return sum.map((s) => s / n);
}

/** In place: lusher (darker, greener) and drier (lighter, warmer) soft patches, then a per-channel linear gain so the
 *  map's mean, and with it grassMeanColor() and the far ground, stays at `target` (rounding aside). */
export function applyGrassPatches(data, n, target, P) {
  // grassPatchField() sampled on the pixel grid, with each octave's lattice weights computed once per row / column
  const field = new Float32Array(n * n), noise = grassPatchNoise(P), total = noise.reduce((t, o) => t + o.amp, 0);
  for (const { cells, amp, v: g } of noise) {
    const i0 = new Int32Array(n), i1 = new Int32Array(n), w = new Float32Array(n);
    for (let x = 0; x < n; x++) { const c = x / n * cells, f = c - Math.floor(c); i0[x] = Math.floor(c) % cells; i1[x] = (i0[x] + 1) % cells; w[x] = f * f * (3 - 2 * f); }
    for (let y = 0; y < n; y++) {
      const r0 = i0[y] * cells, r1 = i1[y] * cells, ey = w[y];
      for (let x = 0; x < n; x++) {
        const top = g[r0 + i0[x]] + (g[r0 + i1[x]] - g[r0 + i0[x]]) * w[x], bottom = g[r1 + i0[x]] + (g[r1 + i1[x]] - g[r1 + i0[x]]) * w[x];
        field[y * n + x] += amp / total * (top + (bottom - top) * ey);
      }
    }
  }
  for (let i = 0; i < n * n; i++) {
    const s = Math.max(-1, Math.min(1, field[i] * P.contrast));
    field[i] = s * Math.abs(s) ** 0.3; // soft but with readable cores
  }
  const lin = new Float32Array(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const f = field[i], dry = Math.max(0, -f), lush = Math.max(0, f);
    const mul = [1 + dry * P.dry[0] - lush * P.lush[0], 1 + dry * P.dry[1] - lush * P.lush[1], 1 + dry * P.dry[2] - lush * P.lush[2]];
    for (let k = 0; k < 3; k++) lin[i * 3 + k] = LINEAR[data[i * 4 + k]] * mul[k];
  }
  const sum = [0, 0, 0];
  for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) sum[k] += lin[i * 3 + k];
  const gain = sum.map((s, k) => target[k] * n * n / s);
  for (let pass = 0; pass < 2; pass++) { // the second pass absorbs byte rounding / clipping at 255
    for (let i = 0; i < n * n; i++) for (let k = 0; k < 3; k++) data[i * 4 + k] = toByte(lin[i * 3 + k] * gain[k]);
    const now = linearMean(data); for (let k = 0; k < 3; k++) gain[k] *= target[k] / now[k];
  }
  return data;
}

/** Deterministic tussock list (own seed, so the existing blade sequence is untouched). Positions in pixels. Each tuft is a
 *  loose clump: blades start scattered round the middle and lean outwards with jitter, mixing darker and lighter leaves. */
export function grassTufts(n, T) {
  let seed = T.seed; const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647), tufts = [];
  for (let i = 0; i < T.count; i++) {
    const x = rand() * n, y = rand() * n, r = T.radius[0] + rand() * (T.radius[1] - T.radius[0]), blades = [];
    const count = T.blades[0] + Math.floor(rand() * (T.blades[1] - T.blades[0] + 1));
    for (let j = 0; j < count; j++) {
      const o = rand() * TAU, d = rand() * r * 0.45, a = o + (rand() - 0.5) * 1.4, light = rand() < 0.45;
      const v = light ? T.light[0] + rand() * (T.light[1] - T.light[0]) : T.dark[0] + rand() * (T.dark[1] - T.dark[0]);
      blades.push({ x0: Math.cos(o) * d, y0: Math.sin(o) * d, a, len: r * (0.4 + rand() * 0.5), bend: (rand() - 0.5) * 0.5, v: Math.round(v) });
    }
    tufts.push({ x, y, r, blades });
  }
  return tufts;
}
