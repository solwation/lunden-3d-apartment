import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STANDARD, PERF } from './config.js';
import { lowMemory } from './lowmemory.js';
import { lodRange, patchDitherLod, lodDepthMaterial } from './lod.js';
import { INTERACTION_MATERIAL_SOURCE } from './interactionoutline.js';

// A flat you can walk into besides ours (#574, #573, VISIT_UNITS in config). world.js builds it like ours — from its floor
// plan, in a group of its own placed at its slot in Hus L (`ox` along x, `oz` along z: plan coordinates are the group's) —
// in Peab's standard finish, empty. This class is the rest: its collision in world coordinates, its doors / windows / lids
// as E targets, its rooms, its stair and its slabs. The visitor's own systems (player.js, main.js) ask
// `world.unitAt(x, z, y)`; everything of L1007's (the saved home, the cat, the lights, the life sim, the score) never sees
// it: its things are not in world.doors / lids. Nothing about it is saved: on every visit it is the same empty flat, every
// door and window shut.
//
// `levels`: per level { name, floor (absolute y), ceiling (RH), top (the next floor), rect (its footprint, plan
// coordinates), hole (the opening in its floor, plan coordinates) }; `stair` = { height(x, z), underside(x, z) } in plan
// coordinates (absolute y); `soffits`: its lowered ceilings (SOFFITS' shape, plan coordinates; the lamps hang below them, #620); `ground`: its Entréplan is on the street (L1004: its walls are level 0's, from outside too).

// #1965: `&nolod` = no mid level (the old two levels, for A/B measurements; the trees' switch, #1958)
const NO_LOD = typeof location !== 'undefined' && /[?&]nolod\b/.test(location.search);
// what a merged mid-level geometry may carry (`fi`: the kitchen fronts' index, standardinterior.js batchFronts)
const PLAIN = new Set(['position', 'normal', 'uv', 'color', 'fi']);
const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }; // (three's own choice)

/** The triangles `start`..`start + count` of a non-indexed geometry as a geometry of their own (one material group). */
function slice(g, { start, count }) {
  const out = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(g.attributes)) out.setAttribute(n, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
  return out;
}
/** `g` (a clone) without an index and with every triangle's winding turned (a mirrored part baked into the flat's frame). */
function flipped(g) {
  if (g.index) g = g.toNonIndexed();
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i + 3 * n <= arr.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t; }
  }
  return g;
}

