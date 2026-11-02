import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, REST, COURTYARD, OUTDOOR_SEATS as O } from './config.js';
import { restTarget } from './rest.js';
import { lowMemory } from './lowmemory.js';
import { schoolWallPlan } from './schoolwall.js';
import { B, toLocal, busStopPoint, across } from './busstopgeo.js';

/** Every rendered school bench/swing, including optional desktop details. Same visibility rule as schoolyardParts. */
export function schoolSeatRecords(phone = lowMemory) {
  const out = [];
  for (const area of ['west', 'north', 'east', 'south']) for (const source of [...SITE[area].access, ...SITE[area].paths]) {
    if (!source.yard) continue;
    const yard = source.yard;
    for (const [detail, body] of [[false, yard], ...(yard.detail && !phone ? [[true, { ...yard, ...yard.detail }]] : [])])
      for (const [index, p] of (body.play ?? []).entries()) if (p.kind === 'bench' || p.kind === 'swing')
        out.push({ ...p, colors: body.colors, source: source.source, id: `${source.source}-${detail ? 'detail' : 'base'}-${index}` });
  }
  return out;
}

/** Rest anchors in the authored model frame; record offsets/rotations come from the actual decor builder. */
export function decorSeatSpec(it) {
  if (it.k === 'chair') return { width: O.chair.width, depth: O.chair.depth, height: O.chair.seat + (it.cc ? O.chair.cushion : 0),
    name: 'utestolen', spots: [{ x: 0, z: 0 }] };
  if (it.k === 'sofa') { const n = Math.max(1, Math.floor(it.len / O.pitch)); return { width: it.len, depth: O.sofa.depth, height: O.sofa.seat,
    name: 'utesoffan', spots: Array.from({ length: n }, (_, i) => ({ x: it.len * ((i + .5) / n - .5), z: O.sofa.offset })) }; }
  if (it.k === 'lounger') return { width: O.lounger.width, depth: O.lounger.depth, height: O.lounger.seat,
    name: 'solstolen', spots: [{ x: O.lounger.offset, z: 0, dir: [1, 0], legsUp: true }] };
  return null;
}

const paintedBox = (w, h, d, x, y, z, color) => {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z); g.deleteAttribute('uv');
  const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return g;
};

