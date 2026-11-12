import { modelURL } from './modelurl.js';
import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import {buildPingpingSurface,pingpingMaterials,adoptPingpingTextures} from './pingpingsurface.js';
import { PINGPING as P } from './config.js';
import { sfx } from './audio.js';
import { Thing, KINDS } from './things.js';

// Pingping (#269): the penguin cushion between the pillows in Sarah and Olof's bed (docs/pingping-pingvinkudde.jpg).
// A squat, squishy navy body (a sphere pushed out towards a rounded box), an off-white face mask and belly, pink
// cheeks, black eyes and a yellow beak painted on a shell over the front, two flippers and two feet. A Thing
// (things.js): E takes him into your arms — both hands round his sides (hand.js 'hug') — E puts him down on a bed,
// a sofa, a table or the floor (he sits up, facing you) or back between the pillows; F sends him home.
// A hug (click / "Krama"): he is pulled in and squashed, a happy squeak, hearts rise (one additive Points).

let pingpingModelData = null;
let pingpingModelLoading = null;

export function loadPingpingModel() {
  if (pingpingModelData) return Promise.resolve(pingpingModelData);
  if (pingpingModelLoading) return pingpingModelLoading;

  pingpingModelLoading = new Promise((resolve, reject) => {
    try {
      const isNode = typeof process !== 'undefined' && process?.versions?.node;
      if (isNode) {
        if (typeof self === 'undefined') globalThis.self = globalThis;
        Promise.all([
          import('node:fs'),
          import('node:path'),
          import('three/examples/jsm/loaders/GLTFLoader.js')
        ]).then(([fs, path, { GLTFLoader }]) => {
          const modelPath = path.resolve(process.cwd(), 'models/pingping.glb');
          if (!fs.existsSync(modelPath)) {
            resolve(null);
            return;
          }
          const buf = fs.readFileSync(modelPath);
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          // Node tools inspect geometry; browser canvas/ImageBitmap owns the embedded cloth maps.
          const loader=new GLTFLoader();
          loader.register(parser=>{parser.loadTexture=()=>Promise.resolve(null);return {name:'PingpingNodeGeometryOnly'};});
          loader.parse(arrayBuffer, '', (gltf) => {
            adoptPingpingTextures(gltf);
            pingpingModelData = gltf;
            resolve(gltf);
          }, reject);
        }).catch((err) => {
          console.warn('Node GLTF pingping load fallback:', err);
          resolve(null);
        });
      } else {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          const url = modelURL('../models/pingping.glb', import.meta.url).href;
          new GLTFLoader().load(url, (gltf) => {
            adoptPingpingTextures(gltf);
            pingpingModelData = gltf;
            resolve(gltf);
          }, undefined, (err) => {
            console.warn('Could not load pingping.glb:', err);
            resolve(null);
          });
        }).catch(reject);
      }
    } catch {
      resolve(null);
    }
  });

  return pingpingModelLoading;
}

if (typeof window !== 'undefined') {
  loadPingpingModel().catch(() => {});
}

/** Pingping, his bottom centre at the origin, facing +z. */
export function pingpingModel() {
  const g = new THREE.Group();
  const {navy,face:faceMat,feet:feetMat}=pingpingMaterials();

  if (pingpingModelData?.scene) {
    let bodyGeo = null, faceGeo = null, flippersGeo = null, feetGeo = null;
    pingpingModelData.scene.traverse((obj) => {
      if (obj.name === 'Pingping_body' && !bodyGeo) bodyGeo = obj.geometry.clone();
      if (obj.name === 'Pingping_face' && !faceGeo) faceGeo = obj.geometry.clone();
      if (obj.name === 'Pingping_flippers' && !flippersGeo) flippersGeo = obj.geometry.clone();
      if (obj.name === 'Pingping_feet' && !feetGeo) feetGeo = obj.geometry.clone();
    });
    if (bodyGeo && faceGeo && flippersGeo && feetGeo) {
      const body = new THREE.Mesh(bodyGeo, navy);
      const face = new THREE.Mesh(faceGeo, faceMat);
      const flippers = new THREE.Mesh(flippersGeo, navy);
      const feet = new THREE.Mesh(feetGeo, feetMat);
      for (const m of [body, face, flippers, feet]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      return g;
    }
  }

  // Missing or not-yet-loaded asset uses exactly the same static authored surface.
  navy.dispose();faceMat.dispose();feetMat.dispose();
  return buildPingpingSurface();
}

/** A soft pink heart with a glow (the hearts that rise when he is hugged). */
export function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,190,210,0.7)'); glow.addColorStop(0.5, 'rgba(255,140,170,0.15)'); glow.addColorStop(1, 'rgba(255,140,170,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffd6e2';
  g.beginPath();
  g.moveTo(32, 50);
  g.bezierCurveTo(10, 36, 12, 14, 24, 14); g.bezierCurveTo(29, 14, 32, 19, 32, 22);
  g.bezierCurveTo(32, 19, 35, 14, 40, 14); g.bezierCurveTo(52, 14, 54, 36, 32, 50);
  g.fill();
  return new THREE.CanvasTexture(c);
}

