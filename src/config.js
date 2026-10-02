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
  { level: 1, room: 'Sovrum 1', text: 'Sarah & Olof', color: '#fde9d9' },
  { level: 1, room: 'Sovrum 3', text: 'Livia & Tuva', color: '#e6f3e1' },
  { level: 1, room: 'Sovrum 2', text: 'Walter & Kian', color: '#dfeefb' },
  { level: 1, room: 'Sovrum 4', text: 'Tilly', color: '#fde2ee' },
];

// Interior doors: standard Swedish 21M leaf (2.1 m). Exterior doors have a glazed transom (överljus)
// above the leaf, like the windows. Checked (#3) against Peab's render of L1004's living room, same
// unit type (docs/peab/l1004-vardagsrum-render.jpg, scaled by RH 3.0 m): patio door head ≈ 2.65 m,
// leaf incl. frame ≈ 2.2 m — within the estimate's error, so the values are kept.
export const DOOR_HEIGHT = 2.1;
// Interior door finish (#45): the leaf fills the opening with an even `gap` (fog) at hinge, latch and
// head; white architraves (dörrfoder) `width` × `thickness` around the opening on both wall faces,
// in the door colour. On a sliding door's track side they are `slideThickness` thin, so the panel
// (running 1 cm off the wall) clears them.
export const DOOR_TRIM = { gap: 0.003, width: 0.07, thickness: 0.012, slideThickness: 0.008 };
export const EXT_DOOR_HEAD = 2.6;

// Windows, matched to the plan by level, façade and centre x (nearest wins).
// sill = bofakta BH. head/transom (height of the top light, överljus) measured (#3) on Peab's render
// of L1004's living room (docs/peab/l1004-vardagsrum-render.jpg, RH 3.0 m as scale): sill ≈ 0.65,
// transom bar ≈ 2.15, head ≈ 2.6 m — no floor-to-ceiling glazing towards the patio. Upstairs heads
// are still estimates, kept below the lowered ceiling in the north bedrooms.
export const WINDOWS = [
  { level: 0, facade: 'north', x: 3.85, sill: 0.8, head: 2.6, transom: 0.45 }, // Kök/matplats
  { level: 0, facade: 'south', x: 3.85, sill: 0.6, head: 2.6, transom: 0.45 }, // Vardagsrum
  { level: 1, facade: 'north', x: 1.80, sill: 0.9, head: 2.25, transom: 0 },   // Sovrum 3
  { level: 1, facade: 'north', x: 3.85, sill: 0.7, head: 2.25, transom: 0 },   // Sovrum 1
  { level: 1, facade: 'south', x: 1.45, sill: 0.7, head: 2.4, transom: 0.4 },  // Allrum = Sovrum 4 (Tilly)
  // Sovrum 2 has a smaller window than Sovrum 4 (the user, #107) — like Sovrum 3 vs Sovrum 1 on the north
  // side. The PDF draws it 1.41 m; `width` (narrows the opening around its centre) and sill/head are *guess*.
  { level: 1, facade: 'south', x: 3.85, sill: 0.9, head: 2.25, transom: 0, width: 1.2 }, // Sovrum 2
];

// Flower pots on the inner window boards (#136, the user: "blomkrukor med blommor i alla fönsterkarmar";
// src/sillplants.js). Plants per window in plan order (Entréplan kitchen, living room; Övre plan Sovrum 3, 1, 4, 2),
// 2–3 pots each. Our picks.
export const SILL_PLANTS = {
  kinds: ['pelargon', 'orchid', 'violet', 'cactus', 'ivy', 'basil'],
  byWindow: [['basil', 'pelargon', 'basil'], ['orchid', 'ivy', 'pelargon'], ['violet', 'cactus'], ['orchid', 'pelargon', 'ivy'], ['violet', 'pelargon', 'cactus'], ['cactus', 'ivy']],
  skip: [[1, 2]], // [sill, pot]: no pot there (the SYMFONISK lamp stands in its place on the window board behind the sofa, #186)
  colors: { pelargon: 0xd8283a, orchid: [0xf7f2f5, 0xe58fc4], cactus: 0xff6fa8, violet: 0x7b3fb5 },
};

