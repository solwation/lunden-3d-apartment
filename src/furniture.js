import * as THREE from 'three';
import { sfx } from './audio.js';
import { mergeStatic } from './merge.js';
import { restTarget } from './rest.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FURNITURE, LANDSKRONA as L, LEVELS, SKANSNAS, IDANAS } from './config.js';
import { loungesofa, loungetable, parasol, planter } from './patio.js';
import { Screen } from './screens.js';
import { lampMat } from './interior.js';

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
  // three places on the sofa and one on the chaise (#71), local x, seat height, z, facing +z
  const third = (mainX1 - mainX0) / 3;
  g.userData.rest = { kind: 'sit', name: 'soffan', verb: 'sätta dig i', spots: [0.5, 1.5, 2.5].map((k) => ({ x: mainX0 + third * k, y: L.seatHeight, z: -0.08 }))
    .concat([{ x: (chX0 + chX1) / 2, y: L.seatHeight, z: -0.08 }]) };
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
  g.userData.rest = { kind: 'sit', name: 'fåtöljen', verb: 'sätta dig i', spots: [{ x: 0, y: L.seatHeight, z: -0.08 }] };
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
  g.userData.surfaces = [{ x0: -0.15, x1: 0.15, z0: -0.15, z1: 0.15, y: 0.5325 }]; // a cup can stand here (#90)
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
  g.userData.surfaces = [{ x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y: h }];
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

/** Gingham check texture (two blues where the stripes cross, white between), one repeat = 2 checks. */
function ginghamTexture(b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = b.white; g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.55; g.fillStyle = b.blue;
  g.fillRect(0, 0, 32, 64); g.fillRect(0, 0, 64, 32);
  g.globalAlpha = 1; g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Seamless chintz (#83): a sage ground with seeded blooms (layered petals), leaves and curling stems in
 * the bedding's colours; one repeat = b.repeat metres. Everything is drawn wrapped, so it tiles. */
function chintzTexture(b) {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = b.ground; g.fillRect(0, 0, N, N);
  let seed = 21;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wrapped = (x, y, draw) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.save(); g.translate(x + dx, y + dy); draw(); g.restore(); } };
  const leaf = (len, w, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -len / 2, 0, -len); g.quadraticCurveTo(-w, -len / 2, 0, 0); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.stroke(); };
  // stems and leaves first
  for (let i = 0; i < 60; i++) {
    const x = rand() * N, y = rand() * N, a = rand() * 6.28, col = b.leaves[Math.floor(rand() * b.leaves.length)], sc = 0.6 + rand() * 0.8;
    wrapped(x, y, () => {
      g.rotate(a);
      g.strokeStyle = b.leaves[2]; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(20 * sc, -20 * sc, -10 * sc, -40 * sc, 15 * sc, -60 * sc); g.stroke();
      leaf(34 * sc, 11 * sc, col);
      g.rotate(1.1); leaf(26 * sc, 9 * sc, col);
    });
  }
  // blooms: layered rounded petals, a darker heart, white outlines; small white flowers between
  for (let i = 0; i < 26; i++) {
    const x = rand() * N, y = rand() * N, r = 16 + rand() * 22, col = b.flowers[Math.floor(rand() * b.flowers.length)], petals = 6 + Math.floor(rand() * 4), rot = rand() * 6.28;
    wrapped(x, y, () => {
      g.rotate(rot);
      for (const [k, sh] of [[1, 0], [0.68, 0.12], [0.38, 0.24]]) {
        g.fillStyle = col; g.globalAlpha = 1;
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2;
          g.beginPath(); g.ellipse(Math.cos(a) * r * k * 0.55, Math.sin(a) * r * k * 0.55, r * k * 0.5, r * k * 0.34, a, 0, Math.PI * 2);
          g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.3; g.stroke();
        }
        g.fillStyle = `rgba(80,20,30,${sh})`; g.beginPath(); g.arc(0, 0, r * k * 0.5, 0, 6.28); g.fill();
      }
      g.fillStyle = b.flowers[3]; g.beginPath(); g.arc(0, 0, r * 0.12, 0, 6.28); g.fill();
    });
  }
  for (let i = 0; i < 70; i++) {
    const x = rand() * N, y = rand() * N, r = 3 + rand() * 3;
    wrapped(x, y, () => { g.fillStyle = '#f4f1ea'; for (let p = 0; p < 5; p++) { const a = (p / 5) * 6.28; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, r * 0.7, 0, 6.28); g.fill(); } g.fillStyle = b.flowers[3]; g.beginPath(); g.arc(0, 0, r * 0.5, 0, 6.28); g.fill(); });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A crumpled duvet: a subdivided slab whose top is gently wavy, sides hanging down past the mattress. */
function duvetGeometry(w, l, drop, seed = 3) {
  const geo = new THREE.BoxGeometry(w, 0.06, l, 24, 1, 24);
  const p = geo.attributes.position;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = [...Array(5)].map(() => [rnd() * 6 + 3, rnd() * 6 + 3, rnd() * 6, 0.006 + rnd() * 0.01]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let h = 0;
    for (const [a, b, ph, amp] of waves) h += amp * Math.sin(x * a + ph) * Math.cos(z * b + ph);
    const edge = Math.max(Math.abs(x) / (w / 2), 0); // 1 at the sides
    const sag = Math.pow(Math.max(0, edge - 0.85) / 0.15, 2) * drop; // the sides hang down
    p.setY(i, y + h * (1 - edge * 0.5) - sag);
  }
  geo.computeVertexNormals();
  const uv = geo.attributes.uv; // UVs in metres for the check
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return geo;
}

/** Bed: upholstered base on legs, mattress, duvet, pillows, headboard. Local −z = head end.
 * `item.bedding` gives the cosy check bedding (Sovrum 1); otherwise plain linen. */
/** Gunnared-like melange (canvas): fine dark and light flecks on the base colour. */
function melangeTexture(hex) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), base = new THREE.Color(hex);
  g.fillStyle = base.getStyle(); g.fillRect(0, 0, 128, 128);
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = base.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.16).getStyle();
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** IKEA IDANÄS frame (#91): an upholstered frame down to short pale wooden legs, drawer fronts on the sides,
 * a tall sloping headboard with deep buttons. Local −z = the head end; the mattress is item.w × item.l. */
function idanasFrame(g, item) {
  const I = IDANAS, w = item.w, l = item.l, z0 = -l / 2;
  const fabric = new THREE.MeshStandardMaterial({ color: 0xffffff, map: melangeTexture(I.color), roughness: 0.95 });
  const sideW = (I.W - w) / 2, frameL = l + 0.03, fy = (I.legH + I.frameH) / 2, fh = I.frameH - I.legH;
  g.add(rbox(I.W, fh, frameL, 0, fy, 0.015, fabric, 0.03));
  // drawer fronts (two each side), a slim shadow line round each
  const line = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.9 });
  for (const s of [-1, 1]) for (const k of [-1, 1]) g.add(rbox(0.004, fh - 0.12, l * 0.42, s * (I.W / 2 + 0.001), fy, k * l * 0.23, line, 0.002));
  const wood = new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: 0.6 });
  for (const x of [-I.W / 2 + 0.08, I.W / 2 - 0.08]) for (const z of [z0 + 0.1, -z0 - 0.06]) {
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, I.legH, 10), wood);
    lg.position.set(x, I.legH / 2, z);
    lg.castShadow = true;
    g.add(lg);
  }
  // the headboard: leaning back a little, buttons in a grid (dark dimples)
  const hb = new THREE.Group();
  hb.position.set(0, I.legH, z0 - I.head / 2);
  hb.rotation.x = -0.08;
  hb.add(rbox(I.W, I.headH - I.legH, I.head * 0.75, 0, (I.headH - I.legH) / 2, 0, fabric, 0.06));
  const button = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.8 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
    const bx = -I.W / 2 + 0.15 + c * ((I.W - 0.3) / 8) + (r % 2 ? (I.W - 0.3) / 16 : 0);
    if (bx > I.W / 2 - 0.1) continue;
    const bt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), button);
    bt.scale.z = 0.5;
    bt.position.set(bx, I.frameH + 0.25 + r * 0.16, I.head * 0.375 + 0.003);
    hb.add(bt);
  }
  g.add(hb);
  return I.frameH - 0.1 + I.mattressH; // the mattress top: it sits 10 cm into the frame
}

