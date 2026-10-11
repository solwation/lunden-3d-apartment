import * as THREE from 'three';
import { COMBAT as C } from './config.js';

// Combat between players (#667) on top of the ghosts (#666, src/ghosts.js; the room's check: cloudflare/players.js).
// Only between two players who both hold a weapon (COMBAT.weapons; main.js `weaponKey`): they are drawn solid for each
// other, everybody else stays a ghost and cannot be hit. Using a weapon (main.js wraps each weapon's use) asks `fire(key)`:
// the shooter's client looks for an armed player along the view within the weapon's range (the room's numbers, sent in its
// welcome), not behind a wall, and sends ONE small message for that hit; the room checks it and tells both. Hit: points
// (stats `pvpHits`, SCORE.each), a splat and a badge. Hurt: a deduction (SCORE.penalties.pvpHurt), a red flash, "aj", one
// life off; out of lives → back to the start the same way as the menu's "Gå till startplatsen" (main.js goToStart, #665:
// only the place changes) with all lives again. The hearts show in the HUD only while a fight is on (we and someone near
// both armed).

const ray = new THREE.Raycaster(), v = new THREE.Vector3(), dir = new THREE.Vector3(), eye = new THREE.Vector3(), q = new THREE.Vector3();

/** The shortest distance between the ray (o, d, length ≤ len) and the segment a–b; returns [distance, along the ray]. */
export function rayToSegment(o, d, len, a, b) {
  const u = d, w = new THREE.Vector3().subVectors(b, a), r = new THREE.Vector3().subVectors(o, a);
  const A = u.dot(u), B = u.dot(w), Cc = w.dot(w), D = u.dot(r), E = w.dot(r), den = A * Cc - B * B;
  let s = den > 1e-9 ? (B * E - Cc * D) / den : 0, t = den > 1e-9 ? (A * E - B * D) / den : E / Cc;
  s = THREE.MathUtils.clamp(s, 0, len);
  t = THREE.MathUtils.clamp((B * s + E) / Cc, 0, 1);
  s = THREE.MathUtils.clamp((B * t - D) / A, 0, len);
  const p1 = o.clone().addScaledVector(u, s), p2 = a.clone().addScaledVector(w, t);
  return [p1.distanceTo(p2), s];
}

