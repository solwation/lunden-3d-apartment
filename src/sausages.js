import * as THREE from 'three';
import { SAUSAGE as S, GRILL } from './config.js';
import { sfx } from './audio.js';

// #1124: grill sausages on the kettle grills (the courtyard's and L1007's patio kettle, #1121). Each grate is a life store
// (like the egg's frying pan, eggs.js): a raw sausage in the hand goes on a free spot, it grills only while that grill is lit
// (`machine.cook`, saved with the life sim's items), and is taken back off with E like any life item. The bun and eating
// are cooking.js's addTopping / eat.
export class Sausages {
  /** grills: [{ grill, id }] — a Grill (grill.js) and the stable store id of its grate. chickenOn(grill): the whole bird lies there. */
  constructor(life, grills, { chickenOn = () => false } = {}) {
    Object.assign(this, { life, grills: [], sizzle: 0 });
    const I = life.items;
    for (const { grill, id } of grills) {
      const q = (grill.kettleR ?? GRILL.kettle.r) / GRILL.kettle.r, top = grill.grateTop;
      const anchors = S.slots.map((dx) => {
        const a = new THREE.Object3D();
        a.position.set(top.x + dx * q, top.y + 0.004, top.z); a.rotation.y = Math.PI / 2; // across the bars (they run along x)
        grill.object.add(a); return a;
      });
      I.addStore({ id, name: grill.name, slots: anchors.map(() => ({ size: 's' })), accepts: ['sausage'], isOpen: () => true,
        fullText: `Det får inte plats fler korvar på ${grill.name}`, putLabel: (held) => `lägga ${I.name(held)} på ${grill.name}` });
      life.anchors.set(id, (slot) => anchors[slot] ?? null);
      I.store(id).refuse = (held) => held?.type !== 'sausage' ? 'Bara korv på grillgallret' : chickenOn(grill) ? 'Kycklingen tar upp grillen' : null;
      // a pick box on the grate, live only with a sausage in the hand (the sausages themselves are their own E targets)
      const R = (GRILL.kettle.r - 0.03) * q, pick = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.07, 2 * R), new THREE.MeshBasicMaterial());
      pick.visible = false; pick.position.set(top.x, top.y + 0.035, top.z);
      const ray = pick.raycast.bind(pick); pick.raycast = (r, hits) => { if (I.held()?.type === 'sausage') ray(r, hits); };
      grill.object.add(pick);
      const target = { kind: 'life', name: grill.name, store: id, pickable: pick };
      target.options = () => life.options(target); target.toggle = () => life.run(target); pick.userData.door = target;
      Object.defineProperties(target, { blocked: { get: () => !target.options().some((a) => !a.reason) }, blockedText: { get: () => target.options()[0]?.reason } });
      (life.storeTargets ??= []).push(target);
      const entry = { grill, id, target, sausages: () => I.all().filter((it) => it.place.at === 'slot' && it.place.store === id) };
      const was = grill.occupied; grill.occupied = () => !!was?.() || entry.sausages().length > 0; // the lid stays open over food
      this.grills.push(entry);
    }
    I.namers.sausage = (it) => (it.machine.cook ?? 0) >= S.burnAt ? 'den brända korven' : it.machine.cooked ? 'den grillade korven' : 'den råa korven';
    I.namers.hotdogBun = (it) => it.parts?.some((p) => p.type === 'sausage') ? 'varmkorven' : null;
  }

  /** Is there a sausage on this grill (the chicken waits for a free grate)? */
  on(grill) { return !!this.grills.find((g) => g.grill === grill)?.sausages().length; }

  update(dt) {
    const I = this.life.items;
    let sizzling = null;
    for (const g of this.grills) {
      if (!g.grill.on) continue;
      for (const it of g.sausages()) {
        const cook = Math.min(S.burnAt + S.seconds, (it.machine.cook ?? 0) + dt), cooked = cook >= S.seconds;
        if (cooked && !it.machine.cooked) this.life.emit('sausageGrilled', { item: it, surface: g.id });
        if (cook !== it.machine.cook) I.set(it, { machine: { cook, cooked } });
        sizzling = g.grill;
      }
    }
    if (sizzling && (this.sizzle -= dt) <= 0) { sfx.sizzle(sizzling.where()); this.sizzle = 0.9; }
  }
}
