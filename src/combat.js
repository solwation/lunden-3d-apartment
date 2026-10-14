import { ballSegments, ballPlayerContact } from './ballflight.js';
import * as THREE from 'three';
import { fallDamage } from './falldamage.js';
import { recordPlayerKill, awardPvpRange } from './stats.js';
import { HitMarker } from './hitmarker.js';
import { COMBAT as C, TOYS, BASKET, pvpHitPoints, PVP_HEAD_BOXES as HB, rifleBoxHeadContact, rifleHeadBaseY, straightBoxHeadContact } from './config.js';
import { nerfSegments, nerfPlayerContact } from './nerf.js';
import { bowSegments, bowPlayerContact } from './bowflight.js';
import { combatWorldHits, combatWorldPath, combatWorldPathBlocked, prepareCombatWorld } from './combatworld.js';

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

/** First entry into a player's vertical capsule on a finite Nerf segment; nearest contact wins. */
export function nerfContact(origin, direction, length, feet) {
  const a = feet.clone().setY(feet.y + C.body[0]), b = feet.clone().setY(feet.y + C.body[1]);
  const [distance, closest] = rayToSegment(origin, direction, length, a, b);
  if (distance > C.hitRadius) return null;
  const inside = (along) => {
    const x = origin.x + direction.x * along - feet.x, z = origin.z + direction.z * along - feet.z;
    const y = origin.y + direction.y * along;
    const dy = y - THREE.MathUtils.clamp(y, a.y, b.y);
    return x * x + dy * dy + z * z <= C.hitRadius ** 2;
  };
  if (inside(0)) return 0;
  let low = 0, high = closest;
  for (let i = 0; i < 24; i++) { const middle = (low + high) / 2; if (inside(middle)) high = middle; else low = middle; }
  return high;
}

