import * as THREE from 'three';
import { sfx } from './audio.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAP_LEVER as P } from './config.js';

// Running water: every tap and shower outlet (world.taps, from interior.js) can be turned on
// with E. A tap pours a thin stream into its basin, a shower sprays a cone onto the floor,
// with a splash ring and a positional hiss until it is turned off.

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 20 + Math.random() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const tex = streakTexture();
const waterMat = new THREE.MeshStandardMaterial({
  color: 0xd6ecf7, map: tex, transparent: true, opacity: 0.7, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide,
});
const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });

// One merged movable mesh per basin mixer; kept outside the static interior batch.
function leverMesh(spec) {
  const J=P.joint, parts=[new THREE.CylinderGeometry(J.radius,J.radius,J.length,J.segments).rotateZ(Math.PI/2)];
  if(spec.style==='side') {
    const S=P.side;
    parts.push(new THREE.CapsuleGeometry(S.radius,S.length-2*S.radius,4,J.segments)
      .rotateX(Math.PI/2).translate(0,0,S.length/2));
  } else {
    const S=P.top;
    parts.push(new THREE.BoxGeometry(S.width,S.thickness,S.length).translate(0,S.height,S.length/2),
      new THREE.CylinderGeometry(J.radius*.8,J.radius*.8,S.height,J.segments).translate(0,S.height/2,0));
  }
  const geometries=parts.map(g=>g.index?g.toNonIndexed():g), geometry=mergeGeometries(geometries);
  for(const g of new Set([...parts,...geometries]))g.dispose();
  const mesh=new THREE.Mesh(geometry,spec.material);mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}

export class Tap {
  constructor(spec) {
    Object.assign(this, { name: spec.name, kind: 'tap', isOpen: false, spec });
    const [x, y, z] = spec.pos, len = Math.max(0.05, y - spec.basin);
    this.object = new THREE.Group();
    this.object.position.set(x, y, z);
    // stream: thin column for taps, spray cone along `dir` for showers
    const geo = spec.shower
      ? new THREE.CylinderGeometry(spec.r * 0.9, spec.r * 0.9 + len * 0.35, len, 20, 1, true)
      : new THREE.CylinderGeometry(Math.max(spec.r, 0.009), Math.max(spec.r, 0.009) * 0.75, len, 10, 1, true);
    geo.translate(0, -len / 2, 0);
    const [dx, dy, dz] = spec.dir;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    geo.applyQuaternion(q);
    this.stream = new THREE.Mesh(geo, waterMat);
    this.stream.renderOrder = 2;
    this.splash = new THREE.Mesh(new THREE.RingGeometry(0.01, spec.shower ? 0.2 : 0.03, 24).rotateX(-Math.PI / 2), splashMat);
    // where the stream lands
    const k = len / Math.max(0.2, -dy);
    this.splash.position.set(dx * k, -len + 0.003, dz * k);
    this.stream.visible = this.splash.visible = false;
    this.object.add(this.stream, this.splash);
    // Basin controls live at the lever; shower thermostats keep their existing targets.
    const pick = new THREE.Mesh(new THREE.SphereGeometry(spec.lever ? P.pickRadius : spec.shower ? 0.12 : 0.07, 12, 8), new THREE.MeshBasicMaterial());
    pick.visible = false;
    if(spec.lever) {
      const L=spec.lever, length=P[L.style].length;
      this.leverFrame=new THREE.Group();this.leverFrame.userData.moving=true;
      this.leverFrame.position.fromArray(L.pos).sub(this.object.position);
      this.leverFrame.rotation.y=Math.atan2(L.dir[0],L.dir[1]);
      this.lever=leverMesh(L);this.lever.userData.door=this;
      this.leverFrame.add(this.lever);this.object.add(this.leverFrame);
      pick.position.set(0,P.pickRadius*.25,length*.5);
      pick.scale.y=P.pickHeight;
      this.leverFrame.add(pick);
      this.outlineRoot=this.lever;this.outlineOwner=this;
      this.leverProgress=0;
    } else {
      const [px,py,pz]=spec.pick??spec.pos;
      pick.position.set(px-x,py-y+(spec.pick?0:0.05),pz-z);
      this.object.add(pick);
    }
    pick.userData.door=this;
    this.pickable=pick;
    this.t = 0;
    this.sound = null;
    this.flowOpen=false;
  }

  /** Is (x, feetY, z) standing in this shower's spray? */
  hits(x, y, z) {
    if (!this.isOpen || !this.spec.shower || Math.abs(y - this.spec.basin) > 0.5) return false;
    const p = this.splash.getWorldPosition(this.splash.position.clone());
    return Math.hypot(x - p.x, z - p.z) < 0.4;
  }

  get verb() { return this.isOpen ? 'stänga av' : 'sätta på'; }

  toggle() {
    this.isOpen = !this.isOpen;
    this.syncFlow();
  }

  syncFlow() {
    this.stream.visible = this.splash.visible = this.isOpen;
    if(this.flowOpen===this.isOpen)return;
    this.flowOpen=this.isOpen;
    const [x, y, z] = this.spec.pos;
    if (this.isOpen) this.sound = sfx.water({ x, y: this.spec.basin + 0.2, z }, this.spec.shower);
    else { this.sound?.stop(); this.sound = null; }
  }

  update(dt) {
    this.syncFlow();
    if(this.lever) {
      const target=this.isOpen?1:0, delta=Math.max(0,dt)/P.seconds;
      this.leverProgress+=THREE.MathUtils.clamp(target-this.leverProgress,-delta,delta);
      const t=this.leverProgress, eased=t*t*(3-2*t);
      this.lever.rotation.x=-THREE.MathUtils.degToRad(P.angle)*eased;
    }
    if (!this.isOpen) return;
    this.t += dt;
    const s = 1 + 0.15 * Math.sin(this.t * 23);
    this.splash.scale.set(s, 1, s);
  }
}

/** Scroll the shared water texture (call once per frame). */
export function animateWater(dt) {
  tex.offset.y -= dt * 2.2;
}
