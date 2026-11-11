import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARK as S } from './config.js';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { forgetBicycleHand } from './keep.js';
import { caughtFishGeometry } from './caughtfish.js';
import { sharkAt } from './sharkswim.js';
import { riverProject, riverPoint } from './riverfishswim.js';
import { sfx } from './audio.js';

// #1769: the rare shark in Höje å. Where and when come from src/sharkswim.js (pure, the same for everybody); the catch record from the room
// (src/riverfishsync.js, cloudflare/riverfish.js). This file draws:
// - the fin in the river while the window is open and nobody has caught it: a grey dorsal fin cutting the surface, a dark shape under it,
//   a V of wake behind it and rings it leaves (deterministic: one per SHARK.ring.every s at the shark's place then);
// - the caught shark on the bank where it was landed: the whole body (minus the fin) for SHARK.body s, then its skeleton for SHARK.bones s;
// - SharkFin, the fin you get in the hand (a Holdable with no home, like a caught fish; Fishing keeps it in keep.js's `fishing` part).
// Cost: nothing at the start (every mesh is built the first time it is needed and hidden beyond SHARK.drawDist m). Near the river during
// the window: four draw calls (fin, shadow, wake, rings); near the carcass: one (body ~470 triangles, or the skeleton ~680). No texture, no
// light, no shadow casting in the river.

const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };
const V = new THREE.Vector3();

let sharkModelData = null;
let sharkModelLoading = null;

export function loadSharkModel() {
  if (sharkModelData) return Promise.resolve(sharkModelData);
  if (sharkModelLoading) return sharkModelLoading;

  sharkModelLoading = new Promise((resolve, reject) => {
    try {
      const isNode = typeof process !== 'undefined' && process?.versions?.node;
      if (isNode) {
        if (typeof self === 'undefined') globalThis.self = globalThis;
        Promise.all([
          import('node:fs'),
          import('node:path'),
          import('three/examples/jsm/loaders/GLTFLoader.js')
        ]).then(([fs, path, { GLTFLoader }]) => {
          const modelPath = path.resolve(process.cwd(), 'models/shark.glb');
          if (!fs.existsSync(modelPath)) {
            resolve(null);
            return;
          }
          const buf = fs.readFileSync(modelPath);
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
            sharkModelData = gltf;
            resolve(gltf);
          }, reject);
        }).catch((err) => {
          console.warn('Node GLTF shark load fallback:', err);
          resolve(null);
        });
      } else {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          const url = new URL('../models/shark.glb', import.meta.url).href;
          new GLTFLoader().load(url, (gltf) => {
            sharkModelData = gltf;
            resolve(gltf);
          }, undefined, (err) => {
            console.warn('Could not load shark.glb:', err);
            resolve(null);
          });
        }).catch(reject);
      }
    } catch {
      resolve(null);
    }
  });

  return sharkModelLoading;
}

if (typeof window !== 'undefined') {
  loadSharkModel().catch(() => {});
}

/** The dorsal fin, `h` m high, base at y = 0, leading edge towards +z: thin, its thickness swelling mid-chord. `cut`: the base cap is the red wound. */
export function finGeometry(h = S.fin, cut = false) {
  if (sharkModelData?.scene) {
    let geo = null;
    sharkModelData.scene.traverse((obj) => {
      if (obj.isMesh && obj.name === 'Shark_fin' && !geo) {
        geo = obj.geometry;
      }
    });
    if (geo) {
      const cloned = geo.clone();
      const scale = h / (S.fin || 0.58);
      cloned.scale(scale, scale, scale);
      if (!cut && cloned.attributes.color) {
        const col = cloned.attributes.color;
        const dark = new THREE.Color(S.finColor).multiplyScalar(0.8);
        const pos = cloned.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          if (pos.getY(i) <= 0.001) {
            col.setXYZ(i, dark.r, dark.g, dark.b);
          }
        }
        col.needsUpdate = true;
      }
      cloned.computeVertexNormals();
      cloned.computeBoundingSphere();
      return cloned;
    }
  }
  const H = [0, 0.3, 0.6, 0.85, 1], L = [0.34, 0.22, 0.08, -0.05, -0.26], T = [-0.2, -0.12, -0.1, -0.15, -0.26], W = [0.07, 0.055, 0.035, 0.016, 0];
  const pos = [], cols = [], skin = new THREE.Color(S.finColor), dark = skin.clone().multiplyScalar(0.8), red = new THREE.Color(S.cut);
  const lead = (i) => [0, H[i] * h, L[i] * h], trail = (i) => [0, H[i] * h, T[i] * h], mid = (i, sd) => [sd * W[i] * h, H[i] * h, ((L[i] + T[i]) / 2) * h];
  const tri = (a, b, c, col) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) cols.push(col.r, col.g, col.b); };
  for (const sd of [1, -1]) for (let i = 0; i < H.length - 1; i++) {
    const c = i === 0 ? dark : skin, f = (a, b, cc) => (sd > 0 ? tri(a, b, cc, c) : tri(a, cc, b, c));
    f(lead(i), mid(i, sd), lead(i + 1)); f(mid(i, sd), mid(i + 1, sd), lead(i + 1));
    f(mid(i, sd), trail(i), mid(i + 1, sd)); f(trail(i), trail(i + 1), mid(i + 1, sd));
  }
  const base = cut ? red : dark;
  tri(lead(0), mid(0, -1), mid(0, 1), base); tri(trail(0), mid(0, 1), mid(0, -1), base);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

