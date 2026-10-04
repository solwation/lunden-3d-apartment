import * as THREE from 'three';
import { MIELE as M } from './config.js';
import { sfx } from './audio.js';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { Hearts, heartTexture } from './pingping.js';

// Miele (#328): the family's cat as a super-rare find (cat.js draws her, MIELE_COAT / BREEDS 'Miele'). Found, heart
// fireworks go up (HeartFireworks); E takes her into your arms like Pingping (MieleHeld: hand.js 'hug', both hands on
// her sides), a click / "Krama" hugs her (pulled in, squeezed, a purr, her eyes shut, hearts rise); E on the floor, a bed
// or a sofa puts her down (not on a table: main.js), where she looks at you and walks off (cat.js `putDown`).

/** Heart fireworks: `M.fireworks` big hearts shoot up one after another and each pops into `M.sparks` small ones that
 * drift out, sink a little and fade; about `M.life` s in all. Two additive Points (big, small), no raycast. */
export class HeartFireworks {
  constructor(scene) {
    const tex = heartTexture();
    const points = (n, size) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      Object.assign(p, { frustumCulled: false, visible: false, renderOrder: 3 });
      p.raycast = () => {}; // never an E target
      scene.add(p);
      return p;
    };
    this.big = points(M.fireworks, 0.16);
    this.small = points(M.fireworks * M.sparks, 0.07);
    this.shells = [...Array(M.fireworks)].map(() => ({ t: 9, o: new THREE.Vector3(), v: new THREE.Vector3(), pop: 0.8, at: new THREE.Vector3(), tint: [1, 0.3, 0.5] }));
    this.sparks = [...Array(M.fireworks * M.sparks)].map(() => ({ v: new THREE.Vector3() }));
    this.t = 9;
  }

  get active() { return this.big.visible || this.small.visible; }

  /** Fireworks from world point `at` (her head). */
  burst(at) {
    const tints = [[1, 0.25, 0.45], [1, 0.12, 0.2], [1, 0.45, 0.7], [0.95, 0.3, 0.9]];
    this.shells.forEach((s, i) => {
      const a = i * 2.39996 + Math.random() * 0.4;
      s.t = -i * 0.16; // one after another
      s.o.copy(at);
      s.v.set(Math.sin(a) * (0.3 + Math.random() * 0.3), 1.7 + Math.random() * 0.6, Math.cos(a) * (0.3 + Math.random() * 0.3));
      s.pop = 0.65 + Math.random() * 0.3;
      s.tint = tints[i % tints.length];
      for (let k = 0; k < M.sparks; k++) {
        const b = (k / M.sparks) * Math.PI * 2, up = (Math.random() - 0.3) * 0.8;
        this.sparks[i * M.sparks + k].v.set(Math.cos(b), up, Math.sin(b)).normalize().multiplyScalar(0.7 + Math.random() * 0.35);
      }
    });
    this.t = 0;
    this.big.visible = this.small.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const bp = this.big.geometry.attributes.position, bc = this.big.geometry.attributes.color;
    const sp = this.small.geometry.attributes.position, sc = this.small.geometry.attributes.color;
    const fade = M.life - 1.6; // the sparks live the rest
    this.shells.forEach((s, i) => {
      s.t += dt;
      const up = Math.min(s.t, s.pop);
      // the shell: rising and slowing, shown until it pops
      if (s.t >= 0) s.at.set(s.o.x + s.v.x * up, s.o.y + s.v.y * up - 0.6 * up * up, s.o.z + s.v.z * up);
      const b = s.t < 0 || s.t >= s.pop ? 0 : Math.min(1, s.t * 6);
      bp.setXYZ(i, s.at.x, s.at.y, s.at.z);
      bc.setXYZ(i, s.tint[0] * b, s.tint[1] * b, s.tint[2] * b);
      // its sparks: out from where it popped, slowing, sinking, fading
      const e = s.t - s.pop;
      for (let k = 0; k < M.sparks; k++) {
        const j = i * M.sparks + k, sv = this.sparks[j].v;
        if (e < 0 || e > fade) { sc.setXYZ(j, 0, 0, 0); continue; }
        const r = (1 - Math.exp(-e * 2.2)) / 2.2;
        sp.setXYZ(j, s.at.x + sv.x * r, s.at.y + sv.y * r - 0.12 * e * e, s.at.z + sv.z * r);
        const k2 = (1 - e / fade) * (0.75 + 0.25 * Math.sin(e * 18 + j)); // twinkle
        sc.setXYZ(j, s.tint[0] * k2, s.tint[1] * k2, s.tint[2] * k2);
      }
    });
    bp.needsUpdate = bc.needsUpdate = sp.needsUpdate = sc.needsUpdate = true;
    if (this.t > M.life + M.fireworks * 0.16 + 0.5) this.big.visible = this.small.visible = false;
  }
}

