// #995: compact shared catalogue, safe to import in the Worker (no Three or DOM).
import { FURNITURE, CURTAINS, CUSHIONS, DOUBLE_BED_LINEN, BUNK_LINEN, DAYBED_LINEN, SHADE_CANOPY_TEXTILES, HOOKS, KID_HOOKS, TOWEL_HOOKS, KITCHEN_TOWEL_MATERIAL } from './config.js';
export const MATERIAL_VERSION = 1;
// #1070: plain neutral shades appended per family; existing IDs/order stay so saved choices resolve.
const NEUTRAL_SHADES = [
  ['white', 'Vit', '#f1efea'], ['cream', 'Gräddvit', '#ebe2cf'], ['lightbeige', 'Ljusbeige', '#ddd3c2'],
  ['greige', 'Gråbeige', '#b3aa9c'], ['taupe', 'Taupe', '#8a7d71'], ['lightgrey', 'Ljusgrå', '#c6c6c2'],
  ['midgrey', 'Mellangrå', '#8d8d8a'], ['charcoal', 'Antracit', '#4a4b4e'], ['black', 'Svart', '#262626'],
];
const neutrals = (prefix, category, swap = {}) => NEUTRAL_SHADES.map(([key, name, color]) => ({ id: `${prefix}-${swap[key]?.[0] ?? key}`, name: swap[key]?.[1] ?? name, category, color: swap[key]?.[2] ?? color }));
export const MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'matta' },
  { id: 'rug-sand', name: 'Sand', category: 'matta', color: '#c9bca8' },
  { id: 'rug-bluegrey', name: 'Blågrå', category: 'matta', color: '#788c9a' },
  { id: 'rug-olive', name: 'Olivgrön', category: 'matta', color: '#66705a' },
  { id: 'rug-stripe', name: 'Blågrå ränder', category: 'matta', color: '#788c9a', ink: '#e6e1d7', pattern: 'stripe' },
  { id: 'rug-check', name: 'Sandrutor', category: 'matta', color: '#c9bca8', ink: '#7c8574', pattern: 'check' },
  { id: 'rug-longpile-bluegrey', name: 'Blågrå långlugg', category: 'matta', color: '#788c9a' },
  ...neutrals('rug', 'matta'),
];
// #1086: pile height is its own rug surface ('pile'); Original keeps the flat short pile every rug had before.
export const PILE_CHOICES = [
  { id: 'original', name: 'Kort lugg', category: 'lugg' },
  { id: 'pile-long', name: 'Lång lugg', category: 'lugg' },
];
// #997: independent fabric family; the six existing rug choices/IDs remain unchanged.
export const CURTAIN_MATERIAL_CHOICES = [
  { id: 'original', name: 'Original', category: 'gardin' },
  { id: 'curtain-sand', name: 'Linnebeige', category: 'gardin', color: '#e8e0d0' },
  { id: 'curtain-bluegrey', name: 'Blågrå', category: 'gardin', color: '#708692' },
  { id: 'curtain-sage', name: 'Salviagrön', category: 'gardin', color: '#697e6a' },
  { id: 'curtain-stripe', name: 'Blågrå ränder', category: 'gardin', color: '#708692', ink: '#ede8dc', pattern: 'stripe' },
  { id: 'curtain-check', name: 'Sandrutor', category: 'gardin', color: '#e8e0d0', ink: '#8f9e88', pattern: 'check' },
  // Linnebeige already covers light beige for curtains; offer the sand tone instead.
  ...neutrals('curtain', 'gardin', { lightbeige: ['sandbeige', 'Sandbeige', '#c9bca8'] }),
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
  ...neutrals('upholstery', 'klädsel'),
];
const upholsterySerials = new Map();
export const UPHOLSTERY_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = upholsterySerials.get(base) ?? 0; upholsterySerials.set(base, n + 1);
  return UPHOLSTERY_TYPES.includes(it.type) ? [`${base}-${n}-0`] : [];
});
// #1011: one actual upholstered IDANÄS, not wood beds or bedlinen.
const bedUpholsterySerials = new Map();
export const BED_UPHOLSTERY_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = bedUpholsterySerials.get(base) ?? 0; bedUpholsterySerials.set(base, n + 1);
  return it.type === 'bed' && it.model === 'idanas' ? [`${base}-${n}-0`] : [];
});
// #1019: linen is independent of this same bed's existing frame textile.
export const DOUBLE_BED_LINEN_SURFACES = Object.fromEntries(BED_UPHOLSTERY_MATERIAL_IDS.map(id => [id, DOUBLE_BED_LINEN.map(s => s.id)]));
// #1020: both actual MYDALs, six independent linen surfaces each; never their wooden frame.
const bunkLinenSerials = new Map();
export const BUNK_LINEN_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = bunkLinenSerials.get(base) ?? 0; bunkLinenSerials.set(base, n + 1);
  return it.type === 'bunk' ? [[`${base}-${n}-0`, BUNK_LINEN.map(s => s.id)]] : [];
}));
// #1021: the actual HEMNES daybed's eight independent existing textile groups.
const daybedSerials = new Map();
export const DAYBED_LINEN_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = daybedSerials.get(base) ?? 0; daybedSerials.set(base, n + 1);
  return it.type === 'daybed' ? [[`${base}-${n}-0`, DAYBED_LINEN.map(s => s.id)]] : [];
}));
// #1012: the three real movable Verona parts, excluding decorative neighboring copies.
const veronaSerials = new Map();
export const VERONA_UPHOLSTERY_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = veronaSerials.get(base) ?? 0; veronaSerials.set(base, n + 1);
  return it.type === 'veronasofa' && ['sofa', 'divan1', 'divan2'].includes(it.part) ? [`${base}-${n}-0`] : [];
});
// #1014: stable independent decorative surfaces on the two actual indoor seats.
const cushionSerials = new Map();
export const CUSHION_MATERIAL_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = cushionSerials.get(base) ?? 0; cushionSerials.set(base, n + 1);
  const specs = it.type === 'sofa' ? [...CUSHIONS.sofa, CUSHIONS.sofaThrow] : it.type === 'armchair' ? [...CUSHIONS.armchair, CUSHIONS.chairThrow] : [];
  return specs.length ? [[`${base}-${n}-0`, specs.map(s => s.materialId)]] : [];
}));
// #1015: the three canonical outdoor cushion groups and the one stored fleece.
const patioTextileSerials = new Map();
export const PATIO_TEXTILE_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = patioTextileSerials.get(base) ?? 0; patioTextileSerials.set(base, n + 1);
  const surface = it.type === 'veronasofa' && ['sofa', 'divan1', 'divan2'].includes(it.part) ? 'cushions'
    : it.type === 'dynbox' && !it.inside && !it.decorative ? 'throw-folded' : null;
  return surface ? [[`${base}-${n}-0`, [surface]]] : [];
}));
// #1027: the six actual speaker cloth fronts/bases, never glass, shells or controls.
const speakerSerials = new Map();
export const SPEAKER_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = speakerSerials.get(base) ?? 0; speakerSerials.set(base, n + 1);
  return ['symfonisk', 'nestmini', 'nesthub'].includes(it.type) ? [`${base}-${n}-0`] : [];
});
// #1026: actual canopy/two cloth shades, never poles, cages or surrounding fixtures.
const shadeCanopySerials = new Map();
export const SHADE_CANOPY_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = shadeCanopySerials.get(base) ?? 0; shadeCanopySerials.set(base, n + 1);
  return Object.hasOwn(SHADE_CANOPY_TEXTILES, it.type) ? [[`${base}-${n}-0`, [SHADE_CANOPY_TEXTILES[it.type].id]]] : [];
}));
// #1028: semantic decorative garments only. The original shell jacket is a HallCare LifeItem,
// never a decorative surface or an invented second item.
export function hangingSurfaceSpecs(item) {
  if (item.type === 'coatrack') return [
    { id: 'garment-coat-2', name: 'Kappan', kind: 'coat', on: 2 },
    { id: 'garment-puffer-4', name: 'Dunjackan', kind: 'puffer', on: 4 },
    { id: 'beanie', name: 'Mössan', kind: 'beanie' },
  ];
  if (item.type !== 'hookrail') return [];
  const c = { ...HOOKS, ...(item.set ? KID_HOOKS[item.set] : {}), ...item };
  const names = { gown: 'Morgonrocken', hoodie: 'Huvtröjan', cap: 'Kepsen', tote: 'Tygkassen' };
  return c.garments.map(g => ({ id: `garment-${g.kind}-${g.on}`, name: g.zip ? 'Tröjan med dragkedja' : names[g.kind], kind: g.kind, on: g.on }));
}
const hangingSerials = new Map();
export const HANGING_MATERIAL_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = hangingSerials.get(base) ?? 0; hangingSerials.set(base, n + 1);
  const specs = hangingSurfaceSpecs(it);
  return specs.length ? [[`${base}-${n}-0`, specs.map(s => s.id)]] : [];
}));
// #1029: seven existing towels; the oven towel has an explicitly new fixed identity.
const towelSerials = new Map();
export const TOWEL_MATERIAL_SURFACES = { ...Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = towelSerials.get(base) ?? 0; towelSerials.set(base, n + 1);
  const surfaces = it.type === 'towelhooks' ? (it.towels ?? TOWEL_HOOKS.towels).map(t => `towel-${t.seed}`) : it.type === 'ragrund' ? ['towel'] : [];
  return surfaces.length ? [[`${base}-${n}-0`, surfaces]] : [];
})), [KITCHEN_TOWEL_MATERIAL.id]: [KITCHEN_TOWEL_MATERIAL.surface] };
// #1030: existing stored cloth groups on the actual KLK and SMÅSTAD, not their fittings.
export const CLOSET_TEXTILE_SPECS = {
  klk: [
    { id: 'hanging', name: 'Hängande plagg' }, { id: 'folded-side', name: 'Sidans tröjor' },
    { id: 'towels', name: 'Vikta handdukar' }, { id: 'folded-back', name: 'Bakre hyllans tröjor' },
  ],
  smastad: [
    { id: 'hanging-left', name: 'Vänstra hängplaggen' }, { id: 'hanging-right', name: 'Högra hängplaggen' },
    { id: 'folded-left', name: 'Vänstra tröjhögen' }, { id: 'folded-right', name: 'Högra tröjhögen' },
    { id: 'cap', name: 'Kepsen' }, { id: 'socks-left', name: 'Vänstra strumporna' },
    { id: 'socks-right', name: 'Högra strumporna' }, { id: 'tote', name: 'Vikta tygkassen' },
  ],
};
const closetSerials = new Map();
export const CLOSET_TEXTILE_SURFACES = Object.fromEntries(FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = closetSerials.get(base) ?? 0; closetSerials.set(base, n + 1);
  return Object.hasOwn(CLOSET_TEXTILE_SPECS, it.type) ? [[`${base}-${n}-0`, CLOSET_TEXTILE_SPECS[it.type].map(s => s.id)]] : [];
}));
export const materialChoices = (category = 'matta', id) => category === 'lugg' ? PILE_CHOICES : category === 'klädsel' ? UPHOLSTERY_MATERIAL_CHOICES : category === 'gardin' ? CURTAIN_MATERIAL_CHOICES : category === 'matta' ? MATERIAL_CHOICES.filter(c => c.id !== 'rug-longpile-bluegrey' || LONG_PILE_MATERIAL_IDS.includes(id)) : [];
const serials = new Map();
export const RUG_MATERIAL_IDS = FURNITURE.flatMap(it => {
  const base = `f-${it.type}-${it.level}-${it.x}-${it.z}`, n = serials.get(base) ?? 0; serials.set(base, n + 1);
  return it.type === 'rug' ? [`${base}-${n}-0`] : [];
});
export const LONG_PILE_MATERIAL_IDS = RUG_MATERIAL_IDS.filter(id => FURNITURE.some(it => it.materialFamily === 'living-room' && id.startsWith(`f-${it.type}-${it.level}-${it.x}-${it.z}-`)));
export const materialChoice = id => [...MATERIAL_CHOICES, ...CURTAIN_MATERIAL_CHOICES, ...UPHOLSTERY_MATERIAL_CHOICES, ...PILE_CHOICES].find(c => c.id === id);
export const validMaterialChoice = (id, surface, choice) => surface === 'pile' ? RUG_MATERIAL_IDS.includes(id) && PILE_CHOICES.some(c => c.id === choice) : ((Object.hasOwn(CLOSET_TEXTILE_SURFACES, id) && CLOSET_TEXTILE_SURFACES[id].includes(surface)) || (Object.hasOwn(TOWEL_MATERIAL_SURFACES, id) && TOWEL_MATERIAL_SURFACES[id].includes(surface)) || (Object.hasOwn(HANGING_MATERIAL_SURFACES, id) && HANGING_MATERIAL_SURFACES[id].includes(surface)) || (Object.hasOwn(SHADE_CANOPY_SURFACES, id) && SHADE_CANOPY_SURFACES[id].includes(surface)) || (surface === 'speaker-fabric' && SPEAKER_MATERIAL_IDS.includes(id)) || (Object.hasOwn(DAYBED_LINEN_SURFACES, id) && DAYBED_LINEN_SURFACES[id].includes(surface)) || (Object.hasOwn(BUNK_LINEN_SURFACES, id) && BUNK_LINEN_SURFACES[id].includes(surface)) || (Object.hasOwn(DOUBLE_BED_LINEN_SURFACES, id) && DOUBLE_BED_LINEN_SURFACES[id].includes(surface)) || (Object.hasOwn(CUSHION_MATERIAL_SURFACES, id) && CUSHION_MATERIAL_SURFACES[id].includes(surface)) || (Object.hasOwn(PATIO_TEXTILE_SURFACES, id) && PATIO_TEXTILE_SURFACES[id].includes(surface)))
  ? UPHOLSTERY_MATERIAL_CHOICES.some(c => c.id === choice) : surface === 'textile' && (choice !== 'rug-longpile-bluegrey' || LONG_PILE_MATERIAL_IDS.includes(id)) &&
  ((UPHOLSTERY_MATERIAL_IDS.includes(id) || BED_UPHOLSTERY_MATERIAL_IDS.includes(id) || VERONA_UPHOLSTERY_MATERIAL_IDS.includes(id)) ? UPHOLSTERY_MATERIAL_CHOICES : RUG_MATERIAL_IDS.includes(id) ? MATERIAL_CHOICES : CURTAIN_MATERIAL_IDS.includes(id) ? CURTAIN_MATERIAL_CHOICES : []).some(c => c.id === choice);
