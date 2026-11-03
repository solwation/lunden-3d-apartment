import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIVER_FISH as C, COLORS } from './config.js';
import { fishSpec, fishAt, ringsAt, riverProject } from './riverfishswim.js';
import { RiverFishSync } from './riverfishsync.js';
import { Shark } from './shark.js';

// #1752 (part of #1751): fish in Höje å and the rings they leave on the water. Where a fish is comes from src/riverfishswim.js (pure functions
// of the seed, its id, its life and the room's clock), so every player sees the same fish and the same rings (src/riverfishsync.js,
// cloudflare/riverfish.js). This file only draws them.
// The water (riverbridge.js) is opaque, so a fish under it is drawn as a flattened, wider (blurred by the water), darkened, half-transparent
// shape just over the surface that fades towards a dark water tone the deeper it swims (seen from the bank: a dark fish gliding under the surface); when it rises it gets its full
// height and colour and its back breaks the surface, the rest hidden by the water. Cost: TWO instanced meshes (the fish, the rings: no texture,
// no light, no shadow), both hidden (no draw call) unless the eye is within RIVER_FISH.drawDist m of the river, and then only the fish within
// that distance are filled in. Not targets: raycast is off (#1753 will catch them through `near` / `catchFish`).

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const tint = new THREE.Color(), white = new THREE.Color(1, 1, 1), deepTone = new THREE.Color(COLORS.water).multiplyScalar(C.look.deepTone);

