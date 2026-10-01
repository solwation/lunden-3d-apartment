// Everything the PDF does not tell us. Values marked "guess" should be verified
// against Peab's drawings/photos (see GitHub issues) and adjusted here.
// "bofakta" = Peab's fact sheet for L1002–L1007 (2024-11-08, FOJAB): BH = sill height,
// RH = room height, from https://peabbostad.se/projekt/skane/kv.-lunden/l1007/

export const SLAB = 0.25; // floor slab thickness between the levels (guess)

export const LEVELS = [
  // Entréplan: "Takhöjd ca 3,0 m. Lokalt lägre över tvätt."
  { name: 'Entréplan', floor: 0, ceiling: 3.0 },
  // Övre plan: "Takhöjd ca 2,8 m. Lokalt ca 2,4 m vid sovrummens fönster."
  { name: 'Övre plan', floor: 3.0 + SLAB, ceiling: 2.8 },
];

// Lowered ceilings (soffits), in plan metres relative to the level's floor.
// x/z ranges are clipped to the interior by the walls anyway.
export const SOFFITS = [
  // bofakta: "RH: 2,5m" over Tvätt + Badrum
  { level: 0, x0: 0.2, x1: 2.06, z0: 3.05, z1: 7.6, height: 2.5 },
  // bofakta: "RH: 2,4m" in Sovrum 3 + Sovrum 1, boxed-in ceiling (inklädnad) ~1.5 m deep
  // from the north façade — the access balcony (loftgång) for the units above runs here.
  { level: 1, x0: 0.2, x1: 5.55, z0: 0.46, z1: 0.46 + 1.5, height: 2.4 },
  // bofakta: "RH: 2,5m" in WC/dusch
  { level: 1, x0: 0.2, x1: 1.42, z0: 5.05, z1: 7.6, height: 2.5 },
];

// Peab options (tillval) we have chosen, material/Generella_val_hall_och_entre.jpg:
// "Tillval av dörr i enlighet med bofaktablad" = the dashed wall + door between the upstairs
// hall and Allrum, which makes Allrum a fourth bedroom.
export const OPTIONS = { allrumDoor: true };
// Wall pieces that only exist with an option (plan rectangles). The door's own frame side is
// the end of the Allrum/Sovrum 2 partition; this closes the rest towards WC/dusch.
export const EXTRA_WALLS = [
  { level: 1, option: 'allrumDoor', x0: 1.54, x1: 1.77, z0: 7.6, z1: 7.8 },
];
export const ROOM_RENAMES = [{ level: 1, from: 'Allrum', to: 'Sovrum 4', option: 'allrumDoor' }];
// Room labels the extractor doesn't find in the PDF (used for room detection / minimap).
export const EXTRA_ROOMS = [
  { level: 1, name: 'WC/dusch', x: 0.8, z: 6.4 },
  { level: 0, name: 'Hall', x: 2.75, z: 6.2 }, // the passage by the stair (no label in the plan)
];
// Invisible dividers for room detection where rooms are open to each other (plan rectangles):
// hall | kitchen in line with the hall wall, kitchen | passage, passage | living room.
export const ROOM_DIVIDERS = [
  { level: 0, x0: 2.06, x1: 2.15, z0: 1.76, z1: 3.05 },
  { level: 0, x0: 2.15, x1: 3.45, z0: 4.86, z1: 4.9 },
  { level: 0, x0: 2.15, x1: 3.25, z0: 7.6, z1: 7.8 },
];

export const DOOR_HEIGHT = 2.1;
// Exterior doors have a glazed transom (överljus) above the leaf, like the windows
// (Peab renders of L1004, same unit type). Head height is estimated from the render.
export const EXT_DOOR_HEAD = 2.6;

