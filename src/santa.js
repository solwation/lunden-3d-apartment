import { modelURL } from './modelurl.js';
import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { santaBody, santaArm, santaLegGeometry } from './santasurface.js';
import { SANTA as S, santaState } from './santaconfig.js';
import { LANDSKRONA } from './config.js';

// An original-only Christmas Eve guest. All poses are in the movable sofa's frame.
// Static coloured parts are merged; the pose-specific legs, two arms, glass and sleep text stay separate.
const material = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });

let santaModelData = null;
let santaModelLoading = null;

export function loadSantaModel() {
  if (santaModelData) return Promise.resolve(santaModelData);
  if (santaModelLoading) return santaModelLoading;

  santaModelLoading = new Promise((resolve, reject) => {
    try {
      const isNode = typeof process !== 'undefined' && process?.versions?.node;
      if (isNode) {
        if (typeof self === 'undefined') globalThis.self = globalThis;
        Promise.all([
          import('node:fs'),
          import('node:path'),
          import('three/examples/jsm/loaders/GLTFLoader.js')
        ]).then(([fs, path, { GLTFLoader }]) => {
          const modelPath = path.resolve(process.cwd(), 'models/santa.glb');
          if (!fs.existsSync(modelPath)) {
            resolve(null);
            return;
          }
          const buf = fs.readFileSync(modelPath);
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
            santaModelData = gltf;
            resolve(gltf);
          }, reject);
        }).catch((err) => {
          console.warn('Node GLTF santa load fallback:', err);
          resolve(null);
        });
      } else {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          const url = modelURL('../models/santa.glb', import.meta.url).href;
          new GLTFLoader().load(url, (gltf) => {
            santaModelData = gltf;
            resolve(gltf);
          }, undefined, (err) => {
            console.warn('Could not load santa.glb:', err);
            resolve(null);
          });
        }).catch(reject);
      }
    } catch {
      resolve(null);
    }
  });

  return santaModelLoading;
}

if (typeof window !== 'undefined') {
  loadSantaModel().catch(() => {});
}

function figure() {
  const object = new THREE.Group(), mat = material();
  object.name = 'jultomten';

  let body = null;
  let leftArmMesh = null, rightArmMesh = null;
  let sitLegsGeo = null, sleepLegsGeo = null;
  let glbGlass = null;

  if (santaModelData?.scene) {
    santaModelData.scene.traverse((obj) => {
      if (obj.name === 'Santa_body' && !body) {
        body = new THREE.Mesh(obj.geometry.clone(), mat);
        body.userData.cheeks = obj.userData?.cheeks ? JSON.parse(JSON.stringify(obj.userData.cheeks)) : [];
      }
      if (obj.name === 'Santa_arm_left' && !leftArmMesh) leftArmMesh = obj.clone();
      if (obj.name === 'Santa_arm_right' && !rightArmMesh) rightArmMesh = obj.clone();
      if (obj.name === 'Santa_legs_sitting' && !sitLegsGeo) sitLegsGeo = obj.geometry.clone();
      if (obj.name === 'Santa_legs_sleeping' && !sleepLegsGeo) sleepLegsGeo = obj.geometry.clone();
      if (obj.name === 'Santa_glass' && !glbGlass) glbGlass = obj.clone();
    });
  }

  function arm(mat, right) {
    const pivot = new THREE.Group();
    pivot.position.set(right ? -0.28 : 0.28, 0.51, 0.02);
    const armMesh = right ? rightArmMesh : leftArmMesh;
    if (armMesh) {
      pivot.add(armMesh);
    } else {
      pivot.add(santaArm(mat, right));
    }
    pivot.rotation.x = -0.6;
    return pivot;
  }

  if (!body) body = santaBody(mat);

  body.geometry.getAttribute('color').setUsage(THREE.DynamicDrawUsage); // cheek colours change after upload, including on phones
  body.castShadow = body.receiveShadow = true;
  object.add(body);

  const legs = new THREE.Mesh(new THREE.BufferGeometry(), mat); // actual seat dimensions below
  legs.castShadow = legs.receiveShadow = true;
  object.add(legs);

  const left = arm(mat, false), right = arm(mat, true);
  object.add(left, right);

  const glass = glbGlass || new THREE.Group();
  glass.position.fromArray(S.sip.glassRest);
  if (!glbGlass) {
    // A small, low whisky tumbler containing dark red glögg. No bottle or loose pickable is spawned.
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xe3e8e5, transparent: true, opacity: 0.32, roughness: 0.18, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.043, 0.095, 12, 1, true), glassMat);
    glass.add(shell);
    const glogg = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.058, 12), new THREE.MeshStandardMaterial({ color: 0x631d27, roughness: 0.28 }));
    glogg.position.y = -0.013; glass.add(glogg);
  }
  object.add(glass);

  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.9), new THREE.MeshBasicMaterial());
  pick.position.set(0, 0.35, 0.15); pick.visible = false; object.add(pick);

  let text;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const ctx = canvas.getContext('2d'); ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = '#35251b'; ctx.strokeText('Zzzzz', 128, 40); ctx.fillStyle = '#fff8df'; ctx.fillText('Zzzzz', 128, 40);
    text = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: true, transparent: true }));
  } else {
    text = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, transparent: true }));
  }
  text.scale.set(...S.sleep.text, 1); text.visible = false;

  return { object, body, legs, left, right, glass, pick, text, head: new THREE.Vector3(), sitLegsGeo, sleepLegsGeo };
}