// The site, measured on FOJAB's situation plan and overview plans in Peab's plan brochure
// (docs/peab/, 1:500; drawn with Hus L horizontal, so the plan axes are ours: x along the row,
// z towards the courtyard; metres from our unit's NW outer corner). Scale from the unit pitch.
// Kv. Lunden = four buildings around a courtyard on top of a garage: Hus L "Parklängan" (ours)
// along Sankt Lars väg, the point blocks Å-huset A, B, C to the south/west. The ground drops
// ~3 m south of the courtyard (A/B have a suterräng floor) towards S:t Lars park and Höje å.
// Buildings outside the plot (schools, shop, villa) are placed from the Google Maps screenshot
// (docs/tomten-google-maps.jpg) — illustrative boxes, not surveyed.
export const SITE = {
  // Terrain (#79). Kv. Lunden stands on a garage box: the courtyard ("den upphöjda gården", info brochure
  // p. 16) lies on the garage deck at our Entréplan / patio level (y 0; the lower row houses have their
  // patios "mot den gemensamma gården", and their entrances "direkt från gatan", so Sankt Lars väg north
  // of Hus L is at y 0 too). Around the box the ground lies one storey lower: Å-husen A and B have a
  // "Våning -1 (sutteräng)" (overview plans p. 24) and the green between A and B lies "utanför den
  // upphöjda gården och ner mot å-rummet". `park` = that level. `box` = the garage box (plan rects);
  // its edges are traced on the situation plan between the buildings — guesses. South of Hus L the
  // roads outside the box go down to the park level over `slope` m (guess). The garage entrance is
  // at Karpvägen by Hus C ("NEDFART TILL GARAGE UNDER KVARTERET", situation plan p. 3); its exact
  // spot is a guess.
  terrain: {
    park: -3, north: 12.7, slope: 8,
    // the box under the Borggården (between Hus L, C and A) and the yard south of Hus C (situation plan:
    // the second pergola, sandbox and odlingslådor sit there; the green between A and B is outside it)
    box: [{ x0: -80, x1: 18, z0: 12.7, z1: 30.2 }, { x0: -80, x1: -43, z0: 30.2, z1: 51 }],
    garageDoor: { x: -80, z0: 42, z1: 47.5, h: 2.6 }, // the arrow "GARAGE" by Karpvägen, z ≈ 44
    // the courtyard's edge behind our row (#148, Peab's render: Å-hus with a cyclist below): a brick retaining
    // wall with a light slatted railing, a straight stair with a landing from the courtyard (y 0) down to the
    // park level, and a paved cycle path along the foot of the wall. Position read off the situation plan (guess).
    stairs: { x0: 12.4, x1: 14.0, z: 30.2, step: 0.3, landing: 1.0 }, cyclePath: { x0: 9.6, x1: 22, z0: 37.2, z1: 39.8 },
  },
  bay: 3.0, storey: 3.0,  // façade texture of the other blocks: one window per 3 × 3 m
  // corner loggias on the Å-husen (#145; the overview plans docs/peab/oversikt-vaning-*.png draw the corners notched,
  // Peab's renders show loggias open on both sides there): every corner is cut `d` × `d` m over the full height,
  // white slabs and rendered inner walls, a brick pier at the outer corner, a slatted railing in the façade line.
  // `plants` = share of the loggias with a plant. Sizes are guesses read off the 1:500 plans.
  loggia: { d: 2.3, pier: 0.45, rail: 1.05, plants: 0.35 },
  old: { bay: 2.6, storey: 3.6, roofPitch: 0.6 }, // the old S:t Lars buildings (style: 'old'): rise = pitch × half depth
  // the school straight across Sankt Lars väg (#126, docs/foton/rakt-over-gatan-tegelmur-skolbyggnad.jpg): two high
  // storeys of brick with white quoins, trim and plinth, arched windows below, square ones above, a dark metal
  // roof with chimneys. One façade texture tile = a bay × the whole height (`storey`); `rows` = window-light
  // centres and sizes. A greenhouse in its yard and a 2.3 m brick wall with a black coping along the pavement.
  school: { bay: 3.0, storey: 8.6, roofPitch: 0.32, rows: [{ y: 2.05, s: [0.95, 1.6, 1] }, { y: 5.95, s: [0.95, 1.35, 1] }],
    wall: { x0: -26, x1: 30, z: -32.15, h: 2.3, t: 0.3 }, greenhouse: { x0: 13, x1: 21, z0: -36.8, z1: -33.6, h: 2.2, ridge: 1.0 },
    chimneys: [-14, -3, 8, 17] },
  // HepCat Store and the long brick building behind it, east of our row across Sankt Lars väg (#127, the user's photos
  // docs/foton/hepcat-store-sidan-byggnadsstallning.jpg, sidogatan-tegelhus-plattak-byggplats.jpg): a storey and a
  // half of brick with white pilasters and a white rendered middle part with its own gable, a dark standing-seam
  // metal roof; behind it a long low brick building with dormers and yellow-framed windows. `rows` = window lights.
  hepcat: { bay: 3.2, storey: 4.2, rows: [{ y: 1.7, s: [1.1, 1.0, 1] }] },
  hepcatWhite: { bay: 4.0, storey: 6.0, rows: [{ y: 1.7, s: [1.1, 1.0, 1] }, { y: 4.4, s: [0.6, 0.8, 1] }] },
  longhouse: { bay: 2.6, storey: 3.8, rows: [{ y: 1.6, s: [0.9, 1.2, 1] }], dormers: 5 },
  blocks: [
    // Kv. Lunden, Å-husen (overview plans): storeys counted from `base`; red brick, low hip roof
    { name: 'Hus A', x0: -10.2, x1: 9.5, z0: 29.6, z1: 54.2, base: -3, storeys: 5, roof: 'hip' },  // våning -1…4
    { name: 'Hus B', x0: -43.4, x1: -23.7, z0: 34.2, z1: 58.6, base: -3, storeys: 4, roof: 'hip' }, // våning -1…3
    { name: 'Hus C', x0: -73.0, x1: -53.3, z0: 12.5, z1: 37.5, base: 0, storeys: 5, roof: 'hip' },  // våning 1…5
    // outside the plot (#47): the old S:t Lars hospital buildings, as on Peab's drone photo and aerial
    // render (docs/peab/): red brick with white trim, steep dark hip roofs, high storeys and tall
    // white windows. Storey counts and heights are read off those pictures — guesses, not surveyed.
    { name: 'HepCat Store', x0: 31, x1: 39, z0: -9, z1: 7, base: 0, storeys: 1, roof: 'gable', style: 'hepcat', chimneys: [-5, 4] }, // #127
    { name: 'HepCat Store, the white middle', x0: 30.6, x1: 39, z0: -2.2, z1: 2.2, base: 0, storeys: 1, roof: 'gable', style: 'hepcatWhite' },
    { name: 'The long brick building', x0: 32, x1: 41, z0: 9, z1: 21, base: 0, storeys: 1, roof: 'gable', style: 'longhouse' },
    { name: 'The long brick building (lower part)', x0: 32, x1: 41, z0: 21, z1: 46, base: -3, storeys: 1, roof: 'gable', style: 'longhouse' },
    { name: 'Realgymnasiet', x0: 5, x1: 70, z0: -74, z1: -50, base: 0, storeys: 3, roof: 'hip', style: 'old' },
    // straight across the street from our kitchen (#126): a long two-storey school with end pavilions that stand
    // a little forward (the user's photos; position and length are guesses), behind a brick wall
    { name: 'Skolan över gatan', x0: -21.5, x1: 25.5, z0: -48, z1: -38, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'Skolan, västra flygeln', x0: -22, x1: -13, z0: -48.4, z1: -37.4, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'Skolan, östra flygeln', x0: 17, x1: 26, z0: -48.4, z1: -37.4, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'S:t Lars (old hospital)', x0: -62, x1: -22, z0: -62, z1: -46, base: 0, storeys: 3, roof: 'hip', style: 'old' },
    { name: 'Montessorigrundskolan', x0: -78, x1: -60, z0: -115, z1: -70, base: 0, storeys: 2, roof: 'hip', style: 'old' },
    { name: 'Villa', x0: -64.5, x1: -48.5, z0: 69, z1: 87, base: -3, storeys: 3, roof: 'hip', style: 'old' }, // brick house, hip roof
  ],
  // The street details (#128, src/street.js; the user's photos in docs/foton/): granite curbs along Sankt Lars väg,
  // patched asphalt, slender street lamps with a curved arm (lit at night by emissive only), a zebra crossing,
  // a temporary yellow traffic light and warning signs for the building site, a cobbled corner and fallen leaves
  // in the autumn months. Positions are our picks.
  street: {
    curbs: [{ x0: -95, x1: 22, z: -24 }, { x0: -95, x1: 30, z: -30 }], curbZ: [{ x: 22, z0: -24, z1: 12.7 }, { x: 30, z0: -30, z1: 12.7 }],
    patches: [[-31, -27.6, 4.5, 1.6], [-6, -25.4, 2.2, 1.0], [4.5, -28.3, 7, 1.2], [15, -26, 1.2, 1.2], [26, -12, 1.4, 3.5], [-55, -28.5, 3, 1.4]],
    lamps: { h: 6.2, arm: 1.3, our: { z: -22.0, x0: -78, x1: 18, step: 24 }, east: { x: 21.0, z0: -12, z1: 8, step: 20 } },
    crossing: { x0: 9.5, x1: 12.5, z0: -30, z1: -24 },
    trafficLight: { x: 8.6, z: -23.5 }, warnings: [[13.2, -23.2], [16, -23.3]],
    cobbles: { x0: 18, x1: 22, z0: -21.5, z1: -18.5 },
    leaves: { n: 1400, months: [9, 10, 11], areas: [[-60, 20, -24, -18], [-30, 30, -32.1, -30.05], [20, 22, -24, 12]] },
    // signs (#129, the user's photos): the bus stop on the far pavement, the red "Flyttad" sign on ours by the curb,
    // a no-parking sign at the car park, HepCat's A-board on its pavement. [x, z, facing yaw°]
    busStop: [2.5, -31.3, 0], moved: [6.5, -23.75, 0], noParking: [-6.5, -21.0, 0], aBoard: [30.0, -4.5, -90],
  },
  // Life on the street (#113, src/streetlife.js; Peab's aerial docs/peab-flygbild-soder.png): the car park north
  // of Hus L marked out in two rows of stalls with parked cars (colours ours; the teal one is the electric car in
  // the render), bikes leaning by some of Hus L's entrances (not ours), and the square in front of Hus C towards
  // the street: light stone paving, raised beds with corten edges and sitting steps, bike racks. All guesses.
  life: {
    lot: { x0: -50, x1: -6, z0: -20, z1: -9, stall: 2.5, depth: 5 }, fill: 0.65,
    carColors: [0xf0f0ec, 0x23272c, 0x8d9399, 0x1f6f78, 0x7b1e22, 0x2d4e7a, 0xc9c3b8, 0x0f1012],
    bikes: [[-40.2, -0.9], [-39.5, -0.9], [-28.6, -0.9], [-17.4, -0.9], [-16.7, -0.9], [-5.6, -0.9], [12.9, -0.9]], // x, z (along the façade)
    square: { x0: -72, x1: -47.5, z0: 0.5, z1: 12.3 },
    beds: [[-70, -63, 2, 4.5], [-58, -52, 2, 4.5], [-71, -66.5, 7.5, 10.5]], // x0, x1, z0, z1
    steps: { x0: -63, x1: -58, z0: 2.4, n: 3, rise: 0.15, tread: 0.4 },
    racks: [[-64, 7.2, 6], [-55, 7.2, 5]], // x0, z, bikes
  },
  // asphalt (y follows the ground: the street level north of Hus L and on the garage box, park level around it)
  roads: [
    { name: 'Sankt Lars väg', x0: -95, x1: 30, z0: -30, z1: -24 },
    { name: 'Sankt Lars väg', x0: 22, x1: 30, z0: -30, z1: 200 },
    { name: 'Karpvägen', x0: -88, x1: -80, z0: -30, z1: 200 },
    { name: 'P-platser', x0: -50, x1: -6, z0: -20, z1: -9 },
  ],
  paving: [
    { x0: -48, x1: 16, z0: -4, z1: 0 },      // path along Hus L's entrances
    { x0: -95, x1: 22, z0: -24, z1: -21.5 }, // pavement along Sankt Lars väg
    { x0: -95, x1: 30, z0: -32, z1: -30 },   // … and on the far side, along the school's wall (#126)
  ],                                         // the courtyard's own walks: COURTYARD
  river: { x0: -200, x1: 150, z0: 125, z1: 135 }, // Höje å
  // big old limes / chestnuts along the far pavement and in the school yard (#130, the user's photos): [x, z, size]
  bigTrees: [[-36, -34.5, 1.4], [-17, -35.2, 1.6], [-4, -34.8, 1.75], [9, -35.4, 1.45], [27.5, -34.2, 1.6], [33.5, -16, 1.35], [-58, -33.5, 1.5]],
  // a row of ornamental shrubs along our pavement, with gaps for the paths to the entrances (#130)
  shrubs: { x0: -60, x1: 18, z: -20.6, step: 0.85, gaps: [[-48, -44], [-6, 8]] },
  birchShare: 0.3, // of the trees in the areas (not the young street maples): birches (#115)
  treeAreas: [
    // the courtyard's and the green's trees stand where the situation plan draws them: COURTYARD.trees
    { x0: -92, x1: 18, z0: -20, z1: -19, n: 11, young: true }, // street trees along Sankt Lars väg: young maples by the site (#130)
    { x0: 18, x1: 20, z0: -16, z1: 56, n: 7 },         // … and along its east leg
    { x0: -130, x1: 70, z0: 68, z1: 140, n: 55 },      // S:t Lars park / woods towards Höje å
    { x0: -130, x1: -92, z0: -30, z1: 68, n: 14 },     // west of Karpvägen
  ],
};

// The courtyard on the garage box (#80, src/courtyard.js), traced on the situation plan (docs/peab/
// situationsplan.png, p. 3; plan metres as in SITE) and the info brochure p. 16 ("plattsatta gångar,
// en pergola, grillplats, sittytor, en lekplats för barnen och en boulebana", grusgångar, trädrader).
// Items the plan does not show are marked guess.
export const COURTYARD = {
  // stone-paved walks
  paths: [
    { x0: -46, x1: 12, z0: 18.2, z1: 19.6 },   // along the row-house patios
    { x0: -50, x1: 12, z0: 30.2, z1: 31.7 },   // the main walk across, north of Hus A/B
    { x0: -13, x1: 12, z0: 25.6, z1: 27.3 },   // to the stair on the east edge
    { x0: -17.6, x1: -13.9, z0: 12.7, z1: 20 }, // from the portik
    { x0: -50.2, x1: -47.2, z0: 8, z1: 51 },   // between Hus C and the Borggården
    { x0: -72, x1: -47.2, z0: 49.3, z1: 50.6 }, // south of Hus C's yard
  ],
  gravel: [{ x0: -46, x1: -13.9, z0: 19.6, z1: 30.2 }, { x0: -13.9, x1: 12, z0: 19.6, z1: 25.6 }], // grusgångar round the beds
  // the Borggården's pergola with a dining table (red-brown on the plan) and a second one south of Hus C
  pergolas: [{ x0: -20.6, x1: -14.2, z0: 20.2, z1: 30 }, { x0: -65.5, x1: -60, z0: 41.2, z1: 47.6 }],
  grill: { x: -21.6, z: 21.0 },               // grillplats beside the pergola (spot: guess)
  sandboxes: [{ x0: -26.6, x1: -22.6, z0: 23.6, z1: 27.8 }, { x0: -56, x1: -51.2, z0: 41.8, z1: 46.8 }], // lekplats
  boule: { x0: -12.4, x1: -2.6, z0: 21.4, z1: 24.6 }, // boulebana: not marked on the plan, a gravel court by the east beds (guess)
  benches: [{ x: -32, z: 25, rot: 90 }, { x: -30, z: 29.4, rot: 180 }, { x: -6, z: 29.4, rot: 180 }, { x: 4, z: 29.4, rot: 180 }],
  beds: [{ x0: -71.2, x1: -69.6, z0: 40.2, z1: 42 }, { x0: -71.2, x1: -69.6, z0: 42.6, z1: 44.4 }, { x0: -71.2, x1: -69.6, z0: 45, z1: 46.8 }], // odlingslådor
  // planting beds with shrubs and perennials round the tree squares (guess where the plan only shows green)
  plantings: [{ x0: -45.5, x1: -37.5, z0: 19.8, z1: 28.6, n: 26 }, { x0: -8.5, x1: -1.5, z0: 19.8, z1: 21.4, n: 10 },
    { x0: 0.5, x1: 8.5, z0: 19.8, z1: 21.4, n: 10 }, { x0: -23, x1: -12, z0: 32, z1: 56, n: 30 }],
  // #112 (after Peab's courtyard renders; places are guesses): low path bollards that light up at dusk along the
  // patio walk and the main walk, a red wooden playhouse by the sandbox, a bike rack with bikes by the portik walk
  bollards: { h: 0.8, r: 0.07, rows: [{ x0: -44, x1: 10, z: 18.05, step: 6 }, { x0: -46, x1: 10, z: 30.05, step: 7 }] },
  playhouse: { x0: -30.2, x1: -28.0, z0: 24.0, z1: 26.0, h: 1.3, ridge: 1.9, color: 0x9c2f24, trim: 0xf2efe7 },
  bikeRack: { x: -12.6, z0: 13.4, n: 5, gap: 0.7, colors: [0x2f5d8c, 0xc23b32, 0x2e2e30, 0x5e8f4a, 0xe8e4da] },
  trees: [ // tree squares and single trees as drawn
    [-43, 21], [-40, 21], [-43, 24.5], [-40, 24.5], [-38, 29], [-33, 28.8], [-36, 22.5],
    [-6.6, 21.6], [-3.4, 21.6], [-6.6, 24.6], [-3.4, 24.6], [2.6, 21.6], [5.8, 21.6], [2.6, 24.6], [5.8, 24.6],
    [-20, 33], [-16.6, 33], [-20, 36.5], [-16.6, 36.5], [-20, 40], [-16.6, 40], [-20, 43.5], [-16.6, 43.5],
    [-20, 50], [-16.6, 51.5], [-49, 16], [-46, 39], [-49, 44], [-62, 39], [-68, 38.5], [-46.5, 46],
  ],
};

