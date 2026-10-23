import * as THREE from 'three';
import { PERF, PLANT_WIND } from './config.js';
import { computeDetailBounds } from './combatworld.js';
import { lowMemory, freeGeometryAfterUpload } from './lowmemory.js';
import { detailOccluders, wholeBoxOccluded } from './occlusion.js';
import { garageCeilings } from './ceilingbatchgate.js';
import { hasNativeVertexCompile } from './lampwash.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
// #1540 (phones): from outside and beyond reach, a furnishing whose parts would all be drawn is drawn as its proxy, one
// merged mesh per material built once at start (`buildProxies`, `updateProxies`); any change to a part shows the parts again.
// #1545 (phones): the bottles and glasses standing at home likewise, one mesh per look across their materials (vertex colour,
// roughness and metalness), and each curtain's panels as one mesh (`buildThingProxies`, `buildCurtainProxies`); these draw
// exactly the parts the culler would draw, each part judged on its own, see-through ones far to near (`fillProxy`).

export const DETAIL_HIDDEN_LAYER = 7; // render-only culling; physical traces include this layer
const D = PERF.detail;
const phonePositionBounds = new WeakMap();
// This extra proof cannot trust authored geometry.boundingBox values shared with other systems.
function phoneGeometryBounds(geometry) {
  const p = geometry.attributes.position;
  if (!p || p.isInterleavedBufferAttribute || p.isGLBufferAttribute || p.itemSize !== 3 || p.normalized ||
      !(p.array instanceof Float32Array) || p.usage !== THREE.StaticDrawUsage ||
      p.getX !== THREE.BufferAttribute.prototype.getX || p.getY !== THREE.BufferAttribute.prototype.getY ||
      p.getZ !== THREE.BufferAttribute.prototype.getZ) return null;
  let entry = phonePositionBounds.get(geometry);
  if (!entry || entry.position !== p || entry.array !== p.array || entry.version !== p.version || entry.count !== p.count) {
    const box = new THREE.Box3().setFromBufferAttribute(p);
    if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) return null;
    entry = { position:p, array:p.array, version:p.version, count:p.count, box };
    phonePositionBounds.set(geometry, entry);
  }
  return entry.box;
}

