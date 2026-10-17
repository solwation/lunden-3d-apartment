import * as THREE from 'three';
import { MICROWAVE as M } from './config.js';
import { sfx } from './audio.js';

// #1210: warming food in the microwave (ovens.js builds the cabinet, its door `mikron` and the geometry in `door.cav`).
//  - The turntable is a life store, 'microwave', one slot: a plate (with whatever lies on it, so `carriers`) put in with the
//    door open, like any life store; taking it out is E on the plate.
//  - The panel is the E target: start (the door shut, "Stäng luckan först"; no mains: "Strömmen är borta") / stop. The time
//    button beside the display cycles MICROWAVE.presets (display seconds, one real second runs `clock` of them).
//  - Running: a hum, the lamp on, the plate turns, the display counts down; at 0:00 a ding. Opening the door pauses it.
//  - Every heatable thing on the plate (ITEMS `heat`; raw food that still needs cooking is skipped) gathers `machine.heat`
//    (display seconds) while it runs: "varm" at `warm` (`machine.warm`), "het" at `hot` (`machine.hot`), "bränd" at `burn`
//    (`machine.burnt`; `cookBurn` also gives the existing grilled/fried look its burnt state). Saved with the items.
// Events (life.emit): 'microwaveStarted', 'microwaved' {item, state: 'warm' | 'hot' | 'burnt'}.
export class Microwave {
  constructor(life, door) {
    const cav = door.cav, I = life.items;
    Object.assign(this, { life, door, cav, running: false, left: 0, preset: 1, done: false, hum: null, spin: 0, shown: '' });
    this.kind = 'microwave';
    // the plate's spot (a child of the parts group: it follows wherever the kitchen is)
    this.anchor = new THREE.Object3D(); this.anchor.position.set(cav.x, cav.y, cav.z);
    this.turntable = new THREE.Group(); this.turntable.position.set(cav.x, cav.y, cav.z); // a plate's anchor turns with the glass tray
    this.turntable.add(this.anchor); this.anchor.position.set(0, 0, 0);
    cav.parts.add(this.turntable);
    I.addStore({ id: 'microwave', name: 'mikron', slots: [{ size: 'm' }], accepts: ['plate'], carriers: true, isOpen: () => door.isOpen,
      shutText: 'Öppna mikron först', fullText: 'Det står redan en tallrik i mikron', putLabel: (held) => `ställa ${I.name(held)} i mikron` });
    life.anchors.set('microwave', () => this.anchor);
    I.store('microwave').refuse = (held) => held?.type !== 'plate' ? 'Lägg maten på en tallrik först' : this.running ? 'Mikron är igång' : null;
    // a pick box over the turntable, live only with a plate in the hand and the door open (the plate itself is its own E target)
    const pick = new THREE.Mesh(new THREE.BoxGeometry(cav.d, cav.h, cav.w), new THREE.MeshBasicMaterial());
    pick.visible = false; pick.position.set(cav.x, cav.y + cav.h / 2 - 0.02, cav.z);
    const ray = pick.raycast.bind(pick);
    pick.raycast = (r, hits) => { if (door.isOpen && I.held()?.type === 'plate') ray(r, hits); };
    cav.parts.add(pick);
    const target = { kind: 'life', name: 'mikron', store: 'microwave', pickable: pick };
    target.options = () => life.options(target); target.toggle = () => life.run(target); pick.userData.door = target;
    Object.defineProperties(target, { blocked: { get: () => !target.options().some((a) => !a.reason) }, blockedText: { get: () => target.options()[0]?.reason } });
    (life.storeTargets ??= []).push(target);
    this.storeTarget = target;
    // the panel: start / stop; the time button: cycle the preset
    const self = this;
    this.panelTarget = { kind: 'microwave', id: 'microwave', pickable: cav.panel, toggle: () => this.press(), name: 'mikron',
      get verb() { return self.running ? 'stänga av' : 'starta'; }, get isOpen() { return self.running; },
      get blocked() { return !!self.why(); }, get blockedText() { return self.why(); } };
    this.panelTarget.update = () => {}; // (it lives in world.lids: every entry is updated)
    cav.panel.userData.door = this.panelTarget;
    this.timeTarget = { kind: 'microwave', id: 'microwave-time', pickable: cav.timeBtn, toggle: () => this.cycle(), name: 'mikrons tid',
      get verb() { return `ställa tiden (${self.seconds} s)`; }, get isOpen() { return false; },
      get blocked() { return self.running; }, blockedText: 'Stoppa mikron först' };
    this.timeTarget.update = () => {};
    cav.timeBtn.userData.door = this.timeTarget;
    this.targets = [this.panelTarget, this.timeTarget];
    this.draw();
  }

