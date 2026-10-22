import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SANTA as S, santaState } from './santaconfig.js';
import { LANDSKRONA } from './config.js';

// An original-only Christmas Eve guest. All poses are in the movable sofa's frame.
// Static coloured parts are merged; the pose-specific legs, two arms, glass and sleep text stay separate.
const C = { red: 0xa51d28, white: 0xf4efe5, skin: 0xe6af89, black: 0x26201c, gold: 0xd7ad45 };
const material = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
function part(geometry, color, at, scale = [1, 1, 1], rot = [0, 0, 0]) {
  const g = geometry.toNonIndexed(); geometry.dispose();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  const rgb = new THREE.Color(color), n = g.getAttribute('position').count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
const ball = (color, at, scale) => part(new THREE.SphereGeometry(1, 16, 10), color, at, scale);
const box = (color, at, scale) => part(new THREE.BoxGeometry(1, 1, 1), color, at, scale);
function joined(parts, mat) {
  const geometry = mergeGeometries(parts), mesh = new THREE.Mesh(geometry, mat);
  parts.forEach((g) => g.dispose());
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function arm(mat, right) {
  const pivot = new THREE.Group();
  pivot.position.set(right ? -0.28 : 0.28, 0.51, 0.02);
  pivot.add(joined([
    ball(C.red, [0, -0.15, 0.03], [0.105, 0.21, 0.105]),
    ball(C.white, [0, -0.31, 0.06], [0.11, 0.045, 0.11]),
    ball(C.skin, [0, -0.37, 0.07], [0.075, 0.085, 0.075]),
  ], mat));
  pivot.rotation.x = -0.6;
  return pivot;
}
function hatGeometry() {
  const H = S.hat, geo = new THREE.ConeGeometry(H.radius, H.height, 16, 8), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) / H.height + 0.5) ** 3;
    p.setXYZ(i, p.getX(i) + H.bend * t, p.getY(i) - H.drop * t, p.getZ(i));
  }
  geo.computeVertexNormals(); return geo;
}
function figure() {
  const object = new THREE.Group(), mat = material();
  object.name = 'jultomten';
  const parts = [
    ball(C.red, [0, 0.3, 0.03], S.size.belly),
    ball(C.white, [0, 0.025, 0.035], [0.29, 0.045, 0.25]), // fur coat hem
    box(C.black, [0, 0.17, 0.06], [0.61, 0.065, 0.49]),
    box(C.gold, [0, 0.17, 0.313], [0.105, 0.09, 0.025]),
    box(C.black, [0, 0.17, 0.328], [0.065, 0.055, 0.01]),
    box(C.white, [0, 0.35, 0.3], [0.048, 0.28, 0.03]),
    ball(C.skin, [0, 0.79, 0.02], [S.size.head, 0.18, 0.15]),
    ball(C.white, [0, 0.57, 0.14], S.size.beard),
    ball(C.skin, [0, 0.8, 0.18], [0.047, 0.04, 0.045]),
    ball(C.white, [-0.055, 0.747, 0.176], [0.065, 0.025, 0.04]),
    ball(C.white, [0.055, 0.747, 0.176], [0.065, 0.025, 0.04]),
    part(hatGeometry(), C.red, [0, 1.04, 0.01]),
    ball(C.white, [0, 0.91, 0.02], [0.17, 0.045, 0.16]),
  ];
  for (const side of [-1, 1]) {
    parts.push(ball(C.white, [side * 0.06, 0.865, 0.18], [0.045, 0.013, 0.018]));
    parts.push(ball(C.skin, [side * 0.147, 0.785, 0.02], [0.035, 0.06, 0.035])); // ears
    parts.push(ball(0xe4a39b, [side * 0.092, 0.785, 0.132], [0.043, 0.033, 0.024])); // cheeks
    parts.push(ball(C.white, [side * 0.055, 0.83, 0.178], [0.023, 0.019, 0.009]));
    parts.push(ball(0x547687, [side * 0.055, 0.83, 0.187], [0.011, 0.013, 0.006]));
    parts.push(ball(C.black, [side * 0.055, 0.83, 0.193], [0.005, 0.008, 0.004]));
    // Tapered locks break up the beard's old single-oval outline.
    for (let j = 0; j < 3; j++) parts.push(ball(j % 2 ? 0xe5e1d8 : C.white,
      [side * (0.04 + j * 0.042), 0.51 + j * 0.035, 0.245 - j * 0.012], [0.046, 0.125 - j * 0.02, 0.035]));

  }
  parts.push(ball(C.white, [S.hat.bend, 1.04 + S.hat.height / 2 - S.hat.drop, 0.01], [0.06, 0.06, 0.06]));
  object.add(joined(parts, mat));
  const legs = new THREE.Mesh(new THREE.BufferGeometry(), mat); // actual seat dimensions below
  legs.castShadow = legs.receiveShadow = true;
  object.add(legs);
  const left = arm(mat, false), right = arm(mat, true);
  object.add(left, right);
  const glass = new THREE.Group();
  glass.position.fromArray(S.sip.glassRest);
  // A small, low whisky tumbler containing dark red glögg. No bottle or loose pickable is spawned.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xe3e8e5, transparent: true, opacity: 0.32, roughness: 0.18, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.043, 0.095, 12, 1, true), glassMat);
  glass.add(shell);
  const glogg = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.058, 12), new THREE.MeshStandardMaterial({ color: 0x631d27, roughness: 0.28 }));
  glogg.position.y = -0.013; glass.add(glogg); object.add(glass);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.9), new THREE.MeshBasicMaterial());
  pick.position.set(0, 0.35, 0.15); pick.visible = false; object.add(pick);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
  const ctx = canvas.getContext('2d'); ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = '#35251b'; ctx.strokeText('Zzzzz', 128, 40); ctx.fillStyle = '#fff8df'; ctx.fillText('Zzzzz', 128, 40);
  const text = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: true, transparent: true }));
  text.scale.set(...S.sleep.text, 1); text.visible = false;
  return { object, legs, left, right, glass, pick, text, head: new THREE.Vector3() };
}

