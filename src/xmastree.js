import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { XMAS_TREE as X } from './config.js';
import { glowMaterial } from './groundglow.js';

// The Christmas tree (#571): a FURNITURE builder (furniture.js). A tall Nordmann-ish fir in a red stand on a felt skirt:
// serrated whorls + branch tips (one merged, vertex-coloured, flat-shaded mesh), baubles + a bead garland (one shiny
// mesh), a gold star with a soft halo, warm LED string lights (instanced cores + additive point halos, recoloured every
// frame for the shimmer by christmas.js) and a few presents. ~7 draw calls, no light of its own: it is a small-lamp spec
// (lights.js, E toggles it) with one pool-light anchor in front of it. Whether it is there at all is christmas.js's job.
// Local frame: y up from the floor, +z = facing (the room side). Every value: XMAS_TREE in config (visual guesses).

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const col = new THREE.Color();

/** A geometry with only position + normal + a colour attribute (so differently built parts merge). */
function paint(geo, color, tint) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    col.set(color); tint?.(col, pos.getX(i), pos.getY(i), pos.getZ(i));
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** The crown's radius at height y over the floor (a slightly full-bellied cone). */
export function crownRadius(y) {
  const C = X.crown, t = (y - C.bottom) / (C.top - C.bottom);
  if (t <= 0) return C.r;
  if (t >= 1) return 0;
  return C.r * (1 - t) ** 0.9 * (1 + 0.08 * Math.sin(Math.PI * t));
}

