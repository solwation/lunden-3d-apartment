import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Holdable, handBusy } from './holdable.js';
import { roomEnv } from './lights.js';
import { sfx } from './audio.js';
import { TOASTER as T, KITCHEN } from './config.js';

// The toaster (#401): the family's OBH Nordica Piano Black (docs/brodrost-obh-piano-black.jpg), a two-slice toaster in
// glossy black with chrome ends and a chrome top plate, a browning dial and four buttons on the front (our own canvas
// label: no OBH logo or wordmark, a plain oval badge), the lever on its right end. A Holdable that lives standing in the
// bottom drawer of the drawer unit by the corner (world.toasterDrawer; a child of the drawer, so it rides along like the
// pan, #159) — "Öppna lådan först" while the drawer is shut. Taken out, it goes down on the worktop (or anywhere a thing
// goes down) standing upright, its front to you; E on it with the drawer open puts it back.
// Three E targets while it stands out:
//  - the body: take it again (a plugged-in toaster is unplugged first: "dra ur sladden och ta");
//  - the plug at the end of its cord: "Koppla in brödrosten" when the corner power box's second socket (TOASTER.socket) is
//    within TOASTER.cord of where the cord leaves its back, else "För långt från uttaget"; plugged in, "Dra ur sladden".
//    The cord is then drawn as a soft curve along the worktop to the socket;
//  - the lever and the front: plugged in, the lever goes down — the slots glow orange, a tick and a hum — and after
//    TOASTER.seconds (by the dial) it pops up with a "pling"; E again (STOP) pops it early. Unplugged: "Brödrosten är inte
//    inkopplad". It toasts empty for now; bread is #394 (LIFE-032). Nothing burns.
// F sends it home, unplugged (main.js); keep.js keeps where it stands (`things`) and whether it is plugged in (`keepState`).
// Built facing −z: local x across (the lever at −x, the right end seen from the front), y up from its feet, origin at the
// bottom centre. Merged per material (black, chrome, the label); the lever, the cord and the plug are their own meshes.

const env = roomEnv();
const chrome = new THREE.MeshStandardMaterial({ color: 0xc9cbce, metalness: 0.9, roughness: 0.2, envMap: env, envMapIntensity: 0.8 });
const piano = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0, roughness: 0.14, envMap: env, envMapIntensity: 0.08 });
const matt = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7 });
const cordMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

/** A plan shape (x, z) extruded h up from y0. */
function extrude(shape, h, y0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // extrusion → +y; shape y → −z (the shapes are symmetric in z)
  g.translate(0, y0, 0);
  return g;
}
/** A rounded rectangle w × d, corner radius r. */
function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  return s;
}
/** One rounded end of the body, `band` wide in x, at side `sx` (−1 = −x): the chrome bands down each end. */
function endShape(w, d, r, band, sx) {
  const s = new THREE.Shape(), x = (w / 2) * sx, z = d / 2, i = x - sx * band, c = x - sx * r;
  s.moveTo(i, -z); s.lineTo(c, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, c, z); s.lineTo(i, z);
  s.closePath();
  return s;
}
const flat = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; };
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);

/** The front label (a canvas): the browning dial 1–7, a plain oval badge, BAGEL DEFROST REHEAT STOP under four buttons. */
const LABEL = { size: 0.12, top: 0.15, knob: [128, 78], buttons: [52, 102, 154, 204], by: 190 };
function labelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#070708'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#d9dadc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const [kx, ky] = LABEL.knob;
  g.font = 'bold 15px sans-serif';
  for (let i = 1; i <= 7; i++) { const a = THREE.MathUtils.degToRad(225 - (i - 1) * 45); g.fillText(String(i), kx + Math.cos(a) * 46, ky - Math.sin(a) * 46); }
  g.strokeStyle = '#bfc1c4'; g.lineWidth = 2; // the badge: a small plain oval (no logo)
  g.beginPath(); g.ellipse(128, 148, 26, 9, 0, 0, Math.PI * 2); g.stroke();
  g.font = 'bold 11px sans-serif';
  ['BAGEL', 'DEFROST', 'REHEAT', 'STOP'].forEach((t, i) => g.fillText(t, LABEL.buttons[i], LABEL.by + 26));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
/** Canvas pixel → the label's point on the front (local x, y). */
const onLabel = (px, py) => [LABEL.size / 2 - (px / 256) * LABEL.size, LABEL.top - (py / 256) * LABEL.size];

