import * as THREE from 'three';
import { MARKS as K } from './config.js';
import { TriGrid } from './trigrid.js';

// Marks on surfaces (#96): burn marks from the lightsaber, and the shared decal system the wands (stars,
// butterflies) and the Nerf darts (paint splashes) use. A mark is a small flat quad just off the surface
// the ray hit, along its normal, at a random turn and size. Cheap: one instanced mesh per kind (hidden
// while it has none), canvas textures, one ring buffer of at most K.max marks in all (the oldest goes),
// a per-instance fade attribute, no lights. A mark on something F hides (furniture) hides with it; nothing
// is saved, so a reload clears them. A puff of smoke = one small Points cloud.

const canvas = (n, draw) => {
  const c = document.createElement('canvas'); c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const blob = (g, x, y, r, inner, outer) => {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, inner); rg.addColorStop(1, outer);
  g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
};

const TEXTURES = {
  // scorched: a ragged black-brown blot, a darker slash through it
  burn: () => canvas(128, (g, n) => {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * n * 0.18;
      blob(g, n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, n * (0.14 + Math.random() * 0.16), 'rgba(28,18,12,0.55)', 'rgba(40,26,16,0)');
    }
    g.strokeStyle = 'rgba(8,6,5,0.85)'; g.lineCap = 'round'; g.lineWidth = n * 0.07;
    g.beginPath(); g.moveTo(n * 0.2, n * 0.55); g.quadraticCurveTo(n * 0.5, n * 0.45, n * 0.8, n * 0.5); g.stroke();
  }),
  // the hot edge right after the hit (additive, fades in a second)
  glow: () => canvas(64, (g, n) => {
    const rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    rg.addColorStop(0, 'rgba(255,120,30,0)'); rg.addColorStop(0.45, 'rgba(255,140,40,0.9)'); rg.addColorStop(0.7, 'rgba(255,80,10,0.4)'); rg.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, n, n);
  }),
  // white shapes, tinted per mark (instance colour)
  star: () => canvas(64, (g, n) => {
    blob(g, n / 2, n / 2, n / 2, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)');
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.17 : 0.42) * n, a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r); }
    g.fill();
  }),
  butterfly: () => canvas(64, (g, n) => {
    g.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(n / 2 + s * n * 0.2, n * 0.36, n * 0.19, n * 0.15, s * 0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(n / 2 + s * n * 0.15, n * 0.66, n * 0.13, n * 0.11, -s * 0.4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#333'; g.fillRect(n * 0.48, n * 0.25, n * 0.04, n * 0.55);
  }),
  splash: () => canvas(64, (g, n) => {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(n / 2, n / 2, n * 0.2, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, d = n * (0.18 + Math.random() * 0.22), r = n * (0.03 + Math.random() * 0.06);
      g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
  }),
};

/** A material whose alpha is multiplied by the per-instance `fade` attribute. */
function fadeMaterial(Mat, opts) {
  const m = new Mat({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...opts });
  m.onBeforeCompile = (s) => {
    s.vertexShader = 'attribute float fade;\nvarying float vFade;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
    s.fragmentShader = 'varying float vFade;\n' + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  return m;
}

/** Is `o` drawn (itself and every parent visible)? */
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

const Z = new THREE.Vector3(0, 0, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), sv = new THREE.Vector3();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class Marks {
  /** `surfaces`: roots whose meshes take marks; `cat` (optional): a hit on it is a meow instead. */
  constructor(scene, camera, surfaces = [], cat = null) {
    Object.assign(this, { surfaces, cat, live: [], lastAt: new THREE.Vector3(1e9, 0, 0), lastT: -1, clock: 0 });
    this.ray = new THREE.Raycaster();
    this.ray.camera = camera; // sprites need it (they are looked through anyway)
    this.kinds = {};
    for (const [kind, k] of Object.entries(K.kinds)) {
      const lit = kind === 'burn' || kind === 'splash' || kind === 'butterfly'; // paint and soot take the light
      const mat = fadeMaterial(lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial, {
        map: TEXTURES[kind](), ...(kind === 'glow' || kind === 'star' ? { blending: THREE.AdditiveBlending, toneMapped: false } : {}) });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, K.max);
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(K.max), 1);
      mesh.geometry.setAttribute('fade', fade);
      for (let i = 0; i < K.max; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.visible = false;
      mesh.renderOrder = 2; // after the AO overlays
      scene.add(mesh);
      this.kinds[kind] = { ...k, mesh, fade, free: [...Array(K.max).keys()].reverse() };
    }
    this.smoke = new Smoke(scene);
  }

  /** How many marks there are now (glows included). */
  get count() { return this.live.length; }

  /**
   * The first thing on the segment from → to: { point, normal, object } on a surface that takes marks,
   * { cat: true } for the cat, or null (nothing, or something that takes none: glass, a door, a lid …).
   * Overlays (the AO multiply layer, additive glows) and hidden things are looked through.
   */
  hit(from, to) {
    const all = this.segment(from, to, this.cat?.visible ? [...this.meshes(), ...catMeshes(this.cat)] : this.meshes());
    for (const h of all) {
      const o = h.object;
      if (!shown(o)) continue;
      const m = Array.isArray(o.material) ? o.material[h.materialIndex ?? 0] : o.material;
      if (!m || m.blending === THREE.CustomBlending || m.blending === THREE.AdditiveBlending) continue;
      if (this.cat && isUnder(o, this.cat.object)) return { cat: true, point: h.point };
      if (o.isInstancedMesh || m.transparent || moving(o)) return null; // glass, plants, doors, lids, things that move
      const normal = h.normal.clone();
      if (normal.dot(this.ray.ray.direction) > 0) normal.negate(); // double-sided: the side we look at
      return { point: h.point.clone(), normal, object: o };
    }
    return null;
  }

  /** The meshes under the surface roots (collected once; visibility is checked per hit). */
  meshes() {
    if (!this.list) {
      this.list = [];
      for (const r of this.surfaces) r.traverse((o) => { if (o.isMesh && !Object.hasOwn(o, 'raycast')) this.list.push(o); }); // not the ones that opted out
    }
    return this.list;
  }

  /**
   * Every hit on the segment from → to among `meshes`, nearest first: { distance, point, normal (world),
   * object, materialIndex }. Big static meshes go through a TriGrid (trigrid.js), the rest through three.
   */
  segment(from, to, meshes) {
    const dir = sv.subVectors(to, from), far = dir.length(), out = [];
    if (far < 1e-4) return out;
    this.ray.set(from, dir.normalize());
    this.ray.far = far;
    segBox.setFromPoints([from, to]);
    for (const o of meshes) {
      if (!moving(o) && !o.isInstancedMesh && !o.isSkinnedMesh && triCount(o) >= 200) {
        let g = grids.get(o);
        if (!g) grids.set(o, (g = new TriGrid(o)));
        g.hits(this.ray.ray, far, segBox, o.material.side, out);
        continue;
      }
      if (!moving(o)) { // a cheap box test first (static: its world box once)
        let b = boxes.get(o);
        if (!b) boxes.set(o, (b = new THREE.Box3().setFromObject(o)));
        if (!b.intersectsBox(segBox)) continue;
      }
      for (const h of this.ray.intersectObject(o, false)) {
        if (!h.face) continue;
        out.push({ distance: h.distance, point: h.point, normal: h.face.normal.clone().transformDirection(o.matrixWorld), object: o, materialIndex: h.face.materialIndex });
      }
    }
    return out.sort((x, y) => x.distance - y.distance);
  }

  /** Does a quad of size s at p (turned `a` about n) lie flat on `obj`? (No overhang at an edge or corner.) */
  fits(obj, p, n, s, a) {
    q.setFromUnitVectors(Z, n).multiply(qs.setFromAxisAngle(Z, a));
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = new THREE.Vector3(u * s * 0.4, v * s * 0.4, 0).applyQuaternion(q).add(p).addScaledVector(n, 0.02);
      const h = this.segment(c, c.clone().addScaledVector(n, -0.04), [obj])[0];
      if (!h || Math.abs(h.distance - 0.02) > 0.008) return false;
    }
    return true;
  }

  /**
   * A mark of `kind` at a hit from hit(): { point, normal, object }. opts: color (hex), size, force (skip
   * the spacing rule). Returns false if it was too close to the last one or would hang over an edge.
   */
  add(kind, { point, normal, object }, { color = 0xffffff, size, force = false } = {}) {
    const k = this.kinds[kind];
    if (!force && (this.clock - this.lastT < K.every || point.distanceTo(this.lastAt) < K.gap)) return false;
    let s = (size ?? k.size) * (0.75 + Math.random() * 0.5);
    const a = Math.random() * Math.PI * 2;
    if (!this.fits(object, point, normal, s, a)) { s *= 0.5; if (!this.fits(object, point, normal, s, a)) return false; }
    if (this.live.length >= K.max) this.remove(this.live[0]);
    const slot = k.free.pop();
    q.setFromUnitVectors(Z, normal).multiply(qs.setFromAxisAngle(Z, a));
    m4.compose(point.clone().addScaledVector(normal, 0.002), q, new THREE.Vector3(s, s, 1));
    k.mesh.setMatrixAt(slot, m4);
    k.mesh.setColorAt(slot, new THREE.Color(color));
    k.mesh.instanceMatrix.needsUpdate = true;
    k.mesh.instanceColor.needsUpdate = true;
    this.live.push({ kind, slot, age: 0, life: k.life, object, at: point.clone() });
    if (kind !== 'glow') { this.lastAt.copy(point); this.lastT = this.clock; }
    return true;
  }

  /** The lightsaber's mark: soot, a glow round it that cools, a puff of smoke. */
  burn(hit) {
    if (!this.add('burn', hit)) return false;
    this.add('glow', hit, { force: true });
    this.smoke.puff(hit.point, hit.normal);
    return true;
  }

  remove(l) {
    if (!l) return;
    const k = this.kinds[l.kind];
    k.mesh.setMatrixAt(l.slot, zero);
    k.mesh.instanceMatrix.needsUpdate = true;
    k.fade.setX(l.slot, 0);
    k.fade.needsUpdate = true;
    k.free.push(l.slot);
    this.live.splice(this.live.indexOf(l), 1);
  }

  clear() { while (this.live.length) this.remove(this.live[0]); }

  update(dt) {
    this.clock += dt;
    for (const l of [...this.live]) {
      l.age += dt;
      if (l.age >= l.life) { this.remove(l); continue; }
      const k = this.kinds[l.kind];
      const f = l.kind === 'glow' ? 1 - l.age / l.life : Math.min(1, (l.life - l.age) / K.fade);
      k.fade.setX(l.slot, shown(l.object) ? f : 0); // on furniture F hid: hidden with it
    }
    for (const k of Object.values(this.kinds)) {
      k.mesh.visible = k.free.length < K.max;
      if (k.mesh.visible) k.fade.needsUpdate = true;
    }
    this.smoke.update(dt);
  }
}

const grids = new WeakMap(), boxes = new WeakMap(), segBox = new THREE.Box3();
const triCount = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
/** Things that move or toggle (doors, lids, the parasol …) — E targets other than seats and beds. */
const moving = (o) => !!o.userData.door && o.userData.door.kind !== 'rest';
const catMeshes = (cat) => { const l = []; cat.object.traverse((o) => { if (o.isMesh) l.push(o); }); return l; };
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };

/** A few soft grey puffs that rise and thin out (one Points cloud, per-point alpha). */
class Smoke {
  constructor(scene) {
    const n = K.smoke.n;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const map = canvas(32, (g, s) => blob(g, s / 2, s / 2, s / 2, 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'));
    this.pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.14, map, vertexColors: true, transparent: true, depthWrite: false }));
    this.pts.frustumCulled = false;
    this.pts.raycast = () => {};
    this.pts.visible = false;
    scene.add(this.pts);
    this.p = [...Array(n)].map(() => ({ pos: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    this.next = 0;
  }

  puff(at, normal) {
    for (let i = 0; i < 8; i++) {
      const p = this.p[this.next++ % this.p.length];
      p.pos.copy(at).addScaledVector(normal, 0.02);
      p.v.copy(normal).multiplyScalar(0.06 + Math.random() * 0.05).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, K.smoke.rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.08));
      p.life = K.smoke.life * (0.6 + Math.random() * 0.4);
    }
    this.pts.visible = true;
  }

  get live() { return this.p.filter((p) => p.life > 0).length; }

  update(dt) {
    if (!this.pts.visible) return;
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    let any = false;
    this.p.forEach((p, i) => {
      if (p.life > 0) { p.life -= dt; p.pos.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 0.8); any = true; }
      const a = Math.max(0, Math.min(1, p.life / K.smoke.life)) * 0.5;
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      col.setXYZW(i, 0.45, 0.43, 0.42, a);
    });
    pos.needsUpdate = col.needsUpdate = true;
    this.pts.visible = any;
  }
}
