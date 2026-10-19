// node tools/pathaudit.mjs [--json] — #1341: a data-driven audit of every footpath, cycle path and road in the playable area, run against the same
// data the game draws (SITE.* in src/config.js, roads.js geometry). Reports four categories with plan coordinates and OSM ids:
//   dead-end  a footpath/cycle path/pavement end that meets no road, other way, building, paving, bridge or the edge of the drawn ground
//   gap       the end of a way lies 0.3-6 m from another way's end/body without touching it (chain broken), or a park strip's quads are
//             clipped out in the middle of the way (the `clip` of riverpark.js, cf. #1317)
//   on-road   a footpath/pavement is drawn over vehicle asphalt of a different colour at an equal or higher lift (not a bridge deck); `on-road (trimmed)`
//             = it does so in the data but is cut at the carriageway's edge when drawn (roads.js pathStrip `trim`, #1341)
//   overlap   two coplanar-lifted strips of different surface lie over each other along a stretch (z-fighting), or two same-direction strips duplicate
// Exit code is 0; the report is the result (see docs/development/environment.md "Gångstråk och vägar: revision").
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) {
  if (s === 'three') return { url: 'data:text/javascript,export const MathUtils={clamp:(v,a,b)=>Math.min(b,Math.max(a,v))};export class BufferGeometry{};export const Float32BufferAttribute=class{};export default {}', shortCircuit: true };
  if (s.startsWith('three/addons')) return { url: 'data:text/javascript,export const mergeGeometries=()=>null', shortCircuit: true };
  return n(s, c);
}`));
const { SITE, WALK } = await import('../src/config.js');
const { samples, onRoad, isVehicleWay } = await import('../src/roads.js');
const { deckAt } = await import('../src/riverbridge.js');
const JSON_OUT = process.argv.includes('--json');
const f1 = (v) => (Math.round(v * 10) / 10);
const pt = (p) => `(${f1(p[0])}, ${f1(p[1])})`;

// ---- the ways ------------------------------------------------------------------------------------------------------------------------
// kind: 'vehicle' (asphalt roads) | 'foot' (footpath, cycle path, access paving strip, pavement)
const ways = [];
const add = (group, id, pts, w, surface, kind, lift, extra = {}) => ways.push({ group, id, pts, w, surface, kind, lift, ...extra });
const roadPts = (r) => samples(r).map((s) => [s.x, s.z]);
for (const r of SITE.roads) {
  if (r.path) {
    add('roads', r.name, roadPts(r), r.path.length ? (Array.isArray(r.w) ? Math.max(...r.w) : r.w) : 0, 'asphalt', 'vehicle', 0.025, { road: r });
    for (const wk of r.walks ?? []) { // pavements: offset polylines
      const S = samples(r), off = (s) => (s.w / 2 + wk.w / 2) * wk.side, pts = S.map((s) => [s.x + s.nx * off(s), s.z + s.nz * off(s)]);
      add('roads.walks', `${r.name} ${wk.side > 0 ? 'right' : 'left'}`, pts, wk.w, 'paving', 'foot', 0.008, { walkOf: r });
    }
  }
}
for (const [grp, list] of [['riverPark', SITE.riverPark.paths], ['west', [...SITE.west.paths, ...SITE.west.access]], ['north', [...SITE.north.paths, ...SITE.north.access]], ['east', [...SITE.east.paths, ...SITE.east.access]], ['south', [...SITE.south.paths, ...(SITE.south.access ?? [])]]]) {
  for (const p of list) {
    if (!p.path) continue;
    const veh = isVehicleWay(p); // roads.js: asphalt >= 3.9 m wide = a carriageway; narrower = footpath / cycle path / paving strip
    const lift = grp === 'riverPark' ? (p.surface === 'asphalt' ? 0.03 : 0.025) : 0.025;
    add(grp, p.source ?? p.name ?? '?', p.path, p.w, p.surface ?? 'paving', veh ? 'vehicle' : 'foot', lift, { trimmed: !veh && grp !== 'south' }); // #1341: foot strips of these groups are drawn with pathStrip `trim` (cut at the carriageway's edge)
  }
}
const area = SITE.backgroundGround;
const polys = []; // areas a path may end in: buildings, car parks/paving polygons, blocks, rects
const addPoly = (p) => polys.push(p);
for (const g of [SITE.west, SITE.east, SITE.north, SITE.south]) { for (const b of g.buildings ?? []) addPoly(b.polygon); for (const a of [...(g.access ?? []), ...(g.parking ?? []), ...(g.paths ?? [])]) if (a.polygon) addPoly(a.polygon); }
const rects = [...SITE.blocks, ...SITE.paving, ...SITE.basementPaving, ...(SITE.roads.filter((r) => r.x0 !== undefined))].map((r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]);
const inPoly = (x, z, p) => { let y = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) y = !y; return y; };
const nearPoly = (x, z, p, m) => inPoly(x, z, p) || p.some((a, i) => distSeg(x, z, a, p[(i + 1) % p.length]) < m);
/** #1348: distance to the segment's interior only (Infinity beyond its ends): two ways that meet end to end abut, they do not overlap. */
function distSegIn(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; return t <= 0 || t >= 1 ? Infinity : Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }
function distSeg(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }
const distWay = (x, z, w) => { let d = Infinity; for (let i = 1; i < w.pts.length; i++) d = Math.min(d, distSeg(x, z, w.pts[i - 1], w.pts[i])); return d - w.w / 2; }; // edge distance (<0 = inside)
const nearAnyWay = (x, z, m, self) => ways.some((w) => w !== self && !(self && w.walkOf === self.walkOf && w.walkOf) && distWay(x, z, w) < m);
const courtyard = [SITE.paving, SITE.basementPaving];
const lastReport = [];
const rep = (cat, group, id, where, note) => lastReport.push({ cat, group, id, where, note });

// the bridges' footprints and the box (everything with deck/box) count as "meets something"
const meets = (x, z, self, m) => nearAnyWay(x, z, m, self) || deckAt(x, z) !== null || polys.some((p) => nearPoly(x, z, p, m)) || rects.some((p) => nearPoly(x, z, p, m)) ||
  x < WALK.x0 + 10 || x > WALK.x1 - 10 || z < WALK.z0 + 10 || z > WALK.z1 - 10 || x < area.x0 + 5 || x > area.x1 - 5 || z < area.z0 + 5 || z > area.z1 - 5 || z > 258 || onRoad(x, z, m) ||
  SITE.riverPark.woodBridge.ends.some((b) => Math.hypot(b[0] - x, b[1] - z) < 1.5); // the park's timber footbridge

// ---- 1. dead ends & 2. gaps (ends) ----------------------------------------------------------------------------------------------------
for (const w of ways) {
  if (w.kind !== 'foot') continue;
  if (w.group === 'roads.walks') continue; // pavements end where the road ends (checked via the road)
  for (const [k, e] of [[0, w.pts[0]], [1, w.pts[w.pts.length - 1]]]) {
    if (meets(e[0], e[1], w, 1.2)) continue;
    // a near miss is a gap, a clear miss a dead end
    let best = { d: Infinity };
    for (const o of ways) { if (o === w) continue; const d = distWay(e[0], e[1], o); if (d < best.d) best = { d, o }; }
    const nearBuilding = polys.some((p) => nearPoly(e[0], e[1], p, 6)) || SITE.blocks.some((b) => e[0] > b.x0 - 6 && e[0] < b.x1 + 6 && e[1] > b.z0 - 6 && e[1] < b.z1 + 6);
    if (best.d < 6) rep('gap', w.group, w.id, `${k ? 'end' : 'start'} ${pt(e)}`, `${f1(best.d)} m short of ${best.o.group}:${best.o.id} (${best.o.kind})`);
    else rep('dead-end', w.group, w.id, `${k ? 'end' : 'start'} ${pt(e)}`, `meets nothing; nearest way ${f1(best.d)} m (${best.o?.group}:${best.o?.id})${nearBuilding ? ', a building lies within 6 m' : ''}`);
  }
}
// ---- 2b. holes: a park strip clipped away in the middle (riverpark.js `clip`) -----------------------------------------------------------
for (const p of SITE.riverPark.paths) {
  const w = { pts: [], path: p.path, w: p.w }; let run = null; const pts = samples(p).map((s) => ({ x: s.x, z: s.z, nx: s.nx, nz: s.nz }));
  const quads = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], at = (q, o) => [q.x + q.nx * o, q.z + q.nz * o], c = [at(a, -p.w / 2), at(a, p.w / 2), at(b, -p.w / 2), at(b, p.w / 2)];
    const edge = c.some(([x, z]) => z < 64 || x < -270 || x > SITE.backgroundGround.x1 - 10 || z > 260), allRoad = c.every(([x, z]) => onRoad(x, z, -0.05)) && !c.some(([x, z]) => deckAt(x, z) !== null);
    quads.push({ k, edge, allRoad, at: [(a.x + b.x) / 2, (a.z + b.z) / 2] });
  }
  const gone = quads.map((q) => q.edge || q.allRoad), first = gone.indexOf(false), last = gone.lastIndexOf(false);
  for (let i = first; i <= last;) { if (!gone[i]) { i++; continue; } let j = i; while (gone[j]) j++; rep('gap', 'riverPark', p.source, `clipped quads between ${pt(quads[i].at)} and ${pt(quads[j - 1].at)}`, `${j - i} quad(s) (${quads.slice(i, j).filter((q) => q.edge).length} edge, ${quads.slice(i, j).filter((q) => q.allRoad).length} on-road) missing mid-way`); i = j; }
}
// ---- 3. foot ways over vehicle asphalt --------------------------------------------------------------------------------------------------
const vehicles = ways.filter((w) => w.kind === 'vehicle');
for (const w of ways.filter((x) => x.kind === 'foot')) {
  let run = null;
  const flush = () => { if (run && run.len > 0.9) rep(w.trimmed ? 'on-road (trimmed)' : 'on-road', w.group, w.id, `${pt(run.a)} to ${pt(run.b)}`, `${f1(run.len)} m on ${run.on} asphalt (strip centre ${run.depth < 0 ? 'inside' : 'at'} the road by up to ${f1(-run.depth)} m)`); run = null; };
  for (let i = 1; i < w.pts.length; i++) {
    const a = w.pts[i - 1], b = w.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / 0.5));
    for (let s = 0; s <= n; s++) {
      const x = a[0] + (b[0] - a[0]) * s / n, z = a[1] + (b[1] - a[1]) * s / n; let hit = null, depth = Infinity;
      if (deckAt(x, z) === null) for (const v of vehicles) { if (v.walkOf === w.walkOf && w.walkOf) continue; if (v.group === 'roads' && w.walkOf === v.road) continue; if (w.lift < v.lift - 1e-6) continue; /* drawn under the asphalt: not visible */ if (w.surface === v.surface && w.surface === 'asphalt') continue; /* same colour */ const d = distWay(x, z, v); if (d < -0.15 && d < depth) { depth = d; hit = v; } }
      if (hit) { if (!run || run.on !== `${hit.group}:${hit.id}`) { flush(); run = { a: [x, z], b: [x, z], len: 0, on: `${hit.group}:${hit.id}`, depth }; } run.b = [x, z]; run.len += l / n; run.depth = Math.min(run.depth, depth); } else flush();
    }
  }
  flush();
}
// ---- 4. z-fighting overlaps of differently coloured strips with the same lift, and duplicated same-direction ways -----------------------
const dirAt = (w, i) => { const a = w.pts[Math.max(0, i - 1)], b = w.pts[Math.min(w.pts.length - 1, i)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
for (let ai = 0; ai < ways.length; ai++) for (let bi = ai + 1; bi < ways.length; bi++) {
  const A = ways[ai], B = ways[bi];
  if (A.group === 'roads.walks' || B.group === 'roads.walks') continue;
  if (Math.abs(A.lift - B.lift) > 1e-6) continue; // different lifts decide who is on top; not a z-fight
  const sameSurface = A.surface === B.surface;
  let len = 0, a0 = null, a1 = null;
  for (let i = 1; i < A.pts.length; i++) {
    const a = A.pts[i - 1], b = A.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / 0.5)), u = [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)];
    for (let s = 0; s <= n; s++) {
      const x = a[0] + (b[0] - a[0]) * s / n, z = a[1] + (b[1] - a[1]) * s / n;
      // the ends of a way (within its own width) join neighbours on purpose: skip the first/last metres of A
      let best = Infinity, bj = 1;
      for (let j = 1; j < B.pts.length; j++) { const d = distSegIn(x, z, B.pts[j - 1], B.pts[j]); if (d < best) { best = d; bj = j; } }
      const v = dirAt(B, bj), par = Math.abs(u[0] * v[0] + u[1] * v[1]);
      if (best < Math.min(A.w, B.w) / 2 && par > 0.94) { len += l / n; a0 ??= [x, z]; a1 = [x, z]; }
    }
  }
  if (len > 3 && (!sameSurface || A.kind === B.kind)) rep('overlap', `${A.group}+${B.group}`, `${A.id} / ${B.id}`, `${pt(a0)} to ${pt(a1)}`, `${f1(len)} m parallel overlap${sameSurface ? ' (same surface: duplicate way, double triangles)' : ' (different surface, same lift: z-fight)'}`);
}
// ---- output ----------------------------------------------------------------------------------------------------------------------------
if (JSON_OUT) console.log(JSON.stringify(lastReport, null, 1));
else {
  const cats = ['dead-end', 'gap', 'on-road', 'on-road (trimmed)', 'overlap'];
  for (const c of cats) { const L = lastReport.filter((r) => r.cat === c); console.log(`\n== ${c} (${L.length}) ==`); for (const r of L) console.log(`  [${r.group}] ${r.id}  ${r.where}  -- ${r.note}`); }
  console.log(`\nways: ${ways.length} (${ways.filter((w) => w.kind === 'vehicle').length} vehicle, ${ways.filter((w) => w.kind === 'foot').length} foot/pavement)`);
}
