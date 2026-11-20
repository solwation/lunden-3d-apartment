// Page side of the Unreal export (#2245): builds the real web world with src/world.js `buildWorld(plan)` (the same
// scene builder the game uses, but without main.js's static merge, detail culling, phone LOD proxies or renderer),
// picks the objects of each export zone, gives every exported node a stable id and metadata (glTF node `extras`),
// and writes one GLB per zone with three's GLTFExporter plus the measurement data (measurements.json).
// Loaded by tools/unreal-engine/export.html under tools/unreal-engine/export-world.mjs (Playwright); never by the game.
//
// Determinism: the caller fixes Date and seeds Math.random before any module loads; this module builds and collects
// synchronously (nothing loaded later can slip in), walks the scene in its child order, and writes no time stamps.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as C from '../../src/config.js';
import { buildWorld } from '../../src/world.js';
import { groundY } from '../../src/surroundings.js';
import { stairRise, stairRiser, N_TREADS } from '../../src/stairs.js';
import { webToUnrealRounded, webYawToUnrealYaw, webPitchToUnrealPitch, webRotationYToUnrealYaw, roundCm } from './coordinates.mjs';

export const FORMAT_VERSION = 1;

/** Export zones (plan metres; `y` absolute). A node belongs to the first zone whose box holds the centre of its world
 *  bounding box. Only `exported` zones are written; the others are the planned list (docs/development/unreal.md). */
export function zoneTable(W, D, patio) {
  return [
    { id: 'l1007', what: 'L1007 interior, Entréplan + Övre plan (pilot, #2246)', status: 'exported',
      box: { x0: 0, x1: W, z0: 0, z1: D, y0: -0.6, y1: C.UNIT_TOP + 0.05 }, collision: true },
    { id: 'l1007-uteplats', what: 'L1007 patio: paving, fences, hedge, patio furniture (pilot, #2246)', status: 'exported',
      box: { x0: 0, x1: W, z0: D, z1: patio.z1 + 0.3, y0: -1, y1: 4 } },
    { id: 'fixture', what: 'axis/position test fixture: corner and START markers, north and east arrows (phase B position test)', status: 'exported' },
    // planned (need splitting of the large merged exterior/surroundings meshes by zone first; see unreal.md)
    { id: 'l1007-entre', what: 'street and entrance in front of L1007 incl. START', status: 'planned' },
    { id: 'hus-l', what: 'Hus L façades, loftgång, roofs, stairwell/lift core, visitable flats L1004/L1201', status: 'planned' },
    { id: 'gard', what: 'courtyard, playground, bike room, garage', status: 'planned' },
    { id: 'omgivning', what: 'Hus A/B/C, streets, terrain, Höje å, trees, backdrop (split into omgivning-n/-s/-o/-v)', status: 'planned' },
  ];
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
    hint: m.userData?.roomProbe ?? (m.userData?.skin ? 'tile' : null) } };
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

