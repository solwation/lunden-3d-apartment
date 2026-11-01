import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTDOOR_CATS, SEASON } from './config.js';
import { BREEDS, createCatPuppet, catLabel } from './cat.js';
import { routePlan, catAt } from './outdoorcatroute.js';
import { registerSeasonal } from './seasons.js';

// #1767: outdoor cats. A few cats of their own roam the courtyard and the river park (OUTDOOR_CATS in config.js): each walks its loop
// (outdoorcatroute.js, a pure function of the wall clock, so every visitor sees roughly the same cat), rests, washes, looks about or
// sleeps. Near the eye the real animated cat (cat.js createCatPuppet), further out one merged mesh, beyond `drawDist` nothing.
// A visitor walking up makes it stop and sit; close enough (and while the ordinary cat is free) it *becomes* the ordinary cat
// (cat.js CatSpawner, sitting outdoors like a cat put down outside, #1287): pet, carry and put down work exactly as for that cat, and
// whatever else that cat can do later (being fed, #1766) comes with it. Walked away from (or put down outdoors and left), it turns
// back into the roaming cat and walks home to its loop; carried off too far, indoors or with a road/water in the way it fades and
// turns up on its loop again later. Hidden in rain (it shelters) and in the snow months. Per client, no shared sync.

const C = OUTDOOR_CATS;

/** One merged, vertex-coloured mesh of the puppet in its current pose (relative to its root, without the root's own scale). */
function bakePose(p, stand) {
  Object.assign(p, { stand, wantStand: stand, gaitAmp: 0, walked: false, tailK: -1, hopY: 0 });
  p.shoulder.rotation.set(0, 0, 0); p.leftShoulder.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
  p.pose(0);
  const root = p.object;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4(), col = new THREE.Color(), geos = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return;
    const g = o.geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    col.copy(o.material.color);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g);
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}

export class OutdoorCats {
  /**
   * `cat`: main.js's CatSpawner (the ordinary cat an outdoor cat turns into); `ground(x, z)`: the terrain height; `walkable(x, z)`:
   * not road, not water (the way home is checked with it); `lowMemory`: phones draw nearer.
   */
  constructor({ scene, camera, cat, ground, walkable = () => true, lowMemory = false }) {
    Object.assign(this, { scene, camera, cat, ground, walkable });
    this.drawDist = lowMemory ? C.drawDistPhone : C.drawDist;
    this.now = () => Date.now() / 1000; // tests replace it
    this.winter = false;
    this.rain = 0;
    this.bound = null; // the outdoor cat that is the ordinary cat just now
    this.cats = C.cats.map((spec, id) => this.makeCat(spec, id));
    registerSeasonal((month) => { this.winter = SEASON.snowMonths.includes(month); });
  }