  get seconds() { return M.presets[this.preset]; }
  get plate() { return this.life.items.occupant({ at: 'slot', store: 'microwave', slot: 0 }); }
  /** The things on the turntable that warm: the plate's food (and a bare heatable thing, should one ever be there). */
  heatables() {
    const I = this.life.items, p = this.plate;
    if (!p) return [];
    return [p, ...I.children(p)].filter((it) => { const d = I.def(it), h = d?.heat; return h && (!d.needsCooking || it.machine.cooked || (d.unwrap && it.pkg === 'open')); }); // a frozen meal heats once unwrapped (#1209)
  }
  /** Why it cannot start now, else null. */
  why() {
    if (this.running) return null;
    if (this.door.isOpen) return 'Stäng luckan först';
    if (this.door.powered === false) return 'Strömmen är borta';
    if (!this.plate) return 'Ställ in en tallrik först';
    return null;
  }

  cycle() {
    if (this.running) return;
    this.preset = (this.preset + 1) % M.presets.length;
    sfx.click(this.door.door.getWorldPosition(new THREE.Vector3()));
    this.draw();
  }

  press() {
    const pos = this.door.door.getWorldPosition(new THREE.Vector3());
    if (this.running) { this.stop(); sfx.click(pos); return; }
    if (this.why()) return;
    sfx.click(pos);
    this.running = true; this.done = false; this.left = this.seconds / M.clock;
    this.life.emit('microwaveStarted', { seconds: this.seconds });
  }

  stop() { this.running = false; this.hum?.stop(); this.hum = null; this.draw(); }

  /** F / a fresh start: off. The plate stays where it is. */
  reset() { this.stop(); this.done = false; this.left = 0; this.draw(); }

  draw() {
    const secs = Math.ceil(this.running ? this.left * M.clock : this.seconds);
    const text = this.running || !this.done ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'End';
    const lit = this.door.powered !== false;
    const key = `${text}|${lit}|${this.running}`;
    if (key === this.shown && this.cav.screenTex.version) return;
    this.shown = key;
    const c = this.cav.screen.getContext('2d');
    c.fillStyle = '#050606'; c.fillRect(0, 0, 128, 48);
    if (lit) { c.fillStyle = this.running ? '#7dff9a' : '#4fd0ff'; c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 64, 26); }
    this.cav.screenTex.needsUpdate = true;
  }

  heatOne(it, dt) {
    const I = this.life.items, h = I.def(it).heat, was = it.machine.heat ?? 0;
    const heat = Math.min(h.burn + 30, was + dt * M.clock);
    const fields = { heat, warm: heat >= h.warm || null, hot: heat >= h.hot || null, burnt: heat >= h.burn || null };
    if (I.def(it).unwrap && heat >= h.warm) fields.cooked = true; // thawed and hot: eatable (cooking.js names it "den varma …")
    if (heat >= h.burn && h.cookBurn) fields.cook = Math.max(it.machine.cook ?? 0, h.cookBurn);
    I.set(it, { machine: fields });
    for (const [k, state] of [['warm', 'warm'], ['hot', 'hot'], ['burn', 'burnt']]) if (was < h[k] && heat >= h[k]) this.life.emit('microwaved', { item: it, state });
  }

  update(dt) {
    const pos = this.door.door.getWorldPosition(new THREE.Vector3());
    const live = this.running && !this.door.isOpen && this.door.t < 0.02 && this.door.powered !== false;
    if (this.running && this.door.powered === false) this.stop();
    if (live) {
      if (!this.hum) this.hum = sfx.microHum(pos);
      this.left = Math.max(0, this.left - dt);
      for (const it of this.heatables()) this.heatOne(it, dt);
      this.spin += dt * 1.2; this.turntable.rotation.y = this.spin;
      if (this.left <= 0) { this.stop(); this.done = true; sfx.microDing(pos, M.beeps); this.life.emit('microwaveDone', {}); }
    } else if (this.hum) { this.hum.stop(); this.hum = null; } // paused with the door open
    if (this.running || this.done) this.draw();
    if (this.door.isOpen && this.done) { this.done = false; this.draw(); }
  }
}

/** Register the warm / hot / burnt wording for the heatable item types with the life sim's namers (life.items.namers). */
export function nameHeated(life) {
  const I = life.items;
  for (const type of Object.keys(I.defs ?? {})) {
    if (!I.defs[type].heat) continue;
    const prev = I.namers[type];
    I.namers[type] = (it) => {
      const base = prev?.(it) ?? null;
      if (!(it.machine.warm || it.machine.hot || it.machine.burnt)) return base;
      if (I.defs[type].hotName && !it.machine.hot && !it.machine.burnt) return base; // "den varma pizzan" already says it
      const w = it.machine.burnt ? 'bränd' : it.machine.hot ? 'het' : 'varm';
      return `${base ?? I.defs[type].name} (${w})`;
    };
  }
}
