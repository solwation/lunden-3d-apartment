// #1812: actual emitted continuation geometry, source joins and fog visibility. THREE_DIR optionally names a pinned three package.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
if (process.env.THREE_DIR) register('data:text/javascript,' + encodeURIComponent(`
const root=${JSON.stringify(pathToFileURL(process.env.THREE_DIR + '/').href)};
export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const { SITE, WALK, ROAD_ENDS: R } = await import('../src/config.js');
const { roadEndRoutes, outerParkSections, fogEnd } = await import('../src/roadends.js');
const { roadEndParts, skirtTop } = await import('../src/edgebackdrop.js');
const { pathStrip } = await import('../src/roads.js');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failed++; };
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const distance = ([x, z]) => Math.hypot(Math.max(WALK.x0 - x, 0, x - WALK.x1), Math.max(WALK.z0 - z, 0, z - WALK.z1));
const before = JSON.stringify(SITE), routes = roadEndRoutes();
check(JSON.stringify(SITE) === before, 'route generation preserves every original source coordinate, width and control-point order');
for (const spec of R.items) {
  const route = routes.find(r => r.source === spec.source && r.group === spec.group);
  check(route && Math.max(distance(route.path[0]), distance(route.path.at(-1))) >= R.fogClearance - 1e-5, `${spec.source}: outer endpoint at least ${R.fogClearance} m from every walk/fly camera in WALK`);
}
for (const r of routes.filter(r => r.group.startsWith('edge-'))) check(Math.max(...r.path.map(distance)) >= R.fogClearance - 1e-5, `${r.group}: the backdrop's own exposed end also reaches fog`);
const school = routes.find(r => r.source === 'Sankt Lars väg'), mapped = SITE.roads.find(r => r.name === school.source);
check(same(school.path[1], mapped.path[0]) && school.width === mapped.w[0] && school.walks.length === 2,
  'school road continuation joins its exact mapped endpoint/width and retains both pavements');
check(school.walks.every((k, i) => k.side === -mapped.walks[i].side && k.w === mapped.walks[i].w), 'reversing the starting endpoint keeps each pavement on its original physical side');
check(outerParkSections([[0, 0], [0, 100]]).length === 0, 'north house guard is retained; ordinary internal paths acquire no continuation');
const restored = routes.find(r => r.source === '61112061');
check(restored.path.some(p => same(p, SITE.riverPark.paths.find(p => p.source === '61112061').path[0])) && Math.abs(restored.path.at(-1)[0] - (R.parkClip.x1 - restored.width / 2 - R.parkOverlap)) < 1e-6,
  'eastern park route includes the actual mapped 210 m beyond its drawing clip before the guessed continuation');
check(R.parkOverlap > 1.5 && restored.path.at(-1)[0] < R.parkClip.x1 - restored.width / 2 - 1.5,
  'restored paths overlap the last whole-quad sample by half width plus more than the original 1.5 m step (including oblique joins)');
check(outerParkSections([[0, 250], [0, 270], [0, 250]]).length === 1, 'a mapped path leaving and re-entering the clip stays one connected outer section');
let rejected = false; try { fogEnd([0, 0], [0, 0]); } catch { rejected = true; }
check(rejected, 'degenerate directions cannot silently create invalid geometry');
const ground = () => 6, parts = roadEndParts(ground), B = SITE.backgroundGround;
const inside = (x, z) => x > B.x0 + .05 && x < B.x1 - .05 && z > B.z0 + .05 && z < B.z1 - .05;
let finite = true, below = 0, local = 0, underSkirt = 0;
for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) {
  const [x, y, z] = p.pos.slice(i, i + 3); finite &&= [x, y, z].every(Number.isFinite);
  if (inside(x, z)) { local++; if (y < 6) below++; }
  const skirt = skirtTop(x, z, ground); if (skirt > -Infinity && y < skirt - 1e-6) underSkirt++;
}
const triangles = parts.reduce((n, p) => n + p.pos.length / 9, 0);
check(parts.length === routes.length + 2 && finite, 'all road/path and two pavement strips emit finite mergeable geometry into the existing batch');
check(local > 50 && below === 0 && underSkirt === 0, `routes follow raised terrain and never sink under its feathered skirt (${local} local vertices)`);
check(triangles < 12000, `bounded continuation geometry: ${triangles} triangles, no extra material or draw call`);
// Check actual emitted old/new triangles across each clip, including oblique/wide strips. Centreline clipping alone left small gaps.
const covers = (positions, x, z) => {
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], az = positions[i + 2], bx = positions[i + 3], bz = positions[i + 5], cx = positions[i + 6], cz = positions[i + 8];
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax); if (Math.abs(d) < 1e-9) continue;
    const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / d, v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / d;
    if (u >= -1e-4 && v >= -1e-4 && u + v <= 1 + 1e-4) return true;
  }
  return false;
};
let seamSamples = 0, holes = 0;
for (const source of SITE.riverPark.paths) {
  const restored = parts.filter(p => p.source === source.source).flatMap(p => p.pos); if (!restored.length) continue;
  const old = pathStrip({ ...source }, w => -w / 2, w => w / 2, .03, ground,
    c => c.some(([x, z]) => z < 64 || x < R.parkClip.x0 || x > R.parkClip.x1 || z > R.parkClip.z1));
  for (let i = 0; i + 1 < source.path.length; i++) {
    const a = source.path[i], b = source.path[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      const edge = Math.min(Math.abs(x - R.parkClip.x0), Math.abs(x - R.parkClip.x1), Math.abs(z - R.parkClip.z1));
      if (z < 65 || edge > source.w / 2 + R.parkOverlap) continue;
      seamSamples++; if (!covers(old.attributes.position.array, x, z) && !covers(restored, x, z)) holes++;
    }
  }
  old.dispose();
}
check(seamSamples > 50 && holes === 0, `actual whole-quad old/new join has no uncovered centreline (${seamSamples} quarter-metre samples, ${holes} gaps)`);
check(JSON.stringify(SITE) === before, 'geometry generation also leaves original source data intact');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
