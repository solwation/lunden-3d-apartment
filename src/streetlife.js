import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON } from './config.js';
import { pavingTexture } from './patio.js';
import { registerSnow } from './seasons.js';
import { buildCar, MEGANE } from './carmodel.js';
import { groundY } from './surroundings.js';
import { boxwood } from './boxwood.js';
import { onRoad, onWalk } from './roads.js';

// Life on the street (#113, SITE.life): the car park (one row along the hedge, #208, #260) with parked cars (instanced: a body with a
// colour per car, trim, glass, tyres — four draw calls; the bodies from carmodel.js, #251), its white stall lines, the low green strip
// along Hus L's entrances, bikes only in the racks of the bike yard NW of Hus L (two draw calls), the yard's paving
// and lawns (#260). Returns { object, segments } (the parked cars and the racks block the way).

const L = SITE.life;
const keep = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; };
const merge = (geos) => mergeGeometries(geos.map(keep));
const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const flat = (x0, x1, z0, z1, y) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** One parked car, facing +x (#251): the body from carmodel.js (lite), as [paint, trim (vertex colours: black, lights,
 * chrome, rims), glass, tyres] geometries for instancing. */
const TRIM = { black: 0x0c0d0f, roof: 0x0b0c0e, lens: 0x15181c, led: 0xdfe4ea, blink: 0xc87a10, tail: 0x8a0f12, chrome: 0xd9dde0, rim: 0x8e949a };
export function carGeometry() {
  const { parts } = buildCar(MEGANE, { lite: true });
  const trim = Object.entries(TRIM).filter(([k]) => parts[k]).map(([k, hex]) => {
    const g = keep(parts[k]), c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.deleteAttribute('uv'); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const bare = (g) => { g = keep(g); g.deleteAttribute('uv'); return g; };
  return [bare(parts.paint), mergeGeometries(trim), bare(parts.glass), bare(parts.tyre)];
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

export function buildStreetLife({ entrances = [] } = {}) {
  const group = new THREE.Group(), segments = [], R = rng(17);
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 });
  // the car park: one row of stalls along the hedge, nose to it, from the west end to the drive (#208, #260)
  const lot = L.lot, lines = [], cars = [], carColors = [];
  const rows = [{ z0: lot.z0, z1: lot.z0 + lot.depth, yaw: Math.PI / 2 }];
  for (const row of rows) {
    for (let x = lot.x0; x <= lot.x1 + 1e-6; x += lot.stall) lines.push(flat(x - 0.06, x + 0.06, row.z0, row.z1, 0.02));
    for (let x = lot.x0; x + lot.stall <= lot.x1 + 1e-6; x += lot.stall) {
      if (R() > L.fill) continue;
      const cx = x + lot.stall / 2, cz = (row.z0 + row.z1) / 2 + (R() - 0.5) * 0.3;
      const yaw = row.yaw + (R() - 0.5) * 0.06 + (R() < 0.2 ? Math.PI : 0); // a few reversed in
      cars.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(0.94 + R() * 0.1, 0.95 + R() * 0.12, 0.96 + R() * 0.07))); // a little variety in size (#251)
      carColors.push(L.carColors[Math.floor(R() * L.carColors.length)]);
      const hx = 0.92, hz = 2.17; // footprint (turned 90°: across x)
      const c = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
      c.forEach((p, i) => segments.push([...p, ...c[(i + 1) % 4]]));
    }
  }
  group.add(new THREE.Mesh(merge(lines), white));
  const [body, trim, glass, carTyres] = carGeometry();
  group.add(instanced(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.35 }), cars, carColors),
    instanced(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45 }), cars),
    instanced(glass, new THREE.MeshStandardMaterial({ color: 0x33495c, roughness: 0.05, metalness: 0.55 }), cars),
    instanced(carTyres, new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85 }), cars));
  // the bike yard NW of Hus L (#260): light stone paving, a lighter bike place, lawns
  const tex = pavingTexture(), tw = 2.4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const paved = (r, y) => { const g = flat(r.x0, r.x1, r.z0, r.z1, y), uv = g.attributes.uv; // uv in metres / the texture's width
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.x1 - r.x0) / tw, uv.getY(i) * (r.z1 - r.z0) / tw);
    return g; };
  const paveMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, color: 0xf3efe6 });
  const placeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, color: 0xfdfcf8 });
  const pave = new THREE.Mesh(paved(L.yard, 0.012), paveMat), place = new THREE.Mesh(paved(L.bikePlace, 0.016), placeMat);
  pave.receiveShadow = place.receiveShadow = true;
  registerSnow(paveMat, SEASON.snow.paving); registerSnow(placeMat, SEASON.snow.paving);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x5f8a3e, roughness: 1 });
  registerSnow(lawnMat, SEASON.snow.ground);
  const lawn = new THREE.Mesh(merge(L.lawns.map(([x0, x1, z0, z1]) => flat(x0, x1, z0, z1, 0.02))), lawnMat); lawn.receiveShadow = true;
  group.add(pave, place, lawn);
  // the low green strip along Hus L's entrances (#260): a concrete edge, grass, clipped boxwood
  const S = L.strip, edge = [], grass = [];
  for (const [x0, x1] of S.parts) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    edge.push(box(w, S.h, 0.08, cx, S.h / 2, S.z0 + 0.04), box(w, S.h, 0.08, cx, S.h / 2, S.z1 - 0.04));
    grass.push(flat(x0, x1, S.z0 + 0.08, S.z1 - 0.08, S.h - 0.02));
    // Retain the original random sequence for the unrelated bike/yard models built later.
    for(let x=x0+.3;x<x1-.2;x+=.45+R()*.25){R();R()}
  }
  group.add(new THREE.Mesh(merge(edge),new THREE.MeshStandardMaterial({color:0xbdb8ae,roughness:.85})),new THREE.Mesh(merge(grass),lawnMat));
  const frontHedge=boxwood({...S.hedge,parts:S.parts,z:(S.z0+S.z1)/2,
    gaps:entrances.map(o=>[o.x0-S.hedge.entranceMargin,o.x1+S.hedge.entranceMargin])});
  frontHedge.position.y=S.h-.02;group.add(frontHedge);segments.push(...frontHedge.userData.segments);
  // #436: concrete edges between the car park's asphalt and the grass, and round the yard's lawns (one merged mesh)
  const E = L.edges, curbs = [], inR = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const Wst = SITE.terrain.west.stair;
  const hard = (x, z) => onRoad(x, z) || onWalk(x, z) || SITE.paving.some((r) => inR(r, x, z)) || inR(L.yard, x, z)
    || (x > Wst.x0 - 0.5 && x < Wst.x1 + 0.5 && z > -3.6); // the NW stair down to Karpvägen (#256)
  const edgeRun = (ax, az, bx, bz, ox, oz, check) => { // a straight edge from a to b, (ox, oz) = out of the asphalt / lawn
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.25)), per = Math.max(1, Math.round(E.step / 0.25));
    const at = (k) => [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
    const box = (k0, k1) => { // sub-pieces k0 … k1 − 1 as one block, its top on the highest ground under it
      const [x0, z0] = at(k0), [x1, z1] = at(k1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const y = Math.max(groundY(x0, z0), groundY(x1, z1), groundY(mx, mz)), l = Math.hypot(x1 - x0, z1 - z0) + 0.002;
      curbs.push(new THREE.BoxGeometry(E.w, E.h + 0.08, l).rotateY(Math.atan2(bx - ax, bz - az)).translate(mx, y + (E.h - 0.08) / 2, mz));
    };
    let start = -1;
    for (let k = 0; k <= n; k++) {
      const [mx, mz] = k < n ? at(k + 0.5) : [0, 0];
      const on = k < n && !(check && hard(mx + ox * 0.3, mz + oz * 0.3));
      if (on && start < 0) start = k;
      if (start >= 0 && (!on || k - start === per)) { box(start, k); start = on ? k : -1; }
    }
  };
  const lotR = SITE.roads.find((r) => r.name === E.road);
  if (lotR) {
    const { x0, x1, z0, z1 } = lotR;
    edgeRun(x0, z0, x1, z0, 0, -1, true); edgeRun(x1, z0, x1, z1, 1, 0, true); edgeRun(x1, z1, x0, z1, 0, 1, true); edgeRun(x0, z1, x0, z0, -1, 0, true);
  }
  for (const [x0, x1, z0, z1] of L.lawns) { edgeRun(x0, z0, x1, z0); edgeRun(x1, z0, x1, z1); edgeRun(x1, z1, x0, z1); edgeRun(x0, z1, x0, z0); }
  if (curbs.length) {
    const curbMat = new THREE.MeshStandardMaterial({ color: E.color, roughness: 0.85 });
    registerSnow(curbMat, SEASON.snow.paving);
    const cm = new THREE.Mesh(merge(curbs), curbMat);
    cm.name = 'concreteEdges'; cm.receiveShadow = true;
    group.add(cm);
  }
  // #529: bicycles only in the plan's yard racks (front wheel in the rack), never along entrances.
  const bikes = [], bikeColors = [], cols = [0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0xe2e2dc, 0x3c7a4a, 0x8a8f96, 0xd8a020];
  const put = (x, z, yaw, lean) => { bikes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1))); bikeColors.push(cols[Math.floor(R() * cols.length)]); };
  const rack = [];
  for (const r of L.racks) {
    const len = (r.n - 1) * r.gap + 0.5, cz = r.z0 + (r.n - 1) * r.gap / 2;
    rack.push(box(0.04, 0.04, len, r.x, 0.3, cz));
    for (let k = 0; k < r.n; k++) {
      const z = r.z0 + k * r.gap;
      rack.push(box(0.5, 0.6, 0.04, r.x - r.dir * 0.2, 0.3, z));
      if (R() < 0.7) put(r.x - r.dir * 0.42, z, r.dir > 0 ? 0 : Math.PI, 0); // the front wheel (local +0.42) at the rack
    }
    // the rack and its bikes as one block to walk round
    const xa = Math.min(r.x, r.x - r.dir * 1.3), xb = Math.max(r.x, r.x - r.dir * 1.3), za = r.z0 - 0.3, zb = r.z0 + (r.n - 1) * r.gap + 0.3;
    const c = [[xa, za], [xb, za], [xb, zb], [xa, zb]];
    c.forEach((p, i) => segments.push([...p, ...c[(i + 1) % 4]]));
  }
  group.add(new THREE.Mesh(merge(rack), new THREE.MeshStandardMaterial({ color: 0x6f7377, roughness: 0.5, metalness: 0.5 })));
  const [frame, tyres] = bikeGeometry();
  group.add(instanced(frame, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 }), bikes, bikeColors),
    instanced(tyres, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 }), bikes));
  return { object: group, segments };
}