// Hus L (Parklängan): stacked row houses, overview plans våning 1–5 + Peab's aerial render.
// Våning 1–2: L1001–L1004 | stair core + portik (+ L1101 on våning 2) | L1005–L1008; we are
// L1007, L1008 is the east end unit (gable windows, spiral escape stair north of it).
// Våning 3–4: L1201–L1209, two-storey units entered from the loftgång on våning 3 (L1208 is the one
// above us), white render with red brick pilasters between the units; flat roof with solar panels.
export const HUS_L = {
  before: 2, after: 1, west: 4,     // units east of the core: 2 west of us, 1 east; 4 west of the core
  core: { w: 8.75, portik: [3.65, 5.45], portikHeight: 3.0 }, // stair core; portik x from its west end
  upperStoreys: 2,
  storeyHeight: 3.0,
  loftgangDepth: 1.96,    // walkway over our north bedrooms: z 0 → façade of the upper unit
  railHeight: 1.1,
  render: 0xf2efe7,       // white render, våning 3–4
  // the loftgång's details (#111, after Peab's renders; sizes are guesses): a light sheet-metal fascia on the deck edge,
  // a round handrail on the balusters, the upper units' white front doors set back in a recess, a wall lantern
  // beside each door that lights up at dusk (no lights: colour only, like the pergola's bulbs)
  loft: { fascia: 0xd5d8d4, handrailR: 0.022, door: 0xf4f4f1, recess: 0.14, lamp: { dx: 0.25, y: 2.1, w: 0.12, h: 0.22 } },
  pilaster: 0.4,          // brick pilaster width at each unit boundary (render)
  // spiral stairs in brick drums at both ends (våning 1/3 plans): centre, radius
  // (#42: the east one, L1008's escape stair, stands right against the house, per the user; #172: so does
  // the west one, against the west gable — `gable: 'west'` = its x is worked out in exterior.js, gable − r)
  towers: [{ gable: 'west', z: 1.1, r: 1.6 }, { x: 10.2, z: -1.62, r: 1.6 }],
  // L1008 (the east end unit, our neighbour on the left seen from the street) is not a copy of ours
  // (#42, plan p. 43): no window beside the front door (its kitchen window is on the gable), and
  // upstairs no window where the escape stair stands. Façade openings whose centre x (unit
  // coordinates) lies in these ranges are left out on its north façade.
  endUnitNorthHidden: [[3.0, 4.7]],
  // L1008's east gable (plan p. 43): windows as plan z ranges, sill/head per storey (guess)
  gableWindows: [
    { storey: 0, z0: 2.8, z1: 4.1, sill: 0.7, head: 2.6 }, { storey: 0, z0: 8.5, z1: 9.8, sill: 0.7, head: 2.6 },
    { storey: 1, z0: 2.8, z1: 4.1, sill: 0.6, head: 2.25 },
    { storey: 2, z0: 4.0, z1: 5.2, sill: 0.8, head: 2.3 }, { storey: 2, z0: 8.0, z1: 9.2, sill: 0.8, head: 2.3 },
    { storey: 3, z0: 4.0, z1: 5.2, sill: 0.8, head: 2.3 }, { storey: 3, z0: 8.0, z1: 9.2, sill: 0.8, head: 2.3 },
  ],
  // solar panel fields on the roof (situation plan): x ranges × rows of z ranges
  solar: { x: [[-41.4, -26.7], [-25.0, -6.6], [-5.0, 9.9]], z: [[3.5, 4.5], [5.4, 6.4], [7.4, 8.4], [9.4, 10.4]] },
};