/** Builds the world and returns { glbs: {name: base64}, measurements, report }. `zones`: ids to export. */
export async function exportWorld({ zones: wanted = ['l1007', 'l1007-uteplats', 'fixture'], commit = null } = {}) {
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
    const lamps = [];
    for (const R of L.rooms.values()) for (const l of R.lamps) lamps.push({ room: R.name, level: R.level, pos: l.pos.clone(),
      intensity: l.intensity ?? null, distance: l.distance ?? null, color: typeof l.color === 'number' ? '#' + l.color.toString(16).padStart(6, '0') : null });
    lightsInfo = { lamps, group, error: null };
  } catch (e) { lightsInfo.error = String(e?.message ?? e); }
  const scene = new THREE.Group();
  scene.add(world.object);
  if (lightsInfo.group) scene.add(lightsInfo.group);
  scene.updateMatrixWorld(true);

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
    if (!o.visible) return skip('hidden');
    const why = webOnly(o);
    if (why) return o.isMesh || o.isLine || o.isPoints ? skip(why) : undefined;
    const d = doorOf.get(o);
    if (d) return atoms.push({ object: o, kind: d.kind, door: d });
    if (furnitureRoots.has(o)) return atoms.push({ object: o, kind: 'furniture', movable: furnitureOf.get(o) });
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
  const exportedZones = ZONES.filter((z) => z.status === 'exported' && z.box && wanted.includes(z.id));
  const byZone = new Map(exportedZones.map((z) => [z.id, []]));
  for (const a of atoms) {
    if (a.instance !== undefined) {
      const g = a.object.geometry; if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox).applyMatrix4(worldMatrix(a));
    } else box.copy(visibleBox(a.object));
    if (box.isEmpty()) { skip('empty'); continue; }
    box.getCenter(centre);
    const zone = exportedZones.find((z) => inBox(z.box, centre));
    if (!zone) continue;
    a.zone = zone.id; a.centre = centre.clone(); a.box = box.clone(); a.level = levelOf(box.min.y + 0.05);
    byZone.get(zone.id).push(a);
  }
  const ids = new Set();
  const unique = (id) => { let u = id, n = 2; while (ids.has(u)) u = `${id}_${n++}`; ids.add(u); return u; };
  const pos = (p) => `${tag('x', p.x)}_${tag('z', p.z)}`;
  for (const list of byZone.values()) for (const a of list) {
    const c = a.centre, lv = `l${a.level}`;
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
    } else if (a.kind === 'furniture') {
      const m = a.movable, item = m?.item;
      const fi = item ? furnitureIndex(item) : -1;
      a.name = m?.name ?? null; a.webId = m?.id ?? null;
      a.id = unique(`furn_${slug(item?.type ?? a.name) || 'item'}_${lv}_${pos(c)}`);
      a.source = fi >= 0 ? `src/config.js#FURNITURE[${fi}]` : null;
      if (item?.type === 'xmastree') a.seasonal = { what: 'christmas', from: C.XMAS_TREE.season.from, to: C.XMAS_TREE.season.to }; // (src/christmas.js shows it only then)
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
      a.source = pw ? `data/plan.json#/floors/${pw.li}/walls/${pw.i}` : null;
      a.id = unique(`${pw ? 'wall' : 'mesh'}_${slug(a.name) ? slug(a.name) + '_' : ''}${lv}_${pos(c)}_${tag('y', c.y)}`);
    }
  }

  // ---- build the export scenes ----
  const materials = new Map(), matCache = new Map(), geoCache = new Map(), materialTable = {};
  const exportMaterial = (m) => {
    if (matCache.has(m)) return matCache.get(m);
    const { key, info } = materialInfo(m);
    let em = materials.get(key);
    if (!em) {
      em = new THREE.MeshStandardMaterial({ name: key, color: new THREE.Color(info.color), roughness: info.roughness, metalness: info.metalness,
        transparent: info.opacity < 1, opacity: info.opacity, side: info.doubleSided ? THREE.DoubleSide : THREE.FrontSide, vertexColors: info.vertexColors });
      if (info.emissive) em.emissive = new THREE.Color(info.emissive);
      materials.set(key, em); materialTable[key] = info;
    }
    matCache.set(m, em);
    return em;
  };
  const exportGeometry = (mesh, keepColor) => {
    const k = mesh.geometry.uuid + (keepColor ? ':c' : '');
    if (!geoCache.has(k)) geoCache.set(k, plainGeometry(mesh.geometry, keepColor));
    return geoCache.get(k);
  };
  const meshNode = (mesh) => {
    const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const g = exportGeometry(mesh, ms.some((m) => m.vertexColors));
    if (!g) return null;
    const em = ms.map(exportMaterial);
    return new THREE.Mesh(g, Array.isArray(mesh.material) ? em : em[0]);
  };
  const stats = {};
  const subtree = (o, atomId, counter, keys) => { // o's visible exported content, local transforms kept
    const n = o.isMesh && !o.isInstancedMesh ? meshNode(o) : new THREE.Group();
    if (!n) return null;
    if (o.isMesh && !o.isInstancedMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => keys.add(m.name));
    for (const c of o.children) {
      if (!c.visible || webOnly(c)) continue;
      if (c.isInstancedMesh) {
        for (let i = 0; i < c.count; i++) {
          const node = meshNode(c); if (!node) continue;
          c.getMatrixAt(i, im); node.matrix.copy(c.matrix).multiply(im); node.matrix.decompose(node.position, node.quaternion, node.scale);
          node.name = `${atomId}__${counter.n++}`; node.userData = { id: node.name, kind: 'part', parent: atomId };
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => keys.add(m.name));
          n.add(node);
        }
        continue;
      }
      const s = subtree(c, atomId, counter, keys);
      if (!s) continue;
      s.position.copy(c.position); s.quaternion.copy(c.quaternion); s.scale.copy(c.scale);
      s.name = `${atomId}__${counter.n++}`; s.userData = { id: s.name, kind: 'part', parent: atomId };
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
      if (a.instance !== undefined) node = meshNode(a.object), node && (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => keys.add(m.name));
      else node = subtree(a.object, a.id, counter, keys);
      if (!node) continue;
      worldMatrix(a).decompose(node.position, node.quaternion, node.scale);
      node.name = a.id;
      node.userData = { id: a.id, kind: a.kind, zone: zoneId, level: a.level, source: a.source ?? null, name: a.name ?? null,
        webId: a.webId ?? null, materialKeys: [...keys].sort() };
      if (a.seasonal) node.userData.seasonal = a.seasonal;
      node.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; });
      root.add(node);
      stats[a.kind] = (stats[a.kind] ?? 0) + 1;
    }
    const zone = ZONES.find((z) => z.id === zoneId);
    if (zone.collision) tris += addCollision(root, world, zoneId, W, D, unique);
    roots[zoneId] = { root, triangles: Math.round(tris) };
  }
  if (wanted.includes('fixture')) roots.fixture = { root: fixtureScene(W, D, unique), triangles: 0 };

  // ---- GLB per zone ----
  const exporter = new GLTFExporter();
  const glbs = {}, zoneReport = [];
  for (const [zoneId, { root, triangles }] of Object.entries(roots)) {
    const buf = await exporter.parseAsync(root, { binary: true, onlyVisible: true, includeCustomExtensions: false, trs: true });
    let nodes = 0; root.traverse(() => nodes++);
    glbs[`${zoneId}.glb`] = btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(''));
    zoneReport.push({ zone: zoneId, nodes, triangles, bytes: buf.byteLength });
  }

  // ---- measurement data ----
  const measurements = measurementData({ world, planCopy, W, D, byZone, lightsInfo, materialTable, commit, ZONES, wanted });
  return { glbs, measurements, report: { zones: zoneReport, kinds: stats, skipped, lightsError: lightsInfo.error, atoms: atoms.length } };
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

