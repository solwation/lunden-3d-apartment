// #2086: grass detail patches/tufts (src/grassdetail.js) are seamless, deterministic and keep the map's linear mean.
// #2091: the shader's second, rotated/scaled lookup and its blob switch break the 1.6 m repeat without moving the mean.
// node --test tools/grassdetailtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyGrassPatches, grassBlendGLSL, grassBlendUV, grassBlendWeight, grassPatchField, grassPatchNoise, grassTufts, linearMean } from '../src/grassdetail.js';

// GRASS from src/config.js without loading the whole module graph
const src = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('export const GRASS = {'), src.indexOf('};', src.indexOf('export const GRASS = {')) + 2);
const G = Function(`${block.replace('export const GRASS =', 'return')}`)();
const n = G.textureSize;
const blades = () => { // stand-in for the blade layer: the same per-pixel noise grassTexture() starts from (seeded, seamless)
  let seed = G.seed; const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647), d = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = G.detailRange[1] - rand() * G.detailNoise; d.set([v, v, v * G.strawTint, 255], i * 4); }
  return d;
};

test('patch field wraps at the tile edge and is smooth', () => {
  const noise = grassPatchNoise(G.detailPatches);
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    assert.ok(Math.abs(grassPatchField(0, t, noise) - grassPatchField(1, t, noise)) < 1e-9);
    assert.ok(Math.abs(grassPatchField(t, 0, noise) - grassPatchField(t, 1, noise)) < 1e-9);
  }
  let max = 0; for (let x = 0; x < n; x++) max = Math.max(max, Math.abs(grassPatchField((x + 1) / n, 0.37, noise) - grassPatchField(x / n, 0.37, noise)));
  assert.ok(max < 0.1, `one-pixel step ${max}`);
});

test('patched map: seam no rougher than the interior, linear mean within 0.1 %, visible variation, deterministic', () => {
  const plain = blades(), target = linearMean(plain), a = applyGrassPatches(blades(), n, target, G.detailPatches), b = applyGrassPatches(blades(), n, target, G.detailPatches);
  assert.deepEqual(a, b);
  linearMean(a).forEach((m, k) => assert.ok(Math.abs(m / target[k] - 1) < 0.001, `channel ${k}: ${m} vs ${target[k]}`));
  const g = (d, x, y) => d[(((y + n) % n) * n + ((x + n) % n)) * 4 + 1];
  const step = (d, x0) => { let s = 0; for (let y = 0; y < n; y++) s += Math.abs(g(d, x0, y) - g(d, x0 + 1, y)); return s / n; };
  const seam = step(a, n - 1), inner = (step(a, 63) + step(a, 127) + step(a, 191)) / 3;
  assert.ok(seam < inner * 1.25, `seam ${seam} vs interior ${inner}`);
  const block = (d) => { const v = []; for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) { let s = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += g(d, bx * 32 + x, by * 32 + y); v.push(s / 1024); }
    const m = v.reduce((p, q) => p + q) / 64; return Math.sqrt(v.reduce((p, q) => p + (q - m) ** 2, 0) / 64); };
  assert.ok(block(a) > block(plain) * 4 && block(a) > 3, `patch spread ${block(a)} vs plain ${block(plain)}`);
});

test('tufts are deterministic and their own sequence', () => {
  const a = grassTufts(n, G.tufts), b = grassTufts(n, G.tufts);
  assert.deepEqual(a, b);
  assert.equal(a.length, G.tufts.count);
  for (const t of a) { assert.ok(t.x >= 0 && t.x < n && t.y >= 0 && t.y < n && t.r >= G.tufts.radius[0] && t.r <= G.tufts.radius[1]); assert.ok(t.blades.length >= G.tufts.blades[0]); }
  assert.notEqual(G.tufts.seed, G.seed);
});

test('grassTexture keeps the blade layer and its seed, adds no texture or map', () => {
  const grass = readFileSync(new URL('../src/grass.js', import.meta.url), 'utf8');
  assert.equal((grass.match(/new THREE\.CanvasTexture/g) || []).length, 1);
  assert.match(grass, /let seed = G\.seed;/);
  assert.ok(grass.indexOf('for (let i = 0; i < G.blades; i++)') < grass.indexOf('grassTufts('), 'tufts after the unchanged blade loop');
});

