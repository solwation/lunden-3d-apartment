import { COOKING } from './config.js';

// #1881 / #1887: the one cooking rule for every food and appliance. Pure (no three.js), read by the appliance code in main.js /
// fishfingers.js / fries.js / cookstores.js / chicken.js / fishing.js / sausages.js and by src/cookrules.test.mjs.
// A food is a COOKING.foods definition (size, the appliances it sensibly cooks in with their rates), never a special case per
// appliance (#1887, the user: "vi siktade på realism"):
//  - a food cooks only where its `rate` lists the appliance (no fries in the pan, eggs only in the pan);
//  - a food bigger than an appliance's room is refused as too big, with where it does fit;
//  - anything else is refused with where the food does go ("Pommes gör man i ugnen eller airfryern").

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} eller ${xs[xs.length - 1]}`);
const size = (k) => COOKING.sizes[k] ?? COOKING.sizes.m;
/** "i stekpannan", "i ugnen", "på grillen" → "i stekpannan, ugnen eller på grillen" (a preposition only where it changes). */
const places = (keys) => list(keys.map((k, i) => {
  const [prep, ...rest] = COOKING.appliances[k].in.split(' '), prev = i ? COOKING.appliances[keys[i - 1]].in.split(' ')[0] : null;
  return prep === prev ? rest.join(' ') : COOKING.appliances[k].in;
}));

export const APPLIANCES = Object.keys(COOKING.appliances);
export const FOODS = Object.keys(COOKING.foods);

/** Is the appliance one this food sensibly cooks in at all (ignoring its size)? */
export const cooksKind = (food, appliance) => !!COOKING.appliances[appliance] && Object.hasOwn(COOKING.foods[food]?.rate ?? {}, appliance);

/** Does the food fit in the appliance? */
export const fits = (food, appliance) => size(COOKING.foods[food]?.size) <= size(COOKING.appliances[appliance]?.room);

/** Where the food does cook (appliance keys, in COOKING order). */
export const cooksIn = (food) => APPLIANCES.filter((k) => cooksKind(food, k) && fits(food, k));

/** Why `food` cannot go in / on `appliance` (a Swedish sentence for the HUD), or null when it can. */
export function cookRefusal(food, appliance) {
  const f = COOKING.foods[food], a = COOKING.appliances[appliance];
  if (!f || !a) return 'Det där går inte att laga här';
  if (cooksKind(food, appliance) && fits(food, appliance)) return null;
  const where = cooksIn(food).filter((k) => k !== appliance);
  if (!fits(food, appliance)) return `${cap(f.name)} är för stor för ${a.name}${where.length ? ` – använd ${list(where.map((k) => COOKING.appliances[k].name))}` : ''}`;
  return where.length ? `${cap(f.noun)} ${f.how} ${places(where)}` : `Det går inte att laga ${f.noun} ${a.in}`;
}

export const canCook = (food, appliance) => !cookRefusal(food, appliance);

/** How fast the appliance cooks the food (× the food's own seconds), 0 when it cannot. */
export const cookRate = (food, appliance) => (canCook(food, appliance) ? COOKING.foods[food].rate[appliance] : 0);

/** The COOKING food a life item type cooks as (ITEMS `cook`: rawEgg / friedEgg → 'egg', sausage → 'sausage'), or null. */
export const lifeFood = (defs, type) => defs?.[type]?.cook ?? null;
