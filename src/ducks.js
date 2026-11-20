import { modelURL } from './modelurl.js';
import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import { DuckKiss, duckBill } from './duckkiss.js';
import { Hearts } from './pingping.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { DuckFlock, DUCKS, heldBread, feedBread } from './duckbrain.js';
import { duckHabitat } from './duckhabitat.js';
import { duckModel, duckRigGeometry } from './duckmodel.js';
import { heldItem } from './holdable.js';
import { sfx } from './audio.js';
import { DuckActivity, duckPose, wakeVertices, wakeVertexCount, DUCK_MOTION } from './duckmotion.js';
import { waterYAt } from './riverbridge.js';
import { duckNight, duckSleepPose, duckLureNear, DUCK_LIFE } from './ducklife.js';

// #2126: bones given additive pose offsets after the mixer; reset to rest first so unanimated bones never accumulate.
const POSE_BONES = ['Joint_Neck', 'Joint_Head', 'Joint_Tail', 'Joint_Wing_L', 'Joint_Wing_R'];
const poseEuler = new THREE.Euler(), poseQuat = new THREE.Quaternion();
const turnBone = (bone, x, y, z) => { if (bone && (x || y || z)) bone.quaternion.multiply(poseQuat.setFromEuler(poseEuler.set(x, y, z))); };


// Rigged GLB loader; rounded anatomical forms and original colours restored in #1909.
let riggedDuckModelPromise = null;
let riggedDuckData = null;

export function loadRiggedDuckModel() {
  if (riggedDuckData) return Promise.resolve(riggedDuckData);
  if (riggedDuckModelPromise) return riggedDuckModelPromise;
  const loader = new GLTFLoader();
  const modelUrl = modelURL('../models/duck-rigged.glb', import.meta.url).href;
  riggedDuckModelPromise = new Promise((resolve, reject) => {
    loader.load(
      modelUrl,
      (gltf) => {
        riggedDuckData = gltf;
        resolve(gltf);
      },
      undefined,
      (err) => {
        console.warn('Failed to load rigged duck model, fallback to procedural duck:', err);
        reject(err);
      }
    );
  });
  return riggedDuckModelPromise;
}

export class Ducks {
  constructor({ scene, camera, life, ground, say, hour = () => 12 }) {
    Object.assign(this, { camera, life, ground, say, hour, quackCooldown: 0, quacks: 0, feeds: 0 });
    this.habitat = duckHabitat(ground);
    this.flock = new DuckFlock(this.habitat);
    const geometries = [duckModel(false), duckModel(true)], mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.kiss = new DuckKiss({
      config: DUCKS.kiss,
      bill: duckBill(geometries[0].attributes.position),
      habitat: this.habitat,
      seen: b => this.kissVisible(b),
      burst: p => {
        this.kissHearts ??= new Hearts(scene, DUCKS.kiss.hearts, DUCKS.kiss.heartScale);
        this.kissHearts.burst({ ...p.point, y: p.point.y + DUCKS.kiss.heartLift });
      }
    });
    this.animals = this.flock.brains.map(brain => {
      const mesh = new THREE.Mesh(geometries[brain.female ? 1 : 0], mat);
      mesh.name = brain.female ? 'river-duck-female' : 'river-duck-male';
      scene.add(mesh);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(...DUCKS.pick.size), new THREE.MeshBasicMaterial());
      pick.visible = false;
      scene.add(pick);
      const target = { kind: 'duck', name: 'ankan med bröd', verb: 'mata', pickable: pick, toggle: () => this.feed(brain) };
      Object.defineProperties(target, {
        blocked: { get: () => !heldBread(life, heldItem()) || brain.cooldown > 0 },
        blockedText: { get: () => brain.cooldown > 0 ? 'Ankan tuggar' : 'Håll en brödskiva utan pålägg' }
      });
      pick.userData.door = target;
      // Own seeded behaviour stream, separate from the brain's random sequence (goals/quacks stay identical).
      return { brain, mesh, pick, target, activity: new DuckActivity(brain.seed * 31 + brain.id + 2126), pose: null };
    });

    this.wake = this.buildWake(scene);
    loadRiggedDuckModel().then(gltf => {
      for (const a of this.animals) {
        this.setupRigged(a, gltf);
      }
    }).catch(() => {
      // Procedural fallback remains visible if GLB fails
    });