function measurementData({ world, planCopy, W, D, byZone, lightsInfo, materialTable, commit, ZONES, wanted }) {
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
  const lights = [];
  const atomAbove = (o) => { for (; o; o = o.parent) if (atomOf.has(o)) return atomOf.get(o); return null; };
  for (const l of world.lamps ?? []) {
    const a = atomAbove(l.object), p = l.object.getWorldPosition(new THREE.Vector3());
    lights.push({ id: a?.id ?? null, kind: 'lamp', name: l.name ?? null, level: l.level ?? levelOf(p.y), room: l.room ?? null, position: P(p.x, p.y + (l.height ?? 0), p.z) });
  }
  for (const l of lightsInfo.lamps) lights.push({ id: null, kind: 'room', name: null, level: l.level, room: l.room, position: P(l.pos.x, l.pos.y, l.pos.z),
    intensity: l.intensity, distance: l.distance, color: l.color });
  return {
    formatVersion: FORMAT_VERSION,
    kind: 'lunden-measurements',
    sourceCommit: commit,
    units: { web: 'm', unreal: 'cm', angles: 'deg unless the field says rad (webRotationY)' },
    axes: { web: 'x = east, y = up, z = south (north = -z), right-handed', unreal: 'X = 100*x (east), Y = 100*z (south), Z = 100*y (up), left-handed',
      yaw: 'unrealYaw = -90 - webYawDeg (normalised); object rotation.y a (rad) -> unrealYaw = 90 - deg(a)' },
    zones: ZONES.map((z) => ({ id: z.id, what: z.what, status: z.status === 'exported' && (wanted.includes(z.id)) ? 'exported' : 'planned', box: z.box ?? null })),
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
        source: 'src/config.js#PLAYER' },
    },
    stair: { foot: P(C.STAIR.aX0, C.LEVELS[0].floor, (C.STAIR.aZ[0] + C.STAIR.aZ[1]) / 2), rise: r4(stairRise()), riser: r4(stairRiser()), treads: N_TREADS,
      flights: C.STAIR.treads, hole: C.STAIR.hole, railHeight: C.STAIR.railHeight, source: 'src/config.js#STAIR, src/stairs.js' },
    doors, windows, lights,
    terrain: null, // filled in by tools/unreal-engine/export-world.mjs (a reference to data/elevation.json, not a copy)
    site: { geo: C.SITE.geo, planNorthDeg: C.DAY?.planNorth ?? null, source: 'src/config.js#SITE.geo, DAY.planNorth' },
    materials: materialTable,
    fixture: { points: fixturePoints(W, D).map((p) => ({ id: p.id, name: p.name, ...P(...p.web) })),
      arrows: [{ id: 'fixture_arrow_north', direction: 'north', web: [0, 0, -1], unreal: webToUnrealRounded([0, 0, -1]) },
        { id: 'fixture_arrow_east', direction: 'east', web: [1, 0, 0], unreal: webToUnrealRounded([1, 0, 0]) }] },
  };
}
