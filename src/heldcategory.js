// What the other players see in our hand (#1297, part of #1286): a CATEGORY key, never a name, photo or drawing content.
// Pure data and logic (no three.js, no DOM), shared by the client (src/main.js state, src/ghosts.js, src/ghostprops.js ghostItem)
// and the Worker (cloudflare/players.js cleanState validates `hi` against HELD_CATEGORIES — anything else is dropped).
// Weapons keep their own wire field `h`; this covers the ordinary held things heldItem() (holdable.js) can return.

/** The whitelist: one simple proxy model per key (ghostprops.js ghostItem). */
export const HELD_CATEGORIES = Object.freeze(['cup', 'plate', 'food', 'bottle', 'book', 'paper', 'tool', 'plant', 'box']);
const SET = new Set(HELD_CATEGORIES);
/** `hi` as it goes on the wire / into a Ghost: a whitelisted key, else '' (none). */
export const cleanHeldCategory = (v) => (typeof v === 'string' && SET.has(v) ? v : '');

// By class name of the held object (the project has no bundler, so the names are stable). Weapons, the ball and cats are not
// here: weapons travel as `h`, a carried cat as `cat`. Anything else held falls back to a generic 'box'.
const BY_CLASS = {
  Cup: 'cup', Glass: 'cup', Jug: 'bottle', Bottle: 'bottle', Milk: 'bottle', Beer: 'bottle', BeerCan: 'bottle',
  Book: 'book', HeldDrawing: 'paper', ToiletPaper: 'paper', Photo: 'paper',
  Pan: 'tool', Cloth: 'tool', Vacuum: 'tool', Flashlight: 'tool', Remote: 'tool', Scoop: 'tool', Toaster: 'box',
  SillPot: 'plant', Fruit: 'food', FishFinger: 'food', FishPack: 'box', FriesBag: 'food', FriesBunch: 'food', Chicken: 'food', ChickenPiece: 'food',
};
const WEAPON_CLASSES = new Set(['Saber', 'Blaster', 'Wand', 'Bow', 'Basketball', 'MieleHeld']);

/** Category of a life-sim item's tags (config ITEMS), or ''. */
function byTags(tags) {
  const t = new Set(tags ?? []);
  if (t.has('glass')) return 'cup';
  if (t.has('dish')) return 'plate';
  if (t.has('toiletRoll')) return 'paper';
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
  if (item.isCup) return 'cup';
  if (item.isCloth) return 'tool';
  if (item.isPaper) return 'paper';
  if (item.kind && (cls === 'Thing' || cls === 'Bottle' || cls === 'Glass' || cls === 'Photo')) return { glass: 'cup', plant: 'plant', photo: 'paper' }[item.kind] ?? 'bottle';
  return BY_CLASS[cls] ?? 'box';
}
