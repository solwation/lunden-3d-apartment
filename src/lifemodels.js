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
  steel: std(0xc9cdd0, 0.25, { metalness: 0.7 }), handle: std(0x222222, 0.55),
};

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

/** A wooden cutting board 40 × 26 cm: spot 0 for what is being cut (the left half), eight result spots in a fan on the right. */
function board() {
  const g = new THREE.Group();
  const t = 0.022;
  const b = mesh(new RoundedBoxGeometry(0.4, t, 0.26, 2, 0.006), M.wood);
  b.position.y = t / 2;
  g.add(b);
  const anchors = [anchor(g, -0.07, t, 0)];
  for (let k = 0; k < 8; k++) anchors.push(anchor(g, 0.07 + (k % 2) * 0.055, t + 0.0005, -0.09 + Math.floor(k / 2) * 0.06));
  return { object: g, anchors, grip: [0.19, t / 2, 0.08] };
}

/** A cucumber (full: 30 cm, Ø 4.4 cm), along x; shorter as it is cut, with a pale cut face at the +x end. */
function cucumber() {
  const g = new THREE.Group(), r = 0.022, L = 0.3;
  const body = mesh(new THREE.CapsuleGeometry(r, L - 2 * r, 6, 16).rotateZ(Math.PI / 2), M.cucumber);
  body.position.y = r;
  const face = mesh(new THREE.CircleGeometry(r * 0.97, 20).rotateY(Math.PI / 2), M.cucumberIn);
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

/** A cucumber slice: Ø 4.2 cm, 4 mm thick, pale inside, a dark rim. */
function cucumberSlice() {
  const g = new THREE.Group(), r = 0.021, h = 0.004;
  g.add(Object.assign(mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), M.cucumberRim), { position: new THREE.Vector3(0, h / 2, 0) }));
  for (const y of [0, h]) { const c = mesh(new THREE.CircleGeometry(r, 20).rotateX(y ? -Math.PI / 2 : Math.PI / 2), M.cucumberIn); c.position.y = y; g.add(c); }
  return { object: g };
}

/** A block of cheese (full: 12 × 7 × 6 cm), shorter as it is sliced. */
function cheese() {
  const g = new THREE.Group(), L = 0.12;
  const b = mesh(new THREE.BoxGeometry(L, 0.06, 0.07), [M.cheese, M.rind, M.rind, M.rind, M.rind, M.rind]);
  b.position.y = 0.03;
  g.add(b);
  return { object: g, show(item, items) { const k = Math.max(0.05, item.amount / (items.def(item)?.amount ?? 500)); b.scale.x = k; b.position.x = -(1 - k) * L / 2; } };
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

const BUILDERS = { plate, board, cucumber, cucumberSlice, cheese, butter, breadBag, breadSlice, knife };

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
