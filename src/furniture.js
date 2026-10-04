import * as THREE from 'three';
import { sfx } from './audio.js';
import { mergeStatic } from './merge.js';
import { restTarget } from './rest.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addCushions, addFoldedThrow, addDrapedThrow } from './cushions.js';
import { CUSHIONS, FURNITURE, LANDSKRONA as L, LEVELS, SKANSNAS, IDANAS, PILLOWS, BEDDING, PINGPING, MYDAL, OTTOMAN, SYMFONISK, SECRET, NYMANE_WALL, MALM_DECO, YUCCA, LANGLAMPA, VANITY, HEMNES_DAYBED, KPOP_POSTERS, SMASTAD, PHOTO_FRAME, COFFEE_TABLE } from './config.js';
import { litMirrorMaterial, litEmissive, litReflect } from './mirror.js';
import { addReflector } from './reflections.js';
import { loungesofa, loungetable, parasol, planter } from './patio.js';
import { Screen } from './screens.js';
import { Openable } from './openables.js';
import { rifleModel } from './rifle.js';
import { laptop } from './laptop.js';
import { nesthub, nestmini } from './nest.js';
import { hookrail } from './hooks.js';
import { huego } from './huego.js';
import { klk } from './closet.js';
import { cleaning } from './cleaning.js';
import { registerRug, rugUnder } from './rugs.js';
import { pingpingModel } from './pingping.js';
import { pillow, duvet as duvetShape } from './bedding.js';
import { drawerFill, personFor, Pack as StuffPack, garment, shoes, stack, rolls, rng } from './stuff.js';
import { Pack, byasDrawer, byasMiddle, bestaContents, attachContents } from './contents.js';

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

/**
 * A drawer that opens with E (#103): its front (`w` × `h`, bottom at `y`, outer face at local z = `zf`) and an
 * open box `depth` deep behind it, sliding out `out` m along +z of an anchor turned by `rot` about y (0 = the
 * piece's +z). `grip(o)` adds a handle in the drawer's frame (front face at z 0). The drawer is an Openable
 * in g.userData.targets and kept out of the merge.
 */
function addDrawer(g, name, { x, y, zf, w, h, depth, front, inner = front, rot = 0, out = depth * 0.75, grip, fill, who, seed = 1 }) {
  const anchor = new THREE.Group();
  anchor.position.set(x, y, zf);
  anchor.rotation.y = rot;
  const o = new THREE.Group();
  anchor.add(o);
  const bh = h * 0.7, t = 0.008, bw = w - 0.03;
  o.add(rbox(w, h, 0.018, 0, h / 2, -0.009, front, 0.003));
  o.add(rbox(bw, t, depth, 0, 0.02, -0.018 - depth / 2, inner, 0.002));                         // bottom
  for (const s of [-1, 1]) o.add(rbox(t, bh, depth, s * (bw - t) / 2, 0.02 + bh / 2, -0.018 - depth / 2, inner, 0.002)); // sides
  o.add(rbox(bw, bh, t, 0, 0.02 + bh / 2, -0.018 - depth + t / 2, inner, 0.002));              // back
  grip?.(o);
  g.add(anchor);
  const d = new Openable({ name, object: o, mode: 'drawer', out: [0, 0, out], speed: 3 });
  // what is in it (#230/#231, stuff.js): one merged mesh, only drawn while the drawer is (partly) open
  const stuff = fill ? drawerFill(fill, { w: bw - 2 * t, depth: depth - t, h: bh, y: 0.024 }, who ? personFor(who) : null, seed) : null;
  if (stuff) { stuff.visible = false; o.add(stuff); d.contents = stuff; }
  (g.userData.targets ??= []).push(d);
  (g.userData.keep ??= []).push(anchor);
  return d;
}

/**
 * A side-hung door that opens with E (#103): `build(p)` adds the leaf to the pivot p, whose origin is the
 * hinge (front face at z 0, the leaf running towards −x if `side` is +1 = hinged on the right, towards +x if
 * −1). It swings out of the piece's +z up to `max` degrees.
 */
function addDoor(g, name, { x, y, z, side, max = 100, build }) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  build(p);
  g.add(p);
  const d = new Openable({ name, object: p, mode: 'hinge', sign: side, max });
  (g.userData.targets ??= []).push(d);
  (g.userData.keep ??= []).push(p);
  return d;
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
function seatModule(g, { x0, x1, depth, cushions, arms, armDepth = depth }) {
  const legH = L.legHeight, D = L.depth;
  const z0 = -D / 2, zF = z0 + depth; // back … front
  const base = L.seatHeight - 0.14;   // top of the frame under the seat cushion
  const backT = D - L.seatDepth - 0.06; // back frame + cushion thickness
  // frame
  g.add(rbox(x1 - x0, base - legH, depth, (x0 + x1) / 2, (legH + base) / 2, (z0 + zF) / 2, fabric, 0.02));
  g.add(rbox(x1 - x0, 0.3, 0.14, (x0 + x1) / 2, base + 0.15, z0 + 0.07, fabric, 0.03));
  // seat + back cushions
  const aw = L.armWidth;
  // a short arm (the chaise's): the seat cushion runs the full width, out past the arm's end
  const inset = armDepth < depth ? 0 : aw;
  const ix0 = x0 + (arms.includes('right') ? inset : 0), ix1 = x1 - (arms.includes('left') ? inset : 0);
  const cw = (ix1 - ix0) / cushions;
  for (let i = 0; i < cushions; i++) {
    const cx = ix0 + cw * (i + 0.5);
    g.add(rbox(cw - 0.01, 0.15, depth - backT + 0.02, cx, base + 0.075, zF - (depth - backT) / 2, fabric, 0.05));
    const back = rbox(cw - 0.02, 0.42, 0.2, cx, L.seatHeight + 0.19, z0 + 0.14 + 0.1, fabric, 0.07);
    back.rotation.x = -0.14;
    g.add(back);
  }
  // armrests: sitter's right = −x, left = +x; `armDepth` from the back (the chaise's ends with the sofa's seats, #279)
  for (const side of arms) {
    const ax = side === 'right' ? x0 + aw / 2 : x1 - aw / 2;
    g.add(rbox(aw, L.armHeight - legH, armDepth, ax, (L.armHeight + legH) / 2, z0 + armDepth / 2, fabric, 0.05));
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
  seatModule(g, { x0: chX0, x1: chX1, depth: L.chaiseDepth, cushions: 1, arms: [right ? 'right' : 'left'], armDepth: L.chaiseArmDepth });
  // three places on the sofa and one on the chaise (#71), local x, seat height, z, facing +z; spread over the seat
  // short of the arm and the cushion in its corner (#278)
  const [sx0, sx1] = right ? [mainX0, mainX1 - L.armWidth - 0.14] : [mainX0 + L.armWidth + 0.14, mainX1];
  const third = (sx1 - sx0) / 3;
  // decorative cushions and a folded throw on the chaise's foot end (#278); CUSHIONS is laid out for a chaise on the right
  const flip = right ? 1 : -1, seatTop = L.seatHeight + 0.01;
  addCushions(g, CUSHIONS.sofa.map((c) => ({ ...c, x: c.x * flip, yaw: c.yaw * flip })), { backZ: -D / 2 + 0.35, seatY: seatTop });
  const T = CUSHIONS.sofaThrow;
  addFoldedThrow(g, { ...T, x: T.x * flip, z: -D / 2 + L.chaiseDepth - T.zFront, y: seatTop, yaw: T.yaw * flip });
  g.userData.rest = { kind: 'sit', name: 'soffan', verb: 'sätta dig i', spots: [0.5, 1.5, 2.5].map((k) => ({ x: sx0 + third * k, y: L.seatHeight, z: -0.08 }))
    .concat([{ x: (chX0 + chX1) / 2, y: L.seatHeight, z: -0.08 }]) };
  // the seats, where a plush toy can be put down (#269; `soft`: not cups and glasses)
  g.userData.surfaces = [{ x0: mainX0 + 0.06, x1: mainX1 - 0.06, z0: -0.25, z1: D / 2 - 0.06, y: L.seatHeight, soft: true },
    { x0: chX0 + 0.06, x1: chX1 - 0.06, z0: -0.25, z1: -D / 2 + L.chaiseDepth - 0.06, y: L.seatHeight, soft: true }];
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
  // two cushions and the grey fleece throw over the sitter's right arm onto the seat, as in the user's photo (#278)
  const seatTop = L.seatHeight + 0.01, ax = -W / 2, ai = ax + L.armWidth, top = L.armHeight, T = CUSHIONS.chairThrow;
  addCushions(g, CUSHIONS.armchair, { backZ: -L.depth / 2 + 0.35, seatY: seatTop });
  addDrapedThrow(g, [[ax - 0.012, top - T.hang], [ax - 0.016, top - 0.1], [ax - 0.004, top + 0.008], [(ax + ai) / 2, top + 0.028],
    [ai + 0.004, top + 0.006], [ai + 0.014, top - 0.09], [ai + 0.03, seatTop + 0.03], [ai + 0.1, seatTop + 0.02],
    [ai + T.spill, seatTop + 0.035]], T.z0, T.z1, 3, T.color);
  g.userData.rest = { kind: 'sit', name: 'fåtöljen', verb: 'sätta dig i', spots: [{ x: 0, y: L.seatHeight, z: -0.08 }] };
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: -L.depth / 2, z1: L.depth / 2 }];
  return g;
}

/** The dark red upholstered stool in front of the armchair (#180, after the user's photo): an upholstered frame
 * on short dark tapered legs, a loose cushion on top that sticks out a little, a welt seam round its edges. */
function ottoman(item) {
  const g = new THREE.Group();
  const O = OTTOMAN, { w, d, h, legH, cushion: c, overhang: o } = O;
  const cloth = new THREE.MeshStandardMaterial({ color: O.color, roughness: 0.97 });
  const welt = new THREE.MeshStandardMaterial({ color: O.welt, roughness: 0.9 });
  const legMat = new THREE.MeshStandardMaterial({ color: O.legColor, roughness: 0.5 });
  const frameH = h - legH - c;
  g.add(rbox(w, frameH, d, 0, legH + frameH / 2, 0, cloth, 0.015));
  const cw = w + 2 * o, cd = d + 2 * o, cy = h - c / 2;
  g.add(rbox(cw, c, cd, 0, cy, 0, cloth, 0.03));
  // the welt round the cushion's top and bottom edges, and the seam low on the frame
  const band = (W, D, y, r) => {
    for (const [sx, sz, x, z] of [[W, r, 0, D / 2], [W, r, 0, -D / 2], [r, D, W / 2, 0], [r, D, -W / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, r, sz), welt); m.position.set(x, y, z); g.add(m);
    }
  };
  band(cw - 0.02, cd - 0.02, h - 0.012, 0.008);
  band(cw - 0.02, cd - 0.02, h - c + 0.012, 0.008);
  band(w + 0.002, d + 0.002, legH + 0.05, 0.005);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.011, legH, 10), legMat);
    m.position.set(x, legH / 2, z); m.castShadow = true; g.add(m);
  }
  g.userData.footprint = [{ x0: -cw / 2, x1: cw / 2, z0: -cd / 2, z1: cd / 2 }];
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

/** Långlampan's shade textures (#270): the coarse linen weave with the spiral wire as dark wavy lines; `glow` = the
 * emissive map (dimmer weave, the bulbs as bright soft spots round u = 0.5, the wire dark against them). */
function linenTextures(S) {
  const W = 256, H = 512, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), glow = mk(), a = col.getContext('2d'), b = glow.getContext('2d');
  const base = new THREE.Color(S.linen);
  a.fillStyle = `#${base.getHexString()}`; a.fillRect(0, 0, W, H);
  b.fillStyle = '#4c4c4c'; b.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // the weave: thin light and dark threads both ways, uneven
  for (let i = 0; i < 900; i++) {
    const across = rnd() < 0.5, p = rnd() * (across ? H : W), l = 0.5 + rnd() * 0.9, dark = rnd() < 0.5;
    a.fillStyle = dark ? `rgba(70,52,30,${0.08 + rnd() * 0.12})` : `rgba(255,245,220,${0.06 + rnd() * 0.12})`;
    b.fillStyle = dark ? `rgba(0,0,0,${0.12 + rnd() * 0.15})` : `rgba(255,255,255,${0.06 + rnd() * 0.1})`;
    const s0 = rnd() * (across ? W : H), len = (0.2 + rnd() * 0.8) * (across ? W : H);
    if (across) { a.fillRect(s0, p, len, l); b.fillRect(s0, p, len, l); } else { a.fillRect(p, s0, l, len); b.fillRect(p, s0, l, len); }
  }
  // the bulbs: soft bright spots, wide across so they read from the side too
  for (const f of S.bulbs) {
    const y = H * (1 - f);
    b.save(); b.translate(W / 2, y); b.scale(1.8, 1);
    const g = b.createRadialGradient(0, 0, 0, 0, 0, 34);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = g; b.fillRect(-60, -60, 120, 120); b.restore();
  }
  // the spiral wire: one turn per `pitch`, slightly wavy (continued across the seam)
  const step = (S.pitch / S.h) * H;
  for (const [ctx, style] of [[a, 'rgba(45,36,24,0.85)'], [b, 'rgba(0,0,0,0.9)']]) {
    ctx.strokeStyle = style; ctx.lineWidth = 1.6;
    for (let v0 = -step; v0 < H + step; v0 += step) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = v0 + (x / W) * step + Math.sin(x * 0.05 + v0) * 2.2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  const map = tex(col); map.colorSpace = THREE.SRGBColorSpace;
  return { map, glow: tex(glow) };
}

/** An additive wash of light: a soft ellipse brightest at `f` across (u) and in the middle up (v). */
function washTexture(f) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.save(); x.translate(128 * f, 128); x.scale(1, 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(-128, -64, 256, 128); x.restore();
  return new THREE.CanvasTexture(c);
}

/** Långlampan (#270, LANGLAMPA): a round foot, a short stem, and a tall linen tube with a spiral wire round it and bulbs
 * inside; lit, the shade glows warm and soft washes fall on the two corner walls (`item.corner` = their inner faces).
 * Its own lamp (lights.js FloorLamp: dusk on/off, E on the shade, a pool light). Built world-aligned in `w`. */
function tubelamp(item, lights) {
  const S = LANGLAMPA, g = new THREE.Group(), w = new THREE.Group();
  w.rotation.y = -(THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI); // undo the group's yaw: children in world axes
  g.add(w);
  const metal = new THREE.MeshStandardMaterial({ color: S.metal, roughness: 0.45, metalness: 0.5 });
  const wire = new THREE.MeshStandardMaterial({ color: S.wire, roughness: 0.7 });
  const add = (m, y) => { m.position.y = y; m.castShadow = true; w.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(S.foot.r, S.foot.r, S.foot.h, 32), metal), S.foot.h / 2);
  add(new THREE.Mesh(new THREE.CylinderGeometry(S.stem, S.stem, S.bottom + 0.05, 10), metal), (S.bottom + 0.05) / 2);
  const { map, glow } = linenTextures(S);
  const linen = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.95, emissive: S.glow, emissiveMap: glow,
    emissiveIntensity: 0.04, side: THREE.DoubleSide });
  const shade = add(new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r, S.h, 40, 1, true), linen), S.bottom + S.h / 2);
  // the bulbs (u = 0.5 of the texture) towards the sofa
  shade.rotation.y = Math.atan2(4.1 - item.x, 11.7 - item.z) - Math.PI;
  for (const y of [S.bottom, S.bottom + S.h]) add(new THREE.Mesh(new THREE.TorusGeometry(S.r, S.rim / 2, 6, 40).rotateX(Math.PI / 2), wire), y);
  // a cross of thin wires inside the bottom rim carries the shade on the stem
  for (const r of [0, Math.PI / 2]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, S.r * 2, 6).rotateZ(Math.PI / 2).rotateY(r), wire), S.bottom + 0.004);
  // the washes on the corner walls, brightest level with the lamp
  const washMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: washTexture(0.16 / S.wash.w), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  washMat.visible = false;
  washMat.userData.on = S.wash.opacity; // (lights.js fades it by opacity)
  const [cx, cz] = item.corner, dx = cx - item.x, dz = cz - item.z;
  const plane = (px, pz, ry, flip) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(S.wash.w, S.wash.h), washMat);
    o.position.set(px, S.wash.y, pz); o.rotation.y = ry; if (flip) o.scale.x = -1;
    o.raycast = () => {}; o.renderOrder = 2;
    w.add(o);
  };
  plane(dx - 0.004, dz + S.wash.w / 2, -Math.PI / 2, false); // the east wall: from the corner southwards
  plane(dx - S.wash.w / 2, dz + 0.004, 0, true);             // the north wall: from the corner westwards
  // the pool light a little out from the corner, into the room
  lights.push({ object: shade, shade: linen, glows: [washMat], wash: 1, height: 0, level: item.level, name: 'långlampan',
    light: S.light, offset: [-0.2, 0.2] });
  g.userData.keep = [shade];
  g.userData.footprint = [{ x0: -S.r, x1: S.r, z0: -S.r, z1: S.r }];
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
  if (item.flower) { // a little pot plant you can take (#185, things.js)
    const f = flower();
    mergeStatic(f); // a few meshes (one per material), not a dozen
    f.position.y = 0.533;
    g.add(f);
    g.userData.keep = [f];
    g.userData.things = [{ model: f, kind: 'plant', back: 'sidobordet' }];
  }
  g.userData.footprint = [{ x0: -0.22, x1: 0.22, z0: -0.22, z1: 0.22 }];
  return g;
}

const oiledOak = new THREE.MeshStandardMaterial({ color: 0xc69c6d, roughness: 0.5 }); // oljebehandlad ek

/** ILVA Woodstock coffee table (#410, docs/soffbord-ilva-woodstock.jpg, COFFEE_TABLE): a soft rounded oak top (big corner
 * radii, long sides bulging a little, edges rounded so it looks thin), a thin apron set back under it, four round tapered
 * legs set in from the corners and splayed outwards both ways, and a see-through shelf of round dowels along the length
 * between two end rails. One material, so the piece merges into one mesh. Local x = w, z = d. */
