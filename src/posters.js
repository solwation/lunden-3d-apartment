import * as THREE from 'three';
import { DRAWING as D, HOLD } from './config.js';
import { withStore } from './idb.js';
import { setHeld, heldItem } from './holdable.js';
import { sfx } from './audio.js';

// Children's drawings taped up anywhere (#176): "Ta teckningen" in drawing mode puts the sheet in the hand
// (HeldDrawing); E on a wall (any level, also the façade) or on the fridge / freezer door tapes it up there,
// flat on the surface, a little turned, with a strip of tape at each corner. Every poster is ONE plane with
// its own canvas texture: the drawing plus the four tape strips painted into a slightly bigger, transparent
// canvas (1 draw call each). On a fridge/freezer door it is a child of the door and swings with it. Kept in
// IndexedDB 'lunden'/'drawings' (idb.js) and put back up on the next visit.
//
// A spot is valid when the look ray (within HOLD.reach) hits an upright surface that is a wall (within
// D.wallGap of a wall outline of the visitor's level, or material userData.poster) or the fridge / freezer
// door, and the whole sheet lies flat on that one surface: rays at 9 points over the
// sheet must all meet the same mesh at the same depth — so no doorways, windows, glass, edges, switches or
// architraves under it. Not behind a wall (main.js's behindWall), not over the changelog note.

const STORE = 'drawings';
const PPM = 600 / D.w; // poster canvas pixels per metre
const MARGIN = 26; // px of transparent margin round the paper, for the tape that overhangs it
const PW = Math.round(D.w * PPM), PH = Math.round(D.h * PPM), TW = PW + 2 * MARGIN, TH = PH + 2 * MARGIN;
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** The poster quaternion (in the parent's frame) for a surface normal and a turn about it. */
function posterQuat(normal, rot, out = new THREE.Quaternion()) {
  const n = normal.clone().normalize(), right = new THREE.Vector3().crossVectors(UP, n).normalize(), up = new THREE.Vector3().crossVectors(n, right);
  out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  return out.multiply(new THREE.Quaternion().setFromAxisAngle(Z, rot));
}

/** The drawing with tape at the corners on a transparent canvas (TW × TH). `seed` varies the tape. */
function paintPoster(img, seed = 1) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  let s = (Math.abs(seed) % 2147483646) + 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fbfaf5'; g.fillRect(MARGIN, MARGIN, PW, PH);
  if (img) g.drawImage(img, MARGIN, MARGIN, PW, PH);
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.strokeRect(MARGIN, MARGIN, PW, PH);
  for (const [x, y, a] of [[MARGIN, MARGIN, -1], [MARGIN + PW, MARGIN, 1], [MARGIN + PW, MARGIN + PH, -1], [MARGIN, MARGIN + PH, 1]]) {
    g.save();
    g.translate(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6);
    g.rotate(a * (Math.PI / 4 + (rand() - 0.5) * 0.35));
    const w = 62 + rand() * 16, h = 20 + rand() * 4;
    g.fillStyle = 'rgba(250,246,226,0.62)';
    g.beginPath(); // slightly torn short ends
    g.moveTo(-w / 2, -h / 2);
    g.lineTo(w / 2, -h / 2);
    for (let k = 0; k <= 4; k++) g.lineTo(w / 2 + (rand() - 0.5) * 3, -h / 2 + (h * k) / 4);
    g.lineTo(-w / 2, h / 2);
    for (let k = 4; k >= 0; k--) g.lineTo(-w / 2 + (rand() - 0.5) * 3, -h / 2 + (h * k) / 4);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-w / 2, -h / 2 + 1); g.lineTo(w / 2, -h / 2 + 1); g.stroke();
    g.restore();
  }
  return c;
}

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const posterGeo = new THREE.PlaneGeometry(TW / PPM, TH / PPM);

