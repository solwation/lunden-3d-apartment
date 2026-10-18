import { CAT_CARD as C, SCORE } from './config.js';

// Cat card binder data model (#1249, part 1). No DOM, no three.js: the binder UI (later parts) and the tests use this.
// One slot per BREED (CAT_CARD.breeds; a game cat is random: breed + coat + a random name). A card = one photo of where
// a cat of that breed was found. Per breed at most C.max cards; a new find rotates out the oldest card that is not saved,
// and when all of them are saved the new one is not added. Counters (finds, pats, hugs) live in the saved statistics
// (`stats.byBreed`, `stats.miele`, `stats.petsByBreed`, `stats.hugsByBreed`); cards live in IndexedDB 'catCards'.
// Photos from the old kitchen cork board ('catPhotos') are COPIED in once (`migrate`); nothing there is deleted.

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const num = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export const SLOTS = C.breeds.map((b) => b.key);
export const slotOf = (key) => C.breeds.find((b) => b.key === key) ?? null;

/** Points the slot's cat gives (SCORE): breed points, Miele her first find. */
export const slotPoints = (key) => (slotOf(key)?.star ? SCORE.first.miele : SCORE.breeds[key] ?? 0);
/** Rarity tier of a slot: the highest tier whose `from` the points reach. */
export const tierOf = (key) => {
  const p = slotPoints(key);
  return C.tiers.reduce((t, x) => (p >= x.from ? x : t), C.tiers[0]);
};

/** In-memory card store with the IndexedDB store's shape (tests, and a visit without IndexedDB). */
export class MemoryStore {
  constructor(items = []) { this.map = new Map(items.map((x) => [x.id, x])); }
  async all() { return [...this.map.values()]; }
  async put(x) { this.map.set(x.id, structuredClone(x)); }
  async delete(id) { this.map.delete(id); }
}

/** The IndexedDB store 'catCards' (idb.js) and read access to the old 'catPhotos'. */
export function idbStore(withStore) {
  return {
    all: async () => (await withStore('catCards', 'readonly', (s) => s.getAll())) ?? [],
    put: (x) => withStore('catCards', 'readwrite', (s) => s.put(x)),
    delete: (id) => withStore('catCards', 'readwrite', (s) => s.delete(id)),
    legacy: async () => (await withStore('catPhotos', 'readonly', (s) => s.getAll())) ?? [],
  };
}

export class CatCards {
  /** `store`: {all, put, delete, legacy?}; `stats`: the saved statistics object; `touch`: called after a counter changed;
   * `flag`: {get, set} for the one-time migration marker. A failing store keeps this visit's cards in memory. */
  constructor({ store = new MemoryStore(), stats = {}, touch = () => {}, flag = null, now = () => Date.now() } = {}) {
    Object.assign(this, { store, stats, touch, now, cards: [], migrated: false });
    this.flag = flag ?? { value: false, get() { return this.value; }, set() { this.value = true; } };
  }

  async load() {
    try { this.cards = (await this.store.all()) ?? []; } catch { this.cards = []; }
    await this.migrate();
    this.cards.sort((a, b) => a.time - b.time);
    return this;
  }

  /** Copy the old board photos in as cards, once: kept → saved, 'Miele' → Miele's slot, the rest (no breed was stored)
   * → the legacy page. The card id is derived from the photo id, so a repeat can never duplicate. */
  async migrate() {
    let done = false;
    try { done = !!this.flag.get(); } catch { /* unreadable: the ids still prevent duplicates */ }
    if (done || !this.store.legacy) return 0;
    let old;
    try { old = (await this.store.legacy()) ?? []; } catch { return 0; } // try again next visit
    let n = 0;
    for (const p of old) {
      const id = `legacy-${p.id ?? p.time}`;
      if (this.cards.some((c) => c.id === id)) continue;
      const card = { id, breed: p.name === 'Miele' ? 'Miele' : C.legacy, name: p.name, time: p.time, data: p.data, saved: !!p.kept, kitten: !!p.kitten, legacy: true };
      this.cards.push(card);
      try { await this.store.put(card); } catch { /* this visit only */ }
      n++;
    }
    try { this.flag.set(); } catch { /* migrated again next time: ids dedupe */ }
    return n;
  }

  /** The cards of a slot, oldest first. The legacy key lists the old photos without a breed. */
  of(breed) { return this.cards.filter((c) => c.breed === breed).sort((a, b) => a.time - b.time); }

  /** Add a card (photo JPEG data URL) for a find of `breed`. Returns the card, or null when the slot is full of saved ones. */
  async add(breed, { name, data, coat = null, kitten = false } = {}) {
    if (!slotOf(breed)) return null;
    // (migration may leave a slot above the maximum: unsaved cards go until there is room)
    while (this.of(breed).length >= C.max) {
      const old = this.of(breed).find((c) => !c.saved);
      if (!old) return null;
      await this.discard(old.id);
    }
    const card = { id: uid(), breed, name, time: this.now(), data, saved: false, kitten: !!kitten, ...(coat ? { coat } : {}) };
    this.cards.push(card);
    try { await this.store.put(card); } catch { /* this visit only */ }
    return card;
  }

  async toggleSave(id) {
    const c = this.cards.find((x) => x.id === id);
    if (!c) return null;
    c.saved = !c.saved;
    try { await this.store.put(c); } catch { /* this visit only */ }
    return c;
  }

  async discard(id) {
    this.cards = this.cards.filter((x) => x.id !== id);
    try { await this.store.delete(id); } catch { /* this visit only */ }
  }

  // --- counters: finds are the existing statistics, pats / hugs per breed are new ones next to them ---
  found(breed) { return breed === 'Miele' ? num(this.stats.miele) : num(this.stats.byBreed?.[breed]); }
  pets(breed) { return num(this.stats.petsByBreed?.[breed]); }
  hugs(breed) { return breed === 'Miele' ? Math.max(num(this.stats.hugsByBreed?.[breed]), num(this.stats.mieleHugs)) : num(this.stats.hugsByBreed?.[breed]); }
  recordPet(breed) { this.#count('petsByBreed', breed); }
  recordHug(breed) { this.#count('hugsByBreed', breed); }
  #count(kind, breed) {
    if (!slotOf(breed)) return;
    const m = (this.stats[kind] ??= {});
    m[breed] = (m[breed] ?? 0) + 1;
    this.touch();
  }

  /** Everything one binder page shows. A slot is "found" once the cat has been found (counted) or has a card. */
  slot(breed) {
    const s = slotOf(breed), cards = this.of(breed), found = this.found(breed);
    return { key: breed, label: s.label, weightKg: s.weightKg, facts: s.facts, points: slotPoints(breed), tier: tierOf(breed),
      found, pets: this.pets(breed), hugs: this.hugs(breed), cards, saved: cards.filter((c) => c.saved).length, has: found > 0 || cards.length > 0 };
  }
  slots() { return SLOTS.map((k) => this.slot(k)); }
  /** Old board photos that belong to no breed. */
  legacy() { return this.of(C.legacy); }
  collected() { return this.slots().filter((s) => s.has).length; }
}
