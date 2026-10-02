import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { restTarget } from './rest.js';
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
function bed(item) {
  const g = new THREE.Group();
  const w = item.w, l = item.l, z0 = -l / 2;
  g.add(rbox(w + 0.04, 0.22, l + 0.04, 0, 0.1 + 0.11, 0, bedFabric, 0.02));
  g.add(rbox(w, 0.2, l, 0, 0.32 + 0.1, 0, linen, 0.05));
  const b = item.bedding;
  if (b) {
    const tex = ginghamTexture(b);
    tex.repeat.set(1 / (2 * b.check), 1 / (2 * b.check));
    const check = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const duv = new THREE.Mesh(duvetGeometry(w + 0.12, l * 0.74, 0.2), check);
    duv.position.set(0, 0.55, z0 + l * 0.63);
    duv.castShadow = duv.receiveShadow = true;
    g.add(duv);
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
      g.add(pil);
    }
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: b.cushion, roughness: 0.9 }));
    cushion.scale.set(0.22, 0.07, 0.16);
    cushion.position.set(-0.05, 0.64, z0 + 0.5);
    cushion.rotation.set(-0.6, 0.15, 0.1);
    cushion.castShadow = true;
    g.add(cushion);
    // a knitted throw folded over the foot end, hanging down a little on one side
    const knit = new THREE.MeshStandardMaterial({ color: b.throw, roughness: 1 });
    g.add(rbox(w * 0.85, 0.035, 0.42, 0.04, 0.59, -z0 - 0.3, knit, 0.015));
    g.add(rbox(0.035, 0.2, 0.42, 0.04 + w * 0.425 + 0.02, 0.5, -z0 - 0.3, knit, 0.012));
  } else {
    g.add(rbox(w + 0.02, 0.06, l * 0.7, 0, 0.53, z0 + l * 0.65, duvet, 0.03));
    for (const px of w > 1.2 ? [-w / 4, w / 4] : [0]) g.add(rbox(Math.min(0.6, w * 0.8), 0.12, 0.38, px, 0.58, z0 + 0.28, linen, 0.06));
  }
  g.add(rbox(w + 0.06, 0.6, 0.08, 0, 0.62, z0 - 0.04, bedFabric, 0.03));
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [z0 + 0.06, -z0 - 0.06]) g.add(leg(x, z, 0.1));
  // lying down (#72): head on the pillows, feet towards local +z; one place per side of a double bed
  g.userData.rest = { kind: 'lie', name: 'sängen', verb: 'lägga dig i',
    spots: (w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => ({ x, y: 0.52, z: z0 + 0.32 })) };
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
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

/** Philips 55" TV with a central stand. E toggles it; on: an animated swirl of colour on the screen
 * (canvas texture redrawn at item.fps) and an additive Ambilight glow on the wall behind. */
function tv(item) {
  const g = new THREE.Group();
  const { w, h } = item, y0 = 0.075; // screen bottom above the bench
  const dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.35, metalness: 0.2 });
  const stand = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.5 });
  g.add(rbox(0.42, 0.012, 0.24, 0, 0.006, -0.02, stand, 0.004));                  // foot plate
  g.add(rbox(0.12, y0 + 0.12, 0.03, 0, (y0 + 0.12) / 2, -0.05, stand, 0.006));     // neck
  g.add(rbox(w, h, 0.025, 0, y0 + h / 2, -0.03, dark, 0.008));                     // panel
  g.add(rbox(w * 0.7, h * 0.6, 0.05, 0, y0 + h * 0.45, -0.065, dark, 0.02));       // back housing
  // the picture
  const c = document.createElement('canvas');
  c.width = 384; c.height = 216;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, toneMapped: false });
  const offMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.12, metalness: 0.4 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.012, h - 0.012), offMat);
  screen.position.set(0, y0 + h / 2, -0.016);
  g.add(screen);
  // Ambilight: a soft additive glow on the wall behind
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d'), rg = gg.createRadialGradient(32, 32, 6, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), color: 0x000000, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.9, h * 2.1), glowMat);
  glow.position.set(0, y0 + h / 2, -0.19); // just off the wall behind (the bench is 0.42 deep, the TV near its back)
  g.add(glow);
  const ctx = c.getContext('2d');
  const blobs = [[285, 0.9], [320, 0.85], [25, 0.9], [50, 0.95], [175, 0.8], [215, 0.85]]; // hues: purple, pink, orange, yellow, teal, blue
  const draw = (t) => {
    ctx.fillStyle = '#12082a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    blobs.forEach(([hue, sat], i) => {
      const x = c.width * (0.5 + 0.38 * Math.sin(t * 0.21 + i * 1.7)), y = c.height * (0.5 + 0.36 * Math.cos(t * 0.17 + i * 2.3));
      const r = c.height * (0.55 + 0.15 * Math.sin(t * 0.3 + i));
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `hsla(${hue},${sat * 100}%,60%,0.85)`);
      grad.addColorStop(1, `hsla(${hue},${sat * 100}%,50%,0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
    });
    ctx.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  };
  let on = false, t = 0, acc = 0;
  const interact = {
    name: 'tv:n', kind: 'tv', pickable: g,
    get isOpen() { return on; },
    get verb() { return on ? 'stänga av' : 'slå på'; },
    toggle() {
      on = !on;
      screen.material = on ? screenMat : offMat;
      glowMat.color.setHex(on ? 0x6a4a8a : 0x000000);
      if (on) draw(t);
      return on;
    },
    update(dt) {
      if (!on) return;
      t += dt; acc += dt;
      if (acc < 1 / item.fps) return;
      acc = 0;
      draw(t);
      // the Ambilight follows the picture's average hue, slowly
      const hue = ((t * 8) % 360) / 360;
      glowMat.color.setHSL(hue, 0.7, 0.32);
    },
  };
  g.userData.interact = interact;
  g.userData.keep = [screen, glow];
  g.position.y = item.y;
  g.traverse((m) => { if (m.isMesh && m !== glow) m.castShadow = true; });
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

const BUILDERS = { sofa, armchair, footstool, floorlamp, sidetable, coffeetable, loungesofa, loungetable, parasol, planter, bed, skansnasTable, skansnasChair, bunk, daybed, rug, ragrund, coatrack, shoerack, byas, tv, nordkisa, worklamp };

/** Build all furniture; returns the scene group, collision segments per level and lamps. */
export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []];
  const lights = [], interactives = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    // one mesh per material per piece (#48); the parasol folds and the beers come and go
    if (item.type !== 'parasol') mergeStatic(obj, obj.userData.keep ?? []);
    const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI; // local +z = facing
    obj.rotation.y = yaw;
    obj.position.set(item.x, LEVELS[item.level].floor + obj.position.y, item.z);
    if (obj.userData.rest) obj.userData.interact = restTarget(obj, item, LEVELS[item.level].floor); // sit / lie (#71/#72)
    if (obj.userData.interact) { // E targets among the furniture (the TV, seats, beds)
      obj.traverse((m) => { m.userData.door = obj.userData.interact; });
      interactives.push(obj.userData.interact);
    }
    group.add(obj);
    // footprint rectangles → world-space collision segments
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx, lz) => [item.x + c * lx + s * lz, item.z - s * lx + c * lz];
    for (const r of obj.userData.footprint ?? []) {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      for (let i = 0; i < 4; i++) segments[item.level].push([...pts[i], ...pts[(i + 1) % 4]]);
    }
  }
  return { object: group, segments, lights, interactives };
}
