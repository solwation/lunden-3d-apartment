import * as THREE from 'three';
import { FOLIAGE as F } from './config.js';
import { lowMemory } from './lowmemory.js';

// Tree crowns and shrubs out of leaf cards (#679): instead of a flat-shaded icosahedron, every crown lobe is a slightly
// lumpy opaque leaf mass (the "core", so a crown still reads as a full volume when the mipmapped cards thin out at a
// distance) wrapped in alpha-tested leaf-cluster cards that give it a ragged silhouette and let light through at the
// edge. Normals point out from the lobe's centre (soft, round shading, no facets) with a little per-card jitter; vertex
// colours darken the underside and the inside (a cheap ambient occlusion). One shared 4-cell atlas (three leaf clusters
// + the opaque core), one material: still one InstancedMesh = one draw call per batch, and seasons.js keeps colouring
// and shrinking the instances as before. The cards are single quads drawn two-sided, the back lit like the front (the
// material keeps three from flipping the normal), so a lobe costs no more triangles than the old icosahedron. Shadows: three's depth material
// copies `map` + `alphaTest`, so the cards cast lacy shadows. Trunks: tapered, with branches up into the crown, a small
// tileable bark texture (birches white with dark streaks); in winter (no leaves) the branches carry the silhouette.

/** A tiny seeded random generator, so the atlas and the geometry are the same on every load. */
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

let atlasTex = null;
/** The shared leaf atlas (2 × 2 cells: 0–2 leaf clusters, 3 the opaque core), `F.atlas` px (`F.atlasPhone` on phones). */
export function leafAtlas() {
  if (atlasTex) return atlasTex;
  const S = lowMemory ? F.atlasPhone : F.atlas, H = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(679);
  /** One leaf: a pointed oval of length l, width w at (x, y), angle a, brightness v. */
  const leaf = (x, y, l, w, a, v, rib = true) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const k = Math.round(v * 255);
    g.fillStyle = `rgb(${Math.round(k * 0.96)},${k},${Math.round(k * 0.86)})`;
    g.beginPath(); g.moveTo(-l / 2, 0);
    g.quadraticCurveTo(-l * 0.1, -w, l / 2, 0); g.quadraticCurveTo(-l * 0.1, w, -l / 2, 0); g.fill();
    if (rib && l > 6) { g.strokeStyle = `rgba(0,0,0,0.18)`; g.lineWidth = Math.max(0.6, S / 700); g.beginPath(); g.moveTo(-l / 2, 0); g.lineTo(l * 0.4, 0); g.stroke(); }
    g.restore();
  };
  const twig = (x0, y0, x1, y1) => { g.strokeStyle = 'rgb(120,108,96)'; g.lineWidth = Math.max(1, S / 260); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  // cells 0–2: clusters on a transparent ground, leaves thinning towards the edge (a ragged outline), lighter on top
  const kinds = [{ n: 230, l: 0.1, w: 0.04 }, { n: 340, l: 0.07, w: 0.028 }, { n: 190, l: 0.12, w: 0.036 }];
  kinds.forEach(({ n, l, w }, cell) => {
    const ox = (cell % 2) * H, oy = Math.floor(cell / 2) * H, cx = ox + H / 2, cy = oy + H / 2;
    g.save(); g.beginPath(); g.rect(ox + 1, oy + 1, H - 2, H - 2); g.clip();
    for (let i = 0; i < 7; i++) { const a = r() * 6.28; twig(cx, cy + H * 0.2, cx + Math.cos(a) * H * 0.38, cy + Math.sin(a) * H * 0.38); }
    for (let i = 0; i < n; i++) {
      const rad = Math.sqrt(r()) * H * 0.46, a = r() * 6.28, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.92;
      const top = 1 - (y - oy) / H; // 1 at the top of the cell
      leaf(x, y, l * H * (0.75 + r() * 0.5), w * H * (0.75 + r() * 0.5), r() * 6.28, F.leafLight[0] + (F.leafLight[1] - F.leafLight[0]) * (0.35 * top + 0.65 * r()));
    }
    g.restore();
  });
  // cell 3: the core — a darker, dense leaf mass (tiles: leaves are wrapped round the edges) with small leaf-shaped holes
  // (`F.coreHoles`), so even the core has a lacy edge and no smooth surface; mipmaps stay above the cut-off
  { const ox = H, oy = H;
    g.fillStyle = `rgb(${Math.round(F.coreGround * 0.96 * 255)},${Math.round(F.coreGround * 255)},${Math.round(F.coreGround * 0.86 * 255)})`;
    g.fillRect(ox, oy, H, H);
    g.save(); g.beginPath(); g.rect(ox, oy, H, H); g.clip();
    for (let i = 0; i < 700; i++) {
      const x = ox + r() * H, y = oy + r() * H, l = 0.055 * H * (0.7 + r() * 0.6), a = r() * 6.28, v = F.coreGround + r() * (F.leafLight[1] - F.coreGround) * 0.8;
      for (const dx of [-H, 0, H]) for (const dy of [-H, 0, H]) leaf(x + dx, y + dy, l, l * 0.38, a, v, false);
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < F.coreHoles; i++) {
      const x = ox + r() * H, y = oy + r() * H, l = 0.05 * H * (0.6 + r() * 0.8), a = r() * 6.28;
      for (const dx of [-H, 0, H]) for (const dy of [-H, 0, H]) leaf(x + dx, y + dy, l, l * 0.4, a, 1, false);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore(); }
  // a texture from the pixels themselves (not the canvas): transparent pixels get the average leaf colour instead of the
  // canvas' premultiplied black, so the mipmaps do not grow dark rims round every leaf
  const d = g.getImageData(0, 0, S, S).data, px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) { // bottom row first (what flipY does for a canvas), so uv v = 1 is the canvas' top
    const src = y * S * 4, dst = (S - 1 - y) * S * 4;
    for (let i = 0; i < S * 4; i += 4) {
      const a = d[src + i + 3];
      if (a < 8) { px[dst + i] = 196; px[dst + i + 1] = 204; px[dst + i + 2] = 176; px[dst + i + 3] = 0; }
      else for (let k = 0; k < 4; k++) px[dst + i + k] = d[src + i + k];
    }
  }
  c.width = c.height = 1; // the pixels live in the texture now
  const tex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace; // a linear tint mask: its greys multiply the instance colours as they are
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  atlasTex = tex;
  return tex;
}

