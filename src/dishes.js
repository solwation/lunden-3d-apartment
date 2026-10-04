import { LIFE } from './config.js';
import { sfx } from './audio.js';
import { drinkName } from './drinks.js';

// The life simulator's drinks and dishes (epic #364, milestone M2): one action definition per step (actions.js), like the
// kitchen work in cooking.js.
//   #382 a drinking glass from the glass cabinet: filled with water at the running kitchen tap (one of the tap's rows, next to
//        turning it off and washing the hands), milk poured from the carton in the hand onto a glass standing out, drunk a sip
//        at a time ("Dricka", a click with it in the hand). Amounts in ml (ITEMS.glass.capacity); the fill stops at the brim
//        (a full glass says "Dricksglaset är fullt" — no spill, the deduction #288 stays with the old glasses and cups);
//        one drink at a time (water and milk are not mixed: "Häll ut … först"); drunk from, the glass is used. What is
//        left can be poured out at the tap. The carton (milk.js) loses what it pours and its empty one is a package.

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** A drink's definite form ("vattnet", "mjölken"). */
const the = (k) => ({ water: 'vattnet', milk: 'mjölken', wine: 'vinet', coffee: 'kaffet' })[k] ?? drinkName(k);

/** Add the drink and dish actions to `life` (life.js calls this once). */
export function dishActions(life) {
  const A = life.actions, I = life.items, nm = (it) => I.name(it);
  const isGlass = (it) => !!it && I.has(it, 'glass');
  const volume = (it) => I.def(it).capacity ?? 250;
  /** What the glass holds now, or null when it is empty. */
  const drinkIn = (it) => (it.amount > 0.5 ? it.machine?.drink ?? null : null);
  const isBasinTap = (t) => t?.kind === 'tap' && !t.spec?.shower;
  const level = (c, kind, ml) => c.heldView?.view?.level?.(kind, ml) ?? c.targetView?.view?.level?.(kind, ml);
  const restore = (v, job) => { if (job.base && v?.held) { v.model.position.copy(job.base); v.model.rotation.copy(v.heldPose.rot); } v?.refresh(); };

  // water from the running tap into the glass in the hand: up to the brim, never more
  A.define({
    id: 'fillWater', order: 0, duration: LIFE.drink.fill,
    label: (c) => `fylla ${nm(c.held)} med vatten`,
    applies: (c) => isGlass(c.held) && isBasinTap(c.raw),
    quiet: (c) => !c.raw.isOpen,
    check: (c) => {
      if (!c.raw.isOpen) return 'Sätt på kranen först';
      const k = drinkIn(c.held);
      if (k && k !== 'water') return `Häll ut ${the(k)} först`;
      if (c.held.amount >= volume(c.held) - 0.5) return `${cap(nm(c.held))} är fullt`;
      return null;
    },
    reserve: (c) => ({ inputs: [c.held] }),
    animate: (c, k, job) => { // the glass down into the stream, the level rising
      const v = c.heldView;
      if (!v?.held) return;
      job.base ??= v.model.position.clone();
      job.from ??= c.held.amount;
      if (!job.sound) { job.sound = true; sfx.pour(v.where(), job.duration); }
      v.model.position.y = job.base.y - 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.3));
      level(c, 'water', job.from + (volume(c.held) - job.from) * k);
    },
    commit: (c) => {
      const it = c.held, before = it.amount;
      I.set(it, { machine: { drink: 'water' } });
      I.setAmount(it, volume(it));
      life.emit('filled', { item: it, drink: 'water', ml: volume(it) - before });
      return volume(it) - before;
    },
    done: (c, job) => restore(c.heldView, job),
    cancel: (c, job) => restore(c.heldView, job),
    consumes: 'nothing (tap water)', result: 'the glass full of water (capacity ml, machine.drink water)',
  });

  // what is left in the glass poured out at the tap (the sink under it)
  A.define({
    id: 'pourOut', order: 2, duration: LIFE.drink.pour * 0.6,
    label: (c) => `hälla ut ${the(drinkIn(c.held))}`,
    applies: (c) => isGlass(c.held) && isBasinTap(c.raw) && !!drinkIn(c.held),
    reserve: (c) => ({ inputs: [c.held] }),
    animate: (c, k, job) => {
      const v = c.heldView;
      if (!v?.held) return;
      job.base ??= v.model.position.clone();
      if (!job.sound) { job.sound = true; sfx.pour(v.where(), job.duration); }
      v.model.rotation.z = v.heldPose.rot.z + 1.6 * Math.sin(Math.PI * k);
    },
    commit: (c) => { const kind = drinkIn(c.held), ml = c.held.amount; I.set(c.held, { machine: { drink: null } }); I.setAmount(c.held, 0); life.emit('pouredOut', { item: c.held, drink: kind, ml }); return ml; },
    done: (c, job) => restore(c.heldView, job),
    cancel: (c, job) => restore(c.heldView, job),
    consumes: 'the drink in the glass', result: 'an empty glass',
  });

  // something that pours (the milk carton) in the hand onto a glass standing out
  const source = (c) => c.heldView;
  A.define({
    id: 'pourIn', order: 0, duration: LIFE.drink.pour,
    label: (c) => `hälla ${drinkName(source(c).drink ?? source(c).drinkKind)} i ${nm(c.target)}`,
    applies: (c) => !c.held && isGlass(c.target) && c.target.place.at !== 'hand' && !!(source(c)?.drink || source(c)?.drinkKind),
    check: (c) => {
      const s = source(c), kind = s.drink, d = I.def(c.target);
      if (!kind) return s.emptyText ?? `${cap(s.name)} är tom`;
      if (!d.drinks?.includes(kind)) return `Bara ${d.drinks.map(drinkName).join(' eller ')} i ${nm(c.target)}`;
      const k = drinkIn(c.target);
      if (k && k !== kind) return `Häll ut ${the(k)} först`;
      if (c.target.amount >= volume(c.target) - 0.5) return `${cap(nm(c.target))} är fullt`;
      return c.targetView?.shutReason() ?? null;
    },
    reserve: (c) => ({ inputs: [c.target] }),
    animate: (c, k, job) => {
      const s = source(c), t = c.target;
      job.from ??= t.amount;
      job.got ??= Math.min(LIFE.drink.pourMl, volume(t) - t.amount, s.ml ?? Infinity);
      if (!job.sound) { job.sound = true; s.pour?.(job.duration); sfx.pour(c.targetView?.where() ?? s.where(), job.duration); } // (it tips; what it loses is taken at the commit)
      c.targetView?.view?.level?.(s.drink, job.from + job.got * k);
    },
    commit: (c, job) => {
      const s = source(c), t = c.target, kind = s.drink;
      const got = Math.min(job.got ?? LIFE.drink.pourMl, volume(t) - t.amount, s.ml ?? Infinity);
      s.drain?.(got);
      I.set(t, { machine: { drink: kind } });
      I.add(t, got);
      life.emit('filled', { item: t, drink: kind, ml: got });
      return got;
    },
    cancel: (c) => c.targetView?.refresh(),
    consumes: 'LIFE.drink.pourMl ml of the source (what is left, if less; never over the brim)', result: 'that much more in the glass',
  });

  // a sip from the glass in the hand (a click / "Dricka")
  A.define({
    id: 'drink', order: 0, duration: LIFE.drink.seconds, commitAt: 0.5,
    label: 'dricka',
    applies: (c) => isGlass(c.target) && c.target === c.held,
    check: (c) => (drinkIn(c.target) ? null : `${cap(nm(c.target))} är tomt`),
    reserve: (c) => ({ inputs: [c.target] }),
    animate: (c, k, job) => { // up to the mouth, tipped, down again
      const v = c.heldView;
      if (!v?.held) return;
      job.base ??= v.model.position.clone();
      const a = Math.sin(Math.PI * k);
      v.model.position.set(job.base.x - 0.12 * a, job.base.y + 0.13 * a, job.base.z + 0.16 * a);
      v.model.rotation.x = v.heldPose.rot.x + 1.1 * a;
    },
    commit: (c) => {
      const it = c.target, kind = drinkIn(it);
      const got = I.consume(it, LIFE.drink.sip);
      if (it.amount < 0.5) { I.setAmount(it, 0); I.set(it, { machine: { drink: null } }); }
      if (it.clean === 'clean') I.set(it, { clean: 'used' });
      sfx.gulp(c.heldView?.where());
      life.bump(kind, 1);
      life.emit('drank', { item: it, drink: kind, ml: got });
      return got;
    },
    done: (c, job) => restore(c.heldView, job),
    cancel: (c, job) => restore(c.heldView, job),
    consumes: 'LIFE.drink.sip ml (what is left, if less)', result: 'less in the glass; the glass used',
  });
}