// Seasons (src/seasons.js, #73), by the day cycle's month (the wall clock can change it). Tree crowns:
// hue/saturation/lightness per month (each tree varies around it), `leaves` = how much crown is left
// (0 = bare branches in winter). Snow months: ground, roofs, hedges and paving turn white.
export const SEASON = {
  snowMonths: [12, 1, 2],
  // month → [hue, sat, light, leaves]   (spring light yellow-green, summer deep green, autumn mixed)
  trees: {
    1: [0.08, 0.2, 0.22, 0], 2: [0.08, 0.2, 0.22, 0], 3: [0.22, 0.45, 0.42, 0.45], 4: [0.24, 0.55, 0.45, 0.85],
    5: [0.25, 0.55, 0.38, 1], 6: [0.28, 0.5, 0.3, 1], 7: [0.29, 0.5, 0.27, 1], 8: [0.27, 0.45, 0.28, 1],
    9: [0.2, 0.5, 0.32, 1], 10: [0.09, 0.65, 0.38, 0.95], 11: [0.06, 0.45, 0.3, 0.45], 12: [0.08, 0.2, 0.22, 0],
  },
  blossomMonths: [4, 5], // some trees flower white/pink
  snow: { ground: 0xeef3f7, roof: 0xf4f7fa, hedge: 0xdfe8ec, paving: 0xe6ebee },
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
// Fixed cabinets corrected against the plan text (#49): the extractor merged the hall's "EL/C" cabinet
// with the coat rack "KL" beside it into one 1.18 m unit; the user confirms the EL cabinet is small and
// there is room for a coat rack and a shoe rack. Matched by level + label; fields replace the plan's.
export const CABINET_FIXES = [
  { level: 0, label: 'EL', z1: 0.465 + 0.4 },
];

export const CABINET_HEIGHT = {
  EL: 2.1, G: 2.1, L: 2.1, 'U/M': 2.1, K: 2.1, F: 2.1,
  TT: 0.85, TM: 0.85, DM: 0.9,
};
export const BASE_CABINET = 0.9;
// WC-stol Ifö Spira 6260 (our choice in both bathrooms): approx. W 35.5 × D 65 cm, seat 42 cm,
// tank top 84 cm (Ifö product sheet, rounded). Replaces the plan's schematic symbol (#14).
export const TOILET = { width: 0.355, depth: 0.65, seatHeight: 0.42, tankHeight: 0.84, tankDepth: 0.17,
  refill: 6 }; // s until the tank is full again after a flush (#155, our guess)
export const SHELF_HEIGHT = 2.0; // unlabelled shelving in the upstairs Klk

// Where a visit starts: out on the grass in front of the entrance façade, facing the house with the
// gaze slightly up, so the whole unit (and Hus L above it) is in view (#35). yaw 180 = facing south.
export const START = { x: 2.875, z: -12, yawDeg: 180, pitchDeg: 8 };
// Walkable area outside: in front of the north façade (x range, back to z0), our patio and, through
// the gap in the hedge (SW corner), the lawn behind the row of patios up to z1 (#52).
// People in the area (#114, src/people.js; Peab's renders docs/peab-innergard-ost.png, peab-radhusrad-innergard.png):
// walkers going to and fro on the paths (x0, z0 → x1, z1 at speed m/s), cyclists on Sankt Lars väg, kids passing a
// ball, people on the benches, someone lying on a blanket, neighbours on the loftgång. Daytime only (daylight above
// `day`); the blanket only outside the snow months. Positions and colours are ours.
export const PEOPLE = {
  day: 0.3,
  walkers: [
    { a: [-80, -22.7], b: [18, -22.7], speed: 1.3, dog: true }, { a: [15, -22.9], b: [-60, -22.9], speed: 1.15 },
    { a: [-46, -2.2], b: [15, -2.2], speed: 1.2 }, { a: [-48, 31], b: [10, 31], speed: 1.25 }, { a: [8, 30.8], b: [-40, 30.8], speed: 1.0, kid: true },
    { a: [-44, 18.9], b: [10, 18.9], speed: 1.1 }, { a: [-48.7, 9], b: [-48.7, 49], speed: 1.3 },
  ],
  cyclists: [{ a: [-90, -26.4], b: [20, -26.4], speed: 4.5 }, { a: [20, -27.8], b: [-90, -27.8], speed: 5.2 }],
  ball: [[-35.5, 20.6], [-30.5, 22.2]],          // two kids passing a ball (on the gravel by the sandbox)
  sandbox: [[-25.2, 25.2], [-23.8, 26.4]],         // kids sitting in the sandbox
  benches: [{ x: -6, z: 29.4, yaw: 0 }, { x: -32, z: 25, yaw: -90 }],
  blanket: { x: -9.5, z: 28.3 },
  loftgang: [[-30.5, 1.0], [-9.2, 1.1]],          // neighbours standing on the loftgång (våning 3)
  bellNear: 12,                                    // m: a cyclist rings the bell passing this close
  shirts: [0x2f5d8a, 0xc0392b, 0xe7d9b8, 0x3e7b4f, 0xf2f2f0, 0x7d4a8c, 0xe08a2a, 0x1f2a36, 0x9bb7d4, 0xd4577a],
  pants: [0x23324a, 0x2b2b2b, 0x6b5844, 0x8a8f96, 0x384b6b, 0xc8bfa8],
  skin: [0xf1c9a5, 0xe0ac86, 0xc68a62, 0x8d5a3b, 0xf6d8bf],
  hair: [0x2a1d14, 0x5a3a22, 0xc89b52, 0x1a1a1a, 0x8a5a32, 0xd8c7a0],
};

// The building site as it is now (#131, #132, src/construction.js): an optional mode (start screen button, `&bygge`)
// where Kv. Lunden stands in scaffolding, partly netted, with blue weatherboard where the brick is not up yet, mobile
// fencing, barriers and machines, and the courtyard is a wet concrete deck with a site hut (the user's photos
// docs/foton/*, autumn 2026). Our own unit stays finished. Scaffold: `off` from the wall, `depth` deep, bays and lifts
// in metres (a typical system scaffold). `skipL` = plan x ranges of Hus L left bare (our unit L1007 + L1208 above it;
// the east spiral stair on the north side). `boards` = façade rects [ax, az, bx, bz, y0, y1, n] (n = the outward
// normal's sign); `fence` = polylines of 3.5 m panels; positions of machines and props are guesses
// read off the photos.
export const CONSTRUCTION = {
  scaffold: { off: 0.3, depth: 0.75, bay: 2.5, lift: 2.0, over: 1.0 },
  skipL: { both: [[-0.7, 6.45]], north: [[6.3, 12]] },
  netted: ['L-s-0', 'L-n-0', 'C-e-0', 'B-n-0', 'A-w-0'], // runs with white netting: building-side-piece (pieces counted from west / north)
  boards: [ // blue weatherboard ("Weatherboard 365") with yellow insulation edges; the last number = the normal (±1 on the other axis)
    [-43.25, 12.7, -20.25, 12.7, 6, 12, 1], [-11.5, 12.7, -0.7, 12.7, 6, 12, 1], [6.45, 12.7, 11.5, 12.7, 6, 12, 1],
    [-43.25, 1.96, -20.25, 1.96, 6.1, 12, -1], [-11.5, 1.96, -0.7, 1.96, 6.1, 12, -1],
    [-53.3, 12.5, -53.3, 37.5, 0, 6, 1], [-10.2, 29.6, 9.5, 29.6, 0, 3, -1], [-43.4, 34.2, -23.7, 34.2, -3, 3, -1],
  ],
  fence: [[[12.2, -0.6], [16.2, -0.6], [16.2, 12.7], [22.2, 12.7], [22.2, 30.6]], [[-46.5, -0.6], [-53, -0.6], [-53, 12]]],
  barriers: [[13.6, -2.4, 0], [16.4, -2.4, 0], [-48.2, -2.4, 0]],
  machines: { loader: [8.5, 25.8, 2.4], excavator: [-21, 24.8, -0.6] },
  // the courtyard now (#132, docs/foton/mellan-husen-pagaende-bygge.jpg): the finished courtyard is hidden, the garage deck
  // is wet concrete (`deck` rects x0, x1, z0, z1; puddles on the first two), red-brown gravel at park level outside the
  // east wall (`gravel`), the box walls in grey concrete; things standing about at [x, z, yaw°]; maples [x, z, height]
  courtyard: {
    deck: [[-53.3, 18, 17.8, 30.2], [11.6, 18, 12.75, 17.8], [-53.3, -43.3, 12.75, 17.8], [-80, -43, 37.6, 51], [-53.3, -43, 30.2, 37.6]],
    puddles: 26, gravel: [18.1, 22.1, 12.75, 30.2],
    hut: [-32.5, 27.0, 0], toilet: [-28.4, 27.5, 0], skip: [-40, 25.5, 0], switchboard: [-6, 24.6, 0], barrow: [15.4, 20.8, 60],
    pallets: [[-14, 22.5, 10], [-12.6, 23.7, 0], [12.5, 21.5, -20], [-37, 21, 30]], tarps: [[-2, 27.2, 0], [-44.5, 20.5, 40]],
    hose: [[-29.8, 26], [-27, 25], [-24, 26.2], [-21, 23.8], [-17, 23.5]],
    maples: [[20.4, 15.5, 5], [20.8, 22.5, 6], [20.2, 28.8, 5.5], [19.2, 6, 5]],
  },
};

export const OUTDOOR = { x0: -46, x1: 17.75, z0: -14, z1: 29.5 }; // behind Hus L: the patios and the Borggården (#80)

// The lightsaber in Sovrum 2 (#78, src/saber.js): two hooks on the west wall (north of the gaming desk)
// (wall face x 2.752), the saber lying across them along z. Hilt 30 cm, blade 90 cm; the blade colour is
// picked from `colors` each time it is taken down. `held` = where it sits in the view (camera space).
export const SABER = {
  level: 1, x: 2.752, y: 1.62, z: 9.85, hilt: 0.3, blade: 0.9,
  colors: [0x3aa0ff, 0x44ff66, 0xff3030],
  held: { x: 0.26, y: -0.3, z: -0.5 },
  swingSpeed: 4, // rad/s of looking that counts as a swing
  touchEvery: 0.25, // s between contact checks while not swinging (burn marks, #96)
};

// Toys you can take and use (src/toys.js, Holdables like the saber; sizes and spots are our picks).
// Nerf (#86): a pegboard on Sovrum 2's east wall between the wardrobe and the bunk with three foam blasters
// (click = fire a dart that flies and lands), a dart bandolier and goggles. Wands (#87): three star wands
// and a unicorn headband on hooks on Sovrum 3's east wall, clear of the door's swing (click / waving =
// sparkles + a pling). Flashlight (#89): on the hat shelf of the hall wardrobe by the front door (open
// its sliding front first); click toggles one SpotLight that always exists (0 when off: no recompile).
export const TOYS = {
  nerf: { level: 1, x: 5.551, y: 1.35, z: 9.35, board: [0.9, 0.8], colors: [0xff7a1a, 0x1f8bff, 0xffd21a],
    dart: { speed: 9, gravity: 6, max: 8 }, held: { x: 0.22, y: -0.22, z: -0.45 } },
  wands: { level: 1, x: 2.61, y: 1.45, z: [2.85, 3.2, 3.55], colors: [0xff7ad0, 0x9b7bff, 0x5fd7ff],
    held: { x: 0.2, y: -0.22, z: -0.42 }, headband: { z: 3.9 }, reach: 8 }, // reach: m to the surface the magic lands on (#97)
  flashlight: { level: 0, x: 0.58, y: 1.83, z: 2.08, held: { x: 0.2, y: -0.2, z: -0.38 },
    spot: { intensity: 9, distance: 14, angle: 0.42, penumbra: 0.45, color: 0xfff0d6 } },
};

// The TV remote (#101, src/remote.js): slim black, 4 × 18 × 1.5 cm (the user's sketch), lying on the coffee table
// (ILVA Woodstock, top 0.47 m at x 3.64, z 10.56) on the sofa's side (within reach from the sofa, #184), turned a little. `reach` = how far it works.
export const REMOTE = { w: 0.04, l: 0.18, h: 0.015, x: 3.98, y: 0.47, z: 10.72, turn: 18, reach: 9,
  held: { x: 0.17, y: -0.19, z: -0.36 } };

// The book on the side table by the armchair (#140, src/book.js): a hardback 15 × 22 × 3 cm lying beside the
// flower (side table at 1.52, 8.12, top at 0.5325). `held` = where it sits in the view (camera space).
export const BOOK = { w: 0.15, l: 0.22, h: 0.03, x: 1.6, y: 0.5325, z: 8.2, turn: 28,
  held: { x: 0.16, y: -0.2, z: -0.42 } };

// The big beer on the patio (#117, src/beer.js): a 50 cl tankard (Ø 9 × 16 cm, our pick) that turns up on the
// lounge table (top at 0.40) when you sit down in the lounge sofa; each gulp drinks `gulp` of it.
export const BEER = { x: 3.85, y: 0.4, z: 15.4, r: 0.045, h: 0.16, gulp: 0.2, held: { x: 0.2, y: -0.24, z: -0.45 } };

// The Nerf target (#99, src/target.js): a round archery-style board on a wooden stand on the lawn south of the
// hedge, facing the patio (north), its centre over the hedge so you can shoot from the patio door (~7.5 m).
// Rings from the centre out score `rings` points; the shooter's distance to the hit multiplies them (`range`:
// [up to m, ×]). Our picks.
// Our car (#173): a white Renault Megane E-Tech Electric 2024 (4.20 × 1.78 × 1.50 m per Renault), plate FGZ 56D.
// The key in the hall calls it: it comes east along Sankt Lars väg (our lane, right side to our curb at z −24),
// stops in front of our entrance; called again it drives on, U-turns before the zebra crossing and leaves west.
// Path and speeds are ours.
export const CAR = {
  l: 4.2, w: 1.78, h: 1.5, color: 0xf2f2ee, plate: 'FGZ 56D',
  lane: -25.2, back: -28.6,        // z of the car's middle in our lane / the far lane
  from: -95, stop: 2.9, turnAt: 6.9, gone: -95, // x: appears, stops (middle), starts its U-turn, disappears
  speed: 8, brake: 2,              // m/s cruising, m/s² slowing down to the stop
};

export const TARGET = {
  x: 2.8, z: 19.5, y: 1.4, r: 0.4,
  rings: [10, 8, 6, 4, 2, 1],
  range: [[2, 1], [4, 2], [6, 3], [Infinity, 4]],
};

// Putting held things down (#102, holdable.js / main.js): a table top, worktop or the floor within `reach` m
// of the eye.
export const HOLD = { reach: 2.2 };

// Performance (#189): small meshes (radius < maxR m) are not drawn once they would look smaller than `k`
// (radius / distance, ~0.6° across), never nearer than `minDist`; meshes up to `maxOcclude` inside the flat are
// not drawn from outside unless seen through a façade opening; re-checked after the camera moved `move` m.
export const PERF = { detail: { maxR: 0.5, k: 0.009, minDist: 3.2, maxOcclude: 4, move: 0.3 } };

// Marks on surfaces (#96, src/marks.js): one ring buffer of at most `max` flat decals in all, one instanced
// mesh per kind, canvas textures. Per kind: size (m, randomised ±25 %), life (s; the last `fade` s fade out).
// burn = the lightsaber (with a short glow and a puff of smoke), star/butterfly = wands, splash = Nerf.
// Our picks. `gap`: no new mark closer than this to the last one, nor sooner than `every` s.
export const MARKS = {
  max: 60, fade: 3, gap: 0.06, every: 0.15,
  kinds: {
    burn: { size: 0.09, life: 150 },
    glow: { size: 0.12, life: 1.2 },
    star: { size: 0.07, life: 18 },
    butterfly: { size: 0.08, life: 18 },
    splash: { size: 0.14, life: 30 },
  },
  smoke: { n: 40, life: 1.6, rise: 0.25 },
  // the wands' magic (#97): `stars` star marks round the hit (within `spread` m), 2–3 butterflies flutter there
  magic: { stars: 6, spread: 0.18, colors: [0xff7ad0, 0xb07bff, 0xffd34a, 0x40e0d0], flutter: { n: 12, life: 15, size: 0.09 } },
};

// Coffee cups (#90, src/cups.js): three cups in the wall cabinet over the Moccamaster (its door opens with
// E); taken out, a cup stands on the worktop south of the machine (`counter`), fills from the jug (each
// cup takes `pour` of it), is held like a toy and can be put down on any table (furniture surfaces).
// Sizes: a 9 cm tall, 8 cm wide mug (guess).
// Fish fingers in the freezer (#162, src/fishfingers.js): a carton on the lower open shelf, n in it; each one taken
// straight into the hand, eaten in `bites` bites or put down anywhere. Sizes of a typical 15-pack (~9 × 2.5 × 1.6
// cm sticks, the carton ~19 × 13 × 4.5 cm); `held` = the stick in the view (camera space).
export const FISH = { n: 15, len: 0.09, w: 0.025, h: 0.016, bites: 3, box: { w: 0.19, d: 0.13, h: 0.045 },
  held: { x: 0.14, y: -0.15, z: -0.34 } };
// The cat and a fish finger on the floor (#163, cat.js): one within `reach` m in the open (a straight walk with no
// wall or door in between, i.e. the same room) catches its eye; it looks for `notice` s, walks there at `speed` m/s,
// stops `stop` m short (its head over it) and eats it in `eat` s. Taken away first: it looks after it for `look` s.
export const CAT_FISH = { reach: 4, notice: 1.2, speed: 0.55, stop: 0.17, eat: 3, look: 2.5 };

export const CUPS = { n: 3, r: 0.04, h: 0.09, color: 0xf3f1ec, coffee: 0x2a1408, pour: 0.25, counter: { x: 5.2, z: 1.68 },
  sip: 0.2, held: { x: 0.18, y: -0.2, z: -0.4 }, jugHeld: { x: 0.22, y: -0.26, z: -0.55 } }; // jugHeld: the jug in the view (#141)

// Drinks (#166–#169, src/drinks.js): what a glass or a cup holds. Per drink its colour, opacity and `tint` (how
// strongly it colours a mix: a splash of milk lightens coffee more than its share, guess). `pour`: what one pour
// does in a vessel, as a fraction of the vessel's height: `to` = fill up to that level, `add` = a splash on top
// (whisky ~2–4 cl), `empty` = the level when poured into an empty vessel; never above full. `sip` = one sip from
// a glass, `secs` = how long a pour takes, `tilt` = how far a bottle tips while it pours (rad).
export const DRINKS = {
  wine: { color: 0x5c0a1c, opacity: 0.92, tint: 1, name: 'vin' },
  champagne: { color: 0xeed98a, opacity: 0.6, tint: 1, name: 'champagne' },
  whisky: { color: 0xb8651c, opacity: 0.82, tint: 1, name: 'whisky' },
  milk: { color: 0xf7f5ef, opacity: 1, tint: 2, name: 'mjölk', withCoffee: 0xc39a6b }, // withCoffee: its colour in a mix with coffee (café au lait, #168)
  coffee: { color: 0x2a1408, opacity: 1, tint: 1, name: 'kaffe' },
  pour: {
    glass: { wine: { to: 0.45 }, champagne: { to: 0.85 }, whisky: { add: 0.2 }, milk: { to: 0.75 } },
    cup: { milk: { empty: 0.8, add: 0.15 }, whisky: { add: 0.12 } }, // milk: a cup of it or a splash in the coffee (#168); whisky: a splash (#169)
  },
  sip: 0.15, secs: 1, tilt: 1.5,
};

// The secret drawer in the secretary (#183, src/secret.js): every time it is opened a new little thing lies in it,
// drawn by `weight` (never the same twice in a row; `rare` ones pling). Taken out and left somewhere, at most
// `keep` of them stay where they were put; older ones go home (out of sight). Models: SECRETS in furniture.js.
export const SECRET = {
  keep: 3,
  items: [
    { key: 'star', name: 'guldstjärnan', weight: 2 },
    { key: 'goldkey', name: 'guldnyckeln', weight: 1.5 },
    { key: 'marble', name: 'glaskulan', weight: 2 },
    { key: 'tooth', name: 'tanden från tandfén', weight: 0.6, rare: true },
    { key: 'coin', name: 'tvåkronan', weight: 2 },
    { key: 'ring', name: 'ringen', weight: 0.5, rare: true },
    { key: 'map', name: 'skattkartan', weight: 0.6, rare: true },
    { key: 'dino', name: 'dinosaurien', weight: 1.5 },
    { key: 'feather', name: 'fjädern', weight: 2 },
    { key: 'shell', name: 'snäckan', weight: 1.5 },
    { key: 'lego', name: 'LEGO-gubben', weight: 1.2 },
    { key: 'glitter', name: 'glitterflaskan', weight: 0.6, rare: true },
    { key: 'die', name: 'tärningen', weight: 2 },
    { key: 'cattoy', name: 'fjäderbollen', weight: 1.5 },
    { key: 'heart', name: 'hjärtgodiset', weight: 1.5 },
    { key: 'duck', name: 'miniankan', weight: 1.5 },
    { key: 'stamp', name: 'kattfrimärket', weight: 1 },
    { key: 'folder', name: 'den hemliga pärmen', weight: 0.5, rare: true },
  ],
};

// The milk carton in the fridge (#168, src/milk.js): 1 l, 7 × 7 × 19.5 cm with a 3 cm gable (a standard carton).
export const MILK = { w: 0.07, h: 0.195, gable: 0.03, blue: '#2f6fc4', held: { x: 0.2, y: -0.3, z: -0.46 } };

// Drawing with crayons (#93, src/drawing.js): an A3 sheet in the middle of the ALEX desk in Sovrum 3. E on it:
// the view goes down over the paper, the mouse is freed and you draw with crayons (palette at the bottom,
// keys 1–9, "Sudda allt"); E / Esc / "Klar" goes back. The drawing is kept in localStorage.
export const DRAWING = { level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.31, w: 0.42, h: 0.297, px: 840, eye: 0.3,
  colors: ['#d8312e', '#f08a24', '#f2cf2b', '#43a047', '#2f6fd6', '#7b4bc4', '#f27bb3', '#8a5a3c', '#222222'],
  width: 9,
  // Taping it up (#176, src/posters.js): "Ta teckningen" in drawing mode puts the sheet in the hand (a fresh one
  // lies on the desk); E on a wall (both levels) or the fridge/freezer door tapes it up, a tape strip at each
  // corner, turned up to ±`tilt`°, `lift` m off the surface (+ `step` per poster so overlaps don't flicker).
  // At most `maxPosted` up at once (then "släng en först"); saved in IndexedDB 'lunden'/'drawings'. `wallGap`:
  // how near a wall outline a hit must be to count as the wall (tiles sit a little proud). Our picks.
  maxPosted: 30, tilt: 4, lift: 0.003, step: 0.0006, wallGap: 0.05, held: { x: 0.05, y: -0.17, z: -0.42 },
  // Thrown away (#177, src/paperball.js): crumpled into a ball, thrown at `throwSpeed` m/s (+ a little up), gone
  // after `ballSeconds` s. Our picks.
  throwSpeed: 4.5, ballSeconds: 180 };

// Sitting and lying down (#71/#72, src/rest.js): eye height above the seat / mattress, how far you can
// turn your head (yaw ± from the way the seat faces) and the pitch range, and the move time.
export const REST = {
  sitEye: 0.72, lieEye: 0.22, move: 0.5,
  sit: { yaw: 1.7, pitch: [-1.1, 0.8] },
  lie: { yaw: 1.3, pitch: [0.15, 1.45], startPitch: 1.45 }, // lying on your back, looking at the ceiling
  reach: { sit: 1.3, lie: 0.8 }, // how far from the eye you can reach things while sitting (leaning forward) / lying (#184)
};

export const PLAYER = {
  eye: 1.62,
  radius: 0.22,
  walk: 1.6,   // m/s
  run: 3.2,   // sprint (Shift / stick all the way out), outdoors only (#43)
  sprintStick: 0.95, // joystick deflection that counts as "all the way out"
  strideWalk: 0.62, strideRun: 0.95, // metres per footstep sound
  turnSpeed: 1.9, // rad/s for the arrow keys
  crouchEye: 0.95,   // eye height on your haunches (Ctrl / the touch button, #70)
  crouchSpeed: 0.5,  // walking speed factor while crouching
  mouseSens: 0.0013, // rad per pixel of mouse/touchpad movement under pointer lock (was 0.0022, too twitchy, #46)
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
  riser: 0xf4f4f1,  // stair risers and stringers, white (the treads use the floor's Ek Chalk parquet, #54)
  grass: 0x7fa65c,
  patio: 0xbdb7ab,
  hedge: 0x46703a,
  fence: 0xa7b6aa, // grey-green screen wall (skärmvägg), Peab render
  brick: 0x8a3b2a,
  mortar: 0xcfc6b8,
  balcony: 0x8fa396, // pinnaräcke grågrön (brochure)
  asphalt: 0x5d5f61,
  paving: 0xb9b4aa,
  water: 0x47657a,
  solar: 0x1d2735,
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
// The frying pan in the middle drawer under the hob (#159): black, Ø 28 cm (the issue), the rest guesses.
// `home` = its place in the drawer (drawer-local: in = metres back from the front, along = along the run);
// `held` = camera space, the handle towards you.
export const PAN = { d: 0.28, h: 0.05, handle: 0.19, color: 0x1d1d1f, handleColor: 0x2a2522,
  home: { in: 0.27, along: -0.06 }, held: { x: 0.2, y: -0.3, z: -0.72 } };

// The roast chicken in the fridge (#160): it smokes after `cookSeconds` in the pan on a lit zone, for `smokeSeconds`
// after it leaves the heat (or until it is back in the fridge with the door shut); `darken` = how much browner it
// gets at most; `inPanY` = its origin above the pan's (the pan's floor), `inPanScale` so it fits; `held` = camera space.
export const CHICKEN = { cookSeconds: 10, smokeSeconds: 60, darken: 0.35, inPanY: 0.0, inPanScale: 0.8, held: { x: 0.18, y: -0.3, z: -0.55 } };

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
  sink: { w: 0.5, d: 0.4, depth: 0.19 }, // Diskho Intra Linea 5040, underlimmad; depth *guess* (typ. 18–20 cm, #122)
  hob: { w: 0.58, d: 0.52, t: 0.006, // Induktionshäll EH60KB6BF
    // its four zones (#158) as [a, b, r] on the glass (a 0 = front edge … 1 = back, b 0 = north … 1 = south, r in
    // fractions of the width); the first is the big front one that glows. A typical 4-zone layout (guess).
    zones: [[0.33, 0.3, 0.2], [0.33, 0.75, 0.15], [0.74, 0.3, 0.15], [0.74, 0.74, 0.17]] },
};

// Sink bowls (#122, src/interior.js): the inset steel sink in Tvätt (40 × 26 cm as drawn, depth *guess*)
// and the basin in the bathroom vanities (Core Grip with a porcelain top, depth *guess*).
export const LAUNDRY_SINK = { w: 0.22, d: 0.36, depth: 0.15 };

// Wall cabinet over the Tvätt worktop (#138, the user: there is one, with white doors; Peab's redrawn plan does
// not show it). Over the whole run (machines + sink), white Arkitekt plus Frost doors like the base unit, three
// units; bottom 58 cm over the worktop, top 30 cm under the lowered ceiling (RH 2.5). Depth/heights *guess*.
// the wall cabinet covers the north `share` of the worktop: none over the sink (the user, #153)
export const LAUNDRY_CABINET = { depth: 0.35, y0: 1.49, y1: 2.2, units: 2, share: 2 / 3 };
export const VANITY_BASIN = { depth: 0.1 };

// Changelog note (src/changelog.js) on the freezer door: its front is the plan's F cabinet
// z0 − 4 cm (the freestanding freezer sticks out, see interior.js). rotY π = facing north.
export const CHANGELOG_NOTE = { x: 4.38, y: 1.42, z: 4.8844 - 0.04 - 0.002, rotY: Math.PI, w: 0.16, tilt: -0.05 };

// Baked ambient occlusion (src/ao.js): darkening at a wall = strength, falling off over
// `radius` metres. Tuned by eye on screenshots.
export const AO = {
  floor: { strength: 0.4, radius: 0.2 },
  ceiling: { strength: 0.3, radius: 0.3 },
};

// Cork board with photos of petted cats (src/catboard.js), under the kitchen wall clock (WALL_CLOCK:
// Tvätt/Badrum wall, kitchen face x 2.152, z 3.145–5.244, clock bottom 1.85 m): top edge 1.78 m, 0.29 m
// clear of the Badrum door (#37). Board + calendar are one group centred under the clock (#121).
// rotY π/2 = facing east.
// `max` photos fit on it; a new one replaces the oldest that isn't kept (#170)
export const CAT_BOARD = { x: 2.152, y: 1.4, z: 4.4, w: 1.1, h: 0.76, rotY: Math.PI / 2, max: 10 };

// Moccamaster (Technivorm KBG, black) on the worktop between the tall unit (oven/microwave) and the
// sink, against the splashback (#59). Size ~32 × 17 × 36 cm (guess, after the KBG series). `z` = centre
// along the east run, `back` = x of its back. E brews for `brewSeconds`: red power light, sound,
// the jug fills.
export const MOCCAMASTER = { back: 5.53, z: 1.4, w: 0.32, d: 0.17, h: 0.36, brewSeconds: 18 };

// Wall shelves in the kitchen (src/shelves.js) where the cat board used to hang: the kitchen face of
// the hall/kitchen partition (x 2.15, z 0.46–1.76), above the light switch (1.05 m). Two oak shelves
// 100 × 20 cm on black brackets with portraits, flowers, books, candles and a bowl (#38).
export const WALL_SHELVES = {
  x: 2.15, z0: 0.56, z1: 1.56, depth: 0.2, thick: 0.025, heights: [1.35, 1.75],
  wood: 0xd2b48c, bracket: 0x2a2a2a,
};

// Hall, the wall on the left as you come in (hall face of the hall/kitchen partition, x 2.057,
// z 0.465–1.765), src/keycabinet.js: the mirror IKEA LINDBYN black Ø 110 cm (ikea.com 904.392.18,
// #61; frame width and depth are guesses) and a Solstickan key cabinet (#36; Design House Stockholm,
// white metal, 16.9 × 16 × 5.5 cm per royaldesign.co.uk, hinged on the left) with a Renault Megane
// E-Tech key. The mirror is centred on the 130 cm wall (z 1.115); rotY −π/2 = facing west (into the hall).
// The cabinet hangs on the narrow wall right of the entrance door (the user, #123): the façade's inner face
// z 0.465, x 1.812–2.057, at eye height above the light switch (x 1.95, y 1.05). rotY 0 = facing south (into
// the hall). Centred on that wall (#135: at x 1.97 the mirror's rim hid its edge), so it overlaps the door's
// 12 mm architrave by ~3 cm and hangs on a 13 mm spacer (z) clear of it.
export const HALL_WALL = {
  x: 2.057, rotY: -Math.PI / 2,
  mirror: { z: 1.115, y: 1.45, d: 1.1, frame: 0.018, depth: 0.03 },
  cabinet: { x: 1.935, z: 0.478, y: 1.5, rotY: 0, w: 0.169, h: 0.16, d: 0.055 },
};

// Day cycle (src/daycycle.js): one day in `minutes` real minutes (60, the user #125). The sun follows the real solar
// path for the date (declination, hour angle) at Kv. Lunden, Karpvägen / S:t Lars väg in Lund
// (55.70° N, 13.17° E, docs/tomten-google-maps.jpg). planNorth = compass bearing of the plan's
// "north" (−z, the entrance façade): FOJAB's north arrow on the situation/overview plans
// (docs/peab/) puts true north 58° to the left of the plan's up, so the entrance faces ENE and
// the patio WSW. Clock time is Swedish local time (CEST in summer).
// Every visit starts at `startHour` on the 15th of the visitor's month, unless ?time=HH[.h] /
// ?month=1–12 is given. The wall clock in the kitchen fast-forwards at `spool` hours per second.
export const DAY = {
  minutes: 60, startHour: 7, lat: 55.70, lon: 13.17, planNorth: 58, spool: 1.5,
  moonlight: 0.35, nightAmbient: 0.05,
};

// Analog wall clock (src/wallclock.js) on the kitchen side of the Tvätt/Badrum wall, centred on the
// wall between the hall and the Badrum door (the user, #121): wall face x 2.152, z 3.145 to the door
// architrave at 5.244 − DOOR_TRIM.width = 5.174 → z 4.16. rotY π/2 = facing east. Diameter 30 cm
// (typical kitchen clock).
export const WALL_CLOCK = { x: 2.152, y: 2.0, z: 4.16, rotY: Math.PI / 2, d: 0.3 };

// The cat calendar (#95, src/calendar.js) on the kitchen face of the Tvätt/Badrum wall, under the wall clock and
// beside the cat board (which covers z 3.85–4.95; together z 3.37–4.95, centred under the clock, #121): a 30 × 45 cm paper calendar with a cat picture for each
// month and the days; E opens a strip to pick the month and the day, which set the day cycle's date.
export const CALENDAR = { x: 2.152, y: 1.5, z: 3.52, w: 0.3, h: 0.45, rotY: Math.PI / 2 };

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
  pendants: [
    { level: 0, room: 'Kök / matplats', x: 3.5, z: 1.41, drop: 1.25 }, // over the dining table (SKANSNAS.table)
    // the living room's folded white paper pendant (#134, docs/taklampa-vit-veckad-papper.png; Le Klint style),
    // over the sitting group between the coffee table and the TV; 45 × 32 cm and the 55 cm cord are *guesses*
    // (shade bottom ~2.1 m up). It replaces the room's ceiling dome.
    { level: 0, room: 'Vardagsrum', x: 3.64, z: 10.2, drop: 0.55, style: 'paper', w: 0.45, h: 0.32, cord: 0xf2f2f0, replaces: true },
    // Sovrum 1's black string ceiling lamp (#174, docs/taklampa-sovrum1-svart-snore.jpg): a short black cup under a
    // white ceiling plate, a truncated cone of vertical black strings, a clear filament globe inside. All sizes are
    // *guesses* from the photo (bottom Ø 55, top Ø 35, 28 high, cup 10 cm); in the middle of the room, south of the
    // lowered ceiling by the façade. It replaces the room's ceiling dome.
    { level: 1, room: 'Sovrum 1', x: 3.55, z: 2.9, style: 'string', drop: 0, bottom: 0.55, top: 0.35, h: 0.28, cup: 0.1,
      cupTop: 0.09, cupBottom: 0.05, plate: 0.12, strings: 300, opacity: 0.86, bulb: 0.08, bulbDrop: 0.17, replaces: true },
  ],
  // switches for rooms without a door of their own (normal = the way the wall faces)
  manual: [
    { level: 0, room: 'Hall', x: 1.95, z: 0.465, normal: [0, 1] },          // by the front door
    { level: 0, room: 'Kök / matplats', x: 2.15, z: 1.65, normal: [1, 0] },  // under the wall shelves
    { level: 0, room: 'Vardagsrum', x: 3.4, z: 7.8, normal: [0, 1] },
    { level: 1, room: 'Hall', x: 2.65, z: 5.13, normal: [0, 1] },           // between the bedroom doors
    { level: 1, room: 'Klk', x: 4.85, z: 4.28, normal: [0, 1] },
    { level: 0, room: 'Klk', x: 3.35, z: 5.55, normal: [-1, 0] },        // outside, by the door (it spans the whole Klk)
  ],
};

