// Page side of the Unreal export (#2245): builds the real web world with src/world.js `buildWorld(plan)` (the same
// scene builder the game uses, but without main.js's static merge, detail culling, phone LOD proxies or renderer),
// picks the objects of each export zone, gives every exported node a stable id and metadata (glTF node `extras`),
// and writes one GLB per zone with three's GLTFExporter plus the measurement data (measurements.json).
// Loaded by tools/unreal-engine/export.html under tools/unreal-engine/export-world.mjs (Playwright); never by the game.
//
// Determinism: the caller fixes Date and seeds Math.random before any module loads; this module builds and collects
// synchronously (nothing loaded later can slip in), walks the scene in its child order, and writes no time stamps.
import { curtainProfiles, curtainRows } from './export-curtains.js';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as C from '../../src/config.js';
import { christmasCoverage } from '../../src/christmas.js';
import { FurnitureGroups } from '../../src/furnituregroups.js';
import { beersOut, cushionsOut } from '../../src/patio.js';
import { buildWorld } from '../../src/world.js';
import { buildStringLights, updateStringLights, updateParasols } from '../../src/patio.js';
import { groundY, renderedTerrainY, treeFeet, aoTrees } from '../../src/surroundings.js';
import { gridGround } from '../../src/elevation.js';
import { leafMaterial, windLeafMaterial } from '../../src/foliage.js';
import { skyGradientPalette } from '../../src/daycycle.js';
import { livingWallLight } from './export-living-wall.js';
import { stairLampProfiles } from './export-stair-light.js';
import { stairRise, stairRiser, N_TREADS } from '../../src/stairs.js';
import { hedgeTexture } from './hedge-texture.js';
import { husLLayout } from '../../src/exterior.js';
import { fallDamage } from '../../src/falldamage.js';
import { parkedVehicles, recordParkedPart, parkedCollision, parkedMaterial } from './export-parked-vehicles.js';
import { riverGeometry, riverMaterialData } from './export-river.js';
import { facadeLightingData } from './export-facade-lighting.js';
import { webToUnrealRounded, webYawToUnrealYaw, webPitchToUnrealPitch, webRotationYToUnrealYaw, roundCm } from './coordinates.mjs';

export const FORMAT_VERSION = 1;

/** Export zones (plan metres; `y` absolute). An exported object (an atom: a mesh, a door, a piece of furniture …) belongs
 *  to the first zone whose box holds the centre of its world bounding box and whose `from` accepts the builder it comes
 *  from (`sourceGroup`; no `from` = any part of buildWorld, never the extra builders). A `split` zone also takes the
 *  triangles of the web's merged meshes (one mesh spans all of Hus L, all of Hus A/B/C or the whole terrain): such a mesh
 *  is cut by triangle, each triangle to the first split zone that holds its world centroid (#2279), so every triangle is
 *  in at most one zone. `skip` (#2280) keeps objects out of a zone that other issues own (see SITE_SKIP). Only `exported`
 *  zones are written; the others are the planned list (docs/development/unreal.md). */
export function zoneTable(W, D, patio, husL = husLLayout(W)) {
  return [
    { id: 'l1007', what: 'L1007 interior, Entréplan + Övre plan (pilot, #2246)', status: 'exported',
      box: { x0: 0, x1: W, z0: 0, z1: D, y0: -0.6, y1: C.UNIT_TOP + 0.05 }, collision: true },
    { id: 'l1007-uteplats', what: 'L1007 patio: paving, fences, hedge, patio furniture (pilot, #2246)', status: 'exported',
      box: { x0: 0, x1: W, z0: D, z1: patio.z1 + 0.3, y0: -1, y1: 4 } },
    { id: 'fixture', what: 'axis/position test fixture: corner and START markers, north and east arrows (phase B position test)', status: 'exported' },
    // #2279: the buildings round L1007. Boxes are generous guards round each builder's content; `from` does the sorting.
    // The export report lists anything of these builders that no zone took (it must stay empty).
    { id: 'l1007-entre', what: 'street and entrance in front of L1007 incl. START: the street, pavement and terrain pieces of the surroundings (#2279)',
      status: 'exported', split: true, from: ['surroundings', 'surroundings-site', 'basket-court'],
      box: { x0: 0, x1: W, z0: C.OUTDOOR.z0, z1: 0, y0: -4, y1: 8 } },
    { id: 'hus-l', what: 'Hus L: façades, loftgång, roofs and terraces, the neighbours\' patios, the portik, the stairwell/lift core, visitable flats L1004/L1201 (#2279)',
      status: 'exported', split: true, from: ['exterior', 'visit', 'core-l', 'portik'],
      box: { x0: husL.xw - 4, x1: husL.xe + 2, z0: -4, z1: D + 6, y0: C.GARAGE.floor - 1.5, y1: 16 } },
    { id: 'kvarteret', what: 'Hus A/B/C (façades, loggias, roofs), their stairwells, lifts and entrance shells, the garage and förråd under the courtyard (#2279)',
      status: 'exported', split: true, from: ['surroundings', 'garage', 'core-abc'],
      box: { x0: -73, x1: 15, z0: 0, z1: 60, y0: C.GARAGE.floor - 2, y1: 22 } },
    // #2280: the ground round Kv. Lunden. `gard` is the courtyard on the garage box (C.SITE.terrain.box, with the green
    // between the Å-husen); `omgivning` is the rest of the drawn terrain (SITE.backgroundGround) with the streets,
    // pavements, parked cars, the Höje å valley, its paths, bridges and the water surface. Both cut the merged terrain,
    // asphalt and paving like #2279's zones; SITE_SKIP leaves out vegetation, the backdrop houses, the campus and later parts.
    { id: 'gard', what: 'the courtyard on the garage box: its terrain, walks, pergolas, sandboxes, playground, boule court, benches and beds (#2280)',
      status: 'exported', split: true, from: ['world', 'surroundings-site'], skip: SITE_SKIP,
      box: { x0: -71, x1: 14, z0: 12.1, z1: 53, y0: -4, y1: 8 } },
    { id: 'omgivning', what: 'terrain, streets, pavements, parked cars, street furniture, the Höje å valley with its paths, bridges and water surface (#2280)',
      status: 'exported', split: true, from: ['world', 'surroundings', 'surroundings-site', 'basket-court'], skip: SITE_SKIP,
      box: { x0: C.SITE.backgroundGround.x0, x1: C.SITE.backgroundGround.x1, z0: C.SITE.backgroundGround.z0, z1: C.SITE.backgroundGround.z1, y0: -30, y1: 40 } },
    // #2281: the vegetation #2280's zones leave out (SITE_SKIP): the site's trees (trunks and crown lobes, one node per
    // instance), the understory and pavement shrubs, the courtyard plantings and pergola vines, the river bank's growth,
    // the entrance boxwood and the hedges. `only` keeps every other object out; not split (instances and plantings are
    // whole objects). Listed last so every earlier zone's GLB and ids stay byte-identical. Hus L's patio hedges and the
    // entrance plants stay in `hus-l`, L1007's own patio hedge in `l1007-uteplats` (their zones took them first).
    { id: 'vegetation', what: 'trees, shrubs, courtyard plantings and vines, river bank growth, entrance boxwood and hedges of the site (#2281)',
      status: 'exported', from: ['world', 'surroundings', 'surroundings-site'], only: VEGETATION,
      box: { x0: C.SITE.backgroundGround.x0, x1: C.SITE.backgroundGround.x1, z0: C.SITE.backgroundGround.z0, z1: C.SITE.backgroundGround.z1, y0: -30, y1: 60 } },
    // #2323: the backdrop houses round the quarter, which SITE_SKIP leaves out of #2280's ground zones: the west, north,
    // east (the campus with its façades and windows, src/campusfacades.js) and south backdrops, the edge's houses and
    // land beyond the terrain (src/edgebackdrop.js), HepCat, the clock tower and Nordic Wellness. Built by the web's own
    // builders (src/sitebackdrop.js, src/southbackdrop.js, src/edgebackdrop.js, src/surroundings.js); `only` keeps their
    // trees, the web's far LOD stand-ins and the later school yards, football site and campus car parks out. Not split:
    // each backdrop mesh is one node. Listed last so every earlier zone's GLB and ids stay byte-identical. The box is a
    // guard round the edge backdrop's land (the furthest content), not a cut.
    { id: 'fond', what: 'the backdrop houses and land round the quarter: west, north, east (campus), south and edge backdrops, HepCat, the clock tower, Nordic Wellness (#2323)',
      status: 'exported', from: ['world', 'surroundings', 'surroundings-site'], only: BACKDROP,
      box: { x0: -3000, x1: 3000, z0: -3000, z1: 3000, y0: -100, y1: 300 } },
  ];
}

/** Builders whose objects only split zones with a matching `from` may take (main.js adds them; the l1007 zones never). */
const EXTRA_GROUPS = new Set(['garage', 'core-l', 'core-abc', 'basket-court']);
const accepts = (z, group, atom) => (z.from ? z.from.includes(group) : !EXTRA_GROUPS.has(group)) && !(z.skip && atom && z.skip.test(atom))
  && !(z.only && !(atom && z.only.test(atom))); // #2281: a zone with `only` takes nothing else
/** `source` of the buildings' static geometry (#2279): the builder module, as no single data row describes a merged mesh. */
const GROUP_SOURCE = { exterior: 'src/exterior.js', visit: 'src/world.js (visitFlatParts)', 'core-l': 'src/core.js', 'core-abc': 'src/corehouse.js',
  garage: 'src/garage.js', 'basket-court': 'src/basket.js Hoop.courtMesh', surroundings: 'src/surroundings.js', 'surroundings-site': 'src/surroundings.js' };
/** The surroundings' ground and backdrop (terrain, streets, paving, trees, the campus and fields beyond): not Kv. Lunden's
 *  buildings, so never Hus A/B/C's zone (#2280's planned zones take them). */
const SITE_NAME = /^(site-terrain|site-asphalt|site-paving|ground-ao|street-|tree-|east-|west-|north-|edge-|south-)/;
/** #2280: what the ground zones leave to others, by the name of the object or one of its parents: vegetation (#2281:
 *  trees, shrubs, the pergola vines, hedges, shore growth; also any leaf-material mesh), the backdrop houses and the land
 *  beyond the terrain (west/north/east/south/edge, HepCat, the clock tower, Nordic Wellness), the east campus car parks,
 *  school yards and the football site (later), the boule balls (a game, later), the web's distance stand-ins (`… far`),
 *  the autumn's fallen leaves (src/street.js, instanced circles) and L1007's own furniture outdoors (G11, #2289). */
const SITE_SKIP_NAME = /^(tree-|south-|east-|west-|north-|edge-|hepcat-|tower-clock|nordic-wellness|football|school-|east-lot-cars|courtyard-shrubs|park-shore-growth|front-boxwood|boule-balls)|hedge| far$/;
const SITE_SKIP = { test({ object: o, kind }) {
  if (kind === 'furniture') return true;
  if (o.isInstancedMesh && o.geometry?.type === 'CircleGeometry') return true; // fallen leaves
  for (let q = o; q; q = q.parent) if (SITE_SKIP_NAME.test(q.name ?? '')) return true;
  const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  return ms.some((m) => m === leafMaterial() || m === windLeafMaterial().material);
}, toString: () => `${SITE_SKIP_NAME}, a leaf material (src/foliage.js), fallen leaves or furniture` };
/** #2281: the vegetation part of what SITE_SKIP leaves out, by the name of the object or one of its parents (the site's
 *  `tree-crowns|trunks|birches <cell>` batches, the courtyard plantings, the river bank's growth, the entrance boxwood,
 *  hedges) or a leaf material (src/foliage.js: pergola vines, perennials); never the web's `… far` LOD stand-ins, the
 *  backdrop's woodland beyond the terrain, fallen leaves or furniture. */
const VEGETATION_NAME = /^(tree-crowns|tree-trunks|tree-birches|courtyard-shrubs|park-shore-growth|front-boxwood)|hedge/;
const LEAF_VARIANTS = new Map([['foliage-leaves-wind', 'perennial'], ['foliage-leaves-lod', 'crown'], ['foliage-leaves', 'still']]);
const BACKDROP_NAME = /^(south-|east-|west-|north-|edge-|hepcat-|school-|football)| far$/;
const VEGETATION = { test({ object: o, kind }) {
  if (kind === 'furniture') return false;
  if (o.isInstancedMesh && o.geometry?.type === 'CircleGeometry') return false; // fallen leaves
  let named = false;
  for (let q = o; q; q = q.parent) { const n = q.name ?? ''; if (BACKDROP_NAME.test(n)) return false; if (VEGETATION_NAME.test(n)) named = true; }
  if (named) return true;
  const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  return ms.some((m) => m === leafMaterial() || m === windLeafMaterial().material);
}, toString: () => `${VEGETATION_NAME} or a leaf material (src/foliage.js), not ${BACKDROP_NAME}, fallen leaves or furniture` };
/** #2323: the backdrop houses and land (by the name of the object or one of its parents), never their trees (instanced
 *  trunks and crowns, a leaf material), the web's far LOD stand-ins (`… far`, `…-far`, src/sitebackdrop.js BatchLod),
 *  the school yards, the football site or the east campus car parks (G02 *Later*), fallen leaves or furniture. */
const BACKDROP_HOUSES_NAME = /^(west-|north-|east-|south-|edge-|hepcat-|tower-clock|nordic-wellness)/;
const BACKDROP_LEAVE_NAME = /^(east-lot-cars|school-|football|tree-)|-(trunks|crowns)$|[ -]far$/;
const BACKDROP = { test({ object: o, kind }) {
  if (kind === 'furniture') return false;
  if (o.isInstancedMesh && o.geometry?.type === 'CircleGeometry') return false; // fallen leaves
  let named = false;
  for (let q = o; q; q = q.parent) { const n = q.name ?? ''; if (BACKDROP_LEAVE_NAME.test(n)) return false; if (BACKDROP_HOUSES_NAME.test(n)) named = true; }
  if (!named) return false;
  const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  return !ms.some((m) => m === leafMaterial() || m === windLeafMaterial().material);
}, toString: () => `${BACKDROP_HOUSES_NAME}, not ${BACKDROP_LEAVE_NAME}, a leaf material (src/foliage.js), fallen leaves or furniture` };
/** #2280: the walkable ground among the exported nodes (by the web mesh's name; also unnamed level plates, see the
 *  ground block in exportWorld): build_site.py gives these complex collision in its derived level; the water surface,
 *  kerbs, street furniture and cars stay without. */
const GROUND_NAME = /^(site-terrain|site-asphalt|site-paving|street-asphalt-patches|street-cobbled-corner|park-paths|bridges-asphalt|park-timber-bridge|bus-stop-platform)/;

/** Cuts a mesh by zone (#2279). Triangles that cross one of the vertical `cuts` planes ({axis: 'x'|'z', at}, world
 *  metres: the split zones' box sides) are clipped there into convex pieces, attributes interpolated, so a long street
 *  strip or a terrain triangle is divided at a zone's edge instead of going whole to where its centroid lies. Each
 *  (piece of a) triangle then goes to `zoneFor(world centroid)` (or none). Returns one geometry per zone in the mesh's
 *  local space with position / normal / uv / colour and the material groups, and the triangle counts. */
