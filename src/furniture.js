import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FURNITURE, LANDSKRONA as L, LEVELS } from './config.js';

// Loose furniture, built from rounded boxes. Every piece is modelled in a local frame
// where the sitter faces +z, x is across, y up; config gives position + facing.

const fabric = new THREE.MeshStandardMaterial({ color: L.fabric, roughness: 0.95 });
const oak = new THREE.MeshStandardMaterial({ color: L.oak, roughness: 0.55 });
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.4, metalness: 0.6 });
const shadeMat = new THREE.MeshStandardMaterial({
  color: 0xf3ead8, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffe2b0, emissiveIntensity: 0.35,
});
const potMat = new THREE.MeshStandardMaterial({ color: 0xb8643f, roughness: 0.85 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.8 });
const petalMat = new THREE.MeshStandardMaterial({ color: 0xe87aa4, roughness: 0.7 });
const heartMat = new THREE.MeshStandardMaterial({ color: 0xf2d24b, roughness: 0.6 });

function rbox(w, h, d, x, y, z, material, r = 0.04) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.5 }); // dark brown, dining set

function leg(x, z, h = L.legHeight, material = oak) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, h, 12), material);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  return m;
}

/**
 * LANDSKRONA-style seat module: frame, seat cushion(s), back cushion(s), armrests.
 * `arms` = which ends get an armrest ('left' is the sitter's left = +x).
 */
function seatModule(g, { x0, x1, depth, cushions, arms }) {
  const legH = L.legHeight, D = L.depth;
  const z0 = -D / 2, zF = z0 + depth; // back … front
  const base = L.seatHeight - 0.14;   // top of the frame under the seat cushion
  const backT = D - L.seatDepth - 0.06; // back frame + cushion thickness
  // frame
  g.add(rbox(x1 - x0, base - legH, depth, (x0 + x1) / 2, (legH + base) / 2, (z0 + zF) / 2, fabric, 0.02));
  g.add(rbox(x1 - x0, 0.3, 0.14, (x0 + x1) / 2, base + 0.15, z0 + 0.07, fabric, 0.03));
  // seat + back cushions
  const aw = L.armWidth;
  const ix0 = x0 + (arms.includes('right') ? aw : 0), ix1 = x1 - (arms.includes('left') ? aw : 0);
  const cw = (ix1 - ix0) / cushions;
  for (let i = 0; i < cushions; i++) {
    const cx = ix0 + cw * (i + 0.5);
    g.add(rbox(cw - 0.01, 0.15, depth - backT + 0.02, cx, base + 0.075, zF - (depth - backT) / 2, fabric, 0.05));
    const back = rbox(cw - 0.02, 0.42, 0.2, cx, L.seatHeight + 0.19, z0 + 0.14 + 0.1, fabric, 0.07);
    back.rotation.x = -0.14;
    g.add(back);
  }
  // armrests: sitter's right = −x, left = +x
  for (const side of arms) {
    const ax = side === 'right' ? x0 + aw / 2 : x1 - aw / 2;
    g.add(rbox(aw, L.armHeight - legH, depth, ax, (L.armHeight + legH) / 2, (z0 + zF) / 2, fabric, 0.05));
  }
  // legs
  for (const lx of [x0 + 0.06, x1 - 0.06]) for (const lz of [z0 + 0.06, zF - 0.06]) g.add(leg(lx, lz));
}

function sofa(item) {
  const g = new THREE.Group();
  const W = L.sofaWidth, D = L.depth;
  // chaise on the sitter's right (−x) or left (+x)
  const right = item.chaise === 'right';
  const cw = L.chaiseWidth;
  const [mainX0, mainX1] = right ? [-W / 2 + cw, W / 2] : [-W / 2, W / 2 - cw];
  const [chX0, chX1] = right ? [-W / 2, -W / 2 + cw] : [W / 2 - cw, W / 2];
  seatModule(g, { x0: mainX0, x1: mainX1, depth: D, cushions: 2, arms: [right ? 'left' : 'right'] });
  seatModule(g, { x0: chX0, x1: chX1, depth: L.chaiseDepth, cushions: 1, arms: [right ? 'right' : 'left'] });
  // footprint (local) for collision
  g.userData.footprint = [
    { x0: mainX0, x1: mainX1, z0: -D / 2, z1: D / 2 },
    { x0: chX0, x1: chX1, z0: -D / 2, z1: -D / 2 + L.chaiseDepth },
  ];
  return g;
}