function bed(item) {
  const g = new THREE.Group();
  const w = item.w, l = item.l, z0 = -l / 2;
  let top = 0.52; // mattress top (the plain bed)
  if (item.model === 'idanas') {
    top = idanasFrame(g, item);
    g.add(rbox(w, IDANAS.mattressH, l, 0, top - IDANAS.mattressH / 2, 0, linen, 0.05));
  } else {
    g.add(rbox(w + 0.04, 0.22, l + 0.04, 0, 0.1 + 0.11, 0, bedFabric, 0.02));
    g.add(rbox(w, 0.2, l, 0, 0.32 + 0.1, 0, linen, 0.05));
  }
  const dy = top - 0.52; // the bedding below is laid out for a 0.52 m mattress top
  const bedding = new THREE.Group();
  bedding.position.y = dy;
  g.add(bedding);
  const b = item.bedding;
  if (b) {
    const tex = b.pattern === 'chintz' ? chintzTexture(b) : ginghamTexture(b);
    const rep = b.pattern === 'chintz' ? b.repeat : 2 * b.check; // metres per texture repeat
    tex.repeat.set(1 / rep, 1 / rep);
    const check = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const duv = new THREE.Mesh(duvetGeometry(w + 0.12, l * 0.74, 0.2), check);
    duv.position.set(0, 0.55, z0 + l * 0.63);
    duv.castShadow = duv.receiveShadow = true;
    bedding.add(duv);
    // two pillows in check pillowcases, plump, and a dark blue cushion in front of them
    for (const px of [-w / 4, w / 4]) {
      // planar UVs in metres (top view) so the pillowcase checks match the duvet's
      const pg = new THREE.SphereGeometry(1, 20, 12).scale(0.33, 0.08, 0.22);
      const pp = pg.attributes.position, pu = pg.attributes.uv;
      for (let i = 0; i < pp.count; i++) pu.setXY(i, pp.getX(i), pp.getZ(i));
      const pil = new THREE.Mesh(pg, check);
      pil.position.set(px, 0.6, z0 + 0.27);
      pil.rotation.x = -0.25;
      pil.castShadow = true;
      bedding.add(pil);
    }
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: b.cushion, roughness: 0.9 }));
    cushion.scale.set(0.22, 0.07, 0.16);
    cushion.position.set(-0.05, 0.64, z0 + 0.5);
    cushion.rotation.set(-0.6, 0.15, 0.1);
    cushion.castShadow = true;
    bedding.add(cushion);
    // a knitted throw folded over the foot end, hanging down a little on one side
    const knit = new THREE.MeshStandardMaterial({ color: b.throw, roughness: 1 });
    bedding.add(rbox(w * 0.85, 0.035, 0.42, 0.04, 0.59, -z0 - 0.3, knit, 0.015));
    bedding.add(rbox(0.035, 0.2, 0.42, 0.04 + w * 0.425 + 0.02, 0.5, -z0 - 0.3, knit, 0.012));
  } else {
    bedding.add(rbox(w + 0.02, 0.06, l * 0.7, 0, 0.53, z0 + l * 0.65, duvet, 0.03));
    for (const px of w > 1.2 ? [-w / 4, w / 4] : [0]) bedding.add(rbox(Math.min(0.6, w * 0.8), 0.12, 0.38, px, 0.58, z0 + 0.28, linen, 0.06));
  }
  if (item.model !== 'idanas') {
    g.add(rbox(w + 0.06, 0.6, 0.08, 0, 0.62, z0 - 0.04, bedFabric, 0.03));
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [z0 + 0.06, -z0 - 0.06]) g.add(leg(x, z, 0.1));
  }
  // lying down (#72): head on the pillows, feet towards local +z; one place per side of a double bed
  g.userData.rest = { kind: 'lie', name: 'sängen', verb: 'lägga dig i',
    spots: (w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => ({ x, y: top, z: z0 + 0.32 })) };
  const hw = item.model === 'idanas' ? IDANAS.W / 2 : w / 2 + 0.03, back = item.model === 'idanas' ? IDANAS.head : 0.08;
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: z0 - back, z1: -z0 + 0.03 }];
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
  g.userData.surfaces = [{ x0: -hw + 0.04, x1: hw - 0.04, z0: -hl + 0.04, z1: hl - 0.04, y: T.h + 0.004 }];
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
  g.userData.rest = { kind: 'sit', name: 'stolen', verb: 'sätta dig på', spots: [{ x: 0, y: C.seat, z: -0.06 }] };
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
  g.userData.rest = { kind: 'lie', name: 'våningssängen', verb: 'lägga dig i',
    spots: [0.25, 1.15].map((y) => ({ x: 0, y: y + 0.17, z: -l / 2 + 0.3, label: y > 1 ? 'överslafen' : 'underslafen' })) };
  // `watch`: a place to sit in the lower bunk, back to the wall (local −x), facing the room, hunched
  // under the top bunk; the PC in the room swings its monitor round and plays a film
  if (item.watch) g.userData.rest.spots.push({ kind: 'sit', verb: 'sätta dig i', x: -w / 2 + 0.22, y: 0.3, z: item.watch.z, dir: [1, 0], pc: 'film' });
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
  // Tilly's daybed (#72): lie along it, head at the −x end (feet towards +x)
  g.userData.rest = { kind: 'lie', name: 'dagbädden', verb: 'lägga dig i', spots: [{ x: -W / 2 + 0.35, y: 0.5, z: 0, dir: [1, 0] }] };
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
  g.userData.rest = { kind: 'sit', name: 'stolen', verb: 'sätta dig på', spots: [{ x: 0, y: S, z: -0.05 }] };
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

/** A jacket on a hook: collar, shoulders, a body narrowing down to the hem, sleeves hanging along its
 * sides. Hung from (0, 0, 0), front towards +z. `len` = hem below the hook, `kind` changes the cut. */
function jacket(len, color, kind) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  // the rack is 74 cm with jackets on every other hook (29 cm apart): seen from the front they hang
  // edge to edge, side on (on the hook) they are narrow
  const sw = 0.26, hw = kind === 'coat' ? 0.27 : kind === 'puffer' ? 0.28 : 0.25; // shoulder / hem width
  const depth = kind === 'puffer' ? 0.12 : 0.07;
  // body: a tapered extrusion of a trapezoid (shoulders → hem), rounded
  const shape = new THREE.Shape();
  shape.moveTo(-0.06, 0); shape.lineTo(-sw / 2, -0.06); shape.lineTo(-hw / 2, -len); shape.lineTo(hw / 2, -len);
  shape.lineTo(sw / 2, -0.06); shape.lineTo(0.06, 0); shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  body.translate(0, 0, -depth / 2);
  g.add(new THREE.Mesh(body, m));
  // collar / hood, sleeves along the sides, a zip line, quilting bands for the puffer
  g.add(rbox(0.16, 0.05, depth + 0.04, 0, -0.01, 0, m, 0.02));
  for (const sx of [-1, 1]) {
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, len * 0.72, 10), m);
    sl.position.set(sx * (sw / 2 - 0.02), -0.08 - len * 0.36, 0.01);
    sl.rotation.z = sx * 0.06;
    g.add(sl);
  }
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.9 });
  g.add(rbox(0.008, len - 0.08, 0.005, 0, -len / 2 - 0.02, depth / 2 + 0.016, dark, 0.002));
  if (kind === 'puffer') for (let y = -0.18; y > -len + 0.05; y -= 0.13) g.add(rbox(hw * 0.95, 0.006, 0.004, 0, y, depth / 2 + 0.017, dark, 0.002));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Wall coat rack: a hat shelf at 1.75 m on brackets, five hooks with jackets (one per hook, spaced, a
 * little different in length), a beanie and a key bowl on the shelf. Back towards local −z (the wall). */
function coatrack(item) {
  const g = new THREE.Group();
  const w = item.w, y = 1.75, back = -0.13;
  g.add(rbox(w, 0.025, 0.26, 0, y, back + 0.13, whiteWood, 0.005));            // shelf
  g.add(rbox(w, 0.08, 0.02, 0, y - 0.08, back + 0.01, whiteWood, 0.004));      // hook rail
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) g.add(rbox(0.02, 0.14, 0.2, x, y - 0.08, back + 0.11, whiteWood, 0.004));
  const coats = [[0x2f4a63, 0.78, 'shell'], [0x6b3a2e, 0.95, 'coat'], [0x2b2d30, 0.72, 'puffer']];
  const hooks = 5;
  for (let i = 0; i < hooks; i++) {
    const x = -w / 2 + 0.08 + (i * (w - 0.16)) / (hooks - 1);
    g.add(rbox(0.015, 0.015, 0.06, x, y - 0.1, back + 0.05, blackMetal, 0.004));
    const c = coats[[0, 2, 4].indexOf(i)];
    if (!c) continue; // three jackets on alternate hooks, so they don't overlap
    const j = jacket(c[1], c[0], c[2]);
    j.position.set(x, y - 0.11, back + 0.075 + i * 0.008); // staggered off the wall a little (no z-fighting)
    g.add(j);
  }
  // a knitted beanie (dome with a folded brim) and a small key bowl on the shelf
  const knit = new THREE.MeshStandardMaterial({ color: 0x9c3b2c, roughness: 1 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), knit);
  dome.position.set(-w * 0.22, y + 0.035, back + 0.14);
  g.add(dome, rbox(0.18, 0.035, 0.18, -w * 0.22, y + 0.03, back + 0.14, knit, 0.015));
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x2f6f77, roughness: 0.4 }));
  bowl.position.set(w * 0.22, y + 0.033, back + 0.14);
  bowl.castShadow = true;
  g.add(bowl);
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: back, z1: back + 0.18 }]; // the jackets
  return g;
}

/** One shoe: a sole, a rounded upper narrowing to the toe, a heel counter; boots get a shaft. */
function shoe(col, boot) {
  const g = new THREE.Group();
  const up = new THREE.MeshStandardMaterial({ color: col, roughness: 0.65 });
  const sole = new THREE.MeshStandardMaterial({ color: boot ? 0x2a2522 : 0xf0eee8, roughness: 0.85 });
  g.add(rbox(0.09, 0.022, 0.27, 0, 0.011, 0, sole, 0.01));
  const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), up);
  toe.scale.set(0.044, 0.06, 0.1);
  toe.position.set(0, 0.022, 0.06);
  g.add(toe, rbox(0.088, 0.075, 0.14, 0, 0.06, -0.06, up, 0.03));
  if (boot) g.add(rbox(0.085, 0.16, 0.1, 0, 0.17, -0.08, up, 0.03));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Two-tier black wire shoe rack (local −z = the wall) with pairs of sneakers and boots, no overlaps. */