export class DetailCuller {
  /** Collect the small meshes under `root` (call once everything is built). */
  /** box: { W, D, roof, floor1, doorHeight } the flat's footprint (plan), roof height, Övre plan's floor, the door height; openings: { north: [], south: [] } (x0 x1 y0 y1);
   * doorOpen(): is the front door open (then its whole doorway counts, #210)? */
  constructor(root, box, openings, doorOpen = () => false, garage = null) {
    // the front door's leaf is solid while it is shut: through it its transom and small high pane count (doorHeight above its sill)
    const solid = (o) => o.y0 < 0.05 || Math.abs(o.y0 - box.floor1) < 0.05;
    this.shut = { north: openings.north.flatMap(o => solid(o) ? [{ ...o, y0: o.y0 + box.doorHeight }, ...(o.entryPane ? [o.entryPane] : [])] : [o]), south: openings.south };
    this.full = { north: openings.north, south: openings.south };
    Object.assign(this, { box, doorOpen, open: false, openings: this.shut, walls: openings.walls ?? [], slab: openings.slab ?? null });
    this.baseOccluders = detailOccluders(openings.opaque ?? this.walls, this.slab, box.W, box.D);
    this.occluders = this.baseOccluders;
    // Use the actual shell batch for each emitted ceiling, including its existing area visibility.
    this.garageCeilings = garage ? garageCeilings().map(rect => {
      const source = garage.rects.find(r => r.x0 === rect.x0 && r.x1 === rect.x1 && r.z0 === rect.z0 && r.z1 === rect.z1);
      const area = garage.areas[source.area];
      return { rect, mesh: area.group.children.find(o => o.isMesh && o.material === area.mats.shell) };
    }) : [];
    this.items = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.moving = []; // the items under a root with userData.moving
    this.movers = []; // those roots: their matrices are brought up to date before they are judged (no render has run yet)
    root.updateMatrixWorld(true);
    const furniture = [], unitOf = new Map(), itemOf = new Map(); // (#1540: the furnishings' merged outside proxies)
    const walk = (o, moving, unit) => {
      if (o.userData.moving && !moving) this.movers.push(o);
      moving ||= !!o.userData.moving;
      if (!moving && 'phoneDetailUnit' in o.userData) furniture.push(o);
      if (('detailUnit' in o.userData || (lowMemory && o.userData.phoneDetailUnit)) && !unit) {
        unit = this.unit(o, lowMemory && !!o.userData.phoneDetailUnit);
        this.items.push(unit);
        unitOf.set(o, unit);
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
      itemOf.set(o, it);
      if (unit) unit.parts.push(it); // judged one by one only while its unit's flag is off
      else { this.items.push(it); if (moving) this.moving.push(it); }
    };
    walk(root, false, null);
    this.qualityScale = 1.0;
    this.outsideScale = lowMemory ? D.lowMemoryOutside ?? 1 : 1;
    this.proxies = [];
    this.proxySources = lowMemory ? { furniture, unitOf, itemOf } : null;
  }

  /** #1540 (phones): build the furnishings' merged outside proxies under `parent`, once, after lowmemory.js has packed the
   * normals and before anything is uploaded (the parts' normals / uv leave the CPU after their first upload, #628). */
  buildProxies(parent, things = [], curtains = []) {
    if (!this.proxySources || this.proxies.length) return 0;
    const { furniture, unitOf, itemOf } = this.proxySources;
    this.proxySources = null;
    this.proxies = [...buildProxies(furniture, unitOf, itemOf, parent), ...buildThingProxies(things, itemOf, parent, this.outsideScale),
      ...buildCurtainProxies(curtains, itemOf, parent)];
    return this.proxies.length;
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
    const meshes=[],box=new THREE.Box3();let complete=true;it.o.updateMatrixWorld(true);
    it.o.traverse(o=>{
      if(o.isSprite||o.isPoints||(o.isLine&&!o.isLineSegments))complete=false;
      if (!(o.isMesh||o.isLineSegments)||!o.geometry)return;
      if(o.userData.noDetail){complete=false;return;}
      if(!o.geometry.boundingBox)computeDetailBounds(o.geometry);
      const b=o.isInstancedMesh?(o.boundingBox??(o.computeBoundingBox(),o.boundingBox)):o.geometry.boundingBox;
      meshes.push(o);box.union(b.clone().applyMatrix4(o.matrixWorld));
    });
    for(const o of it.meshes)if(!meshes.includes(o)&&o.layers.mask===(1<<DETAIL_HIDDEN_LAYER))o.layers.set(0);
    it.meshes=meshes;it.opaqueComplete=complete;
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

  updateGarageCeilings(camera) {
    if (!this.garageCeilings.length) return;
    let signature = '';
    const active = [];
    for (const {rect, mesh} of this.garageCeilings) {
      let shown = !!mesh && mesh.material.visible !== false;
      for (let o = mesh; shown && o; o = o.parent) shown = o.visible && o.layers.test(camera.layers);
      signature += shown ? '1' : '0';
      if (shown) active.push(rect);
    }
    if (signature === this.garageSignature) return;
    this.garageSignature = signature;
    this.occluders = active.length ? [...this.baseOccluders, ...active] : this.baseOccluders;
    this.last.set(1e9, 0, 0); // a stationary eye must still restore contents when a shell disappears
  }

  update(camera) {
    this.updateGarageCeilings(camera);
    const p = camera.getWorldPosition(this.tmp ??= new THREE.Vector3());
    const open = !!this.doorOpen();
    if (open !== this.open) { this.open = open; this.openings = open ? this.full : this.shut; this.last.set(1e9, 0, 0); } // look again now
    const still = p.distanceToSquared(this.last) < D.move * D.move;
    const { W, D: Dz, roof } = this.box;
    const outside = p.x < 0 || p.x > W || p.z < 0 || p.z > Dz || p.y > roof;
    if (!(still && !this.moving.length)) this.judgeAll(p, still, outside);
    if (this.proxies.length) this.updateProxies(p, outside);
  }

  judgeAll(p, still, outside) {
    if (!still) this.last.copy(p);
    for (const o of this.movers) o.updateMatrixWorld();
    this.w ??= new THREE.Vector3();
    for (const it of still ? this.moving : this.items) {
      if (it.parts && this.gated(it)) continue;
      if (!it.parts) this.judge(it, p, outside);
      else if (it.phoneUnit && !outside) {
        if(it.far!==null)for(const o of it.meshes)o.layers.set(0);
        it.far=null;for(const q of it.parts)this.judge(q,p,outside);
      }
      else if (it.phoneUnit || it.o.userData.detailUnit) { if (this.judge(it, p, outside)) for (const q of it.parts) q.far = null; } // the whole
      else { it.far = null; for (const q of it.parts) this.judge(q, p, outside); } // its flag off: one by one
    }
  }

  /** #1541: a unit root whose `userData.drawnHidden()` holds is out of sight as a whole (our car in its stall while the garage
   * draws nothing at all, main.js): all its meshes go to the hidden layer; once it no longer holds every part is judged afresh. */
  gated(it) {
    if (!it.o.userData.drawnHidden?.()) {
      if (it.far === 'gated') { it.far = null; for (const q of it.parts) q.far = null; }
      return false;
    }
    if (it.far !== 'gated') {
      it.far = 'gated';
      for (const o of it.meshes) o.layers.set(DETAIL_HIDDEN_LAYER);
      for (const q of it.parts) q.far = null;
    }
    return true;
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
      ((lowMemory || outside) && !it.exteriorDoor && it.box && w.distanceToSquared(p) > D.minDist * D.minDist && this.wallHidden(p, it));
    if (far === it.far && !it.phoneUnit) return false;
    it.far = far;
    for (const o of it.meshes ?? [it.o]) o.layers.set(far ? DETAIL_HIDDEN_LAYER : 0);
    return true;
  }

  /** A single actual opaque wall/floor patch covers the complete render item; desktop uses this only outside. */
  wallHidden(eye, it) {
    const b = (this.worldBox ??= new THREE.Box3()).copy(it.box);
    // The new desktop proof also covers the shader's full local sway before world rotation/scaling.
    if (!lowMemory && it.o.geometry?.attributes.plantWind) {
      b.min.x -= PLANT_WIND.maxDisplacement; b.max.x += PLANT_WIND.maxDisplacement;
      b.min.z -= PLANT_WIND.maxDisplacement; b.max.z += PLANT_WIND.maxDisplacement;
    }
    b.applyMatrix4(it.o.matrixWorld);
    // The same real wall can also cover a distant object beyond the flat; no invented exterior wall.
    return wholeBoxOccluded(eye, b, this.occluders, D.occlusionMargin) ||
      (lowMemory && it.phoneUnit && this.garageCeilings.length > 0 && this.phoneUnitHidden(eye, it));
  }

  /** Hide a whole phone model only when every current part has its own complete opaque proof. */
  phoneUnitHidden(eye, it) {
    if (!it.opaqueComplete || !it.meshes.length) return false;
    if (eye.distanceTo(it.center.clone().applyMatrix4(it.o.matrixWorld)) <= it.near) return false;
    const union = (this.phoneUnion ??= new THREE.Box3()).makeEmpty();
    const box = this.phoneBox ??= new THREE.Box3(), geometryBox = this.phoneGeometryBox ??= new THREE.Box3();
    const part = this.phonePart ??= new THREE.Box3(), instance = this.phoneInstance ??= new THREE.Matrix4();
    for (const o of it.meshes) {
      const g = o.geometry, materials = [o.material, o.customDepthMaterial, o.customDistanceMaterial].flat().filter(Boolean);
      // These renderers can move vertices outside ordinary geometry bounds without a supported envelope.
      if (o.isSkinnedMesh || o.isBatchedMesh || g.morphAttributes.position?.length ||
          o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
          materials.some(m => m?.isShaderMaterial || m?.isRawShaderMaterial || m?.displacementMap || !hasNativeVertexCompile(m))) return false;
      for (let p = o; p; p = p.parent) {
        if (p.userData.door?.exterior) return false;
        if (p === it.o) break;
      }
      const bounds = phoneGeometryBounds(g);
      if (!bounds) return false;
      geometryBox.copy(bounds);
      // The known wind shader moves in geometry-local space, before instance/root rotation and scaling.
      if (g.attributes.plantWind) {
        geometryBox.min.x -= PLANT_WIND.maxDisplacement; geometryBox.max.x += PLANT_WIND.maxDisplacement;
        geometryBox.min.z -= PLANT_WIND.maxDisplacement; geometryBox.max.z += PLANT_WIND.maxDisplacement;
      }
      if (o.isInstancedMesh) {
        if (o.getMatrixAt !== THREE.InstancedMesh.prototype.getMatrixAt || !Number.isInteger(o.count) ||
            o.count <= 0 || o.count > o.instanceMatrix.count) return false;
        box.makeEmpty();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, instance);
          box.union(part.copy(geometryBox).applyMatrix4(instance));
        }
      } else box.copy(geometryBox);
      // This separate exact-geometry proof leaves the original padded LOD/union box untouched.
      box.applyMatrix4(o.matrixWorld);
      if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite) ||
          !wholeBoxOccluded(eye, box, this.occluders, D.occlusionMargin)) return false;
      union.union(box);
    }
    const sphere = union.getBoundingSphere(this.phoneSphere ??= new THREE.Sphere());
    // A near part keeps the complete model available, even when its centre is far behind a wall.
    return eye.distanceTo(sphere.center) > D.minDist + sphere.radius;
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

  /** #1540 (phones): from outside the flat and beyond reach, a furnishing that would be drawn (see `partsDrawn`) is drawn as
   * its proxy (one mesh per material, built once from its parts at start) instead; its parts then sit on the hidden layer,
   * still physical. Any change to a part (a door, a drawer, a new geometry or material, hidden, taken) shows the parts again
   * until it is back as built. Inside the flat, near, or with any part culled the parts draw as before. */
  updateProxies(eye, outside) {
    const c = this.w ??= new THREE.Vector3();
    for (const x of this.proxies) {
      let on = false;
      if (outside && shownInScene(x.root)) {
        if (x.live) refreshLive(x);
        c.copy(x.center).applyMatrix4(x.root.matrixWorld);
        // (a whole phone model as judged; another furnishing as soon as any of its parts is drawn: the proxy then also shows
        // its small parts that the distance alone had culled, never fewer)
        // (#1545: a thing / curtain proxy draws exactly the parts the culler would, each judged on its own: drawn, beyond
        // `minDist` (its box, in the parent's frame) and as merged; one taken, moved, changed or near is drawn itself while the
        // others stay merged, so two of them save a call)
        if (x.slices) {
          const local = proxyLocal.copy(eye).applyMatrix4(proxyInv.copy(x.group.matrixWorld).invert());
          let n = 0;
          for (const m of x.members) if ((m.ok = drawnFar(m.item.far) && m.box.distanceToPoint(local) > D.minDist && memberValid(m, x.root))) n++;
          on = n > 1;
        } else on = c.distanceTo(eye) > D.minDist + x.r && (x.unit ? drawnFar(x.unit.far) : partsDrawn(x)) && proxyValid(x);
      }
      if (on) {
        if (!x.root.matrixWorld.equals(x.group.matrix)) { x.group.matrix.copy(x.root.matrixWorld); x.group.matrixWorldNeedsUpdate = true; }
        for (const m of x.members) m.o.layers.set(x.slices && !m.ok && drawnFar(m.item.far) ? 0 : DETAIL_HIDDEN_LAYER);
        if (x.slices) fillProxy(x, eye);
      }
      if (on === x.on) continue;
      x.on = on;
      for (const mesh of x.group.children) mesh.layers.set(on ? 0 : DETAIL_HIDDEN_LAYER);
      // back to the culler's own decision: the whole model's outside, else the part's (inside the flat, one by one)
      if (!on) for (const m of x.members) m.o.layers.set((x.unit && x.unit.far !== null ? x.unit.far : m.item?.far) ? DETAIL_HIDDEN_LAYER : 0);
    }
  }

  /** Everything back on the normal layer (screenshots of detail, tests). */
  reset() {
    for (const x of this.proxies) { x.on = false; for (const mesh of x.group.children) mesh.layers.set(DETAIL_HIDDEN_LAYER); }
    for (const it of this.items) { it.far = false; for (const o of it.meshes ?? [it.o]) o.layers.set(0); for (const q of it.parts ?? []) q.far = false; }
    this.last.set(1e9, 0, 0);
  }
}

