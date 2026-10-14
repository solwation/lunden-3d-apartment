// #995: compact shared catalogue, safe to import in the Worker (no Three or DOM).
import { FURNITURE, CURTAINS } from './config.js';
export const MATERIAL_VERSION = 1;
export const MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'matta' },
  { id: 'rug-sand', name: 'Sand', category: 'matta', color: '#c9bca8' },
  { id: 'rug-bluegrey', name: 'Blågrå', category: 'matta', color: '#788c9a' },
  { id: 'rug-olive', name: 'Olivgrön', category: 'matta', color: '#66705a' },
  { id: 'rug-stripe', name: 'Blågrå ränder', category: 'matta', color: '#788c9a', ink: '#e6e1d7', pattern: 'stripe' },
  { id: 'rug-check', name: 'Sandrutor', category: 'matta', color: '#c9bca8', ink: '#7c8574', pattern: 'check' },
];
// #997: independent fabric family; the six existing rug choices/IDs remain unchanged.
export const CURTAIN_MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'gardin' },
  { id: 'curtain-sand', name: 'Linnebeige', category: 'gardin', color: '#e8e0d0' },
  { id: 'curtain-bluegrey', name: 'Blågrå', category: 'gardin', color: '#708692' },
  { id: 'curtain-sage', name: 'Salviagrön', category: 'gardin', color: '#697e6a' },
  { id: 'curtain-stripe', name: 'Blågrå ränder', category: 'gardin', color: '#708692', ink: '#ede8dc', pattern: 'stripe' },
  { id: 'curtain-check', name: 'Sandrutor', category: 'gardin', color: '#e8e0d0', ink: '#8f9e88', pattern: 'check' },
];
export const CURTAIN_MATERIAL_IDS = CURTAINS.map(spec => spec.materialId);
// #1010: actual upholstered indoor seats; separate from wood, loose cushions and bedlinen.
export const UPHOLSTERY_TYPES = ['sofa', 'armchair', 'ottoman', 'gamingchair', 'kidchair', 'vanitystool'];
export const UPHOLSTERY_MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'klädsel' },
  { id: 'upholstery-sand', name: 'Sandbeige', category: 'klädsel', color: '#c9bca8' },
  { id: 'upholstery-bluegrey', name: 'Blågrå', category: 'klädsel', color: '#788c9a' },
  { id: 'upholstery-olive', name: 'Olivgrön', category: 'klädsel', color: '#66705a' },
  { id: 'upholstery-stripe', name: 'Blågrå ränder', category: 'klädsel', color: '#788c9a', ink: '#e6e1d7', pattern: 'stripe' },
  { id: 'upholstery-check', name: 'Sandrutor', category: 'klädsel', color: '#c9bca8', ink: '#7c8574', pattern: 'check' },
];
const upholsterySerials = new Map();
export const UPHOLSTERY_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = upholsterySerials.get(base) ?? 0; upholsterySerials.set(base, n + 1);
  return UPHOLSTERY_TYPES.includes(it.type) ? [`${base}-${n}-0`] : [];
});
export const materialChoices = (category = 'matta') => category === 'klädsel' ? UPHOLSTERY_MATERIAL_CHOICES : category === 'gardin' ? CURTAIN_MATERIAL_CHOICES : category === 'matta' ? MATERIAL_CHOICES : [];
const serials = new Map();
export const RUG_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = serials.get(base) ?? 0; serials.set(base, n + 1);
  return it.type === 'rug' ? [`${base}-${n}-0`] : [];
});
export const materialChoice = id => [...MATERIAL_CHOICES, ...CURTAIN_MATERIAL_CHOICES, ...UPHOLSTERY_MATERIAL_CHOICES].find(c => c.id === id);
export const validMaterialChoice = (id, surface, choice) => surface === 'textile' &&
  (UPHOLSTERY_MATERIAL_IDS.includes(id) ? UPHOLSTERY_MATERIAL_CHOICES : RUG_MATERIAL_IDS.includes(id) ? MATERIAL_CHOICES : CURTAIN_MATERIAL_IDS.includes(id) ? CURTAIN_MATERIAL_CHOICES : []).some(c => c.id === choice);
