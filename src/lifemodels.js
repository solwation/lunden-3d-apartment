import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EGG } from './config.js';
import { wateringCan } from './wateringmodels.js';
import { hallJacket, hallShoes } from './hallmodels.js';
import { laundryClothes } from './laundrymodels.js';
import { eggCarton, rawEgg, friedEgg } from './eggmodels.js';
import { Contents, GlassLiquid } from './drinks.js';

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
  toastCrust: std(0x6e3c15, 0.7), toastCrumb: std(0xc8964e, 0.8),
  steel: std(0xc9cdd0, 0.25, { metalness: 0.7 }), handle: std(0x222222, 0.55), peasBag: std(0x2f7d32, 0.35),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false }),
  cheeseSlice: std(0xf6dc7e, 0.5), binBag: std(0x1d1d1f, 0.6), binHeap: std(0x2a2a2c, 0.75),
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
/** A dirty smear (#383): a soft translucent disc of radius r lying at height y, hidden until shown. */
function smear(r, color, y) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.y = y; m.visible = false; m.raycast = () => {}; m.renderOrder = 1;
  return m;
}
/** A smear on a blade lying along x (#383): w × d at x, on its top at y. */
function bladeSmear(w, d, color, x, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  m.position.set(x, y, 0); m.visible = false; m.raycast = () => {};
  return m;
}
function anchor(parent, x, y, z, yaw = 0) { const a = new THREE.Object3D(); a.position.set(x, y, z); a.rotation.y = yaw; parent.add(a); return a; }

/** A dinner plate Ø 26 cm (a lathe): six spots, one in the middle and five round it. */
function plate() {
  const g = new THREE.Group();
  const prof = [[0.0001, 0], [0.085, 0], [0.09, 0.004], [0.1, 0.006], [0.13, 0.02], [0.128, 0.022], [0.098, 0.009], [0.0001, 0.007]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 40), M.porcelain));
  const anchors = [anchor(g, 0, 0.007, 0)];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; anchors.push(anchor(g, Math.cos(a) * 0.065, 0.008, Math.sin(a) * 0.065, -a)); }
  // crumbs once it has been eaten from (#380): a few small bits of crust and crumb on the well
  const crumbs = new THREE.Group();
  crumbs.name = 'crumbs';
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4, r = 0.012 + (k * 37 % 60) / 1000, sz = 0.002 + (k % 3) * 0.0012;
    const c = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.7, sz * 1.2), k % 3 ? M.crumb : M.crust);
    c.position.set(Math.cos(a) * r, 0.0075, Math.sin(a) * r); c.rotation.y = a;
    crumbs.add(c);
  }
  crumbs.visible = false;
  g.add(crumbs);
  const sm = smear(0.075, 0x8a6a3c, 0.0072); // a dirty plate (#383): a greasy smear on the well, also once it is scraped
  g.add(sm);
  return { object: g, anchors, grip: [0.12, 0.012, 0.03], show(item) {
    crumbs.visible = !!(item.machine?.crumbs ?? item.clean === 'used'); // (a plate eaten from before #383 was 'used' with crumbs)
    sm.visible = item.clean === 'dirty';
  } };
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
  const st = new THREE.Group(); // a dirty board (#383): juice stains where things were cut
  for (const [x, z, r] of [[-0.05, -0.06, 0.05], [0.06, 0.03, 0.035], [-0.12, 0.05, 0.03]]) { const m = smear(r, 0x7a8a4a, t + 0.0007); m.position.x = x; m.position.z = z; st.add(m); }
  st.visible = false;
  g.add(st);
  return { object: g, anchors, grip: [0.19, t / 2, 0.08], show(item) { st.visible = item.clean === 'dirty'; } };
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
  loaf.name = 'loaf'; clip.name = 'clip';
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

/** A slice of bread (11 × 10 cm, 1.2 cm), along x; bitten (#377) from the +x end: each bite takes an arc-shaped piece out
 * (two overlapping bite marks), the geometry rebuilt from an outline. */
function breadSliceShape(bitten, bites) {
  const L = 0.11, W = 0.1, r = 0.012, x0 = -L / 2, xe = L / 2 - (L * 0.85) * (bitten / bites);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, -W / 2);
  if (bitten === 0) {
    s.lineTo(xe - r, -W / 2); s.quadraticCurveTo(xe, -W / 2, xe, -W / 2 + r); s.lineTo(xe, W / 2 - r); s.quadraticCurveTo(xe, W / 2, xe - r, W / 2);
  } else { // a bitten edge: two arcs bowing in (teeth marks)
    const d = 0.022;
    s.lineTo(xe, -W / 2);
    s.quadraticCurveTo(xe - d, -W / 4, xe, 0);
    s.quadraticCurveTo(xe - d, W / 4, xe, W / 2);
  }
  s.lineTo(x0 + r, W / 2); s.quadraticCurveTo(x0, W / 2, x0, W / 2 - r); s.lineTo(x0, -W / 2 + r); s.quadraticCurveTo(x0, -W / 2, x0 + r, -W / 2);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2); // (caps up/down = crumb, sides = crust)
  return { geo, xe };
}
/** The layers on a slice of bread (#378, #379), from its `parts` in order: butter = a thin yellow film, cheese = a pale
 * yellow slice, cucumber = slices in a pattern; all of them cut back to the bitten edge `xe`. */