function splitMesh(mesh, zoneFor, cuts) {
  const g = mesh.geometry, pos = g.getAttribute('position'), idx = g.index;
  const n = Math.floor((idx ? idx.count : pos.count) / 3);
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const multi = Array.isArray(mesh.material) && g.groups.length;
  const groups = multi ? g.groups : [{ start: 0, count: n * 3, materialIndex: 0 }];
  const names = ['position', 'normal', 'uv', 'color', 'riverFlow', 'riverShore'].filter((k) => g.getAttribute(k));
  const attrs = names.map((k) => g.getAttribute(k)), sizes = attrs.map((at) => at.itemSize);
  const m = mesh.matrixWorld, w = new THREE.Vector3();
  // a vertex: { v: original index or -1, a: [attribute arrays] (cut vertices), p: world position }
  const vert = (v) => ({ v, a: null, p: w.fromBufferAttribute(pos, v).applyMatrix4(m).clone() });
  const comp = (x, i) => (x.a ? x.a[i] : Array.from({ length: sizes[i] }, (_, q) => attrs[i].getComponent(x.v, q)));
  const lerp = (x, y, t) => ({ v: -1, p: x.p.clone().lerp(y.p, t), a: attrs.map((_, i) => { const A = comp(x, i), B = comp(y, i); return A.map((u, q) => u + (B[q] - u) * t); }) });
  const clip = (poly, axis, at) => { // → [below, above] (convex polygons; empty when on one side)
    const lo = [], hi = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length], da = A.p[axis] - at, db = B.p[axis] - at;
      if (da <= 0) lo.push(A); if (da >= 0) hi.push(A);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const X = lerp(A, B, da / (da - db)); lo.push(X); hi.push(X); }
    }
    return [lo.length >= 3 ? lo : null, hi.length >= 3 ? hi : null];
  };
  const per = new Map();
  let total = 0, taken = 0, cutTris = 0;
  const c = new THREE.Vector3();
  for (const gr of groups) {
    for (let t = Math.floor(gr.start / 3), end = Math.min(n, Math.floor((gr.start + gr.count) / 3)); t < end; t++) {
      total++;
      let polys = [[vert(vi(t, 0)), vert(vi(t, 1)), vert(vi(t, 2))]];
      for (const { axis, at } of cuts) {
        const next = [];
        for (const P of polys) {
          const vs = P.map((x) => x.p[axis]);
          if (Math.min(...vs) < at - 1e-6 && Math.max(...vs) > at + 1e-6) next.push(...clip(P, axis, at).filter(Boolean)); else next.push(P);
        }
        polys = next;
      }
      if (polys.length > 1) cutTris++;
      let any = false;
      for (const P of polys) {
        c.set(0, 0, 0); for (const x of P) c.add(x.p); c.multiplyScalar(1 / P.length);
        const z = zoneFor(c);
        if (!z) continue;
        any = true;
        if (!per.has(z)) per.set(z, { remap: new Map(), verts: [], index: [], mats: [] });
        const e = per.get(z), id = (x) => {
          if (x.v < 0) { e.verts.push(x); return e.verts.length - 1; }
          if (!e.remap.has(x.v)) { e.remap.set(x.v, e.verts.length); e.verts.push(x); }
          return e.remap.get(x.v);
        };
        const ids = P.map(id);
        for (let k = 1; k + 1 < ids.length; k++) { e.index.push(ids[0], ids[k], ids[k + 1]); e.mats.push(gr.materialIndex); }
      }
      if (any) taken++;
    }
  }
  const pieces = [];
  for (const [zone, e] of per) {
    const out = new THREE.BufferGeometry();
    names.forEach((k, i) => {
      const size = sizes[i], arr = new Float32Array(e.verts.length * size);
      e.verts.forEach((x, j) => { const A = comp(x, i); for (let q = 0; q < size; q++) arr[j * size + q] = A[q]; });
      const at = new THREE.BufferAttribute(arr, size);
      if (k === 'normal') for (let j = 0; j < at.count; j++) { w.fromBufferAttribute(at, j); if (w.lengthSq() > 0) { w.normalize(); at.setXYZ(j, w.x, w.y, w.z); } }
      out.setAttribute(k, at);
    });
    out.setIndex(new THREE.BufferAttribute(Uint32Array.from(e.index), 1));
    if (multi) { // the material groups, in the original triangle order
      let start = 0;
      for (let i = 1; i <= e.mats.length; i++) if (i === e.mats.length || e.mats[i] !== e.mats[start]) { out.addGroup(start * 3, (i - start) * 3, e.mats[start]); start = i; }
    }
    pieces.push({ zone, geometry: out, triangles: e.index.length / 3 });
  }
  return { pieces, total, taken, dropped: total - taken, cut: cutTris };
}

/** Measurement rays through the buildings (#2279; test rays chosen for the check, not game data): the exporter casts
 *  each one against the exported nodes of its zone, writes the first hit (point and node) into measurements.json
 *  `buildings`, and tools/unreal-engine/tests/test_exterior.py traces the same ray in Unreal against that zone's
 *  actors. `expect: 'clear'` = an intentional passage that must stay open; `expect: 'glass'` = intentional glazing. */
export function buildingProbes(W, husL = husLLayout(W)) {
  const out = [], blk = (n) => C.SITE.blocks.find((b) => b.name === n);
  const add = (house, zone, id, what, from, to, expect = 'hit') => out.push({ house, zone, id, what, from, to, expect });
  // Hus L (exterior.js, core.js; the row from husL.xw to husL.xe, street façade z 0, courtyard façade z = L1007's depth)
  const x = -27, P = C.PORTIK, K = C.CORE, ys = C.LEVELS[1].floor + 0.4; // (ys: storey 2's spandrel, below the sills)
  add('L', 'hus-l', 'husl_street_facade', 'street (north) façade, storey 2', [x, ys, -12], [x, ys, 6]);
  add('L', 'hus-l', 'husl_court_facade', 'courtyard (south) façade, storey 2', [x, ys, 24], [x, ys, 6]);
  add('L', 'hus-l', 'husl_west_gable', 'west gable', [husL.xw - 15, ys, 6], [husL.xw + 5, ys, 6]);
  add('L', 'hus-l', 'husl_east_gable', 'east gable', [husL.xe + 15, ys, 6], [husL.xe - 5, ys, 6]);
  add('L', 'hus-l', 'husl_roof', 'roof over the row', [x, 30, 6], [x, 0.5, 6]);
  add('L', 'hus-l', 'husl_core_wall', 'stairwell: west inner wall from the landing (core.js)', [(K.x0 + K.x1) / 2, 1.6, (K.south[0] + K.south[1]) / 2], [K.x0 - 1.5, 1.6, (K.south[0] + K.south[1]) / 2]);
  add('L', 'hus-l', 'husl_portik_passage', 'the portik: the open through-passage under Hus L', [(P.west + P.room.wallWest) / 2, 1.2, -3], [(P.west + P.room.wallWest) / 2, 1.2, 15], 'clear');
  // Hus A / B / C (surroundings.js, corehouse.js): SITE.blocks outlines, storeys from `base`
  for (const [h, core] of [['A', C.CORE_A], ['B', C.CORE_B], ['C', C.CORE_C]]) {
    const b = blk(`Hus ${h}`), y = b.base + C.SITE.storey + 0.4, top = b.base + b.storeys * C.SITE.storey;
    const xn = b.x0 + (h === 'B' ? 0.75 : 0.75) * (b.x1 - b.x0), zq = b.z0 + 0.7 * (b.z1 - b.z0), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    add(h, 'kvarteret', `hus${h.toLowerCase()}_north_facade`, 'north façade, storey 2 above the base', [xn, y, b.z0 - 8], [xn, y, b.z0 + 3]);
    add(h, 'kvarteret', `hus${h.toLowerCase()}_east_facade`, 'east façade', [b.x1 + 8, y, zq], [b.x1 - 3, y, zq]);
    add(h, 'kvarteret', `hus${h.toLowerCase()}_west_facade`, 'west façade', [b.x0 - 8, y, zq], [b.x0 + 3, y, zq]);
    add(h, 'kvarteret', `hus${h.toLowerCase()}_south_facade`, 'south façade', [xn, y, b.z1 + 10], [xn, y, b.z1 - 3]);
    add(h, 'kvarteret', `hus${h.toLowerCase()}_roof`, 'roof', [cx, top + 15, cz], [cx, top - 4, cz]);
    const bx = (core.band.x0 + core.band.x1) / 2, bz = (core.band.z0 + core.band.z1) / 2;
    add(h, 'kvarteret', `hus${h.toLowerCase()}_core`, 'stairwell: down through the band at storey 2 (corehouse.js)', [bx, core.stops[2] + 1.5, bz], [bx, core.stops[2] - 1.5, bz]);
    // the entrance's fixed glazing (the core's wall hole with `glass`), from the courtyard through the recess
    const gw = core.walls.find((w) => (w.holes ?? []).some((q) => q.glass)), gh = gw.holes.find((q) => q.glass);
    const ga = (gh.a[0] + gh.a[1]) / 2, gy = core.stops[gw.s[0]] + 1.2, gt = (gw.t[0] + gw.t[1]) / 2;
    const glass = gw.ax === 'z' ? [[ga, gy, b.z0 - 6], [ga, gy, gt + 1]] : [[b.x1 + 6, gy, ga], [gt - 1, gy, ga]];
    add(h, 'kvarteret', `hus${h.toLowerCase()}_entrance_glass`, 'the glazed entrance in its recess', ...glass, 'glass');
  }
  // the garage under the courtyard (garage.js): floor, deck soffit and the park-side wall from inside
  const g = [-30, C.GARAGE.floor + 1.5, 22];
  add('garage', 'kvarteret', 'garage_floor', 'garage floor', g, [g[0], C.GARAGE.floor - 1, g[2]]);
  add('garage', 'kvarteret', 'garage_soffit', 'underside of the courtyard deck', g, [g[0], 1, g[2]]);
  add('garage', 'kvarteret', 'garage_wall', 'the box\'s park-side wall from inside', g, [g[0], g[1], 40]);
  add('garage', 'kvarteret', 'garage_west_wall', 'west wall towards Karpvägen from inside', [-60, g[1], 30], [-75, g[1], 30]);
  return out;
}

/** #2280: ground control points and the walking route (web metres; test points chosen for the check, not game data).
 *  The exporter measures each point on the exported walkable ground (GROUND_NAME nodes of the ground zones, first hit
 *  from above) and writes `ground` into measurements.json; tools/unreal-engine/tests/test_site.py traces the same
 *  points in Unreal and walks the route.
 *  - `elevation` points lie where the web's terrain is data/elevation.json itself (src/surroundings.js elevationWeight 1:
 *    away from the block, the river valley, the edges and the far buildings' pads), on grid vertices of the terrain mesh,
 *    so the drawn ground there is the elevation grid (src/elevation.js gridGround) less the web's 1 cm (terrainSurface).
 *  - `terrain` points lie where the web deliberately departs from the elevation data: the courtyard on the garage box
 *    (C.SITE.terrain.ref: the courtyard is model y 0) and the carved Höje å valley (C.SITE.river). Their reference is
 *    the web's drawn terrain; the elevation value is recorded beside it. */
export function groundProbes() {
  const elevation = [[-150, -250], [-218, -60], [98, -200], [250, -150], [200, -250], [-254, 0], [274, -40], [58, -260], [-182, -300], [-102, -90]]
    .map(([x, z]) => ({ id: `elevation_${tag('x', x)}_${tag('z', z)}`, what: 'open ground on the elevation grid', x, z, reference: 'elevation' }));
  const terrain = [
    ['courtyard_centre', 'courtyard between the pergolas (garage box)', -20, 22],
    ['courtyard_east', 'courtyard east part, before Hus A', 0, 20],
    ['courtyard_west', 'courtyard west part, by Hus C', -55, 40],
    ['river_shore_path', 'Höje å: the shore path east of the road bridge', 36, 110],
    ['river_bank', 'Höje å: the bank above the water', 38, 116],
    ['river_path_west', 'Höje å: the shore path west of the bridges', 6.57, 111.81],
    ['river_bed', 'Höje å: the river bed under the water surface', 1.16, 125.14],
  ].map(([id, what, x, z]) => ({ id, what, x, z, reference: 'terrain' }));
  // START → the street → up the ramp onto the courtyard (SITE.terrain.ramp, landing) → back down → Sankt Lars väg south
  // to the park level → the shore path down into the Höje å valley (SITE.riverPark path 44447963), east of the bridges
  const route = [['START', 2.875, -12], ['street east', 10, -6], ['east leg', 16, 4], ['ramp foot', 12.5, 9], ['ramp', 12.5, 11.6],
    ['ramp top', 12.5, 24], ['landing', 12.5, 26], ['courtyard edge', 8, 26], ['courtyard east', 0, 20], ['courtyard', -20, 22],
    ['back to courtyard edge', 8, 26], ['back to landing', 12.5, 26], ['down the ramp', 12.5, 12], ['east leg again', 16, 6],
    ['Sankt Lars väg', 22, 30], ['park level', 20, 60], ['before the bridge', 20, 90], ['across the road', 35, 93],
    ['shore path top', 48, 95], ['shore path', 44, 101], ['shore path lower', 40, 104], ['river valley', 36, 110], ['by the water', 38, 116]]
    .map(([label, x, z]) => ({ label, x, z }));
  return { points: [...elevation, ...terrain], route };
}

// --- small helpers -------------------------------------------------------------------------------------------------
const cm = (v) => Math.round(v * 100);
const tag = (axis, v) => `${axis}${cm(v) < 0 ? 'm' : ''}${Math.abs(cm(v))}`;
const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const hex = (c) => (c ? '#' + c.getHexString() : null);
const levelOf = (y) => (y < C.LEVELS[1].floor - 0.05 ? 0 : 1);
const inBox = (b, p) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1 && p.y >= b.y0 && p.y <= b.y1;

