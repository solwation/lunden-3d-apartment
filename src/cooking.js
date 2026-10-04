import { LIFE, LIFE_TOOLS } from './config.js';
import { sfx } from './audio.js';

// The life simulator's kitchen work (epic #364, milestone M1): what the tools do to the food — one action definition per
// step (actions.js), judged by the tags of what is in the hand and what is looked at (ITEMS / LIFE_TOOLS.uses in config), so
// a new tool or food is a definition, not a special case.
//   #374 the right tool: a tool's tags decide what it can do; the wrong one says so ("Osthyveln skär inte gurka") and
//        nothing is used
//   #375 the cutting board as a station: it must lie on a worktop before anything is cut on it; what is cut lies on its
//        spot 0, the result goes onto its free spots (none free: "Brädan är full", nothing used); held, it carries all of
//        it, and E on a plate pushes the slices over
//   #376 cutting a cucumber: one slice or three, a chop each, exact grams; the last bit is the end (a scrap)
//   #377 the bread bag: opened (its clip off), "Ta en brödskiva" one at a time into the hand, empty = an empty package;
//        a slice is eaten in bites (a click / "Ät" with it in the hand)

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Add the kitchen's actions to `life` (life.js calls this once). */
export function cookingActions(life) {
  const A = life.actions, I = life.items, nm = (it) => I.name(it), noun = (it) => I.def(it)?.noun ?? nm(it);
  const isTool = (it) => !!it && I.has(it, 'tool');
  /** The uses (LIFE_TOOLS.uses) that apply to a food: what could be done to it with some tool. */
  const usesFor = (food) => LIFE_TOOLS.uses.filter((u) => I.has(food, u.target));

  /** The board a thing lies on (directly), or null. */
  const boardUnder = (it) => { const p = it?.place; const b = p?.at === 'on' ? I.get(p.parent) : null; return b && I.has(b, 'station') ? b : null; };
  /** Why the board is no station now (#375): it must lie on a kitchen worktop. */
  const stationReason = (board) => (board.place.at === 'world' && life.worktopAt(board.place.pos) ? null : 'Lägg skärbrädan på arbetsbänken först');
  /** What a cutting action works on: the food looked at, or the board's spot-0 food when the board is looked at. */
  const workpiece = (c) => (c.target && I.has(c.target, 'station') ? I.children(c.target).find((k) => k.place.slot === 0) ?? null : c.target);
  const resultSpot = (board, type, by) => I.freeSpot(board, { type }, by);

  // cutting (#375 the station's rules; #376 the slices): the kitchen knife in the hand, a cuttable thing on the board;
  // "Skär en skiva" / "Skär tre skivor". Each cut takes exactly `cut.g` off and makes one slice of exactly that much (the
  // mass balance); the last `cut.end` g are the end — no slice from it, a scrap for the bin (#381). The knife chops down
  // once per slice (animate), a chop sound each time; a double press starts one job (the Runner).
  const order = (board) => I.def(board).carrier.order ?? [...Array(I.def(board).carrier.slots).keys()];
  const cutsLeft = (food) => { const cut = I.def(food).cut; return Math.max(0, Math.floor((food.amount - (cut.end ?? 0) + 1e-6) / cut.g)); };
  const spotsFor = (board, type, n = Infinity, by = null) => { const out = []; for (const k of order(board)) { if (out.length >= n) break; if (!I.check({ type }, { at: 'on', parent: board.id, slot: k }, { by })) out.push(k); } return out; };
  const cutAction = (n, id, label, rank) => A.define({
    id, order: rank, duration: LIFE.cut.seconds * n, label,
    applies: (c) => !!c.held && I.has(c.held, 'tool:cut') && !!I.def(workpiece(c))?.cut,
    check: (c, opts = {}) => {
      const food = workpiece(c), cut = I.def(food).cut, board = boardUnder(food);
      if (!board) return `Lägg ${nm(food)} på skärbrädan först`;
      const st = stationReason(board);
      if (st) return st;
      const left = cutsLeft(food);
      if (left === 0) return food.amount > 0 ? `Bara ${nm(food)} är kvar – släng den` : `${cap(nm(food))} är slut`;
      if (left < n) return `Det räcker bara till ${left === 1 ? 'en skiva' : `${left} skivor`}`;
      const free = spotsFor(board, cut.into, n, opts.job?.id).length;
      if (free === 0) return I.def(board).carrier.fullText ?? 'Brädan är full';
      if (free < n) return `Brädan rymmer bara ${free === 1 ? 'en skiva' : `${free} skivor`} till`;
      return null;
    },
    reserve: (c) => {
      const food = workpiece(c), board = boardUnder(food);
      return { inputs: [food, board], outputs: spotsFor(board, I.def(food).cut.into, n).map((slot) => ({ at: 'on', parent: board.id, slot })) };
    },
    animate: (c, k, job) => { // the knife chops down n times, a chop sound as it meets the board
      const v = c.heldView, base = (job.base ??= v.model.position.y), ph = Math.min(n - 1e-6, k * n), f = ph - Math.floor(ph);
      v.model.position.y = base - 0.07 * Math.sin(Math.PI * Math.min(1, f * 1.15));
      const chops = Math.min(n, Math.floor(k * n + 0.55));
      while ((job.chops ?? 0) < chops) { job.chops = (job.chops ?? 0) + 1; sfx.chop(c.targetView?.where() ?? v.where()); }
    },
    commit: (c, job) => {
      const food = workpiece(c), cut = I.def(food).cut, made = [];
      for (const place of job.outputs) {
        const got = I.consume(food, cut.g); // (the check made sure there is at least cut.g + end per slice)
        made.push(I.create(cut.into, place, { amount: got }));
      }
      if (food.prep === 'whole') I.set(food, { prep: 'sliced' });
      life.bump(cut.stat ?? 'slices', made.length);
      return made;
    },
    done: (c, job) => { if (job.base !== undefined && c.heldView.held) c.heldView.model.position.y = job.base; }, // (put away meanwhile: its slot placed it)
    cancel: (c, job) => { if (job.base !== undefined && c.heldView.held) c.heldView.model.position.y = job.base; },
    consumes: `the food's cut.g (g) × ${n}`, result: `exactly ${n} slice(s) of cut.g on free spots of the board`,
  });
  cutAction(1, 'cut', 'skära en skiva', 1);
  cutAction(3, 'cut3', 'skära tre skivor', 1.5);
  /** Is it the end of something cut (#376): too little left for a slice — a scrap for the bin. */
  life.isEnd = (it) => !!I.def(it)?.cut && it.amount > 0 && cutsLeft(it) === 0;
  I.namers.cucumber = (it) => (life.isEnd(it) ? 'gurkänden' : null);

  // the board in the hand, E on a plate: the slices onto the plate's free spots (#375)
  A.define({
    id: 'pushSlices', order: 2,
    label: (c) => `skjuta över skivorna på ${nm(c.target)}`,
    applies: (c) => !!c.held && I.has(c.held, 'station') && !!c.target && !!I.def(c.target)?.carrier && c.target !== c.held && !I.has(c.target, 'station'),
    check: (c) => {
      const slices = I.children(c.held).filter((k) => k.place.slot > 0);
      if (!slices.length) return 'Det finns inga skivor på brädan';
      return I.freeSpot(c.target, slices[0]) >= 0 ? null : I.def(c.target).carrier.fullText ?? `${cap(nm(c.target))} är full`;
    },
    run: (c) => {
      for (const k of I.children(c.held).filter((x) => x.place.slot > 0)) {
        const spot = I.freeSpot(c.target, k);
        if (spot < 0) break; // (what does not fit stays on the board)
        I.move(k, { at: 'on', parent: c.target.id, slot: spot });
      }
      sfx.click(c.targetView?.where());
    },
    consumes: 'nothing', result: 'the board\'s slices on the plate (as many as fit; the rest stay on the board)',
  });

  // one out of a package into the free hand (#377): a slice of bread out of the bag; the bag empty = an empty package
  A.define({
    id: 'dispense', order: 3, duration: LIFE.dispense.seconds,
    label: (c) => I.def(c.target).dispenseLabel ?? `ta ${I.name({ type: I.def(c.target).dispense })}`,
    applies: (c) => !!I.def(c.target)?.dispense && c.target.place.at !== 'hand',
    check: (c) => {
      if (c.heldView) return `Lägg ifrån dig ${c.heldView.name ?? 'det du håller'} först`;
      const shut = c.targetView?.shutReason();
      if (shut) return shut;
      if (c.target.pkg === 'closed') return `Öppna ${nm(c.target)} först`;
      if (c.target.amount < 1 - 1e-6) return `${cap(nm(c.target))} är tom`;
      return null;
    },
    reserve: (c) => ({ inputs: [c.target] }),
    commit: (c) => {
      I.consume(c.target, 1);
      const got = I.create(I.def(c.target).dispense, { at: 'hand' });
      if (I.isEmpty(c.target)) I.set(c.target, { pkg: 'empty' });
      sfx.rustle?.(c.targetView?.where());
      return got;
    },
    consumes: 'one (count) out of the package', result: 'one new thing of its `dispense` type in the hand; an empty package stays (pkg empty)',
  });

  // a bite (#377; the sandwich's in #380): the thing in the hand to the mouth, a bite off half-way, the last one eats it up
  A.define({
    id: 'eat', order: 0, duration: LIFE.eat.seconds, commitAt: 0.5,
    label: 'äta',
    applies: (c) => !!c.target && c.target === c.held && !!I.def(c.target)?.bites,
    check: (c) => (c.target.amount > 1e-6 ? null : 'Det finns inget kvar'),
    reserve: (c) => ({ inputs: [c.target] }),
    animate: (c, k, job) => { // to the mouth and back
      const v = c.heldView;
      if (!v?.held) return;
      job.base ??= v.model.position.clone();
      const a = Math.sin(Math.PI * k);
      v.model.position.set(job.base.x - 0.12 * a, job.base.y + 0.13 * a, job.base.z + 0.2 * a);
    },
    commit: (c) => {
      const it = c.target, d = I.def(it), bite = d.amount / d.bites;
      const got = I.consume(it, bite);
      sfx.chew(c.heldView?.where(), 0.7);
      life.emit('bite', { item: it, amount: got });
      if (I.isEmpty(it)) { life.emit('ate', { item: it }); I.remove(it, { cascade: true }); }
      return got;
    },
    done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    consumes: 'one bite (amount / bites)', result: 'less of it; the last bite: gone (an `ate` event)',
  });

  // the wrong tool (#374): a tool in the hand, food that some other tool works on — a row that says why, nothing used
  A.define({
    id: 'wrongTool', order: 40,
    label: (c) => `${usesFor(c.target)[0].label} ${nm(c.target)}`,
    applies: (c) => isTool(c.held) && !!c.target && c.target !== c.held && usesFor(c.target).length > 0 && !usesFor(c.target).some((u) => I.has(c.held, u.tool)),
    check: (c) => `${cap(nm(c.held))} ${usesFor(c.target)[0].not} ${noun(c.target)}`,
    run: () => {},
    consumes: 'nothing', result: 'nothing: the reason is shown',
  });
}