function coffeetable(item) {
  const g = new THREE.Group();
  const C = COFFEE_TABLE, { w, d, h } = item, t = C.top, legH = h - t;
  const e = C.bulge / 2, a = w / 2 - e / 2, b = d / 2 - C.bulge, r = C.radius, bt = Math.min(0.009, t / 3);
  // the top: a rounded rectangle whose long sides bulge out by C.bulge (the ends by half that); quadratic control points
  // at twice the bulge put the curve's middle at the bulge
  const sh = new THREE.Shape();
  sh.moveTo(-a + r, -b);
  sh.quadraticCurveTo(0, -b - 2 * C.bulge, a - r, -b);
  sh.absarc(a - r, -b + r, r, -Math.PI / 2, 0, false);
  sh.quadraticCurveTo(a + e, 0, a, b - r);
  sh.absarc(a - r, b - r, r, 0, Math.PI / 2, false);
  sh.quadraticCurveTo(0, b + 2 * C.bulge, -a + r, b);
  sh.absarc(-a + r, b - r, r, Math.PI / 2, Math.PI, false);
  sh.quadraticCurveTo(-a - e, 0, -a, -b + r);
  sh.absarc(-a + r, -b + r, r, Math.PI, Math.PI * 1.5, false);
  // rounded edges (a bevel at the top and bottom), so the edge looks thinner than the top
  const topGeo = new THREE.ExtrudeGeometry(sh, { depth: t - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bt * 0.9, bevelSegments: 3, curveSegments: 10 });
  topGeo.rotateX(-Math.PI / 2); // the shape's y → −z, the extrusion → up: y −bt … t − bt
  topGeo.translate(0, h - t + bt, 0);
  g.add(new THREE.Mesh(topGeo, oiledOak));
  // the put-down surface: kept inside the rounded corners
  g.userData.surfaces = [{ x0: -a + 0.06, x1: a - 0.06, z0: -b + 0.05, z1: b - 0.05, y: h }];
  // legs: from under the top (set in by C.legIn) splayed out by C.splay (at the floor, x and z)
  const lx = w / 2 - C.legIn[0], lz = d / 2 - C.legIn[1], [sx, sz] = C.splay;
  const legAt = (y) => [lx + sx * (1 - y / legH), lz + sz * (1 - y / legH)]; // a leg's centre |x|, |z| at height y
  const up = new THREE.Vector3(0, 1, 0);
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) {
    const top = new THREE.Vector3(kx * lx, legH, kz * lz), foot = new THREE.Vector3(kx * (lx + sx), 0, kz * (lz + sz));
    const dir = top.clone().sub(foot), len = dir.length();
    const l = new THREE.Mesh(new THREE.CylinderGeometry(C.leg[0], C.leg[1], len, 14), oiledOak);
    l.quaternion.setFromUnitVectors(up, dir.normalize());
    l.position.copy(top).add(foot).multiplyScalar(0.5);
    g.add(l);
  }
  // the apron: thin rails between the leg tops, set back under the top
  const ay = legH - C.apron / 2, [ax, az] = legAt(ay);
  for (const z of [-az, az]) g.add(rbox(2 * ax, C.apron, 0.018, 0, ay, z, oiledOak, 0.004));
  for (const x of [-ax, ax]) g.add(rbox(0.018, C.apron, 2 * az, x, ay, 0, oiledOak, 0.004));
  // the shelf: two end rails across the depth joining the legs, round dowels along the length resting on them
  const sy = C.shelfY, [ex, ez] = legAt(sy);
  for (const x of [-ex, ex]) g.add(rbox(0.024, 0.04, 2 * ez, x, sy, 0, oiledOak, 0.005));
  for (let i = 0; i < C.slats; i++) {
    const z = -ez + 0.04 + (i / (C.slats - 1)) * (2 * ez - 0.08);
    const dowel = new THREE.Mesh(new THREE.CylinderGeometry(C.slat / 2, C.slat / 2, 2 * ex, 10), oiledOak);
    dowel.rotation.z = Math.PI / 2;
    dowel.position.set(0, sy + 0.02 + C.slat / 2, z);
    g.add(dowel);
  }
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
 * a tall sloping plain upholstered headboard (the real one's buttons are the fabric's colour and barely show, #299). Local −z = the head end; the mattress is item.w × item.l. */
function idanasFrame(g, item) {
  const I = IDANAS, w = item.w, l = item.l, z0 = -l / 2;
  const fabric = new THREE.MeshStandardMaterial({ color: 0xffffff, map: melangeTexture(I.color), roughness: 0.95 });
  const sideW = (I.W - w) / 2, frameL = l + 0.03, fy = (I.legH + I.frameH) / 2, fh = I.frameH - I.legH;
  g.add(rbox(I.W, fh, frameL, 0, fy, 0.015, fabric, 0.03));
  // drawer fronts (two each side), a slim shadow line round each. #402: every face stands ≥ 5 mm off the one behind it
  // (the frame's side) — 1–2 mm apart they flickered through each other on a real GPU at a distance
  const line = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.9 });
  for (const s of [-1, 1]) {
    g.add(rbox(0.008, fh - 0.12, l * 0.42, s * (I.W / 2 + 0.001), fy, -l * 0.23, line, 0.002)); // outer face 5 mm out
    // the foot-end drawers open (#103); the head-end ones stay shut behind the bedside tables
    addDrawer(g, 'sänglådan', { x: s * (I.W / 2 + 0.005), y: fy - (fh - 0.12) / 2, zf: l * 0.23, w: l * 0.42, h: fh - 0.12, depth: sideW + w / 2 - 0.1,
      front: fabric, inner: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }), rot: s * Math.PI / 2, out: 0.45,
      fill: 'pyjamas', who: 'Sovrum 1', seed: 30 + s }); // pyjamas and spare bedding (#230)
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: 0.6 });
  for (const x of [-I.W / 2 + 0.08, I.W / 2 - 0.08]) for (const z of [z0 + 0.1, -z0 - 0.06]) {
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, I.legH, 10), wood);
    lg.position.set(x, I.legH / 2, z);
    lg.castShadow = true;
    g.add(lg);
  }
  // the headboard: leaning back a little, plain (#299: no dark button dimples)
  const hb = new THREE.Group();
  hb.position.set(0, I.legH, z0 - I.head / 2);
  hb.rotation.x = -0.08;
  hb.add(rbox(I.W, I.headH - I.legH, I.head * 0.75, 0, (I.headH - I.legH) / 2, 0, fabric, 0.06));
  g.add(hb);
  return I.frameH - 0.1 + I.mattressH; // the mattress top: it sits 10 cm into the frame
}

const ticking = new THREE.MeshStandardMaterial({ color: BEDDING.ticking, roughness: 0.9 });
const fittedMats = {};
const fittedSheet = (kind) => (fittedMats[kind] ??= new THREE.MeshStandardMaterial({ color: BEDDING.sheets[kind] ?? BEDDING.sheets.plain, roughness: 0.92 }));

/** A mattress with rounded edges (#309): pale ticking, a fitted sheet over its top part (its elastic edge shows above
 * the ticking). `y` = its top. */
function addMattress(g, w, h, l, x, y, z, sheet) {
  const r = Math.min(BEDDING.mattressR, h / 2 - 0.005), sh = h * BEDDING.sheetH;
  // the ticking's top 4 mm under the sheet's: level with it, the two flickered through each other (#335)
  g.add(rbox(w - 0.008, h - 0.004, l - 0.008, x, y - 0.004 - (h - 0.004) / 2, z, ticking, r));
  g.add(rbox(w, sh, l, x, y - sh / 2, z, sheet, r));
}

/** A thick, soft duvet on a mattress `w` wide with its top at `y` (#309, `duvet` in bedding.js): from its head end at
 * z `zh`, `len` long, hanging `D.drop` over the sides; turned back `D.fold` m at the head end, the fold lying on it and
 * crumpled a little. `o` goes on to the duvet shape (seed, uv, drops). */
function addDuvet(g, mat, w, y, zh, len, D, o = {}) {
  const add = (geo, x, yy, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, yy, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const r = o.r ?? BEDDING.mattressR;
  add(duvetShape(w, len, D.th, { drop: D.drop, crumple: 0, ...o, r }), o.x ?? 0, y, zh + len / 2);
  if (D.fold) {
    const th = D.th * 0.85;
    add(duvetShape(w + 2 * D.th, D.fold, th, { drop: D.drop * 0.6, bump: 0.007, crumple: D.fold, ...o, r: r + D.th, dropL: undefined, dropR: undefined, seed: (o.seed ?? 5) + 17 }),
      o.x ?? 0, y + D.th + 0.006, zh + D.fold / 2 + 0.01);
  }
}

/** Bed: upholstered base on legs, mattress, duvet, pillows, headboard. Local −z = head end.
 * `item.bedding` gives the cosy check bedding (Sovrum 1); otherwise plain linen. */
function bed(item) {
  const g = new THREE.Group();
  const w = item.w, l = item.l, z0 = -l / 2;
  let top = 0.52; // mattress top (the plain bed)
  if (item.model === 'idanas') {
    top = idanasFrame(g, item);
    addMattress(g, w, IDANAS.mattressH, l, 0, top, 0, fittedSheet(item.bedding?.pattern ?? 'plain'));
  } else {
    g.add(rbox(w + 0.04, 0.22, l + 0.04, 0, 0.1 + 0.11, 0, bedFabric, 0.02));
    addMattress(g, w, 0.2, l, 0, 0.52, 0, fittedSheet('plain'));
  }
  const b = item.bedding, hotelTops = [];
  if (b) {
    const tex = b.pattern === 'chintz' ? chintzTexture(b) : ginghamTexture(b);
    const rep = b.pattern === 'chintz' ? b.repeat : 2 * b.check; // metres per texture repeat
    tex.repeat.set(1 / rep, 1 / rep);
    const check = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    // the duvet (#309): thick and soft, down to the frame's edge at the sides, turned back in front of the pillows
    const D = BEDDING.double, zh = z0 + 0.62;
    addDuvet(g, check, w, top, zh, -z0 - zh, D, { seed: 3 });
    // two pillows in the set's cases (#308: real pillow shapes, `pillow` in bedding.js; planar UVs in metres, so the
    // print matches the duvet's); in Sovrum 1 each lies on a white 70 × 100 hotel pillow (`item.hotel`)
    const H = PILLOWS.head, pz = z0 + 0.3;
    (w > 1.2 ? [-w / 4, w / 4] : [0]).forEach((px, k) => {
      let base = () => 0.002;
      if (item.hotel) {
        const P = PILLOWS.hotel, hx = Math.sign(px) * (w / 2 + 0.05 - P.w / 2), hz = z0 + P.d / 2 + 0.005;
        // its outer edge drapes over the side of the mattress; two 100 cm pillows overlap on a 180 bed, so the second
        // one's inner edge lies on the first (#335: side by side at the same height their edges cut through each other)
        const below = hotelTops[0], onSheet = (x) => 0.003 - 12 * Math.max(0, Math.abs(hx + x) - w / 2) ** 2;
        const hg = pillow(P.w, P.d, P.h, { seed: 11 + k, p: 4, under: 0.12, pinch: 0.035,
          base: below ? (x, z) => Math.max(onSheet(x), below(x + hx, z + hz) + 0.006) : onSheet });
        const hot = new THREE.Mesh(hg, linen);
        hot.position.set(hx, top, hz);
        hot.castShadow = hot.receiveShadow = true;
        g.add(hot);
        hotelTops.push((x, z) => hg.userData.top(x - hx, z - hz));
        base = (x, z) => hg.userData.top(x + px - hx, z + pz - hz) + 0.004;
      }
      const pil = new THREE.Mesh(pillow(H.w, H.d, H.h, { seed: 3 + k * 5, under: item.hotel ? 0.15 : 0.3, base,
        dent: { x: 0, z: 0.03, r: 0.14, depth: H.dent } }), check);
      pil.position.set(px, top, pz);
      pil.castShadow = pil.receiveShadow = true;
      g.add(pil);
    });
    // a small cushion lying on the fold in front of the pillows, its back edge up against them
    const cushion = new THREE.Mesh(pillow(0.42, 0.3, 0.1, { seed: 23, under: 0.4 }), new THREE.MeshStandardMaterial({ color: b.cushion, roughness: 0.9 }));
    cushion.position.set(-0.05, top + D.th * 1.85 + 0.05, zh + 0.16);
    cushion.rotation.set(0.45, 0.15, 0.05);
    cushion.castShadow = cushion.receiveShadow = true;
    g.add(cushion);
    // a knitted throw across the foot end on the duvet, hanging down the side
    const knit = new THREE.MeshStandardMaterial({ color: b.throw, roughness: 1 });
    addDuvet(g, knit, w + 2 * D.th, top + D.th + 0.012, -z0 - 0.52, 0.42, { th: 0.03, drop: 0.3 },
      { r: BEDDING.mattressR + D.th, extentL: w * 0.38, bump: 0.003, seed: 9 });
  } else {
    addDuvet(g, duvet, w, 0.52, z0 + 0.6, l - 0.6, BEDDING.double, { seed: 4 });
    for (const px of w > 1.2 ? [-w / 4, w / 4] : [0]) {
      const pil = new THREE.Mesh(pillow(PILLOWS.head.w, PILLOWS.head.d, PILLOWS.head.h, { seed: 5 }), linen);
      pil.position.set(px, 0.523, z0 + 0.3);
      pil.castShadow = pil.receiveShadow = true;
      g.add(pil);
    }
  }
  if (item.model !== 'idanas') {
    g.add(rbox(w + 0.06, 0.6, 0.08, 0, 0.62, z0 - 0.04, bedFabric, 0.03));
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [z0 + 0.06, -z0 - 0.06]) g.add(leg(x, z, 0.1));
  }
  // lying down (#72): head on the pillows, feet towards local +z; one place per side of a double bed
  g.userData.rest = { kind: 'lie', name: 'sängen', verb: 'lägga dig i',
    spots: (w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => ({ x, y: top + (item.hotel ? 0.1 : 0), z: z0 + 0.32 })) }; // the head up on the pillow stack (#308)
  // sitting up against the headboard (#213), chosen by looking at the foot half of the bed; `tv` = the room whose
  // TV comes on while you sit there
  if (item.sitUp) for (const x of (w > 1.2 ? [-w / 4, w / 4] : [0])) {
    g.userData.rest.spots.push({ kind: 'sit', verb: 'sätta dig upp i', x, y: top - 0.05, z: z0 + 0.42, aim: [x, -z0 - 0.5], tv: item.sitUp.tv });
  }
  // Pingping (#269): sitting up between the pillows, leaning back against the headboard, facing the foot end; a Thing
  if (item.pingping) {
    const pp = pingpingModel();
    const lift = Math.max(0, ...hotelTops.map((f) => f(0, z0 + PINGPING.home.z))); // on the hotel pillows' meeting edges (#308)
    pp.position.set(0, top + lift, z0 + PINGPING.home.z);
    pp.rotation.x = PINGPING.home.tilt;
    g.add(pp);
    (g.userData.keep ??= []).push(pp);
    (g.userData.things ??= []).push({ model: pp, kind: 'pingping', back: 'sängen' });
  }
  // a plush toy can be put down on the duvet (#269; `soft`: not cups and glasses)
  g.userData.surfaces = [{ x0: -w / 2 + 0.08, x1: w / 2 - 0.08, z0: z0 + (item.hotel ? 0.74 : 0.45), z1: -z0 - 0.15, y: top + 0.05, soft: true }];
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
const sheetMat = (kind) => (sheetMats[kind] ??= new THREE.MeshStandardMaterial({ map: sheetTexture(kind), roughness: 0.95 })); // UVs in metres: a tile 0.8 m (#309)

/** Bunk bed, white: four posts, two mattresses with duvets, guard rail and a ladder. −z = head. */
// the same white as the frame; its own material so posters.js knows the board under the top bunk (#199)
const bunkBase = whiteWood.clone();
bunkBase.userData = { posterCeiling: true };

/** IKEA MYDAL bunk bed (#227): four posts floor to top, two boards in each end at both bunks, side rails under the
 * mattresses, a two-board guard rail round the top bunk (open on the room side by the ladder), a straight
 * three-rung ladder on the room side (+x) at the foot end. Mattresses and bedding as before (`sheets`). Head at −z. */
function bunk(item) {
  const g = new THREE.Group(), M = MYDAL;
  const w = item.w, l = item.l, p = M.post, hx = w / 2 + p / 2, hz = l / 2 + p / 2, b = M.board;
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) g.add(rbox(p, M.H, p, x, M.H / 2, z, whiteWood, 0.006)); // posts
  const duvet = item.sheets ? sheetMat(item.sheets) : duvetMat();
  M.base.forEach((y, k) => {
    for (const x of [-hx, hx]) g.add(rbox(0.03, 0.14, l, x, y - 0.03, 0, whiteWood, 0.004)); // side rails
    g.add(rbox(w, 0.02, l, 0, y - 0.01, 0, k === 1 ? bunkBase : whiteWood, 0.003)); // the bed base (the top one's underside takes drawings, #199)
    for (const z of [-hz, hz]) for (const dy of [0.06, 0.06 + b + 0.1]) g.add(rbox(w, b, 0.025, 0, y + dy, z, whiteWood, 0.004)); // end boards
    // mattress with a fitted sheet, a thick duvet turned back at the head end, a real pillow (#309)
    const mt = y + M.mattress, P = BEDDING.bunkPillow;
    addMattress(g, w - 0.02, M.mattress, l - 0.02, 0, mt, 0, fittedSheet(item.sheets ?? 'plain'));
    addDuvet(g, duvet, w - 0.02, mt, -l / 2 + 0.5, l - 0.52, BEDDING.bunk, { seed: 7 + k * 4, uv: 0.8 });
    const pil = new THREE.Mesh(pillow(P.w, P.d, P.h, { seed: 13 + k, uv: 0.8, dent: { x: 0, z: 0.03, r: 0.13, depth: PILLOWS.head.dent } }), item.sheets ? duvet : linen);
    pil.position.set(0, mt + 0.003, -l / 2 + 0.01 + P.d / 2); // its seam 3 mm over the sheet, not in its plane (#335)
    pil.castShadow = pil.receiveShadow = true;
    g.add(pil);
  });
  // guard rail round the top bunk: two boards, the room side open by the ladder
  const top = M.base[1], lz0 = l / 2 - 0.5, lz1 = l / 2 - 0.05; // the ladder's span (foot end)
  for (const dy of [0.2, 0.38]) {
    g.add(rbox(0.025, b, l, -hx, top + dy, 0, whiteWood, 0.004));                                  // wall side
    g.add(rbox(0.025, b, lz0 + l / 2, hx, top + dy, (-l / 2 + lz0) / 2, whiteWood, 0.004));          // room side, up to the ladder
  }
  // the ladder: two stiles from the floor to the top rail, three rungs
  const lx = hx + 0.035;
  for (const z of [lz0, lz1]) g.add(rbox(0.03, top + 0.4, 0.045, lx, (top + 0.4) / 2, z, whiteWood, 0.005));
  for (let k = 1; k <= 3; k++) g.add(rbox(0.03, 0.03, lz1 - lz0, lx, (top / 4) * k + 0.05, (lz0 + lz1) / 2, whiteWood, 0.006));
  g.userData.rest = { kind: 'lie', name: 'våningssängen', verb: 'lägga dig i',
    spots: M.base.map((y, k) => ({ x: 0, y: y + M.mattress, z: -l / 2 + 0.3, label: k ? 'överslafen' : 'underslafen' })) };
  // `watch`: a place to sit in the lower bunk, back to the wall (local −x), facing the room, hunched
  // under the top bunk; the PC in the room swings its monitor round and plays a film
  if (item.watch) g.userData.rest.spots.push({ kind: 'sit', verb: 'sätta dig i', x: -w / 2 + 0.22, y: M.base[0] + M.mattress - 0.04, z: item.watch.z, dir: [1, 0], pc: 'film' });
  g.userData.footprint = [{ x0: -hx - p / 2, x1: lx + 0.02, z0: -hz - p / 2, z1: hz + p / 2 }];
  return g;
}

/** UVs in units of (sx, sy) metres from the geometry's own positions (faces turned towards ±x use z across), so a
 * repeating texture keeps its scale whatever the box's size (#280: beadboard grooves, the bedspread print). */
function metreUV(geo, sx = 1, sy = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    uv.setXY(i, (nx > 0.5 ? p.getZ(i) : p.getX(i)) / sx, (ny > 0.5 ? p.getZ(i) : p.getY(i)) / sy);
  }
  return geo;
}

const repeatTex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** HEMNES beadboard: one groove (a dark line with a lit edge beside it) per texture width. */
function beadTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, 32, 4);
  g.fillStyle = '#c3c2bb'; g.fillRect(0, 0, 2, 4);
  g.fillStyle = '#dcdbd5'; g.fillRect(2, 0, 1, 4);
  g.fillStyle = '#ffffff'; g.fillRect(3, 0, 2, 4);
  return repeatTex(c);
}

/** Tilly's bedspread (#280): charcoal checks, lilac lightning bolts and white sparkles; one tile = 0.6 m. */
function spreadTexture(C) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = C.spread; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) g.fillRect(i * 64, j * 64, 64, 64);
  const bolt = (x, y, s, a) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    g.fillStyle = C.bolt;
    g.beginPath(); g.moveTo(8, -40); g.lineTo(-14, 4); g.lineTo(0, 4); g.lineTo(-8, 40); g.lineTo(16, -6); g.lineTo(2, -6); g.closePath(); g.fill();
    g.restore();
  };
  const sparkle = (x, y, r) => {
    g.fillStyle = C.star;
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.25 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  };
  // drawn again one tile over on every side, so the print repeats without seams
  for (const [x, y, s, a] of [[110, 120, 1.3, 0.35], [360, 230, 1.1, -0.3], [200, 400, 1.2, 0.15], [470, 470, 0.9, 0.5]])
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) bolt(x + dx, y + dy, s, a);
  for (const [x, y, r] of [[250, 90, 14], [60, 300, 11], [420, 60, 9], [320, 360, 12], [140, 220, 7], [470, 300, 8], [30, 470, 9], [300, 500, 7]])
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) sparkle(x + dx, y + dy, r);
  return repeatTex(c);
}

const HANGUL = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', 'WenQuanYi Zen Hei', sans-serif";

/** A small canvas for a cushion face: 'holo' (a holographic lilac–aqua–pink sheen) or 'graphic' (white, a black
 * badge with a lilac sparkle and a little Korean emoticon). */
function cushionTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'holo') {
    const gr = g.createLinearGradient(0, 0, 256, 256);
    for (const [t, col] of [[0, '#c6b3ff'], [0.3, '#a9f0ff'], [0.55, '#f6c2ff'], [0.8, '#b9a6ff'], [1, '#d6fff4']]) gr.addColorStop(t, col);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  } else {
    g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#17171a'; g.beginPath(); g.arc(128, 118, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b79cff';
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? 12 : 44; g.lineTo(128 + Math.cos(a) * rr, 118 + Math.sin(a) * rr); }
    g.fill();
    g.fillStyle = '#17171a'; g.textAlign = 'center';
    g.font = `bold 30px ${HANGUL}`;
    g.fillText('ㅇㅅㅇ', 128, 228);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A round faux-fur cushion: a squashed sphere with a shaggy, noisy surface (seam vertices share the noise). */
