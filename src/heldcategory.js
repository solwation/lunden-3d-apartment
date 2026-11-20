// What the other players see in our hand (#1297, part of #1286): a CATEGORY key, never a name, photo or drawing content.
// Pure data and logic (no three.js, no DOM), shared by the client (src/main.js state, src/ghosts.js, src/ghostprops.js ghostItem)
// and the Worker (cloudflare/players.js cleanState validates `hi` against HELD_CATEGORIES — anything else is dropped).
// Weapons keep their own wire field `h`; this covers the ordinary held things heldItem() (holdable.js) can return.

/** The whitelist: one simple proxy model per key (ghostprops.js ghostItem). */
export const HELD_CATEGORIES = Object.freeze(['cup', 'plate', 'food', 'bottle', 'book', 'paper', 'tool', 'plant', 'cue', 'box', 'nut', 'binoculars', 'spray', 'gift', 'bag', 'rod', 'fish', 'sharkfin', 'mussel',
  // #1963: what was one generic 'food' / 'tool' / nothing: the other players see WHAT is carried
  'chicken', 'drumstick', 'fries', 'popcorn', 'fishfinger', 'banana', 'orange', 'pear', 'pan', 'flashlight', 'remote', 'harpoon', 'plush']); // 'nut' (#1686): a squirrel nut; a crouched, still player holding one lures the squirrels for the shared leader. #1755: binoculars (#1706), spray can (#1707), Christmas gift, rubbish/laundry bag: no longer the generic box. #1753: the fishing rod and a caught fish. #1769: a shark fin. #2144: 'plush' = a soft toy carried in both arms (Pingping: handPose 'hug'); the Worker takes the whitelist from here, so deploy it before the client
const SET = new Set(HELD_CATEGORIES);
/** `hi` as it goes on the wire / into a Ghost: a whitelisted key, else '' (none). */
export const cleanHeldCategory = (v) => (typeof v === 'string' && SET.has(v) ? v : '');

// By class name of the held object (the project has no bundler, so the names are stable). Weapons, the ball and cats are not
// here: weapons travel as `h`, a carried cat as `cat`. Anything else held falls back to a generic 'box'.
const BY_CLASS = {
  Cup: 'cup', Glass: 'cup', PicnicGlass: 'cup', PicnicBottle: 'bottle', Jug: 'bottle', Bottle: 'bottle', Milk: 'bottle', Beer: 'bottle', BeerCan: 'bottle',
  Book: 'book', HeldDrawing: 'paper', ToiletPaper: 'paper', Photo: 'paper',
  Pan: 'pan', Cloth: 'tool', Vacuum: 'tool', Flashlight: 'flashlight', Screwdriver: 'tool', Remote: 'remote', Scoop: 'tool', Toaster: 'box',
  SillPot: 'plant', Nut: 'nut', Binoculars: 'binoculars', SprayCan: 'spray', ChristmasGift: 'gift', FishingRod: 'rod', CaughtFish: 'fish', SharkFin: 'sharkfin', Mussel: 'mussel', BilliardCue: 'cue', Fruit: 'food', FishFinger: 'fishfinger', FishPack: 'box', FriesBag: 'fries', FriesBunch: 'fries', PopcornTub: 'popcorn', Chicken: 'chicken', ChickenPiece: 'drumstick', Harpoon: 'harpoon',
};
/** #1963: a fruit by its kind (fruit.js `kind`); an apple is the generic red 'food'. */
const FRUIT = { pear: 'pear', orange: 'orange', clementine: 'orange', banana: 'banana' };
const WEAPON_CLASSES = new Set(['Saber', 'Blaster', 'Wand', 'Bow', 'Basketball', 'MieleHeld']);

/** Category of a life-sim item's tags (config ITEMS), or ''. */
function byTags(tags) {
  const t = new Set(tags ?? []);
  if (t.has('glass')) return 'cup';
  if (t.has('dish')) return 'plate';
  if (t.has('toiletRoll')) return 'paper';
  if (t.has('rubbishBag') || t.has('laundry')) return 'bag';
  if (t.has('tool') || t.has('wateringCan')) return 'tool';
  if (t.has('food') && !t.has('package')) return 'food';
  return '';
}

/** The category of what `item` (heldItem(): a Holdable, a Cup, the held drawing …) shows in the hand, '' for nothing / a weapon / a cat. */
export function heldCategory(item) {
  if (!item) return '';
  if (item.isRifle || item.isMiele || item.shoots) return '';
  const cls = item.constructor?.name;
  if (WEAPON_CLASSES.has(cls)) return '';
  if (item.lifeItem) { // an instance of the life simulator: the type's tags decide
    const def = item.life?.items?.def?.(item.item);
    return byTags(def?.tags) || 'box';
  }
  if (item.isBilliardCue) return 'cue'; // #1687: not the generic box
  if (item.isCup) return 'cup';
  if (item.isFishingRod) return 'rod'; // #1753
  if (item.isSharkFin) return 'sharkfin'; // #1769
  if (item.isMussel) return 'mussel'; // #1945: a blue mussel from the bed of Höje å
  if (item.isCaughtFish) return 'fish'; // #1753: a fish from Höje å (not the fish fingers below)
  if (item.isFish) return 'fishfinger'; // a fish finger (fishfingers.js builds a plain object, so no class name)
  if (item.isFruit || cls === 'Fruit') return FRUIT[item.kind] ?? 'food'; // #1963
  if (item.isBinoculars) return 'binoculars';
  if (item.isHarpoon) return 'harpoon'; // #1953 / #1963: the gun is seen in the hand (its spear on the line stays local)
  if (item.isSprayCan) return 'spray';
  if (item.isCloth) return 'tool';
  if (item.isPaper) return 'paper';
  if (item.handPose === 'hug') return 'plush'; // #2144: Pingping (Miele returned above and travels as `cat`)
  if (item.kind && (cls === 'Thing' || cls === 'Bottle' || cls === 'Glass' || cls === 'Photo')) return { glass: 'cup', plant: 'plant', photo: 'paper' }[item.kind] ?? 'bottle';
  return BY_CLASS[cls] ?? 'box';
}