// --- furnishing textures (#2289) -------------------------------------------------------------------------------------
// Furniture, appliances and lamps (and the curtain/blind cloth, and every unlit sign or label, #2400) keep the web's
// base-colour texture in the GLB, so Interchange imports each picture, rug, cushion, fabric and sign with its image. Building and ground surfaces keep their
// plain keys: #2282 rebuilds those looks in Unreal from material-map.json. The texture's id joins the material key
// (`<key>_t<10 hex>`): one key per look and image. Images load after the synchronous collection, so the driver waits
// for them (`settleImages`) before the GLBs are written; the collected geometry is unaffected.
/** The object kinds whose textured materials travel with their image. */
export const FURNISH_KINDS = new Set(['furniture', 'interactive', 'light']);
const REPO_URL = new URL('../../', import.meta.url).href;
/** A repository path for an image URL (the light profile's `textures/light/x.jpg` is the same picture as `textures/x.jpg`). */
const repoPath = (url) => { const u = String(url ?? ''); const p = u.startsWith(REPO_URL) ? decodeURIComponent(u.slice(REPO_URL.length)) : u; return p.replace(/^textures\/light\//, 'textures/'); };
const imageLoads = new Set(), canvasSources = new WeakMap();
if (typeof HTMLImageElement !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
  // every image the web loads (to wait for it) and which images were drawn into which canvas (a picture's provenance:
  // the matted "Till mamma" print is a canvas painted from textures/teckning-till-mamma.jpg); export page only
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: d.enumerable, get: d.get,
    set(v) { imageLoads.add(this); d.set.call(this, v); } });
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    const from = img instanceof HTMLImageElement ? [repoPath(img.currentSrc || img.src)] : [...(canvasSources.get(img) ?? [])];
    if (from.length && this.canvas) { const s = canvasSources.get(this.canvas) ?? new Set(); from.forEach((x) => s.add(x)); canvasSources.set(this.canvas, s); }
    return draw.call(this, img, ...rest);
  };
}
/** Waits until every image the page started loading has loaded or failed (and their onload painters have run). */
export async function settleImages(limitMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const pending = [...imageLoads].filter((i) => !i.complete);
    if (!pending.length) {
      await new Promise((r) => setTimeout(r, 50)); // onload handlers (canvas painters) run after `complete`
      if (![...imageLoads].some((i) => !i.complete)) return;
      continue;
    }
    if (Date.now() - t0 > limitMs) throw new Error(`images still loading after ${limitMs} ms: ${pending.map((i) => repoPath(i.src)).join(', ')}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
/** cyrb53: a fast, stable 53-bit string hash, as 14 hex digits. */
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
/** One furnishing texture per image identity and sampling (repeat, offset, rotation, wrap, flipY): an image file by
 *  its path, a canvas by its pixels at collection time, a data texture by its bytes. Returns the table entry or null. */
function furnishingTexture(map, table, byMap) {
  if (!map?.image) return null;
  if (byMap.has(map)) return byMap.get(map);
  const img = map.image;
  let kind, ident, file = null;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) { kind = 'image'; file = repoPath(img.src); ident = file; }
  else if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) { kind = 'canvas'; ident = `canvas ${img.width}x${img.height} ${hash53(img.toDataURL())}`; }
  else if (img.data && img.width && img.height) { kind = 'data'; ident = `data ${img.width}x${img.height} ${hash53(Array.from(img.data, (v) => String.fromCharCode(v & 255)).join(''))}`; }
  else { byMap.set(map, null); return null; }
  const sampling = [map.flipY, map.wrapS, map.wrapT, map.offset.x, map.offset.y, map.repeat.x, map.repeat.y, map.rotation].map((v) => (typeof v === 'number' ? r4(v) : v)).join(' ');
  const id = 't' + hash53(`${ident} | ${sampling}`).slice(-10);
  let e = table.get(id);
  if (!e) {
    const out = map.clone(); // same image and sampling; GLTFExporter flips it for glTF and writes KHR_texture_transform
    const base = file ? file.split('/').pop().replace(/\.[a-z0-9]+$/i, '') : kind;
    out.name = `T_${slug(base).replace(/-/g, '_')}_${id}`; out.userData = {};
    e = { id, kind, file, map, out, name: out.name, keys: new Set(), nodes: new Set(), meshes: new Map() };
    table.set(id, e);
  }
  byMap.set(map, e);
  return e;
}

/** Objects that only exist for the web renderer's look (overlays, fake shadows/AO, edge lines, glows): not geometry. */
function webOnly(o) {
  if (['wall-ao', 'contact-shadows', 'architecture-edges'].includes(o.name)) return 'overlay name';
  if (o.isLine || o.isLineSegments || o.isPoints || o.isSprite || o.isLight || o.isCamera) return 'not a mesh';
  if (o.isMesh) {
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.every((m) => !m || m.visible === false || m.colorWrite === false)) return 'invisible material';
    if (ms.every((m) => m.blending !== THREE.NormalBlending)) return 'additive/custom blending (glow, halo, multiply)';
    if (ms.every((m) => m.transparent && m.opacity < 0.02)) return 'fully transparent';
  }
  return null;
}

/** A stable, readable material key from what the material looks like (no web material has a name). The same look
 *  always gives the same key, so Unreal maps keys to hand-made materials (Content/Lunden/Materials/). */
function materialInfo(m) {
  const type = m.isMeshPhysicalMaterial ? 'phys' : m.isMeshStandardMaterial ? 'std' : m.isMeshLambertMaterial ? 'lam'
    : m.isMeshPhongMaterial ? 'pho' : m.isMeshBasicMaterial ? 'bas' : 'mat';
  const color = m.color ? m.color.getHexString() : 'ffffff';
  const rough = m.roughness ?? 1, metal = m.metalness ?? 0;
  const transparent = !!m.transparent && (m.opacity ?? 1) < 1;
  const emissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 && (m.emissiveIntensity ?? 1) > 0;
  const textured = !!(m.map || m.normalMap || m.roughnessMap || m.bumpMap || m.alphaMap);
  let key = `${type}_${color}_r${Math.round(rough * 100)}_m${Math.round(metal * 100)}`;
  if (transparent) key += `_a${Math.round(m.opacity * 100)}`;
  if (emissive) key += `_e${m.emissive.getHexString()}`;
  if (m.vertexColors) key += '_vc';
  if (textured) key += '_tex';
  if (m.side === THREE.DoubleSide) key += '_ds';
  return { key, info: { type, color: '#' + color, roughness: r4(rough), metalness: r4(metal), opacity: transparent ? r4(m.opacity) : 1,
    emissive: emissive ? hex(m.emissive) : null, vertexColors: !!m.vertexColors, textured, doubleSided: m.side === THREE.DoubleSide,
    hint: m.userData?.roomProbe ?? (m.userData?.skin ? 'tile' : null),
    map: m.map?.name || null, // #2308: the colour map's name (e.g. src/grass.js's 'shared-grass-detail' on the lawns)
    // #2318: the web's own surface class (its weather layers tag it: src/wetsurface.js 'brick', 'roof', 'render' …,
    // src/wetground.js 'asphalt', 'paving' …, src/snowground.js's ground class), so test_materials.py finds the brick, roof,
    // asphalt and paving keys from the export
    surface: m.userData?.wetSurface ?? m.userData?.wetGround ?? m.userData?.snowGround ?? null } };
}

/** A plain float geometry with position / normal / uv / colour and the index (no custom or quantised attributes). */
function plainGeometry(g, keepColor) {
  const out = new THREE.BufferGeometry();
  const floatCopy = (a, n) => {
    const arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) arr[i * n + k] = a.getComponent(i, k);
    return new THREE.BufferAttribute(arr, n);
  };
  const p = g.getAttribute('position');
  if (!p || p.count === 0) return null;
  out.setAttribute('position', floatCopy(p, 3));
  if (g.getAttribute('normal')) out.setAttribute('normal', floatCopy(g.getAttribute('normal'), 3));
  if (g.getAttribute('uv')) out.setAttribute('uv', floatCopy(g.getAttribute('uv'), 2));
  if (keepColor && g.getAttribute('color')) out.setAttribute('color', floatCopy(g.getAttribute('color'), Math.min(3, g.getAttribute('color').itemSize)));
  if (g.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array.slice(0, g.index.count)), 1));
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}

export const DEFAULT_ZONES = ['l1007', 'l1007-uteplats', 'fixture', 'l1007-entre', 'hus-l', 'kvarteret', 'gard', 'omgivning', 'vegetation', 'fond'];

/** Builds the world and returns { glbs: {name: base64}, measurements, report }. `zones`: ids to export. */

export async function exportWorld({ zones: wanted = DEFAULT_ZONES, commit = null } = {}) {
  const plan = await fetch(new URL('../../data/plan.json', import.meta.url)).then((r) => r.json());
  const planCopy = JSON.parse(JSON.stringify(plan)); // buildWorld applies CABINET_FIXES to the plan it gets
  // ---- the synchronous part: build, then collect everything before any await ----
  const world = buildWorld(plan);
  const W = planCopy.floors[0].size.x, D = planCopy.floors[0].size.z, patio = planCopy.floors[0].site.patio;
  const ZONES = zoneTable(W, D, patio);
  let lightsInfo = { lamps: [], group: null, error: null };
  try { // the ceiling lamps, pendants and switches (main.js builds them from the world's rooms)
    const { Lights } = await import('../../src/lights.js');
    const group = new THREE.Group();
    const L = new Lights(group, world, { quality: { register() {} }, lowMemory: true }); // (no quality tiers in the export)
    const stairLight = stairLampProfiles(world, L);
    const lamps = [];
    for (const R of L.rooms.values()) for (const l of R.lamps) lamps.push({ room: R.name, level: R.level, pos: l.pos.clone(),
      stairVisibility: stairLight.profiles.get(l), intensity: l.intensity ?? null, distance: l.range ?? null, color: typeof l.color === 'number' ? '#' + l.color.toString(16).padStart(6, '0') : null });
    // #2285: the room switches (their room decides which lamps they switch, src/lights.js Switch / Room)
    const switches = L.switches.map((s) => ({ object: s.object, room: s.room.name, level: s.room.level }));
    const floorRooms = new Map(L.floorLamps.filter(f => f.room.lamps[0]).map(f => [f.spec, L.lampRoom(f.room.lamps[0])]));
    lightsInfo = { lamps, group, switches, stairLight, floorRooms, exportedFloorRooms: new Map(), error: null };
  } catch (e) { lightsInfo.error = String(e?.message ?? e); }
  // #2279: the garage under the courtyard and the four stairwells/lifts (Hus L's and Hus A/B/C's), which main.js builds
  // next to the world. Loaded after the world and the lights so their modules cannot shift the seeded random sequence
  // the l1007 zones were built with. Keep the parked near models; detached rideable copies and far LODs start hidden.
  const extra = { objects: [], group: new Map(), error: null };
  try {
    const [{ Garage }, { Core }, { CoreHouse }] = await Promise.all([import('../../src/garage.js'), import('../../src/core.js'), import('../../src/corehouse.js')]);
    const garage = new Garage();
    const core = new Core();
    Object.assign(extra, { garage, core }); // #2300: the footstep sensor and the outdoor sprint need them (export-player.js)
    extra.lifts = [['l', core.lift]]; // #2285: the lifts' button panels (src/liftpanel.js targets)
    extra.coreDoors = core.doors.map((t, i) => ['l', t, `src/core.js Core.doors[${i}]`, false, core, `L${i}`]); // #2314: the stairwell doors that open
    for (const spec of [C.CORE_A, C.CORE_B, C.CORE_C]) {
      const house = new CoreHouse(spec), letter = spec.house.slice(-1).toLowerCase();
      core.attach(house); extra.lifts.push([letter, house.lift]);
      house.doors.forEach((t, i) => extra.coreDoors.push([letter, t, `src/corehouse.js CoreHouse(${spec.house}).doors[${i}]`, i > 0, house, `${letter.toUpperCase()}${i}`]));
    }
    extra.objects.push(garage.object, garage.door.object, garage.parkObject, core.object); // (not garage.blackout: a web-only mask)
    for (const o of [garage.object, garage.door.object, garage.parkObject]) extra.group.set(o, 'garage');
    extra.group.set(core.own, 'core-l');
    for (const p of core.parts) { extra.group.set(p.object, 'core-abc'); if (p.exterior) extra.group.set(p.exterior, 'core-abc'); }

  } catch (e) { extra.error = String(e?.stack ?? e); }
  // #2310: the fruit bowl on the coffee table (src/fruit.js) and Tilly's basketball in its wall holder (src/basket.js),
  // which main.js builds next to the world: the same classes with main.js's arguments, so they stand where the game puts
  // them (nothing placed by hand). Built last, after every earlier builder, so the seeded random sequence of the other
  // zones stays the same. Not given main.js's bullet marks or hoop (the ball only keeps them for play; the hoop outside
  // is not exported). One node each for the bowl (its fruit as parts), the holder (with the web's saved-layout id) and
  // the ball, which is its own node although the web hangs it in the holder (it leaves the holder in play).
  const loose = { root: new THREE.Group(), of: new Map(), carryables: [], error: null };
  try {
    const [{ FruitBowl }, { Basketball }] = await Promise.all([import('../../src/fruit.js'), import('../../src/basket.js')]);
    const camera = new THREE.PerspectiveCamera();
    const bowl = new FruitBowl(loose.root, camera);
    const ball = new Basketball(loose.root, camera, { marks: null, hoop: {}, world });
    const holder = ball.holderMovable();
    loose.carryables.push(bowl.carryable, ball);
    loose.of.set(bowl.group, { type: 'fruitbowl', name: 'fruktskålen', webId: null, source: 'src/config.js#FRUIT' });
    loose.of.set(holder.object, { type: holder.item.type, name: holder.name, webId: holder.id, source: 'src/config.js#BASKET.ball' });
    loose.of.set(ball.model, { type: 'basketball', name: ball.name, webId: null, source: 'src/config.js#BASKET.ball' });
    const site = planCopy.floors[0].site;
    if (site.fences?.length) {
      const strings = buildStringLights(site.fences, site.patio ? (site.patio.x0 + site.patio.x1) / 2 : W / 2);
      updateStringLights(strings, 1, 0, 1); // the export's clear daytime reference, power on
      loose.root.add(strings.object);
      loose.of.set(strings.object, { type: 'patiostringlights', name: 'ljusslingan', webId: null, source: 'src/config.js#PATIO.stringLights' });
      lightsInfo.patioStrings = strings.lamps;
      lightsInfo.patioBulb = strings.mat;
    }
    // #2429: the TV remote on the coffee table (src/remote.js, #101), a Holdable main.js builds next to the world: the
    // same class at its home pose. Only the object; pointing it at a TV belongs to the TV group (#2354). No TV finder.
    const { Remote } = await import('../../src/remote.js');
    const remote = new Remote(loose.root, camera, () => null);
    loose.carryables.push(remote);
    loose.of.set(remote.model, { type: 'remote', name: remote.name, webId: null, source: 'src/config.js#REMOTE' });
  } catch (e) { loose.error = String(e?.stack ?? e); }
  // main.js adds Hoop outside buildWorld. Keep the static court paint at the same world transform,
  // including its clearance above the car park. The scoring volumes and the hoop stay in the game.
  const { Hoop } = await import('../../src/basket.js');
  const hoop = new Hoop();
  const courtLines = hoop.courtMesh;
  courtLines.name = 'basket-court-lines';
  const scene = new THREE.Group();
  scene.attach(courtLines);
  extra.group.set(courtLines, 'basket-court');
  scene.add(world.object);
  if (lightsInfo.group) scene.add(lightsInfo.group);
  for (const o of extra.objects) scene.add(o);
  scene.add(loose.root);
  scene.updateMatrixWorld(true);
  if (!extra.garage) throw Error(extra.error || "Garage missing from parked vehicle export");
  const parked = parkedVehicles(world, extra.garage);
  // which builder each object comes from (zoneTable `from`)
  const groupOf = new Map(extra.group);
  for (const c of world.object.children) {
    if (c.userData?.entryLeaves) groupOf.set(c, 'exterior');
    else if (c.userData?.siteNeighborOpenings) groupOf.set(c, 'surroundings');
    else if (/^lägenhet /.test(c.name ?? '')) groupOf.set(c, 'visit');
  }
  const portik = world.doors.find((d) => d.name === 'dörren till lilla rummet');
  if (portik) groupOf.set(portik.object, 'portik');
  const sourceGroup = (o) => {
    let ground = false;
    for (; o; o = o.parent) {
      if (SITE_NAME.test(o.name ?? '')) ground = true;
      const g = groupOf.get(o);
      if (g) return g === 'surroundings' && ground ? 'surroundings-site' : g;
    }
    return 'world';
  };

  // what each special object is
  const doorOf = new Map(); // object → { kind, owner }
  world.doors.forEach((d, i) => doorOf.set(d.object, { kind: 'door', owner: d, index: i }));
  for (const l of world.lids ?? []) if (l?.object && !doorOf.has(l.object)) doorOf.set(l.object, { kind: l.name === 'fönstret' ? 'window' : 'interactive', owner: l });
  const furnitureOf = new Map();
  for (const m of world.furniture.movable ?? []) if (!furnitureOf.has(m.object)) furnitureOf.set(m.object, m);
  const furnitureRoots = new Set(world.furniture.object.children);
  const furnitureIndex = (item) => C.FURNITURE.indexOf(item);
  const lampOf = new Map();
  for (const l of world.lamps ?? []) if (l?.object) lampOf.set(l.object, l);
  const lightGroupKids = new Set(lightsInfo.group ? lightsInfo.group.children : []);
  const planWalls = planCopy.floors.flatMap((f, li) => f.walls.map((w, i) => {
    const xs = w.outer.map((p) => p[0]), zs = w.outer.map((p) => p[1]);
    return { li, i, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }));

  // ---- walk the scene into atoms: the units that are exported as one node each ----
  const atoms = [], skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const box = new THREE.Box3(), centre = new THREE.Vector3(), hiddenProbe = new THREE.Matrix4();
  const visibleBox = (o) => { // world box of the visible, exported meshes under o
    const b = new THREE.Box3();
    o.traverseVisible((m) => { if (m.isMesh && !webOnly(m)) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (m.isInstancedMesh) { if (!m.boundingBox) m.computeBoundingBox(); b.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
      else b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
    return b;
  };
  const visit = (o, ctx) => {
    if (o.name === 'entrance-plants-far') return skip('distance stand-in of the entrance plants (web LOD; the near plants are exported)');
    if (!o.visible) return skip('hidden');
    const why = webOnly(o);
    if (why) return o.isMesh || o.isLine || o.isPoints ? skip(why) : undefined;
    const d = doorOf.get(o);
    if (d) return atoms.push({ object: o, kind: d.kind, door: d });
    if (furnitureRoots.has(o)) return atoms.push({ object: o, kind: 'furniture', movable: furnitureOf.get(o) });
    if (loose.of.has(o)) { // #2310: a loose object is one node; one inside it (the ball in its holder) is its own node
      atoms.push({ object: o, kind: 'furniture', loose: loose.of.get(o) });
      for (const c of o.children) if (loose.of.has(c)) visit(c, ctx);
      return;
    }
    if (lampOf.has(o)) return atoms.push({ object: o, kind: 'light', lamp: lampOf.get(o) });
    if (lightGroupKids.has(o)) return atoms.push({ object: o, kind: 'light', fixture: true });
    if (o.isInstancedMesh) { // an instance scaled to zero is the web's way of hiding it (its matrix has no rotation: NaN in glTF)
      for (let i = 0; i < o.count; i++) {
        if (Math.abs((o.getMatrixAt(i, hiddenProbe), hiddenProbe).determinant()) < 1e-12) { skip('zero-scale instance (hidden)'); continue; }
        atoms.push({ object: o, kind: ctx.kind ?? null, instance: i });
      }
      return;
    }
    if (o.isMesh) return atoms.push({ object: o, kind: ctx.kind ?? null });
    for (const c of o.children) visit(c, ctx);
  };
  visit(scene, {});

  // ---- zone, kind, id and source for each atom ----
  const im = new THREE.Matrix4();
  const worldMatrix = (a) => (a.instance === undefined ? a.object.matrixWorld.clone()
    : (a.object.getMatrixAt(a.instance, im), a.object.matrixWorld.clone().multiply(im)));
  const exportedZones = ZONES.filter((z) => z.status === 'exported' && z.box), splitZones = exportedZones.filter((z) => z.split);
  const byZone = new Map(exportedZones.filter((z) => wanted.includes(z.id)).map((z) => [z.id, []]));
  const holds = (outer, b) => b.min.x >= outer.x0 && b.max.x <= outer.x1 && b.min.y >= outer.y0 && b.max.y <= outer.y1 && b.min.z >= outer.z0 && b.max.z <= outer.z1;
  const meets = (z, b) => b.max.x >= z.x0 && b.min.x <= z.x1 && b.max.y >= z.y0 && b.min.y <= z.y1 && b.max.z >= z.z0 && b.min.z <= z.z1;
  const overlaps = (z, b) => b.max.x > z.x0 && b.min.x < z.x1 && b.max.y > z.y0 && b.min.y < z.y1 && b.max.z > z.z0 && b.min.z < z.z1;
  const split = { atoms: 0, pieces: 0, triangles: 0, dropped: 0, cut: 0, meshes: [] }, unassigned = {};
  const place = (a, zone, b) => {
    a.zone = zone.id; a.box = b.clone(); a.centre = b.getCenter(new THREE.Vector3()); a.level = levelOf(b.min.y + 0.05);
    byZone.get(zone.id)?.push(a); // (a zone not asked for: classified, not written)
  };
  for (const a of atoms) {
    if (a.instance !== undefined) {
      const g = a.object.geometry; if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox).applyMatrix4(worldMatrix(a));
    } else box.copy(visibleBox(a.object));
    if (box.isEmpty()) { skip('empty'); continue; }
    box.getCenter(centre);
    if (parked.meshes.has(a.object)) {
      const part = parked.meshes.get(a.object);
      place(a, exportedZones.find(z => z.id === part.zone), box);
      continue;
    }
    const group = sourceGroup(a.object);
    const zone = exportedZones.find((z) => accepts(z, group, a) && inBox(z.box, centre));
    const cuttable = a.instance === undefined && a.object.isMesh && !a.object.isInstancedMesh
      && !a.object.children.some((c) => c.visible && c.isMesh) && a.kind == null;
    // a merged mesh is cut when it reaches past its zone's box, or (#2280: the ground zones' boxes hold the others') into
    // an earlier split zone that also takes it; a mesh in no zone is cut when it touches one
    const crosses = (z) => accepts(z, group, a) && (z === zone ? !holds(z.box, box)
      : !zone ? meets(z.box, box) : exportedZones.indexOf(z) < exportedZones.indexOf(zone) && overlaps(z.box, box));
    if ((!zone || zone.split) && cuttable && splitZones.some(crosses)) {
      // a merged mesh across zone boxes: one piece per zone, triangle by triangle (#2279)
      const mine = splitZones.filter((z) => accepts(z, group, a));
      const zoneFor = (p) => mine.find((z) => inBox(z.box, p))?.id ?? null;
      const cuts = mine.flatMap((z) => [['x', z.box.x0], ['x', z.box.x1], ['z', z.box.z0], ['z', z.box.z1]])
        .filter(([axis, at]) => at > box.min[axis] && at < box.max[axis]).map(([axis, at]) => ({ axis, at }));
      const r = splitMesh(a.object, zoneFor, cuts);
      split.atoms++; split.triangles += r.total; split.dropped += r.dropped; split.cut += r.cut;
      split.meshes.push({ name: a.object.name || null, group, triangles: r.total, cut: r.cut, pieces: Object.fromEntries(r.pieces.map((p) => [p.zone, p.triangles])) });
      for (const pc of r.pieces) {
        const m = new THREE.Mesh(pc.geometry, a.object.material);
        m.name = a.object.name; m.matrixAutoUpdate = false; m.matrix.copy(a.object.matrixWorld); m.matrixWorld.copy(a.object.matrixWorld);
        pc.geometry.computeBoundingBox();
        const piece = { object: m, kind: null, splitFrom: a.object, group };
        split.pieces++;
        place(piece, ZONES.find((z) => z.id === pc.zone), pc.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
      }
      if (r.dropped) { const u = (unassigned[group] ??= { atoms: 0, triangles: 0 }); u.triangles += r.dropped; }
      continue;
    }
    if (!zone) {
      const u = (unassigned[group] ??= { atoms: 0, triangles: 0 }); u.atoms++;
      continue;
    }
    a.group = group;
    place(a, zone, box);
  }
  const ids = new Set();
  const unique = (id) => { let u = id, n = 2; while (ids.has(u)) u = `${id}_${n++}`; ids.add(u); return u; };
  const pos = (p) => `${tag('x', p.x)}_${tag('z', p.z)}`;
  for (const list of byZone.values()) for (const a of list) {
    const c = a.centre, lv = `l${a.level}`;
    if (parked.meshes.has(a.object)) {
      const first = parked.meshes.get(a.object).instances.get(a.instance)[0].vehicle;
      a.kind = 'structure'; a.name = first.area + ' parked ' + (first.id.includes('-car-') ? 'car' : 'bicycle');
      a.source = ({street:'src/streetlife.js',yard:'src/streetlife.js',eastlot:'src/eastlot.js',garage:'src/garage.js parked vehicles',
        storage:'src/garage.js parked bicycles',courtyard:'src/courtyard.js'})[first.area];
      a.id = unique('parked_' + first.id.replaceAll('-', '_'));
      recordParkedPart(parked, a, worldMatrix(a)); continue;
    }
    if (a.kind === 'door') {
      const d = a.door.owner;
      const h = d.hinge ? { x: d.hinge[0], z: d.hinge[1] } : c;
      const pi = d.hinge ? planCopy.floors[a.level]?.doors.findIndex((p) => Math.hypot(p.hinge[0] - d.hinge[0], p.hinge[1] - d.hinge[1]) < 0.02) : -1;
      a.id = unique(`door_${lv}_${pos(h)}`);
      a.source = pi >= 0 ? `data/plan.json#/floors/${a.level}/doors/${pi}` : `world.doors[${a.door.index}]`;
      a.name = d.name ?? (d.kind === 'sliding' ? 'skjutdörren' : 'dörren');
    } else if (a.kind === 'window') {
      const p = new THREE.Vector3().setFromMatrixPosition(a.object.matrixWorld);
      const wi = planCopy.floors[a.level]?.windows.findIndex((w) => p.x >= w.x0 - 0.05 && p.x <= w.x1 + 0.05 && p.z >= w.z0 - 0.3 && p.z <= w.z1 + 0.3);
      a.id = unique(`window_${lv}_${pos(p)}`);
      a.source = wi >= 0 ? `data/plan.json#/floors/${a.level}/windows/${wi}` : null;
      a.name = 'fönstret';
    } else if (a.kind === 'interactive') {
      a.name = a.door.owner.name ?? null;
      a.id = unique(`int_${slug(a.name) || 'openable'}_${lv}_${pos(c)}`);
      a.source = null;
    } else if (a.kind === 'furniture' && a.loose) { // #2310: the fruit bowl, the basketball holder and the ball (#2429: the TV remote)
      Object.assign(a, { name: a.loose.name, webId: a.loose.webId, source: a.loose.source });
      a.id = unique(`furn_${slug(a.loose.type)}_${lv}_${pos(c)}`);
    } else if (a.kind === 'furniture') {
      const m = a.movable, item = m?.item;
      const fi = item ? furnitureIndex(item) : -1;
      a.name = m?.name ?? null; a.webId = m?.id ?? null;
      a.id = unique(`furn_${slug(item?.type ?? a.name) || 'item'}_${lv}_${pos(c)}`);
      a.source = fi >= 0 ? `src/config.js#FURNITURE[${fi}]` : null;
    } else if (a.kind === 'light') {
      a.name = a.lamp?.name ?? a.object.name ?? null;
      a.id = unique(`light_${slug(a.name) || (a.fixture ? 'fixture' : 'lamp')}_${lv}_${pos(c)}`);
      a.source = a.fixture ? 'src/lights.js (ceiling fixture)' : 'world.lamps';
    } else {
      // walls are the plan's wall polygons, extruded floor → ceiling (src/world.js levelParts)
      const b = a.box, pw = planWalls.find((w) => w.li === a.level && Math.abs(w.x0 - b.min.x) < 0.003 && Math.abs(w.x1 - b.max.x) < 0.003
        && Math.abs(w.z0 - b.min.z) < 0.003 && Math.abs(w.z1 - b.max.z) < 0.003 && b.max.y - b.min.y > 2);
      a.kind = pw ? 'wall' : 'structure';
      a.name = a.object.name || null;
      a.source = pw ? `data/plan.json#/floors/${pw.li}/walls/${pw.i}` : ZONES.find((z) => z.id === a.zone)?.split ? (GROUP_SOURCE[a.group] ?? null) : null;
      a.id = unique(`${pw ? 'wall' : 'mesh'}_${slug(a.name) ? slug(a.name) + '_' : ''}${lv}_${pos(c)}_${tag('y', c.y)}`);
    }
  }

  // Coverage refreshes geometry bounds, so assign historical node IDs before checking furniture support.
  const tree = world.furniture.movable.find((p) => p.item.type === 'xmastree');
  const seasons = new Map();
  // #2387: the patio's decorative cushions are out in src/patio.js cushionsOut's months (the parasol's) and in the
  // cushion box otherwise. Its rain-cloud condition needs live weather, which the date window cannot carry (#2331).
  const cushionWindow = patioCushionWindow();
  for (const piece of world.furniture.movable) {
    if (piece.item.type !== 'veronasofa') continue;
    piece.object.traverse((o) => { if (o.isMesh && o.userData.cushion) seasons.set(o, cushionWindow); });
  }
  // #2406: the slat table's two pints stand in src/patio.js beersOut's months and clock hours. The web's scene hides the
  // group until Patio.update shows it, so it is shown here, after the furniture IDs and boxes have been set (the table
  // keeps its id). Every node of it carries the window, since a part's `parent` names the table, not the group.
  const beerWindow = patioBeerWindow(), beerParts = new Map(), beerGlasses = [];
  for (const piece of world.furniture.movable) piece.object.traverse((o) => {
    if (!o.userData.patioBeers) return;
    o.visible = true;
    o.traverse((d) => { seasons.set(d, beerWindow); beerParts.set(d, null); });
    beerGlasses.push(...o.children);
  });
  if (tree) {
    const { from, to } = C.XMAS_TREE.season;
    seasons.set(tree.object, { what: 'christmas', from, to });
    // The installed Seasons component understands inclusive windows. A leap year supplies all possible month/day keys.
    const adjacentDay = ([month, day], shift) => {
      const date = new Date(Date.UTC(2000, month - 1, day + shift));
      return [date.getUTCMonth() + 1, date.getUTCDate()];
    };
    const outside = { what: 'outsideChristmas', from: adjacentDay(to, 1), to: adjacentDay(from, -1) };
    const groups = new FurnitureGroups(world, () => loose.carryables);
    const covered = christmasCoverage(groups, tree);
    for (const piece of covered.pieces) seasons.set(piece.object, outside);
    for (const handle of covered.loose) seasons.set(handle.model, outside);
  }

  const { dayOfYear, sunDirection } = await import('../../src/daycycle.js');
  const referenceDate = new Date(); // export-world.mjs pins the clock
  const month = referenceDate.getUTCMonth() + 1;
  const doy = dayOfYear(referenceDate.getUTCFullYear(), month, referenceDate.getUTCDate());
  const hour = Number(new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Stockholm' }).format(referenceDate));
  updateParasols({ month, sunDir: sunDirection(hour, doy), overcast: 0 }, 0, true);
  world.object.updateMatrixWorld(true); // apply the canopy after the furniture IDs have been assigned

  // ---- build the export scenes ----
  const materials = new Map(), matCache = new Map(), furnishCache = new Map(), geoCache = new Map(), materialTable = {};
  const textures = new Map(), textureOfMap = new Map(); // #2289: furnishing textures by id, and by web texture
  // #2318: every web material one key collapses (`looks`: surface class, colour-map name, and `mapIndex`, the colour map's
  // first-use order in this export, since canvas maps have no name: an untagged material drawing the same canvas as a tagged
  // one shows the same picture) and, for a key with more than one look, the nodes showing each, so a rule can pick a look by
  // mesh (the asphalt and the hall tiles share std_ffffff_r100_m0_tex)
  const looks = new Map(), mapIndex = new Map(); let lookAtom = null;
  const noteLook = (m, key) => {
    if (m.map && !mapIndex.has(m.map)) mapIndex.set(m.map, mapIndex.size);
    const info = materialInfo(m).info, look = JSON.stringify({ surface: info.surface, map: info.map, mapIndex: m.map ? mapIndex.get(m.map) : null });
    const byLook = looks.get(key) ?? looks.set(key, new Map()).get(key);
    const nodes = byLook.get(look) ?? byLook.set(look, new Set()).get(look);
    if (lookAtom) nodes.add(lookAtom);
  };
  // `furnish` (#2289): a furniture/appliance/lamp/curtain mesh keeps its base-colour image (FURNISH_KINDS)
  const curtains = wanted.includes('l1007') ? curtainProfiles(world.blinds) : new Map();
  const exportMaterial = (m, furnish = false, bark = null) => {
    const cache = furnish ? furnishCache : matCache;
    if (cache.has(m)) { noteLook(m, cache.get(m).name); return cache.get(m); }
    const { key: base, info } = materialInfo(m);
    // The rail and sign need distinct keys; the hedge tints already identify them.
    // In particular the pilot ground builder loads the original patio-hedge material path.
    const hedge = m.name === 'patio-hedge' || m.name === 'boxwood';
    const siteMap = m.map?.name === 'site-slatted-rail' || m.map?.name === 'site-house-letters' || m.map?.name === 'parked-bicycle-spokes'
      || m.map?.name === 'garage-cage-mesh'; // #2399: the storage cages' wire mesh
    // #2400: an unlit web material (MeshBasicMaterial) with a colour map is a sign, label or pictogram whose image is its whole
    // look (the flats' number signs and name plates in Hus A, B, C and L, the garage's sign plates, exit pictograms and floor
    // markings, the stairwells' floor numbers): it keeps that image like a furnishing texture, one key per canvas, since each
    // house paints its own atlas under the same plain key
    const label = !!(m.isMeshBasicMaterial && m.map);
    const tex = (furnish || label) && !hedge && !siteMap ? furnishingTexture(m.map, textures, textureOfMap) : null;
    const bulb = m === lightsInfo.patioBulb;
    const siteSuffix = siteMap ? m.map.name.replaceAll('-', '_') : null;
    // Keep the unlit bulbs, bark textures and three foliage types distinct from furnishing images.
    const river = m.userData.riverSurface;
    const riverSuffix = river && (river.flow ? 'river_flow' : 'river_edge');
    const suffix = bulb ? 'patio_string_bulb' : riverSuffix || siteSuffix || bark || LEAF_VARIANTS.get(m.name) || tex?.id;
    const key = suffix ? `${base}_${suffix}` : base;
    let em = materials.get(key);
    if (!em) {
      em = bulb ? new THREE.MeshBasicMaterial({ name: key, color: m.color }) : new THREE.MeshStandardMaterial({ name: key, color: new THREE.Color(info.color), roughness: info.roughness, metalness: info.metalness,
        transparent: info.opacity < 1, opacity: info.opacity, side: info.doubleSided ? THREE.DoubleSide : THREE.FrontSide, vertexColors: info.vertexColors });
      if (info.emissive) em.emissive = new THREE.Color(info.emissive);
      if (hedge) em.map = hedgeTexture(m);
      else if (siteMap) { em.map = m.map; em.alphaTest = m.alphaTest; }
      else if (bark) {
        // Original trunk maps from foliage.js/barksurface.js. glTF reads roughness from G and metalness from B (zero).
        em.map = m.map;
        em.roughnessMap = em.metalnessMap = m.roughnessMap;
      } else if (tex) { em.map = tex.out; em.userData.texture = tex.id; }
      const curtain = curtains.get(m);
      if (curtain) {
        em.emissiveMap = em.map; // same sRGB texels, sampler, UV channel and transform
        em.emissive.fromArray(curtain.daylight); // daylight fallback for an imported mesh without a running controller
      }
      materials.set(key, em); materialTable[key] = tex ? { ...info, texture: tex.id } : info;
    }
    if (tex) tex.keys.add(key);
    cache.set(m, em);
    noteLook(m, key);
    return em;
  };
  const exportGeometry = (mesh, keepColor) => {
    const k = mesh.geometry.uuid + (keepColor ? ':c' : '');
    if (!geoCache.has(k)) geoCache.set(k, plainGeometry(mesh.geometry, keepColor));
    return geoCache.get(k);
  };
  // a curtain or blind cloth (src/curtains.js, src/blinds.js tag the cloth with the openable it belongs to) is a textile
  const meshNode = (mesh, furnish = false, material = mesh.material) => {
    const ms = Array.isArray(material) ? material : [material];
    let g = exportGeometry(mesh, ms.some((m) => m.vertexColors));
    if (!g) return null;
    if (mesh.material.userData?.riverSurface) g = riverGeometry(mesh, g.clone(), mesh.material.userData.riverSurface);
    const cloth = furnish || !!mesh.userData?.door;
    const trunk = mesh.geometry.userData.bark; // trunkGeometry marks both detailed species and the plain far LOD
    const em = ms.map((m) => exportMaterial(m, cloth, trunk === 'bark' || trunk === 'birch' ? trunk : null));
    const n = new THREE.Mesh(g, Array.isArray(mesh.material) ? em : em[0]);
    if (!mesh.castShadow) noShadow.add(n); // #2426: written as extras.castShadow once the node's extras are final
    return n;
  };
  const stats = {};
  // #2426: the web mesh casts no sun shadow (three's castShadow false, its default). Unreal casts from every imported
  // component unless told otherwise, so the node says so (absent = casts); import_world.py turns cast_shadow off.
  const noShadow = new WeakSet();
  const subtree = (o, atomId, counter, keys, furnish) => { // o's visible exported content, local transforms kept
    const n = o.isMesh && !o.isInstancedMesh ? meshNode(o, furnish) : new THREE.Group();
    if (!n) return null;
    if (o.isMesh && !o.isInstancedMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => keys.add(m.name));
    // #2406: the pints come after the table's own parts, so those keep the part ids they had before the pints were exported
    const kids = o.children.some((c) => beerParts.has(c)) ? [...o.children.filter((c) => !beerParts.has(c)), ...o.children.filter((c) => beerParts.has(c))] : o.children;
    for (const c of kids) {
      if (!c.visible || webOnly(c) || loose.of.has(c)) continue; // (#2310: the ball is its own node, not part of its holder)
      if (c.isInstancedMesh && beerParts.has(c)) continue; // #2406: a beer's rising bubbles animate on the web only
      if (c.isInstancedMesh) {
        for (let i = 0; i < c.count; i++) {
          const node = meshNode(c, furnish); if (!node) continue;
          c.getMatrixAt(i, im); node.matrix.copy(c.matrix).multiply(im); node.matrix.decompose(node.position, node.quaternion, node.scale);
          node.name = `${atomId}__${counter.n++}`; node.userData = { id: node.name, kind: 'part', parent: atomId };
          if (c.material === lightsInfo.patioBulb) node.userData.patioStringBulb = true;
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => keys.add(m.name));
          n.add(node);
        }
        continue;
      }
      const s = subtree(c, atomId, counter, keys, furnish);
      if (!s) continue;
      s.position.copy(c.position); s.quaternion.copy(c.quaternion); s.scale.copy(c.scale);
      s.name = `${atomId}__${counter.n++}`; s.userData = { id: s.name, kind: 'part', parent: atomId };
      const season = seasons.get(c); // #2387: a seasonal part inside an all-year piece (the sofa's cushions)
      if (season) s.userData.seasonal = season;
      if (beerParts.has(c)) beerParts.set(c, s.name);
      n.add(s);
    }
    return n;
  };
  const roots = {};
  for (const [zoneId, list] of byZone) {
    const root = new THREE.Group(); root.name = zoneId;
    root.userData = { id: zoneId, kind: 'zone', zone: zoneId, formatVersion: FORMAT_VERSION };
    let tris = 0;
    for (const a of list) {
      const keys = new Set(), counter = { n: 1 };
      let node;
      const furnish = FURNISH_KINDS.has(a.kind);
      lookAtom = a.id;
      if (a.instance !== undefined || parked.meshes.has(a.object)) node = meshNode(a.object, furnish, parked.meshes.has(a.object) ? parkedMaterial(a.object, a.instance) : a.object.material), node && (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => keys.add(m.name));
      else node = subtree(a.object, a.id, counter, keys, furnish);
      if (!node) continue;
      worldMatrix(a).decompose(node.position, node.quaternion, node.scale);
      node.name = a.id;
      node.userData = { id: a.id, kind: a.kind, zone: zoneId, level: a.level, source: a.source ?? null, name: a.name ?? null,
        webId: a.webId ?? null, materialKeys: [...keys].sort() };
      const season = seasons.get(a.object);
      if (season) node.userData.seasonal = season;
      node.traverse((m) => { // #2289: which nodes and meshes show each furnishing texture
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          const e = mat.userData.texture && textures.get(mat.userData.texture);
          if (e) { e.nodes.add(a.id); if (!e.meshes.has(m.name)) e.meshes.set(m.name, m); }
        }
      });
      node.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; });
      root.add(node);
      stats[a.kind] = (stats[a.kind] ?? 0) + 1;
    }
    root.traverse((o) => { if (noShadow.has(o)) o.userData.castShadow = false; });
    const zone = ZONES.find((z) => z.id === zoneId);
    lookAtom = null;
    tris += parkedCollision(root, parked, zoneId);
    if (zone.collision) tris += addCollision(root, world, zoneId, W, D, unique);
    roots[zoneId] = { root, triangles: Math.round(tris) };
  }
  lookAtom = null;
  for (const [key, byLook] of looks) {
    if (!materialTable[key]) continue;
    const list = [...byLook].map(([l, nodes]) => ({ ...JSON.parse(l), ...(byLook.size > 1 ? { nodes: [...nodes].sort() } : {}) }));
    materialTable[key].looks = list.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (wanted.includes('fixture')) roots.fixture = { root: fixtureScene(W, D, unique), triangles: 0 };

  // ---- the buildings' measurement rays (#2279), cast on exactly what is exported ----
  // Geometry, not face culling: every face counts from both sides here and in the Unreal test (it sets double-sided
  // collision on the measured meshes), so a ray stops at the first surface whichever way it faces.
  const buildings = [], ray = new THREE.Raycaster(), sides = [...materials.values()].map((m) => [m, m.side]);
  for (const [m] of sides) m.side = THREE.DoubleSide;
  for (const pr of buildingProbes(W)) {
    const root = roots[pr.zone]?.root;
    if (!root) continue;
    root.updateMatrixWorld(true);
    const from = new THREE.Vector3(...pr.from), to = new THREE.Vector3(...pr.to), dir = to.clone().sub(from), far = dir.length();
    ray.set(from, dir.normalize()); ray.far = far;
    const hit = ray.intersectObject(root, true).find((h) => h.object.userData.kind !== 'collision');
    let node = null, key = null;
    if (hit) {
      for (let o = hit.object; o && o !== root; o = o.parent) if (o.userData.kind && o.userData.kind !== 'part') { node = o.userData.id; break; }
      const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
      const gr = hit.object.geometry.groups.find((q) => hit.faceIndex * 3 >= q.start && hit.faceIndex * 3 < q.start + q.count);
      key = (mats[gr?.materialIndex ?? 0] ?? mats[0])?.name ?? null;
    }
    buildings.push({ ...pr, from: webToUnrealRounded(pr.from), to: webToUnrealRounded(pr.to), web: { from: pr.from, to: pr.to },
      hit: hit ? { web: [r4(hit.point.x), r4(hit.point.y), r4(hit.point.z)], unreal: webToUnrealRounded([hit.point.x, hit.point.y, hit.point.z]),
        distanceCm: roundCm(hit.distance * 100), node, materialKey: key } : null });
  }
  for (const [m, side] of sides) m.side = side;

  // ---- the ground (#2280): walkable nodes, control points and the route, measured on what is exported ----
  let ground = null;
  const groundZones = ['l1007-entre', 'gard', 'omgivning'].filter((z) => roots[z]);
  if (groundZones.includes('gard') && groundZones.includes('omgivning')) {
    const walkable = [];
    const flat = new THREE.Box3();
    for (const z of groundZones) roots[z].root.updateMatrixWorld(true);
    for (const z of groundZones) for (const n of roots[z].root.children) {
      // named ground batches, and the plain ground plates world.js lays under Hus L and its portik (unnamed, level)
      const plate = !n.userData.name && flat.setFromObject(n).max.y - flat.min.y < 0.005
        && Math.abs(flat.max.y - groundY((flat.min.x + flat.max.x) / 2, (flat.min.z + flat.max.z) / 2)) < 0.1;
      if (GROUND_NAME.test(n.userData.name ?? '') || plate) walkable.push(n);
    }
    const down = new THREE.Raycaster();
    const top = (x, z) => { // the first walkable surface from above (both sides count, as in the Unreal trace)
      down.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)); down.far = 120;
      for (const [m] of sides) m.side = THREE.DoubleSide;
      const hit = down.intersectObjects(walkable, true)[0];
      for (const [m, side] of sides) m.side = side;
      if (!hit) return null;
      let o = hit.object; while (o.parent && o.userData.kind === 'part') o = o.parent;
      return { y: r4(hit.point.y), unrealZ: roundCm(hit.point.y * 100), node: o.userData.id, zone: o.userData.zone, name: o.userData.name ?? null };
    };
    const probes = groundProbes();
    ground = {
      source: 'tools/unreal-engine/export-scene.js groundProbes; data/elevation.json via src/elevation.js gridGround; src/surroundings.js groundY, renderedTerrainY',
      walkableName: String(GROUND_NAME), skip: String(SITE_SKIP),
      collision: walkable.map((n) => ({ id: n.userData.id, zone: n.userData.zone, name: n.userData.name ?? null })),
      points: probes.points.map((p) => ({ ...p, unreal: webToUnrealRounded([p.x, 0, p.z]).slice(0, 2), elevationY: r4(gridGround(p.x, p.z)),
        groundY: r4(groundY(p.x, p.z)), terrainY: r4(renderedTerrainY(p.x, p.z)), hit: top(p.x, p.z) })),
      route: probes.route.map((p) => ({ ...p, unreal: webToUnrealRounded([p.x, 0, p.z]).slice(0, 2), groundY: r4(groundY(p.x, p.z)), hit: top(p.x, p.z) })),
    };
    const missing = [...ground.points, ...ground.route].filter((p) => !p.hit).map((p) => p.id ?? p.label);
    if (missing.length) throw new Error(`ground probes with no walkable ground under them: ${missing.join(', ')}`);
  }

  // ---- the vegetation (#2281): every exported tree (its trunk instance and crown lobes) and hedge, with a height class ----
  const hedgeIds = new Set();
  for (const list of byZone.values()) for (const a of list) if (isHedge(a.object)) hedgeIds.add(a.id);
  const leafKeys = new Set(), stillLeafKeys = new Set();
  for (const a of byZone.get('vegetation') ?? []) {
    const ms = [a.object.material ?? []].flat();
    for (const m of ms) {
      if (!(/^tree-crowns /.test(a.object.name ?? '') || m === leafMaterial() || m === windLeafMaterial().material)) continue;
      const key = matCache.get(m)?.name;
      if (!key) continue; // the geometry may have been omitted from the GLB
      leafKeys.add(key);
      if (m === leafMaterial()) stillLeafKeys.add(key);
    }
  }
  const vegetation = roots.vegetation ? vegetationData(roots, hedgeIds, [...leafKeys].sort(), [...stillLeafKeys].sort()) : null;

  // ---- GLB per zone ----
  // #2289: the furnishing textures' images must have loaded (and canvases painted from them) before they are written
  if (textures.size) await settleImages();
  const exporter = new GLTFExporter();
  const glbs = {}, zoneReport = [];
  for (const [zoneId, { root, triangles }] of Object.entries(roots)) {
    const buf = canonicalImages(await exporter.parseAsync(root, { binary: true, onlyVisible: true, includeCustomExtensions: false, trs: true, maxTextureSize: FURNISH_TEXTURE_MAX }));
    let nodes = 0; root.traverse(() => nodes++);
    glbs[`${zoneId}.glb`] = btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(''));
    zoneReport.push({ zone: zoneId, nodes, triangles, bytes: buf.byteLength });
  }

  // ---- measurement data ----
  const measurements = measurementData({ world, planCopy, W, D, byZone, lightsInfo, seasons, materialTable, commit, ZONES, wanted, lifts: extra.lifts ?? [],
    coreDoors: extra.coreDoors ?? [], garage: extra.garage ?? null });
  if (lightsInfo.stairLight) measurements.stair.lightBounds = lightsInfo.stairLight.bounds;
  if (wanted.includes('l1007')) measurements.site.livingWallLight = livingWallLight(world);
  measurements.site.parkedVehicles = {
    vehicles: [...parked.vehicles.values()].filter(v => wanted.includes(v.zone)),
    blockers: parked.footprints.filter(v => wanted.includes(v.zone)),
  };
  for (const v of measurements.site.parkedVehicles.vehicles) if (!v.parts.length) throw Error('Missing parked vehicle: ' + v.id);
  measurements.site.riverSurface = riverMaterialData();
  measurements.buildings = buildings;
  if (wanted.includes('hus-l') || wanted.includes('kvarteret')) measurements.site.facadeLighting = facadeLightingData(world, wanted);
  if (ground) measurements.ground = ground;
  if (vegetation) measurements.vegetation = vegetation;
  for (const { root } of Object.values(roots)) root.updateMatrixWorld(true); // (the mesh centres below)
  measurements.furnishing = furnishingData(byZone, textures, worldMatrix);
  if (beerGlasses.length) measurements.furnishing.patioBeers = patioBeerRows(beerGlasses, beerParts, beerWindow);
  if (curtains.size) measurements.furnishing.curtains = curtainRows(curtains, furnishCache, measurements.furnishing, measurements.lights, lightsInfo.exportedFloorRooms);
  // #2300: the footstep surface, outdoor sprint, rest and wake data from the web's own modules (export-player.js). Loaded
  // here, after every GLB is written, so its modules cannot shift the seeded random sequence the zones were built with.
  let playerReport = null;
  try {
    const { playerData } = await import('./export-player.js');
    const atomIdOf = new Map(); // web object -> exported node id (furniture: the piece, whose parts carry parent:<id>)
    for (const list of byZone.values()) for (const a of list) if (a.instance === undefined && a.id) atomIdOf.set(a.object, a.id);
    const idOf = (o) => { for (; o; o = o.parent) if (atomIdOf.has(o)) return atomIdOf.get(o); return null; };
    const p = playerData({ world, core: extra.core ?? null, garage: extra.garage ?? null, idOf });
    Object.assign(measurements.spawn, { surface: p.surface, rest: p.rest, respawn: p.respawn });
    playerReport = p.report;
  } catch (e) { playerReport = { error: String(e?.stack ?? e) }; }
  return { glbs, measurements, report: { zones: zoneReport, kinds: stats, skipped, lightsError: lightsInfo.error, extraError: extra.error, looseError: loose.error, atoms: atoms.length, split, unassigned, player: playerReport } };
}