function furCushion(r, mat) {
  const geo = new THREE.SphereGeometry(r, 28, 18);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (hash(Math.round(v.x * 1e3), Math.round(v.y * 1e3), Math.round(v.z * 1e3)) - 0.5) * 0.14;
    p.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k * 0.45);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

const HD = HEMNES_DAYBED;
const dayMats = {};
function daybedMats() {
  if (dayMats.bead) return dayMats;
  const C = HD.colors, std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.95, ...o });
  Object.assign(dayMats, {
    bead: new THREE.MeshStandardMaterial({ map: beadTexture(), roughness: 0.6 }),
    mattress: std({ color: C.mattress }),
    spread: std({ map: spreadTexture(C), roughness: 0.9 }),
    knob: new THREE.MeshStandardMaterial({ color: C.knob, roughness: 0.35, metalness: 0.6 }),
    black: std({ color: C.black }),
    holo: new THREE.MeshStandardMaterial({ map: cushionTexture('holo'), roughness: 0.3, metalness: 0.35 }),
    graphic: std({ map: cushionTexture('graphic') }),
    fur: std({ color: C.fur, roughness: 1 }),
    pink: std({ color: C.pink }),
  });
  return dayMats;
}

/** IKEA HEMNES daybed with 3 drawers / 2 mattresses, white, 207 × 89 × 83 cm (#280, docs/hemnes-dagbadd-vit.jpg),
 * seat facing +z: beadboard back and ends in a flat frame with a top rail, an arched apron under the quilted top
 * mattress, the pull-out's mattress behind it, three drawers with round knobs; Tilly's charcoal and lilac bedding. */
function daybed() {
  const g = new THREE.Group(), M = daybedMats();
  const { W, D, H } = HD, z0 = -D / 2, z1 = D / 2;
  const bead = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(metreUV(new THREE.BoxGeometry(w, h, d), HD.groove, 1), M.bead);
    m.position.set(x, y, z);
    g.add(m);
  };
  // the ends: posts front and back, a frame round a beadboard panel, a cap overhanging outwards and at the front
  const xe = W / 2 - 0.03, iw = W - 0.12; // the ends' centre line; the width between them
  for (const s of [-1, 1]) {
    const x = s * xe;
    for (const z of [z0 + 0.03, z1 - 0.03]) g.add(rbox(0.06, H - 0.02, 0.06, x, (H - 0.02) / 2, z, whiteWood, 0.006));
    g.add(rbox(0.05, 0.07, D - 0.1, x, H - 0.075, 0, whiteWood, 0.004));    // top rail
    g.add(rbox(0.05, 0.06, D - 0.1, x, 0.07, 0, whiteWood, 0.004));         // bottom rail
    bead(0.02, H - 0.21, D - 0.1, x, 0.1 + (H - 0.21) / 2, 0);              // panel
    g.add(rbox(0.085, 0.025, D + 0.02, x + s * 0.0125, H - 0.0125, 0.01, whiteWood, 0.005)); // cap
  }
  // the back: top rail with a thin cap, a beadboard panel down to a rail behind the mattress, closed below
  const zb = z0 + 0.03, [m0, m1] = HD.mattress;
  g.add(rbox(iw, 0.07, 0.045, 0, H - 0.075, zb, whiteWood, 0.004));
  g.add(rbox(iw, 0.02, 0.065, 0, H - 0.01, zb + 0.005, whiteWood, 0.004));
  g.add(rbox(iw, 0.06, 0.045, 0, m0 - 0.01, zb, whiteWood, 0.004));
  bead(iw, H - 0.11 - m0, 0.018, 0, (H - 0.11 + m0) / 2, zb);
  g.add(rbox(iw, m0 - 0.04, 0.02, 0, (m0 - 0.04) / 2 + 0.02, zb, whiteWood, 0.004));
  // the base: bottom, a deck over the drawers carrying the pull-out mattress, dividers, a set-back plinth
  const [dy, dh] = HD.drawer, bw = iw - 0.01, fw = bw / 3 - 0.012, depth = D - 0.16;
  g.add(rbox(bw, 0.015, D - 0.06, 0, 0.035, 0, whiteWood, 0.003));
  g.add(rbox(bw, 0.02, D - 0.06, 0, dy + dh + 0.012, -0.01, whiteWood, 0.003));
  g.add(rbox(bw, 0.035, 0.02, 0, 0.025, z1 - 0.04, whiteWood, 0.003));
  for (let i = 1; i < 3; i++) g.add(rbox(0.02, dh, D - 0.08, -bw / 2 + (bw * i) / 3, dy + dh / 2, -0.01, whiteWood, 0.003));
  ['basketshoes', 'hair', 'basketshoes'].forEach((fill, i) => {
    const x = -bw / 2 + bw * (i + 0.5) / 3;
    addDrawer(g, 'lådan', { x, y: dy, zf: z1 - 0.005, w: fw, h: dh, depth, front: whiteWood, out: 0.55, fill, who: 'Sovrum 4', seed: 120 + i * 7,
      grip: (o) => { const k = new THREE.Mesh(new THREE.SphereGeometry(HD.knob / 2, 16, 10), M.knob); k.scale.z = 0.7; k.position.set(0, dh / 2, 0.01); o.add(k); } });
  });
  const [p0, p1] = HD.pullout;
  g.add(rbox(bw - 0.02, p1 - p0, D - 0.12, 0, (p0 + p1) / 2, -0.02, M.mattress, 0.025)); // the pull-out's mattress
  // the arched apron under the top mattress (a flat board, its lower edge curving up to the middle)
  const [a0, a1, a2] = HD.apron, shape = new THREE.Shape();
  shape.moveTo(-iw / 2, a0); shape.lineTo(-iw / 2, a2); shape.lineTo(iw / 2, a2); shape.lineTo(iw / 2, a0);
  shape.quadraticCurveTo(0, 2 * a1 - a0, -iw / 2, a0);
  const apron = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 16 }), whiteWood);
  apron.position.z = z1 - 0.05;
  g.add(apron);
  g.add(rbox(iw, 0.02, D - 0.08, 0, a2 - 0.01, -0.01, whiteWood, 0.003)); // the slatted base under the top mattress
  // the top mattress (ÅFJÄLL), quilted in channels across
  const n = HD.channels, cw = (iw - 0.01) / n, mz = 0.01, md = D - 0.1;
  for (let i = 0; i < n; i++) g.add(rbox(cw + 0.02, m1 - m0, md, -(iw - 0.01) / 2 + cw * (i + 0.5), (m0 + m1) / 2, mz, M.mattress, 0.03));
  // the bedspread over the foot end (+x), quilted in channels, soft over the front edge and tucked in at the back
  // (#309, `duvet` in bedding.js: its length runs along x, so it is turned a quarter round; its −x side = the front)
  const sx0 = -0.48, sx1 = iw / 2 - 0.005, S = BEDDING.spread, st = S.th;
  const sp = new THREE.Mesh(duvetShape(md, sx1 - sx0, S.th, { r: 0.03, dropL: S.drop, dropR: 0, quilt: S.quilt, uv: 0.6, bump: 0.003, crumple: 0, seed: 12 }), M.spread);
  sp.position.set((sx0 + sx1) / 2, m1, mz);
  sp.rotation.y = Math.PI / 2;
  g.add(sp);
  // cushions against the back: black, holographic lilac, a graphic one, a faux-fur one, a small muted pink one; real
  // cushion shapes (#309: `pillow` stood up, its face to the front, leaning back by `tilt`)
  const cushion = (w, h, d, x, y, z, mat, tilt, roll = 0) => {
    const c = new THREE.Mesh(pillow(w, h, d * 1.25, { under: 0.5, p: 4.5, unitUV: true, seed: Math.round(x * 100) + 50 }), mat);
    c.position.set(x, y, z);
    c.rotation.order = 'ZXY';
    c.rotation.set(Math.PI / 2 + tilt, 0, roll);
    g.add(c);
  };
  cushion(0.46, 0.46, 0.15, -0.66, m1 + 0.22, z0 + 0.16, M.black, -0.18);
  cushion(0.46, 0.46, 0.14, -0.2, m1 + 0.22, z0 + 0.17, M.holo, -0.2, 0.05);
  cushion(0.42, 0.42, 0.13, 0.27, m1 + st + 0.2, z0 + 0.17, M.graphic, -0.2, -0.04);
  const fur = furCushion(0.19, M.fur);
  fur.position.set(0.68, m1 + st + 0.15, z0 + 0.2);
  fur.rotation.x = -0.25;
  g.add(fur);
  cushion(0.34, 0.2, 0.1, -0.42, m1 + 0.11, z0 + 0.34, M.pink, -0.35, 0.08);
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  // Tilly's daybed (#72): lie along it, head at the −x end (feet towards +x)
  g.userData.rest = { kind: 'lie', name: 'dagbädden', verb: 'lägga dig i', spots: [{ x: -W / 2 + 0.35, y: m1, z: 0, dir: [1, 0] }] };
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0, z1 }];
  return g;
}

/** Tilly's K-pop posters (#280, KPOP_POSTERS): invented groups drawn on one canvas atlas (3 × 2 cells of 512 × 724,
 * the A-paper ratio), each with tape in its corners. */
