import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FROZEN_MEALS as F } from './config.js';

// #1209 (part of #1206): Billys Pan Pizza and Gorby's pirogs for the life simulator (lifemodels.js builders). The boxes'
// prints are our own canvas drawings in the brands' colours; the pieces are plain shapes under a clear film while wrapped.
// Origins at the bottom centre, long side along x (the lifemodels.js convention).

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
const once = {};
const lazy = (k, make) => (once[k] ??= make());
const film = () => lazy('film', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.32, depthWrite: false }));
const cardboard = () => lazy('cardboard', () => std(0xb89a72, 0.85));

/** A canvas material: draw(g, w, h) paints it. */
function canvasMat(w, h, draw, roughness = 0.55) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness });
}
function word(g, text, x, y, px, fill, { font = 'bold italic', stroke = null, lw = 0 } = {}) {
  g.font = `${font} ${px}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, x, y); }
  g.fillStyle = fill; g.fillText(text, x, y);
}
/** A pizza top seen from above: tomato, melted cheese, ham and a golden edge. */
function pizzaTop(g, x, y, w, h) {
  g.fillStyle = '#c98b45'; g.fillRect(x, y, w, h);
  g.fillStyle = '#c4452a'; g.fillRect(x + w * 0.07, y + h * 0.07, w * 0.86, h * 0.86);
  for (let k = 0; k < 26; k++) { // cheese blobs and ham (a fixed pattern)
    const u = ((k * 37) % 100) / 100, v = ((k * 61) % 100) / 100;
    g.fillStyle = k % 3 ? '#f2cf62' : '#e48a86';
    g.beginPath(); g.ellipse(x + w * (0.12 + 0.76 * u), y + h * (0.12 + 0.76 * v), w * (k % 3 ? 0.07 : 0.04), h * (k % 3 ? 0.05 : 0.04), k, 0, Math.PI * 2); g.fill();
  }
}
const PRINT = {
  billys: (g, w, h) => { // red box, a yellow wordmark, the pizza in a window
    g.fillStyle = '#d4151c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd200'; g.fillRect(0, h * 0.8, w, h * 0.2);
    pizzaTop(g, w * 0.5, h * 0.36, w * 0.44, h * 0.4);
    word(g, 'Billys', w * 0.27, h * 0.2, h * 0.17, '#ffd200', { stroke: '#7a0a0e', lw: 6 });
    word(g, 'PAN PIZZA', w * 0.26, h * 0.42, h * 0.075, '#ffffff', { font: 'bold' });
    word(g, 'Original', w * 0.26, h * 0.58, h * 0.07, '#ffffff', { font: 'italic' });
    word(g, 'Djupfryst · 3 st', w * 0.5, h * 0.9, h * 0.075, '#7a0a0e', { font: 'bold' });
  },
  gorbys: (g, w, h) => { // blue box, a yellow wordmark, two pirogs
    g.fillStyle = '#123e8f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd400'; g.fillRect(0, h * 0.78, w, h * 0.22);
    for (const [cx, cy] of [[0.7, 0.45], [0.8, 0.62]]) {
      g.fillStyle = '#d39a52'; g.beginPath(); g.ellipse(w * cx, h * cy, w * 0.17, h * 0.1, -0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8b56e'; g.beginPath(); g.ellipse(w * cx - w * 0.02, h * cy - h * 0.025, w * 0.11, h * 0.045, -0.2, 0, Math.PI * 2); g.fill();
    }
    word(g, "Gorby's", w * 0.3, h * 0.22, h * 0.16, '#ffd400', { stroke: '#071e4a', lw: 6 });
    word(g, 'PIROGER', w * 0.3, h * 0.43, h * 0.085, '#ffffff', { font: 'bold' });
    word(g, 'Kött & Ris', w * 0.3, h * 0.58, h * 0.07, '#ffffff', { font: 'italic' });
    word(g, 'Djupfryst · 4 st', w * 0.5, h * 0.89, h * 0.08, '#123e8f', { font: 'bold' });
  },
};
const SIDE = { billys: 0xd4151c, gorbys: 0x123e8f };
// the lid's print near its own proportions; the front a wider strip of the same design
const printMat = (k, face = 'top') => lazy(`print-${k}-${face}`, () => canvasMat(512, Math.round(512 * (face === 'top' ? F[k].box[0] : F[k].box[1]) / F[k].box[2]), PRINT[k]));
const sideMat = (k) => lazy(`side-${k}`, () => std(SIDE[k], 0.6));

/** A carton printed on its top and front (one draw per material); open, its lid stands up at the back and the wrapped
 * pieces left show inside. */
function box(kind, pieceBuilder) {
  return (def) => {
    const P = F[kind], [L, H, W] = P.box, n = def.amount ?? P.count, g = new THREE.Group();
    const side = sideMat(kind), print = printMat(kind), frontPrint = printMat(kind, 'front'), inner = cardboard();
    // the body: an open-top tray (bottom + four walls merged into one mesh), its print a plane on the −x end: in a store
    // slot (yaw −90°) that end faces the open door
    const t = 0.003, walls = [[L, t, W, 0, t / 2, 0], [t, H, W, -L / 2 + t / 2, H / 2, 0], [t, H, W, L / 2 - t / 2, H / 2, 0], [L, H, t, 0, H / 2, -W / 2 + t / 2], [L, H, t, 0, H / 2, W / 2 - t / 2]];
    g.add(mesh(mergeGeometries(walls.map(([x, y, z, px, py, pz]) => new THREE.BoxGeometry(x, y, z).translate(px, py, pz))), side));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(-Math.PI / 2), frontPrint); front.position.set(-L / 2 - 0.0004, H / 2, 0); g.add(front);
    // the lid, hinged along the far (+x) edge: cardboard, its print a plane on top (read from the −x end)
    const hinge = new THREE.Group(); hinge.position.set(L / 2, H, 0); g.add(hinge);
    const lid = mesh(new THREE.BoxGeometry(L, t, W), inner); lid.position.set(-L / 2, t / 2, 0); hinge.add(lid);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), print); top.position.set(-L / 2, t + 0.0004, 0); hinge.add(top);
    // the wrapped pieces inside (stacked in layers along y; the gorbys two by two across z)
    const pieces = [], [pl, ph, pw] = P.piece, across = Math.max(1, Math.floor((W - 0.01) / pw));
    for (let i = 0; i < n; i++) {
      const p = pieceBuilder({ amount: 1 }, true).object, layer = Math.floor(i / across), col = i % across;
      p.position.set(0, t + layer * (ph + 2 * P.film), across > 1 ? (col - (across - 1) / 2) * (pw + 0.004) : 0);
      g.add(p); pieces.push(p);
    }
    return { object: g, grip: [0, H / 2, 0], show(item) {
      const open = item.pkg !== 'closed';
      hinge.rotation.z = open ? -1.9 : 0;
      pieces.forEach((p, i) => { p.visible = open && i < item.amount; });
    } };
  };
}

/** One piece: the baked shape (frosty pale while frozen, `machine.cooked` = heated), a clear film while wrapped
 * (pkg closed); bitten from the +x end. `still` = a box's static stand-in (always wrapped). */
function piece(kind, shape) {
  return (def, still = false) => {
    const P = F[kind], [L, H, W] = P.piece, g = new THREE.Group(), body = new THREE.Group();
    const crust = std(P.crust, 0.7), parts = shape(L, H, W, crust);
    for (const p of parts) body.add(p);
    const wrap = mesh(new RoundedBoxGeometry(L + 2 * P.film, H + 2 * P.film, W + 2 * P.film, 2, 0.006), film());
    wrap.castShadow = false; wrap.position.y = H / 2 + P.film; body.position.y = P.film;
    g.add(body, wrap);
    const baked = new THREE.Color(P.crust), frost = new THREE.Color(0xf4f7fa);
    const tops = parts.filter((p) => p.material !== crust).map((p) => p.material);
    const look = (item) => {
      const cold = !item.machine?.cooked ? F.frost : 0;
      crust.color.copy(baked).lerp(frost, cold);
      for (const m of tops) m.color.setScalar(1).lerp(frost, cold * 0.6);
      wrap.visible = item.pkg === 'closed';
      const k = Math.max(0.15, item.amount / (def.amount ?? 1));
      body.scale.x = k; body.position.x = -(1 - k) * L / 2;
    };
    if (still) look({ pkg: 'closed', amount: 1, machine: {} });
    return { object: g, grip: [-L * 0.3, H / 2, 0], show: look };
  };
}

const pizzaTopMat = () => canvasMat(128, 128, (g, w, h) => pizzaTop(g, 0, 0, w, h), 0.6);
const billysShape = (L, H, W, crust) => {
  const base = mesh(new RoundedBoxGeometry(L, H, W, 2, 0.008), crust); base.position.y = H / 2;
  const top = mesh(new THREE.PlaneGeometry(L - 0.012, W - 0.012).rotateX(-Math.PI / 2), lazy('pizzaTop', pizzaTopMat).clone());
  top.position.y = H + 0.0006; top.castShadow = false;
  return [base, top];
};
const pirogShape = (L, H, W, crust) => { // a rounded loaf: a capsule squashed flat
  const geo = new THREE.CapsuleGeometry(W / 2, L - W, 4, 12).rotateZ(Math.PI / 2).scale(1, H / W, 1);
  const m = mesh(geo, crust); m.position.y = H / 2;
  return [m];
};

const billys = piece('billys', billysShape), pirog = piece('gorbys', pirogShape);
export const FROZEN_MEAL_BUILDERS = { billysBox: box('billys', billys), billys, gorbysBox: box('gorbys', pirog), pirog };