function shoerack(item) {
  const g = new THREE.Group();
  const w = item.w, d = 0.28, z = -0.15 + d / 2;
  for (const y of [0.06, 0.3]) for (let k = 0; k < 4; k++) g.add(rbox(w, 0.01, 0.01, 0, y, z - d / 2 + 0.03 + k * ((d - 0.06) / 3), blackMetal, 0.003));
  for (const x of [-w / 2, w / 2]) for (const zz of [z - d / 2 + 0.01, z + d / 2 - 0.01]) g.add(rbox(0.012, 0.36, 0.012, x, 0.18, zz, blackMetal, 0.003));
  // pairs: [x of the pair's centre / 0.74 m, shelf, colour, boot]
  const pairs = [[-0.25, 0.3, 0xe9e6df, false], [0.0, 0.3, 0x3d5a7a, false], [0.25, 0.3, 0xc0392b, false],
    [-0.2, 0.06, 0x5a3a24, true], [0.18, 0.06, 0x1c1c1c, true]];
  for (const [px, y, col, boot] of pairs) {
    for (const dx of [-0.05, 0.05]) {
      const s1 = shoe(col, boot);
      s1.position.set(px * (w / 0.74) + dx, y + 0.005, z);
      g.add(s1);
    }
  }
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
  g.userData.surfaces = [{ x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y: h }];
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** A TV (#68, #100): Philips 55" on a central stand, or wall-mounted (`mount: 'wall'`, Philips 32" PFS6906
 * with a thin silver bezel on a bracket). E toggles it; on: a random procedural programme (screens.js, redrawn
 * at item.fps) and an additive Ambilight glow on the wall behind in the programme's colours. The remote
 * (#101) calls `channel()` / `toggle()`. Faces local +z. */
function tv(item) {
  const g = new THREE.Group();
  const { w, h } = item, wall = item.mount === 'wall';
  const dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.35, metalness: 0.2 });
  const stand = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.5 });
  const bezel = wall ? new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7 }) : dark;
  // the panel's front face is at zf; y0 = the screen's bottom (on the bench, or centred on item.y for the wall)
  let zf, y0, glowZ;
  if (wall) {
    y0 = -h / 2; zf = 0.03 + 0.06; glowZ = 0.004;                                 // wall at z 0, bracket 3 cm, panel 6 cm
    g.add(rbox(0.2, 0.2, 0.03, 0, 0, 0.015, stand, 0.004));                      // wall bracket
    g.add(rbox(w * 0.6, h * 0.6, 0.04, 0, 0, 0.05, dark, 0.01));                 // back housing
    g.add(rbox(w, h, 0.02, 0, 0, zf - 0.01, bezel, 0.006));                      // thin silver bezel / panel
  } else {
    y0 = 0.075; zf = -0.03 + 0.0125; glowZ = -0.19;                              // just off the wall behind the bench
    g.add(rbox(0.42, 0.012, 0.24, 0, 0.006, -0.02, stand, 0.004));               // foot plate
    g.add(rbox(0.12, y0 + 0.12, 0.03, 0, (y0 + 0.12) / 2, -0.05, stand, 0.006)); // neck
    g.add(rbox(w, h, 0.025, 0, y0 + h / 2, -0.03, dark, 0.008));                 // panel
    g.add(rbox(w * 0.7, h * 0.6, 0.05, 0, y0 + h * 0.45, -0.065, dark, 0.02));   // back housing
  }
  const scr = new Screen(item.px ?? 384, Math.round((item.px ?? 384) * 9 / 16));
  const screenMat = new THREE.MeshBasicMaterial({ map: scr.texture, color: 0xffffff, toneMapped: false });
  const offMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.12, metalness: 0.4 });
  const inset = wall ? 0.016 : 0.012;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - inset, h - inset), offMat);
  screen.position.set(0, y0 + h / 2, zf + 0.0015);
  g.add(screen);
  // power LED under the screen: red on standby, white while on
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  led.position.set(w * 0.42, y0 + 0.004, zf + 0.002);
  g.add(led);
  // Ambilight: a soft additive glow on the wall behind
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d'), rg = gg.createRadialGradient(32, 32, 6, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), color: 0x000000, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.9, h * 2.1), glowMat);
  glow.position.set(0, y0 + h / 2 + (wall ? h * 0.08 : 0), glowZ); // 3-sided Ambilight: a bit more above than below
  g.add(glow);
  let on = false, acc = 0;
  const target = new THREE.Color();
  const shine = ([hh, ss, ll]) => target.setHSL(hh, ss, ll);
  const interact = {
    name: item.name ?? 'tv:n', kind: 'tv', pickable: g, screen: scr,
    get isOpen() { return on; },
    get verb() { return on ? 'stänga av' : 'slå på'; },
    toggle() {
      on = !on;
      screen.material = on ? screenMat : offMat;
      led.material.color.setHex(on ? 0xf4f4f4 : 0xff2a2a);
      if (on) { scr.tune(); shine(scr.draw(0)); glowMat.color.copy(target); } else glowMat.color.setHex(0x000000);
      return on;
    },
    /** The remote's channel button (#101): the next programme, through snow. */
    channel() { if (!on) return false; scr.tune(); return true; },
    update(dt) {
      if (!on) return;
      acc += dt;
      if (acc < 1 / item.fps) return;
      shine(scr.draw(acc));
      acc = 0;
      glowMat.color.lerp(target, 0.25); // the Ambilight follows the picture's colours, softly
    },
  };
  g.userData.interact = interact;
  g.userData.keep = [screen, glow, led];
  g.position.y = item.y;
  g.traverse((m) => { if (m.isMesh && m !== glow && m !== led) m.castShadow = true; });
  return g;
}

/** IKEA NORDKISA bedside table (bamboo): four square legs, top, an open shelf under it, a drawer with
 * a cut-out grip, a slatted bottom shelf. Faces local +z. */
function nordkisa(item) {
  const g = new THREE.Group();
  const w = item.w, h = item.h, l = 0.032, hw = w / 2 - l / 2;
  for (const x of [-hw, hw]) for (const z of [-hw, hw]) g.add(rbox(l, h - 0.02, l, x, (h - 0.02) / 2, z, bamboo, 0.004));
  g.add(rbox(w, 0.02, w, 0, h - 0.01, 0, bamboo, 0.004));                          // top
  const yd = h - 0.2;                                                              // drawer box under the open shelf
  g.add(rbox(w - 0.02, 0.012, w - 0.02, 0, yd + 0.1, 0, bamboo, 0.003));           // shelf / drawer top
  g.add(rbox(w - 2 * l, 0.1, w - 0.03, 0, yd + 0.045, 0, bamboo, 0.003));          // drawer
  g.add(rbox(0.1, 0.022, 0.004, 0, yd + 0.075, w / 2 - 0.013, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 }), 0.004)); // grip cut-out
  for (let k = 0; k < 5; k++) g.add(rbox(w - 2 * l, 0.012, 0.05, 0, 0.1, -w / 2 + 0.06 + k * ((w - 0.12) / 4), bamboo, 0.003)); // slatted shelf
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.surfaces = [{ x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -w / 2 + 0.03, z1: w / 2 - 0.03, y: h }];
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -w / 2, z1: w / 2 }];
  return g;
}

const lampWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.45 });

/** IKEA NYMÅNE work lamp (white): round flat charging base, a lower arm leaning back, an upper arm
 * reaching forward (local +z) to a cylinder head pointing down. Its lens has its own material, so each
 * lamp switches on its own (lights.js, the shared light pool). */
function worklamp(item, lights) {
  const g = new THREE.Group();
  const lens = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffd9a0, emissiveIntensity: 0.04, roughness: 0.4 });
  const add = (m) => { m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 28), lampWhite)).position.y = 0.0075;
  const arm = (len, from, ang) => { // a rod from `from` (y, z) tilted by `ang` from vertical towards +z
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, len, 8), lampWhite);
    rod.rotation.x = ang;
    rod.position.set(0, from[0] + (Math.cos(ang) * len) / 2, from[1] + (Math.sin(ang) * len) / 2);
    add(rod);
    return [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len];
  };
  const j1 = arm(0.3, [0.015, 0.02], -0.25);   // lower arm, leaning back
  add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), lampWhite)).position.set(0, j1[0], j1[1]);
  const j2 = arm(0.28, j1, 1.15);              // upper arm, reaching forward
  const head = new THREE.Group();
  head.position.set(0, j2[0], j2[1]);
  head.rotation.x = 0.5;                       // pointing down and a little forward
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 18), lampWhite);
  can.castShadow = true;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.028, 18).rotateX(Math.PI / 2), lens);
  disc.position.y = -0.051;
  head.add(can, disc);
  g.add(head);
  // the pool light sits a little way out where the head points (the group is turned by rot + π)
  const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI, reach = j2[1] + 0.05;
  lights.push({ object: g, shade: lens, height: j2[0] - 0.05, level: item.level, name: 'nattlampan',
    offset: [Math.sin(yaw) * reach, Math.cos(yaw) * reach] });
  g.position.y = item.y;
  g.userData.footprint = [];
  return g;
}

const nearBlack = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.45 });
const neon = 0x44ff66;

