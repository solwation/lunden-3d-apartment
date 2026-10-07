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
//   #378 butter and cheese: the butter knife takes a dab from the open pack (−8 g, a yellow lump on the knife) and spreads
//        it on a slice of bread (a yellow layer, the bread's parts); the cheese slicer takes 12 g slices off the block on
//        the board or a worktop (the block shorter); the tools become used; the last bit of either is what is left
//   #379 a sandwich: a slice of bread with layers (its `parts`: butter, cheese, cucumber — any combination); a slice of
//        cheese / cucumber in the hand onto the bread leaves its own place exactly once; LIFE.sandwich.max layers; named
//        from what is on it ("ost- och gurkmackan"); it rides on a plate like anything else
//   #380 eating a sandwich: taken from a plate, four bites (its layers bitten too), the plate it came from gets crumbs
//        (clean 'used', a 'crumbs' event); the last bite: the 'ate' event (what, how much) and the points — once per
//        sandwich, the first of each combination a lot ("Du gjorde en macka!"); put back half eaten, it stays
//   #381 the bin under the sink: waste in the hand (an empty package, the cucumber's end, leftovers) goes in while its
//        front is open; it fills up visibly; full, the waste stays in the hand; a plate or a knife is never thrown

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
      for (const t of [c.held, boardUnder(food)]) if (t && t.clean !== 'dirty') I.set(t, { clean: 'dirty' }); // food on the knife and the board (#383)
      life.bump(cut.stat ?? 'slices', made.length);
      const bv = life.view(boardUnder(food));
      if (bv) life.emit('crumbs', { from: 'cut', item: food, pos: bv.where().toArray() }); // (bits beside the board, #388)
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
      if (c.targetView) life.emit('crumbs', { from: 'bag', item: c.target, pos: c.targetView.where().toArray() }); // (#388)
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
      const plate = I.get(it.machine?.plate); // (the plate it was taken from, #380: crumbs on it)
      if (plate && (plate.clean !== 'dirty' || !plate.machine.crumbs)) I.set(plate, { clean: 'dirty', machine: { crumbs: 1 } }); // food eaten off it: crumbs, dirty (#383)
      if (plate || d.crumbs) life.emit('crumbs', { from: 'bite', item: it, on: plate ?? null, pos: c.heldView?.where().toArray(), feet: life.feet()?.pos }); // (crumbs on the surface under it / the floor, #388)
      if (I.isEmpty(it)) {
        const parts = it.parts.map((p) => ({ ...p })), name = I.name({ ...it, amount: d.amount });
        life.emit('ate', { item: it, type: it.type, name, parts, amount: d.amount });
        if (parts.some((p) => p.type !== 'butter')) life.bump('sandwiches', 1, name); // a sandwich with something on it: once per sandwich, SCORE.first per combination
        I.remove(it, { cascade: true });
      }
      return got;
    },
    done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    consumes: 'one bite (amount / bites)', result: 'less of it; the last bite: gone (an `ate` event)',
  });

  const knifeLoad = (k) => k?.machine?.load ?? 0;
  // a dab of butter on the butter knife (#378): the open pack in reach (not in the hand), the knife empty
  A.define({
    id: 'dab', order: 1, duration: LIFE.butter.dab,
    label: (c) => `ta smör på ${nm(c.held)}`,
    applies: (c) => !!c.held && I.has(c.held, 'tool:spread') && !!c.target && I.has(c.target, 'spreadable') && c.target.place.at !== 'hand',
    check: (c) => {
      const shut = c.targetView?.shutReason();
      if (shut) return shut;
      if (c.target.pkg === 'closed') return `Öppna ${nm(c.target)} först`;
      if (c.target.amount <= 1e-6) return `${cap(nm(c.target))} är slut`;
      if (knifeLoad(c.held) > 0) return `Det är redan smör på ${nm(c.held)}`;
      return null;
    },
    reserve: (c) => ({ inputs: [c.target, c.held] }),
    animate: (c, k, job) => { const v = c.heldView; if (!v?.held) return; job.base ??= v.model.position.clone(); v.model.position.y = job.base.y - 0.05 * Math.sin(Math.PI * k); },
    commit: (c) => {
      const got = I.consume(c.target, LIFE.butter.g); // (the last bit: what there is)
      I.set(c.held, { machine: { load: got, loadType: c.target.type }, clean: 'dirty' }); // butter on it (#383)
      if (I.isEmpty(c.target)) I.set(c.target, { pkg: 'empty' });
      sfx.scoop?.(c.targetView?.where(), true);
      return got;
    },
    done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    consumes: 'LIFE.butter.g of the butter (what is left, if less)', result: 'that much butter on the knife (machine.load); the knife used',
  });
  // spread it on a slice of bread (#378): the bread anywhere but the hand; the knife's dab becomes the bread's butter layer
  A.define({
    id: 'spread', order: 1, duration: LIFE.butter.spread,
    label: (c) => `bre smöret på ${nm(c.target)}`,
    applies: (c) => !!c.held && I.has(c.held, 'tool:spread') && !!c.target && I.has(c.target, 'base') && c.target.place.at !== 'hand',
    check: (c) => {
      if (knifeLoad(c.held) <= 0) return `Ta smör på ${nm(c.held)} först`;
      if (c.target.parts.some((x) => x.type === 'butter')) return `Det är redan smör på ${nm(c.target)}`;
      if ((c.target.parts?.length ?? 0) >= LIFE.sandwich.max) return 'Mackan rymmer inte mer';
      if (c.target.parts.length) return 'Smöret ska ligga under pålägget';
      return c.targetView?.shutReason() ?? null;
    },
    reserve: (c) => ({ inputs: [c.target, c.held] }),
    animate: (c, k, job) => { const v = c.heldView; if (!v?.held) return; job.base ??= v.model.position.clone(); v.model.position.x = job.base.x + 0.05 * Math.sin(k * Math.PI * 4); v.model.position.y = job.base.y - 0.03 * Math.sin(Math.PI * k); },
    commit: (c) => {
      const g = knifeLoad(c.held);
      I.set(c.target, { parts: [...c.target.parts, { type: c.held.machine.loadType ?? 'butter', amount: g }], prep: 'spread' });
      I.set(c.held, { machine: { load: 0, loadType: null } });
      life.emit('prepared', { item: c.target }); // optional everyday tasks (#392)
      return g;
    },
    done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    consumes: 'the knife\'s dab (machine.load)', result: 'a butter part of exactly that much on the bread (prep spread); the knife empty',
  });
  // a slice of cheese with the slicer (#378): the block on the board (the slice on a free result spot) or on a worktop
  // (the slice beside it); 12 g, the last slice is what is left and the block is gone
  const slicePlace = (c, by) => {
    const block = c.target, board = boardUnder(block);
    if (board) { const k = I.freeSpot(board, { type: I.def(block).slice.into }, by); return k >= 0 ? { at: 'on', parent: board.id, slot: k } : null; }
    if (block.place.at === 'world' && life.worktopAt(block.place.pos)) {
      const [x, y, z] = block.place.pos, a = block.place.yaw ?? 0;
      return { at: 'world', pos: [x + Math.sin(a) * 0.09, y, z + Math.cos(a) * 0.09], yaw: a };
    }
    return null;
  };
  A.define({
    id: 'slice', order: 1, duration: LIFE.slice.seconds,
    label: (c) => `hyvla en skiva av ${nm(c.target)}`,
    applies: (c) => !!c.held && I.has(c.held, 'tool:slice') && !!I.def(c.target)?.slice && c.target.place.at !== 'hand',
    check: (c) => {
      const board = boardUnder(c.target);
      if (!board && !(c.target.place.at === 'world' && life.worktopAt(c.target.place.pos))) return `Lägg ${nm(c.target)} på skärbrädan eller bänken först`;
      if (board) { const st = stationReason(board); if (st) return st; }
      if (c.target.amount <= 1e-6) return `${cap(nm(c.target))} är slut`;
      if (!slicePlace(c)) return I.def(board).carrier.fullText ?? 'Brädan är full';
      return null;
    },
    reserve: (c) => { const p = slicePlace(c); return { inputs: [c.target, c.held, ...(boardUnder(c.target) ? [boardUnder(c.target)] : [])], outputs: p.at === 'on' ? [p] : [] }; },
    animate: (c, k, job) => { const v = c.heldView; if (!v?.held) return; job.base ??= v.model.position.clone(); v.model.position.z = job.base.z - 0.06 * Math.sin(Math.PI * k); v.model.position.y = job.base.y - 0.04 * Math.sin(Math.PI * k); },
    commit: (c, job) => {
      const block = c.target, sl = I.def(block).slice, place = job.outputs[0] ?? slicePlace(c);
      const got = I.consume(block, sl.g);
      const made = I.create(sl.into, place, { amount: got });
      I.set(c.held, { clean: 'dirty' }); // cheese on it (#383)
      const bd = boardUnder(block);
      if (bd && bd.clean !== 'dirty') I.set(bd, { clean: 'dirty' });
      if (block.prep === 'whole') I.set(block, { prep: 'sliced' });
      if (I.isEmpty(block)) I.remove(block); // (nothing left of it: gone; a fresh one in the fridge next time, #373)
      sfx.chop(c.targetView?.where());
      return made;
    },
    done: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    cancel: (c, job) => { if (job.base && c.heldView?.held) c.heldView.model.position.copy(job.base); },
    consumes: 'slice.g of the block (what is left, if less)', result: 'one cheese slice of that much on the board / beside the block; the slicer used',
  });

  // a topping in the hand onto a slice of bread (#379): moved into the bread's parts (the slice itself is gone), never copied
  A.define({
    id: 'addTopping', order: 1,
    label: (c) => `lägga ${nm(c.held)} på ${nm(c.target)}`,
    applies: (c) => !!c.held && I.has(c.held, 'topping') && !!c.target && I.has(c.target, 'base') && c.target !== c.held,
    check: (c) => {
      if (c.target.place.at === 'hand') return 'Lägg ner brödet först';
      if (c.target.parts.length >= LIFE.sandwich.max) return 'Mackan rymmer inte mer';
      if (c.target.lock || c.held.lock) return 'Vänta lite';
      return c.targetView?.shutReason() ?? null;
    },
    run: (c) => {
      const top = c.held, bread = c.target;
      const part = { type: top.type, amount: top.amount };
      if (!I.remove(top)) return; // (it leaves its place first; nothing is added if it could not)
      I.set(bread, { parts: [...bread.parts, part], prep: 'assembled' });
      life.emit('prepared', { item: bread }); // only after the topping really moved (#392)
      sfx.click(c.targetView?.where());
    },
    consumes: 'the topping in the hand (removed)', result: 'one more part on the bread: { type, amount } exactly as the topping was',
  });
  /** A sandwich's name from what is on it (#379): "ost- och gurkmackan", "ostmackan", "smörgåsen med smör" … */
  I.namers.breadSlice = (it) => {
    const has = (t) => it.parts?.some((p) => p.type === t);
    const cheese = has('cheeseSlice'), cuc = has('cucumberSlice');
    if (cheese && cuc) return 'ost- och gurkmackan';
    if (cheese) return 'ostmackan';
    if (cuc) return 'gurkmackan';
    if (has('butter')) return 'smörgåsen';
    return null;
  };

  /** What kind of waste a thing is (#381): 'package' (an empty one), 'food' (an end, leftovers), or null (not waste). */
  life.wasteKind = (it) => {
    const d = I.def(it);
    if (!d || I.has(it, 'bin')) return null;
    if (d.pkg && (it.pkg === 'empty' || it.amount <= 1e-6)) return 'package';
    if (life.isEnd?.(it)) return 'food';
    if (I.has(it, 'rubbishBag')) return null; // (#386: carried out, #387)
    if (I.has(it, 'topping') || I.has(it, 'base')) return 'food';
    return null;
  };
  const volume = (it, kind) => I.def(it).binVolume ?? (kind === 'package' ? 2 : 1);
  /** The waste in the hand: a life item, or another holdable that says what kind of waste it is (the empty milk carton,
   * `wasteKind` + `discard()`, #382), or null. */
  const wasteIn = (c) => c.held ?? (c.heldView && c.heldView.wasteKind !== undefined ? c.heldView : null);
  const wasteOf = (c) => (c.held ? life.wasteKind(c.held) : c.heldView?.wasteKind ?? null);
  A.define({
    id: 'throwAway', order: 0,
    label: (c) => `slänga ${c.held ? nm(c.held) : c.heldView.name} i ${nm(c.target)}`, // (#386: which bin)
    applies: (c) => !!wasteIn(c) && !!c.target && I.has(c.target, 'bin') && c.held !== c.target,
    quiet: (c) => !!c.held && I.has(c.held, 'dish'), // (a plate at the bin: scraping it is the row, #383)
    check: (c) => {
      const shut = c.targetView?.shutReason();
      if (shut) return shut;
      const kind = wasteOf(c);
      if (!kind || (c.held && I.children(c.held).length)) return 'Det där ska inte slängas';
      if (c.target.machine?.nobag) return 'Sätt i en ny påse först'; // (#386)
      const sort = I.def(c.target).sort;
      if (sort && sort !== kind && LIFE.rules.strictSorting) return `${cap(c.held ? nm(c.held) : c.heldView.name)} → ${life.binLabel(kind)}`; // the right bin (#386)
      const v = c.held ? volume(c.held, kind) : 2;
      if (c.target.amount + v > (I.def(c.target).capacity ?? 10) + 1e-6) return I.def(c.target).fullText ?? `${cap(nm(c.target))} är full`;
      return null;
    },
    run: (c) => {
      const it = c.held, bin = c.target, kind = wasteOf(c), v = it ? volume(it, kind) : 2;
      const parts = bin.parts.map((p) => ({ ...p })), p = parts.find((x) => x.type === kind);
      if (p) p.amount += 1; else parts.push({ type: kind, amount: 1 });
      if (it) { if (!I.remove(it, { cascade: true })) return; } // (out of the hand first; nothing added if it could not)
      else c.heldView.discard(); // (the milk carton: gone until the fridge is opened again)
      I.add(bin, v);
      I.set(bin, { parts });
      life.emit('thrown', { type: it?.type ?? c.heldView.drinkKind ?? 'thing', kind, into: bin.id });
      const sort = I.def(bin).sort;
      if (sort && sort !== kind) life.say(`Det där hör hemma i ${life.binLabel(kind).toLowerCase()}`); // (free sorting: in it went, a note)
      sfx.rustle?.(c.targetView?.where());
    },
    consumes: 'the waste in the hand (removed)', result: 'the bin fuller by its volume; its parts count the kind',
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