test('#2091 blend: both lookups get about half the ground, mostly unblended, and the shader carries the same constants', () => {
  const B = G.detailBlend; let sum = 0, pure = 0, count = 0, maxStep = 0;
  for (let x = -100; x < 100; x += 0.25) for (let z = -100; z < 100; z += 0.25) {
    const w = grassBlendWeight(x, z, B); sum += w; count++; if (w < 0.02 || w > 0.98) pure++;
    maxStep = Math.max(maxStep, Math.abs(grassBlendWeight(x + 0.25, z, B) - w));
  }
  assert.ok(Math.abs(sum / count - 0.5) < 0.05, `mean weight ${sum / count}`);
  assert.ok(pure / count > 0.4, `unblended share ${pure / count}`); // a 50 % mix of two lookups flattens the detail
  assert.ok(maxStep < 0.5, `switch too sharp: ${maxStep} per 25 cm`); // the switch stays a soft band of at least about half a metre
  const glsl = grassBlendGLSL(G.tile, B), [u, v] = grassBlendUV(1, 0, G.tile, B);
  assert.match(glsl, /^#ifdef USE_MAP[\s\S]*#endif$/); // the snow season removes the map
  assert.equal((glsl.match(/texture2D\(map,/g) || []).length, 2);
  assert.ok(glsl.includes(Math.cos(B.angle).toFixed(5)) && glsl.includes((1 / (G.tile * B.scale)).toFixed(5)));
  assert.ok(Math.abs(Math.hypot(u - B.offset[0], v - B.offset[1]) - 1 / (G.tile * B.scale)) < 1e-12);
  const grass = readFileSync(new URL('../src/grass.js', import.meta.url), 'utf8');
  assert.match(grass, /grassBlendGLSL\(G\.tile, G\.detailBlend\)/);
  assert.equal((grass.match(/new THREE\.CanvasTexture/g) || []).length, 1);
});

test('#2091 blend: the ground no longer repeats every tile, and its mean is the map mean', () => {
  const map = applyGrassPatches(blades(), n, linearMean(blades()), G.detailPatches), B = G.detailBlend;
  const at = (u, v) => { const x = ((Math.floor(u * n) % n) + n) % n, y = ((Math.floor(v * n) % n) + n) % n; return map[(y * n + x) * 4 + 1]; };
  const plain = (x, z) => at(x / G.tile, z / G.tile);
  const blended = (x, z) => { const w = grassBlendWeight(x, z, B), [u, v] = grassBlendUV(x, z, G.tile, B); return plain(x, z) * (1 - w) + at(u, v) * w; };
  // correlation of the ground (0.2 m blocks, the scale that reads at 10–20 m) with itself one tile further on
  const corr = (f) => { const a = [], b = []; for (let x = 0; x < 30; x += 0.2) for (let z = 0; z < 30; z += 0.2) {
    let p = 0, q = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { p += f(x + i * 0.05, z + j * 0.05); q += f(x + G.tile + i * 0.05, z + j * 0.05); }
    a.push(p); b.push(q); }
    const m = (s) => s.reduce((t, x) => t + x, 0) / s.length, ma = m(a), mb = m(b);
    let c = 0, va = 0, vb = 0; a.forEach((x, i) => { c += (x - ma) * (b[i] - mb); va += (x - ma) ** 2; vb += (b[i] - mb) ** 2; });
    return { r: c / Math.sqrt(va * vb), mean: ma / 16, sd: Math.sqrt(va / a.length) / 16 }; };
  const before = corr(plain), after = corr(blended);
  if (process.env.GRASS_VERBOSE) console.log({ before, after });
  assert.ok(before.r > 0.99, `plain map repeats exactly: ${before.r}`);
  assert.ok(after.r < 0.6, `blended repeat correlation ${after.r}`);
  assert.ok(Math.abs(after.mean / before.mean - 1) < 0.01, `mean ${after.mean} vs ${before.mean}`);
  assert.ok(after.sd > before.sd * 0.75, `detail contrast kept: ${after.sd} vs ${before.sd}`);
});