/** GLTFExporter encodes images asynchronously (canvas.toBlob, FileReader) and appends each one's bytes when it is done,
 *  so their order in the binary chunk varies between runs. This puts the image buffer views back in image order (they
 *  are the last views, after all geometry), so two exports of one commit stay byte-identical (#2289). */
function canonicalImages(buf) {
  const dv = new DataView(buf), jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  if (!json.images?.length || buf.byteLength <= 20 + jsonLen) return buf;
  const binLen = dv.getUint32(20 + jsonLen, true), bin = new Uint8Array(buf, 20 + jsonLen + 8, binLen);
  const views = json.images.map((im) => im.bufferView), slots = [...views].sort((x, y) => x - y), mine = new Set(views);
  const start = Math.min(...views.map((v) => json.bufferViews[v].byteOffset ?? 0));
  for (const [i, v] of json.bufferViews.entries()) if (!mine.has(i) && (v.byteOffset ?? 0) + v.byteLength > start) throw new Error('canonicalImages: image bytes are not the last views');
  const pad4 = (n) => (n + 3) & ~3;
  const parts = views.map((v) => { const d = json.bufferViews[v]; return bin.subarray(d.byteOffset ?? 0, (d.byteOffset ?? 0) + d.byteLength); });
  const newViews = json.bufferViews.slice(), out = new Uint8Array(binLen);
  out.set(bin.subarray(0, start));
  let at = start;
  parts.forEach((bytes, k) => {
    newViews[slots[k]] = { ...json.bufferViews[views[k]], byteOffset: at, byteLength: bytes.byteLength };
    json.images[k].bufferView = slots[k];
    out.set(bytes, at); at += pad4(bytes.byteLength);
  });
  if (at > binLen) throw new Error('canonicalImages: images grew');
  json.bufferViews = newViews;
  const raw = new TextEncoder().encode(JSON.stringify(json)), jsonBytes = new Uint8Array(pad4(raw.length)).fill(0x20);
  jsonBytes.set(raw);
  const res = new ArrayBuffer(12 + 8 + jsonBytes.length + 8 + binLen), rv = new DataView(res), ru = new Uint8Array(res);
  rv.setUint32(0, 0x46546c67, true); rv.setUint32(4, 2, true); rv.setUint32(8, res.byteLength, true);
  rv.setUint32(12, jsonBytes.length, true); rv.setUint32(16, 0x4e4f534a, true); ru.set(jsonBytes, 20);
  rv.setUint32(20 + jsonBytes.length, binLen, true); rv.setUint32(24 + jsonBytes.length, 0x004e4942, true); ru.set(out, 28 + jsonBytes.length);
  return res;
}

