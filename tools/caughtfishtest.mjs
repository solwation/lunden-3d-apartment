// #1765: the caught fish's per-species model (src/caughtfish.js, CAUGHT_FISH in config.js): pure geometry checks, no browser.
//   node tools/caughtfishtest.mjs
import { RIVER_FISH, CAUGHT_FISH } from '../src/config.js';
import { caughtFishGeometry } from '../src/caughtfish.js';
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
for (const { name } of RIVER_FISH.species) {
  const g = caughtFishGeometry(name), tris = g.index.count / 3, b = g.boundingBox, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array;
  check(!!CAUGHT_FISH.species[name], `${name}: has its own CAUGHT_FISH entry`);
  check(tris <= 600, `${name}: ${tris} triangles (≤ 600, one draw call: no groups = ${g.groups.length === 0})`);
  check(g.groups.length === 0 && caughtFishGeometry(name) === g, `${name}: one shared cached geometry, no material groups`);
  check([...P, ...N, ...C].every(Number.isFinite) && C.every((c) => c >= 0 && c <= 1), `${name}: finite positions / normals, colours within 0…1`);
  check(Math.abs(b.min.z + 0.5) < 0.02 && Math.abs(b.max.z - 0.5) < 0.02, `${name}: one length long, nose at +z (z ${b.min.z.toFixed(3)}…${b.max.z.toFixed(3)})`);
  const s = CAUGHT_FISH.species[name], depth = b.max.y - b.min.y, width = b.max.x - b.min.x;
  check(width < depth && depth > s.depth, `${name}: laterally compressed and finned (w ${width.toFixed(3)} < h ${depth.toFixed(3)})`);
  check(g.userData.lum > 0.1 && g.userData.lum < 0.8, `${name}: skin luminance ${g.userData.lum.toFixed(3)} for the cooking tint`);
}
const h = (n) => { const b = caughtFishGeometry(n).boundingBox; return b.max.y - b.min.y; };
check(h('braxen') > h('mört') && h('ål') < h('gädda') && h('gädda') < h('öring'), 'shapes differ: bream deepest, eel slimmest, pike slimmer than trout');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