// Furniture (issue #8). IKEA LANDSKRONA, Gunnared ljusgrön, oak legs.
// 3-sits: 204 × 89 × 78 cm, seat height 44, seat depth 61, armrest height 64 (ikea.com).
// With schäslong 282 cm wide, chaise 158 cm deep; armchair 89 × 89
// (series dimensions, not on the product page — estimates).
// The dark red upholstered stool in front of the armchair (#180, the user's photo docs/pall-vardagsrum-rod.jpg;
// model unknown): all sizes and the colour are guesses from the photo (a Surface Pro on it for scale).
export const OTTOMAN = {
  w: 0.68, d: 0.48, h: 0.45, legH: 0.06, cushion: 0.1, overhang: 0.01,
  color: 0x5c2c38, welt: 0x4a222c, legColor: 0x2a1f1a,
};

// IKEA SYMFONISK speakers (#186). Bookshelf speaker: ikea.com gives ~15 × 10 × 31 cm (w × d × h standing; lying it
// is 31 × 15 × 10 with the fabric front still facing out — we use these, the exact numbers are guesses). The table
// lamp speaker gen 2 with the glass shade: a fabric speaker base Ø 15 × 20 cm, a short stem, a frosted glass dome
// Ø 20 cm, ~40 cm in all (guesses from ikea.com photos). Fabric colours by name.
export const SYMFONISK = {
  speaker: { w: 0.15, d: 0.1, h: 0.31 },
  lamp: { baseR: 0.075, baseH: 0.2, stem: 0.04, shadeR: 0.1, shadeH: 0.16 },
  colors: { white: 0xe8e8e4, black: 0x1f2022 },
};