export class Combat {
  /** ghosts (Ghosts), camera, scene, weapon(): key or '', feet(): our feet (Vector3), jetpack, onDie(): back to the start; score / hurt / sfx hooks. */
  constructor({ ghosts, camera, scene, weapon, feet, jetpack = null, basket = null, darts = null, sparkles = null, arrows = null, life = null, fruit = null, fish = null, chicken = null, fries = null, beer = null, beerCans = null, onDie = () => {}, onHit = () => {}, onHurt = () => {}, sfx = null }) {
    Object.assign(this, { ghosts, camera, scene, weapon, feet, jetpack, basket, darts, sparkles, arrows, lifeSystem: life, onDie, onHitCb: onHit, onHurtCb: onHurt, sfx, lives: C.lives, jetT: 0, flashT: 0,
      hits: 0, hurts: 0, deaths: 0, fired: 0, seen: 0, lastShot: null, lastSeen: null, consumed: new Set() });
    if (life?.onEvent) {
      life.onEvent((kind, d) => {
        if (kind === 'ate' && d.item?.id && (d.type === 'breadSlice' || (d.type === 'friedEgg' && d.item?.machine?.cooked !== false))) {
          this.consume(d.item.id).catch(() => {});
        }
      });
    }
    this.hookFood({ fruit, fish, chicken, fries });
    this.hookBeer({ beer, beerCans });
    ghosts.onShot = (m, g) => this.remote(m, g);
    prepareCombatWorld(scene, ghosts.group, camera);
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
    this.nerfPending = [];
    const ballGeo = new THREE.SphereGeometry(0.115, 12, 8), ballMat = new THREE.MeshLambertMaterial({ color: 0xd8641e });
    this.balls = [...Array(C.balls)].map(() => { const m = new THREE.Mesh(ballGeo, ballMat); m.visible = false; m.userData.moving = true; m.raycast = () => {}; scene.add(m); return { m, v: new THREE.Vector3(), life: 0, flying: false }; });
    this.nextBall = 0;
    scene.add(this.lineMesh);
    ghosts.onHit = (m, g) => this.hit(m, g);
    ghosts.onHurt = (m, g) => this.hurt(m, g);
    ghosts.onWelcome = m => this.reset(m?.l);
    ghosts.onLife = m => this.life(m.l);
    this.el = document.createElement('div');
    this.el.id = 'lives';
    this.el.hidden = true;
    Object.assign(this.el.style, { position: 'fixed', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
      font: '600 15px system-ui, -apple-system, "Segoe UI", sans-serif', color: '#fff', background: 'rgba(18, 22, 30, 0.6)', padding: '3px 10px', borderRadius: '12px' });
    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 19, opacity: 0,
      background: 'radial-gradient(ellipse at center, rgba(200,0,0,0) 45%, rgba(200,0,0,0.55) 100%)' });
    document.body.append(this.el, this.flashEl);
    this.hitMarker = new HitMarker();
  }

  get rules() { return this.ghosts.rules ?? { lives: C.lives, portionLife: C.portionLife, weapons: {} }; }
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
    return combatWorldHits(this.scene, this.ghosts.group, this.camera, ray).length === 0;
  }

  /** Actual bow launch and arrow-tip segments; nearest player before the first world contact. */
  bowContact(shot, range) {
    const round = (value, factor) => Math.round(value*factor)/factor;
    const launch = { o: shot.o.toArray().map(x=>round(x,100)), d: shot.d.toArray().map(x=>round(x,1000)), s: round(shot.s,100) };
    const points = [], foes = this.foes();
    let best = null;
    for (const segment of bowSegments(launch, range)) {
      let nearest = null;
      for (const foe of foes) {
        const state = { p: foe.feet.toArray(), r: foe.root.rotation.y, c: foe.crouch ?? 0 };
        const hit = bowPlayerContact(foe.id, state, segment);
        if (hit && (!nearest || hit.distance<nearest.hit.distance)) nearest = { foe, hit };
      }
      const end = nearest ? segment.origin.map((x,i)=>x+segment.direction[i]*nearest.hit.distance) : segment.end;
      points.push({ origin: segment.origin, end });
      if (nearest) { best=nearest; break; }
    }
    if (best) {
      // Keep the real arrow's finite tip rays, including each turn between steps.
      const vertices=points.flatMap(p=>[new THREE.Vector3(...p.origin),new THREE.Vector3(...p.end)]);
      const hits=combatWorldPath(this.scene,this.ghosts.group,this.camera,vertices,this.camera.layers);
      ray.layers.mask=this.camera.layers.mask;ray.camera=this.camera;
      for(const piece of points){
        const o=new THREE.Vector3(...piece.origin),d=new THREE.Vector3(...piece.end).sub(o),length=d.length();
        if(!length)continue;
        ray.set(o,d.divideScalar(length));ray.far=length;
        if(hits(ray).length){best=null;break;}
      }
    }
    return { ...launch, target:best?.foe??null, hc:best?.hit.head?[HB.version,...best.hit.point]:null };
  }

  /** A Nerf hit along the actual muzzle arc, before the first wall/floor or its travel limit. */
  nerfCandidate(shot, range) {
    const foes = this.foes(), points = [shot.o.clone()];
    let target = null, hc = null;
    for (const segment of nerfSegments({ o: shot.o.toArray(), d: shot.d.toArray(), s: shot.s }, range)) {
      const p = new THREE.Vector3(...segment.origin), direction = new THREE.Vector3(...segment.direction), length = segment.length;
      let best = null;
      for (const foe of foes) {
        const state = { p: foe.feet.toArray(), r: foe.root.rotation.y, c: foe.crouch ?? 0 };
        const hit = nerfPlayerContact(foe.id, state, segment);
        if (hit && (!best || hit.distance < best.along)) best = { foe, along: hit.distance,
          hc: hit.head ? [HB.version, ...hit.point] : null };
      }
      if (best) { target = best.foe; hc = best.hc; points.push(p.clone().addScaledVector(direction, best.along)); break; }
      points.push(new THREE.Vector3(...segment.end));
    }
    if (!target) return null; // A miss needs no whole-scene obstacle queries.
    return { target, points, hc };
  }

  aimNerf(shot, range) {
    const candidate = this.nerfCandidate(shot, range);
    if (!candidate) return null;
    const { target, points } = candidate;
    const layers = this.camera.layers;
    const hits = combatWorldPath(this.scene, this.ghosts.group, this.camera, points, layers);
    ray.layers.mask = layers.mask; ray.camera = this.camera;
    for (let i = 1; i < points.length; i++) {
      const direction = points[i].clone().sub(points[i - 1]), length = direction.length();
      if (!length) continue;
      ray.set(points[i - 1], direction.divideScalar(length)); ray.far = length;
      if (hits(ray).length) return null;
    }
    return target;
  }

  /** Actual free basketball launch, with the product's original solid/radius/hoop policy. */
  ballCandidate(shot, range) {
    if (!this.basket || !shot?.s) return null;
    for (const segment of ballSegments({o:shot.o.toArray(),d:shot.d.toArray(),s:shot.s},range)) {
      const origin=new THREE.Vector3(...segment.origin), direction=new THREE.Vector3(...segment.direction);
      let best=null;
      for(const foe of this.foes()) {
        const hit=ballPlayerContact(foe.id,{p:foe.feet.toArray(),r:foe.root.rotation.y,c:foe.crouch??0},segment);
        if(hit&&(!best||hit.distance<best.distance))best={...hit,target:foe};
      }
      const length=best?.distance??segment.length;
      // Exactly Basket.cast's existing forward-radius and resting-floor checks.
      const endpoint=origin.clone().addScaledVector(direction,length);
      if(this.basket.cast(origin,endpoint.clone().addScaledVector(direction,BASKET.ball.r)))return null;
      const ground=this.basket.cast(endpoint,endpoint.clone().add(new THREE.Vector3(0,-BASKET.ball.r-.004,0)));
      if(ground?.normal.y>.5)return null;
      const velocity=new THREE.Vector3(...segment.velocity);
      if(this.basket.hoop.collide(endpoint.clone(),velocity,BASKET.ball.r)>0)return null;
      if(best)return {target:best.target,hc:best.head?[HB.version,...best.point]:null};
    }
    return null;
  }

  /** Shared logical head boxes; native body contact below the neck keeps torso/limb obstruction. */
  rifleContact(key = 'rifle') {
    this.camera.getWorldPosition(eye); this.camera.getWorldDirection(dir);
    const round = (v, n) => Math.round(v * n) / n;
    const o = eye.clone().set(...eye.toArray().map(v => round(v, 100)));
    const raw = dir.clone().set(...dir.toArray().map(v => round(v, 1000))), direction = raw.clone().normalize();
    const range = this.rules.weapons[key].range;
    ray.set(o, direction); ray.far = range; ray.layers.mask = this.camera.layers.mask; ray.camera = this.camera;
    let best = null;
    for (const g of this.foes()) {
      const state = { p: g.feet.toArray(), r: g.root.rotation.y, c: g.crouch ?? 0 };
      const head = rifleBoxHeadContact(g.id, state, o.toArray(), raw.toArray(), range);
      const neck = rifleHeadBaseY(g.id, state);
      g.root.updateMatrixWorld(true);
      // The old full-height capsule encloses the head. Instead keep real body surfaces
      // below the logical neck; cosmetic hair/eyes cannot veto a box hit or become damage regions.
      const body = ray.intersectObject(g.avatar.mesh, false).find(hit => hit.point.y < neck);
      const isHead = head && (!body || head.distance < body.distance);
      const along = isHead ? head.distance : body?.distance;
      if (along !== undefined && (!best || along < best.along)) {
        best = { g, along, hc: isHead ? [HB.version, ...head.point] : null };
      }
    }
    if (best) {
      ray.set(o, direction); ray.far = best.along;
      if (combatWorldHits(this.scene, this.ghosts.group, this.camera, ray).length) best = null;
    }
    return { o, d: raw, target: best?.g ?? null, hc: best?.hc ?? null };
  }

  /** Preserve the existing body/cone target; only an actual unobstructed ray can add head damage. */
  straightContact(key) {
    const target = this.aim(key), contact = this.rifleContact(key);
    // A saber is still a swing/cone: it cannot acquire a new target outside its old attack.
    if (key === 'saber' && contact.target !== target) return { ...contact, target, hc: null };
    if (contact.hc && target && target !== contact.target) {
      const a = target.feet.clone().setY(target.feet.y + C.body[0]);
      const b = target.feet.clone().setY(target.feet.y + C.body[1]);
      const [, along] = rayToSegment(contact.o, contact.d.clone().normalize(), this.rules.weapons[key].range, a, b);
      const headAlong = contact.o.distanceTo(new THREE.Vector3(...contact.hc.slice(1)));
      if (along < headAlong) return { ...contact, target, hc: null };
    }
    return contact.hc ? contact : { ...contact, target, hc: null };
  }

  /** Whom `key` hits now: the nearest armed player along the view (the saber: in front within reach; the bow: on the
   * arrow's arc, `shot`), or null. */
  aim(key, shot = null) {
    const W = this.rules.weapons?.[key];
    if (!W) return null;
    if (key === 'rifle') return this.rifleContact().target;
    if (key === 'nerf' && shot) return this.aimNerf(shot, W.range);
    if (key === 'bow' && shot?.s) return this.bowContact(shot, W.range).target;
    if (key === 'ball' && shot) return this.ballCandidate(shot,W.range)?.target??null;
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
    if (key === 'nerf' && shot) {
      // Predict from the existing wire precision so client and Worker integrate the same muzzle path.
      const launch = { o: shot.o.clone().set(...shot.o.toArray().map(v => Math.round(v * 100) / 100)),
        d: shot.d.clone().set(...shot.d.toArray().map(v => Math.round(v * 1000) / 1000)),
        s: shot.s ? Math.round(shot.s * 100) / 100 : undefined };
      const candidate = this.nerfCandidate(launch, this.rules.weapons.nerf.range);
      const layers = new THREE.Layers(); layers.mask = this.camera.layers.mask;
      const job = { done: false, cancel: false, finish: null };
      const valid = () => this.ghosts.connected && this.weapon() === key;
      job.finish = target => {
        if (job.done) return;
        job.done = true;
        const at = this.nerfPending.indexOf(job); if (at >= 0) this.nerfPending.splice(at, 1);
        if (job.cancel || !valid()) return;
        this.lastShot = { w: key, o: launch.o.toArray(), d: launch.d.toArray(), s: launch.s ?? 0, to: target?.id ?? null, ...(target && candidate?.hc ? { hc: candidate.hc } : {}) };
        this.ghosts.fire({ w: key, o: launch.o.toArray(), d: launch.d.toArray(), s: launch.s, to: target?.id,
          ...(target && candidate?.hc ? { hc: candidate.hc } : {}) });
        this.fired++;
      };
      if (!candidate) { job.finish(null); return null; }
      while (this.nerfPending.length >= TOYS.nerf.dart.max) this.nerfPending[0].finish(null);
      this.nerfPending.push(job);
      const deadline = performance.now() + C.collision.predictionMs;
      combatWorldPathBlocked(this.scene, this.ghosts.group, this.camera, candidate.points, layers,
        { deadline, cancelled: () => job.done || job.cancel || !valid() }).then(blocked => {
          job.finish(blocked === false ? candidate.target : null);
        }, () => job.finish(null));
      return null;
    }
    if (key === 'bow' && shot?.s) {
      const contact=this.bowContact(shot,this.rules.weapons.bow.range);
      const wire={w:key,o:contact.o,d:contact.d,s:contact.s,to:contact.target?.id,...(contact.hc?{hc:contact.hc}:{})};
      this.lastShot={...wire,to:contact.target?.id??null};this.ghosts.fire(wire);this.fired++;
      return contact.target;
    }
    if(key==='ball' && shot?.s) {
      const round=(v,n)=>Math.round(v*n)/n;
      const launch={o:shot.o.clone().set(...shot.o.toArray().map(v=>round(v,100))),
        d:shot.d.clone().set(...shot.d.toArray().map(v=>round(v,1000))),s:round(shot.s,100)};
      const contact=this.ballCandidate(launch,this.rules.weapons.ball.range),target=contact?.target;
      const wire={w:key,o:launch.o.toArray(),d:launch.d.toArray(),s:launch.s,to:target?.id,
        ...(contact?.hc?{hc:contact.hc}:{})};
      this.lastShot={...wire,to:target?.id??null};this.ghosts.fire(wire);this.fired++;return target??null;
    }
    if (['rifle', 'wand', 'web', 'saber'].includes(key)) {
      const contact = key === 'rifle' ? this.rifleContact() : this.straightContact(key), g = contact.target;
      const wire = { w: key, o: contact.o.toArray(), d: contact.d.toArray(), to: g?.id, ...(contact.hc ? { hc: contact.hc } : {}) };
      this.lastShot = { ...wire, to: g?.id ?? null }; this.ghosts.fire(wire); this.fired++;
      return g;
    }
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
    return combatWorldHits(this.scene, this.ghosts.group, this.camera, ray)[0]?.distance ?? range;
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
  // #867 offline uses this same Combat replica; online health is only written by room events.
  recoveryClock(now = Date.now()) {
    if (this.ghosts.connected || this.lives >= this.maxLives) delete this.healAt;
    else if (!Number.isFinite(this.healAt)) this.healAt = now + 60_000; // user's real minute
  }

  recoverOffline(now = Date.now()) {
    this.recoveryClock(now);
    if (this.ghosts.connected || !Number.isFinite(this.healAt) || now < this.healAt) return;
    const minutes = 1 + Math.floor((now - this.healAt) / 60_000);
    this.lives = Math.min(this.maxLives, this.lives + minutes);
    this.healAt += minutes * 60_000;
    this.recoveryClock(now);
  }

  /** Flame-volume body contact uses the same solid-world policy as other combat rays (#978).
   * Aim at the nearest surface of the existing generous body capsule, including offset targets;
   * unlike clear(), do not leave a .3 m blind gap immediately before that surface. */
  jetBodyClear(origin, feet) {
    const axis = feet.clone().setY(THREE.MathUtils.clamp(origin.y, feet.y + C.body[0], feet.y + C.body[1]));
    dir.subVectors(axis, origin);
    const distance = Math.max(0, dir.length() - C.hitRadius);
    if (distance === 0) return true; // the flame origin already lies in the body volume
    ray.set(origin, dir.normalize()); ray.far = distance;
    ray.layers.mask = this.camera.layers.mask; ray.camera = this.camera;
    return combatWorldHits(this.scene, this.ghosts.group, this.camera, ray).length === 0;
  }

  update(dt) {
    this.hitMarker.update();
    this.recoverOffline();
    this.jetT = Math.max(0, this.jetT - dt);
    const jet = this.jetpack;
    if (jet?.thrusting && this.weapon() === 'jetpack' && this.jetT === 0) {
      const me = this.feet();
      for (const g of this.foes()) {
        const dy = me.y - g.feet.y; // their feet this far under ours; their head at most jetBelow[1] under our feet
        if (dy >= C.jetBelow[0] && dy - C.body[1] <= C.jetBelow[1] && Math.hypot(g.feet.x - me.x, g.feet.z - me.z) <= C.jetAcross) {
          // A blocked attempt keeps the same cadence instead of querying a wall every frame.
          this.jetT = this.rules.weapons?.jetpack?.every ?? 1;
          const round = v => Math.round(v * 100) / 100;
          const shot = { t: 'a', w: 'jetpack', o: [me.x, me.y + 1, me.z].map(round), d: [0, -1, 0], to: g.id };
          const state = { p: g.feet.toArray(), r: g.root.rotation.y, c: g.crouch ?? 0 };
          const head = straightBoxHeadContact(g.id, state, shot, this.rules.weapons.jetpack.range);
          if (head) {
            const origin = new THREE.Vector3(...shot.o), point = new THREE.Vector3(...head.point);
            ray.set(origin, new THREE.Vector3(0, -1, 0)); ray.far = head.distance;
            ray.layers.mask = this.camera.layers.mask; ray.camera = this.camera;
            g.root.updateMatrixWorld(true);
            const body = ray.intersectObject(g.avatar.mesh, false).find(hit => hit.point.y < rifleHeadBaseY(g.id, state));
            if (!body && this.clear(origin, point.clone().add(new THREE.Vector3(0, -.3, 0)))) shot.hc = [HB.version, ...head.point];
          }
          if (!shot.hc && !this.jetBodyClear(new THREE.Vector3(...shot.o), g.feet)) continue;
          this.lastShot = shot; this.ghosts.fire(shot);
          break;
        }
      }
    }
    for (const job of [...this.nerfPending]) if (!this.ghosts.connected || this.weapon() !== 'nerf') { job.cancel = true; job.finish(null); }
    this.moveShots(dt);
    const on = this.active || this.lives < this.maxLives;
    this.el.hidden = !on;
    if (on) this.el.textContent = `❤ ${this.lives}/${this.maxLives}`;
    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); this.flashEl.style.opacity = String(this.flashT / C.flash); }
  }

  /** The room: our shot hit someone. */
  hit(m, g) {
    recordPlayerKill(m, this.ghosts.me); // server lethal-hit receipt only; separate from hit points (#871)
    const award = m.award;
    if (award !== undefined) {
      if (!award || award.i !== this.ghosts.me || !this.ghosts.connected || !Number.isSafeInteger(award.seq) || award.seq < 1
        || award.points !== pvpHitPoints(award.distance) || award.points <= 0) return;
      if (this.awardOwner !== award.i) { this.awardOwner = award.i; this.awardSeq = 0; }
      if (award.seq <= this.awardSeq) return; // one ordered server connection: no base/bonus/sound repeat
      this.awardSeq = award.seq;
      awardPvpRange(award.points);
    } // older Workers retain the existing base-only callback

    this.hitMarker.show(m);

    this.hits++;
    this.onHitCb(m, g);
    if (m.w === 'nerf') this.sfx?.playerHit?.();
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

  /** Passive authoritative updates, including healing: no hurt/score/death side effects. */
  life(value) {
    if (!Number.isSafeInteger(value)) return false;
    this.lives = Math.max(0, Math.min(this.maxLives, value));
    return true;
  }

  /** API for #869; the landing caller owns suit protection, visuals and fatal respawn timing. */
  async fall(drop, gap, now = Date.now()) {
    const damage = fallDamage(drop, gap, this.maxLives);
    if (damage === null) return null;
    this.recoverOffline(now);
    const result = this.ghosts.connected ? await this.ghosts.fall(drop, gap)
      : { l: Math.max(0, this.lives - damage), dead: damage > 0 && this.lives <= damage };
    if (!result || !Number.isSafeInteger(result.l) || typeof result.dead !== 'boolean') return null;
    this.life(result.dead ? this.maxLives : result.l);
    this.recoveryClock(now);
    if (result.dead) this.deaths++;
    return result; // no PvP hurt penalty or immediate onDie; #869 handles actual fatal landing wake
  }

  /** Consume a whole food portion (bread, sandwich, fried egg, fruit, fish finger, chicken piece, fries) or beer (can, bottle, lounge) to restore +1 life (#1004, #1005, #1006). */
  async consume(portion, now = Date.now()) {
    const id = typeof portion === 'string' ? portion : portion?.id ?? portion?.portionId;
    if (!id || typeof id !== 'string') return null;
    this.consumed ??= new Set();
    if (this.consumed.has(id)) return null;
    this.consumed.add(id);
    this.recoverOffline(now);
    const portionLife = this.rules.portionLife ?? C.portionLife ?? 1;
    const result = this.ghosts.connected ? await this.ghosts.consume(id)
      : { l: Math.min(this.maxLives, this.lives + portionLife), ok: true };
    if (!result || !Number.isSafeInteger(result.l)) return null;
    this.life(result.l);
    this.recoveryClock(now);
    return result;
  }

  onAte(portion, now = Date.now()) { return this.consume(portion, now); }
  onDrank(portion, now = Date.now()) { return this.consume(portion, now); }

  hookFood({ fruit = null, fish = null, chicken = null, fries = null } = {}) {
    if (fruit) {
      const prev = fruit.onConsume;
      fruit.onConsume = (f, id) => {
        prev?.(f, id);
        const portionId = id ?? f?.portionId;
        if (portionId) this.consume(portionId).catch(() => {});
      };
    }
    if (fish) {
      const prev = fish.onConsume;
      fish.onConsume = (f, id) => {
        prev?.(f, id);
        const portionId = id ?? f?.portionId;
        if (portionId) this.consume(portionId).catch(() => {});
      };
    }
    if (chicken) {
      const prev = chicken.onConsume;
      chicken.onConsume = (piece, id) => {
        prev?.(piece, id);
        const portionId = id ?? piece?.portionId;
        if (portionId) this.consume(portionId).catch(() => {});
      };
    }
    if (fries) {
      const prev = fries.onBunchEaten;
      fries.onBunchEaten = (bunch, id) => {
        prev?.(bunch, id);
        const portionId = id ?? bunch?.portionId;
        if (portionId) this.consume(portionId).catch(() => {});
      };
    }
  }

  hookBeer({ beer = null, beerCans = null } = {}) {
    if (beer) {
      const prev = beer.onConsume;
      beer.onConsume = (b, id) => {
        prev?.(b, id);
        const portionId = id ?? b?.portionId ?? b?.portion?.id;
        if (portionId) this.consume(portionId).catch(() => {});
      };
    }
    if (beerCans) {
      for (const can of beerCans) {
        const prev = can.onConsume;
        can.onConsume = (c, id) => {
          prev?.(c, id);
          const portionId = id ?? c?.portionId ?? c?.portion?.id;
          if (portionId) this.consume(portionId).catch(() => {});
        };
      }
    }
  }

  /** A new server attachment starts full; missing legacy own-state keeps the existing replica. */
  reset(value) {
    this.hitMarker.clear();
    this.life(value);
    delete this.healAt;
    for (const job of [...this.nerfPending]) { job.cancel = true; job.finish(null); }
  }
}