/** One continuous trouser segment between two joints, merged with the other leg parts. */
function limb(a, b, radius, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, delta.length() - radius * 2), 4, 10);
  const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return part(geo, color, from.add(to).multiplyScalar(0.5).toArray(), [1, 1, 1], rot.toArray().slice(0, 3));
}

function legGeometry(local, sleeping) {
  const L = S.legs, rootY = local.y + 0.04;
  const kneeZ = sleeping ? 0.22 : LANDSKRONA.depth / 2 - local.z + L.radius + L.clearance;
  const ankleY = sleeping ? -0.18 : L.bootY + L.bootH - rootY;
  const parts = [];
  for (const side of [-1, 1]) {
    const x = side * L.spread, knee = [x, L.kneeY, kneeZ];
    parts.push(limb([x, L.thighY, 0.04], knee, L.radius, C.red));
    parts.push(limb(knee, [x, ankleY, kneeZ], L.radius * 0.88, C.red));
    parts.push(ball(C.black, [x, sleeping ? -0.25 : L.bootY - rootY, kneeZ + 0.08], [0.105, L.bootH, 0.17]));
    parts.push(box(0x171615, [x, sleeping ? -0.31 : 0.015 - rootY, kneeZ + 0.08], [0.19, 0.03, 0.29]));
    parts.push(ball(C.white, [x, ankleY, kneeZ], [0.085, 0.027, 0.085]));
  }
  const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
  return geometry;
}

export class Santa {
  /** `sofa`: existing rest target. Santa waits offscreen when the player already occupies a required spot.
   * `onStateChange(next, previous)` is also the hook for the living-room TV programme. */
  constructor({ scene, day, sofa, rest = null, onStateChange = null }) {
    Object.assign(this, { day, sofa, rest, onStateChange, state: 'away', t: 0, greeting: 0 });
    this.fig = figure();
    this.object = this.fig.object;
    if (sofa) {
      const local = sofa.pickable.userData.rest.spots[Math.min(S.seatIndex, sofa.spots.length - 1)];
      this.legPoses = { sitting: legGeometry(local, false), sleeping: legGeometry(local, true) };
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
    this.onGreet?.();
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
      this.state = next; this.t = 0; this.greeting = 0;
      if (this.legPoses) this.fig.legs.geometry = this.legPoses[this.sleeping ? 'sleeping' : 'sitting'];
      this.object.visible = this.present;
      this.onStateChange?.(next, prior);
    }
    this.fig.text.visible = this.visible && this.sleeping && !this.greeting;
    if (!this.present) return;
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
    const phase = this.t % S.sip.every, sip = !this.sleeping && !this.greeting && phase < S.sip.seconds ? Math.sin(Math.PI * phase / S.sip.seconds) ** 2 : 0;
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
