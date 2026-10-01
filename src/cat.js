import * as THREE from 'three';
import { LEVELS } from './config.js';
import { stairHeight } from './stairs.js';
import { sfx } from './audio.js';

// A cat (random coat) that sometimes turns up behind a door you open, sitting and
// washing itself. Close the door and open it again and it has either left or moved.

const CHANCE_APPEAR = 0.3;   // opening a door with no cat behind it
const CHANCE_STEAL = 0.12;   // the cat is elsewhere but sneaks in here instead
const CHANCE_VANISH = 0.5;   // reopening the cat's door: gone (else it moved)

// Coat variants: colour per body part. A new cat is picked each time one appears.
export const VARIANTS = [
  { name: 'svartvit', coat: 0x17181a, bib: 0xf4f2ee, paw: 0xf4f2ee, face: 0xf4f2ee, blaze: 0xf4f2ee, ear: 0x17181a, tail: 0x17181a, tip: 0xf4f2ee, eye: 0x9bbf3a, pitch: 1.0 },
  { name: 'rödrandig', coat: 0xc06a2b, bib: 0xf0d6b0, paw: 0xf0d6b0, face: 0xf0d6b0, blaze: 0xc06a2b, ear: 0xb05f24, tail: 0xb86426, tip: 0x8a4519, eye: 0xd9a21b, pitch: 0.9 },
  { name: 'grå', coat: 0x7b8188, bib: 0xe6e6e2, paw: 0xe6e6e2, face: 0xd8d8d4, blaze: 0x7b8188, ear: 0x6d737a, tail: 0x7b8188, tip: 0x5f656b, eye: 0xd8b23a, pitch: 1.1 },
  { name: 'svart', coat: 0x131314, bib: 0x161617, paw: 0x161617, face: 0x161617, blaze: 0x131314, ear: 0x131314, tail: 0x131314, tip: 0x131314, eye: 0xe3c41f, pitch: 0.95 },
  { name: 'vit', coat: 0xf2f0ea, bib: 0xf7f6f2, paw: 0xf7f6f2, face: 0xf7f6f2, blaze: 0xf2f0ea, ear: 0xf2f0ea, tail: 0xf2f0ea, tip: 0xf2f0ea, eye: 0x6aa6e0, pitch: 1.25 },
  { name: 'siames', coat: 0xe6d9c2, bib: 0xefe5d3, paw: 0x4a3428, face: 0x4a3428, blaze: 0x4a3428, ear: 0x3f2c22, tail: 0x4a3428, tip: 0x3a281e, eye: 0x5f9fe3, pitch: 1.35 },
  { name: 'röd och vit', coat: 0xc8742f, bib: 0xf4f0e8, paw: 0xf4f0e8, face: 0xf4f0e8, blaze: 0xf4f0e8, ear: 0xc8742f, tail: 0xc8742f, tip: 0xf4f0e8, eye: 0xc9b23a, pitch: 1.05 },
];

// Breeds: shape + which coats they come in, with a weight (how common). Rare breeds count as
// "ovanliga katter" in the statistics. Shape factors: size (whole cat), fluff (body width),
// ears, muzzle (length), tail (thickness), head.
const solid = (name, coat, eye, extra = {}) => ({
  name, coat, bib: coat, paw: coat, face: coat, blaze: coat, ear: coat, tail: coat, tip: coat, eye, pitch: 1, ...extra,
});
const coat = (name) => VARIANTS.find((v) => v.name === name);
export const BREEDS = [
  { name: 'huskatt', weight: 70, coats: VARIANTS.filter((v) => v.name !== 'siames') },
  { name: 'siames', weight: 8, coats: [coat('siames')], ears: 1.35, fluff: 0.88, pitch: 1.1 },
  { name: 'brittiskt korthår', weight: 7, coats: [solid('blå', 0x7f8b97, 0xd98a2b)], fluff: 1.15, head: 1.12, ears: 0.8, muzzle: 1.1, pitch: 0.9 },
  { name: 'maine coon', weight: 6, size: 1.3, fluff: 1.15, ears: 1.25, tail: 1.9, pitch: 0.8,
    coats: [coat('rödrandig'), coat('grå'), solid('brunrandig', 0x6e5640, 0xc9a43a, { bib: 0xe8dcc8, paw: 0xe8dcc8 })] },
  { name: 'norsk skogkatt', weight: 5, size: 1.2, fluff: 1.2, tail: 1.8, pitch: 0.85,
    coats: [coat('svartvit'), coat('grå'), coat('vit')] },
  { name: 'perser', weight: 3, rare: true, fluff: 1.3, head: 1.15, muzzle: 0.55, ears: 0.6, tail: 1.6, pitch: 1.2,
    coats: [coat('vit'), solid('gräddvit', 0xe8d8b8, 0xd08a2a), coat('grå')] },
  { name: 'sphynx', weight: 1, rare: true, fluff: 0.82, ears: 1.7, tail: 0.6, head: 0.95, pitch: 1.25,
    coats: [solid('naken', 0xd8b0a4, 0x7fb3e6, { ear: 0xcf9f95, tip: 0xc99b90 })] },
];

