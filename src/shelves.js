import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_SHELVES as S } from './config.js';

// Two wall shelves in the kitchen with small things on them: framed portraits, flowers in a vase and
// a pot, books, candlesticks and a bowl. Three draw calls: oak + brackets (vertex colours), the
// portraits (one canvas atlas) and all the small things (vertex colours); the vase of flowers and the pot plant are
// one mesh each, so they can be taken (#185, `userData.plants`).

const PORTRAITS = [ // background, skin, hair, top: three little painted people
  { bg: '#c9d8e0', skin: '#e8c4a8', hair: '#5a3a22', top: '#7b3b3b' },
  { bg: '#efe0c2', skin: '#d9a98a', hair: '#e2c06a', top: '#3d5f7a' },
  { bg: '#d9e4cf', skin: '#f0d0b8', hair: '#2b2622', top: '#c58a3a' },
];

function portraitAtlas() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 160;
  const g = c.getContext('2d');
  PORTRAITS.forEach((p, i) => {
    const x0 = i * 128, cx = x0 + 64;
    g.fillStyle = p.bg; g.fillRect(x0, 0, 128, 160);
    g.fillStyle = p.top; // shoulders
    g.beginPath(); g.ellipse(cx, 160, 52, 44, 0, Math.PI, 0); g.fill();
    g.fillStyle = p.skin; // neck + face
    g.fillRect(cx - 9, 92, 18, 26);
    g.beginPath(); g.ellipse(cx, 76, 24, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = p.hair;
    g.beginPath(); g.ellipse(cx, 62, 27, 22, 0, Math.PI, 0); g.fill();
    if (i === 1) { g.beginPath(); g.ellipse(cx - 24, 84, 8, 26, 0, 0, Math.PI * 2); g.ellipse(cx + 24, 84, 8, 26, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#3a2a22'; // eyes, smile
    g.beginPath(); g.arc(cx - 9, 76, 2.5, 0, 7); g.arc(cx + 9, 76, 2.5, 0, 7); g.fill();
    g.strokeStyle = '#a2584e'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, 86, 8, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Give a geometry one vertex colour (non-indexed, so everything merges). */
function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const col = new THREE.Color(hex), n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);

/**
 * Builds the shelves. Local frame: x out of the wall (the wall face is at S.x), y up, z along the
 * wall — so the plan coordinates can be used directly.
 */
export function buildWallShelves() {
  const group = new THREE.Group();
  const wood = [], things = [], pics = [];
  const x0 = S.x, mid = (S.z0 + S.z1) / 2;
  const put = (list, geo, hex, x, y, z) => list.push(tint(geo.translate(x, y, z), hex));

  for (const y of S.heights) {
    put(wood, box(S.depth, S.thick, S.z1 - S.z0), S.wood, x0 + S.depth / 2, y - S.thick / 2, mid);
    for (const z of [S.z0 + 0.12, S.z1 - 0.12]) { // L brackets
      put(wood, box(0.012, 0.14, 0.02), S.bracket, x0 + 0.006, y - S.thick - 0.07, z);
      put(wood, box(S.depth * 0.8, 0.012, 0.02), S.bracket, x0 + S.depth * 0.4, y - S.thick - 0.006, z);
    }
  }
  const [y1, y2] = S.heights;
  const xc = x0 + S.depth / 2;

  // a framed portrait leaning against the wall: atlas slot i, w × h
  const portrait = (i, w, h, y, z, frameHex) => {
    const lean = 0.12, xb = x0 + 0.06;
    const frame = tint(box(0.015, h, w), frameHex);
    frame.translate(0, h / 2, 0).rotateZ(lean).translate(xb, y, z);
    things.push(frame);
    const pic = new THREE.PlaneGeometry(w - 0.04, h - 0.04);
    pic.rotateY(Math.PI / 2); // facing +x
    const uv = pic.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / PORTRAITS.length);
    pic.translate(0.009, h / 2, 0).rotateZ(lean).translate(xb, y, z);
    pics.push(pic);
  };

  // lower shelf: books, a vase with flowers, a portrait, a bowl
  [[0.03, 0.23, 0x7b3b3b], [0.025, 0.21, 0x3d5f7a], [0.035, 0.24, 0xc9b27c], [0.028, 0.2, 0x4f6b4a], [0.03, 0.22, 0x2b2b30]]
    .reduce((z, [t, h, c]) => { put(things, box(0.15, h, t), c, x0 + 0.09, y1 + h / 2, z + t / 2); return z + t + 0.003; }, S.z0 + 0.04);
  const vase = [], pot = []; // the vase of flowers and the pot plant can be taken (#185): their own meshes
  const flowers = (z, y, vaseHex, heads) => {
    put(vase, cyl(0.035, 0.03, 0.12), vaseHex, xc, y + 0.06, z);
    heads.forEach(([dx, dz, h, c]) => {
      const stem = cyl(0.003, 0.003, h, 5);
      stem.rotateZ(-dx * 4).rotateX(dz * 4);
      put(vase, stem, 0x4f7a3a, xc + dx / 2, y + 0.1 + h / 2, z + dz / 2);
      put(vase, new THREE.IcosahedronGeometry(0.018, 0), c, xc + dx, y + 0.1 + h, z + dz);
    });
  };
  flowers(0.98, y1, 0xf2f0ea, [[0, 0, 0.13, 0xe86a92], [0.025, 0.02, 0.11, 0xf2d04a], [-0.02, -0.02, 0.12, 0xffffff], [0.01, -0.03, 0.1, 0xe86a92]]);
  portrait(0, 0.18, 0.24, y1, 1.22, 0x1f1f1f);
  put(things, cyl(0.07, 0.04, 0.045, 16), 0x6f8f9a, xc, y1 + 0.0225, 1.45); // bowl
  // upper shelf: a portrait, candlesticks, a small portrait, a pot plant
  portrait(1, 0.2, 0.26, y2, S.z0 + 0.15, 0xb98d5c);
  for (const [z, h] of [[0.9, 0.11], [0.98, 0.15]]) {
    put(things, cyl(0.022, 0.03, 0.02), 0xc8a24a, xc, y2 + 0.01, z);
    put(things, cyl(0.012, 0.012, h - 0.02, 8), 0xc8a24a, xc, y2 + (h - 0.02) / 2 + 0.02, z);
    put(things, cyl(0.01, 0.01, 0.12, 8), 0xf6f1e4, xc, y2 + h + 0.06, z);
  }
  portrait(2, 0.13, 0.18, y2, 1.2, 0xf2f0ea);
  put(pot, cyl(0.045, 0.035, 0.08), 0xb8643e, xc, y2 + 0.04, 1.44); // terracotta pot
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const leaf = new THREE.SphereGeometry(0.03, 6, 4).scale(1, 0.5, 1.6);
    leaf.rotateY(a).rotateX(0.5);
    put(pot, leaf, 0x4f8a3e, xc + Math.cos(a) * 0.03, y2 + 0.1 + (k % 2) * 0.02, 1.44 + Math.sin(a) * 0.03);
  }

  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const add = (geos, mat) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wood, vc);
  add(things, vc);
  add(pics, new THREE.MeshStandardMaterial({ map: portraitAtlas(), roughness: 0.8 }));
  // the two plants: one mesh each, the origin at its bottom (plants.js makes them Holdables)
  group.userData.plants = [[vase, 0.98, y1], [pot, 1.44, y2]].map(([geos, z, y]) => {
    const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))).translate(-xc, -y, -z), vc);
    m.position.set(xc, y, z);
    m.castShadow = true;
    group.add(m);
    return { model: m, kind: 'plant', back: 'hyllan' };
  });
  return group;
}