/** Longest side of a texture image in the GLB (#2289): the web's largest canvases are 2048 px. */
const FURNISH_TEXTURE_MAX = 2048;

/** #2289: where the web puts every piece of furniture, appliance and lamp (its node's world transform) in Unreal terms,
 *  and every furnishing texture with what it shows and where. Unreal's test (tools/unreal-engine/tests/test_furnishing.py)
 *  checks the imported actors and materials against these. Axes: Unreal local X / Y / Z are the web's local x / z / y. */
function furnishingData(byZone, textures, worldMatrix) {
  const S = (v) => [r4(v.x), r4(v.z), r4(v.y)];
  const items = [];
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Vector3();
  const axes = (quat) => ({ x: S(e.set(1, 0, 0).applyQuaternion(quat)), y: S(e.set(0, 0, 1).applyQuaternion(quat)), z: S(e.set(0, 1, 0).applyQuaternion(quat)) });
  for (const [zone, list] of byZone) for (const a of list) {
    if (!FURNISH_KINDS.has(a.kind)) continue;
    worldMatrix(a).decompose(p, q, s); // (what the GLB node gets)
    items.push({ id: a.id, kind: a.kind, zone, level: a.level, name: a.name ?? null, webId: a.webId ?? null, source: a.source ?? null,
      web: { position: [r4(p.x), r4(p.y), r4(p.z)], quaternion: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)], scale: [r4(s.x), r4(s.y), r4(s.z)] },
      unreal: { location: webToUnrealRounded([p.x, p.y, p.z]), axes: axes(q), scale: [r4(s.x), r4(s.z), r4(s.y)] } });
  }
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const list = [...textures.values()].sort((x, y) => x.id.localeCompare(y.id)).map((t) => {
    const img = t.map.image, from = t.kind === 'canvas' ? [...(canvasSources.get(img) ?? [])].sort() : t.file ? [t.file] : [];
    const meshes = [...t.meshes].sort(([x], [y]) => x.localeCompare(y)).map(([id, mesh]) => {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).getCenter(c);
      return { id, centre: { web: [r4(c.x), r4(c.y), r4(c.z)], unreal: webToUnrealRounded([c.x, c.y, c.z]) } };
    });
    return { id: t.id, name: t.name, kind: t.kind, file: t.file, images: from, width: img.width ?? null, height: img.height ?? null,
      flipY: t.map.flipY, wrap: [t.map.wrapS, t.map.wrapT], repeat: [r4(t.map.repeat.x), r4(t.map.repeat.y)], offset: [r4(t.map.offset.x), r4(t.map.offset.y)],
      rotation: r4(t.map.rotation), keys: [...t.keys].sort(), nodes: [...t.nodes].sort(), meshes };
  });
  return { kinds: [...FURNISH_KINDS], items, textures: list, maxTextureSize: FURNISH_TEXTURE_MAX,
    note: 'items: each exported furniture/appliance/lamp node, its web world transform and the same in Unreal (location cm; axes = the actor\'s forward/right/up unit vectors; scale X/Y/Z). '
      + 'textures: each base-colour image kept in the GLB (#2289), `images` = the repository files it shows (a canvas: the files drawn into it), the material keys, nodes and mesh nodes (with their world centre) that show it.',
    source: 'tools/unreal-engine/export-scene.js furnishingTexture, furnishingData' };
}

