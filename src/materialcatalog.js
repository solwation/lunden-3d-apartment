// #995: compact shared catalogue, safe to import in the Worker (no Three or DOM).
import { FURNITURE } from './config.js';
export const MATERIAL_VERSION = 1;
export const MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'matta' },
  { id: 'rug-sand', name: 'Sand', category: 'matta', color: '#c9bca8' },
  { id: 'rug-bluegrey', name: 'Blågrå', category: 'matta', color: '#788c9a' },
  { id: 'rug-olive', name: 'Olivgrön', category: 'matta', color: '#66705a' },
  { id: 'rug-stripe', name: 'Blågrå ränder', category: 'matta', color: '#788c9a', ink: '#e6e1d7', pattern: 'stripe' },
  { id: 'rug-check', name: 'Sandrutor', category: 'matta', color: '#c9bca8', ink: '#7c8574', pattern: 'check' },
];
const serials = new Map();
export const RUG_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = serials.get(base) ?? 0; serials.set(base, n + 1);
  return it.type === 'rug' ? [`${base}-${n}-0`] : [];
});
export const materialChoice = id => MATERIAL_CHOICES.find(c => c.id === id);
export const validMaterialChoice = (id, surface, choice) => RUG_MATERIAL_IDS.includes(id) && surface === 'textile' && !!materialChoice(choice);
