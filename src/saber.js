import * as THREE from 'three';
import { SABER as S, LEVELS } from './config.js';
import { sfx } from './audio.js';
import { Holdable } from './holdable.js';

// The lightsaber in Sovrum 2 (#78), a Holdable (holdable.js). It hangs on two hooks on the wall; E takes
// it down: it ignites (snap-hiss), hums, and is held low on the right of the view. Looking around fast or
// clicking swings it with a whoosh that follows the speed. E on the empty hooks hangs it back (off). The
// blade glows with emissive and additive materials only (no lights).

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

export class Saber extends Holdable {
  constructor(scene, camera) {
    const y0 = LEVELS[S.level].floor + S.y;
    // the holder: two black hooks on the wall (the switched-off saber is just its 30 cm hilt)
    const hook = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
    const parts = [];
    for (const dz of [-0.1, 0.1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), hook);
      h.position.set(S.x + 0.025, y0 - 0.02, S.z + dz);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.02), hook);
      lip.position.set(S.x + 0.05, y0, S.z + dz);
      parts.push(h, lip);
    }
    const { g, blade, glowMat } = buildSaber();
    super(scene, camera, {
      name: 'lightsabern', backName: 'hållaren', backVerb: 'hänga tillbaka lightsabern på', model: g, parts,
      home: { pos: new THREE.Vector3(S.x + 0.04, y0 + 0.012, S.z - S.hilt / 2), rot: new THREE.Euler(Math.PI / 2, 0, 0) }, // hilt on the hooks
      heldPose: { pos: new THREE.Vector3(S.held.x, S.held.y, S.held.z), rot: new THREE.Euler(-1.0, 0, -0.25) }, // tipped forward, inwards
      pick: { pos: new THREE.Vector3(S.x + 0.06, y0, S.z), size: [0.12, 0.2, 0.4] },
      swing: S.swingSpeed, cooldown: 0.3, useLabel: 'Svinga',
    });
    Object.assign(this, { saber: g, blade, glowMat, hum: null, swingT: 0 });
  }

  get swings() { return this.uses; }

  onTake() {
    this.glowMat.color.setHex(S.colors[Math.floor(Math.random() * S.colors.length)]);
    this.blade.visible = true;
    sfx.saberOn(this.where());
    this.hum = sfx.saberHum(this.where());
  }

  onPut() {
    this.hum?.stop(); this.hum = null;
    sfx.saberOff(this.where());
    this.blade.visible = false;
    this.blade.scale.y = 0.0001;
  }

  onUse(speed) {
    this.swingT = 1;
    sfx.saberSwing(this.where(), Math.min(1, (speed || S.swingSpeed * 1.5) / (S.swingSpeed * 3)));
  }

  /** Kept for main.js / old callers: a click swings it. */
  swingNow() { this.use(S.swingSpeed * 1.5); }

  tick(dt, speed) {
    this.blade.scale.y = Math.min(1, this.t / 0.25); // the blade extends
    this.hum?.set(Math.min(1, speed / (S.swingSpeed * 2)));
    // swing animation: a quick arc across the view and back
    this.swingT = Math.max(0, this.swingT - dt * 3.5);
    const k = Math.sin(this.swingT * Math.PI);
    this.model.rotation.set(-1.0 - 0.6 * k, 0.5 * k, -0.25 + 1.2 * k);
  }
}
