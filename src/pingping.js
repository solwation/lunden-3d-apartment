import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PINGPING as P } from './config.js';
import { sfx } from './audio.js';
import { Thing, KINDS } from './things.js';

// Pingping (#269): the penguin cushion between the pillows in Sarah and Olof's bed (docs/pingping-pingvinkudde.jpg).
// A squat, squishy navy body (a sphere pushed out towards a rounded box), an off-white face mask and belly, pink
// cheeks, black eyes and a yellow beak painted on a shell over the front, two flippers and two feet. A Thing
// (things.js): E takes him into your arms — both hands round his sides (hand.js 'hug') — E puts him down on a bed,
// a sofa, a table or the floor (he sits up, facing you) or back between the pillows; F sends him home.
// A hug (click / "Krama"): he is pulled in and squashed, a happy squeak, hearts rise (one additive Points).

const SEG = [48, 32];

/** A unit-sphere direction pushed out towards a rounded box (superellipsoid), then scaled to his size. */
function shape(geo, grow = 1) {
  const a = geo.attributes.position, v = new THREE.Vector3(), n = 2.6;
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i);
    const k = (Math.abs(v.x) ** n + Math.abs(v.y) ** n + Math.abs(v.z) ** n) ** (1 / n);
    v.divideScalar(k || 1);
    a.setXYZ(i, v.x * P.w / 2 * grow, P.h / 2 + v.y * P.h / 2 * grow, v.z * P.d / 2 * grow);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The front: face mask, eyes, cheeks, beak and belly on a transparent canvas, u = x across, v = y up the front. */
function faceTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const X = (u) => u * S, Y = (v) => (1 - v) * S;
  g.fillStyle = P.white;
  // the mask: a wide band over the upper third, two lobes over the eyes with a dip between them, rounded below
  g.beginPath();
  g.moveTo(X(0.5), Y(0.885));
  g.bezierCurveTo(X(0.42), Y(0.95), X(0.2), Y(0.95), X(0.19), Y(0.8));
  g.bezierCurveTo(X(0.18), Y(0.69), X(0.32), Y(0.655), X(0.5), Y(0.655));
  g.bezierCurveTo(X(0.68), Y(0.655), X(0.82), Y(0.69), X(0.81), Y(0.8));
  g.bezierCurveTo(X(0.8), Y(0.95), X(0.58), Y(0.95), X(0.5), Y(0.885));
  g.fill();
  // the belly: a big oval
  g.beginPath(); g.ellipse(X(0.5), Y(0.315), 0.31 * S, 0.27 * S, 0, 0, Math.PI * 2); g.fill();
  // cheeks
  g.fillStyle = P.cheek;
  for (const u of [0.26, 0.74]) { g.beginPath(); g.ellipse(X(u), Y(0.79), 0.028 * S, 0.02 * S, 0, 0, Math.PI * 2); g.fill(); }
  // eyes
  g.fillStyle = '#111114';
  for (const u of [0.355, 0.645]) { g.beginPath(); g.ellipse(X(u), Y(0.815), 0.018 * S, 0.02 * S, 0, 0, Math.PI * 2); g.fill(); }
  // the beak: flat on top, round below, a stitched outline
  g.fillStyle = P.beak;
  g.beginPath();
  g.moveTo(X(0.445), Y(0.82));
  g.lineTo(X(0.555), Y(0.82));
  g.bezierCurveTo(X(0.565), Y(0.755), X(0.435), Y(0.755), X(0.445), Y(0.82));
  g.fill();
  g.strokeStyle = '#b89a3c'; g.lineWidth = S * 0.004; g.setLineDash([S * 0.008, S * 0.005]);
  g.beginPath();
  g.moveTo(X(0.453), Y(0.813)); g.lineTo(X(0.547), Y(0.813));
  g.bezierCurveTo(X(0.555), Y(0.765), X(0.445), Y(0.765), X(0.453), Y(0.813));
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pingping, his bottom centre at the origin, facing +z. */
export function pingpingModel() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: P.navy, roughness: 1 });
  const body = new THREE.Mesh(shape(new THREE.SphereGeometry(1, ...SEG)), navy);
  // the painted front: the front ±72° of the same shape, a hair outside it; planar UVs seen from the front
  const front = shape(new THREE.SphereGeometry(1, 40, 28, Math.PI / 2 - 1.25, 2.5), 1.008);
  const a = front.attributes.position, uv = front.attributes.uv;
  for (let i = 0; i < a.count; i++) uv.setXY(i, a.getX(i) / P.w + 0.5, a.getY(i) / P.h);
  const face = new THREE.Mesh(front, new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }));
  // flippers: short, flat, angled down at the sides
  const flip = [-1, 1].map((s) => new THREE.SphereGeometry(1, 14, 10).scale(0.035, 0.08, 0.028).rotateZ(s * 0.65)
    .translate(s * (P.w / 2 - 0.004), P.h * 0.47, 0.01));
  const flippers = new THREE.Mesh(mergeGeometries(flip), navy);
  // feet peeking out at the bottom front
  const ft = [-1, 1].map((s) => new THREE.SphereGeometry(1, 14, 8).scale(0.045, 0.024, 0.045).translate(s * 0.075, 0.022, P.d / 2 - 0.035));
  const feet = new THREE.Mesh(mergeGeometries(ft), new THREE.MeshStandardMaterial({ color: P.feet, roughness: 0.95 }));
  for (const m of [body, face, flippers, feet]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/** A soft pink heart with a glow (the hearts that rise when he is hugged). */
function heartTexture() {
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
class Hearts {
  constructor(scene, n) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.045, map: heartTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    Object.assign(this.points, { frustumCulled: false, visible: false, renderOrder: 2 });
    this.points.raycast = () => {}; // never an E target
    scene.add(this.points);
    this.p = [...Array(n)].map(() => ({ t: 1, o: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.life = 1.6;
  }

  burst(at) {
    this.p.forEach((h, i) => {
      const a = i * 2.39996, r = 0.05 + Math.random() * 0.1;
      h.o.set(at.x + Math.sin(a) * r, at.y + Math.random() * 0.06, at.z + Math.cos(a) * r);
      h.v.set(Math.sin(a) * 0.08, 0.28 + Math.random() * 0.2, Math.cos(a) * 0.08);
      h.t = -i * 0.03; // one after another
    });
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    const pos = this.points.geometry.attributes.position, col = this.points.geometry.attributes.color;
    let alive = false;
    this.p.forEach((h, i) => {
      h.t += dt;
      const k = h.t / this.life;
      if (k < 0 || k >= 1) { col.setXYZ(i, 0, 0, 0); if (k < 0) alive = true; return; }
      alive = true;
      const s = h.t;
      pos.setXYZ(i, h.o.x + h.v.x * s + Math.sin(s * 5 + i) * 0.02, h.o.y + h.v.y * s, h.o.z + h.v.z * s);
      const b = Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.4);
      col.setXYZ(i, b * 0.75, b * 0.16, b * 0.34); // pink: added onto what is behind
    });
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
      hugGrips: [[P.w / 2 - 0.012, P.h * 0.6, 0.04], [-P.w / 2 + 0.012, P.h * 0.6, 0.04]], // right hand, left hand (his frame)
      placeVerb: 'sätta ner', cooldown: P.hugTime * 0.7, hugT: 1, hugs: 0,
    });
    this.hearts = new Hearts(scene, P.hearts);
  }

  get useLabel() { return 'Krama'; }

  onTake() { sfx.plush(this.where()); }
  onPut() { this.hugT = 1; this.model.scale.set(1, 1, 1); sfx.plush(this.where()); }

  /** Put down sitting up, facing the visitor. */
  placeAt(p) {
    super.placeAt(p);
    if (!this.placed) return;
    this.model.rotation.set(0, Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z), 0);
  }

  /** A hug. */
  onUse() {
    this.hugT = 0;
    this.hugs++;
    sfx.squeak(this.where());
    this.hearts.burst(this.where().add(new THREE.Vector3(0, P.h * 0.75, 0)));
    this.onHug?.();
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
