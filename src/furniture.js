import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FURNITURE, LANDSKRONA as L, LEVELS, SKANSNAS } from './config.js';
import { loungesofa, loungetable, parasol, planter } from './patio.js';

// Loose furniture, built from rounded boxes. Every piece is modelled in a local frame
// where the sitter faces +z, x is across, y up; config gives position + facing.

const fabric = new THREE.MeshStandardMaterial({ color: L.fabric, roughness: 0.95 });
const oak = new THREE.MeshStandardMaterial({ color: L.oak, roughness: 0.55 });
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.4, metalness: 0.6 });
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

const anthracite = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.35 });
const spotLens = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffe2b0, emissiveIntensity: 0.04, roughness: 0.4 });

/** IKEA NYMÅNE floor lamp: round base, straight pole, three cylinder spots on short arms aimed at
 * `item.aim`. The lens discs glow when lit (lights.js toggles their material, shared light pool). */
function floorlamp(item, lights) {
  const g = new THREE.Group();
  const add = (m) => { m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(item.base / 2, item.base / 2, 0.02, 28), anthracite)).position.y = 0.01;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, item.h - 0.02, 10), anthracite)).position.y = item.h / 2;
  // aim in local coordinates (the group is turned by rot + π in buildFurniture; rot = 0 here → yaw π)
  const ax = -(item.aim[0] - item.x), az = -(item.aim[1] - item.z);
  const yaw = Math.atan2(ax, az);
  [[item.h - 0.06, 0], [item.h - 0.26, 0.5], [item.h - 0.46, -0.45]].forEach(([y, spread]) => {
    const arm = new THREE.Group();
    arm.position.y = y;
    arm.rotation.y = yaw + spread;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6).rotateX(Math.PI / 2), anthracite);
    rod.position.z = 0.06;
    const head = new THREE.Group();
    head.position.z = 0.13;
    head.rotation.x = 0.65; // tipped down towards the seat
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 18).rotateX(Math.PI / 2), anthracite);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 18), spotLens);
    lens.position.z = 0.061;
    head.add(can, lens);
    arm.add(rod, head);
    arm.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(arm);
  });
  // the light itself comes from lights.js (switchable with E on the lamp, shared light pool)
  // the pool light sits a little way towards what the spots light up (the seat)
  const d = Math.hypot(item.aim[0] - item.x, item.aim[1] - item.z) || 1;
  const offset = [((item.aim[0] - item.x) / d) * 0.35, ((item.aim[1] - item.z) / d) * 0.35];
  lights.push({ object: g, shade: spotLens, height: item.h - 0.3, level: item.level, offset });
  const r = item.base / 2;
  g.userData.footprint = [{ x0: -r, x1: r, z0: -r, z1: r }];
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

const oiledOak = new THREE.MeshStandardMaterial({ color: 0xc69c6d, roughness: 0.5 }); // oljebehandlad ek

/** ILVA Woodstock coffee table: 1950s/60s style — veneered top with softened edges, tapered
 * solid oak legs set in from the corners, a fixed shelf between them. Local x = w, z = d. */
function coffeetable(item) {
  const g = new THREE.Group();
  const { w, d, h } = item, t = 0.025, legH = h - t;
  g.add(rbox(w, t, d, 0, h - t / 2, 0, oiledOak, 0.008));
  const lx = w / 2 - 0.09, lz = d / 2 - 0.07;
  for (const x of [-lx, lx]) for (const z of [-lz, lz]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.013, legH, 12), oiledOak);
    l.position.set(x, legH / 2, z);
    g.add(l);
  }
  // shelf between the legs, ~15 cm above the floor; short rails under the top along the ends
  g.add(rbox(2 * lx - 0.02, 0.018, 2 * lz + 0.02, 0, 0.15, 0, oiledOak, 0.005));
  for (const x of [-lx, lx]) g.add(rbox(0.03, 0.05, 2 * lz, x, h - t - 0.025, 0, oiledOak, 0.005));
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
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

const beech = new THREE.MeshStandardMaterial({ color: SKANSNAS.color, roughness: 0.55 }); // brown beech, table + chairs

