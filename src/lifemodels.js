import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Models for the life simulator's things (#366): plain shapes of our own, no brands. Each builder returns
// { object, show(item, items), anchors?, grip? }: `object` has its origin at the bottom centre and lies the way it rests
// on a worktop at yaw 0 (long side along x); `show` makes it look like the instance's state (a shorter cucumber, an open
// butter pack); a carrier's `anchors` are its spots (local Object3Ds, slot order) — what lies on it becomes their child,
// so it rides along. LIFE-009 … give the food its final look; these are the first versions.

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const M = {
  porcelain: std(0xf7f6f2, 0.2), rim: std(0xd9dde0, 0.25),
  wood: std(0xc49a62, 0.7), woodEnd: std(0xa77c48, 0.75),
  cucumber: std(0x2f5d2a, 0.45), cucumberIn: std(0xcfe3a6, 0.6), cucumberRim: std(0x3d6b31, 0.5),
  cheese: std(0xf0cf62, 0.55), rind: std(0xd9a73a, 0.6),
  foil: std(0xe9c75b, 0.35, { metalness: 0.35 }), butter: std(0xf7e39a, 0.5), lid: std(0xf4f1e6, 0.5),
  bag: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false }),
  clip: std(0x2f6fc4, 0.5), crust: std(0x9a6332, 0.7), crumb: std(0xe8d3a8, 0.85),
  steel: std(0xc9cdd0, 0.25, { metalness: 0.7 }), handle: std(0x222222, 0.55), peasBag: std(0x2f7d32, 0.35),
};

/** A printed label of our own (#373: no real brands): a canvas with a background, a wordmark and a small line under it. */
function label(text, { w = 256, h = 128, bg = '#f4f1e6', fg = '#2b2b2b', sub = '', subColor = fg, band = null, font = 'bold 54px Georgia, serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (band) { g.fillStyle = band; g.fillRect(0, h * 0.72, w, h * 0.28); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font; g.fillText(text, w / 2, h * (sub ? 0.4 : 0.5));
  if (sub) { g.fillStyle = subColor; g.font = `${Math.round(h * 0.16)}px sans-serif`; g.fillText(sub, w / 2, h * 0.86); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
}
const LABELS = {};
/** One material per label kind, made the first time it is needed (canvas work only for things that exist). */
const labelOf = (k, make) => (LABELS[k] ??= make());

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function anchor(parent, x, y, z, yaw = 0) { const a = new THREE.Object3D(); a.position.set(x, y, z); a.rotation.y = yaw; parent.add(a); return a; }

/** A dinner plate Ø 26 cm (a lathe): six spots, one in the middle and five round it. */
function plate() {
  const g = new THREE.Group();
  const prof = [[0.0001, 0], [0.085, 0], [0.09, 0.004], [0.1, 0.006], [0.13, 0.02], [0.128, 0.022], [0.098, 0.009], [0.0001, 0.007]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 40), M.porcelain));
  const anchors = [anchor(g, 0, 0.007, 0)];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; anchors.push(anchor(g, Math.cos(a) * 0.065, 0.008, Math.sin(a) * 0.065, -a)); }
  return { object: g, anchors, grip: [0.12, 0.012, 0.03] };
}

/** A wooden cutting board 40 × 26 cm: spot 0 for what is being cut along the back half, eight result spots in two rows of
 * four along the front half (#375: a cucumber never lies over a slice). */
function board() {
  const g = new THREE.Group();
  const t = 0.022;
  const b = mesh(new RoundedBoxGeometry(0.4, t, 0.26, 2, 0.006), M.wood);
  b.position.y = t / 2;
  g.add(b);
  const anchors = [anchor(g, -0.03, t, -0.068)];
  for (let k = 0; k < 8; k++) anchors.push(anchor(g, -0.135 + (k % 4) * 0.075 + Math.floor(k / 4) * 0.035, t + 0.0005, 0.005 + Math.floor(k / 4) * 0.06));
  return { object: g, anchors, grip: [0.19, t / 2, 0.08] };
}