const POSTER_ART = ['nova', 'moon', 'bloom', 'lumi', 'starlyt'];
function kposterTexture() {
  const PW = 512, PH = 724, c = document.createElement('canvas');
  c.width = PW * 3; c.height = PH * 2;
  const g = c.getContext('2d');
  const LATIN = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  let seed = 280;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const text = (t, x, y, size, fill, { font = LATIN, weight = 'bold', stroke, glow, align = 'center' } = {}) => {
    g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.35; }
    g.fillStyle = fill; g.fillText(t, x, y);
    g.shadowBlur = 0;
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(2, size / 30); g.strokeText(t, x, y); }
  };
  const grad = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, col]) => gr.addColorStop(t, col)); return gr; };
  // a stylised figure: head, neck and shoulders down to `base`; `arms` raised for dancing
  const figure = (x, base, s, col, { hair = 0, arms = 0 } = {}) => {
    g.fillStyle = col; g.strokeStyle = col;
    g.beginPath(); g.ellipse(x, base - 0.45 * s, 0.5 * s, 0.75 * s, 0, Math.PI, 0); g.lineTo(x + 0.5 * s, base); g.lineTo(x - 0.5 * s, base); g.fill();
    g.fillRect(x - 0.1 * s, base - 1.35 * s, 0.2 * s, 0.25 * s);
    g.beginPath(); g.arc(x, base - 1.55 * s, 0.27 * s, 0, Math.PI * 2); g.fill();
    if (hair === 1) { g.beginPath(); g.ellipse(x, base - 1.35 * s, 0.32 * s, 0.42 * s, 0, 0, Math.PI * 2); g.fill(); }
    if (hair === 2) { g.beginPath(); g.arc(x + 0.1 * s, base - 1.88 * s, 0.13 * s, 0, Math.PI * 2); g.fill(); }
    if (arms) {
      g.lineWidth = 0.16 * s; g.lineCap = 'round';
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x + sd * 0.38 * s, base - 1.0 * s); g.lineTo(x + sd * (0.6 + 0.2 * arms) * s, base - 1.6 * s); g.lineTo(x + sd * (0.45 + 0.35 * arms) * s, base - 2.2 * s); g.stroke(); }
    }
  };
  const sparkle = (x, y, r, col) => {
    g.fillStyle = col; g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.22 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  };
  const ART = {
    nova() { // a five-member group against a neon sunset, chrome lettering
      g.fillStyle = grad(0, 0, 0, PH, [[0, '#1b0b3a'], [0.45, '#7a1fa2'], [0.75, '#ff3d8b'], [1, '#ffb347']]); g.fillRect(0, 0, PW, PH);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; g.beginPath(); g.moveTo(PW / 2, PH * 0.66); g.lineTo(PW / 2 + Math.cos(a) * 900, PH * 0.66 + Math.sin(a) * 900); g.lineTo(PW / 2 + Math.cos(a + 0.09) * 900, PH * 0.66 + Math.sin(a + 0.09) * 900); g.fill(); }
      text('NOVA9', PW / 2, 118, 132, grad(0, 60, 0, 180, [[0, '#ffffff'], [0.5, '#c9d6ff'], [1, '#8f9bd9']]), { stroke: '#ff4fd8', glow: '#ff4fd8' });
      text('노바나인', PW / 2, 210, 46, '#ffffff', { font: HANGUL });
      [[0.14, 74, 1], [0.32, 82, 0], [0.5, 90, 2], [0.68, 80, 1], [0.86, 72, 0]].forEach(([fx, s, hair]) => figure(PW * fx, PH - 92, s, '#150726', { hair }));
      g.fillStyle = '#150726'; g.fillRect(0, PH - 96, PW, 96);
      text('THE 1ST MINI ALBUM', PW / 2, PH - 62, 22, '#ffd2ef');
      text('AFTERGLOW', PW / 2, PH - 32, 30, '#ffffff', { glow: '#ff7ac8' });
    },
    moon() { // three dancers in front of a huge pastel moon
      g.fillStyle = '#07070d'; g.fillRect(0, 0, PW, PH);
      for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; g.fillRect(rnd() * PW, rnd() * PH * 0.75, 1.5, 1.5); }
      const mg = g.createRadialGradient(PW / 2, PH * 0.38, 20, PW / 2, PH * 0.38, 190);
      mg.addColorStop(0, '#fff6d8'); mg.addColorStop(0.75, '#f7d6ea'); mg.addColorStop(1, '#e9b3d6');
      g.shadowColor = '#ffc4e6'; g.shadowBlur = 60;
      g.fillStyle = mg; g.beginPath(); g.arc(PW / 2, PH * 0.38, 185, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(200,150,190,0.25)';
      for (const [x, y, r] of [[-60, -50, 30], [50, 20, 22], [-20, 70, 16], [80, -80, 14]]) { g.beginPath(); g.arc(PW / 2 + x, PH * 0.38 + y, r, 0, Math.PI * 2); g.fill(); }
      figure(PW * 0.3, PH * 0.66, 78, '#000000', { hair: 1, arms: 1 });
      figure(PW * 0.5, PH * 0.66, 90, '#000000', { arms: 0.4 });
      figure(PW * 0.7, PH * 0.66, 78, '#000000', { hair: 2, arms: 1 });
      g.fillStyle = '#000'; g.fillRect(0, PH * 0.66 - 2, PW, PH * 0.34);
      text('MOONRUSH', PW / 2, PH * 0.77, 76, '#ff2e88', { glow: '#ff2e88' });
      text('문러쉬', PW / 2, PH * 0.85, 40, '#ffd1e6', { font: HANGUL });
      text('2ND FULL ALBUM · MIDNIGHT RUN', PW / 2, PH * 0.92, 20, '#c9c9d6');
    },
    bloom() { // a big Hangul character on a lilac–mint gradient
      g.fillStyle = grad(0, 0, PW, PH, [[0, '#c8b6ff'], [0.5, '#b8f2e6'], [1, '#ffd6f6']]); g.fillRect(0, 0, PW, PH);
      for (let k = 0; k < 22; k++) sparkle(rnd() * PW, rnd() * PH, 6 + rnd() * 12, 'rgba(255,255,255,0.85)');
      text('ZEPHYRA', PW / 2, 92, 74, '#3b1f6b');
      g.shadowColor = 'rgba(59,31,107,0.6)'; g.shadowOffsetX = 8; g.shadowOffsetY = 10;
      text('꿈', PW / 2, PH * 0.5, 300, '#ffffff', { font: HANGUL });
      g.shadowColor = 'transparent'; g.shadowOffsetX = g.shadowOffsetY = 0;
      text('SPECIAL SINGLE', PW / 2, PH - 110, 26, '#3b1f6b');
      text('꿈길', PW / 2, PH - 66, 40, '#7b4fd6', { font: HANGUL });
    },
    lumi() { // a glowing light stick: a fan-meeting poster
      const bg = g.createRadialGradient(PW / 2, PH * 0.45, 30, PW / 2, PH * 0.45, 520);
      bg.addColorStop(0, '#24357d'); bg.addColorStop(1, '#05061a'); g.fillStyle = bg; g.fillRect(0, 0, PW, PH);
      const glow = g.createRadialGradient(PW / 2, 300, 10, PW / 2, 300, 230);
      glow.addColorStop(0, 'rgba(160,240,255,0.9)'); glow.addColorStop(0.4, 'rgba(196,155,255,0.45)'); glow.addColorStop(1, 'rgba(196,155,255,0)');
      g.fillStyle = glow; g.fillRect(0, 60, PW, 480);
      g.fillStyle = grad(0, 390, 0, 620, [[0, '#f4f4fb'], [1, '#a8a8c0']]); g.beginPath(); g.roundRect(PW / 2 - 24, 380, 48, 250, 20); g.fill();
      g.fillStyle = '#c49bff'; for (const y of [420, 450]) g.fillRect(PW / 2 - 24, y, 48, 8);
      const globe = g.createRadialGradient(PW / 2 - 20, 280, 10, PW / 2, 300, 100);
      globe.addColorStop(0, '#ffffff'); globe.addColorStop(0.5, '#9fe8ff'); globe.addColorStop(1, '#c49bff');
      g.fillStyle = globe; g.beginPath(); g.arc(PW / 2, 300, 96, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5 - Math.PI / 2, rr = k % 2 ? 22 : 52; g.lineTo(PW / 2 + Math.cos(a) * rr, 300 + Math.sin(a) * rr); }
      g.fill();
      for (let k = 0; k < 26; k++) sparkle(rnd() * PW, rnd() * PH, 3 + rnd() * 8, `rgba(255,255,255,${0.4 + rnd() * 0.6})`);
      text('LUMIRAE', PW / 2, 86, 84, '#ffffff', { glow: '#9fe8ff' });
      text('루미레', PW / 2, 148, 38, '#c9f3ff', { font: HANGUL });
      text('FAN MEETING', PW / 2, PH - 112, 34, '#ffffff');
      text('빛나는 밤', PW / 2, PH - 70, 32, '#c49bff', { font: HANGUL });
      text('SEOUL · TOKYO · STOCKHOLM', PW / 2, PH - 32, 18, '#9aa6d8');
    },
    starlyt() { // a discography: four album-cover squares
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, PW, PH);
      text('STARLYT', PW / 2, 88, 86, '#141414');
      text('스타릿', PW / 2, 146, 36, '#ff4f9a', { font: HANGUL });
      const covers = [
        [['#ff9ad5', '#ffd36e'], (x, y) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 100, y + 100, 52, 0, Math.PI * 2); g.fill(); }],
        [['#1b1b2f', '#5b2bd1'], (x, y) => sparkle(x + 100, y + 100, 70, '#ffe66d')],
        [['#7af0c8', '#3a86ff'], (x, y) => { g.strokeStyle = '#fff'; g.lineWidth = 9; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 20, y + 60 + k * 28); g.bezierCurveTo(x + 70, y + 30 + k * 28, x + 130, y + 90 + k * 28, x + 180, y + 60 + k * 28); g.stroke(); } }],
        [['#ff4f6d', '#2b0f2e'], (x, y) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + 100, y + 150); g.bezierCurveTo(x + 20, y + 95, x + 50, y + 35, x + 100, y + 75); g.bezierCurveTo(x + 150, y + 35, x + 180, y + 95, x + 100, y + 150); g.fill(); }],
      ];
      const names = ['SUGAR RUSH', 'NIGHT SKY', 'WAVE', 'HEARTBEAT'];
      covers.forEach(([cols, art], i) => {
        const x = 46 + (i % 2) * 220, y = 190 + Math.floor(i / 2) * 250;
        g.fillStyle = grad(x, y, x + 200, y + 200, [[0, cols[0]], [1, cols[1]]]); g.fillRect(x, y, 200, 200);
        art(x, y);
        text(`VOL.${i + 1}  ${names[i]}`, x + 100, y + 220, 17, '#333333');
      });
      text('DISCOGRAPHY 2023–2026', PW / 2, PH - 34, 22, '#141414');
    },
  };
  POSTER_ART.forEach((key, i) => {
    g.save();
    g.translate((i % 3) * PW, Math.floor(i / 3) * PH);
    g.beginPath(); g.rect(0, 0, PW, PH); g.clip();
    ART[key]();
    // tape over the corners
    g.fillStyle = 'rgba(238,232,214,0.82)';
    for (const [x, y, a] of [[0, 0, -0.75], [PW, 0, 0.75], [0, PH, 0.75], [PW, PH, -0.75]]) {
      g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-40, -13, 80, 26); g.restore();
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The posters on Sovrum 4's walls (#280): planes in world coordinates (the item sits at the origin, unturned),
 * one atlas material, so they merge into a single mesh. */
const POSTER_SIZE = { A2: [0.42, 0.594], A3: [0.297, 0.42] };
const POSTER_WALL = { west: { x: 0.2055, rot: Math.PI / 2 }, north: { z: 7.8085, rot: 0 } };
function kposters() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: kposterTexture(), roughness: 0.55 });
  for (const p of KPOP_POSTERS) {
    const [w, h] = POSTER_SIZE[p.size], cell = POSTER_ART.indexOf(p.art), wall = POSTER_WALL[p.wall];
    const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
    const u0 = (cell % 3) / 3, v1 = 1 - Math.floor(cell / 3) / 2;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 3, v1 - (1 - uv.getY(k)) / 2);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = wall.rot;
    if (p.wall === 'west') m.position.set(wall.x, p.y, p.at);
    else m.position.set(p.at, p.y, wall.z);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** IKEA SMÅSTAD / PLATSA wardrobe (#305, #311, SMASTAD): a white carcass (back, sides, top, bottom on a recessed plinth),
 * a shelf near the top with the clothes rail under it, a shelf low down and two wire baskets per door below; two white
 * French doors (Openables, E): the left hinged on its left edge, opening to the left, the right on its right edge,
 * opening to the right, a small knob on each by the middle joint. Tilly's clothes on hangers, folded sweaters and a cap
 * on the top shelf, sneakers, socks and a tote bag low down — one vertex-coloured mesh (stuff.js) per door's half, drawn
 * only while that door is open. Local: the back at z −D/2, the doors' faces at z D/2, faces +z. */
function smastad(item) {
  const g = new THREE.Group(), S = SMASTAD, { W, D, H, t } = S;
  const white = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.5 });
  const zb = -D / 2, zf = D / 2 - S.door, cd = zf - zb, zc = (zb + zf) / 2; // the carcass: back … front, its middle
  const board = (sx, sy, sz, x, y, z) => g.add(rbox(sx, sy, sz, x, y, z, white, 0.002));
  board(W, H, 0.006, 0, H / 2, zb + 0.003);                                              // the back
  for (const s of [-1, 1]) board(t, H, cd, s * (W / 2 - t / 2), H / 2, zc);              // the sides
  board(W - 2 * t, t, cd, 0, H - t / 2, zc);                                             // the top
  board(W - 2 * t, t, cd, 0, S.plinth + t / 2, zc);                                      // the bottom
  board(W - 2 * t, S.plinth, t, 0, S.plinth / 2, zf - 0.03);                             // the plinth, set back
  board(W - 2 * t, t, cd - 0.01, 0, S.topShelf - t / 2, zc - 0.005);                     // the top shelf
  board(W - 2 * t, t, cd - 0.01, 0, S.lowShelf - t / 2, zc - 0.005);                     // the low shelf
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W - 2 * t, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9cbcd, roughness: 0.3, metalness: 0.7 }));
  rail.position.set(0, S.rail, zc);
  g.add(rail);
  // the doors: s = −1 the left (hinge at x −W/2, the leaf towards +x, swings out to the left), +1 the right (mirrored);
  // a small white knob near each free edge, by the middle joint
  const dw = W / 2 - 0.003;
  const doors = [-1, 1].map((s, i) => addDoor(g, s < 0 ? 'garderobens vänstra dörr' : 'garderobens högra dörr', {
    x: s * W / 2, y: 0, z: D / 2, side: s, max: S.max[i], build: (p) => {
      p.add(rbox(dw, H - 0.006, S.door, -s * dw / 2, H / 2, -S.door / 2, white, 0.004));
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.022, 14).rotateX(Math.PI / 2), white);
      knob.position.set(-s * (dw - 0.045), 1.0, 0.011);
      knob.castShadow = true;
      p.add(knob);
    } }));
  // inside (in the piece's frame): each door's half gets its own pack
  const [pl, pr] = [new StuffPack(), new StuffPack()], R = rng(305), iw = W - 2 * t;
  const half = (x) => (x < 0 ? pl : pr);
  S.clothes.forEach(([kind, hex], i) => {
    const x = -iw / 2 + 0.04 + ((iw - 0.08) * (i + 0.5)) / S.clothes.length;
    half(x).at(x, S.rail, zc, (((i * 37) % 5) - 2) * 0.012, (q) => garment(q, kind, hex, S.size));
  });
  // the top shelf: a stack of folded sweaters behind each door, a cap on the right
  stack(pl, 3, 0.22, 0.055, 0.28, -0.2, S.topShelf, zc + 0.02, S.sweaters, R);
  stack(pr, 2, 0.22, 0.06, 0.28, 0.08, S.topShelf, zc + 0.02, S.sweaters.slice(2).concat(S.sweaters), R);
  pr.add(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0.29, S.topShelf + 0.12, zc - 0.06), S.cap);
  pr.add(new THREE.CylinderGeometry(0.07, 0.07, 0.006, 12, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.9).translate(0.29, S.topShelf + 0.123, zc + 0.02), S.cap); // the peak
  // the low shelf: a pair of sneakers behind each door, toes to the back
  S.shoes.slice(0, 2).forEach((hex, i) => shoes(i ? pr : pl, 0.25, hex, (i ? 1 : -1) * iw / 4, S.lowShelf, zc + 0.03, 0.06 * (i ? -1 : 1)));
  // the wire baskets, two behind each door: a rim, a grid of bottom wires, upright wires round the sides
  const bw = iw / 2 - 0.03, bd = cd - 0.06, bz = zc - 0.01, wr = 0.0025;
  for (const s of [-1, 1]) for (const [y0, h] of S.baskets) {
    const p = half(s), bx = s * iw / 4;
    p.box(bw, 0.008, 0.008, bx, y0 + h - 0.008, bz + bd / 2 - 0.004, S.wire);
    p.box(bw, 0.008, 0.008, bx, y0 + h - 0.008, bz - bd / 2 + 0.004, S.wire);
    for (const e of [-1, 1]) p.box(0.008, 0.008, bd, bx + e * (bw / 2 - 0.004), y0 + h - 0.008, bz, S.wire);
    p.box(bw, 0.03, 0.006, bx, y0 + h - 0.05, bz + bd / 2, S.wire);                         // the front grip band
    for (let x = -bw / 2 + 0.01; x <= bw / 2; x += 0.035) {
      p.box(wr, wr, bd, bx + x, y0, bz, S.wire);                                           // bottom wires
      for (const e of [-1, 1]) p.box(wr, h, wr, bx + x, y0, bz + e * (bd / 2 - wr), S.wire); // front / back uprights
    }
    for (let z = -bd / 2 + 0.01; z <= bd / 2; z += 0.035) {
      p.box(bw, wr, wr, bx, y0, bz + z, S.wire);
      for (const e of [-1, 1]) p.box(wr, h, wr, bx + e * (bw / 2 - wr), y0, bz + z, S.wire); // side uprights
    }
  }
  const [lo, hi] = S.baskets, yb = (b) => b[0] + 0.004;
  // the lower baskets: rolled socks; the upper: a pair of sneakers (left) and the tote bag folded flat (right)
  for (const s of [-1, 1]) rolls(half(s), 3, 4, 0.03, 0.09, s * iw / 4 - bw / 2 + 0.03, s * iw / 4 + bw / 2 - 0.03, bz - bd / 2 + 0.04, bz + bd / 2 - 0.04, yb(lo), s < 0 ? S.socks : S.socks.slice(2).concat(S.socks), R);
  shoes(pl, 0.25, S.shoes[2], -iw / 4, yb(hi), bz, 0.1);
  const [tw, th] = S.tote.size;
  pr.rbox(tw, 0.025, th, iw / 4, yb(hi), bz, S.tote.color, 0.01, 0.2);
  [pl, pr].forEach((p, i) => {
    const stuff = p.mesh();
    stuff.castShadow = true;
    stuff.visible = false;
    g.add(stuff);
    doors[i].contents = stuff; // (Openable.update shows it while that door is open, #228)
    g.userData.keep.push(stuff);
  });
  const stuffs = new Set(doors.map((d) => d.contents));
  g.traverse((m) => { if (m.isMesh && !stuffs.has(m)) m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }];
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
  const groove = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.6 });
  // the end compartments are drawers (#212; IKEA BYÅS: two drawers, an open shelf between): gloss fronts with a thin
  // shadow line as the grip at the top; inside (#231): games, game pads, remotes and cables on the left, two rows
  // of films on the right — one baked mesh per finish per drawer (contents.js)
  const fh = h - plinth - 0.03, dw = door - t - 0.006, depth = d - 0.07;
  for (const s of [-1, 1]) {
    const cx = s * (w / 2 - t - (door - t) / 2) - s * 0.0015; // centred in its compartment (side → divider)
    const dr = addDrawer(g, 'lådan', { x: cx, y: plinth + 0.003, zf: d / 2, w: dw, h: fh, depth, front: gloss, inner: shelfWhite, grip: (o) => {
      o.add(rbox(dw - 0.074, 0.008, 0.004, 0, h - 0.03 - plinth - 0.003, 0.001, groove, 0.001)); // the grip groove
    } });
    const P = new Pack(); // only drawn while the drawer is open (Openable.contents)
    byasDrawer(P, s, { y: 0.028, depth, hw: (dw - 0.03) / 2 - 0.008 });
    dr.contents = P.group(new THREE.Matrix4().makeTranslation(0, 0, -0.018));
    dr.contents.visible = false;
    dr.object.add(dr.contents);
  }
  // the open middle (#231): the console and games below the shelf, the router on it
  const P = new Pack();
  byasMiddle(P, { hw: w / 2 - door - t / 2, y0: plinth + t, y1: plinth + (h - plinth) * 0.5 + t / 2, zb: -d / 2 + t });
  g.add(...P.meshes());
  g.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = !m.material.vertexColors; } }); // contents cast none
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
  const silver = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7 });
  const bezel = wall && item.frame !== 'black' ? silver : dark; // `frame: 'black'`: a slim black frame, a silver edge below (#213)
  // the panel's front face is at zf; y0 = the screen's bottom (on the bench, or centred on item.y for the wall)
  let zf, y0, glowZ;
  if (wall) {
    y0 = -h / 2; zf = 0.03 + 0.06; glowZ = 0.004;                                 // wall at z 0, bracket 3 cm, panel 6 cm
    g.add(rbox(0.2, 0.2, 0.03, 0, 0, 0.015, stand, 0.004));                      // wall bracket
    g.add(rbox(w * 0.6, h * 0.6, 0.04, 0, 0, 0.05, dark, 0.01));                 // back housing
    g.add(rbox(w, h, 0.02, 0, 0, zf - 0.01, bezel, 0.006));                      // thin silver bezel / panel
    if (item.frame === 'black') {
      g.add(rbox(w - 0.02, 0.006, 0.022, 0, -h / 2 + 0.002, zf - 0.01, silver, 0.002)); // the thin silver edge along the bottom
      g.add(rbox(0.05, 0.007, 0.002, 0, -h / 2 + 0.012, zf + 0.003, silver, 0.001));   // Philips on the bottom edge (#402: 3 mm proud)
    }
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
  screen.position.set(0, y0 + h / 2, zf + 0.004); // #402: 4 mm off the panel (1.5 mm could flicker through it)
  g.add(screen);
  // power LED under the screen: red on standby, white while on
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  led.position.set(w * 0.42, y0 + 0.004, zf + 0.007); // 3 mm in front of the screen it may touch
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
  glow.visible = item.ambilight !== false; // `ambilight: false`: a TV without it
  g.add(glow);
  let on = false, acc = 0;
  const target = new THREE.Color();
  const shine = ([hh, ss, ll]) => target.setHSL(hh, ss, ll);
  const interact = {
    name: item.name ?? 'tv:n', kind: 'tv', pickable: g, screen: scr, room: item.room,
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
  const cut = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 });
  addDrawer(g, 'lådan', { x: 0, y: yd - 0.005, zf: w / 2 - 0.013, w: w - 2 * l, h: 0.1, depth: w - 0.07, front: bamboo,
    grip: (o) => o.add(rbox(0.1, 0.022, 0.004, 0, 0.08, 0.002, cut, 0.004)), fill: 'nightstand', seed: Math.round(item.x * 10) }); // grip cut-out; books, a charger, a glasses case (#230)
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

/** IKEA NYMÅNE wall/reading lamp (#219), white or black: a wall plate with a round switch, a short arm out (local +z)
 * and a cylinder shade pointing down and out, a cord hanging from the plate. Origin = the plate's centre on the wall.
 * The inside of the shade and its bulb have their own material, so each lamp switches on its own (lights.js, the
 * shared light pool: the pool light sits just below the shade's mouth). */
function walllamp(item, lights) {
  const N = NYMANE_WALL, P = N.plate, S = N.shade, g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: N.colors[item.color], roughness: 0.4 });
  const cordMat = new THREE.MeshStandardMaterial({ color: N.cordColors[item.color], roughness: 0.95 });
  const lens = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffd9a0, emissiveIntensity: 0.04, roughness: 0.5, side: THREE.BackSide });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(rbox(P.w, P.h, P.d, 0, 0, 0, body, 0.006), 0, 0, P.d / 2);
  // the round switch on the front, a little above the arm
  add(new THREE.Mesh(new THREE.CylinderGeometry(N.button, N.button, 0.006, 18).rotateX(Math.PI / 2), body), 0, P.h * 0.25, P.d + 0.003);
  const ay = -P.h * 0.15;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, N.arm, 10).rotateX(Math.PI / 2), body), 0, ay, P.d + N.arm / 2);
  const jz = P.d + N.arm;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), body), 0, ay, jz);
  // the shade: its top at the joint, the mouth pointing down and out (tilt from vertical towards +z)
  const down = new THREE.Vector3(0, -Math.cos(S.tilt), Math.sin(S.tilt));
  const shade = new THREE.Group();
  shade.position.set(0, ay, jz).addScaledVector(down, S.h / 2 - 0.005);
  shade.rotation.x = -S.tilt;
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r, S.h, 22, 1, true), body);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(S.r - 0.002, S.r - 0.002, S.h, 22, 1, true), lens); // glows (BackSide)
  const cap = new THREE.Mesh(new THREE.CircleGeometry(S.r, 22).rotateX(-Math.PI / 2), body);
  cap.position.y = S.h / 2;
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(S.r * 0.8, 18).rotateX(-Math.PI / 2), lens); // the GU10 face, seen from below
  bulb.position.y = S.h / 2 - 0.02;
  for (const m of [outer, inner, cap, bulb]) { m.castShadow = true; shade.add(m); }
  g.add(shade);
  // the fabric cord from the plate's underside down the wall
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, N.cord, 6), cordMat), 0, -P.h / 2 - N.cord / 2, P.d * 0.5);
  // the pool light just below the shade's mouth (the group is turned by rot + π)
  const mouth = new THREE.Vector3(0, ay, jz).addScaledVector(down, S.h + 0.05);
  const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI;
  lights.push({ object: g, shade: lens, height: mouth.y, level: item.level, name: 'läslampan', berth: item.berth, room: item.room,
    light: N.light, offset: [Math.sin(yaw) * mouth.z, Math.cos(yaw) * mouth.z] });
  g.position.y = item.y;
  g.userData.footprint = [];
  g.userData.walllamp = `${item.room} ${item.berth}`; // (tests find them by this)
  return g;
}

/** The speakers' status light (one material, sonos.js turns it white while music plays, #187). */
export const sonosLed = new THREE.MeshBasicMaterial({ color: 0x4a4a4a });

/** IKEA SYMFONISK (#186): a bookshelf speaker (standing, or `lying`), or the table lamp speaker with a frosted glass
 * shade. Faces local +z. The lamp's glass is its own lamp (lights.js FloorLamp: E toggles it, a pool light). */
function symfonisk(item, lights) {
  const g = new THREE.Group(), S = SYMFONISK, col = S.colors[item.color] ?? S.colors.white;
  const fabric = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 });
  const shell = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
  const dark = item.color === 'black';
  const btnMat = new THREE.MeshStandardMaterial({ color: dark ? 0x3a3b3e : 0xc9c9c4, roughness: 0.4 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (item.kind === 'lamp') {
    const L = S.lamp;
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.baseR, L.baseR, L.baseH, 32), fabric), 0, L.baseH / 2, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.baseR - 0.004, L.baseR, 0.008, 32), shell), 0, L.baseH + 0.004, 0); // the top plate
    for (const [i, dx] of [-0.018, 0, 0.018].entries()) add(new THREE.Mesh(new THREE.CylinderGeometry(i === 1 ? 0.007 : 0.005, i === 1 ? 0.007 : 0.005, 0.003, 12), btnMat), dx, L.baseH + 0.009, L.baseR - 0.025);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, L.stem, 12), shell), 0, L.baseH + 0.008 + L.stem / 2, 0);
    const glass = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.55, emissive: 0xffe0b0, emissiveIntensity: 0.04 });
    const R = L.shadeR, H = L.shadeH; // a soft dome, open below round the stem
    const dome = new THREE.LatheGeometry([[0.02, 0], [R * 0.9, 0.012], [R, 0.04], [R * 0.95, H * 0.62], [R * 0.66, H * 0.9], [0, H]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
    const y0 = L.baseH + 0.008 + L.stem;
    const shade = add(new THREE.Mesh(dome, glass), 0, y0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), sonosLed), 0, L.baseH + 0.009, L.baseR - 0.012);
    // E on the glass = the light (its own lamp); E on the speaker base = the music (#187)
    lights.push({ object: shade, shade: glass, height: H * 0.5, level: item.level, name: 'lampan' });
    g.userData.keep = [shade]; // stays its own mesh: it is the lamp's E target
  } else {
    const { w, d, h } = S.speaker;
    const [W, Hh, D] = item.lying ? [h, w, d] : [w, h, d]; // lying on its side: 31 wide, 15 high, still 10 deep
    add(rbox(W, Hh, D - 0.006, 0, 0, 0, shell, 0.008), 0, Hh / 2, -0.003);
    add(rbox(W - 0.004, Hh - 0.004, 0.008, 0, 0, 0, fabric, 0.004), 0, Hh / 2, D / 2 - 0.004); // the fabric front
    // play/pause and volume ± on top towards the back, a small white status light
    const top = Hh + 0.0015, by = -D / 2 + 0.03;
    [-0.022, 0, 0.022].forEach((dx, i) => add(new THREE.Mesh(new THREE.CylinderGeometry(i === 1 ? 0.007 : 0.005, i === 1 ? 0.007 : 0.005, 0.003, 12), btnMat), dx, top, by));
    add(new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), sonosLed), 0.04, top, by);
  }
  g.position.y = item.y ?? 0;
  g.userData.footprint = [];
  g.userData.symfonisk = `${item.kind} ${item.color}`; // (tests find them by this)
  g.userData.interact = { name: item.kind === 'lamp' ? 'högtalaren i lampan' : 'högtalaren', kind: 'speaker', verb: 'spela musik på', pickable: g, object: g, level: item.level };
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

// What lies in each NORDLI row (#230), [narrow, wide], top row first: socks and underwear, t-shirts, pyjamas, jeans.
const NORDLI_FILL = [['socks', 'underwear'], ['socks', 'tees'], ['underwear', 'tees'], ['jeans', 'pyjamas']];

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
      const gw = Math.min(0.16, (x1 - x0) * 0.5);
      let box = null;
      const dr = addDrawer(g, 'lådan', { x: cx, y: y0 + gap, zf: d / 2, w: x1 - x0, h: rowH - 2 * gap, depth: d - 0.08, front: white, inner: white,
        out: 0.3, grip: (o) => { box = o; o.add(rbox(gw, 0.016, 0.004, 0, rowH - 2 * gap - 0.024, 0.001, grip, 0.002)); },
        fill: item.rifle && r === 3 && a === 0 ? null : NORDLI_FILL[r][b - a < 0.5 ? 0 : 1], who: 'Sovrum 1', seed: 40 + r * 2 + a * 3 }); // clothes (#230)
      // the AK-47 (#196) lies on its side in the wide bottom drawer, the barrel along it, the magazine to the back
      if (item.rifle && r === 3 && a === 0) {
        const { g: gun, mag, flash } = rifleModel();
        gun.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
        gun.position.set(0.21, 0.046, -0.11);
        box.add(gun);
        (g.userData.things ??= []).push({ model: gun, kind: 'rifle', name: 'AK-47:an', homeParent: box, drawer: dr, back: 'lådan', parts: { mag, flash } });
      }
    }
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.surfaces = [item.top ? { ...item.top, y: h } : { x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y: h }]; // the make-up's free part (#331)
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

// What lies in each MALM row (#235), top row first: the two small drawers, then the four big ones.
const MALM_FILL = [['socks', 'underwear'], ['tees'], ['tees'], ['pyjamas'], ['jeans']];

/** IKEA MALM chest of 6 drawers (white, #235): a top slab overhanging the carcass a little, a recessed plinth,
 * five equal rows — two small drawers side by side at the top, four full-width ones — each front with MALM's
 * rounded lip along its top edge as the grip. Faces +z. */
