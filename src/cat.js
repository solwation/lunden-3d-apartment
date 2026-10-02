import * as THREE from 'three';
import { LEVELS, CAT_FISH, CAT_LEAVE, CAT_FURNITURE, REST } from './config.js';
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
  { name: 'perser', weight: 3, rare: true, voice: 'trill', fluff: 1.3, head: 1.15, muzzle: 0.55, ears: 0.6, tail: 1.6, pitch: 1.2,
    coats: [coat('vit'), solid('gräddvit', 0xe8d8b8, 0xd08a2a), coat('grå')] },
  { name: 'sphynx', weight: 1, rare: true, voice: 'rasp', fluff: 0.82, ears: 1.7, tail: 0.6, head: 0.95, pitch: 1.25,
    coats: [solid('naken', 0xd8b0a4, 0x7fb3e6, { ear: 0xcf9f95, tip: 0xc99b90 })] },
];

// Names for the cats you meet (one is picked when a new cat turns up).
export const CAT_NAMES = [
  'Misse', 'Findus', 'Smulan', 'Doris', 'Majken', 'Sixten', 'Selma', 'Morris', 'Nala', 'Luna',
  'Molly', 'Pricken', 'Sotis', 'Kurre', 'Ronja', 'Bamse', 'Muffin', 'Kanel', 'Saffran', 'Pepparkaka',
  'Ludde', 'Tussan', 'Gizmo', 'Mysan', 'Frasse', 'Signe', 'Ebba', 'Totoro', 'Pelle Svanslös', 'Maja',
  'Elvis', 'Kattis', 'Bellman', 'Greta', 'Dunder', 'Plutten', 'Mimmi', 'Nisse', 'Tiger', 'Lakrits',
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

const fur = () => new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true });
const ROLE = { coat: fur(), bib: fur(), paw: fur(), face: fur(), blaze: fur(), ear: fur(), tail: fur(), tip: fur() };
const pink = new THREE.MeshStandardMaterial({ color: 0xd99a9a, roughness: 0.6, transparent: true });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9bbf3a, roughness: 0.3, emissiveIntensity: 0.25, transparent: true });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, transparent: true });
/** The cat's own materials (not the visitor's hand): faded out as it leaves (#206). */
const catMats = () => [...Object.values(ROLE), pink, eyeMat, pupilMat];
const skin = new THREE.MeshStandardMaterial({ color: 0xe8b996, roughness: 0.7 });

const PET_TIME = 4.5; // seconds of purring per pat
const STARS = 28;     // star particles around a rare cat while it is petted