function armchair() {
  const g = new THREE.Group();
  const W = L.chairWidth;
  seatModule(g, { x0: -W / 2, x1: W / 2, depth: L.depth, cushions: 1, arms: ['left', 'right'] });
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: -L.depth / 2, z1: L.depth / 2 }];
  return g;
}

function footstool() {
  const g = new THREE.Group();
  const { w, d, h } = L.stool;
  g.add(rbox(w, h - L.legHeight - 0.12, d, 0, (L.legHeight + h - 0.12) / 2, 0, fabric, 0.02));
  g.add(rbox(w, 0.13, d, 0, h - 0.065, 0, fabric, 0.05));
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) g.add(leg(x, z));
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

function floorlamp(item, lights) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 28), metal);
  base.position.y = 0.0125;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.45, 10), metal);
  pole.position.y = 0.025 + 0.725;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.3, 32, 1, true), shadeMat);
  shade.position.y = 1.5;
  [base, pole, shade].forEach((m) => { m.castShadow = true; g.add(m); });
  // warm light under the shade (no shadows: cheap)
  const light = new THREE.PointLight(0xffd59a, 1.4, 5, 2);
  light.position.y = 1.45;
  g.add(light);
  lights.push(light);
  g.userData.footprint = [{ x0: -0.16, x1: 0.16, z0: -0.16, z1: 0.16 }];
  return g;
}

function flower() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.1, 20), potMat);
  pot.position.y = 0.05;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 20),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
  soil.position.y = 0.097;
  g.add(soil);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
    leaf.scale.set(0.012, 0.05, 0.025);
    leaf.position.set(Math.cos(a) * 0.03, 0.14, Math.sin(a) * 0.03);
    leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(leaf);
  }
  // three small flowers on stems
  for (const [dx, dz, h] of [[0, 0, 0.24], [0.03, -0.02, 0.2], [-0.03, 0.02, 0.21]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h - 0.1, 6), leafMat);
    stem.position.set(dx, 0.1 + (h - 0.1) / 2, dz);
    g.add(stem);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), petalMat);
      petal.scale.set(0.014, 0.005, 0.009);
      petal.position.set(dx + Math.cos(a) * 0.013, h, dz + Math.sin(a) * 0.013);
      petal.rotation.y = -a;
      g.add(petal);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), heartMat);
    heart.position.set(dx, h + 0.003, dz);
    g.add(heart);
  }
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

function sidetable(item) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 36), oak);
  top.position.y = 0.52;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.52, 10), oak);
    l.position.set(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(l);
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  if (item.flower) {
    const f = flower();
    f.position.y = 0.533;
    g.add(f);
  }
  g.userData.footprint = [{ x0: -0.22, x1: 0.22, z0: -0.22, z1: 0.22 }];
  return g;
}

const linen = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.95 });
const duvet = new THREE.MeshStandardMaterial({ color: 0xd9dfe2, roughness: 0.95 });
const bedFabric = new THREE.MeshStandardMaterial({ color: 0x8f969b, roughness: 0.95 });

/** Bed: upholstered base on legs, mattress, duvet, pillows, headboard. Local −z = head end. */
function bed(item) {
  const g = new THREE.Group();
  const w = item.w, l = item.l, z0 = -l / 2;
  g.add(rbox(w + 0.04, 0.22, l + 0.04, 0, 0.1 + 0.11, 0, bedFabric, 0.02));
  g.add(rbox(w, 0.2, l, 0, 0.32 + 0.1, 0, linen, 0.05));
  g.add(rbox(w + 0.02, 0.06, l * 0.7, 0, 0.53, z0 + l * 0.65, duvet, 0.03));
  for (const px of w > 1.2 ? [-w / 4, w / 4] : [0]) g.add(rbox(Math.min(0.6, w * 0.8), 0.12, 0.38, px, 0.58, z0 + 0.28, linen, 0.06));
  g.add(rbox(w + 0.06, 0.6, 0.08, 0, 0.62, z0 - 0.04, bedFabric, 0.03));
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [z0 + 0.06, -z0 - 0.06]) g.add(leg(x, z, 0.1));
  g.userData.footprint = [{ x0: -w / 2 - 0.03, x1: w / 2 + 0.03, z0: z0 - 0.08, z1: -z0 + 0.02 }];
  return g;
}

