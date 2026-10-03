import * as THREE from 'three';
import { BREAK as B, DRINKS, LEVELS } from './config.js';
import { sfx } from './audio.js';

// Shooting things to pieces (#263). The glass and china Holdables — wine/champagne/whisky bottles and glasses
// (things.js), the coffee cups and the jug (cups.js), the big beer (beer.js) — are registered here with a kind
// (BREAK.kinds). Marks.hit (marks.js) asks `itemOf` / `can` when a weapon's segment passes one before any other
// surface (the AK-47's bullet, a Nerf dart, the lightsaber's blade, a wand's magic) and calls `smash`: the thing
// goes (item.shatter()), a burst of shards flies out, bounces once on what lies under it, lies a while and
// shrinks away; what it held splashes on the surface (a 'splash' mark), a glass crash plays, a cat nearby meows.
// It comes back home after BREAK.back s (item.mend()), or at once with F (reset). Shards: two pooled instanced
// meshes (see-through glass, china), drawn only while any are out. Points: `onBreak(item, kind, distance, weapon)`.

const tmpBox = new THREE.Box3(), segBox = new THREE.Box3(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), col = new THREE.Color();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** Is `o` drawn and in `root` (every parent visible)? Detached things (a spare cup) are not. */
const inScene = (o, root) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) return true; } return false; };