/** Soft five-pointed star with a glow, for the stars around a petted rare cat. */
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,240,180,0.9)');
  glow.addColorStop(0.35, 'rgba(255,220,120,0.25)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff6d0';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 7 : 18, a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(32 + r * Math.cos(a), 32 + r * Math.sin(a));
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

/** Stars drifting up around the cat (one Points object, additive; colour = brightness). */
function buildStars() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STARS * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STARS * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.09, map: starTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  pts.frustumCulled = false;
  pts.visible = false;
  pts.raycast = () => {}; // Points pick within 1 m by default: never steal the cat's E target
  // each star: its own start in the cycle, angle around the cat and tint (gold … pale pink/blue)
  pts.userData.seeds = [...Array(STARS)].map((_, i) => ({
    phase: i / STARS, angle: i * 2.39996, tint: [[1, 0.8, 0.3], [1, 0.85, 0.45], [1, 0.7, 0.85], [0.8, 0.85, 1]][i % 4],
  }));
  return pts;
}

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

  // front legs, each on a shoulder pivot: the right one lifts to the face, both swing when it walks (#163)
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.04, 0.17, 0.085);
  leftShoulder.add(limb(ROLE.paw, 0.021, 0.17, 0, 0, 0), blob(ROLE.paw, 0.026, 0.017, 0.035, 0, -0.158, 0.015));
  cat.add(leftShoulder);
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

  return { cat, head, shoulder, leftShoulder, tailGroup, eyes, hand, torso, muzzle, ears, tail, tailCurve };
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
    this.chance = { appear: CHANCE_APPEAR, steal: CHANCE_STEAL, vanish: CHANCE_VANISH, furniture: CAT_FURNITURE.chance };
    this.parts = buildCat();
    const { cat, head, shoulder, leftShoulder, tailGroup, eyes, hand } = this.parts;
    Object.assign(this, { object: cat, head, shoulder, leftShoulder, tailGroup, eyes, hand });
    this.headHome = head.position.clone();
    this.fish = null;          // a fish finger on the floor it is after (#163): { f, phase, t, at }
    this.fishSource = null;    // () => the fish fingers lying out (main.js)
    this.onFishEaten = null;   // (fishFinger) => {} when it has eaten one
    this.watchPoint = null;    // () => where the visitor's eyes are (it looks after a fish finger taken away)
    this.fishScan = 0;
    // look at the cat + E pets it (main.js treats this like a door target)
    this.interact = { name: 'katten', kind: 'cat', verb: 'klappa', pickable: cat };
    cat.traverse((o) => { o.userData.door = this.interact; });
    this.stars = buildStars(); // only for rare cats while they are petted
    cat.add(this.stars);
    this.petT = 0;            // seconds of petting left
    this.petPhase = 0;
    this.petFrom = null;      // where the visitor stands
    this.onFound = null;      // (variant) => {} when a new cat turns up
    this.onPet = null;        // () => {} when a pat starts
    cat.visible = false;
    this.setCat(BREEDS[0], VARIANTS[0]);
    this.catName = CAT_NAMES[0];
    this.nextMeow = 0;
    this.door = null;          // door the cat was found behind
    this.closedSince = false;  // that door has been closed since the cat appeared
    this.t = 0;
  }

  get visible() { return this.object.visible; }

  /** Meow right away (the lightsaber touched it, #96). */
  meowNow() { if (this.visible && !this.petting) this.nextMeow = 0; }

  /** Rare breeds have their own voice (meow + purr in audio.js); null = the ordinary cat. */
  get voice() { return this.breed.rare ? this.breed.voice ?? null : null; }

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
    this.dropFish();
    this.leaving = null;
    this.setOpacity(1);
  }

  setOpacity(a) { for (const m of catMats()) m.opacity = a; }

  get petting() { return this.petT > 0; }

  /** The visitor (standing at `from`) pets the cat: it purrs, shuts its eyes and rubs the hand. */
  pet(from) {
    if (!this.visible) return;
    const p = this.object.position;
    this.dropFish(); // petting beats a fish finger
    if (this.leaving) { this.leaving = null; this.setOpacity(1); this.object.position.y = this.leaveY ?? this.object.position.y; } // petted again on its way: it stays
    if (!this.petting) {
      this.petPhase = 0;
      this.photoTaken = false;
      this.onPet?.();
      sfx.purr({ x: p.x, y: p.y + 0.3, z: p.z }, PET_TIME, this.variant.pitch * (this.breed.pitch ?? 1), this.voice);
    }
    this.petT = PET_TIME;
    this.petFrom = { x: from.x, z: from.z };
    this.nextMeow = Math.max(this.nextMeow, PET_TIME + 2);
  }

  stopPetting() {
    this.petT = 0;
    this.stars.visible = false;
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
      this.catName = CAT_NAMES[Math.floor(this.rand() * CAT_NAMES.length)];
      this.onFound?.(catLabel(breed, coat), !!breed.rare);
    }
    this.stopPetting();
    this.dropFish();
    this.leaving = null;
    this.setOpacity(1);
    this.nextMeow = 0.4 + this.rand() * 0.8;
    this.object.position.set(spot.x, spot.y, spot.z);
    this.object.rotation.y = spot.yaw;
    this.on = spot.on ?? null; // 'sit' / 'lie' / 'table' when it is up on the furniture (#200)
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
    // sometimes up on a bed, a sofa, a chair or a table in that room instead (#200)
    if (this.rand() < (this.chance.furniture ?? 0)) {
      const up = this.furnitureSpot(level, y0, [sx, sz], [nx, nz], door);
      if (up) return up;
    }
    for (let i = 0; i < 120; i++) {
      // 0.4–3 m in, more often close to the door (rooms with a big bed by the door have little floor, #91)
      const r = this.rand(), dist = 0.4 + r * r * 2.6, lat = (this.rand() - 0.5) * 3;
      const x = center[0] + nx * dist - nz * lat, z = center[1] + nz * dist + nx * lat;
      if (stairHeight(x, z) !== null) continue;
      if (segs.some((s) => distToSeg(x, z, s) < 0.24)) continue;
      if (segs.some((s) => segIntersect(sx, sz, x, z, s))) continue;
      const yaw = Math.atan2(center[0] - x, center[1] - z) + (this.rand() - 0.5) * 1.6;
      return { x, y: y0, z, yaw };
    }
    return null;
  }

  /**
   * A seat, bed or table top in the room beyond the door (#200), seen straight from the doorway (sx, sz) (no wall or other
   * door in between), in front of it (direction n) and within CAT_FURNITURE.reach. The height comes from a ray down onto
   * the furniture there, so the cat sits on the cushion / mattress, and never in something standing on a table.
   */
  furnitureSpot(level, y0, [sx, sz], [nx, nz], door) {
    const W = this.world;
    if (W.furnitureOn === false) return null;
    const walls = [...(W.levels[level].wallSegments ?? []), ...W.doors.filter((d) => d !== door).map((d) => d.segment())];
    const cands = [];
    for (const t of W.furnitureTargets ?? []) {
      if (t.kind !== 'rest' || (t.level ?? 0) !== level) continue;
      for (const sp of t.spots) {
        if (sp.pc) continue; // the gaming chair / the film spot: they start things
        cands.push({ x: sp.pos.x, z: sp.pos.z, y: sp.pos.y - (sp.kind === 'lie' ? REST.lieEye : REST.sitEye), kind: sp.kind });
      }
    }
    const box = new THREE.Box3();
    for (const m of W.cupSurfaces ?? []) {
      box.setFromObject(m);
      const sy = m.userData.surface;
      if (Math.abs(sy - (y0 + 0.75)) > 0.6 || box.max.x - box.min.x < 0.4 || box.max.z - box.min.z < 0.4) continue;
      for (let k = 0; k < 3; k++) cands.push({ x: box.min.x + 0.15 + this.rand() * (box.max.x - box.min.x - 0.3), z: box.min.z + 0.15 + this.rand() * (box.max.z - box.min.z - 0.3), y: sy, kind: 'table' });
    }
    // shuffle, then the first that works
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    ray.camera = new THREE.PerspectiveCamera(); // sprites in the furniture need one to be raycast
    const furniture = W.looseItems ?? [];
    for (const c of cands) {
      const ahead = (c.x - sx) * nx + (c.z - sz) * nz, dist = Math.hypot(c.x - sx, c.z - sz);
      if (ahead < 0.2 || dist > CAT_FURNITURE.reach || Math.abs(c.y - y0) > 1.3) continue;
      if (walls.some((sg) => segIntersect(sx, sz, c.x, c.z, sg))) continue;
      // what is really there: the first visible surface under the spot must be about where we expect it
      ray.set(o.set(c.x, c.y + 0.6, c.z), down); ray.far = 1.0;
      const hit = ray.intersectObjects(furniture, true).find((h) => h.object.isMesh && this.shownMesh(h.object));
      if (!hit || hit.point.y < c.y - 0.12 || hit.point.y > c.y + 0.3) continue; // cushions, pillows and duvets stand a little proud
      const yaw = Math.atan2(sx - c.x, sz - c.z) + (this.rand() - 0.5) * 0.8; // facing the doorway, more or less
      return { x: c.x, y: hit.point.y, z: c.z, yaw, on: c.kind };
    }
    return null;
  }

  /** Is this mesh actually shown (it and its parents visible, not the cat itself)? Pick boxes are invisible. */
  shownMesh(m) {
    for (let p = m; p; p = p.parent) { if (!p.visible || p === this.object) return false; }
    return true;
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    if (this.petting) {
      this.updatePetting(dt);
      return;
    }
    if (this.leaving) { this.updateLeaving(dt); return; } // after a pat it walks off and is gone (#206)
    if (!this.on && this.updateFish(dt)) return; // after a fish finger on the floor (#163; not while up on the furniture)
    // meow when found, then now and then
    this.nextMeow -= dt;
    if (this.nextMeow <= 0) {
      const p = this.object.position;
      sfx.meow({ x: p.x, y: p.y + 0.3, z: p.z }, this.variant.pitch * (this.breed.pitch ?? 1) * (0.92 + this.rand() * 0.16), this.voice);
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

  // --- walking off after a pat (#206) -------------------------------------------------------------------------
  /** Pick a way out: away from the visitor, the longest clear straight walk (up to CAT_LEAVE.dist) among a fan of directions. */
  leave() {
    const o = this.object, p = o.position, f = this.petFrom ?? { x: p.x, z: p.z - 1 };
    if (this.on) { // up on the furniture: it turns away and fades where it is
      this.leaveY = p.y;
      this.leaving = { t: 0, yaw: Math.atan2(p.x - f.x, p.z - f.z), d: 0, gone: 0, from: o.rotation.y };
      return;
    }
    const away = Math.atan2(p.x - f.x, p.z - f.z), segs = this.obstacles();
    let best = null;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2]) {
      const yaw = away + off;
      let d = 0;
      for (let s = 0.25; s <= CAT_LEAVE.dist; s += 0.25) {
        const x = p.x + Math.sin(yaw) * s, z = p.z + Math.cos(yaw) * s;
        if (stairHeight(x, z) !== null || segs.some((sg) => distToSeg(x, z, sg) < 0.16) || segs.some((sg) => segIntersect(p.x, p.z, x, z, sg))) break;
        d = s;
      }
      if (!best || d > best.d + 0.3) best = { yaw, d };
    }
    this.leaveY = p.y;
    this.leaving = { t: 0, yaw: best.yaw, d: best.d, gone: 0, from: o.rotation.y };
    this.shoulder.rotation.set(0, 0, 0);
  }

  updateLeaving(dt) {
    const L = this.leaving, o = this.object;
    L.t += dt;
    // turn round (0.5 s), then walk off; fade out over the last CAT_LEAVE.fade s of the walk (or in place if boxed in)
    const turn = Math.min(1, L.t / 0.5);
    let dy = L.yaw - L.from; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    o.rotation.y = L.from + dy * turn * turn * (3 - 2 * turn);
    if (turn >= 1) {
      const go = Math.min(CAT_LEAVE.speed * dt, Math.max(0, L.d - L.gone));
      o.position.x += Math.sin(L.yaw) * go; o.position.z += Math.cos(L.yaw) * go;
      L.gone += go;
      const g = Math.sin(L.t * 9);
      this.shoulder.rotation.set(0.45 * g, 0, 0);
      this.leftShoulder.rotation.set(-0.45 * g, 0, 0);
      this.head.rotation.set(0.1, 0, 0);
      this.tailGroup.rotation.y = 0.3 * Math.sin(L.t * 4.5);
    }
    const walkTime = L.d / CAT_LEAVE.speed + 0.5, fadeFrom = Math.max(0.5, walkTime - CAT_LEAVE.fade);
    const a = 1 - THREE.MathUtils.clamp((L.t - fadeFrom) / CAT_LEAVE.fade, 0, 1);
    this.setOpacity(a);
    if (a <= 0) { this.hide(); this.onLeft?.(); }
  }

  // --- a fish finger on the floor (#163) ---------------------------------------------------------------
  /** Which level the cat is on, and the walls + doors there (as they are now). */
  obstacles() {
    const level = this.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0;
    const onLevel = (d) => (d.object.position.y < LEVELS[0].floor + 1.6 ? 0 : 1) === level;
    return [...this.world.levels[level].segments, ...this.world.doors.filter(onLevel).map((d) => d.segment())];
  }

  /** Can it walk straight from where it sits to (x, z)? Nothing in the way, the spot itself free, no stairs. */
  clearPath(x, z) {
    const p = this.object.position, segs = this.obstacles();
    if (stairHeight(x, z) !== null) return false;
    if (segs.some((s) => segIntersect(p.x, p.z, x, z, s))) return false;
    return !segs.some((s) => distToSeg(x, z, s) < 0.1);
  }

  /** Look for a fish finger lying on the cat's floor within reach, in the open (same room). */
  findFish() {
    const p = this.object.position, v = new THREE.Vector3();
    let best = null, bestD = CAT_FISH.reach;
    for (const f of this.fishSource?.() ?? []) {
      if (f.state !== 'placed') continue;
      f.middle(v);
      if (Math.abs(v.y - p.y) > 0.05) continue; // on a table, or on another floor
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD && this.clearPath(v.x, v.z)) { best = f; bestD = d; }
    }
    return best;
  }

  dropFish() {
    if (this.fish?.phase === 'eat') this.fish.f.model.scale.setScalar(1); // interrupted: the fish finger is whole again
    this.fish = null;
    this.head.position.copy(this.headHome);
    this.leftShoulder.rotation.set(0, 0, 0);
  }

  /** Turn the head towards world point `q` (eased by k). */
  lookTowards(q, k = 1) {
    const o = this.object;
    let yaw = Math.atan2(q.x - o.position.x, q.z - o.position.z) - o.rotation.y;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.head.rotation.set(0.2 * k, THREE.MathUtils.clamp(yaw, -1.1, 1.1) * k, 0);
  }

  /** The fish finger behaviour; true while it runs (the washing waits). */
  updateFish(dt) {
    if (!this.fish) {
      this.fishScan -= dt;
      if (this.fishScan > 0 || !this.fishSource) return false;
      this.fishScan = 0.4;
      const f = this.findFish();
      if (!f) return false;
      this.fish = { f, phase: 'notice', t: 0, at: f.middle(new THREE.Vector3()) };
      this.nextMeow = 0; // a meow at once: "is that for me?"
      this.shoulder.rotation.set(0, 0, 0);
    }
    const F = this.fish, o = this.object, size = this.breed.size ?? 1;
    F.t += dt;
    this.nextMeow -= dt;
    if (this.nextMeow <= 0) {
      sfx.meow({ x: o.position.x, y: o.position.y + 0.3, z: o.position.z }, this.variant.pitch * (this.breed.pitch ?? 1), this.voice);
      this.nextMeow = 6 + this.rand() * 6;
    }
    // taken away before it got there: it only looks after it (at the visitor) for a while
    if (F.phase !== 'look' && F.f.state !== 'placed') {
      F.phase = 'look'; F.t = 0; F.f.model.scale.setScalar(1);
      this.head.position.copy(this.headHome); this.leftShoulder.rotation.set(0, 0, 0); this.shoulder.rotation.set(0, 0, 0);
    }
    if (F.phase === 'look') {
      this.lookTowards(this.watchPoint?.() ?? F.at, Math.min(1, F.t * 3));
      if (F.t > CAT_FISH.look) this.dropFish();
      return true;
    }
    if (F.phase === 'notice') { // turns its head to it, then gets up
      this.lookTowards(F.at, Math.min(1, F.t * 3));
      if (F.t > CAT_FISH.notice) { F.phase = 'walk'; F.t = 0; }
      return true;
    }
    if (F.phase === 'walk') {
      const dx = F.at.x - o.position.x, dz = F.at.z - o.position.z, dist = Math.hypot(dx, dz);
      const stop = CAT_FISH.stop * size;
      o.rotation.y = Math.atan2(dx, dz);
      const go = Math.min(CAT_FISH.speed * dt, Math.max(0, dist - stop));
      const nx = o.position.x + (dx / dist) * go, nz = o.position.z + (dz / dist) * go;
      if (go > 0 && this.obstacles().some((s) => distToSeg(nx, nz, s) < 0.08)) { F.phase = 'look'; F.t = 0; return true; } // blocked: gives up
      o.position.x = nx; o.position.z = nz;
      // a simple gait: the front legs swing in turn, the head bobs, the tail sways
      const g = Math.sin(F.t * 9);
      this.shoulder.rotation.set(0.45 * g, 0, 0);
      this.leftShoulder.rotation.set(-0.45 * g, 0, 0);
      this.head.rotation.set(0.15 + 0.05 * Math.abs(g), 0, 0);
      this.head.position.set(this.headHome.x, this.headHome.y - 0.01 * Math.abs(g), this.headHome.z);
      this.tailGroup.rotation.y = 0.25 * Math.sin(F.t * 4.5);
      if (dist - stop < 0.01) { F.phase = 'eat'; F.t = 0; F.chew = 0; this.shoulder.rotation.set(0, 0, 0); this.leftShoulder.rotation.set(0, 0, 0); }
      return true;
    }
    // eat: the head goes down to the floor, the fish finger shrinks, small munching sounds; then a purr
    const down = Math.min(1, F.t / 0.4);
    this.head.position.set(this.headHome.x, this.headHome.y - 0.2 * down, this.headHome.z + 0.09 * down);
    this.head.rotation.set(0.8 * down + 0.08 * Math.sin(F.t * 14), 0, 0);
    F.f.model.scale.setScalar(Math.max(0.05, 1 - F.t / CAT_FISH.eat));
    F.chew -= dt;
    if (F.chew <= 0 && F.t < CAT_FISH.eat) { sfx.chew(F.at, 0.45); F.chew = 0.6; }
    if (F.t >= CAT_FISH.eat) {
      F.f.model.scale.setScalar(1);
      this.onFishEaten?.(F.f);
      sfx.purr({ x: o.position.x, y: o.position.y + 0.3, z: o.position.z }, 3, this.variant.pitch * (this.breed.pitch ?? 1), this.voice);
      this.dropFish();
      this.t = 0; // then it sits down and washes itself
      this.nextMeow = 8 + this.rand() * 8;
    }
    return true;
  }

  updatePetting(dt) {
    this.petT -= dt;
    this.petPhase += dt;
    if (!this.photoTaken && this.petPhase >= 0.7) { this.photoTaken = true; this.onPhoto?.(); } // eyes shut, the hand there: a photo (game time, it walks off afterwards, #206)
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
    if (this.breed.rare) this.updateStars(k);
    if (this.petT <= 0) { this.stopPetting(); this.leave(); }
  }

  /** Stars rise in a slow spiral around the cat and fade, faded in/out with the pat (`k`). */
  updateStars(k) {
    const st = this.stars, pos = st.geometry.attributes.position, col = st.geometry.attributes.color;
    st.visible = true;
    st.userData.seeds.forEach((sd, i) => {
      const life = (this.petPhase / 1.8 + sd.phase) % 1;
      const a = sd.angle + life * 1.8, r = 0.16 + 0.08 * life;
      pos.setXYZ(i, Math.sin(a) * r, 0.12 + 0.5 * life, Math.cos(a) * r);
      const b = k * Math.sin(Math.PI * life) * (0.7 + 0.3 * Math.sin(this.petPhase * 9 + i)); // twinkle
      col.setXYZ(i, sd.tint[0] * b, sd.tint[1] * b, sd.tint[2] * b);
    });
    pos.needsUpdate = col.needsUpdate = true;
  }
}