/** Dining table (oak or dark wood), top at 75 cm. Local x = w, z = d. */
function table(item) {
  const g = new THREE.Group();
  const { w, d } = item, wood = item.wood === 'dark' ? darkWood : oak;
  g.add(rbox(w, 0.03, d, 0, 0.735, 0, wood, 0.01));
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) g.add(leg(x, z, 0.72, wood));
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** Simple chair (oak or dark wood), seat 45 cm, facing local +z. */
function chair(item) {
  const g = new THREE.Group();
  const wood = item.wood === 'dark' ? darkWood : oak;
  g.add(rbox(0.42, 0.03, 0.42, 0, 0.45, 0, wood, 0.01));
  g.add(rbox(0.42, 0.28, 0.03, 0, 0.66, -0.195, wood, 0.01));
  for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) g.add(leg(x, z, 0.44, wood));
  g.userData.footprint = [{ x0: -0.21, x1: 0.21, z0: -0.21, z1: 0.21 }];
  return g;
}

const whiteWood = new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.6 });
const DUVETS = [0x8fb8d8, 0xf2c14e, 0x9bc49a, 0xe58f8f];
let duvetIndex = 0;
const duvetMat = () => new THREE.MeshStandardMaterial({ color: DUVETS[duvetIndex++ % DUVETS.length], roughness: 0.95 });

