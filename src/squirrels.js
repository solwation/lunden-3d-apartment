import { modelURL } from './modelurl.js';
import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SQUIRRELS as C, SQUIRREL_SURFACE as SS, PADDOCK, SITE, WALK } from './config.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { Hearts } from './pingping.js';
import { sfx } from './audio.js';
import { registerSeasonal } from './seasons.js';
import { SquirrelBrain, NutField, linkTrees, riverFrame, winterMonth, inBox, groveFences, groveTreeOk, startTree } from './squirrelbrain.js';
import { SquirrelSync } from './squirrelsync.js';
import { nutPathSpots } from './nutpaths.js';

// Squirrels and the nuts they look for (#1672). The brains live in squirrelbrain.js (no three.js); this file draws them and ties them to
// the game: the crowns and ground come from the trees built in surroundings.js (river park patches and the paddock's shade trees, read
// from `treeFeet`/`aoTrees` so new trees there are used without a change here), the nuts are ordinary holdables (E takes one, E on a surface
// puts it down), crouching still with a nut in the hand lures a squirrel, and the feeding scores through `onFeed`.
// Cost: one merged mesh per squirrel (one draw call, shared material, no extra light or shadow caster), a nut mesh only while it lies out,
// a hidden squirrel/nut in winter costs nothing; the AI thinks every frame only within `simDist` m of the eye, every `farStep` s up to
// `farDist`, and beyond it only the coarse tree-graph step (#1716: the squirrels roam the whole Höje å valley).
// #1686: 18 nuts (not 6), bigger, each lying under an additive glint (a flat ring + a thin beam: ONE instanced mesh for all of them, so no draw
// call per nut; the nut's own mesh is drawn only within `nutNear` m), and the squirrels + nuts are shared between the players near them through
// squirrelsync.js (`net`: { send(m), remotes(), me() }, set by main.js): the leader simulates, the others adopt its snapshots.

const V = new THREE.Vector3(), tint = new THREE.Color(), MAT = new THREE.Matrix4();
const paint = (geo, hex) => {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3); tint.setHex(hex);
  for (let i = 0; i < n; i++) tint.toArray(c, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
};
/** A unit sphere squashed to radii (rx, ry, rz) at (x, y, z), in one colour; `belly`: lighter underneath (vertex colours blended by the normal).
 * #1716: `seg` [width, height] segments, `fur`: ± that much brightness noise per vertex (a mottled coat), from `rnd`. */
const blob = (rx, ry, rz, x, y, z, hex, belly = null, seg = [9, 7], fur = 0, rnd = Math.random) => {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]); g.deleteAttribute('uv');
  const nrm = g.attributes.normal, a = new THREE.Color(hex), b = belly === null ? a : new THREE.Color(belly), col = new Float32Array(nrm.count * 3), m = new THREE.Color();
  for (let i = 0; i < nrm.count; i++) { m.copy(b).lerp(a, THREE.MathUtils.smoothstep(nrm.getY(i), -0.45, 0.25)); if (fur) m.multiplyScalar(1 + (rnd() - 0.5) * 2 * fur); m.toArray(col, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(rx, ry, rz); g.translate(x, y, z); return g;
};
const seeded = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const UP = new THREE.Vector3(0, 1, 0), QT = new THREE.Quaternion(), HAUNCH = 0.065; // m behind the body centre: where it sits (#1716)
/** #1716: a hair tuft: an open cone `len` long from `at` along `dir`, `root` colour at the base fading to `tip` at the point. */
function tuft(at, dir, len, r, root, tip, segs) {
  const g = new THREE.ConeGeometry(r, len, segs, 1, true); g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(root), c1 = new THREE.Color(tip), m = new THREE.Color();
  for (let i = 0; i < pos.count; i++) m.copy(c0).lerp(c1, pos.getY(i) / len + 0.5).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, len / 2, 0); g.applyQuaternion(QT.setFromUnitVectors(UP, dir.clone().normalize())); g.translate(at.x, at.y, at.z); return g;
}
/** #1716: the tail's centre line (y, z) at rest (curled up over the back, as before) and flicked (raised, the tip snapped forward). */
const TAIL = {
  rest: [[0.075, -0.1], [0.14, -0.15], [0.2, -0.18], [0.26, -0.175], [0.31, -0.135], [0.34, -0.075], [0.35, -0.015]],
  flick: [[0.075, -0.1], [0.15, -0.13], [0.22, -0.13], [0.28, -0.1], [0.32, -0.05], [0.33, 0.01], [0.31, 0.055]],
};

