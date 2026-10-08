// The jetpack (#359, JETPACK in config): a chunky backpack with two nozzles, straps and a small control grip (our own
// look, no brand) on a wall hook inside the garage beside the garage door (#441), under the sign "Låna Jetpack på eget
// ansvar. Se upp för fiskmåsar." E on it puts it on: worn on the
// back, the hands stay free (not a Holdable). Space / ⬆ held = thrust up, C / Ctrl / ⬇ = down faster, WASD / the stick
// steer across at a flying speed with some inertia (player.js does the flying: `player.jet` = this), no thrust = falling.
// The thrust heats it (the HUD's bar): too hot and it cuts out until it has cooled (a cut high up is a fall, fall.js).
// Landing: on whatever roof is under you (roofs.js, #360), else the ground; as hard as the speed you came down at.
// E with nothing else to do (touch: the action button "Ta av jetpacken") stands it down where you stand — the ground, a
// roof, a terrace, the loftgång — and it stays there (keep.js keeps the spot across a page-made reload); E on it again.
// Not indoors: walking in through a door with it on stands it down outside; in the garage (and Hus L's stairwell) it stays
// on but gives no thrust under the ceiling ("Inte inomhus"). F sends it home to its hook, and
// so does waking up after a bad fall (fall.onWake). Flames + smoke from the nozzles, an orange glow at the bottom of the
// view and a roar (sfx.jetRoar) while it thrusts. Draw calls: the model (1), the hook (1), flames (1), smoke (1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JETPACK as J } from './config.js';
import { sfx } from './audio.js';
import { crosses } from './player.js';

const HEIGHT = 0.68; // the model's height (nozzle tips at y 0)

/** A geometry painted one colour (vertex colours, so the whole model is one mesh). */
function paint(geo, hex) {
  const g = geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** The model, local: nozzle tips at y 0, the back plate at z 0, the tanks out towards +z, the straps towards −z. */
function packGeometry() {
  const dark = 0x2c3238, shell = 0xe2e5e8, accent = 0xe8642a, metal = 0x4a4f55, strap = 0x1b1c1e, red = 0xd8242a;
  const g = [];
  const box = (w, h, d, x, y, z, c) => g.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 16) => g.push(paint(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), c));
  box(0.36, 0.52, 0.05, 0, 0.4, 0.025, dark);                       // the back plate
  box(0.11, 0.32, 0.1, 0, 0.38, 0.1, dark);                         // the engine block between the tanks
  box(0.025, 0.26, 0.012, 0, 0.38, 0.152, accent);                  // its stripe
  for (const s of [-1, 1]) {
    const x = s * 0.105;
    cyl(0.085, 0.085, 0.42, x, 0.36, 0.13, shell);                  // a tank
    g.push(paint(new THREE.SphereGeometry(0.085, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, 0.57, 0.13), shell)); // its dome
    cyl(0.085, 0.05, 0.07, x, 0.115, 0.13, metal);                  // tapering down into the nozzle
    cyl(0.036, 0.052, 0.08, x, 0.04, 0.13, metal);                  // the nozzle
    for (const y of [0.22, 0.5]) cyl(0.089, 0.089, 0.028, x, y, 0.13, accent); // bands
    // a shoulder strap: a loop out over the shoulder and back down to the plate (−z side), and a short hip strap
    g.push(paint(new THREE.TorusGeometry(0.16, 0.016, 6, 14, Math.PI).rotateZ(Math.PI / 2).rotateY(-Math.PI / 2).scale(1, 1.15, 0.9).translate(x, 0.44, 0), strap));
    box(0.05, 0.05, 0.16, s * 0.15, 0.17, -0.07, strap);
  }
  // the control grip on the right: an arm out from the plate, a handle with a red button
  box(0.03, 0.03, 0.06, 0.19, 0.24, 0.02, dark);
  g.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8).rotateX(Math.PI / 2).translate(0.2, 0.24, -0.1), metal));
  cyl(0.021, 0.021, 0.1, 0.2, 0.27, -0.22, strap, 10);
  g.push(paint(new THREE.SphereGeometry(0.013, 8, 6).translate(0.2, 0.325, -0.22), red));
  return mergeGeometries(g);
}

