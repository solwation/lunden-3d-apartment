import { LIFE_TOOLS } from './config.js';

// The life simulator's kitchen work (epic #364, milestone M1): what the tools do to the food — one action definition per
// step (actions.js), judged by the tags of what is in the hand and what is looked at (ITEMS / LIFE_TOOLS.uses in config), so
// a new tool or food is a definition, not a special case.
//   #374 the right tool: a tool's tags decide what it can do; the wrong one says so ("Osthyveln skär inte gurka") and
//        nothing is used

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Add the kitchen's actions to `life` (life.js calls this once). */
export function cookingActions(life) {
  const A = life.actions, I = life.items, nm = (it) => I.name(it), noun = (it) => I.def(it)?.noun ?? nm(it);
  const isTool = (it) => !!it && I.has(it, 'tool');
  /** The uses (LIFE_TOOLS.uses) that apply to a food: what could be done to it with some tool. */
  const usesFor = (food) => LIFE_TOOLS.uses.filter((u) => I.has(food, u.target));

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
