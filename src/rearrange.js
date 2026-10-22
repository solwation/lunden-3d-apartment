import { playerLocalStorage as localStorage } from './playerprofiles.js';
import { MATERIAL_VERSION, validMaterialChoice } from './materialcatalog.js';
import { isPrivateCode, layoutWriteCredential } from './privatecodes.js';
import * as THREE from 'three';
import { LEVELS, LIFE, LIGHTING, REARRANGE } from './config.js';
import { cloudUrl } from './cloud.js';
import { migratePosterLayout, migrateVeronaLayout } from './layoutmigrations.js';
import { rugLift, rugSupport } from './rugs.js';
import { inPoly, crosses } from './player.js';

// #465: preview locally; only confirmed, revision-checked moves enter the shared arrangement.
const CACHE = 'lunden.furniture.layout', UNLOCK = 'lunden.furniture.unlocked';
const NAMES = { besta: 'vitrinskåpet', winerack: 'vinstället', stringshelf: 'stringhyllan', pineapple: 'ananaspegeln', byas: 'TV-bänken', sofa: 'soffan', armchair: 'fåtöljen', ottoman: 'pallen', rug: 'mattan', pictures: 'tavlan', painting: 'tavlan', kposters: 'affischerna', skansnasTable: 'matbordet', skansnasChair: 'stolen', coffeetable: 'soffbordet', slattable: 'uteplatsbordet', randerstable: 'sidobordet', aborgtable: 'bordet', aborgchair: 'stolen', floorlamp: 'golvlampan', tubelamp: 'lampan', worklamp: 'lampan', walllamp: 'vägglampan', bed: 'sängen', bunk: 'våningssängen', daybed: 'sängen', gamingdesk: 'skrivbordet', gamingchair: 'stolen', laptop: 'datorn', tv: 'TV:n', palm: 'växten', zzplant: 'garderobsblomman', planter: 'växten', parasol: 'parasollen', secretary: 'sekretären', sidetable: 'sängbordet', veronasofa: 'utesoffan', dynbox: 'dynboxen', weberkettle: 'klotgrillen', huego: 'lampan', symfonisk: 'högtalaren', photoframe: 'fotoramen', nesthub: 'skärmen', nestmini: 'högtalaren', xmastree: 'julgranen' };
const crossesLevels = (piece) => ['pictures', 'painting', 'kposters'].includes(piece.item.type);
// Floors have disjoint height intervals; the saved world transform identifies the storey.
const levelAt = (y) => LEVELS.findIndex(l => y > l.floor && y < l.floor + l.ceiling);
const usesSupport = (piece) => piece.item.type === 'symfonisk' || (piece.item.type === 'tv' && piece.item.mount !== 'wall');
const V = THREE.Vector3, Q = THREE.Quaternion, M = THREE.Matrix4;
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const within = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
// Actual solid geometry, excluding invisible targets and light overlays (notably TV Ambilight).
function physicalBounds(root, hiddenRoot = false) {
  const visible = o => { for (; o && o !== root; o = o.parent) if (!o.visible) return false; return true; };
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !(hiddenRoot ? visible(o) : shown(o)) || o.userData.surface !== undefined) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(m => m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending)) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else { o.geometry.computeBoundingBox(); bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  return bounds;
}
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
function worldPose(o, matrix) {
  o.parent?.updateWorldMatrix(true, false);
  const local = o.parent ? o.parent.matrixWorld.clone().invert().multiply(matrix) : matrix;
  local.decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true);
}
const matrixOf = (pose) => new M().compose(new V(...pose.pos), new Q(...pose.quat), new V(1, 1, 1));
const poseOf = (matrix) => { const p = new V(), q = new Q(); matrix.decompose(p, q, new V()); return { pos: p.toArray(), quat: q.toArray() }; };

