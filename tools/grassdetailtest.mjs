// #2086: grass detail patches/tufts (src/grassdetail.js) are seamless, deterministic and keep the map's linear mean.
// node --test tools/grassdetailtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyGrassPatches, grassPatchField, grassPatchNoise, grassTufts, linearMean } from '../src/grassdetail.js';

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
