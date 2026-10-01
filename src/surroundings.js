import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SURROUNDINGS as S, COLORS } from './config.js';

// The neighbourhood seen through the windows: red-brick blocks with grey gable roofs around
// the courtyard and across the street (St Lars, from Peab's drone photo and renders), trees,
// and a sky with a few clouds. Everything is merged/instanced: a handful of draw calls.

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** One storey × one window bay of brick façade with a white-framed window. */
function facadeTexture() {
  const px = 256, c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const m = px / S.bay; // px per metre
  g.fillStyle = '#cfc6b8';
  g.fillRect(0, 0, px, px);
  const rand = rng(11);
  const bw = 0.26 * m, bh = 0.075 * m;
  const base = new THREE.Color(COLORS.brick);
  for (let row = 0; row * bh < px; row++) {
    for (let x = (row % 2) * -bw / 2; x < px; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
  // window: 1.3 × 1.5 m, sill 0.8 m above the storey floor (v = 0 is the bottom of the canvas)
  const ww = 1.3 * m, wh = 1.5 * m, wx = (px - ww) / 2, wy = px - (0.8 * m + wh);
  g.fillStyle = '#f2f2ef';
  g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#5d7486');
  glass.addColorStop(1, '#2c3a45');
  g.fillStyle = glass;
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#f2f2ef';
  g.fillRect(wx + ww / 2 - 3, wy, 6, wh);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Box with façade UVs: u along the wall in bays, v in storeys from the ground. */
function block(b) {
  const h = b.storeys * S.storey;
  const geo = new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0);
  geo.translate((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, along / S.bay, p.getY(i) / S.storey);
  }
  return geo;
}

/** Gable roof along the block's long side. */
function roof(b) {
  const h = b.storeys * S.storey, alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const [a0, a1] = alongX ? [b.z0, b.z1] : [b.x0, b.x1];
  const len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
  const ridge = Math.min(4, (a1 - a0) * 0.35);
  const shape = new THREE.Shape([new THREE.Vector2(-a0 + 0.3, 0), new THREE.Vector2(-a1 - 0.3, 0), new THREE.Vector2(-(a0 + a1) / 2, ridge)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false });
  if (alongX) {
    geo.rotateY(Math.PI / 2); // (sx, sy, d) → (d, sy, −sx)
    geo.translate(b.x0 - 0.3, h, 0);
  } else {
    geo.scale(-1, 1, 1); // shape x = +x for blocks along z
    geo.translate(0, h, b.z0 - 0.3);
  }
  return geo.toNonIndexed();
}

function trees(rand) {
  const spots = [];
  for (const area of S.treeAreas) {
    for (let i = 0; i < area.n; i++) {
      const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
      spots.push({ x, z, s: 0.75 + rand() * 0.6 });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 7).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), spots.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  spots.forEach((t, i) => {
    const h = 3.2 * t.s;
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, h, t.s));
    trunk.setMatrixAt(i, m);
    q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
    m.compose(new THREE.Vector3(t.x, h + 1.6 * t.s, t.z), q, new THREE.Vector3(2.4 * t.s, 2.6 * t.s, 2.4 * t.s));
    crown.setMatrixAt(i, m);
    // mostly greens, now and then an autumn tree (the drone photo is from September)
    const autumn = rand() < 0.15;
    col.setHSL(autumn ? 0.08 + rand() * 0.04 : 0.22 + rand() * 0.08, autumn ? 0.6 : 0.4 + rand() * 0.15, 0.28 + rand() * 0.1);
    crown.setColorAt(i, col);
  });
  trunk.castShadow = crown.castShadow = true;
  return [trunk, crown];
}

/** Sky for scene.background: vertical gradient with a few soft clouds (equirectangular). */
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5f97cf');
  grad.addColorStop(1, `#${COLORS.sky.toString(16).padStart(6, '0')}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = `#${COLORS.sky.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 256, 1024, 256);
  const rand = rng(5);
  for (let i = 0; i < 26; i++) {
    const cx = rand() * 1024, cy = 120 + rand() * 120, r = 18 + rand() * 40;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * r * 2.5, y = cy + (rand() - 0.5) * r * 0.5, rr = r * (0.6 + rand() * 0.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.75)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSurroundings() {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(mergeGeometries(S.blocks.map(block)),
    new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.95 }));
  const roofs = new THREE.Mesh(mergeGeometries(S.blocks.map(roof)),
    new THREE.MeshStandardMaterial({ color: 0x51575c, roughness: 0.85, side: THREE.DoubleSide }));
  walls.receiveShadow = roofs.receiveShadow = true;
  group.add(walls, roofs, ...trees(rng(3)));
  return group;
}
