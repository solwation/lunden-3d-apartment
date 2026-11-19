import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AVATAR, GHOSTS } from './config.js';
import { patchDitherLod, lodRange } from './lod.js';

// #1966: other players far away as ONE draw call. Each ghost is a skinned figure of 4 – 5 k triangles in a draw call of its own
// (src/avatar.js); beyond AVATAR.poseFar it is not even posed any more. From GHOSTS.lod.start m its body fades (the dithered pixel
// fade of src/lod.js) into a simple standing figure of ~260 triangles, and beyond GHOSTS.lod.end only that is drawn: every far
// player is an instance of one InstancedMesh, coloured from the player's own look (skin, top, trousers, hair, shoes).
// Only a plain upright player gets the far body: one who sits, lies, swims, flies, cycles, dances, crouches or wears the suit
// keeps the real figure at any distance (`farBodyFits`). Name tags, vehicles and hand props are not touched.

const PARTS = { skin: 0, top: 1, pants: 2, hair: 3, shoes: 4 };

/** The far figure: boxes and a head, standing, feet at y = 0, facing +z as the avatar's own geometry; attribute `part` per vertex. */
export function farBodyGeometry() {
  const list = [];
  const put = (g, part, x, y, z) => {
    g = g.index ? g.toNonIndexed() : g;
    g.translate(x, y, z); g.deleteAttribute('uv');
    g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    list.push(g);
  };
  const box = (w, h, d, part, x, y, z) => put(new THREE.BoxGeometry(w, h, d), part, x, y, z);
  for (const s of [-1, 1]) {
    box(0.1, 0.07, 0.25, PARTS.shoes, s * 0.095, 0.035, 0.035);
    box(0.13, 0.84, 0.15, PARTS.pants, s * 0.095, 0.49, 0);
    box(0.09, 0.3, 0.1, PARTS.top, s * 0.245, 1.27, 0);   // upper arm (the sleeve)
    box(0.075, 0.33, 0.085, PARTS.skin, s * 0.25, 0.955, 0.01); // forearm and hand
  }
  box(0.34, 0.16, 0.19, PARTS.pants, 0, 0.93, 0);
  box(0.4, 0.44, 0.21, PARTS.top, 0, 1.22, 0);
  box(0.1, 0.08, 0.1, PARTS.skin, 0, 1.47, 0);
  put(new THREE.IcosahedronGeometry(0.115, 1), PARTS.skin, 0, 1.61, 0.005);
  put(new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), PARTS.hair, 0, 1.625, -0.012); // the hair as a cap
  const g = mergeGeometries(list);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Does a ghost in this state look right as the standing far figure? (`g`: a Ghost of ghosts.js.) */
export function farBodyFits(g) {
  return !g.pose && !g.gx && !g.bikeMesh && !g.air && !g.swim && !g.dance && !g.jp && !(g.crouch > 0.3) && !g.hug && !g.avatar?.suit;
}

const COLORS = ['cSkin', 'cTop', 'cPants', 'cHair', 'cShoes'], LOOK = ['skin', 'top', 'pants', 'hair', 'shoes'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

export class GhostFar {
  constructor(parent, { max = GHOSTS.max, lod = GHOSTS.lod } = {}) {
    this.lod = lod; this.enabled = true;
    this.range = lodRange(lod.start, lod.end);
    const geo = farBodyGeometry();
    for (const k of COLORS) geo.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(0.5), 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.name = 'ghost-far';
    mat.emissive.setScalar(AVATAR.emissiveSolid);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float part;\nattribute vec3 cSkin, cTop, cPants, cHair, cShoes;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = part < 0.5 ? cSkin : part < 1.5 ? cTop : part < 2.5 ? cPants : part < 3.5 ? cHair : cShoes;');
    };
    mat.customProgramCacheKey = () => 'ghost-far-v1';
    patchDitherLod(mat, { far: true, range: this.range });
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.name = 'ghost-far'; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; // (spread over the whole site)
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {};
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
    this.triangles = geo.attributes.position.count / 3;
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
    for (const g of ghosts) {
      const av = g.avatar, far = this.enabled && !!av.lodCentre && g.root.visible && farBodyFits(g), d = g.root.position.distanceTo(eye);
      av.lodCentre?.value.copy(far ? g.root.position : eye); // (not fitting: distance 0 to the shader, the real figure in full)
      av.object.visible = !(far && d > end + margin);
      if (!far || d < start - margin || n >= mesh.instanceMatrix.count) continue;
      _q.setFromAxisAngle(UP, g.root.rotation.y + Math.PI); _s.copy(av.object.scale); _s.x *= av.farWidth ?? 1; _s.z *= av.farWidth ?? 1; // (#2141: the build's old sideways factor)
      mesh.setMatrixAt(n, _m.compose(g.root.position, _q, _s));
      LOOK.forEach((k, i) => { _c.set(av.look[k] ?? 0x808080); mesh.geometry.attributes[COLORS[i]].setXYZ(n, _c.r, _c.g, _c.b); });
      n++;
    }
    if (n) { mesh.instanceMatrix.needsUpdate = true; for (const k of COLORS) mesh.geometry.attributes[k].needsUpdate = true; }
    mesh.count = n; mesh.visible = n > 0;
    return n;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