function sandwichLayers(parts, bitten, bites, xe) {
  const g = new THREE.Group();
  let y = 0.012, nCuc = 0;
  for (const p of parts) {
    if (p.type === 'butter') {
      const m = mesh(breadSliceShape(bitten, bites).geo.scale(0.92, 0.12, 0.9), M.butter);
      m.position.y = y; m.castShadow = false; g.add(m); y += 0.0016;
    } else if (p.type === 'cheeseSlice') {
      const m = mesh(breadSliceShape(bitten, bites).geo.scale(0.86, 0.17, 0.84), M.cheeseSlice);
      m.position.set(0.003 * (g.children.length % 2 ? 1 : -1), y, 0); g.add(m); y += 0.0022;
    } else if (p.type === 'friedEgg') {
      const model = friedEgg(); model.show({ amount: p.amount * (1 - bitten / bites), machine: p.machine ?? { cook: EGG.seconds, cooked: true } });
      const egg = model.object; egg.position.y = y; g.add(egg); y += .014;
    } else if (p.type === 'cucumberSlice') {
      const spots = [[-0.03, -0.025], [0.012, -0.025], [-0.03, 0.022], [0.012, 0.022], [-0.009, 0], [0.032, 0]];
      const [x, z] = spots[nCuc++ % spots.length];
      if (x + 0.021 > xe) continue; // (bitten off)
      const c = cucumberSlice().object;
      c.position.set(x, y + (nCuc > spots.length ? 0.004 : 0), z);
      g.add(c);
      if (nCuc === spots.length || p === parts[parts.length - 1] || parts[parts.indexOf(p) + 1]?.type !== 'cucumberSlice') y += 0.004;
    }
  }
  return g;
}
function breadSlice() {
  const g = new THREE.Group();
  const s = mesh(breadSliceShape(0, 4).geo, [M.crumb, M.crust]);
  g.add(s);
  let shown = '0|', layers = null;
  return {
    object: g, grip: [-0.05, 0.006, 0.03],
    show(item, items) {
      const d = items.def(item), bites = d?.bites ?? 4, bitten = Math.max(0, Math.min(bites - 1, Math.round((1 - item.amount / (d?.amount ?? 1)) * bites)));
      const key = `${bitten}|${item.toasted ? 1 : 0}|${(item.parts ?? []).map((p) => p.type).join(',')}`;
      if (key === shown) return;
      shown = key;
      s.material = item.toasted ? [M.toastCrumb, M.toastCrust] : [M.crumb, M.crust];
      s.geometry.dispose();
      const shape = breadSliceShape(bitten, bites);
      s.geometry = shape.geo;
      if (layers) { layers.traverse((o) => o.geometry?.dispose()); layers.removeFromParent(); }
      layers = sandwichLayers(item.parts ?? [], bitten, bites, shape.xe);
      layers.name = 'layers';
      g.add(layers);
    },
  };
}

/** A slice of cheese (#378): 8.5 × 7.5 cm, 2 mm, pale yellow, one edge a little wavy from the slicer. */
function cheeseSlice() {
  const g = new THREE.Group();
  const m = mesh(new RoundedBoxGeometry(0.085, 0.002, 0.075, 1, 0.0008), M.cheeseSlice);
  m.position.y = 0.001;
  g.add(m);
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
  const sm = bladeSmear(0.15, 0.03, 0x9fbf6a, 0.06, 0.0103);
  g.add(sm);
  return { object: g, grip: [-0.09, 0.009, 0], show(item) { sm.visible = item.clean === 'dirty'; } };
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
  const lump = mesh(new THREE.SphereGeometry(0.012, 10, 6).scale(1.4, 0.45, 1), M.butter); // a dab of butter on the blade (#378)
  lump.position.set(0.06, 0.0095, 0);
  lump.visible = false;
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.022, 0.032), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(-0.015, 0.011, 0);
  g.add(blade, handle, lump, pick);
  const sm = bladeSmear(0.06, 0.016, 0xf2dc86, 0.04, 0.0078);
  g.add(sm);
  return { object: g, grip: [-0.06, 0.007, 0], show(item) { lump.visible = (item.machine?.load ?? 0) > 0; sm.visible = item.clean === 'dirty'; } };
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
  const sm = bladeSmear(0.07, 0.05, 0xf0d070, 0.08, 0.0063);
  g.add(sm);
  return { object: g, grip: [-0.06, 0.006, 0], show(item) { sm.visible = item.clean === 'dirty'; } };
}

/** A waste bin's insides (#381), built 1 × 1 × 1 (its store's anchor is scaled to the bin it stands in): a black bag's
 * rim, the label "Avfall" on its front (+z), a heap that rises with how full it is, an invisible box over the opening to
 * aim at. */
