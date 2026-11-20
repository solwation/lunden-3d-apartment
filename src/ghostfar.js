import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AVATAR, GHOSTS, GHOST_FAR, AVATAR_CLOTHES } from './config.js';
import { lampGlsl } from './avatarlight.js';
import { patchDitherLod, lodRange } from './lod.js';

// #1966: other players far away as ONE draw call. Each ghost is a skinned figure of 4 – 5 k triangles in a draw call of its own
// (src/avatar.js); beyond AVATAR.poseFar it is not even posed any more. From GHOSTS.lod.start m its body fades (the dithered pixel
// fade of src/lod.js) into a simple standing figure of ~260 triangles, and beyond GHOSTS.lod.end only that is drawn: every far
// player is an instance of one InstancedMesh, coloured from the player's own look (skin, top, trousers, hair, shoes).
// Only a plain upright player gets the far body: one who sits, lies, swims, flies, cycles, dances, crouches or wears the suit
// keeps the real figure at any distance (`farBodyFits`). Name tags, vehicles and hand props are not touched.

const PARTS = { skin: 0, top: 1, pants: 2, hair: 3, shoes: 4 };
const LIMB = { none: 0, leg: 1, arm: 2 };
// Hair variants (instance attribute `hair` = the look's style 0 – 4): 0 is the cap every figure has; a variant's vertices collapse unless it is the instance's.
const HAIRS = { cap: 0, long: 1, bun: 2, beanie: 3, curly: 4 };

/**
 * #2164: what a far figure takes from a player's look (the appearance code, `avatar.look`): [hair style 0 – 4, female 0 / 1, sleeves 0 short / 1 long /
 * 2 none, legs 0 long / 1 shorts / 2 wide / 3 skirt / 4 dress]. Missing, unknown or out-of-range tags give the defaults (short hair, male, short sleeves,
 * long trousers), as the near figure does.
 */
export function farLookAttributes(look) {
  const int = (v, lo, hi, d) => { const n = typeof v === 'number' || typeof v === 'string' ? Math.round(Number(v)) : NaN; return Number.isFinite(n) && n >= lo && n <= hi && v !== '' ? n : d; };
  const l = look ?? {}, cut = int(l.cut, 0, 9, 0);
  return [int(l.style, 0, 4, 0), int(l.gender ?? l.figure, 0, 1, 0), cut === 1 ? 2 : cut >= 2 || int(l.sleeves, 0, 1, 0) ? 1 : 0, int(l.legs, 0, 4, 0)];
}

/** The far figure: tapered lathe parts, standing, feet at y = 0, facing +z as the avatar's own geometry; attribute `pl` per vertex: [part, limb, hair variant]. */
export function farBodyGeometry() {
  const list = [];
  const put = (g, part, x, y, z, limb = 0, hair = 0, sx = 1, sz = 1) => {
    g = g.index ? g.toNonIndexed() : g;
    g.scale(sx, 1, sz); g.translate(x, y, z); g.deleteAttribute('uv');
    const n = g.attributes.position.count, pl = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pl[i * 3] = part; pl[i * 3 + 1] = limb; pl[i * 3 + 2] = hair; }
    g.setAttribute('pl', new THREE.BufferAttribute(pl, 3));
    list.push(g);
  };
  const box = (w, h, d, part, x, y, z) => put(new THREE.BoxGeometry(w, h, d), part, x, y, z);
  const lathe = (pts, seg, part, x, limb, sx = 1, sz = 1) => put(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), part, x, 0, 0, limb, 0, sx, sz);
  const H = GHOST_FAR.hem;
  for (const s of [-1, 1]) {
    box(0.1, 0.07, 0.25, PARTS.shoes, s * 0.095, 0.035, 0.035);
    lathe([[0.042, 0.07], [0.052, 0.3], [0.05, H - 0.005], [0.05, H + 0.005], [0.066, 0.75], [0.078, 0.93]], 6, PARTS.pants, s * 0.095, LIMB.leg, 1, 1.05); // thigh to ankle; the hem rings let a skirt flare from the hem
    lathe([[0.052, 1.43], [0.048, 1.3], [0.043, 1.2], [0.04, 1.12], [0.034, 0.95], [0.03, 0.88], [0.036, 0.82]], 6, PARTS.skin, s * 0.235, LIMB.arm); // shoulder to hand; sleeve / skin is cut per fragment
  }
  lathe([[0.16, 0.84], [0.158, 0.97]], 8, PARTS.pants, 0, LIMB.none, 1.2, 0.66); // the hips
  lathe([[0.152, 0.96], [0.15, 1.06], [0.172, 1.22], [0.18, 1.37], [0.16, 1.45], [0.0001, 1.47]], 8, PARTS.top, 0, LIMB.none, 1.14, 0.62); // waist, chest, shoulders
  put(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6, 1, true), PARTS.skin, 0, 1.49, 0);
  put(new THREE.IcosahedronGeometry(0.115, 1).scale(0.95, 1.12, 1), PARTS.skin, 0, 1.615, 0.005); // (the head: an egg)
  const cap = (r, part, hair, y, z, sy = 1) => put(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, sy, 1), part, 0, y, z, 0, hair);
  cap(0.125, PARTS.hair, HAIRS.cap, 1.625, -0.012);
  put(new THREE.CylinderGeometry(0.155, 0.125, 0.34, 10, 1, true, Math.PI / 2 - 0.35, Math.PI + 0.7), PARTS.hair, 0, 1.45, -0.012, 0, HAIRS.long, 1, 0.85); // long hair: a sheet down the back and round the sides to the ears, never across the face
  put(new THREE.SphereGeometry(0.055, 6, 4), PARTS.hair, 0, 1.705, -0.115, 0, HAIRS.bun);
  cap(0.14, PARTS.top, HAIRS.beanie, 1.615, -0.012);
  cap(0.15, PARTS.hair, HAIRS.curly, 1.625, -0.012, 0.95); // curls: a fuller cap (a whole ball would cover the face)
  const g = mergeGeometries(list);
  g.computeBoundingSphere();
  return g;
}

