import * as THREE from 'three';
import { AIRFRYER as A } from './config.js';
import { sfx } from './audio.js';

// The air fryer (#287): an OBH Nordica Easy Fry Deluxe in brushed stainless with a black top and base, on the worktop in
// the corner left of the freezer, its cord to the corner power box. Two E targets:
//  - the basket (the black drawer with the long handle at the front): pulls out / pushes in. A fish finger in the hand
//    goes into the open basket (main.js 'airfry' → FishPack.airfryHeld, up to AIRFRYER.slots), and lies there as a child
//    of the basket, so it rides along; E on one in the open basket takes it out again;
//  - the control panel (black glass on the top front): starts a run of AIRFRYER.seconds (200° and a countdown on the
//    display, a fan hum, a warm glow from the vents), or stops it. Pulling the basket out pauses the run, pushing it in
//    resumes it. At 0:00 it beeps, the fan stops and the display shows "End".
// The fish fingers cook from frozen pale to golden in one run (FishFinger.fry: `cooking`, `rate`), and burn if run again
// and again; burning ones smoke out of the vents (`smoking` → the smoke alarm). F: off, the basket in, emptied (main.js).
// Built facing −z: local x = across, z = front (−d/2) … back (+d/2), y up from the worktop; the group is turned AIRFRYER.rot
// (#296: 45°, the front diagonally out of the corner), so the basket's slide, the panel, the slots and the vents turn with it.

const steel = (() => { // brushed stainless: fine horizontal streaks
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    const v = 160 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.35)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 20 + Math.random() * 60, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.35 }); // (no environment map: high metalness reads dark grey)
})();
const black = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.45 });
const gloss = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.12, metalness: 0.2 });
const grey = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.6 });
const cordMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
const plateMat = (() => { // the crisper plate: dark grey, perforated
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3d40'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#0d0d0e';
  for (let y = 4; y < 64; y += 8) for (let x = 4 + ((y / 8) % 2) * 4; x < 64; x += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
})();

/** A rounded rectangle w × d (x, z) extruded h up from y0, corner radius r. */
function rounded(w, d, h, r, y0 = 0) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); // extrusion → +y (shape y → −z: the shape is symmetric)
  g.translate(0, y0, 0);
  return g;
}

const box = (w, h, d, m, x, y, z) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};