function malm(item, lights) {
  const g = new THREE.Group();
  const { w, h, d } = item, plinth = 0.06, top = 0.02, gap = 0.004, rowH = (h - plinth - top - 0.01) / 5;
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.5 });
  g.add(rbox(w, top, d, 0, h - top / 2, 0, white, 0.003));                                            // top
  g.add(rbox(w - 0.004, h - top - plinth, d - 0.02, 0, plinth + (h - top - plinth) / 2, -0.01, white, 0.003)); // carcass
  g.add(rbox(w - 0.03, plinth, d - 0.06, 0, plinth / 2, -0.02, new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.6 }), 0.003));
  MALM_FILL.forEach((fills, r) => {
    const y0 = plinth + 0.005 + (4 - r) * rowH, n = fills.length;
    fills.forEach((fill, i) => {
      const x0 = -w / 2 + 0.006 + i * (w - 0.012) / n + gap, x1 = -w / 2 + 0.006 + (i + 1) * (w - 0.012) / n - gap, fh = rowH - 2 * gap;
      addDrawer(g, 'lådan', { x: (x0 + x1) / 2, y: y0 + gap, zf: d / 2, w: x1 - x0, h: fh, depth: d - 0.08, front: white, inner: white,
        out: 0.32, grip: (o) => { const lip = rbox(x1 - x0, 0.016, 0.02, 0, fh - 0.008, 0, white, 0.007); lip.castShadow = true; o.add(lip); },
        fill, who: item.room, seed: item.seed + r * 3 + i });
    });
  });
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.surfaces = [{ x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y: h }];
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 + 0.02 }];
  if (item.deco) malmDeco(g, item, lights);
  return g;
}

/** A themed lamp and a pot plant on a MALM's top (MALM_DECO). The lamp stays its own group (its E target, a lamp of
 * its own); the plant is a Thing you can take (things.js), back on 'byrån'. */
function malmDeco(g, item, lights) {
  const D = MALM_DECO[item.deco], h = item.h;
  const lamp = (item.deco === 'vader' ? deathStarLamp : unicornLamp)(D.lamp);
  lamp.group.position.set(D.lamp.x, h, D.lamp.z);
  g.add(lamp.group);
  lights.push({ object: lamp.group, shade: lamp.shade, height: lamp.height, level: item.level, name: D.lamp.name, light: D.lamp.light });
  const plant = item.deco === 'vader' ? cactus() : pinkFlower();
  mergeStatic(plant);
  plant.position.set(D.plant.x, h, D.plant.z);
  g.add(plant);
  (g.userData.keep ??= []).push(lamp.group, plant);
  (g.userData.things ??= []).push({ model: plant, kind: 'plant', name: D.plant.name, back: 'byrån' });
}

/** A Death Star lamp: a grey globe on a small black stand, the equatorial trench and the superlaser dish; the globe
 * glows cool white when it is on. Origin = the bottom centre. */
function deathStarLamp({ r }) {
  const group = new THREE.Group();
  const shade = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.55, emissive: 0xdce8ff, emissiveIntensity: 0.04 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.02, 24), dark), 0, 0.01, 0);         // the stand
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.03, 12), dark), 0, 0.035, 0);
  const cy = 0.04 + r;
  add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), shade), 0, cy, 0);
  const trench = add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.0025, 6, 48), dark), 0, cy, 0); // the equatorial trench
  trench.rotation.x = Math.PI / 2;
  // the superlaser dish in the northern half, facing the room (+z), a little inward: a dark disc with a centre point
  const dir = new THREE.Vector3(0.25, 0.45, 1).normalize();
  const dish = add(new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 24), dark), dir.x * r * 0.97, cy + dir.y * r * 0.97, dir.z * r * 0.97);
  dish.lookAt(new THREE.Vector3(dir.x * 2 * r, cy + dir.y * 2 * r, dir.z * 2 * r));
  add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.05, 8, 6), shade), dir.x * r * 0.99, cy + dir.y * r * 0.99, dir.z * r * 0.99);
  // a few panel lines of latitude
  for (const k of [-0.55, 0.3, -0.25]) {
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(r * Math.sqrt(1 - k * k) * 1.001, 0.0009, 4, 40), dark), 0, cy + k * r, 0);
    ring.rotation.x = Math.PI / 2;
  }
  return { group, shade, height: cy };
}

/** A unicorn night light: a frosted white unicorn lying on an oval base, a golden horn, a pink and lilac mane and
 * tail; the body glows (pink-tinted) when it is on. Faces +z, origin = the bottom centre. */
function unicornLamp() {
  const group = new THREE.Group();
  const shade = new THREE.MeshStandardMaterial({ color: 0xfbf7fb, roughness: 0.5, emissive: 0xffc6e8, emissiveIntensity: 0.04 });
  const base = new THREE.MeshStandardMaterial({ color: 0xf3c6dd, roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.3, metalness: 0.6 });
  const mane = [0xff8fd0, 0xc59bff, 0x8fd8ff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
  const ball = (r, sx, sy, sz, x, y, z, mat = shade) => { const m = add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat), x, y, z); m.scale.set(sx, sy, sz); return m; };
  const oval = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.02, 32), base), 0, 0.01, 0);
  oval.scale.set(1, 1, 1.6);
  ball(0.05, 0.85, 0.7, 1.35, 0, 0.055, -0.01);                       // the body, lying along z
  ball(0.022, 1, 0.7, 1.6, 0.04, 0.035, 0.03);                        // folded front legs
  ball(0.022, 1, 0.7, 1.6, -0.04, 0.035, -0.05);                      // a hind leg
  const neck = ball(0.022, 1, 1.8, 1, 0, 0.1, 0.045); neck.rotation.x = 0.35;
  ball(0.03, 0.85, 0.9, 1.25, 0, 0.14, 0.07);                          // the head
  ball(0.017, 0.9, 0.8, 1.1, 0, 0.13, 0.1);                            // the muzzle
  for (const s of [-1, 1]) { const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.022, 8), shade), s * 0.014, 0.172, 0.06); ear.rotation.z = -s * 0.25; }
  const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.05, 12), gold), 0, 0.185, 0.085); horn.rotation.x = 0.45;
  mane.forEach((m, i) => { const t = ball(0.011, 1, 1.4, 1, 0, 0.165 - i * 0.025, 0.04 - i * 0.018, m); t.rotation.x = 0.5; }); // the mane down the neck
  mane.forEach((m, i) => { const t = ball(0.012, 1, 0.9, 2.2, 0.01 * (i - 1), 0.05 + i * 0.012, -0.085 - i * 0.012, m); t.rotation.x = -0.7 - i * 0.2; }); // the tail
  return { group, shade, height: 0.09 };
}

/** A cactus in a black pot (a desert world for the Star Wars room): a ribbed column with two arms. Origin = bottom. */
function cactus() {
  const g = new THREE.Group();
  const pot = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4f7f4a, roughness: 0.75 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 1 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 20), pot), 0, 0.045, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.005, 20), sand), 0, 0.087, 0);
  const column = (r, len, x, y, z) => { // a ribbed column with a round top
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), green), x, y + len / 2, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), green), x, y + len, z);
  };
  column(0.024, 0.15, 0, 0.088, 0);
  for (const [s, y, len] of [[1, 0.15, 0.06], [-1, 0.12, 0.045]]) { // an arm out to the side, then up
    const out = add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.035, 8), green), s * 0.035, y, 0);
    out.rotation.z = Math.PI / 2;
    column(0.014, len, s * 0.05, y - 0.005, 0);
  }
  return g;
}

/** A pink-flowering pot plant in a lilac pot (the unicorn room): the side table's flower with more, pinker blooms. */
function pinkFlower() {
  const g = flower();
  const pot = new THREE.MeshStandardMaterial({ color: 0xc7a6e8, roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff7ac0, roughness: 0.7 });
  g.traverse((m) => { if (m.material === potMat) m.material = pot; else if (m.material === petalMat) m.material = pink; });
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
    addDrawer(g, 'lådan', { x: s * (w / 4 - 0.02), y: h - t - 0.125, zf: hd - 0.021, w: w / 2 - 0.08, h: 0.12, depth: d - 0.16, front: white, // drawers
      grip: (o) => o.add(rbox(0.1, 0.012, 0.004, 0, 0.113, 0.001, dark, 0.004)), fill: s < 0 ? 'crafts' : 'toys', who: 'Sovrum 3', seed: 50 + s }); // pyssel, toys (#230)                       // grips
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

/**
 * Tilly's vanity (#282, VANITY): an IKEA ALEX desk (white top, a column of drawers at local −x with make-up, hair things
 * and clothes inside, two legs at +x) with make-up on the top, and a Hollywood mirror on the wall behind it: a thin
 * white frame round the glass, globe bulbs all round. The bulbs are a lamp of their own (lights.js FloorLamp: E on the
 * mirror, and they come on at dusk like the other small lamps, #234); the glass gets a mirror image (#50). Faces local
 * +z (the wall is −z).
 */
function vanity(item, lights) {
  const V = VANITY, g = new THREE.Group();
  const { w, d, h } = V, hw = w / 2, hd = d / 2, t = 0.025, D = V.drawers;
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.8 });
  g.add(rbox(w, t, d, 0, h - t / 2, 0, white, 0.004)); // the top
  // the drawer column at −x: carcass (open at the front) and five drawers with cut-out grips
  const cx = -hw + D.w / 2, ch = h - t, dh = (ch - 0.03) / D.n;
  for (const s of [-1, 1]) g.add(rbox(0.015, ch, d - 0.01, cx + s * (D.w / 2 - 0.0075), ch / 2, -0.005, white, 0.003)); // sides
  g.add(rbox(D.w, 0.03, d - 0.01, cx, 0.015, -0.005, white, 0.003), rbox(D.w, ch, 0.012, cx, ch / 2, -hd + 0.006, white, 0.003)); // plinth, back
  const fills = ['makeup', 'makeup', 'hair', 'tees', 'socks'];
  for (let i = 0; i < D.n; i++) {
    addDrawer(g, 'lådan', { x: cx, y: 0.03 + (D.n - 1 - i) * dh + 0.003, zf: hd, w: D.w - 0.006, h: dh - 0.006, depth: d - 0.06, front: white,
      grip: (o) => o.add(rbox(0.1, 0.012, 0.004, 0, dh - 0.02, 0.001, dark, 0.004)), fill: fills[i], who: 'Sovrum 4', seed: 280 + i });
  }
  for (const z of [-hd + 0.04, hd - 0.04]) g.add(rbox(0.035, ch, 0.035, hw - 0.04, ch / 2, z, steel, 0.003)); // the legs
  g.add(rbox(0.035, 0.035, d - 0.08, hw - 0.04, 0.06, 0, steel, 0.003), rbox(w - D.w - 0.06, 0.03, 0.02, (cx + D.w / 2 + hw - 0.04) / 2, ch - 0.05, -hd + 0.02, steel, 0.003));
  // make-up on the top (one vertex-coloured mesh): a bag, foundation, perfume, brushes in a cup, lipsticks, nail
  // polish, two open palettes, a hair straightener; the right end (+x) is left free (for the laptop, #283)
  const P = new Pack(), y = h, bright = [0xff6fb5, 0xd6336c, 0x9b5de5, 0xff8fab, 0xc9184a, 0x7b2cbf, 0x2ec4b6];
  P.box(0.17, 0.08, 0.08, -hw + 0.11, y + 0.04, -hd + 0.1, 0xd9b8ef);                         // make-up bag
  P.box(0.15, 0.006, 0.082, -hw + 0.11, y + 0.083, -hd + 0.1, 0xf2f2f2);                      // its zip
  P.box(0.035, 0.09, 0.025, -hw + 0.25, y + 0.045, -hd + 0.07, 0xe3c2a4, { gloss: true });     // foundation
  P.cyl(0.009, 0.009, 0.03, -hw + 0.25, y + 0.105, -hd + 0.07, 0x111111);
  P.box(0.05, 0.065, 0.032, -hw + 0.33, y + 0.0325, -hd + 0.07, 0xf7b2cf, { gloss: true });     // perfume
  P.cyl(0.013, 0.013, 0.025, -hw + 0.33, y + 0.0775, -hd + 0.07, 0xd4af37, { gloss: true });
  P.cyl(0.032, 0.028, 0.09, -hw + 0.43, y + 0.045, -hd + 0.08, 0xffffff, { gloss: true });     // brush cup …
  for (let i = 0; i < 7; i++) {                                                                // … and brushes
    const a = (i / 7) * Math.PI * 2, bx = -hw + 0.43 + Math.cos(a) * 0.014, bz = -hd + 0.08 + Math.sin(a) * 0.014, tilt = [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18];
    P.cyl(0.004, 0.004, 0.15, bx, y + 0.11, bz, i % 2 ? 0x1d1d1f : 0xf2c4d6, { r: tilt });
    P.cyl(0.008, 0.004, 0.03, bx + Math.cos(a) * 0.012, y + 0.19, bz + Math.sin(a) * 0.012, 0x3a2a24, { r: tilt });
  }
  for (let i = 0; i < 5; i++) {                                                                // lipsticks
    const lx = -hw + 0.5 + i * 0.025;
    P.cyl(0.008, 0.008, 0.045, lx, y + 0.0225, -hd + 0.06, i % 2 ? 0xd4af37 : 0x1d1d1f, { gloss: true });
    P.cyl(0.006, 0.006, 0.02, lx, y + 0.055, -hd + 0.06, bright[i]);
  }
  for (let i = 0; i < 6; i++) {                                                                // nail polish
    const nx = -hw + 0.5 + (i % 3) * 0.035, nz = -hd + 0.11 + Math.floor(i / 3) * 0.035;
    P.box(0.024, 0.032, 0.024, nx, y + 0.016, nz, bright[(i + 2) % bright.length], { gloss: true });
    P.cyl(0.006, 0.006, 0.026, nx, y + 0.045, nz, 0x111111);
  }
  for (const [px, pz, ry, cols] of [[-hw + 0.13, 0.05, 0.15, [0xf5d0c5, 0xe8a598, 0xc97b84, 0x8d5b4c, 0xf2b5d4, 0xb784a7, 0x6d4c41, 0x2b2b2b]],
    [-hw + 0.33, 0.1, -0.2, [0xff6fb5, 0x9b5de5, 0x00bbf9, 0xfee440, 0xf15bb5, 0x00f5d4, 0xffd6a5, 0xcaffbf]]]) { // two open palettes
    P.box(0.15, 0.012, 0.09, px, y + 0.006, pz, 0x1d1d1f, { r: [0, ry, 0] });
    cols.forEach((c, k) => {
      const lx = -0.0525 + (k % 4) * 0.035, lz = -0.02 + Math.floor(k / 4) * 0.04;
      P.box(0.026, 0.004, 0.03, px + lx * Math.cos(ry) + lz * Math.sin(ry), y + 0.013, pz - lx * Math.sin(ry) + lz * Math.cos(ry), c, { r: [0, ry, 0] });
    });
  }
  for (const s of [-1, 1]) P.box(0.2, 0.014, 0.024, -0.03, y + 0.007 + (s > 0 ? 0.014 : 0), 0.14 + s * 0.0, s > 0 ? 0x1d1d1f : 0x2b2b2b, { r: [0, 0.35, 0] }); // straightener (two arms)
  P.box(0.03, 0.03, 0.03, -0.13, y + 0.015, 0.175, 0x1d1d1f, { r: [0, 0.35, 0] });                // its handle end
  for (const m of P.meshes()) g.add(m);
  // the Hollywood mirror (kept out of the piece's merge: a lamp and a mirror of its own)
  const M = V.mirror, mirror = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xfafaf8, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dadc, roughness: 0.25, metalness: 0.8 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfffaf2, emissive: litEmissive(0xfff0d8), emissiveIntensity: 0.04, roughness: 0.2 });
  const W = M.w + 2 * M.frame, H = M.h + 2 * M.frame;
  mirror.add(rbox(W, H, M.depth, 0, 0, M.depth / 2, frameMat, 0.006));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.h), litMirrorMaterial);
  glass.position.z = M.depth + 0.003; // #402: 3 mm off the frame (0.5 mm could flicker through it)
  mirror.add(glass);
  const at = [];
  const row = (n, yy, x0, x1) => { for (let i = 0; i < n; i++) at.push([x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 0.5), yy]); };
  const bx = M.w / 2 - 0.05, by = M.h / 2 - 0.05;
  row(M.top, by, -bx + 0.07, bx - 0.07);
  row(M.bottomRow, -by, -bx + 0.07, bx - 0.07);
  for (const s of [-1, 1]) for (let i = 0; i < M.side; i++) at.push([s * bx, -by + 0.12 + (2 * by - 0.24) * (M.side > 1 ? i / (M.side - 1) : 0.5)]);
  for (const [x, yy] of at) {
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.014, 12).rotateX(Math.PI / 2), chrome);
    socket.position.set(x, yy, M.depth + 0.007);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(M.bulb, 14, 10), bulbMat);
    bulb.position.set(x, yy, M.depth + 0.012 + M.bulb);
    mirror.add(socket, bulb);
  }
  mergeStatic(mirror);
  addReflector(glass, new THREE.PlaneGeometry(M.w, M.h), { level: item.level, name: 'hollywood', ...litReflect }); // its mirror image (#50)
  const my = h + M.bottom + H / 2;
  mirror.position.set(0, my, -hd + 0.002);
  g.add(mirror);
  (g.userData.keep ??= []).push(mirror);
  // the pool light a little way out from the glass (the group is turned by rot + π)
  const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI, out = 0.35;
  lights.push({ object: mirror, shade: bulbMat, height: 0, level: item.level, name: 'sminkspegelns lampor', room: 'Sovrum 4', light: V.light,
    offset: [Math.sin(yaw) * out, Math.cos(yaw) * out] });
  g.userData.vanity = { mirror, glass };
  g.userData.surfaces = [{ x0: 0.0, x1: 0.13, z0: -hd + 0.2, z1: hd - 0.03, y: h }]; // in front of the stool, beside the laptop (#283)
  g.userData.footprint = [{ x0: -hw, x1: hw, z0: -hd, z1: hd }];
  return g;
}

/** A small round velvet stool (#282): a padded drum with a domed top on short gold legs; a seat facing local +z. */
function vanitystool() {
  const S = VANITY.stool, g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.85 });
  const legH = 0.06, bodyH = S.h - legH;
  const prof = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push(new THREE.Vector2(S.r - 0.025 + Math.cos(a) * 0.025, bodyH - 0.035 + Math.sin(a) * 0.035)); } // rounded top edge
  prof.unshift(new THREE.Vector2(0, 0), new THREE.Vector2(S.r, 0));
  prof.push(new THREE.Vector2(0, bodyH));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), velvet);
  body.position.y = legH;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(S.r - 0.004, 0.005, 6, 32).rotateX(Math.PI / 2), gold); // piping at the bottom
  ring.position.y = legH + 0.005;
  g.add(ring);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, legH, 10), gold);
    leg.position.set(Math.cos(a) * (S.r - 0.04), legH / 2, Math.sin(a) * (S.r - 0.04));
    leg.castShadow = true;
    g.add(leg);
  }
  // an invisible pick box over the seat (a stool has no back to look at; the cat's ray skips invisible meshes)
  const pick = new THREE.Mesh(new THREE.BoxGeometry(2 * S.r, 0.6, 2 * S.r), new THREE.MeshBasicMaterial());
  pick.position.y = S.h + 0.3;
  pick.visible = false;
  g.add(pick);
  g.userData.rest = { kind: 'sit', name: 'pallen', verb: 'sätta dig på', spots: [{ x: 0, y: S.h, z: 0 }] };
  g.userData.footprint = [{ x0: -S.r, x1: S.r, z0: -S.r, z1: S.r }];
  return g;
}

/** Woven rug texture: base colour, fine random weave, a thin border band (canvas, no image files). */
/**
 * Sarah's rug (#171, docs/matta-vardagsrum-sarah.jpg): a dark olive ground with off-white stripes laid in square
 * fields; in each field the stripes come in straight from one edge and turn round in concentric half circles
 * (a U), the corners beside the bend filled with short straight stripes. `item.fields` = per row of fields, the
 * edge each U opens towards ('e', 'w', 'n', 's' in canvas terms: e = +x, s = +y). No border.
 */