/** A cucumber (full: 30 cm, Ø 4.4 cm), along x; shorter as it is cut, with a pale cut face at the +x end. */
function cucumber() {
  const g = new THREE.Group(), r = 0.022, L = 0.3;
  const body = mesh(new THREE.CapsuleGeometry(r, L - 2 * r, 6, 16).rotateZ(Math.PI / 2), M.cucumber);
  body.position.y = r;
  const face = mesh(new THREE.CircleGeometry(r * 0.97, 20).rotateY(Math.PI / 2), labelOf('cucumberFace', cucumberFace));
  face.position.set(L / 2, r, 0);
  face.visible = false;
  g.add(body, face);
  return {
    object: g, grip: [-0.08, r, 0.02],
    show(item, items) {
      const full = items.def(item)?.amount ?? 300, k = Math.max(0.05, item.amount / full);
      body.scale.set(k, 1, 1);
      body.position.x = -(1 - k) * L / 2; // the left end stays, the cut end moves in
      face.position.x = L / 2 - (1 - k) * L;
      face.visible = k < 0.999;
    },
  };
}

/** The cut face of a cucumber (#376): pale green flesh, a darker green skin ring, a star of three seed lobes with seeds. */
function cucumberFace() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), m = 64;
  g.fillStyle = '#2f5d2a'; g.beginPath(); g.arc(m, m, 64, 0, Math.PI * 2); g.fill();          // skin
  g.fillStyle = '#9fc46e'; g.beginPath(); g.arc(m, m, 59, 0, Math.PI * 2); g.fill();          // the green under the skin
  const fl = g.createRadialGradient(m, m, 6, m, m, 56); fl.addColorStop(0, '#e9f3c8'); fl.addColorStop(1, '#cfe3a6');
  g.fillStyle = fl; g.beginPath(); g.arc(m, m, 55, 0, Math.PI * 2); g.fill();                // flesh
  for (let k = 0; k < 3; k++) {                                                               // the seed lobes
    const a = k * Math.PI * 2 / 3 - Math.PI / 2;
    g.fillStyle = 'rgba(214,232,170,0.95)'; g.beginPath(); g.ellipse(m + Math.cos(a) * 18, m + Math.sin(a) * 18, 20, 12, a, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f7df';
    for (let j = -2; j <= 2; j++) { const b = a + j * 0.22; g.beginPath(); g.ellipse(m + Math.cos(b) * 24, m + Math.sin(b) * 24, 3.4, 1.8, b, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 });
}

/** A cucumber slice: Ø 4.2 cm, 4 mm thick, the seeds face on both sides, a dark rim (#376). */
function cucumberSlice() {
  const g = new THREE.Group(), r = 0.021, h = 0.004;
  const rim = mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), M.cucumberRim);
  rim.position.y = h / 2;
  g.add(rim);
  const face = labelOf('cucumberFace', cucumberFace);
  for (const y of [0, h]) { const c = mesh(new THREE.CircleGeometry(r, 20).rotateX(y ? -Math.PI / 2 : Math.PI / 2), face); c.position.y = y; g.add(c); }
  return { object: g };
}

/** A block of cheese (full: 12 × 7 × 6 cm), shorter as it is sliced. */
function cheese() {
  const g = new THREE.Group(), L = 0.12;
  const b = mesh(new THREE.BoxGeometry(L, 0.06, 0.07), [M.cheese, M.rind, M.rind, M.rind, M.rind, M.rind]);
  b.position.y = 0.03;
  // a label on the rind's long side (our own: "Gårdsost", #373), stays at the uncut end
  const tag = mesh(new THREE.PlaneGeometry(0.06, 0.03), labelOf('cheese', () => label('Gårdsost', { bg: '#fff6d8', fg: '#7a4a12', sub: 'mellanlagrad 28 %', band: '#e2b33c' })));
  tag.position.set(-0.025, 0.03, 0.0352);
  const tag2 = tag.clone(); tag2.rotation.y = Math.PI; tag2.position.z = -0.0352;
  g.add(b, tag, tag2);
  return { object: g, show(item, items) { const k = Math.max(0.05, item.amount / (items.def(item)?.amount ?? 500)); b.scale.x = k; b.position.x = -(1 - k) * L / 2; tag.visible = tag2.visible = k > 0.55; } };
}