/** #2281: the trees and hedges of the export, for tools/unreal-engine/tests/test_vegetation.py. A tree is a foot of
 *  src/surroundings.js `treeFeet` whose trunk instance (a `tree-trunks|birches <cell>` node, its translation the foot)
 *  is exported; its crown lobes (`tree-crowns <cell>` nodes) are those whose centre lies horizontally nearest to its foot
 *  in units of its crown radius (`aoTrees` r), within LOBE_REACH radii. Height = the highest top of the trunk's and its
 *  lobes' boxes (each node's local mesh box through its transform, as Unreal does) above the foot; heightClass =
 *  round(height / TREE_CLASS_M). A hedge is a node of any zone that `isHedge`; its class is
 *  round(box height / HEDGE_CLASS_M). Feet that no zone exported (beyond the terrain) are counted, not listed. */
const LOBE_REACH = 1.5, TREE_CLASS_M = 2, HEDGE_CLASS_M = 0.25;
const HEDGE_NAME = /hedge|boxwood/;
/** A hedge: the object, a parent or its material is named hedge/boxwood (src/patiohedge.js `patio-hedge`, src/boxwood.js). */
function isHedge(o) {
  for (let q = o; q; q = q.parent) if (HEDGE_NAME.test(q.name ?? '')) return true;
  return [o.material ?? []].flat().some((m) => HEDGE_NAME.test(m?.name ?? ''));
}
function vegetationData(roots, hedgeIds, leafKeys, stillLeafKeys) {
  const P = (v) => ({ web: [r4(v.x), r4(v.y), r4(v.z)], unreal: webToUnrealRounded([v.x, v.y, v.z]) });
  const boxOf = (n) => new THREE.Box3().setFromObject(n);
  const nodes = roots.vegetation.root.children.filter((n) => n.userData.kind !== 'collision-group');
  for (const z of Object.values(roots)) z.root.updateMatrixWorld(true);
  const byWeb = {};
  for (const n of nodes) { const k = (n.userData.name ?? '(unnamed)').replace(/ -?\d+\|-?\d+$/, ''); byWeb[k] = (byWeb[k] ?? 0) + 1; }
  const trunks = nodes.filter((n) => /^tree-(trunks|birches) /.test(n.userData.name ?? ''));
  const lobes = nodes.filter((n) => /^tree-crowns /.test(n.userData.name ?? ''));
  const key = (x, z) => `${Math.round(x * 100)}|${Math.round(z * 100)}`;
  const trunkAt = new Map(trunks.map((n) => [key(n.position.x, n.position.z), n]));
  const trees = [], missing = [];
  treeFeet.forEach((f, i) => {
    const t = trunkAt.get(key(f.x, f.z));
    if (!t || Math.abs(t.position.y - f.y) > 0.01) return missing.push(i);
    trees.push({ foot: f, r: aoTrees[i]?.r ?? 1, trunk: t, top: boxOf(t).max.y, lobes: 0 });
  });
  let loose = 0;
  for (const l of lobes) {
    let best = null, bd = LOBE_REACH;
    for (const t of trees) { const d = Math.hypot(l.position.x - t.foot.x, l.position.z - t.foot.z) / t.r; if (d < bd) { bd = d; best = t; } }
    if (!best) { loose++; continue; }
    best.lobes++; best.top = Math.max(best.top, boxOf(l).max.y);
  }
  const hedges = [];
  for (const [zone, { root }] of Object.entries(roots)) for (const n of root.children) {
    if (!hedgeIds.has(n.userData.id)) continue;
    const b = boxOf(n), c = b.getCenter(new THREE.Vector3()), h = b.max.y - b.min.y;
    hedges.push({ id: n.userData.id, zone, name: n.userData.name, centre: P(c), size: [r4(b.max.x - b.min.x), r4(h), r4(b.max.z - b.min.z)],
      height: r4(h), heightClass: Math.round(h / HEDGE_CLASS_M) });
  }
  return {
    source: 'tools/unreal-engine/export-scene.js vegetationData; src/surroundings.js treeFeet, aoTrees (trees), hedge/boxwood nodes',
    lobeReach: LOBE_REACH, treeClassM: TREE_CLASS_M, hedgeClassM: HEDGE_CLASS_M, byWebName: byWeb, look: vegetationLook(leafKeys, stillLeafKeys),
    notExported: { trees: missing.length, why: 'their foot lies beyond the drawn terrain (SITE.backgroundGround): no zone takes them' },
    looseLobes: loose,
    trunkCollision: trunkCollision(),
    trees: trees.map((t) => { const h = t.top - t.foot.y; return { id: t.trunk.userData.id, kind: t.foot.kind, foot: P(t.trunk.position),
      crownR: r4(t.r), lobes: t.lobes, height: r4(h), heightClass: Math.round(h / TREE_CLASS_M), blocks: trunkBlocks(t.foot) }; }),
    hedges,
  };
}

/** #2308: how the web stops the walker at a trunk (src/farwalk.js): outside the home block (OUTDOOR) and within WALK,
 *  a diamond with half-width WALK.trunk[kind] (else .tree) round the foot; trunks inside the home block do not block. */
function trunkCollision() {
  return { source: 'src/farwalk.js farSegments (trunks); src/config.js WALK.trunk, OUTDOOR, WALK', shape: 'diamond',
    halfWidth: { ...C.WALK.trunk }, defaultKind: 'tree', homeBlock: { ...C.OUTDOOR },
    walk: { x0: C.WALK.x0, x1: C.WALK.x1, z0: C.WALK.z0, z1: C.WALK.z1 } };
}

/** The half-width (m) of the diamond the web blocks the walker with at this foot, or null where it does not block. */
function trunkBlocks(f) {
  const O = C.OUTDOOR, W = C.WALK, r = W.trunk[f.kind] ?? W.trunk.tree;
  if (f.x > O.x0 && f.x < O.x1 && f.z > O.z0 && f.z < O.z1) return null;
  if (f.x + r < W.x0 || f.x - r > W.x1 || f.z + r < W.z0 || f.z - r > W.z1) return null;
  return r;
}

/** #2281: what the export's plain materials lose on the leaves: the crowns' colour comes per instance from the season
 *  (src/seasons.js applySeason: SEASON.trees[month] in HSL, each tree's own r1..r3 moving hue ±0.02, saturation ±0.075 and
 *  light ±0.05), and they sway in the vertex shader (src/sitewind.js, SITE_WIND). The export's month (fixed date) gives
 *  the darkest and lightest summer leaf colour; the builder's leaf material picks between them per instance. */
function vegetationLook(leafKeys, stillLeafKeys) {
  const month = new Date().getMonth() + 1, [h, sat, l, leaves] = C.SEASON.trees[month];
  const hsl = (dh, ds, dl) => '#' + new THREE.Color().setHSL(h + dh, sat + ds, l + dl).getHexString();
  const W = C.SITE_WIND;
  return { month, leafKeys, stillLeafKeys, months: C.SEASON.trees, blossomMonths: C.SEASON.blossomMonths, leaves, leafDark: hsl(-0.02, -0.075, -0.05), leafLight: hsl(0.02, 0.075, 0.05),
    source: 'src/config.js SEASON.trees, SITE_WIND, WIND.power; src/seasons.js applySeason; src/sitewind.js and windsim.js',
    wind: { power: C.WIND.power, dir: W.dir, amp: W.crown.amp, freq: W.crown.freq, flutter: W.crown.flutter, flutterFreq: W.crown.flutterFreq, flutterCap: W.crown.flutterCap,
      gustFreq: W.gust.freq, gustDepth: W.gust.depth, phase: W.phase, maxDisplacement: W.maxDisplacement } };
}

/** Simple collision boxes (kind `collision`): the full-height wall rectangles the web collides with and sees through
 *  (world.levels[i].wallRects), and the floor plates (Övre plan's around the stair opening). One shared unit cube,
 *  scaled per node. */
function addCollision(root, world, zoneId, W, D, unique) {
  const group = new THREE.Group(); group.name = `${zoneId}__collision`;
  group.userData = { id: group.name, kind: 'collision-group', zone: zoneId };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ name: 'collision', color: 0xff00ff });
  let n = 0;
  const add = (r, level, source) => {
    const m = new THREE.Mesh(cube, mat);
    m.position.set((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.z0 + r.z1) / 2);
    m.scale.set(r.x1 - r.x0, r.y1 - r.y0, r.z1 - r.z0);
    m.name = unique(`col_l${level}_${tag('x', m.position.x)}_${tag('z', m.position.z)}_${tag('y', m.position.y)}`);
    m.userData = { id: m.name, kind: 'collision', zone: zoneId, level, source, name: null, webId: null, materialKeys: ['collision'],
      box: { x0: r4(r.x0), x1: r4(r.x1), y0: r4(r.y0), y1: r4(r.y1), z0: r4(r.z0), z1: r4(r.z1) } };
    group.add(m); n++;
  };
  world.levels.forEach((l, li) => (l.wallRects ?? []).forEach((r, i) => add(r, li, `world.levels[${li}].wallRects[${i}]`)));
  add({ x0: 0, x1: W, z0: 0, z1: D, y0: C.LEVELS[0].floor - 0.2, y1: C.LEVELS[0].floor }, 0, 'plan floor (Entréplan)');
  const hole = world.openings?.slab?.hole ?? C.STAIR.hole, y0 = C.LEVELS[0].floor + C.LEVELS[0].ceiling, y1 = C.LEVELS[1].floor;
  for (const r of [{ x0: 0, x1: W, z0: 0, z1: hole.z0 }, { x0: 0, x1: W, z0: hole.z1, z1: D }, { x0: 0, x1: hole.x0, z0: hole.z0, z1: hole.z1 },
    { x0: hole.x1, x1: W, z0: hole.z0, z1: hole.z1 }]) if (r.x1 - r.x0 > 0.01 && r.z1 - r.z0 > 0.01) add({ ...r, y0, y1 }, 1, 'plan floor (Övre plan) minus world.openings.slab.hole');
  root.add(group);
  return n * 12;
}

/** The position-test fixture: 10 cm cubes on known points and 1 m arrows north and east (phase B compares their
 *  positions after the Unreal import with `fixture` in measurements.json). */
export function fixturePoints(W, D) {
  return [
    { id: 'fixture_corner_nw', name: 'L1007 NW outer corner', web: [0, 0, 0] },
    { id: 'fixture_corner_ne', name: 'L1007 NE outer corner', web: [W, 0, 0] },
    { id: 'fixture_corner_se', name: 'L1007 SE outer corner', web: [W, 0, D] },
    { id: 'fixture_corner_sw', name: 'L1007 SW outer corner', web: [0, 0, D] },
    { id: 'fixture_stair_foot', name: 'stair foot (west end of flight A)', web: [C.STAIR.aX0, 0, (C.STAIR.aZ[0] + C.STAIR.aZ[1]) / 2] },
    { id: 'fixture_start_eye', name: 'START at eye height', web: [C.START.x, C.PLAYER.eye, C.START.z] },
    { id: 'fixture_ovre_plan', name: 'Övre plan floor over the hall', web: [1.2, C.LEVELS[1].floor, 1.2] },
  ];
}
function fixtureScene(W, D, unique) {
  const root = new THREE.Group(); root.name = 'fixture';
  root.userData = { id: 'fixture', kind: 'zone', zone: 'fixture', formatVersion: FORMAT_VERSION };
  const cube = new THREE.BoxGeometry(0.1, 0.1, 0.1), mat = new THREE.MeshStandardMaterial({ name: 'fixture', color: 0xffcc00 });
  for (const p of fixturePoints(W, D)) {
    const m = new THREE.Mesh(cube, mat); m.position.set(...p.web); m.name = unique(p.id);
    m.userData = { id: m.name, kind: 'fixture', zone: 'fixture', level: levelOf(p.web[1]), source: 'tools/unreal-engine/export-scene.js fixturePoints', name: p.name, webId: null, materialKeys: ['fixture'] };
    root.add(m);
  }
  // arrows: a 1 m bar from the origin, 0.5 m up, with a head cube at the tip (the bar's +z end in local space)
  for (const [id, dir, yaw] of [['fixture_arrow_north', [0, 0, -1], Math.PI], ['fixture_arrow_east', [1, 0, 0], Math.PI / 2]]) {
    const g = new THREE.Group(); g.name = unique(id); g.position.set(0, 0.5, 0); g.rotation.y = yaw;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1).translate(0, 0, 0.5), mat), head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12).translate(0, 0, 1), mat);
    bar.name = `${g.name}__1`; head.name = `${g.name}__2`;
    bar.userData = { id: bar.name, kind: 'part', parent: g.name }; head.userData = { id: head.name, kind: 'part', parent: g.name };
    g.add(bar, head);
    g.userData = { id: g.name, kind: 'fixture', zone: 'fixture', level: 0, source: 'tools/unreal-engine/export-scene.js fixtureScene', name: id.replace('fixture_arrow_', '') + ' arrow', webId: null, materialKeys: ['fixture'], direction: dir };
    root.add(g);
  }
  return root;
}