/** Miele in your arms: a Holdable with no home (an empty group in the camera that the cat object rides in). */
export class MieleHeld extends Holdable {
  constructor(scene, camera, cat) {
    const H = M.held;
    super(scene, camera, {
      name: 'Miele', model: new THREE.Group(), home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(H.x, H.y, H.z), rot: new THREE.Euler(H.tilt, 0, 0) },
      pick: { pos: new THREE.Vector3(0, -100, 0), size: [0.01, 0.01, 0.01] }, cooldown: M.hugTime * 0.7,
    });
    Object.assign(this, { cat, isMiele: true, soft: true, softOnly: true, handPose: 'hug', hugGrips: M.grips, placeVerb: 'sätta ner',
      hugT: 1, hugs: 0 });
    this.hearts = new Hearts(scene, 14);
    cat.onDropped = () => { if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); } }; // the cat went (F)
  }

  get useLabel() { return 'Krama'; }

  /** No home: the group is only in the scene (in the camera) while she is held. */
  goHome() { this.placed = false; this.model.removeFromParent(); }

  onTake() {
    this.hugT = 1;
    this.cat.pickUp(this.model);
    const p = this.where();
    sfx.purr(p, 2, this.cat.variant.pitch * (this.cat.breed.pitch ?? 1), this.cat.voice);
    this.onPickUp?.();
  }

  get poseAt() { return null; } // (no ghost of the cat: the ring shows where she goes, #368)

  /** Down at world point `p` (main.js: the floor, a bed or a sofa), facing you. */
  placeAt(p) {
    if (!this.held) return;
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.letGo(p);
  }

  /** Put down because the hand is needed (F, another thing): at your feet, in front of you. */
  putBack() {
    if (!this.held) return;
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.letGo(this.dropSpot?.() ?? this.where().setY(this.camera.position.y - 1.6));
  }

  letGo(p) {
    this.model.scale.set(1, 1, 1);
    this.hugT = 1;
    this.cat.putDown(p, this.camera.getWorldPosition(new THREE.Vector3()));
    this.model.removeFromParent();
    this.onLetGo?.();
  }

  /** A hug: pulled in and squeezed, a purr, eyes shut, hearts. */
  onUse() {
    this.hugT = 0;
    this.hugs++;
    sfx.purr(this.where(), M.hugTime * 3, this.cat.variant.pitch * (this.cat.breed.pitch ?? 1), this.cat.voice);
    this.hearts.burst(this.cat.head.getWorldPosition(new THREE.Vector3()));
    this.onHug?.();
  }

  tick() {
    const k = this.hugT < 0.4 ? Math.sin(Math.PI * this.hugT / 0.4) : 0, h = M.held; // the squeeze: the first part of the hug
    this.model.position.set(h.x, h.y + 0.015 * k, h.z + M.pull * k);
    this.model.scale.set(1 + M.squash * 0.3 * k, 1 - M.squash * 0.15 * k, 1 - M.squash * k);
  }

  update(dt) {
    if (this.hugT < 1) this.hugT = Math.min(1, this.hugT + dt / (M.hugTime * 2.5)); // the eyes stay shut a while
    this.cat.hugging = this.held && this.hugT < 1;
    super.update(dt);
    this.hearts.update(dt);
  }
}