// Music in the SYMFONISK speakers (#187, src/sonos.js): generated in Web Audio, no files. `channels` = the "songs"
// (⏮ ⏭ step through them), volume in `steps` (start at `start`), `gain` at full volume. Through a wall a speaker
// is `wall` as loud, from the other floor `floor` (on top of the panner's distance fall-off).
export const SONOS = {
  channels: [
    { id: 'lofi', name: 'Lugn lofi' },
    { id: 'jazz', name: 'Jazzig pianotrio' },
    { id: 'kids', name: 'Barnvisor' },
    { id: 'synth', name: 'Synthwave' },
    { id: 'bach', name: 'Bach: Preludium i C-dur' },
    { id: 'rain', name: 'Regn och brasa' },
  ],
  steps: 10, start: 5, gain: 0.5, wall: 0.45, floor: 0.2, lookahead: 0.6,
};

export const LANDSKRONA = {
  fabric: 0xa7b39a, // Gunnared ljusgrön
  oak: 0xc9a67a,
  height: 0.78, seatHeight: 0.44, seatDepth: 0.61, armHeight: 0.64, armWidth: 0.12,
  depth: 0.89, legHeight: 0.15,
  sofaWidth: 2.82, chaiseWidth: 0.9, chaiseDepth: 1.58,
  chairWidth: 0.89,
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
  // the snowman stands just beyond the gap in the hedge, in view from the patio door and the sofa (#73)
  snowman: { x: 1.4, z: 18.4, months: [12, 1, 2] },
  // paving (#53): 40 × 40 cm light grey concrete slabs, rows in half bond, darker 8 mm joints (our pick,
  // goes with the anthracite Oslo set); also on the neighbours' patios
  paving: { slab: 0.4, joint: 0.008, color: [184, 181, 175], jointColor: '#6f6b65' },
  // LED string lights on the patio side of each screen wall (#81; all guesses except the wall's height):
  // hooks 1.68 m up, a 6 cm sag between them, bulbs every 12 cm, warm white. They switch on below
  // `on` daylight and off above `off` (hysteresis), fading over `fade` s; each string borrows a pool
  // light (lights.js) with a soft, short reach.
  stringLights: { y: 1.68, sag: 0.06, hookEvery: 1.2, spacing: 0.12, inset: 0.03, color: 0xffcf8a,
    on: 0.3, off: 0.4, fade: 1, light: { intensity: 1.4, range: 4 } },
};

