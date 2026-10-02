import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON } from './config.js';
import { pavingTexture } from './patio.js';
import { registerSnow } from './seasons.js';

// Life on the street (#113, SITE.life): the car park with parked cars (instanced: a body with a colour per car,
// the glass/black parts, the wheels — three draw calls), its white stall lines, bikes by Hus L's entrances and in
// racks on the square in front of Hus C (two draw calls), the square's paving, corten beds and sitting steps.
// Returns { object, segments } (the parked cars block the way).

const L = SITE.life;
const keep = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; };
const merge = (geos) => mergeGeometries(geos.map(keep));
const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const flat = (x0, x1, z0, z1, y) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** One car, facing +x: [body, glass + trim, wheels] geometries. */
function carGeometry() {
  const body = merge([box(4.3, 0.62, 1.8, 0, 0.62, 0), box(2.3, 0.08, 1.56, -0.25, 1.4, 0)]);
  const glass = merge([box(2.2, 0.46, 1.6, -0.25, 1.16, 0), box(4.32, 0.1, 1.82, 0, 0.36, 0)]);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14).rotateX(Math.PI / 2);
  const wheels = merge([[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]].map(([x, z]) => wheel.clone().translate(x, 0.33, z)));
  return [body, glass, wheels];
}

/** One bike along +x: [frame, tyres]. */
export function bikeGeometry() {
  const tube = (ax, ay, bx, by) => { const l = Math.hypot(bx - ax, by - ay); return new THREE.CylinderGeometry(0.015, 0.015, l, 5).rotateZ(Math.atan2(ax - bx, by - ay)).translate((ax + bx) / 2, (ay + by) / 2, 0); };
  const frame = merge([tube(-0.5, 0.34, -0.05, 0.36), tube(-0.05, 0.36, 0.42, 0.34), tube(-0.05, 0.36, -0.12, 0.72), tube(-0.12, 0.72, 0.36, 0.78), tube(0.36, 0.78, 0.42, 0.34),
    tube(-0.5, 0.34, -0.12, 0.72), tube(0.36, 0.78, 0.33, 0.98), box(0.04, 0.02, 0.48, 0.33, 0.98, 0), box(0.22, 0.04, 0.08, -0.14, 0.76, 0)]);
  const tyres = merge([new THREE.TorusGeometry(0.33, 0.022, 6, 20).translate(-0.5, 0.34, 0), new THREE.TorusGeometry(0.33, 0.022, 6, 20).translate(0.42, 0.34, 0)]);
  return [frame, tyres];
}