/** Printed bedding: 'vader' (black, helmets, red light sabers, stars) or 'unicorn' (pink). */
function sheetTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  let seed = kind === 'vader' ? 3 : 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === 'vader') {
    g.fillStyle = '#121418';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#e8e8f0';
    for (let i = 0; i < 160; i++) g.fillRect(rand() * 512, rand() * 512, 1.5, 1.5);
    const helmet = (x, y, s) => {
      g.save();
      g.translate(x, y);
      g.scale(s, s);
      g.fillStyle = '#3a3f47';
      g.beginPath(); // dome + flared neck
      g.moveTo(-40, 30); g.lineTo(-34, -10);
      g.bezierCurveTo(-34, -48, 34, -48, 34, -10);
      g.lineTo(40, 30); g.lineTo(18, 34); g.lineTo(0, 22); g.lineTo(-18, 34); g.closePath();
      g.fill();
      g.fillStyle = '#0b0c0e'; // eyes + mouth grille
      g.beginPath(); g.ellipse(-12, -6, 10, 7, -0.3, 0, Math.PI * 2); g.ellipse(12, -6, 10, 7, 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-8, 6); g.lineTo(8, 6); g.lineTo(5, 24); g.lineTo(-5, 24); g.closePath(); g.fill();
      g.fillStyle = '#8b939e';
      for (let k = -3; k <= 3; k += 2) g.fillRect(k * 1.6 - 0.6, 10, 1.2, 11);
      g.restore();
    };
    const saber = (x, y, a) => {
      g.save();
      g.translate(x, y); g.rotate(a);
      g.shadowColor = '#ff2a2a'; g.shadowBlur = 14;
      g.fillStyle = '#ff4a4a';
      g.fillRect(-3, -70, 6, 70);
      g.shadowBlur = 0;
      g.fillStyle = '#9aa0a8';
      g.fillRect(-4, 0, 8, 22);
      g.restore();
    };
    for (const [x, y] of [[128, 128], [384, 128], [128, 384], [384, 384]]) helmet(x, y, 1.1);
    for (const [x, y, a] of [[256, 250, 0.6], [0, 250, -0.6], [512, 250, -0.6], [256, 0, -0.6], [256, 512, -0.6]]) saber(x, y, a);
  } else {
    g.fillStyle = '#f7c9de';
    g.fillRect(0, 0, 512, 512);
    // rainbows, stars and white unicorns
    const rainbow = (x, y, r) => {
      for (const [i, col] of ['#ff8fa3', '#ffc36b', '#fff27a', '#9be39b', '#8fc8ff', '#c7a2ff'].entries()) {
        g.strokeStyle = col; g.lineWidth = 5;
        g.beginPath(); g.arc(x, y, r - i * 5, Math.PI, 0); g.stroke();
      }
    };
    const star = (x, y, r, col) => {
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    };
    const unicorn = (x, y, s, flip) => {
      g.save();
      g.translate(x, y); g.scale(flip ? -s : s, s);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(0, 0, 34, 20, 0, 0, Math.PI * 2); g.fill();          // body
      g.beginPath(); g.ellipse(32, -24, 13, 10, -0.6, 0, Math.PI * 2); g.fill();    // head
      g.fillRect(20, -24, 12, 22);                                                 // neck
      for (const lx of [-22, -10, 12, 24]) g.fillRect(lx, 12, 6, 22);              // legs
      g.fillStyle = '#ffd56b';
      g.beginPath(); g.moveTo(36, -32); g.lineTo(46, -56); g.lineTo(41, -30); g.fill(); // horn
      g.strokeStyle = '#c58bff'; g.lineWidth = 6;                                  // mane + tail
      g.beginPath(); g.moveTo(26, -34); g.quadraticCurveTo(14, -24, 18, -8); g.stroke();
      g.strokeStyle = '#ff8fc0';
      g.beginPath(); g.moveTo(-34, -4); g.quadraticCurveTo(-52, 6, -46, 26); g.stroke();
      g.fillStyle = '#5a3d6b';
      g.beginPath(); g.arc(36, -25, 2, 0, Math.PI * 2); g.fill();                  // eye
      g.restore();
    };
    rainbow(380, 150, 60); rainbow(120, 420, 50);
    for (let i = 0; i < 26; i++) star(rand() * 512, rand() * 512, 6 + rand() * 6, rand() < 0.5 ? '#ffffff' : '#ffe27a');
    unicorn(140, 150, 1.2, false); unicorn(380, 380, 1.1, true);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
const sheetMats = {};
const sheetMat = (kind) => (sheetMats[kind] ??= new THREE.MeshStandardMaterial({ map: sheetTexture(kind), roughness: 0.95 }));

/** Bunk bed, white: four posts, two mattresses with duvets, guard rail and a ladder. −z = head. */
function bunk(item) {
  const g = new THREE.Group();
  const w = item.w, l = item.l, H = 1.6, p = 0.05;
  for (const x of [-w / 2 - p / 2, w / 2 + p / 2]) for (const z of [-l / 2 - p / 2, l / 2 + p / 2]) {
    g.add(rbox(p, H, p, x, H / 2, z, whiteWood, 0.01));
  }
  for (const y of [0.25, 1.15]) {
    // frame, mattress, duvet, pillow
    for (const x of [-w / 2 - p / 2, w / 2 + p / 2]) g.add(rbox(p * 0.8, 0.12, l, x, y, 0, whiteWood, 0.01));
    for (const z of [-l / 2 - p / 2, l / 2 + p / 2]) g.add(rbox(w, 0.12, p * 0.8, 0, y, z, whiteWood, 0.01));
    g.add(rbox(w - 0.02, 0.14, l - 0.02, 0, y + 0.1, 0, linen, 0.04));
    const duvet = item.sheets ? sheetMat(item.sheets) : duvetMat();
    g.add(rbox(w, 0.05, l * 0.68, 0, y + 0.19, l * 0.15, duvet, 0.025));
    g.add(rbox(w * 0.7, 0.1, 0.34, 0, y + 0.22, -l / 2 + 0.24, item.sheets ? duvet : linen, 0.05));
  }
  // guard rail on the top bunk (open by the ladder) and the head/foot boards above it
  g.add(rbox(p * 0.6, 0.06, l * 0.62, w / 2 + p / 2, 1.5, -l * 0.17, whiteWood, 0.01));
  for (const z of [-l / 2 - p / 2, l / 2 + p / 2]) g.add(rbox(w, 0.06, p * 0.6, 0, 1.5, z, whiteWood, 0.01));
  // ladder on the room side (+x) at the foot end
  const lx = w / 2 + p + 0.02, lz0 = l / 2 - 0.42, lz1 = l / 2 - 0.02;
  for (const z of [lz0, lz1]) g.add(rbox(0.035, 1.55, 0.035, lx, 0.775, z, whiteWood, 0.008));
  for (let y = 0.3; y < 1.5; y += 0.27) g.add(rbox(0.03, 0.03, lz1 - lz0, lx, y, (lz0 + lz1) / 2, whiteWood, 0.008));
  g.userData.footprint = [{ x0: -w / 2 - p, x1: lx + 0.03, z0: -l / 2 - p, z1: l / 2 + p }];
  return g;
}

const pinks = [0xf6b8cf, 0xf29bbb, 0xfbd3e1, 0xe983a8].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));