// Windows, matched to the plan by level, façade and centre x (nearest wins).
// sill = bofakta BH. head = estimated from Peab's renders (guess), kept below the
// lowered ceiling in the north bedrooms. transom = height of the top light (överljus).
export const WINDOWS = [
  { level: 0, facade: 'north', x: 3.85, sill: 0.8, head: 2.6, transom: 0.45 }, // Kök/matplats
  { level: 0, facade: 'south', x: 3.85, sill: 0.6, head: 2.6, transom: 0.45 }, // Vardagsrum
  { level: 1, facade: 'north', x: 1.80, sill: 0.9, head: 2.25, transom: 0 },   // Sovrum 3
  { level: 1, facade: 'north', x: 3.85, sill: 0.7, head: 2.25, transom: 0 },   // Sovrum 1
  { level: 1, facade: 'south', x: 1.45, sill: 0.7, head: 2.4, transom: 0.4 },  // Allrum
  { level: 1, facade: 'south', x: 3.85, sill: 0.7, head: 2.4, transom: 0.4 },  // Sovrum 2
];

// Building envelope around the apartment (from the brochure: "staplade radhus" — two-storey
// units on top with entrances from access balconies on floor 3; red brick façades).
export const FENCE_HEIGHT = 1.8; // bofakta: Skärmvägg H = 1,8 m

export const BUILDING = {
  upperStoreys: 2,        // the stacked unit above (two storeys)
  storeyHeight: 3.0,
  loftgangDepth: 1.96,    // walkway over our north bedrooms: z 0 → façade of the upper unit
  neighbours: 2,          // identical units on each side (row)
  railHeight: 1.1,
};

// Fixed cabinet heights by plan label (fallback: kitchen base cabinet).
export const CABINET_HEIGHT = {
  EL: 2.1, G: 2.1, L: 2.1, 'U/M': 2.1, K: 2.1, F: 2.1,
  TT: 0.85, TM: 0.85, DM: 0.9,
};
export const BASE_CABINET = 0.9;
// WC-stol Ifö Spira 6260 (our choice in both bathrooms): approx. W 35.5 × D 65 cm, seat 42 cm,
// tank top 84 cm (Ifö product sheet, rounded). Replaces the plan's schematic symbol (#14).
export const TOILET = { width: 0.355, depth: 0.65, seatHeight: 0.42, tankHeight: 0.84, tankDepth: 0.17 };
export const SHELF_HEIGHT = 2.0; // unlabelled shelving in the upstairs Klk

export const PLAYER = {
  eye: 1.62,
  radius: 0.22,
  walk: 1.6,   // m/s
  run: 3.2,
  turnSpeed: 1.9, // rad/s for the arrow keys
  stepUp: 0.45,
  headroom: 1.85,
};

// Two flights with winders between them (from the stair outline on both plans).
// Flight A runs east along the south half, winders turn 180° at the east end,
// flight B runs west along the north half and arrives in the upstairs hall.
export const STAIR = {
  aX0: 3.50,                 // bottom step (Entréplan plan)
  aZ: [6.72, 7.54],
  center: [4.645, 6.654],    // winder pivot (Övre plan plan)
  winderX1: 5.49,
  winderZ: [5.77, 7.54],
  bX1: 3.86,                 // top step (Övre plan stair outline)
  bZ: [5.77, 6.60],
  treads: { a: 4, w: 8, b: 3 },
  // Upstairs slab opening = stair outline on Övre plan.
  hole: { x0: 3.86, x1: 5.49, z0: 5.77, z1: 7.54 },
  railHeight: 1.1, // bofakta: H 1,1 m
};

export const COLORS = {
  sky: 0xbfd8ea,
  wall: 0xf1f1ee,   // Väggfärg NCS S 0500-N (material choice)
  ceiling: 0xfbfbf9,
  floor: 0xc9a77c,
  tile: 0xd6d9da,
  cabinet: 0xe8ebec,
  counter: 0x5b5f62,
  appliance: 0xf7f7f7,
  porcelain: 0xffffff,
  frame: 0xf5f5f5,
  glass: 0xa9cce3,
  door: 0xf1f1ee,   // Innerdörr Stable GW / skjutdörrar NCS S 0500-N
  rail: 0x6b7378,
  stair: 0xdccfba,  // Trappa vitlaserad ek/vit: white-lacquered oak treads …
  riser: 0xf4f4f1,  // … white risers and stringers
  grass: 0x7fa65c,
  patio: 0xbdb7ab,
  hedge: 0x46703a,
  fence: 0xa7b6aa, // grey-green screen wall (skärmvägg), Peab render
  brick: 0x8a3b2a,
  mortar: 0xcfc6b8,
  street: 0x9b9a95,
  balcony: 0x8fa396, // pinnaräcke grågrön (brochure)
};

