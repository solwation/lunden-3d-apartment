import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SILL_PLANTS as S } from './config.js';

// Flower pots on every inner window board (#136): two or three per window, terracotta or white ceramic, each
// with a plant from S.kinds (pelargonium, orchid, cactus, basil, ivy, African violet). Leaves and flowers
// carry vertex colours, so the whole lot is five meshes (pots ×2, soil, leaves, flowers). Seeded random, so
// every visit shows the same sills. A loose item: F hides it.

const mats = {
  terracotta: new THREE.MeshStandardMaterial({ color: 0xb8643f, roughness: 0.9 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }),
  flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
};

const tint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
};
const strip = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; };

/** One plant at (x, y top of the soil, z): pushes tinted geometries into out.leaf / out.flower. */
function plant(kind, x, y, z, R, out) {
  const leaf = (geo, hex) => out.leaf.push(tint(geo, hex));
  const flower = (geo, hex) => out.flower.push(tint(geo, hex));
  const blob = (r, sx, sy, sz, px, py, pz) => new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(px, py, pz);
  if (kind === 'pelargon') {
    for (let i = 0; i < 9; i++) { const a = R() * 6.3, d = 0.02 + R() * 0.05; leaf(blob(0.035, 1, 0.5, 1, x + Math.cos(a) * d, y + 0.04 + R() * 0.07, z + Math.sin(a) * d), 0x3f7a35); }
    for (let i = 0; i < 4; i++) {
      const a = R() * 6.3, d = R() * 0.05, fy = y + 0.14 + R() * 0.06, fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
      leaf(new THREE.CylinderGeometry(0.003, 0.003, fy - y, 4).translate(fx, (y + fy) / 2, fz), 0x4f7d34);
      for (let k = 0; k < 6; k++) flower(blob(0.013, 1, 0.8, 1, fx + (R() - 0.5) * 0.03, fy + (R() - 0.5) * 0.02, fz + (R() - 0.5) * 0.03), S.colors.pelargon);
    }
  } else if (kind === 'orchid') {
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + R() * 0.4; leaf(new THREE.SphereGeometry(0.06, 8, 4).scale(1, 0.12, 0.38).rotateY(a).translate(x + Math.cos(a) * 0.045, y + 0.015, z - Math.sin(a) * 0.045), 0x2f6a2c); }
    const top = new THREE.Vector3(x + 0.05, y + 0.32, z);
    leaf(new THREE.CylinderGeometry(0.0025, 0.003, 0.32, 4).translate(0, 0.16, 0).rotateZ(-0.15).translate(x, y, z), 0x5a6b3a);
    for (let k = 0; k < 6; k++) {
      const p = top.clone().add(new THREE.Vector3(0.012 * k, -0.025 * k + 0.01, (k % 2 - 0.5) * 0.02));
      flower(new THREE.CircleGeometry(0.022, 5).rotateY(Math.PI / 2 + (R() - 0.5) * 0.6).translate(p.x, p.y, p.z), S.colors.orchid[k % 2]);
    }
  } else if (kind === 'cactus') {
    leaf(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 8).translate(x, y + 0.06, z), 0x4c7a3a);
    leaf(new THREE.SphereGeometry(0.03, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y + 0.12, z), 0x4c7a3a);
    leaf(new THREE.CylinderGeometry(0.014, 0.016, 0.05, 6).rotateZ(0.9).translate(x + 0.035, y + 0.07, z), 0x4c7a3a);
    flower(blob(0.014, 1, 0.6, 1, x, y + 0.155, z), S.colors.cactus);
  } else if (kind === 'basil') {
    for (let i = 0; i < 26; i++) { const a = R() * 6.3, d = R() * 0.05; leaf(new THREE.SphereGeometry(0.022, 6, 3).scale(1, 0.25, 0.6).rotateY(a).rotateZ((R() - 0.5) * 0.8).translate(x + Math.cos(a) * d, y + 0.03 + R() * 0.12, z + Math.sin(a) * d), i % 3 ? 0x5fa040 : 0x77b84f); }
  } else if (kind === 'ivy') {
    for (let s = 0; s < 4; s++) { // strands trailing over the rim and down the front of the pot
      const a = s * 1.57 + R() * 0.5;
      for (let k = 0; k < 7; k++) {
        const r = 0.03 + k * 0.012, drop = k > 3 ? (k - 3) * 0.035 : -k * 0.01;
        leaf(new THREE.CircleGeometry(0.016, 5).rotateX(-0.6).rotateY(a + R()).translate(x + Math.cos(a) * r, y + 0.02 - drop, z + Math.sin(a) * r), k % 2 ? 0x2d5f2a : 0x3f7a35);
      }
    }
  } else { // African violet: a flat rosette and a posy of purple flowers
    for (let i = 0; i < 8; i++) { const a = i * 0.8; leaf(new THREE.SphereGeometry(0.03, 8, 3).scale(1, 0.2, 0.7).rotateY(a).translate(x + Math.cos(a) * 0.035, y + 0.02, z - Math.sin(a) * 0.035), 0x2b5226); }
    for (let k = 0; k < 7; k++) flower(blob(0.012, 1, 0.5, 1, x + (R() - 0.5) * 0.04, y + 0.06 + R() * 0.02, z + (R() - 0.5) * 0.04), S.colors.violet);
  }
}

/** sills: [{ x0, x1, z0, z1, y, room? }] (the inner window boards, plan metres; y = top of the board). */
export function buildSillPlants(sills) {
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = { terracotta: [], ceramic: [], soil: [], leaf: [], flower: [] };
  sills.forEach((s, i) => {
    const L = s.x1 - s.x0, n = L >= 1.5 ? 3 : 2, zc = (s.z0 + s.z1) / 2;
    const kinds = S.byWindow[i] ?? S.kinds;
    for (let k = 0; k < n; k++) {
      const x = s.x0 + (L * (k + 0.5)) / n + (R() - 0.5) * 0.1, kind = kinds[(k + i) % kinds.length];
      const r = 0.05 + R() * 0.02, h = 0.09 + R() * 0.04, mat = (k + i) % 2 ? 'ceramic' : 'terracotta';
      if (S.skip?.some(([si, sk]) => si === i && sk === k)) continue; // something else stands there (after the random draws: the others stay put)
      out[mat].push(strip(new THREE.CylinderGeometry(r, r * 0.78, h, 16).translate(x, s.y + h / 2, zc)));
      out[mat].push(strip(new THREE.TorusGeometry(r - 0.004, 0.006, 5, 16).rotateX(Math.PI / 2).translate(x, s.y + h, zc)));
      out.soil.push(strip(new THREE.CircleGeometry(r - 0.008, 12).rotateX(-Math.PI / 2).translate(x, s.y + h - 0.015, zc)));
      plant(kind, x, s.y + h - 0.015, zc, R, out);
    }
  });
  const g = new THREE.Group();
  for (const [k, list] of Object.entries(out)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