function instanced(geo, material, mats, colors) {
  const m = new THREE.InstancedMesh(geo, material, mats.length);
  mats.forEach((x, i) => { m.setMatrixAt(i, x); if (colors) m.setColorAt(i, new THREE.Color(colors[i])); });
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildStreetLife() {
  const group = new THREE.Group(), segments = [], R = rng(17);
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 });
  // the car park: two rows of stalls facing the aisle in the middle, cars nose in
  const lot = L.lot, lines = [], cars = [], carColors = [];
  const rows = [{ z0: lot.z0, z1: lot.z0 + lot.depth, yaw: -Math.PI / 2 }, { z0: lot.z1 - lot.depth, z1: lot.z1, yaw: Math.PI / 2 }];
  for (const row of rows) {
    for (let x = lot.x0; x <= lot.x1 + 1e-6; x += lot.stall) lines.push(flat(x - 0.06, x + 0.06, row.z0, row.z1, 0.02));
    for (let x = lot.x0; x + lot.stall <= lot.x1 + 1e-6; x += lot.stall) {
      if (R() > L.fill) continue;
      const cx = x + lot.stall / 2, cz = (row.z0 + row.z1) / 2 + (R() - 0.5) * 0.3;
      const yaw = row.yaw + (R() - 0.5) * 0.06 + (R() < 0.2 ? Math.PI : 0); // a few reversed in
      cars.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
      carColors.push(L.carColors[Math.floor(R() * L.carColors.length)]);
      const hx = 0.92, hz = 2.17; // footprint (turned 90°: across x)
      const c = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
      c.forEach((p, i) => segments.push([...p, ...c[(i + 1) % 4]]));
    }
  }
  group.add(new THREE.Mesh(merge(lines), white));
  const [body, glass, wheels] = carGeometry();
  group.add(instanced(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.35 }), cars, carColors),
    instanced(glass, new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.15, metalness: 0.4 }), cars),
    instanced(wheels, new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7 }), cars));
  // the square in front of Hus C: light stone paving, corten beds with shrubs, sitting steps
  const sq = L.square, tex = pavingTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const pg = flat(sq.x0, sq.x1, sq.z0, sq.z1, 0.012), uv = pg.attributes.uv; // uv in metres / the texture's width
  const tw = 2.4;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (sq.x1 - sq.x0) / tw, uv.getY(i) * (sq.z1 - sq.z0) / tw);
  const paveMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, color: 0xf3efe6 });
  const pave = new THREE.Mesh(pg, paveMat); pave.receiveShadow = true;
  registerSnow(paveMat, SEASON.snow.paving);
  group.add(pave);
  const corten = [], soil = [], shrubs = [];
  for (const [x0, x1, z0, z1] of L.beds) {
    const t = 0.03, h = 0.45, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    corten.push(box(x1 - x0, h, t, cx, h / 2, z0 + t / 2), box(x1 - x0, h, t, cx, h / 2, z1 - t / 2), box(t, h, z1 - z0, x0 + t / 2, h / 2, cz), box(t, h, z1 - z0, x1 - t / 2, h / 2, cz));
    soil.push(box(x1 - x0 - 2 * t, 0.02, z1 - z0 - 2 * t, cx, h - 0.04, cz));
    for (let k = 0; k < (x1 - x0) * (z1 - z0) * 0.9; k++) shrubs.push(new THREE.IcosahedronGeometry(0.25 + R() * 0.25, 0).scale(1, 0.8, 1).translate(x0 + 0.3 + R() * (x1 - x0 - 0.6), h + 0.15, z0 + 0.3 + R() * (z1 - z0 - 0.6)));
    const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    c.forEach((p, i) => segments.push([...p, ...c[(i + 1) % 4]]));
  }
  group.add(new THREE.Mesh(merge(corten), new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: 0.9, metalness: 0.2 })),
    new THREE.Mesh(merge(soil), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 })));
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 0.9, flatShading: true });
  group.add(new THREE.Mesh(merge(shrubs), shrubMat));
  const st = L.steps, steps = [];
  for (let i = 0; i < st.n; i++) steps.push(box(st.x1 - st.x0, st.rise * (i + 1), st.tread, (st.x0 + st.x1) / 2, st.rise * (i + 1) / 2, st.z0 + (st.n - 1 - i) * st.tread + st.tread / 2));
  group.add(new THREE.Mesh(merge(steps), new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.85 })));
  // bikes: leaning by the entrances (along the façade), and in the racks on the square (side by side)
  const bikes = [], bikeColors = [], cols = [0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0xe2e2dc, 0x3c7a4a, 0x8a8f96, 0xd8a020];
  const put = (x, z, yaw, lean) => { bikes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1))); bikeColors.push(cols[Math.floor(R() * cols.length)]); };
  for (const [x, z] of L.bikes) put(x, z, (R() - 0.5) * 0.1, -0.12);
  const rack = [];
  for (const [x0, z, n] of L.racks) {
    rack.push(box(n * 0.7, 0.04, 0.04, x0 + n * 0.35, 0.3, z));
    for (let k = 0; k < n; k++) { rack.push(box(0.04, 0.6, 0.5, x0 + 0.35 + k * 0.7, 0.3, z)); if (R() < 0.7) put(x0 + 0.35 + k * 0.7, z, Math.PI / 2 + (R() - 0.5) * 0.1, 0); }
  }
  group.add(new THREE.Mesh(merge(rack), new THREE.MeshStandardMaterial({ color: 0x6f7377, roughness: 0.5, metalness: 0.5 })));
  const [frame, tyres] = bikeGeometry();
  group.add(instanced(frame, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 }), bikes, bikeColors),
    instanced(tyres, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 }), bikes));
  return { object: group, segments };
}