const paint = (g, hex, k = 1) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex).multiplyScalar(k), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** The skeleton lying on the ground (y = 0 the ground), nose towards +z, SHARK.len long: skull, jaws with teeth, spine, ribs, fin rays. */
export function skeletonGeometry() {
  if (sharkModelData?.scene) {
    let geo = null;
    sharkModelData.scene.traverse((obj) => {
      if (obj.isMesh && obj.name === 'Shark_skeleton' && !geo) {
        geo = obj.geometry;
      }
    });
    if (geo) {
      const cloned = geo.clone();
      if (!cloned.attributes.color) {
        const bone = new THREE.Color(S.bone || 0xd6cbb5);
        const pos = cloned.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) col.set([bone.r, bone.g, bone.b], i * 3);
        cloned.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      cloned.computeBoundingSphere();
      return cloned;
    }
  }
  const k = S.len / 3.2, bone = S.bone, parts = [];
  parts.push(paint(new THREE.SphereGeometry(0.5, 8, 5).scale(0.32, 0.16, 0.5).translate(0, 0.09, 1.25), bone));            // the skull
  for (const [y, z, r] of [[0.07, 1.5, 0.17], [0.025, 1.46, 0.15]]) {                                                         // the jaws, and their teeth
    parts.push(paint(new THREE.TorusGeometry(r, 0.024, 4, 8, Math.PI).rotateX(Math.PI / 2).translate(0, y, z), bone, 0.95));
    for (let i = 0; i < 6; i++) { const a = 0.25 + (i / 5) * (Math.PI - 0.5); parts.push(paint(new THREE.ConeGeometry(0.012, 0.045, 3, 1, true).translate(0, y > 0.05 ? -0.03 : 0.03, 0).rotateX(y > 0.05 ? Math.PI : 0).translate(Math.cos(a) * r, y, z + Math.sin(a) * r), 0xf6f2e6)); }
  }
  for (let i = 0; i < 20; i++) {                                                                                              // the spine
    const u = i / 19, r = 0.05 - 0.03 * u;
    parts.push(paint(new THREE.CylinderGeometry(r, r, 0.07, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0.05 + 0.02 * (1 - u), 1.0 - u * 2.35), bone, i % 2 ? 0.92 : 1));
  }
  for (let i = 0; i < 6; i++) for (const sd of [1, -1]) {                                                                     // the ribs
    const len = 0.34 - i * 0.035;
    parts.push(paint(new THREE.BoxGeometry(len, 0.016, 0.018).translate(sd * len / 2, 0, 0).rotateY(sd * 0.45).translate(sd * 0.03, 0.04, 0.85 - i * 0.16), bone, 0.96));
  }
  for (const [x, z, len, yaw] of [[0, -1.42, 0.62, 0.55], [0, -1.42, 0.32, -0.75], [0.12, 0.9, 0.42, 1.0], [-0.12, 0.9, 0.42, -1.0]]) // the tail lobes and the pectorals' rays
    parts.push(paint(new THREE.BoxGeometry(0.03, 0.02, len).translate(0, 0, -len / 2).rotateY(yaw).translate(x, 0.025, z), bone, 0.9));
  const g = mergeGeometries(parts).scale(k, k, k);
  g.computeBoundingSphere();
  return g;
}