function measurementData({ world, planCopy, W, D, byZone, lightsInfo, seasons, materialTable, commit, ZONES, wanted, lifts, coreDoors = [], garage = null }) {
  const P = (x, y, z) => ({ web: [r4(x), r4(y), r4(z)], unreal: webToUnrealRounded([x, y, z]) });
  const atomOf = new Map();
  for (const list of byZone.values()) for (const a of list) if (a.instance === undefined) atomOf.set(a.object, a);
  const startFeet = groundY(C.START.x, C.START.z);
  const doors = world.doors.map((d, i) => {
    const a = atomOf.get(d.object), y0 = d.object.position.y;
    const base = { id: a?.id ?? null, zone: a?.zone ?? null, kind: d.kind, level: levelOf(y0 + 0.05), source: a?.source ?? `world.doors[${i}]`, name: d.name ?? null };
    if (d.kind === 'swing') return { ...base, hinge: P(d.hinge[0], y0, d.hinge[1]), width: r4(d.len), height: C.DOOR_HEIGHT,
      closed: { webRotationY: r4(d.closedAngle), unrealYaw: roundCm(webRotationYToUnrealYaw(d.closedAngle)) },
      open: { webRotationY: r4(d.openAngle), unrealYaw: roundCm(webRotationYToUnrealYaw(d.openAngle)) } };
    const b = new THREE.Box3().setFromObject(d.object), c = b.getCenter(new THREE.Vector3());
    return { ...base, centre: P(c.x, c.y, c.z), size: [r4(b.max.x - b.min.x), r4(b.max.y - b.min.y), r4(b.max.z - b.min.z)] };
  });
  const windows = [];
  planCopy.floors.forEach((f, li) => f.windows.forEach((w, i) => {
    const facade = w.z0 < D / 2 ? 'north' : 'south', cx = (w.x0 + w.x1) / 2;
    const si = C.WINDOWS.map((s, k) => ({ s, k })).filter(({ s }) => s.level === li && s.facade === facade).sort((a, b) => Math.abs(a.s.x - cx) - Math.abs(b.s.x - cx))[0];
    const s = si?.s ?? {};
    const src = `data/plan.json#/floors/${li}/windows/${i}`;
    const ids = [...atomOf.values()].filter((a) => a.kind === 'window' && a.source === src).map((a) => a.id).sort();
    windows.push({ ids, level: li, facade, source: src, spec: si ? `src/config.js#WINDOWS[${si.k}]` : null,
      rect: { x0: r4(w.x0), x1: r4(w.x1), z0: r4(w.z0), z1: r4(w.z1) }, width: s.width ?? null,
      sill: s.sill ?? null, head: s.head ?? null, transom: s.transom ?? null, opens: s.opens ?? null, maxDeg: s.max ?? null,
      floorY: C.LEVELS[li].floor });
  }));
  interactionData({ world, doors, windows, atomOf, lightsInfo, P });
  doors.push(...entranceDoors({ coreDoors, garage, byZone, atomOf, P }));
  const lights = [];
  const stairProfiles = lightsInfo.stairLight?.profiles;
  const atomAbove = (o) => { for (; o; o = o.parent) if (atomOf.has(o)) return atomOf.get(o); return null; };
  for (const l of world.lamps ?? []) {
    const a = atomAbove(l.object), p = l.object.getWorldPosition(new THREE.Vector3());
    // #2307: the small lamp's pool light(s) as src/lights.js FloorLamp builds them (LIGHTING.floorLamp under each anchor's
    // or the spec's `light`); several anchors (the bench light's strip) are summed into one intensity for one Unreal light.
    // `auto`: it follows the dusk (Lights.updateAuto) unless its spec says `auto: false`.
    const pools = (l.anchors ?? [{ light: l.light }]).map((x) => ({ ...C.LIGHTING.floorLamp, ...(x.light ?? {}) }));
    const hex = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : null);
    // FloorLamp places some emitters in front of a fitting (the display cabinet's is 40 cm in front of its spots).
    // Keep the fitting's origin for stable IDs. A single web light supplies its exact world-space emitter position.
    const anchors = l.lamp?.room.lamps;
    const emitter = anchors?.length === 1 ? anchors[0].pos : null;
    const stairVisibility = anchors?.map(anchor => stairProfiles?.get(anchor));
    // A merged light represents every anchor. Retain unfiltered anchors at full weight when some fall outside the stair's range.
    const profile = stairVisibility?.some(Boolean) ? stairVisibility.map((row, i) => row ?? { weight: anchors[i].intensity }) : null;
    const position = emitter ? P(emitter.x, emitter.y, emitter.z) : P(p.x, p.y + (l.height ?? 0), p.z);
    const row = { id: a?.id ?? null, kind: 'lamp', name: l.name ?? null, level: l.level ?? levelOf(p.y), room: l.room ?? null,
      objectPosition: P(p.x, p.y, p.z), position, ...(profile ? { stairVisibility: profile } : {}), seasonal: seasons.get(a?.object),
      intensity: r4(pools.reduce((sum, x) => sum + (x.intensity ?? 0), 0)), distance: pools[0].range ?? null, color: hex(pools[0].color), auto: l.auto !== false };
    if (wanted.includes('l1007') && l.cabinetDoorMaterial) {
      // BESTÅ's real switchable additive fans are renderer surfaces, so they stay out of the collision GLB.
      // Preserve their positions, original canvas UVs and linear tint for the native furnishing material.
      const fans = [], map = l.glows[0].map;
      l.object.parent.traverse(mesh => {
        if (!mesh.isMesh || !l.glows.includes(mesh.material)) return;
        const m = mesh.material, uv = mesh.geometry.attributes.uv, position = mesh.geometry.attributes.position;
        if (m.map !== map || m.blending !== THREE.AdditiveBlending || uv.count !== 4)
          throw Error('Unexpected display-cabinet light surface');
        const corners = {};
        for (let i = 0; i < 4; i++) {
          const point = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i));
          // CanvasTexture.flipY makes UV (0,1) the top-left of the original PNG.
          corners[`${uv.getX(i)},${1 - uv.getY(i)}`] = webToUnrealRounded(point.toArray());
        }
        fans.push({ corners, opacity: m.userData.on, colour: m.color.toArray() });
      });
      if (fans.length !== 5) throw Error('Missing display-cabinet light fans');
      row.cabinetWashes = { fans, veneerKey: materialInfo(l.cabinetDoorMaterial).key, maskPng: map.image.toDataURL('image/png').split(',')[1] };
    }
    lights.push(row);
    lightsInfo.exportedFloorRooms?.set(row, lightsInfo.floorRooms.get(l));
  }
  for (const l of lightsInfo.lamps) lights.push({ id: null, kind: 'room', name: null, level: l.level, room: l.room, position: P(l.pos.x, l.pos.y, l.pos.z),
    intensity: l.intensity, distance: l.distance, color: l.color, ...(l.stairVisibility ? { stairVisibility: [l.stairVisibility] } : {}) });
  for (const [index, l] of (lightsInfo.patioStrings ?? []).entries()) {
    const { on, off, fade, bulbIdle, bulbBoost } = C.PATIO.stringLights;
    lights.push({ id: null, kind: 'lamp', name: 'ljusslingan', room: null, level: l.level, auto: true,
      patioDusk: { on, off, fade }, ...(index === 0 ? { patioBulbs: { idle: bulbIdle, boost: bulbBoost } } : {}),
      position: P(l.pos.x, l.pos.y, l.pos.z), intensity: l.intensity, distance: l.range, color: '#' + l.color.toString(16).padStart(6, '0') });
  }
  // #2283: a light without an exported object (a room's ceiling light point, a lamp whose object is not a node) gets a
  // stable id of its own from kind, name or room, level and plan position, so Unreal's light actors and #2285's
  // switches share it. Lamps on an exported object keep that object's id.
  const lightIds = new Set(lights.map((l) => l.id).filter(Boolean));
  for (const l of lights) {
    if (l.id) continue;
    const [x, , z] = (l.objectPosition ?? l.position).web, base = `${l.kind}_${slug(l.name ?? l.room) || 'light'}_l${l.level}_${tag('x', x)}_${tag('z', z)}`;
    let id = base, n = 2;
    while (lightIds.has(id)) id = `${base}_${n++}`;
    lightIds.add(id); l.id = id;
  }
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'lunden-measurements',
    sourceCommit: commit,
    units: { web: 'm', unreal: 'cm', angles: 'deg unless the field says rad (webRotationY)' },
    axes: { web: 'x = east, y = up, z = south (north = -z), right-handed', unreal: 'X = 100*x (east), Y = 100*z (south), Z = 100*y (up), left-handed',
      yaw: 'unrealYaw = -90 - webYawDeg (normalised); object rotation.y a (rad) -> unrealYaw = 90 - deg(a)' },
    zones: ZONES.map((z) => ({ id: z.id, what: z.what, status: z.status === 'exported' && (wanted.includes(z.id)) ? 'exported' : 'planned', box: z.box ?? null,
      ...(z.from ? { from: z.from, split: !!z.split } : {}), ...(z.skip ? { skip: String(z.skip) } : {}), ...(z.only ? { only: String(z.only) } : {}) })),
    plan: { size: { x: W, z: D }, source: planCopy.source ?? 'L1007_mattsatt_planritning.pdf', unitTop: C.UNIT_TOP,
      levels: C.LEVELS.map((l) => ({ name: l.name, storey: l.storey, floor: l.floor, ceiling: l.ceiling, top: r4(l.top),
        unreal: { floorZ: roundCm(l.floor * 100), ceilingZ: roundCm((l.floor + l.ceiling) * 100), topZ: roundCm(l.top * 100) } })),
      vertical: C.VERTICAL, doorHeight: C.DOOR_HEIGHT },
    spawn: {
      start: { ...P(C.START.x, startFeet, C.START.z), feetY: r4(startFeet), eyeY: r4(startFeet + C.PLAYER.eye), yawDeg: C.START.yawDeg, pitchDeg: C.START.pitchDeg,
        unrealEye: webToUnrealRounded([C.START.x, startFeet + C.PLAYER.eye, C.START.z]), unrealYaw: webYawToUnrealYaw(C.START.yawDeg), unrealPitch: webPitchToUnrealPitch(C.START.pitchDeg),
        source: 'src/config.js#START; feetY = src/surroundings.js groundY' },
      player: { eye: C.PLAYER.eye, crouchEye: C.PLAYER.crouchEye ?? null, radius: C.PLAYER.radius, walk: C.PLAYER.walk, run: C.PLAYER.run,
        runOutdoor: C.PLAYER.runOutdoor ?? null, stepUp: C.PLAYER.stepUp ?? null, headroom: C.PLAYER.headroom ?? null, jump: C.PLAYER.jump ?? null,
        crouchSpeed: C.PLAYER.crouchSpeed ?? null, mouseSens: C.PLAYER.mouseSens ?? null,
        pitchLimit: C.PLAYER.pitchLimit,
        source: 'src/config.js#PLAYER' },
      // #2284: the fall-damage rule and its results from the web's own src/falldamage.js, so Unreal's player matches them
      // without a hand-copied formula. `samples` are free drops (gap = drop) in metres and the lives each one costs.
      fall: { hurt: C.FALL.hurt, fatal: C.FALL.fatal, free: C.FALL.free, soft: C.FALL.soft, maxReport: C.FALL.maxReport, lives: C.COMBAT.lives,
        samples: [0.5, 1, 2.9, 3, 3.1, 4.5, 6, 6.1, 9, 100, 101].map((drop) => ({ drop, gap: drop, damage: fallDamage(drop, drop, C.COMBAT.lives) })),
        source: 'src/config.js#FALL, COMBAT.lives; src/falldamage.js fallDamage' },
    },
    stair: { foot: P(C.STAIR.aX0, C.LEVELS[0].floor, (C.STAIR.aZ[0] + C.STAIR.aZ[1]) / 2), rise: r4(stairRise()), riser: r4(stairRiser()), treads: N_TREADS,
      flights: C.STAIR.treads, hole: C.STAIR.hole, railHeight: C.STAIR.railHeight, source: 'src/config.js#STAIR, src/stairs.js' },
    doors, windows, lights,
    interaction: interactionExtras({ world, atomOf, lightsInfo, lights, lifts, P }),
    terrain: null, // filled in by tools/unreal-engine/export-world.mjs (a reference to data/elevation.json, not a copy)
    site: { geo: C.SITE.geo, planNorthDeg: C.DAY?.planNorth ?? null, source: 'src/config.js#SITE.geo, DAY.planNorth',
      // #2283: the observer src/daycycle.js puts the sun and moon over (not the OSM anchor above), for Unreal's sun
      // and the web's own light and weather numbers it scales (relative web units; Unreal calibrates them, #2283)
      sky: { lat: C.DAY.lat, lon: C.DAY.lon, planNorthDeg: C.DAY.planNorth,
        light: { sunOvercast: C.LIGHTING.sky.overcast.sun, sunClear: C.LIGHTING.sky.clear.sun, moonlight: C.DAY.moonlight, moonFloor: C.DAY.moonFloor,
          moonExp: C.DAY.moonExp, sunCut: C.WEATHER.sunCut, fogFar: C.WEATHER.fogFar,
          ambientOvercast: C.LIGHTING.sky.overcast.ambient, ambientClear: C.LIGHTING.sky.clear.ambient, nightAmbient: C.DAY.nightAmbient,
          hemiSky: '#' + C.LIGHTING.sky.hemi.sky.toString(16).padStart(6, '0'), hemiGround: '#' + C.LIGHTING.sky.hemi.ground.toString(16).padStart(6, '0'),
          // #2307: the tone-mapping exposure DayCycle blends overcast -> clear, the dusk rule of the small lamps (LIGHTING.auto:
          // on below `on` daylight, off above `off`, fading over `fade` s) and the moon disc's size and earthshine
          exposureOvercast: C.LIGHTING.sky.overcast.exposure, exposureClear: C.LIGHTING.sky.clear.exposure,
          hemiOvercast: C.LIGHTING.sky.overcast.hemi, hemiClear: C.LIGHTING.sky.clear.hemi, // #2313: the hemisphere light's strength
          duskOn: C.LIGHTING.auto.on, duskOff: C.LIGHTING.auto.off, duskFade: C.LIGHTING.auto.fade,
          moonRadius: C.DAY.moonRadius, moonEarthshine: C.DAY.moonEarthshine },
        // #2307: the sky's cloud cover follows the weather's overcast (src/cloudshadow.js skyCloudState: the noise threshold
        // goes from `clearThr` over a clear sky to thr[0] -> thr[1] with overcast, reaching the shadows' from `ramp`)
        clouds: { cell: C.CLOUD_SHADOW.cell, cells: C.CLOUD_SHADOW.cells, height: C.CLOUD_SHADOW.height, sky: C.CLOUD_SHADOW.sky,
          wind: C.CLOUD_SHADOW.wind, windScale: C.CLOUD_SHADOW.windScale, drift: C.CLOUD_SHADOW.drift, thr: C.CLOUD_SHADOW.thr, clearThr: C.CLOUD_SHADOW.sky.clearThr, ramp: C.CLOUD_SHADOW.sky.ramp,
          palette: skyGradientPalette(), top: C.SKYLAYER.top, fade: C.SKYLAYER.fade },
        rain: { speed: C.WEATHER.speed, len: C.WEATHER.len, radius: C.WEATHER.radius, height: C.WEATHER.height, drops: C.WEATHER.drops,
          slantPerMs: C.WEATHER.slant.perMs, slantMax: C.WEATHER.slant.max },
        snow: { speed: C.WEATHER.snow.speed, sway: C.WEATHER.snow.sway, size: C.WEATHER.snow.size, flakes: C.WEATHER.snow.flakes,
          driftPerMs: C.WEATHER.snowDrift.perMs, driftMax: C.WEATHER.snowDrift.max },
        source: 'src/config.js#DAY, LIGHTING.sky, LIGHTING.auto, CLOUD_SHADOW, WEATHER; src/daycycle.js sunDirection, src/moon.js moonState' } },
    materials: materialTable,
    fixture: { points: fixturePoints(W, D).map((p) => ({ id: p.id, name: p.name, ...P(...p.web) })),
      arrows: [{ id: 'fixture_arrow_north', direction: 'north', web: [0, 0, -1], unreal: webToUnrealRounded([0, 0, -1]) },
        { id: 'fixture_arrow_east', direction: 'east', web: [1, 0, 0], unreal: webToUnrealRounded([1, 0, 0]) }] },
  };
}

// ---- #2285: what Unreal needs to make the doors, windows, switches and taps usable ----
const SWING_SECONDS = 1 / (3 * 0.6), SLIDE_SECONDS = 1 / (3 * 0.7); // src/doors.js SPEED 3.0 × 0.6 (swing) / × 0.7 (sliders)

/** Adds to the `doors` and `windows` rows in place: every door's start state and animation time, the sliders' open
 *  centre and wardrobe partner, and each window's opening sashes (pivot, axis, angle and a check point open/closed). */