class Shards {
  constructor(scene, glass) {
    const mat = glass
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1).scale(1, 0.22, 0.7), mat, B.max);
    for (let i = 0; i < B.max; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, col.set(0xffffff)); }
    Object.assign(this.mesh, { frustumCulled: false, visible: false, raycast: () => {} });
    scene.add(this.mesh);
    this.p = [...Array(B.max)].map(() => ({ live: false, pos: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), size: 0, ground: 0, bounced: false, down: false, age: 0 }));
    this.next = 0;
  }

  get live() { return this.p.filter((s) => s.live).length; }

  spawn(pos, v, size, color, ground) {
    const i = this.next++ % this.p.length, s = this.p[i];
    Object.assign(s, { live: true, size, ground, bounced: false, down: false, age: 0 });
    s.pos.copy(pos); s.v.copy(v);
    s.q.setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
    s.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    this.mesh.setColorAt(i, col.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }

  clear() { for (const s of this.p) s.live = false; this.update(0); }

  update(dt) {
    if (!this.mesh.visible) return;
    let any = false;
    const e = new THREE.Euler(), dq = new THREE.Quaternion();
    this.p.forEach((s, i) => {
      if (!s.live) { this.mesh.setMatrixAt(i, zero); return; }
      s.age += dt;
      const left = B.lie + B.fade - s.age;
      if (left <= 0) { s.live = false; this.mesh.setMatrixAt(i, zero); return; }
      any = true;
      if (!s.down) {
        s.v.y -= 9.8 * dt;
        s.pos.addScaledVector(s.v, dt);
        s.q.multiply(dq.setFromEuler(e.set(s.spin.x * dt, s.spin.y * dt, s.spin.z * dt)));
        const rest = s.ground + s.size * 0.22;
        if (s.pos.y <= rest) {
          s.pos.y = rest;
          if (!s.bounced && s.v.y < -0.8) { s.bounced = true; s.v.y *= -0.25; s.v.x *= 0.35; s.v.z *= 0.35; s.spin.multiplyScalar(0.3); }
          else { s.down = true; s.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.3); } // lying flat
        }
      }
      const k = Math.min(1, left / B.fade);
      this.mesh.setMatrixAt(i, m4.compose(s.pos, s.q, sc.setScalar(s.size * k)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = any;
  }
}

export class Breaker {
  /** `marks`: the Marks (rays down for where shards land, the splash); `cat` (optional) meows when near. */
  constructor(scene, marks, cat = null) {
    Object.assign(this, { scene, marks, cat, items: [], byModel: new Map(), pending: [], broken: 0 });
    this.glass = new Shards(scene, true);
    this.china = new Shards(scene, false);
  }

  /** Make `item` breakable as `kind` (a key of BREAK.kinds). */
  add(item, kind) {
    if (!B.kinds[kind]) return;
    item.breakKind = kind;
    this.items.push(item);
    this.byModel.set(item.model, item);
  }

  /** The registered thing `o` (a mesh) belongs to, or null. */
  itemOf(o) {
    for (let p = o; p; p = p.parent) { const it = this.byModel.get(p); if (it) return it; }
    return null;
  }

  /** Is it standing somewhere in the scene (not in the hand, not broken, not a spare cup)? */
  standing(item) {
    return !item.held && !item.broken && item.state !== 'spare' && item.state !== 'held' && inScene(item.model, this.scene);
  }

  /** Can `weapon` ('rifle', 'dart', 'saber', 'wand') break it now? Darts only break light things. */
  can(item, weapon) {
    const spec = B.kinds[item.breakKind];
    return !!spec && (weapon !== 'dart' || !!spec.light) && this.standing(item);
  }

  /** The meshes of standing breakables whose box meets the segment from → to (Marks.hit adds them to its list). */
  meshesNear(from, to) {
    segBox.setFromPoints([from, to]).expandByScalar(0.02);
    const out = [];
    for (const it of this.items) {
      if (!this.standing(it) || !tmpBox.setFromObject(it.model).intersectsBox(segBox)) continue;
      it.model.traverse((m) => { if (m.isMesh && m.geometry.attributes.position) out.push(m); }); // (an empty glass's liquid has no shape yet)
    }
    return out;
  }

  /** Range points for a break from `d` m with `weapon` (SCORE.each.shatterRange per point). */
  static points(d, weapon) {
    if (weapon === 'saber') return B.saberBonus;
    const r = B.range, f = B.weapons[weapon] ?? 1;
    return Math.min(r.cap, Math.floor(r.k * Math.max(0, d - r.from) ** r.pow * f));
  }

  /** The colour of what it held, or null (empty). */
  spill(item) {
    if (item.contents) return item.contents.total > 0.01 ? item.contents.color(new THREE.Color()) : null;
    if (item.breakKind === 'beer') return item.level > 0.01 ? new THREE.Color(0xd99a1e) : null;
    if (item.breakKind === 'jug') return item.fill > 0.05 ? new THREE.Color(DRINKS.coffee.color) : null;
    return DRINKS[item.breakKind] ? new THREE.Color(DRINKS[item.breakKind].color) : null; // bottles never run dry
  }

  /** The height of the first surface under (x, z) below y (shards land there), or the level's floor. */
  groundAt(x, y, z) {
    const from = new THREE.Vector3(x, y, z), to = new THREE.Vector3(x, y - 4, z);
    for (const h of this.marks.segment(from, to, this.marks.meshes())) {
      const o = h.object, m = Array.isArray(o.material) ? o.material[h.materialIndex ?? 0] : o.material;
      if (!m || m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending || !inScene(o, this.scene) || this.itemOf(o)) continue;
      return h.point.y;
    }
    return y > LEVELS[1].floor + 0.3 ? LEVELS[1].floor : LEVELS[0].floor;
  }

  /** Break `item`, hit at `point` by `weapon` used from `eye`. */
  smash(item, point, eye, weapon) {
    const spec = B.kinds[item.breakKind];
    item.model.updateMatrixWorld(true);
    const box = tmpBox.setFromObject(item.model), mid = box.getCenter(new THREE.Vector3()), base = box.min.y, top = box.max.y;
    const spill = this.spill(item);
    item.shatter();
    this.broken++;
    if (item.breakKind !== 'cup') this.pending.push({ item, t: B.back });
    const d = eye.distanceTo(point);
    // the shards: away from the shooter, up and out
    const away = new THREE.Vector3().subVectors(point, eye).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
    away.normalize().multiplyScalar(weapon === 'saber' ? 0.4 : 1.1);
    const pool = spec.glass ? this.glass : this.china, ground = this.groundAt(mid.x, mid.y, mid.z);
    for (let i = 0; i < spec.shards; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.1;
      const v = new THREE.Vector3(Math.cos(a) * r, 0.8 + Math.random() * 1.8, Math.sin(a) * r).add(away);
      const at = new THREE.Vector3(mid.x + (Math.random() - 0.5) * 0.04, base + Math.random() * (top - base), mid.z + (Math.random() - 0.5) * 0.04);
      const t = 0.45, lx = at.x + v.x * t, lz = at.z + v.z * t; // about where it comes down
      const g = Math.abs(lx - mid.x) < 0.05 && Math.abs(lz - mid.z) < 0.05 ? ground : this.groundAt(lx, top + 0.05, lz);
      pool.spawn(at, v, spec.size * (0.5 + Math.random()), spec.color, g);
    }
    // what it held: a splash on the surface it stood on
    if (spill) {
      const h = this.marks.hit(new THREE.Vector3(mid.x, base + 0.05, mid.z), new THREE.Vector3(mid.x, base - 0.3, mid.z));
      if (h && !h.cat && !h.broke) this.marks.add('splash', h, { color: spill.getHex(), size: spec.splash, force: true });
    }
    sfx.shatter(mid, spec.glass);
    const cat = this.cat;
    if (cat?.visible && cat.object.position.distanceTo(mid) < B.catNear) cat.meowNow?.();
    this.onBreak?.(item, item.breakKind, d, weapon);
  }

  /** Every broken thing whole and home again, no shards (F). */
  reset() {
    for (const p of this.pending) p.item.mend();
    this.pending = [];
    this.glass.clear(); this.china.clear();
  }

  update(dt) {
    for (const p of [...this.pending]) {
      if ((p.t -= dt) > 0) continue;
      this.pending.splice(this.pending.indexOf(p), 1);
      p.item.mend();
    }
    this.glass.update(dt);
    this.china.update(dt);
  }
}