/** The fin you get in the hand (#1769): a Holdable with no home (taken, put down anywhere; taking something else lays it at your feet). */
export class SharkFin extends Holdable {
  /** host: the Fishing (dropSpot); at: where it starts. */
  constructor(scene, camera, host, at) {
    const mesh = new THREE.Mesh(finGeometry(S.fin, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    mesh.castShadow = true; mesh.userData.noDetail = true;
    const model = new THREE.Group(); model.add(mesh);
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { sphere.set(this.localToWorld(V.set(0, S.fin * 0.4, 0)), S.fin * 0.55); if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this }); };
    super(scene, camera, { name: 'hajfenan', verb: 'ta', backName: '', backVerb: 'lägga ned', model,
      home: { pos: at.clone(), rot: new THREE.Euler(0, 0, Math.PI / 2) },
      heldPose: { pos: new THREE.Vector3(0.16, -0.42, -0.72), rot: new THREE.Euler(0.1, Math.PI / 2 - 0.15, 0) }, // (its profile towards the eye)
      pick: { pos: at.clone(), size: [0.01, 0.01, 0.01] }, cooldown: 0.3 });
    Object.assign(this, { host, isSharkFin: true, outdoorPlace: true, mesh });
  }
  get target() { return this.broken || this.held ? NONE : this.takeTarget; }
  putBack() { if (!this.held) return; this.placeAt(this.host.dropSpot(0.5), Math.random() * 6.28); }
  onTake() { sfx.splash?.(this.where()); }
  remove() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    forgetBicycleHand(this);
    this.broken = true; this.placed = false; this.model.removeFromParent(); this.model.visible = false;
  }
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), TINT = new THREE.Color();

