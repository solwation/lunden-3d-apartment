import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE } from './config.js';
import { registerSeasonal } from './seasons.js';

// Sankt Lars väg's details (#128, SITE.street; the user's photos in docs/foton/): granite curbs, darker patches
// in the asphalt, slender street lamps with a curved arm (their heads glow at night: emissive only, no
// lights), a zebra crossing, a temporary yellow traffic light and warning signs for the building site, a
// cobbled corner, and fallen leaves on the pavements in the autumn months. A handful of draw calls.

const S = SITE.street;
const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);
const keepPN = (g) => { g = nonIndexed(g); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
const merged = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeGeometries(geos.map(keepPN)), mat); m.castShadow = shadow; m.receiveShadow = true; return m; };
const flatRect = (x0, x1, z0, z1, y) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

function cobbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6d6a66'; g.fillRect(0, 0, 128, 128);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? -8 : 0; x < 128; x += 16) {
    g.fillStyle = `hsl(30, ${6 + r() * 8}%, ${42 + r() * 18}%)`;
    g.beginPath(); g.ellipse(x + 8, y + 8, 6.5, 6, r(), 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(4, 3);
  return t;
}

/** One street lamp along local −x… pointing its arm towards +z (rotated per spot): pole, arm, head. */
function lampGeometry() {
  const { h, arm } = S.lamps;
  const pole = new THREE.CylinderGeometry(0.05, 0.08, h, 8).translate(0, h / 2, 0);
  const bend = new THREE.TorusGeometry(0.35, 0.035, 6, 10, Math.PI / 2).rotateY(Math.PI / 2).translate(0, h, 0.35);
  const reach = new THREE.CylinderGeometry(0.035, 0.035, arm - 0.35, 6).rotateX(Math.PI / 2).translate(0, h + 0.35, 0.35 + (arm - 0.35) / 2);
  const housing = new THREE.BoxGeometry(0.22, 0.09, 0.5).translate(0, h + 0.32, arm);
  return { body: [pole, bend, reach, housing], glass: new THREE.BoxGeometry(0.18, 0.02, 0.42).translate(0, h + 0.27, arm) };
}