export class Posters {
  /**
   * marks: the Marks instance (its segment raycasts and surface list); world: wall outlines per level and
   * the fridge/freezer (lids with a `door`); note: the changelog note (no poster over it).
   */
  constructor(scene, world, marks, note) {
    Object.assign(this, { scene, world, marks, note, list: [], cache: null });
    this.group = new THREE.Group(); // the posters on walls (in world coordinates)
    scene.add(this.group);
    // fridge / freezer doors that open: a group on each door holds its posters
    this.doors = {};
    for (const l of world.lids) {
      if (l.kind === 'fridge' && l.door?.isObject3D) { // the fridge, and the freezer (the same class, #161)
        const key = l.freezer ? 'freezer' : 'fridge', g = new THREE.Group();
        l.door.add(g);
        this.doors[key] = { lid: l, door: l.door, group: g, meshes: [] };
        l.door.traverse((o) => { if (o.isMesh) this.doors[key].meshes.push(o); });
      }
    }
    this.groups = [this.group, ...Object.values(this.doors).map((d) => d.group)]; // F hides them (world.looseItems)
    this.ray = new THREE.Raycaster();
    // the ghost: where the held drawing would go
    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
    this.ghost = new THREE.Mesh(posterGeo, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.raycast = () => {};
    scene.add(this.ghost);
  }

  get full() { return this.list.length >= D.maxPosted; }

  /** Put every saved poster back up. */
  async load() {
    let recs = [];
    try { recs = (await withStore(STORE, 'readonly', (s) => s.getAll())) ?? []; } catch { recs = []; }
    for (const r of recs.sort((a, b) => a.time - b.time)) await this.build(r);
  }

  /** Make the mesh for a record and hang it up (no saving). */
  async build(rec) {
    const parent = rec.surface === 'wall' ? this.group : this.doors[rec.surface]?.group;
    if (!parent) return null; // a door that isn't there (any more)
    const tex = new THREE.CanvasTexture(paintPoster(null, rec.time));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, roughness: 0.92, depthWrite: true });
    const mesh = new THREE.Mesh(posterGeo, mat);
    mesh.position.fromArray(rec.pos);
    posterQuat(new THREE.Vector3().fromArray(rec.normal), rec.rot, mesh.quaternion);
    mesh.receiveShadow = true;
    const p = { rec, mesh, name: 'teckningen', kind: 'poster', verb: 'titta på', pickable: mesh };
    mesh.userData.door = p;
    mesh.userData.poster = p;
    parent.add(mesh);
    this.list.push(p);
    loadImage(rec.image).then((img) => { tex.image = paintPoster(img, rec.time); tex.needsUpdate = true; });
    return p;
  }

  /** E target per poster (main.js adds them to the pickables while the posters are shown). */
  get targets() { return this.list; }

  /**
   * Where a drawing would go for the look `ray` (world), or null: { surface, point, normal (world), distance,
   * full } — `full` when it is a valid spot but D.maxPosted are already up. `level`: the visitor's level,
   * `behindWall(p)`: main.js's wall check.
   */
  spot(ray, level, behindWall) {
    const eye = ray.origin, to = eye.clone().addScaledVector(ray.direction, HOLD.reach);
    // a fridge / freezer door first (Marks.hit looks through things that move)
    let door = null;
    for (const [surface, d] of Object.entries(this.doors)) {
      this.ray.set(eye, ray.direction); this.ray.far = HOLD.reach;
      const h = this.ray.intersectObjects(d.meshes, false)[0];
      if (h && h.face && (!door || h.distance < door.h.distance)) door = { surface, d, h };
    }
    const wall = this.marks.hit(eye, to);
    const wallDist = wall?.point ? wall.point.distanceTo(eye) : Infinity;
    let cand = null;
    if (door && door.h.distance <= wallDist + 0.01) {
      const n = door.h.face.normal.clone().transformDirection(door.h.object.matrixWorld);
      if (n.dot(ray.direction) > 0) return null; // the inside of the door
      cand = { surface: door.surface, point: door.h.point.clone(), normal: n, object: door.h.object, meshes: [door.h.object, ...door.d.meshes] };
    } else if (wall && !wall.cat && wall.normal) {
      cand = { surface: 'wall', point: wall.point, normal: wall.normal.clone(), object: wall.object, meshes: null };
    }
    if (!cand || Math.abs(cand.normal.y) > 0.08) return null;
    cand.normal.y = 0; cand.normal.normalize();
    if (behindWall(cand.point)) return null;
    // cached: the same surface and nearly the same point → the same answer
    const c = this.cache;
    if (c && c.object === cand.object && c.point.distanceTo(cand.point) < 0.01 && c.count === this.list.length) return c.result;
    let ok = cand.surface !== 'wall' || cand.object.material?.userData?.poster || this.onWall(cand.point, cand.normal, level);
    ok = ok && this.flat(cand) && !this.overNote(cand.point, cand.normal);
    const result = ok ? { surface: cand.surface, point: cand.point, normal: cand.normal, distance: cand.point.distanceTo(eye), full: this.full } : null;
    this.cache = { object: cand.object, point: cand.point.clone(), count: this.list.length, result };
    return result;
  }

  /** Is p (with normal n) on a wall outline of the level? */
  onWall(p, n, level) {
    const segs = this.world.levels[Math.max(0, level)]?.wallSegments ?? [];
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1e-6 || Math.abs((dx * n.x + dz * n.z) / len) > 0.1) continue; // not facing that way
      const t = THREE.MathUtils.clamp(((p.x - ax) * dx + (p.z - az) * dz) / (len * len), 0, 1);
      if (Math.hypot(ax + dx * t - p.x, az + dz * t - p.z) < D.wallGap) return true;
    }
    return false;
  }

  /** Does the whole sheet lie flat on the hit surface (9 probes meet the same mesh at the same depth)? */
  flat({ point, normal, object, meshes }) {
    const q = posterQuat(normal, 0), all = meshes ?? this.marks.meshes(), out = 0.03;
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      const c = new THREE.Vector3(u * D.w * 0.52, v * D.h * 0.52, 0).applyQuaternion(q).add(point).addScaledVector(normal, out);
      const h = this.marks.segment(c, c.clone().addScaledVector(normal, -2 * out), all).find((x) => !x.object.material?.blending || x.object.material.blending === THREE.NormalBlending);
      if (!h || h.object !== object || Math.abs(h.distance - out) > 0.006) return false;
    }
    return true;
  }

  /** Would a sheet at p cover the changelog note? */
  overNote(p, n) {
    if (!this.note) return false;
    const np = this.note.object.getWorldPosition(new THREE.Vector3()), d = np.sub(p);
    if (Math.abs(d.dot(n)) > 0.08) return false;
    const right = new THREE.Vector3().crossVectors(UP, n).normalize();
    return Math.abs(d.dot(right)) < D.w / 2 + 0.1 && Math.abs(d.y) < D.h / 2 + 0.13;
  }

  /** Show the ghost of `image` (a texture) at a spot, or hide it (null). */
  showGhost(s, tex) {
    this.ghost.visible = !!s && !s.full;
    if (!this.ghost.visible) return;
    if (this.ghostMat.map !== tex) { this.ghostMat.map = tex; this.ghostMat.needsUpdate = true; }
    this.ghost.position.copy(s.point).addScaledVector(s.normal, D.lift + D.step * 10);
    posterQuat(s.normal, 0, this.ghost.quaternion);
  }

  /** Tape `image` (data URL) up at spot `s` (from spot()); saved. Returns the poster. */
  async tape(image, s, { id = uid(), time = Date.now() } = {}) {
    const lift = D.lift + D.step * (this.list.length % 8);
    const rot = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * D.tilt);
    let pos = s.point.clone().addScaledVector(s.normal, lift), normal = s.normal.clone();
    if (s.surface !== 'wall') { // into the door's frame: it swings with the door
      const door = this.doors[s.surface].door;
      door.updateMatrixWorld(true);
      const inv = door.matrixWorld.clone().invert();
      pos = pos.applyMatrix4(inv);
      normal = normal.transformDirection(inv);
    }
    const rec = { id, image, surface: s.surface, level: s.level ?? 0, pos: pos.toArray(), normal: normal.toArray(), rot, time, updated: Date.now() };
    const p = await this.build(rec);
    await this.save(rec);
    this.cache = null;
    sfx.tape?.(s.point);
    return p;
  }

  async save(rec) { try { await withStore(STORE, 'readwrite', (st) => st.put(rec)); } catch { /* no IndexedDB: this visit only */ } }

  /** Take a poster down for good (#177): gone from the wall and from storage. */
  async remove(p) {
    p.mesh.removeFromParent();
    p.mesh.material.map.dispose(); p.mesh.material.dispose();
    this.list.splice(this.list.indexOf(p), 1);
    this.cache = null;
    try { await withStore(STORE, 'readwrite', (st) => st.delete(p.rec.id)); } catch { /* ignore */ }
  }
}