function archRugTexture(item) {
  const ppm = 2048 / item.w, c = document.createElement('canvas');
  c.width = 2048; c.height = Math.round(item.d * ppm);
  const g = c.getContext('2d');
  g.fillStyle = item.color;
  g.fillRect(0, 0, c.width, c.height);
  const rows = item.fields, cell = c.height / rows.length, pitch = item.pitch * ppm, h = cell / 2;
  g.strokeStyle = item.stripe; g.lineWidth = item.white * ppm; g.lineCap = 'butt';
  const turn = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };
  rows.forEach((row, j) => [...row].forEach((dir, i) => {
    g.save();
    g.beginPath(); g.rect(i * cell, j * cell, cell, cell); g.clip();
    g.translate(i * cell + h, j * cell + h); g.rotate(turn[dir]); // local: the U opens towards +x
    g.beginPath();
    for (let r = pitch * 0.6; r < h; r += pitch) { // the U: legs to the +x edge, half circle round the middle
      g.moveTo(h + 2, -r); g.lineTo(0, -r); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true); g.lineTo(h + 2, r);
    }
    for (let r = pitch * 0.6; r < h + pitch; r += pitch) { // the corners beside the bend: straight, up to the outer arc
      const x = r < h ? -Math.sqrt(h * h - r * r) : 0;
      for (const s of [-1, 1]) { g.moveTo(-h - 2, s * r); g.lineTo(x, s * r); }
    }
    g.stroke();
    g.restore();
  }));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60000; i++) { // the tufted pile: tiny light/dark flecks
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(rand() * c.width, rand() * c.height, 2 + rand() * 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The grey shag rug in Sovrum 1 (#317, docs/matta-gra-sicksack-sovrum1.jpg): thin, fuzzy off-white lines in a stepped
 * zig-zag of nested open rectangles running diagonally (45°), rows offset by half a cell; over it the shag: soft light
 * and dark patches where the pile lies differently (also as a roughness map) and dense tufts that fray the lines.
 * `item.line` = line width, `item.pitch` = the distance between nested lines (m).
 */
function zigzagRugTextures(item) {
  const ppm = 512, map = document.createElement('canvas'), rough = document.createElement('canvas');
  map.width = rough.width = Math.round(item.w * ppm); map.height = rough.height = Math.round(item.d * ppm);
  const W = map.width, H = map.height, g = map.getContext('2d'), r = rough.getContext('2d');
  g.fillStyle = item.color; g.fillRect(0, 0, W, H);
  r.fillStyle = '#e0e0e0'; r.fillRect(0, 0, W, H);
  let seed = item.seed ?? 17;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the pattern, drawn in a frame turned 45°: cells 7 × 5 pitches, each three nested rectangles open on one long side
  const P = item.pitch * ppm, A = 7 * P, B = 5 * P;
  g.save();
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 4);
  g.strokeStyle = item.stripe; g.lineWidth = item.line * ppm; g.lineCap = 'square';
  g.shadowColor = item.stripe; g.shadowBlur = 0.006 * ppm; g.globalAlpha = 0.85; // pile, not paint: a soft, fuzzy line
  const reach = Math.hypot(W, H) / 2 + A;
  g.beginPath();
  for (let j = -Math.ceil(reach / B); j <= Math.ceil(reach / B); j++) {
    for (let i = -Math.ceil(reach / A); i <= Math.ceil(reach / A); i++) {
      const cx = i * A + (j & 1) * A / 2, cy = j * B, open = (i + j) & 1 ? 1 : -1; // open towards ±y
      for (const [hx, hy] of [[3 * P, 2 * P], [2 * P, P], [P, 0]]) { // 6 × 4 pitches, 4 × 2 inside it, a bar in the middle
        g.moveTo(cx - hx, cy + open * hy); g.lineTo(cx - hx, cy - open * hy); g.lineTo(cx + hx, cy - open * hy); g.lineTo(cx + hx, cy + open * hy);
      }
    }
  }
  g.stroke();
  g.restore();
  for (let i = 0; i < 320; i++) { // patches where the pile lies differently
    const x = rand() * W, y = rand() * H, rad = (0.08 + rand() * 0.3) * ppm, light = rand() < 0.5, a = 0.04 + rand() * 0.06;
    for (const [ctx, col, k] of [[g, light ? '255,255,250' : '0,0,0', 1], [r, light ? '150,150,150' : '255,255,255', 2.5]]) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},${a * k})`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
  }
  for (let i = 0; i < W * H / 9; i++) { // the shag: tufts, some across the lines
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(20,18,16,0.13)';
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 1 + rand() * 3);
  }
  const tex = new THREE.CanvasTexture(map), rtex = new THREE.CanvasTexture(rough);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = rtex.anisotropy = 8;
  return { map: tex, roughnessMap: rtex };
}

function rugTexture(item) {
  if (item.fields) return archRugTexture(item);
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

/**
 * Short-pile texture (#310): the base colour mottled by soft light/dark clouds (the velvety sheen of a pile brushed
 * different ways) and fine flecks; the same clouds, grey, as a roughness map (brushed-flat patches a little smoother).
 */
function pileTextures(item) {
  const n = 1024, map = document.createElement('canvas'), rough = document.createElement('canvas');
  map.width = map.height = rough.width = rough.height = n;
  const g = map.getContext('2d'), r = rough.getContext('2d');
  g.fillStyle = item.color; g.fillRect(0, 0, n, n);
  r.fillStyle = '#f2f2f2'; r.fillRect(0, 0, n, n);
  let seed = item.seed ?? 31;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { // the clouds
    const x = rand() * n, y = rand() * n, rad = 30 + rand() * 110, light = rand() < 0.5, a = 0.05 + rand() * 0.07;
    for (const [ctx, col] of [[g, light ? '255,235,232' : '120,70,70'], [r, light ? '170,170,170' : '255,255,255']]) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},${ctx === g ? a : a * 2.5})`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
  }
  for (let i = 0; i < 90000; i++) { // the pile: tiny tufts
    g.fillStyle = rand() < 0.5 ? 'rgba(255,240,236,0.10)' : 'rgba(90,45,45,0.09)';
    g.fillRect(rand() * n, rand() * n, 1 + rand() * 2, 1 + rand() * 2);
  }
  const tex = new THREE.CanvasTexture(map), rtex = new THREE.CanvasTexture(rough);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = rtex.anisotropy = 8;
  return { map: tex, roughnessMap: rtex };
}

/** Round rug (#310): a disc d across, h high, its rim rounded off (a lathe), UVs laid flat over the disc. */
function roundRug(item) {
  const g = new THREE.Group(), R = item.d / 2, h = item.h, e = Math.min(h * 0.75, 0.01);
  const pts = [new THREE.Vector2(0, h)];
  for (let i = 0; i <= 8; i++) { // the rounded rim: a quarter circle from the top down the side
    const a = (i / 8) * Math.PI / 2;
    pts.push(new THREE.Vector2(R - e + e * Math.sin(a), h - e + e * Math.cos(a)));
  }
  pts.push(new THREE.Vector2(R, 0));
  const geo = new THREE.LatheGeometry(pts.reverse(), 128); // bottom → top, so the faces point out and up
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / item.d + 0.5, pos.getZ(i) / item.d + 0.5);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...pileTextures(item), roughness: 1 }));
  m.position.y = 0.002; // above the floor and its AO overlay
  m.receiveShadow = true;
  g.add(m);
  registerRug(item, g);
  return g;
}

/** Big rug: a thin slab (w along local x, d along z), walked over (no footprint). */
function rug(item) {
  if (item.shape === 'round') return roundRug(item);
  const g = new THREE.Group();
  const geo = item.edge ? new RoundedBoxGeometry(item.w, item.h, item.d, 2, item.edge) : new THREE.BoxGeometry(item.w, item.h, item.d);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(item.pattern === 'zigzag' ? { ...zigzagRugTextures(item), roughness: 1 }
    : { map: rugTexture(item), roughness: 1 }));
  m.position.y = item.h / 2 + 0.002; // above the floor and its AO overlay
  m.receiveShadow = true;
  g.add(m);
  registerRug(item, g);
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

/** Framed pictures hung in a grid (#220, the stair wall): `cols` × `rows` frames of w × h with `gap` between them,
 * centred on the item (local z = 0 is the wall, the pictures face +z). Every frame is a thin black box border; its
 * inside (passe-partout + motif, cropped from the user's photos) is one cell of the `atlas` texture (`grid` cells,
 * row-major from the top left), `order[i]` = the cell shown in slot i (row-major from the top left). One material
 * for the frames and one for the pictures, so the whole group merges into two meshes. A little gloss stands in
 * for the glass. `frame: 0` = an unframed stretched canvas (#286): a black box `depth` deep (the wrapped, painted
 * edges) with the picture on its front face; `rough` overrides the picture's roughness (matte paint). */
const pictureAtlases = new Map();

/** A picture drawn on a canvas instead of loaded (`paint` = its cache key, `print` = how, on a `pictures` item with
 * one cell). The kitchen's text print (#333,
 * docs/tavla-kitchen-is-for-dancing.jpg): gold foil lettering THIS / KITCHEN / IS FOR / DANCING on pale sage paper,
 * a tall condensed bold sans squeezed so the widest line is 60 % of the width, the block ~68 % of the paper's height a little
 * above the centre; the foil a light gold → bronze gradient with a fine grain, plus a faint diagonal glare of the glass. */
function paintedPicture(P) {
  const W = 720, H = 920, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = P.paper; c.fillRect(0, 0, W, H);
  const lines = P.lines, n = lines.length, pitch = H * P.block / n, cap = pitch * 0.81, top = H * P.top;
  c.font = `bold ${Math.round(cap / 0.72)}px ${P.font}`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  // a system font squeezed to the width has thin stems: smear each line sideways by what the squeeze took (`stem` =
  // the stem width of a bold sans, in caps) so it reads as a heavy condensed face whatever font the visitor has
  const wide = Math.max(...lines.map((t) => c.measureText(t).width));
  let sx = Math.min(1, W * P.width / wide);
  const smear = cap * P.stem * (1 - sx);
  sx = Math.min(1, (W * P.width - smear) / wide);
  const foil = document.createElement('canvas'); foil.width = W; foil.height = H;
  const f = foil.getContext('2d');
  lines.forEach((t, i) => {
    const base = top + pitch * i + cap, g = f.createLinearGradient(0, base - cap, 0, base);
    P.gold.forEach(([o, col]) => g.addColorStop(o, col));
    f.save(); f.translate(W / 2, base); f.scale(sx, 1);
    f.font = c.font; f.textAlign = 'center'; f.fillStyle = g;
    for (let dx = -smear / 2; dx <= smear / 2 + 0.01; dx += 1) f.fillText(t, dx / sx, 0);
    f.restore();
  });
  f.globalCompositeOperation = 'source-atop'; // the foil's grain and a soft sheen, only on the letters
  for (let i = 0; i < 2600; i++) {
    f.fillStyle = Math.random() < 0.5 ? 'rgba(255,244,200,0.22)' : 'rgba(90,60,20,0.18)';
    f.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const sheen = f.createLinearGradient(0, H * 0.25, W, H * 0.65);
  sheen.addColorStop(0.35, 'rgba(255,250,220,0)'); sheen.addColorStop(0.5, 'rgba(255,250,220,0.35)'); sheen.addColorStop(0.65, 'rgba(255,250,220,0)');
  f.fillStyle = sheen; f.fillRect(0, 0, W, H);
  c.drawImage(foil, 0, 0);
  const glare = c.createLinearGradient(0, 0, W, H); // the glass
  glare.addColorStop(0.1, 'rgba(255,255,255,0)'); glare.addColorStop(0.22, 'rgba(255,255,255,0.10)');
  glare.addColorStop(0.3, 'rgba(255,255,255,0)'); glare.addColorStop(0.7, 'rgba(255,255,255,0)');
  glare.addColorStop(0.78, 'rgba(255,255,255,0.06)'); glare.addColorStop(0.86, 'rgba(255,255,255,0)');
  c.fillStyle = glare; c.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function pictures(item) {
  const g = new THREE.Group();
  const { w, h, gap, frame: f, depth: d, cols, rows, order } = item;
  const [gc, gr] = item.grid;
  if (item.paint && !pictureAtlases.has(item.paint)) pictureAtlases.set(item.paint, paintedPicture(item.print));
  if (!item.paint && !pictureAtlases.has(item.atlas)) {
    const tex = new THREE.TextureLoader().load(new URL(`../${item.atlas}`, import.meta.url).href);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    pictureAtlases.set(item.atlas, tex);
  }
  const black = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.45 });
  const picMat = new THREE.MeshStandardMaterial({ map: pictureAtlases.get(item.paint || item.atlas), roughness: item.rough ?? 0.32 });
  const iw = w - 2 * f, ih = h - 2 * f;
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * (w + gap), cy = ((rows - 1) / 2 - row) * (h + gap);
    const cell = order[i], u0 = (cell % gc) / gc, v1 = 1 - Math.floor(cell / gc) / gr;
    const geo = new THREE.PlaneGeometry(iw, ih);
    const uv = geo.attributes.uv; // PlaneGeometry: (0,1) (1,1) (0,0) (1,0)
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / gc, v1 - (1 - uv.getY(k)) / gr);
    const pic = new THREE.Mesh(geo, picMat);
    pic.position.set(cx, cy, f ? d - 0.006 : d + 0.0005);
    g.add(pic);
    if (!f) { // unframed canvas: the stretcher with its black-painted edges
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), black);
      box.position.set(cx, cy, d / 2); box.castShadow = true;
      g.add(box);
      continue;
    }
    // `step` (#404) = a moulded profile: the outer f − step stands the full depth, the inner `step` is a lower step in
    const o = item.step ? f - item.step : f, ds = d * 0.6;
    for (const [sx, sy, x, y] of [[w, o, 0, h / 2 - o / 2], [w, o, 0, -h / 2 + o / 2], [o, h - 2 * o, -w / 2 + o / 2, 0], [o, h - 2 * o, w / 2 - o / 2, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, d), black);
      b.position.set(cx + x, cy + y, d / 2); b.castShadow = true;
      g.add(b);
    }
    if (item.step) {
      const s = item.step, ow = w - 2 * o, oh = h - 2 * o;
      for (const [sx, sy, x, y] of [[ow, s, 0, oh / 2 - s / 2], [ow, s, 0, -oh / 2 + s / 2], [s, oh - 2 * s, -ow / 2 + s / 2, 0], [s, oh - 2 * s, ow / 2 - s / 2, 0]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, ds), black);
        b.position.set(cx + x, cy + y, ds / 2);
        g.add(b);
      }
      pic.position.z = ds - 0.004;
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(iw, ih, 0.004), black);
    back.position.set(cx, cy, 0.002); back.castShadow = true;
    g.add(back);
  }
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


/** Small things in the secretary's drawers (#118), each builds its meshes into group `g` around (0, 0, 0). Every one
 * can be taken out (#182): `name` is how the prompt calls it. */
const TRINKETS = {
  clips: { name: 'gemen', build(g, M) { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0012, 4, 12), M.steel); c.scale.set(1, 2, 1); c.rotation.x = -Math.PI / 2; c.rotation.z = i * 0.7; c.position.set(-0.05 + i * 0.022, 0.003, -0.01 + (i % 2) * 0.02); g.add(c); } } },
  stickers: { name: 'klistermärkena', build(g) { ['#d33', '#36c', '#3a3', '#f0a020'].forEach((col, i) => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.001, 0.026), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 })); st.position.set(0.03 + (i % 2) * 0.026, 0.002 + i * 0.001, -0.02 + Math.floor(i / 2) * 0.03); st.rotation.y = i * 0.3; g.add(st); }); } },
  buttons: { name: 'knapparna', build(g) { [0xd33, 0x36c, 0xfc3, 0x3a3, 0xfff, 0x222, 0xe6a].forEach((col, i) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 })); b.position.set(-0.06 + (i % 4) * 0.025, 0.002, -0.015 + Math.floor(i / 4) * 0.025); g.add(b); }); } },
  key: { name: 'nyckeln', build(g, M) { const k = new THREE.Group(); k.add(new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 12), M.brass)); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.004), M.brass); sh.position.x = 0.022; k.add(sh); const bit = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.003, 0.008), M.brass); bit.position.set(0.033, 0, 0.005); k.add(bit); k.rotation.x = -Math.PI / 2; k.position.set(0.05, 0.003, 0.01); g.add(k); } },
  crayons: { name: 'kritorna', build(g) { ['#e33', '#f90', '#fd2', '#4b4', '#38f', '#a5d'].forEach((col, i) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })); c.rotation.z = Math.PI / 2; c.rotation.y = 0.1 * i; c.position.set(-0.02, 0.005, -0.03 + i * 0.011); g.add(c); }); } },
  candy: { name: 'godiset', build(g) { ['#f4a', '#fd2', '#6cf'].forEach((col, i) => { const sw = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25 })); sw.position.set(0.055, 0.008, -0.02 + i * 0.02); g.add(sw); }); } },
  crystal: { name: 'kristallen', build(g) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), new THREE.MeshStandardMaterial({ color: 0xb98cff, emissive: 0x5a2aa0, emissiveIntensity: 0.4, roughness: 0.1, flatShading: true })); c.scale.y = 1.6; c.position.y = 0.028; g.add(c); } },
  letter: { name: 'brevet', build(g) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.002, 0.055), new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.9 })); l.position.y = 0.002; g.add(l); const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 12), new THREE.MeshStandardMaterial({ color: 0xa31818, roughness: 0.5 })); seal.position.set(0, 0.004, 0); g.add(seal); } },
  plane: { name: 'pappersflygplanet', build(g) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.012, -0.05, -0.03, 0.004, 0.04, 0, 0.004, 0.04, 0, 0.012, -0.05, 0, 0.004, 0.04, 0.03, 0.004, 0.04, 0, 0.012, -0.05, 0, 0.004, 0.04, 0, -0.008, 0.035], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }))); } },
  star: { name: 'guldstjärnan', build(g, M) { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.007 : 0.016, a = (i / 10) * Math.PI * 2 - Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const st = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false }), M.gold); st.rotation.x = -Math.PI / 2; st.position.y = 0.002; g.add(st); } },
  car: { name: 'leksaksbilen', build(g) { const red = new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.35, metalness: 0.3 }), blk = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.034), red); b.position.y = 0.015; g.add(b); const c = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.03), red); c.position.set(-0.005, 0.03, 0); g.add(c);
    for (const [x, z] of [[-0.024, -0.018], [0.024, -0.018], [-0.024, 0.018], [0.024, 0.018]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10), blk); w.rotation.x = Math.PI / 2; w.position.set(x, 0.008, z); g.add(w); } } },
  papers: { name: 'pappren', build(g) { ['#f6c', '#5cf', '#fe5'].forEach((col, i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.002, 0.045), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })); p.position.set(0.09, 0.002 + i * 0.002, 0); p.rotation.y = i * 0.25; g.add(p); }); } }, // a stack of craft paper
};

/** A small canvas texture `w` × `h` px, drawn by `draw(ctx, w, h)` (notes, stamps, folders in the secret drawer). */
function noteTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
/** A flat paper (sx × sz, top printed with `tex`) lying at height y. */
const paper = (g, sx, sz, tex, y = 0.001, color = 0xffffff) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.0015, sz), [std(color), std(color), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), std(color), std(color), std(color)]);
  m.position.y = y; g.add(m); return m;
};