// Fixed interior from our material choices in Peab's option portal (screenshots in
// material/, 2026-10-01). Colours are picked from the product photos / Peab's render.
export const FINISH = {
  // Parkettgolv Ek Chalk: white-stained oak. Colour from the swatch (avg 177/159/145, lifted
  // a little for the indoor lighting); 1-stav planks 18 × 200 cm (typical size — guess).
  parquet: { base: [204, 186, 170], width: 0.18, length: 2.0 },
  hallTile: { w: 0.6, h: 0.3, color: 0x7a7c7d },  // Granitkeramik City Amsterdam 30×60, rak
  wetTile: { w: 0.15, h: 0.15, color: 0x737577 }, // Granitkeramik City Amsterdam 15×15
  wallTile: { w: 0.4, h: 0.2, color: 0xf4f4f2 },  // Kakel vit matt 20×40, rak liggande
  splash: { w: 0.2, h: 0.1, color: 0xf6f6f4, grout: 0xc9cdcc }, // Stänkskydd vit matt 10×20,
  // halvt förband liggande, Kakelfog Sopro ljusgrå 16
  grout: 0xb9bbbb,
  kitchenFront: 0x8d9886, // Kökslucka Form Tall (grey-green shaker)
  counter: 0xc2c1bb,      // Laminatbänkskiva Delaware stone (kitchen + Tvätt)
  handle: 0x1a1b1c,       // Handtag Solo svart cc 128 / Köksblandare ARM184 mattsvart
  steel: 0xc3c7ca,        // Kyl & frys rostfri, ventilationsgaller, diskho Intra
  black: 0x141516,        // Ugn EOK8P2B0 Pure Black, mikro KMFE264TEX, häll EH60KB6BF
  laundryFront: 0xf2f3f1, // Lucka Arkitekt plus Frost (Tvätt)
  vanity: 0x4d4f51,       // Kommod Core Grip 60 / Core XS Grip 50, Carbon Grey
  chrome: 0xd7dadc,       // Rt2 blandare, takdusch Tvm 7200, duschset Rt 105, Alnön beslag
};

// Golvsockel vitmålad NCS S 0500-N (Art 5002225): height × thickness (typical size — guess).
export const SKIRTING = { h: 0.07, t: 0.012 };

// Rooms with tiled floors / walls (plan rectangles, metres). Walls are tiled up to `wallTile`
// (the lowered ceiling height) on every wall face inside the rectangle.
export const TILED_ROOMS = [
  { level: 0, name: 'Hall', x0: 0.2, x1: 2.1, z0: 0.3, z1: 3.1, floor: 'hallTile' },
  { level: 0, name: 'Tvätt', x0: 0.2, x1: 2.06, z0: 3.1, z1: 4.88, floor: 'wetTile' },
  { level: 0, name: 'Badrum', x0: 0.2, x1: 2.06, z0: 4.88, z1: 7.6, floor: 'wetTile', wallTile: 2.5 },
  { level: 1, name: 'WC/dusch', x0: 0.2, x1: 1.48, z0: 5.13, z1: 7.6, floor: 'wetTile', wallTile: 2.5 },
];

// Kitchen (Kök / matplats): the plan's cabinets inside `area` are built as a fitted kitchen
// after material/Köksritning.jpg (our planning): tall oven/microwave unit, base run with
// sink + hob, wall cabinets above, freestanding fridge + freezer with top cabinets.
export const KITCHEN = {
  level: 0,
  area: { x0: 3.4, x1: 5.6, z0: 0.4, z1: 5.5 },
  plinth: 0.1,
  baseTop: 0.9,          // top of base carcass; worktop 30 mm on top (bänkhöjd 0,93)
  worktop: 0.03,
  top: 2.25,             // top line of tall units and wall cabinets (guess)
  wallBottom: 1.45,      // underside of wall cabinets (guess, ~52 cm above the worktop)
  wallDepth: 0.35,
  hoodBottom: 1.6,       // underside of the hood (Spiskåpa Tango) under the hob cabinet
  hoodHeight: 0.08,
  fridgeHeight: 1.86,    // Electrolux LRT7ME39X / LUS7ME28X: 186 cm
  grille: 0.06,          // ventilationsgaller rostfri (over fridge/freezer and microwave)
  sink: { w: 0.5, d: 0.4 }, // Diskho Intra Linea 5040, underlimmad
  hob: { w: 0.58, d: 0.52 }, // Induktionshäll EH60KB6BF
};

