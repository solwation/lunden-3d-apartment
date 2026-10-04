import * as THREE from 'three';
import { CUPS as C, DRINKS as D, CUP_STEAM, COFFEE } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy, Holdable } from './holdable.js';
import { Contents, pourAmount, drinkName } from './drinks.js';

// Coffee cups (#90, #141). Three mugs in the wall cabinet over the Moccamaster: E on one (the cabinet open)
// takes it into the hand, brewed or not. A cup is put down with E on a table top / the worktop / the floor and
// taken again with E; E on the open cabinet while holding one puts it back on its shelf. The glass jug is a
// thing of its own (Jug, a Holdable): E takes it off the hot plate, and with it in the hand E on a cup that
// stands somewhere pours (the jug's level drops by CUPS.pour per cup); E on the hot plate puts it back.
// Brewing only fills the jug while it stands there (coffee.js). One held thing at a time (holdable.js).
// What is in a cup is a Contents (drinks.js, #167): coffee, and whatever else DRINKS.pour.cup lets in.
// Patterns (#215): every cup wears one of DESIGNS (a canvas drawn once per pattern, shared). The cabinet has three
// shelf spots; opening it fills an empty one with a cup of a new random pattern (from the spare pool, or the cup put
// down longest ago once CUPS.maxOut stand outside). A cup put back keeps its pattern. Spare cups are not in the scene.

const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.6 });

const OPEN_DEG = 88; // just short of flat against the tall unit's side (#116)

