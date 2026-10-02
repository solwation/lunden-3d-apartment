import * as THREE from 'three';
import { SABER as S, LEVELS } from './config.js';
import { sfx } from './audio.js';

// The lightsaber in Sovrum 2 (#78). It hangs on two hooks on the wall; E on it takes it down: it ignites
// (snap-hiss), hums, and is held low on the right of the view (a child of the camera). Looking around
// fast (mouse, touch drag) or clicking swings it with a whoosh that follows the speed. It goes along
// everywhere; E on the empty hooks hangs it back (it switches off). The blade glows with emissive and
// additive materials only (no lights).

const hiltMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.25, metalness: 0.9 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 });
const red = new THREE.MeshStandardMaterial({ color: 0xc0262b, roughness: 0.4 });

function buildSaber() {
  const g = new THREE.Group(); // along local +y: hilt 0 … S.hilt, blade above
  const cyl = (r, h, y, m, seg = 16) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); c.position.y = y; return c; };
  g.add(cyl(0.017, S.hilt, S.hilt / 2, hiltMat));
  for (let k = 0; k < 6; k++) g.add(cyl(0.019, 0.012, 0.05 + k * 0.025, gripMat));
  g.add(cyl(0.022, 0.03, S.hilt - 0.015, hiltMat), cyl(0.02, 0.02, 0.01, hiltMat));
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.012), red);
  btn.position.set(0.02, S.hilt * 0.62, 0);
  g.add(btn);
  const blade = new THREE.Group();
  blade.position.y = S.hilt;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, S.blade, 12).translate(0, S.blade / 2, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const glowMat = new THREE.MeshBasicMaterial({ color: S.colors[0], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, S.blade + 0.03, 12).translate(0, S.blade / 2, 0), glowMat);
  blade.add(core, glow);
  blade.scale.y = 0.0001;
  blade.visible = false;
  g.add(blade);
  g.traverse((m) => { if (m.isMesh && m.material !== glowMat) m.castShadow = true; });
  return { g, blade, glowMat };
}

export class Saber {
  constructor(scene, camera) {
    Object.assign(this, { camera, held: false, t: 0, hum: null, swing: 0, swings: 0, lastYaw: camera.rotation.y, lastPitch: camera.rotation.x, cooldown: 0 });
    const y0 = LEVELS[S.level].floor + S.y;
    // the holder: two black hooks on the wall
    this.holder = new THREE.Group();
    const hook = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
    for (const dz of [-0.1, 0.1]) { // the switched-off saber is just its 30 cm hilt
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), hook);
      h.position.set(S.x + 0.025, y0 - 0.02, S.z + dz);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.02), hook);
      lip.position.set(S.x + 0.05, y0, S.z + dz);
      this.holder.add(h, lip);
    }
    // an invisible box over the hooks: the E target for hanging it back
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.4), new THREE.MeshBasicMaterial());
    pick.position.set(S.x + 0.06, y0, S.z);
    pick.visible = false;
    this.holder.add(pick);
    scene.add(this.holder);
    const { g, blade, glowMat } = buildSaber();
    Object.assign(this, { saber: g, blade, glowMat });
    this.wall = { pos: new THREE.Vector3(S.x + 0.04, y0 + 0.012, S.z - S.hilt / 2), rot: new THREE.Euler(Math.PI / 2, 0, 0) }; // hilt centred on the hooks
    this.hang(scene);
    this.takeTarget = { name: 'lightsabern', kind: 'saber', verb: 'ta', pickable: g, toggle: () => this.take() };
    this.backTarget = { name: 'hållaren', kind: 'saber', verb: 'hänga tillbaka lightsabern på', pickable: pick, toggle: () => this.putBack() };
    g.traverse((m) => { m.userData.door = this.takeTarget; });
    pick.userData.door = this.backTarget;
    this.scene = scene;
  }

  /** The E target right now: the saber on the wall, or the empty hooks while it is held. */
  get target() { return this.held ? this.backTarget : this.takeTarget; }

  hang(scene) {
    scene.add(this.saber);
    this.saber.position.copy(this.wall.pos);
    this.saber.rotation.copy(this.wall.rot); // lying across the hooks, hilt to the north
  }

  take() {
    this.held = true;
    if (!this.camera.parent) this.scene.add(this.camera); // children of the camera only render in the scene
    this.camera.add(this.saber);
    this.saber.position.set(S.held.x, S.held.y, S.held.z);
    this.saber.rotation.set(-1.0, 0, -0.25); // tipped forward and a little inwards
    this.glowMat.color.setHex(S.colors[Math.floor(Math.random() * S.colors.length)]);
    this.blade.visible = true;
    this.t = 0;
    sfx.saberOn(this.where());
    this.hum = sfx.saberHum(this.where());
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
  }

  putBack() {
    this.held = false;
    this.hum?.stop(); this.hum = null;
    sfx.saberOff(this.where());
    this.blade.visible = false;
    this.blade.scale.y = 0.0001;
    this.hang(this.scene);
  }

  /** Swing (also on a mouse click). */
  swingNow(speed = S.swingSpeed * 1.5) {
    if (!this.held || this.cooldown > 0) return;
    this.swing = 1;
    this.cooldown = 0.3;
    this.swings++;
    sfx.saberSwing(this.where(), Math.min(1, speed / (S.swingSpeed * 3)));
  }

  where() { return this.saber.getWorldPosition(new THREE.Vector3()); }

  update(dt) {
    if (!this.held) return;
    this.t += dt;
    this.cooldown -= dt;
    this.blade.scale.y = Math.min(1, this.t / 0.25); // the blade extends
    // looking around fast = a swing
    if (dt > 0) {
      let dy = this.camera.rotation.y - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const speed = Math.hypot(dy, this.camera.rotation.x - this.lastPitch) / dt;
      if (speed > S.swingSpeed) this.swingNow(speed);
      this.hum?.set(Math.min(1, speed / (S.swingSpeed * 2)));
    }
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    // swing animation: a quick arc across the view and back
    this.swing = Math.max(0, this.swing - dt * 3.5);
    const k = Math.sin(this.swing * Math.PI);
    this.saber.rotation.set(-1.0 - 0.6 * k, 0.5 * k, -0.25 + 1.2 * k);
  }
}