const BAGS = { black: M.binBag, paper: std(0xb48a58, 0.85), clear: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.3, transparent: true, opacity: 0.55 }) };
const HEAPS = { rest: M.binHeap, food: std(0x6b4a2a, 0.8), package: std(0xc9d3da, 0.5) };
function bin(def = {}) {
  const g = new THREE.Group();
  const rim = mesh(new THREE.BoxGeometry(1.02, 0.04, 1.02), BAGS[def.bag] ?? M.binBag); // its bag's rim (#386: none once tied up and taken out)
  rim.position.y = 0.985; rim.castShadow = false;
  const word = def.label ?? 'Avfall', sub = def.label ? '' : 'restavfall';
  const tag = mesh(new THREE.PlaneGeometry(0.62, 0.22), labelOf(`bin-${word}`, () => label(word, { bg: '#f2f2ee', fg: '#333333', sub, font: `bold ${word.length > 9 ? 40 : 60}px sans-serif` })));
  tag.position.set(0, 0.62, 0.502); tag.castShadow = false;
  const heap = mesh(new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0), HEAPS[def.sort] ?? M.binHeap);
  heap.position.y = 0.01; heap.castShadow = false;
  const top = mesh(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1), HEAPS[def.sort] ?? M.binHeap);
  top.castShadow = false;
  const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), new THREE.MeshBasicMaterial());
  pick.position.y = 0.88; pick.visible = false;
  g.add(rim, tag, heap, top, pick);
  return {
    object: g,
    show(item, items) {
      const k = Math.min(1, item.amount / (items.def(item)?.capacity ?? 10));
      heap.visible = top.visible = k > 0.001;
      rim.visible = !item.machine?.nobag;
      heap.scale.y = Math.max(0.001, k * 0.85);
      top.position.y = 0.01 + k * 0.85;
    },
  };
}

/** A drinking glass (#382): a plain tumbler 25 cl, Ø 7 cm, 11 cm high (a lathe, see-through), the drink in it a level that
 * follows its amount (drinks.js GlassLiquid, the drink's colour from DRINKS). */
const INNER = [[0.029, 0.007], [0.0325, 0.104]];
function glass() {
  const g = new THREE.Group();
  const prof = [[0.0001, 0], [0.03, 0], [0.0345, 0.11], [0.0325, 0.11], [0.029, 0.007], [0.0001, 0.007]].map(([r, y]) => new THREE.Vector2(r, y));
  const m = mesh(new THREE.LatheGeometry(prof, 24), M.glass);
  m.castShadow = false;
  m.renderOrder = 1;
  g.add(m);
  const liquid = new GlassLiquid(g, INNER), contents = new Contents();
  // a dirty glass (#383): a milky film on the inside (a thin lathe just inside the glass)
  const film = new THREE.Mesh(new THREE.LatheGeometry(INNER.map(([r, y]) => new THREE.Vector2(r - 0.0006, y)), 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  film.visible = false; film.raycast = () => {}; film.renderOrder = 0;
  g.add(film);
  // what is drawn: the instance's amount, or `level(kind, ml)` while a pour / sip is going on (#382)
  const draw = (kind, ml, cap) => { contents.set(kind ?? 'water', kind ? Math.min(1, ml / cap) : 0); liquid.show(contents); };
  let cap = 250;
  return {
    object: g, grip: [0.034, 0.05, 0],
    show(item, items) { cap = items.def(item)?.capacity ?? 250; draw(item.machine?.drink, item.amount, cap); film.visible = item.clean === 'dirty'; },
    level(kind, ml) { draw(kind, ml, cap); },
  };
}

/** A tied rubbish bag (#386), ~30 cm: a full bag with a knot and two ears on top, its look by `machine.sort`. */
function rubbishBag() {
  const g = new THREE.Group();
  const mats = { food: BAGS.paper, package: BAGS.clear, rest: BAGS.black };
  const body = mesh(new THREE.SphereGeometry(0.13, 16, 12).scale(1, 1.05, 0.9), BAGS.black);
  body.position.y = 0.135;
  const neck = mesh(new THREE.CylinderGeometry(0.018, 0.05, 0.06, 10), BAGS.black);
  neck.position.y = 0.29;
  const ears = [-1, 1].map((s) => { const e = mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(1.4, 0.6, 0.5), BAGS.black); e.position.set(s * 0.035, 0.33, 0); e.rotation.z = s * 0.5; return e; });
  g.add(body, neck, ...ears);
  return { object: g, grip: [0, 0.31, 0], show(item) { const m = mats[item.machine?.sort] ?? BAGS.black; for (const o of [body, neck, ...ears]) o.material = m; body.scale.setScalar(0.75 + 0.25 * Math.min(1, (item.amount ?? 0) / 8)); } };
}

const BUILDERS = { hallJacket, hallShoes, wateringCan, laundryClothes, eggCarton, rawEgg, friedEgg, rubbishBag, glass, plate, board, cucumber, cucumberSlice, cheese, butter, breadBag, breadSlice, knife, peas, butterKnife, cheeseSlicer, cheeseSlice, bin };

/** The model of a type (its `model` builder; a grey box when there is none). */
export function buildModel(def) {
  const b = BUILDERS[def?.model];
  if (b) return b(def);
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), std(0x999999));
  m.position.y = 0.025;
  g.add(m);
  return { object: g };
}
