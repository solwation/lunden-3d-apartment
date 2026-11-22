// #2433: the fallen autumn leaves and the gravel map in a real export against the web's own numbers, and the material
// table that draws them. The web lays its leaves only in the autumn months (src/leaflitter.js litterAmount: LEAF_LITTER.months,
// none in SEASON.snowMonths), on the lawns and the gravel among the surfaces Unreal draws with M_LundenGrass / M_LundenGravel;
// summer, spring and winter ground must stay unchanged, so every other month must carry 0.
// Run: node tools/unreal-engine/tests/leaf-litter.test.mjs [<export directory>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GRAVEL_SURFACE, LEAF_LITTER, SEASON, WALK } from '../../../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? path.join(here, '../../../unreal/Lunden/Import');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const { site, materials } = read(path.join(dir, 'measurements.json'));
const L = site.leafLitter, G = site.gravelSurface;
assert.ok(L && G, 'measurements.json has site.leafLitter and site.gravelSurface: re-export (#2433)');

// the season rule: the web's share per month, 0 in summer, spring and the snow months
const want = Array.from({ length: 12 }, (_, i) => (SEASON.snowMonths.includes(i + 1) ? 0 : LEAF_LITTER.months[i + 1] ?? 0));
assert.deepEqual(L.months, want);
assert.ok(L.months.some((v) => v > 0), 'some autumn month has leaves');
for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 12]) assert.equal(L.months[m - 1], 0, `no leaves in month ${m}`);
// the month's tones, linear (three.js Color.setHex)
const lin = (h, s) => { const c = ((h >> s) & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
for (const [m, [fresh, old]] of Object.entries(LEAF_LITTER.colors)) {
  for (const [got, hex] of [[L.fresh[m - 1], fresh], [L.old[m - 1], old]])
    got.forEach((v, k) => assert.ok(Math.abs(v - lin(hex, 16 - 8 * k)) < 2e-4, `month ${m} tone ${hex.toString(16)}: ${got}`));
}
assert.deepEqual(L.kinds, LEAF_LITTER.kinds);
assert.deepEqual([L.cells, L.len, L.aa, L.mulch, L.wide, L.rough], [LEAF_LITTER.cells, LEAF_LITTER.len, LEAF_LITTER.aa, LEAF_LITTER.mulch, LEAF_LITTER.wide, LEAF_LITTER.rough]);

// the density map: one texel per LEAF_LITTER.cell over WALK, a real PNG of that size, denser under crowns than on open ground
const D = L.density;
assert.deepEqual(D.box, { x0: WALK.x0, x1: WALK.x1, z0: WALK.z0, z1: WALK.z1 });
assert.equal(D.width, Math.ceil((WALK.x1 - WALK.x0) / LEAF_LITTER.cell));
assert.equal(D.height, Math.ceil((WALK.z1 - WALK.z0) / LEAF_LITTER.cell));
function png(base64) { // width, height and the red channel of an 8-bit RGBA PNG (filters 0-4)
  const b = Buffer.from(base64, 'base64');
  assert.equal(b.readUInt32BE(12), 0x49484452, 'IHDR');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  assert.deepEqual([b[24], b[25]], [8, 6], '8-bit RGBA');
  const idat = [];
  for (let o = 8; o < b.length;) { const n = b.readUInt32BE(o), t = b.toString('latin1', o + 4, o + 8); if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n)); o += n + 12; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), s = w * 4, px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (s + 1)];
    for (let x = 0; x < s; x++) {
      const v = raw[y * (s + 1) + 1 + x], a = x >= 4 ? px[y * s + x - 4] : 0, up = y ? px[(y - 1) * s + x] : 0, c = x >= 4 && y ? px[(y - 1) * s + x - 4] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      px[y * s + x] = (v + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
  }
  return { w, h, red: (x, y) => px[(y * w + x) * 4] };
}
assert.match(D.hash, /^[0-9a-f]{14}$/, 'the density texels\' hash (the Unreal texture and spec hashes follow it)');
assert.match(G.colorHash, /^[0-9a-f]{14}$/); assert.match(G.surfaceHash, /^[0-9a-f]{14}$/);
const map = png(D.png);
assert.deepEqual([map.w, map.h], [D.width, D.height]);
let sum = 0, max = 0;
for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const v = map.red(x, y); sum += v; max = Math.max(max, v); }
const meanV = sum / (map.w * map.h) / 255;
assert.ok(meanV > LEAF_LITTER.base * 0.5 && meanV < 0.5, `mean density ${meanV}`);
assert.equal(max, 255, 'full density somewhere (under the crowns)');

// the gravel map: GRAVEL_SURFACE's tile, mean and size, real PNGs
assert.deepEqual([G.tile, G.mean, G.size, G.depth, G.roughness, G.broadStrength, G.broadScale],
  [GRAVEL_SURFACE.tile, GRAVEL_SURFACE.mean, GRAVEL_SURFACE.size, GRAVEL_SURFACE.depth, GRAVEL_SURFACE.roughness, GRAVEL_SURFACE.broadStrength, GRAVEL_SURFACE.broadScale]);
for (const k of ['colorPng', 'surfacePng']) { const p = png(G[k]); assert.deepEqual([p.w, p.h], [G.size, G.size], k); }

// the material table: the lawn and gravel masters carry the litter of their web surface kind, and every lawn / gravel key
// of the export reaches one of them (test_materials.py checks the colours)
const table = read(path.join(here, '../material-map.json'));
const masters = Object.entries(table.materials).filter(([, s]) => s.litter);
assert.deepEqual(Object.fromEntries(masters.map(([p, s]) => [p.split('/').pop(), [s.graph, s.litter]])),
  { M_LundenGrass: ['grass', 'grass'], M_LundenGravel: ['gravel', 'gravel'] });
for (const [, s] of masters) assert.ok(s.litter in LEAF_LITTER.kinds, s.litter);
const ruled = (key) => {
  const rule = table.rules.find((r) => new RegExp(r.match).test(key) && !r.mesh);
  const target = rule && table.materials[rule.material.split('.')[0]];
  return target && table.materials[target.parent]?.litter;
};
const keys = Object.entries(materials).filter(([, m]) => m.map === 'shared-grass-detail' || m.map === 'gravel-stones-colour');
assert.ok(keys.length >= 4, `lawn and gravel keys: ${keys.length}`);
for (const [key, m] of keys) assert.equal(ruled(key), m.map === 'gravel-stones-colour' ? 'gravel' : 'grass', key);
console.log(`LEAF_LITTER_OK months ${L.months.join(' ')}, density ${D.width}x${D.height} (mean ${meanV.toFixed(3)}), ${keys.length} lawn/gravel keys with litter`);