/** Random breed (by weight) and one of its coats. */
export function pickCat(rand = Math.random) {
  const total = BREEDS.reduce((n, b) => n + b.weight, 0);
  let r = rand() * total;
  const breed = BREEDS.find((b) => (r -= b.weight) < 0) ?? BREEDS[0];
  return { breed, coat: breed.coats[Math.floor(rand() * breed.coats.length)] };
}

/** Name for the statistics: "svartvit" for a huskatt, otherwise "maine coon (grå)". */
export const catLabel = (breed, coat) => (breed.name === 'huskatt' ? coat.name : `${breed.name} (${coat.name})`);

const fur = () => new THREE.MeshStandardMaterial({ roughness: 0.8 });
const ROLE = { coat: fur(), bib: fur(), paw: fur(), face: fur(), blaze: fur(), ear: fur(), tail: fur(), tip: fur() };
const pink = new THREE.MeshStandardMaterial({ color: 0xd99a9a, roughness: 0.6 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9bbf3a, roughness: 0.3, emissiveIntensity: 0.25 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
const skin = new THREE.MeshStandardMaterial({ color: 0xe8b996, roughness: 0.7 });

const PET_TIME = 4.5; // seconds of purring per pat

export function applyVariant(v) {
  for (const [role, m] of Object.entries(ROLE)) m.color.setHex(v[role]);
  eyeMat.color.setHex(v.eye);
  eyeMat.emissive.setHex(v.eye);
}

function blob(material, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function limb(material, r, len, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 10), material);
  m.position.set(x, y - len / 2, z);
  m.castShadow = true;
  return m;
}

/** Sitting cat, ~35 cm tall, facing +z in its local frame. */
function buildCat() {
  const cat = new THREE.Group();

  // body + haunches + bib (in a torso group the breed can widen)
  const torso = new THREE.Group();
  const body = blob(ROLE.coat, 0.11, 0.17, 0.13, 0, 0.17, -0.01);
  body.rotation.x = -0.25;
  torso.add(body);
  torso.add(blob(ROLE.coat, 0.075, 0.075, 0.11, 0.07, 0.075, -0.03), blob(ROLE.coat, 0.075, 0.075, 0.11, -0.07, 0.075, -0.03));
  torso.add(blob(ROLE.bib, 0.07, 0.12, 0.05, 0, 0.19, 0.085));
  cat.add(torso);
  // hind paws
  cat.add(blob(ROLE.paw, 0.035, 0.02, 0.055, 0.075, 0.015, 0.05), blob(ROLE.paw, 0.035, 0.02, 0.055, -0.075, 0.015, 0.05));

  // front legs: left fixed, right on a shoulder pivot so it can lift to the face
  cat.add(limb(ROLE.paw, 0.021, 0.17, -0.04, 0.17, 0.085));
  cat.add(blob(ROLE.paw, 0.026, 0.017, 0.035, -0.04, 0.012, 0.1));
  const shoulder = new THREE.Group();
  shoulder.position.set(0.04, 0.17, 0.085);
  shoulder.add(limb(ROLE.paw, 0.021, 0.17, 0, 0, 0));
  const paw = blob(ROLE.paw, 0.026, 0.017, 0.035, 0, -0.158, 0.015);
  shoulder.add(paw);
  cat.add(shoulder);

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.325, 0.05);
  head.add(blob(ROLE.coat, 0.072, 0.064, 0.068, 0, 0, 0));
  const muzzle = blob(ROLE.face, 0.042, 0.032, 0.035, 0, -0.022, 0.05);
  head.add(muzzle);
  head.add(blob(pink, 0.009, 0.007, 0.006, 0, -0.008, 0.083));           // nose
  head.add(blob(ROLE.blaze, 0.016, 0.03, 0.01, 0, 0.03, 0.058));              // blaze
  const eyes = [], ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.055, 4), ROLE.ear);
    ear.position.set(s * 0.042, 0.063, -0.005);
    ear.rotation.set(-0.15, Math.PI / 4, s * -0.3);
    ear.castShadow = true;
    head.add(ear);
    ears.push(ear);
    // eyes on a lid pivot so they can close (scale y → 0) while being petted
    const eye = new THREE.Group();
    eye.position.set(s * 0.028, 0.012, 0.06);
    eye.add(blob(eyeMat, 0.014, 0.012, 0.008, 0, 0, 0), blob(pupilMat, 0.004, 0.01, 0.004, 0, 0, 0.007));
    head.add(eye);
    // closed eye: a thin dark line, shown instead
    const shut = blob(pupilMat, 0.013, 0.0018, 0.004, s * 0.028, 0.01, 0.066);
    shut.visible = false;
    head.add(shut);
    eyes.push({ eye, shut });
  }
  cat.add(head);

  // tail curled around the side onto the floor, with a tip
  const pts = [[0, 0.04, -0.13], [0.09, 0.025, -0.12], [0.14, 0.02, -0.02], [0.12, 0.02, 0.08], [0.06, 0.02, 0.13]]
    .map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const tailGroup = new THREE.Group();
  const tailCurve = new THREE.CatmullRomCurve3(pts);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 24, 0.017, 8), ROLE.tail);
  tail.castShadow = true;
  tailGroup.add(tail, blob(ROLE.tip, 0.02, 0.018, 0.03, 0.06, 0.02, 0.13));
  cat.add(tailGroup);

  // the visitor's hand, shown while petting (palm + four fingers + thumb, palm down)
  const hand = new THREE.Group();
  hand.add(blob(skin, 0.045, 0.016, 0.05, 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.05 - Math.abs(i - 1.5) * 0.008, 4, 8), skin);
    f.rotation.x = Math.PI / 2 + 0.25;
    f.position.set((i - 1.5) * 0.019, -0.008, 0.075);
    hand.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 4, 8), skin);
  thumb.rotation.set(Math.PI / 2, 0, 0.9);
  thumb.position.set(0.05, -0.01, 0.02);
  hand.add(thumb);
  hand.visible = false;
  cat.add(hand);

  return { cat, head, shoulder, tailGroup, eyes, hand, torso, muzzle, ears, tail, tailCurve };
}

