import * as THREE from 'three';
import { sfx } from './audio.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAP_LEVER as P, SHOWER_SPRAY as S } from './config.js';

// Running water: every tap and shower outlet (world.taps, from interior.js) can be turned on
// with E. A tap pours a thin stream into its basin, a shower sprays separate nozzle jets onto the floor,
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

// Transparent breaks travel along each jet, without a solid cone between nozzles.
const sprayTex = (() => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const g = c.getContext('2d'), fade = g.createLinearGradient(0, 0, 0, 128);
  for (const [at, alpha] of [[0, 0], [.12, .9], [.5, .55], [.72, 0], [1, 0]]) fade.addColorStop(at, `rgba(255,255,255,${alpha})`);
  g.fillStyle = fade; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const sprayMat = new THREE.MeshStandardMaterial({ color: 0xe2f3fa, map: sprayTex,
  transparent: true, opacity: S.opacity, roughness: .2, depthWrite: false });

function showerJets(spec, drop) {
  const down = new THREE.Vector3(...spec.dir).normalize();
  const across = new THREE.Vector3(0, 0, 1).cross(down).normalize();
  const side = new THREE.Vector3().crossVectors(down, across).normalize();
  const parts = [];
  for (let i = 0; i < S.jets; i++) {
    // Golden-angle disk fills the head, rather than outlining a hollow waterfall.
    const a = i * Math.PI * (3 - Math.sqrt(5)), r = Math.sqrt((i + .5) / S.jets);
    const radial = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
    const start = radial.clone().multiplyScalar(spec.r * S.headInset * r);
    const end = down.clone().multiplyScalar(drop / -down.y).addScaledVector(radial, S.spread * r);
    end.y = -drop; // Every tilted jet reaches the basin plane, including its radial offset.
    const middle = start.clone().lerp(end, .5);
    middle.y += S.bend * Math.hypot(end.x - start.x, end.z - start.z);
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
    const geo = new THREE.TubeGeometry(curve, S.segments, S.radius, S.sides, false);
    const uv = geo.attributes.uv;
    // TubeGeometry's u follows the length; make v carry downward texture motion.
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getY(j), uv.getX(j) * S.repeats + i * .618);
    parts.push(geo);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

// One merged movable mesh per basin mixer; kept outside the static interior batch.
function leverMesh(spec) {
  const J = P.joint, parts = [new THREE.CylinderGeometry(J.radius, J.radius, J.length, J.segments).rotateZ(Math.PI / 2)];
  if (spec.style === 'side') {
    const S = P.side;
    parts.push(
      new THREE.SphereGeometry(J.radius, J.segments, 8).scale(0.3, 1, 1).translate(-J.length / 2, 0, 0),
      new THREE.CylinderGeometry(0.007, 0.008, 0.014, 16).rotateX(Math.PI / 2).translate(0, 0, 0.007),
      new THREE.CylinderGeometry(0.0032, 0.0040, S.length - 0.014, 16).rotateX(Math.PI / 2).translate(0, 0, (S.length - 0.014) / 2 + 0.012),
      new THREE.SphereGeometry(0.0045, 16, 12).translate(0, 0, S.length)
    );
  } else {
    const S = P.top;
    parts.push(
      new THREE.CylinderGeometry(0.0165, 0.0175, S.height + 0.003, J.segments).translate(0, (S.height + 0.003) / 2, 0),
      new THREE.CylinderGeometry(0.015, 0.0165, 0.002, J.segments).translate(0, S.height + 0.0035, 0),
      new THREE.CylinderGeometry(0.0055, 0.0065, 0.016, 16).rotateX(Math.PI / 2).translate(0, S.height, 0.01),
      new THREE.BoxGeometry(S.width, 0.004, S.length - 0.016).translate(0, S.height, (S.length + 0.016) / 2),
      new THREE.CylinderGeometry(0.002, 0.002, S.length - 0.016, 12).rotateX(Math.PI / 2).translate(-S.width / 2, S.height, (S.length + 0.016) / 2),
      new THREE.CylinderGeometry(0.002, 0.002, S.length - 0.016, 12).rotateX(Math.PI / 2).translate(S.width / 2, S.height, (S.length + 0.016) / 2),
      new THREE.CylinderGeometry(0.002, 0.002, S.width, 12).rotateZ(Math.PI / 2).translate(0, S.height, S.length)
    );
  }
  const geometries = parts.map(g => g.index ? g.toNonIndexed() : g), geometry = mergeGeometries(geometries);
  for (const g of new Set([...parts, ...geometries])) g.dispose();
  const mesh = new THREE.Mesh(geometry, spec.material); mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export class Tap {
  constructor(spec) {
    Object.assign(this, { name: spec.name, kind: 'tap', isOpen: false, spec });
    const [x, y, z] = spec.pos, len = Math.max(0.05, y - spec.basin);
    this.object = new THREE.Group();
    this.object.position.set(x, y, z);
    // Basin streams keep their existing geometry/material; showers have separated jets.
    const geo = spec.shower
      ? showerJets(spec, len)
      : new THREE.CylinderGeometry(Math.max(spec.r, 0.009), Math.max(spec.r, 0.009) * 0.75, len, 10, 1, true);
    if (!spec.shower) geo.translate(0, -len / 2, 0);
    const [dx, dy, dz] = spec.dir;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    if (!spec.shower) geo.applyQuaternion(q);
    this.stream = new THREE.Mesh(geo, spec.shower ? sprayMat : waterMat);
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
  sprayTex.offset.y -= dt * S.speed;
}