export class Combat {
  /** ghosts (Ghosts), camera, scene, weapon(): key or '', feet(): our feet (Vector3), jetpack, onDie(): back to the start; score / hurt / sfx hooks. */
  constructor({ ghosts, camera, scene, weapon, feet, jetpack = null, darts = null, sparkles = null, arrows = null, onDie = () => {}, onHit = () => {}, onHurt = () => {}, sfx = null }) {
    Object.assign(this, { ghosts, camera, scene, weapon, feet, jetpack, darts, sparkles, arrows, onDie, onHitCb: onHit, onHurtCb: onHurt, sfx, lives: C.lives, jetT: 0, flashT: 0,
      hits: 0, hurts: 0, deaths: 0, fired: 0, seen: 0, lastShot: null, lastSeen: null });
    ghosts.onShot = (m, g) => this.remote(m, g);
    // the others' shots (#667): one LineSegments for every streak (rifle, wand, web, jetpack flames; vertex colours, one
    // draw call) and a few balls; their darts are the blasters' own pool (toys.js Darts, `remote`: drawn only)
    const n = C.lines;
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.lineMesh = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.lineMesh.frustumCulled = false;
    this.lineMesh.raycast = () => {};
    this.lineMesh.userData.moving = true;
    this.lines = [...Array(n)].map(() => ({ life: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), col: new THREE.Color() }));
    this.nextLine = 0;
    const ballGeo = new THREE.SphereGeometry(0.115, 12, 8), ballMat = new THREE.MeshLambertMaterial({ color: 0xd8641e });
    this.balls = [...Array(C.balls)].map(() => { const m = new THREE.Mesh(ballGeo, ballMat); m.visible = false; m.userData.moving = true; m.raycast = () => {}; scene.add(m); return { m, v: new THREE.Vector3(), life: 0, flying: false }; });
    this.nextBall = 0;
    scene.add(this.lineMesh);
    ghosts.onHit = (m, g) => this.hit(m, g);
    ghosts.onHurt = (m, g) => this.hurt(m, g);
    ghosts.onWelcome = () => this.reset();
    this.el = document.createElement('div');
    this.el.id = 'lives';
    this.el.hidden = true;
    Object.assign(this.el.style, { position: 'fixed', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
      font: '600 15px system-ui, -apple-system, "Segoe UI", sans-serif', color: '#fff', background: 'rgba(18, 22, 30, 0.6)', padding: '3px 10px', borderRadius: '12px' });
    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 19, opacity: 0,
      background: 'radial-gradient(ellipse at center, rgba(200,0,0,0) 45%, rgba(200,0,0,0.55) 100%)' });
    document.body.append(this.el, this.flashEl);
  }

  get rules() { return this.ghosts.rules ?? { lives: C.lives, weapons: {} }; }
  get maxLives() { return this.rules.lives ?? C.lives; }

  /** The armed players we can see (a fight is possible with them). */
  foes() { return [...this.ghosts.others.values()].filter((g) => g.h && g.root.visible && g.snaps.length); }

  /** A fight is on: we are connected and armed, and someone in sight is too. */
  get active() { return this.ghosts.connected && !!this.weapon() && this.foes().length > 0; }

  /** Is the line from `a` to `b` clear of the world (walls, furniture)? Ghosts, see-through and moving things do not count. */
  clear(a, b) {
    dir.subVectors(b, a);
    const len = dir.length();
    ray.set(a, dir.normalize());
    ray.far = Math.max(0, len - 0.3);
    ray.layers.mask = this.camera.layers.mask;
    ray.camera = this.camera; // (sprites need it)
    for (const h of ray.intersectObjects(this.scene.children, true)) {
      const o = h.object;
      if (!o.isMesh || o.material?.transparent || o.material?.visible === false) continue;
      let skip = false;
      for (let p = o; p; p = p.parent) if (!p.visible || p === this.ghosts.group || p === this.camera || p.userData.moving) { skip = true; break; } // (darts, the ball, the cat in flight)
      if (!skip) return false;
    }
    return true;
  }

  /** Whom an arrow from `o` with velocity `v` hits on its arc (#690): the first armed player whose body the path passes
   * within `hitRadius` of, before it meets the world; or null. */
  aimArc(o, v, range) {
    const p = o.clone(), vel = v.clone(), step = 0.02, g = 9.81, foes = this.foes();
    let travelled = 0;
    for (let i = 0; i < 400 && travelled < range; i++) {
      const q = p.clone().addScaledVector(vel, step);
      vel.y -= g * step;
      for (const f of foes) {
        const a = f.feet.clone().setY(f.feet.y + C.body[0]), b = f.feet.clone().setY(f.feet.y + C.body[1]);
        const dq = q.clone().sub(p), len = dq.length();
        if (len > 0 && rayToSegment(p, dq.normalize(), len, a, b)[0] <= C.hitRadius) return f;
      }
      if (!this.clear(p, q.clone().addScaledVector(v.clone().normalize(), 0.3))) return null; // (clear stops 0.3 m short)
      travelled += p.distanceTo(q);
      p.copy(q);
    }
    return null;
  }

  /** Whom `key` hits now: the nearest armed player along the view (the saber: in front within reach; the bow: on the
   * arrow's arc, `shot`), or null. */
  aim(key, shot = null) {
    const W = this.rules.weapons?.[key];
    if (!W) return null;
    if (key === 'bow' && shot?.s) return this.aimArc(shot.o, shot.d.clone().multiplyScalar(shot.s), W.range);
    this.camera.getWorldPosition(eye);
    this.camera.getWorldDirection(dir);
    const d = dir.clone();
    let best = null;
    for (const g of this.foes()) {
      const a = g.feet.clone().setY(g.feet.y + C.body[0]), b = g.feet.clone().setY(g.feet.y + C.body[1]);
      let along;
      if (key === 'saber') {
        q.set(g.feet.x, THREE.MathUtils.clamp(eye.y, a.y, b.y), g.feet.z);
        along = eye.distanceTo(q);
        if (along > W.range || v.subVectors(q, eye).normalize().dot(d) < C.saberCone) continue;
      } else {
        const [dist, s] = rayToSegment(eye, d, W.range, a, b);
        if (dist > C.hitRadius) continue;
        along = s;
      }
      const at = key === 'saber' ? q.clone() : eye.clone().addScaledVector(d, along);
      if ((!best || along < best.along) && this.clear(eye, at)) best = { g, along };
    }
    return best?.g ?? null;
  }

  /** We used weapon `key` (main.js): ONE message for the shot, hit or miss, so the others in the fight see it; `shot` =
   * { o: start, d: unit direction, s?: speed } for things that fly on an arc (a dart, the ball, a bow's arrow), else the
   * eye and the view. A hit adds `to` (the room checks it). Returns the ghost aimed at, or null. */
  fire(key, shot = null, held = false) { // held: the caller checked we held `key` when it was used
    if (!this.ghosts.connected || (!held && this.weapon() !== key) || !C.weapons.includes(key) || !this.foes().length) return null;
    const g = this.aim(key, shot);
    this.camera.getWorldPosition(eye);
    this.camera.getWorldDirection(dir);
    const o = shot?.o ?? eye, d = shot?.d ?? dir;
    this.lastShot = { w: key, o: o.toArray(), d: d.toArray(), s: shot?.s ?? 0, to: g?.id ?? null };
    this.ghosts.fire({ w: key, o: o.toArray(), d: d.toArray(), s: shot?.s, to: g?.id });
    this.fired++;
    return g;
  }

  /** The first thing in the world along o → d within `range` m (walls, furniture; not ghosts), as a distance. */
  reach(o, d, range) {
    ray.set(o, d); ray.far = range; ray.layers.mask = this.camera.layers.mask; ray.camera = this.camera;
    for (const h of ray.intersectObjects(this.scene.children, true)) {
      const ob = h.object;
      if (!ob.isMesh || ob.material?.transparent || ob.material?.visible === false) continue;
      let skip = false;
      for (let p = ob; p; p = p.parent) if (!p.visible || p === this.ghosts.group || p === this.camera || p.userData.moving) { skip = true; break; }
      if (!skip) return h.distance;
    }
    return range;
  }

  streak(a, b, color, life) {
    const L = this.lines[this.nextLine++ % this.lines.length];
    L.a.copy(a); L.b.copy(b); L.col.setHex(color); L.life = life;
  }

  /** Another player's shot (#667, { w, o, d, s }): drawn the way it flew for them — only while we are both armed. */
  remote(m, g) {
    if (!this.weapon() || !g?.h) return; // a ghost without a weapon does not shoot; we unarmed see no fight
    const W = this.rules.weapons?.[m.w] ?? { range: 20 }, o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d).normalize();
    this.seen++;
    this.lastSeen = { w: m.w, o: m.o, d: m.d, s: m.s ?? 0, from: g.id };
    const hand = g.root.localToWorld(new THREE.Vector3(0.3, 1.0, -0.3));
    const blocked = (a, b) => { v.subVectors(b, a); const len = v.length(); return len > 0 && this.reach(a, v.normalize(), len) < len; };
    if (m.w === 'bow' && this.arrows) this.arrows.fire(o, d.clone().multiplyScalar(m.s || 30), true); // (#690) the same arrows
    else if (m.w === 'nerf' && this.darts) this.darts.fire(o, d, C.dartColor, { speed: m.s || undefined, blocked, life: C.shotLife });
    else if (m.w === 'ball') {
      const b = this.balls[this.nextBall++ % this.balls.length];
      b.m.position.copy(o); b.v.copy(d).multiplyScalar(m.s || 8); b.life = C.shotLife; b.flying = true; b.m.visible = true;
    } else if (m.w === 'saber') g.swing();
    else if (m.w === 'jetpack') { const back = g.root.localToWorld(new THREE.Vector3(0, 1.0, 0.2)); this.streak(back, back.clone().setY(back.y - 1.6), 0xff8a2a, 0.3); }
    else {
      const end = o.clone().addScaledVector(d, this.reach(o, d, W.range));
      const from = m.w === 'web' || m.w === 'wand' ? hand : o.clone().addScaledVector(d, 0.5).setY(o.y - 0.15);
      this.streak(from, end, m.w === 'web' ? 0xf4f4f4 : m.w === 'wand' ? 0xc070ff : 0xffe08a, m.w === 'web' ? 0.6 : m.w === 'wand' ? 0.35 : 0.15);
      if (m.w === 'wand') this.sparkles?.burst(end, 0xc070ff, 0.6);
    }
    if (m.w !== 'saber') this.sfx?.nerf?.(o);
  }

  /** The others' shots in flight: streaks fade, balls fall (and stop at a wall or the floor), all gone after a while. */
  moveShots(dt) {
    const pos = this.lineGeo.attributes.position, col = this.lineGeo.attributes.color;
    this.lines.forEach((L, i) => {
      L.life = Math.max(0, L.life - dt);
      const k = L.life > 0 ? 1 : 0;
      pos.setXYZ(i * 2, L.a.x, L.a.y, L.a.z); pos.setXYZ(i * 2 + 1, k ? L.b.x : L.a.x, k ? L.b.y : L.a.y, k ? L.b.z : L.a.z);
      col.setXYZ(i * 2, L.col.r * k, L.col.g * k, L.col.b * k); col.setXYZ(i * 2 + 1, L.col.r * k, L.col.g * k, L.col.b * k);
    });
    pos.needsUpdate = col.needsUpdate = true;
    for (const b of this.balls) {
      if (!b.m.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      if (!b.flying) continue;
      b.v.y -= 9.81 * dt;
      const from = b.m.position.clone(), step = b.v.length() * dt;
      b.m.position.addScaledVector(b.v, dt);
      if (step > 0 && this.reach(from, v.copy(b.v).normalize(), step + 0.115) < step + 0.115) b.flying = false;
    }
  }

  /** Each frame: the jetpack's flames on whoever is under us, the hearts, the red flash fading. */
  update(dt) {
    this.jetT = Math.max(0, this.jetT - dt);
    const jet = this.jetpack;
    if (jet?.thrusting && this.weapon() === 'jetpack' && this.jetT === 0) {
      const me = this.feet();
      for (const g of this.foes()) {
        const dy = me.y - g.feet.y; // their feet this far under ours; their head at most jetBelow[1] under our feet
        if (dy >= C.jetBelow[0] && dy - C.body[1] <= C.jetBelow[1] && Math.hypot(g.feet.x - me.x, g.feet.z - me.z) <= C.jetAcross) {
          this.ghosts.fire({ w: 'jetpack', o: [me.x, me.y + 1, me.z], d: [0, -1, 0], to: g.id });
          this.jetT = this.rules.weapons?.jetpack?.every ?? 1;
          break;
        }
      }
    }
    this.moveShots(dt);
    const on = this.active;
    this.el.hidden = !on;
    if (on) this.el.textContent = `❤ ${this.lives}/${this.maxLives}`;
    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); this.flashEl.style.opacity = String(this.flashT / C.flash); }
  }

  /** The room: our shot hit someone. */
  hit(m, g) {
    this.hits++;
    this.onHitCb(m, g);
    if (g) this.sfx?.splat?.(g.feet.clone().setY(g.feet.y + 1.2));
  }

  /** The room: someone hit us. Out of lives: to the start, full again. */
  hurt(m) {
    this.hurts++;
    this.lives = m.dead ? this.maxLives : Math.max(0, m.l);
    this.flashT = C.flash;
    this.flashEl.style.opacity = '1';
    this.sfx?.ouch?.();
    this.onHurtCb(m);
    if (m.dead) { this.deaths++; this.onDie(m); }
  }

  /** A new connection starts with full lives (the room's count does too). */
  reset() { this.lives = this.maxLives; }
}