/** Shape the cat for a breed (see BREEDS). */
function applyBreed(p, b) {
  const size = b.size ?? 1, fluff = b.fluff ?? 1;
  p.cat.scale.setScalar(size);
  p.hand.scale.setScalar(1 / size); // the visitor's hand stays the same size
  p.torso.scale.set(fluff, 1, fluff);
  p.head.scale.setScalar(b.head ?? 1);
  for (const e of p.ears) e.scale.setScalar(b.ears ?? 1);
  p.muzzle.scale.set(0.042, 0.032, 0.035 * (b.muzzle ?? 1));
  p.muzzle.position.z = 0.05 - 0.035 * (1 - (b.muzzle ?? 1)) * 0.6;
  p.tail.geometry.dispose();
  p.tail.geometry = new THREE.TubeGeometry(p.tailCurve, 24, 0.017 * (b.tail ?? 1), 8);
  for (const m of Object.values(ROLE)) m.roughness = b.name === 'sphynx' ? 0.55 : 0.8;
}

const smooth = (a, b, t) => {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

function segIntersect(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function distToSeg(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export class CatSpawner {
  constructor(world, rand = Math.random) {
    this.world = world;
    this.rand = rand;
    this.chance = { appear: CHANCE_APPEAR, steal: CHANCE_STEAL, vanish: CHANCE_VANISH };
    this.parts = buildCat();
    const { cat, head, shoulder, tailGroup, eyes, hand } = this.parts;
    Object.assign(this, { object: cat, head, shoulder, tailGroup, eyes, hand });
    // look at the cat + E pets it (main.js treats this like a door target)
    this.interact = { name: 'katten', kind: 'cat', verb: 'klappa', pickable: cat };
    cat.traverse((o) => { o.userData.door = this.interact; });
    this.petT = 0;            // seconds of petting left
    this.petPhase = 0;
    this.petFrom = null;      // where the visitor stands
    this.onFound = null;      // (variant) => {} when a new cat turns up
    this.onPet = null;        // () => {} when a pat starts
    cat.visible = false;
    this.setCat(BREEDS[0], VARIANTS[0]);
    this.nextMeow = 0;
    this.door = null;          // door the cat was found behind
    this.closedSince = false;  // that door has been closed since the cat appeared
    this.t = 0;
  }

  get visible() { return this.object.visible; }

  setCat(breed, coat) {
    this.breed = breed;
    this.variant = coat;
    applyVariant(coat);
    applyBreed(this.parts, breed);
  }

  /** Call when the player opens `door` from `from` (player position). */
  onOpen(door, from) {
    if (door.name === 'ytterdörren') return;
    if (this.visible && this.door === door) {
      if (!this.closedSince) return;
      if (this.rand() < this.chance.vanish) this.hide();
      else this.placeBehind(door, from);
      return;
    }
    const chance = this.visible ? this.chance.steal : this.chance.appear;
    if (this.rand() < chance) this.placeBehind(door, from);
  }

  onClose(door) {
    if (this.door === door) this.closedSince = true;
  }

  hide() {
    this.object.visible = false;
    this.door = null;
    this.stopPetting();
  }

  get petting() { return this.petT > 0; }

  /** The visitor (standing at `from`) pets the cat: it purrs, shuts its eyes and rubs the hand. */
  pet(from) {
    if (!this.visible) return;
    const p = this.object.position;
    if (!this.petting) {
      this.petPhase = 0;
      this.onPet?.();
      sfx.purr({ x: p.x, y: p.y + 0.3, z: p.z }, PET_TIME, this.variant.pitch * (this.breed.pitch ?? 1));
    }
    this.petT = PET_TIME;
    this.petFrom = { x: from.x, z: from.z };
    this.nextMeow = Math.max(this.nextMeow, PET_TIME + 2);
  }

  stopPetting() {
    this.petT = 0;
    this.hand.visible = false;
    for (const e of this.eyes) { e.eye.visible = true; e.shut.visible = false; }
  }

  placeBehind(door, from) {
    const spot = door.kind === 'wardrobe' ? this.wardrobeSpot(door) : this.roomSpot(door, from);
    if (!spot) return;
    // a cat turning up from nowhere is a new cat; one that just moved keeps its coat
    if (!this.visible) {
      const { breed, coat } = pickCat(this.rand);
      this.setCat(breed, coat);
      this.onFound?.(catLabel(breed, coat), !!breed.rare);
    }
    this.stopPetting();
    this.nextMeow = 0.4 + this.rand() * 0.8;
    this.object.position.set(spot.x, spot.y, spot.z);
    this.object.rotation.y = spot.yaw;
    this.object.visible = true;
    this.door = door;
    this.closedSince = false;
    this.t = this.rand() * 4;
  }

  /** Inside the wardrobe, in the half the opened panel uncovered. */
  wardrobeSpot(door) {
    const w = door.wardrobe;
    const mid = door.closedPos + (this.rand() - 0.5) * (door.len - 0.35);
    const depth = w.back + w.outward * 0.3;
    const yaw = w.along ? (w.outward > 0 ? 0 : Math.PI) : (w.outward > 0 ? Math.PI / 2 : -Math.PI / 2);
    return w.along
      ? { x: mid, z: depth, y: w.y0 + 0.08, yaw }
      : { x: depth, z: mid, y: w.y0 + 0.08, yaw };
  }

  /** Random free floor spot on the far side of the door, visible from the doorway. */
  roomSpot(door, from) {
    const { center, normal } = door.opening();
    const y0 = door.object.position.y < LEVELS[0].floor + 1.6 ? LEVELS[0].floor : LEVELS[1].floor;
    const level = y0 > LEVELS[0].floor + 1.6 ? 1 : 0;
    // walls + the other doors on this level as they are now + this door in its open pose
    const onLevel = (d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === level;
    const segs = [
      ...this.world.levels[level].segments,
      ...this.world.doors.filter((d) => d !== door && onLevel(d)).map((d) => d.segment()),
      door.segmentAt(1),
    ];
    const side = Math.sign((from.x - center[0]) * normal[0] + (from.z - center[1]) * normal[1]) || 1;
    const nx = -side * normal[0], nz = -side * normal[1];
    const sx = center[0] + nx * 0.35, sz = center[1] + nz * 0.35;
    for (let i = 0; i < 60; i++) {
      const dist = 0.6 + this.rand() * 2.4, lat = (this.rand() - 0.5) * 3;
      const x = center[0] + nx * dist - nz * lat, z = center[1] + nz * dist + nx * lat;
      if (stairHeight(x, z) !== null) continue;
      if (segs.some((s) => distToSeg(x, z, s) < 0.24)) continue;
      if (segs.some((s) => segIntersect(sx, sz, x, z, s))) continue;
      const yaw = Math.atan2(center[0] - x, center[1] - z) + (this.rand() - 0.5) * 1.6;
      return { x, y: y0, z, yaw };
    }
    return null;
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    if (this.petting) {
      this.updatePetting(dt);
      return;
    }
    // meow when found, then now and then
    this.nextMeow -= dt;
    if (this.nextMeow <= 0) {
      const p = this.object.position;
      sfx.meow({ x: p.x, y: p.y + 0.3, z: p.z }, this.variant.pitch * (this.breed.pitch ?? 1) * (0.92 + this.rand() * 0.16));
      this.nextMeow = 8 + this.rand() * 14;
    }
    // washing cycle: lift paw, lick it a few times, wipe over the face, lower, pause
    const c = this.t % 6;
    const up = smooth(0.0, 0.5, c) * (1 - smooth(3.2, 3.7, c));
    const wipe = smooth(2.0, 2.4, c) * (1 - smooth(2.9, 3.2, c));
    const lick = Math.sin(this.t * 13) * 0.5 + 0.5;
    // paw almost straight up beside the muzzle; the head turns down to it and licks
    this.shoulder.rotation.x = -2.85 * up - 0.25 * wipe;
    this.shoulder.rotation.z = 0.3 * up + 0.15 * wipe;
    this.head.rotation.x = 0.3 * up + 0.08 * lick * up * (1 - wipe) - 0.2 * wipe;
    this.head.rotation.y = 0.4 * up * (1 - wipe);
    this.head.rotation.z = -0.15 * up + 0.3 * wipe;
    // idle: slow look around + tail tip twitch
    const idle = 1 - up;
    this.head.rotation.y += idle * 0.35 * Math.sin(this.t * 0.7);
    this.tailGroup.rotation.y = 0.08 * Math.sin(this.t * 2.3) * idle;
  }

  updatePetting(dt) {
    this.petT -= dt;
    this.petPhase += dt;
    const k = Math.min(1, this.petPhase / 0.4) * Math.min(1, this.petT / 0.4); // ease in/out
    const closed = this.petPhase > 0.3 && this.petT > 0.2;
    for (const e of this.eyes) { e.eye.visible = !closed; e.shut.visible = closed; }
    // head turns towards the visitor, tips up into the hand and rubs side to side
    const o = this.object, f = this.petFrom ?? { x: o.position.x, z: o.position.z + 1 };
    let yaw = Math.atan2(f.x - o.position.x, f.z - o.position.z) - o.rotation.y;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const rub = Math.sin(this.petPhase * 2.6);
    this.head.rotation.set(-0.3 * k, THREE.MathUtils.clamp(yaw, -0.9, 0.9) * 0.5 * k + 0.25 * rub * k, 0.35 * rub * k);
    this.shoulder.rotation.set(0, 0, 0);
    this.tailGroup.rotation.y = 0.15 * Math.sin(this.petPhase * 1.3);
    // the hand strokes from the forehead back along the neck, following the rub
    const s = (Math.sin(this.petPhase * 2.6 - Math.PI / 2) + 1) / 2; // 0 = head, 1 = back
    this.hand.visible = this.petT > 0.15;
    this.hand.position.set(0.02 * rub, 0.42 - 0.07 * s, 0.07 - 0.17 * s);
    this.hand.rotation.set(0.25 - 0.35 * s, Math.PI, 0);
    if (this.petT <= 0) this.stopPetting();
  }
}