export class Shark {
  /** scene, camera; sync: the RiverFishSync (clock, seed, the catch record). */
  constructor({ scene, camera, sync }) { Object.assign(this, { scene, camera, sync, built: false, o: {}, ro: {}, finShown: false, shownPhase: null }); }
  build() {
    if (this.built) return;
    this.built = true;
    const add = (m, name) => { m.name = name; m.visible = false; m.raycast = () => {}; m.userData.noDetail = true; m.castShadow = m.receiveShadow = false; this.scene.add(m); return m; };
    this.fin = add(new THREE.Mesh(finGeometry(S.fin * 1.15), new THREE.MeshLambertMaterial({ vertexColors: true })), 'shark-fin');
    const shadow = new THREE.SphereGeometry(0.5, 10, 6).scale(0.19 * S.len, 0.06, S.len); shadow.deleteAttribute('uv');
    this.shadow = add(new THREE.Mesh(shadow, new THREE.MeshBasicMaterial({ color: 0x141c20, transparent: true, opacity: 0.55, depthWrite: false })), 'shark-shadow');
    this.shadow.renderOrder = 2;
    { // the wake: a V of two additive wedges from the fin backwards, bright at the fin and fading out
      const { len, width } = S.wake, p = [0, 0, 0.1, width / 2, 0, -len, width / 2 - 0.55, 0, -len, 0, 0, 0.1, -width / 2 + 0.55, 0, -len, -width / 2, 0, -len];
      const c = [0.32, 0.32, 0.32, 0, 0, 0, 0, 0, 0, 0.32, 0.32, 0.32, 0, 0, 0, 0, 0, 0];
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3)).setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      this.wake = add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })), 'shark-wake');
      this.wake.renderOrder = 3;
    }
    const ringGeo = new THREE.RingGeometry(0.9, 1, 28, 1).rotateX(-Math.PI / 2); ringGeo.deleteAttribute('uv');
    this.rings = add(new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 3), 'shark-rings');
    this.rings.setColorAt(0, TINT.setScalar(1)); this.rings.frustumCulled = false; this.rings.renderOrder = 3;
    // the caught shark lying on its side (the body), and its skeleton
    const body = new THREE.Mesh(caughtFishGeometry('haj', S.look), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    body.scale.setScalar(S.len); body.rotation.z = 1.05; // (on its side; update() turns its grey back away from the river, towards whoever walks up from land)
    this.body = add(new THREE.Group(), 'shark-body'); this.body.add(body);
    body.updateMatrix(); this.bodyLift = -new THREE.Box3().setFromObject(body).min.y;
    this.bones = add(new THREE.Mesh(skeletonGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })), 'shark-bones');
  }
  /** The shark as a bite candidate (Fishing.appetite) when it swims within `r` m of (x, z): [{ shark, id: -1, species: 'haj', x, y, z }]. */
  near(x, z, r) {
    const w = this.sync.sharkWindow();
    if (!w) return [];
    const o = sharkAt(w, this.sync.t, {}, this.sync.seed);
    return o.show > 0.5 && Math.hypot(o.x - x, o.z - z) <= r ? [{ shark: true, id: -1, born: 0, species: 'haj', x: o.x, y: o.y, z: o.z, rise: 1 }] : [];
  }
  /** Per frame (RiverFish.update). hidden: underground. */
  update(dt, hidden = false, daylight = 1) {
    const cam = this.camera.position, t = this.sync.t, seed = this.sync.seed, w = hidden ? null : this.sync.sharkWindow();
    let fin = false;
    if (w) {
      const o = sharkAt(w, t, this.o, seed);
      if (o.show > 0 && Math.hypot(o.x - cam.x, o.z - cam.z) < S.drawDist) {
        this.build(); fin = true;
        const sway = 0.06 * Math.sin(t * 1.3);
        this.fin.position.set(o.x, o.y - S.fin * 1.15 * (1 - o.show) - 0.04, o.z); this.fin.rotation.set(0, o.yaw + sway, 0.04 * Math.sin(t * 0.9));
        this.shadow.position.set(o.x - Math.sin(o.yaw) * S.len * 0.2, o.y + 0.012, o.z - Math.cos(o.yaw) * S.len * 0.2); this.shadow.rotation.set(0, o.yaw, 0);
        this.wake.position.set(o.x, o.y + 0.02, o.z); this.wake.rotation.set(0, o.yaw, 0); this.wake.scale.set(1, 1, 0.4 + Math.min(1, o.speed / 0.5));
        const glow = 0.3 * (0.25 + 0.75 * Math.max(0, Math.min(1, daylight)));
        let n = 0;
        for (let j = 0; j < 3; j++) {
          const at = (Math.floor(t / S.ring.every) - j) * S.ring.every, age = t - at;
          if (at < w.start || age >= S.ring.life) continue;
          const ro = sharkAt(w, at, this.ro, seed), u = age / S.ring.life, rad = S.ring.r[0] + (S.ring.r[1] - S.ring.r[0]) * Math.sqrt(u);
          P.set(ro.x, ro.y + 0.02, ro.z); SC.set(rad, 1, rad); Q.identity();
          this.rings.setMatrixAt(n, M.compose(P, Q, SC)); this.rings.setColorAt(n, TINT.setScalar(glow * (1 - u) * (1 - u))); n++;
        }
        this.rings.count = n; this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true;
        this.fin.visible = this.shadow.visible = this.wake.visible = true; this.rings.visible = n > 0;
      }
    }
    if (!fin && this.finShown) this.fin.visible = this.shadow.visible = this.wake.visible = this.rings.visible = false;
    this.finShown = fin;
    // the caught shark on the bank
    const rec = this.sync.shark, phase = hidden || !rec ? null : this.sync.sharkPhase();
    const show = phase && Math.hypot(rec.p[0] - cam.x, rec.p[2] - cam.z) < S.drawDist ? phase : null;
    if (show) {
      this.build();
      if (show === 'body') {
        this.body.position.set(rec.p[0], rec.p[1] + this.bodyLift, rec.p[2]); this.body.rotation.y = rec.r;
        if (this.rolledFor !== rec) { // the back (+y before the roll) towards the land: +x of the shark (cos r, -sin r) away from the river → roll −
          const q = riverProject(rec.p[0], rec.p[2]), c = riverPoint(q.s), away = q.d >= 0 ? 1 : -1;
          this.body.children[0].rotation.z = (Math.cos(rec.r) * c.nx - Math.sin(rec.r) * c.nz) * away > 0 ? -1.05 : 1.05; this.rolledFor = rec;
        }
      }
      else { this.bones.position.set(rec.p[0], rec.p[1], rec.p[2]); this.bones.rotation.y = rec.r; }
    }
    if (this.built) { this.body.visible = show === 'body'; this.bones.visible = show === 'bones'; }
    this.shownPhase = show;
  }
  state() {
    const w = this.sync.sharkWindow(), o = w ? sharkAt(w, this.sync.t, {}, this.sync.seed) : null;
    return { window: w, at: o && { x: o.x, y: o.y, z: o.z, show: o.show }, finShown: this.finShown, record: this.sync.shark, phase: this.sync.sharkPhase(), shown: this.shownPhase, pending: this.sync.sharkPending, test: this.sync.sharkTestOn,
      tris: this.built ? { fin: this.fin.geometry.attributes.position.count / 3, body: this.body.children[0].geometry.index.count / 3, bones: this.bones.geometry.attributes.position.count / 3 } : null };
  }
}

creature({id:'fish:shark',no:57,name:'Haj',family:'fish',level:4,model:{kind:'shark'},info:{size:'Ovanligt stor åbesökare',weight:'Mäts när den fångas',where:'Höje å',when:'Sällsynt besök',likes:'Att visa ryggfenan'},facts:['En särskilt sällsynt varelse i spelets å.','Fena och fångad kropp är samma varelse, inte egna arter.']});