/** Hearts rising from a point in the world: a burst per hug, each lives `life` s. */
export class Hearts {
  /** `scale` 1 = a hug's small hearts; larger = a bigger, higher-rising burst (the petted ponies, #1320). */
  constructor(scene, n, scale = 1) {
    this.k = scale;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.045 * scale, map: heartTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: scale > 1 ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false }));
    Object.assign(this.points, { frustumCulled: false, visible: false, renderOrder: 2 });
    this.points.raycast = () => {}; // never an E target
    scene.add(this.points);
    this.p = [...Array(n)].map(() => ({ t: 1, o: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.life = 1.6;
  }

  burst(at) {
    this.p.forEach((h, i) => {
      const a = i * 2.39996, r = (0.05 + Math.random() * 0.1) * this.k;
      h.o.set(at.x + Math.sin(a) * r, at.y + Math.random() * 0.06, at.z + Math.cos(a) * r);
      h.v.set(Math.sin(a) * 0.08 * this.k, (0.28 + Math.random() * 0.2) * this.k, Math.cos(a) * 0.08 * this.k);
      h.t = -i * 0.03; // one after another
    });
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    const pos = this.points.geometry.attributes.position, col = this.points.geometry.attributes.color;
    let alive = false, fade = 0;
    this.p.forEach((h, i) => {
      h.t += dt;
      const k = h.t / this.life;
      if (k < 0 || k >= 1) { col.setXYZ(i, 0, 0, 0); pos.setY(i, -1000); if (k < 0) alive = true; return; } // (dead ones are parked far below: normal blending would show black)
      alive = true;
      const s = h.t;
      pos.setXYZ(i, h.o.x + h.v.x * s + Math.sin(s * 5 + i) * 0.02, h.o.y + h.v.y * s, h.o.z + h.v.z * s);
      const b = Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.4);
      if (this.k > 1) { col.setXYZ(i, 1, 0.42, 0.62); fade = Math.max(fade, b); } // big hearts (#1320): opaque pink over the sky, faded together
      else col.setXYZ(i, b * 0.75, b * 0.16, b * 0.34); // pink: added onto what is behind
    });
    if (this.k > 1) this.points.material.opacity = Math.min(1, fade * 1.5);
    pos.needsUpdate = col.needsUpdate = true;
    this.points.visible = alive;
  }
}

export class Pingping extends Thing {
  constructor(scene, camera, opts) {
    super(scene, camera, { ...opts, name: 'Pingping', held: { pos: [P.held.x, P.held.y, P.held.z], rot: [P.held.tilt, 0, 0] } });
    Object.assign(this, {
      soft: true, // can go down on a bed or a sofa too
      handPose: 'hug', // in both arms (hand.js)
      hugGrips: P.grips ?? [[P.w / 2 - 0.012, P.h * 0.48, 0.03], [-P.w / 2 + 0.012, P.h * 0.48, 0.03]], // right hand, left hand (his frame, #914)
      placeVerb: 'sätta ner', cooldown: P.hugTime * 0.7, hugT: 1, hugs: 0,
    });
    this.hearts = new Hearts(scene, P.hearts);
  }

  get useLabel() { return 'Krama'; }

  onTake() { sfx.plush(this.where()); }
  onPut() { this.hugT = 1; this.model.scale.set(1, 1, 1); sfx.plush(this.where()); }

  /** Put down sitting up, facing the visitor. */
  placeAt(p, yaw) {
    super.placeAt(p, yaw);
  }
  /** Sitting up, facing the visitor (the ghost the same, #368). */
  poseAt(obj, p) { super.poseAt(obj, p, 0); obj.rotation.set(0, Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z), 0); }

  /** A hug. */
  onUse() {
    this.hugT = 0;
    this.hugs++;
    sfx.squeak(this.where());
    this.hearts.burst(this.where().add(new THREE.Vector3(0, P.h * 0.75, 0)));
    discoverCreature('figure:pingping', 'hug'); this.onHug?.();
  }

  tick() {
    const k = this.hugT < 1 ? Math.sin(Math.PI * this.hugT) : 0, h = P.held;
    // pulled in against you and squashed (flatter front to back, a little wider), then back
    this.model.position.set(h.x, h.y + 0.02 * k, h.z + P.pull * k);
    this.model.scale.set(1 + P.squash * 0.35 * k, 1 - P.squash * 0.2 * k, 1 - P.squash * k);
  }

  update(dt) {
    if (this.hugT < 1) this.hugT = Math.min(1, this.hugT + dt / P.hugTime);
    super.update(dt);
    this.hearts.update(dt);
  }
}

KINDS.pingping = Pingping; // furniture.js lists him in the bed's userData.things with kind 'pingping'

creature({id:'figure:pingping',modelVersion:2,no:65,name:'Pingping',family:'figures',level:1,model:{kind:'pingping'},info:{size:`${Math.round(P.h*100)} cm modellhöjd`,weight:'En mjuk kudde',where:'Sängen hemma',when:'Alltid redo för en kram',likes:'Kramar'},facts:['En pingvinkudde som piper och visar hjärtan.','En mötbar, rörlig figur; vanliga stilla leksaker är inte djurposter.']});
