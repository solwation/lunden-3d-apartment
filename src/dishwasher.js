import * as THREE from 'three';
import { DISHWASHER as D } from './config.js';
import { Openable, pivotAround } from './openables.js';

// The dishwasher's racks (#384, LIFE-020): the integrated KEZA9310W (interior.js) gets two wire racks that roll out with E
// while its door is folded down — an Openable 'drawer' each, in world.lids — and a cutlery tray riding on the upper one.
// Each rack carries slots for the life sim (stores.js): the lower rack plates standing on edge, the upper one glasses upside
// down, the tray the knives and the cheese slicer lying along it. Only the door down lets a rack out, and the door does not
// fold up while a rack is out (their `blocked`). Numbers: DISHWASHER in config (our picks; no product drawing).

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Build the racks inside the machine. ctx: { F (interior.js frame), u0, u1, yb (the tub's bottom), door (its flap
 * Openable), open ({ group, list }), batch () → a Batch, onBatch, chrome (material), FT }. Returns the racks.
 */
export function buildRacks({ F, u0, u1, yb, yt, door, open, batch, onBatch, chrome, FT }) {
  const d0 = -F.depth + 0.05, d1 = -FT - 0.035, w = 0.003; // the racks' depth range (in front of the plane = 0); wire thickness
  const world = (u, d, y) => { const [x, z] = F.at(u, d); return new THREE.Vector3(x, y, z); };
  const out = new THREE.Vector3().subVectors(world(u0, 1, 0), world(u0, 0, 0)).normalize(); // the way the front faces
  const along = new THREE.Vector3().subVectors(world(u0 + 1, 0, 0), world(u0, 0, 0)).normalize(); // across the front (u)
  const a0 = u0 + 0.03, a1 = u1 - 0.03;
  const racks = [];
  const rack = (name, y, h, build) => {
    const OB = batch(), P = onBatch(F, OB);
    // a wire basket: the rim top and bottom, the corners, wires across the floor
    for (const yy of [y, y + h]) {
      P.box(a0, a1, d0, d0 + w, yy, yy + w, chrome); P.box(a0, a1, d1 - w, d1, yy, yy + w, chrome);
      P.box(a0, a0 + w, d0, d1, yy, yy + w, chrome); P.box(a1 - w, a1, d0, d1, yy, yy + w, chrome);
    }
    for (const [u, d] of [[a0, d0], [a1, d0], [a0, d1 - w], [a1 - w, d1 - w]]) P.box(u, u + w, d, d + w, y, y + h, chrome);
    for (let k = 1; k < 12; k++) { const u = a0 + (a1 - a0) * k / 12; P.box(u, u + w, d0, d1, y, y + w, chrome); }
    for (let k = 1; k < 8; k++) { const d = d0 + (d1 - d0) * k / 8; P.box(a0, a1, d, d + w, y, y + w, chrome); }
    const slots = build(P, y, h);
    const at = world((a0 + a1) / 2, 0, y);
    const o = new Openable({ name, object: pivotAround(OB.meshes(), at), mode: 'drawer', out: out.clone().multiplyScalar(D.out).toArray(), speed: 2 });
    o.normal = out.clone();
    o.stock = 'own'; // (the life sim's slots: no static contents)
    o.slots = slots;
    o.box = [world(a0, d0, y), world(a1, d1, y + h)].reduce((b, p) => b.expandByPoint(p), new THREE.Box3());
    // Invisible continuous basket volume: aim through a wire gap, not at a 3 mm wire (#503).
    // It follows the same pivot and stays inside the existing basket bounds; no rendered surface.
    const size = o.box.getSize(new THREE.Vector3()), mid = o.box.getCenter(new THREE.Vector3());
    const pick = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial());
    pick.visible = false; pick.position.copy(mid).sub(at); pick.userData.door = o;
    const raycast = pick.raycast.bind(pick), basketHits = [];
    pick.raycast = (ray, hits) => {
      // The closed door stays the target. Stores provide held-item/contents pass-through after life init.
      if (!door.isOpen) return;
      basketHits.length = 0; raycast(ray, basketHits);
      if (basketHits.length && !o.pickThrough?.(ray)) hits.push(...basketHits);
    };
    o.object.add(pick); o.pickSurface = pick;
    Object.defineProperties(o, {
      verb: { get: () => (o.isOpen ? 'skjuta in' : 'dra ut'), configurable: true },
      blocked: { get: () => !door.isOpen && !o.isOpen, configurable: true },
      blockedText: { get: () => 'Fäll ner luckan först', configurable: true },
    });
    o.door = door;
    open.group.add(o.object);
    open.list.push(o);
    racks.push(o);
    return o;
  };
  // a slot: its world pose (position + the turn of the thing in it), size, what it takes
  const slot = (p, q, size, accepts) => ({ pos: p, quat: q, size, accepts });
  // plates on edge: their face across the machine (the plate's axis along u), in a row along u
  const plateQ = new THREE.Quaternion().setFromUnitVectors(UP, along);
  const glassQ = new THREE.Quaternion().setFromAxisAngle(along, Math.PI); // upside down
  const toolQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), out.clone().negate()); // lying along the depth
  const dm = (d0 + d1) / 2;
  rack('underkorgen', yb + D.lower.y, D.lower.h, (P, y) => {
    const n = D.lower.plates, list = [];
    for (let k = 0; k < n; k++) {
      const u = a0 + 0.06 + (a1 - a0 - 0.12) * k / Math.max(1, n - 1);
      for (const dd of [dm - 0.11, dm + 0.11]) P.box(u - 0.016, u - 0.013, dd - 0.002, dd + 0.002, y, y + 0.07, chrome); // the tines between the plates
      list.push(slot(world(u, dm, y + 0.137), plateQ, 'm', ['plate']));
    }
    return list;
  });
  rack('överkorgen', yb + D.upper.y, D.upper.h, (P, y, h) => {
    const list = [];
    for (const dd of [dm - 0.1, dm + 0.1]) for (let k = 0; k < D.upper.glasses / 2; k++) {
      const u = a0 + 0.09 + (a1 - a0 - 0.18) * k / Math.max(1, D.upper.glasses / 2 - 1);
      list.push(slot(world(u, dd, y + 0.112), glassQ, 's', ['glass']));
    }
    // the cutlery tray on top of it (rides with it): a shallow wire tray, the tools lying front to back
    const ty = y + h + 0.02;
    for (let k = 0; k <= 10; k++) { const u = a0 + 0.02 + (a1 - a0 - 0.04) * k / 10; P.box(u, u + w, d0 + 0.02, d1 - 0.02, ty, ty + w, chrome); } // its floor: wires front to back
    for (const d of [d0 + 0.02, d1 - 0.02 - w]) P.box(a0 + 0.02, a1 - 0.02, d, d + w, ty, ty + w, chrome);
    for (const [ua, ub] of [[a0 + 0.02, a0 + 0.023], [a1 - 0.023, a1 - 0.02]]) P.box(ua, ub, d0 + 0.02, d1 - 0.02, ty, ty + 0.02, chrome);
    for (let k = 0; k < D.tray; k++) list.push(slot(world(a0 + 0.12 + k * 0.09, dm, ty + 0.004), toolQ, 's', ['tool']));
    return list;
  });
  // the door does not fold up over a rack that is out
  Object.defineProperties(door, {
    blocked: { get: () => door.isOpen && racks.some((r) => r.isOpen || r.t > 0.02), configurable: true },
    blockedText: { get: () => 'Skjut in korgarna först', configurable: true },
  });
  door.racks = racks;
  // where the programme's panel is (#385): the door's top band (world, door shut), its LED, the spot on the floor in front
  const um = (u0 + u1) / 2, span = new THREE.Vector3().subVectors(world(u1 - 0.03, 0, 0), world(u0 + 0.03, 0, 0));
  door.panelAt = { pos: world(um, 0.006, yt - 0.03), size: [Math.max(0.012, Math.abs(span.x)), 0.05, Math.max(0.012, Math.abs(span.z))],
    led: world(u1 - 0.06, 0.003, yt - 0.015), floor: world(um, 0.07, yb - D.plinth) };
  return racks;
}