/** The secret drawer's surprises (#183, SECRET in config): each fits in ~12 × 4 × 9 cm, built around (0, 0, 0). */
const SECRETS = {
  star: (g, M) => TRINKETS.star.build(g, M),
  goldkey: (g, M) => { TRINKETS.key.build(g, { brass: M.gold }); g.children[0].position.set(0, 0.003, 0); },
  marble: (g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), std(0x3fa9f5, { roughness: 0.05, metalness: 0.1 })); m.position.y = 0.011; g.add(m);
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0015, 6, 20), std(0xffd23f)); swirl.position.y = 0.011; swirl.rotation.set(0.6, 0.3, 0); g.add(swirl); },
  tooth: (g) => { const t = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), std(0xfbfaf4, { roughness: 0.3 })); t.scale.set(1, 1.3, 0.9); t.position.set(-0.03, 0.007, 0); g.add(t);
    paper(g, 0.06, 0.04, noteTexture(120, 80, (c, w, h) => { c.fillStyle = '#fffbe8'; c.fillRect(0, 0, w, h); c.fillStyle = '#6a3fb5'; c.font = 'italic 22px serif'; c.fillText('Tack!', 14, 34); c.font = 'italic 16px serif'; c.fillText('/Tandfén ✨', 22, 62); })).position.x = 0.015; },
  coin: (g, M) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.002, 20), M.steel); c.position.y = 0.001; g.add(c);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0006, 5), M.steel); crown.position.y = 0.0022; g.add(crown); },
  ring: (g, M) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0016, 8, 20), M.gold); r.position.y = 0.0095; g.add(r);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.004), std(0xff6fb5, { roughness: 0.05, emissive: 0x80204a, emissiveIntensity: 0.3, flatShading: true })); gem.position.y = 0.0195; g.add(gem); },
  map: (g) => { paper(g, 0.085, 0.06, noteTexture(170, 120, (c, w, h) => {
    c.fillStyle = '#f3e3bf'; c.fillRect(0, 0, w, h); c.strokeStyle = '#5a4a3a'; c.lineWidth = 3; c.strokeRect(30, 25, 110, 70); // the house, its rooms
    c.lineWidth = 2; c.beginPath(); c.moveTo(85, 25); c.lineTo(85, 95); c.moveTo(30, 60); c.lineTo(85, 60); c.stroke();
    c.setLineDash([4, 4]); c.beginPath(); c.moveTo(10, 110); c.bezierCurveTo(60, 100, 50, 70, 110, 45); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#d0201a'; c.lineWidth = 4; c.beginPath(); c.moveTo(103, 37); c.lineTo(117, 51); c.moveTo(117, 37); c.lineTo(103, 51); c.stroke(); })); },
  dino: (g) => { const m = std(0x4caf50, { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), m); body.scale.set(1.6, 1, 1); body.position.y = 0.016; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.02, 8), m); neck.position.set(0.02, 0.026, 0); neck.rotation.z = -0.7; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), m); head.scale.set(1.4, 1, 1); head.position.set(0.03, 0.034, 0); g.add(head);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 8), m); tail.rotation.z = Math.PI / 2 + 0.3; tail.position.set(-0.03, 0.014, 0); g.add(tail);
    for (const [x, z] of [[-0.009, -0.006], [0.009, -0.006], [-0.009, 0.006], [0.009, 0.006]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.01, 6), m); l.position.set(x, 0.005, z); g.add(l); } },
  feather: (g) => { const v = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), std(0x2bb3a4, { roughness: 0.8, side: THREE.DoubleSide })); v.scale.set(0.045, 0.002, 0.011); v.position.y = 0.003; g.add(v);
    const q = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.1, 5), std(0xf5f0e0)); q.rotation.z = Math.PI / 2; q.position.y = 0.004; g.add(q); },
  shell: (g) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf6c9b3, { roughness: 0.4, side: THREE.DoubleSide })); s.scale.set(1, 0.5, 1.1); g.add(s);
    for (let i = -2; i <= 2; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.0012, 0.03), std(0xd99a83)); r.position.set(i * 0.005, 0.007 - Math.abs(i) * 0.0012, 0); r.rotation.y = i * 0.25; g.add(r); } },
  lego: (g) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.006), std(0x1e5bc6, { roughness: 0.3 })); leg.position.y = 0.006; g.add(leg);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.007), std(0xd62f2f, { roughness: 0.3 })); torso.position.y = 0.018; g.add(torso);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 12), std(0xf6d23a, { roughness: 0.3 })); head.position.y = 0.028; g.add(head);
    g.rotation.x = -Math.PI / 2; }, // lying on its back
  glitter: (g) => { const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12), std(0xe6f0f2, { roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false })); glass.rotation.z = Math.PI / 2; glass.position.y = 0.008; g.add(glass);
    const sparkle = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.022, 10), std(0xc56cff, { emissive: 0x7a2ad0, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 })); sparkle.rotation.z = Math.PI / 2; sparkle.position.set(-0.003, 0.0075, 0); g.add(sparkle);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.005, 0.008, 10), std(0xa57a4a, { roughness: 0.9 })); cork.rotation.z = Math.PI / 2; cork.position.set(0.018, 0.008, 0); g.add(cork); },
  die: (g) => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.016), std(0xfafafa, { roughness: 0.3 })); d.position.y = 0.008; g.add(d);
    const pip = std(0x111111);
    for (const [x, z] of [[-0.004, -0.004], [0.004, 0.004], [0, 0], [-0.004, 0.004], [0.004, -0.004]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.0006, 8), pip); p.position.set(x, 0.0162, z); g.add(p); } },
  cattoy: (g) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), std(0xff5fa2, { roughness: 0.7 })); b.position.y = 0.011; g.add(b);
    ['#ffd23f', '#3fa9f5', '#7ed957'].forEach((col, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.03, 6), std(col, { roughness: 0.9 })); const a = i * 0.5 - 0.5; f.position.set(-0.018, 0.016 + i * 0.002, a * 0.012); f.rotation.z = Math.PI / 2 + 0.4; f.rotation.y = a * 0.6; g.add(f); }); },
  heart: (g) => { const s = new THREE.Shape(); s.moveTo(0, -0.012); s.bezierCurveTo(-0.016, 0, -0.012, 0.012, 0, 0.005); s.bezierCurveTo(0.012, 0.012, 0.016, 0, 0, -0.012);
    const h = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), std(0xe8203a, { roughness: 0.2 })); h.rotation.x = -Math.PI / 2; h.position.y = 0.0015; g.add(h); },
  duck: (g) => { const y = std(0xffd21f, { roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), y); body.scale.set(1.3, 0.85, 1); body.position.y = 0.009; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 10), y); head.position.set(0.009, 0.021, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.007, 8), std(0xff8a1f)); beak.rotation.z = -Math.PI / 2; beak.position.set(0.0175, 0.02, 0); g.add(beak); },
  stamp: (g) => { paper(g, 0.03, 0.036, noteTexture(60, 72, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#7fc4e8'; c.fillRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#e08a2c'; c.beginPath(); c.arc(30, 42, 14, 0, Math.PI * 2); c.fill(); // a ginger cat face
    c.beginPath(); c.moveTo(18, 34); c.lineTo(20, 20); c.lineTo(27, 30); c.moveTo(42, 34); c.lineTo(40, 20); c.lineTo(33, 30); c.fill();
    c.fillStyle = '#222'; c.fillRect(24, 39, 3, 3); c.fillRect(33, 39, 3, 3); c.font = 'bold 9px sans-serif'; c.fillText('SVERIGE', 11, 15); })); },
  folder: (g) => { paper(g, 0.08, 0.06, noteTexture(160, 120, (c, w, h) => {
    c.fillStyle = '#d8b878'; c.fillRect(0, 0, w, h); c.save(); c.translate(80, 62); c.rotate(-0.18);
    c.strokeStyle = '#c4161c'; c.lineWidth = 4; c.strokeRect(-70, -22, 140, 44); c.fillStyle = '#c4161c'; c.font = 'bold 19px sans-serif'; c.textAlign = 'center';
    c.fillText('STRENGT', 0, -3); c.fillText('HEMLIGT', 0, 17); c.restore(); }), 0.003, 0xd8b878).scale.y = 4; },
};

/**
 * Build trinket `key` into a group of its own with its origin at its bottom centre (merged: one mesh per
 * material), placed where it was drawn in `parent` (a drawer or the secretary). Listed in `things` so things.js
 * makes it a Holdable whose home rides with the drawer (#182).
 */
function trinket(key, parent, M, things, drawer, back, build = TRINKETS[key].build, name = TRINKETS[key].name) {
  const raw = new THREE.Group();
  build(raw, M);
  raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw), c = box.getCenter(new THREE.Vector3());
  const tg = new THREE.Group();
  raw.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); tg.add(raw); // (its own turn stays in raw)
  mergeStatic(tg, []);
  tg.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  tg.position.set(c.x, box.min.y, c.z);
  parent.add(tg);
  things.push({ model: tg, kind: 'trinket', name, homeParent: parent, drawer, back });
  return tg;
}

/** A small yucca palm (#265, YUCCA): a white pot, two ringed canes, a tuft of long, stiff, pointed leaves on each
 * (one geometry, a shade of green per leaf in vertex colours). Origin = the pot's bottom centre; the leaves stay
 * `wallGap` in front of local z = -Y.z (the wall behind it). */
function yucca(Y = YUCCA) {
  const g = new THREE.Group();
  let seed = Y.seed;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(Y.pot.r, Y.pot.r * 0.82, Y.pot.h, 24), new THREE.MeshStandardMaterial({ color: Y.potColor, roughness: 0.55 }));
  pot.position.y = Y.pot.h / 2;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(Y.pot.r * 0.93, Y.pot.r * 0.93, 0.005, 20), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
  soil.position.y = Y.pot.h - 0.012;
  g.add(pot, soil);
  // the canes: beige-brown bark with leaf-scar rings (a lathe with a little bulge every few cm)
  const bark = new THREE.MeshStandardMaterial({ color: 0x8a7558, roughness: 0.95 });
  const tops = [];
  for (const t of Y.trunks) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const y = (i / 24) * t.h; pts.push(new THREE.Vector2(t.r * (1.15 - 0.25 * i / 24) * (1 + 0.08 * Math.max(0, Math.sin(i * 2.1))), y)); }
    pts.push(new THREE.Vector2(0, t.h));
    const cane = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), bark);
    const base = new THREE.Vector3(t.lean[0] * 0.4, Y.pot.h - 0.012, t.lean[1] * 0.4);
    const dir = new THREE.Vector3(t.lean[0], t.h, t.lean[1]).normalize();
    cane.position.copy(base);
    cane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(cane);
    tops.push(base.clone().addScaledVector(dir, t.h * 0.97));
  }
  // the leaves: a tapering, slightly folded strap that bends down a little towards its tip
  const pos = [], col = [], idx = [], green = new THREE.Color(Y.green), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), zMin = -Y.z + Y.wallGap, N = 6;
  tops.forEach((top, ti) => {
    const n = Math.round(Y.leaves * (ti === 0 ? 1 : 0.8));
    for (let k = 0; k < n; k++) {
      const f = k / n, el = THREE.MathUtils.lerp(1.45, -0.05, Math.sqrt(f)) + (rnd() - 0.5) * 0.25; // inner ones upright
      const az = k * 2.39996 + rnd() * 0.5, L = THREE.MathUtils.lerp(Y.leaf[0], Y.leaf[1], 0.4 + 0.6 * f * rnd() + 0.2 * rnd()) * (ti === 0 ? 1 : 0.85);
      const d = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      if (top.z + d.z * L < zMin) { d.z = (zMin - top.z) / L; d.normalize(); } // never back through the wall / mirror
      const side = new THREE.Vector3().crossVectors(d, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      const nrm = new THREE.Vector3().crossVectors(side, d).normalize();
      const droop = 0.12 + 0.25 * (1 - Math.max(0, Math.sin(el)));
      c.copy(green).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.1, (rnd() - 0.4) * 0.08);
      const v0 = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N, w = Y.width * (t < 0.3 ? 0.45 + 0.55 * t / 0.3 : (1 - t) / 0.7);
        const p = top.clone().addScaledVector(d, L * t); p.y -= droop * L * t * t;
        if (p.z < zMin) p.z = zMin;
        for (const [a, b] of [[-1, 0], [0, 0.35], [1, 0]]) {
          pos.push(p.x + side.x * a * w + nrm.x * b * w, p.y + side.y * a * w + nrm.y * b * w, p.z + side.z * a * w + nrm.z * b * w);
          col.push(c.r, c.g, c.b);
        }
        if (i < N) { const r = v0 + i * 3; idx.push(r, r + 3, r + 1, r + 1, r + 3, r + 4, r + 1, r + 4, r + 2, r + 2, r + 4, r + 5); }
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })));
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** The secretary "Bang" (IKEA, c. 1960, #118): teak veneer on black hairpin legs with X braces and a wire shelf;
 * a drawer under a sloping flap that folds down into a desk. Behind the flap: an open section with a shelf,
 * three small drawers on the right, three tiny ones under the shelf and a secret one behind it, and a little
 * lamp that comes on with the flap. Everything opens with E (`userData.targets`); things in every drawer. An owl
 * statue and a cactus on top. Local: the wall at z 0, the front +z, x across. */
function secretary(item) {
  const g = new THREE.Group();
  const S = item, W = S.w, D = S.d, y0 = S.legH, yF = y0 + S.drawerH, yT = S.h - 0.035, slope = THREE.MathUtils.degToRad(S.slope);
  const teak = new THREE.MeshStandardMaterial({ color: S.teak, roughness: 0.5 });
  const teakIn = new THREE.MeshStandardMaterial({ color: S.teakInside, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.4, metalness: 0.5 });
  const M = { steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.8 }), brass: new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.3, metalness: 0.8 }) };
  const box = (parent, sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const rod = (a, b, r = 0.005) => { // a thin black rod from a to b
    const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 6), black);
    m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(m);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // the stand: four splayed legs, X braces on the sides, a wire shelf low down
  const lx = W / 2 - 0.04, lz0 = 0.04, lz1 = D - 0.04, splay = 0.03;
  for (const sx of [-1, 1]) for (const [zt, zb] of [[lz0, lz0 - splay * 0.5], [lz1, lz1 + splay]]) rod(V(sx * lx, y0, zt), V(sx * (lx + splay * 0.6), 0.015, zb));
  for (const sx of [-1, 1]) { rod(V(sx * lx, y0 - 0.02, lz0), V(sx * (lx + 0.012), 0.2, lz1 + 0.01), 0.003); rod(V(sx * lx, y0 - 0.02, lz1), V(sx * (lx + 0.012), 0.2, lz0 - 0.005), 0.003); }
  const ys = 0.2;
  for (const z of [lz0, lz1 + 0.012]) rod(V(-lx - 0.012, ys, z), V(lx + 0.012, ys, z), 0.004);
  for (let i = 0; i <= 7; i++) { const x = -lx + (i / 7) * 2 * lx; rod(V(x, ys, lz0), V(x, ys, lz1 + 0.012), 0.002); }
  // the body: bottom, back, the wedge sides, the top with a raised back edge
  box(g, W, 0.018, D, 0, y0 + 0.009, D / 2, teak);
  box(g, W - 0.036, S.h - y0, 0.012, 0, (y0 + S.h) / 2, 0.006, teakIn);
  const sideShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(D, 0), new THREE.Vector2(D, yF - y0), new THREE.Vector2(D - Math.tan(slope) * (yT - yF), yT - y0), new THREE.Vector2(0.06, S.h - y0), new THREE.Vector2(0, S.h - y0)]);
  for (const sx of [-1, 1]) { const sg = new THREE.ExtrudeGeometry(sideShape, { depth: 0.018, bevelEnabled: false }); const m = new THREE.Mesh(sg, teak); m.rotation.y = -Math.PI / 2; m.position.set(sx * W / 2 + (sx < 0 ? 0.018 : 0), y0, 0); m.castShadow = true; g.add(m); }
  const topD = D - Math.tan(slope) * (yT - yF);
  box(g, W - 0.036, 0.02, topD, 0, yT + 0.01, topD / 2, teak);
  box(g, W - 0.036, 0.03, 0.015, 0, yT + 0.035, 0.0075, teak);
  // the cavity behind the flap: its floor (the drawer's top), a partition, the left shelf
  box(g, W - 0.036, 0.014, D - 0.02, 0, yF - 0.007, (D - 0.02) / 2, teakIn);
  const xR = W / 2 - 0.018 - S.rightW; // the right column of drawers starts here
  box(g, 0.012, yT - yF, topD, xR, (yF + yT) / 2, topD / 2, teakIn);
  const shelfY = yF + S.shelf;
  box(g, xR - (-W / 2 + 0.018), 0.012, topD - 0.02, (xR - W / 2 + 0.018) / 2, shelfY, (topD - 0.02) / 2, teakIn);
  // the little lamp under the top: lit while the flap is open
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffd28a, emissiveIntensity: 0, roughness: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), bulbMat);
  bulb.position.set((xR - W / 2) / 2, yT - 0.02, 0.06);
  box(g, 0.02, 0.008, 0.02, bulb.position.x, yT - 0.004, 0.06, M.brass);
  g.add(bulb);

  const targets = [], moving = [];
  const things = []; // what is in the drawers and on top can be taken out (#182)
  const drawer = (name, w, h, d, x, y, zBack, front, trinkets = [], out = 0.75 * d) => {
    // a drawer box whose front is at zBack + d; slides out along +z; its contents ride along
    const o = new THREE.Group();
    o.position.set(x, y, zBack);
    box(o, w, 0.006, d, 0, 0.003, d / 2, teakIn);
    for (const sx of [-1, 1]) box(o, 0.006, h * 0.7, d, sx * (w / 2 - 0.003), h * 0.35, d / 2, teakIn);
    box(o, w, h * 0.7, 0.006, 0, h * 0.35, 0.003, teakIn);
    box(o, w - 0.004, h - 0.004, 0.012, 0, h / 2, d + 0.006, front);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.008, h * 0.12), 10, 8), black);
    knob.position.set(0, h / 2, d + 0.016); o.add(knob);
    const target = {
      name, kind: 'appliance', isOpen: false, t: 0, object: o, pickable: o,
      toggle() { this.isOpen = !this.isOpen; sfx.slide(o.getWorldPosition(new THREE.Vector3()), { dur: 0.22 }); },
      update(dt) {
        const goal = this.isOpen ? 1 : 0;
        this.t += Math.sign(goal - this.t) * Math.min(Math.abs(goal - this.t), dt * 3);
        o.position.z = zBack + out * this.t * this.t * (3 - 2 * this.t);
      },
    };
    o.traverse((m) => { m.userData.door = target; });
    // its things: drawn around the middle of its floor, each a Holdable of its own (things.js)
    const inside = new THREE.Group(); inside.position.set(0, 0.006, d / 2); o.add(inside);
    for (const key of trinkets) trinket(key, inside, M, things, target, name);
    target.inside = inside;
    g.add(o); targets.push(target); moving.push(o);
    return target;
  };
  // the big drawer under the flap, with the key in its lock
  const big = drawer('lådan', W - 0.04, S.drawerH - 0.01, D - 0.04, 0, y0 + 0.018, 0.01, teak, ['car', 'papers']);
  const key = new THREE.Group();
  key.add(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 14), M.brass));
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, 6), M.brass); shank.rotation.x = Math.PI / 2; shank.position.z = -0.015; key.add(shank);
  key.position.set(0, (S.drawerH - 0.01) / 2 - 0.012, D - 0.04 + 0.025);
  big.object.add(key);
  key.traverse((m) => { m.userData.door = big; }); // the key is part of the drawer's E target
  big.object.children.find((m) => m.geometry?.type === 'SphereGeometry').visible = false; // the key is its handle
  // inside: three drawers in the right column, three tiny ones under the shelf, the secret one behind it
  const rw = S.rightW - 0.006, rh = (yT - yF - 0.01) / 3, rd = topD - 0.03;
  [['clips', 'stickers'], ['buttons', 'key'], ['crayons', 'candy']].forEach((tr, i) => drawer('den lilla lådan', rw, rh - 0.004, rd, xR + 0.006 + rw / 2, yF + 0.002 + i * rh, 0.012, teak, tr));
  const lw = xR - (-W / 2 + 0.018), tw = (lw - 0.012) / 3;
  [['crystal'], ['letter'], ['plane']].forEach((tr, i) => drawer('den pyttelilla lådan', tw - 0.004, S.shelf - 0.012, 0.13, -W / 2 + 0.018 + 0.006 + tw / 2 + i * tw, yF + 0.002, 0.012, teak, tr, 0.1));
  // the secret drawer: a surprise each time it is opened (#183) — every one is built here, secret.js shows one at a time
  const secret = drawer('den hemliga lådan', 0.12, 0.04, 0.09, -W / 2 + 0.018 + lw / 2, shelfY + 0.006, 0.013, teakIn, [], 0.07);
  for (const s of SECRET.items) { trinket(s.key, secret.inside, M, things, secret, 'den hemliga lådan', SECRETS[s.key], s.name); things.at(-1).secret = s.key; }
  // the flap: hinged at its bottom edge, closed it leans back with the sides; open it is a desk
  const flapL = (yT - yF) / Math.cos(slope);
  const pivot = new THREE.Group();
  pivot.position.set(0, yF, D);
  box(pivot, W - 0.04, flapL, 0.018, 0, flapL / 2, 0.009, teak);
  const plate = box(pivot, 0.05, 0.012, 0.004, 0, flapL - 0.03, 0.02, black); // the black key plate / grip at the top
  plate.rotation.z = 0.15;
  const flap = {
    name: 'sekretären', kind: 'appliance', isOpen: false, t: 0, object: pivot, pickable: pivot,
    toggle() { this.isOpen = !this.isOpen; sfx.cupboard(pivot.getWorldPosition(new THREE.Vector3()), this.isOpen); },
    update(dt) {
      const goal = this.isOpen ? 1 : 0;
      this.t += Math.sign(goal - this.t) * Math.min(Math.abs(goal - this.t), dt * 1.6);
      const e = this.t * this.t * (3 - 2 * this.t);
      pivot.rotation.x = -slope + e * (Math.PI / 2 + slope);
      bulbMat.emissiveIntensity = 1.6 * e;
    },
    /** Open, the desk sticks out in front: it blocks the way (world-space segments, player.js). */
    segments() {
      if (this.t < 0.5) return [];
      pivot.updateMatrixWorld();
      const p = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(pivot.matrixWorld);
      const a = p(-(W - 0.04) / 2, 0), b = p((W - 0.04) / 2, 0);
      const tip = (q) => q.clone().add(new THREE.Vector3(0, flapL, 0).applyQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion())));
      const c = tip(a), d = tip(b);
      return [[a.x, a.z, c.x, c.z], [c.x, c.z, d.x, d.z], [d.x, d.z, b.x, b.z]];
    },
  };
  pivot.rotation.x = -slope;
  pivot.traverse((m) => { m.userData.door = flap; });
  g.add(pivot); targets.push(flap); moving.push(pivot);
  // on top: a little stone owl and a cactus in a terracotta pot
  const stone = new THREE.MeshStandardMaterial({ color: 0xb7afa2, roughness: 0.9, flatShading: true });
  trinket('owl', g, M, things, null, 'sekretären', (owl) => {
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), stone); body.scale.set(1, 1.25, 0.9); body.position.y = 0.055; owl.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), stone); head.scale.set(1.1, 0.9, 0.9); head.position.y = 0.125; owl.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.7 })); eye.position.set(sx * 0.017, 0.128, 0.034); owl.add(eye);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), black); pupil.position.set(sx * 0.017, 0.128, 0.0345); owl.add(pupil);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 5), stone); tuft.position.set(sx * 0.026, 0.162, 0); tuft.rotation.z = -sx * 0.4; owl.add(tuft);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, 5), stone); beak.rotation.x = Math.PI; beak.position.set(0, 0.113, 0.036); owl.add(beak);
  owl.position.set(W / 2 - 0.1, yT + 0.02, topD / 2 + 0.01); owl.rotation.y = -0.25;
  }, 'ugglan');
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xb8643e, roughness: 0.85 });
  trinket('cactus', g, M, things, null, 'sekretären', (cactus) => {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.06, 14), terracotta); pot.position.y = 0.03; cactus.add(pot);
  const cg = new THREE.CylinderGeometry(0.028, 0.03, 0.08, 12, 4);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.12 * Math.cos(a * 12); cp.setX(i, x * k); cp.setZ(i, z * k); }
  cg.computeVertexNormals();
  const green = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.7 });
  const stem = new THREE.Mesh(cg, green); stem.position.y = 0.1; cactus.add(stem);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.029, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), green); dome.position.y = 0.14; cactus.add(dome);
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff5fa2, roughness: 0.5 })); flower.scale.y = 0.6; flower.position.set(0.006, 0.168, 0.004); cactus.add(flower);
  cactus.position.set(0.1, yT + 0.02, topD / 2 + 0.01); // (the yucca has the north end since #265)
  }, 'kaktusen');
  // a small yucca palm at the north end, its leaves partly in front of the SKOGSGRÄNSEN mirror (#265); a pot plant you can take
  const palmY = yucca();
  mergeStatic(palmY);
  palmY.position.set(YUCCA.x, yT + 0.02, YUCCA.z);
  g.add(palmY);
  things.push({ model: palmY, kind: 'plant', name: 'yuccapalmen', back: 'sekretären', held: { pos: [0.2, -0.62, -0.62], rot: [0.05, 0, 0] } });
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.targets = targets;
  g.userData.keep = [...moving, ...things.map((t) => t.model)];
  g.userData.things = things;
  g.userData.footprint = [{ x0: -W / 2 - 0.02, x1: W / 2 + 0.02, z0: 0, z1: D + 0.03 }];
  return g;
}