/** The flames: two cones under the nozzles (bright at the nozzle, red at the tip), local like the model. */
function flameGeometry() {
  const g = [];
  for (const s of [-1, 1]) {
    const c = new THREE.ConeGeometry(0.045, 0.4, 10, 3, true).rotateX(Math.PI).translate(s * 0.105, -0.2, 0.13);
    const p = c.attributes.position, col = new Float32Array(p.count * 3), hot = new THREE.Color(0xfff2c0), tip = new THREE.Color(0xff4010), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) { t.copy(hot).lerp(tip, THREE.MathUtils.clamp(-p.getY(i) / 0.4, 0, 1)); col.set([t.r, t.g, t.b], i * 3); }
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    c.deleteAttribute('uv');
    g.push(c);
  }
  return mergeGeometries(g);
}

/** A soft round puff for the smoke. */
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const SMOKE = 60;

export class Jetpack {
  /** `groundY(x, z)`: the terrain (surroundings.js); `hud` = { el: #jetpack, glow: #jet-glow, up: #jet-up, down: #jet-down }. */
  constructor({ scene, camera, player, groundY, hud }) {
    Object.assign(this, { scene, camera, player, hud, state: 'hook', heat: 0, cut: false, k: 0, warnT: 0, touchUp: false, touchDown: false, lastOut: null });
    this.onFlight = null; // a take-off (stats)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
    // the hook on the wall: a plate on the face, a bar out and up
    // (#441: `face` = the way the wall faces, ±1 along x; `floor` = the floor under it, else the terrain)
    const H = J.hook, s = H.face ?? -1, hy = (H.floor ?? groundY(H.x + s * 0.3, H.z)) + H.h;
    this.home = { x: H.x + s * 0.045, y: hy - HEIGHT + 0.03, z: H.z, yaw: s < 0 ? -Math.PI / 2 : Math.PI / 2 }; // its back plate against the wall
    const hook = mergeGeometries([paint(new THREE.BoxGeometry(0.015, 0.12, 0.09).translate(H.x + s * 0.0075, hy, H.z), 0x34383c),
      paint(new THREE.BoxGeometry(0.07, 0.018, 0.018).translate(H.x + s * 0.035, hy - 0.02, H.z), 0x34383c),
      paint(new THREE.BoxGeometry(0.018, 0.045, 0.018).translate(H.x + s * 0.07, hy, H.z), 0x34383c)]);
    this.hook = new THREE.Mesh(hook, mat);
    scene.add(this.hook);
    // the sign over it (#441, the user's words), our own drawing: a yellow plate, black text, a gull
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f3cf2a'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 44px sans-serif'; g.fillText('Låna Jetpack', 300, 62); g.font = 'bold 36px sans-serif'; g.fillText('på eget ansvar.', 300, 112);
    g.font = 'bold 30px sans-serif'; g.fillText('Se upp för', 300, 168); g.fillText('fiskmåsar.', 300, 206);
    g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(30, 150); g.quadraticCurveTo(62, 104, 92, 146); g.quadraticCurveTo(122, 104, 154, 150); g.stroke(); // the gull
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(J.sign.w, J.sign.w / 2), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(H.x + s * 0.01, hy + J.sign.over, H.z); sign.rotation.y = s * Math.PI / 2; sign.raycast = () => {};
    scene.add(sign);
    this.sign = sign;

    this.model = new THREE.Group();
    this.model.userData.moving = true; // (it moves while you may stand still, detail.js #267)
    const body = new THREE.Mesh(packGeometry(), mat);
    body.castShadow = true;
    this.model.add(body);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.44), new THREE.MeshBasicMaterial());
    pick.position.set(0, 0.38, 0.03);
    pick.visible = false;
    this.model.add(pick);
    this.target = { name: 'jetpacken', kind: 'jetpack', verb: 'ta på dig', pickable: pick, toggle: () => this.putOn() };
    pick.userData.door = this.target;
    this.dropTarget = { name: 'jetpacken', kind: 'jetpack', verb: 'ta av dig', toggle: () => this.takeOff() };
    scene.add(this.model);

    // on the back: a rig that follows the visitor (yaw only) with the flames under the nozzles
    this.rig = new THREE.Group();
    this.flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flames = new THREE.Mesh(flameGeometry(), this.flameMat);
    this.flames.position.set(0, 0.86, 0.14); // the nozzles' tips on the visitor's back
    this.flames.visible = false;
    this.rig.add(this.flames);
    scene.add(this.rig);

    // the smoke: one Points of puffs in the world, grey, fading
    const pos = new Float32Array(SMOKE * 3).fill(-1e4), col = new Float32Array(SMOKE * 4);
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.smokeGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.smoke = new THREE.Points(this.smokeGeo, new THREE.PointsMaterial({ size: 0.9, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    this.smoke.raycast = () => {};
    this.smoke.visible = false;
    this.puffs = Array.from({ length: SMOKE }, () => ({ t: 9, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.nextPuff = 0; this.puffI = 0;
    scene.add(this.smoke);

    for (const [el, key] of [[hud.up, 'touchUp'], [hud.down, 'touchDown']]) {
      if (!el) continue;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this[key] = true; });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { this[key] = false; });
    }
    this.goHome();
  }

  get worn() { return this.state === 'worn'; }
  /** In the air with it on (no page reload now, main.js `autoReload`). */
  get flying() { return this.worn && (this.player.flying || !!this.player.fall); }

  /** What E can aim at: the pack itself while it is not on your back. */
  targets() { return this.worn ? [] : [this.target.pickable]; }

  /** Stand the model at (x, y, z) facing `yaw`. */
  place(x, y, z, yaw) {
    this.model.visible = true;
    this.model.position.set(x, y, z);
    this.model.rotation.set(0, yaw, 0);
    this.model.updateMatrixWorld(true);
  }

  goHome() {
    const h = this.home;
    this.state = 'hook';
    this.place(h.x, h.y, h.z, h.yaw);
    this.wearOff();
  }

  putOn() {
    if (!this.player.outdoors) return; // (never indoors; in the garage yes, #441)
    this.state = 'worn';
    this.model.visible = false;
    this.heat = 0; this.cut = false;
    this.player.jet = this;
    this.showHud(true);
  }

  /** Can it be stood down now (on something, not in the air)? */
  get canTakeOff() {
    const p = this.player;
    return this.worn && !p.flying && !p.fall && p.pos.y <= p.groundAt(p.pos.x, p.pos.z, p.pos.y) + 0.02;
  }

  /** Stand it down where you stand: a step in front of your feet when that is clear and level, else at your feet. */
  takeOff(at = null) {
    const p = this.player, yaw = this.camera.rotation.y;
    let x = at?.x ?? p.pos.x, z = at?.z ?? p.pos.z, y = at?.y ?? p.pos.y;
    if (!at) {
      const fx = x - Math.sin(yaw) * J.drop, fz = z - Math.cos(yaw) * J.drop, gy = p.groundAt(fx, fz, y + 0.1);
      const [stat, dyn] = p.segments();
      if (Math.abs(gy - y) < 0.12 && ![...stat, ...dyn].some((s) => crosses(x, z, fx, fz, s))) { x = fx; z = fz; y = gy; }
    }
    this.state = 'ground';
    this.place(x, y, z, yaw);
    this.wearOff();
  }

  wearOff() {
    if (this.player.jet === this) this.player.jet = null;
    this.flames.visible = false;
    this.k = 0;
    this.roar?.stop(); this.roar = null;
    this.touchUp = this.touchDown = false;
    this.showHud(false);
  }

  showHud(on) {
    const { el, up, down, glow } = this.hud;
    if (el) el.hidden = !on;
    if (up) up.hidden = !on;
    if (down) down.hidden = !on;
    if (glow && !on) glow.style.opacity = 0;
  }

  /** player.js asks every frame: the thrust in m/s² (− = pushing down), and the heat goes up / down. */
  lift(dt, grounded) {
    const k = this.player.keys;
    const up = k.has('Space') || this.touchUp;
    const down = k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight') || this.touchDown;
    if (this.cut && this.heat <= J.heat.resume) this.cut = false;
    const p=this.player.pos,portik=this.player.world.portik;
    const roofed = this.player.below || this.player.inCore || (portik?.contains(p.x,p.z)&&p.y<portik.height); // no thrust under garage/stairwell/portik ceilings (#441, #520)
    if (up && roofed && !this.roofedHint) this.onRoofed?.();
    this.roofedHint = up && roofed;
    const on = up && !this.cut && !roofed;
    this.heat = THREE.MathUtils.clamp(this.heat + (on ? J.heat.up : -(grounded ? J.heat.ground : J.heat.cool)) * dt, 0, 1);
    if (on && this.heat >= 1) { this.cut = true; sfx.hiss(null, 1.6); } // too hot: off until it has cooled
    if (on && grounded && !this.lifting) { this.lifting = true; this.onFlight?.(); } // lifting off (once per take-off)
    if (grounded && !on) this.lifting = false;
    this.thrusting = on;
    this.warnT -= dt;
    if (on && this.heat > J.heat.warn && this.warnT <= 0) { sfx.jetWarn(); this.warnT = 0.5; }
    return on ? J.thrust : down && !grounded ? -J.down : 0;
  }

  update(dt) {
    const p = this.player;
    if (this.worn) {
      // not indoors: walking in through a door stands it down outside it
      const inside = !p.outdoors; // (the flat; the garage keeps it on, #441)
      if (inside && this.lastOut) { this.takeOff(this.lastOut); this.onLeftAtDoor?.(); }
      else if (!inside && !p.flying && !p.fall) this.lastOut = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    }
    const on = this.worn && this.thrusting;
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 14 : 8));
    if (this.worn) {
      this.rig.position.copy(p.pos);
      this.rig.rotation.set(0, this.camera.rotation.y, 0);
      this.rig.updateMatrixWorld(true);
      this.flames.visible = this.k > 0.03;
      if (this.flames.visible) this.flames.scale.set(1, this.k * (0.75 + Math.random() * 0.5), 1);
      this.flameMat.opacity = 0.9 * Math.min(1, this.k * 1.5);
      if (on && !this.roar) this.roar = sfx.jetRoar();
      this.roar?.set(this.k);
      if (this.roar && this.k < 0.02 && !on) { this.roar.stop(); this.roar = null; }
      const { el, glow } = this.hud;
      if (glow) glow.style.opacity = (this.k * 0.85).toFixed(2);
      if (el) {
        el.querySelector('i').style.width = `${Math.round(this.heat * 100)}%`;
        el.classList.toggle('hot', this.heat > J.heat.warn);
        el.classList.toggle('cut', this.cut);
      }
      // smoke out of the nozzles
      this.nextPuff -= dt;
      if (on && this.nextPuff <= 0) {
        this.nextPuff = 0.035;
        for (const s of [-1, 1]) {
          const q = this.puffs[this.puffI = (this.puffI + 1) % SMOKE];
          q.p.set(s * 0.105, -0.25, 0.13).applyMatrix4(this.flames.matrixWorld);
          q.v.set((Math.random() - 0.5) * 0.6, -2.5 - Math.random() * 1.5 + Math.min(0, p.vy) * 0.5, (Math.random() - 0.5) * 0.6);
          q.t = 0; q.life = 1 + Math.random() * 0.6;
        }
      }
    }
    // the puffs: slow down, rise a little, fade (only while any is alive; no draw call otherwise)
    this.smoke.visible = this.puffs.some((q) => q.t < q.life);
    if (this.smoke.visible) {
      const pa = this.smokeGeo.attributes.position, ca = this.smokeGeo.attributes.color;
      this.puffs.forEach((q, i) => {
        q.t += dt;
        if (q.t >= q.life) { pa.setXYZ(i, 0, -1e4, 0); ca.setW(i, 0); return; }
        q.v.multiplyScalar(Math.max(0, 1 - 2.5 * dt)); q.v.y += 0.6 * dt;
        q.p.addScaledVector(q.v, dt);
        const a = q.t / q.life, gy = 0.55 + 0.25 * a;
        pa.setXYZ(i, q.p.x, q.p.y, q.p.z);
        ca.setXYZW(i, gy, gy, gy, 0.5 * (1 - a) * Math.min(1, q.t * 10));
      });
      pa.needsUpdate = ca.needsUpdate = true;
    }
  }

  /** keep.js (#277): where it is. */
  saveState() {
    const r = (v) => Math.round(v * 1000) / 1000, m = this.model.position;
    if (this.state === 'ground') return { s: 'ground', p: [r(m.x), r(m.y), r(m.z)], yaw: r(this.model.rotation.y) };
    return this.state === 'worn' ? { s: 'worn' } : null;
  }

  loadState(s) {
    if (s?.s === 'ground' && Array.isArray(s.p) && s.p.length === 3 && s.p.every(Number.isFinite)) {
      this.state = 'ground';
      this.place(s.p[0], s.p[1], s.p[2], Number(s.yaw) || 0);
    } else if (s?.s === 'worn') this.putOn();
  }
}