function interactionData({ world, doors, windows, atomOf, P }) {
  world.doors.forEach((d, i) => {
    const row = doors[i];
    if (['swing', 'sliding', 'cabinet'].includes(d.kind)) row.wireId = `w${i}`; // src/main.js DoorSync.register
    row.initiallyOpen = d.target === 1;
    row.seconds = r4(d.kind === 'swing' ? SWING_SECONDS : SLIDE_SECONDS);
    if (d.kind === 'swing') return;
    const at = (pos) => (d.along ? [pos, d.y, d.face] : [d.face, d.y, pos]);
    row.closedCentre = P(...at(d.closedPos));
    row.openCentre = P(...at(d.openPos));
    if (d.kind === 'wardrobe') { // src/doors.js wardrobeDoors: opening one panel slides its partner back
      const other = world.doors.find((e) => e !== d && e.kind === 'wardrobe' && e.along === d.along && Math.abs(e.face - d.face) < 0.1
        && Math.abs(e.closedPos - d.openPos) < 0.01 && Math.abs(e.openPos - d.closedPos) < 0.01);
      row.partner = other ? atomOf.get(other.object)?.id ?? null : null;
    }
  });
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const l of world.lids ?? []) {
    if (l?.name !== 'fönstret' || !atomOf.has(l.object)) continue;
    const a = atomOf.get(l.object), o = l.object, row = windows.find((w) => w.ids.includes(a.id));
    if (!row) continue;
    const sash = o.children.find((c) => c.isMesh && c.material?.transparent !== true) ?? o.children[0];
    sash.geometry.computeBoundingBox();
    const bb = sash.geometry.boundingBox, local = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    o.updateMatrixWorld(true);
    const point = () => local.clone().applyMatrix4(sash.matrixWorld);
    const closed = point();
    l.pose(1); o.updateMatrixWorld(true);
    const opened = point();
    l.pose(0); o.updateMatrixWorld(true);
    o.getWorldQuaternion(q);
    const axis = (l.mode === 'hinge' ? v.set(0, 1, 0) : v.copy(l.axis)).clone().applyQuaternion(q).normalize();
    const p = o.getWorldPosition(new THREE.Vector3());
    (row.sashes ??= []).push({ id: a.id, mode: l.mode, pivot: P(p.x, p.y, p.z),
      axis: { web: [r4(axis.x), r4(axis.y), r4(axis.z)], unreal: [r4(axis.x), r4(axis.z), r4(axis.y)] },
      angleDeg: r4(l.sign * l.max), seconds: r4(1 / l.speed), initiallyOpen: !!l.isOpen,
      checkClosed: P(closed.x, closed.y, closed.z), checkOpen: P(opened.x, opened.y, opened.z),
      check: 'the sash bottom rail centre (src/world.js addWindowFrame)', source: 'src/world.js addWindowFrame, src/openables.js Openable' });
  }
}

/** #2314: the doors outside L1007 that open on the web but are no `world.doors`: the stairwell doors of Hus L (the
 *  portik's glazed door and the loftgång's, src/core.js makeDoor) and the entrances of Hus A, B and C (src/corehouse.js),
 *  and the garage door (src/garage.js GarageDoor). Their leaves were exported as several nodes (frame bars, fill, handle;
 *  the garage door's sections), so a row names the interactable (`id`, not a node) and its nodes (`parts`). A stairwell
 *  door swings like a SwingDoor row (makeDoor: `max` 1.5 rad at 3 rad/s, core.js update). The garage door's sections
 *  roll up a track and in under the ceiling (GarageDoor.track); Unreal tips the closed door up about its top edge into
 *  the same open place (`pivot`, `axis`, `angleDeg`, `checkClosed` = the bottom edge's centre, `checkOpen` = where the
 *  open door's far edge lies under the ceiling), the way a window sash row does. */
function entranceDoors({ coreDoors, garage, byZone, atomOf, P }) {
  const rows = [];
  const partsUnder = (root) => {
    const ids = [];
    root.traverse((o) => { const a = atomOf.get(o); if (a?.id) ids.push(a); });
    return ids;
  };
  for (const [house, t, source, flat, core, wireId] of coreDoors) {
    const d = t?.door;
    if (!d?.pivot) continue;
    const atoms = partsUnder(d.pivot);
    if (!atoms.length) {
      if (flat && byZone.has('kvarteret')) throw Error(source + ': missing apartment leaf in kvarteret');
      continue;
    }
    const parent = new THREE.Quaternion();
    d.pivot.parent.getWorldQuaternion(parent);
    if (Math.abs(parent.w) < 1 - 1e-9) throw new Error(`${source}: the door's group is rotated; the rows assume it is not`);
    const at = new THREE.Vector3();
    d.pivot.parent.localToWorld(at.set(d.hx, 0, d.hz));
    // Sample the web builder at both stops, including the latch, then restore its original pose for the GLBs.
    const sample = angle => {
      d.angle = angle; core.placeDoor(d);
      const yaw = d.pivot.rotation.y, latch = d.pivot.localToWorld(new THREE.Vector3(d.w, d.y, 0));
      return { rotation: { webRotationY: r4(yaw), unrealYaw: roundCm((-yaw * 180 / Math.PI + 540) % 360 - 180) },
        latch: P(latch.x, latch.y, latch.z) };
    };
    const start = d.angle, closed = sample(0), open = sample(d.max);
    d.angle = start; core.placeDoor(d);
    const lv = levelOf(d.y + 0.05);
    const id = `door_hus${house}_l${lv}_${tag('x', at.x)}_${tag('z', at.z)}` + (flat ? '_' + tag('y', d.y) : '');
    rows.push({ id, wireId, zone: atoms[0].zone, kind: 'swing', level: lv, source,
      ...(flat ? { leafType: 'flat' } : {}), name: t.name ?? null, house, hinge: P(at.x, d.y, at.z), width: r4(d.w), height: 2.18,
      closed: closed.rotation, open: open.rotation, checkClosed: closed.latch, checkOpen: open.latch, initiallyOpen: d.target > 0, seconds: r4(d.max / 3), parts: atoms.map((a) => a.id) });
  }
  if (garage) {
    // One garage mesh draws many leaves. The instance index picks the moving part, including its separate glass.
    const batches = new Map();
    for (const list of byZone.values()) for (const a of list) if (a.instance !== undefined && a.id) {
      if (!batches.has(a.object)) batches.set(a.object, new Map());
      batches.get(a.object).set(a.instance, a);
    }
    const wireIds = new Map(garage.targets.filter(t => t.kind === 'cabinet' && t.door).map((t, i) => [t, `g${i}`]));
    for (const t of garage.targets) {
      const d = t.door;
      if (!d?.inst) continue;
      const leaf = batches.get(d.inst)?.get(d.index);
      if (!leaf) {
        if (byZone.has('kvarteret')) throw Error('Missing garage door instance: ' + t.name);
        continue;
      }
      const park = !!d.rect?.door?.park, parts = [leaf.id];
      if (park) {
        const glass = batches.get(garage.parkGlass)?.get(d.index);
        if (!glass || glass.zone !== leaf.zone) throw Error('Garage park leaf missing its glass: ' + leaf.id);
        parts.push(glass.id);
      }
      const baseY = leaf.box.min.y;
      const sample = a => {
        d.angle = a; garage.place(d);
        const yaw = d.pivot.rotation.y;
        return { rotation: { webRotationY: r4(yaw), unrealYaw: roundCm((-yaw * 180 / Math.PI + 540) % 360 - 180) },
          latch: P(d.segment[2], baseY, d.segment[3]) };
      };
      const start = d.angle, closed = sample(0), open = sample(d.max);
      d.angle = start; garage.place(d);
      const kind = park ? 'park' : d.steel ? 'steel' : 'cage';
      rows.push({ id: `door_garage_${kind}_${tag('x', d.hx)}_${tag('z', d.hz)}`, kind: 'swing', wireId: wireIds.get(t),
        zone: leaf.zone, level: leaf.level, name: t.name, leafType: kind, source: 'src/garage.js Garage.cageDoors and Garage.place',
        hinge: P(d.hx, baseY, d.hz), height: r4(leaf.box.max.y - baseY), width: r4(d.w),
        closed: closed.rotation, open: open.rotation, checkClosed: closed.latch, checkOpen: open.latch,
        initiallyOpen: d.target > 0, seconds: r4(d.max / C.GARAGE.storage.speed), parts });
    }
  }
  if (garage?.door?.panels) {
    const g = garage.door, GD = C.SITE.terrain.garageDoor, F = C.GARAGE.floor, zc = (GD.z0 + GD.z1) / 2;
    const atoms = [];
    for (const list of byZone.values()) for (const a of list) if (a.object === g.panels && a.id) atoms.push(a);
    atoms.sort((a, b) => a.instance - b.instance);
    if (atoms.length) {
      rows.push({ id: `door_garage_l0_${tag('x', GD.x)}_${tag('z', zc)}`, wireId: 'q0', zone: atoms[0].zone, kind: 'overhead', level: 0,
        source: 'src/garage.js GarageDoor, src/config.js#SITE.terrain.garageDoor, GARAGE.door', name: 'garageporten',
        width: r4(GD.z1 - GD.z0), height: GD.h, pivot: P(g.xd, F + GD.h, zc),
        axis: { web: [0, 0, 1], unreal: [0, 1, 0] }, angleDeg: 90,
        checkClosed: P(g.xd, F, zc), checkOpen: P(g.xd + GD.h, F + GD.h, zc),
        initiallyOpen: g.t >= 1, seconds: C.GARAGE.door.seconds, sections: C.GARAGE.door.sections,
        control: { autoSeconds: C.GARAGE.door.auto, opening: g.opening,
          buttons: g.targets.map((t, i) => {
            const atom = atomOf.get(t.pickable);
            if (!atom?.id || atom.zone !== atoms[0].zone) throw Error('Garage button missing from overhead door zone');
            const position = t.pickable.getWorldPosition(new THREE.Vector3());
            return { id: 'button_garage_' + (i ? 'inside' : 'outside'), part: atom.id, position: P(position.x, position.y, position.z) };
          }) },
        parts: atoms.map((a) => a.id),
        check: 'checkClosed = the closed door\'s bottom edge centre; checkOpen = the same edge with the door tipped up under the ceiling (the web\'s open sections span g.xd … g.xd + h at the ceiling)' });
    }
  }
  return rows;
}

/** The room switches and the taps (main.js builds them next to the world; not nodes of their own in a tap's case). */
function interactionExtras({ world, atomOf, lightsInfo, lights, lifts, P }) {
  const atomAbove = (o) => { for (; o; o = o.parent) if (atomOf.has(o)) return atomOf.get(o); return null; };
  const switches = (lightsInfo.switches ?? []).map((s) => {
    const p = s.object.getWorldPosition(new THREE.Vector3()), ry = s.object.rotation.y, n = [Math.sin(ry), Math.cos(ry)];
    // the room's ceiling/pendant light points (#2283's lamp:<id> actors) are what a switch turns on and off
    const lamps = lights.filter((l) => l.kind === 'room' && l.room === s.room && l.level === s.level).map((l) => l.id);
    return { id: atomAbove(s.object)?.id ?? null, level: s.level, room: s.room, lamps, position: P(p.x, p.y, p.z),
      normal: { web: [r4(n[0]), 0, r4(n[1])], unreal: [r4(n[0]), r4(n[1]), 0] } };
  });
  const ids = new Set();
  const taps = (world.taps ?? []).map((t) => {
    const [x, y, z] = t.pos, len = Math.max(0.05, y - t.basin), dir = new THREE.Vector3(...t.dir).normalize();
    const k = len / Math.max(0.2, -dir.y), lv = levelOf(y), pick = t.lever?.pos ?? t.pick ?? t.pos;
    const base = `tap_${slug(t.name) || 'tap'}_l${lv}_${tag('x', x)}_${tag('z', z)}`;
    let id = base, n = 2;
    while (ids.has(id)) id = `${base}_${n++}`;
    ids.add(id);
    return { id, name: t.name ?? null, level: lv, shower: !!t.shower, outlet: P(x, y, z),
      landing: P(x + dir.x * k, y - len, z + dir.z * k), radius: r4(Math.max(t.r ?? 0, 0.009)), pick: P(...pick) };
  });
  // the lifts' car buttons (one per stop) and landing call buttons (src/liftpanel.js; the lift itself is not ported yet)
  const liftButtons = [];
  for (const [house, lift] of lifts) {
    const seen = new Map();
    for (const t of lift?.targets ?? []) {
      if (t.kind !== 'liftbtn' && t.kind !== 'liftcall') continue;
      const kind = t.kind === 'liftbtn' ? 'car' : 'call', key = `${kind}_${t.stop}`, n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const p = t.pickable.getWorldPosition(new THREE.Vector3());
      liftButtons.push({ id: `lift_${house}_${key}${n > 1 ? '_' + n : ''}`, house, kind, stop: t.stop,
        name: t.name ?? null, position: P(p.x, p.y, p.z) });
    }
  }
  return { switches, taps, liftButtons, source: 'src/lights.js Switch/switchSpots (switches; a switch turns its room\'s lamps on and off), '
    + 'src/water.js Tap + world.taps (taps; E turns the water on and off), src/doors.js, src/openables.js, src/liftpanel.js (lift buttons) (#2285)' };
}

/** #2387: src/patio.js cushionsOut's months as one inclusive date window for BPC_LundenSeasons. */
export const patioCushionWindow = () => monthWindow('patioCushions', (month) => cushionsOut(month));

/** #2406: src/patio.js beersOut as a date window plus `hours`, a half-open run of clock hours [from, to) on its days.
 *  The web compares decimal hours with whole-hour edges, so the PC clock's whole hour gives the same answer. */
export function patioBeerWindow() {
  const window = monthWindow('patioBeers', (month) => Array.from({ length: 24 }, (_, h) => beersOut(month, h)).some(Boolean));
  const month = window.from[0], on = Array.from({ length: 24 }, (_, h) => beersOut(month, h));
  const starts = on.flatMap((x, h) => (x && !on[(h + 23) % 24] ? [h] : []));
  if (on.every(Boolean)) return window;
  if (starts.length !== 1) throw Error(`patio beer hours are not one run: ${on}`);
  let to = starts[0];
  while (on[to % 24]) to++;
  const hours = [starts[0], to % 24];
  for (let m = 1; m <= 12; m++) { // whole-hour edges, and the same hours in every beer month
    if (!Array.from({ length: 24 }, (_, h) => beersOut(m, h)).some(Boolean)) continue;
    for (let tenth = 0; tenth < 240; tenth++) {
      if (beersOut(m, tenth / 10) !== on[Math.floor(tenth / 10)]) throw Error(`patio beers at ${m}/${tenth / 10} h break the window ${hours}`);
    }
  }
  return { ...window, hours };
}

/** The months `on(month)` holds as one inclusive date window (month, day pairs) for BPC_LundenSeasons. The months must be
 *  one run, possibly across the new year; the last day comes from a leap year (all keys exist). */
function monthWindow(what, on) {
  const out = Array.from({ length: 12 }, (_, i) => on(i + 1));
  const starts = out.flatMap((x, i) => (x && !out[(i + 11) % 12] ? [i + 1] : []));
  if (starts.length !== 1) throw Error(`${what} months are not one run: ${out}`);
  let last = starts[0];
  while (out[last % 12]) last = (last % 12) + 1;
  return { what, from: [starts[0], 1], to: [last, new Date(Date.UTC(2000, last, 0)).getUTCDate()] };
}

/** #2406: where the web stands each pint (its base on the table top) and the world centre of each of its exported meshes,
 *  in web metres and Unreal centimetres, for tools/unreal-engine/tests/test_furnishing.py. */
function patioBeerRows(glasses, names, window) {
  const p = new THREE.Vector3(), box = new THREE.Box3(), c = new THREE.Vector3();
  const rows = glasses.map((g) => {
    g.getWorldPosition(p);
    const meshes = g.children.filter((m) => m.isMesh && !m.isInstancedMesh && names.get(m)).map((m) => {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).getCenter(c);
      return { id: names.get(m), centre: { web: [r4(c.x), r4(c.y), r4(c.z)], unreal: webToUnrealRounded([c.x, c.y, c.z]) } };
    });
    if (!names.get(g) || meshes.length !== 4) throw Error(`patio beer glass not exported whole: ${names.get(g)}, ${meshes.length} meshes`);
    return { id: names.get(g), base: { web: [r4(p.x), r4(p.y), r4(p.z)], unreal: webToUnrealRounded([p.x, p.y, p.z]) }, meshes };
  });
  return { glasses: rows, seasonal: window, source: 'src/patio.js slattable (item.beers) and beersOut; tools/unreal-engine/export-scene.js patioBeerWindow',
    note: 'The two pints on the slat table (#2406): each glass group node, its base on the table top and its glass, bottom, beer and foam meshes. '
      + 'The rising bubbles are a web animation and are not exported.' };
}