// Changelog note (src/changelog.js) on the freezer door: its front is the plan's F cabinet
// z0 − 4 cm (the freestanding freezer sticks out, see interior.js). rotY π = facing north.
export const CHANGELOG_NOTE = { x: 4.38, y: 1.42, z: 4.8844 - 0.04 - 0.002, rotY: Math.PI, w: 0.16, tilt: -0.05 };

// Baked ambient occlusion (src/ao.js): darkening at a wall = strength, falling off over
// `radius` metres. Tuned by eye on screenshots.
export const AO = {
  floor: { strength: 0.4, radius: 0.2 },
  ceiling: { strength: 0.3, radius: 0.3 },
};

// Furniture (issue #8). IKEA LANDSKRONA, Gunnared ljusgrön, oak legs.
// 3-sits: 204 × 89 × 78 cm, seat height 44, seat depth 61, armrest height 64 (ikea.com).
// With schäslong 282 cm wide, chaise 158 cm deep; armchair 89 × 89; footstool ~92 × 53 × 44
// (series dimensions, not on the product page — estimates).
export const LANDSKRONA = {
  fabric: 0xa7b39a, // Gunnared ljusgrön
  oak: 0xc9a67a,
  height: 0.78, seatHeight: 0.44, seatDepth: 0.61, armHeight: 0.64, armWidth: 0.12,
  depth: 0.89, legHeight: 0.15,
  sofaWidth: 2.82, chaiseWidth: 0.9, chaiseDepth: 1.58,
  chairWidth: 0.89, stool: { w: 0.92, d: 0.53, h: 0.44 },
};

// Placement in plan metres. rot = direction the seat faces, degrees (0 = north/−z,
// 90 = west, 180 = south, −90 = east), same convention as the ?at= camera yaw.
export const FURNITURE = [
  // Vardagsrum: sofa with its back to the window (south wall), chaise in the SE corner
  { type: 'sofa', level: 0, x: 5.5 - 2.82 / 2, z: 12.15 - 0.89 / 2, rot: 0, chaise: 'right' }, // sitter's right = east
  // armchair + footstool in the opposite (NW) corner, turned towards the room
  { type: 'armchair', level: 0, x: 0.78, z: 8.38, rot: -135 },
  { type: 'footstool', level: 0, x: 1.33, z: 8.93, rot: -135 },
  { type: 'floorlamp', level: 0, x: 0.42, z: 8.02 },
  { type: 'sidetable', level: 0, x: 1.52, z: 8.12, flower: true },
  // Example furniture to get a feel for the rooms (issue #8; not chosen by us — move freely).
  // Beds: rot = direction from the head to the foot end; w × l = mattress size.
  { type: 'bed', level: 1, x: 5.55 - 1.1, z: 2.3, rot: 90, w: 1.6, l: 2.0 },  // Sovrum 1, head east (clear of the Klk)
  { type: 'bed', level: 1, x: 0.2 + 1.1, z: 2.6, rot: -90, w: 0.9, l: 2.0 },  // Sovrum 3, head west
  { type: 'bed', level: 1, x: 5.55 - 1.1, z: 10.3, rot: 90, w: 1.6, l: 2.0 }, // Sovrum 2
  { type: 'bed', level: 1, x: 0.2 + 1.1, z: 10.0, rot: -90, w: 0.9, l: 2.0 }, // Sovrum 4
  // Matplats by the kitchen window: table 120 × 80, four chairs
  { type: 'table', level: 0, x: 3.6, z: 1.6, w: 1.2, d: 0.8 },
  { type: 'chair', level: 0, x: 3.3, z: 0.95, rot: 180 },
  { type: 'chair', level: 0, x: 3.9, z: 0.95, rot: 180 },
  { type: 'chair', level: 0, x: 3.3, z: 2.25, rot: 0 },
  { type: 'chair', level: 0, x: 3.9, z: 2.25, rot: 0 },
];