// Placement in plan metres. rot = direction the seat faces, degrees (0 = north/−z,
// 90 = west, 180 = south, −90 = east), same convention as the ?at= camera yaw.
// IKEA SKANSNÄS table and 4 chairs, brown beech (#62/#63; ikea.com s19561595: extendable table 150/205 ×
// 90 cm, H 75, butterfly leaf — modelled closed, 150 cm; chair W 48 × D 51 × H 78; the seat height 45 cm,
// leg/apron sizes and the corner radius are guesses). Frame colour shared by table and chairs; the
// chair seat is light woven paper cord. chairUnder = how far the seat goes in under the top.
export const SKANSNAS = {
  color: 0x6a4e3a, seatColor: 0xd8c6a0,
  table: { x: 3.5, z: 1.41, l: 1.5, lExtended: 2.05, w: 0.9, h: 0.75, top: 0.025, corner: 0.06, apronH: 0.07, leg: 0.05 },
  chair: { w: 0.48, d: 0.51, h: 0.78, seat: 0.45 },
  chairUnder: 0.2,
};

// IKEA IDANÄS upholstered storage bed, Gunnared dark grey, 180 × 200 (#91; ikea.com: length 223, width 190,
// headboard height 121, footboard/frame height 49). Headboard thickness, leg height, drawer sizes and the
// 22 cm mattress are guesses. `head` = depth behind the mattress taken by the sloping headboard.
export const IDANAS = { L: 2.23, W: 1.9, frameH: 0.49, headH: 1.21, head: 0.2, legH: 0.1, mattressH: 0.22, color: 0x5f6266 };