const shift = (s, ox, oz) => [s[0] + ox, s[1] + oz, s[2] + ox, s[3] + oz];
const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export class VisitUnit {
  /** { id, ox, oz, object (the group, at ox / oz), levels (above), built: buildLevel's results (plan coordinates), doors,
   *  lids (doors and the rest that open: windows, the letter box, toilet lids), roomMaps (plan coordinates), stair, ground,
   *  shell: the materials of what it shows from afar (walls, ceilings, floors, window frames) } */
  constructor({ id, ox, oz = 0, object, levels, built, doors, lids, roomMaps, stair, ground = false, opaqueRects = [], shell = [], glass = null, soffits = [] }) {
    Object.assign(this, { id, ox, oz, object, levels, roomMaps, stair, ground, soffits });
    // #1383: the same actual fixed solids as our home, translated with this plan (never moving leaves or glass).
    this.opaqueRects = opaqueRects.map(r=>({...r,x0:r.x0+ox,x1:r.x1+ox,z0:r.z0+oz,z1:r.z1+oz}));
    this.top = levels.at(-1).top;
    this.bottom = levels[0].floor;
    const r0 = levels[0].rect;
    this.size = { x: r0.x1 - r0.x0, z: r0.z1 - r0.z0 };
    this.box = { x0: ox + r0.x0, x1: ox + r0.x1, z0: oz + r0.z0, z1: oz + r0.z1 }; // its lowest level's footprint (world)
    // fixed walls / windows / fittings and the walls alone (line of sight), per level, in world coordinates
    this.fixed = built.map((l) => l.segments.map((s) => shift(s, ox, oz)));
    this.walls = built.map((l) => l.wallSegments.map((s) => shift(s, ox, oz)));
    this.doors = doors;
    this.lids = lids;
    this.doorLevel = new Map(doors.map((d) => [d, this.levelAt(d.object.position.y)]));
    for (const d of doors) { // the leaf's collision and its doorway in world coordinates (sounds, the visitor's tests)
      const seg = d.segment.bind(d), at = d.segmentAt.bind(d), opening = d.opening.bind(d);
      d.segment = () => shift(seg(), ox, oz);
      d.segmentAt = (t) => shift(at(t), ox, oz);
      d.opening = () => { const o = opening(); return { ...o, center: [o.center[0] + ox, o.center[1] + oz] }; };
    }
    for (const t of [...doors, ...lids]) t.visit = this; // (main.js: no score, no cat, nothing kept)
    this.targets = [...doors, ...lids];
    // draw calls (#574): from afar only its shell is drawn; from inside our flat or under the ground none of it
    // + a stand-in for its windows (the glass and the shut sashes merged into one mesh per material): no open holes from afar
    const S = new Set(shell), panes = lids.filter((l) => l.name === 'fönstret').map((l) => l.object);
    const outer = new Set(doors.filter((d) => d.exterior).map((d) => d.object)); // (its front / patio / terrace door: shut holes too)
    this.detail = object.children.filter((o) => !(o.isMesh && S.has(o.material)) && !outer.has(o));
    object.updateMatrixWorld(true);
    const inv = object.matrixWorld.clone().invert(), parts = new Map();
    const standsIn = this.standsIn = new Set(); // the meshes the stand-in copies (not copied again by the mid level, #1965)
    const take = (m) => {
      if (!m.isMesh || !(m.material === glass || S.has(m.material))) return;
      standsIn.add(m);
      let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!parts.has(m.material)) parts.set(m.material, []);
      parts.get(m.material).push(g);
    };
    for (const p of panes) p.traverse(take);
    for (const o of object.children) if (o.isMesh && o.material === glass) take(o);
    this.standIn = new THREE.Group();
    for (const [mat, geos] of parts) { const g = mergeGeometries(geos); if (g) this.standIn.add(new THREE.Mesh(g, mat)); }
    this.standIn.visible = false;
    object.add(this.standIn);
    this.shown = 'all';
    this.mid = null; // (buildMid, once everything is in the flat)
  }

  /**
   * The mid level (#1965, STANDARD.lod): everything of `detail` that is drawn with the flat shut, merged into one mesh per
   * material (and shadow flags) in the flat's frame, so the ~160-200 draw calls of the doors, fittings, lines and switches
   * become a few dozen between `near` m and the fade zone. Pixels are the full level's (same geometry, a clone of the same
   * material that compiles through the source's own `onBeforeCompile`, so the lamp wash and the fronts' shader are in it),
   * so the swap at `near` is a hard one; at the far end the clones' dithered pixel fade (src/lod.js, `centre`: one point kept at the flat's distance from the camera) takes the inside
   * away, shadows too (`lodDepthMaterial`). Not merged, drawn as they are until the fade is over (`pass`): shader materials
   * (wall-ao), the lamps (their lit parts change), anything with attributes of its own and fixed parts with hidden or
   * specially ordered meshes (the corner shading). Left out: what the stand-in
   * already shows, hidden things (contents), meshes the small-detail culler has hidden by `near` m, and on phones the
   * outline lines (PERF.detail.lowMemoryEdgesOutside). Call once, after visitlights.js has added its lamps and switches and
   * before the first frame; without it (`&nolod`, a failed merge) `cull` keeps the old two levels.
   */
  buildMid() {
    if (this.mid || NO_LOD) return null;
    const L = STANDARD.lod, D = PERF.detail, object = this.object, centre = { value: new THREE.Vector3(0, -1e6, 0) };
    const zone = lowMemory ? [L.startPhone, L.endPhone] : [L.start, L.end], range = lodRange(zone[0], zone[1]);
    object.updateMatrixWorld(true);
    const inv = object.matrixWorld.clone().invert(), m4 = new THREE.Matrix4(), buckets = new Map(), pass = new Set();
    const put = (o, mat, geo) => {
      if (!mat || mat.visible === false) return;
      const key = `${mat.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
      if (!buckets.has(key)) buckets.set(key, { src: mat, like: o, geos: [] });
      buckets.get(key).geos.push(geo);
    };
    const tiny = (o) => { // (detail.js hides it before `near` m: not in the merged level either)
      o.geometry.boundingSphere ?? o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      return r < D.maxR && Math.max(D.minDist, r / D.k) <= L.near;
    };
    const visit = (o, top) => {
      if (!o.visible) return;
      if ((o.isMesh || o.isLineSegments) && o.geometry?.attributes.position && !this.standsIn.has(o)) {
        const mats = [o.material].flat(), g = o.geometry;
        if (o.isInstancedMesh || o.isSkinnedMesh || mats.some((m) => m?.isShaderMaterial || m?.userData.lamp) || Object.keys(g.attributes).some((n) => !PLAIN.has(n))) { if (top) pass.add(o); }
        else if (o.isLineSegments ? !lowMemory : !tiny(o)) {
          m4.multiplyMatrices(inv, o.matrixWorld);
          let geo = g.clone().applyMatrix4(m4);
          if (o.isMesh && m4.determinant() < 0) geo = flipped(geo);
          if (Array.isArray(o.material)) { if (geo.index) geo = geo.toNonIndexed(); for (const grp of g.groups) put(o, mats[grp.materialIndex], slice(geo, grp)); }
          else { geo.clearGroups(); put(o, o.material, geo); }
        }
      }
      for (const c of o.children) visit(c, false);
    };
    // a fixed part with something hidden in it or drawn in an order of its own (the baked corner shading: shown by the
    // quality level) stays as it is: what it shows can change after this
    const moving = new Set(this.targets.map((t) => t.object));
    const own = (o) => { let f = false; o.traverse((c) => { f ||= !c.visible || c.renderOrder !== 0; }); return f; };
    for (const o of this.detail) if (!moving.has(o) && own(o)) pass.add(o); else visit(o, true);
    const group = new THREE.Group(), pairs = [], depth = new Map();
    group.name = `mid ${this.id}`;
    try {
      for (const { src, like, geos } of buckets.values()) {
        const names = new Map(), indexed = geos.every((g) => g.index);
        for (const g of geos) for (const [n, a] of Object.entries(g.attributes)) if (!names.has(n)) names.set(n, a);
        const even = geos.map((g) => {
          if (!indexed && g.index) g = g.toNonIndexed();
          for (const [n, a] of names) if (!g.attributes[n]) { // (a part without uv / vertex colour beside parts with it)
            const arr = new a.array.constructor(g.attributes.position.count * a.itemSize);
            if (n === 'color') arr.fill(arr instanceof Float32Array ? 1 : 2 ** (8 * arr.BYTES_PER_ELEMENT) - 1);
            g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
          }
          return g;
        });
        const geo = mergeGeometries(even);
        if (!geo) throw new Error(`material ${src.name || src.type}: parts do not merge`);
        // the source's look and shader (compiled through its own callback, whatever patches it later), plus the dither
        const mat = src.clone();
        mat[INTERACTION_MATERIAL_SOURCE] = src; // (lampwash.js patches the source, never this delegate)
        mat.onBeforeCompile = function (shader, renderer) { src.onBeforeCompile.call(this, shader, renderer); };
        mat.customProgramCacheKey = () => src.customProgramCacheKey();
        patchDitherLod(mat, { range, centre });
        pairs.push({ src, mat, version: src.version });
        const mesh = like.isLineSegments ? new THREE.LineSegments(geo, mat) : new THREE.Mesh(geo, mat);
        mesh.castShadow = like.castShadow; mesh.receiveShadow = like.receiveShadow; mesh.renderOrder = like.renderOrder;
        if (mesh.castShadow) {
          const side = src.shadowSide ?? SHADOW_SIDE[src.side];
          if (!depth.has(side)) depth.set(side, lodDepthMaterial({ range, centre, side }));
          mesh.customDepthMaterial = depth.get(side);
        }
        mesh.raycast = () => {}; // (drawn only: E, shots and sight lines go to the real parts)
        mesh.userData.noDetail = true; mesh.userData.noArchitectureEdges = true;
        group.add(mesh);
      }
    } catch (e) { console.warn(`VisitUnit ${this.id}: no mid level (${e.message})`); return null; }
    group.visible = false;
    object.add(group);
    this.rest = this.targets.map((t) => t.t); // (every door, window and lid shut: what the merged level shows)
    this.mid = { group, pass, pairs, centre, start: zone[0], end: zone[1] };
    return this.mid;
  }

  /** Is every door, window and lid where it was when the mid level was built (shut, not moving)? */
  atRest() { const r = this.rest; return this.targets.every((t, i) => t.t === r[i]); }

  /** What is drawn for a camera at `p` (main.js, every frame): 'none' when `away` (in our flat or down in the garage: none
   * of it can be seen from there), 'shell' farther than STANDARD.detail m from its footprint, else 'all'. With a mid level
   * (#1965, buildMid): 'all' within STANDARD.lod.near m (within STANDARD.detail m while something of it is open or moving),
   * 'mid' (the shell, the stand-in and the merged inside, fading out by dither over the zone) up to the zone's end. */
  cull(p, away) {
    const b = this.box, dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1), d = Math.hypot(dx, dz);
    const mid = this.mid, L = STANDARD.lod;
    let want = away ? 'none' : d > STANDARD.detail ? 'shell' : 'all';
    if (mid && !away) {
      const near = !this.atRest() ? STANDARD.detail : this.shown === 'all' ? L.near : L.near - L.hysteresis;
      want = d <= near ? 'all' : d < mid.end ? 'mid' : 'shell';
      if (want === 'mid') {
        mid.centre.value.set(p.x + d, p.y, p.z); // (the shader measures only the distance; lodCamera = p this frame, as BatchLod.update)
        for (const q of mid.pairs) if (q.version !== q.src.version) { q.version = q.src.version; q.mat.needsUpdate = true; } // (the source was patched again: lampwash.js)
      }
    }
    if (want === this.shown) return;
    this.shown = want;
    this.object.visible = want !== 'none';
    for (const o of this.detail) o.visible = want === 'all' || (want === 'mid' && mid.pass.has(o));
    this.standIn.visible = want === 'shell' || want === 'mid';
    if (mid) mid.group.visible = want === 'mid';
  }

  /** Its level at feet height y (0 its entrance floor, 1 the floor above). */
  levelAt(y) { return y > this.levels[0].floor + 1.6 ? 1 : 0; }

  /** Is (x, z) inside it (plan view; with feet height `y`: in its rooms, not on its roof or a terrace in front of it)? */
  contains(x, z, y) {
    const lx = x - this.ox, lz = z - this.oz;
    if (!inRect(this.levels[0].rect, lx, lz)) return false;
    if (y === undefined) return true;
    if (y < this.bottom - 1 || y > this.top - 0.3) return false;
    const up = this.levels[1];
    return !up || y < up.floor - 0.3 || inRect(up.rect, lx, lz) || this.stair.height(lx, lz) !== null;
  }

  inHole(x, z) { const h = this.levels[1]?.hole, lx = x - this.ox, lz = z - this.oz; return !!h && inRect(h, lx, lz); }

  /** The stair's walking height / its treads' underside at (x, z), or null. */
  stairHeight(x, z) { return this.contains(x, z) ? this.stair.height(x - this.ox, z - this.oz) : null; }
  stairUnderside(x, z) { return this.contains(x, z) ? this.stair.underside(x - this.ox, z - this.oz) : null; }

  /** The floors one can stand on at (x, z): its entrance floor, the floor above (where there is one: not over its
   * opening, not beyond its footprint), the stair. */
  floors(x, z) {
    const out = [this.levels[0].floor], up = this.levels[1];
    if (up && inRect(up.rect, x - this.ox, z - this.oz) && !this.inHole(x, z)) out.push(up.floor);
    const s = this.stairHeight(x, z);
    if (s !== null) out.push(s);
    return out;
  }

  /** The leaves' collision on `level` now. */
  doorSegments(level) { return this.doors.filter((d) => this.doorLevel.get(d) === level).map((d) => d.segment()); }

  /** Its doors at feet height y (from outside: the loftgång, a terrace, #573). */
  doorSegmentsAt(y) { return this.doors.filter((d) => Math.abs(d.object.position.y - y) < 0.5).map((d) => d.segment()); }

  /** Does the line a → b pass through one of its slabs (outside the opening)? (E through a floor, #446) */
  throughSlab(a, b) {
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i];
      for (const y of [L.floor + L.ceiling, L.top]) {
        if ((a.y - y) * (b.y - y) >= 0) continue;
        const t = (y - a.y) / (b.y - a.y), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (!inRect(L.rect, x - this.ox, z - this.oz)) continue;
        if (i === 0 && this.inHole(x, z)) continue;
        return true;
      }
    }
    return false;
  }

  /** The room at a plan point on a level (world coordinates), or null. */
  roomAt(level, x, z) { return this.roomMaps[level]?.at(x - this.ox, z - this.oz) ?? null; }

  /** Its level's name and room for the HUD. */
  label(level, x, z) {
    const room = this.roomAt(level, x, z);
    return `${this.id} · ${this.levels[level].name}${room ? ` · ${room}` : ''}`;
  }

  update(dt) { for (const t of this.targets) t.update?.(dt); }

  /** The flat's centre (world), for the sun's shadow box. */
  get centre() { return new THREE.Vector3((this.box.x0 + this.box.x1) / 2, 0, (this.box.z0 + this.box.z1) / 2); }
}