/** Woven paper-cord seat texture (canvas): a basket weave in the light cord colour. */
function cordTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(SKANSNAS.seatColor);
  g.fillStyle = base.clone().offsetHSL(0, 0, -0.12).getStyle();
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const horiz = (i + j) % 2 === 0;
    g.fillStyle = base.clone().offsetHSL(0, 0, (horiz ? 0.02 : -0.03)).getStyle();
    for (let k = 0; k < 3; k++) {
      if (horiz) g.fillRect(i * 16 + 1, j * 16 + 1 + k * 5, 14, 4);
      else g.fillRect(i * 16 + 1 + k * 5, j * 16 + 1, 4, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const cord = new THREE.MeshStandardMaterial({ map: cordTexture(), roughness: 0.9 });

/** IKEA SKANSNÄS extendable table, closed: rectangular top with rounded corners, a thin apron and
 * four tapered legs. Local x = width, z = length (the plan's z: short end to the window). */
function skansnasTable() {
  const T = SKANSNAS.table, g = new THREE.Group();
  const hw = T.w / 2, hl = T.l / 2, r = T.corner;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hl);
  shape.lineTo(hw - r, -hl); shape.quadraticCurveTo(hw, -hl, hw, -hl + r);
  shape.lineTo(hw, hl - r); shape.quadraticCurveTo(hw, hl, hw - r, hl);
  shape.lineTo(-hw + r, hl); shape.quadraticCurveTo(-hw, hl, -hw, hl - r);
  shape.lineTo(-hw, -hl + r); shape.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T.top, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(Math.PI / 2).translate(0, T.h, 0);
  const top = new THREE.Mesh(geo, beech);
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  const ay = T.h - T.top - T.apronH / 2, ix = hw - 0.07, iz = hl - 0.07;
  g.add(rbox(2 * ix, T.apronH, 0.02, 0, ay, -iz, beech, 0.004), rbox(2 * ix, T.apronH, 0.02, 0, ay, iz, beech, 0.004),
    rbox(0.02, T.apronH, 2 * iz, -ix, ay, 0, beech, 0.004), rbox(0.02, T.apronH, 2 * iz, ix, ay, 0, beech, 0.004));
  const lh = T.h - T.top;
  for (const x of [-ix, ix]) for (const z of [-iz, iz]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(T.leg / 2, T.leg * 0.32, lh, 14), beech);
    leg.position.set(x, lh / 2, z);
    leg.castShadow = true;
    g.add(leg);
  }
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -hl, z1: hl }];
  return g;
}

/** IKEA SKANSNÄS chair: brown beech frame, light woven paper-cord seat, a straight, slightly
 * reclined back board between the back posts. Faces local +z. */
function skansnasChair() {
  const C = SKANSNAS.chair, g = new THREE.Group();
  const hw = C.w / 2 - 0.03, hd = C.d / 2 - 0.04;
  const seat = rbox(C.w - 0.05, 0.03, C.d - 0.07, 0, C.seat - 0.015, 0.01, cord, 0.01);
  g.add(seat);
  // seat frame (rails round the woven seat)
  g.add(rbox(C.w - 0.03, 0.035, 0.025, 0, C.seat - 0.03, hd + 0.02, beech, 0.006), rbox(C.w - 0.03, 0.035, 0.025, 0, C.seat - 0.03, -hd, beech, 0.006));
  for (const x of [-hw, hw]) {
    g.add(rbox(0.025, 0.035, 2 * hd, x, C.seat - 0.03, 0.01, beech, 0.006));
    g.add(leg(x, hd, C.seat - 0.03, beech));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, C.h, 10), beech);
    post.position.set(x, C.h / 2, -hd);
    post.rotation.x = -0.07; // reclined a little
    post.castShadow = true;
    g.add(post);
  }
  const back = rbox(2 * hw + 0.02, 0.13, 0.02, 0, C.h - 0.1, -hd - 0.04, beech, 0.008);
  back.rotation.x = -0.07;
  g.add(back);
  g.userData.footprint = [{ x0: -C.w / 2, x1: C.w / 2, z0: -C.d / 2, z1: C.d / 2 }];
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

const bamboo = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.6 });

/** IKEA RÅGRUND chair with towel rack (bamboo): slatted seat, back posts rising to 140 cm with three
 * round towel bars, a towel over the top bar. Faces local +z. */