function toasterModel() {
  const { w, d, h } = T, feet = 0.008, H = h - feet, r = 0.03, band = 0.034, plate = 0.004;
  const black = [], shiny = [];
  // the body: piano black in the middle, chrome round each end, a chrome top plate with two dark slots
  black.push(new THREE.BoxGeometry(w - 2 * band + 0.002, H - plate, d).translate(0, feet + (H - plate) / 2, 0));
  for (const sx of [-1, 1]) shiny.push(extrude(endShape(w, d, r, band, sx), H, feet));
  shiny.push(extrude(roundedRect(w - 2 * band + 0.004, d - 0.006, 0.01), plate, feet + H - plate));
  const slots = [-1, 1].map((s) => s * 0.027);
  for (const z of slots) black.push(new THREE.BoxGeometry(T.slot.l, 0.002, T.slot.w).translate(0, h + 0.0002, z));
  // the lever's track down the right end, the feet
  black.push(new THREE.BoxGeometry(0.003, H * 0.62, 0.012).translate(-w / 2 - 0.001, feet + H * 0.47, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) black.push(new THREE.CylinderGeometry(0.009, 0.009, feet, 10).translate(sx * (w / 2 - 0.04), feet / 2, sz * (d / 2 - 0.035)));
  // the dial's knob (with a pointer at TOASTER.dial) and the four buttons, chrome on the front
  const [kx, ky] = onLabel(...LABEL.knob), fz = -d / 2;
  shiny.push(at(new THREE.CylinderGeometry(0.017, 0.018, 0.012, 24), kx, ky, fz - 0.006, Math.PI / 2));
  const a = THREE.MathUtils.degToRad(225 - (T.dial - 1) * 45);
  black.push(at(new THREE.BoxGeometry(0.003, 0.014, 0.002), kx - Math.cos(a) * 0.008, ky + Math.sin(a) * 0.008, fz - 0.0125, 0, 0, a - Math.PI / 2));
  for (const px of LABEL.buttons) { const [bx, by] = onLabel(px, LABEL.by); shiny.push(at(new THREE.CylinderGeometry(0.0068, 0.0068, 0.005, 16), bx, by, fz - 0.0025, Math.PI / 2)); }
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries(black.map(flat)), piano), ends = new THREE.Mesh(mergeGeometries(shiny.map(flat)), chrome);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(LABEL.size, LABEL.size).rotateY(Math.PI).translate(0, LABEL.top - LABEL.size / 2, fz - 0.0006),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.14, envMap: env, envMapIntensity: 0.08 }));
  for (const m of [body, ends]) m.castShadow = m.receiveShadow = true;
  // the slots' glow while it toasts (additive, over the dark slots)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(mergeGeometries(slots.map((z) => new THREE.PlaneGeometry(T.slot.l - 0.006, T.slot.w - 0.008).rotateX(-Math.PI / 2).translate(0, h + 0.0015, z))), glowMat);
  glow.raycast = () => {};
  // the lever: black, on the right end (moves down / up)
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.013, 0.034).translate(-0.015, 0, 0), matt);
  lever.castShadow = true;
  g.add(body, ends, label, glow, lever);
  return { g, body, ends, label, glow, glowMat, lever, up: feet + H - 0.035, down: feet + 0.05 };
}