export class AirFryer {
  /** y = the worktop's top. */
  constructor(y) {
    const { w, d, h } = A, B = A.basket;
    Object.assign(this, { name: 'airfryern', out: 0, open: false, running: false, left: 0, done: false, hum: null, glow: 0, shown: '' });
    const g = new THREE.Group();
    g.position.set(A.x, y, A.z);
    g.rotation.y = THREE.MathUtils.degToRad(A.rot ?? 0);
    g.updateMatrixWorld(true);
    this.object = g;
    const local = (wx, yy, wz) => g.worldToLocal(new THREE.Vector3(wx, y + yy, wz)); // a world (x, z) at yy over the worktop
    const base = 0.018, capY = h - 0.03, frontZ = -d / 2, basketBack = frontZ + B.d;
    // black base, the stainless body (above the basket all the way, behind it below), the black top cap
    const baseM = new THREE.Mesh(rounded(w, d, base, 0.05), black); baseM.receiveShadow = true;
    const upper = new THREE.Mesh(rounded(w, d, capY - (base + B.h), 0.05, base + B.h), steel);
    const lowerBack = new THREE.Mesh(rounded(w, d - B.d, B.h, 0.04, base), steel);
    lowerBack.position.z = B.d / 2;
    const cap = new THREE.Mesh(rounded(w - 0.004, d - 0.004, 0.03, 0.048, capY), black);
    for (const m of [upper, lowerBack, cap]) m.castShadow = m.receiveShadow = true;
    g.add(baseM, upper, lowerBack, cap);
    // the cavity behind the basket's front: a dark inside, so the basket pulled out shows a dark hole
    g.add(box(w - 0.03, B.h - 0.01, 0.004, black, 0, base + B.h / 2, basketBack + 0.002));
    // the control panel: black glass on the top front, with the display (a canvas) and touch symbols
    const panel = new THREE.Group();
    panel.position.set(0, h + 0.0008, frontZ + 0.07);
    this.screen = document.createElement('canvas'); this.screen.width = 256; this.screen.height = 128;
    this.screenTex = new THREE.CanvasTexture(this.screen); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, 0.1), new THREE.MeshStandardMaterial({ map: this.screenTex, emissive: 0xffffff, emissiveMap: this.screenTex, emissiveIntensity: 0.9, roughness: 0.1 }));
    glass.rotation.set(-Math.PI / 2, 0, Math.PI); // facing up, read from the front (the canvas top away from you)
    panel.add(glass);
    g.add(panel);
    this.panelPick = glass;
    // the vents at the back: black slots, a warm additive glow behind them while it runs
    for (let i = 0; i < 6; i++) g.add(box(w * 0.6, 0.006, 0.004, black, 0, capY - 0.03 - i * 0.014, d / 2 + 0.001));
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 0.09), this.glowMat);
    glow.position.set(0, capY - 0.065, d / 2 + 0.003); glow.raycast = () => {};
    g.add(glow);
    this.vent = g.localToWorld(new THREE.Vector3(0, h + 0.02, d / 2 - 0.03)); // where smoke comes out (the group never moves)
    // the basket: a black drawer — front panel, handle with a release button, open-top tray with the crisper plate
    const bk = new THREE.Group();
    bk.position.set(0, base, 0);
    const fw = w - 0.012, inW = fw - 0.03, inD = B.d - 0.04;
    const tray = [box(fw, B.h - 0.004, 0.02, gloss, 0, B.h / 2, frontZ + 0.01),                // front
      box(inW, 0.004, inD, black, 0, 0.02, frontZ + 0.02 + inD / 2),                           // floor
      ...[-1, 1].map((sx) => box(0.004, B.h - 0.03, inD, black, sx * inW / 2, (B.h - 0.03) / 2 + 0.01, frontZ + 0.02 + inD / 2)), // sides
      box(inW, B.h - 0.03, 0.004, black, 0, (B.h - 0.03) / 2 + 0.01, frontZ + 0.02 + inD),       // back
      box(inW - 0.01, 0.004, inD - 0.01, plateMat, 0, 0.035, frontZ + 0.02 + inD / 2)];          // the crisper plate
    bk.add(...tray);
    const handle = box(0.045, 0.035, 0.11, black, 0, B.h * 0.55, frontZ - 0.055);                // the long handle
    handle.rotation.x = 0.12;
    this.handle = handle;
    bk.add(handle, box(0.016, 0.008, 0.026, grey, 0, B.h * 0.55 + 0.022, frontZ - 0.045));       // its release button
    g.add(bk);
    this.basket = bk;
    this.plateY = 0.037; // fish fingers lie on the plate (basket-local)
    this.slotAt = (i) => { // 2 rows (front, back) of 3 across: lying along z, the stick's origin at its front end
      const col = i % 3, row = Math.floor(i / 3);
      return new THREE.Vector3((col - 1) * 0.06, this.plateY, frontZ + 0.03 + row * 0.1);
    };
    // the cord: from the back near the bottom, a short way along the worktop to a plug in the corner power box's north face
    // (#296: the box sits right behind the turned back); the plug square to the walls, not to the fryer
    const s = A.socket, wy = 0.006, plugAt = local(s.x - 0.025, 0.025, s.z - 0.05 - 0.01), cordEnd = local(s.x - 0.025, 0.022, s.z - 0.05 - 0.02);
    const pts = [new THREE.Vector3(0.03, 0.03, d / 2 - 0.005), new THREE.Vector3(0.035, wy, d / 2 + 0.012),
      new THREE.Vector3(cordEnd.x, wy, cordEnd.z - 0.01), cordEnd];
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0035, 6), cordMat);
    cord.raycast = () => {};
    const plug = box(0.012, 0.022, 0.02, cordMat, plugAt.x, plugAt.y, plugAt.z);
    plug.rotation.y = -g.rotation.y;
    g.add(cord, plug);
    const self = this;
    this.basketTarget = { kind: 'airfryer', id: 'airfryer-basket', pickable: bk, toggle: () => this.setOpen(!this.open),
      get name() { return 'korgen i airfryern'; }, get verb() { return self.open ? 'skjuta in' : 'dra ut'; }, get isOpen() { return self.open; } };
    bk.traverse((m) => { m.userData.door = this.basketTarget; });
    // the front and the tray (floor, plate, walls): with the basket out and a free hand main.js turns a look at them into
    // the fish finger nearest the look, if any (the front is deep: you often see the fish over it); the handle pushes it in
    this.trayTarget = Object.create(this.basketTarget, { tray: { value: true } });
    for (const m of tray) m.userData.door = this.trayTarget;
    this.panelTarget = { kind: 'airfryer', id: 'airfryer', pickable: panel, toggle: () => this.press(),
      name: 'airfryern', get verb() { return self.running ? 'stänga av' : 'starta'; }, get isOpen() { return self.running; },
      get blocked() { return self.open; }, blockedText: 'Skjut in korgen först' };
    panel.traverse((m) => { m.userData.door = this.panelTarget; });
    for (const m of [baseM, upper, lowerBack, cap]) m.userData.door = this.panelTarget; // the body: the panel's target too
    this.targets = [this.basketTarget, this.panelTarget];
    this.draw();
  }

  /** Running with the basket in: the fish fingers in it cook. */
  get cooking() { return this.running && !this.open && this.out < 0.02; }

  setOpen(open) {
    if (open === this.open) return;
    this.open = open;
    if (open) this.done = false; // the "End" goes when you take the food out
    sfx.cupboard(this.object.position, open);
    this.hum?.stop(); this.hum = null; // paused while out; on again when it is pushed in (update)
  }

  /** E on the panel: start a run (the basket in), or stop it. */
  press() {
    if (this.open) return;
    sfx.click(this.object.position);
    if (this.running) { this.stop(); this.done = false; return; }
    this.running = true; this.done = false; this.left = A.seconds;
    this.onStart?.();
  }

  stop() {
    this.running = false;
    this.hum?.stop(); this.hum = null;
  }

  /** F / a fresh start: off, the basket in, the display dark. */
  reset() {
    this.stop();
    this.open = false; this.out = 0; this.done = false; this.left = 0; this.glow = 0;
    this.basket.position.z = 0;
    this.glowMat.opacity = 0;
    this.draw();
  }

  /** The display: dark when off; 200° and m:ss (game time) while it runs; "End" when done. */
  draw() {
    const secs = Math.ceil(this.left * A.clock);
    const text = this.running ? `${A.temp}|${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : this.done ? 'End' : '';
    if (text === this.shown && this.screenTex.version) return;
    this.shown = text;
    const c = this.screen.getContext('2d');
    c.fillStyle = '#060607'; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = 'rgba(150,150,150,0.45)'; c.lineWidth = 3; // the touch symbols: power, −/+ , a fan
    c.beginPath(); c.arc(30, 64, 12, -1.1, 4.2); c.moveTo(30, 48); c.lineTo(30, 62); c.stroke();
    c.fillStyle = 'rgba(150,150,150,0.45)'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('−', 226, 40); c.fillText('+', 226, 88);
    c.fillStyle = '#ff5a1f';
    if (this.running) {
      const [t, m] = text.split('|');
      c.font = 'bold 22px monospace'; c.fillText(`${t}°C`, 128, 30);
      c.font = 'bold 54px monospace'; c.fillText(m, 128, 82);
    } else if (this.done) { c.font = 'bold 54px monospace'; c.fillText('End', 128, 66); }
    this.screenTex.needsUpdate = true;
  }

  update(dt) {
    // the basket slides
    const goal = this.open ? 1 : 0;
    if (this.out !== goal) {
      this.out += Math.sign(goal - this.out) * Math.min(Math.abs(goal - this.out), dt / A.basket.in);
      const k = this.out, e = k * k * (3 - 2 * k);
      this.basket.position.z = -A.basket.out * e;
    }
    if (this.running && this.cooking) {
      if (!this.hum) this.hum = sfx.fan(this.object.position);
      this.left = Math.max(0, this.left - dt);
      if (this.left <= 0) { // done: beep beep beep, the fan stops
        this.stop();
        this.done = true;
        sfx.fryerBeep(this.object.position, A.beeps);
        this.onDone?.();
      }
    }
    // the vents glow while it heats
    const g = this.cooking ? 1 : 0;
    this.glow += Math.sign(g - this.glow) * Math.min(Math.abs(g - this.glow), dt * 0.8);
    this.glowMat.opacity = 0.35 * this.glow;
    this.draw();
  }
}