/** Complete collection-only sitting pose, with independently disposable GLB resources. */
export function santaPortrait() {
  const f=figure(),local={y:LANDSKRONA.seatHeight,z:S.portraitSeatZ};
  f.legs.geometry.dispose();f.legs.geometry=f.sitLegsGeo||santaLegGeometry(local,false);
  f.legs.name='santa-portrait-legs';f.object.position.y=local.y+.04;
  f.sleepLegsGeo?.dispose();
  // figure() shares loaded arms/glass with the world. A disposable portrait must own them.
  const sourceGeos=new Set(),sourceMats=new Set(),geos=new Map(),mats=new Map();
  santaModelData?.scene.traverse(o=>{if(o.geometry)sourceGeos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])sourceMats.add(m)});
  const ownedMaterial=m=>{if(!sourceMats.has(m))return m;if(!mats.has(m))mats.set(m,m.clone());return mats.get(m)};
  f.object.traverse(o=>{if(sourceGeos.has(o.geometry)){if(!geos.has(o.geometry))geos.set(o.geometry,o.geometry.clone());o.geometry=geos.get(o.geometry)}if(o.material)o.material=Array.isArray(o.material)?o.material.map(ownedMaterial):ownedMaterial(o.material)});
  f.text.material.map?.dispose();f.text.material.dispose();return f.object;
}

