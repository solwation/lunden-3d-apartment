// #1682: the world-edge scenery (src/edgebackdrop.js, EDGE_BACKDROP in config.js): pure data/geometry checks, no browser.
//   node tools/edgebackdroptest.mjs
import * as THREE from 'three';
import { SITE, EDGE_BACKDROP as E } from '../src/config.js';
import { skirtParts, houseBoxes, edgeTreeSpots } from '../src/edgebackdrop.js';
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const B = SITE.backgroundGround, inRect = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
const inside = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };

const boxes = houseBoxes();
check(boxes.length > 60 && boxes.length < 140, `house/hall boxes: ${boxes.length} (expect 60–140: cheap silhouettes)`);
check(boxes.every((b) => !inRect(b.x, b.z)), 'no box centre inside the modelled terrain rectangle');
check(boxes.every((b) => b.h > 3 && b.h < 20), 'box heights 3–20 m');
check(E.halls.length >= 4 && E.houses.some((g) => /Radhus/.test(g.name)) && E.houses.some((g) => /Villor/.test(g.name)), 'radhus, villor and industrial halls are all configured');

const trees = edgeTreeSpots();
check(trees.length > 150 && trees.length < 600, `tree spots: ${trees.length} (expect 150–600: instances in the existing batches)`);
check(trees.every((t) => t.edge && !inRect(t.x, t.z) && t.y === E.level), 'trees are flagged edge, outside the terrain rectangle, on the far ground');
check(new Set(trees.map((t) => `${t.x.toFixed(2)},${t.z.toFixed(2)}`)).size === trees.length, 'tree spots are distinct and deterministic');
check(JSON.stringify(trees.slice(0, 5)) === JSON.stringify(edgeTreeSpots().slice(0, 5)), 'a second call gives the same spots');

const corners = (f) => f.polygon;
check(E.fields.every((f) => f.polygon.every(([x, z]) => !inRect(x, z)) && f.polygon.length >= 4), 'field polygons have every corner outside the terrain rectangle');
let overlap = 0;
for (const f of E.fields) for (const m of SITE.south.fields) for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
  const xs = f.polygon.map((q) => q[0]), zs = f.polygon.map((q) => q[1]);
  const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 39, z = Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * j / 39;
  if (inside(x, z, corners(f)) && inside(x, z, m.polygon)) overlap++;
}
check(overlap === 0, `no edge field overlaps a mapped south field (${overlap} samples)`);
check(E.fields.map((f) => f.color).filter((c, i, a) => a.indexOf(c) === i).length >= 4, 'fields use at least four different tones');
check(E.roads.some((r) => /Malmövägen/.test(r.name)) && E.paths.length >= 1, 'Malmövägen strip and a cycle path along the field edge exist');

const far = new THREE.Color(0x779340), flatBand = skirtParts(far), skirt = skirtParts(far, (x, z) => z < B.z0 + 1 ? 6 : -9);
check(flatBand.flatMap((p) => p.pos.filter((_, i) => i % 3 === 1)).every((y) => Math.abs(y - (E.level + E.lift.skirt)) < 1e-9), 'without a terrain function the band is flat just above the far ground');
const ys = skirt.flatMap((p) => p.pos.filter((_, i) => i % 3 === 1));
check(Math.max(...ys) > 5.9 && Math.min(...ys) > E.level, 'with a terrain function the band starts at the terrain edge height (a 9 m north edge) and never dips below the far ground');
check(ys.filter((y) => y > 0).length < ys.length && ys.some((y) => Math.abs(y - (E.level + E.lift.skirt)) < 1e-9), 'the band ramps down to the far ground at its outer edge');
const col = skirt[0].cols, last = col.length - 3;
check(Math.abs(col[0] - far.r * E.skirt.innerTone[0]) < 1e-6 && Math.abs(col[last] - far.r) < 1e-6, 'band: terrain-edge tone at the inner edge, far-ground tone at the outer edge');
check(skirt.flatMap((p) => { const o = []; for (let i = 0; i < p.pos.length; i += 3) o.push([p.pos[i], p.pos[i + 2]]); return o; }).every(([x, z]) => !(x > B.x0 + 1e-6 && x < B.x1 - 1e-6 && z > B.z0 + 1e-6 && z < B.z1 - 1e-6)), 'the band lies outside the terrain rectangle');
const mapped = (x, z) => SITE.south.fields.some((m) => inside(x, z, m.polygon));
let covered = 0; for (const p of skirt) for (let i = 0; i < p.pos.length; i += 9) if (mapped(p.pos[i], p.pos[i + 2])) covered++;
check(covered === 0, `the band does not cover a mapped field (${covered} vertices)`);
check(E.lift.skirt < E.lift.field && E.lift.field < E.lift.path && E.lift.path < E.lift.road, 'layer lifts increase: band < fields < path < road');
check(E.lowMemory.houses === false && E.lowMemory.trees === false, 'phones skip the house boxes and the trees (land only)');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
