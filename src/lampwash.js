import * as THREE from 'three';
import { LEVELS, SOFFITS, STAIR, LIGHTING } from './config.js';

// The lit look of the small lamps (#276): the pool of point lights only lights the few lamps near the visitor, so a lit
// room you had walked out of went dark around its glowing shade. Every small lamp also gets a soft additive wash on
// the floor, ceiling and walls it can see — its visibility polygon in plan (rays to the walls, closed doors and the
// façade line), the floor/ceiling as a fan and the wall faces it reaches as quads — shaded in the shader like a
// shadowless point light (distance fall-off, angle to the surface) and faded with the lamp's `k`. All lamps share ONE
// mesh and draw call; each lamp's k is a uniform. The wash is there whether the visitor is near or not, so the room
// stays lit seen through a doorway, from the other floor or through the windows from outside; the pool lights add
// real shading near the visitor on top.
// Things hung on a wall hide its wash (#292: the meadow-grass picture over the bed stayed murky with the bedside lamps
// on): a mesh with `userData.washMap` (a texture) gets the lamps that see it in a material of its own — the same
// fall-off, times its texture — drawn additively on its surface; with no lamp in reach it stays hidden.

const W = LIGHTING.wash;

function ceilingAt(level, x, z) {
  const s = SOFFITS.find((s) => s.level === level && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  return LEVELS[level].floor + (s ? s.height : LEVELS[level].ceiling);
}

/** Nearest hit of the ray (ox, oz) + t·(dx, dz) on a segment: { t, i } (i = the segment's index), t ≤ max. */
function cast(segs, ox, oz, dx, dz, max) {
  let best = { t: max, i: -1 };
  segs.forEach(([ax, az, bx, bz], i) => {
    const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) return;
    const t = ((ax - ox) * ez - (az - oz) * ex) / den;
    const u = ((ax - ox) * dz - (az - oz) * dx) / den;
    if (t > 1e-4 && t < best.t && u >= 0 && u <= 1) best = { t, i };
  });
  return best;
}

