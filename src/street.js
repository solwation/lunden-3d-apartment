import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE } from './config.js';
import { registerSeasonal } from './seasons.js';
import { samples, onRoad, along, filletOutline } from './roads.js';

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

/** Granite curbs (15 cm, 10 cm proud of the road) along a polyline of road-edge points; `out(p)` = a point just
 * outside the asphalt next to p: no curb where that lies on a road (a junction's mouth). Each block follows the slope. */
function curbRun(pts, out, groundY, list) {
  const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k - 1], q = pts[k], mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, nx: (p.nx + q.nx) / 2, nz: (p.nz + q.nz) / 2 };
    if (onRoad(...out(mid))) continue;
    const a = new THREE.Vector3(p.x, groundY(p.x, p.z) + 0.04, p.z), b = new THREE.Vector3(q.x, groundY(q.x, q.z) + 0.04, q.z);
    const len = a.distanceTo(b);
    if (len < 1e-3) continue;
    m.lookAt(b, a, up).setPosition(a.clone().add(b).multiplyScalar(0.5));
    list.push(new THREE.BoxGeometry(0.15, 0.12, len + 0.02).applyMatrix4(m));
  }
}

export function buildStreet(groundY) {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 0.85 });
  // curbs along both edges of the roads with a centre line, and round the junctions' fillets (#257)
  const curbs = [];
  for (const r of SITE.roads) {
    if (r.path) {
      const P = samples(r);
      for (const side of [-1, 1]) {
        const edge = P.map((p) => ({ x: p.x + p.nx * side * (p.w / 2 + 0.075), z: p.z + p.nz * side * (p.w / 2 + 0.075), nx: p.nx * side, nz: p.nz * side }));
        curbRun(edge, (p) => [p.x + p.nx * 0.3, p.z + p.nz * 0.3], groundY, curbs);
      }
    }
    for (const f of r.fillets || []) {
      const cx = f.x + f.sx * f.r, cz = f.z + f.sz * f.r;
      const arc = filletOutline(f).slice(1).map(([x, z]) => { const l = Math.hypot(cx - x, cz - z); return { x: x + ((cx - x) / l) * 0.075, z: z + ((cz - z) / l) * 0.075, nx: (cx - x) / l, nz: (cz - z) / l }; });
      curbRun(arc, (p) => [p.x + p.nx * 0.3, p.z + p.nz * 0.3], groundY, curbs);
    }
  }
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
  for (const row of S.lamps.rows) {
    const road = SITE.roads.find((r) => r.name === row.road);
    for (const p of along(road, row.from, row.to, row.step, (w) => row.side * (w / 2 + row.off))) {
      spots.push([p.x, p.z, Math.atan2(-row.side * p.nx, -row.side * p.nz)]); // the arm over the road: (sin yaw, cos yaw)
    }
  }
  const L = lampGeometry();
  const body = new THREE.InstancedMesh(mergeGeometries(L.body.map(keepPN)), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.3 }), spots.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xffe2a8, emissiveIntensity: 0, roughness: 0.4 });
  const head = new THREE.InstancedMesh(keepPN(L.glass), headMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z, yaw], i) => {
    m.compose(new THREE.Vector3(x, groundY(x, z), z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one);
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
  // signs (#129): canvas faces on both sides, poles merged
  const poles = [], faces = [];
  const sign = (draw, w, h, [x, z, yaw], y, { pole = true, tex = 256 } = {}) => {
    const c = document.createElement('canvas'); c.width = tex; c.height = Math.round((tex * h) / w);
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const r = THREE.MathUtils.degToRad(yaw);
    for (const back of [0, Math.PI]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      pl.position.set(x + Math.sin(r + back) * 0.012, y + groundY(x, z), z + Math.cos(r + back) * 0.012);
      pl.rotation.y = r + back;
      faces.push(pl);
    }
    if (pole) poles.push(new THREE.CylinderGeometry(0.03, 0.03, y + h / 2, 8).translate(x, groundY(x, z) + (y + h / 2) / 2, z));
  };
  sign((g, w, h) => { // the bus stop: a yellow-bordered blue sign with a bus, the stop's name below
    g.fillStyle = '#f6c21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d4f91'; g.fillRect(10, 10, w - 20, h * 0.62);
    g.fillStyle = '#fff'; g.fillRect(w * 0.25, h * 0.14, w * 0.5, h * 0.3); g.fillStyle = '#1d4f91'; g.fillRect(w * 0.3, h * 0.18, w * 0.4, h * 0.12);
    g.beginPath(); g.arc(w * 0.35, h * 0.47, 12, 0, 7); g.arc(w * 0.65, h * 0.47, 12, 0, 7); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#111'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('S:t Lars', w / 2, h * 0.88);
  }, 0.42, 0.62, S.busStop, 2.3);
  sign((g, w, h) => { g.fillStyle = '#d61f26'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText('Flyttad', w / 2, h / 2 + 15); },
    0.75, 0.62, S.moved, 2.05);
  sign((g, w, h) => { // "parkering förbjuden": a red ring, a blue disc, one red bar
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, 7); g.fillStyle = '#d61f26'; g.fill();
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 30, 0, 7); g.fillStyle = '#1d5fb4'; g.fill();
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 4); g.fillStyle = '#d61f26'; g.fillRect(-w / 2 + 26, -14, w - 52, 28); g.restore();
  }, 0.6, 0.6, S.noParking, 2.2);
  sign((g, w, h) => { g.fillStyle = '#151515'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2e2c6'; g.textAlign = 'center';
    g.font = 'bold 50px Georgia, serif'; g.fillText('HEPCAT', w / 2, h * 0.3); g.font = 'italic 38px Georgia, serif'; g.fillText('Store', w / 2, h * 0.45);
    g.font = '22px sans-serif'; g.fillText('Välkommen in!', w / 2, h * 0.75); }, 0.6, 0.9, S.aBoard, 0.55, { pole: false });
  group.add(merged(poles, new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.4, metalness: 0.5 })), ...faces);
  // fallen leaves on the pavements and verges in the autumn months (one instanced mesh)
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaf = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), S.leaves.n);
  const per = S.leaves.n / S.leaves.areas.length, c = new THREE.Color();
  for (let i = 0; i < S.leaves.n; i++) {
    const [x0, x1, z0, z1] = S.leaves.areas[Math.floor(i / per)];
    const lx = x0 + rnd() * (x1 - x0), ly = 0.02 + rnd() * 0.004, lz = z0 + rnd() * (z1 - z0); // on the ground (#256)
    m.compose(new THREE.Vector3(lx, ly + groundY(lx, lz), lz), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.3), one.set(0.7 + rnd() * 0.7, 1, 0.5 + rnd() * 0.5));
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