// One closed elliptical loft, shared by the existing skinning and fallback morphs.
function surfaceLoft(rows, radial, spec, rnd, fur) {
  const positions=[],colors=[],indices=[],coat=new THREE.Color(spec.color),belly=new THREE.Color(spec.belly),color=new THREE.Color();
  for(const [z,y,w,h] of rows)for(let j=0;j<radial;j++) {
    const a=j*Math.PI*2/radial,ny=Math.cos(a);positions.push(Math.sin(a)*w*spec.width,y+ny*h,z);
    color.copy(belly).lerp(coat,THREE.MathUtils.smoothstep(ny,...SS.bellyBlend));if(fur)color.multiplyScalar(1+(rnd()-.5)*2*fur);color.toArray(colors,colors.length);
  }
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<radial;j++) {
    const a=i*radial+j,b=i*radial+(j+1)%radial,c=a+radial,d=b+radial;indices.push(a,c,b,b,c,d);
  }
  for(const [i,end]of[[0,false],[rows.length-1,true]]) {
    const [z,y]=rows[i],centre=positions.length/3;positions.push(0,y,z);coat.toArray(colors,colors.length);
    for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial;indices.push(...(end?[centre,b,a]:[centre,a,b]));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function tailSurface(curve,s,far) {
  const S=SS.tail,rows=far?S.rows.far:S.rows.near,radial=far?S.radial.far:S.radial.near,positions=[],colors=[],indices=[],side=new THREE.Vector3(1,0,0),color=new THREE.Color(),coat=new THREE.Color(s.tail),tip=s.tip?new THREE.Color(s.tip):null;
  const radius=(u,column)=>{let i=1;while(i<S.profile.length-1&&S.profile[i][0]<u)i++;const a=S.profile[i-1],b=S.profile[i];return THREE.MathUtils.lerp(a[column],b[column],THREE.MathUtils.smoothstep(u,a[0],b[0]));};
  for(let i=0;i<=rows;i++) {
    const u=i/rows,c=curve.getPointAt(u),t=curve.getTangentAt(u),normal=new THREE.Vector3().crossVectors(t,side).normalize();
    for(let j=0;j<radial;j++) {
      const a=j*Math.PI*2/radial,flow=S.flow.reduce((v,[around,along,gain])=>v+gain*Math.sin(a*around+u*along),0),ridge=1+S.ridge*flow,p=c.clone().addScaledVector(side,Math.cos(a)*radius(u,1)*s.width*ridge).addScaledVector(normal,Math.sin(a)*radius(u,2)*ridge);
      positions.push(...p.toArray());color.copy(coat);if(tip)color.lerp(tip,THREE.MathUtils.smoothstep(u,S.tipStart,S.tipEnd));color.multiplyScalar(1+S.frost*flow);color.toArray(colors,colors.length);
    }
  }
  for(let i=0;i<rows;i++)for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial,c=a+radial,d=b+radial;indices.push(a,b,c,b,d,c)}
  for(const[i,end]of[[0,false],[rows,true]]){const c=curve.getPointAt(i/rows),centre=positions.length/3;positions.push(...c.toArray());color.toArray(colors,colors.length);for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial;indices.push(...(end?[centre,a,b]:[centre,b,a]))}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** One squirrel's parts, metres, feet at y 0, nose +z, body about 22 cm and a 20 cm bushy tail curled over the back. #1716: a head with cheeks,
 * tapered face, nose, inset eyes and tufted ears, fore legs with paws, hind legs with long feet, a mottled coat and a closed curved plume
 * with shallow fur flow and an individually coloured tail tip. `far`: the cheaper distant version. `pose`: { flick } the tail
 * flicked, { head: ±1 } the head turned left / right (the morph targets; every pose has the same vertices). */
function squirrelParts(s, far, pose = {}) {
  const rnd = seeded(1716 + (far ? 7 : 0)), w = s.width, small = far ? [6, 4] : [7, 5], fur = far ? 0 : 0.07, head = [], body = [];
  const B = (rx, ry, rz, x, y, z, hex, belly = null, seg = small, list = body) => list.push(blob(rx, ry, rz, x, y, z, hex, belly, seg, fur, rnd));
  const paw = shade(s.color, 0.72), dark = shade(s.color, 0.55);
  body.push(surfaceLoft(SS.body,far?SS.radial.far:SS.radial.near,s,rnd,fur));
  const torsoCount=body.length;
  head.push(surfaceLoft(SS.head,far?SS.radial.far:SS.radial.near,s,rnd,fur));
  B(0.006, 0.005, 0.005, 0, 0.122, 0.149, 0x2a1d18, null, small, head);
  for (const k of [1, -1]) {
    B(...SS.eyes.scale, k * SS.eyes.at[0] * w, SS.eyes.at[1], SS.eyes.at[2], 0x120e0c, null, small, head);
    if (!far) B(...SS.eyes.glint, k * SS.eyes.glintAt[0] * w, SS.eyes.glintAt[1], SS.eyes.glintAt[2], 0xffffff, null, [5, 3], head);
    const ear = new THREE.Vector3(k * 0.021 * w, 0.155, 0.084), up = new THREE.Vector3(k * 0.28, 1, -0.22).normalize();
    head.push(tuft(ear, up, 0.03, 0.011, s.color, s.color, far ? 5 : 7));
    const top = ear.clone().addScaledVector(up, 0.026);
    for (let i = 0; i < (far ? 1 : 4); i++) head.push(tuft(top, up.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, 0.2, (rnd() - 0.5) * 0.7)), 0.02 + rnd() * 0.008, far ? 0.004 : 0.0024, dark, shade(s.color, 0.42), 3));
  }
  // legs: fore (upper arm, forearm, paw) and hind (thigh, long foot)
  for (const k of [1, -1]) {
    B(0.011, 0.024, 0.012, k * 0.026 * w, 0.062, 0.07, s.color, s.belly);
    B(0.008, 0.022, 0.009, k * 0.024 * w, 0.032, 0.083, s.color);
    B(0.009, 0.006, 0.013, k * 0.023 * w, 0.008, 0.092, paw);
    B(0.022 * w, 0.04, 0.04, k * 0.04 * w, 0.06, -0.06, s.color, s.belly);
    B(0.013, 0.009, 0.046, k * 0.036 * w, 0.009, -0.045, paw);
  }
  if (pose.head) { const m = new THREE.Matrix4().makeTranslation(0, 0.115, 0.065).multiply(new THREE.Matrix4().makeRotationY(pose.head * 0.65)).multiply(new THREE.Matrix4().makeTranslation(0, -0.115, -0.065)); for (const g of head) g.applyMatrix4(m); }
  // One continuous plume follows the retained rest/flick centreline and joints.
  const curve=new THREE.CatmullRomCurve3((pose.flick?TAIL.flick:TAIL.rest).map(([y,z])=>new THREE.Vector3(0,y,z))),tail=[tailSurface(curve,s,far)];
  // Part identity survives offline skinning; colours stay on the actual anatomy.
  body.forEach((g,i) => { g.userData.joint = i < torsoCount ? 'Joint_Haunch' :
    'Joint_' + ['Arm','Forearm','Paw','Thigh','Foot'][(i-torsoCount)%5] + '_' + (i < torsoCount+5 ? 'L' : 'R'); });
  head.forEach(g => { g.userData.joint = 'Joint_Head'; });
  tail.forEach(g => { g.userData.tail = true; });
  return [...body, ...head, ...tail];
}
/** #1716: the merged squirrel (one draw call) with three morph targets: 0 the tail flicked, 1 / 2 the head turned left / right.
 * #1780: shared by animals with the same look (colours, width, tail tip; the size is the mesh's scale). */