const vertex = /* glsl */ `
  attribute vec3 lampPos;
  attribute vec3 tint;
  attribute vec2 fall;
  attribute float idx;
  uniform float uK[COUNT];
  varying vec3 vW, vN, vL, vC;
  varying vec2 vF;
  varying float vK;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normal; vL = lampPos; vC = tint; vF = fall;
    vK = uK[int(idx + 0.5)];
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const fragment = /* glsl */ `
  uniform vec4 uCut[CUTS];   // x0 z0 x1 z1 of a plan rect where …
  uniform vec3 uCutY[CUTS];  // … surfaces facing y (sign) between y0 and y1 get no wash (stair hole, soffits)
  uniform float uWrap;
  varying vec3 vW, vN, vL, vC;
  varying vec2 vF;
  varying float vK;
  void main() {
    if (vK < 0.002) discard;
    for (int i = 0; i < CUTS; i++) {
      vec4 r = uCut[i]; vec3 c = uCutY[i];
      if (vW.x > r.x && vW.x < r.z && vW.z > r.y && vW.z < r.w && vW.y > c.x && vW.y < c.y && vN.y * c.z > 0.5) discard;
    }
    vec3 d = vL - vW;
    float r = length(d);
    float lambert = (max(dot(vN, d / r), 0.0) + uWrap) / (1.0 + uWrap);
    float a = 1.0 / (1.0 + r * r / (vF.x * vF.x)) * (1.0 - smoothstep(vF.y * 0.5, vF.y, r));
    gl_FragColor = vec4(vC * (vK * lambert * a), 1.0);
    #include <colorspace_fragment>
  }`;

const litVertex = /* glsl */ `
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const litFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uN;
  uniform float uWrap;
  uniform float uK[COUNT];
  uniform vec3 uPos[N];
  uniform vec3 uTint[N];
  uniform vec2 uFall[N];
  uniform int uIdx[N];
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < N; i++) {
      vec3 d = uPos[i] - vW;
      float r = length(d);
      float lambert = (max(dot(uN, d / r), 0.0) + uWrap) / (1.0 + uWrap);
      float a = 1.0 / (1.0 + r * r / (uFall[i].x * uFall[i].x)) * (1.0 - smoothstep(uFall[i].y * 0.5, uFall[i].y, r));
      sum += uTint[i] * (uK[uIdx[i]] * lambert * a);
    }
    if (max(sum.r, max(sum.g, sum.b)) < 0.002) discard;
    gl_FragColor = vec4(sum * texture2D(map, vUv).rgb, 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * Build the washes for `lamps` (Lights.floorLamps) and add them to `scene`. Returns { mesh, lamps } where lamps[i]
 * is the FloorLamp whose k goes into uniform i (Lights.update sets them); lamps without a wash are left out.
 */
export function buildLampWashes(scene, world, floorLamps) {
  const pos = [], nrm = [], lampPos = [], tint = [], fall = [], idx = [];
  const used = [], sources = []; // sources[i]: what wall-hung receivers need of lamp i
  const { x: SX, z: SZ } = world.size, [zN, zS] = W.facade;
  const levelOf = (d) => (d.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0);
  for (const f of floorLamps) {
    const s = f.spec;
    const k = s.wash ?? (s.glows?.length || !f.auto ? 0 : 1); // lamps with washes of their own (bench, hood …) opt in
    if (!k) continue;
    const lamp = f.room.lamps[0], level = lamp.level, i = used.length;
    used.push(f);
    const walls = world.levels[level].wallSegments;
    const segs = [...walls,
      ...world.doors.filter((d) => levelOf(d) === level).map((d) => d.segment()), // closed doors stop it (no quads on them)
      [0, zN, SX, zN], [SX, 0, SX, SZ], [SX, zS, 0, zS], [0, SZ, 0, 0]];       // the façades' inner faces (window gaps)
    // a lamp on a window board stands in the window's niche: its rays start just inside the room
    const ox = lamp.pos.x, oz = Math.min(Math.max(lamp.pos.z, zN + 0.05), zS - 0.05), y0 = LEVELS[level].floor, yC = y0 + LEVELS[level].ceiling;
    const c = new THREE.Color(lamp.color).multiplyScalar(W.strength * k * (lamp.intensity / LIGHTING.floorLamp.intensity));
    const range = Math.min(W.range, lamp.range ?? W.range);
    const push = (x, y, z, n) => {
      pos.push(x, y, z); nrm.push(...n); lampPos.push(lamp.pos.x, lamp.pos.y, lamp.pos.z);
      tint.push(c.r, c.g, c.b); fall.push(W.near, range); idx.push(i);
    };
    sources.push({ x: ox, z: oz, pos: lamp.pos, tint: c, range, level, segs });
    const hits = [];
    for (let r = 0; r < W.rays; r++) {
      const a = (r / W.rays) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      const h = cast(segs, ox, oz, dx, dz, range);
      hits.push({ x: ox + dx * h.t, z: oz + dz * h.t, wall: h.i >= 0 && h.i < walls.length ? h.i : -1 });
    }
    // floor and ceiling: fans from the lamp (the floor seen from above, the ceiling from below)
    for (let r = 0; r < W.rays; r++) {
      const p = hits[r], q = hits[(r + 1) % W.rays];
      push(ox, y0 + 0.009, oz, [0, 1, 0]); push(q.x, y0 + 0.009, q.z, [0, 1, 0]); push(p.x, y0 + 0.009, p.z, [0, 1, 0]);
      push(ox, yC - 0.009, oz, [0, -1, 0]); push(p.x, yC - 0.009, p.z, [0, -1, 0]); push(q.x, yC - 0.009, q.z, [0, -1, 0]);
    }
    // walls: a quad between neighbouring hits on the same wall face; where they land on two faces, each runs on to
    // the corner they share (no dark slit in the corner)
    const quad = (wi, ax, az, bx, bz) => {
      const [sx, sz, ex, ez] = walls[wi], len = Math.hypot(ex - sx, ez - sz);
      let nx = -(ez - sz) / len, nz = (ex - sx) / len;
      if ((ox - sx) * nx + (oz - sz) * nz < 0) { nx = -nx; nz = -nz; } // the face towards the lamp
      const e = 0.004, top = Math.min(ceilingAt(level, (ax + bx) / 2 + nx * 0.1, (az + bz) / 2 + nz * 0.1), yC) - 0.004;
      const A = [ax + nx * e, az + nz * e], B = [bx + nx * e, bz + nz * e], n = [nx, 0, nz];
      push(A[0], y0, A[1], n); push(B[0], y0, B[1], n); push(B[0], top, B[1], n);
      push(A[0], y0, A[1], n); push(B[0], top, B[1], n); push(A[0], top, A[1], n);
    };
    const corner = (wi, p, q) => { // the end of wall wi nearest p, if it is close enough to be the shared corner
      const [sx, sz, ex, ez] = walls[wi];
      const ds = Math.hypot(sx - p.x, sz - p.z), de = Math.hypot(ex - p.x, ez - p.z);
      const gap = Math.hypot(q.x - p.x, q.z - p.z) + 0.05;
      return ds < de ? (ds < gap ? [sx, sz] : null) : (de < gap ? [ex, ez] : null);
    };
    for (let r = 0; r < W.rays; r++) {
      const p = hits[r], q = hits[(r + 1) % W.rays];
      if (p.wall >= 0 && p.wall === q.wall) { quad(p.wall, p.x, p.z, q.x, q.z); continue; }
      if (p.wall >= 0) { const cp = corner(p.wall, p, q); if (cp) quad(p.wall, p.x, p.z, cp[0], cp[1]); }
      if (q.wall >= 0) { const cq = corner(q.wall, q, p); if (cq) quad(q.wall, cq[0], cq[1], q.x, q.z); }
    }
  }
  if (!used.length) return { mesh: null, lamps: used };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('lampPos', new THREE.Float32BufferAttribute(lampPos, 3));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('fall', new THREE.Float32BufferAttribute(fall, 2));
  g.setAttribute('idx', new THREE.Float32BufferAttribute(idx, 1));
  // where a fan would show in the air: the stair hole (Entréplan's ceiling, Övre plan's floor) and the soffits
  // (the ceiling fan is at the room's full height; under a lowered ceiling it would float below it)
  const h = STAIR.hole, f1 = LEVELS[1].floor;
  const cuts = [[[h.x0, h.z0, h.x1, h.z1], [LEVELS[0].floor + 1, f1 + 0.5, -1]], [[h.x0, h.z0, h.x1, h.z1], [f1 - 0.5, f1 + 0.5, 1]],
    ...SOFFITS.map((s) => [[s.x0, s.z0, s.x1, s.z1], [LEVELS[s.level].floor + s.height + 0.02, LEVELS[s.level].floor + LEVELS[s.level].ceiling + 0.5, -1]])];
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment,
    defines: { COUNT: used.length, CUTS: cuts.length },
    uniforms: {
      uK: { value: new Array(used.length).fill(0) },
      uCut: { value: cuts.map(([r]) => new THREE.Vector4(...r)) },
      uCutY: { value: cuts.map(([, y]) => new THREE.Vector3(...y)) },
      uWrap: { value: W.wrap },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'lamp washes';
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.raycast = () => {}; // never an E target or a surface for marks
  mesh.renderOrder = 1;    // after the AO overlays (renderOrder 0): light on top of the darkening
  scene.add(mesh);
  litReceivers(scene, sources, mat.uniforms.uK);
  return { mesh, lamps: used };
}

/** Give every `userData.washMap` mesh in `scene` the washes of the lamps that see it (see the top of the file). Its
 * uK uniform is the washes' own, so Lights.update fades them together. */
function litReceivers(scene, sources, uK) {
  scene.updateMatrixWorld(true);
  const recv = [];
  scene.traverse((m) => { if (m.isMesh && m.userData.washMap) recv.push(m); });
  for (const m of recv) {
    m.geometry.computeBoundingBox();
    const centre = m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
    const level = centre.y > LEVELS[1].floor - 0.2 ? 1 : 0;
    const px = centre.x + n.x * 0.05, pz = centre.z + n.z * 0.05; // just in front of it, clear of its own wall
    const lamps = [];
    sources.forEach((s, i) => {
      if (s.level !== level || centre.distanceTo(s.pos) > s.range) return;
      const dx = px - s.x, dz = pz - s.z, len = Math.hypot(dx, dz);
      if (len > 1e-3 && cast(s.segs, s.x, s.z, dx / len, dz / len, len).i >= 0) return; // a wall or a door between
      if ((s.pos.x - centre.x) * n.x + (s.pos.y - centre.y) * n.y + (s.pos.z - centre.z) * n.z <= 0) return; // behind it
      lamps.push([s, i]);
    });
    if (!lamps.length) { m.visible = false; continue; }
    m.material = new THREE.ShaderMaterial({
      vertexShader: litVertex, fragmentShader: litFragment,
      defines: { COUNT: uK.value.length, N: lamps.length },
      uniforms: {
        map: { value: m.userData.washMap }, uN: { value: n }, uWrap: { value: W.wrap }, uK,
        uPos: { value: lamps.map(([s]) => s.pos.clone()) },
        uTint: { value: lamps.map(([s]) => new THREE.Vector3(s.tint.r, s.tint.g, s.tint.b)) },
        uFall: { value: lamps.map(([s]) => new THREE.Vector2(W.near, s.range)) },
        uIdx: { value: lamps.map(([, i]) => i) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    m.renderOrder = 1;
    m.visible = true;
  }
}
