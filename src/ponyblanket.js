// #1397: simple assumed winter rugs, fitted to the existing rigid pony barrel.
import * as THREE from 'three';
import { PADDOCK as P, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';

export function blanketGeometry() {
  const B = P.blanket, pos = [], colors = [], v = (x, y, z) => [x, y, z];
  const tri = (a, b, c, tone) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(tone, tone, tone); };
  const quad = (a, b, c, d, tone) => { tri(a, b, c, tone); tri(a, c, d, tone); };
  // Open underside and open neck: cover the back/flanks, leaving the animated head, neck and legs free.
  const rings = B.sections.map(([z, belly, back, w]) => {
    const top = back + B.clearance, side = (belly + back) / 2 + (back - belly) * 0.3;
    return [v(-w - B.clearance, B.hem, z), v(-w - B.clearance, side, z), v(-w * 0.6, top, z),
      v(w * 0.6, top, z), v(w + B.clearance, side, z), v(w + B.clearance, B.hem, z)];
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < 5; k++) quad(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k], i % 2 ? 0.92 : 1);
  // Dark piping at both lower edges, in the same geometry/material.
  for (let i = 0; i + 1 < rings.length; i++) for (const k of [0, 5]) {
    const a = rings[i][k], b = rings[i + 1][k], out = k ? B.clearance : -B.clearance;
    quad(v(a[0] + out, a[1], a[2]), v(a[0] + out, a[1] + B.trim, a[2]), v(b[0] + out, b[1] + B.trim, b[2]), v(b[0] + out, b[1], b[2]), B.trimTone);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function ponyBlankets(body) {
  const mesh = new THREE.InstancedMesh(blanketGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), body.count);
  for (let i = 0; i < body.count; i++) mesh.setColorAt(i, new THREE.Color(P.blanket.colors[i % P.blanket.colors.length]));
  // The torso is rigid in ponyMaterial. Reuse its actual scale/pose buffer rather than duplicating animation.
  mesh.instanceMatrix = body.instanceMatrix;
  mesh.boundingSphere = body.boundingSphere.clone();
  mesh.name = 'pony-winter-blankets'; mesh.raycast = () => {};
  mesh.userData.noDetail = true;
  mesh.visible = false;
  registerSeasonal(month => { mesh.visible = SEASON.snowMonths.includes(month); });
  body.add(mesh); // Parent visibility/frustum and all ancestor visibility remain authoritative.
  return mesh;
}