const geoCache = new Map();
function squirrelGeometry(s, far = false) {
  const key = [s.color, s.belly, s.tail, s.tip, s.width, far].join();
  if (!geoCache.has(key)) geoCache.set(key, buildSquirrelGeometry(s, far));
  return geoCache.get(key);
}
function buildSquirrelGeometry(s, far) {
  const build = (pose) => { const parts = squirrelParts(s, far, pose), g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };
  const g = build({}), poses = [{ flick: 1 }, { head: 1 }, { head: -1 }].map(build);
  g.morphAttributes.position = poses.map((q) => q.attributes.position); g.morphAttributes.normal = poses.map((q) => q.attributes.normal);
  for (const q of poses) { q.deleteAttribute('position'); q.deleteAttribute('normal'); q.dispose(); }
  return g;
}

// The baked GLB and all runtime looks use the same topology, part weights and
// original vertex-colour recipe. No generic atlas can overwrite eyes/belly/tail.
export const SQUIRREL_JOINTS = ['Root','Haunch','Spine','Chest','Head','Snout','Ear_L','Ear_R',
  'Arm_L','Forearm_L','Paw_L','Arm_R','Forearm_R','Paw_R','Thigh_L','Foot_L','Thigh_R','Foot_R',
  'Tail_0','Tail_1','Tail_2','Tail_3','Tail_4','Tail_5','Tail_Tip'].map(n=>'Joint_'+n);