// The programme (#385, LIFE-021): E on the panel on the door's top band starts a short game programme of DISHWASHER.seconds
// (game time, main.js step). States idle / running / paused / done: opening the door pauses it, shutting it carries on with
// the time left; running it hums and swishes (sfx.dishwasher) and a red spot glows on the floor in front of it ("time on
// floor"); done: a chime and "Disken är klar". Only what was in it at the start and is still in it becomes clean. While it
// runs or is paused nothing can be added (one rule: refused, "Diskmaskinen är igång"); taking something out mid-run leaves
// it dirty. The state and the time left are kept with the life sim (`life.keepPart('dishwasher')`). F stops it (nothing
// washed). Stats `dishwasher`. A power cut (#612, `mains(false)`): a running programme stands still (no hum, no spot, the LED
// dark) and carries on with the time left when the power is back; it cannot be started without power.

const STORES = ['dwLower', 'dwUpper', 'dwTray'];
const mmss = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export class DishProgramme {
  /** life: life.js Life; door: the dishwasher's flap (buildRacks gave it `racks`, `panelAt`); sfx: audio.js; say(text). */
  constructor(life, door, { sfx, say = () => {} } = {}) {
    Object.assign(this, { life, door, sfx, say, state: 'idle', left: 0, ids: [], sound: null, powered: true });
    const I = life.items, P = door.panelAt;
    // the panel: an invisible pick box over the door's top band (it rides with the door), a small LED on it, the floor spot
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...P.size), new THREE.MeshBasicMaterial());
    pick.visible = false;
    door.object.updateMatrixWorld(true);
    pick.position.copy(door.object.worldToLocal(P.pos.clone()));
    door.object.add(pick);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: 0x331111 }));
    this.led.position.copy(door.object.worldToLocal(P.led.clone()));
    this.led.raycast = () => {};
    door.object.add(this.led);
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spot.position.copy(P.floor); this.spot.visible = false; this.spot.raycast = () => {};
    door.object.parent.add(this.spot);
    const self = this;
    this.target = { name: 'diskmaskinen', kind: 'life', dishpanel: true, pickable: pick };
    this.target.options = () => life.options(this.target);
    this.target.toggle = () => life.run(this.target);
    Object.defineProperties(this.target, {
      blocked: { get: () => !self.target.options().some((a) => !a.reason) },
      blockedText: { get: () => self.target.options()[0]?.reason ?? null },
    });
    pick.userData.door = this.target;
    (life.storeTargets ??= []).push(this.target);
    // nothing goes in while it runs (or is paused)
    for (const id of STORES) {
      const st = I.store(id);
      if (!st) continue;
      const own = st.refuse;
      st.refuse = (it) => (self.busy ? 'Diskmaskinen är igång – vänta tills den är klar' : own?.(it) ?? null);
    }
    const dirtyInside = () => this.inside().filter((it) => it.clean && it.clean !== 'clean');
    life.actions.define({
      id: 'dwStart', order: 0,
      label: () => (self.state === 'done' ? 'starta diskmaskinen igen' : 'starta diskmaskinen'),
      applies: (c) => !!c.raw?.dishpanel && !self.busy,
      check: () => (!self.powered ? 'Strömmen är borta' : door.isOpen ? 'Stäng luckan först' : (dirtyInside().length + self.dirtyCupsInside().length) ? null : (self.inside().length + self.cupsInside().length) ? 'Allt i maskinen är redan rent' : 'Diskmaskinen är tom'),
      run: () => self.start(),
      consumes: 'nothing', result: 'a programme of DISHWASHER.seconds game s; what is in it now is clean at the end',
    });
    life.actions.define({
      id: 'dwStatus', order: 0,
      label: 'diskmaskinen',
      applies: (c) => !!c.raw?.dishpanel && self.busy,
      check: () => (!self.powered ? `Strömmen är borta – ${mmss(self.left)} kvar` : self.state === 'paused' ? `Pausad – stäng luckan (${mmss(self.left)} kvar)` : `Diskar – ${mmss(self.left)} kvar`),
      run: () => {},
      consumes: 'nothing', result: 'nothing: the time left is shown',
    });
    life.keepPart('dishwasher', { save: () => self.save(), load: (v) => self.load(v) });
  }

  get busy() { return this.state === 'running' || this.state === 'paused'; }
  get running() { return this.state === 'running'; }
  /** The life items in its racks. */
  inside() { return this.life.items.all().filter((it) => it.place.at === 'slot' && STORES.includes(it.place.store)); }
  /** The coffee cups in its upper rack. */
  cupsInside() { const st = this.life.items.store('dwUpper'); return st?.parkedCups ? [...st.parkedCups.values()] : []; }
  dirtyCupsInside() { return this.cupsInside().filter((c) => c.dirty); }

  /** The mains (#612): without power a running programme stands still; it goes on with the time left. */
  mains(on) { this.powered = on; this.sounds(); }

  start() {
    if (this.busy || this.door.isOpen || !this.powered) return false;
    this.ids = this.inside().map((it) => it.id);
    this.cupsAtStart = this.cupsInside().slice();
    this.left = D.seconds;
    this.state = 'running';
    this.sfx.click(this.where());
    this.life.dirty = true;
    this.sounds();
    return true;
  }

  where() { return this.spot.position.clone().setY(0.5); }

  finish() {
    const I = this.life.items, washed = [];
    for (const it of this.inside()) {
      if (!this.ids.includes(it.id)) continue; // (put in after the start: not washed)
      const m = {};
      for (const k of ['crumbs', 'load', 'loadType']) if (it.machine[k] !== undefined) m[k] = null;
      if (it.clean !== 'clean') washed.push(it.id);
      I.set(it, { clean: 'clean', machine: m });
    }
    for (const c of this.cupsInside()) {
      if (!this.cupsAtStart?.includes(c)) continue;
      if (c.dirty) {
        washed.push('cup');
        c.wash();
      }
    }
    this.state = 'done'; this.left = 0; this.ids = []; this.cupsAtStart = [];
    this.sfx.pling(this.where(), 0.8);
    this.say('Disken är klar');
    this.life.bump('dishwasher', 1);
    this.life.emit('dishwasher', { washed });
    this.life.dirty = true;
  }

  /** F: stopped, nothing washed. */
  cancel() { if (this.busy) { this.state = 'idle'; this.left = 0; this.ids = []; this.cupsAtStart = []; this.life.dirty = true; } this.sounds(); }

  sounds() {
    const on = this.state === 'running' && this.powered;
    if (on && !this.sound) this.sound = this.sfx.dishwasher?.(this.where()) ?? null;
    if (!on && this.sound) { this.sound.stop(); this.sound = null; }
    this.spot.visible = on;
    this.led.material.color.setHex(!this.powered ? 0x1a0a0a : on ? 0xff3322 : this.state === 'paused' ? 0xffaa22 : this.state === 'done' ? 0x33dd55 : 0x331111);
  }

  update(dt) {
    if (this.state === 'running' && this.door.isOpen) this.state = 'paused'; // the door opened: it waits
    else if (this.state === 'paused' && !this.door.isOpen && this.door.t === 0) this.state = 'running'; // shut again: on with the time left
    if (this.state === 'running' && this.powered) { this.left -= dt; if (this.left <= 0) this.finish(); } // (a power cut: it stands still, #612)
    this.sounds();
  }

  save() { return this.state === 'idle' ? null : { s: this.state, ...(this.busy ? { left: Math.round(this.left * 10) / 10, ids: this.ids } : {}) }; }
  load(v) {
    if (!v || typeof v !== 'object' || !['running', 'paused', 'done'].includes(v.s)) { this.state = 'idle'; this.left = 0; this.ids = []; this.cupsAtStart = []; this.sounds(); return; }
    this.state = v.s;
    this.left = Number.isFinite(v.left) ? Math.max(0, Math.min(D.seconds, v.left)) : 0;
    this.ids = Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : [];
    this.cupsAtStart = this.busy ? this.cupsInside().slice() : [];
    if (this.busy && this.left <= 0) this.left = 0.01;
    this.sounds();
  }
}