export class Rearrange {
  constructor({ scene, camera, world, player, life, carryables, marks, busy, changed, status, materialOnly = [] }, url = cloudUrl()) {
    Object.assign(this, { scene, camera, world, player, life, carryables, marks, busy, changed, status, url });
    this.pieces = world.furniture.movable;
    this.materialPieces = [...this.pieces, ...materialOnly];
    if (new Set(this.materialPieces.map(p => p.id)).size !== this.materialPieces.length) throw Error('Duplicate material ids');
    this.byId = new Map(this.pieces.map((p) => [p.id, p]));
    if (this.byId.size !== this.pieces.length) throw Error('Duplicate furniture ids');
    scene.updateMatrixWorld(true);
    for (const p of this.pieces) { p.name = NAMES[p.item.type] ?? (p.name === p.item.type ? 'möbeln' : p.name); p.home = p.object.matrixWorld.clone(); p.homeLevel = p.level; p.revision = 0;
      const bounds = physicalBounds(p.object, true), floor = LEVELS[p.level].floor, y = p.home.elements[13], lift = p.object.userData.floorRugLift ?? 0;
      p.floorRest = bounds.isEmpty() ? 0 : Math.abs(bounds.min.y - floor - lift) < REARRANGE.supportGap ? y - floor - lift : y - bounds.min.y;
    }
    try { localStorage.removeItem(UNLOCK); } catch {} // retire the old persistent unlock
    this.unlocked = false; this.enabled = false; this.saving = false;
    this.ray = new THREE.Raycaster(); this.ray.layers.enableAll();
    this.ghost = new THREE.Group(); this.ghost.visible = false; this.ghost.userData.ghost = true; scene.add(this.ghost);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.materialVersion = 0;
    this.state = { revision: 0, pieces: {} };
    this.apply(read(CACHE, this.state), { restore: true });
    this.initialRemote = true; // cache and the first accepted remote layout hydrate absolute saved Life poses
    this.ready = this.sync();
    this.timer = setInterval(() => this.sync(), REARRANGE.poll);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.sync(); });
    addEventListener('online', () => this.sync());
  }
  unlock(code) {
    if (!isPrivateCode(code.trim())) return false;
    this.unlocked = true; // local game mechanic only, ends with this page
    this.enable(true); return true;
  }
  enable(on) {
    if (on && (!this.unlocked || this.busy())) { this.say('Lägg ifrån dig det du håller och res dig först.'); return false; }
    if (this.saving) { if (!on) this.enabled = false; return !on; } // a confirmed write finishes even if the user exits
    this.cancel(); this.enabled = !!on; this.say(on ? 'Sikta på en möbel, tavla eller spegel och välj den.' : 'Ommöblering avslutad'); return true;
  }
  say(text) { this.message = text; this.status?.(text); }
  supports(piece) {
    if (piece.item.type === 'rug' || piece.picture) return [];
    return this.world.furniture.surfaces.filter((s) => within(s, piece.object) && shown(s.parent)).map((s) => new THREE.Box3().setFromObject(s));
  }
  onTop(o, surfaces) {
    if (!surfaces.length) return false;
    o.updateWorldMatrix(true, true);
    const b = physicalBounds(o), c = b.getCenter(new V()), origin = new V().setFromMatrixPosition(o.matrixWorld);
    const inside = (s, p) => p.x >= s.min.x && p.x <= s.max.x && p.z >= s.min.z && p.z <= s.max.z;
    // Tall/asymmetric plants can overhang: their base origin still rests on the support.
    return surfaces.some((s) => Math.abs(b.min.y - s.max.y) < REARRANGE.supportGap
      && (inside(s, c) || (Math.abs(origin.y - b.min.y) < REARRANGE.supportGap && inside(s, origin))));
  }
  closestSupport(object, surfaces) {
    const b = physicalBounds(object), center = b.getCenter(new V()), at = object.getWorldPosition(new V());
    const inside = (s, p) => p.x >= s.min.x && p.x <= s.max.x && p.z >= s.min.z && p.z <= s.max.z;
    return surfaces.filter(s => Math.abs(b.min.y - s.max.y) < REARRANGE.supportGap &&
      (inside(s, center) || (Math.abs(at.y - b.min.y) < REARRANGE.supportGap && inside(s, at))))
      .sort((a, b2) => Math.abs(b.min.y - a.max.y) - Math.abs(b.min.y - b2.max.y))[0];
  }
  groupFor(piece) {
    const group = [piece];
    for (let i = 0; i < group.length; i++) {
      const surfaces = this.supports(group[i]);
      for (const p of this.pieces) if (!group.includes(p) && p.level === piece.level && !p.picture && shown(p.object) && this.onTop(p.object, surfaces)) group.push(p);
    }
    return group;
  }
  looseOn(piece) {
    const surfaces = this.supports(piece);
    return this.carryables().filter((h) => h.model && !h.held && !h.broken && shown(h.model) && !within(h.model, piece.object)
      && (!h.item || h.item.place.at === 'world')
      && (this.onTop(h.model, surfaces) || (!h.placed && h.furnitureHome && within(h.furnitureHome, piece.object))));
  }
  begin(piece) {
    if (!this.enabled || this.saving || this.busy() || !piece || piece.materialOnly || !shown(piece.object)) return false;
    this.cancel(); this.scene.updateMatrixWorld(true);
    const group = this.groupFor(piece), original = piece.object.matrixWorld.clone();
    const loose = [...new Set(group.flatMap((p) => this.looseOn(p)))];
    this.selected = { piece, group, original, base: Object.fromEntries(group.map((p) => [p.id, p.revision])), loose };
    this.turn = 0; this.lift = 0; this.valid = false; this.ghost.clear();
    const inverse = original.clone().invert();
    for (const root of [...group.map((p) => p.object), ...loose.map((h) => h.model)]) {
      root.traverse((o) => {
        if (!o.isMesh || !shown(o) || !o.geometry || o.userData.surface !== undefined || o.userData.noGhost || o.material?.blending === THREE.AdditiveBlending) return;
        let m;
        if (o.isInstancedMesh) { m = new THREE.InstancedMesh(o.geometry, this.ghostMat, o.count); m.instanceMatrix = o.instanceMatrix; }
        else m = new THREE.Mesh(o.geometry, this.ghostMat);
        m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(inverse, o.matrixWorld); m.raycast = () => {}; this.ghost.add(m);
      });
    }
    this.selected.bounds = physicalBounds(piece.object);
    for (const p of group) { p.object.visible = false; if (p.item.type === 'rug') p.object.userData.rugPreviewSupport = true; }
    for (const h of loose) h.model.visible = false;
    this.ghost.visible = true;
    this.say('Sikta på en ny plats och placera föremålet.'); return true;
  }
  cancel() {
    if (this.saving) return;
    if (this.materialEdit) {
      const { piece, surface } = this.materialEdit;
      this.applyMaterialSurface(surface, this.state.materials?.[piece.id]?.[surface.id]?.choice ?? 'original');
      this.materialEdit = null;
    }
    if (this.selected) {
      for (const p of this.selected.group) { p.object.visible = true; delete p.object.userData.rugPreviewSupport; }
      for (const h of this.selected.loose) h.model.visible = true;
    }
    this.selected = null; this.ghost.visible = false; this.ghost.clear(); this.valid = false;
    if (this.pending) { const s = this.pending, restore = !!this.pendingRestore; this.pending = null; this.pendingRestore = false; this.apply(s, { restore }); }
  }
  rotate() { if (this.selected && !this.saving) this.turn += THREE.MathUtils.degToRad(LIFE.place.turn); }
  /** A pendant's height (#1106): one step up (+1) or down (−1) while it is being placed; the next update clamps it. */
  raise(dir) {
    if (!this.selected?.piece.pendant || this.saving) return false;
    this.lift += dir * LIGHTING.pendantMove.step; this.liftAsked = true; return true;
  }
  update() {
    this.camera.updateMatrixWorld(); this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); this.ray.far = REARRANGE.reach;
    if (this.materialEdit) { this.target = { kind: 'rearrange', name: this.materialEdit.piece.name, piece: this.materialEdit.piece, verb: 'material' }; return; }
    if (!this.selected) {
      const roots = this.materialPieces.filter((p) => p.level === this.player.level && shown(p.object));
      const hit = this.ray.intersectObjects(roots.map((p) => p.object), true).find((h) => shown(h.object));
      const piece = hit && roots.find((p) => within(hit.object, p.object));
      const wall = hit && this.marks.hit(this.ray.ray.origin, hit.point);
      const clear = !wall || wall.point.distanceTo(this.ray.ray.origin) >= hit.distance - 0.08;
      this.target = piece && clear ? { kind: 'rearrange', name: piece.name, verb: piece.materialOnly ? 'chooseMaterial' : 'flytta', piece } : null;
      return;
    }
    if (this.saving) { this.target = { kind: 'rearrange', blocked: true, blockedText: 'Sparar möbleringen…' }; return; }
    const { piece, original, bounds } = this.selected;
    const old = poseOf(original), q = new Q(...old.quat), pos = new V(); let valid = true, destination = piece.level;
    if (piece.place) { // a pendant (#1106): along the ceiling of its room, at the height asked for
      const r = piece.place({ ray: this.ray.ray, camera: this.camera, original, turn: this.turn, lift: this.lift, reach: REARRANGE.reach, grid: LIFE.place.floorGrid });
      valid = r.valid && this.player.level === piece.level;
      if (valid) {
        pos.copy(r.pos); q.copy(r.quat); this.lift = r.lift;
        if (this.liftAsked) { this.liftAsked = false; this.say(`Lampan hänger ${piece.pendant.bottomAt(pos.y).toFixed(2).replace('.', ',')} m över golvet.`); }
      }
    } else if (piece.picture) {
      const hit = this.marks.hit(this.ray.ray.origin, this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, REARRANGE.reach));
      valid = !!hit?.normal && Math.abs(hit.normal.y) < 0.1;
      if (valid) {
        pos.copy(hit.point).addScaledVector(hit.normal, 0.008);
        q.setFromUnitVectors(new V(0, 0, 1), hit.normal).multiply(new Q().setFromAxisAngle(new V(0, 0, 1), this.turn));
        destination = crossesLevels(piece) ? levelAt(pos.y) : piece.level;
        const level = LEVELS[destination];
        valid = !!level && destination === this.player.level && pos.y > level.floor + 0.2 && pos.y < level.floor + level.ceiling - 0.2;
      }
    } else {
      const floor = LEVELS[piece.level].floor;
      const plane = new THREE.Plane(new V(0, 1, 0), -floor);
      let at = this.ray.ray.intersectPlane(plane, new V()), height = floor;
      if (usesSupport(piece)) {
        const surfaces = this.world.cupSurfaces.filter(s => shown(s.parent) && !s.userData.soft
          && !this.selected.group.some(p => within(s, p.object))
          && s.userData.surface >= floor && s.userData.surface < floor + LEVELS[piece.level].ceiling);
        const hit = this.ray.intersectObjects(surfaces, false).find(h => h.face?.normal.y > 0.9);
        if (hit) { at = hit.point; height = hit.object.userData.surface; }
      }
      valid = !!at && at.distanceTo(this.camera.position) <= REARRANGE.reach && this.player.level === piece.level;
      if (valid) {
        const grid = LIFE.place.floorGrid;
        pos.set(Math.round(at.x / grid) * grid, height + old.pos[1] - bounds.min.y, Math.round(at.z / grid) * grid);
        q.premultiply(new Q().setFromAxisAngle(new V(0, 1, 0), this.turn));
        if (height === floor) {
          const matrix = new M().compose(pos, q, new V(1, 1, 1));
          pos.y = floor + piece.floorRest + (piece.item.type === 'rug' ? 0 : this.rugFor(piece, matrix));
        }
        valid = pos.x >= 0.2 && pos.x <= this.world.size.x - 0.2 && pos.z >= -2 && pos.z <= this.world.size.z + 5;
      }
    }
    if (valid) {
      this.candidate = new M().compose(pos, q, new V(1, 1, 1));
      if (!piece.picture && piece.item.type !== 'rug') {
        const walls = this.world.levels[piece.level].wallSegments;
        for (const r of piece.object.userData.footprint ?? []) {
          const poly = [[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]].map(([x,z]) => { const v = new V(x,0,z).applyMatrix4(this.candidate); return [v.x,v.z]; });
          if (walls.some((wall) => inPoly(poly, wall[0], wall[1]) || poly.some((p,i) => crosses(...p, ...poly[(i+1)%4], wall)))) valid = false;
        }
      }
      worldPose(this.ghost, this.candidate);
      if (piece.item.type === 'besta' || piece.item.type === 'stringshelf' || crossesLevels(piece)) {
        const box = new THREE.Box3().setFromObject(this.ghost), level = LEVELS[destination];
        valid = box.min.y >= level.floor + .02 && box.max.y <= level.floor + level.ceiling - .02;
      }
    }
    this.valid = valid; this.ghost.visible = valid;
    this.target = { kind: 'rearrange', name: piece.name, verb: 'placera', blocked: !valid, blockedText: piece.place ? 'Sikta på taket i lampans rum' : piece.picture ? 'Sikta på en vägg' : usesSupport(piece) ? 'Sikta på en avställningsyta eller golvet' : 'Sikta på golvet inom räckhåll' };
  }
  async act(target = this.target) {
    if (!target || target.blocked || this.saving) return false;
    if (this.materialEdit) return this.confirmMaterial();
    if (!this.selected) return target.piece?.materialOnly ? this.beginMaterial(target.piece) : this.begin(target.piece);
    return this.confirm();
  }
  async restoreOriginal(piece = this.selected?.piece ?? this.target?.piece) {
    if (!piece || piece.materialOnly || this.saving) return false;
    if (this.selected?.piece !== piece && !this.begin(piece)) return false;
    this.candidate = piece.home.clone(); this.valid = true;
    return this.confirm(); // same attachments, atomic write and conflict handling as a normal move
  }
  async write(moves, extra = {}) {
    if (this.url) {
      const r = await fetch(this.url + '/furniture', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: layoutWriteCredential(), moves, ...extra }) });
      const body = await r.json();
      if (r.status === 409 && body.state) { this.pending = body.state; throw Error('Någon annan ändrade möbleringen. Försök igen.'); }
      if (!r.ok) throw Error('Kunde inte spara. Försök igen när anslutningen fungerar.');
      return body;
    }
    const next = structuredClone(this.state); next.revision++;
    for (const p of moves) next.pieces[p.id] = { pos: p.pos, quat: p.quat, revision: next.revision };
    return next;
  }
  beginMaterial(piece, surfaceId) {
    if (!this.enabled || this.saving || this.busy() || !piece?.object.userData.materialSurfaces?.length) return false;
    const surfaces = piece.object.userData.materialSurfaces;
    const surface = surfaceId === undefined ? surfaces[0] : surfaces.find(s => s.id === surfaceId);
    if (!surface) return false;
    this.cancel();
    const accepted = this.state.materials?.[piece.id]?.[surface.id];
    this.materialEdit = { piece, surface, base: accepted?.revision ?? 0, choice: accepted?.choice ?? 'original' };
    return true;
  }
  previewMaterial(choice) {
    const edit = this.materialEdit;
    if (!edit || this.saving || !validMaterialChoice(edit.piece.id, edit.surface.id, choice)) return false;
    this.applyMaterialSurface(edit.surface, choice); edit.choice = choice; return true;
  }
  applyMaterialSurface(surface, choice) {
    const support = surface.affectsSupport ? this.snapshotRugSupport() : null;
    surface.apply(choice);
    const changes = this.reconcileRugSupport(support);
    if (changes.length) { if (this.overlay) this.overlay.recompute(); else this.refresh(); this.changed?.(changes); }
  }
  async confirmMaterial() {
    const edit = this.materialEdit;
    if (!edit || this.saving) return false;
    if (!this.url || this.materialVersion !== MATERIAL_VERSION) { this.say('Materialbiblioteket kan inte sparas nu. Kontrollera anslutningen och försök igen.'); return false; }
    this.saving = true;
    try {
      const next = await this.write([], { materials: [{ id: edit.piece.id, surface: edit.surface.id, choice: edit.choice, base: edit.base }] });
      if (next.materialVersion !== MATERIAL_VERSION) throw Error('Servern stöder inte materialval ännu. Försök igen senare.');
      this.saving = false; this.cancel(); this.pending = null; this.apply(next); this.say('Materialet är sparat och delas med alla.'); return true;
    } catch (e) { this.saving = false; this.cancel(); this.say(e.message); await this.sync(); return false; }
  }
  async restoreAll(expectedRevision = this.state.revision) {
    if (!this.enabled || this.saving || this.busy()) return false;
    this.cancel();
    if (this.state.revision !== expectedRevision) { this.say('Möbleringen ändrades medan frågan var öppen. Öppna återställningen igen.'); return false; }
    const moves = this.pieces.map(p => ({ id: p.id, base: p.revision, ...poseOf(p.home) }));
    this.saving = true;
    try {
      const next = await this.write(moves, { resetAll: true, expectedRevision });
      this.saving = false; this.pending = null; this.apply(next);
      this.say(this.url ? 'All möblering är återställd för alla besökare.' : 'All möblering är återställd lokalt.'); return true;
    } catch (e) {
      this.saving = false; this.cancel(); this.say(e.message); await this.sync(); return false;
    }
  }
  async confirm() {
    if (!this.selected || !this.valid || this.saving) return false;
    const selection = this.selected, delta = this.candidate.clone().multiply(selection.original.clone().invert());
    const moves = selection.group.map((p) => ({ id: p.id, base: selection.base[p.id], ...poseOf(delta.clone().multiply(p.object.matrixWorld)) }));
    this.saving = true;
    try {
      const next = await this.write(moves);
      this.saving = false; this.pending = null; this.cancel(); this.apply(next); this.say(this.url ? 'Möbleringen är sparad och delas med alla.' : 'Möbleringen är sparad lokalt.'); return true;
    } catch (e) {
      this.saving = false; this.cancel(); this.say(e.message || 'Kunde inte spara flytten.'); await this.sync(); return false;
    }
  }
  carry(h, delta) {
    if (this.restoringWorldItems && h.lifeItem) return; // already-restored world coordinates are not a new furniture move
    this.marks.invalidate(h.model);
    const before = h.model.matrixWorld.clone(), after = delta.clone().multiply(before), pose = poseOf(after);
    if (h.item) {
      const yaw = new THREE.Euler().setFromQuaternion(new Q(...pose.quat), 'YXZ').y;
      this.life.items.move(h.item, { ...h.item.place, pos: pose.pos, yaw });
    } else {
      worldPose(h.model, after);
      for (const key of ['lastAt', 'placedAt']) if (h[key]?.isVector3) h[key].applyMatrix4(delta);
      if (!h.placed && !h.homeParent && h.home?.pos) {
        h.home.pos.applyMatrix4(delta);
        const dq = new Q().setFromRotationMatrix(delta); h.home.rot?.setFromQuaternion(dq.multiply(new Q().setFromEuler(h.home.rot)));
        if (h.holder) worldPose(h.holder, delta.clone().multiply(h.holder.matrixWorld));
      }
    }
  }
  rugFor(piece, matrix = piece.object.matrixWorld) {
    const points = [];
    for (const r of piece.object.userData.footprint ?? []) for (const [x, z] of [[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]]) {
      const p = new V(x, 0, z).applyMatrix4(matrix); points.push([p.x, p.z]);
    }
    if (!points.length) points.push([matrix.elements[12], matrix.elements[14]]);
    return rugSupport(piece.level, points); // the original 2cm headboard/wall slack is preserved
  }
  // Used for actual rug moves; a height-changing material can use the same before/after boundary.
  snapshotRugSupport() {
    this.scene.updateMatrixWorld(true);
    const pieces = new Map(), supported = new Set();
    for (const p of this.pieces) {
      if (p.picture || p.item.type === 'rug' || !shown(p.object)) continue;
      const lift = this.rugFor(p), floor = LEVELS[p.level].floor;
      if (Math.abs(p.object.matrixWorld.elements[13] - floor - p.floorRest - lift) < REARRANGE.supportGap) pieces.set(p, lift);
      for (const h of this.looseOn(p)) supported.add(h);
    }
    const loose = [];
    for (const h of this.carryables()) {
      if (!h.model || h.held || h.broken || !shown(h.model) || supported.has(h) || (h.item && h.item.place.at !== 'world')) continue;
      const b = physicalBounds(h.model), at = h.model.getWorldPosition(new V());
      const level = LEVELS.findIndex((l,i) => Math.abs(b.min.y-l.floor-rugLift(i,at.x,at.z)) < REARRANGE.supportGap);
      if (level < 0) continue;
      const lift = rugLift(level, at.x, at.z);
      loose.push({ h, level, lift, rest: at.y - b.min.y, gap: h.placed || h.item ? 0.001 : Math.max(0, b.min.y - LEVELS[level].floor - lift) });
    }
    return { pieces, loose };
  }
  placePiece(p, matrix) {
    const delta = matrix.clone().multiply(p.object.matrixWorld.clone().invert());
    const rest = p.object.userData.interact;
    for (const spot of rest?.spots ?? []) { spot.pos.applyMatrix4(delta); spot.aimPos?.applyMatrix4(delta); spot.yaw += new THREE.Euler().setFromRotationMatrix(delta, 'YXZ').y; }
    this.marks.invalidate(p.object);
    for (const spec of this.world.lamps) if (within(spec.object, p.object)) {
      for (const lamp of spec.lamp?.room.lamps ?? []) { lamp.pos.applyMatrix4(delta); delete lamp.roomName; }
    }
    worldPose(p.object, matrix);
    p.placed?.(); // a pendant's cords and light (#1106)
    return { p, matrix, delta };
  }
  reconcileRugSupport(snapshot, moved = new Set()) {
    if (!snapshot) return [];
    const changes = [], handled = new Set(), carried = new Set();
    for (const p of moved) if (!p.picture && p.item.type !== 'rug' && !snapshot.pieces.has(p)) snapshot.pieces.set(p, 0);
    const candidates = [...snapshot.pieces].sort(([a], [b]) => a.object.matrixWorld.elements[13] - b.object.matrixWorld.elements[13]);
    for (const [p, oldLift] of candidates) {
      if (handled.has(p) || !shown(p.object)) continue;
      const lift = this.rugFor(p), y = p.object.matrixWorld.elements[13], floor = LEVELS[p.level].floor;
      if (Math.abs(y - floor - p.floorRest - lift) > REARRANGE.supportGap + Math.max(lift, oldLift)) continue; // now on a table, not the floor
      if (!moved.has(p) && Math.abs(lift - oldLift) < 1e-7) continue;
      const dy = floor + p.floorRest + lift - y;
      if (Math.abs(dy) < 1e-7) continue;
      const group = this.groupFor(p).filter(piece => piece.item.type !== 'rug' && !piece.picture), delta = new M().makeTranslation(0, dy, 0);
      const loose = [...new Set(group.flatMap(piece => this.looseOn(piece)))];
      const surfaces = [];
      for (const piece of group) {
        let matrix = delta.clone().multiply(piece.object.matrixWorld);
        if (piece !== p) {
          const support = this.closestSupport(piece.object, surfaces);
          if (support) { matrix = piece.object.matrixWorld.clone(); matrix.elements[13] = support.max.y + piece.floorRest; }
        }
        changes.push(this.placePiece(piece, matrix)); handled.add(piece);
        surfaces.push(...this.supports(piece));
      }
      for (const h of loose) if (!carried.has(h)) {
        const support = this.closestSupport(h.model, surfaces);
        if (support) {
          const b = physicalBounds(h.model), gap = h.placed || h.item ? 0.001 : Math.max(0, b.min.y - support.max.y - dy);
          this.carry(h, new M().makeTranslation(0, support.max.y + gap - b.min.y, 0));
        } else this.carry(h, delta);
        carried.add(h);
      }
    }
    for (const { h, level, lift: oldLift, rest, gap } of snapshot.loose) {
      if (carried.has(h) || h.held || !shown(h.model)) continue;
      const at = h.model.getWorldPosition(new V()), lift = rugLift(level, at.x, at.z);
      if (Math.abs(lift - oldLift) < 1e-7) continue;
      const dy = LEVELS[level].floor + lift + rest + gap - at.y;
      if (Math.abs(dy) > 1e-7) this.carry(h, new M().makeTranslation(0, dy, 0));
    }
    return changes;
  }
  apply(state, { restore = false } = {}) {
    state = migrateVeronaLayout(migratePosterLayout(state));
    if (!state || !Number.isInteger(state.revision) || !state.pieces || typeof state.pieces !== 'object') return;
    if (state.revision < this.state.revision) return;
    if (this.selected || this.materialEdit || this.saving) { this.pending = state; this.pendingRestore = restore || this.pendingRestore; return; }
    const previousRestore = this.restoringWorldItems;
    this.restoringWorldItems = restore;
    try {
    this.scene.updateMatrixWorld(true);
    // a piece whose default spot moved gets a new id (furniture.js: from its x/z): an entry under its old id carries over
    // when it was confirmed somewhere else, and is dropped when it still holds the old default (a full reset writes every
    // home pose) so the new default applies
    // `olds` = every earlier default [x, z] of the piece (#1298: the String shelf had two); stale entries under any old id go, the first one
    // confirmed away from all the old defaults carries over to the current id
    const carryOld = (type, ...olds) => {
      const piece = this.pieces.find((p) => p.item.type === type);
      if (!piece || state.pieces[piece.id]) return;
      const oldIds = Object.keys(state.pieces).filter((k) => k.startsWith(`f-${type}-`));
      let carry = null;
      for (const oldId of oldIds) {
        const entry = state.pieces[oldId];
        delete state.pieces[oldId];
        const moved = olds.every(([x, z]) => Math.hypot(entry.pos?.[0] - x, entry.pos?.[2] - z) > 0.05);
        if (moved && !carry) carry = entry;
      }
      if (carry) state.pieces[piece.id] = carry;
    };
    carryOld('stringshelf', [2.152, 4.55], [2.152, 4.16]); // #1298: from under the clock (#1272, #1291) to the old kitchen shelf's wall
    carryOld('xmastree', [1.08, 11.5]); // #591: from the palm corner (#571) to the armchair corner
    // #571: what the Christmas tree hides is shown again while poses change (a hidden piece moved elsewhere takes the
    // things on it along); the layer re-judges the overlap afterwards
    const fresh = (p) => Number.isInteger(state.pieces[p.id]?.revision) && state.pieces[p.id].revision > p.revision;
    const revealed = !!this.overlay && this.pieces.some(fresh) && this.overlay.reveal();
    const materialChanged = this.pieces.some(p => (p.object.userData.materialSurfaces ?? []).some(s => s.choice !== (state.materials?.[p.id]?.[s.id]?.choice ?? 'original')));
    const support = this.pieces.some(fresh) || materialChanged ? this.snapshotRugSupport() : null;
    const changes = [];
    for (const p of this.pieces) {
      const next = state.pieces[p.id];
      if (!next || !Number.isInteger(next.revision) || next.revision <= p.revision || !Array.isArray(next.pos) || next.pos.length !== 3 || !next.pos.every(Number.isFinite) || !Array.isArray(next.quat) || next.quat.length !== 4 || !next.quat.every(Number.isFinite)) continue;
      const matrix = matrixOf(next), delta = matrix.clone().multiply(p.object.matrixWorld.clone().invert());
      changes.push({ p, next, matrix, delta, loose: this.looseOn(p) });
    }
    const carried = new Set();
    for (const { p, next, matrix, delta, loose } of changes) {
      for (const h of loose) if (!carried.has(h)) { this.carry(h, delta); carried.add(h); }
      this.placePiece(p, matrix); p.revision = next.revision;
      if (crossesLevels(p)) {
        const level = levelAt(next.pos[1]);
        if (level >= 0) { p.level = level; p.object.userData.level = level; }
      }
      if (p.item.type === 'rug') { p.item.x = next.pos[0]; p.item.z = next.pos[2]; p.item.rot = THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(new Q(...next.quat), 'YXZ').y) - 180; }
    }
    // Older clients placed the TV partly inside the bench. All clients repair that old pose
    // on load; the next confirmed move writes the corrected pose through the usual revision check.
    for (const p of this.pieces.filter(p => p.item.type === 'tv' && p.item.mount !== 'wall')) {
      const b = physicalBounds(p.object), at = new V().setFromMatrixPosition(p.object.matrixWorld);
      for (const bench of this.pieces.filter(b => b.item.type === 'byas' && b.level === p.level)) {
        const bottom = new V().setFromMatrixPosition(bench.object.matrixWorld).y;
        const top = this.supports(bench).find(s => at.x >= s.min.x && at.x <= s.max.x && at.z >= s.min.z && at.z <= s.max.z);
        if (top && b.min.y >= bottom - .01 && b.min.y < top.max.y - .001) {
          const matrix = p.object.matrixWorld.clone(); matrix.elements[13] += top.max.y - b.min.y;
          worldPose(p.object, matrix); this.marks.invalidate(p.object); break;
        }
      }
    }
    for (const p of this.materialPieces) for (const surface of p.object.userData.materialSurfaces ?? []) {
      surface.apply(state.materials?.[p.id]?.[surface.id]?.choice ?? 'original');
    }
    changes.push(...this.reconcileRugSupport(support, new Set(changes.map(c => c.p))));
    this.state = state;
    try { localStorage.setItem(CACHE, JSON.stringify(state)); } catch {}
    if (this.overlay && (revealed || changes.length)) this.overlay.recompute(); // (+ refresh)
    else if (changes.length) this.refresh();
    if (changes.length) this.changed?.(changes);
    this.initialRemote = false; // only an actually applied valid revision completes initial remote hydration
    } finally { this.restoringWorldItems = previousRestore; }
  }
  refresh() {
    const f = this.world.furniture;
    for (const a of [...f.segments, ...f.footprints]) a.length = 0;
    f.object.updateMatrixWorld(true);
    for (const obj of f.object.children) {
      const piece = this.pieces.find((p) => p.object === obj); if (!piece || obj.userData.seasonHidden) continue; // (#571: the tree out of season, what it hides)
      for (const r of obj.userData.footprint ?? []) {
        const pts = [[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]].map(([x,z]) => { const v = obj.localToWorld(new V(x,0,z)); return [v.x,v.z]; });
        const top = r.solid ? undefined : obj.userData.standTop; // a low seat you can jump up on (#693): its world top y
        if (top !== undefined) pts.top = obj.localToWorld(new V(0, top, 0)).y;
        f.footprints[piece.level].push(pts);
        for (let i=0;i<4;i++) f.segments[piece.level].push(top !== undefined ? [...pts[i],...pts[(i+1)%4],pts.top] : [...pts[i],...pts[(i+1)%4]]);
      }
    }
    for (const surface of f.surfaces) surface.userData.surface = new THREE.Box3().setFromObject(surface).max.y;
    this.world.refreshFurniture();
  }
  async sync() {
    if (!this.url || this.pulling || this.saving) return;
    this.pulling = true;
    try { const r = await fetch(this.url + '/furniture', { cache: 'no-store' }); if (r.ok) { const state = await r.json(); this.materialVersion = state.materialVersion ?? 0; this.apply(state, { restore: !!this.initialRemote }); } }
    catch { /* keep cached arrangement; a confirmed move still needs server acceptance */ }
    finally { this.pulling = false; }
  }
}