/** A fish 1 m long, 1 m wide and 1 m high along +z (scaled per species): body, tail and a dorsal fin, darker back over a lighter belly. */
export function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 10, 6).scale(1, 1, 0.82).translate(0, 0, 0.09);
  const tail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.26, 0, 0.36, -0.5, 0, 0.05, -0.42, 0, 0, -0.26, 0, -0.05, -0.42, 0, -0.36, -0.5], 3));
  const fin = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.42, 0.18, 0, 0.42, -0.12, 0, 0.66, -0.06], 3));
  for (const g of [tail, fin]) g.computeVertexNormals();
  const geo = mergeGeometries([body.toNonIndexed(), tail, fin].map((g) => { g.deleteAttribute('uv'); return g; }));
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = y > 0.05 ? 0.62 : y < -0.15 ? 1.25 : 0.95; col.set([k, k, k], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class RiverFish {
  /** scene, camera; `net` is set by main.js: { ready(), send(m) }. */
  constructor({ scene, camera }) {
    Object.assign(this, { scene, camera, net: null, shown: [], ringList: [], hidden: false });
    // #1769: `&shark=now` turns on the shark's test schedule (SHARK.test); a solo catch is remembered in localStorage 'lunden.shark'
    const sharkTest = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shark') === 'now';
    const store = { get: () => JSON.parse(localStorage.getItem('lunden.shark') ?? 'null'), set: (r) => localStorage.setItem('lunden.shark', JSON.stringify(r)) };
    this.sync = new RiverFishSync({ send: (m) => this.net?.send(m) ?? false, sharkTest, store, hooks: { caught: (id, ok) => this.onCaught?.(id, ok), sharkCaught: (ok) => this.onCaught?.(-1, ok) } });
    this.shark = new Shark({ scene, camera, sync: this.sync }); // #1769: the rare shark (src/shark.js; Fishing bites it through `shark.near`)
    const fishMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: C.opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.fish = new THREE.InstancedMesh(fishGeometry(), fishMat, C.count);
    const ringGeo = new THREE.RingGeometry(0.88, 1, 32, 1).rotateX(-Math.PI / 2);
    ringGeo.deleteAttribute('uv');
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, C.count * 4);
    for (const [m, name] of [[this.fish, 'river-fish'], [this.rings, 'river-fish-rings']]) {
      m.name = name; m.count = 0; m.visible = false; m.frustumCulled = false; m.raycast = () => {}; m.castShadow = m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, white); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.userData.noDetail = true; m.userData.warmDraw = true; m.renderOrder = 2; // (drawn once by the warm-up, after the opaque water)
      scene.add(m);
    }
  }
  /** The fish now within `r` m of (x, z) (#1753): [{ id, born, species, x, y, z, rise }]. */
  near(x, z, r) {
    const t = this.sync.t, out = [];
    for (let id = 0; id < C.count; id++) {
      if (this.sync.isGone(id)) continue;
      const f = fishSpec(id, this.sync.born(id), this.sync.seed), o = fishAt(f, t, {}, this.sync.seed);
      if (Math.hypot(o.x - x, o.z - z) <= r) out.push({ id, born: f.born, species: f.spec.name, x: o.x, y: o.y, z: o.z, rise: o.rise });
    }
    return out;
  }
  /** #1753: take fish `id` out of the river (for everybody through the room). */
  catchFish(id) { return this.sync.catch(id); }
  hide() { this.fish.visible = this.rings.visible = false; this.fish.count = this.rings.count = 0; this.shown.length = 0; }
  /** Per frame. hidden: underground / indoors far below; daylight 0..1 (DayCycle.daylight) dims the rings at night. */
  update(dt, hidden = false, daylight = 1) {
    const cam = this.camera.position, q = riverProject(cam.x, cam.z, this.q ??= {});
    const close = !hidden && q.abs < C.drawDist;
    const near = !!this.net?.ready?.() && q.abs < (this.sync.near ? C.sync.leave : C.sync.enter);
    if (!this.net?.ready?.()) { if (this.sync.near) this.sync.reset(); } else this.sync.setNear(near);
    this.shark.update(dt, hidden, daylight); // #1769: its own distance checks (the fin within SHARK.drawDist m, the carcass on the bank)
    if (!close) { if (this.fish.visible || this.rings.visible) this.hide(); return; }
    const t = this.sync.t, seed = this.sync.seed, o = this.o ??= {}, rings = this.ringList;
    let n = 0; this.shown.length = 0; rings.length = 0;
    for (let id = 0; id < C.count; id++) {
      if (this.sync.isGone(id)) continue;
      const f = fishSpec(id, this.sync.born(id), seed);
      fishAt(f, t, o, seed);
      if (Math.hypot(o.x - cam.x, o.z - cam.z) > C.drawDist) continue;
      const sp = f.spec, up = o.rise, deep = 1 - (o.y - o.bed) / Math.max(0.05, o.water - o.bed); // 0 at the surface, 1 at the bed
      const ys = C.look.flat + (1 - C.look.flat) * up, wide = C.look.wide + (1 - C.look.wide) * up, cy = o.water + 0.012 + sp.h * ys / 2, y = up > 0 ? cy + (o.y - cy) * up : cy;
      const wag = C.wag[0] * Math.sin(t * C.wag[1] * (0.6 + 0.6 * Math.min(1, o.speed)) + f.wag);
      Q.setFromAxisAngle(UP, o.yaw + wag); P.set(o.x, Math.max(y, o.water - sp.h * 0.4), o.z); S.set(sp.w * wide, sp.h * ys, sp.len);
      this.fish.setMatrixAt(n, M.compose(P, Q, S));
      tint.setHex(sp.color).multiplyScalar(C.look.shade + (1 - C.look.shade) * up).lerp(deepTone, C.murk * Math.max(0, deep) * (1 - up));
      this.fish.setColorAt(n, tint);
      this.shown.push({ id, born: f.born, species: sp.name, x: o.x, y: o.y, z: o.z, rise: up, drawnY: P.y });
      n++;
      ringsAt(f, t, rings, seed);
    }
    this.fish.count = n; this.fish.visible = n > 0;
    this.fish.instanceMatrix.needsUpdate = true; this.fish.instanceColor.needsUpdate = true;
    const glow = C.ring.glow * (C.ring.night + (1 - C.ring.night) * Math.max(0, Math.min(1, daylight)));
    let k = 0;
    for (const r of rings) {
      if (k >= this.rings.instanceMatrix.count || Math.hypot(r.x - cam.x, r.z - cam.z) > C.drawDist) continue;
      const u = r.age / C.ring.life, rad = C.ring.r[0] + (C.ring.r[1] - C.ring.r[0]) * Math.sqrt(u);
      P.set(r.x, r.y + 0.02, r.z); S.set(rad, 1, rad); Q.identity();
      this.rings.setMatrixAt(k, M.compose(P, Q, S));
      this.rings.setColorAt(k, tint.setScalar(glow * (1 - u) * (1 - u)));
      k++;
    }
    this.rings.count = k; this.rings.visible = k > 0;
    this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true;
  }
  state() { return { t: this.sync.t, near: this.sync.near, synced: this.sync.synced, fish: this.shown.slice(), rings: this.ringList.slice(), drawn: this.fish.count, ringsDrawn: this.rings.count, shark: this.shark.state() }; }
}

const FISH_NUMBERS={mört:51,abborre:52,braxen:53,gädda:54,öring:55,ål:56};
for (const f of C.species) creature({id:`fish:${f.name}`,no:FISH_NUMBERS[f.name],name:f.name[0].toUpperCase()+f.name.slice(1),family:'fish',level:f.weight<1?2:f.weight<2?1:0,model:{kind:'fish',name:f.name},info:{size:`${Math.round(f.len*100)} cm grundmodell`,weight:'Varierar med fångstens storlek',where:'Höje å',when:'Under ytan; ibland vid vattenytan',likes:'Eget revir i åfåran'},facts:['Levande och fångad fisk räknas som samma art.','Din största uppmätta fångst sparas på kortet.']});
