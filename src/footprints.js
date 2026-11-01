import * as THREE from 'three';
import { FOOTPRINTS as F, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';
import { Stepper, PrintStore, SHOE, PAW, netTrails } from './footprinttrail.js';

// #1773: footprints in the snow. In the snow months the player, the other players and the outdoor cats leave prints where snow lies
// (`snowY` from main.js: outdoors, not on a ploughed road, in water, under a roof or indoors). The others' prints are made here from
// their synced positions (ghosts.js, no new message); a late joiner gets the room's recent paths in the welcome (cloudflare/trails.js)
// and rebuilds the cats' last `life` s from their clock-driven loops (outdoorcats.js). Each print fades out and is gone F.life s after
// it was made. One InstancedMesh of quads (one draw call, an atlas shoe | paw drawn on a canvas), at most F.max prints; it fades with
// distance and is hidden (no draw call) while no live print is within the draw distance. No light, no shadow.

/** The atlas: a right shoe's sole (toe up: v = 1) in the left half, a cat's paw (four toes and the pad) in the right half. */
function atlas() {
  const W = 128, H = 128, c = document.createElement('canvas');
  c.width = W * 2; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  // sole: a rounded fore part (wider on the big toe's side, the left of a right foot seen from above) and a heel, with a few treads
  const sole = new Path2D();
  sole.ellipse(W * 0.47, H * 0.3, W * 0.33, H * 0.25, -0.12, 0, Math.PI * 2);
  sole.ellipse(W * 0.53, H * 0.8, W * 0.26, H * 0.16, 0, 0, Math.PI * 2);
  g.globalAlpha = 0.95; g.fill(sole);
  g.globalAlpha = 0.6; g.fillRect(W * 0.36, H * 0.5, W * 0.3, H * 0.16); // (the waist, lighter: the arch presses less)
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.35;
  for (let k = 0; k < 6; k++) g.fillRect(W * 0.18, H * (0.12 + k * 0.065), W * 0.62, H * 0.022); // treads
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.9;
  // paw: the pad and four toes
  const px = W, paw = new Path2D();
  paw.ellipse(px + W * 0.5, H * 0.66, W * 0.25, H * 0.2, 0, 0, Math.PI * 2);
  for (const [x, y] of [[0.22, 0.36], [0.4, 0.2], [0.6, 0.2], [0.78, 0.36]]) { paw.moveTo(px + W * x + W * 0.1, H * y); paw.ellipse(px + W * x, H * y, W * 0.1, H * 0.12, 0, 0, Math.PI * 2); }
  g.fill(paw);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Footprints {
  /** `snowY(x, y, z)`: the snow's height where a walker with feet at y stands, or null where there is no snow under the feet. */
  constructor({ scene, snowY, lowMemory = false }) {
    Object.assign(this, { scene, snowY });
    this.drawDist = lowMemory ? F.drawDistPhone : F.drawDist;
    this.skew = 0; // s added to the clock (tests: "30 minutes later")
    this.t0 = Date.now() / 1000; // (the shader's times are relative to it: float32)
    this.store = new PrintStore(F.max, F.life);
    this.walkers = new Map(); // key -> { stepper, seen }
    this.net = []; // the room's recent paths (netTrails, on our clock)
    this.snow = false; this.built = false; this.checkT = 0; this.compactT = 0; this.written = 0; this.version = -1;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(F.max), 1);
    this.code = new THREE.InstancedBufferAttribute(new Float32Array(F.max), 1); // kind * 2 + (right foot ? 1 : 0)
    geo.setAttribute('fpBorn', this.born); geo.setAttribute('fpCode', this.code);
    const mat = new THREE.MeshLambertMaterial({ color: F.color, map: atlas(), transparent: true, opacity: F.opacity, depthWrite: false, alphaTest: 0.01,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.uniforms = { fpNow: { value: 0 }, fpLife: { value: F.life }, fpNear: { value: this.drawDist * F.fadeFrom }, fpFar: { value: this.drawDist } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = 'attribute float fpBorn;\nattribute float fpCode;\nuniform float fpNow, fpLife, fpNear, fpFar;\nvarying float vFpFade;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', `#include <uv_vertex>
  float fpK = floor(fpCode / 2.0 + 0.01), fpR = fpCode - fpK * 2.0;
  vMapUv.x = (fpK + (fpR > 0.5 ? vMapUv.x : 1.0 - vMapUv.x)) * 0.5;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec3 fpW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFpFade = clamp(1.0 - (fpNow - fpBorn) / fpLife, 0.0, 1.0) * (1.0 - smoothstep(fpNear, fpFar, distance(fpW.xz, cameraPosition.xz)));`);
      sh.fragmentShader = 'varying float vFpFade;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a *= vFpFade;');
    };
    mat.customProgramCacheKey = () => 'footprints1773';
    this.mesh = new THREE.InstancedMesh(geo, mat, F.max);
    Object.assign(this.mesh, { name: 'footprints', count: 0, visible: false, frustumCulled: false, renderOrder: 1 });
    this.mesh.raycast = () => {};
    this.mesh.userData.noDetail = true; // (our own distance rule, not the small-detail culler)
    scene.add(this.mesh);
    registerSeasonal((month) => this.setSnow(SEASON.snowMonths.includes(month)));
  }

  now() { return Date.now() / 1000 + this.skew; }

  setSnow(on) {
    if (on === this.snow) return;
    this.snow = on; this.built = false;
    if (!on) { this.store.replace([]); for (const w of this.walkers.values()) w.stepper.break(); this.write(); }
  }

  /** The room's welcome (ghosts.js onWelcome): its recent paths replace the players' prints we have (ours included: we sent them). */
  welcome(trails) {
    const now = this.now();
    this.net = netTrails(trails, now);
    if (this.snow) this.rebuild(now, false);
  }

  /** Prints from paths (walkers' samples) through the snow test. */
  printsOf(kind, pts, out) {
    const st = new Stepper(kind), tmp = [];
    for (const p of pts) {
      tmp.length = 0;
      st.feed(p.x, p.y, p.z, p.t, tmp);
      for (const q of tmp) { const y = this.snowY(q.x, q.y, q.z); if (y !== null) { q.y = y; out.push(q); } }
    }
    return out;
  }

  /** Rebuild from history: the room's paths (players) and, with `cats`, the cats' last F.life s; live prints of the other kind stay. */
  rebuild(now, cats = true) {
    const keep = [], S = this.store;
    for (let i = 0; i < S.count; i++) if (now - S.t[i] < F.life && (cats ? S.kind[i] === SHOE : S.kind[i] === PAW)) keep.push({ x: S.x[i], y: S.y[i], z: S.z[i], yaw: S.yaw[i], foot: S.foot[i], kind: S.kind[i], t: S.t[i] });
    if (!cats) for (const tr of this.net) this.printsOf(SHOE, tr.pts, keep);
    if (cats && this.catHistory) for (const pts of this.catHistory(now - F.life, now)) this.printsOf(PAW, pts, keep);
    S.replace(keep);
    for (const [k, w] of this.walkers) if (cats ? k.startsWith('c') : !k.startsWith('c')) w.stepper.break();
    this.written = 0; this.write();
  }

  /** One walker at (x, y, z) feet now; `ok` false (riding, seated, flying): no prints and the line breaks. */
  walk(key, kind, x, y, z, ok, now) {
    let w = this.walkers.get(key);
    if (!w) { w = { stepper: new Stepper(kind), seen: 0 }; this.walkers.set(key, w); }
    w.seen = now;
    if (!ok) { w.stepper.break(); return; }
    const out = w.stepper.feed(x, y, z, now);
    for (const q of out) { const sy = this.snowY(q.x, q.y, q.z); if (sy !== null) { q.y = sy; this.store.add(q); } }
  }

  /** Each frame: `walkers()` → [{ key, kind, x, y, z, ok }] (us, the other players, the cats out; asked only while snow lies), `eye`
   * the camera's position. */
  update(dt, walkers, eye) {
    const now = this.now();
    if (!this.snow) { this.mesh.visible = false; return; }
    if (!this.built) { this.built = true; this.rebuild(now, true); if (this.net.length) this.rebuild(now, false); }
    for (const w of walkers()) this.walk(w.key, w.kind, w.x, w.y, w.z, w.ok, now);
    for (const [k, w] of this.walkers) if (now - w.seen > 5) this.walkers.delete(k); // (gone: a player left, a cat went in)
    if ((this.compactT -= dt) <= 0) { // the gone ones out of the ring (keeps the drawn count to the live prints)
      this.compactT = 20;
      if (this.store.count && this.store.live(now) < this.store.count) { this.store.compact(now); this.written = 0; }
    }
    this.write();
    this.uniforms.fpNow.value = now - this.t0;
    if ((this.checkT -= dt) <= 0) { this.checkT = 0.5; this.near = this.store.nearest(eye.x, eye.z, now) < this.drawDist; }
    this.mesh.visible = !!this.near && this.store.count > 0;
  }

  /** Copy new / changed prints into the instance buffers (the whole ring after a rebuild or compaction). */
  write() {
    const S = this.store, m = this.mesh;
    if (S.version === this.version) return;
    const all = this.written === 0 || S.count < this.mesh.count;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const put = (i) => {
      const paw = S.kind[i] === PAW, size = paw ? F.paw.size : F.shoe.size;
      M.compose(p.set(S.x[i], S.y[i] + 0.02, S.z[i]), q.setFromAxisAngle(up, S.yaw[i]), s.set(size[0], 1, size[1]));
      m.setMatrixAt(i, M);
      this.born.array[i] = S.t[i] - this.t0;
      this.code.array[i] = S.kind[i] * 2 + (S.foot[i] > 0 ? 1 : 0);
    };
    const bufs = [[m.instanceMatrix, 16], [this.born, 1], [this.code, 1]];
    for (const [b] of bufs) b.clearUpdateRanges();
    if (all) for (let i = 0; i < S.count; i++) put(i);
    else { // only the slots just written (one range, or the whole buffer when the ring wrapped)
      const n = Math.min(S.version - this.version, S.count), from = S.next - n;
      for (let j = 1; j <= n; j++) put((S.next - j + S.max) % S.max);
      if (from >= 0) for (const [b, k] of bufs) b.addUpdateRange(from * k, n * k);
    }
    m.count = S.count;
    for (const [b] of bufs) b.needsUpdate = true;
    this.written = 1; this.version = S.version;
  }

  /** For tests: what is made and drawn. */
  state() {
    const now = this.now(), S = this.store, list = [];
    for (let i = 0; i < S.count; i++) list.push({ x: S.x[i], y: S.y[i], z: S.z[i], kind: S.kind[i] === PAW ? 'paw' : 'shoe', foot: S.foot[i], age: now - S.t[i], fade: S.fade(i, now) });
    return { snow: this.snow, count: S.count, live: S.live(now), drawn: this.mesh.visible ? this.mesh.count : 0, visible: this.mesh.visible, net: this.net.length, list };
  }
}