export const FURNITURE = [
  // Vardagsrum: sofa with its back to the window (south wall), chaise in the SE corner
  { type: 'sofa', level: 0, x: 5.5 - 2.82 / 2, z: 12.15 - 0.89 / 2, rot: 0, chaise: 'right' }, // sitter's right = east
  // armchair + the dark red stool (#180) in the opposite (NW) corner, turned towards the room
  { type: 'armchair', level: 0, x: 0.78, z: 8.38, rot: -135 },
  { type: 'ottoman', level: 0, x: 1.33, z: 8.93, rot: -135 },
  // IKEA NYMÅNE floor lamp with 3 spots, anthracite (#56; ikea.com: H 160 cm, base Ø 25 cm; arm and head
  // sizes are guesses): beside the armchair on the sitter's right (the side table is on the left),
  // the spots aimed at the seat; `aim` = plan point they point at
  { type: 'floorlamp', level: 0, x: 0.36, z: 8.86, aim: [0.78, 8.38], h: 1.6, base: 0.25 },
  { type: 'sidetable', level: 0, x: 1.52, z: 8.12, flower: true },
  // IKEA BESTÅ display combination with glass doors, white / Lappviken walnut effect, 120 × 42 × 193 cm (#104, ikea.com
  // s79612224): two columns, three 64 cm sections each (walnut door, glass door, walnut door). Wall-hung on the west
  // wall (x 0.202) between the armchair/floor lamp (z < 9.1) and the palm (z > 11.5), 35 cm above the floor (the user:
  // floating; tunable). Section heights, handle colour and the spots' positions are *guesses*.
  { type: 'besta', level: 0, room: 'Vardagsrum', x: 0.202, z: 10.55, y: 0.35, rot: -90, w: 1.2, d: 0.42, h: 1.93,
    sections: [0.64, 0.65], walnut: 0x6e4b33, handle: 0x1e1e20, spots: [-0.4, 0, 0.4], openDeg: 100,
    uplight: { w: 0.55, h: 0.65, opacity: 0.55 } }, // the spots' fan of light on the wall above (#188, a look, not measured)
  // Secretary "Bang" (IKEA, c. 1960, #118, docs/sekretar-bang-*.png; Bukowskis: teak veneer, L 70, D 30, H 106.5 cm) on
  // the east wall between the TV bench (z < 8.22) and the chaise (z > 10.55), opposite the BYÅS end. Leg height, the
  // drawer, the flap's slope, the shelf and the right drawer column's width are *guesses* from the photos.
  { type: 'secretary', level: 0, x: 5.5, z: 9.35, rot: 90, w: 0.7, d: 0.3, h: 1.065, legH: 0.55, drawerH: 0.12, slope: 13,
    shelf: 0.15, rightW: 0.24, teak: 0xb06a32, teakInside: 0xc07a3e },
  // Black metal wine rack (#105, the user's photo): 8 bottles lying level (#151, corked; necks towards the BESTÅ, i.e.
  // south = the viewer's left), two champagne with gold foil. On the west wall between the armchair/floor lamp
  // (z < 9.1) and the BESTÅ (z > 9.95), bottom 1.1 m up; 38 × 105 cm and the 10 cm depth are *guesses*.
  { type: 'winerack', level: 0, x: 0.202, z: 9.52, y: 1.1, rot: -90, w: 0.38, h: 1.05, n: 8, depth: 0.1, tilt: 0, champagne: [1, 5] },
  // The abstract painting (#133, docs/tavla-abstrakt-svart-ram.png): portrait, thin flat black frame, ~70 × 100 cm
  // (*guess*), centred over the chaise on the east wall (x 5.5; the chaise spans z ~10.55–12.15), centre 1.55 m up.
  { type: 'painting', level: 0, x: 5.5, z: 11.35, y: 1.55, rot: 90, w: 0.7, h: 1.0, frame: 0.018, depth: 0.025 },
  // Areca / golden cane palm (#106, the user's Amazon pick: "Gold Palm 130 cm", nursery pot Ø 24) in a big anthracite
  // fibre-clay pot (Ø 40 × 45 cm, our pick) right of the patio door seen from inside (between the west party wall at
  // x 0.2 and the door at x 0.95, the wall's inner face at z 12.23). Canes, frond and leaflet lengths are *guesses*
  // for a ~1.5 m total height.
  // `walls`: the fronds stay inside the west party wall and the façade (#137)
  { type: 'palm', level: 0, x: 0.47, z: 11.96, pot: { r: 0.2, h: 0.45 }, potColor: 0x3d3f42, canes: 15, cane: 0.72, frond: 0.85, leaflet: 0.27,
    walls: { x0: 0.2, z1: 12.23 } },
  // Soffbord ILVA Woodstock, top i oljebehandlad ekfaner (art. 1055729): 120 × 60 × 47 cm, legs in
  // oiled solid oak, a fixed shelf below (ilva.dk product page). Centred on the three seats
  // (x 2.68–4.60), 40 cm in front of the sofa (front at z 11.26).
  // Hall, right as you come in, between the EL cabinet and the wardrobes (#49, "KL" on the plan; sizes
  // are our pick): a wall coat rack with a hat shelf and hooks (jackets, a cap) above a two-tier
  // black shoe rack with a few pairs on it
  { type: 'coatrack', level: 0, x: 0.2 + 0.14, z: 1.255, rot: -90, w: 0.74 },
  { type: 'shoerack', level: 0, x: 0.2 + 0.16, z: 1.255, rot: -90, w: 0.74 },
  { type: 'coffeetable', level: 0, x: 3.64, z: 11.26 - 0.4 - 0.3, w: 1.2, d: 0.6, h: 0.47 },
  // IKEA BYÅS TV bench, high-gloss white, 160 × 42 × 45 cm (ikea.com, #67): against the wall opposite the
  // sofa (the stair is behind it), east of the living-room door's architrave, near the sofa's centre line
  { type: 'byas', level: 0, x: 4.25, z: 7.8 + 0.21, rot: 180, w: 1.6, d: 0.42, h: 0.45 },
  // Philips 55" The One PUS8897 on the bench (#68): panel ~123 × 71 cm, thin black bezel, one central
  // anthracite pedestal; depth, stand size and the ~78 cm total height are guesses. E switches it on: a
  // slowly moving colourful demo picture (canvas, ~12 fps) and an Ambilight glow on the wall behind.
  { type: 'tv', level: 0, x: 4.25, z: 7.8 + 0.2, y: 0.45, rot: 180, w: 1.23, h: 0.715, fps: 12 },
  // IKEA SYMFONISK (Sonos) speakers (#186, SYMFONISK below): the black bookshelf speaker lies on the TV bench beside
  // the TV's foot, the white one stands on the worktop at the south end of the kitchen run (clear of the Moccamaster,
  // the cups and the hob), the lamp speaker (frosted glass shade) stands on the window board behind the sofa
  { type: 'symfonisk', kind: 'speaker', color: 'black', lying: true, level: 0, x: 4.86, z: 8.0, y: 0.45, rot: 180 },
  { type: 'symfonisk', kind: 'speaker', color: 'white', level: 0, x: 5.42, z: 4.62, y: 0.934, rot: 90 },
  { type: 'symfonisk', kind: 'lamp', color: 'white', level: 0, x: 4.55, z: 12.3, y: 0.6, rot: 0 },
  // big rug under the sofa's front legs and the coffee table (#55): 300 × 200 × 1.2 cm (size and
  // colours are our pick), light oatmeal with a soft weave and a thin border; no collision
  // Sarah's rug (#171, docs/matta-vardagsrum-sarah.jpg): dark olive with off-white stripes (~2 cm white, 4 cm green)
  // bending round in U arches, square fields of 1 m (3 × 2); colours/stripes read off the photo, size kept at
  // 300 × 200 (Sarah's own may differ)
  { type: 'rug', level: 0, x: 3.9, z: 10.6, w: 3.0, d: 2.0, h: 0.012, color: '#5a6150', stripe: '#e6e1d6', pitch: 0.062, white: 0.022,
    fields: ['ewn', 'nes'] },
  // Uteplats (paved z 12.75–16.8 in front of the hedge, see PATIO): Plantagen Hörngrupp Oslo
  // antracit (art. 558848): corner sofa 198 × 72 × 76 + 186 × 72 × 76 cm on an aluminium frame,
  // table 120 × 60 × 40 cm (plantagen.se). Backs to the hedge and the east screen wall,
  // seats facing north-west; the corner is on the sitter's right (east).
  { type: 'loungesofa', level: 0, x: 5.66 - 1.98 / 2, z: 16.79 - 0.72 / 2, rot: 0 },
  { type: 'loungetable', level: 0, x: 4.15, z: 15.45, beers: true },
  { type: 'parasol', level: 0, x: 3.05, z: 15.7 },
  // large planters with exotic plants (the user's wish): by the patio door and in the SE corner. The
  // banana in the SW corner stood in the gap in the hedge (the way out to the lawn) and is gone (#52).
  // by the hedge, and beside the living-room window
  { type: 'planter', level: 0, x: 0.45, z: 13.25, plant: 'palm', walls: { x0: 0.065, z0: 12.7 } }, // fronds clear of the façade + screen wall (#137)
  { type: 'planter', level: 0, x: 5.3, z: 13.2, plant: 'agave' },
  // Upstairs bedrooms (the user's plan). Beds: rot = direction from the head to the foot end.
  // IKEA NORDKISA bedside tables, bamboo, 40 × 40 cm (ikea.com, #64; the 55 cm height is a guess, about the
  // mattress top): one each side of the double bed's head end (east wall), clear of the Klk door
  // either side of the IDANÄS bed (190 wide, centred at z 2.3): z 1.35 − 0.22 and 3.25 + 0.22
  ...[1.13, 3.47].map((z) => ({ type: 'nordkisa', level: 1, x: 5.55 - 0.23, z, rot: 90, w: 0.4, h: 0.55 })),
  // IKEA NYMÅNE work lamps with wireless charging, white (#65; base Ø ~20 cm, arms and head guessed from the
  // product photo), one on each bedside table, the head reaching over towards the bed; E on each one
  ...[[1.13, 180], [3.47, 0]].map(([z, rot]) => ({ type: 'worklamp', level: 1, x: 5.55 - 0.25, z, y: 0.55, rot })),
  // IKEA RÅGRUND chair with towel rack, bamboo (#60; H 140, W 39, D 44, seat 48 cm per IKEA/dimensions.com):
  // Sovrum 1, the corner left of the window seen from inside (NW), back and towel rack against the
  // west wall, seat facing into the room (east); the seat is below the window sill (BH 0.7)
  { type: 'ragrund', level: 1, x: 2.70 + 0.23, z: 0.465 + 0.205, rot: -90, towel: 0x9fb8c9 },
  // Sovrum 1 (Sarah & Olof), head east, clear of the Klk. Bedding (#83, an IKEA set from a Sellpy ad):
  // sage green with a dense chintz of coral and pink peonies, ochre, slate-blue leaves and grey-green
  // stems, white outlines (colours read off the photo); a pink cushion and a light grey throw to go with it
  // IKEA NORDLI chest of 8 drawers, white, 120 × 99 (#94; the 47 cm depth is a guess). Sovrum 1 has no
  // wardrobe, its storage is the Klk behind the sliding door: inside 1.65 × 1.20 m (x 3.90–5.55,
  // z 4.29–5.48), the door slides in the wall plane. The chest stands against its back (south) wall,
  // centred, 73 cm of floor left in front of it; facing north (into the Klk)
  { type: 'nordli', level: 1, x: (3.90 + 5.55) / 2, z: 5.48 - 0.235, rot: 0, w: 1.2, h: 0.99, d: 0.47 },
  // the mattress centre: the headboard (IDANAS.head) against the east wall
  { type: 'bed', level: 1, x: 5.55 - IDANAS.head - 1.0, z: 2.3, rot: 90, w: 1.8, l: 2.0, model: 'idanas',
    // repeat = metres per texture tile (blooms ~8–15 cm)
    bedding: { pattern: 'chintz', ground: '#adc2b1', repeat: 0.9, flowers: ['#d0696b', '#c9505a', '#e9b7bd', '#d4b45a'],
      leaves: ['#6f7b86', '#8a96a0', '#7f9a83'], throw: 0xdcdcd8, cushion: 0xe2a3ab } },
  // Bunks: long side against the side wall, head end against the façade (the user's wish);
  // the ladder ends up on the room side at the foot end.
  { type: 'bunk', level: 1, x: 0.2 + 0.5, z: 0.47 + 1.05, rot: 180, w: 0.9, l: 2.0, sheets: 'unicorn' }, // Sovrum 3 (Livia & Tuva)
  // Livia & Tuva's desk (#92): IKEA ALEX, white, 132 × 58 (ikea.com; the 76 cm height and drawer sizes are
  // guesses), under the window against the north wall, east of the bunk; a white kids' swivel chair in
  // front (a seat, #71) and crafts on the top, the middle left free for the drawing paper (#93)
  // Philips 32" PFS6906 (#100, Elgiganten: 3-sided Ambilight, thin silver bezel; panel ~71 × 41 cm), wall-mounted on
  // Sovrum 3's east wall (x 2.61) straight across from the bunk (z 0.47–2.57), clear of the desk (z < 1.04) and the
  // wands' hooks (z ≥ 2.85); centre 1.2 m up (the user: watchable from both bunks; tunable). Faces west.
  { type: 'tv', level: 1, x: 2.61, z: 1.75, y: 1.2, rot: 90, w: 0.71, h: 0.41, fps: 12, px: 256, mount: 'wall', name: 'tv:n' },
  { type: 'alex', level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.29, rot: 180, w: 1.32, d: 0.58, h: 0.76 },
  { type: 'kidchair', level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.58 + 0.25, rot: 0 },
  // Sovrum 2 (Walter & Kian). watch.z: a seat in the lower bunk (local z, level with the desk's monitor)
  // for watching films on the PC
  { type: 'bunk', level: 1, x: 5.55 - 0.5, z: 12.23 - 1.05, rot: 0, w: 0.9, l: 2.0, sheets: 'vader', watch: { z: -0.3 } },
  // Walter & Kian's gaming corner (#77, #84): a black desk 140 × 70 along the west wall (opposite the bunk),
  // its short end against the south window wall, facing east; curved 34" ultrawide on a monitor arm, RGB
  // tower at the window end (out of the bunk's line of sight), keyboard, mouse, headset, speakers (sizes
  // our pick). E on it switches the PC on (animated game screen, RGB cycling, game sounds). The black/green
  // gaming chair in front of it is a seat (#71) and sitting down starts the PC; sitting in the lower bunk
  // swings the monitor round towards it and plays a film.
  { type: 'gamingdesk', level: 1, x: 2.75 + 0.35, z: 12.23 - 0.7, rot: -90, w: 1.4, d: 0.7, fps: 12 },
  { type: 'gamingchair', level: 1, x: 2.75 + 0.35 + 0.62, z: 12.23 - 0.7, rot: 90 },
  // Sovrum 4 (Tilly): IKEA HEMNES dagbädd m 3 lådor, vit, 207 × 89 × 83 cm (ikea.com), back to the
  // west wall, with pink cushions. rot = the way the seat faces.
  { type: 'daybed', level: 1, x: 0.2 + 0.46, z: 10.0, rot: -90 },
  // Matplats: IKEA SKANSNÄS (#62/#63), closed (150 cm), the short end to the kitchen window and a little
  // west of its centre so the east chairs clear the kitchen fronts (x 4.95); two chairs on each long
  // side, pushed in under the top (#57)
  { type: 'skansnasTable', level: 0, x: SKANSNAS.table.x, z: SKANSNAS.table.z },
  ...[-1, 1].flatMap((side) => [-1, 1].map((k) => ({
    type: 'skansnasChair', level: 0, rot: side < 0 ? -90 : 90, // west side faces east, east side faces west
    x: SKANSNAS.table.x + side * (SKANSNAS.table.w / 2 + SKANSNAS.chair.d / 2 - SKANSNAS.chairUnder),
    z: SKANSNAS.table.z + k * SKANSNAS.table.l / 4,
  }))),
];
