import * as THREE from 'three';
import { PERF } from './config.js';
import { computeDetailBounds } from './combatworld.js';
import { lowMemory } from './lowmemory.js';
import { detailOccluders, wholeBoxOccluded } from './occlusion.js';

// Small-detail culling (#189): from the street the whole flat is in the view frustum (the walls don't stop three's
// culling), so every handle, knob, bottle and trinket inside was a draw call of its own. A mesh smaller than
// `PERF.detail.maxR` that would look tinier than `k` (its radius / distance) is moved to a layer the camera does
// not render (nor the shadow camera or nearby focus rays: never nearer than `minDist`).
// Checked when the camera has moved a little, not every frame.
// From outside the flat, anything inside it is only drawn if the line from the eye to it passes through one of the
// façade's openings (windows, doors; with a margin of its size): the walls hide the rest (a coarse occlusion test).
// The front door's leaf only counts as solid while it is shut: open, the whole doorway shows the hall (#210).
// Things that move by themselves while the visitor may stand still (the car driving in, the cat, darts in flight …)
// mark their root with `userData.moving`: the meshes under it are judged again every update, not only when the
// camera has moved (#267 — the car's wheels and rear windows stayed hidden from when it was far away).
// The lit parts of the lamps (materials with `userData.lamp`, set by lights.js) are never culled for being small: a
// glowing shade or bulb that vanished a few metres off made the lamp look off (#294); from outside, walls still hide them.
// A root whose `userData.detailUnit` is true is judged as one thing (#598): all its meshes are shown or hidden together, by
// the size of the whole (the car: its wheels went at ~40 m while the body, too big to cull, drove on floating). The flag
// may change while running (the car sets it except in its garage stall): while false its meshes are judged one by one.
// #695: the outline lines of doors, lids and appliances (architectureedges.js, one LineSegments per moving anchor) are judged
// like meshes, and from outside a thing is also hidden when its box, seen from the eye, falls on the façade outside every
// opening (the box's eight corners projected onto the façade plane), or when every line from the eye through those openings
// to it runs into one of the flat's full-height walls on its storey (`openings.walls`, plan rectangles; doorways are gaps):
// the sphere with its margin let ~490 things inside the flat through the windows at the start view (774 draw calls on a
// phone) — the kitchen window looks straight at the Klk wall —, or when it is on Övre plan and every such line climbs
// through the floor between the storeys away from the stair's hole (`openings.slab`). Things beyond the flat (the patio,
// our car in the garage) are judged the same way. All the tests are conservative: any one of them suffices.
// On phones (`lowMemory`) the small things inside the flat seen from outside, through its windows, go at
// `PERF.detail.lowMemoryOutside` × their usual distance (#695: the kitchen's cups and bottles from the street), and their
// outline line sets (architecture edges) beyond `PERF.detail.lowMemoryEdgesOutside` m (#1223: ~28 draw calls at the start
// view for one-pixel lines through the windows).

export const DETAIL_HIDDEN_LAYER = 7; // render-only culling; physical traces include this layer
const D = PERF.detail;