/** A pack of butter (12 × 7 × 5 cm) in gold paper; open: the lid off, the butter inside shorter as it is used. */
function butter() {
  const g = new THREE.Group();
  const tub = mesh(new THREE.BoxGeometry(0.12, 0.045, 0.07), M.foil);
  tub.position.y = 0.0225;
  const lid = mesh(new THREE.BoxGeometry(0.124, 0.008, 0.074), M.lid);
  lid.position.y = 0.049;
  const fat = mesh(new THREE.BoxGeometry(0.11, 0.004, 0.062), M.butter);
  fat.position.y = 0.046;
  fat.visible = false;
  const top = mesh(new THREE.PlaneGeometry(0.11, 0.06).rotateX(-Math.PI / 2), labelOf('butter', () => label('Smör', { bg: '#f6e7a6', fg: '#3c5a1e', sub: 'normalsaltat · 500 g', band: '#d9b13f' })));
  top.position.y = 0.0042;
  lid.add(top);
  g.add(tub, lid, fat);
  return {
    object: g,
    show(item, items) {
      lid.visible = item.pkg !== 'open' && item.pkg !== 'empty';
      const k = item.amount / (items.def(item)?.amount ?? 500);
      fat.visible = !lid.visible && k > 0.001;
      fat.scale.x = Math.max(0.05, k); fat.position.x = -(1 - fat.scale.x) * 0.055;
    },
  };
}

/** A bag of sliced bread (a loaf in a clear bag with a blue clip), along x; shorter as slices are taken. */
function breadBag() {
  const g = new THREE.Group(), L = 0.3;
  const loaf = mesh(new RoundedBoxGeometry(L, 0.1, 0.11, 2, 0.02), M.crust);
  loaf.position.y = 0.05;
  const bag = mesh(new THREE.BoxGeometry(L + 0.06, 0.106, 0.116), M.bag);
  bag.position.set(0.02, 0.053, 0);
  const clip = mesh(new THREE.BoxGeometry(0.012, 0.03, 0.04), M.clip);
  clip.position.set(L / 2 + 0.05, 0.05, 0);
  // the bag's print on both long sides (our own: "Lantlimpa", #373)
  const print = labelOf('bread', () => { const m = label('Lantlimpa', { bg: '#fbf3e2', fg: '#8a3b12', sub: 'skivad · 12 skivor', band: '#c98a3a', font: 'italic bold 50px Georgia, serif' }); m.transparent = true; m.opacity = 0.92; return m; });
  for (const z of [1, -1]) { const p = mesh(new THREE.PlaneGeometry(0.14, 0.06), print); p.position.set(-0.04, 0.055, z * 0.0585); if (z < 0) p.rotation.y = Math.PI; g.add(p); }
  g.add(loaf, bag, clip);
  return {
    object: g,
    show(item, items) {
      const k = item.amount / (items.def(item)?.amount ?? 12);
      loaf.visible = k > 0.001;
      loaf.scale.x = Math.max(0.05, k); loaf.position.x = -(1 - loaf.scale.x) * L / 2;
      clip.visible = item.pkg === 'closed';
    },
  };
}