/** The framed photo of Miele (#322, PHOTO_FRAME): a thin black frame leaning back on a folding stand, the photo inside.
 * Local: origin at the bottom centre of the frame's front edge, facing +z. The frame + stand merge into one mesh, the photo
 * is the other; the whole model is a Thing you can take (kind 'photo'). */
let mieleTex = null;
/** The print's material (shared, one photo): a little `glow` (emissive = the photo itself, #327) so it reads like a lit print
 * on the bright window board; main.js scales it every frame by `photoGlow` (daylight, or the room's lamp at night). */
export const mieleMat = new THREE.MeshStandardMaterial({ roughness: 0.22, emissive: 0xffffff, emissiveIntensity: 0 }); // a little gloss for the glass
export function photoGlow(daylight, roomLit) { mieleMat.emissiveIntensity = PHOTO_FRAME.glow * Math.max(daylight, roomLit ? PHOTO_FRAME.glowLamp : 0); }
function photoframe(item, _lights, P = PHOTO_FRAME) {
  const g = new THREE.Group(), model = new THREE.Group(), tilt = new THREE.Group();
  const { w, h, border: b, depth: d, lean } = P;
  if (!mieleTex) {
    mieleTex = new THREE.TextureLoader().load(new URL(`../${P.texture}`, import.meta.url).href);
    mieleTex.colorSpace = THREE.SRGBColorSpace;
    mieleTex.anisotropy = 4;
    mieleMat.map = mieleMat.emissiveMap = mieleTex;
  }
  const black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4 });
  const photo = mieleMat;
  const box = (sx, sy, sz, x, y, z, parent = tilt) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), black); m.position.set(x, y, z); parent.add(m); return m; };
  // the frame leans back about its bottom front edge: in `tilt`, y = up the frame, z = 0 its front face
  box(w, b, d, 0, b / 2, -d / 2); box(w, b, d, 0, h - b / 2, -d / 2);
  box(b, h - 2 * b, d, -w / 2 + b / 2, h / 2, -d / 2); box(b, h - 2 * b, d, w / 2 - b / 2, h / 2, -d / 2);
  box(w - 0.004, h - 0.004, 0.003, 0, h / 2, -d + 0.0015); // the back board
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * b + 0.004, h - 2 * b + 0.004), photo); // under the moulding's lip
  pic.position.set(0, h / 2, -d * 0.6);
  tilt.add(pic);
  tilt.rotation.x = -lean;
  model.add(tilt);
  // the folding stand: a strut from the back board, 60 % up, to the board behind it
  const top = new THREE.Vector3(0, h * 0.6, -d).applyEuler(tilt.rotation), foot = new THREE.Vector3(0, 0, top.z - 0.05);
  const len = top.distanceTo(foot);
  const strut = box(0.03, len, 0.004, 0, (top.y + foot.y) / 2, (top.z + foot.z) / 2, model);
  strut.rotation.x = Math.atan2(top.z - foot.z, top.y - foot.y);
  model.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  mergeStatic(model);
  g.add(model);
  g.position.y = item.y ?? 0;
  g.userData.keep = [model];
  g.userData.things = [{ model, kind: 'photo', name: 'fotot av Miele', back: 'fönsterbänken', held: P.held }];
  return g;
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
  const corkMat = new THREE.MeshStandardMaterial({ color: 0xb8925f, roughness: 0.9 });
  const profile = [[0, 0], [0.037, 0], [0.038, 0.2], [0.03, 0.24], [0.014, 0.27], [0.013, 0.33], [0.015, 0.335], [0, 0.335]].map(([r, y]) => new THREE.Vector2(r, y));
  const bottleGeo = new THREE.LatheGeometry(profile, 16);
  const tilt = THREE.MathUtils.degToRad(item.tilt), things = [];
  for (let i = 0; i < n; i++) {
    const y = 0.07 + (i * (h - 0.2)) / (n - 1), champagne = item.champagne.includes(i); // the top neck stays inside the frame
    // the cradle: a bar out from the frame and a ring under each end of the bottle
    bar(0.006, 0.006, depth, 0, y - 0.045, fz + depth / 2);
    for (const x of [-0.11, 0.1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0025, 6, 18, Math.PI), black); ring.rotation.set(0, Math.PI / 2, Math.PI); ring.position.set(x, y - 0.005 + x * Math.tan(-tilt) * -1, fz + depth - 0.01); g.add(ring); }
    // the bottle, lying level in the cradle (#151), neck to −x
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bottleGeo, glass[i % 2]));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.09, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), labels[i % 2]);
    label.position.y = 0.1;
    b.add(label);
    if (champagne) { const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.02, 0.09, 12), gold); foil.position.y = 0.29; b.add(foil); }
    else { const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 10), corkMat); cork.position.y = 0.338; b.add(cork); } // the cork in the neck (#151)
    b.rotation.z = Math.PI / 2 - tilt;
    b.position.set(0.16, y + 0.03, fz + depth - 0.01);
    b.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(b);
    things.push({ model: b, kind: champagne ? 'champagne' : 'wine', back: 'vinhyllan' }); // can be taken out (#152)
  }
  g.userData.keep = things.map((t) => t.model);
  g.userData.things = things;
  g.position.y = item.y;
  return g;
}

/** IKEA BESTÅ display combination (#104): two 60 cm columns hung on the wall, each with a walnut-effect door at
 * the top and the bottom and a glass door between; glass shelves, fine glasses and whisky bottles behind the
 * glass; spots on top lit by the room's switch (its lamp material, no lights of its own). Every door opens on
 * its own with E (`userData.targets`). Local: the wall at z 0, the front at z = depth, bottom at y 0. */
// a soft fan of light, brightest at the bottom centre (where the spot sits), for an additive plane (turned over when
// the light comes from above)
let uplightTex = null;
function uplightTexture() {
  if (uplightTex) return uplightTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'), img = g.createImageData(128, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
    const v = 1 - y / 255, u = (x - 63.5) / 63.5; // v: 0 at the bottom (the spot), 1 at the top
    const spread = 0.18 + 0.8 * Math.pow(v, 0.7); // the fan widens upwards
    const across = Math.max(0, 1 - Math.pow(Math.abs(u) / Math.max(0.12, spread), 2));
    const a = across * Math.pow(1 - v, 1.4) * Math.min(1, v * 12); // fades upwards, soft start at the spot
    const k = (y * 128 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * a; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  uplightTex = new THREE.CanvasTexture(c); uplightTex.colorSpace = THREE.SRGBColorSpace;
  return uplightTex;
}

function besta(item, lights) {
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
  const crystal = new THREE.MeshStandardMaterial({ color: 0xe6f0f2, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }); // see-through: what is poured in shows (#167)
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const wine = lathe([[0.03, 0], [0.03, 0.004], [0.004, 0.008], [0.003, 0.08], [0.02, 0.1], [0.032, 0.14], [0.03, 0.19], [0.028, 0.19]]);
  const flute = lathe([[0.028, 0], [0.028, 0.004], [0.003, 0.008], [0.003, 0.1], [0.012, 0.12], [0.022, 0.21], [0.02, 0.21]]);
  const tumbler = lathe([[0.034, 0], [0.036, 0.09], [0.033, 0.09]]);
  const things = []; // glasses and bottles you can take out (#152)
  // the inside of each glass ([r, y] from the bottom of the bowl up): what is poured in follows it (#167)
  const inner = new Map([[wine, [[0.004, 0.086], [0.018, 0.102], [0.029, 0.14], [0.027, 0.185]]], [flute, [[0.003, 0.106], [0.01, 0.122], [0.019, 0.205]]], [tumbler, [[0.032, 0.006], [0.034, 0.088]]]]);
  const glassAt = (geo, x, y, z) => { const o = new THREE.Mesh(geo, crystal); o.position.set(x, y, z); o.castShadow = true; g.add(o); things.push({ model: o, kind: 'glass', name: geo === wine ? 'vinglaset' : geo === flute ? 'champagneglaset' : 'whiskyglaset', inner: inner.get(geo) }); };
  const bottle = (x, y, z, k) => {
    const hue = [0xb5651d, 0x7a3b12, 0xd08a2c, 0x3b2a1a, 0x9c5a1a, 0x5a2e0e][k % 6];
    const gm = new THREE.MeshStandardMaterial({ color: hue, roughness: 0.15, metalness: 0.1 });
    const shape = k % 3, bg = new THREE.Group(); // one bottle, its origin at the bottom centre
    bg.position.set(x, y, z);
    const body = shape === 1 ? new THREE.BoxGeometry(0.08, 0.17, 0.05) : new THREE.CylinderGeometry(shape ? 0.036 : 0.04, 0.04, 0.18, 14);
    const b = new THREE.Mesh(body, gm); b.position.set(0, 0.09, 0); bg.add(b);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 10), gm); neck.position.set(0, 0.21, 0); bg.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), k % 2 ? walnut : handle); cap.position.set(0, 0.25, 0); bg.add(cap);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.06), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf1e7cf : 0xd9b453, roughness: 0.7 }));
    label.position.set(0, 0.085, shape === 1 ? 0.0255 : 0.0405); bg.add(label);
    bg.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(bg);
    things.push({ model: bg, kind: 'whisky' });
  };
  // left column: glasses on the shelf, bottles below; right column: bottles on the shelf, glasses below
  const zc = fd / 2 + 0.02;
  [-0.19, -0.12, -0.05].forEach((dx, i) => { glassAt(wine, -col / 2 + dx + 0.12, yShelf + 0.003, zc - 0.05); glassAt(flute, -col / 2 + dx + 0.16, yShelf + 0.003, zc + 0.06); if (i < 2) glassAt(tumbler, -col / 2 + dx + 0.24, yShelf + 0.003, zc); });
  [-0.17, -0.05, 0.08].forEach((dx, i) => bottle(-col / 2 + dx, y1, zc, i));
  [-0.17, -0.05, 0.08].forEach((dx, i) => bottle(col / 2 + dx, yShelf + 0.003, zc, i + 3));
  [-0.15, -0.07, 0.01, 0.09].forEach((dx, i) => glassAt(i % 2 ? tumbler : wine, col / 2 + dx, y1, zc + (i % 2 ? 0.05 : -0.04)));
  // the spots on top (#188), a lamp of their own that switches itself with the dusk (#234; E on a spot): black cans
  // at the front edge aimed out and down over the front (#191), the lens and a thin ring round the rim glow; an
  // additive wash of light falls down the doors, and the glass section is lit inside (a LED strip under its top + a
  // warm glow on its back wall)
  const lens = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.04 });
  const spotHeads = new THREE.Group(); // (its origin at the middle spot: the E target)
  spotHeads.position.set(0, H + 0.04, D - 0.03);
  g.add(spotHeads);
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45 });
  const glowMat = (opacity) => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffe9c8, map: uplightTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    m.visible = false;
    m.userData.on = opacity; // (lights.js fades it by opacity)
    return m;
  };
  const washMat = glowMat(B.wash.opacity), insideMat = glowMat(B.inside);
  const fan = (w, h, x, yTop, z, m) => { // the texture's bright end at the top
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    o.rotation.z = Math.PI; o.position.set(x, yTop - h / 2, z);
    o.raycast = () => {}; o.renderOrder = 2;
    g.add(o);
  };
  for (const x of [-col / 2, col / 2]) {
    add(g, col - 0.06, 0.008, 0.012, x, y2 - 0.006, fd - 0.04, lens);                 // LED strip under the glass section's top
    fan(col - 0.04, y2 - y1, x, y2 - 0.01, 0.012, insideMat);                           // its light on the back wall
  }
  for (const x of B.spots) {
    const head = new THREE.Group();
    head.rotation.x = 2.0; head.position.set(x, 0, 0); spotHeads.add(head); // the lens out and down over the front
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14), black); can.castShadow = true; head.add(can);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.026, 14), lens);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.0352; head.add(glow);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.01, 14, 1, true), lens);
    rim.position.y = 0.03; head.add(rim);
    fan(B.wash.w, B.wash.h, x, H, D + 0.012, washMat); // the wash down the doors, just in front of them
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
        pivot.rotation.y = sideX * this.t * this.t * (3 - 2 * this.t) * THREE.MathUtils.degToRad(B.openDeg); // the free edge swings out into the room (#150)
      },
    };
    pivot.traverse((m) => { m.userData.door = target; });
    g.add(pivot); targets.push(target); doors.push(pivot);
  }
  // behind the wooden doors (#231): board games, puzzles and card games, photo albums, napkins, a table cloth — one
  // baked mesh per compartment, drawn only while its door is open
  targets.forEach((tg, i) => {
    const [, , kind] = sections[Math.floor(i / 2)];
    if (kind !== 'wood') return;
    const P = new Pack();
    bestaContents(P, { col, chw: col / 2 - 0.02, yb: t, yt: ys[2] + t / 2, zb: 0.01, zf: fd - 0.015 }, { top: i >= 4, side: i % 2 ? 1 : -1 });
    g.add(attachContents(P.meshes(), tg));
  });
  g.userData.targets = targets;
  g.userData.keep = [...doors, ...things.map((t) => t.model), spotHeads];
  g.userData.things = things.map((t) => ({ ...t, back: 'vitrinskåpet' }));
  // the pool light a little way out in front of the cabinet, below the spots (the group is turned by rot + π)
  const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI;
  lights.push({ object: spotHeads, shade: lens, glows: [washMat, insideMat], height: -0.4, level: item.level, name: 'spotsen',
    light: item.light, offset: [Math.sin(yaw) * 0.4, Math.cos(yaw) * 0.4] });
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: 0, z1: D }];
  g.position.y = item.y;
  return g;
}

const BUILDERS = { tubelamp, secretary, winerack, besta, painting, pictures, palm, sofa, armchair, ottoman, floorlamp, sidetable, coffeetable, loungesofa, loungetable, parasol, planter, bed, skansnasTable, skansnasChair, bunk, daybed, kposters, smastad, rug, ragrund, coatrack, shoerack, byas, tv, nordkisa, worklamp, walllamp, symfonisk, gamingdesk, gamingchair, nordli, malm, alex, kidchair, vanity, vanitystool, laptop, photoframe, huego, nesthub, nestmini, hookrail, klk, cleaning };

/** An invisible thin box over a table top (raycast target for putting a cup down, #90). Local rect. */
export function surfaceBox(r, list) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.01, r.z1 - r.z0), new THREE.MeshBasicMaterial());
  m.position.set((r.x0 + r.x1) / 2, r.y - 0.005, (r.z0 + r.z1) / 2);
  m.visible = false;
  m.userData.surface = r.y;
  if (r.soft) m.userData.soft = true; // a bed / a sofa: only for things that are `soft` (#269)
  list?.push(m);
  return m;
}

/** Build all furniture; returns the scene group, collision segments per level (+ the footprint quads they
 * outline, #302) and lamps. */
/**
 * How far a piece is lifted by a rug under it (#317): one whose whole footprint is on a rug stands on top of it (a
 * piece only partly on one keeps its legs on the floor); one without a footprint only with `onRug` (the lamps on the
 * bedside tables).
 */
function rugLiftFor(item, obj, toWorld) {
  if (item.type === 'rug') return 0;
  const fp = obj.userData.footprint;
  if (!fp?.length) return item.onRug ? rugUnder(item.level, item.x, item.z) : 0;
  let h = Infinity;
  for (const r of fp) for (const [lx, lz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) h = Math.min(h, rugUnder(item.level, ...toWorld(lx, lz)));
  return h;
}

export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []], footprints = [[], []];
  const lights = [], interactives = [], surfaces = [], things = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    // one mesh per material per piece (#48); the parasol folds and the beers come and go
    if (item.type !== 'parasol') {
      const keep = obj.userData.keep ?? [];
      mergeStatic(obj, keep);
    }
    const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI; // local +z = facing
    if (item.walls) keepInside(obj, item, yaw); // plants by a wall: no leaves through it (#137)
    obj.rotation.y = yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx, lz) => [item.x + c * lx + s * lz, item.z - s * lx + c * lz];
    const lift = rugLiftFor(item, obj, toWorld); // standing on a rug: on top of it, not in the pile (#317)
    const floor = LEVELS[item.level].floor + lift;
    obj.position.set(item.x, floor + obj.position.y, item.z);
    for (const r of obj.userData.surfaces ?? []) { // tables a cup can stand on (#90)
      const m = surfaceBox(r, surfaces);
      m.userData.surface += obj.position.y; // its height in the world (upstairs too, #269)
      obj.add(m);
    }
    if (obj.userData.rest) obj.userData.interact = restTarget(obj, item, floor); // sit / lie (#71/#72)
    if (obj.userData.interact) { // E targets among the furniture (the TV, seats, beds)
      obj.traverse((m) => { m.userData.door ??= obj.userData.interact; }); // drawers in a bed keep their own (#103)
      interactives.push(obj.userData.interact);
    }
    for (const t of obj.userData.targets ?? []) { t.level = item.level; interactives.push(t); } // several E targets of their own (cabinet doors, #104)
    group.add(obj);
    things.push(...(obj.userData.things ?? [])); // small things you can take (bottles, glasses, #152)
    // footprint rectangles → world-space collision segments
    for (const r of obj.userData.footprint ?? []) {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      for (let i = 0; i < 4; i++) segments[item.level].push([...pts[i], ...pts[(i + 1) % 4]]);
      footprints[item.level].push(pts);
    }
  }
  return { object: group, segments, footprints, lights, interactives, surfaces, things };
}