/** Explicit outdoor seats only; existing indoor/courtyard/car and exercise targets keep their owners and behavior. */
export class OutdoorSeats {
  constructor(surroundings, exterior, ground) {
    this.object = new THREE.Group(); this.object.name = 'outdoor-seats'; this.targets = []; this.swings = [];
    this.motion = { v: new THREE.Vector3(), n: new THREE.Vector3(), m: new THREE.Matrix4(), rot: new THREE.Matrix4(), nm: new THREE.Matrix3() };
    const register = (parent, id, name, x, z, floor, yaw, width, depth, height, spots, gate = null) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(width, O.pickHeight, depth), new THREE.MeshBasicMaterial({ visible: false }));
      pick.name = `seat-${id}`; pick.position.set(x, floor + height, z); pick.rotation.y = yaw;
      pick.userData.rest = { kind: 'sit', name, verb: 'sätta dig på', spots: spots.map(p => ({ ...p, y: height, aim: [p.x, p.z, height] })) };
      const target = restTarget(pick, { x, z, level: 0 }, floor);
      Object.assign(target, { outdoorSeat: true, seatId: id, returnToEntry: true });
      pick.userData.door = target;
      if (gate) Object.defineProperty(pick.userData, 'seasonHidden', { get: () => gate.shown === false });
      parent.add(pick); this.targets.push(target); return target;
    };
    // School-wall shelter (the screenshot report) and the mapped south-bound bus stop.
    const wallBench = schoolWallPlan()?.shelter?.bench;
    if (wallBench) {
      const { x0, x1, z0, z1, h } = wallBench, n = Math.max(1, Math.floor((x1 - x0) / O.pitch));
      register(this.object, 'school-wall-bench', 'hållplatsbänken', (x0 + x1) / 2, (z0 + z1) / 2, 0, 0, x1 - x0, z1 - z0, h,
        Array.from({ length: n }, (_, i) => ({ x: (x1 - x0) * ((i + .5) / n - .5), z: 0 })));
    }
    const [s, t] = toLocal(...B.shelter.at), bench = B.shelter.bench, [bx, bz] = busStopPoint(s, t + B.shelter.depth / 2 - bench.depth / 2 - .05);
    const yaw = Math.atan2(-across[0], -across[1]); // local +z faces the road, local x follows the kerb
    register(this.object, 'south-bus-bench', 'hållplatsbänken', bx, bz, ground(...B.shelter.at) + B.lift, yaw, bench.len, bench.depth, bench.h,
      [-.6, 0, .6].map(x => ({ x, z: 0 })));
    // Every authored chair/sofa/lounger in the current patio and roof layouts, using their exact source transform.
    for (const [kind, gate] of [['patio', exterior.userData.patioDecor], ['terrace', exterior.userData.terraceDecor]])
      for (const record of gate?.userData.records ?? []) for (const [index, item] of record.items.entries()) {
        if (!item.seat) continue; const it = item.seat, spec = decorSeatSpec(it);
        if (spec) register(gate, `${kind}-${record.id}-${index}`, spec.name, it.x, it.z, it.floor, it.yaw, spec.width, spec.depth, spec.height, spec.spots, gate);
      }
    const swingParts = [];
    for (const rec of schoolSeatRecords()) {
      const [x, z] = rec.at, floor = ground(x, z), yaw = rec.yaw * Math.PI / 180;
      if (rec.kind === 'bench') {
        const n = Math.max(1, Math.floor(rec.size[0] / O.pitch));
        register(this.object, `school-${rec.id}`, 'skolbänken', x, z, floor, yaw, rec.size[0], O.schoolBench.depth, O.schoolBench.seat,
          Array.from({ length: n }, (_, i) => ({ x: rec.size[0] * ((i + .5) / n - .5), z: 0 })));
      } else for (const side of [-1, 1]) {
        const localX = rec.size[0] / 4 * side, c = Math.cos(yaw), s = Math.sin(yaw), sx = x + localX * c, sz = z - localX * s, S = O.schoolSwing;
        const target = register(this.object, `swing-${rec.id}-${side}`, 'skolgungan', sx, sz, floor, yaw, S.width, S.depth, S.seat + S.thickness / 2,
          [{ x: 0, z: 0, dir: [0, -1], follow: true }]);
        target.pickable.rotation.order = 'YXZ'; // frame yaw first, then local pendulum pitch: the same RY * RX as the drawn seats
        const top = floor + rec.size[1], low = floor + S.seat, length = top - low;
        const local = [paintedBox(S.width, S.thickness, S.depth, 0, -length, 0, rec.colors.seat),
          ...[-S.width / 2 + S.chain, S.width / 2 - S.chain].map(dx => paintedBox(S.chain, length, S.chain, dx, -length / 2, 0, rec.colors.seat))];
        const start = swingParts.reduce((n, g) => n + g.attributes.position.count, 0);
        const fixed = new THREE.Matrix4().makeTranslation(sx, top, sz).multiply(new THREE.Matrix4().makeRotationY(yaw));
        const source = mergeGeometries(local); local.forEach(g => g.dispose());
        swingParts.push(source.clone().applyMatrix4(fixed));
        const swing = { target, angle: 0, phase: 0, fixed, source, start, length,
          begin() { this.phase = Math.asin(THREE.MathUtils.clamp(this.angle / COURTYARD.swing.angle, -1, 1)); } };
        target.swing = swing; this.swings.push(swing);
      }
    }
    if (swingParts.length) {
      const geometry = mergeGeometries(swingParts); swingParts.forEach(g => g.dispose()); geometry.userData.keepCpu = true;
      geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      this.swingMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
      this.swingMesh.name = 'school-swing-seats'; this.swingMesh.userData.moving = true; this.swingMesh.castShadow = this.swingMesh.receiveShadow = true;
      this.object.add(this.swingMesh);
    }
    this.object.updateMatrixWorld(true);
  }

  update(dt, target) {
    if (!this.swingMesh || dt <= 0) return;
    const geometry = this.swingMesh.geometry, pos = geometry.attributes.position, normal = geometry.attributes.normal;
    const { v, n, m, rot, nm } = this.motion; let changed = false;
    for (const swing of this.swings) {
      const before = swing.angle;
      if (target === swing.target) { swing.phase += dt * Math.PI * 2 / COURTYARD.swing.period; swing.angle = COURTYARD.swing.angle * Math.sin(swing.phase); }
      else swing.angle *= Math.exp(-COURTYARD.swing.returnRate * dt);
      if (Math.abs(swing.angle) < 1e-5) swing.angle = 0;
      if (swing.angle === before) continue;
      m.copy(swing.fixed).multiply(rot.makeRotationX(swing.angle)); nm.getNormalMatrix(m);
      const src = swing.source.attributes;
      for (let i = 0; i < src.position.count; i++) {
        v.fromBufferAttribute(src.position, i).applyMatrix4(m); pos.setXYZ(swing.start + i, v.x, v.y, v.z);
        n.fromBufferAttribute(src.normal, i).applyMatrix3(nm); normal.setXYZ(swing.start + i, n.x, n.y, n.z);
      }
      v.set(0, -swing.length, 0).applyMatrix4(m);
      swing.target.pickable.position.copy(v); swing.target.pickable.rotation.x = swing.angle;
      swing.target.spots[0].pos.copy(v); swing.target.spots[0].pos.y += O.schoolSwing.thickness / 2 + REST.sitEye;
      swing.target.spots[0].aimPos.copy(v); changed = true;
    }
    if (changed) { pos.needsUpdate = normal.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }
  }
}
