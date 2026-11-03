// The append-only creature registry. Render recipes are lazy and never instantiate world animals.
export class BestiaryRegistry {
  constructor() { this.entries = new Map(); this.numbers = new Map(); this.listeners = new Set(); }
  register(entry) {
    if (!entry?.id || !Number.isInteger(entry.no) || entry.no < 1 || !entry.family?.id || !entry.name || !entry.model) throw new Error('Incomplete bestiary registration');
    if (this.entries.has(entry.id) || this.numbers.has(entry.no)) throw new Error(`Duplicate bestiary entry: ${entry.id}/${entry.no}`);
    const value = Object.freeze({ variant: '', chain: [], facts: [], info: {}, modelVersion: 1, ...entry });
    this.entries.set(entry.id, value); this.numbers.set(entry.no, entry.id);
    for (const fn of this.listeners) fn();
    return value;
  }
  get(id) { return this.entries.get(id); }
  list() { return [...this.entries.values()].sort((a, b) => a.no - b.no); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
export const registry = new BestiaryRegistry();
export const registerCreature = entry => registry.register(entry);
export const catEntryId = (breed, coat, kitten = false) => `cat:${typeof breed === 'string' ? breed : breed.name}:${typeof coat === 'string' ? coat : coat.name}:${kitten ? 'kitten' : 'adult'}`;
export const rarity = (tiers, level) => ({ key: tiers[level].id, label: tiers[level].label, level, color: ['#9ca9ae', '#66bd84', '#6d9ee5', '#ba83e1', '#e8bd4c'][level] });
export const families = {
 cats: { id: 'cats', label: 'Katter', order: 1 }, squirrels: { id: 'squirrels', label: 'Ekorrar', order: 2 },
 ducks: { id: 'ducks', label: 'Änder', order: 3 }, birds: { id: 'birds', label: 'Fåglar', order: 4 },
 fish: { id: 'fish', label: 'Fiskar', order: 5 }, ponies: { id: 'ponies', label: 'Ponnyer', order: 6 },
 insects: { id: 'insects', label: 'Fjärilar', order: 7 }, figures: { id: 'figures', label: 'Figurer & besökare', order: 8 },
};