  makeCat(spec, id) {
    const breed = BREEDS.find((b) => b.name === spec.breed) ?? BREEDS[0];
    const coat = breed.coats.find((v) => v.name === spec.coat) ?? breed.coats[0];
    const puppet = createCatPuppet(breed, coat);
    const group = new THREE.Group();
    group.name = `outdoor-cat-${spec.name}`;
    group.visible = false;
    const lodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, transparent: true });
    const lods = [bakePose(puppet, 0), bakePose(puppet, 1)].map((g) => {
      const m = new THREE.Mesh(g, lodMat);
      m.scale.copy(puppet.object.scale);
      m.raycast = () => {};
      m.visible = false;
      group.add(m);
      return m;
    });
    Object.assign(puppet, { stand: 0, wantStand: 0, tailK: -1 });
    puppet.pose(0);
    group.add(puppet.object);
    // our own distance rule draws them (drawDist / near): kept out of the small-detail culler (detail.js), which judged the puppet by
    // its spot at start-up and hid it on the lawn
    group.traverse((o) => { if (o.isMesh) o.userData.noDetail = true; });
    this.scene.add(group);
    const plan = routePlan(spec.route, spec.rest, C.speed);
    const c = { id, spec, name: spec.name, breed, coat, puppet, group, lods, lodMat, plan, st: 'route', alpha: 0, x: 0, z: 0, yaw: 0,
      awayUntil: 0, found: false, t: Math.random() * 6, at: null, checkT: 0 };
    this.place(c, this.scheduled(c));
    return c;
  }

  /** Where `c`'s loop has it now. */
  scheduled(c) { return catAt(c.plan, this.now() - C.epoch + c.spec.phase, c.id); }

  place(c, s) { c.x = s.x; c.z = s.z; c.yaw = s.yaw; c.at = s; }

  /** Is the straight way from (ax, az) to (bx, bz) on walkable ground with no drop (a retaining wall, a bank)? */
  clearWay(ax, az, bx, bz) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    let y = this.ground(ax, az);
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, g = this.ground(x, z);
      if (!this.walkable(x, z) || !Number.isFinite(g) || Math.abs(g - y) > C.maxStep) return false;
      y = g;
    }
    return true;
  }

  /** The ordinary cat is free to become this one (not out, not held, not hurt-away). */
  catFree() { const k = this.cat; return !!k && !k.visible && !k.held && !(k.awayFor > 0); }

  /** It becomes the ordinary cat (cat.js), sitting where it is, outdoors (#1287). */
  promote(c) {
    const k = this.cat;
    k.hide();
    k.setCat(c.breed, c.coat, false);
    k.catName = c.name;
    k.object.position.copy(c.group.position);
    k.object.rotation.set(0, c.yaw, 0);
    Object.assign(k, { on: 'sit', outdoor: true, rugY: null, door: null, closedSince: false, ignored: 0, t: Math.random() * 4,
      nextMeow: 1 + Math.random() * 2, stand: 0, wantStand: 0, outdoorCat: c.name });
    k.object.visible = true;
    k.pose(0);
    c.st = 'bound';
    this.bound = c;
    c.group.visible = false;
    if (!c.found) { c.found = true; k.onFound?.(catLabel(c.breed, c.coat), !!c.breed.rare, c.breed.name, false); } // found once per visit
  }

  /** The ordinary cat that was `c` is left alone outdoors: `c` takes over again there and walks home. */
  demote(c) {
    const k = this.cat, p = k.object.position;
    Object.assign(c, { x: p.x, z: p.z, yaw: k.object.rotation.y, st: 'home', alpha: 1, checkT: 0 });
    k.outdoorCat = null;
    k.hide();
    Object.assign(c.puppet, { stand: 0, wantStand: 0 });
    this.bound = null;
  }

  unbind(c) { if (this.cat) this.cat.outdoorCat = null; this.bound = null; c.st = 'away'; c.awayUntil = this.now() + C.away; c.alpha = 0; }

  /** `hidden`: underground / no outdoor view; `rain`: weather.rain (0 in snow, which the season hides). */
  update(dt, hidden = false, rain = 0) {
    const eye = this.camera.position, k = this.cat;
    this.rain = rain;
    // a reload restored the ordinary cat sitting outdoors as one of ours (keep.js): it is that cat again
    if (!this.bound && k?.visible && k.outdoor && !k.held) {
      const c = this.cats.find((q) => q.name === k.catName && q.breed === k.breed && q.coat === k.variant);
      if (c) { c.st = 'bound'; c.group.visible = false; this.bound = c; k.outdoorCat = c.name; }
    }
    for (const c of this.cats) this.step(c, dt, eye, hidden);
  }

  step(c, dt, eye, hidden) {
    const k = this.cat;
    if (c.st === 'bound') {
      if (!k.visible || k.outdoorCat !== c.name || k.breed !== c.breed || k.variant !== c.coat) { this.unbind(c); return; } // faded, walked off indoors, or another cat now
      const p = k.object.position;
      if (!k.held && !k.petting && !k.released && !k.leaving && k.outdoor && Math.hypot(eye.x - p.x, eye.z - p.z) > C.release
        && Math.abs(p.y - this.ground(p.x, p.z)) < 0.3) this.demote(c);
      return;
    }
    const now = this.now(), s = this.scheduled(c), away = this.winter || this.rain > C.rain;
    c.at = s;
    if (c.st === 'away') {
      if (now < c.awayUntil) { c.group.visible = false; return; }
      c.st = 'route'; this.place(c, s); c.alpha = 0;
    }
    const gy = this.ground(c.x, c.z), d = Math.hypot(eye.x - c.x, eye.y - (Number.isFinite(gy) ? gy : 0), eye.z - c.z); // (3D: not drawn from a storey above)
    // what it does: follow the loop, sit and look at a visitor coming up, or walk home
    let walking = false, moved = 0, activity = 'look', faceEye = false;
    if (c.st === 'route' || c.st === 'notice') {
      const near = !hidden && !away && c.alpha > 0.5 && d < C.notice;
      if (near) c.st = 'notice';
      else if (c.st === 'notice' && d > C.notice + 1.5) c.st = 'home';
    }
    if (c.st === 'notice') {
      faceEye = true;
      if (d < C.take && c.puppet.stand < 0.05 && this.catFree()) { this.promote(c); return; }
    } else if (c.st === 'home') {
      const tx = s.x - c.x, tz = s.z - c.z, td = Math.hypot(tx, tz);
      if (td < 0.25) c.st = 'route';
      else {
        if ((c.checkT -= dt) <= 0) { // a road, the river or a drop in the way, or too far: it fades and comes back later
          c.checkT = 0.5;
          if (td > C.maxReturn || !this.clearWay(c.x, c.z, s.x, s.z)) { c.st = 'away'; c.awayUntil = now + C.away; }
        }
        if (c.st === 'home') {
          const go = Math.min(td, C.returnSpeed * dt * (c.puppet.stand > 0.8 ? 1 : 0));
          c.x += tx / td * go; c.z += tz / td * go; moved = go; walking = true;
          c.yaw = turnTo(c.yaw, Math.atan2(tx, tz), dt * 5);
        }
      }
    }
    if (c.st === 'route') {
      moved = Math.hypot(s.x - c.x, s.z - c.z);
      if (moved > 3) moved = 0; // (a jump: it was hidden or far away)
      walking = s.walking; activity = s.activity;
      c.x = s.x; c.z = s.z;
      c.yaw = turnTo(c.yaw, s.yaw, dt * 4);
    }
    // fade (sheltering, away, far) and draw
    const show = !hidden && !away && c.st !== 'away';
    c.alpha = THREE.MathUtils.clamp(c.alpha + (show ? dt : -dt) / C.fade, 0, 1);
    const drawn = c.alpha > 0 && d < this.drawDist;
    c.group.visible = drawn;
    if (!drawn) { if (c.st === 'notice') c.st = 'home'; return; }
    const y = this.ground(c.x, c.z);
    c.group.position.set(c.x, Number.isFinite(y) ? y : 0, c.z);
    if (faceEye) c.yaw = turnTo(c.yaw, Math.atan2(eye.x - c.x, eye.z - c.z), dt * 3);
    c.group.rotation.y = c.yaw;
    const full = d < C.near, P = c.puppet;
    P.object.visible = full;
    c.lods[0].visible = !full && !walking;
    c.lods[1].visible = !full && walking;
    c.lodMat.opacity = c.alpha;
    for (const m of P.materials) m.opacity = c.alpha;
    if (full) this.animate(c, dt, walking && !faceEye, moved, faceEye ? 'look' : activity);
    else P.stand = walking ? 1 : 0;
  }

  /** The full cat's pose this frame: walking, or sitting and washing / looking about / asleep. */
  animate(c, dt, walking, moved, activity) {
    const P = c.puppet;
    c.t += dt;
    P.walked = false; P.hopY = 0; P.headOff.set(0, 0, 0);
    P.wantStand = walking ? 1 : 0;
    if (walking && P.stand > 0.5 && moved > 0) P.stride(moved);
    const sleep = !walking && activity === 'sleep';
    for (const e of P.eyes) { e.eye.visible = !sleep; e.shut.visible = sleep; }
    if (walking) {
      P.shoulder.rotation.z = 0;
      P.head.rotation.set(0.12, 0, 0);
      P.tailGroup.rotation.y = 0.3 * Math.sin(c.t * 4.5);
    } else if (activity === 'wash') { // the CatSpawner's washing cycle (cat.js behave)
      const t = c.t, cy = t % 6, sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
      const up = sm(0, 0.5, cy) * (1 - sm(3.2, 3.7, cy)), wipe = sm(2.0, 2.4, cy) * (1 - sm(2.9, 3.2, cy)), lick = Math.sin(t * 13) * 0.5 + 0.5;
      P.shoulder.rotation.set(-2.85 * up - 0.25 * wipe, 0, 0.3 * up + 0.15 * wipe);
      P.head.rotation.set(0.3 * up + 0.08 * lick * up * (1 - wipe) - 0.2 * wipe, 0.4 * up * (1 - wipe) + (1 - up) * 0.35 * Math.sin(t * 0.7), -0.15 * up + 0.3 * wipe);
      P.tailGroup.rotation.y = 0.08 * Math.sin(t * 2.3) * (1 - up);
    } else {
      P.shoulder.rotation.set(0, 0, 0);
      if (sleep) P.head.rotation.set(0.5, 0.15, 0.1); // head down, eyes shut: asleep in the sun
      else P.head.rotation.set(0, 0.45 * Math.sin(c.t * 0.6), 0);
      P.tailGroup.rotation.y = sleep ? 0 : 0.08 * Math.sin(c.t * 2.3);
    }
    P.pose(dt);
  }

  /** For tests: each cat's state. */
  state() {
    return this.cats.map((c) => ({ name: c.name, zone: c.spec.zone, st: c.st, x: c.x, z: c.z, y: c.group.position.y, alpha: c.alpha,
      visible: c.group.visible, full: c.puppet.object.visible, walking: c.at?.walking ?? false }));
  }
}

function turnTo(a, b, max) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.sign(d) * Math.min(Math.abs(d), max);
}