let leafMat = null;
/** The one leaf material: white (instance colours tint it; tools/riverparktest finds crowns by the white colour), alpha-tested. */
export function leafMaterial() {
  if (leafMat) return leafMat;
  // Two-sided cards from single quads: DoubleSide, but the back of a card keeps the front's (radial) normal instead of
  // three's flipped one, so a crown is lit as one soft volume from both sides; both sides cast shadows
  leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leafAtlas(), alphaTest: F.alphaTest, roughness: 0.92, vertexColors: true,
    side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  leafMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
  };
  leafMat.customProgramCacheKey = () => 'foliage-leaves-v1';
  leafMat.name = 'foliage-leaves';
  return leafMat;
}

const lobes = new Map();
/**
 * A crown lobe of radius 1 round the origin (scaled per instance like the old icosahedron): `level` 'tree' | 'shrub' |
 * 'far' picks the number of cards (`F.cards`, fewer on phones). Cached per level.
 */
export function lobeGeometry(level = 'tree') {
  const key = `${level}|${lowMemory}`;
  if (lobes.has(key)) return lobes.get(key);
  const r = rng(level === 'tree' ? 11 : level === 'shrub' ? 23 : 37);
  const pos = [], nor = [], uv = [], col = [];
  const occl = (p) => { // darker below and inside: F.bright at the top outside, F.ao × F.bright at the bottom centre
    const t = THREE.MathUtils.clamp((p.y + 1) / 2, 0, 1), out = THREE.MathUtils.clamp((p.length() - F.core * 0.8) / (1 - F.core * 0.8), 0, 1);
    return F.bright * (F.ao + (1 - F.ao) * (0.65 * t + 0.35 * out));
  };
  const push = (p, n, u, v, shade = 1) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u, v); const k = occl(p) * shade; col.push(k, k, k); };
  // the core: a lumpy icosphere (three builds it non-indexed), radial normals, the opaque atlas cell wrapped round it
  const core = new THREE.IcosahedronGeometry(F.core, F.coreDetail[level]), cp = core.attributes.position;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), jv = new THREE.Vector3();
  const lump = (v) => 1 + F.lump * (Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1));
  const inset = 0.03; // keep clear of the neighbouring cells (their transparent ground would bleed into the mipmaps)
  for (let i = 0; i < cp.count; i++) {
    const v = p.fromBufferAttribute(cp, i);
    // radial, but each vertex nudged its own way (F.coreJitter): blotchy light and shade instead of a smooth ball
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    n.copy(v).normalize().add(jv.set(Math.sin(h), Math.sin(h * 1.7), Math.sin(h * 2.3)).multiplyScalar(F.coreJitter)).normalize();
    // a seamless (if stretched) projection into cell 3 (u 0.5–1, v 0–0.5): it is only a noise of leaves
    const fu = (n.x + 0.5 * n.z + 1.5) / 3, fv = (n.y + 0.3 * n.z + 1.3) / 2.6;
    push(v.multiplyScalar(lump(v)), n, 0.5 + inset + fu * (0.5 - 2 * inset), inset + fv * (0.5 - 2 * inset), F.coreShade);
  }
  core.dispose();
  // the cards: leaf clusters on the shell, tilted off the tangent plane so the outline is ragged from every side
  const cards = F.cards[level][lowMemory ? 1 : 0];
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 0; i < cards; i++) {
    // even-ish spread over the sphere (a Fibonacci spiral, jittered), a little more of them on top
    const k = (i + 0.5) / cards, y = 1 - 2 * Math.pow(k, 0.92), rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + r() * 0.6;
    n.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    c.copy(n).multiplyScalar(F.shell[0] + r() * (F.shell[1] - F.shell[0]));
    // the card's plane: the tangent plane tilted by up to F.tilt about a random tangent axis, spun round the normal
    t1.crossVectors(Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, n).normalize();
    t2.crossVectors(n, t1);
    q.setFromAxisAngle(n, r() * 6.28); t1.applyQuaternion(q); t2.applyQuaternion(q);
    q.setFromAxisAngle(t1, (r() - 0.5) * 2 * F.tilt); t2.applyQuaternion(q);
    const s = F.size * (0.8 + r() * 0.45) / 2, cell = Math.floor(r() * 3), u0 = (cell % 2) * 0.5, v0 = cell < 2 ? 0.5 : 0; // flipY: cells 0/1 are the top row
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a1, a2]) => c.clone().addScaledVector(t1, a1 * s).addScaledVector(t2, a2 * s));
    const uvs = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]];
    const jit = new THREE.Vector3((r() - 0.5) * F.jitter, (r() - 0.5) * F.jitter, (r() - 0.5) * F.jitter);
    const normal = (pp) => n.clone().multiplyScalar(0.5).add(pp.clone().normalize().multiplyScalar(0.5)).add(jit).normalize();
    for (const j of [0, 1, 2, 0, 2, 3]) push(corners[j], normal(corners[j]), ...uvs[j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  geo.userData.foliage = 'lobe';
  geo.name = `foliage-lobe-${level}`;
  lobes.set(key, geo);
  return geo;
}

/** A tileable bark texture (`F.bark` px): grey-brown furrows, or a birch's white with dark streaks. Cached per kind. */
const barks = new Map();
export function barkTexture(kind = 'bark') {
  if (barks.has(kind)) return barks.get(kind);
  const S = F.bark, c = document.createElement('canvas');
  c.width = S; c.height = S * 2;
  const g = c.getContext('2d'), r = rng(kind === 'birch' ? 5 : 3);
  if (kind === 'birch') {
    g.fillStyle = '#ebe7de'; g.fillRect(0, 0, S, S * 2);
    for (let i = 0; i < 26; i++) { // the dark horizontal lenticels and the black patches of a birch
      const y = r() * S * 2, x = r() * S, w = S * (0.08 + r() * 0.35), h = 1 + r() * 3.5;
      g.fillStyle = r() < 0.3 ? 'rgba(25,24,22,0.85)' : 'rgba(70,66,60,0.6)';
      for (const dx of [-S, 0, S]) g.fillRect(x + dx, y, w, h);
    }
  } else {
    g.fillStyle = '#b4b0aa'; g.fillRect(0, 0, S, S * 2); // greys: the material colour tints it
    for (let i = 0; i < 40; i++) { // long vertical furrows, wrapped round
      const x = r() * S, w = 1 + r() * 3, k = Math.round(60 + r() * 50);
      g.fillStyle = `rgba(${k},${k},${k},0.55)`;
      for (const dx of [-S, 0, S]) g.fillRect(x + dx, 0, w, S * 2);
    }
    for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S * 2, k = Math.round(110 + r() * 50); g.fillStyle = `rgba(${k},${k - 12},${k - 26},0.35)`; g.fillRect(x, y, 2 + r() * 4, 4 + r() * 10); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  barks.set(kind, tex);
  return tex;
}

/**
 * A trunk of height 1 from y 0 (scaled per instance like the old cylinder): tapering from `F.trunk.base` to `F.trunk.top`,
 * with `F.trunk.branches` branches leaving it in its upper part and reaching up into the crown (local units: the trunk's
 * instance scale stretches them with the tree). One merged geometry, one draw call per batch as before.
 */
let trunkGeo = null;
export function trunkGeometry() {
  if (trunkGeo) return trunkGeo;
  const T = F.trunk, r = rng(97), parts = [];
  // open-ended: the foot is in the ground, the top inside the crown (or hidden by the branches in winter)
  const stem = new THREE.CylinderGeometry(T.top, T.base, 1, T.sides, 1, true).translate(0, 0.5, 0);
  parts.push(stem);
  const up = new THREE.Vector3(0, 1, 0);
  /** A tapering limb from `start` to `end` (radii r0 → r1), `sides` round, open (its ends are buried). */
  const limb = (start, end, r0, r1, sides) => {
    const v = end.clone().sub(start), len = v.length();
    const b = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0);
    b.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, v.normalize())).translate(start.x, start.y, start.z);
    parts.push(b);
  };
  limb(new THREE.Vector3(0, 0.98, 0), new THREE.Vector3(0.02, 1 + T.rise, 0), T.top, T.top * 0.05, 3); // the leader: no open top
  for (let i = 0; i < T.branches; i++) {
    // main branches round the trunk, out and up (local units: the instance's y scale is ~3× its x/z, so a small `rise`
    // still climbs steeply), the first `T.forks` forking once near the end
    const a = (i / T.branches) * 6.28 + r() * 0.9, y0 = T.from + r() * (1 - T.from) * 0.85, k = 0.75 + r() * 0.5;
    const start = new THREE.Vector3(0, y0, 0), end = new THREE.Vector3(Math.cos(a) * T.reach * k, y0 + T.rise * k, Math.sin(a) * T.reach * k);
    limb(start, end, T.top * 0.6, T.top * 0.08, 3); // to a point: no open tip shows
    const fork = start.clone().lerp(end, 0.6), b = a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), l = T.reach * 0.55;
    if (i < T.forks) limb(fork, fork.clone().add(new THREE.Vector3(Math.cos(b) * l, T.rise * 0.9, Math.sin(b) * l)), T.top * 0.3, T.top * 0.03, 3);
  }
  // merge by hand (all non-indexed): keeps the module free of the addon import
  const flat = parts.map((p) => p.toNonIndexed());
  const count = flat.reduce((s, p) => s + p.attributes.position.count, 0);
  const geo = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(count * size); let o = 0;
    for (const p of flat) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  parts.forEach((p) => p.dispose()); flat.forEach((p) => p.dispose());
  geo.computeBoundingSphere();
  geo.name = 'foliage-trunk';
  trunkGeo = geo;
  return geo;
}

/** The bark material for a trunk batch: `kind` 'bark' | 'birch'. */
export function barkMaterial(kind = 'bark') {
  const tex = barkTexture(kind);
  return new THREE.MeshStandardMaterial({ color: kind === 'birch' ? F.trunk.birchColor : F.trunk.color, map: tex, roughness: kind === 'birch' ? 0.85 : 1 });
}
