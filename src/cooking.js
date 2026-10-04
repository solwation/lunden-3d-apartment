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

  // cutting (#375 the station's rules; #376 the slices): the kitchen knife in the hand, a cuttable thing on the board
  A.define({
    id: 'cut', order: 1, duration: LIFE.cut.seconds,
    label: 'skära en skiva',
    applies: (c) => !!c.held && I.has(c.held, 'tool:cut') && !!I.def(workpiece(c))?.cut,
    check: (c) => {
      const food = workpiece(c), cut = I.def(food).cut, board = boardUnder(food);
      if (!board) return `Lägg ${nm(food)} på skärbrädan först`;
      const st = stationReason(board);
      if (st) return st;
      if (food.amount <= 0) return `${cap(nm(food))} är slut`;
      if (resultSpot(board, cut.into) < 0) return I.def(board).carrier.fullText ?? 'Brädan är full';
      return null;
    },
    reserve: (c) => { const food = workpiece(c), board = boardUnder(food); return { inputs: [food, board], outputs: [{ at: 'on', parent: board.id, slot: resultSpot(board, I.def(food).cut.into) }] }; },
    commit: (c, job) => {
      const food = workpiece(c), cut = I.def(food).cut;
      const got = I.consume(food, cut.g); // (the last bit: what there is, never below 0)
      const slice = I.create(cut.into, job.outputs[0], { amount: got });
      if (I.def(food).prep === 'whole' && food.prep === 'whole') I.set(food, { prep: 'sliced' });
      sfx.click(c.targetView?.where());
      return slice;
    },
    consumes: 'the food\'s cut.g (g)', result: 'exactly one slice of that amount on a free spot of the board',
  });

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