/** The cup cabinet: a hollow carcass with a shelf and a side-hinged door (a world.lids appliance). */
export function cupCabinet(c) {
  const g = new THREE.Group();
  const w = 0.016, depth = c.back - c.front, zc = (c.z0 + c.z1) / 2, yc = (c.y0 + c.y1) / 2, H = c.y1 - c.y0, W = c.z1 - c.z0;
  const b = (sx, sy, sz, x, y, z, m = white) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  // the carcass like the rest of the row (interior.js `shell`, #264): it starts FT behind the front plane (the door
  // fills that), its outside in the front colour, white inside
  const FT = 0.02, cx0 = c.front + FT, cd = c.back - cx0, cx = cx0 + cd / 2;
  b(cd, w, W, cx, c.y0 + w / 2, zc, c.material); b(cd, w, W, cx, c.y1 - w / 2, zc, c.material);
  b(cd, H, w, cx, yc, c.z0 + w / 2, c.material); b(cd, H, w, cx, yc, c.z1 - w / 2, c.material);
  b(cd, w * 0.06, W - 2 * w, cx, c.y0 + w + 0.0005, zc); b(cd, w * 0.06, W - 2 * w, cx, c.y1 - w - 0.0005, zc); // white linings
  b(cd, H - 2 * w, 0.001, cx, yc, c.z0 + w + 0.0005); b(cd, H - 2 * w, 0.001, cx, yc, c.z1 - w - 0.0005);
  b(w, H, W, c.back - w / 2, yc, zc);
  b(cd - 0.03, 0.014, W - 0.03, cx + 0.01, c.y0 + H * 0.5, zc); // shelf
  // the door: the same shaker front as the rest of the row (interior.js `front`: a 14 mm slab behind a 6 mm raised
  // frame whose face is the row's front plane c.front, 1.5 mm gaps, the bar handle low at the free south edge),
  // hinged at z0 next to the tall oven unit, which stands 25 cm proud of the wall cabinets. Like a real cabinet hinge
  // the pivot sits P in front of the front plane (the handle's outer face), so the door swings clear of the carcass
  // and stops flat against the tall unit's side at OPEN_DEG (#116)
  const P = 0.024, gap = 0.0015;
  const door = new THREE.Group();
  door.position.set(c.front - P, c.y0, c.z0);
  // add(d0, d1, …): d = distance in front of the front plane (negative = behind it), like interior.js `frame`
  const add = (d0, d1, y0, y1, z0, z1, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(d1 - d0, y1 - y0, z1 - z0), m); o.position.set(P - (d0 + d1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.castShadow = true; door.add(o); };
  const a0 = gap, a1 = W - gap, f0 = gap, f1 = H - gap, rw = Math.min(0.06, (f1 - f0) / 4, (a1 - a0) / 4);
  add(-FT, -0.006, f0, f1, a0, a1, c.material);
  add(-0.006, 0, f1 - rw, f1, a0, a1, c.material); add(-0.006, 0, f0, f0 + rw, a0, a1, c.material);
  add(-0.006, 0, f0 + rw, f1 - rw, a0, a0 + rw, c.material); add(-0.006, 0, f0 + rw, f1 - rw, a1 - rw, a1, c.material);
  const L = 0.15, t = 0.012, hz = a1 - rw / 2, hy = f0 + 0.05 + L / 2;
  add(0.012, 0.012 + t, hy - L / 2, hy + L / 2, hz - t / 2, hz + t / 2, c.handle);
  for (const s of [-1, 1]) add(0, 0.012, hy + s * 0.064 - 0.005, hy + s * 0.064 + 0.005, hz - 0.005, hz + 0.005, c.handle);
  const cab = {
    name: 'skåpet', kind: 'appliance', isOpen: false, z0: c.z0, width: W, t: 0, object: door, pickable: door, door, hinge: 'side', lamp: { emissiveIntensity: 0 },
    get verb() { return this.isOpen && heldItem()?.isCup ? 'ställa tillbaka koppen i' : this.isOpen ? 'stänga' : 'öppna'; },
    get blocked() { return this.isOpen && !!heldItem()?.isCup && this.freeSlot?.() < 0; }, // all three spots taken (#215)
    get blockedText() { return this.blocked ? 'Skåpet är fullt' : undefined; },
    toggle() {
      if (this.isOpen && heldItem()?.isCup) { if (this.freeSlot?.() >= 0) heldItem().goHome(); return; } // the held cup back on its shelf (#141)
      this.isOpen = !this.isOpen; sfx.click(door.getWorldPosition(new THREE.Vector3()));
      if (this.isOpen) this.onOpen?.(); // a new cup on every empty spot (#215)
    },
    update(dt) {
      const target = this.isOpen ? 1 : 0;
      this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
      door.rotation.y = -this.t * this.t * (3 - 2 * this.t) * THREE.MathUtils.degToRad(OPEN_DEG);
    },
  };
  door.traverse((m) => { m.userData.door = cab; });
  g.add(door);
  return { object: g, cab, shelfY: c.y0 + w, x: c.front + depth / 2, zc };
}

/** The wisp texture: soft across (u), fading in at the bottom and out at the top (v). */
function wispTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d'), img = g.createImageData(32, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const u = (x + 0.5) / 32, v = 1 - (y + 0.5) / 64; // v 0 = the bottom
    const across = Math.exp(-((u - 0.5) ** 2) / 0.045);
    const along = Math.min(1, v / 0.15) * (1 - v) ** 1.4;
    const i = (y * 32 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * across * along);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
let wisp = null;
const S = CUP_STEAM;

/**
 * Steam over a cup (#216): S.strips thin ribbons in one mesh (one draw call), each a column of S.segments quads that
 * sways as it rises and drifts back when the cup moves. Rebuilt on the CPU each frame while it shows (a few dozen
 * vertices), turned towards the camera about the vertical.
 */
export class Steam {
  constructor() {
    wisp ??= wispTexture();
    const n = S.strips, m = S.segments, verts = n * (m + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) {
      const v = (i * (m + 1) + j) * 2;
      uv.set([0, j / m, 1, j / m], v * 2);
      if (j < m) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.1, 0), 0.2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: wisp, color: 0xf3f5f7, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    Object.assign(this.mesh, { visible: false, castShadow: false, frustumCulled: false, renderOrder: 2 });
    this.mesh.raycast = () => {};
    this.phase = [...Array(n)].map(() => Math.random() * 6.28);
    this.lean = new THREE.Vector3();
  }

  /** y0: the coffee surface (cup-local); k: strength 0…1; t: time; side: the camera's sideways direction (cup-local, horizontal). */
  update(y0, k, t, side, lean) {
    this.mesh.visible = k > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.material.opacity = S.opacity * k;
    const n = S.strips, m = S.segments, p = this.pos, H = S.height * (0.6 + 0.4 * k);
    for (let i = 0; i < n; i++) {
      const ph = this.phase[i], x0 = (i - (n - 1) / 2) * 0.012, sx = side.x, sz = side.z;
      for (let j = 0; j <= m; j++) {
        const a = j / m, y = y0 + a * H;
        const sway = Math.sin(a * 5.5 - t * 1.7 + ph) * 0.018 * a + Math.sin(a * 2.3 - t * 0.9 + ph * 1.7) * 0.009 * a;
        const w = S.width * (0.5 + a * 1.4) * (0.8 + 0.2 * Math.sin(t * 1.3 + ph + a * 3));
        const cx = (x0 * (1 - a * 0.5) + sway) * sx + lean.x * a * a, cz = (x0 * (1 - a * 0.5) + sway) * sz + lean.z * a * a;
        const v = (i * (m + 1) + j) * 2 * 3;
        p[v] = cx - sx * w / 2; p[v + 1] = y; p[v + 2] = cz - sz * w / 2;
        p[v + 3] = cx + sx * w / 2; p[v + 4] = y; p[v + 5] = cz + sz * w / 2;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- patterns (#215) ----------

const PAT_W = 512, PAT_H = 192; // the texture wraps once round the mug; x = 0 is opposite the handle's side
const nameText = (g, text, colour, size = 54) => { g.fillStyle = colour; g.font = `bold ${size}px "Comic Sans MS", "Segoe Print", cursive, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, PAT_W * 0.75, PAT_H / 2); };
const heart = (g, x, y, r) => { g.beginPath(); g.moveTo(x, y + r * 0.9); g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4); g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); g.fill(); };
/** name → { base: the handle / inside colour, draw(g) on a PAT_W × PAT_H canvas }. */
export const DESIGNS = {
  'blue-stripes': { base: 0xf6f6f3, draw(g) { g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#2d5d9a'; for (let y = 14; y < PAT_H; y += 30) g.fillRect(0, y, PAT_W, 12); } },
  'mustard-stripes': { base: 0xf4efe2, draw(g) { g.fillStyle = '#f4efe2'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#d8a530'; for (let x = 0; x < PAT_W; x += 48) g.fillRect(x, 0, 24, PAT_H); } },
  'red-dots': { base: 0xfaf8f4, draw(g) { g.fillStyle = '#faf8f4'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#c8302c'; for (let y = 16, r = 0; y < PAT_H; y += 32, r++) for (let x = (r % 2) * 20 + 10; x < PAT_W; x += 40) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); } } },
  flowers: { base: 0xffffff, draw(g) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, PAT_W, PAT_H); // big poppy-like blooms (our own)
    for (const [x, y, r, c] of [[60, 70, 54, '#e5484d'], [190, 130, 46, '#f39a2b'], [320, 60, 58, '#e5484d'], [450, 140, 50, '#f2c230'], [-60, 140, 50, '#f2c230']]) {
      g.fillStyle = c; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.55, r * 0.42, a, 0, 7); g.fill(); }
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(x, y, r * 0.22, 0, 7); g.fill();
    } } },
  'blue-white': { base: 0xf7f8fb, draw(g) { g.fillStyle = '#f7f8fb'; g.fillRect(0, 0, PAT_W, PAT_H); g.strokeStyle = '#1f3f8a'; g.fillStyle = '#1f3f8a'; g.lineWidth = 4;
    g.fillRect(0, 8, PAT_W, 6); g.fillRect(0, PAT_H - 14, PAT_W, 6);
    for (let x = 32; x < PAT_W; x += 128) { g.beginPath(); g.arc(x + 32, 96, 30, 0, 7); g.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.ellipse(x + 32 + Math.cos(a) * 44, 96 + Math.sin(a) * 44, 10, 5, a, 0, 7); g.fill(); } g.beginPath(); g.arc(x + 32, 96, 10, 0, 7); g.fill(); } } },
  cat: { base: 0xf6f6f3, draw(g) { g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, PAT_W, PAT_H); const x = PAT_W * 0.75; // a cat peeking over the rim
    g.fillStyle = '#3b3b3e'; g.beginPath(); g.ellipse(x, 70, 64, 52, 0, 0, 7); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 58, 40); g.lineTo(x + s * 44, -6); g.lineTo(x + s * 18, 26); g.fill(); }
    g.fillStyle = '#f2d34b'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 24, 66, 11, 14, 0, 0, 7); g.fill(); }
    g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 24, 66, 4, 11, 0, 0, 7); g.fill(); }
    g.fillStyle = '#e88a9b'; g.beginPath(); g.moveTo(x - 7, 86); g.lineTo(x + 7, 86); g.lineTo(x, 94); g.fill();
    g.fillStyle = '#3b3b3e'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 40, 124, 20, 13, 0, 0, 7); g.fill(); } } },
  sarah: { base: 0xfde9ef, draw(g) { g.fillStyle = '#fde9ef'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#e46f93'; heart(g, PAT_W * 0.75, 52, 16); nameText(g, 'Sarah', '#b3305a'); } },
  olof: { base: 0xe6eef7, draw(g) { g.fillStyle = '#e6eef7'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#2d5d9a'; g.fillRect(0, PAT_H - 22, PAT_W, 10); nameText(g, 'Olof', '#1f3f6f'); } },
  hearts: { base: 0x4f8f5a, draw(g) { g.fillStyle = '#4f8f5a'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#ffffff'; for (let y = 30, r = 0; y < PAT_H; y += 52, r++) for (let x = (r % 2) * 32 + 20; x < PAT_W; x += 64) heart(g, x, y, 12); } },
  'black-gold': { base: 0x1c1c1e, draw(g) { g.fillStyle = '#1c1c1e'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#d4af37'; g.fillRect(0, 0, PAT_W, 9); } },
  rainbow: { base: 0xffffff, draw(g) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, PAT_W, PAT_H); ['#e5484d', '#f39a2b', '#f2c230', '#46a758', '#3e8ed0', '#8e4ec6'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 11; g.beginPath(); g.arc(PAT_W * 0.75, PAT_H + 10, 120 - i * 12, Math.PI, 0); g.stroke(); }); } },
  lunden: { base: 0xf4f1ea, draw(g) { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, PAT_W, PAT_H); const x = PAT_W * 0.75; // a little brick house
    g.fillStyle = '#a8432c'; g.fillRect(x - 46, 52, 92, 64); g.fillStyle = '#3b3b3e'; g.beginPath(); g.moveTo(x - 56, 54); g.lineTo(x, 18); g.lineTo(x + 56, 54); g.fill();
    g.fillStyle = '#f6f6f3'; g.fillRect(x - 10, 82, 20, 34); g.fillRect(x - 36, 66, 18, 16); g.fillRect(x + 18, 66, 18, 16);
    g.fillStyle = '#3b3b3e'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('Lunden L1007', x, 150); } },
};
for (const L of 'TKWLSO') DESIGNS[`letter-${L}`] = { base: 0xf6f6f3, draw(g) { g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, PAT_W, PAT_H); g.fillStyle = '#2b2b2b'; g.font = 'bold 140px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, PAT_W * 0.75, PAT_H / 2 + 8); } };
const patTex = new Map();
function patternTexture(design) {
  if (!patTex.has(design)) {
    const c = document.createElement('canvas');
    c.width = PAT_W; c.height = PAT_H;
    (DESIGNS[design] ?? DESIGNS['blue-stripes']).draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    patTex.set(design, t);
  }
  return patTex.get(design);
}

function mugModel() {
  const g = new THREE.Group();
  // the outside wears the pattern (#215); inside, the bottom and the handle are the pattern's base colour
  const body = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r * 0.92, C.h, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  body.position.y = C.h / 2;
  const plain = new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.3, side: THREE.DoubleSide });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(C.r * 0.985, C.r * 0.905, C.h * 0.995, 20, 1, true), new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.3, side: THREE.BackSide }));
  inner.position.y = C.h / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(C.r * 0.92, 20).rotateX(-Math.PI / 2), plain);
  bottom.position.y = 0.004;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16, Math.PI), plain);
  handle.rotation.z = -Math.PI / 2; handle.position.set(C.r + 0.002, C.h * 0.55, 0);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(C.r * 0.94, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.coffee, roughness: COFFEE.roughness }));
  coffee.visible = false;
  g.add(body, inner, bottom, handle, coffee);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, coffee, body, plain, inner };
}

export class Cup {
  constructor(scene, camera, homePos, counter, design) {
    const { g, coffee, body, plain, inner } = mugModel();
    Object.assign(this, { name: 'koppen', placeVerb: 'ställa ner', isCup: true, scene, camera, model: g, coffee, counter, home: homePos.clone(), body, plain, inner, slot: null, placedAt: 0,
      state: 'cabinet', contents: new Contents(), held: false, steamT: 0, heat: 0, coffeeWas: 0, milkWas: 0, grip: [C.r + 0.03, C.h * 0.45, 0] }); // grip: the hand on the handle (#195)
    const cup = this;
    this.target = { get name() { return cup.kask ? 'koppen med kaffekask' : 'koppen'; }, kind: 'cup', pickable: g, cup: this, item: this, get verb() { return cup.verb; },
      get blocked() { return cup.blocked; }, get blockedText() { return cup.blockedText; }, toggle: () => this.press(), overflow: () => this.overflow() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
    g.position.copy(homePos);
    this.setDesign(design);
    this.steam = new Steam();
    g.add(this.steam.mesh);
    this.lastAt = homePos.clone();
  }

  /** Wear pattern `d` (DESIGNS): the outside's texture, the base colour inside / on the handle. */
  setDesign(d) {
    this.design = d;
    this.body.material.map = patternTexture(d);
    this.body.material.needsUpdate = true;
    const base = (DESIGNS[d] ?? DESIGNS['blue-stripes']).base;
    this.plain.color.setHex(base); this.inner.material.color.setHex(base);
  }

  get fill() { return this.contents.total; }
  /** Coffee with a splash of whisky: a kaffekask (#169). */
  get kask() { return this.contents.has('coffee') && this.contents.has('whisky'); }
  /** The jug in the hand, if that is what you hold. */
  get jug() { const h = heldItem(); return h?.isJug ? h : null; }
  /** The held thing that can pour into a cup: the jug, or a drink DRINKS.pour.cup lets in (#167). */
  get source() { const h = heldItem(); return h?.isJug || (h?.drink && D.pour.cup[h.drink]) ? h : null; }
  /** Pouring is possible: a source in the hand and the cup standing out (not in the cabinet, not in the hand). */
  get pourable() { return !!this.source && this.state === 'placed'; }
  get blocked() {
    if (!this.pourable) return handBusy(this);
    return this.jug ? this.fill >= 0.99 : pourAmount('cup', this.source.drink, this.fill) <= 0;
  }
  get blockedText() { return this.pourable ? 'Koppen är full' : null; }
  get verb() {
    if (this.pourable && this.jug) return this.jug.fill > 0.05 ? 'hälla kaffe i' : 'koka kaffe först, sedan hälla i';
    if (this.pourable) return `hälla ${drinkName(this.source.drink)} i`;
    return 'ta';
  }

  /** E on it full anyway, with something that pours in the hand: it runs over (#288); the spill's place and colour, or
   * null (an empty jug pours nothing). main.js makes the splash and the deduction. */
  overflow() {
    const src = this.source;
    if (!this.pourable || !this.blocked || this.contents.pouring) return null;
    const at = this.model.getWorldPosition(new THREE.Vector3());
    if (src.isJug) { if (src.fill < 0.05) return null; src.pour(Math.min(src.fill, 0.05), 1.2); sfx.pour(at); return { at, color: D.coffee.color }; }
    src.pour?.(D.secs);
    sfx.pour(at, D.secs);
    return { at, color: D[src.drink]?.color ?? 0xffffff };
  }

  /** Only coffee, up to `f` (tests). */
  setFill(f) { this.contents.set('coffee', f); this.show(); }

  /** The surface at the level, in the colour of the mix. */
  show() {
    const f = this.fill;
    this.coffee.visible = f > 0.01;
    this.coffee.position.y = 0.006 + (C.h - 0.02) * Math.min(1, f);
    this.contents.color(this.coffee.material.color);
  }

  press() {
    if (this.contents.pouring) return;
    if (this.pourable) this.pourFrom(this.source);
    else this.take();
  }

  /**
   * Pour from what is held: from the jug what it has, up to a full cup (CUPS.pour of the jug per cup, #141);
   * anything else by DRINKS.pour.cup.
   */
  pourFrom(src) {
    const at = this.model.getWorldPosition(new THREE.Vector3());
    if (src.isJug) {
      const want = (1 - this.fill) * C.pour, got = Math.min(want, src.fill);
      if (got < 0.01) { sfx.click(at); return; }
      this.contents.pour('coffee', got / C.pour, 1.2);
      src.pour(got, 1.2);
      sfx.pour(at);
      return;
    }
    let amount = pourAmount('cup', src.drink, this.fill);
    if (!amount) return;
    if (src.ml !== undefined) amount = Math.min(amount, src.ml / D.ml.cup); // the milk carton: what is left in it (#382)
    this.contents.pour(src.drink, amount, D.secs);
    src.pour?.(D.secs, amount * D.ml.cup); // (what went in comes out of the carton, #382)
    sfx.pour(at, D.secs);
  }

  take() {
    if (handBusy(this)) return; // put down what you hold first (#102)
    setHeld(this);
    this.held = true;
    this.state = 'held';
    this.slot = null; // off its shelf spot
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(this.model);
    this.model.position.set(C.held.x, C.held.y, C.held.z);
    this.model.rotation.set(0.1, 0.35, 0); // the handle to the right and a little away: the hand holds it there, behind the mug (#195)
    sfx.click(this.model.getWorldPosition(new THREE.Vector3()));
  }

  /** Put it down at a world point on a table top / the floor (`y` = the surface's height), standing. */
  placeAt(p, yaw = Math.random() * 6) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.placedAt = performance.now();
    this.scene.add(this.model);
    this.poseAt(this.model, p, yaw);
    sfx.click(this.model.position);
  }
  /** Standing at `p`, turned `yaw` (the model or main.js's ghost, #368). */
  poseAt(obj, p, yaw = 0) { obj.position.set(p.x, p.y, p.z); obj.rotation.set(0, yaw, 0); }

  /** Back on a shelf spot in the cabinet (#141): `slot`, or the first free one (cups.js buildCups sets `freeSlot`). */
  goHome(slot = this.slot ?? Math.max(0, this.freeSlot?.() ?? 0)) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'cabinet';
    this.slot = slot;
    if (this.slots) this.home.copy(this.slots[slot]);
    this.scene.add(this.model);
    this.model.position.copy(this.home);
    this.model.rotation.set(0, 0, 0);
    sfx.click(this.home);
  }

  /** Shot to pieces (#263, breaking.js): out of the scene like a spare cup; the cabinet gets a new one when it opens. */
  shatter() { this.held = false; this.state = 'spare'; this.slot = null; this.model.removeFromParent(); }
  mend() {}

  /** Another thing was taken: the cup goes down on the worktop. */
  putBack() { if (this.held) this.placeAt(this.counter); }

  /** A click drinks a sip while there is coffee in it (#117). */
  get useLabel() { return this.held && this.fill > 0.01 ? 'Drick' : null; }
  use() {
    if (!this.held || this.fill <= 0.01 || this.sip > 0) return;
    this.sip = 1;
    const a = this.contents.a, coffee = Math.min(C.sip, this.fill) * (a.coffee ?? 0) / this.fill; // cups of coffee in this sip (#217)
    this.onSip?.(this.kask ? 'kask' : this.contents.main, coffee); // coffee with whisky in it counts as kaffekask (#169)
    sfx.gulp(this.model.getWorldPosition(new THREE.Vector3()));
    this.contents.sip(C.sip);
    this.show();
  }

  update(dt) {
    if (this.held) { // a sip: up to the mouth, tipped, and down again
      this.sip = Math.max(0, (this.sip ?? 0) - dt * 1.6);
      const k = Math.sin(this.sip * Math.PI);
      this.model.position.set(C.held.x - 0.14 * k, C.held.y + 0.15 * k, C.held.z + 0.16 * k);
      this.model.rotation.set(0.1 + 0.9 * k, 0.35, 0);
    }
    if (this.contents.update(dt)) this.show();
    this.updateSteam(dt);
  }

  /** How strongly it steams, 0…1 (#216): hot coffee, more when full, less with milk in it. */
  get steamLevel() {
    const a = this.contents.a, coffee = a.coffee ?? 0, tot = this.fill;
    if (coffee < 0.02 || this.heat <= 0) return 0;
    return this.heat * Math.min(1, (coffee / tot) * 1.15) * (0.45 + 0.55 * Math.min(1, tot));
  }

  updateSteam(dt) {
    // fresh coffee in: hot again; milk in: cooler by its share; then it cools over CUP_STEAM.seconds
    const a = this.contents.a, coffee = a.coffee ?? 0, milk = a.milk ?? 0, tot = this.fill;
    if (coffee > this.coffeeWas + 0.005) this.heat = Math.min(1, this.heat + (coffee - this.coffeeWas) / Math.max(0.05, tot) * 2);
    if (milk > this.milkWas + 0.005 && tot > 0) this.heat = Math.max(0, this.heat - S.milk * (milk - this.milkWas) / tot);
    this.coffeeWas = coffee; this.milkWas = milk;
    if (coffee < 0.02) this.heat = 0;
    else this.heat = Math.max(0, this.heat - dt / S.seconds);
    const k = this.steamLevel;
    this.steamT += dt;
    if (k <= 0.01) { this.steam.update(0, 0); return; }
    // the camera's sideways direction and the drift (from how the cup moves), both in the cup's own frame
    const q = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const at = this.model.getWorldPosition(new THREE.Vector3());
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q);
    side.y = 0; if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const vel = at.clone().sub(this.lastAt).divideScalar(Math.max(dt, 1e-3));
    this.lastAt.copy(at);
    const want = vel.multiplyScalar(-S.drift).clampLength(0, 0.06).applyQuaternion(q);
    this.steam.lean.lerp(want.setY(0), Math.min(1, dt * 4));
    this.steam.update(this.coffee.position.y + 0.004, k, this.steamT, side, this.steam.lean);
  }
}

/** The Moccamaster's glass jug (#141): take it off the hot plate, pour into cups, put it back on the plate. */
export class Jug extends Holdable {
  constructor(scene, camera, mocca) {
    const model = mocca.jug;
    model.updateWorldMatrix(true, false);
    const pos = model.getWorldPosition(new THREE.Vector3()), rot = new THREE.Euler().setFromQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    model.removeFromParent();
    super(scene, camera, {
      name: 'kannan', verb: 'ta', backName: 'kaffebryggarens platta', backVerb: 'ställa tillbaka kannan på', placeVerb: 'ställa ner',
      model, home: { pos, rot },
      heldPose: { pos: new THREE.Vector3(C.jugHeld.x, C.jugHeld.y, C.jugHeld.z), rot: new THREE.Euler(0, -1.4, 0) }, // handle to the right
      pick: { pos: pos.clone().setY(pos.y + 0.09), size: [0.2, 0.2, 0.2] }, cooldown: 0.3, // pouring = E on a cup
    });
    Object.assign(this, { isJug: true, drink: 'coffee', mocca, tilt: 0, tiltT: 0 });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down (holdable.js would lay it on its side)
    mocca.jugHolder = this;
  }

  get fill() { return this.mocca.fill; }
  get atHome() { return !this.held && !this.placed; }

  /** Pour `amount` (of a full jug) over `secs` seconds: the level drops, the jug tips forward meanwhile. */
  pour(amount, secs) {
    this.mocca.setFill(Math.max(0, this.mocca.fill - amount));
    this.tiltT = secs;
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    const target = this.tiltT > 0 ? 1 : 0;
    this.tilt += (target - this.tilt) * Math.min(1, dt * 8);
    this.model.rotation.set(0, -1.4, -1.1 * this.tilt); // tips its spout towards the cup
  }
}

/** The cabinet, the cups, and the "put it down here" target while a cup is held. */
export function buildCups(scene, camera, world, cabinetBox) {
  const mocca = world.lids.find((l) => l.kind === 'coffee');
  const cab = cupCabinet(cabinetBox);
  scene.add(cab.object);
  world.lids.push(cab.cab);
  const counterY = world.cupSurfaces?.find((s) => s.userData.counter)?.userData.surface ?? cabinetBox.counterY;
  const counter = new THREE.Vector3(C.counter.x, counterY, C.counter.z);
  const slots = [...Array(C.n)].map((_, i) => new THREE.Vector3(cab.x - 0.02, cab.shelfY, cab.zc + (i - 1) * 0.11));
  // three random patterns to start with (&cups=i,j,k picks them for screenshots)
  const asked = new URLSearchParams(location.search).get('cups')?.split(',').map(Number);
  const pool = [...C.designs];
  const pick = (not = []) => { const free = pool.filter((d) => !not.includes(d)); return free[Math.floor(Math.random() * free.length)] ?? pool[0]; };
  const first = [];
  for (let i = 0; i < C.n; i++) first.push(asked?.[i] !== undefined && C.designs[asked[i]] ? C.designs[asked[i]] : pick(first));
  // the pool: the cabinet's cups and up to maxOut more; the spare ones are not in the scene
  const cups = [...Array(C.n + C.maxOut)].map((_, i) => new Cup(scene, camera, slots[i % C.n], counter, first[i] ?? pick()));
  const inCab = () => cups.filter((c) => c.state === 'cabinet');
  const freeSlot = () => slots.findIndex((_, i) => !inCab().some((c) => c.slot === i));
  cups.forEach((c, i) => {
    Object.assign(c, { slots, freeSlot });
    if (i < C.n) { c.slot = i; return; }
    c.state = 'spare';
    c.model.removeFromParent();
  });
  /** Opening the cabinet (#215): every empty shelf spot gets a new cup with a pattern not already in there. */
  function refill() {
    for (let i = freeSlot(); i >= 0; i = freeSlot()) {
      let c = cups.find((x) => x.state === 'spare');
      if (!c) c = cups.filter((x) => x.state === 'placed').sort((a, b) => a.placedAt - b.placedAt)[0]; // the oldest out goes
      if (!c) return;
      c.contents.clear(); c.heat = 0; c.coffeeWas = c.milkWas = 0; c.show();
      c.setDesign(pick(inCab().map((x) => x.design)));
      c.goHome(i);
    }
  }
  /** F: every cup outside the cabinet goes, the cabinet is full. */
  function reset() {
    for (const c of cups) if (c.state === 'placed') { c.state = 'spare'; c.model.removeFromParent(); }
    refill();
  }
  cab.cab.onOpen = refill;
  cab.cab.freeSlot = freeSlot;
  const jug = new Jug(scene, camera, mocca);
  return { cups, jug, cabinet: cab.cab, refill, reset, slots, group: [cab.object, ...cups.map((c) => c.model)], update(dt) { for (const c of cups) if (c.state !== 'spare') c.update(dt); } };
}