/** Does a ghost in this state look right as the standing far figure? (`g`: a Ghost of ghosts.js.) */
export function farBodyFits(g) {
  return !g.pose && !g.gx && !g.bikeMesh && !g.air && !g.swim && !g.dance && !g.jp && !(g.crouch > 0.3) && !g.hug && !g.avatar?.suit;
}

const COLORS = ['cSkin', 'cTop', 'cPants', 'cHair', 'cShoes'], LOOK = ['skin', 'top', 'pants', 'hair', 'shoes'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
const f = (v) => Number(v).toFixed(4);

/** The vertex / fragment edits (#2164): colour per part with the sleeve / hem cut per fragment, hair variants, shorts / skirt / wide legs, the female
 * outline, the gait swing and the near figure's light level (`uLight`, the street lamps) from instance attributes `cFig` and `cDyn`. */
function patchFar(sh) {
  const G = GHOST_FAR, F = G.female, W = G.swing, C = G.sleeveCut, wide = AVATAR_CLOTHES.legs.wide;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec3 pl; attribute vec4 cFig, cDyn; attribute vec3 cSkin, cTop, cPants, cHair, cShoes;
varying vec3 vColA, vColB; varying float vCut, vFy, vFLight, vFLamp;
float fsA = 0.0, fsPiv = 0.0;`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
if (pl.y > 0.5) {
  float sd = position.x < 0.0 ? -1.0 : 1.0;
  fsPiv = pl.y < 1.5 ? 0.93 : 1.42;
  fsA = cDyn.z * (pl.y < 1.5 ? ${f(W.leg)} : -${f(W.arm)}) * sd * sin(cDyn.w);
  float fc = cos(fsA), fs = sin(fsA);
  objectNormal.yz = vec2(fc * objectNormal.y - fs * objectNormal.z, fs * objectNormal.y + fc * objectNormal.z);
}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float fy = position.y, sd = position.x < 0.0 ? -1.0 : 1.0, legs = cFig.w, fem = cFig.y;
  float pt = pl.x;
  vec3 base = pt < 0.5 ? cSkin : pt < 1.5 ? cTop : pt < 2.5 ? cPants : pt < 3.5 ? cHair : cShoes;
  vColA = base; vColB = base; vCut = -9.0; vFy = fy; vFLight = cDyn.x; vFLamp = cDyn.y;
  if (pl.y > 0.5 && pl.y < 1.5) { // a leg: shorts and skirts end at the hem, a skirt flares, wide trousers widen
    vColA = legs > 3.5 ? cTop : cPants; vColB = cSkin; vCut = (legs > 0.5 && legs < 1.5) || legs > 2.5 ? ${f(G.hem)} : -9.0;
    if (legs > 2.5 && fy > ${f(G.hem - 0.006)}) { float k = 1.0 + ${f(G.flare - 1)} * clamp((0.93 - fy) / ${f(0.93 - G.hem)}, 0.0, 1.0); transformed.xz *= k; }
    else if (legs > 1.5 && legs < 2.5) { transformed.x = sd * 0.095 + (position.x - sd * 0.095) * ${f(wide)}; transformed.z *= ${f(wide * 0.9)}; }
  } else if (pl.y > 1.5) { // an arm: the sleeve covers it above the cut
    vColA = cTop; vColB = cSkin; vCut = cFig.z < 0.5 ? ${f(C[0])} : cFig.z < 1.5 ? ${f(C[1])} : ${f(C[2])};
    transformed.x -= sd * fem * ${f(F.arm)};
  } else if (pt > 0.5 && pt < 2.5 && fy < 1.46) { // hips and torso: a female outline has narrower shoulders and wider hips
    transformed.x *= 1.0 - fem * (${f(F.shoulder)} * smoothstep(1.2, 1.42, fy) - ${f(F.hip)} * (1.0 - smoothstep(0.86, 1.1, fy)));
  }
  if (pl.y > 0.5) { // the gait: legs and arms swing about the hip / shoulder (the normal above)
    float fc = cos(fsA), fs = sin(fsA), py = transformed.y - fsPiv;
    transformed.yz = vec2(fc * py - fs * transformed.z + fsPiv, fs * py + fc * transformed.z);
  }
  if (pl.z > 0.5 && abs(pl.z - cFig.x) > 0.5) transformed = vec3(0.0); // another hair style's vertices collapse to nothing
}`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vColA, vColB; varying float vCut, vFy, vFLight, vFLamp;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vFy > vCut ? vColA : vColB;')
    .replace('#include <opaque_fragment>', `outgoingLight *= vFLight; // the near figure's light level (src/avatarlight.js)
{ float uLamp = vFLamp; ${lampGlsl()}
}
#include <opaque_fragment>`);
}

export class GhostFar {
  constructor(parent, { max = GHOSTS.max, lod = GHOSTS.lod } = {}) {
    this.lod = lod; this.enabled = true;
    this.range = lodRange(lod.start, lod.end);
    const geo = farBodyGeometry();
    const inst = (name, n, fill = 0) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(max * n).fill(fill), n).setUsage(THREE.DynamicDrawUsage));
    for (const k of COLORS) inst(k, 3, 0.5);
    inst('cFig', 4); inst('cDyn', 4);
    const mat = new THREE.MeshLambertMaterial();
    mat.name = 'ghost-far';
    mat.emissive.setScalar(AVATAR.emissiveSolid);
    mat.onBeforeCompile = patchFar;
    mat.customProgramCacheKey = () => 'ghost-far-v2';
    patchDitherLod(mat, { far: true, range: this.range });
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.name = 'ghost-far'; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; // (spread over the whole site)
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {};
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
    this.triangles = geo.attributes.position.count / 3;
    this.at = 0;
  }

  /** A ghost's avatar fades out by distance from now on (before its material is first compiled). */
  adopt(avatar) {
    if (!avatar?.material || avatar.lodCentre) return;
    avatar.lodCentre = { value: new THREE.Vector3() };
    patchDitherLod(avatar.material, { far: false, range: this.range, centre: avatar.lodCentre });
  }

  /** Per frame, after the ghosts are placed: which draw as the far figure, which as themselves, which as both (the zone). */
  update(ghosts, eye) {
    const { start, end, margin } = this.lod, mesh = this.mesh;
    let n = 0;
    const now = performance.now(), dt = this.at ? Math.min(0.25, (now - this.at) / 1000) : 0; this.at = now;
    const geo = mesh.geometry.attributes, W = GHOST_FAR.swing;
    for (const g of ghosts) {
      const av = g.avatar, far = this.enabled && !!av.lodCentre && g.root.visible && farBodyFits(g), d = g.root.position.distanceTo(eye);
      av.lodCentre?.value.copy(far ? g.root.position : eye); // (not fitting: distance 0 to the shader, the real figure in full)
      av.object.visible = !(far && d > end + margin);
      if (!far || d < start - margin || n >= mesh.instanceMatrix.count) continue;
      _q.setFromAxisAngle(UP, g.root.rotation.y + Math.PI); _s.copy(av.object.scale); _s.x *= av.farWidth ?? 1; _s.z *= av.farWidth ?? 1; // (#2141: the build's old sideways factor)
      mesh.setMatrixAt(n, _m.compose(g.root.position, _q, _s));
      LOOK.forEach((k, i) => { _c.set(av.look[k] ?? 0x808080); geo[COLORS[i]].setXYZ(n, _c.r, _c.g, _c.b); });
      const [hair, female, sleeves, legs] = farLookAttributes(av.look), u = av.material?.userData?.u, sp = Math.max(0, g.speed ?? 0);
      g.farPhase = ((g.farPhase ?? n * 1.7) + dt * sp * W.perMetre) % (Math.PI * 2); // (the stride advances with the ground covered)
      geo.cFig.setXYZW(n, hair, female, sleeves, legs);
      geo.cDyn.setXYZW(n, u?.uLight?.value ?? 1, u?.uLamp?.value ?? 0, sp > AVATAR.walkSpeed ? Math.min(W.maxFactor, sp / W.speedRef) : 0, g.farPhase);
      n++;
    }
    if (n) { mesh.instanceMatrix.needsUpdate = true; for (const k of [...COLORS, 'cFig', 'cDyn']) geo[k].needsUpdate = true; }
    mesh.count = n; mesh.visible = n > 0;
    return n;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
