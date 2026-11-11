import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import { DuckKiss, duckBill } from './duckkiss.js';
import { Hearts } from './pingping.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { DuckFlock, DUCKS, heldBread, feedBread } from './duckbrain.js';
import { duckHabitat } from './duckhabitat.js';
import { duckModel } from './duckmodel.js';
import { heldItem } from './holdable.js';
import { sfx } from './audio.js';

// Rigged GLB Duck Loader & Feather Texture Generator (#1896)
let riggedDuckModelPromise = null;
let riggedDuckData = null;

export function loadRiggedDuckModel() {
  if (riggedDuckData) return Promise.resolve(riggedDuckData);
  if (riggedDuckModelPromise) return riggedDuckModelPromise;
  const loader = new GLTFLoader();
  const modelUrl = new URL('../models/duck-rigged.glb', import.meta.url).href;
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

const duckTextureCache = new Map();

export function createDuckTexture(female = false) {
  if (typeof document === 'undefined') return null;
  const key = female ? 'duck:female' : 'duck:male';
  if (duckTextureCache.has(key)) return duckTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let seed = female ? 4919 : 4819;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  if (!female) {
    // === DRAKE (Hane) ===
    ctx.fillStyle = '#8c7761';
    ctx.fillRect(0, 0, 512, 512);

    // 1. UV_BODY: (25, 25, 205, 205)
    ctx.fillStyle = '#968a7c';
    ctx.fillRect(25, 25, 205, 205);
    ctx.fillStyle = '#b0a698';
    ctx.fillRect(25, 120, 205, 110);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#7d7063' : '#a89d8e';
      ctx.globalAlpha = 0.15;
      ctx.fillRect(25 + rnd() * 200, 25 + rnd() * 200, 3 + rnd() * 6, 1 + rnd() * 2);
    }
    ctx.globalAlpha = 1.0;

    // 2. UV_BREAST: (280, 25, 206, 205)
    const bGrad = ctx.createLinearGradient(280, 25, 280, 230);
    bGrad.addColorStop(0, '#53281e');
    bGrad.addColorStop(1, '#663226');
    ctx.fillStyle = bGrad;
    ctx.fillRect(280, 25, 206, 205);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#3b1b14' : '#733b2c';
      ctx.globalAlpha = 0.12;
      ctx.fillRect(280 + rnd() * 200, 25 + rnd() * 200, 3 + rnd() * 5, 2 + rnd() * 2);
    }
    ctx.globalAlpha = 1.0;

    // 3. UV_HEAD: (25, 280, 205, 105)
    const hGrad = ctx.createLinearGradient(25, 280, 25, 385);
    hGrad.addColorStop(0, '#1a5032');
    hGrad.addColorStop(0.85, '#226942');
    hGrad.addColorStop(0.88, '#ffffff'); // vit halsring
    hGrad.addColorStop(0.96, '#ffffff');
    hGrad.addColorStop(1, '#1a5032');
    ctx.fillStyle = hGrad;
    ctx.fillRect(25, 280, 205, 105);
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = '#2db069';
      ctx.globalAlpha = 0.08 + rnd() * 0.08;
      ctx.fillRect(25 + rnd() * 200, 280 + rnd() * 85, 4 + rnd() * 6, 2 + rnd() * 3);
    }
    ctx.globalAlpha = 1.0;
    // Ögon
    ctx.fillStyle = '#100d08';
    ctx.beginPath();
    ctx.arc(65, 320, 6, 0, Math.PI * 2);
    ctx.arc(190, 320, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(67, 318, 2, 0, Math.PI * 2);
    ctx.arc(192, 318, 2, 0, Math.PI * 2);
    ctx.fill();

    // 4. UV_BILL: (25, 408, 130, 80)
    ctx.fillStyle = '#d8b628';
    ctx.fillRect(25, 408, 130, 80);
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(135, 408, 20, 80);
    ctx.fillStyle = '#c0a01e';
    ctx.fillRect(25, 470, 110, 18);

    // 5. UV_FEET: (178, 408, 80, 80)
    ctx.fillStyle = '#df751c';
    ctx.fillRect(178, 408, 80, 80);
    ctx.fillStyle = '#b75b0f';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(185 + i * 18, 408, 4, 80);
    }

    // 6. UV_WING: (280, 280, 206, 105)
    ctx.fillStyle = '#6e6457';
    ctx.fillRect(280, 280, 206, 105);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(320, 310, 120, 50);
    ctx.fillStyle = '#181716';
    ctx.fillRect(324, 313, 112, 44);
    ctx.fillStyle = '#26498f';
    ctx.fillRect(328, 316, 104, 38);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = '#4270c9';
      ctx.globalAlpha = 0.15;
      ctx.fillRect(330 + rnd() * 100, 318 + rnd() * 34, 4 + rnd() * 6, 2 + rnd() * 4);
    }
    ctx.globalAlpha = 1.0;

    // 7. UV_TAIL: (280, 408, 206, 80)
    ctx.fillStyle = '#22201e';
    ctx.fillRect(280, 408, 206, 80);
    ctx.fillStyle = '#e5e2db';
    ctx.fillRect(280, 408, 45, 80);
    ctx.fillRect(441, 408, 45, 80);
  } else {
    // === HEN (Hona) ===
    ctx.fillStyle = '#827052';
    ctx.fillRect(0, 0, 512, 512);

    // 1. UV_BODY: (25, 25, 205, 205)
    ctx.fillStyle = '#8b7758';
    ctx.fillRect(25, 25, 205, 205);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = rnd() < 0.35 ? '#453523' : rnd() < 0.7 ? '#6b583e' : '#c8b594';
      ctx.globalAlpha = 0.22;
      ctx.fillRect(25 + rnd() * 200, 25 + rnd() * 200, 4 + rnd() * 6, 2 + rnd() * 3);
    }
    ctx.globalAlpha = 1.0;

    // 2. UV_BREAST: (280, 25, 206, 205)
    ctx.fillStyle = '#8f7957';
    ctx.fillRect(280, 25, 206, 205);
    for (let i = 0; i < 450; i++) {
      ctx.fillStyle = rnd() < 0.4 ? '#4a3824' : rnd() < 0.75 ? '#6a563b' : '#ccb898';
      ctx.globalAlpha = 0.2;
      ctx.fillRect(280 + rnd() * 200, 25 + rnd() * 200, 4 + rnd() * 6, 2 + rnd() * 3);
    }
    ctx.globalAlpha = 1.0;

    // 3. UV_HEAD: (25, 280, 205, 105)
    ctx.fillStyle = '#8f7956';
    ctx.fillRect(25, 280, 205, 105);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#56442f' : '#bfa987';
      ctx.globalAlpha = 0.2;
      ctx.fillRect(25 + rnd() * 200, 280 + rnd() * 100, 3 + rnd() * 4, 2 + rnd() * 2);
    }
    ctx.globalAlpha = 1.0;
    // Mörkt ögonstreck
    ctx.fillStyle = '#392d21';
    ctx.fillRect(25, 316, 205, 10);
    // Ljust ögonbrynsstreck
    ctx.fillStyle = '#d0bea0';
    ctx.fillRect(25, 308, 205, 7);
    // Ögon
    ctx.fillStyle = '#100d08';
    ctx.beginPath();
    ctx.arc(65, 321, 5.5, 0, Math.PI * 2);
    ctx.arc(190, 321, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(67, 319, 1.8, 0, Math.PI * 2);
    ctx.arc(192, 319, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 4. UV_BILL: (25, 408, 130, 80)
    ctx.fillStyle = '#b57b30';
    ctx.fillRect(25, 408, 130, 80);
    ctx.fillStyle = '#3a3228';
    ctx.fillRect(25, 408, 130, 35);

    // 5. UV_FEET: (178, 408, 80, 80)
    ctx.fillStyle = '#d4731c';
    ctx.fillRect(178, 408, 80, 80);
    ctx.fillStyle = '#a65311';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(185 + i * 18, 408, 4, 80);
    }

    // 6. UV_WING: (280, 280, 206, 105)
    ctx.fillStyle = '#7a6850';
    ctx.fillRect(280, 280, 206, 105);
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#4b3c29' : '#b29e7f';
      ctx.globalAlpha = 0.2;
      ctx.fillRect(280 + rnd() * 200, 280 + rnd() * 100, 4 + rnd() * 5, 2 + rnd() * 3);
    }
    ctx.globalAlpha = 1.0;
    // Vingspegel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(320, 310, 120, 50);
    ctx.fillStyle = '#181716';
    ctx.fillRect(324, 313, 112, 44);
    ctx.fillStyle = '#26498f';
    ctx.fillRect(328, 316, 104, 38);

    // 7. UV_TAIL: (280, 408, 206, 80)
    ctx.fillStyle = '#78644c';
    ctx.fillRect(280, 408, 206, 80);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#443522' : '#bca888';
      ctx.globalAlpha = 0.25;
      ctx.fillRect(280 + rnd() * 200, 408 + rnd() * 75, 4 + rnd() * 5, 2 + rnd() * 3);
    }
    ctx.globalAlpha = 1.0;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  duckTextureCache.set(key, texture);
  return texture;
}