// #1540: merged outside proxies of whole furnishings (phones). Built once from the parts' current CPU data (before
// lowmemory.js frees normals / uv after the first upload), in the furnishing's own frame, so moving the whole piece keeps it.
const proxyRel = new THREE.Matrix4(), proxyInv = new THREE.Matrix4();
const nativeRender = THREE.Object3D.prototype.onBeforeRender;
const noRaycast = () => {};
const drawnFar = (far) => far === false || far === undefined; // (judge's `far` is falsy, not always false, when drawn; null: judged inside)
function attachedShown(o, root) {
  for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) return true; }
  return false;
}
function shownInScene(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
const versionOf = (g) => Object.values(g.attributes).reduce((v, a) => v + a.version, g.index?.version ?? 0);
function relativeMatrix(o, root, out) {
  return out.multiplyMatrices(proxyInv.copy(root.matrixWorld).invert(), o.matrixWorld);
}
/** Another furnishing's proxy (parts judged one by one): some part drawn, and the parts it would add (culled small things,
 * parts behind a wall) at most `D.proxyExtraTris` triangles. */
function partsDrawn(x) {
  let any = false, extra = 0;
  for (const m of x.members) if (!m.item || drawnFar(m.item.far)) any = true; else extra += m.tris;
  return any && extra <= D.proxyExtraTris;
}
function proxyValid(x) { return x.members.every((m) => memberValid(m, x.root)); }
/** Part `m` still as merged: geometry, material (and a vertex-coloured one's look), place under `root`, shown. */
function memberValid(m, root) {
  const o = m.o;
  if (o.geometry !== m.geometry || o.material !== m.material || m.material.visible === false || versionOf(o.geometry) !== m.version ||
      !attachedShown(o, root) || (m.look !== undefined && lookOf(m.material) !== m.look)) return false;
  const a = relativeMatrix(o, root, proxyRel).elements, b = m.rel.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-5) return false;
  return true;
}
/** A plain static mesh whose CPU data can still be merged (#1540). */
function plainPart(o) {
  const g = o.geometry, mat = o.material;
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || !g || !mat || Array.isArray(mat) ||
      mat.visible === false || o.renderOrder || o.onBeforeRender !== nativeRender || o.userData.noDetail ||
      g.morphAttributes.position?.length || g.drawRange.start !== 0 || g.drawRange.count !== Infinity || !g.attributes.position ||
      g.attributes.position.count > D.proxyMaxVertices) return false; // (a heavy part is a draw call worth its own memory)
  // a freed CPU copy (#628) or a rewritten attribute cannot be merged
  return !Object.values(g.attributes).some((a) => a.isInterleavedBufferAttribute || a.usage !== THREE.StaticDrawUsage || a.cpuFreed || a.array.length < a.count * a.itemSize);
}
/** One proxy group per furnishing that saves at least one draw call; parts that cannot merge stay as they are. */
function buildProxies(roots, unitOf, itemOf, parent) {
  const out = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    const skip = new Set([...(root.userData.things ?? []).map(t => t.model), ...(root.userData.frames ?? []), ...(root.userData.wallMirrors ?? []).map(m => m.object)]);
    const groups = new Map();
    const visit = (o) => {
      if (skip.has(o) || !o.visible || o.userData.moving) return;
      for (const c of o.children) visit(c);
      const g = o.geometry, mat = o.material;
      if (!plainPart(o) || mat.transparent) return;
      const attrs = Object.entries(g.attributes);
      const rel = relativeMatrix(o, root, new THREE.Matrix4());
      if (rel.determinant() <= 0) return; // (a mirrored part would need its winding flipped)
      const key = [mat.uuid, o.castShadow, o.receiveShadow, o.customDepthMaterial?.uuid, o.customDistanceMaterial?.uuid, !!g.index,
        ...attrs.map(([n, a]) => `${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort()].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ o, rel, geometry: g, material: mat, version: versionOf(g), item: itemOf.get(o), tris: (g.index ? g.index.count : g.attributes.position.count) / 3 });
    };
    visit(root);
    const lists = [...groups.values()].filter(l => l.length > 1); // (a material used once keeps its own part)
    if (!lists.length) continue;
    const group = new THREE.Group(), members = [], box = new THREE.Box3();
    group.name = 'phone-furniture-proxy'; group.matrixAutoUpdate = false; group.matrix.copy(root.matrixWorld);
    for (const list of lists) {
      const geometry = mergeGeometries(list.map(m => m.geometry.clone().applyMatrix4(m.rel)));
      if (!geometry) continue;
      const first = list[0].o, mesh = new THREE.Mesh(geometry, first.material);
      Object.assign(mesh, { castShadow: first.castShadow, receiveShadow: first.receiveShadow, matrixAutoUpdate: false, raycast: noRaycast });
      if (first.customDepthMaterial) mesh.customDepthMaterial = first.customDepthMaterial;
      if (first.customDistanceMaterial) mesh.customDistanceMaterial = first.customDistanceMaterial;
      mesh.userData.noDetail = true;
      // never read back (no raycast, bounds already computed): every vertex attribute leaves the CPU once on the GPU (#628)
      freeGeometryAfterUpload(geometry, Object.keys(geometry.attributes));
      mesh.layers.set(DETAIL_HIDDEN_LAYER);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); box.union(geometry.boundingBox);
      group.add(mesh); members.push(...list);
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    parent.add(group);
    out.push({ root, group, members, unit: unitOf.get(root) ?? null, center: sphere.center, r: sphere.radius, on: false });
  }
  if (out.length) parent.updateMatrixWorld(true);
  return out;
}

// #1545 (phones): the bottles and glasses you can take (things.js), while they stand at home, seen from outside as one mesh per
// look. Parts with different colours, roughness or metalness but otherwise the same material merge with those three per
// vertex (`lookMaterial`); identical materials (the BESTÅ's crystal) merge as they are. A proxy draws exactly the parts the
// culler would draw, see-through ones in three's far-to-near order (`fillProxy`). Built in the world frame: a part taken, moved
// or changed (its material included) is drawn itself again, the rest stay merged. A part the distance alone always culls beyond
// reach (a cap, a cork) stays its own item.
const DRINK_THINGS = new Set(['whisky', 'wine', 'champagne', 'glass']);
const MAPS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap', 'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap'];
/** All of a standard material a vertex-coloured proxy keeps besides its colour, roughness and metalness. */
const lookKey = (m) => [m.type, m.transparent, m.opacity, m.depthWrite, m.depthTest, m.side, m.forceSinglePass, m.blending, m.alphaTest,
  m.emissive.getHex(), m.emissiveIntensity, m.envMapIntensity, m.flatShading, m.fog, m.toneMapped, m.polygonOffset, m.polygonOffsetFactor,
  m.polygonOffsetUnits, m.colorWrite, m.premultipliedAlpha, m.dithering, m.wireframe, m.vertexColors, m.visible].join();
function lookOf(m) { return `${lookKey(m)}|${m.color.r},${m.color.g},${m.color.b},${m.roughness},${m.metalness}`; }
/** Roughness and metalness per vertex (attribute `proxyRM`); vertex positions are untouched. */
function vertexRoughness(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 proxyRM;\nvarying vec2 vProxyRM;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProxyRM = proxyRM;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vProxyRM;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vProxyRM.x;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vProxyRM.y;');
}
rememberFragmentCompile(vertexRoughness);
const proxyRMKey = () => 'phone-thing-proxy-rm';
function lookMaterial(src) {
  const m = new THREE.MeshStandardMaterial().copy(src);
  m.color.setRGB(1, 1, 1); m.vertexColors = true; m.name = 'phone-thing-proxy';
  m.onBeforeCompile = vertexRoughness; m.customProgramCacheKey = proxyRMKey;
  return m;
}
function buildThingProxies(things, itemOf, parent, outsideScale) {
  const lists = new Map(), out = [];
  parent.updateMatrixWorld(true);
  for (const t of things) {
    if (!DRINK_THINGS.has(t.kind) || !t.model || t.held || t.placed || t.broken) continue;
    t.model.traverse((o) => {
      const item = itemOf.get(o), mat = o.material;
      if (!item || !plainPart(o) || !mat.isMeshStandardMaterial || mat.userData.lamp || MAPS.some((k) => mat[k]) || !o.geometry.attributes.normal ||
          !attachedShown(o, parent) || item.baseCut * outsideScale <= D.minDist) return;
      const rel = relativeMatrix(o, parent, new THREE.Matrix4());
      if (rel.determinant() <= 0) return;
      // (only a standard material merges across materials; a physical one with the same material object)
      const key = [mat.isMeshPhysicalMaterial ? mat.uuid : lookKey(mat), o.castShadow, o.receiveShadow, o.customDepthMaterial?.uuid,
        o.customDistanceMaterial?.uuid].join('|');
      if (!lists.has(key)) lists.set(key, []);
      const g = o.geometry;
      lists.get(key).push({ o, rel, geometry: g, material: mat, version: versionOf(g), item, tris: (g.index ? g.index.count : g.attributes.position.count) / 3 });
    });
  }
  for (const list of lists.values()) {
    if (list.length < 2) continue;
    const shared = list.every((m) => m.material === list[0].material);
    if (!shared) for (const m of list) m.look = lookOf(m.material);
    out.push(mergedProxy(list, parent, shared ? list[0].material : lookMaterial(list[0].material), { looks: !shared }));
  }
  if (out.length) parent.updateMatrixWorld(true);
  return out;
}
/** #1545 (phones): a curtain's cloth panels share one material and are seen from outside as one mesh, rewritten (`refreshLive`)
 * when the curtain is drawn or opened, and following the material library's choice for the whole curtain. */
function buildCurtainProxies(curtains, itemOf, parent) {
  const out = [];
  for (const c of curtains) {
    const list = [], mat = c.panels?.[0]?.mesh.material;
    for (const { mesh: o } of c.panels ?? []) {
      const g = o.geometry, item = itemOf.get(o);
      if (!item || !o.isMesh || o.material !== mat || Array.isArray(mat) || o.renderOrder || o.onBeforeRender !== nativeRender || !g.index ||
          !g.attributes.normal || !g.attributes.uv || g.morphAttributes.position?.length || !attachedShown(o, parent) ||
          Object.values(g.attributes).some((a) => a.isInterleavedBufferAttribute || a.cpuFreed || a.array.length < a.count * a.itemSize)) continue;
      const rel = relativeMatrix(o, parent, new THREE.Matrix4());
      if (rel.determinant() <= 0) continue;
      list.push({ o, rel, geometry: g, material: mat, version: versionOf(g), item, tris: g.index.count / 3 });
    }
    if (list.length > 1) out.push(mergedProxy(list, parent, mat, { uv: true, live: true }));
  }
  if (out.length) parent.updateMatrixWorld(true);
  return out;
}
/** The proxy entry for `list` merged (hidden until `updateProxies` switches it on). */
function mergedProxy(list, parent, material, { looks = false, uv = false, live = false } = {}) {
  const { geometry, slices } = mergeParts(list, { looks, uv });
  const first = list[0].o, mesh = new THREE.Mesh(geometry, material), group = new THREE.Group();
  Object.assign(mesh, { castShadow: first.castShadow, receiveShadow: first.receiveShadow, matrixAutoUpdate: false, raycast: noRaycast });
  if (first.customDepthMaterial) mesh.customDepthMaterial = first.customDepthMaterial;
  if (first.customDistanceMaterial) mesh.customDistanceMaterial = first.customDistanceMaterial;
  mesh.userData.noDetail = true;
  // (the index stays: `fillProxy` rewrites it; a curtain's positions and normals are rewritten too)
  if (live) for (const n of ['position', 'normal']) geometry.attributes[n].setUsage(THREE.DynamicDrawUsage);
  else freeGeometryAfterUpload(geometry, Object.keys(geometry.attributes));
  mesh.layers.set(DETAIL_HIDDEN_LAYER);
  group.name = 'phone-thing-proxy'; group.matrixAutoUpdate = false; group.matrix.copy(parent.matrixWorld);
  group.add(mesh); parent.add(group);
  const sphere = geometry.boundingSphere;
  return { root: parent, group, mesh, members: list, unit: null, center: sphere.center.clone(), r: sphere.radius, on: false,
    slices, shown: [], index: geometry.index, sorted: material.transparent, live };
}
/** A curtain proxy follows its panels: their current cloth, and one new material shared by all of them. */
function refreshLive(x) {
  const mat = x.members[0].o.material;
  if (mat !== x.mesh.material && x.members.every((m) => m.o.material === mat)) {
    x.mesh.material = mat; x.sorted = !!mat.transparent; x.shown = [];
    for (const m of x.members) m.material = mat;
  }
  let moved = false;
  for (const m of x.members) {
    const v = versionOf(m.geometry);
    if (m.o.geometry !== m.geometry || v === m.version) continue;
    writePart(x.mesh.geometry, m); m.version = v; moved = true;
  }
  if (moved) { x.mesh.geometry.attributes.position.needsUpdate = true; x.mesh.geometry.attributes.normal.needsUpdate = true; }
}
/** The parts in `list` in one geometry in the parent's frame: positions, packed normals (as lowmemory.js packs them), with `uv`
 * the parts' uv and with `looks` each part's colour and roughness / metalness per vertex. `slices`: each part's indices (for
 * `fillProxy`). Its bounds are the parts' own (a curtain's cover its whole track). */
function mergeParts(list, { looks = false, uv = false } = {}) {
  let verts = 0, count = 0;
  for (const m of list) { const P = m.geometry.attributes.position; m.first = verts; verts += P.count; count += m.geometry.index ? m.geometry.index.count : P.count; }
  const geometry = new THREE.BufferGeometry(), index = new (verts > 65535 ? Uint32Array : Uint16Array)(count), slices = [];
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(verts * 4), 4, true));
  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
  if (looks) { geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3)); geometry.setAttribute('proxyRM', new THREE.BufferAttribute(new Float32Array(verts * 2), 2)); }
  const box = new THREE.Box3(), part = new THREE.Box3();
  let k = 0;
  for (const m of list) {
    const g = m.geometry, P = g.attributes.position;
    writePart(geometry, m);
    const start = k;
    if (g.index) for (let i = 0; i < g.index.count; i++) index[k++] = g.index.getX(i) + m.first;
    else for (let i = 0; i < P.count; i++) index[k++] = m.first + i;
    slices.push(index.slice(start, k));
    if (!g.boundingBox) g.computeBoundingBox();
    m.box = part.copy(g.boundingBox).applyMatrix4(m.rel).clone(); box.union(m.box);
    m.wc = m.box.getCenter(new THREE.Vector3()); // (the parent's frame)
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingBox = box; geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  return { geometry, slices };
}
/** Part `m`'s vertices into the merged `geometry` (also again, for a curtain that moved). */
function writePart(geometry, m) {
  const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, c = m.material.color, A = geometry.attributes;
  const pos = A.position.array, nor = A.normal.array, uv = A.uv?.array, col = A.color?.array, rm = A.proxyRM?.array;
  const v = proxyEye, nm = proxyNormal.getNormalMatrix(m.rel);
  for (let i = 0; i < P.count; i++) {
    const j = m.first + i;
    v.fromBufferAttribute(P, i).applyMatrix4(m.rel); pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
    v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    nor[j * 4] = Math.round(v.x * 127); nor[j * 4 + 1] = Math.round(v.y * 127); nor[j * 4 + 2] = Math.round(v.z * 127);
    if (uv) { uv[j * 2] = U.getX(i); uv[j * 2 + 1] = U.getY(i); }
    if (col) { col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b; rm[j * 2] = m.material.roughness; rm[j * 2 + 1] = m.material.metalness; }
  }
}
const proxyNormal = new THREE.Matrix3();
/** A thing / curtain proxy draws the parts `updateProxies` found ok (drawn by the culler, beyond reach, as merged): its index
 * holds only theirs, a see-through one's far to near from `eye` as three sorts separate see-through meshes. The index is
 * rewritten only when that list or its order changes. */
function fillProxy(x, eye) {
  const shown = [];
  x.members.forEach((m, k) => { if (m.ok) shown.push(k); });
  if (x.sorted) {
    const local = proxyEye.copy(eye).applyMatrix4(proxyInv.copy(x.group.matrixWorld).invert());
    const d = x.members.map((m) => m.wc.distanceToSquared(local));
    shown.sort((a, b) => d[b] - d[a]);
  }
  if (shown.length === x.shown.length && shown.every((k, i) => k === x.shown[i])) return;
  x.shown = shown;
  let at = 0;
  for (const k of shown) { x.index.array.set(x.slices[k], at); at += x.slices[k].length; }
  x.index.needsUpdate = true;
  x.mesh.geometry.setDrawRange(0, at);
}
const proxyEye = new THREE.Vector3(), proxyLocal = new THREE.Vector3();