const rigGeoCache = new Map();
export function squirrelRigGeometry(spec, far=false) {
  const key=[spec.color,spec.belly,spec.tail,spec.tip,spec.width,far].join();
  if(rigGeoCache.has(key)) return rigGeoCache.get(key);
  const parts=squirrelParts(spec,far);
  for(const g of parts) {
    const p=g.attributes.position, ids=new Uint16Array(p.count*4), weights=new Float32Array(p.count*4);
    for(let i=0;i<p.count;i++) {
      if(g.userData.tail) {
        // Project onto the continuous centreline, then blend neighbouring joints.
        let best=Infinity, segment=0, blend=0;
        for(let j=0;j<TAIL.rest.length-1;j++) {
          const a=TAIL.rest[j], b=TAIL.rest[j+1], dy=b[0]-a[0], dz=b[1]-a[1];
          const t=THREE.MathUtils.clamp(((p.getY(i)-a[0])*dy+(p.getZ(i)-a[1])*dz)/(dy*dy+dz*dz),0,1);
          const d=(p.getY(i)-a[0]-t*dy)**2+(p.getZ(i)-a[1]-t*dz)**2;
          if(d<best){best=d;segment=j;blend=t;}
        }
        ids[i*4]=18+segment;ids[i*4+1]=19+segment;weights[i*4]=1-blend;weights[i*4+1]=blend;
      } else { ids[i*4]=SQUIRREL_JOINTS.indexOf(g.userData.joint);weights[i*4]=1; }
    }
    g.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();rigGeoCache.set(key,geometry);return geometry;
}

// Rigged GLB loader; anatomical look correction #1908.
let riggedSquirrelModelPromise = null;
let riggedSquirrelData = null;

export function loadRiggedSquirrelModel() {
  if (riggedSquirrelData) return Promise.resolve(riggedSquirrelData);
  if (riggedSquirrelModelPromise) return riggedSquirrelModelPromise;
  const loader = new GLTFLoader();
  const modelUrl = modelURL('../models/squirrel-rigged.glb', import.meta.url).href;
  riggedSquirrelModelPromise = new Promise((resolve, reject) => {
    loader.load(
      modelUrl,
      (gltf) => {
        riggedSquirrelData = gltf;
        resolve(gltf);
      },
      undefined,
      (err) => {
        console.warn('Failed to load rigged squirrel model, fallback to procedural squirrel:', err);
        reject(err);
      }
    );
  });
  return riggedSquirrelModelPromise;
}

/** An acorn (0) or a hazelnut (1) of real size 3 cm; the mesh is scaled by SQUIRRELS.nutSize. */
const nutGeos = [
  mergeGeometries([blob(0.011, 0.016, 0.011, 0, 0.012, 0, 0xb98a4a), blob(0.0125, 0.008, 0.0125, 0, 0.024, 0, 0x6b5030), blob(0.002, 0.004, 0.002, 0, 0.033, 0, 0x4a3820)]),
  mergeGeometries([blob(0.0145, 0.0155, 0.0145, 0, 0.0145, 0, 0xc19a5b), blob(0.012, 0.007, 0.012, 0, 0.004, 0, 0x7d6038)]),
];

/** #1697: how strong the glint is at a daylight level (0 night … 1 day): dark at night and dusk, full by day, eased in between. */
export function markStrength(daylight) {
  const [a, b] = C.markDay, t = Math.min(1, Math.max(0, (daylight - a) / (b - a)));
  return C.markNight + (1 - C.markNight) * t * t * (3 - 2 * t);
}

/** #1686: the glint under every nut lying out: a flat ring and a thin crossed beam, vertex colours fading the beam to black (additive), one geometry. */
function markGeometry() {
  const parts = [], paintFade = (g, top) => {
    const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = top ? Math.max(0, 1 - pos.getY(i) / C.markBeam) : 1; c[i * 3] = 1 * k * 0.8; c[i * 3 + 1] = 0.82 * k * 0.8; c[i * 3 + 2] = 0.45 * k * 0.8; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const ring = new THREE.RingGeometry(C.markRing * 0.7, C.markRing, 20); ring.rotateX(-Math.PI / 2); ring.translate(0, 0.03, 0); ring.deleteAttribute('uv'); parts.push(paintFade(ring, false));
  for (const a of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(0.05, C.markBeam, 1, 4); q.translate(0, C.markBeam / 2 + 0.02, 0); q.rotateY(a); q.deleteAttribute('uv'); parts.push(paintFade(q, true)); }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose(); return g;
}

/** A nut on the ground you can take (E), carry and put down like anything else. Its slot (NutField) says whether it lies out. */
export class Nut extends Holdable {
  constructor(scene, camera, slot, material, host) {
    const mesh = new THREE.Mesh(nutGeos[0], material);
    mesh.scale.setScalar(C.nutSize); mesh.visible = false; mesh.userData.noDetail = true;
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { // a generous 12 cm ball to aim at: the nut itself is 3 cm (7 cm drawn)
      sphere.set(this.getWorldPosition(V), 0.12);
      if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
    super(scene, camera, { name: 'en nöt', verb: 'ta', backName: 'marken', backVerb: 'lägga', model: mesh, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(0.14, -0.15, -0.36), rot: new THREE.Euler(0.5, 0.7, 0.3) }, pick: { pos: new THREE.Vector3(), size: [0.1, 0.1, 0.1] } });
    Object.assign(this, { slot, host, isSquirrelNut: true, outdoorPlace: true, broken: true }); // #1755: `outdoorPlace`: the park has no floor plane (floorSpot is indoor-only), so E puts it down on the ground like a cat (outdoorSpot)
    this.pickMesh = this.holder.children[this.holder.children.length - 1];
  }
  take(){if(handBusy(this))return;if(this.host.net?.on&&!this._accepted){if(!this.host.net.ready()||this.host.sync.dropVersion!==2){this.host.net.notice?.('Väntar på uppdaterad nötsynk');return;}this.host.sync.requestTake(this.slot,ok=>{if(ok){this._accepted=true;super.take();this._accepted=false;}});return;}super.take();}
  placeAt(p,yaw=0){if(this.host.net?.on&&!this._acceptedPut){if(!this.host.net.ready()||this.host.sync.dropVersion!==2||!this.slot.netOwned||this.slot.awaiting){this.host.net.notice?.('Väntar på att nöten bekräftas');return;}const pose=new THREE.Object3D();this.poseAt(pose,p,yaw);this.host.sync.requestPut(this.slot,pose.position.toArray(),pose.quaternion.toArray(),ok=>{if(ok){this._acceptedPut=true;super.placeAt(p,yaw);this._acceptedPut=false;this.slot.netOwned=false;}});return;}super.placeAt(p,yaw);}
  onTake() { this.slot.held = true; this.slot.by = null; this.slot.age = 0; if(!this._accepted)this.host.sync.take(this.slot); }
  onPut() { this.slot.held = false; this.slot.age = 0; this.putPending = !this._acceptedPut; } // (where it lies is known once placeAt / goHome has moved the model: sync())
  /** Out of the world (eaten, fed, expired, winter): no target, no mesh. */
  vanish() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.model.removeFromParent(); this.model.visible = false; this.broken = true; this.placed = false;
  }
  appear() {
    const s = this.slot;
    this.broken = false; this.model.geometry = nutGeos[s.kind]; this.rest = null;
    this.home.pos.set(s.x, s.y + 0.004, s.z); this.home.rot.set(0, Math.random() * 6.28, s.kind ? 0 : 1.2);
    if(s.sharedDrop&&s.dropP){this.home.pos.set(...s.dropP);this.home.rot.set(0,0,0);}this.pickMesh.position.copy(this.home.pos);this.goHome();if(s.sharedDrop&&s.dropQ){this.model.quaternion.set(...s.dropQ);this.placed=true;}this.model.visible = true;
  }
  /** Out of play for everybody else: another player holds it (the leader keeps the slot, #1686). */
  get away() { return this.slot.held && !!this.slot.by; }
  sync() {
    const s = this.slot, want = s.alive && !this.away;
    if(this.held&&s.sharedDrop&&!s.held&&!s.awaiting){this.held=false;if(heldItem()===this)setHeld(null);this.appear();}
    if(s.poseDirty&&want&&!this.held){this.appear();s.poseDirty=false;}
    if (want === this.broken) { want ? this.appear() : this.vanish(); }
    if (want && !this.held && !this.broken) {
      s.x = this.model.position.x; s.y = this.model.position.y; s.z = this.model.position.z;
      if (this.putPending) { this.putPending = false; this.host.sync.put(s, s.x, s.z); }
      const cam = this.camera.position; this.model.visible = Math.hypot(cam.x - s.x, cam.z - s.z) < C.nutNear; // far away only the glint is drawn
    }
  }
}

export class Squirrels {
  /** `feet`: surroundings.js treeFeet, `crowns`: its aoTrees, `ground(x, z)`: the walkable surface, `walkable(x, z)` / `nutOk(x, z)`: where it may run / a nut may lie,
   * `onFeed(brain)`: scoring. `rnd`: injectable for tests. #1780: `southFeet` (surroundings.js southTreeFeet, with their crowns) and `road(x, z, m)`
   * (roads.js onVehicle) for the home areas' own groves (SQUIRRELS.areas with a `box`). `nutWalls` supplies actual
   * collision segments for #1831's short path-to-nut approach checks. */
  constructor({ scene, camera, player, feet, crowns, ground, walkable, nutOk, onFeed, southFeet = [], road = null, nutWalls = () => [], rnd = Math.random }) {
    Object.assign(this, { sfx, scene, camera, player, ground, onFeed, rnd, winter: true, time: 0, speed: 0, acc: [], lastX: NaN, lastZ: NaN, lure: false, net: null, cand: [], track: new Map(), markT: 0, daylight: 1, hour: 12, wasFollow: false });
    const parkPatches = new Set([...(SITE.riverPark.patches ?? []).map((q) => q.name), 'bridge-west']), // (the other `patch` names in treeFeet belong to the street/backdrop areas)
      paddock = PADDOCK.trees ?? [], same = (a, b) => Math.abs(a.x - b[0]) < 0.01 && Math.abs(a.z - b[1]) < 0.01, river = riverFrame(SITE.river.path), q = {};
    // #1716: and every other tree along Höje å inside the walkable area (within roam.valley m of the river's centre line)
    const valley = (f) => f.x > WALK.x0 && f.x < WALK.x1 && f.z > WALK.z0 && f.z < WALK.z1 && river(f.x, f.z, q).d <= C.roam.valley;
    const wood = SITE.riverPark.woodBridge, gc = SITE.bridges?.gc, crossings = [wood?.ends, gc?.ends].filter(Boolean); // (the timber footbridge and the foot/cycle bridge)
    const crownOf = (f) => {
      let best = null, bd = 0.05; for (const c of crowns) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < bd) { bd = d; best = c; } }
      return { x: f.x, z: f.z, y: f.y, cy: best ? best.y : f.cy ?? f.y + 5, r: best ? best.r : f.r ?? 3 };
    };
    // #1780: the home areas' own groves: their trees (a group each) and their ground: inside the box, on land and off every road
    const groves = Object.entries(C.areas ?? {}).filter(([, A]) => A.box), fences = groveFences(walkable, road);
    const own = groves.flatMap(([g, A]) => [...feet, ...southFeet].filter((f) => Number.isFinite(f.y) && inBox(A.box, f.x, f.z) && groveTreeOk(fences[g], f.x, f.z)).map((f) => ({ ...crownOf(f), g })));
    this.trees = linkTrees([...feet.filter((f) => parkPatches.has(f.patch) || paddock.some(([x, z]) => same(f, [x, z])) || valley(f)).map(crownOf), ...own],
      { path: SITE.river.path, walkable, crossings, fences });
    this.fences = fences;
    // (a nut near a grove lies inside it, where its squirrel may go: not in a house or on a road beside it)
    const m = C.spread * 1.5, near = groves.map(([g, A]) => [g, A.box, [A.box[0] - m, A.box[1] + m, A.box[2] - m, A.box[3] + m]]);
    const nutHere = (x, z) => {
      const inside = near.find(([, b]) => inBox(b, x, z)); if (inside) return fences[inside[0]](x, z) && nutOk(x, z);
      return !near.some(([, , o]) => inBox(o, x, z)) && nutOk(x, z);
    };
    this.player_ = { x: 0, z: 0, lure: false, hx: 0, hz: 0, id: '' };
    this.nuts = new NutField(this.trees, ground, nutHere, rnd);
    this.nuts.preferred = nutPathSpots(SITE.riverPark.paths, this.trees, ground, nutHere, nutWalls);
    this.nuts.anchors = () => [{ x: camera.position.x, z: camera.position.z }, ...(this.net?.remotes?.() ?? []).map((r) => ({ x: r.x, z: r.z }))];
    // #1716: the home ranges drift with the wall clock (the same for every player), the day comes from the game's clock (update's `hour`)
    const env = { trees: this.trees, ground, walkable, fences, nuts: this.nuts, player: this.player_, scares: this.cand, rnd, onTake: (b) => this.take(b), now: () => Date.now() / 1000, hour: () => this.hour, others: [], onScare: b => { const p=this.cand[0], d=p?Math.hypot(p.x-b.x,p.z-b.z):Infinity; if(p&&((d<C.touch&&!p.lure)||(d<b.p.shy*C.scareReach&&(p.v>C.scareSpeed||p.rose)))) discoverCreature(`squirrel:${b.spec.name}`,'scare'); } };
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.nutMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    this.hearts = new Hearts(scene, C.hearts, C.heartScale);
    this.sync = new SquirrelSync({me:()=>this.net?.me?.()??'', field: this.nuts, brains: [], send: (m) => this.net?.send(m) ?? false, hooks: { fed: (an, who) => this.fedBy(an, who), dropHeld: (slot) => this.dropHeld(slot),notice:t=>this.net?.notice?.(t) } });
    this.nutItems = this.nuts.slots.map((s) => new Nut(scene, camera, s, this.nutMaterial, this));
    this.marks = new THREE.InstancedMesh(markGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), C.maxNuts);
    Object.assign(this.marks, { frustumCulled: false, raycast: () => {}, visible: false, count: 0 }); this.marks.userData.noDetail = true; this.marks.userData.warmDraw = true; this.marks.name = 'squirrel-nut-marks'; scene.add(this.marks);
    const taken = new Set();
    this.animals = this.trees.length ? C.animals.map((spec, i) => {
      const best = startTree(this.trees, spec, i, taken); // (#1780: by its home area's centre, among its group's trees)
      const brain = new SquirrelBrain(spec, env, best); brain.enterPerch(brain.homeTree(brain.homeS(), true), rnd() * Math.PI * 2); // (#1716: where its range is now)
      const geos = [squirrelGeometry(spec), squirrelGeometry(spec, true)], group = new THREE.Group(), body = new THREE.Mesh(geos[1], this.material); // #1716: near / far detail
      body.scale.setScalar(spec.scale); body.userData.noDetail = true; body.raycast = () => {}; body.name = `squirrel-${i}`;
      const mouth = new THREE.Mesh(nutGeos[0], this.nutMaterial); mouth.scale.setScalar(C.nutSize * spec.scale); mouth.position.set(0, 0.112 * spec.scale, (0.15 + HAUNCH) * spec.scale); body.position.z = HAUNCH * spec.scale; // (the group's origin at the haunch: it sits up round it)
      mouth.rotation.x = Math.PI / 2; mouth.visible = false; mouth.raycast = () => {}; mouth.userData.noDetail = true;
      group.rotation.order = 'YXZ'; group.add(body, mouth); group.visible = false; scene.add(group);
      this.acc.push(0);
      const an = { brain, group, mouth, body, spec, geos, flickT: 9, flickAt: 2 + rnd() * 4, head: 0, headTo: 0, headT: 0, isRigged: false };
      if (riggedSquirrelData) {
        this.setupRigged(an, riggedSquirrelData);
      } else {
        loadRiggedSquirrelModel().then((g) => this.setupRigged(an, g)).catch(() => {});
      }
      return an;
    }) : [];
    this.sync.brains.push(...this.animals.map((a) => a.brain)); env.others.push(...this.sync.brains);
    registerSeasonal((month) => { this.winter = winterMonth(month); });
    this.hide();
  }
  setupRigged(a, gltf) {
    if (!gltf || a.isRigged) return;
    a.isRigged = true;
    a.riggedScene = SkeletonUtils.clone(gltf.scene);
    a.riggedScene.scale.setScalar(a.spec.scale);
    a.riggedScene.position.z = HAUNCH * a.spec.scale;
    a.group.add(a.riggedScene);

    a.bones = {};
    a.riggedScene.traverse((obj) => {
      if (obj.isSkinnedMesh) {
        a.skinnedMesh = obj;
        a.skinnedMesh.material = a.skinnedMesh.material.clone();
        a.skinnedMesh.material.roughness = 0.85;
        a.skinnedMesh.material.metalness = 0.05;
        a.skinnedMesh.castShadow = false; // preserve the existing no-shadow budget
        a.rigGeos = [squirrelRigGeometry(a.spec), squirrelRigGeometry(a.spec,true)];
        a.skinnedMesh.geometry = a.rigGeos[0];
        a.skinnedMesh.material.vertexColors = true;
        a.skinnedMesh.material.map = null;
      }
      if (obj.isBone || obj.type === 'Bone' || (obj.name && obj.name.startsWith('Joint'))) {
        a.bones[obj.name] = obj;
      }
    });

    if (gltf.animations && gltf.animations.length > 0) {
      a.mixer = new THREE.AnimationMixer(a.riggedScene);
      a.actions = {};
      for (const clip of gltf.animations) {
        a.actions[clip.name] = a.mixer.clipAction(clip);
      }
      if (a.actions['idle']) {
        a.activeAction = a.actions['idle'];
        a.activeAction.play();
      }
    }

    // Hide procedural body mesh so only the single rigged SkinnedMesh renders
    a.body.visible = false;
  }

  hide() { for (const a of this.animals) a.group.visible = false; }
  /** #1698: what a visitor (this one, or a ghost the leader sees) does: speed, how long still, and whether they just rose from a crouch. `crouch`: 0 … 1. */
  trackVisitor(id, dt, speed, crouch) {
    let t = this.track.get(id); if (!t) this.track.set(id, t = { still: 0, crouch, rose: 0 });
    t.still = speed < C.still ? t.still + dt : 0;
    t.rose = crouch < 0.6 && t.crouch > 0.85 ? C.roseFor : Math.max(0, t.rose - dt);
    t.crouch = crouch; t.seen = this.time; return t;
  }
  /** The visitor's hand: a nut held, crouched all the way down, and still (under `still` m/s for `stillFor` s). Everybody near is also a possible scare (`cand`: v, rose). */
  watchPlayer(dt) {
    const pos = this.camera.getWorldPosition(V), p = this.player_;
    if (Number.isFinite(this.lastX) && dt > 0) this.speed += (Math.hypot(pos.x - this.lastX, pos.z - this.lastZ) / dt - this.speed) * Math.min(1, dt * 12);
    this.lastX = pos.x; this.lastZ = pos.z;
    const it = heldItem(), me = this.net?.me?.() ?? '', mt = this.trackVisitor(me, dt, this.speed, this.player.crouched ? 1 : 0);
    p.x = pos.x; p.z = pos.z; p.lure = !!((!this.net?.on||this.net.ready()&&this.sync.dropVersion===2&&it?.slot?.netOwned&&!it.slot.awaiting)&&this.player.crouched && it?.isSquirrelNut && mt.still >= C.stillFor);
    const d = this.camera.getWorldDirection(new THREE.Vector3()), l = Math.hypot(d.x, d.z) || 1;
    p.hx = pos.x + d.x / l * C.handAhead; p.hz = pos.z + d.z / l * C.handAhead;
    p.id = me;
    // #1686: the leader also lets the other players' lures count (what it knows of their ghosts), but only for a nut the room says they hold.
    // #1698: and their speed (the ghosts' own estimate from position snapshots, no extra traffic) can scare.
    this.cand.length = 0; this.cand.push({ id: p.id, x: p.x, z: p.z, lure: p.lure, hx: p.hx, hz: p.hz, v: this.speed, rose: mt.rose > 0 });
    if (this.sync.lead && this.sync.sharing) for (const r of this.net?.remotes?.() ?? []) {
      const rt = this.trackVisitor(r.id, dt, r.vh, r.crouch), lure = r.hi === 'nut' && r.crouch > 0.85 && rt.still >= C.stillFor && this.sync.remoteHeld.has(r.id);
      this.cand.push({ id: r.id, x: r.x, z: r.z, lure, hx: r.x - Math.sin(r.yaw) * C.handAhead, hz: r.z - Math.cos(r.yaw) * C.handAhead, v: r.vh, rose: rt.rose > 0 });
    }
    if (this.track.size > 8) for (const [k, t] of this.track) if (this.time - t.seen > 5) this.track.delete(k);
  }
  /** The visitor a squirrel pays attention to: the nearest one holding a lure within its range, else the nearest of all. Copied into the brains' `player`. */
  focus(b) {
    let best = null, bd = Infinity;
    for (const c of this.cand) { const d = Math.hypot(c.x - b.x, c.z - b.z) - (c.lure && Math.hypot(c.x - b.x, c.z - b.z) < b.spec.lure ? 1e4 : 0); if (d < bd) { bd = d; best = c; } }
    Object.assign(this.player_, best ?? { x: 1e5, z: 1e5, lure: false, hx: 1e5, hz: 1e5, id: '' }); b.who = this.player_.id;
  }
  /** A squirrel reaches a hand: the nut in it is theirs; points and hearts for whoever fed it (#1686: the leader may be feeding another player's nut). */
  take(brain) {
    const a = this.animals.find((q) => q.brain === brain), an = this.animals.indexOf(a), me = this.net?.me?.() ?? '', who = brain.who ?? me;
    if(this.net?.on){if(!this.net.ready()||this.sync.dropVersion!==2)return false;const it=heldItem(),slot=who===me?(it?.isSquirrelNut?it.slot:null):this.nuts.slots[this.sync.remoteHeld.get(who)];if(!slot||slot.awaiting||who===me&&!slot.netOwned)return false;return this.sync.feed(slot,who,an)!==false;}
    if (who === me) {
      const it = heldItem();
      if (!it?.isSquirrelNut) return false;
      this.sync.feed(it.slot, me, an);
      this.nuts.remove(it.slot); it.sync(); // gone from the hand
      discoverCreature(`squirrel:${brain.spec.name}`, 'feed'); this.onFeed?.(brain, a);
    } else { // another player's hand (we lead): their nut is claimed in the room
      const i = this.sync.remoteHeld.get(who), slot = this.nuts.slots[i];
      if (!slot || !slot.held) return false;
      this.sync.feed(slot, who, an); this.nuts.remove(slot); this.nutItems[i].sync();
    }
    V.set(brain.x, brain.y + 0.2 * brain.spec.scale, brain.z); this.hearts.burst(V); this.chirp(brain);
    return true;
  }
  /** #1699: the happy chirp from the squirrel's position, once per feeding (leader: where it takes; follower: where the 'F' is applied). Pitch varies per squirrel. */
  chirp(brain) {
    const k = Math.max(0, this.animals.findIndex((q) => q.brain === brain)) - 1;
    this.sfx?.chirp({ x: brain.x, y: brain.y + 0.2 * brain.spec.scale, z: brain.z }, 1 + k * C.chirp.pitchJitter);
  }
  /** Follower: the leader's squirrel `an` took `who`'s nut: hearts for everybody, the nut and the points for the feeder. */
  fedBy(an, who) {
    const a = this.animals[an]; if (!a) return;
    V.set(a.brain.x, a.brain.y + 0.2 * a.brain.spec.scale, a.brain.z); this.hearts.burst(V); this.chirp(a.brain);
    if (who !== (this.net?.me?.() ?? '')) return;
    const it = heldItem(); if (!it?.isSquirrelNut) return;
    it.slot.alive = false; it.slot.held = false; it.sync(); discoverCreature(`squirrel:${a.spec.name}`, 'feed'); this.onFeed?.(a.brain, a);
  }
  /** The room refused our take (somebody was first): the nut leaves the hand again. */
  dropHeld(slot) { const it = this.nutItems[this.nuts.slots.indexOf(slot)]; if (!it?.held) return; slot.alive = false; slot.held = false; it.sync(); }
  /** Per frame: the glint under each nut lying out within `markDist` m, eased in by distance (one instanced mesh). */
  updateMarks() {
    const m = this.marks, cam = this.camera.position; let n = 0;
    const str = markStrength(this.daylight); m.material.opacity = str; // (additive: opacity 0 = no light at all; nothing is drawn below 2 %)
    for (const s of this.nuts.slots) {
      if (!s.alive || s.held) continue;
      const d = Math.hypot(cam.x - s.x, cam.z - s.z); if (d > C.markDist) continue;
      const t = Math.min(1, (d - C.markFade) / (C.markDist - C.markFade)), k = (t > 0 ? 1 - t * t * (3 - 2 * t) : 1) * (1 + 0.1 * Math.sin(this.time * 3 + n)); // #1742: shrinks away between markFade and markDist
      if (k < 0.01) continue;
      m.setMatrixAt(n++, MAT.makeScale(k, k, k).setPosition(s.x, s.y, s.z));
    }
    m.count = n; m.visible = n > 0 && str > 0.02; m.instanceMatrix.needsUpdate = true;
  }
  /** Per frame. `hidden`: underground (nothing runs). */
  update(dt, hidden = false, daylight = 1, hour = 12) {
    this.daylight = daylight; this.hour = hour;
    this.hearts.update(dt);this.sync.poll();
    const on = !this.winter && !hidden && this.animals.length > 0;
    this.nuts.setActive(!this.winter && this.animals.length > 0);
    if (!on) { if (this.animals.some((a) => a.group.visible)) this.hide(); }
    const cam = this.camera.position, follow = this.sync.follow;
    if (on) { // near the squirrels (hysteresis): join the shared group (#1686)
      const near = this.animals.reduce((m, a) => Math.min(m, Math.hypot(cam.x - a.brain.x, cam.z - a.brain.z)), Infinity);
      this.sync.setNear(!!this.net?.ready() && near < (this.sync.near ? C.sync.leave : C.sync.enter));
    } else this.sync.setNear(false);
    if (this.nuts.active && !follow) { this.nuts.update(dt); }
    for (const n of this.nutItems) if (this.nuts.active || !n.broken) n.sync();
    if (this.nuts.active) this.updateMarks(); else if (this.marks.visible) this.marks.visible = false;
    if (!on) return;
    this.time += dt;
    this.watchPlayer(dt);
    this.sync.tick(dt);
    if (this.wasFollow && !follow) for (const a of this.animals) a.brain.resync(); // #1716: simulating again after following: settle on a real tree
    this.wasFollow = follow;
    this.animals.forEach((a, i) => {
      const b = a.brain, d = Math.hypot(cam.x - b.x, cam.z - b.z);
      // #1686: the leader simulates for everybody: a squirrel is awake when ANY player near the squirrels is within range of it
      let ds = d; if (!follow) for (const c of this.cand) ds = Math.min(ds, Math.hypot(c.x - b.x, c.z - b.z));
      b.ds = ds; // (#1780: the leader's snapshot carries only the animals somebody is near)
      if (d > C.farDist && (follow || ds > C.farDist)) { // #1716: nobody near: the coarse brain steps through the tree graph every roam.coarse s
        a.group.visible = false;
        if (!follow && (this.acc[i] += dt) >= C.roam.coarse) { b.coarse(this.acc[i]); this.acc[i] = 0; }
        return;
      }
      if (!follow) {
        this.focus(b);
        if (ds > C.simDist) { this.acc[i] += dt; if (this.acc[i] < C.farStep) return; b.update(this.acc[i]); this.acc[i] = 0; } else { b.update(this.acc[i] + dt); this.acc[i] = 0; }
      }
      this.pose(a, d, dt);
    });
  }
  pose(a, d, dt = 0) {
    const b = a.brain, g = a.group, run = b.run, hop = run > 0.05 && !['down', 'up', 'leap'].includes(b.state) ? Math.abs(Math.sin(this.time * 14 + b.spec.scale * 9)) * 0.035 * run : 0;
    g.visible = d < C.drawDist && b.state !== 'nest'; // (#1716: asleep in the drey, inside the crown)

    // Sitting still it flicks its tail now and then and turns its head in quick jerks
    const still = run < 0.05 && !['down', 'up', 'leap', 'eat', 'take', 'bury', 'dig', 'nest'].includes(b.state);
    if (still && (a.flickAt -= dt) <= 0) { a.flickAt = 2 + this.rnd() * 5; a.flickT = 0; }
    if (b.flick > 0.95 && a.flickT > 0.6) a.flickT = 0;
    a.flickT += dt;

    if ((a.headT -= dt) <= 0) { a.headT = 0.25 + this.rnd() * 0.7; a.headTo = still ? (this.rnd() - 0.5) * 2 : 0; }
    a.head += (a.headTo - a.head) * Math.min(1, dt * 18);
    const hk = 1 - 0.75 * Math.min(1, b.rise);

    if (a.isRigged && a.mixer) {
      const geo=a.rigGeos[d < C.look.near ? 0 : 1];
      if(a.skinnedMesh.geometry !== geo) a.skinnedMesh.geometry=geo;
      a.mixer.update(dt);

      let targetName = 'idle';
      if (b.state === 'eat' || b.state === 'take') {
        targetName = 'eat';
      } else if (b.state === 'up' || b.state === 'down') {
        targetName = 'climb';
      } else if (run > 0.05) {
        targetName = 'run';
      } else if (a.flickT < 0.6) {
        targetName = 'flick';
      }

      if (a.actions && a.actions[targetName]) {
        const nextAction = a.actions[targetName];
        if (a.activeAction !== nextAction) {
          if (a.activeAction) a.activeAction.crossFadeTo(nextAction, 0.15, true);
          nextAction.play();
          a.activeAction = nextAction;
        }
        if (targetName === 'run') {
          nextAction.timeScale = Math.max(0.6, run * (a.spec.speed ?? 1));
        } else {
          nextAction.timeScale = 1.0;
        }
      }

      if (a.bones && a.bones['Joint_Head']) {
        a.bones['Joint_Head'].rotation.y = a.head * hk * 0.65;
      }
    } else if (a.body && a.body.morphTargetInfluences) {
      const geo = a.geos[d < C.look.near ? 0 : 1]; if (a.body.geometry !== geo) a.body.geometry = geo;
      const inf = a.body.morphTargetInfluences;
      inf[0] = a.flickT < 0.6 ? Math.sin(Math.PI * a.flickT / 0.3) ** 2 : 0;
      inf[1] = Math.max(0, a.head) * hk;
      inf[2] = Math.max(0, -a.head) * hk;
    }

    const sway = b.state === 'perch' ? Math.sin(this.time * 0.9 + b.spec.scale * 7) * 0.5 : 0, yaw = b.yaw + sway, back = HAUNCH * b.spec.scale;
    g.position.set(b.x - Math.sin(yaw) * back, b.y + hop * b.spec.scale, b.z - Math.cos(yaw) * back); // (the body centre stays at the brain's point)
    g.rotation.y = yaw;
    g.rotation.x = -(b.pitch + b.rise * 1.05 - (hop > 0 ? Math.sin(this.time * 14) * 0.12 : 0));
    a.mouth.visible = b.hasNut;
  }
  /** For tests: where each squirrel is and what it does. */
  state() { return this.animals.map((a) => ({ name: a.spec.name, state: a.brain.state, x: a.brain.x, y: a.brain.y, z: a.brain.z, hasNut: a.brain.hasNut, visible: a.group.visible })); }
}

// Every configured coat/shape has its own stable collection number.
const SQUIRREL_NUMBERS = { 'Den stora':38, Vitsvansen:39, 'Den smala':40, Parkekorren:41, Gårdsekorren:42, Tofsen:43, Klockan:44, Rödpälsen:45, Svartsvansen:46, Ljusbuken:47 };
for (const s of C.animals) creature({ id:`squirrel:${s.name}`, no:SQUIRREL_NUMBERS[s.name], modelVersion:2, name:s.name, family:'squirrels', variant:s.tip?'Ljus svanstipp':'Rödbrun päls', level:s.tip?1:0, model:{kind:'squirrel',name:s.name}, info:{size:`${Math.round(s.scale*100)} % av grundmodellens storlek`,weight:'0,2–0,5 kg (uppskattning)',where:s.home?'Egen träddunge vid huset':'Träden vid Höje å',when:'Vaken vår–höst; vintervila',likes:'Nötter och en stilla, hukande besökare'},facts:['Varje ekorre har eget hemområde och temperament.','Kan klättra mellan träden och gömma nötter.'] });
export { squirrelGeometry };