function ragrund(item) {
  const g = new THREE.Group();
  const W = 0.39, D = 0.44, H = 1.4, S = 0.48, hx = W / 2 - 0.02, hz = D / 2 - 0.02;
  const bar = (sx, sy, sz, x, y, z) => g.add(rbox(sx, sy, sz, x, y, z, bamboo, 0.004));
  for (const x of [-hx, hx]) {
    bar(0.03, S, 0.03, x, S / 2, hz);          // front legs
    bar(0.03, H, 0.03, x, H / 2, -hz);         // back posts = towel rack sides
    bar(0.02, 0.03, D - 0.04, x, S - 0.04, 0); // seat side rails
    bar(0.02, 0.025, D - 0.04, x, 0.12, 0);    // low stretchers
  }
  for (let k = 0; k < 4; k++) bar(W - 0.02, 0.018, 0.075, 0, S - 0.009, -hz + 0.05 + k * ((2 * hz - 0.06) / 3)); // seat slats
  for (const y of [S + 0.32, S + 0.62, H - 0.04]) { // towel bars
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2 * hx, 10).rotateZ(Math.PI / 2), bamboo);
    rod.position.set(0, y, -hz);
    rod.castShadow = true;
    g.add(rod);
  }
  // a towel folded over the top bar, hanging down on both sides
  const towel = new THREE.MeshStandardMaterial({ color: item.towel ?? 0x9fb8c9, roughness: 1 });
  for (const s of [-1, 1]) g.add(rbox(0.32, 0.36, 0.012, 0, H - 0.04 - 0.18, -hz + s * 0.016, towel, 0.004));
  g.add(rbox(0.32, 0.02, 0.045, 0, H - 0.03, -hz, towel, 0.008));
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }];
  return g;
}

const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.5, metalness: 0.4 });
const coatColors = [0x2f4a63, 0x8a8f86, 0x6b3a2e, 0x2b2b2b];

/** Wall coat rack: a hat shelf at 1.75 m on brackets, hooks below with a few jackets and a cap. */
function coatrack(item) {
  const g = new THREE.Group();
  const w = item.w, y = 1.75, back = -0.13; // local −z = the wall
  g.add(rbox(w, 0.025, 0.26, 0, y, back + 0.13, whiteWood, 0.005));            // shelf
  g.add(rbox(w, 0.08, 0.02, 0, y - 0.08, back + 0.01, whiteWood, 0.004));      // hook rail
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) g.add(rbox(0.02, 0.14, 0.2, x, y - 0.08, back + 0.11, whiteWood, 0.004));
  const hooks = 5;
  for (let i = 0; i < hooks; i++) {
    const x = -w / 2 + 0.08 + (i * (w - 0.16)) / (hooks - 1);
    g.add(rbox(0.015, 0.015, 0.06, x, y - 0.1, back + 0.05, blackMetal, 0.004));
    if (i % 2 === 0 || i === 3) { // jackets on some hooks: shoulders + body, hanging from the hook
      const m = new THREE.MeshStandardMaterial({ color: coatColors[i % coatColors.length], roughness: 0.95 });
      g.add(rbox(0.3, 0.75, 0.1, x, y - 0.5, back + 0.08, m, 0.04));
      g.add(rbox(0.22, 0.08, 0.11, x, y - 0.14, back + 0.08, m, 0.03));
    }
  }
  // a cap on the shelf and a folded scarf
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9c3b2c, roughness: 0.9 }));
  cap.position.set(-w * 0.2, y + 0.013, back + 0.14);
  g.add(cap, rbox(0.2, 0.04, 0.16, w * 0.22, y + 0.033, back + 0.14, new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 1 }), 0.015));
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: back, z1: back + 0.18 }]; // the jackets
  return g;
}

