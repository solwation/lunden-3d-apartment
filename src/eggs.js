import * as THREE from 'three';
import { EGG, LIFE } from './config.js';
import { sfx } from './audio.js';

// #484: one real item moves from the egg carton through the pan to the meal.
export class Eggs {
  constructor(life, pan) {
    Object.assign(this, { life, pan, sizzle: 0 });
    const I = life.items, place = { at: 'slot', store: 'fryingPan', slot: 0 };
    this.anchor = new THREE.Object3D(); this.anchor.position.y = .006; pan.model.add(this.anchor);
    I.addStore({ id: 'fryingPan', name: 'stekpannan', slots: [{ size: 's' }], accepts: ['friedEgg'], isOpen: () => true });
    life.anchors.set('fryingPan', () => this.anchor);
    Object.defineProperty(pan, 'egg', { get: () => I.occupant(place) });
    const pick = new THREE.Mesh(new THREE.BoxGeometry(.24, .06, .24), new THREE.MeshBasicMaterial()); pick.visible = false; pick.position.y = .035;
    const ray = pick.raycast.bind(pick); pick.raycast = (r, hits) => { if (pan.placed && ['rawEgg', 'friedEgg'].includes(I.held()?.type)) ray(r, hits); }; pan.model.add(pick);
    this.target = { kind: 'life', name: 'stekpannan', store: 'fryingPan', pickable: pick };
    this.target.options = () => life.options(this.target); this.target.toggle = () => life.run(this.target); pick.userData.door = this.target;
    Object.defineProperties(this.target, { blocked: { get: () => !this.target.options().some(a => !a.reason) }, blockedText: { get: () => this.target.options()[0]?.reason } });
    (life.storeTargets ??= []).push(this.target);
    // Returning cooked food to the cooking store uses the same validation as cracking.
    I.store('fryingPan').refuse = () => !pan.onHob ? 'Ställ stekpannan på hällen först' : pan.occupied?.() ? 'Stekpannan är upptagen' : null;
    life.actions.define({ id: 'crackEgg', order: 0, duration: EGG.crack,
      label: 'knäcka ägget i stekpannan', applies: c => c.held?.type === 'rawEgg' && c.raw.store === 'fryingPan',
      check: () => !pan.onHob ? 'Ställ stekpannan på hällen först' : pan.egg || pan.occupied?.() ? 'Stekpannan är upptagen' : LIFE.rules.washFirst && pan.dirty ? 'Diska stekpannan först' : null,
      reserve: c => ({ inputs: [c.held], outputs: [place] }),
      animate: (c, k, job) => { if (!c.heldView?.held) return; job.base ??= c.heldView.model.position.clone(); c.heldView.model.position.y = job.base.y + .035 * Math.sin(k * Math.PI * 4); },
      commit: c => { const egg = life.create('friedEgg', place); if (!egg) return false; I.remove(c.held); pan.setDirty(true); sfx.click(pan.where()); return egg; },
      done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
      cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
      consumes: 'one raw egg', result: 'one cracked egg in the pan; pan dirty',
    });
    I.namers.friedEgg = it => (it.machine.cook ?? 0) >= EGG.burnAt ? 'det brända ägget' : it.machine.cooked ? 'det stekta ägget' : 'det ostekta ägget';
    pan.eggs = this;
    life.keepPart('pan', { save: () => pan.saveState(), load: state => pan.loadState(state) });
  }
  update(dt) {
    const egg = this.pan.egg; if (!egg || !this.pan.onHob || !this.pan.hob?.on) return;
    const cook = Math.min(EGG.burnAt + EGG.seconds, (egg.machine.cook ?? 0) + dt), cooked = cook >= EGG.seconds;
    if (cook !== egg.machine.cook) this.life.items.set(egg, { machine: { cook, cooked } });
    if ((this.sizzle -= dt) <= 0) { sfx.sizzle(this.pan.where()); this.sizzle = .8; }
  }
}
