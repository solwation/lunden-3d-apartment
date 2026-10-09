import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE } from './config.js';

// Street name signs at the junctions and bends (#583, SITE.streetSigns): a pole with one blue blade per leg, the street's
// name and, where sources give them, the house numbers that lie that way with an arrow. Cheap by design: every blade face
// samples one shared canvas atlas (one slot per distinct text + arrow side) and all faces are one mesh, the poles and the
// blades' aluminium edges another — two draw calls for every sign, no lights, no shadows cast.

const S = SITE.streetSigns;

/** The atlas slot's key: a blade with numbers needs the arrow pointing right on one face and left on the other. */
const slotKey = (b, right) => (b.nums ? `${b.name}|${b.nums}|${right ? 'R' : 'L'}` : b.name);

/** One blade face into the slot at (x, y, w, h): blue, a white border, the name; the numbers and an arrow in a field at
 * the end the arrow points to (Swedish street name sign, look *guess*). */
function drawBlade(g, x, y, w, h, b, right) {
  const font = (px) => S.font.replace('%', String(Math.round(px)));
  g.save();
  g.translate(x, y);
  g.fillStyle = S.colors.bg; g.fillRect(0, 0, w, h);
  const m = h * 0.07, line = Math.max(2, h * 0.045);
  g.strokeStyle = S.colors.fg; g.lineWidth = line;
  g.beginPath(); if (g.roundRect) g.roundRect(m, m, w - 2 * m, h - 2 * m, h * 0.1); else g.rect(m, m, w - 2 * m, h - 2 * m); g.stroke();
  g.fillStyle = S.colors.fg; g.textBaseline = 'middle';
  let x0 = m * 2, x1 = w - m * 2;
  if (b.nums) {
    // the number field: the numbers over a small arrow, divided from the name by a white bar
    const fw = h * 1.35, fx = right ? x1 - fw : x0;
    g.fillRect(right ? fx - line : fx + fw, m, line, h - 2 * m);
    g.font = font(h * 0.36); g.textAlign = 'center';
    g.fillText(b.nums, fx + fw / 2, h * 0.38, fw - m);
    // the arrow: a shaft and a head, pointing right or left
    const ay = h * 0.7, half = fw * 0.25, ah = h * 0.09, cx = fx + fw / 2, sgn = right ? 1 : -1, tip = cx + sgn * half, base = tip - sgn * ah * 1.6;
    g.fillRect(Math.min(cx - sgn * half, base), ay - line / 2, Math.abs(base - (cx - sgn * half)), line);
    g.beginPath(); g.moveTo(tip, ay); g.lineTo(base, ay - ah); g.lineTo(base, ay + ah); g.fill();
    if (right) x1 = fx - line * 2; else x0 = fx + fw + line * 2;
  }
  // the name, squeezed sideways if it is too long for what is left
  g.font = font(h * 0.5); g.textAlign = 'left';
  const room = x1 - x0 - m, tw = g.measureText(b.name).width, k = Math.min(1, room / tw);
  g.translate(x0 + m / 2 + (room - tw * k) / 2, h * 0.53); g.scale(k, 1);
  g.fillText(b.name, 0, 0);
  g.restore();
}

/** For a face whose outward normal is (nx, nz): the viewer's right along the ground. */
const rightOf = (nx, nz) => [nz, -nx];

/** A blade along its leg's direction `u`, mounted beside the post (its middle just off the pole, on the right of `u` as in roads.js). */
function bladeAt(x, z, b) {
  const l = Math.hypot(...b.dir), u = [b.dir[0] / l, b.dir[1] / l], off = S.post.r + S.blade.d / 2 + 0.01;
  return { u, bx: x - u[1] * off, bz: z + u[0] * off };
}

export function buildStreetSigns(groundY) {
  const group = new THREE.Group();
  group.name = 'streetSigns';
  const P = S.post, B = S.blade;
  // which slots are needed (one per distinct face text), then the atlas
  const faces = [];
  for (const sign of S.signs) {
    const [x, z] = sign.at, y0 = groundY(x, z);
    sign.blades.forEach((b, i) => {
      const { u, bx, bz } = bladeAt(x, z, b), cy = y0 + B.top - B.h / 2 - i * (B.h + B.gap);
      for (const side of [1, -1]) {
        const n = [-u[1] * side, u[0] * side], r = rightOf(...n);
        faces.push({ x: bx, z: bz, cy, u, n, r, key: slotKey(b, r[0] * u[0] + r[1] * u[1] > 0), blade: b });
      }
    });
  }
  const keys = [...new Set(faces.map((f) => f.key))];
  const A = S.atlas, rows = Math.ceil(keys.length / A.cols), sw = A.w / A.cols, sh = Math.min(Math.floor(A.h / rows), Math.round((sw * B.h) / B.w));
  const canvas = document.createElement('canvas'); canvas.width = A.w; canvas.height = rows * sh;
  const g = canvas.getContext('2d');
  const slots = new Map();
  keys.forEach((k, i) => {
    const sx = (i % A.cols) * sw, sy = Math.floor(i / A.cols) * sh, f = faces.find((ff) => ff.key === k);
    drawBlade(g, sx, sy, sw, sh, f.blade, k.endsWith('|R'));
    const W = canvas.width, H = canvas.height, e = 0.5; // half a texel inside the slot: no bleeding from the neighbour
    slots.set(k, [(sx + e) / W, (sx + sw - e) / W, 1 - (sy + sh - e) / H, 1 - (sy + e) / H]);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the faces: two quads per blade, a hair outside the edge box
  const pos = [], nor = [], uv = [];
  for (const f of faces) {
    const [u0, u1, v0, v1] = slots.get(f.key), hw = B.w / 2, hh = B.h / 2, o = B.d / 2 + 0.002;
    const c = [f.x + f.n[0] * o, f.cy, f.z + f.n[1] * o];
    const at = (s, t) => [c[0] + f.r[0] * s * hw, c[1] + t * hh, c[2] + f.r[1] * s * hw];
    const q = [[at(-1, -1), u0, v0], [at(1, -1), u1, v0], [at(1, 1), u1, v1], [at(-1, -1), u0, v0], [at(1, 1), u1, v1], [at(-1, 1), u0, v1]];
    for (const [p, uu, vv] of q) { pos.push(...p); nor.push(f.n[0], 0, f.n[1]); uv.push(uu, vv); }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const blades = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 }));
  blades.name = 'streetSignBlades';
  blades.receiveShadow = true;
  // the poles (capped) and each blade's thin aluminium body behind its faces
  const metal = [];
  const keep = (geo) => { geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('uv'); return geo; };
  for (const sign of S.signs) {
    const [x, z] = sign.at, y0 = groundY(x, z), h = P.h + P.sink;
    metal.push(keep(new THREE.CylinderGeometry(P.r, P.r, h, 8).translate(x, y0 - P.sink + h / 2, z)));
    metal.push(keep(new THREE.SphereGeometry(P.r * 1.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y0 + P.h, z)));
    sign.blades.forEach((b, i) => {
      const { u, bx, bz } = bladeAt(x, z, b), cy = y0 + B.top - B.h / 2 - i * (B.h + B.gap);
      metal.push(keep(new THREE.BoxGeometry(B.w, B.h, B.d).rotateY(Math.atan2(-u[1], u[0])).translate(bx, cy, bz)));
    });
  }
  const poles = new THREE.Mesh(mergeGeometries(metal), new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.45, metalness: 0.5 }));
  poles.name = 'streetSignPoles';
  poles.receiveShadow = true;
  group.add(poles, blades);
  group.userData.slots = keys; // for tools/streetsigntest.html
  return group;
}
