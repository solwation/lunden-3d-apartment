import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTDOOR_CATS, SEASON } from './config.js';
import { BREEDS, createCatPuppet, catLabel } from './cat.js';
import { OutdoorCatBrain, turnTo } from './outdoorcatbrain.js';
import { registerSeasonal } from './seasons.js';
import { catOut } from './footprinttrail.js';

// #1767: outdoor cats. A few cats of their own roam the courtyard and the river park (OUTDOOR_CATS in config.js): each walks its loop
// (outdoorcatroute.js, a pure function of the wall clock, so every visitor sees roughly the same cat), rests, washes, looks about or
// sleeps. Near the eye the real animated cat (cat.js createCatPuppet), further out one merged mesh, beyond `drawDist` nothing.
// A visitor walking up makes it stop and sit; close enough (and while the ordinary cat is free) it *becomes* the ordinary cat
// (cat.js CatSpawner, sitting outdoors like a cat put down outside, #1287): pet, carry and put down work exactly as for that cat, and
// whatever else that cat can do later (being fed, #1766) comes with it. Walked away from (or put down outdoors and left), it turns
// back into the roaming cat and walks home to its loop; carried off too far, indoors or with a road/water in the way it fades and
// turns up on its loop again later. Hidden in rain (it shelters) and in the snow months, except
// short outings on snow days (#1773, footprinttrail.js catOut, a pure function of the clock) that leave paw prints. Per client, no shared sync.
// #1772: each cat has a personality and a brain (outdoorcatbrain.js) that picks what it does at each rest stop (sleep, wait for
// company, explore, stalk, chase a butterfly, climb a tree) and how it meets the visitor (a social cat walks up and follows a little,
// a shy one keeps away). The brain owns where the cat is (x, z, h above the ground, yaw, pitch) and its state; this file draws it,
// turns it into the ordinary cat and back, and fades it (isOut: sheltering, snow months).

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
   * not road, not water (the way home is checked with it); `lowMemory`: phones draw nearer. #1772: `free(x, z)`: no wall or fence there
   * (outings); `feet` / `crowns`: surroundings.js treeFeet / aoTrees (the trees a cat may climb); `hour()` / `month()`: the game's day;
   * `prey()`: squirrels on the ground [{ x, z }].
   */
  constructor({ scene, camera, cat, ground, walkable = () => true, free = null, feet = [], crowns = [], hour = () => 12, month = () => 7, prey = null, lowMemory = false }) {
    Object.assign(this, { scene, camera, cat, ground, walkable });
    this.drawDist = lowMemory ? C.drawDistPhone : C.drawDist;
    this.now = () => Date.now() / 1000; // tests replace it
    this.winter = false;
    this.rain = 0;
    this.still = 0; // s the visitor has stood still (a shy cat calms)
    this.lastEye = null;
    this.bound = null; // the outdoor cat that is the ordinary cat just now
    this.env = { now: () => this.now(), hour, month, ground, prey, free, clear: (ax, az, bx, bz) => this.clearWay(ax, az, bx, bz), trees: this.climbable(feet, crowns) };
    this.bfGeo = butterflyGeometry();
    this.cats = C.cats.map((spec, id) => this.makeCat(spec, id));
    registerSeasonal((month) => { this.winter = SEASON.snowMonths.includes(month); });
  }

  /** The trees near the loops, each with its crown (for the branch height), like the squirrels' (squirrels.js), and its trunk's radius
   * at the foot and height (`tr`, `th`: surroundings.js trees() and foliage.js trunkGeometry, base radius 0.2 × the trunk's width scale;
   * the tree's scale from its crown). Young maples and weeping trees are too slender or too hanging to climb. */
  climbable(feet, crowns) {
    const near = (f) => C.cats.some((s) => s.route.some(([x, z]) => Math.hypot(f.x - x, f.z - z) < C.brain.reach + C.brain.climbReach));
    const kinds = { big: [4.6, 0.4, 4.6], tree: [2.4, 0.2, 3.2], birch: [1.4, 0.11, 4.4] }; // crown r / s, trunk base radius / s, trunk height / s
    return feet.filter((f) => kinds[f.kind] && near(f)).map((f) => {
      let best = null, bd = 0.05; for (const c of crowns) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const [cr, tr, th] = kinds[f.kind], s = best.r / cr;
      return { x: f.x, z: f.z, y: f.y, cy: best.y, r: best.r, tr: tr * s, th: th * s };
    }).filter(Boolean);
  }

  makeCat(spec, id) {
    const breed = BREEDS.find((b) => b.name === spec.breed) ?? BREEDS[0];
    const coat = breed.coats.find((v) => v.name === spec.coat) ?? breed.coats[0];
    const puppet = createCatPuppet(breed, coat);
    const group = new THREE.Group();
    group.name = `outdoor-cat-${spec.name}`;
    group.visible = false;
    group.rotation.order = 'YXZ'; // (yaw, then the pitch of a cat on a trunk)
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
    // #1772: the butterfly it chases (one mesh, drawn only near, only while it is about)
    const bf = new THREE.Mesh(this.bfGeo, new THREE.MeshLambertMaterial({ color: spec.zone === 'innergården' ? 0xf2dc3c : 0xe8762a, side: THREE.DoubleSide })); // (a brimstone, a small tortoiseshell)
    Object.assign(bf, { visible: false, name: `butterfly-${spec.name}` }); bf.raycast = () => {}; bf.userData.noDetail = true;
    this.scene.add(bf);
    const c = new OutdoorCatBrain(spec, id, this.env);
    Object.assign(c, { breed, coat, puppet, group, lods, lodMat, bfMesh: bf, alpha: 0, awayUntil: 0, found: false, t: Math.random() * 6 });
    return c;
  }

  /** #1772 / #1773: is the cat out at all (not sheltering from the rain, not in the snow months)? The one place that decides it. */
  isOut(c) { return (!this.winter || (!!c && this.snowOut(c))) && this.rain <= C.rain; } // (#1773: a snow-day outing)

  /** Where `c`'s loop has it now. */
  scheduled(c) { return c.scheduled(this.now()); }

  /** #1773: is `c` out on a snow day at `t` (s, the wall clock)? (The snow months hide it otherwise.) */
  snowOut(c, t = this.now()) { return catOut(c.spec, c.id, t - C.epoch + c.spec.phase); }

  place(c, s) { c.x = s.x; c.z = s.z; c.yaw = s.yaw; c.h = 0; c.pitch = 0; c.at = s; }

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
    c.group.visible = false; c.bfMesh.visible = false;
    if (!c.found) { c.found = true; k.onFound?.(catLabel(c.breed, c.coat), !!c.breed.rare, c.breed.name, false); } // found once per visit
  }

  /** The ordinary cat that was `c` is left alone outdoors: `c` takes over again there and walks home (#1772: a social one follows a little first). */
  demote(c) {
    const k = this.cat, p = k.object.position;
    Object.assign(c, { x: p.x, z: p.z, yaw: k.object.rotation.y, h: 0, pitch: 0, alpha: 1 });
    c.set(c.traits.social >= 0.6 ? 'follow' : 'home');
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
    const le = this.lastEye; // how long the visitor has stood still
    this.still = le && dt > 0 && Math.hypot(eye.x - le.x, eye.z - le.z) / dt < 0.25 ? this.still + dt : dt > 0 ? 0 : this.still;
    this.lastEye = { x: eye.x, z: eye.z };
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
    const now = this.now(), out = this.isOut(c);
    if (c.st === 'away') {
      if (now < c.awayUntil) { c.group.visible = false; c.bfMesh.visible = false; return; }
      c.resume(); c.alpha = 0;
    }
    const gy = this.ground(c.x, c.z), d = Math.hypot(eye.x - c.x, eye.y - (Number.isFinite(gy) ? gy : 0) - c.h, eye.z - c.z); // (3D: not drawn from a storey above)
    // the brain: its schedule (loop and outing) and how it meets the visitor; it only plans near the visitor
    c.update(dt, { x: eye.x, z: eye.z, d, ok: !hidden && out && c.alpha > 0.5, still: this.still }, d < this.drawDist + C.brain.margin);
    if (c.lost) { c.st = 'away'; c.awayUntil = now + C.away; } // a road, the river or a drop in the way home, or too far: it fades and comes back later
    if (c.st === 'notice' && d < C.take && c.puppet.stand < 0.05 && c.h < 0.05 && this.catFree()) { this.promote(c); return; }
    // fade (sheltering, away, far) and draw
    const show = !hidden && out && c.st !== 'away';
    c.alpha = THREE.MathUtils.clamp(c.alpha + (show ? dt : -dt) / C.fade, 0, 1);
    const drawn = c.alpha > 0 && d < this.drawDist;
    c.group.visible = drawn;
    if (!drawn) { if (c.st !== 'route' && c.st !== 'home' && c.st !== 'away') c.set('home'); c.bfMesh.visible = false; return; }
    const y = this.ground(c.x, c.z);
    c.group.position.set(c.x, (Number.isFinite(y) ? y : 0) + c.h, c.z);
    c.group.rotation.set(c.pitchShown = turnTo(c.pitchShown ?? 0, c.pitch, dt * 5), c.yaw, 0);
    const full = d < C.near, P = c.puppet, walking = c.walking;
    P.object.visible = full;
    c.lods[0].visible = !full && !walking;
    c.lods[1].visible = !full && walking;
    c.lodMat.opacity = c.alpha;
    for (const m of P.materials) m.opacity = c.alpha;
    if (full) this.animate(c, dt, walking && !c.faceEye, c.moved, c.faceEye ? 'look' : c.activity);
    else P.stand = walking ? 1 : 0;
    // the butterfly, near only
    const b = c.bf, bm = c.bfMesh;
    bm.visible = !!b && full;
    if (bm.visible) {
      const by = this.ground(b.x, b.z);
      bm.position.set(b.x, (Number.isFinite(by) ? by : 0) + b.y, b.z);
      bm.rotation.y = Math.atan2(b.x - (bm.userData.px ?? b.x), b.z - (bm.userData.pz ?? b.z)) || bm.rotation.y;
      bm.userData.px = b.x; bm.userData.pz = b.z;
      bm.scale.set(0.25 + 0.75 * Math.abs(Math.sin(c.t * 16)), 1, 1); // its wings beat
    }
  }

  /** The full cat's pose this frame: walking (creeping, chasing, climbing), or sitting and washing / looking about / asleep /
   * sniffing / crouching / pouncing. */
  animate(c, dt, walking, moved, activity) {
    const P = c.puppet;
    c.t += dt;
    P.walked = false; P.hopY = c.hop ?? 0; P.headOff.set(0, 0, 0);
    const up = activity === 'sniff' || activity === 'crouch' || activity === 'pounce'; // (on its feet without walking)
    P.wantStand = walking || up ? 1 : 0;
    if (walking && P.stand > 0.5 && moved > 0) P.stride(moved);
    const sleep = !walking && activity === 'sleep';
    for (const e of P.eyes) { e.eye.visible = !sleep; e.shut.visible = sleep; }
    P.leftShoulder.rotation.set(0, 0, 0);
    if (walking) {
      P.shoulder.rotation.z = 0;
      if (activity === 'creep') { P.headOff.set(0, -0.035, 0.015); P.head.rotation.set(0.15, 0, 0); P.tailGroup.rotation.y = 0.15 * Math.sin(c.t * 2); }
      else if (activity === 'chase') {
        const hop = c.hop ?? 0; P.head.rotation.set(-0.35, 0, 0); P.tailGroup.rotation.y = 0.5 * Math.sin(c.t * 7);
        P.shoulder.rotation.set(-12 * hop, 0, 0); P.leftShoulder.rotation.set(-12 * hop, 0, 0); // (front paws up after it)
      } else { P.head.rotation.set(activity === 'climb' ? -0.1 : 0.12, 0, 0); P.tailGroup.rotation.y = 0.3 * Math.sin(c.t * 4.5); }
    } else if (activity === 'sniff') {
      P.shoulder.rotation.set(0, 0, 0); P.headOff.set(0, -0.05, 0.03);
      P.head.rotation.set(0.6 + 0.08 * Math.sin(c.t * 9), 0.35 * Math.sin(c.t * 0.8), 0); P.tailGroup.rotation.y = 0.1 * Math.sin(c.t * 1.7);
    } else if (activity === 'crouch' || activity === 'pounce') {
      const hop = c.hop ?? 0; P.headOff.set(0, -0.035 * (1 - hop * 8), 0.015);
      P.shoulder.rotation.set(-12 * hop, 0, 0); P.leftShoulder.rotation.set(-12 * hop, 0, 0);
      P.head.rotation.set(0.2 - 2 * hop, 0, 0); P.tailGroup.rotation.y = 0.5 * Math.sin(c.t * 25) * (1 - hop * 8); // (the bottom wiggle before the leap)
    } else if (activity === 'wash') { // the CatSpawner's washing cycle (cat.js behave)
      const t = c.t, cy = t % 6, sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
      const u = sm(0, 0.5, cy) * (1 - sm(3.2, 3.7, cy)), wipe = sm(2.0, 2.4, cy) * (1 - sm(2.9, 3.2, cy)), lick = Math.sin(t * 13) * 0.5 + 0.5;
      P.shoulder.rotation.set(-2.85 * u - 0.25 * wipe, 0, 0.3 * u + 0.15 * wipe);
      P.head.rotation.set(0.3 * u + 0.08 * lick * u * (1 - wipe) - 0.2 * wipe, 0.4 * u * (1 - wipe) + (1 - u) * 0.35 * Math.sin(t * 0.7), -0.15 * u + 0.3 * wipe);
      P.tailGroup.rotation.y = 0.08 * Math.sin(t * 2.3) * (1 - u);
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
    return this.cats.map((c) => ({ name: c.name, zone: c.spec.zone, kind: c.spec.kind, st: c.st, behaviour: c.kind, activity: c.activity, x: c.x, z: c.z, h: c.h,
      y: c.group.position.y, alpha: c.alpha, visible: c.group.visible, full: c.puppet.object.visible, walking: c.walking, butterfly: c.bfMesh.visible }));
  }
}

/** #1772: a small butterfly: two wings in a shallow V (its x scale beats them), 1 draw call. */
function butterflyGeometry() {
  const w = 0.085, h = 0.03, l = 0.055, p = [
    0, 0, l, -w, h, 0.008, 0, 0, -0.01, 0, 0, l, w, h, 0.008, 0, 0, -0.01, // the fore wings
    0, 0, 0, -w * 0.75, h, -l, 0, 0, -l, 0, 0, 0, w * 0.75, h, -l, 0, 0, -l, // the hind wings
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