export class DetailCuller {
  /** Collect the small meshes under `root` (call once everything is built). */
  /** box: { W, D, roof, floor1, doorHeight } the flat's footprint (plan), roof height, Övre plan's floor, the door height; openings: { north: [], south: [] } (x0 x1 y0 y1);
   * doorOpen(): is the front door open (then its whole doorway counts, #210)? */
  constructor(root, box, openings, doorOpen = () => false) {
    // the front door's leaf is solid while it is shut: through it its transom and small high pane count (doorHeight above its sill)
    const solid = (o) => o.y0 < 0.05 || Math.abs(o.y0 - box.floor1) < 0.05;
    this.shut = { north: openings.north.flatMap(o => solid(o) ? [{ ...o, y0: o.y0 + box.doorHeight }, ...(o.entryPane ? [o.entryPane] : [])] : [o]), south: openings.south };
    this.full = { north: openings.north, south: openings.south };
    Object.assign(this, { box, doorOpen, open: false, openings: this.shut, walls: openings.walls ?? [], slab: openings.slab ?? null });
    this.occluders = detailOccluders(openings.opaque ?? this.walls, this.slab, box.W, box.D);
    this.items = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.moving = []; // the items under a root with userData.moving
    this.movers = []; // those roots: their matrices are brought up to date before they are judged (no render has run yet)
    root.updateMatrixWorld(true);
    const walk = (o, moving, unit) => {
      if (o.userData.moving && !moving) this.movers.push(o);
      moving ||= !!o.userData.moving;
      if (('detailUnit' in o.userData || (lowMemory && o.userData.phoneDetailUnit)) && !unit) {
        unit = this.unit(o, lowMemory && !!o.userData.phoneDetailUnit);
        this.items.push(unit);
        if (moving) this.moving.push(unit);
      }
      for (const c of o.children) walk(c, moving, unit);
      if (!(o.isMesh || (o.isLineSegments && o.userData.architectureEdges)) || o.isInstancedMesh || o.userData.noDetail || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (!o.geometry.boundingBox) computeDetailBounds(o.geometry);
      const s = o.geometry.boundingSphere;
      const r = s.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (!(r > 0 && (r < D.maxOcclude || (lowMemory && o.isLineSegments && o.userData.architectureEdges)))) return;
      const lamp = [o.material].flat().some((m) => m?.userData.lamp); // a lamp's lit parts: never too small to draw (#294)
      const baseCut = r < D.maxR && !lamp ? Math.max(D.minDist, r / D.k) : Infinity;
      // Exterior door hardware may have a merged centre on/inside the footprint,
      // but it belongs to the visible facade, not to contents behind a closed leaf (#519).
      const exteriorDoor = !!o.userData.door?.exterior;
      const it = { o, r, center: s.center.clone(), box: o.geometry.boundingBox, cut: baseCut, baseCut, far: false, lamp, exteriorDoor, edges: !!o.isLineSegments };
      if (unit) unit.parts.push(it); // judged one by one only while its unit's flag is off
      else { this.items.push(it); if (moving) this.moving.push(it); }
    };
    walk(root, false, null);
    this.qualityScale = 1.0;
    this.outsideScale = lowMemory ? D.lowMemoryOutside ?? 1 : 1;
  }

  /** Whole-model bounds: the car keeps its original policy; opted-in furniture uses phone LOD only from outside the flat. */
  unit(root, phoneUnit = false) {
    const meshes = [], box = new THREE.Box3();
    root.traverse((o) => {
      if (!(o.isMesh || (phoneUnit && o.isLineSegments)) || (!phoneUnit && o.isInstancedMesh) || !o.geometry || (phoneUnit && o.userData.noDetail)) return;
      meshes.push(o);
      if (!o.geometry.boundingBox) computeDetailBounds(o.geometry);
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    const s = box.isEmpty() ? new THREE.Sphere() : box.getBoundingSphere(new THREE.Sphere());
    const center = root.worldToLocal(s.center.clone()); // judged in the root's frame: it follows the root as it moves
    const lamp=phoneUnit && meshes.some(o=>[o.material].flat().some(m=>m?.userData.lamp));
    const near=phoneUnit?D.minDist+s.radius:D.minDist;
    const baseCut = phoneUnit ? (lamp ? Infinity : Math.max(near,s.radius/D.phoneUnitK)) : (s.radius < D.maxR ? Math.max(D.minDist, s.radius / D.k) : Infinity);
    const localBox=phoneUnit?box.clone().applyMatrix4(root.matrixWorld.clone().invert()).expandByScalar(D.phoneUnitPad):undefined;
    return { o: root, meshes, parts: [], r: s.radius, center, box:localBox, near:phoneUnit?near:undefined, phoneUnit, cut: baseCut, baseCut, far: false, lamp, exteriorDoor: false };
  }

  /** Phone furniture can open or replace a model part; collect its current complete envelope before judging it. */
  refreshPhoneUnit(it) {
    const meshes=[],box=new THREE.Box3();it.o.updateMatrixWorld(true);
    it.o.traverse(o=>{
      if (!(o.isMesh||o.isLineSegments)||!o.geometry||o.userData.noDetail)return;
      if(!o.geometry.boundingBox)computeDetailBounds(o.geometry);
      const b=o.isInstancedMesh?(o.boundingBox??(o.computeBoundingBox(),o.boundingBox)):o.geometry.boundingBox;
      meshes.push(o);box.union(b.clone().applyMatrix4(o.matrixWorld));
    });
    for(const o of it.meshes)if(!meshes.includes(o)&&o.layers.mask===(1<<DETAIL_HIDDEN_LAYER))o.layers.set(0);
    it.meshes=meshes;
    if(box.isEmpty())return;
    const sphere=box.getBoundingSphere(new THREE.Sphere());it.r=sphere.radius;it.center.copy(it.o.worldToLocal(sphere.center));
    it.box.copy(box).applyMatrix4(it.o.matrixWorld.clone().invert()).expandByScalar(D.phoneUnitPad);
    it.near=D.minDist+it.r;it.lamp=meshes.some(o=>[o.material].flat().some(m=>m?.userData.lamp));
    it.baseCut=it.lamp?Infinity:Math.max(it.near,it.r/D.phoneUnitK);
    it.cut=Math.max(it.near,it.baseCut*this.qualityScale);
  }

  /** Set quality distance scaling factor (1.0 = high, 0.7 = medium/low) (#460). */
  setQuality(scale = 1.0) {
    if (Math.abs(this.qualityScale - scale) < 1e-3) return;
    this.qualityScale = scale;
    for (const it of this.items.flatMap((x) => [x, ...(x.parts ?? [])])) {
      if (it.baseCut !== Infinity) it.cut = Math.max(it.near ?? D.minDist * 0.8, it.baseCut * scale);
    }
    this.refresh();
  }

  update(camera) {
    const p = camera.getWorldPosition(this.tmp ??= new THREE.Vector3());
    const open = !!this.doorOpen();
    if (open !== this.open) { this.open = open; this.openings = open ? this.full : this.shut; this.last.set(1e9, 0, 0); } // look again now
    const still = p.distanceToSquared(this.last) < D.move * D.move;
    if (still && !this.moving.length) return;
    if (!still) this.last.copy(p);
    for (const o of this.movers) o.updateMatrixWorld();
    this.w ??= new THREE.Vector3();
    const { W, D: Dz, roof } = this.box;
    const outside = p.x < 0 || p.x > W || p.z < 0 || p.z > Dz || p.y > roof;
    for (const it of still ? this.moving : this.items) {
      if (!it.parts) this.judge(it, p, outside);
      else if (it.phoneUnit && !outside) {
        if(it.far!==null)for(const o of it.meshes)o.layers.set(0);
        it.far=null;for(const q of it.parts)this.judge(q,p,outside);
      }
      else if (it.phoneUnit || it.o.userData.detailUnit) { if (this.judge(it, p, outside)) for (const q of it.parts) q.far = null; } // the whole
      else { it.far = null; for (const q of it.parts) this.judge(q, p, outside); } // its flag off: one by one
    }
  }

  /** Is item `it` too far / hidden from `p`? Moves its mesh(es) to the right layer; true when that changed. */
  judge(it, p, outside) {
    if(it.phoneUnit)this.refreshPhoneUnit(it);
    const w = this.w.copy(it.center).applyMatrix4(it.o.matrixWorld), { W, D: Dz, roof } = this.box;
    const inside = outside && w.x > 0 && w.x < W && w.z > 0 && w.z < Dz && w.y < roof;
    // (phones, #695; #1223: the outlines of the doors, lids and appliances inside within `lowMemoryEdgesOutside` m only)
    const distanceCut = inside ? (it.edges && this.outsideScale < 1 ? Math.min(it.cut, D.lowMemoryEdgesOutside ?? Infinity) : it.cut * this.outsideScale) : it.cut;
    // Other architectural outlines use the same existing distance, plus their radius to protect nearby edges.
    const cut=it.phoneUnit?Math.max(it.near,distanceCut):(lowMemory && it.edges ? Math.min(distanceCut,D.lowMemoryEdgesOutside+it.r) : distanceCut);
    const far = w.distanceToSquared(p) > cut * cut || (outside && !it.exteriorDoor && (this.hidden(p, w, it.r) || (it.box && this.boxHidden(p, it.box, it.o.matrixWorld)))) ||
      (lowMemory && !it.exteriorDoor && it.box && w.distanceToSquared(p) > D.minDist * D.minDist && this.wallHidden(p, it));
    if (far === it.far && !it.phoneUnit) return false;
    it.far = far;
    for (const o of it.meshes ?? [it.o]) o.layers.set(far ? DETAIL_HIDDEN_LAYER : 0);
    return true;
  }

  /** Phone-only: a single actual opaque wall/floor patch covers the complete world box. Near focus is unchanged. */
  wallHidden(eye, it) {
    const b = (this.worldBox ??= new THREE.Box3()).copy(it.box).applyMatrix4(it.o.matrixWorld);
    // The same real wall can also cover a distant object beyond the flat; no invented exterior wall.
    return wholeBoxOccluded(eye, b, this.occluders, D.occlusionMargin);
  }

  /** Seen from `eye` (outside the flat), is a thing at `c` (radius r) inside it hidden by the walls? */
  hidden(eye, c, r) {
    const { W, D: Dz, roof } = this.box;
    if (c.x < 0 || c.x > W || c.z < 0 || c.z > Dz || c.y > roof) return false; // not in the flat
    // where the line from the thing to the eye leaves the box: the nearest face it crosses
    const dx = eye.x - c.x, dy = eye.y - c.y, dz = eye.z - c.z;
    let t = Infinity, face = null;
    const hit = (tt, f) => { if (tt > 0 && tt < t) { t = tt; face = f; } };
    if (dz < 0) hit(-c.z / dz, 'north'); else if (dz > 0) hit((Dz - c.z) / dz, 'south');
    if (dx < 0) hit(-c.x / dx, 'side'); else if (dx > 0) hit((W - c.x) / dx, 'side');
    if (dy > 0) hit((roof - c.y) / dy, 'side');
    if (face === null || face === 'side') return true; // the party walls and the roof have no openings
    const x = c.x + dx * t, y = c.y + dy * t, m = r * (1 - t) + 0.04; // its outline shrinks towards the eye
    return !this.openings[face].some((o) => x > o.x0 - m && x < o.x1 + m && y > o.y0 - m && y < o.y1 + m);
  }

  /** Seen from `eye` north or south of the flat, does the thing's box (local `box`, placed by `matrix`) fall on that façade
   * outside every opening? Its corners projected from the eye onto the façade plane bound what can show (#695). Also for
   * things beyond the flat (our car in the garage under the patio, the patio's furniture seen from the street): a line to
   * them that meets the façade within the flat's width and below its roof goes through the flat (or, below its floor,
   * through the foundation and the ground in front of it — *guess*: nothing under our façade opens). */
  boxHidden(eye, box, matrix) {
    const { W, D: Dz, roof } = this.box;
    const face = eye.z < 0 ? 'north' : eye.z > Dz ? 'south' : null;
    if (!face || eye.y < 0) return false; // beside or above the flat, or down in the garage: the sphere test decides
    const zf = face === 'north' ? 0 : Dz, v = this.v ??= new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const lo = (this.lo ??= new THREE.Vector3()).set(Infinity, Infinity, Infinity), hi = (this.hi ??= new THREE.Vector3()).set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(matrix);
      lo.min(v); hi.max(v);
      if (face === 'north' ? v.z <= zf : v.z >= zf) return false; // reaches the façade (sills, hardware): the sphere test decides
      const t = (zf - v.z) / (eye.z - v.z), x = v.x + (eye.x - v.x) * t, y = v.y + (eye.y - v.y) * t;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x0 < 0 || x1 > W || y1 > roof) return false; // (past the flat's own façade: the neighbours, the flats above)
    const m = 0.04, seen = this.openings[face].filter((o) => x1 > o.x0 - m && x0 < o.x1 + m && y1 > o.y0 - m && y0 < o.y1 + m);
    if (!seen.length) return true;
    // the floor between the storeys: from openings below its underside a line up to a thing on Övre plan (inside the flat)
    // climbs through it, where only the stair's hole lets it by (the plan rectangle spanned by those openings and the thing)
    const S = this.slab, e = 0.02;
    if (S && lo.y > S.y - e && lo.x >= 0 && hi.x <= W && lo.z >= 0 && hi.z <= Dz && seen.every((o) => o.y1 < S.y + e)) {
      const h = S.hole, ax = Math.min(lo.x, ...seen.map((o) => o.x0)), bx = Math.max(hi.x, ...seen.map((o) => o.x1));
      const az = Math.min(zf, lo.z), bz = Math.max(zf, hi.z);
      if (bx < h.x0 || ax > h.x1 || bz < h.z0 || az > h.z1) return true;
    }
    // the walls: on one storey (the thing and every opening it shows through between its floor and ceiling), a line from the
    // eye is named by where it meets the façade (u); a wall between the façade and the thing stops the u whose line reaches
    // its near or far face within its width. Hidden when no u of the openings' parts in front of the thing is left.
    const by0 = lo.y, by1 = hi.y;
    const lvl = this.walls.length && this.walls.find((w) => by0 > w.y0 - e && by1 < w.y1 + e);
    if (!lvl || seen.some((o) => o.y0 < lvl.y0 - e || o.y1 > lvl.y1 + e)) return false;
    let free = seen.map((o) => [Math.max(o.x0 - m, x0), Math.min(o.x1 + m, x1)]);
    const near = face === 'north' ? lo.z : hi.z, ez = eye.z, ex = eye.x;
    for (const w of this.walls) {
      if (w.y0 !== lvl.y0 || (face === 'north' ? w.z1 > near || w.z0 < zf : w.z0 < near || w.z1 > zf)) continue; // (between façade and thing)
      for (const wz of [w.z0, w.z1]) {
        const k = (zf - ez) / (wz - ez), a = ex + (w.x0 - ex) * k, b = ex + (w.x1 - ex) * k; // the u that meet this face's width
        free = free.flatMap(([u0, u1]) => (b <= u0 || a >= u1 ? [[u0, u1]] : [...(a > u0 ? [[u0, a]] : []), ...(b < u1 ? [[b, u1]] : [])]));
      }
      if (!free.length) return true;
    }
    return free.every(([u0, u1]) => u1 - u0 < 1e-3);
  }

  /** Look again at the next update even if the camera has not moved (something was taken into the hand or put down). */
  refresh() { this.last.set(1e9, 0, 0); }

  /** Everything back on the normal layer (screenshots of detail, tests). */
  reset() {
    for (const it of this.items) { it.far = false; for (const o of it.meshes ?? [it.o]) o.layers.set(0); for (const q of it.parts ?? []) q.far = false; }
    this.last.set(1e9, 0, 0);
  }
}