/** A gaming desk with a PC (#77). Faces local +z (the user sits on the +z side), back to the wall at
 * −z. E toggles the PC: an animated game on the curved monitor, RGB fans and keys cycling colours,
 * game sounds; off: a dark screen and a dim power light. The monitor sits on an arm: `watch(pos)`
 * swings it out and round towards someone watching from elsewhere (the bunk) and plays a film
 * instead of the game; `watch(null)` brings it back to the desk. */
function gamingdesk(item) {
  const g = new THREE.Group();
  const { w, d } = item, h = 0.75, hw = w / 2, z0 = -d / 2;
  g.add(rbox(w, 0.03, d, 0, h - 0.015, 0, nearBlack, 0.006));
  for (const x of [-hw + 0.04, hw - 0.04]) g.add(rbox(0.05, h - 0.03, d - 0.08, x, (h - 0.03) / 2, 0, nearBlack, 0.006)); // panel legs
  g.add(rbox(w - 0.1, 0.25, 0.02, 0, h - 0.18, z0 + 0.06, nearBlack, 0.004)); // modesty panel
  // curved ultrawide: an arc of a cylinder (radius 1 m), 0.8 m wide, 0.34 m high, on a monitor arm
  // (`mon`, pivoting about the stand at z = pz, so the parts below are built relative to it)
  const R = 1.0, sw = 0.8, sh = 0.34, ang = sw / R, my = h + 0.12 + sh / 2, mz = z0 + 0.22, pz = mz - 0.03;
  const mon = new THREE.Group();
  mon.position.z = pz;
  g.add(mon);
  const scrGeo = new THREE.CylinderGeometry(R, R, sh, 32, 1, true, Math.PI - ang / 2, ang);
  scrGeo.translate(0, my, mz + R - pz); // the arc's middle at z = mz, bulging towards −z (the wall)
  // flip the UVs so the picture reads left→right from the front
  const uv = scrGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const c = document.createElement('canvas');
  c.width = 512; c.height = 216;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const onMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  const offMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.12, metalness: 0.4, side: THREE.DoubleSide });
  const screen = new THREE.Mesh(scrGeo, offMat);
  mon.add(screen);
  const bezel = new THREE.CylinderGeometry(R + 0.012, R + 0.012, sh + 0.02, 32, 1, true, Math.PI - ang / 2 - 0.01, ang + 0.02);
  bezel.translate(0, my, mz + R - pz);
  mon.add(new THREE.Mesh(bezel, new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5, side: THREE.DoubleSide })));
  mon.add(rbox(0.05, 0.14, 0.04, 0, h + 0.07, 0, nearBlack, 0.01), rbox(0.26, 0.012, 0.18, 0, h + 0.006, 0, nearBlack, 0.004));
  // tower on the desk's left end: black case, glass side towards the room, three RGB fan rings
  // (towerSide: which end, local x sign; the glass side faces the middle, the headset gets the other end)
  const ts = item.towerSide ?? -1, tx = ts * (hw - 0.16), tz = z0 + 0.25, hx = -ts * (hw - 0.12);
  g.add(rbox(0.22, 0.46, 0.45, tx, h + 0.23, tz, nearBlack, 0.01));
  const rgb = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false }));
  rgb.forEach((m, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 24), m);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(tx - ts * 0.112, h + 0.1 + i * 0.13, tz + 0.08);
    g.add(ring);
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0x223, transparent: true, opacity: 0.35, roughness: 0.05 }));
  glass.rotation.y = -ts * Math.PI / 2; glass.position.set(tx - ts * 0.115, h + 0.23, tz);
  g.add(glass);
  const power = new THREE.MeshBasicMaterial({ color: 0x103018, toneMapped: false });
  g.add(rbox(0.004, 0.012, 0.012, tx - ts * 0.112, h + 0.42, tz + 0.18, power, 0.002));
  // keyboard with a glowing underside strip, mouse on a big pad, headset on a stand, speakers, can, mug
  g.add(rbox(0.9, 0.003, 0.4, 0.1, h + 0.0015, 0.12, new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.95 }), 0.002));
  g.add(rbox(0.44, 0.025, 0.15, -0.02, h + 0.015, 0.1, nearBlack, 0.006));
  const keysMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
  g.add(rbox(0.42, 0.004, 0.13, -0.02, h + 0.029, 0.1, keysMat, 0.002));
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), nearBlack);
  mouse.scale.set(0.033, 0.02, 0.06); mouse.position.set(0.37, h + 0.012, 0.12);
  g.add(mouse);
  g.add(rbox(0.012, 0.25, 0.012, hx, h + 0.125, z0 + 0.15, nearBlack, 0.004), rbox(0.1, 0.01, 0.1, hx, h + 0.005, z0 + 0.15, nearBlack, 0.004));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 20, Math.PI), nearBlack);
  band.position.set(hx, h + 0.25, z0 + 0.15); band.rotation.y = Math.PI / 2;
  g.add(band);
  for (const s of [-1, 1]) g.add(rbox(0.07, 0.07, 0.07, hx + s * 0.085, h + 0.18, z0 + 0.15, new THREE.MeshStandardMaterial({ color: neon, roughness: 0.5 }), 0.02)); // ear cups (green)
  for (const x of [-0.5, 0.48]) g.add(rbox(0.09, 0.16, 0.09, x, h + 0.08, z0 + 0.1, nearBlack, 0.01));
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x1aa34a, roughness: 0.3, metalness: 0.6 }));
  can.position.set(0.55, h + 0.06, 0.18);
  g.add(can);
  // a soft additive glow on the wall behind the monitor
  const gc = document.createElement('canvas'); gc.width = gc.height = 64;
  const gg = gc.getContext('2d'), rg = gg.createRadialGradient(32, 32, 6, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), color: 0x000000, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), glowMat);
  glow.position.set(0, my, z0 + 0.01);
  g.add(glow);
  // the game: a scrolling neon landscape, ships, laser bolts, explosions, a HUD with a running score
  const ctx = c.getContext('2d');
  const sparks = [];
  let t = 0, acc = 0, score = 0, on = false, nextShot = 0, watching = false;
  const draw = () => {
    const W = c.width, H = c.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b0326'); sky.addColorStop(1, '#3a0b4a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,60,200,0.6)'; ctx.lineWidth = 1; // neon grid floor
    for (let k = 0; k < 12; k++) { const y = H * 0.62 + ((k * 14 + t * 60) % (H * 0.4)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let k = -10; k <= 10; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 12, H * 0.62); ctx.lineTo(W / 2 + k * 70, H); ctx.stroke(); }
    const px = W * 0.25, py = H * (0.45 + 0.15 * Math.sin(t * 2)); // the player's ship
    ctx.fillStyle = '#44ff66'; ctx.beginPath(); ctx.moveTo(px + 26, py); ctx.lineTo(px - 14, py - 10); ctx.lineTo(px - 14, py + 10); ctx.fill();
    for (let k = 0; k < 3; k++) { // enemies
      const ex = W - ((t * 90 + k * 170) % (W + 60)), ey = H * (0.25 + 0.2 * k + 0.05 * Math.sin(t * 3 + k));
      ctx.fillStyle = '#ff5533'; ctx.fillRect(ex - 10, ey - 7, 20, 14);
    }
    for (let k = sparks.length - 1; k >= 0; k--) { // lasers and explosion sparks
      const s = sparks[k]; s.x += s.vx; s.y += s.vy; s.life -= 1;
      ctx.fillStyle = s.col; ctx.fillRect(s.x, s.y, s.w, s.h);
      if (s.life <= 0) sparks.splice(k, 1);
    }
    ctx.fillStyle = '#eaffee'; ctx.font = 'bold 16px monospace'; // HUD
    ctx.fillText(`SCORE ${String(score).padStart(7, '0')}`, 12, 22);
    ctx.fillStyle = (Math.floor(t * 4) % 2) ? '#44ff66' : '#1a5a2a'; ctx.fillText('● LIVE', W - 80, 22);
    ctx.fillStyle = '#44ff66'; ctx.fillRect(12, H - 14, 120 * (0.5 + 0.5 * Math.sin(t)), 6);
    tex.needsUpdate = true;
    return [px, py];
  };
  const shoot = (px, py) => {
    sparks.push({ x: px + 26, y: py - 1, vx: 14, vy: 0, w: 18, h: 3, life: 30, col: '#7dffb0' });
    if (Math.random() < 0.45) { // an explosion somewhere ahead
      const ex = c.width * (0.6 + Math.random() * 0.35), ey = c.height * (0.2 + Math.random() * 0.4);
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * 6.28, v = 1 + Math.random() * 4;
        sparks.push({ x: ex, y: ey, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 3, h: 3, life: 10 + Math.random() * 10, col: ['#ffd23f', '#ff6b35', '#ff3cc8'][k % 3] });
      }
      score += 100 + Math.floor(Math.random() * 400);
      return 'boom';
    }
    return 'pew';
  };
  // the film (when watched from the bunk): a letterboxed night flight over dunes, with subtitles
  const lines = ['— Vi är nästan framme.', '— Ser du ljusen där borta?', '— Håll i dig!', '— Det där var nära …', '— Hem nu. Mamma väntar.'];
  const drawFilm = () => {
    const W = c.width, H = c.height, bar = 22;
    const sky = ctx.createLinearGradient(0, bar, 0, H - bar);
    sky.addColorStop(0, '#061433'); sky.addColorStop(1, '#2d4a7a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f4f1d0'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.3, 18, 0, 6.28); ctx.fill(); // moon
    for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.25 * ((k * 7) % 3)})`; ctx.fillRect((k * 97 + 13) % W, bar + ((k * 53) % (H * 0.45)), 2, 2); }
    [[0.62, 30, 0.25, '#1b2a4a'], [0.72, 60, 0.6, '#132038'], [0.82, 110, 1.4, '#0b1426']].forEach(([y0, amp, v, col], i) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); // dunes, three layers of parallax
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * y0 - amp * 0.3 * (1 + Math.sin((x + t * 40 * v) * 0.012 + i * 2)));
      ctx.lineTo(W, H); ctx.fill();
    });
    const sx = W * 0.4 + 30 * Math.sin(t * 0.7), sy = H * 0.42 + 10 * Math.sin(t * 1.3); // the ship and its trail
    ctx.fillStyle = 'rgba(120,220,255,0.5)'; ctx.fillRect(sx - 70, sy - 1, 60, 3);
    ctx.fillStyle = '#0a0d14'; ctx.beginPath(); ctx.moveTo(sx + 24, sy); ctx.lineTo(sx - 12, sy - 9); ctx.lineTo(sx - 6, sy); ctx.lineTo(sx - 12, sy + 9); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); // letterbox
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lines[Math.floor(t / 4) % lines.length], W / 2, H - bar - 10);
    ctx.textAlign = 'start';
    tex.needsUpdate = true;
  };
  const arm = rbox(0.04, 0.03, 1, 0, h + 0.12, 0, nearBlack, 0.006); // stretched to the monitor
  arm.geometry.translate(0, 0, 0.5);
  arm.position.z = pz; arm.scale.z = 0.001;
  g.add(arm);
  const turn = { to: 0, out: 0 }; // monitor arm: target yaw, how far it is pulled out from the wall (0–1)
  const where = () => g.getWorldPosition(new THREE.Vector3()).setY(g.getWorldPosition(new THREE.Vector3()).y + 1);
  const interact = {
    name: 'datorn', kind: 'pc', pickable: g,
    get isOpen() { return on; },
    get verb() { return on ? 'stänga av' : 'starta'; },
    toggle() {
      on = !on;
      screen.material = on ? onMat : offMat;
      power.color.setHex(on ? 0x44ff66 : 0x103018);
      if (!on) { rgb.forEach((m) => m.color.setHex(0x111111)); keysMat.color.setHex(0x111111); glowMat.color.setHex(0); }
      if (on) { (watching ? drawFilm : draw)(); this.fan = sfx.pcFan(where()); } else { this.fan?.stop(); this.fan = null; }
      return on;
    },
    /** Swing the monitor towards `pos` (world) and play the film, or back to the desk (null). */
    watch(pos) {
      watching = !!pos;
      if (pos) {
        const p = g.worldToLocal(pos.clone());
        turn.to = THREE.MathUtils.clamp(Math.atan2(p.x, p.z - pz), -1.45, 1.45);
      } else turn.to = 0;
      if (on) (watching ? drawFilm : draw)();
    },
    get watching() { return watching; },
    get monitorYaw() { return mon.rotation.y; },
    update(dt) {
      // the arm: first out from the wall, then round (and back round before it goes in again)
      const want = turn.to !== 0 ? 1 : 0;
      if (want && turn.out < 1) turn.out = Math.min(1, turn.out + dt * 2.5);
      const yawTo = want && turn.out < 1 ? 0 : turn.to;
      const dy = yawTo - mon.rotation.y;
      mon.rotation.y += Math.sign(dy) * Math.min(Math.abs(dy), dt * 2.2);
      if (!want && Math.abs(mon.rotation.y) < 1e-3) turn.out = Math.max(0, turn.out - dt * 2.5);
      mon.position.z = pz + 0.3 * turn.out;
      arm.scale.z = Math.max(0.001, 0.3 * turn.out);
      if (!on) return;
      t += dt; acc += dt;
      const hue = (t * 0.15) % 1; // RGB cycling (cheap: only colours change)
      rgb.forEach((m, i) => m.color.setHSL((hue + i * 0.12) % 1, 1, 0.55));
      keysMat.color.setHSL((hue + 0.5) % 1, 1, 0.5);
      glowMat.color.setHSL(0.8 + 0.1 * Math.sin(t), 0.8, 0.22);
      if (acc < 1 / item.fps) return;
      acc = 0;
      if (watching) { drawFilm(); return; } // a film: no game sounds
      const [px, py] = draw();
      if (t > nextShot) { nextShot = t + 0.25 + Math.random() * 0.9; sfx.game(where(), shoot(px, py)); }
    },
  };
  g.userData.interact = interact;
  g.userData.keep = [mon, arm, glow, ...g.children.filter((m) => rgb.includes(m.material) || m.material === keysMat || m.material === power)];
  g.traverse((m) => { if (m.isMesh && m !== glow) m.castShadow = true; });
  g.userData.surfaces = [{ x0: -hw + 0.04, x1: hw - 0.04, z0: -d / 2 + 0.25, z1: d / 2 - 0.03, y: h }];
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** Gaming chair (black with green stripes): five-star base, seat, tall back with wings. Faces local +z.
 * A seat for sitting down (#71). */
function gamingchair() {
  const g = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: neon, roughness: 0.6 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, leg = rbox(0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, nearBlack, 0.01);
    leg.rotation.y = -a;
    g.add(leg);
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 10), nearBlack).translateY(0.24));
  g.add(rbox(0.52, 0.09, 0.5, 0, 0.46, 0.02, nearBlack, 0.03));
  g.add(rbox(0.5, 0.82, 0.1, 0, 0.92, -0.22, nearBlack, 0.04));
  for (const x of [-0.12, 0.12]) g.add(rbox(0.04, 0.78, 0.005, x, 0.92, -0.168, green, 0.002)); // stripes
  g.add(rbox(0.3, 0.12, 0.05, 0, 1.2, -0.16, green, 0.02)); // headrest pillow
  for (const x of [-0.27, 0.27]) g.add(rbox(0.06, 0.04, 0.3, x, 0.66, 0, nearBlack, 0.015)); // arm rests
  // pc: sitting down switches the PC at the desk on (and brings its monitor back from the bunk)
  g.userData.rest = { kind: 'sit', name: 'gamingstolen', verb: 'sätta dig i', spots: [{ x: 0, y: 0.5, z: -0.04, pc: 'game' }] };
  g.userData.footprint = [{ x0: -0.3, x1: 0.3, z0: -0.3, z1: 0.3 }];
  return g;
}

/** IKEA NORDLI chest of 8 drawers (white): four rows of a narrow (⅓) and a wide (⅔) drawer — narrow left in
 * the top two rows, right in the lower two — each with a black cut-out grip at the top; a low plinth. Faces +z. */
function nordli(item) {
  const g = new THREE.Group();
  const { w, h, d } = item, plinth = 0.06, gap = 0.004, rowH = (h - plinth - 0.02) / 4;
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.5 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  g.add(rbox(w, h - plinth, d - 0.02, 0, plinth + (h - plinth) / 2, -0.01, white, 0.004));
  g.add(rbox(w - 0.04, plinth, d - 0.06, 0, plinth / 2, -0.02, new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.6 }), 0.003));
  for (let r = 0; r < 4; r++) {
    const y0 = plinth + 0.01 + (3 - r) * rowH, narrowLeft = r < 2;
    const parts = narrowLeft ? [[0, 1 / 3], [1 / 3, 1]] : [[0, 2 / 3], [2 / 3, 1]];
    for (const [a, b] of parts) {
      const x0 = -w / 2 + a * w + gap, x1 = -w / 2 + b * w - gap, cx = (x0 + x1) / 2;
      g.add(rbox(x1 - x0, rowH - 2 * gap, 0.018, cx, y0 + rowH / 2, d / 2 - 0.009, white, 0.003));
      g.add(rbox(Math.min(0.16, (x1 - x0) * 0.5), 0.016, 0.004, cx, y0 + rowH - 0.028, d / 2 + 0.001, grip, 0.002));
    }
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.surfaces = [{ x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y: h }];
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** IKEA ALEX desk (white): top with a cable slot at the back, two wide drawers under the front edge with
 * half-round cut-out grips, square-tube legs joined by a low crossbar; crafts on the top. Faces local +z
 * (the user sits on +z; the wall is −z). */
function alex(item) {
  const g = new THREE.Group();
  const { w, d, h } = item, hw = w / 2, hd = d / 2, t = 0.025;
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.8 });
  g.add(rbox(w, t, d - 0.03, 0, h - t / 2, 0.015, white, 0.004), rbox(w, t, 0.012, 0, h - t / 2, -hd + 0.006, white, 0.003)); // top, cable slot
  g.add(rbox(w - 0.1, 0.13, d - 0.1, 0, h - t - 0.065, 0.02, white, 0.004));                   // drawer box
  for (const s of [-1, 1]) {
    g.add(rbox(w / 2 - 0.08, 0.12, 0.018, s * (w / 4 - 0.02), h - t - 0.065, hd - 0.03, white, 0.003)); // drawer fronts
    g.add(rbox(0.1, 0.012, 0.004, s * (w / 4 - 0.02), h - t - 0.012, hd - 0.02, dark, 0.004));          // grips
    for (const z of [-hd + 0.04, hd - 0.06]) g.add(rbox(0.035, h - t - 0.13, 0.035, s * (hw - 0.04), (h - t - 0.13) / 2, z, steel, 0.003)); // legs
    g.add(rbox(0.035, 0.035, d - 0.1, s * (hw - 0.04), 0.06, -0.01, steel, 0.003));                        // foot bars
  }
  g.add(rbox(w - 0.1, 0.03, 0.025, 0, 0.18, -hd + 0.04, steel, 0.003)); // crossbar between the legs
  // crafts: a pencil pot with brushes and pencils, a water glass, a paint box, crayons, scissors, a unicorn
  const y = h, add = (o) => { o.castShadow = true; g.add(o); return o; };
  const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0xffb3d1, roughness: 0.6 })));
  pot.position.set(-hw + 0.12, y + 0.05, -hd + 0.12);
  [0xe23d3d, 0xf2a33a, 0xf4d23a, 0x4fb34f, 0x3a7be0, 0x8e5bd6].forEach((c, i) => {
    const a = (i / 6) * Math.PI * 2;
    const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })));
    stick.position.set(-hw + 0.12 + Math.cos(a) * 0.015, y + 0.12, -hd + 0.12 + Math.sin(a) * 0.015);
    stick.rotation.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
  });
  const glass = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.45, roughness: 0.05 })));
  glass.position.set(-hw + 0.24, y + 0.05, -hd + 0.11);
  const water = add(new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.03, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x6aa6d8, transparent: true, opacity: 0.6, roughness: 0.1 })));
  water.position.set(-hw + 0.24, y + 0.032, -hd + 0.11);
  add(rbox(0.22, 0.02, 0.09, hw - 0.2, y + 0.01, -hd + 0.1, new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }), 0.004)); // paint box
  [0xe23d3d, 0xf2a33a, 0xf4d23a, 0x4fb34f, 0x3a7be0, 0x8e5bd6, 0xf28bc2, 0x8a5a3c].forEach((c, i) => add(rbox(0.022, 0.006, 0.03, hw - 0.3 + 0.026 * i, y + 0.022, -hd + 0.1, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), 0.002)));
  [0xe23d3d, 0x3a7be0, 0x4fb34f, 0xf4d23a].forEach((c, i) => { const cr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }))); cr.rotation.z = Math.PI / 2; cr.rotation.y = 0.3 * i; cr.position.set(hw - 0.22 + i * 0.03, y + 0.006, 0.12 + i * 0.012); });
  const scis = new THREE.MeshStandardMaterial({ color: 0xff7ad0, roughness: 0.5 });
  for (const s of [-1, 1]) { const b = add(new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 6, 14), scis)); b.rotation.x = Math.PI / 2; b.position.set(-hw + 0.14 + s * 0.016, y + 0.004, 0.12); }
  add(rbox(0.006, 0.003, 0.08, -hw + 0.14, y + 0.003, 0.17, new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.7, roughness: 0.3 }), 0.001));
  const uni = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }); // a little unicorn
  add(rbox(0.06, 0.035, 0.03, hw - 0.12, y + 0.04, 0.05, uni, 0.012));
  for (const lx of [-0.022, 0.022]) for (const lz of [-0.01, 0.01]) add(rbox(0.008, 0.025, 0.008, hw - 0.12 + lx, y + 0.012, 0.05 + lz, uni, 0.003));
  add(rbox(0.02, 0.03, 0.022, hw - 0.09, y + 0.07, 0.05, uni, 0.008));
  const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.025, 8), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.5, roughness: 0.3 })));
  horn.position.set(hw - 0.085, y + 0.095, 0.05);
  add(rbox(0.006, 0.03, 0.022, hw - 0.103, y + 0.062, 0.05, new THREE.MeshStandardMaterial({ color: 0xff8fd0 }), 0.003)); // mane
  g.userData.surfaces = [{ x0: -hw + 0.32, x1: hw - 0.32, z0: -hd + 0.04, z1: hd - 0.04, y: h }];
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -hd, z1: hd }];
  return g;
}

/** A white kids' swivel chair with a pink seat cushion (a seat, #71). Faces local +z. */
function kidchair() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.4 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf6a8c8, roughness: 0.9 });
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2, leg = rbox(0.24, 0.025, 0.035, Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12, white, 0.008); leg.rotation.y = -a; g.add(leg); }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), white).translateY(0.22));
  g.add(rbox(0.42, 0.05, 0.4, 0, 0.42, 0.02, white, 0.02), rbox(0.38, 0.03, 0.36, 0, 0.46, 0.02, pink, 0.015));
  g.add(rbox(0.4, 0.3, 0.04, 0, 0.7, -0.18, white, 0.02));
  g.userData.rest = { kind: 'sit', name: 'stolen', verb: 'sätta dig på', spots: [{ x: 0, y: 0.47, z: -0.02 }] };
  g.userData.footprint = [{ x0: -0.22, x1: 0.22, z0: -0.22, z1: 0.22 }];
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

/** Areca / golden cane palm (#106) in a big pot: thin yellow-green canes fanning out of the soil, each with a
 * feathery frond arching out and down (leaflets as thin quads on both sides of the midrib, vertex colours
 * light → dark). One mesh per material after the merge. Sizes from item (PALM in config). */
function palm(item) {
  const g = new THREE.Group();
  const P = item, R = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const potMat = new THREE.MeshStandardMaterial({ color: P.potColor, roughness: 0.85 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(P.pot.r, P.pot.r * 0.82, P.pot.h, 28), potMat);
  pot.position.y = P.pot.h / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(P.pot.r - 0.012, 0.012, 6, 28).rotateX(Math.PI / 2), potMat);
  rim.position.y = P.pot.h;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(P.pot.r - 0.02, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
  soil.position.y = P.pot.h - 0.04;
  g.add(pot, rim, soil);
  const caneMat = new THREE.MeshStandardMaterial({ color: 0xa7b94e, roughness: 0.6 });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 });
  const pos = [], col = [], light = new THREE.Color(0x8fbf45), dark = new THREE.Color(0x2f6a26);
  const quad = (a, b, c, d, ca, cb) => {
    for (const [p, cc] of [[a, ca], [b, ca], [c, cb], [a, ca], [c, cb], [d, cb]]) { pos.push(p.x, p.y, p.z); col.push(cc.r, cc.g, cc.b); }
  };
  const y0 = P.pot.h - 0.04, up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < P.canes; k++) {
    const a = (k / P.canes) * Math.PI * 2 + R() * 0.5, lean = 0.12 + R() * 0.3;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const caneH = P.cane * (0.6 + R() * 0.5);
    // the cane: a thin cylinder from the soil, leaning out
    const top = dir.clone().multiplyScalar(Math.sin(lean) * caneH).setY(y0 + Math.cos(lean) * caneH);
    const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, caneH, 5), caneMat);
    cane.position.copy(top).add(new THREE.Vector3(0, y0, 0)).multiplyScalar(0.5);
    cane.quaternion.setFromUnitVectors(up, top.clone().sub(new THREE.Vector3(0, y0, 0)).normalize());
    g.add(cane);
    // the frond: the midrib arches out (elevation e0 → drooping), leaflets along it
    const L = P.frond * (0.75 + R() * 0.4), e0 = 0.9 + R() * 0.35, side = new THREE.Vector3().crossVectors(up, dir).normalize();
    const at = (t) => dir.clone().multiplyScalar(L * t * 0.8).add(up.clone().multiplyScalar(L * t * Math.tan(e0) * 0.45 - L * t * t * 0.75)).add(top);
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const t = 0.12 + (i / n) * 0.88, p = at(t), q = at(Math.min(1, t + 0.05));
      const along = q.clone().sub(p).normalize(), len = P.leaflet * (1 - 0.55 * t) * (0.85 + R() * 0.3), w = 0.012;
      for (const sgn of [-1, 1]) {
        const out = side.clone().multiplyScalar(sgn).multiplyScalar(len).add(along.clone().multiplyScalar(len * 0.55)).add(new THREE.Vector3(0, -len * 0.35, 0));
        const tip = p.clone().add(out);
        const a1 = p.clone().addScaledVector(along, -w), a2 = p.clone().addScaledVector(along, w);
        const t1 = tip.clone().addScaledVector(along, -w * 0.3), t2 = tip.clone().addScaledVector(along, w * 0.3);
        quad(a1, a2, t2, t1, light.clone().lerp(dark, t * 0.6), dark);
      }
    }
    // the midrib itself as a thin strip
    for (let i = 0; i < 10; i++) {
      const p = at(i / 10), q = at((i + 1) / 10), off = side.clone().multiplyScalar(0.004);
      quad(p.clone().sub(off), p.clone().add(off), q.clone().add(off), q.clone().sub(off), light, light);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, leafMat));
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.footprint = [{ x0: -P.pot.r, x1: P.pot.r, z0: -P.pot.r, z1: P.pot.r }];
  return g;
}

/** The abstract painting (#133): blue, turquoise, purple and green washes running from the top left down to
 * the right on white, drips and a few black splashes; a thin flat black frame, hung on the wall (local z = 0 is
 * the wall, the picture faces +z). The picture is a canvas texture, drawn once. */
function abstractCanvas(px, ratio) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * ratio);
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  let seed = 133;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#f7f6f2'; ctx.fillRect(0, 0, W, H);
  const hues = ['rgba(40,80,190,', 'rgba(30,160,170,', 'rgba(120,70,170,', 'rgba(60,150,90,', 'rgba(70,120,200,'];
  // each layer is drawn sharp on its own canvas and blurred once as it goes on (a filter per fill is far too slow)
  const layer = (blur, paint) => {
    const l = document.createElement('canvas'); l.width = W; l.height = H;
    paint(l.getContext('2d'));
    ctx.filter = `blur(${blur}px)`; ctx.drawImage(l, 0, 0); ctx.filter = 'none';
  };
  // soft washes along the diagonal flow
  layer(Math.round(W / 40), (lc) => {
    for (let i = 0; i < 26; i++) {
      const t = r(), x = W * (0.12 + t * 0.6 + (r() - 0.5) * 0.35), y = H * (0.05 + t * 0.75 + (r() - 0.5) * 0.2);
      lc.fillStyle = hues[i % hues.length] + (0.25 + r() * 0.35) + ')';
      lc.beginPath(); lc.ellipse(x, y, W * (0.04 + r() * 0.12), H * (0.02 + r() * 0.07), 0.8 + r() * 0.5, 0, Math.PI * 2); lc.fill();
    }
  });
  // spray (fine dots) and drips running down
  layer(Math.max(1, Math.round(W / 300)), (lc) => {
    for (let i = 0; i < 900; i++) {
      const t = r(), x = W * (0.1 + t * 0.7 + (r() - 0.5) * 0.3), y = H * (0.04 + t * 0.8 + (r() - 0.5) * 0.25);
      lc.fillStyle = hues[Math.floor(r() * hues.length)] + (0.3 + r() * 0.5) + ')';
      lc.fillRect(x, y, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    for (let i = 0; i < 14; i++) {
      const x = W * (0.25 + r() * 0.55), y = H * (0.2 + r() * 0.5), len = H * (0.05 + r() * 0.2);
      lc.strokeStyle = hues[i % hues.length] + '0.55)'; lc.lineWidth = 1 + r() * 3;
      lc.beginPath(); lc.moveTo(x, y); lc.lineTo(x + (r() - 0.3) * W * 0.04, y + len); lc.stroke();
    }
  });
  // black splashes and strokes, and a ring like an eye in the upper right
  ctx.fillStyle = 'rgba(15,15,20,0.9)'; ctx.strokeStyle = 'rgba(15,15,20,0.9)';
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(W * (0.45 + r() * 0.4), H * (0.3 + r() * 0.55), 1.5 + r() * W * 0.008, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 4; i++) { const x = W * (0.55 + r() * 0.3), y = H * (0.55 + r() * 0.35); ctx.lineWidth = 1 + r() * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * W * 0.12, y + r() * H * 0.08); ctx.stroke(); }
  ctx.lineWidth = W * 0.012;
  ctx.beginPath(); ctx.ellipse(W * 0.66, H * 0.3, W * 0.05, W * 0.035, -0.4, 0.3, Math.PI * 2 - 0.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(W * 0.665, H * 0.3, W * 0.012, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function painting(item) {
  const g = new THREE.Group();
  const { w, h, frame: f, depth: d } = item;
  const black = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5 });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * f, h - 2 * f), new THREE.MeshStandardMaterial({ map: abstractCanvas(384, h / w), roughness: 0.85 }));
  pic.position.set(0, 0, d - 0.004);
  g.add(pic);
  for (const [sx, sy, x, y] of [[w, f, 0, h / 2 - f / 2], [w, f, 0, -h / 2 + f / 2], [f, h - 2 * f, -w / 2 + f / 2, 0], [f, h - 2 * f, w / 2 - f / 2, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, d), black);
    b.position.set(x, y, d / 2); b.castShadow = true;
    g.add(b);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * f, h - 2 * f, 0.004), black);
  back.position.set(0, 0, 0.002);
  g.add(back);
  g.position.y = item.y;
  return g;
}

/**
 * Pull everything of a piece that reaches past `item.walls` ({ x0, x1, z0, z1 }, plan metres, any subset) back
 * inside (#137: palm fronds through the wall): each vertex's horizontal distance from the piece's axis is
 * kept up to 60 % of the room there is in its direction and squeezed smoothly into the rest beyond that, so
 * fronds towards a wall bunch up short of it instead of poking through. Margin 3 cm.
 */
function keepInside(obj, item, yaw) {
  const W = item.walls, c = Math.cos(yaw), s = Math.sin(yaw), m = 0.03, v = new THREE.Vector3();
  const room = (wx, wz) => { // how far from the axis one can go in world direction (wx, wz)
    let t = Infinity;
    if (W.x0 !== undefined && wx < 0) t = Math.min(t, (item.x - W.x0 - m) / -wx);
    if (W.x1 !== undefined && wx > 0) t = Math.min(t, (W.x1 - m - item.x) / wx);
    if (W.z0 !== undefined && wz < 0) t = Math.min(t, (item.z - W.z0 - m) / -wz);
    if (W.z1 !== undefined && wz > 0) t = Math.min(t, (W.z1 - m - item.z) / wz);
    return t;
  };
  for (const mesh of [...obj.children]) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    const pos = geo.attributes.position;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const wx = v.x * c + v.z * s, wz = -v.x * s + v.z * c, d = Math.hypot(wx, wz);
      if (d < 1e-6) continue;
      const t = room(wx / d, wz / d), k = 0.6 * t;
      if (d <= k) continue;
      const nd = k + (t - k) * Math.tanh((d - k) / (t - k));
      pos.setXYZ(i, v.x * nd / d, v.y, v.z * nd / d);
      moved = true;
    }
    if (moved) geo.computeVertexNormals();
    mesh.geometry = geo;
  }
}


/** Wall-mounted black metal wine rack (#105): a tall flat-bar frame with `n` wire cradles, each holding a bottle
 * lying with its neck tilted up towards local −x, the label facing out; two of them champagne with gold foil.
 * Local: the wall at z 0, out of the wall +z, the frame's bottom at y 0. */
function winerack(item) {
  const g = new THREE.Group();
  const { w, h, n, depth } = item;
  const black = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.45, metalness: 0.5 });
  const bar = (sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), black); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
  // the frame: flat bars 2 cm × 5 mm, 2 cm out from the wall on small spacers; two hanging eyes on top
  const fz = 0.02;
  for (const x of [-w / 2, w / 2]) bar(0.02, h, 0.005, x, h / 2, fz);
  for (const y of [0, h]) bar(w + 0.02, 0.02, 0.005, 0, y, fz);
  for (const x of [-w / 2, w / 2]) { bar(0.012, 0.012, fz, x, h - 0.03, fz / 2); bar(0.012, 0.012, fz, x, 0.03, fz / 2); }
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) { const eye = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.002, 6, 12), black); eye.position.set(x, h + 0.02, fz); g.add(eye); }
  const glass = [new THREE.MeshStandardMaterial({ color: 0x1d2b1c, roughness: 0.15, metalness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0x101210, roughness: 0.15, metalness: 0.2 })];
  const labels = [new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xd8c7a3, roughness: 0.8 })];
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a33a, roughness: 0.3, metalness: 0.8 });
  const profile = [[0, 0], [0.037, 0], [0.038, 0.2], [0.03, 0.24], [0.014, 0.27], [0.013, 0.33], [0.015, 0.335], [0, 0.335]].map(([r, y]) => new THREE.Vector2(r, y));
  const bottleGeo = new THREE.LatheGeometry(profile, 16);
  const tilt = THREE.MathUtils.degToRad(item.tilt);
  for (let i = 0; i < n; i++) {
    const y = 0.07 + (i * (h - 0.2)) / (n - 1), champagne = item.champagne.includes(i); // the top neck stays inside the frame
    // the cradle: a bar out from the frame and a ring under each end of the bottle
    bar(0.006, 0.006, depth, 0, y - 0.045, fz + depth / 2);
    for (const x of [-0.11, 0.1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0025, 6, 18, Math.PI), black); ring.rotation.set(0, Math.PI / 2, Math.PI); ring.position.set(x, y - 0.005 + x * Math.tan(-tilt) * -1, fz + depth - 0.01); g.add(ring); }
    // the bottle, lying in the cradle, neck to −x and up
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bottleGeo, glass[i % 2]));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.09, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), labels[i % 2]);
    label.position.y = 0.1;
    b.add(label);
    if (champagne) { const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.02, 0.09, 12), gold); foil.position.y = 0.29; b.add(foil); }
    b.rotation.z = Math.PI / 2 - tilt;
    b.position.set(0.16, y + 0.03, fz + depth - 0.01);
    b.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(b);
  }
  g.position.y = item.y;
  return g;
}

/** IKEA BESTÅ display combination (#104): two 60 cm columns hung on the wall, each with a walnut-effect door at
 * the top and the bottom and a glass door between; glass shelves, fine glasses and whisky bottles behind the
 * glass; spots on top lit by the room's switch (its lamp material, no lights of its own). Every door opens on
 * its own with E (`userData.targets`). Local: the wall at z 0, the front at z = depth, bottom at y 0. */
function besta(item) {
  const g = new THREE.Group();
  const B = item, W = B.w, D = B.d, H = B.h, col = W / 2, t = 0.016;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.55 });
  const walnut = new THREE.MeshStandardMaterial({ color: B.walnut, roughness: 0.6 });
  const handle = new THREE.MeshStandardMaterial({ color: B.handle, roughness: 0.35, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6e2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });
  const shelfGlass = new THREE.MeshStandardMaterial({ color: 0xb7dcd6, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  const add = (parent, sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = m !== glass; parent.add(o); return o; };
  // the carcass: back, sides, the middle wall, top/bottom and the section boards
  const fd = D - 0.02; // carcass depth (the doors make up the rest)
  add(g, W, H, 0.01, 0, H / 2, 0.005, white);
  for (const x of [-W / 2 + t / 2, 0, W / 2 - t / 2]) add(g, t, H, fd, x, H / 2, fd / 2, white);
  const sec = B.sections, ys = [0, sec[0], sec[0] + sec[1], H]; // bottom, glass, top (from below)
  for (const y of ys) add(g, W, t, fd, 0, Math.min(H - t / 2, Math.max(t / 2, y)), fd / 2, white);
  // glass shelves in the display section, and what stands on them
  const y1 = ys[1] + t / 2, y2 = ys[2] - t / 2, yShelf = (y1 + y2) / 2;
  for (const x of [-col / 2, col / 2]) add(g, col - t * 1.5, 0.006, fd - 0.03, x, yShelf, fd / 2, shelfGlass);
  const crystal = new THREE.MeshStandardMaterial({ color: 0xe6f0f2, roughness: 0.08, metalness: 0.35 });
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const wine = lathe([[0.03, 0], [0.03, 0.004], [0.004, 0.008], [0.003, 0.08], [0.02, 0.1], [0.032, 0.14], [0.03, 0.19], [0.028, 0.19]]);
  const flute = lathe([[0.028, 0], [0.028, 0.004], [0.003, 0.008], [0.003, 0.1], [0.012, 0.12], [0.022, 0.21], [0.02, 0.21]]);
  const tumbler = lathe([[0.034, 0], [0.036, 0.09], [0.033, 0.09]]);
  const glassAt = (geo, x, y, z) => { const o = new THREE.Mesh(geo, crystal); o.position.set(x, y, z); g.add(o); };
  const bottle = (x, y, z, k) => {
    const hue = [0xb5651d, 0x7a3b12, 0xd08a2c, 0x3b2a1a, 0x9c5a1a, 0x5a2e0e][k % 6];
    const gm = new THREE.MeshStandardMaterial({ color: hue, roughness: 0.15, metalness: 0.1 });
    const shape = k % 3;
    const body = shape === 1 ? new THREE.BoxGeometry(0.08, 0.17, 0.05) : new THREE.CylinderGeometry(shape ? 0.036 : 0.04, 0.04, 0.18, 14);
    const b = new THREE.Mesh(body, gm); b.position.set(x, y + 0.09, z); g.add(b);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 10), gm); neck.position.set(x, y + 0.21, z); g.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), k % 2 ? walnut : handle); cap.position.set(x, y + 0.25, z); g.add(cap);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.06), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf1e7cf : 0xd9b453, roughness: 0.7 }));
    label.position.set(x, y + 0.085, z + (shape === 1 ? 0.0255 : 0.0405)); g.add(label);
  };
  // left column: glasses on the shelf, bottles below; right column: bottles on the shelf, glasses below
  const zc = fd / 2 + 0.02;
  [-0.19, -0.12, -0.05].forEach((dx, i) => { glassAt(wine, -col / 2 + dx + 0.12, yShelf + 0.003, zc - 0.05); glassAt(flute, -col / 2 + dx + 0.16, yShelf + 0.003, zc + 0.06); if (i < 2) glassAt(tumbler, -col / 2 + dx + 0.24, yShelf + 0.003, zc); });
  [-0.17, -0.05, 0.08].forEach((dx, i) => bottle(-col / 2 + dx, y1, zc, i));
  [-0.17, -0.05, 0.08].forEach((dx, i) => bottle(col / 2 + dx, yShelf + 0.003, zc, i + 3));
  [-0.15, -0.07, 0.01, 0.09].forEach((dx, i) => glassAt(i % 2 ? tumbler : wine, col / 2 + dx, y1, zc + (i % 2 ? 0.05 : -0.04)));
  // the spots on top (the room's lamp material: lit with the room's switch)
  const lens = lampMat(item.level, item.room);
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45 });
  for (const x of B.spots) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14), black);
    can.rotation.x = -0.5; can.position.set(x, H + 0.045, D - 0.08); g.add(can);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14), lens);
    glow.rotation.x = Math.PI / 2 - 0.5; glow.position.set(x, H + 0.045 + Math.cos(0.5) * 0.0355 - 0.07, D - 0.08 + Math.sin(0.5) * 0.0355);
    glow.position.set(x, H + 0.045 + 0.0355 * Math.sin(-0.5 + Math.PI / 2) * 0 + 0.031, D - 0.08 - 0.017); // the lens on the can's upper end, aimed up at the wall
    g.add(glow);
  }
  // the doors: six of them, the left column hinged on the left, the right on the right
  const targets = [], doors = [];
  const sections = [[ys[0], ys[1], 'wood'], [ys[1], ys[2], 'glass'], [ys[2], ys[3], 'wood']];
  for (const [ya, yb, kind] of sections) for (const sideX of [-1, 1]) {
    const dw = col - 0.004, dh = yb - ya - 0.004, pivot = new THREE.Group();
    pivot.position.set(sideX * W / 2, (ya + yb) / 2, D - 0.009);
    const cx = -sideX * dw / 2; // the leaf extends from the hinge towards the middle
    if (kind === 'wood') add(pivot, dw, dh, 0.018, cx, 0, 0, walnut);
    else {
      for (const [sx, sy, x, y] of [[dw, 0.05, cx, dh / 2 - 0.025], [dw, 0.05, cx, -dh / 2 + 0.025], [0.05, dh, cx - dw / 2 + 0.025, 0], [0.05, dh, cx + dw / 2 - 0.025, 0]]) add(pivot, sx, sy, 0.018, x, y, 0, white);
      add(pivot, dw - 0.1, dh - 0.1, 0.004, cx, 0, 0, glass);
    }
    // a slim handle near the free edge (bottom doors: at the top of the door, top doors: at the bottom)
    const hy = kind === 'glass' ? 0 : (ya < sec[0] ? dh / 2 - 0.06 : -dh / 2 + 0.06);
    if (kind === 'glass') add(pivot, 0.012, 0.12, 0.012, cx - sideX * (dw / 2 - 0.035), hy, 0.018, handle);
    else add(pivot, 0.1, 0.012, 0.012, cx - sideX * (dw / 2 - 0.08), hy, 0.018, handle);
    const target = {
      name: kind === 'glass' ? 'vitrinskåpet' : 'skåpdörren', kind: 'appliance', isOpen: false, t: 0, object: pivot, pickable: pivot,
      toggle() { this.isOpen = !this.isOpen; sfx.cupboard(pivot.getWorldPosition(new THREE.Vector3()), this.isOpen); },
      update(dt) {
        const goal = this.isOpen ? 1 : 0;
        this.t += Math.sign(goal - this.t) * Math.min(Math.abs(goal - this.t), dt * 2.4);
        pivot.rotation.y = -sideX * this.t * this.t * (3 - 2 * this.t) * THREE.MathUtils.degToRad(B.openDeg);
      },
    };
    pivot.traverse((m) => { m.userData.door = target; });
    g.add(pivot); targets.push(target); doors.push(pivot);
  }
  g.userData.targets = targets;
  g.userData.keep = doors;
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: 0, z1: D }];
  g.position.y = item.y;
  return g;
}

const BUILDERS = { winerack, besta, painting, palm, sofa, armchair, footstool, floorlamp, sidetable, coffeetable, loungesofa, loungetable, parasol, planter, bed, skansnasTable, skansnasChair, bunk, daybed, rug, ragrund, coatrack, shoerack, byas, tv, nordkisa, worklamp, gamingdesk, gamingchair, nordli, alex, kidchair };

/** An invisible thin box over a table top (raycast target for putting a cup down, #90). Local rect. */
export function surfaceBox(r, list) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.01, r.z1 - r.z0), new THREE.MeshBasicMaterial());
  m.position.set((r.x0 + r.x1) / 2, r.y - 0.005, (r.z0 + r.z1) / 2);
  m.visible = false;
  m.userData.surface = r.y;
  list?.push(m);
  return m;
}

/** Build all furniture; returns the scene group, collision segments per level and lamps. */
export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []];
  const lights = [], interactives = [], surfaces = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    // one mesh per material per piece (#48); the parasol folds and the beers come and go
    if (item.type !== 'parasol') mergeStatic(obj, obj.userData.keep ?? []);
    const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI; // local +z = facing
    if (item.walls) keepInside(obj, item, yaw); // plants by a wall: no leaves through it (#137)
    obj.rotation.y = yaw;
    obj.position.set(item.x, LEVELS[item.level].floor + obj.position.y, item.z);
    for (const r of obj.userData.surfaces ?? []) obj.add(surfaceBox(r, surfaces)); // tables a cup can stand on (#90)
    if (obj.userData.rest) obj.userData.interact = restTarget(obj, item, LEVELS[item.level].floor); // sit / lie (#71/#72)
    if (obj.userData.interact) { // E targets among the furniture (the TV, seats, beds)
      obj.traverse((m) => { m.userData.door = obj.userData.interact; });
      interactives.push(obj.userData.interact);
    }
    interactives.push(...(obj.userData.targets ?? [])); // several E targets of their own (cabinet doors, #104)
    group.add(obj);
    // footprint rectangles → world-space collision segments
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx, lz) => [item.x + c * lx + s * lz, item.z - s * lx + c * lz];
    for (const r of obj.userData.footprint ?? []) {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      for (let i = 0; i < 4; i++) segments[item.level].push([...pts[i], ...pts[(i + 1) % 4]]);
    }
  }
  return { object: group, segments, lights, interactives, surfaces };
}