/** Two-tier black wire shoe rack (local −z = the wall) with a few pairs of shoes. */
function shoerack(item) {
  const g = new THREE.Group();
  const w = item.w, d = 0.28, z = -0.15 + d / 2;
  for (const y of [0.06, 0.26]) for (let k = 0; k < 4; k++) g.add(rbox(w, 0.01, 0.01, 0, y, z - d / 2 + 0.03 + k * ((d - 0.06) / 3), blackMetal, 0.003));
  for (const x of [-w / 2, w / 2]) for (const zz of [z - d / 2 + 0.01, z + d / 2 - 0.01]) g.add(rbox(0.012, 0.32, 0.012, x, 0.16, zz, blackMetal, 0.003));
  const shoeCols = [0x1c1c1c, 0xe9e6df, 0x7a4b2e, 0x3d5a7a, 0xc0392b];
  const shoe = (x, y, col) => {
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
    for (const dx of [-0.055, 0.055]) {
      g.add(rbox(0.09, 0.07, 0.26, x + dx, y + 0.04, z, m, 0.03));
      g.add(rbox(0.095, 0.015, 0.27, x + dx, y + 0.012, z, new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }), 0.006));
    }
  };
  [[-0.22, 0.27, 0], [0.04, 0.27, 1], [-0.12, 0.07, 2], [0.18, 0.07, 3], [0.22, 0.27, 4]].forEach(([x, y, c]) => shoe(x * (w / 0.74), y, shoeCols[c]));
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -0.15, z1: -0.15 + d }];
  return g;
}

const gloss = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f5, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
const shelfWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 });

/** IKEA BYÅS TV bench: low high-gloss white carcass on a recessed plinth, two doors (left, right) with
 * hidden grips at the top and an open middle section with a shelf. Faces local +z, back at −z. */
function byas(item) {
  const g = new THREE.Group();
  const { w, d, h } = item, plinth = 0.06, t = 0.018, door = w * 0.33;
  g.add(rbox(w - 0.06, plinth, d - 0.06, 0, plinth / 2, -0.01, shelfWhite, 0.004));          // recessed plinth
  g.add(rbox(w, t, d, 0, h - t / 2, 0, gloss, 0.004), rbox(w, t, d, 0, plinth + t / 2, 0, gloss, 0.004)); // top, bottom
  g.add(rbox(w, h - plinth, t, 0, plinth + (h - plinth) / 2, -d / 2 + t / 2, gloss, 0.003));    // back
  for (const x of [-w / 2 + t / 2, w / 2 - t / 2, -w / 2 + door, w / 2 - door]) {             // sides + dividers
    g.add(rbox(t, h - plinth, d - 0.01, x, plinth + (h - plinth) / 2, 0, gloss, 0.003));
  }
  g.add(rbox(w - 2 * door - t, t, d - 0.04, 0, plinth + (h - plinth) * 0.5, -0.01, shelfWhite, 0.003)); // middle shelf
  for (const s of [-1, 1]) { // the doors: gloss fronts, a thin shadow line as the grip at the top
    const cx = s * (w / 2 - door / 2);
    g.add(rbox(door - 0.006, h - plinth - 0.03, 0.018, cx, plinth + (h - plinth - 0.03) / 2 + 0.003, d / 2 - 0.009, gloss, 0.003));
    g.add(rbox(door - 0.08, 0.008, 0.004, cx, h - 0.03, d / 2 + 0.001, new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.6 }), 0.001));
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** Woven rug texture: base colour, fine random weave, a thin border band (canvas, no image files). */
function rugTexture(item) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = item.color;
  g.fillRect(0, 0, c.width, c.height);
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26000; i++) { // weave: tiny light/dark dashes
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(90,70,40,0.07)';
    g.fillRect(rand() * c.width, rand() * c.height, 2 + rand() * 3, 1);
  }
  const b = 26;
  g.strokeStyle = item.border;
  g.lineWidth = 7;
  g.strokeRect(b, b, c.width - 2 * b, c.height - 2 * b);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Big rug: a thin slab (w along local x, d along z), walked over (no footprint). */
function rug(item) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(item.w, item.h, item.d),
    new THREE.MeshStandardMaterial({ map: rugTexture(item), roughness: 1 }));
  m.position.y = item.h / 2 + 0.002; // above the floor and its AO overlay
  m.receiveShadow = true;
  g.add(m);
  return g;
}

const BUILDERS = { sofa, armchair, footstool, floorlamp, sidetable, coffeetable, loungesofa, loungetable, parasol, planter, bed, skansnasTable, skansnasChair, bunk, daybed, rug, ragrund, coatrack, shoerack, byas };

/** Build all furniture; returns the scene group, collision segments per level and lamps. */
export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []];
  const lights = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    // one mesh per material per piece (#48); the parasol folds and the beers come and go
    if (item.type !== 'parasol') mergeStatic(obj, obj.userData.keep ?? []);
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