/** A bag of frozen peas (20 × 14 cm, lying flat, ~4 cm), its print on top (our own: "Gröna ärter", #373). */
function peas() {
  const g = new THREE.Group();
  const bag = mesh(new RoundedBoxGeometry(0.2, 0.04, 0.14, 3, 0.016), M.peasBag);
  bag.position.y = 0.02;
  const top = mesh(new THREE.PlaneGeometry(0.17, 0.115).rotateX(-Math.PI / 2), labelOf('peas', () => label('Gröna ärter', { bg: '#2f7d32', fg: '#ffffff', sub: 'djupfrysta · 500 g', subColor: '#e8f5c8', band: '#1d5a22', font: 'bold 42px sans-serif' })));
  top.position.y = 0.0405;
  g.add(bag, top);
  return { object: g, grip: [0.08, 0.02, 0.04] };
}

/** A slice of bread (11 × 10 cm, 1.2 cm). */
function breadSlice() {
  const g = new THREE.Group();
  const s = mesh(new RoundedBoxGeometry(0.11, 0.012, 0.1, 2, 0.004), [M.crust, M.crust, M.crumb, M.crumb, M.crust, M.crust]);
  s.position.y = 0.006;
  g.add(s);
  return { object: g };
}

/** A kitchen knife, 30 cm, along x (the handle at −x). */
function knife() {
  const g = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(0.18, 0.002, 0.035), M.steel);
  blade.position.set(0.06, 0.009, 0);
  const handle = mesh(new RoundedBoxGeometry(0.12, 0.018, 0.024, 2, 0.006), M.handle);
  handle.position.set(-0.09, 0.009, 0);
  g.add(blade, handle);
  return { object: g, grip: [-0.09, 0.009, 0] };
}

/** A butter knife, 20 cm, along x: a short round-tipped steel blade and a pale wooden handle (#374). */
function butterKnife() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.01); shape.lineTo(0.07, -0.011); shape.absarc(0.07, 0, 0.011, -Math.PI / 2, Math.PI / 2, false); shape.lineTo(0, 0.01); shape.closePath();
  const blade = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.0015, bevelEnabled: false }).rotateX(Math.PI / 2), M.steel);
  blade.position.set(0.0, 0.007, 0);
  const handle = mesh(new RoundedBoxGeometry(0.11, 0.014, 0.02, 2, 0.006), M.wood);
  handle.position.set(-0.055, 0.007, 0);
  g.add(blade, handle);
  return { object: g, grip: [-0.06, 0.007, 0] };
}

/** A cheese slicer, 24 cm, along x: a flat steel paddle with its slot and a black handle (#374). */
function cheeseSlicer() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.012); shape.lineTo(0.04, -0.032); shape.lineTo(0.11, -0.032); shape.quadraticCurveTo(0.125, -0.032, 0.125, -0.017);
  shape.lineTo(0.125, 0.017); shape.quadraticCurveTo(0.125, 0.032, 0.11, 0.032); shape.lineTo(0.04, 0.032); shape.lineTo(0, 0.012); shape.closePath();
  const slot = new THREE.Path(); slot.moveTo(0.05, -0.02); slot.lineTo(0.056, -0.02); slot.lineTo(0.056, 0.02); slot.lineTo(0.05, 0.02); slot.closePath();
  shape.holes.push(slot);
  const paddle = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.0015, bevelEnabled: false }).rotateX(Math.PI / 2), M.steel);
  paddle.position.y = 0.005;
  const handle = mesh(new RoundedBoxGeometry(0.115, 0.012, 0.022, 2, 0.005), M.handle);
  handle.position.set(-0.057, 0.006, 0);
  g.add(paddle, handle);
  return { object: g, grip: [-0.06, 0.006, 0] };
}

const BUILDERS = { plate, board, cucumber, cucumberSlice, cheese, butter, breadBag, breadSlice, knife, peas, butterKnife, cheeseSlicer };

/** The model of a type (its `model` builder; a grey box when there is none). */
export function buildModel(def) {
  const b = BUILDERS[def?.model];
  if (b) return b();
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), std(0x999999));
  m.position.y = 0.025;
  g.add(m);
  return { object: g };
}