/**
 * The drawing in the hand (#176): a sheet held up in front of you. Shares the one-thing-in-the-hand rule
 * with the Holdables (setHeld); `putBack` (another thing taken, F) lays it back on the desk.
 */
export class HeldDrawing {
  constructor(scene, camera, drawing) {
    Object.assign(this, { scene, camera, drawing, held: false, image: null, name: 'teckningen' });
    this.tex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.model = new THREE.Mesh(new THREE.PlaneGeometry(D.w * 0.62, D.h * 0.62), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.95, side: THREE.DoubleSide }));
    this.model.position.set(D.held.x, D.held.y, D.held.z);
    this.model.rotation.set(-0.35, 0, 0.06);
    this.model.raycast = () => {};
  }

  /** Take `image` (data URL) into the hand. */
  take(image, meta = null) {
    setHeld(this);
    this.held = true;
    this.image = image;
    this.meta = meta; // a poster taken down again keeps its id and time (#177)
    loadImage(image).then((img) => { if (img && this.image === image) { this.tex.image = paintPoster(img, 1); this.tex.needsUpdate = true; } });
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(this.model);
    sfx.paper(this.camera.position);
  }

  /** It leaves the hand (taped up): nothing goes back to the desk. */
  release() {
    this.held = false;
    this.model.removeFromParent();
    if (heldItem() === this) setHeld(null);
  }

  /** Back on the desk (E on the desk, another thing taken, F). */
  putBack() {
    if (!this.held) return;
    this.release();
    this.drawing.restore(this.image);
    sfx.paper(this.drawing.paper.position);
  }

  use() {}
  update() {}
}