export function xmastree(item, lights) {
  const g = new THREE.Group(), C = X.crown, rand = rng(571), H = C.top - C.bottom;
  const greens = C.greens.map((h) => new THREE.Color(h));
  // ── the crown: whorls of serrated skirts (branch tiers that droop at the tips) + branch tips on the surface
  const crown = [];
  for (let i = 0; i < C.tiers; i++) {
    const yb = C.bottom + H * (i / C.tiers) ** 1.05, r = crownRadius(yb) * 1.03 + 0.02, h = Math.min(H * 2.3 / C.tiers, C.top - yb + 0.05);
    const teeth = Math.max(7, Math.round(r * 30)), spin = rand() * Math.PI * 2;
    const cone = new THREE.ConeGeometry(r, h, teeth * 2, 3, true);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), rr = Math.hypot(x, z);
      if (rr < 1e-6) continue;
      const a = Math.atan2(z, x), tooth = (0.5 + 0.5 * Math.cos(a * teeth)) ** 2, edge = (h / 2 - y) / h; // edge 0 apex … 1 rim
      const f = 1 - edge * 0.28 * (1 - tooth) + 0.04 * Math.sin(a * 3 + i);
      p.setXYZ(k, x * f, y - edge ** 2 * (0.05 + 0.05 * tooth), z * f); // notches between the branches, drooping tips
    }
    cone.rotateY(spin); cone.translate(0, yb + h / 2, 0);
    const base = greens[i % greens.length];
    crown.push(paint(cone, base, (c, x, y, z) => { const rr = Math.hypot(x, z) / Math.max(r, 0.01); c.multiplyScalar(0.5 + 0.5 * rr); }));
  }
  // branch tips: flat fans on the surface pointing out and a little down, lighter at the tip (new growth)
  for (let i = 0; i < C.sprigs; i++) {
    const t = Math.min(0.95, 1 - Math.sqrt(rand())), y = C.bottom + 0.04 + t * (H - 0.12), R = crownRadius(y);
    const a = rand() * Math.PI * 2, len = R * 0.42 + 0.07 + rand() * 0.05, droop = 0.25 + rand() * 0.3;
    const s = new THREE.ConeGeometry(0.03 + R * 0.04, len, 4, 1).translate(0, len / 2, 0).scale(0.45, 1, 2.1);
    s.rotateZ(-Math.PI / 2 - droop); s.rotateY(-a); s.translate(Math.cos(a) * R * 0.62, y, Math.sin(a) * R * 0.62);
    const base = greens[Math.floor(rand() * greens.length)].clone().multiplyScalar(0.85 + rand() * 0.3), cx = Math.cos(a), cz = Math.sin(a);
    crown.push(paint(s, base, (c, x, yy, z) => { const out = (x * cx + z * cz) / Math.max(R, 0.05); if (out > 1.02) c.lerp(new THREE.Color(0x4f8048), 0.35); }));
  }
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  const crownMesh = new THREE.Mesh(mergeGeometries(crown), crownMat);
  crownMesh.name = 'julgranens barr';
  // ── stand, trunk, felt skirt, presents: one matte vertex-coloured mesh
  const S = X.stand, matte = [];
  const sk = X.skirt;
  matte.push(paint(new THREE.CylinderGeometry(sk.r, sk.r, sk.h, 40).translate(0, sk.h / 2, 0), sk.color,
    (c, x, y, z) => { if (Math.hypot(x, z) > sk.r - 0.05) c.set(sk.border); }));
  matte.push(paint(new THREE.CylinderGeometry(S.r1, S.r0, S.h, 24).translate(0, sk.h + S.h / 2, 0), S.color));
  matte.push(paint(new THREE.TorusGeometry(S.r1, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, sk.h + S.h, 0), 0x6d1216));
  matte.push(paint(new THREE.CylinderGeometry(X.trunk.r * 0.8, X.trunk.r, X.trunk.h, 10).translate(0, sk.h + S.h - 0.05 + X.trunk.h / 2, 0), X.trunk.color));
  for (const [x, z, w, d, h, paper, ribbon] of X.gifts) {
    const turn = (rand() - 0.5) * 0.6, y0 = sk.h, rb = 0.022;
    const parts = [paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), paper),
      paint(new THREE.BoxGeometry(w + 0.004, h + 0.004, rb).translate(0, h / 2, 0), ribbon),
      paint(new THREE.BoxGeometry(rb, h + 0.004, d + 0.004).translate(0, h / 2, 0), ribbon),
      paint(new THREE.TorusGeometry(0.03, 0.009, 5, 10).rotateY(0.6).translate(-0.02, h + 0.02, 0), ribbon),
      paint(new THREE.TorusGeometry(0.03, 0.009, 5, 10).rotateY(-0.6).translate(0.02, h + 0.02, 0), ribbon)];
    for (const p of parts) { p.rotateY(turn); p.translate(x, y0, z); matte.push(p); }
  }
  const matteMesh = new THREE.Mesh(mergeGeometries(matte), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  matteMesh.name = 'julgransfoten';
  // ── baubles (hanging under the whorls' rims) + the bead garland: one shiny mesh
  const B = X.baubles, shiny = [], at = [];
  for (let i = 0, tries = 0; i < B.n && tries < B.n * 40; tries++) {
    const tier = Math.floor((1 - Math.sqrt(rand())) * (C.tiers - 1)), yb = C.bottom + H * (tier / C.tiers) ** 1.05;
    const r = B.r[0] + rand() * (B.r[1] - B.r[0]) * (1 - tier / C.tiers * 0.5), a = rand() * Math.PI * 2;
    const R = crownRadius(yb) * (0.82 + rand() * 0.14), p = new THREE.Vector3(Math.cos(a) * R, yb - r - 0.012 + (rand() - 0.5) * 0.06, Math.sin(a) * R);
    if (at.some((q) => q.distanceTo(p) < 0.13)) continue;
    at.push(p);
    shiny.push(paint(new THREE.SphereGeometry(r, 10, 7).translate(p.x, p.y, p.z), B.colors[i % B.colors.length]));
    shiny.push(paint(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.35, 6).translate(p.x, p.y + r * 1.05, p.z), 0xbfa154)); // the cap
    i++;
  }
  const G = X.garland, pts = [], top = C.top - 0.28, bottom = C.bottom + 0.18;
  for (let k = 0; k <= 160; k++) {
    const s = k / 160, y = top - s * (top - bottom), a = s * G.turns * Math.PI * 2 + 0.7, R = crownRadius(y) * 0.9 + 0.015;
    const drape = Math.sin(((s * G.turns * 3) % 1) * Math.PI); // three swags a turn
    pts.push(new THREE.Vector3(Math.cos(a) * R, y - G.sag * drape, Math.sin(a) * R));
  }
  shiny.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, G.r, 4), G.color));
  const shinyMesh = new THREE.Mesh(mergeGeometries(shiny), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.26 }));
  shinyMesh.name = 'julgranskulor';
  // ── the star on top: a bevelled five-pointed star facing the room, glowing with the lights (the lamp's `shade`)
  const T = X.star, shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? T.size * T.inner : T.size;
    k ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(shape, { depth: T.depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 });
  starGeo.translate(0, 0, -T.depth / 2);
  const starMat = new THREE.MeshStandardMaterial({ color: T.color, metalness: 0.6, roughness: 0.3, emissive: T.glow, emissiveIntensity: 0.04 });
  const star = new THREE.Mesh(starGeo, starMat);
  star.position.y = C.top + T.size * 0.82;
  star.name = 'julgransstjärnan';
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 6), starMat);
  stem.position.y = C.top + 0.02;
  const glowTex = glowMaterial(0xffffff).map; // the shared radial fall-off (groundglow.js)
  const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: T.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  haloMat.userData.on = T.haloOn; // FloorLamp.show: opacity = k × this
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(T.halo); halo.position.copy(star.position); halo.raycast = () => {};
  // ── the string lights: a spiral of bulbs on the branch tips; cores (instanced) + additive halos (points)
  const L = X.lights, n = L.n, cores = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(L.bulb, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
  const haloPos = new Float32Array(n * 3), haloCol = new Float32Array(n * 3), bulbs = [], m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), y = C.bottom + 0.08 + s * (H - 0.22), a = s * L.turns * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const R = crownRadius(y) * (0.86 + rand() * 0.1) + 0.01, x = Math.cos(a) * R, z = Math.sin(a) * R;
    m4.makeTranslation(x, y, z); cores.setMatrixAt(i, m4);
    haloPos.set([x, y, z], i * 3);
    bulbs.push({ color: new THREE.Color(L.colors[i % L.colors.length]), speed: L.speed * (0.5 + rand()), phase: rand() * Math.PI * 2, y });
    cores.setColorAt(i, col.set(0x3a3630));
  }
  cores.name = 'julgransbelysningen'; cores.raycast = () => {};
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 3));
  const pointMat = new THREE.PointsMaterial({ size: L.halo, map: glowTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false, fog: false });
  pointMat.userData.on = L.haloOn;
  const halos = new THREE.Points(haloGeo, pointMat);
  halos.raycast = () => {}; halos.frustumCulled = false; halos.renderOrder = 2;
  for (const m of [crownMesh, matteMesh, shinyMesh, star]) m.castShadow = m.receiveShadow = true;
  g.add(crownMesh, matteMesh, shinyMesh, star, stem, cores, halos, halo);
  const off = new THREE.Color(0x3a3630);
  /** The shimmer (christmas.js, every frame while it stands): `k` = how far the lights are on (the lamp's fade). */
  const animate = (time, k) => {
    for (let i = 0; i < n; i++) {
      const b = bulbs[i], tw = (0.5 + 0.5 * Math.sin(time * b.speed + b.phase)) ** 2;
      const f = k * Math.min(1, (1 - L.twinkle * tw) * (1 - L.wave) + L.wave * (0.5 + 0.5 * Math.sin(time * 0.9 - b.y * 2.6)));
      cores.setColorAt(i, col.copy(off).lerp(b.color, Math.min(1, f * 1.15)));
      haloCol[i * 3] = b.color.r * f; haloCol[i * 3 + 1] = b.color.g * f; haloCol[i * 3 + 2] = b.color.b * f;
    }
    cores.instanceColor.needsUpdate = true;
    haloGeo.attributes.color.needsUpdate = true;
  };
  animate(0, 0);
  const f = X.footprint, yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI;
  g.userData.footprint = [{ x0: -f, x1: f, z0: -f, z1: f }];
  g.userData.keep = [cores, halos, halo, star, stem];
  g.userData.xmas = { animate, bulbs: n };
  // a small lamp (lights.js): E on the tree switches it, not with the dusk (it is on whenever the tree is up); its pool
  // anchor `ahead` m in front of it (world offset at the default pose: rearrange.js carries it from there)
  lights.push({ object: g, shade: starMat, glows: [pointMat, haloMat], height: X.anchorY, level: item.level, name: 'julgranen', auto: false,
    offset: [Math.sin(yaw) * X.ahead, Math.cos(yaw) * X.ahead], light: X.light });
  return g;
}
