import { modelURL } from './modelurl.js';
import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import {riverFishGeometry,fishSpeciesMaterial,fishVisualPhase} from './riverfishmodel.js';
import { RIVER_FISH as C, RIVER_FISH_SCHOOL as SCHOOL, COLORS } from './config.js';
import { fishSpec, fishAt, ringsAt, riverProject } from './riverfishswim.js';
import { RiverFishSync } from './riverfishsync.js';
import { FishFeed } from './riverfishfeed.js';
import { schoolContext, presentAt, takeRings, moveRing, coverFrame } from './riverfishschool.js';
import { Shark } from './shark.js';

// #1752 (part of #1751): fish in Höje å and the rings they leave on the water. Where a fish is comes from src/riverfishswim.js (pure functions
// of the seed, its id, its life and the room's clock), so every player sees the same fish and the same rings (src/riverfishsync.js,
// cloudflare/riverfish.js). This file only draws them.
// The water (riverbridge.js) is opaque, so a fish under it is drawn as a flattened, wider (blurred by the water), darkened, half-transparent
// shape just over the surface that fades towards a dark water tone the deeper it swims (seen from the bank: a dark fish gliding under the surface); when it rises it gets its full
// height and colour and its back breaks the surface, the rest hidden by the water. Cost: TWO instanced meshes (the fish, the rings: no texture,
// no light, no shadow), both hidden (no draw call) unless the eye is within RIVER_FISH.drawDist m of the river, and then only the fish within
// that distance are filled in. Not targets: raycast is off (#1753 will catch them through `near` / `catchFish`).
// #1946: a LOCAL layer on top (src/riverfishfeed.js, `this.feed`): a fish lured to a still swimmer's cracked mussel, or scared by a stroke, is
// drawn offset from its shared place for a while (only in this client; `near`, `shown`, the rings and the room keep the shared places). An
// eye under the surface (a diver) sees every fish as it is, at its own depth, instead of the flattened shape painted over the water.
// #2130: a second LOCAL layer under that (src/riverfishschool.js, `this.school`): loose schools, still moments in the lee of stones / lily pads
// (`this.flora`, set by main.js: RiverFlora's `cover`) and quick takes at the surface with their rings. Each fish is drawn at its `presentAt`
// place (`shown[i].school`: that offset from the shared place, which `near`, `shown[i].x/y/z` and the room keep); a fed / scared fish lets go
// of its school offset while the feeding layer has it. The rings of a rise are drawn where the fish was drawn when it rose.

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), H = new THREE.Vector3();
const W = { swim: false, moving: false, x: 0, y: 0, z: 0, hand: null, busy: null };
const tint = new THREE.Color(), white = new THREE.Color(1, 1, 1), deepTone = new THREE.Color(COLORS.water).multiplyScalar(C.look.deepTone);

let fishModelData = null;
let fishModelLoading = null;

export function loadFishModel() {
  if (fishModelData) return Promise.resolve(fishModelData);
  if (fishModelLoading) return fishModelLoading;

  fishModelLoading = new Promise((resolve, reject) => {
    try {
      const isNode = typeof process !== 'undefined' && process?.versions?.node;
      if (isNode) {
        if (typeof self === 'undefined') globalThis.self = globalThis;
        Promise.all([
          import('node:fs'),
          import('node:path'),
          import('three/examples/jsm/loaders/GLTFLoader.js')
        ]).then(([fs, path, { GLTFLoader }]) => {
          const modelPath = path.resolve(process.cwd(), 'models/fish-generic.glb');
          if (!fs.existsSync(modelPath)) {
            resolve(null);
            return;
          }
          const buf = fs.readFileSync(modelPath);
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
            fishModelData = gltf;
            resolve(gltf);
          }, reject);
        }).catch((err) => {
          console.warn('Node GLTF fish load fallback:', err);
          resolve(null);
        });
      } else {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          const url = modelURL('../models/fish-generic.glb', import.meta.url).href;
          new GLTFLoader().load(url, (gltf) => {
            fishModelData = gltf;
            resolve(gltf);
          }, undefined, (err) => {
            console.warn('Could not load fish-generic.glb:', err);
            resolve(null);
          });
        }).catch(reject);
      }
    } catch {
      resolve(null);
    }
  });

  return fishModelLoading;
}

if (typeof window !== 'undefined') {
  loadFishModel().catch(() => {});
}