export class Santa {
  /** `sofa`: existing rest target. Santa waits offscreen when the player already occupies a required spot.
   * `onStateChange(next, previous)` is also the hook for the living-room TV programme. */
  constructor({ scene, day, sofa, rest = null, onStateChange = null }) {
    Object.assign(this, { day, sofa, rest, onStateChange, state: 'away', t: 0, greeting: 0, sips: 0, sipInProgress: false, visitKey: '' });
    this.fig = figure();
    this.object = this.fig.object;
    if (sofa) {
      const local = sofa.pickable.userData.rest.spots[Math.min(S.seatIndex, sofa.spots.length - 1)];
      this.legPoses = {
        sitting: this.fig.sitLegsGeo || santaLegGeometry(local, false),
        sleeping: this.fig.sleepLegsGeo || santaLegGeometry(local, true)
      };
      this.fig.legs.geometry.dispose(); this.fig.legs.geometry = this.legPoses.sitting;
    }
    this.object.visible = false;
    // Child of the furnishing, so F visibility, editing and every saved/moved pose are inherited.
    sofa?.pickable.add(this.object);
    scene.add(this.fig.text);
    this.interact = { name: 'tomten', kind: 'santa', verb: 'hälsa på', pickable: this.fig.pick };
    this.fig.pick.userData.door = this.interact;
    this.originalTaken = sofa?.spots.map((spot) => spot.taken) ?? [];
    sofa?.spots.forEach((spot, index) => { const prior = spot.taken; spot.taken = () => !!prior?.() || this.reserves(index); });
    this.update(0);
  }
  get dateKey() { return `${this.day.year ?? 0}-${this.day.month}-${this.day.date}`; }
  updateBlush() {
    const color = new THREE.Color(S.blush.base).lerp(new THREE.Color(S.blush.red), Math.min(1, this.sips / S.blush.fullAfterSips));
    const colors = this.fig.body.geometry.getAttribute('color');
    if (!colors) return;
    if (this.fig.body.userData.cheeks?.length) {
      for (const { start, count } of this.fig.body.userData.cheeks) for (let i = start; i < start + count; i++) colors.setXYZ(i, color.r, color.g, color.b);
    } else {
      const pos = this.fig.body.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = Math.abs(pos.getX(i)), y = pos.getY(i), z = pos.getZ(i);
        if (Math.hypot(x - 0.092, y - 0.785, z - 0.132) < 0.045) {
          colors.setXYZ(i, color.r, color.g, color.b);
        }
      }
    }
    colors.needsUpdate = true;
  }
  keepState() { return { date: this.visitKey, sips: this.sips }; }
  loadState(state) {
    if (state?.date !== this.dateKey || !Number.isSafeInteger(state.sips) || state.sips < 0) return;
    this.visitKey = state.date; this.sips = Math.min(S.blush.fullAfterSips, state.sips); this.updateBlush();
  }
  get present() { return this.state !== 'away'; }
  get sleeping() { return this.state === 'sleeping'; }
  get visible() {
    if (!this.present || !this.sofa) return false;
    for (let o = this.object; o; o = o.parent) if (!o.visible || o.userData.seasonHidden) return false;
    return true;
  }
  get head() { return this.fig.head; }
  get pickable() { return this.fig.pick; }
  reserves(index) { return this.sleeping || (this.state === 'sitting' && index === Math.min(S.seatIndex, this.sofa.spots.length - 1)); }
  greetable() { return this.visible; }
  greet() {
    if (!this.greetable()) return false;
    this.greeting = S.greetingSeconds;
    discoverCreature('figure:santa', 'greet'); this.onGreet?.();
    this.onInteract?.();
    return true;
  }
  update(dt) {
    let next = this.sofa ? santaState(this.day) : 'away';
    if (this.rest?.target === this.sofa) {
      const index = this.sofa.spots.indexOf(this.rest.spot);
      if (next === 'sleeping' || (next === 'sitting' && index === Math.min(S.seatIndex, this.sofa.spots.length - 1))) next = 'away';
    }
    if (next !== this.state) {
      const prior = this.state;
      this.state = next; this.t = 0; this.greeting = 0; this.sipInProgress = false;
      if (next !== 'away' && this.visitKey !== this.dateKey) { this.visitKey = this.dateKey; this.sips = 0; this.updateBlush(); }
      if (this.legPoses) this.fig.legs.geometry = this.legPoses[this.sleeping ? 'sleeping' : 'sitting'];
      this.object.visible = this.present;
      this.onStateChange?.(next, prior);
    }
    this.fig.text.visible = this.visible && this.sleeping && !this.greeting;
    if (!this.present) return;
    const previousT = this.t;
    this.t += dt;
    this.greeting = Math.max(0, this.greeting - dt);
    const local = this.sofa.pickable.userData.rest.spots[Math.min(S.seatIndex, this.sofa.spots.length - 1)];
    const sleep = S.sleep;
    if (this.sleeping) {
      this.object.position.set(sleep.x, local.y + sleep.y + Math.sin(this.t * 1.5) * sleep.breathe, sleep.z);
      this.object.rotation.set(0, 0, Math.PI / 2);
    } else {
      this.object.position.set(local.x, local.y + 0.04, local.z);
      this.object.rotation.set(0, Math.atan2(...(local.dir ?? [0, 1])), 0);
    }
    const phase = this.t % S.sip.every;
    if (this.sleeping || this.greeting) this.sipInProgress = false;
    else {
      const ended = phase >= S.sip.seconds || Math.floor(this.t / S.sip.every) > Math.floor(previousT / S.sip.every);
      if (this.sipInProgress && ended) {
        this.sipInProgress = false; this.sips = Math.min(S.blush.fullAfterSips, this.sips + 1); this.updateBlush();
      }
      if (phase > S.sip.seconds / 2 && phase < S.sip.seconds) this.sipInProgress = true;
    }
    const sip = !this.sleeping && !this.greeting && phase < S.sip.seconds ? Math.sin(Math.PI * phase / S.sip.seconds) ** 2 : 0;
    this.fig.right.rotation.x = -0.6 - sip * S.sip.arm;
    this.fig.right.rotation.z = sip * S.sip.inward;
    // Keep the tumbler outside the fist; its rim travels from the lap to the mouth.
    const a = S.sip.glassRest, b = S.sip.glassMouth;
    this.fig.glass.position.set(a[0] + (b[0] - a[0]) * sip, a[1] + (b[1] - a[1]) * sip, a[2] + (b[2] - a[2]) * sip);
    this.fig.glass.rotation.x = sip * S.sip.tilt;
    this.fig.glass.visible = !this.sleeping;
    this.fig.left.rotation.x = this.greeting && !this.sleeping ? -2.35 : -0.6;
    this.fig.left.rotation.z = this.greeting && !this.sleeping ? Math.sin(this.t * 10) * 0.18 : 0;
    this.object.updateWorldMatrix(true, true);
    this.head.set(0, 0.84, 0.02).applyMatrix4(this.object.matrixWorld);
    const rise = (this.t % S.sleep.textSeconds) / S.sleep.textSeconds;
    this.fig.text.position.copy(this.head); this.fig.text.position.y += 0.25 + rise * S.sleep.textRise;
    this.fig.text.material.opacity = Math.sin(Math.PI * rise);
  }
}

creature({id:'figure:santa',no:63,modelVersion:2,name:'Tomten',family:'figures',level:3,model:{kind:'santa'},info:{size:'Sittande besökare',weight:'Ej uppmätt',where:'Soffan hemma',when:'Julafton',likes:'Julmys och hälsningar'},facts:['Kommer på besök på julafton.','Hälsa på honom för att hitta posten.']});
export { figure as santaFigure };