/** IKEA HEMNES daybed with 3 drawers, white, 207 × 89 × 83 cm, seat facing +z, pink cushions. */
function daybed() {
  const g = new THREE.Group();
  const W = 2.07, D = 0.89, H = 0.83, z0 = -D / 2, z1 = D / 2;
  // base with three drawers on the front
  g.add(rbox(W - 0.1, 0.3, D - 0.04, 0, 0.18, 0, whiteWood, 0.01));
  for (let i = 0; i < 3; i++) {
    const x = -W / 2 + 0.05 + (W - 0.1) * (i + 0.5) / 3;
    g.add(rbox((W - 0.1) / 3 - 0.02, 0.24, 0.02, x, 0.18, z1 - 0.02, whiteWood, 0.006));
    g.add(rbox(0.12, 0.02, 0.02, x, 0.26, z1, metal, 0.005)); // handle
  }
  // ends with spindles, back with spindles, top rails
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.03);
    for (const z of [z0 + 0.03, z1 - 0.03]) g.add(rbox(0.06, H, 0.06, x, H / 2, z, whiteWood, 0.01));
    g.add(rbox(0.05, 0.06, D - 0.06, x, H - 0.03, 0, whiteWood, 0.01));
    for (let k = 1; k < 5; k++) g.add(rbox(0.025, H - 0.4, 0.025, x, 0.35 + (H - 0.4) / 2, z0 + (D * k) / 5, whiteWood, 0.005));
  }
  g.add(rbox(W - 0.06, 0.06, 0.05, 0, H - 0.03, z0 + 0.03, whiteWood, 0.01));
  for (let k = 1; k < 14; k++) g.add(rbox(0.025, H - 0.4, 0.025, -W / 2 + (W * k) / 14, 0.35 + (H - 0.4) / 2, z0 + 0.03, whiteWood, 0.005));
  // mattress (two ÅFJÄLL stacked when closed) and cushions
  g.add(rbox(W - 0.14, 0.2, D - 0.1, 0, 0.43, 0.02, linen, 0.05));
  const cushions = [[-0.6, 0.42, 0], [-0.15, 0.4, 1], [0.32, 0.44, 2], [0.75, 0.36, 3]];
  for (const [x, size, i] of cushions) {
    const c = rbox(size, size, 0.14, x, 0.53 + size / 2, z0 + 0.15, pinks[i], 0.06);
    c.rotation.x = -0.18;
    g.add(c);
  }
  // a small round cushion and a heart-ish one in front
  const round = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24), pinks[2]);
  round.rotation.x = Math.PI / 2 - 0.3;
  round.position.set(0.05, 0.68, z0 + 0.3);
  g.add(round);
  for (const s of [-1, 1]) {
    const lobe = rbox(0.12, 0.12, 0.08, s * 0.05 - 0.45, 0.62, z0 + 0.32, pinks[1], 0.05);
    lobe.rotation.z = s * 0.6; // two tilted lobes = a little heart
    g.add(lobe);
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0, z1 }];
  return g;
}

const BUILDERS = { sofa, armchair, footstool, floorlamp, sidetable, bed, table, chair, bunk, daybed };

/** Build all furniture; returns the scene group, collision segments per level and lamps. */
export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []];
  const lights = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI; // local +z = facing
    obj.rotation.y = yaw;
    obj.position.set(item.x, LEVELS[item.level].floor, item.z);
    group.add(obj);
    // footprint rectangles → world-space collision segments
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx, lz) => [item.x + c * lx + s * lz, item.z - s * lx + c * lz];
    for (const r of obj.userData.footprint ?? []) {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      for (let i = 0; i < 4; i++) segments[item.level].push([...pts[i], ...pts[(i + 1) % 4]]);
    }
  }
  return { object: group, segments, lights };
}
