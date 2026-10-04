import { ITEMS } from './config.js';
import { sfx } from './audio.js';

// The life simulator's rubbish (epic #364, milestone M2), after the bin under the sink (#381, cooking.js 'throwAway'):
//   #386 three bins under the sink — Matavfall (the green one, a paper bag), Förpackningar (the small blue one), Restavfall
//        (the grey one) — game categories, not a claim about the property's real waste system. The prompt names the bin
//        ("slänga gurkänden i matavfallet"); the wrong one names the right one ("Gurkänden → Matavfall") and keeps the waste in
//        the hand (LIFE.rules.strictSorting; false = in it goes, with a note). A bin with something in it: "Knyta ihop påsen" —
//        a rubbish bag in the hand that carries the bin's amount and parts (moved, not copied), the bin empty and without a
//        bag; "Sätta i en ny påse" (from the roll in the same cabinet: no item of its own) before anything goes in again. A
//        saved single bin (LIFE-017) is split by items.js MIGRATIONS[1].

const BAG_NAMES = { food: 'matavfallspåsen', package: 'förpackningspåsen', rest: 'soppåsen' };

/** Add the rubbish actions to `life` (life.js calls this once). */
export function wasteActions(life) {
  const A = life.actions, I = life.items;
  const isBin = (it) => !!it && I.has(it, 'bin');
  /** The category a waste kind goes in ("Matavfall"). */
  life.binLabel = (kind) => Object.values(ITEMS).find((d) => d.tags?.includes('bin') && d.sort === kind)?.label ?? 'Restavfall';
  I.namers.rubbishBag = (it) => BAG_NAMES[it.machine?.sort] ?? null;

  A.define({
    id: 'tieBag', order: 0,
    label: 'knyta ihop påsen',
    applies: (c) => isBin(c.target) && !c.heldView && c.target.amount > 0 && !c.target.machine?.nobag,
    check: (c) => c.targetView?.shutReason() ?? null,
    run: (c) => {
      const bin = c.target, d = I.def(bin);
      const bag = life.create('rubbishBag', { at: 'hand' }, { amount: bin.amount, parts: bin.parts, machine: { sort: d.sort ?? 'rest' } });
      if (!bag) return;
      I.setAmount(bin, 0); // (what was in it is in the bag now: moved, never in both)
      I.set(bin, { parts: [], machine: { nobag: 1 } });
      sfx.rustle?.(c.targetView?.where());
      life.emit('tied', { bag: bag.id, sort: bag.machine.sort, amount: bag.amount });
    },
    consumes: 'the bin\'s contents', result: 'a rubbish bag in the hand with exactly that amount and parts; the bin empty, without a bag',
  });
  A.define({
    id: 'newBag', order: 1,
    label: 'sätta i en ny påse',
    applies: (c) => isBin(c.target) && !!c.target.machine?.nobag,
    check: (c) => (c.heldView ? `Lägg ifrån dig ${c.held ? I.name(c.held) : c.heldView.name ?? 'det du håller'} först` : c.targetView?.shutReason() ?? null),
    run: (c) => { I.set(c.target, { machine: { nobag: null } }); sfx.rustle?.(c.targetView?.where()); },
    consumes: 'nothing (a bag off the roll)', result: 'the bin has a bag again',
  });
}