export class Toaster extends Holdable {
  /** drawer: the Openable it lives in (world.toasterDrawer). */
  constructor(scene, camera, drawer) {
    const m = toasterModel();
    const n = drawer.normal; // the drawer's front faces this way; into the cabinet is −n
    const along = new THREE.Vector3(-n.z, 0, n.x);
    const home = new THREE.Vector3().addScaledVector(n, -T.home.in).addScaledVector(along, T.home.along).setY(0.029); // drawer-local, on its bottom
    const homeRot = new THREE.Euler(0, Math.atan2(-n.x, -n.z), 0); // its front towards the drawer's front
    super(scene, camera, {
      name: 'brödrosten', verb: 'ta', backName: 'brödrosten i lådan', backVerb: 'ställa tillbaka',
      model: m.g, home: { pos: home, rot: homeRot },
      heldPose: { pos: new THREE.Vector3(T.held.x, T.held.y, T.held.z), rot: new THREE.Euler(0.2, Math.PI - 0.45, 0, 'YXZ') }, // its front and lever towards you
      pick: { pos: home.clone().setY(home.y + T.h / 2), size: [0.3, T.h, 0.3] },
    });
    Object.assign(this, { drawer, parts: m, plugged: false, toasting: false, left: 0, leverT: 0, glow: 0, hum: null, placeVerb: 'ställa ner',
      rest: { q: new THREE.Quaternion(), lift: 0 }, grip: [-T.w / 2 + 0.02, T.h * 0.45, 0] });
    m.lever.position.set(-T.w / 2 - 0.002, m.up, 0);
    const self = this;
    // the body: taken again (unplugged first); at home only with its drawer open
    Object.defineProperties(this.takeTarget, {
      blocked: { get: () => handBusy(self) || self.shut, configurable: true },
      blockedText: { get: () => (self.shut && !handBusy(self) ? 'Öppna lådan först' : undefined), configurable: true },
      verb: { get: () => (self.plugged ? 'dra ur sladden och ta' : 'ta'), configurable: true },
    });
    Object.defineProperties(this.backTarget, {
      blocked: { get: () => !self.drawer.isOpen, configurable: true },
      blockedText: { get: () => 'Öppna lådan först', configurable: true },
    });
    this.leverTarget = { kind: 'holdable', item: this, pickable: m.g,
      get name() { return self.toasting ? 'brödrosten' : 'spaken på brödrosten'; }, get verb() { return self.toasting ? 'stoppa' : 'trycka ner'; },
      get blocked() { return handBusy(self) || (!self.plugged && !self.toasting); }, get blockedText() { return handBusy(self) ? undefined : 'Brödrosten är inte inkopplad'; },
      get isOpen() { return self.toasting; }, toggle: () => this.press() };
    this.plugTarget = { kind: 'holdable', item: this, pickable: m.g,
      get name() { return self.plugged ? 'sladden' : 'brödrosten'; }, get verb() { return self.plugged ? 'dra ur' : 'koppla in'; },
      get blocked() { return !self.plugged && !self.inReach(); }, blockedText: 'För långt från uttaget',
      get isOpen() { return self.plugged; }, toggle: () => this.setPlugged(!this.plugged) };
    // the cord and its plug (their own meshes, children of the model); the plug carries a bigger invisible pick box
    this.cord = new THREE.Mesh(new THREE.BufferGeometry(), cordMat);
    this.cord.raycast = () => {};
    this.plug = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.038), cordMat);
    const plugPick = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.11), new THREE.MeshBasicMaterial());
    plugPick.visible = false;
    const ray = plugPick.raycast.bind(plugPick);
    plugPick.raycast = (r, hits) => { if (self.placed) ray(r, hits); };
    this.plug.add(plugPick);
    m.g.add(this.cord, this.plug);
    for (const o of [this.plug, plugPick]) o.userData.door = this.plugTarget;
    this.buildCord();
    this.setTargets();
    this.goHome();
  }

  /** At home with its drawer shut: not to be taken. */
  get shut() { return !this.held && !this.placed && !!this.drawer && !this.drawer.isOpen; }

  /** Where the cord leaves its back (world). */
  cordStart(out = new THREE.Vector3()) { return this.model.localToWorld(out.set(T.w / 2 - 0.07, 0.022, T.d / 2)); }
  /** The socket's mouth on the power box (world): its north face, 2.5 cm over the worktop. */
  socket(out = new THREE.Vector3()) { return out.set(T.socket.x, KITCHEN.baseTop + KITCHEN.worktop + 0.025, T.socket.z); }
  /** Standing out with the socket within the cord's reach. */
  inReach() {
    if (!this.placed) return false;
    this.model.updateMatrixWorld(true);
    return this.cordStart().distanceTo(this.socket()) <= T.cord;
  }

  /** The lever and the front are the toasting target while it stands out; else they take it like the rest of the body. */
  setTargets() {
    const t = this.placed ? this.leverTarget : this.takeTarget;
    for (const o of [this.parts.lever, this.parts.label]) o.userData.door = t;
  }

  /** The cord: plugged in, a soft curve from its back along the worktop to the socket; else a loose loop behind it. */
  buildCord() {
    const { w, d } = T, L = (x, y, z) => new THREE.Vector3(x, y, z);
    let pts, plugPos, plugQ = new THREE.Quaternion();
    if (this.plugged && this.placed) {
      this.model.updateMatrixWorld(true);
      const s = this.socket(), y = s.y - 0.025 + 0.005, a = this.cordStart(), back = L(0, 0, 1).applyQuaternion(this.model.quaternion);
      const foot = L(s.x, y, s.z - 0.09), p1 = a.clone().addScaledVector(back, 0.05).setY(y);
      const mid = p1.clone().lerp(foot, 0.5), side = L(-(foot.z - p1.z), 0, foot.x - p1.x).normalize().multiplyScalar(0.04); // a little slack
      const world = [a, a.clone().addScaledVector(back, 0.025).setY(y + 0.008), p1, mid.add(side), foot, L(s.x, y + 0.012, s.z - 0.055), L(s.x, s.y, s.z - 0.04)];
      pts = world.map((p) => this.model.worldToLocal(p));
      plugPos = this.model.worldToLocal(L(s.x, s.y, s.z - 0.02));
      plugQ.copy(this.model.quaternion).invert(); // square to the walls
    } else {
      // round the back to its left end (seen from the front), the plug lying beside it where you see it
      pts = [L(w / 2 - 0.07, 0.022, d / 2), L(w / 2 - 0.06, 0.006, d / 2 + 0.03), L(w / 2 + 0.02, 0.006, d / 2 + 0.035), L(w / 2 + 0.045, 0.006, d / 2 - 0.03), L(w / 2 + 0.05, 0.008, 0.02)];
      plugPos = L(w / 2 + 0.05, 0.013, -0.005);
      plugQ.setFromAxisAngle(L(0, 1, 0), 0.25);
    }
    this.cord.geometry.dispose();
    this.cord.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0032, 6);
    this.plug.position.copy(plugPos);
    this.plug.quaternion.copy(plugQ);
  }

  setPlugged(on, quiet = false) {
    on = !!on && this.placed && (this.plugged || this.inReach());
    if (on === this.plugged) return;
    if (!on) this.stopToast(false);
    this.plugged = on;
    this.buildCord();
    if (!quiet) sfx.click(this.socket());
  }

  /** E on the lever / the front: down it goes (plugged in), or STOP pops it early. */
  press() {
    if (this.toasting) { this.stopToast(true); return; }
    if (!this.plugged || !this.placed) return;
    this.toasting = true;
    this.left = T.seconds.base + T.seconds.step * T.dial;
    const p = this.where();
    sfx.toasterDown(p);
    this.hum?.stop(); this.hum = sfx.toasterHum(p);
    this.onToast?.();
  }

  /** The lever comes up: with a pop and a pling when it is done (or stopped), silently when unplugged / sent home. */
  stopToast(pop) {
    if (!this.toasting) return;
    this.toasting = false; this.left = 0;
    this.hum?.stop(); this.hum = null;
    if (pop) { sfx.toasterPop(this.where()); this.onPop?.(); }
  }

  goHome() {
    this.placed = false;
    if (!this.drawer) return; // (called by the base constructor before the drawer is known)
    this.stopToast(false);
    this.plugged = false;
    this.leverT = 0; this.glow = 0; this.parts.glowMat.opacity = 0; this.parts.lever.position.y = this.parts.up;
    this.drawer.object.add(this.model);
    this.model.position.copy(this.home.pos);
    this.model.rotation.copy(this.home.rot);
    this.buildCord();
    this.setTargets();
  }

  take() {
    if (handBusy(this)) return;
    if (this.plugged) { this.setPlugged(false, true); sfx.click(this.socket()); }
    this.stopToast(false);
    super.take();
    this.buildCord();
    this.setTargets();
  }

  putBack() { super.putBack(); this.setTargets(); }

  /** Down standing upright, its front towards you (square to the room's axes). */
  placeAt(p) {
    if (!this.held) return;
    super.placeAt(p);
    const c = this.camera.getWorldPosition(new THREE.Vector3());
    const yaw = Math.round(Math.atan2(-(c.x - p.x), -(c.z - p.z)) / (Math.PI / 2)) * (Math.PI / 2);
    this.model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.model.position.set(p.x, p.y + 0.0005, p.z);
    this.model.updateMatrixWorld(true);
    this.buildCord();
    this.setTargets();
    sfx.cupboard(p, false);
  }

  /** keep.js (#277): plugged in or not (where it stands is the `things` part's). */
  keepState() { return this.plugged ? { plug: 1 } : null; }
  loadKeep(s) { this.setTargets(); if (s?.plug) this.setPlugged(true, true); }

  update(dt) {
    this.drawer.object.getWorldPosition(this.holder.position); // the pick box of its place follows the drawer
    super.update(dt);
    if (this.toasting) {
      this.left -= dt;
      if (this.left <= 0) this.stopToast(true);
    }
    // the lever: down quickly, up with a snap; the slots glow up slowly as it heats and fade when it stops
    const goal = this.toasting ? 1 : 0;
    if (this.leverT !== goal) {
      this.leverT += Math.sign(goal - this.leverT) * Math.min(Math.abs(goal - this.leverT), dt / (goal ? 0.18 : 0.07));
      this.parts.lever.position.y = THREE.MathUtils.lerp(this.parts.up, this.parts.down, this.leverT);
    }
    if (this.glow !== goal) {
      this.glow += Math.sign(goal - this.glow) * Math.min(Math.abs(goal - this.glow), dt * (goal ? 0.4 : 0.6));
      this.parts.glowMat.opacity = 0.85 * this.glow;
    }
  }
}
