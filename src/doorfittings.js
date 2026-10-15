import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOOR_FITTINGS as F } from './config.js';

const steel = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: .72, roughness: .4, vertexColors: true });
const cache = new Map();
const cylinder = (radius, depth) => new THREE.CylinderGeometry(radius, radius, depth, F.segments).rotateZ(Math.PI / 2);
const mesh = geometry => {
  const m = new THREE.Mesh(geometry, steel);
  m.castShadow = m.receiveShadow = true;
  return m;
};

// Local x = leaf thickness, z = hinge → latch. All identical leaves share this merged geometry.
export function doorFittings(width, thickness, { entrance = false, privacy = false } = {}) {
  const key = `${thickness}/${entrance}/${privacy}`;
  if (!cache.has(key)) {
    const parts = [], half = thickness / 2;
    const add = (g, x, y, z, dark = false) => {
      const colors = new Float32Array(g.attributes.position.count * 3).fill(dark ? .06 : 1);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(g.translate(x, y, z));
    };
    for (const side of [-1, 1]) {
      add(cylinder(F.roseRadius, F.roseDepth), side * (half + F.roseDepth / 2), 0, 0);
      // Round neck, a smooth elbow and a grip pointing back towards the hinge.
      const x = half + F.neck, b = F.bend;
      const curve = new THREE.CurvePath();
      curve.add(new THREE.LineCurve3(new THREE.Vector3(side * (half + F.roseDepth), 0, 0), new THREE.Vector3(side * (x - b), 0, 0)));
      curve.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(side * (x - b), 0, 0), new THREE.Vector3(side * x, 0, 0), new THREE.Vector3(side * x, 0, -b)));
      curve.add(new THREE.LineCurve3(new THREE.Vector3(side * x, 0, -b), new THREE.Vector3(side * x, 0, -F.lever)));
      add(new THREE.TubeGeometry(curve, F.segments, F.radius, 6, false), 0, 0, 0);
      add(new THREE.SphereGeometry(F.radius, 6, 4), side * x, 0, -F.lever);
      if (privacy || entrance) {
        const lock = cylinder(entrance ? F.cylinderWidth / 2 : F.lockRadius, F.lockDepth);
        if (entrance) lock.scale(1, F.cylinderHeight / F.cylinderWidth, 1);
        add(lock, side * (half + F.lockDepth / 2), -F.lockDrop, 0);
        // Toilet thumbturn on both faces; entrance cylinder has a recessed-looking key slot.
        add(new THREE.BoxGeometry(F.turnDepth, privacy ? F.turnHeight : F.slotHeight, privacy ? F.turnWidth : F.slotWidth), side * (half + F.lockDepth + F.turnDepth / 2), -F.lockDrop, 0, entrance);
      }
    }
    const geometry = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    cache.set(key, geometry);
  }
  const m = mesh(cache.get(key));
  m.position.set(0, F.height, width - F.backset);
  m.name = entrance ? 'entry-fittings' : privacy ? 'privacy-fittings' : 'lever-fittings';
  return m;
}

// Jamb-mounted: its parent has the CLOSED leaf transform and never follows the hinge animation.
export function doorStrike() {
  const group = new THREE.Group();
  const parts = [];
  const rail = F.strikeWidth / 4, slot = F.strikeHeight / 3;
  for (const side of [-1, 1]) parts.push(new THREE.BoxGeometry(rail, F.strikeHeight, F.strikeDepth).translate(side * (F.strikeWidth - rail) / 2, F.height, 0));
  for (const side of [-1, 1]) parts.push(new THREE.BoxGeometry(F.strikeWidth - 2 * rail, (F.strikeHeight - slot) / 2, F.strikeDepth).translate(0, F.height + side * (F.strikeHeight + slot) / 4, 0));
  const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
  group.add(mesh(geometry)); group.name = 'entry-strike';
  return group;
}

// Exact room ownership on each side of the real closed opening; works for our flat and visited plans.
export function fitPrivacyDoors(doors, roomAt) {
  for (const door of doors) {
    if (door.kind !== 'swing' || door.exterior) continue;
    const { center: [x, z], normal: [nx, nz] } = door.opening();
    if (![1, -1].some(s => /^(Badrum|WC)(?:$|\/)/.test(roomAt(x + s * nx * .3, z + s * nz * .3) ?? ''))) continue;
    door.object.remove(door.hardware);
    door.hardware = doorFittings(door.len, .04, { privacy: true });
    door.hardware.userData.door = door;
    door.object.add(door.hardware);
  }
}