/** A fish 1 m long, 1 m wide and 1 m high along +z (scaled per species): body, tail and a dorsal fin, darker back over a lighter belly. */
export function fishGeometry() {
  let neutral=null;fishModelData?.scene.traverse(o=>{if(o.name==='Fish_Static')neutral=o.geometry});
  return riverFishGeometry(neutral);
}

export class RiverFish {
  /** scene, camera; `net` is set by main.js: { ready(), send(m) }. */
  constructor({ scene, camera }) {
    Object.assign(this, { scene, camera, net: null, shown: [], ringList: [], hidden: false, feed: new FishFeed(), bait: null, cand: [], pool: [], fed: 0 });
    Object.assign(this, { flora: null, school: null, schoolKey: '', coverKey: '', cover: [], sOff: new Map(), pres: {} }); // #2130
    // #1769: `&shark=now` turns on the shark's test schedule (SHARK.test); a solo catch is remembered in localStorage 'lunden.shark'
    const sharkTest = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shark') === 'now';
    const store = { get: () => JSON.parse(localStorage.getItem('lunden.shark') ?? 'null'), set: (r) => localStorage.setItem('lunden.shark', JSON.stringify(r)) };
    this.sync = new RiverFishSync({ send: (m) => this.net?.send(m) ?? false, sharkTest, store, hooks: { caught: (id, ok) => this.onCaught?.(id, ok), sharkCaught: (ok) => this.onCaught?.(-1, ok) } });
    this.shark = new Shark({ scene, camera, sync: this.sync }); // #1769: the rare shark (src/shark.js; Fishing bites it through `shark.near`)
    const fishMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: C.opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.fish = new THREE.InstancedMesh(fishGeometry(), fishSpeciesMaterial(fishMat), C.count);
    this.fish.geometry.setAttribute('aFish',new THREE.InstancedBufferAttribute(new Float32Array(C.count*2),2).setUsage(THREE.DynamicDrawUsage));
    const ringGeo = new THREE.RingGeometry(0.88, 1, 32, 1).rotateX(-Math.PI / 2);
    ringGeo.deleteAttribute('uv');
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, C.count * 5); // (#2130: room for the takes' rings too)
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
  /** #1946: one frame of the local lure / scare layer over the shared fish `list` (`this.bait`, set by main.js: { player, mussels, busy(id),
   * onFeed(fish, at) }). True when the eye is under the surface. */
  feedStep(dt, list) {
    const b = this.bait, pl = b?.player, sw = pl?.swim && !pl.swim.exit ? pl.swim : null, cam = this.camera.position;
    if (!b || (!sw && !this.feed.active)) return false;
    const m = sw ? b.mussels?.held : null;
    W.swim = !!sw; W.moving = !!sw && sw.moving && Math.hypot(pl.swimV?.sx ?? 0, pl.swimV?.sy ?? 0, pl.swimV?.sz ?? 0) > C.feed.scareSpeed; // (#1951: `sy`, a stroke straight up or down)
    W.x = cam.x; W.y = cam.y; W.z = cam.z; W.busy = b.busy ?? null;
    W.hand = m?.cracked === true && b.mussels.heldPosition(H) ? H : null; // (#1950: only a cracked mussel is bait)
    const took = this.feed.update(dt, W, list);
    if (took && b.mussels.consumeHeld()) { this.fed++; b.onFeed?.(list.find((f) => f.id === took.id), H); }
    return !!sw && !!pl.diving;
  }
  /** #1753: take fish `id` out of the river (for everybody through the room). */
  catchFish(id) { return this.sync.catch(id); }
  hide() { this.fish.visible = this.rings.visible = false; this.fish.count = this.rings.count = 0; this.shown.length = 0; this.sOff.clear(); }
  /** Per frame. hidden: underground / indoors far below; daylight 0..1 (DayCycle.daylight) dims the rings at night. */
  update(dt, hidden = false, daylight = 1) {
    const cam = this.camera.position, q = riverProject(cam.x, cam.z, this.q ??= {});
    const close = !hidden && q.abs < C.drawDist;
    const near = !!this.net?.ready?.() && q.abs < (this.sync.near ? C.sync.leave : C.sync.enter);
    if (!this.net?.ready?.()) { if (this.sync.near) this.sync.reset(); } else this.sync.setNear(near);
    this.shark.update(dt, hidden, daylight); // #1769: its own distance checks (the fin within SHARK.drawDist m, the carcass on the bank)
    if (!close) { if (this.fish.visible || this.rings.visible) this.hide(); this.feed.reset(); return; }
    const t = this.sync.t, seed = this.sync.seed, rings = this.ringList, list = this.cand;
    this.fish.material.userData.fishTime.value=fishVisualPhase(t);
    let n = 0; this.shown.length = 0; rings.length = 0; list.length = 0;
    for (let id = 0; id < C.count; id++) {
      if (this.sync.isGone(id)) continue;
      const f = fishSpec(id, this.sync.born(id), seed), o = this.pool[id] ??= {};
      fishAt(f, t, o, seed);
      o.f = f; o.id = id; o.born = f.born; o.len = f.spec.len; list.push(o); // (every fish: a lured one may come from beyond `drawDist`)
    }
    const ctx = this.schoolStep(list, seed);
    const sub = this.feedStep(dt, list); // #1946: the local offsets; `sub`: the eye is under the surface
    const reach = C.drawDist + SCHOOL.join + SCHOOL.hold.far, pres = this.pres, settle = SCHOOL.settle * Math.min(dt, 0.1) + 1e-3;
    for (const o of list) {
      const f = o.f, id = o.id, e = this.feed.off.get(id);
      // #2130: the school / hold / take layer: where this fish is drawn (none while the feeding layer has it); a sudden change is followed at `settle` m/s
      const p = Math.hypot(o.x - cam.x, o.z - cam.z) < reach ? presentAt(id, t, ctx, pres) : null;
      let so = this.sOff.get(id); const fresh = !so; so ??= { x: 0, y: 0, z: 0 }; this.sOff.set(id, so);
      const gx = p && !e ? p.x - o.x : 0, gy = p && !e ? p.y - o.y : 0, gz = p && !e ? p.z - o.z : 0, gd = Math.hypot(gx - so.x, gy - so.y, gz - so.z);
      if (fresh || gd <= settle) { so.x = gx; so.y = gy; so.z = gz; } else { const k = settle / gd; so.x += (gx - so.x) * k; so.y += (gy - so.y) * k; so.z += (gz - so.z) * k; }
      const vx = o.x + so.x, vy = o.y + so.y, vz = o.z + so.z, vRise = p && !e ? p.rise : o.rise, water = p ? p.water : o.water, bed = p ? p.bed : o.bed;
      if (Math.hypot(vx + (e?.x ?? 0) - cam.x, vz + (e?.z ?? 0) - cam.z) > C.drawDist) continue;
      const sp = f.spec, up = e ? Math.max(vRise, 0.6 * e.rise) : vRise, deep = 1 - (vy - bed) / Math.max(0.05, water - bed); // 0 at the surface, 1 at the bed
      const ys = C.look.flat + (1 - C.look.flat) * up, wide = C.look.wide + (1 - C.look.wide) * up, cy = water + 0.012 + sp.h * ys / 2;
      const oy = e && e.rise > vRise ? vy + (water - sp.h * (0.5 - C.rise.show) - vy) * e.rise : vy, y = up > 0 ? cy + (oy - cy) * up : cy; // (a fish at the hand of a swimmer at the surface breaks it with half its body: easier to see than a rising fish's back)
      const wag = C.wag[0] * Math.sin(t * C.wag[1] * (0.6 + 0.6 * Math.min(1, p && !e ? p.speed : o.speed)) + f.wag);
      Q.setFromAxisAngle(UP, (e ? e.yaw : p ? p.yaw : o.yaw) + wag);
      if (sub) { // seen from under the water: the whole fish where it is
        P.set(vx + (e?.x ?? 0), vy + (e?.y ?? 0), vz + (e?.z ?? 0)); S.set(sp.w, sp.h, sp.len);
        tint.setHex(sp.color);
      } else {
        P.set(vx + (e?.x ?? 0), Math.max(y, water - sp.h * 0.4), vz + (e?.z ?? 0)); S.set(sp.w * wide, sp.h * ys, sp.len);
        tint.setHex(sp.color).multiplyScalar(C.look.shade + (1 - C.look.shade) * up).lerp(deepTone, C.murk * Math.max(0, deep) * (1 - up));
      }
      this.fish.setMatrixAt(n, M.compose(P, Q, S));
      this.fish.setColorAt(n, tint);
      this.fish.geometry.attributes.aFish.setXY(n,f.species,f.wag);
      this.shown.push({ id, born: f.born, species: sp.name, x: o.x, y: o.y, z: o.z, rise: o.rise, drawnY: P.y, ...(e && { off: [e.x, e.y, e.z], mode: e.mode }),
        ...((so.x || so.y || so.z) && { school: [so.x, so.y, so.z] }), ...(p?.hold > 0 && { hold: p.hold }), ...(p?.take > 0 && { take: p.take }) });
      n++;
      const r0 = rings.length; ringsAt(f, t, rings, seed);
      for (let i = r0; i < rings.length; i++) moveRing(rings[i], t, ctx); // #2130: where the fish was drawn when it rose
    }
    takeRings(t, ctx, rings); // #2130: the takes at the surface (filtered by distance below)
    this.fish.count = n; this.fish.visible = n > 0;
    this.fish.instanceMatrix.needsUpdate = true; this.fish.instanceColor.needsUpdate = true;
    this.fish.geometry.attributes.aFish.needsUpdate=true;
    const glow = C.ring.glow * (C.ring.night + (1 - C.ring.night) * Math.max(0, Math.min(1, daylight)));
    let k = 0;
    for (const r of rings) {
      if (k >= this.rings.instanceMatrix.count || Math.hypot(r.x - cam.x, r.z - cam.z) > C.drawDist) continue;
      const u = r.age / (r.life ?? C.ring.life), rr = r.r ?? C.ring.r, rad = rr[0] + (rr[1] - rr[0]) * Math.sqrt(u);
      P.set(r.x, r.y + 0.02, r.z); S.set(rad, 1, rad); Q.identity();
      this.rings.setMatrixAt(k, M.compose(P, Q, S));
      this.rings.setColorAt(k, tint.setScalar(glow * (r.glow ?? C.ring.glow) / C.ring.glow * (1 - u) * (1 - u)));
      k++;
    }
    this.rings.count = k; this.rings.visible = k > 0;
    this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true;
  }
  /** #2130: the schools of the fish now present (rebuilt when one is caught / back) and the cover in the river frame (rebuilt with the season). */
  schoolStep(list, seed) {
    const cv = this.flora?.cover, ck = cv ? `${cv.stones.length}:${cv.lilies.length}:${cv.leaves}` : '';
    if (ck !== this.coverKey) { this.coverKey = ck; this.cover = cv ? coverFrame(cv.leaves ? cv.stones.concat(cv.lilies) : cv.stones) : []; this.schoolKey = ''; }
    let key = `${seed}`; for (const o of list) key += `,${o.id}:${o.born}`;
    if (key !== this.schoolKey) { this.schoolKey = key; this.school = schoolContext(list.map((o) => o.f), seed, this.cover); for (const id of this.sOff.keys()) if (!this.school.specs.has(id)) this.sOff.delete(id); }
    return this.school;
  }
  state() { const sc = this.school; return { school: sc && { groups: [...sc.groups].filter(([, g]) => g.rank === 0 && g.size > 1).map(([, g]) => g.members), cover: this.cover.length,
      holding: this.shown.filter((f) => f.hold > 0.5).length, taking: this.shown.filter((f) => f.take > 0).length, takeRings: this.ringList.filter((r) => r.take).length }, t: this.sync.t, near: this.sync.near, synced: this.sync.synced, fish: this.shown.slice(), rings: this.ringList.slice(), drawn: this.fish.count, ringsDrawn: this.rings.count, feed: { offsets: this.feed.off.size, lure: this.feed.lure, still: this.feed.still, fed: this.fed }, shark: this.shark.state() }; }
}

const FISH_NUMBERS={mört:51,abborre:52,braxen:53,gädda:54,öring:55,ål:56};
for (const f of C.species) creature({id:`fish:${f.name}`,no:FISH_NUMBERS[f.name],modelVersion:2,name:f.name[0].toUpperCase()+f.name.slice(1),family:'fish',level:f.weight<1?2:f.weight<2?1:0,model:{kind:'fish',name:f.name},info:{size:`${Math.round(f.len*100)} cm grundmodell`,weight:'Varierar med fångstens storlek',where:'Höje å',when:'Under ytan; ibland vid vattenytan',likes:'Eget revir i åfåran'},facts:['Levande och fångad fisk räknas som samma art.','Din största uppmätta fångst sparas på kortet.']});