export function buildStreet() {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 0.85 });
  // curbs: 15 cm granite blocks, 10 cm proud of the road
  const curbs = [...S.curbs.map((c) => new THREE.BoxGeometry(c.x1 - c.x0, 0.12, 0.15).translate((c.x0 + c.x1) / 2, 0.04, c.z)),
    ...S.curbZ.map((c) => new THREE.BoxGeometry(0.15, 0.12, c.z1 - c.z0).translate(c.x, 0.04, (c.z0 + c.z1) / 2))];
  group.add(merged(curbs, grey, false));
  // patched asphalt: darker, smoother rectangles a hair above the road
  group.add(merged(S.patches.map(([x, z, w, d]) => flatRect(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.016)),
    new THREE.MeshStandardMaterial({ color: 0x45484b, roughness: 0.5 }), false));
  // zebra crossing: 50 cm white bars along the traffic, across the road
  const cr = S.crossing, bars = [];
  for (let z = cr.z0 + 0.25; z + 0.5 <= cr.z1; z += 1.0) bars.push(flatRect(cr.x0, cr.x1, z, z + 0.5, 0.018));
  group.add(merged(bars, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }), false));
  // cobbled corner
  const cb = S.cobbles;
  const cob = new THREE.Mesh(flatRect(cb.x0, cb.x1, cb.z0, cb.z1, 0.012), new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.8 }));
  cob.receiveShadow = true;
  group.add(cob);
  // street lamps (instanced): along our pavement facing the road, and along the east leg
  const spots = [];
  for (let x = S.lamps.our.x0; x <= S.lamps.our.x1; x += S.lamps.our.step) spots.push([x, S.lamps.our.z, Math.PI]); // arm towards −z
  for (let z = S.lamps.east.z0; z <= S.lamps.east.z1; z += S.lamps.east.step) spots.push([S.lamps.east.x, z, Math.PI / 2]); // arm towards +x
  const L = lampGeometry();
  const body = new THREE.InstancedMesh(mergeGeometries(L.body.map(keepPN)), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.3 }), spots.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xffe2a8, emissiveIntensity: 0, roughness: 0.4 });
  const head = new THREE.InstancedMesh(keepPN(L.glass), headMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z, yaw], i) => {
    m.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one);
    body.setMatrixAt(i, m); head.setMatrixAt(i, m);
  });
  body.castShadow = true;
  group.add(body, head);
  // the building site's temporary traffic light (yellow case on a trolley) and warning triangles on stands
  const tl = S.trafficLight, yellow = [], black = [], lamps = [];
  yellow.push(new THREE.BoxGeometry(0.5, 0.35, 0.4).translate(tl.x, 0.25, tl.z), new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8).translate(tl.x, 1.3, tl.z));
  black.push(new THREE.BoxGeometry(0.22, 0.75, 0.28).translate(tl.x, 2.5, tl.z)); // a head facing each way along the road
  for (const [dy, col] of [[0.22, 0xff2a1a], [0, 0xffb21a], [-0.22, 0x2aff6a]]) {
    lamps.push([mergeGeometries([-1, 1].map((sx) => keepPN(new THREE.CircleGeometry(0.075, 14).rotateY(sx * Math.PI / 2).translate(tl.x + sx * 0.142, 2.5 + dy, tl.z)))), col]);
  }
  for (const [x, z] of S.warnings) {
    black.push(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6).translate(x, 0.5, z), new THREE.BoxGeometry(0.5, 0.05, 0.35).translate(x, 0.03, z));
    yellow.push(new THREE.CylinderGeometry(0.0001, 0.4, 0.05, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(x, 1.2, z - 0.03)); // the triangle
  }
  group.add(merged(yellow, new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.5 })), merged(black, new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6 })));
  const signalMats = lamps.map(([geo, col], i) => { const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: col, emissiveIntensity: i === 0 ? 1.2 : 0.05 }); group.add(new THREE.Mesh(geo, mat)); return mat; });
  // fallen leaves on the pavements and verges in the autumn months (one instanced mesh)
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaf = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), S.leaves.n);
  const per = S.leaves.n / S.leaves.areas.length, c = new THREE.Color();
  for (let i = 0; i < S.leaves.n; i++) {
    const [x0, x1, z0, z1] = S.leaves.areas[Math.floor(i / per)];
    m.compose(new THREE.Vector3(x0 + rnd() * (x1 - x0), 0.02 + rnd() * 0.004, z0 + rnd() * (z1 - z0)), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.3), one.set(0.7 + rnd() * 0.7, 1, 0.5 + rnd() * 0.5));
    leaf.setMatrixAt(i, m);
    leaf.setColorAt(i, c.setHSL(0.04 + rnd() * 0.1, 0.6 + rnd() * 0.3, 0.3 + rnd() * 0.2));
  }
  leaf.receiveShadow = true;
  group.add(leaf);
  registerSeasonal((month) => { leaf.visible = S.leaves.months.includes(month); });
  let phase = 0, last = performance.now();
  return {
    object: group,
    /** night 0 (day) … 1: the lamp heads glow; the traffic light cycles (called with the window lights). */
    update(night) {
      const now = performance.now();
      headMat.emissiveIntensity = night > 0.35 ? 1.6 : 0;
      phase = (phase + Math.min(1, (now - last) / 1000)) % 30;
      last = now;
      const state = phase < 12 ? 0 : phase < 14 ? 1 : phase < 28 ? 2 : 1; // red, yellow, green, yellow
      signalMats.forEach((mat, i) => { mat.emissiveIntensity = i === state ? 1.4 : 0.05; });
    },
  };
}
