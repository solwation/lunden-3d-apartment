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

// Name signs on the hall side of the bedroom doors (src/signs.js). Matched to the nearest door.
export const DOOR_SIGNS = [
  { level: 1, room: 'Sovrum 1', text: 'Sarah & Ofluf', color: '#fde9d9' },
  { level: 1, room: 'Sovrum 3', text: 'Livia & Tuva', color: '#e6f3e1' },
  { level: 1, room: 'Sovrum 2', text: 'Walter & Kian', color: '#dfeefb' },
  { level: 1, room: 'Sovrum 4', text: 'Tilly', color: '#fde2ee' },
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
// Neighbourhood around the row (St Lars, Lund): red-brick blocks with gable roofs and trees,
// after Peab's drone photo and renders. Positions are illustrative, not surveyed (#2).
export const SURROUNDINGS = {
  bay: 3.0, storey: 3.0,  // façade texture: one window per 3 × 3 m
  blocks: [
    { x0: -26, x1: 32, z0: -32, z1: -21, storeys: 4 }, // across the street (north)
    { x0: -22, x1: 28, z0: 36, z1: 47, storeys: 4 },   // across the courtyard (south)
    { x0: 25, x1: 37, z0: -8, z1: 24, storeys: 3 },    // east
    { x0: -31, x1: -19, z0: -8, z1: 24, storeys: 3 },  // west
  ],
  treeAreas: [
    { x0: -20, x1: 26, z0: 20, z1: 33, n: 14 },     // courtyard beyond the patios
    { x0: -24, x1: 30, z0: -19.5, z1: -15.5, n: 9 }, // verge across the street
    { x0: 18.5, x1: 23, z0: -3, z1: 30, n: 5 },
    { x0: -17, x1: -12.5, z0: -3, z1: 30, n: 5 },
  ],
};

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
  sky: 0xcfe0ec,   // horizon (fog); the sky above is a gradient, see surroundings.js
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
  rail: 0xf4f4f1,   // stair railing: white balusters + handrail (Peab 3D plan of L1002–L1007)
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
  room: 'Kök / matplats', // room name (room detection) for its light switch
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

// Cork board with photos of petted cats (src/catboard.js), on the short wall between the hall
// and the kitchen (its kitchen face, x 2.15, z 0.46–1.76). rotY π/2 = facing east.
export const CAT_BOARD = { x: 2.15, y: 1.5, z: 1.11, w: 1.1, h: 0.76, rotY: Math.PI / 2 };

// Day cycle (src/daycycle.js): one day in `minutes` real minutes. The sun follows the real solar
// path for the date (declination, hour angle) at Kv. Lunden — Skåne, ~55.7° N 13.2° E (Lund;
// close enough anywhere in western Skåne). Clock time is Swedish local time (CEST in summer).
// Every visit starts at `startHour` on the 15th of the visitor's month, unless ?time=HH[.h] /
// ?month=1–12 is given. The wall clock in the kitchen fast-forwards at `spool` hours per second.
export const DAY = {
  minutes: 12, startHour: 7, lat: 55.7, lon: 13.2, spool: 1.5,
  moonlight: 0.35, nightAmbient: 0.05,
};

// Analog wall clock (src/wallclock.js) on the kitchen side of the Tvätt/Badrum wall, to the
// right of the Badrum door seen from the kitchen (wall face x 2.152, z 3.145–5.244, door at
// 5.244). rotY π/2 = facing east. Diameter 30 cm (typical kitchen clock).
export const WALL_CLOCK = { x: 2.152, y: 2.0, z: 4.55, rotY: Math.PI / 2, d: 0.3 };

// Room lights (src/lights.js). Intensities are candela-ish (three.js physical lights), tuned by
// eye at night. `pool` = point lights shared by the nearest lit lamps (keep small: Iris 640).
export const LIGHTING = {
  pool: 4,
  switchHeight: 1.05,                     // centre of the switch above the floor
  ceiling: { intensity: 2.4, range: 6, color: 0xffe2b8 },
  spots: { intensity: 2.0, range: 4, color: 0xfff0dc },
  pendant: { intensity: 2.2, range: 5, color: 0xffd9a8 },
  floorLamp: { intensity: 1.6, range: 5, color: 0xffd59a },
  wetRooms: ['Badrum', 'WC/dusch'],       // spots in the soffit instead of a ceiling lamp
  pendants: [{ level: 0, room: 'Kök / matplats', x: 3.5, z: 1.72, drop: 1.25 }], // over the dining table
  // switches for rooms without a door of their own (normal = the way the wall faces)
  manual: [
    { level: 0, room: 'Hall', x: 1.95, z: 0.465, normal: [0, 1] },          // by the front door
    { level: 0, room: 'Kök / matplats', x: 2.15, z: 1.65, normal: [1, 0] },  // beside the cat board
    { level: 0, room: 'Vardagsrum', x: 3.4, z: 7.8, normal: [0, 1] },
    { level: 1, room: 'Hall', x: 2.65, z: 5.13, normal: [0, 1] },           // between the bedroom doors
    { level: 1, room: 'Klk', x: 4.85, z: 4.28, normal: [0, 1] },
    { level: 0, room: 'Klk', x: 3.35, z: 5.55, normal: [-1, 0] },        // outside, by the door (it spans the whole Klk)
  ],
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

// Patio (src/patio.js). Cushion colour of the Oslo set and the parasol (Ø 3 m, centre pole,
// ecru) are guesses. Seasons (months 1–12): the parasol is up in `parasolMonths` while the sun
// is up and folded otherwise; beers on the table in summer between `beerHours`; a snowman on
// the lawn beyond the hedge in winter.
export const PATIO = {
  frame: 0x3b3e41, cushion: 0xbdbcb6, tableTop: 0x45484b,
  seatHeight: 0.42, armHeight: 0.62, height: 0.76, depth: 0.72, long: 1.98, short: 1.86,
  parasol: { radius: 1.5, height: 2.45, color: 0xe8e1d1, months: [4, 5, 6, 7, 8, 9] },
  pot: { r: 0.3, h: 0.62, color: 0x55595c }, // fibre-clay planter Ø 60 cm (guess)
  beerMonths: [6, 7, 8], beerHours: [12, 23],
  snowman: { x: 3.1, z: 19.2, months: [12, 1, 2] },
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
  // Soffbord ILVA Woodstock, top i oljebehandlad ekfaner (art. 1055729): 120 × 60 × 47 cm, legs in
  // oiled solid oak, a fixed shelf below (ilva.dk product page). Centred on the three seats
  // (x 2.68–4.60), 40 cm in front of the sofa (front at z 11.26).
  { type: 'coffeetable', level: 0, x: 3.64, z: 11.26 - 0.4 - 0.3, w: 1.2, d: 0.6, h: 0.47 },
  // Uteplats (paved z 12.75–16.8 in front of the hedge, see PATIO): Plantagen Hörngrupp Oslo
  // antracit (art. 558848): corner sofa 198 × 72 × 76 + 186 × 72 × 76 cm on an aluminium frame,
  // table 120 × 60 × 40 cm (plantagen.se). Backs to the hedge and the east screen wall,
  // seats facing north-west; the corner is on the sitter's right (east).
  { type: 'loungesofa', level: 0, x: 5.66 - 1.98 / 2, z: 16.79 - 0.72 / 2, rot: 0 },
  { type: 'loungetable', level: 0, x: 4.15, z: 15.45, beers: true },
  { type: 'parasol', level: 0, x: 3.05, z: 15.7 },
  // large planters with exotic plants (the user's wish): by the patio door, in the SW corner
  // by the hedge, and beside the living-room window
  { type: 'planter', level: 0, x: 0.45, z: 13.25, plant: 'palm' },
  { type: 'planter', level: 0, x: 0.5, z: 16.35, plant: 'banana' },
  { type: 'planter', level: 0, x: 5.3, z: 13.2, plant: 'agave' },
  // Upstairs bedrooms (the user's plan). Beds: rot = direction from the head to the foot end.
  { type: 'bed', level: 1, x: 5.55 - 1.1, z: 2.3, rot: 90, w: 1.6, l: 2.0 },  // Sovrum 1 (Sarah & Ofluf), head east, clear of the Klk
  // Bunks: long side against the side wall, head end against the façade (the user's wish);
  // the ladder ends up on the room side at the foot end.
  { type: 'bunk', level: 1, x: 0.2 + 0.5, z: 0.47 + 1.05, rot: 180, w: 0.9, l: 2.0, sheets: 'unicorn' }, // Sovrum 3 (Livia & Tuva)
  { type: 'bunk', level: 1, x: 5.55 - 0.5, z: 12.23 - 1.05, rot: 0, w: 0.9, l: 2.0, sheets: 'vader' }, // Sovrum 2 (Walter & Kian)
  // Sovrum 4 (Tilly): IKEA HEMNES dagbädd m 3 lådor, vit, 207 × 89 × 83 cm (ikea.com), back to the
  // west wall, with pink cushions. rot = the way the seat faces.
  { type: 'daybed', level: 1, x: 0.2 + 0.46, z: 10.0, rot: -90 },
  // Matplats: table 180 × 90 with the short end to the kitchen window, three chairs on each
  // long side, dark brown wood (the user's wish). Kept a little west of the window centre so
  // the east chairs clear the kitchen fronts (x 4.95).
  { type: 'table', level: 0, x: 3.5, z: 1.72, w: 0.9, d: 1.8, wood: 'dark' },
  ...[1.12, 1.72, 2.32].flatMap((z) => [
    { type: 'chair', level: 0, x: 3.5 - 0.62, z, rot: -90, wood: 'dark' }, // west side, facing east
    { type: 'chair', level: 0, x: 3.5 + 0.62, z, rot: 90, wood: 'dark' },  // east side, facing west
  ]),
];