    this.update(0, false);
  }

  setupRigged(a, gltf) {
    if (a.riggedScene) return;
    a.riggedScene = SkeletonUtils.clone(gltf.scene);
    a.riggedScene.name = a.mesh.name + '-rigged';
    a.bones = {};
    a.riggedScene.traverse(obj => {
      if (obj.isSkinnedMesh) {
        a.skinnedMesh = obj;
        obj.geometry=duckRigGeometry(a.brain.female);
        obj.material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
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

    a.rest = POSE_BONES.map(n => a.bones[n] && [a.bones[n], a.bones[n].quaternion.clone(), a.bones[n].position.clone()]).filter(Boolean);
    a.mesh.add(a.riggedScene);
    // Hide procedural geometry so only the single SkinnedMesh renders
    a.mesh.material = new THREE.MeshBasicMaterial({ visible: false });
  }

  /** One shared transparent ribbon batch for all V wakes; hidden (no draw) whenever no bird leaves a wake. */
  buildWake(scene) {
    const n = wakeVertexCount(), arm = DUCK_MOTION.wake.segments, count = this.animals.length;
    const pos = new Float32Array(n * count * 3), col = new Float32Array(n * count * 4), index = [];
    for (let d = 0; d < count; d++) for (let side = 0; side < 2; side++) for (let i = 0; i < arm; i++) {
      const v = d * n + side * (arm + 1) * 2 + i * 2;
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const g = new THREE.BufferGeometry(), c = new THREE.Color(DUCK_MOTION.wake.color);
    for (let i = 0; i < n * count; i++) col.set([c.r, c.g, c.b, 0], i * 4);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * count * 3).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setIndex(index);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    Object.assign(mesh, { name: 'river-duck-wake', frustumCulled: false, visible: false, renderOrder: 1 });
    scene.add(mesh);
    return { mesh, alpha: new Float32Array(n), n };
  }

  updateWake(dt, hidden) {
    const W = this.wake, g = W.mesh.geometry, pos = g.attributes.position.array, col = g.attributes.color.array, M = DUCK_MOTION.wake;
    let any = false;
    this.animals.forEach((a, d) => {
      const s = !hidden && a.mesh.visible ? a.activity.wake : 0;
      if (s <= 0) { if (a.wakeShown) { for (let i = 0; i < W.n; i++) col[(d * W.n + i) * 4 + 3] = 0; a.wakeShown = false; } return; }
      const b = a.brain, mask = a.wakeMask ??= new Uint8Array(W.n / 2);
      // Bank test (drawn ground above the water hides that part of an arm), refreshed a few times a second per bird.
      const fresh = (a.wakeAge = (a.wakeAge ?? 0) - dt) <= 0 || !a.wakeShown;
      if (fresh) { a.wakeAge = M.maskEvery; a.wakeLevel = waterYAt(b.x, b.z); }
      let k = 0;
      const water = fresh ? (x, z) => (mask[k++] = this.ground(x, z) < a.wakeLevel - M.lift) : () => mask[k++] === 1;
      wakeVertices(b, s, a.wakeLevel + M.lift, water, pos.subarray(d * W.n * 3, (d + 1) * W.n * 3), W.alpha);
      for (let i = 0; i < W.n; i++) col[(d * W.n + i) * 4 + 3] = W.alpha[i];
      a.wakeShown = any = true;
    });
    if (any || W.mesh.visible) { g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true; }
    W.mesh.visible = any;
  }

  kissVisible(b) {
    const p = this.camera.position;
    if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) > Math.min(DUCKS.near, DUCKS.kiss.near)) return false;
    this.camera.updateMatrixWorld();
    const v = (this.kissV ??= new THREE.Vector3()).set(b.x, b.y + this.kiss.bill.y, b.z).project(this.camera);
    return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > -1 && v.z < 1;
  }

  targets() {
    return this.animals.filter(a => a.mesh.visible).map(a => a.pick);
  }

  feed(brain) {
    if (brain.cooldown > 0 || Math.hypot(this.camera.position.x - brain.x, this.camera.position.z - brain.z) > DUCKS.feedReach || Math.abs(this.camera.position.y - brain.y) > DUCKS.maxFeedHeight || !feedBread(this.life, heldItem())) return false;
    this.kiss.interrupt(brain);
    brain.feed();
    this.feeds++;
    discoverCreature(`duck:${brain.female ? 'female' : 'male'}`, 'feed');
    this.onFeed?.();
    this.say('Ankan åt en bit bröd');
    this.quack(brain);
    return true;
  }

  quack(b) {
    if (this.quackCooldown > 0) return;
    this.quackCooldown = DUCKS.quackCooldown;
    this.quacks++;
    sfx.quack({ x: b.x, y: b.y + .5, z: b.z }, b.female);
  }

  update(dt, hidden) {
    this.quackCooldown = Math.max(0, this.quackCooldown - dt);
    const bread = heldBread(this.life, heldItem()), p = this.camera.position;
    const food = bread ? { x: p.x, z: p.z, y: p.y } : null;
    // #2126: a player rushing at a duck (not offering bread) startles it into a short take-off.
    const last = this.lastPlayer ??= p.clone(), vx = dt > 0 ? (p.x - last.x) / dt : 0, vz = dt > 0 ? (p.z - last.z) / dt : 0, T = DUCK_MOTION.takeoff;
    last.copy(p);
    if (!hidden) for (const a of this.animals) {
      const b = a.brain, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
      const toward = (vx * dx + vz * dz) / (d || 1), disturbed = !food && d < T.disturb && toward < T.maxSpeed && Math.abs(p.y - b.y) < DUCKS.maxFeedHeight && toward > T.disturbSpeed;
      b.restAlert=Math.max(0,(b.restAlert??0)-dt); if(disturbed)b.restAlert=DUCK_LIFE.alert;
      if(disturbed||duckLureNear(b,food,this.habitat)){b.roosting=false;b.sleeping=false;}
      const wasAir=a.activity.airborne;
      a.activity.update(dt, b, { disturbed, asleep: d >= DUCKS.near });
      if(wasAir!==a.activity.airborne && d<DUCKS.near) sfx.duckWings({x:b.x,y:b.y+.3,z:b.z},b.swimming);
      if(a.activity.airborne)b.restAlert=DUCK_LIFE.alert;
    }
    this.kiss.update(dt, this.flock, food, hidden);
    if (!hidden) {
      for (const b of this.flock.update(dt, food, b => !this.kiss.owns(b) && Math.hypot(p.x - b.x, p.z - b.z) < DUCKS.near, duckNight(this.hour()))) {
        this.quack(b);
      }
    }
    if (this.kissHearts) {
      if (hidden || !this.kiss.pair) this.kissHearts.points.visible = false;
      else this.kissHearts.update(dt);
    }
    for (const a of this.animals) {
      const b = a.brain, d = Math.hypot(p.x - b.x, p.z - b.z);
      a.mesh.visible = !hidden && d < DUCKS.draw;
      const o = a.pose = duckPose(b, a.activity, a.pose ?? undefined);
      const busy=b.kissing||b.eating||b.lured||a.activity.airborne;
      if(busy)a.sleepWeight=0; // Feeding/flight and exact kiss bill contact take precedence immediately.
      const sleep=b.sleeping&&!busy?1:0;
      a.sleepWeight=(a.sleepWeight??0)+(sleep-(a.sleepWeight??0))*Math.min(1,dt*DUCK_LIFE.poseEase);
      if(a.sleepWeight>1e-4) duckSleepPose(o,a.sleepWeight,a.activity.time,b.female?1:-1);
      const fwd = o.surge + o.tz;
      a.mesh.position.set(b.x + Math.sin(b.yaw) * fwd, b.y + (b.swimming && !b.kissing ? DUCKS.bob * Math.sin(b.phase) : 0) + o.lift + o.ty, b.z + Math.cos(b.yaw) * fwd);
      if (a.riggedScene) {
        a.mesh.rotation.set(o.pitch, b.yaw, o.roll, 'YXZ');
      } else {
        a.mesh.rotation.set((b.eating ? Math.sin(b.eating * DUCKS.eatPhase) * DUCKS.eatNod : 0) + o.pitch, b.yaw, (!b.kissing && !b.swimming && b.moving ? Math.sin(b.phase) * DUCKS.waddle : 0) + o.roll, 'YXZ');
      }
      a.pick.position.set(b.x, b.y + DUCKS.pick.height, b.z);
      a.pick.rotation.y = b.yaw;
      a.mesh.updateMatrixWorld();
      a.pick.updateMatrixWorld();

      if (a.mixer) {
        let targetName = 'idle';
        if (o.flap) {
          targetName = 'flap';
        } else if (b.eating > 0) {
          targetName = 'eat';
        } else if (b.swimming) {
          targetName = b.moving ? 'swim' : 'idle';
        } else {
          targetName = b.moving ? 'waddle' : 'idle';
        }
        if (a.actions && a.actions[targetName]) {
          const nextAction = a.actions[targetName];
          if (a.activeAction !== nextAction) {
            if (a.activeAction) a.activeAction.fadeOut(0.18);
            nextAction.reset().fadeIn(0.18).play();
            a.activeAction = nextAction;
          }
        }
        for (const [bone, q, p] of a.rest) { bone.quaternion.copy(q); bone.position.copy(p); }
        a.mixer.update(dt);
        const B = a.bones;
        if(B.Joint_Neck){ B.Joint_Neck.position.x+=o.neckSide; B.Joint_Neck.position.y+=o.neckDown; B.Joint_Neck.position.z+=o.neckBack; }
        turnBone(B.Joint_Neck, o.neckX, o.neckY, 0); turnBone(B.Joint_Head, o.headX, 0, 0); turnBone(B.Joint_Tail, 0, o.tailY, 0);
        turnBone(B.Joint_Wing_L, 0, 0, -o.wing); turnBone(B.Joint_Wing_R, 0, 0, o.wing);
      }
    }
    this.updateWake(dt, hidden);
  }
}

for (const [female, no] of [[false, 48], [true, 49]]) {
  creature({
    id: `duck:${female ? 'female' : 'male'}`,
    no,
    name: female ? 'Gräsand · hona' : 'Gräsand · hane',
    family: 'ducks',
    modelVersion: 2,
    variant: female ? 'Brunspräcklig dräkt' : 'Grönt huvud',
    model: { kind: 'duck', female },
    info: {
      size: 'Cirka 50–65 cm (uppskattning)',
      weight: '0,7–1,5 kg (uppskattning)',
      where: 'Stränder och vatten i Höje å',
      when: 'Dag och kväll',
      likes: 'Lugnt vatten och sällskap'
    },
    facts: [
      'Honans bruna dräkt ger kamouflage.',
      'Paret håller ofta ihop med honan framför.'
    ]
  });
}