export class Ducks {
  constructor({ scene, camera, life, ground, say }) {
    Object.assign(this, { camera, life, ground, say, quackCooldown: 0, quacks: 0, feeds: 0 });
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
      return { brain, mesh, pick, target };
    });

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
        const tex = createDuckTexture(a.brain.female);
        if (tex) {
          obj.material = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.8,
            metalness: 0.1,
          });
        }
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

    a.mesh.add(a.riggedScene);
    // Hide procedural geometry so only the single SkinnedMesh renders
    a.mesh.material = new THREE.MeshBasicMaterial({ visible: false });
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
    sfx.quack({ x: b.x, y: b.y + .5, z: b.z });
  }

  update(dt, hidden) {
    this.quackCooldown = Math.max(0, this.quackCooldown - dt);
    const bread = heldBread(this.life, heldItem()), p = this.camera.position;
    const food = bread ? { x: p.x, z: p.z, y: p.y } : null;
    this.kiss.update(dt, this.flock, food, hidden);
    if (!hidden) {
      for (const b of this.flock.update(dt, food, b => !this.kiss.owns(b) && Math.hypot(p.x - b.x, p.z - b.z) < DUCKS.near)) {
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
      a.mesh.position.set(b.x, b.y + (b.swimming && !b.kissing ? DUCKS.bob * Math.sin(b.phase) : 0), b.z);
      if (a.riggedScene) {
        a.mesh.rotation.set(0, b.yaw, 0);
      } else {
        a.mesh.rotation.set(b.eating ? Math.sin(b.eating * DUCKS.eatPhase) * DUCKS.eatNod : 0, b.yaw, !b.kissing && !b.swimming && b.moving ? Math.sin(b.phase) * DUCKS.waddle : 0, 'YXZ');
      }
      a.pick.position.set(b.x, b.y + DUCKS.pick.height, b.z);
      a.pick.rotation.y = b.yaw;
      a.mesh.updateMatrixWorld();
      a.pick.updateMatrixWorld();

      if (a.mixer) {
        let targetName = 'idle';
        if (b.eating > 0) {
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
        a.mixer.update(dt);
      }
    }
  }
}

for (const [female, no] of [[false, 48], [true, 49]]) {
  creature({
    id: `duck:${female ? 'female' : 'male'}`,
    no,
    name: female ? 'Gräsand · hona' : 'Gräsand · hane',
    family: 'ducks',
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
