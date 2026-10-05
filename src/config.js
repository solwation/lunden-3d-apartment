// Everything the PDF does not tell us. Values marked "guess" should be verified
// against Peab's drawings/photos (see GitHub issues) and adjusted here.
// "bofakta" = Peab's fact sheet for L1002–L1007 (2024-11-08, FOJAB): BH = sill height,
// RH = room height, from https://peabbostad.se/projekt/skane/kv.-lunden/l1007/

// Vertical reference (#344, architecture review 01). The model keeps four things apart per level: the finished floor
// level (FFL, absolute y), the clear room height (RH, finished floor -> finished ceiling, bofakta), the slab zone above
// it (finished ceiling -> the next finished floor: structure + floor build-up + ceiling) and, on top, the roof / deck
// build-up. RH is NOT the floor-to-floor distance; window BH (`WINDOWS` sill) is measured from the level's finished
// floor. Each value says where it comes from: 'drawing' (stated on a Peab drawing / bofakta), 'read' (read off one,
// e.g. with the scale bar) or 'assumption' (none of Peab's material gives it). Do not swap an assumption for another
// "normal" value: it needs a section with levels (plushöjder), which we do not have. Every floor and ceiling level in
// the code is derived from this, once.
export const VERTICAL = {
  // y 0 = the finished floor of L1007's Entréplan (våning 1), which is also the street / courtyard level here
  // (SITE.terrain); everything is relative to it. No absolute height (RH2000) is known.
  datum: { y: 0, what: 'FFL L1007 Entréplan (våning 1)', source: 'assumption' },
  levels: [
    // Entréplan = våning 1. bofakta: "Takhöjd ca 3,0 m. Lokalt lägre över tvätt." `slab` = the zone from its finished
    // ceiling to Övre plan's finished floor (assumption)
    { name: 'Entréplan', storey: 1, rh: 3.0, rhSource: 'drawing', slab: 0.25, slabSource: 'assumption' },
    // Övre plan = våning 2. bofakta: "Takhöjd ca 2,8 m. Lokalt ca 2,4 m vid sovrummens fönster." `slab` = our roof
    // zone up to våning 3's finished floor = the upper unit's floor and the loftgång deck (assumption)
    { name: 'Övre plan', storey: 2, rh: 2.8, rhSource: 'drawing', slab: 0.35, slabSource: 'assumption' },
  ],
  // Hus L våning 3–4 (L1201–L1209): floor-to-floor per storey; no RH or section for them here (assumption)
  upper: { storeys: 2, floorToFloor: 3.0, source: 'assumption' },
  // the flat roof over våning 4: its build-up over våning 4's structure top + the sheet-metal capping (assumption)
  roof: { buildUp: 0.3, capping: 0.05, source: 'assumption' },
};
// Derived: read these, do not redefine them. The FFL of each level = the FFL below + its RH + its slab zone (each slab
// counted once): Entréplan 0, Övre plan 0 + 3.0 + 0.25 = 3.25, våning 3 (the top of our unit, the loftgång deck)
// 3.25 + 2.8 + 0.35 = 6.4, våning 4 at 9.4, the roof over it at 12.4 (+ 0.3 build-up + 0.05 capping). What hangs on the
// assumed values: the stair's total rise (stairs.js: LEVELS[1].floor - LEVELS[0].floor, #09), the façade band between
// the window rows, the loftgång / upper units / roof heights (exterior.js, greet.js, weather.js, people.js) and so the
// sight lines from outside.
export const SLAB = VERTICAL.levels[0].slab; // slab zone between Entréplan and Övre plan (assumption)
// `floor` = FFL (absolute y), `ceiling` = RH (relative to its floor, as always), `top` = the next level's FFL
export const LEVELS = [];
for (let i = 0, y = VERTICAL.datum.y; i < VERTICAL.levels.length; i++) {
  const v = VERTICAL.levels[i];
  LEVELS.push({ name: v.name, storey: v.storey, floor: y, ceiling: v.rh, top: y + v.rh + v.slab });
  y += v.rh + v.slab;
}
/** FFL of våning 3 = the top of our two-storey unit (its roof is the upper unit's floor and the loftgång deck). */
export const UNIT_TOP = LEVELS[LEVELS.length - 1].top;
/** FFL of Hus L's våning n (1-based: 1–2 = our levels, 3–4 the upper units; n = 5 = the top of våning 4's structure). */
export const storeyFloor = (n) => (n <= LEVELS.length ? LEVELS[n - 1].floor
  : UNIT_TOP + (n - LEVELS.length - 1) * VERTICAL.upper.floorToFloor);

// Lowered ceilings (soffits), in plan metres relative to the level's floor.
// x/z ranges are clipped to the interior by the walls anyway.
// Sources kept apart (#352): `height` is the documented RH (bofakta); `extent` says how sure the box is:
// 'rooms' = the rooms bofakta names, outlined by the plan's walls (model coordinates, not a drawn soffit);
// 'guess' = the depth itself is estimated. Waiting for a section / ceiling plan: every soffit's real outline.
export const SOFFITS = [
  // bofakta: "RH: 2,5m" over Tvätt + Badrum
  { level: 0, x0: 0.2, x1: 2.06, z0: 3.05, z1: 7.6, height: 2.5, extent: 'rooms' },
  // bofakta: "RH: 2,4m" in Sovrum 3 + Sovrum 1, boxed-in ceiling (inklädnad) ~1.5 m deep
  // from the north façade — the access balcony (loftgång) for the units above runs here. The RH 2.4 is local, at
  // the windows ("Lokalt ca 2,4 m vid sovrummens fönster"), not the room height of the whole bedroom; the 1.5 m
  // depth is a guess.
  { level: 1, x0: 0.2, x1: 5.55, z0: 0.46, z1: 0.46 + 1.5, height: 2.4, extent: 'guess' },
  // bofakta: "RH: 2,5m" in WC/dusch
  { level: 1, x0: 0.2, x1: 1.42, z0: 5.05, z1: 7.6, height: 2.5, extent: 'rooms' },
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
// Sliding doors whose panel runs on the far side of the wall from the plan's arrow: [level, x, z] in the gap (#329; none
// now — Sovrum 1's Klk door runs on the room side as Peab draws it).
export const SLIDE_FLIP = [];
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
  { level: 1, room: 'Sovrum 4', text: 'Tilly', color: '#e2d9f6' },
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
// Every window has one top-hung sash (the user, #272; the street side first, 9550faf, from the site photo
// docs/foton/framsida-fonster-bygge.jpg): no mullion, the sash below the fixed transom (if any) is hinged along its head
// and its bottom swings out up to WINDOW_TOP_HUNG_MAX degrees (*guess*).
// The living-room window is the exception (the user, #272, as on the L1004 render): a fixed transom over the whole
// width and below it an off-centre mullion — a wide fixed pane on the left and a narrow top-hung sash on the right,
// seen from inside looking out (south: right = west = the plan's x0 side). `split` = the opening sash's share of the
// width (~115 : 210 px in the render, *guess*), `opens` = its side ('a' = x0, 'b' = x1); the other side is fixed.
export const WINDOW_TOP_HUNG_MAX = 40;
export const WINDOWS = [
  { level: 0, facade: 'north', x: 3.85, sill: 0.8, head: 2.6, transom: 0.45, blind: 'light' }, // Kök/matplats
  // #429 (the user's choice): the Verona sofa's westernmost back stands 6 cm out from the façade under the sash, so the
  // sash opens only `max`° (its bottom then ~1 cm short of the back's top rail at z 12.76, patiotest checks it)
  { level: 0, facade: 'south', x: 3.85, sill: 0.6, head: 2.6, transom: 0.45, split: 0.35, opens: 'a', max: 4, blind: 'light' }, // Vardagsrum
  { level: 1, facade: 'north', x: 1.80, sill: 0.9, head: 2.25, transom: 0, blind: 'dark' },   // Sovrum 3
  { level: 1, facade: 'north', x: 3.85, sill: 0.7, head: 2.25, transom: 0, blind: 'dark' },   // Sovrum 1
  { level: 1, facade: 'south', x: 1.45, sill: 0.7, head: 2.4, transom: 0.4, blind: 'dark' },  // Allrum = Sovrum 4 (Tilly)
  // Sovrum 2 (#353, architecture review Issue 10): the user's word (#107) is that it is SMALLER than Sovrum 4's; the
  // original L1007 sheet already draws it so — its opening ~1.41 m (x 3.142…4.552, data/plan.json) against Sovrum 4's
  // ~1.61 m — so the drawing governs (the user, #353): the PDF opening and the sheet's BH 0.7. The width is read off the
  // drawing, not a verified product size; head 2.25 and no transom stay *guesses* (no source gives the head).
  { level: 1, facade: 'south', x: 3.85, sill: 0.7, head: 2.25, transom: 0, blind: 'dark' }, // Sovrum 2
];

// Pleated blinds (plissé) in every window (#273, the user; docs/plisse-gardin-nerifran-upp.jpg, Hemtex), bottom-up:
// the folded pack lies on the window board against the frame and the top rail is drawn up, at most to the window's
// head — over the transom too (one blind per window, in the reveal on the room side of the frame, so the top-hung
// sash opens outwards behind it; the living room's mullion splits it in two: one over the wide fixed pane, one over
// the narrow sash). `blind` per window in WINDOWS: 'dark' = blackout (the bedrooms), 'light' = white, translucent
// (Entréplan). They are fittings: F keeps them. Our picks / *guess* unless noted:
// pleat = the pitch of the folds fully drawn (the photo: ~2 cm), fold = half a pleat's fabric width (the folds'
// depth is √(fold² − rise²), deepest in the pack), pack = fabric thickness per pleat when folded, rail = the
// aluminium rails' height / depth, gap = the blind's plane, this far into the room from the frame's centre plane,
// speed = m/s while W/S (▲ ▼) are held (the issue's guess). Light: `dim` = the share of the room's daylight (hemi /
// ambient / fill, the sun casts the blind's shadow anyway) a fully drawn blind takes away — a bedroom with every
// blackout blind up gets dark, a white one only softens; `glow` = a white blind's emissive by day (+ `sun` when the
// sun shines on its façade) and warm from a lit room at night (seen from outside too); `fade` = s for the room to
// follow. The state is kept per window in localStorage ('lunden.blinds'); the first pull of each blind scores.
export const BLINDS = {
  pleat: 0.02, fold: 0.011, pack: 0.0004, rail: { h: 0.018, d: 0.022 }, gap: 0.062, speed: 0.3,
  colors: { dark: 0x2a2b2e, light: 0xf2efe6, rail: 0xb8bbbf, warm: 0xffc27a, day: 0xfff6ea },
  dim: { dark: 0.85, light: 0.3 },
  glow: { day: 0.22, sun: 0.3, lamp: 0.3, dark: 0.03 },
  fade: 1.2,
};

// Curtains in Sovrum 1 (#342, the user; docs/gardiner-sovrum1-turkos-djurmonster.jpg, src/curtains.js): two floor-length
// teal panels with a jungle-animal print (drawn on a canvas by us: no brand) on a slim white ceiling track under the
// soffit (RH 2.4), in the room in front of the blind. #362 (the user: "hela vägen bort till andra sidan, och tvådelade"):
// a classic split on ONE track (`z`) from the west wall (`west`, the room's west face x 2.70) to `east` (clear of the east
// wall): the panels meet at the window's centre (`meet`, WINDOWS x 3.85 / the glass's middle) and part to either side.
// #403 (the user): the double bed moved 0.25 m south (towards the Klk), so the RÅGRUND chair (#60) could move south out of
// the corner strip the west stack hangs in (z 0.47–0.70; the chair now z 0.725–1.115) and the west panel's outer end
// (`stop`, an end stop at the wall) parks by the west wall: parked, both stacks are clear of the glass. The east panel
// runs to the track's east end and parks clear of the glass. `stack` = a parked stack's width as a share of its cloth
// (*guess*, wave pleats); `drop` = hem over the floor, `top` = the fabric's top under the soffit; fullness 1.4 × the shut
// width (*guess*), `amp` = the folds' largest half-depth (deeper as it gathers; the fold count stays, the spacing shrinks),
// `tile` = m of fabric per pattern repeat. Our picks / *guess* unless noted. `dim` = the room's daylight a fully drawn
// pair takes (less than the blackout blind); `glow` = the teal emissive by day (a little light through the cotton), lamp =
// from a lit room. `speed` m/s of the east panel's leading edge while A / D are held (the west one keeps pace: same share).
export const CURTAINS = [
  { level: 1, room: 'Sovrum 1', west: 2.71, stop: 2.72, meet: 3.855, east: 5.32, z: 0.6, glass: [3.15, 4.56], stack: 0.22,
    top: 2.36, drop: 0.015, fullness: 1.4, amp: 0.028, tile: 0.7, speed: 0.38, dim: 0.4,
    colors: { ground: '#2f7c86', track: 0xf3f2ee, glow: 0x3fa3ad, warm: 0xffc27a }, glow: { day: 0.18, lamp: 0.08 } },
];

// Flower pots on the inner window boards (#136, the user: "blomkrukor med blommor i alla fönsterkarmar";
// src/sillplants.js). Plants per window in plan order (Entréplan kitchen, living room; Övre plan Sovrum 3, 1, 4, 2),
// 2–3 pots each, one kind per pot slot. Our picks. #290 (the user: bigger and lusher, in every window): pots `pot.r` /
// `pot.h` m (radius, height; monstera and olive 12 % bigger), plants ~25–45 cm; `clear` = m kept free in front of the
// blind's folded pack (#273), `side` = from the reveal's sides, `trail` = how far ivy / pothos hang down over the
// board's front edge (above a desk or table under the window). Our picks.
export const SILL_PLANTS = {
  kinds: ['pelargon', 'orchid', 'violet', 'cactus', 'ivy', 'basil', 'monstera', 'pothos', 'fern', 'olive'],
  byWindow: [['basil', 'pelargon', 'basil'], ['orchid', 'monstera', 'fern'], ['pothos', 'violet'], ['orchid', 'fern', 'violet'], ['olive', 'cactus', 'pelargon'], ['cactus', 'ivy']],
  skip: [[0, 2], [0, 1], [1, 2], [3, 2], [3, 0]], // [sill, pot]: no pot there (the black SYMFONISK speaker in the kitchen window, #289, #298, the smart display beside it, #325; the lamp on the window board behind the sofa, #186; Sovrum 1's window: the Hue Go at the west end, the white speaker at the east end, the fern moved to the middle slot (byWindow), #201, #298, #409, #418)
  pot: { r: [0.062, 0.072], h: [0.115, 0.14] },
  clear: 0.03, side: 0.015, trail: 0.11,
  // a colour (or a list: one picked per pot); orchids: [petals, lip] pairs
  colors: { pelargon: [0xd8283a, 0xe8577a, 0xf06a4a], orchid: [[0xf7f2f5, 0xe58fc4], [0xe58fc4, 0xb8337a]], cactus: 0xff6fa8, violet: [0x7b3fb5, 0xc04fa0] },
};

// The site, measured on FOJAB's situation plan and overview plans in Peab's plan brochure
// (docs/peab/, 1:500; drawn with Hus L horizontal, so the plan axes are ours: x along the row,
// z towards the courtyard; metres from our unit's NW outer corner). Scale from the sheets' 0–25 m scale bars
// (docs/peab/kalibrerad/skalstockar.json, #253): the first tracing took it from a 5.75 m unit pitch and came out 3.6 %
// too big (the units share their party walls: 5.55 m), so everything traced then was scaled by 5.55 / 5.75; the
// Å-husen are re-measured on våning 1–3 (outer corners incl. the corner piers).
// Kv. Lunden = four buildings around a courtyard on top of a garage: Hus L "Parklängan" (ours)
// along Sankt Lars väg, the point blocks Å-huset A, B, C to the south/west. The ground drops
// ~3 m south of the courtyard (A/B have a suterräng floor) towards S:t Lars park and Höje å.
// Buildings outside the plot (schools, shop, villa) are placed from the Google Maps screenshot
// (docs/tomten-google-maps.jpg) — illustrative boxes, not surveyed.
export const SITE = {
  // Terrain (#79). Kv. Lunden stands on a garage box: the courtyard ("den upphöjda gården", info brochure
  // p. 16) lies on the garage deck at our Entréplan / patio level (y 0; the lower row houses have their
  // patios "mot den gemensamma gården", and their entrances "direkt från gatan", so Sankt Lars väg north
  // of Hus L is at y 0 too; #256: its east leg and Karpvägen slope down southwards, `east` / `west`). Around the box the ground lies one storey lower: Å-husen A and B have a
  // "Våning -1 (sutteräng)" (overview plans p. 24) and the green between A and B lies "utanför den
  // upphöjda gården och ner mot å-rummet". `park` = that level. `box` = the garage box (plan rects);
  // its edges (#254) are measured on the suterräng plan (våning −1) and the level lines on våning 1
  // (docs/peab/kalibrerad/). South of Hus L the roads outside the box go down to the park level over `slope` m
  // (guess). The garage entrance ("INFART GARAGE", våning −1; "NEDFART TILL GARAGE UNDER KVARTERET", situation
  // plan) is in the box's west wall south of Hus C, reached from Karpvägen over a short asphalt drive.
  terrain: {
    // #346 (docs/peab/arkitekturgranskning-2026-10-04.md, issue 03): every terrain height here is RELATIVE, in metres to
    // `ref`: the courtyard on the garage box = our Entréplan's finished floor = model y 0 (LEVELS[0].floor). Peab's material
    // gives no plushöjd (RH 2000) for it, so `ref.plus` stays null — no height in the model is a surveyed level.
    // `documented` = the plans' only level differences (overview plans S2 / våning 1), each a LOCAL condition at its own
    // place, never summed into one site-wide fall: the courtyard ~3 m above the park / å-rum (`park`, taken by the box's
    // retaining walls), the east ramp ~0.9 m (`ramp.drop`), the east stair ~1.4 m (`stairs[0].drop`), the NW stair by
    // Hus C ~1 m (`west.profile` at the stair). Everything between (slopes, break points, wall heights) is a guess until
    // a grading plan or section turns up (tools/terraintest.html checks the joins, not the terrain's truth).
    ref: { y: 0, plus: null }, documented: { park: 3, ramp: 0.9, eastStair: 1.4, nwStair: 1.0 },
    // `slope` (guess): only east of Sankt Lars väg, outside the plot, does the ground ease down to the park level over
    // that many metres south of Hus L's back; round the courtyard the 3 m is a vertical retaining wall (no slope crosses it)
    park: -3, north: 12.7, slope: 8,
    // the box (#254): the west part from Hus C's west façade (the garage's outer wall towards Karpvägen) to Hus B's
    // west façade and south to the level line at z 52.5 (the yard south of Hus C: second pergola, sandbox,
    // odlingslådor); the middle part up to the level line "NIVÅSKILLNAD CA 3M" from Hus B's NE corner to Hus A's
    // west façade (z 33.3); the east part up to Hus A's north face. The green between A and B is outside it.
    // #255: the east part ends at x 11.6; beyond it a strip x 11.6…13.5 inside a wall along Sankt Lars väg holds the
    // ramp ("RAMP NIVÅSKILLNAD CA 0,9M", våning 1: from Hus L's east gable at z 11.5 to a landing at z 24.5…27.25 that
    // opens onto the walk along Hus A). #256: the landing is the box's last part; the `ramp` falls `drop` m from it (z1)
    // northwards to the street level by the gable (z0), where the east leg lies 0.9 m below the courtyard.
    box: [{ x0: -70.5, x1: -41.7, z0: 12.1, z1: 52.5 }, { x0: -41.7, x1: -9.76, z0: 12.1, z1: 33.3 }, { x0: -9.76, x1: 11.6, z0: 12.1, z1: 28.8 },
      { x0: 11.6, x1: 13.5, z0: 24.5, z1: 27.25 }],
    ramp: { x0: 11.6, x1: 13.5, z0: 11.5, z1: 24.5, drop: 0.9 },
    garageDoor: { x: -70.5, z0: 41, z1: 47, h: 2.6, drive: -77.22 }, // `drive`: the asphalt reaches west to Karpvägen
    // East of the courtyard (#255) Sankt Lars väg lies only ~1 m below it, not a storey: from x0 (Hus A's east façade) to
    // x1 (the road's far edge) the ground follows `profile` ([z, y] pairs, linear); east of the road it blends into the
    // park level over `blend` m (north of Hus L's back: back to the street level).
    // (#261: x1 = the far pavement's edge, the long brick building's west face)
    // #256 (the user: the street towards HepCat Store slopes): the east leg is level with the entrances up to z −10 (HepCat's
    // north end, guess), 0.9 m down by Hus L's east gable (the ramp's foot, våning 1), 1.4 m at the foot of the stair, park
    // level further south (guess). The strip along the gable (x `gable`…) falls from the entrance path (z 0) to the ramp's
    // foot; from `level` (the front yard's east edge) to `walk` (our pavement's inner edge) a grass bank meets the road.
    east: { x0: 9.42, x1: 31.3, blend: 2.5, gable: 11.6, level: 13.5, walk: 18.4, profile: [[-10, 0], [11.6, -0.9], [30.0, -1.4], [44, -3]] },
    // #256: Karpvägen also slopes south (våning 1: "NIVÅSKILLNAD CA 1M" at a "TRAPPA" by Hus C's NW corner). West of `x`
    // (Hus C's west façade line) the ground follows `profile` (fitted to where the stair's risers end on the plan, then
    // down to the park level where the garage drive starts, z 40.5 = garageDoor.z0 − 0.5, so the drive in front of the
    // door is level with the garage floor (#346; the slope in between: guess). The `stair`: `risers` lines from x0 (its foot) to x1 (the top),
    // running from where the sloping verge meets each step south to z1; from z1 to Hus C a retaining wall.
    west: { x: -70.5, profile: [[-2.8, 0], [11.25, -1.0], [40.5, -3]], stair: { x0: -70.5, x1: -68.69, z1: 10.6, risers: 7 } },
    // stairs from the courtyard (y 0) going south, `z` = the box edge they leave; `drop` m in `steps` (default: down to
    // the park level, ~0.17 m each, a `landing` halfway); `walk` = paving from the foot. #255: "TRAPPA NIVÅSKILLNAD CA
    // 1,4M" (våning 1: 9 risers x 11.6…13.5, z 27.25…30) from the landing at the walk along Hus A down to the walk east
    // to Sankt Lars väg (z 30…31.8). #254: "TRAPPA" between Hus C and Hus B (x −47.4…−45.9, from the level line at
    // z 52.5 down to z ≈ 59).
    stairs: [{ x0: 11.6, x1: 13.5, z: 27.25, step: 0.3, drop: 1.4, steps: 9, walk: { x0: 11.6, x1: 19.7, z0: 29.95, z1: 31.8 } }, // the walk meets the pavement along Sankt Lars väg (SITE.roads)
      { x0: -47.4, x1: -45.9, z: 52.5, step: 0.3, landing: 1.0 }],
  },
  // façade texture of the other blocks: one window per 3 × 3 m. `storey` = one generic floor-to-floor height for Hus A, B
  // and C (assumption, #344): plan brochure S2 gives only their storey counts (A suterräng + 1–4, B suterräng + 1–3,
  // C 1–5 = `storeys` from `base` in `blocks`), not equal or known heights; it sets their eaves, window rows and loggias
  bay: 3.0, storey: 3.0,
  // the Å-husen's shape (#145, #258), measured on the calibrated overview plans (docs/peab/kalibrerad/vaning-1/2-300dpi.png):
  // each corner is a loggia over the full height, `corners` per block = [length along x, depth along z] in m (A and B: the
  // north ones 3.4 × 2.0, the south ones 5.9 × 2.05 with the middle 7.5 m standing out; Hus C is turned: its NE one opens
  // east, 2.0 × 4.15). White slabs and rendered inner walls ("håligheter … vitputsade", info brochure), a brick pier at
  // the outer corner and one `midAt` m along a front longer than `mid` (the plans draw it), a slatted railing in the façade
  // line. `recesses` per block: { face n|e|s|w, a0, a1 (plan coordinate along the face), depth, from/to (storeys, counted
  // from `base`; none = all), door (the storey with the entrance door) } — white-rendered entrance recesses (A/B north,
  // A west / B east at the park level, Hus C east with loggias above). `plants` = share of the loggias with a plant.
  // #266 (docs/hus-a-loggia-norr-skarmbild.png, docs/peab/hus-a-norrfasad-vaning1.png): on every storey the longer
  // inner wall has a glazed `door` from the flat in the inner corner (`gap` from the other inner wall) and a `window`
  // `from` m from the façade line, up to `max` wide and `gap` short of the door (NW 1.0 m, SW 2.2 m on the plans); the
  // other inner wall is solid. A loggia whose floor is at the ground (the flats' uteplatser, våning 1 on the courtyard)
  // has a brick `parapet` (h, t: guess) with a light coping instead of the railing, with an `open`ing next to the
  // flat's wall on the longer front (våning 1: the band stops ~0.85 m short, x −7.2…−6.4 for Hus A NW). The upper
  // storeys keep the light slatted metal railing (thin lines on våning 2–4, Peab's aerial render). `entrance`: the
  // recess's glazed door (w) with a sidelight (side), a canopy over the mouth (out, at, t), a house letter beside it.
  loggia: { pier: 0.5, rail: 1.05, plants: 0.35, mid: 4.5, midAt: 3.5,
    door: { w: 0.9, h: 2.3, gap: 0.08 }, window: { from: 0.9, max: 2.2, gap: 0.5, sill: 0.8, head: 2.3 },
    parapet: { h: 1.05, t: 0.2, open: 0.85, coping: 0.04 },
    entrance: { w: 1.1, side: 0.55, h: 2.35, canopy: { out: 0.7, at: 2.85, t: 0.14 }, sign: 0.42 } },
  // their roof: a low hip roof with the ridge along the long side (N–S), roofing felt ("papp", Peab's Q&A). #348: each
  // house's own shape = these defaults with the block's `hip` over them (`roofSpec` in surroundings.js), its eaves at its
  // own wall top (base + storeys × storey: A over våning 4, B over våning 3, C over våning 5). Roof plans: Hus B's on the
  // våning 4 sheet, Hus A's on våning 5 (page 26 of the plan brochure, same calibration as docs/peab/kalibrerad/): both draw
  // the eave line 0.13–0.21 m outside the façade (`overhang` 0.18) and the hips at 45° in plan meeting a N–S ridge
  // (= the same pitch on all four sides, as modelled), with a roof box near the north end of the ridge (`box`: plan
  // rectangle, read off; its height `h` over the roof is a guess — Peab's aerial render shows a light box there). There is
  // no roof plan for Hus C (våning 5 is its top storey and no sheet shows its roof): it keeps the defaults and no box,
  // though the render shows one. `rise` (ridge over the eave line) and `edge` (the metal edge's top over the wall top) are
  // guesses from the aerial render: no section or elevation gives the pitch or heights. The vent hoods are illustrative.
  hipRoof: { rise: 1.5, overhang: 0.18, edge: 0.32 },
  // #345: the Å-husen's façade openings per house and face (n|e|s|w = the outer façade line between the corner
  // loggias), read off the calibrated overview plans (docs/peab/kalibrerad/vaning-m1…4-300dpi.png; våning 5 for Hus C
  // from page 26 of the plan brochure, same calibration) where the plans draw a window or door in the outer wall:
  // [a0, a1 (plan x on n/s, z on e/w), from, to (storeys counted from the block's `base`), kind ('door'; else a window)].
  // The loggias' and entrance recesses' own openings are not here (#258, #266); the park-level doors under the
  // courtyard deck (into the garage) are left out. Only the horizontal placement and the count are sourced: the plans give
  // no heights or frame division, so `openingSize` (sill / head over the storey floor) and the window's mullion and
  // transom are the old grid tile's guess. A face missing here falls back to the old 3 × 3 m window grid
  // (`bay`, `storey`); fallback faces of Hus A/B/C now: none.
  openingSize: { sill: 0.8, head: 2.3, door: 2.3 },
  facades: {
    'Hus A': {
      n: [[-5.04, -3.2, 1, 4], [-2.02, -0.62, 1, 4], [2.94, 4.76, 1, 4], [0.3, 1.74, 2, 4]], // våning 1: the entrance recess
      e: [[31.84, 33.5, 1, 4], [35.82, 37.44, 1, 4], [39.08, 40.74, 1, 4], [42.38, 43.78, 1, 4], [44.98, 46.36, 1, 4], [48.02, 49.84, 1, 4]],
      s: [[-2.62, -0.8, 0, 4], [0.52, 2.34, 0, 4]],
      w: [[33.96, 34.76, 0, 0, 'door'], [35.82, 37.44, 0, 4], [39.08, 40.74, 0, 4], [44.98, 46.36, 0, 4], [48.02, 49.84, 0, 4],
        [31.84, 33.5, 1, 4], [42.38, 43.78, 1, 4]],
    },
    'Hus B': {
      n: [[-37.22, -35.4, 1, 3], [-31.72, -30.28, 1, 3], [-28.96, -27.14, 1, 3], [-34.0, -32.6, 2, 3]],
      e: [[36.24, 36.76, 0, 0], [37.06, 37.86, 0, 0, 'door'], [40.32, 41.96, 0, 3], [43.62, 45.22, 0, 3], [49.46, 50.9, 0, 3],
        [52.64, 54.46, 0, 3], [36.38, 37.98, 1, 3], [46.88, 48.28, 1, 3]],
      s: [[-34.6, -32.78, 0, 3], [-31.46, -29.64, 0, 3]],
      w: [[36.38, 37.98, 1, 3], [40.32, 41.96, 1, 3], [43.62, 45.22, 1, 3], [46.88, 48.28, 1, 3], [49.46, 50.9, 1, 3], [52.64, 54.46, 1, 3]], // våning −1: against the garage
    },
    'Hus C': {
      n: [[-63.82, -62.22, 0, 4], [-60.72, -58.94, 0, 4], [-57.34, -55.52, 0, 4]],
      e: [[18.11, 20.31, 0, 4], [25.53, 26.97, 0, 4], [28.97, 30.79, 0, 4]],
      s: [[-63.02, -61.4, 0, 4], [-59.76, -58.14, 0, 4]],
      w: [[18.58, 20.4, 0, 4], [21.98, 23.58, 0, 4], [25.4, 27.06, 0, 4], [28.88, 30.32, 0, 4]],
    },
  },
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
    { name: 'Hus A', x0: -9.76, x1: 9.42, z0: 28.8, z1: 52.86, base: -3, storeys: 5, roof: 'hip', // våning -1…4; north face on the box edge (#246)
      hip: { box: { x0: -1.64, x1: 1.28, z0: 33.49, z1: 37.39, h: 1.0 } }, // roof plan on the våning 5 sheet (#348)
      corners: { nw: [3.4, 2.0], ne: [3.4, 2.0], se: [5.9, 2.05], sw: [5.9, 2.05] },
      recesses: [{ face: 'n', a0: 0.23, a1: 2.22, depth: 2.1, from: 1, to: 1, door: 1 },   // the main entrance from the courtyard (våning 1)
        { face: 'w', a0: 41.4, a1: 43.4, depth: 1.0, from: 0, to: 0, door: 0 }] },     // towards the green, park level (våning -1)
    { name: 'Hus B', x0: -41.74, x1: -22.6, z0: 33.3, z1: 57.35, base: -3, storeys: 4, roof: 'hip', // våning -1…3
      hip: { box: { x0: -33.59, x1: -30.67, z0: 38.01, z1: 41.91, h: 1.0 } }, // roof plan on the våning 4 sheet (#348)
      corners: { nw: [3.4, 2.0], ne: [3.4, 2.0], se: [5.9, 2.05], sw: [5.9, 2.05] },
      recesses: [{ face: 'n', a0: -34.58, a1: -32.5, depth: 2.1, from: 1, to: 1, door: 1 }, // mirrored: west of the middle
        { face: 'e', a0: 46.1, a1: 48.1, depth: 1.0, from: 0, to: 0, door: 0 }] },
    { name: 'Hus C', x0: -70.6, x1: -51.4, z0: 12.6, z1: 36.68, base: 0, storeys: 5, roof: 'hip', hip: {}, // våning 1…5; no roof plan: the defaults (#348)
      corners: { nw: [5.5, 2.1], ne: [2.0, 4.15], se: [5.4, 2.0], sw: [6.1, 2.0] },
      recesses: [{ face: 'e', a0: 21.5, a1: 24.8, depth: 2.0, door: 0 }] },                // the entrance, loggias above it
    // outside the plot (#47): the old S:t Lars hospital buildings, as on Peab's drone photo and aerial
    // render (docs/peab/): red brick with white trim, steep dark hip roofs, high storeys and tall
    // white windows. Storey counts and heights are read off those pictures — guesses, not surveyed.
    // #261: outlines from the situation plan (the user's photos agree: HepCat right by the road, the long building
    // further south behind an open gap); the long building's east side and the annex's depth are off the sheet (guess)
    { name: 'HepCat Store', x0: 28.2, x1: 36.4, z0: -10.8, z1: 10.0, base: 0, storeys: 1, roof: 'gable', style: 'hepcat', chimneys: [-5, 4] }, // #127
    { name: 'HepCat Store, the white middle', x0: 27.9, x1: 36.4, z0: -2.6, z1: 1.8, base: 0, storeys: 1, roof: 'gable', style: 'hepcatWhite' },
    // (the ground falls along the road, terrain.east: two parts, each standing on the highest ground under it)
    { name: 'The long brick building', x0: 31.3, x1: 42, z0: 23, z1: 42, base: -1.2, storeys: 1, roof: 'gable', style: 'longhouse' },
    { name: 'The long brick building (south part)', x0: 31.3, x1: 42, z0: 42, z1: 61.6, base: -2.7, storeys: 1, roof: 'gable', style: 'longhouse' },
    { name: 'The long brick building (annex)', x0: 31.3, x1: 36, z0: 61.6, z1: 70.9, base: -3, storeys: 1, roof: 'gable', style: 'longhouse' },
    { name: 'Realgymnasiet', x0: 5, x1: 70, z0: -74, z1: -50, base: 0, storeys: 3, roof: 'hip', style: 'old' },
    // straight across the street from our kitchen (#126): a long two-storey school with end pavilions that stand
    // a little forward (the user's photos; position and length are guesses), behind a brick wall
    { name: 'Skolan över gatan', x0: -21.5, x1: 25.5, z0: -48, z1: -38, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'Skolan, västra flygeln', x0: -22, x1: -13, z0: -48.4, z1: -37.4, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'Skolan, östra flygeln', x0: 17, x1: 26, z0: -48.4, z1: -37.4, base: 0, storeys: 1, roof: 'hip', style: 'school' },
    { name: 'S:t Lars (old hospital)', x0: -62, x1: -22, z0: -62, z1: -46, base: 0, storeys: 3, roof: 'hip', style: 'old' },
    { name: 'Montessorigrundskolan', x0: -78, x1: -60, z0: -115, z1: -70, base: 0, storeys: 2, roof: 'hip', style: 'old' },
    { name: 'Villa', x0: -63, x1: -47.3, z0: 67.7, z1: 84.1, base: -3, storeys: 3, roof: 'hip', style: 'old' }, // brick house, hip roof
  ],
  // The street details (#128, src/street.js; the user's photos in docs/foton/): granite curbs along Sankt Lars väg,
  // patched asphalt, slender street lamps with a curved arm (lit at night: emissive heads + ground pools, #434), a zebra crossing,
  // a temporary yellow traffic light and warning signs for the building site, a cobbled corner and fallen leaves
  // in the autumn months. Positions are our picks.
  street: {
    // curbs run along both edges of every road with a `path` and round the fillets, except across another road (#257)
    patches: [[-31, -27.6, 4.5, 1.6], [-6, -25.4, 2.2, 1.0], [4.5, -28.3, 7, 1.2], [15, -26, 1.2, 1.2], [26, -12, 1.4, 3.5], [-55, -28.5, 3, 1.4]],
    // street lamps in rows along a road (`road` = its name): from / to = the plan points nearest the first and last,
    // `off` m from the road's edge on `side` (1 = right of the path's direction, −1 = left), the arm over the road
    lamps: { h: 6.2, arm: 1.3, rows: [
      { road: 'Sankt Lars väg', from: [-66, -27], to: [24.1, 8], step: 24, side: 1, off: 2.0 }, // our pavement, round the corner
      { road: 'Karpvägen', from: [-75.8, -12], to: [-78.5, 44], step: 26, side: -1, off: 0.8 },  // along Hus C (#257)
    ],
    // #434: the pool of light on the ground under each head (an additive decal, street.js): `along` / `across` the road
    // m (radii, guess), warm `color` at `peak` opacity; lit above `on` night (1 − daylight), out below `off`, `fade` s
    pool: { along: 8, across: 6.5, color: 0xffc887, peak: 0.55, on: 0.35, off: 0.3, fade: 1.5 } },
    crossing: { x0: 9.5, x1: 12.5, z0: -30, z1: -24 },
    trafficLight: { x: 8.6, z: -23.5 }, warnings: [[13.2, -23.0], [10.6, -23.2]],
    cobbles: { x0: 17.2, x1: 19.5, z0: -17.5, z1: -12.5 }, // inside the corner, by the end of our car park
    leaves: { n: 1400, months: [9, 10, 11], areas: [[-60, 12, -24, -18], [-30, 10, -32.1, -30.05], [19, 21, -12, 12]] },
    // signs (#129, the user's photos): the bus stop on the far pavement, the red "Flyttad" sign on ours by the curb,
    // a no-parking sign at the car park, HepCat's A-board on its pavement. [x, z, facing yaw°]
    busStop: [2.5, -31.3, 0], moved: [6.5, -23.75, 0], noParking: [-13.6, -16.9, 0], aBoard: [28.4, -12.2, -60], // by HepCat's north corner (#261, photo)
  },
  // Life on the street (#113, src/streetlife.js). #260, the situation plan (docs/peab/kalibrerad/situationsplan-300dpi.jpg):
  // "P-platser för S:t Lars området" between the hedge (z −16.3) and a low green strip along Hus L (z −3.5…−2.9, open at
  // the portik); one row of stalls nose to the hedge (the plan's ticks, z −16.3…−11.3), none from the drive (in front of
  // the portik — the plan's photo covers that stretch: guess) to the east end; the aisle in front of the entrances. Parked
  // car colours are ours. Bikes lean by some of Hus L's entrances (not ours). NW of Hus L, north of Hus C, the plan's
  // "Cykelvänligt kvarter" yard: a lawn with a tree and two smaller ones, a paved bike place with two rows of racks, a
  // narrow lawn east of it; light paving round it (west of x −66 is left for the stair down to Karpvägen, #256).
  life: {
    lot: { x0: -70.5, x1: -13, z0: -16.3, depth: 5, stall: 2.5 }, fill: 0.65,
    carColors: [0xf0f0ec, 0x23272c, 0x8d9399, 0x1f6f78, 0x7b1e22, 0x2d4e7a, 0xc9c3b8, 0x0f1012],
    bikes: [[-38.8, -0.9], [-38.13, -0.9], [-27.61, -0.9], [-16.79, -0.9], [-16.12, -0.9], [-5.41, -0.9], [12.45, -0.9]], // x, z (along the façade)
    // the low green strip along the entrances: a concrete edge, grass and low perennials (walked over, no collision)
    strip: { z0: -3.5, z1: -2.9, h: 0.1, parts: [[-46, -10.6], [-8.5, 5.8]] },
    yard: { x0: -66, x1: -46.33, z0: -3.5, z1: 9.6 },                              // the bike yard's paving
    lawns: [[-65, -59.1, 1.2, 8.5], [-53, -50.1, 1.2, 8.5]],                         // x0, x1, z0, z1
    bikePlace: { x0: -59.1, x1: -53, z0: 1.2, z1: 8.5 },                              // lighter paving
    // racks along z at x, the bikes along x pointing `dir` (front wheel in the rack), `n` from z0 at `gap` m
    racks: [{ x: -58.7, z0: 1.6, n: 9, gap: 0.75, dir: -1 }, { x: -53.4, z0: 1.6, n: 9, gap: 0.75, dir: 1 }],
    // #436: low concrete edges where the car park's asphalt (`road`) meets grass (not along the paving, the drive's or the
    // street's granite curbs, the stair), and round the bike yard's lawns: `w` wide, `h` over the ground (≤ 5 cm: no step),
    // light grey concrete — sizes are guesses; visual only (no collision, the ground's height is unchanged)
    edges: { road: 'Gården framför Hus L', w: 0.1, h: 0.05, step: 1.0, color: 0xc9c5bc },
    trees: [[-62.5, 3.4, 0.75], [-63.3, 6.0, 0.4], [-61.4, 7.6, 0.45], [15.2, -19.6, 0.45]], // [x, z, size]; the last in the planting strip
    // by the road past the hedge's east end (#435: it stood on the car park's asphalt in front of Hus L's east end)
  },
  // asphalt (y follows the ground: the street level north of Hus L and on the garage box, park level around it).
  // src/roads.js: a rectangle, a centre line (`path`: [x, z, r] — the corner at that point rounded to radius r; `w` = the
  // width at each point; `walks` = pavements along it, `w` m wide on `side` 1 = right of the direction, −1 = left) or
  // `fillets` (asphalt in a square corner between two road edges, a quarter circle of radius r; sx, sz point away from
  // the asphalt). #257, the situation plan: Sankt Lars väg runs along Hus L (z −30…−24, right already) and turns south
  // in a wide curve round the plot's NE corner (the plan's curve is wider still, but it would run over our car park);
  // Karpvägen comes up along Hus C (x −79…−73.5 at z 25–30, −81.6…−75.7 at z 45), bends west into the park south of
  // the sheet, and meets Sankt Lars väg in a sweeping curve on its west side (the plan's NW corner is under a photo:
  // guess) and a small rounding on the east.
  roads: [
    // (#261: the east leg as on the plan: x ≈ 20.9…27.3 by HepCat, 22…29 by the long building)
    { name: 'Sankt Lars väg', path: [[-150, -27], [24.3, -27, 13], [24.1, 0, 30], [25.5, 26, 30], [25.5, 200]], w: [6, 6, 6.4, 7, 7],
      walks: [{ side: 1, w: 2.5 }, { side: -1, w: 2 }] }, // our pavement; the far one along the school's wall (#126)
    { name: 'Karpvägen', path: [[-75.8, -27], [-75.8, 22, 30], [-79.9, 51, 20], [-84.5, 66, 8], [-200, 70]], w: 5.8 },
    { name: 'Karpvägen, hörnen', fillets: [{ x: -78.7, z: -24, sx: -1, sz: 1, r: 9 }, { x: -72.9, z: -24, sx: 1, sz: 1, r: 3 }] },
    { name: 'Gården framför Hus L', x0: -70.5, x1: 13.5, z0: -16.3, z1: -3.5 }, // the car park up to the green strip (#260)
    // the car park's drive (#356): asphalt from Sankt Lars väg over our pavement and the planting strip through the gap in
    // the hedge (SITE.shrubs gaps, x −13…−7.5) into the car park, with rounded mouth corners (the situation plan's photo
    // covers it: guess, like the gap itself, #260)
    { name: 'Infarten', path: [[-10.25, -24.5], [-10.25, -16.1]], w: 5.5 },
    { name: 'Infarten, hörnen', fillets: [{ x: -13, z: -24, sx: -1, sz: 1, r: 2 }, { x: -7.5, z: -24, sx: 1, sz: 1, r: 2 }] },
  ],
  paving: [
    { x0: -46.33, x1: 13.5, z0: -3.5, z1: 0 },  // path along Hus L's entrances (under the green strip too, #260)
  ],                                         // the pavements: roads' `walks`; the courtyard's own walks: COURTYARD
  river: { x0: -193.04, x1: 144.78, z0: 120.65, z1: 130.3 }, // Höje å
  // big old limes / chestnuts along the far pavement and in the school yard (#130, the user's photos): [x, z, size]
  bigTrees: [[-36, -34.5, 1.4], [-17, -35.2, 1.6], [-4, -34.8, 1.75], [9, -35.4, 1.45], [27.5, -34.2, 1.6], [33.5, -16, 1.35], [-58, -33.5, 1.5]],
  // a row of ornamental shrubs along our pavement (#130): the situation plan's hedge between the planting strip and the car
  // park (#260), with the drive into it in front of the portik (guess: the plan's photo covers it)
  shrubs: { x0: -70.5, x1: 11, z: -16.3, step: 0.85, gaps: [[-13, -7.5]] },
  // the narrow planting between Karpvägen and the plot line / Hus C's garage wall (#257, the situation plan: two trees)
  vergeTrees: [[-73.4, 37.5], [-74.4, 50]],
  birchShare: 0.3, // of the trees in the areas (not the young street maples): birches (#115)
  treeAreas: [
    // the courtyard's and the green's trees stand where the situation plan draws them: COURTYARD.trees
    { x0: -88.8, x1: 17.37, z0: -20, z1: -19, n: 11, young: true, skip: [[-14, -6.5]] }, // street trees along Sankt Lars väg: young maples by the site (#130); none in the drive (#260)
    { x0: 16.9, x1: 18.4, z0: -12, z1: 54.05, n: 7 },          // … and along its east leg (west of the cycle path, #255)
    { x0: -125.48, x1: 67.57, z0: 65.63, z1: 135.13, n: 55 },      // S:t Lars park / woods towards Höje å
    { x0: -125.48, x1: -80, z0: -20, z1: 65.63, n: 16 },          // west of Karpvägen (#257: off the road by onRoad)
  ],
};

// The courtyard on the garage box (#80, src/courtyard.js), traced on the situation plan (docs/peab/
// situationsplan.png, p. 3; plan metres as in SITE) and the info brochure p. 16 ("plattsatta gångar,
// en pergola, grillplats, sittytor, en lekplats för barnen och en boulebana", grusgångar, trädrader).
// Items the plan does not show are marked guess.
// The courtyard's kettle grill lit (#204, src/grill.js): `flames` flame sprites up to `height` m, `sparks` sparks, a pool
// light of `light` while it burns; it goes out by itself after `burnSeconds`. Our numbers.
export const GRILL = { flames: 16, height: 1.0, sparks: 40, light: 3.2, burnSeconds: 300 };

export const COURTYARD = {
  // #259: re-measured on the calibrated situation plan (docs/peab/kalibrerad/situationsplan-300dpi.jpg; x = (px − 1805) ×
  // 0.06489 + 11.58, z = (py − 1117) × 0.06489, from Hus L's outline) — walks by their light paving, lawns vs gravel by colour
  // stone-paved walks
  paths: [
    { x0: -44.6, x1: 11.6, z0: 17.8, z1: 19.2 },     // along the row-house patios
    { x0: -44.6, x1: -9.76, z0: 29.7, z1: 31.3 },    // the south walk along Hus B's north side to Hus A's west façade
    { x0: -19.4, x1: -12.8, z0: 31.3, z1: 33.3 },    // … widening into a little square at the edge between Hus B and A
    { x0: -13.2, x1: 11.6, z0: 25.4, z1: 26.8 },     // along Hus A's north side to the stair on the east edge
    { x0: 0.2, x1: 2.2, z0: 26.8, z1: 28.8 },        // to Hus A's entrance
    { x0: 11.6, x1: 13.4, z0: 11.5, z1: 27.25 },     // the ramp along Sankt Lars väg and its landing at the stair (#255; sloped, #256)
    { x0: -15.8, x1: -14.1, z0: 12.7, z1: 19.0 },    // from the portik to the pergola
    { x0: -47.2, x1: -44.6, z0: 7.72, z1: 52.5 },    // between Hus C and the Borggården, to the stair south (#254)
    { x0: -51.4, x1: -47.2, z0: 21.7, z1: 24.6 },    // across to Hus C's entrance (its east façade)
    { x0: -66.2, x1: -47.2, z0: 40.8, z1: 41.8 }, { x0: -66.2, x1: -47.2, z0: 48.7, z1: 49.8 }, { x0: -66.2, x1: -64.6, z0: 40.8, z1: 49.8 }, // round the yard south of Hus C
  ],
  // gravel (stenmjöl): the playground west of the pergola and the strip with the boule court; between them a lawn strip
  // with three trees. Everything else on the box is lawn (the terrain's grass): round the tree squares, east of the pergola,
  // in front of Hus A and Hus B
  gravel: [{ x0: -30.4, x1: -19.9, z0: 19.2, z1: 29.7 }, { x0: -38.0, x1: -32.6, z0: 19.2, z1: 29.7 }],
  // the Borggården's pergola with a dining table (red-brown on the plan) and a second one south of Hus C
  pergolas: [{ x0: -19.3, x1: -13.2, z0: 19.6, z1: 29.4 }, { x0: -63.2, x1: -57.7, z0: 42.1, z1: 48.5 }],
  grill: { x: -20.85, z: 20.27 },               // grillplats beside the pergola (spot: guess); it can be lit (GRILL)
  sandboxes: [{ x0: -25.6, x1: -22.2, z0: 23.9, z1: 27.4 }, { x0: -53.9, x1: -49.6, z0: 44.1, z1: 48.5 }], // lekplats
  boule: { x0: -36.4, x1: -33.2, z0: 20.0, z1: 28.8 }, // boulebana: not marked on the plan; the gravel strip with benches facing it (guess)
  // `rot` = the way the seat faces (0 north, −90 east, 90 west). Where the plan draws them: two by the boule court facing
  // east, one by the sandbox facing it, two on the square by the south walk and two in front of Hus A with their backs to
  // the house (#207), one by the second sandbox. #453: the two in front of Hus A moved along the façade off its north loggias'
  // parapet openings (the plan's places stood right in front of them), between each loggia and the entrance (guess)
  benches: [{ x: -37.3, z: 22.2, rot: -90 }, { x: -37.3, z: 25.4, rot: -90 }, { x: -21.4, z: 26.4, rot: 90 }, { x: -18.0, z: 32.4, rot: 0 },
    { x: -14.4, z: 32.4, rot: 0 }, { x: -3.4, z: 28.1, rot: 0 }, { x: 4.1, z: 28.1, rot: 0 }, { x: -55.5, z: 46.2, rot: -90 }],
  // #438: sitting on every bench and putting things on every table. `bench`: the spots along a free bench (m from its
  // middle; it is 1.6 long); `pitch`: m between the spots along a pergola bench (the table is 0.7 of the pergola long);
  // `grillTable`: the grill's side table west of the kettle (dx from its middle, size, top height: guess)
  sit: { bench: [-0.5, 0, 0.5], pitch: 0.7 },
  grillTable: { dx: -0.62, w: 0.5, d: 0.45, h: 0.8 },
  beds: [{ x0: -68.9, x1: -67.1, z0: 41.4, z1: 42.6 }, { x0: -68.9, x1: -67.1, z0: 43.5, z1: 44.8 }, { x0: -68.9, x1: -67.1, z0: 45.7, z1: 46.9 },
    { x0: -68.9, x1: -67.1, z0: 47.9, z1: 49.1 }], // odlingslådor
  // shrubs and perennials on the green between Hus A and B (park level; the plan shows lawn on the box)
  plantings: [{ x0: -22.2, x1: -10.2, z0: 34, z1: 56, n: 16 }],
  // #112 (after Peab's courtyard renders; places are guesses): low path bollards that light up at dusk along the
  // patio walk, the south walk and the walk along Hus A, a red wooden playhouse by the sandbox, a bike rack with bikes
  // by the portik walk
  bollards: { h: 0.8, r: 0.07, rows: [{ x0: -42.47, x1: 9.65, z: 17.85, step: 6 }, { x0: -43.5, x1: -21.5, z: 29.75, step: 7 },
    { x0: -12, x1: 10, z: 26.85, step: 6 }] },
  playhouse: { x0: -29.9, x1: -27.8, z0: 23.8, z1: 25.7, h: 1.3, ridge: 1.9, color: 0x9c2f24, trim: 0xf2efe7 },
  bikeRack: { x: -12.16, z0: 13.4, n: 5, gap: 0.7, colors: [0x2f5d8c, 0xc23b32, 0x2e2e30, 0x5e8f4a, 0xe8e4da] },
  trees: [ // tree squares and single trees as drawn (#259)
    [-43.2, 20.5], [-39.6, 20.5], [-43.2, 24.1], [-39.6, 24.1], [-42.4, 27.9], [-39.7, 28.1], // the west lawn
    [-31.4, 21.0], [-31.4, 22.9], [-31.4, 27.8], [-11.4, 21.2], [-11.4, 23.9],                 // lawn strips by the playground / pergola
    [-7.1, 20.3], [-4.0, 20.3], [-7.1, 23.5], [-4.0, 23.5], [4.5, 20.3], [7.8, 20.3], [4.5, 23.5], [7.8, 23.5], // the east squares
    [-18.5, 35.5], [-14.8, 35.5], [-18.5, 38.9], [-14.8, 38.9], [-18.5, 42.2], [-14.8, 42.2], [-18.5, 45.6], [-14.8, 45.6], // the green
    [-18.5, 50.3], [-14.8, 50.3], [-18.5, 53.4], [-14.8, 53.4], [-21.0, 44.4], [-12.0, 45.8],                                // between A and B
    [-49.3, 13.1], [-48.6, 18.2], [-49.2, 27.9], [-49.3, 33.4], [-43.3, 37.6], [-43.3, 44.4],  // by the walk along Hus C
    [-67.9, 38.5], [-63.9, 38.4], [-58.4, 39.2], [-50.3, 39.4], [-48.9, 38.1],                 // south of Hus C
  ],
};

// Hus L (Parklängan): stacked row houses, overview plans våning 1–5 + Peab's aerial render.
// Våning 1–2: L1001–L1004 | stair core + portik (+ L1101 on våning 2) | L1005–L1008; we are
// L1007, L1008 is the east end unit (gable windows, spiral escape stair north of it).
// Våning 3–4: L1201–L1209, two-storey units entered from the loftgång on våning 3 (L1208 is the one
// above us), white render with red brick pilasters between the units; flat roof with solar panels.
export const HUS_L = {
  before: 2, after: 1, west: 4,     // units east of the core: 2 west of us, 1 east; 4 west of the core
  // #252 (våningsöversikterna, 1:500 with the scale bar): the units share their party walls, `pitch` m between the
  // wall centres (`wall` = half a party wall: ours are 0.2 m in plan.json); the end units are `gableExtra` wider
  // (thicker gables); the core is `w` between the wall centres either side, the portik x from its west wall centre.
  // Hus L 53.3 m gable to gable (exterior.js husLLayout).
  pitch: 5.55, wall: 0.1, gableExtra: 0.38,
  core: { w: 8.175, portik: [3.4, 5.1], portikHeight: 3.0 }, // stair core
  upperStoreys: VERTICAL.upper.storeys,        // våning 3–4 (plan brochure S2: Hus L = våning 1–4)
  storeyHeight: VERTICAL.upper.floorToFloor,   // våning 3–4 floor-to-floor (assumption, #344), not våning 1–2's
  // walkway over our north bedrooms: z 0 → the upper flats' north outer face (#354). READ on Peab's drawings, not
  // measured on site: the upper flats' entrance floor is 11.13 m deep on bofakta (L1201–L1209, L1205; 1:100, 600 dpi) vs
  // L1007's 12.70 with the courtyard faces flush (#337) → 1.57; the overview plans (docs/peab/kalibrerad/, 1:500, the
  // 0–25 m bar, 0.042356 m/px) agree: våning 3's / 4's north face 1.59 / 1.57 m south of våning 1–2's (1.96 before)
  loftgangDepth: 1.57,
  railHeight: 1.1,
  render: 0xf2efe7,       // white render, våning 3–4
  // the loftgång's details (#111, after Peab's renders; sizes are guesses): a light sheet-metal fascia on the deck edge,
  // a round handrail on the balusters, the upper units' white front doors set back in a recess, a wall lantern
  // beside each door that lights up at dusk (no lights: colour only, like the pergola's bulbs)
  loft: { fascia: 0xd5d8d4, handrailR: 0.022, door: 0xf4f4f1, recess: 0.14, lamp: { dx: 0.25, y: 2.1, w: 0.12, h: 0.22 } },
  pilaster: 0.4,          // brick pilaster width at each unit boundary (render, street side)
  // #433: an outdoor wall light by every street-side front door of våning 1 (L1001–L1008, ours too; the units are not
  // mirrored, so the latch is on each door's east side — plan.json's front-door hinge is at its west jamb): a dark box
  // with a frosted glass front, `dx` m east of the door opening to its centre, centre `y` m up, `w` × `h` × `d` (all
  // guesses). Lit after dusk like the street lamps (`on` / `off` night, `fade` s): the glass glows, an additive `wash`
  // (an upright ellipse w × h, centre `y`) on the brick round it and a `pool` (radii rx along the façade, rz out, its
  // centre `z` in front of the façade, kept short of it) on the ground; no lights (src/groundglow.js)
  doorLamp: { dx: 0.28, y: 1.9, w: 0.12, h: 0.22, d: 0.1, color: 0xffd29a, on: 0.35, off: 0.3, fade: 1.5,
    wash: { w: 2.4, h: 2.6, y: 1.75, peak: 0.26 }, pool: { rx: 2.6, rz: 1.25, z: -1.3, peak: 0.45 } },
  // #451: the portik's floor is paved like the courtyard walks (patio.js pavingTexture, no snow under the roof) and it
  // has round, flat opal ceiling lamps (guess: `r` m, at `z` along the passage, clear of the stairwell door's z 8.5…9.4),
  // lit with the front-door lights (doorLamp's on / off / fade): the discs glow, a pool on the paving and a wash on both
  // brick walls (and the ceiling) per lamp join doorLamp's two additive meshes (no lights)
  portikLamp: { z: [2.0, 6.35, 10.7], r: 0.17, lit: 0xfff1dc, off: 0xd9d8d3,
    wash: { w: 2.0, h: 2.2, y: 1.9 }, pool: { ra: 1.7, rb: 0.95 } },
  // #337, the courtyard side of våning 3–4 (bofakta L1202–L1208 / L1205, 1:100 with the 0–5 m bar; x = metres from the
  // unit's west outer face, sill/head over that storey's floor): våning 3 is brick, flush with ours; våning 4 stands
  // `setback` behind it (its courtyard wall 9.21 m from the north wall vs våning 3's 11.11 m) with a roof terrace in
  // front (10–12 m² = ~2.0 m deep to the railing), skärmväggar h 1.8 between the units (bofakta). Heads 2.3 m,
  // `parapet`, `rail` (over the deck), `deck` and the core's `rise` are assumptions; the set-back wall is white render
  // (the illustration docs/peab/hus-l-gardsfasad-illustration.png, not measured)
  // #350, the terraces per flat (exterior.js `husLTerraces`: a polygon + its flat id each; tools/terracetest.html checks
  // the areas). Heights over våning 4's structural floor y3: the deck's finished top `deck`, the parapet `parapet`; the
  // railing's top is `rail` over the FINISHED DECK (not parapet + rail). parapet, deck and rail are assumptions; the
  // terrace door's threshold sits on the deck. `screen` 1.8 = "Skärmvägg h= 1,8 m" drawn on each terrace's bofakta sheet
  // (L1201–L1209, L1205), on the boundaries between two terraces only (not at the gables, not at L1205's loft).
  // `areas` (m², the plan brochure pp. 34–37 / 44 and bofakta; S2): the std group 11, L1201 and L1209 12 (wider: the
  // gable), L1204 10 (its east end is the loft's wall, `core.loft.west`), L1205 10. On the sheets each terrace reaches
  // 1.99 m from the set-back wall to its drawn outer line (here: `setback` 1.9 to the parapet's outer face, the walls'
  // measured faces 11.13 − 9.25 m) and runs between the screens' centre lines / the gable / the loft's wall — so the
  // model's areas come out 0–6 % under the brochure's rounded figures; the outlines' exact edges are not dimensioned
  court: {
    setback: 1.9, parapet: 0.3, rail: 1.1, deck: 0.06, screen: 1.8,
    areas: { std: 11, L1201: 12, L1204: 10, L1205: 10, L1209: 12 },
    lower: [{ x0: 0.86, x1: 2.04, sill: 0.8, head: 2.3 }, { x0: 3.05, x1: 4.63, sill: 0.6, head: 2.3 }], // våning 3 (BH 0.8 / 0.6)
    upper: [{ x0: 0.66, x1: 1.64, sill: 1.2, head: 2.3 }, { x0: 3.05, x1: 4.03, sill: 0, head: 2.3 }],  // våning 4: window BH 1.2, terrace door
    // L1205 over the core (x from the core's west outer face): its west part, "Loft ovan hisstopp", is the brick section
    // breaking the terrace row (info brochure p. 16, docs/peab/info-s16-render.jpg: the principle only, no measures); the
    // terrace east of it. Våning 3 there: L1205's 6.55 m wide lower floor at the core's east end (BH 0.8 / 0.6, x from its
    // west face). #349: the loft's five measures, each on its own (bofakta-l1205.pdf 1:100, read at 600 dpi):
    core: {
      loft: {
        w: 3.0,      // SOURCED: the loft's east wall's outer face 3.00 m from the upper floor's west outer face
        west: 0.26,  // SOURCED (#350, bofakta-l1204.pdf): the loft's west wall bounds L1204's terrace 0.44 m thick, its
                     // face 0.26 m west of the core's west outer face (L1205's own sheet only draws the 0.2 m party wall)
        face: 0,     // SOURCED: m behind våning 3's courtyard face — 0 = flush (its wall's face 11.12 m from the north
                     // face, våning 3's 11.13 m)
        back: 1.5,   // GUESS: m of the raised part north of the set-back line. Not drawn: the plan only shows the loft
                     // room's north wall 1.18 m north of it (RH 1.56 m there), which says nothing of the roof above
        rise: 0.9,   // GUESS: its roof over the main roof. No section or façade; not derived from the loft's RH or BH
        win: { x0: 0.62, x1: 2.0, sill: 0.15, head: 2.3 }, // x0/x1 and BH 0.15 SOURCED; the head is a GUESS
      },
      upper: [{ x0: 3.29, x1: 4.26, sill: 1.2, head: 2.3 }, { x0: 5.67, x1: 6.65, sill: 0, head: 2.3 }],
      lowerW: 6.55, lower: [{ x0: 1.68, x1: 2.85, sill: 0.8, head: 2.3 }, { x0: 3.86, x1: 5.44, sill: 0.6, head: 2.3 }] },
    lit: 0.45, // share of the upper units' courtyard windows lit at night (window light, not measured)
  },
  // #347, the street (loftgång) side of the upper units L1201–L1209: their own openings, not L1007's. Measured on the
  // bofakta sheets (docs/peab/bostader/, 1:100, "1 cm = 1 meter (A4)"; 600 dpi, 236.2 px/m): x = metres from the flat's
  // west outer face as drawn (L1201: from its east outer face − 5.75, its gable is thicker; the same as `std` then),
  // `floor` = the FLAT's own floor (0 = its entrance floor on building storey `storey`, 1 = its upper floor on the
  // next storey) — not the building's storey number. `sill` = the sheet's BH. Heads are not on the sheets: `head` and
  // `doorHead` are guesses (as `court`'s 2.3). Types per flat: `types` (default `std`).
  street: {
    storey: 3, head: 2.3, doorHead: 2.3,
    std: [ // L1202/03/06/07/08 (bofakta-l1202-…-l1208.pdf), also L1201 (bofakta-l1201.pdf, same from its east face) and L1204
      { floor: 0, door: true, x0: 0.87, x1: 1.74 }, { floor: 0, x0: 3.07, x1: 4.64, sill: 0.7 },  // entrance, kitchen
      { floor: 1, x0: 0.81, x1: 2.38, sill: 0.7 }, { floor: 1, x0: 3.35, x1: 4.53, sill: 0.7 }], // Sovrum 1, Sovrum 2
    L1209: [ // bofakta-l1209.pdf: the entrance floor's door and window sit 0.23 m further east than std's
      { floor: 0, door: true, x0: 1.10, x1: 1.98 }, { floor: 0, x0: 3.30, x1: 4.87, sill: 0.7 },
      { floor: 1, x0: 0.81, x1: 2.38, sill: 0.7 }, { floor: 1, x0: 3.35, x1: 4.53, sill: 0.7 }], // the second one a "ljudruta"
    // L1205 over the core (bofakta-l1205.pdf): its entrance floor is a 5.75 m wide north part at the core's east end
    // (x from the core's EAST outer face − 5.75, as drawn), entered from the stair core through its west wall (not seen
    // from the street); the rest of våning 3 there is the stair core (render, no openings: no drawing). Its upper floor
    // spans the core (x from the core's west outer face, like `court.core.upper`)
    L1205: [{ floor: 0, x0: 1.03, x1: 2.20, sill: 0.8, east: true }, { floor: 0, x0: 2.96, x1: 4.54, sill: 0.7, east: true },
      { floor: 1, x0: 1.02, x1: 2.20, sill: 0.7 }, { floor: 1, x0: 3.44, x1: 5.01, sill: 0.7 }, { floor: 1, x0: 5.98, x1: 7.15, sill: 0.7 }],
  },
  // spiral stairs in brick drums at both ends (våning 1/3 plans): centre, radius
  // (#42: the east one, L1008's escape stair, stands right against the house, per the user; #172: so does
  // the west one, against the west gable — `gable: 'west'` = its x is worked out in exterior.js, gable − r)
  // `door` / `gap`: the plan angle (deg from +x towards +z) and width (deg) of the drum's open doorway above the
  // loftgång / the east landing (#444; as the drum walls' opening in roofs.js' walk data, exterior.js)
  towers: [{ gable: 'west', z: 1.5, r: 1.6, door: -25, gap: 55 }, { x: 10.0, z: -2.0, r: 1.6, door: 90, gap: 96 }], // centres per våning 1 (#252)
  // the spiral stair inside each drum (#444, visual only, not walkable): *guess* — there is no stair drawing. A steel
  // column, wedge treads `turn`° each (~`rise` m, evened out to the loftgång's floor) round it up to a top landing
  // (`landing`° of the circle round `door`, a `slab` thick) with a guard on its open edge, a handrail `wall` m in
  // from the drum along its wall, a floor at the bottom. Painted like the loftgång railing. `overlap` < 0: open gaps
  // between the treads, so the turn below shows through and it reads as a stair from above.
  spiral: { column: 0.075, rise: 0.185, turn: 30, tread: 0.05, overlap: -6, wall: 0.04, landing: 110, slab: 0.2,
    handrail: { h: 0.9, r: 0.022 } },
  // L1008 (the east end unit, our neighbour on the left seen from the street) is not a copy of ours
  // (#42, plan p. 43): no window beside the front door (its kitchen window is on the gable), and
  // upstairs no window where the escape stair stands. Façade openings whose centre x (unit
  // coordinates) lies in these ranges are left out on its north façade.
  endUnitNorthHidden: [[3.0, 4.7]],
  // #351, every gable opening tagged with its gable, the BUILDING storey (1–4) and the flat (its type): z = plan z (m from
  // the north face of våning 1–2), sill = the sheet's BH over that storey's floor. Read on the bofakta sheets (1:100,
  // 600 dpi, docs/peab/bostader/): L1008 bofakta-l1008.pdf, L1001 bofakta-l1001.pdf, L1209 bofakta-l1209.pdf (its z from
  // its courtyard face, flush with våning 1–3's at D: the sheet's 11.12 m deep entrance floor — it lands right over
  // L1008's). L1201 (bofakta-l1201.pdf) and L1008 / L1001 / L1201 / L1209's upper floors have NO gable openings. Heads
  // are not on the sheets: guesses. No flat in Hus L is mirrored (all four end sheets: the entrance at the west end of
  // the street side, the stair at the east, like L1007), so `gable` is simply the side the flat ends on.
  gableWindows: [
    { gable: 'east', storey: 1, flat: 'L1008', z0: 2.71, z1: 4.47, sill: 0.7, head: 2.6 },  // Kök/matplats
    { gable: 'east', storey: 1, flat: 'L1008', z0: 8.27, z1: 10.03, sill: 0.7, head: 2.6 }, // Vardagsrum
    { gable: 'east', storey: 2, flat: 'L1008', z0: 2.71, z1: 4.47, sill: 0.6, head: 2.25 }, // Sovrum 1 ("Ljudruta")
    { gable: 'west', storey: 1, flat: 'L1001', z0: 8.03, z1: 9.79, sill: 0.8, head: 2.6 },  // Vardagsrum
    { gable: 'east', storey: 3, flat: 'L1209', z0: 2.69, z1: 4.45, sill: 0.7, head: 2.3 },  // Kök/matplats
    { gable: 'east', storey: 3, flat: 'L1209', z0: 8.24, z1: 10.0, sill: 0.7, head: 2.3 },  // Vardagsrum
  ],
  // solar panel fields on the roof (situation plan): x ranges × rows of z ranges
  solar: { x: [[-39.96, -25.77], [-24.13, -6.37], [-4.83, 9.56]], z: [[3.5, 4.5], [5.4, 6.4], [7.4, 8.4], [9.4, 10.4]] },
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

export const BUILDING = { // unused (HUS_L replaced it); kept in step with VERTICAL
  upperStoreys: VERTICAL.upper.storeys,   // the stacked unit above (two storeys)
  storeyHeight: VERTICAL.upper.floorToFloor,
  loftgangDepth: HUS_L.loftgangDepth, // the loftgång (#354)
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
  refill: 6, // s until the tank is full again after a flush (#155, our guess)
  // #321 (guesses): the inside of the bowl as rings [m below the rim, scale of the rim's hole, m towards the front (−
  // back)], top down: from under the rim to the outlet towards the back, ~28 cm deep; the water surface `waterDy`
  // (≈ 14 cm under the rim's top) in toilet-block blue (`water`); flushing: the surface `drop`s, the water runs down the
  // bowl for `run` s (streaks scroll at `runSpeed` per s), the swirl turns at `spin` rad/s and dies out over `swirl` s
  bowl: {
    profile: [[0.015, 1.03, 0], [-0.012, 0.99, 0], [-0.04, 0.93, -0.005], [-0.08, 0.8, -0.015], [-0.12, 0.62, -0.03],
      [-0.15, 0.49, -0.045], [-0.19, 0.35, -0.06], [-0.23, 0.23, -0.07], [-0.26, 0.12, -0.075], [-0.275, 0, -0.075]],
    waterDy: -0.115, water: 0x3fa7d6,
    flush: { drop: 0.05, run: 2.2, runSpeed: 1.6, spin: 7, swirl: 4 },
  } };
export const SHELF_HEIGHT = 2.0; // unlabelled shelving in the upstairs Klk
// Sovrum 1's walk-in closet (#331, src/closet.js), inside x 3.90–5.55, z 4.28–5.48. Peab's fittings sheet for L1204 in
// the same house gives its upstairs Klk "hylla och klädstång på bärlister" (a Marbodal-type system, docs/klk-sovrum1-
// inredning-*.png): white wall standards, a high white shelf on the side wall with the plan's dashed strip (`side` 1 =
// east, −1 = west) and on the far (south) wall, a chrome rail under it on the side wall only (ending clear of the NORDLI,
// z ≥ 5.245). Heights, lengths and the LED mirror over the NORDLI are guesses; the mirror fits between its top (0.99)
// and the shelf. #336: the NORDLI stands against the west wall (`westFace`, plan.json's inner face; `chestGap` m off it);
// the mirror, the make-up under it and the rug sit `mirror.dx` from the chest's centre (clear of the back standards).
export const KLK = {
  level: 1, x0: 3.90, x1: 5.55, z0: 4.28, z1: 5.48, side: 1, westFace: 3.897, chestGap: 0.004,
  shelf: { y: 1.95, d: 0.30, t: 0.022 }, rail: { y: 1.78, out: 0.28, z0: 4.32, z1: 5.22, r: 0.0125 },
  standards: { side: [4.45, 5.10], back: [4.02, 4.98], y0: 0.95, y1: 2.25, w: 0.026, d: 0.014 },
  mirror: { dx: -0.1, w: 0.55, h: 0.72, bottom: 1.10, led: 0.022, light: { intensity: 0.4, range: 2.5, color: 0xfff1de } }, // light halved (#339)
  clothes: [['coat', 0x1f1f1f], ['coat', 0xb08a66], ['dress', 0x24324a], ['dress', 0x8a9a7b], ['jacket', 0x2e3a4f],
    ['jacket', 0xeee6d3], ['shirt', 0xf5f5f0], ['shirt', 0x9fb7d0], ['shirt', 0xa4532f], ['shirt', 0xeee6d3], ['shirt', 0x1f1f1f]],
};

// The Klk under the stair on Entréplan (#338, src/cleaning.js): cleaning things, neatly kept. Inside x 3.471–5.551,
// z 5.704–6.609 (plan.json; east of x 4.671 it runs on south under the winders). Head room slopes: the slab (3.0) west of
// x 3.86, flight B's soffit (2.39–2.80) over x 3.86–4.645, the winders (1.58–2.19 over the Klk) east of that. All guesses:
// a white wall shelf (four shelves on two standards) on the north wall under flight B (the floor west of it, outside
// the stair, is where a cat can turn up: the shelf collides only from `solid`[0] east and `solid`[1] deep, so the way
// in under flight B stays open), a tool rail on the east wall under the winders, a mop bucket in the SE corner with
// the mop leaning on the east wall, a stick vacuum in a dock on the south wall.
export const CLEANING = {
  shelf: { x0: 3.87, x1: 4.63, z: 5.704, d: 0.30, t: 0.02, ys: [0.72, 1.12, 1.52, 1.92], standards: [3.95, 4.50], solid: [4.10, 0.2] },
  rail: { x: 5.551, z0: 5.80, z1: 6.32, y: 1.30 },
  bucket: { x: 5.24, z: 6.50, r: 0.155, h: 0.30 },
  vacuum: { x: 4.20, z: 6.609, dock: 1.18 },
};

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
  // a kid on the patio walk beside the other walker there (z 18.5 | 19.2, clear of the bollards at 17.85); since the box
  // reaches Hus B again (#254) someone walks the south walk once more (#259, it was taken off in #244)
  walkers: [
    { a: [-70, -22.7], b: [12, -22.7], speed: 1.3, dog: true }, { a: [12, -22.9], b: [-60, -22.9], speed: 1.15 },
    { a: [-44.4, -2.2], b: [14.48, -2.2], speed: 1.2 }, { a: [-12.6, 26.1], b: [11.3, 26.1], speed: 1.25 }, { a: [7.72, 18.2], b: [-38.61, 18.2], speed: 1.0, kid: true },
    { a: [-42.47, 18.8], b: [9.65, 18.8], speed: 1.1 }, { a: [-45.9, 8.7], b: [-45.9, 51.5], speed: 1.3 },
    { a: [-43.8, 30.5], b: [-10.6, 30.5], speed: 1.15 },
  ],
  cyclists: [{ a: [-90, -26.4], b: [10, -26.4], speed: 4.5 }, { a: [10, -27.8], b: [-90, -27.8], speed: 5.2 }], // the straight (#257)
  ball: [[-29.0, 20.4], [-24.0, 21.6]],              // two kids passing a ball (on the gravel by the sandbox)
  sandbox: [[-24.6, 25.2], [-23.1, 26.4]],             // kids sitting in the sandbox
  benches: [{ x: -3.4, z: 28.1, yaw: 180 }, { x: -37.3, z: 22.2, yaw: 90 }], // on COURTYARD.benches: yaw = the bench's rot − 180 (#207)
  seatTaken: 0.4, // m: a courtyard bench spot this near a sitter is not offered to the visitor (#438)
  seat: 0.52, // the sitters' hip height: the bench seat (0.46) + the thigh (#243)
  blanket: { x: 0.5, z: 22.4 },                       // on the lawn between the east tree squares (#259)
  loftgang: [[-29.44, 1.0], [-8.88, 1.1]],          // neighbours standing on the loftgång (våning 3)
  bellNear: 12,                                    // m: a cyclist rings the bell passing this close
  shirts: [0x2f5d8a, 0xc0392b, 0xe7d9b8, 0x3e7b4f, 0xf2f2f0, 0x7d4a8c, 0xe08a2a, 0x1f2a36, 0x9bb7d4, 0xd4577a],
  pants: [0x23324a, 0x2b2b2b, 0x6b5844, 0x8a8f96, 0x384b6b, 0xc8bfa8],
  skin: [0xf1c9a5, 0xe0ac86, 0xc68a62, 0x8d5a3b, 0xf6d8bf],
  hair: [0x2a1d14, 0x5a3a22, 0xc89b52, 0x1a1a1a, 0x8a5a32, 0xd8c7a0],
  shoes: [0x1a1a1a, 0xf2f2f2, 0x5a3a22, 0x2e3a4f, 0x8c8c8c], // #239, our picks
};

// Weather (#248, src/weather.js): per date a seeded draw. `rain` = the chance per day of showers by month (Jan…Dec):
// spring and autumn, a little in summer, none in the snow months (Lund's wettest months are Jul–Nov, the user wants
// spring and autumn); `second` = the chance of a second shower that day. `thunder`: late summer (from / to as [month,
// day]) a chance per day of a thunderstorm starting between `hours`. Lengths in hours (the 60-minute day: 1 h = 2.5
// real min), `ramp` = h to come and go. Drops: `drops` streaks within `radius` m of the eye, `height` m above it,
// falling `speed` m/s, `len` m long, slanted by `wind`. Overcast: the sun × (1 − `sunCut`), fog `fogFar` m. Lightning
// every `flash.every` real s (random in between), thunder after distance / 343 m/s. Our numbers.
export const WEATHER = {
  rain: [0, 0, 0.3, 0.38, 0.3, 0.12, 0.12, 0.15, 0.38, 0.5, 0.45, 0], second: 0.35,
  showers: { len: [1, 4.5], ramp: 0.35, strength: [0.45, 1] },
  thunder: { from: [7, 20], to: [8, 31], chance: 0.4, hours: [14, 20], len: [1, 2.5] },
  drops: 1800, radius: 13, height: 9, speed: 9.5, len: 0.5, wind: 0.12,
  sunCut: 0.85, fogFar: 80, people: 0.4, // people go in above this much rain
  flash: { every: [6, 22], dist: [400, 4000], light: 2.2 },
  sound: 0.22, // the rain's gain outdoors (indoors a quarter, muffled)
  // #249: snow — the chance per day by month (Jan…Dec; mostly the snow months), `flakes` Points drifting down at `speed`
  // m/s, swaying `sway` m/s, `size` m; hail — short showers in `months` (`chance` per day) and at the start of a
  // thunderstorm (`storm`): `stones` white pellets of `size` m falling ~`speed` m/s, bouncing once
  snow: { chance: [0.38, 0.4, 0.1, 0, 0, 0, 0, 0, 0, 0, 0.06, 0.35], len: [1.5, 6], flakes: 2400, speed: 1.1, sway: 0.35, size: 0.07 },
  hail: { months: [3, 4, 5], chance: 0.12, len: [0.25, 0.6], storm: 0.3, speed: 11, stones: 2200, size: 0.05, lie: 2.5 }, // lie: s a pellet lies on the ground at most
  // out in it (#249): `metres` walked outdoors while at least `min` of it falls counts once per shower
  experience: { min: 0.3, metres: 20 },
};

// Greeting the people outside (#247, src/greet.js): within `reach` m; the bubbles show for `bubble` s. The lines are
// ours; one is picked at random (the visitor's from `say`, children answer from `kids`, cyclists from `cyclists`).
export const GREET = {
  reach: 14, bubble: 2.8,
  say: ['Hej hej!', 'Hallå där!', 'Hejsan!', 'Tjena!', 'God dag!', 'Hej, vi har precis flyttat in här!', 'Tja!', 'Hej! Fint här, va?'],
  answer: ['Hej hej!', 'Hejsan!', 'Hej, välkommen till Lunden!', 'Tjenare!', 'Hallå!', 'Hej, trevligt att träffas!', 'Hej! Bor du i L1007?',
    'Goddag, goddag!', 'Hej! Har du sett en katt springa förbi?', 'Hej! Ses vid grillen!'],
  kids: ['Hej!', 'Hejsan!', 'Vill du leka?', 'Hej! Kolla vad jag kan!', 'Tjena!', 'Hej hej hej!', 'Hej! Har du en fiskpinne?'],
  cyclists: ['Hej!', 'Hej hej!', 'Tjena!', 'Hej, akta dig!'],
};

// The walkable area outdoors (#355): the whole block Kv. Lunden — the car park in front of Hus L (z0, as before), Karpvägen
// with the garage drive (x0: its far kerb, Karpvägen's `w` 5.8 about x −75.8), the park level south of the box (z1: short of
// the park's woods, SITE.treeAreas) and Sankt Lars väg's east leg (x1: short of HepCat Store's west face, 27.9). Inside it
// Hus L's row (but the portik), the Å-husen's outlines, the box's edge (not down its stairs, `SITE.terrain.stairs`) and the
// ramp's wall stop the visitor (world.js; surroundings.js `userData.segments`). The bounds are a choice, not a plot line.
export const OUTDOOR = { x0: -78.5, x1: 27.5, z0: -14, z1: 64 };

// The garage under the courtyard and Hus L's basement (#357, #417, src/garage.js), per the våning −1 overview plan
// (plan brochure p. 46; docs/peab/garage-vaning-m1.jpg, measured on docs/peab/kalibrerad/vaning-m1-300dpi.png with the
// #253 transform x = (px − 1909.5) × 0.042356, z = (py − 1073) × 0.042356 — it fits Hus L's outline on this sheet:
// x −41.6 … 11.6, z 0 … 12.6). DRAWING = read off that plan (inner faces of the drawn walls, ±0.1 m); everything
// marked ASSUMPTION is ours (heights, stall sizes / count / numbers, column size, door widths, the förråd cages' split,
// the tubes). Rectangles are walkable floor (plan x/z); walls stand on every rectangle edge that does not touch another
// rectangle (garage.js), so a doorway is a small rectangle through the wall.
export const GARAGE = {
  floor: -3,          // = SITE.terrain.park: the drive is level with the door (#346)
  ceiling: -0.35,     // ASSUMPTION: the deck + the courtyard's soil over it; 2.65 m clear (the door is 2.6)
  // DRAWING: each walkable rectangle → [room name, sensor area]. The entrance hall south of Hus C's rooms (INFART GARAGE),
  // open north-east into the big hall (BILPARKERING / CYKELPARKERING) under the courtyard, which runs east between Hus
  // L's basement and Hus B / Hus A to x 8.9 (past L1007); Hus L's basement: its north rooms (CYKEL, EL, the stair + lift
  // core, CYKEL, LGHFÖRRÅD) and its south band (CYKEL, the two corridors with bike racks); the MILJÖRUM under Hus C.
  rects: [
    { id: 'doorway', x0: -70.5, x1: -69.95, z0: 41, z1: 47, room: 'Garage', area: 'entrance' }, // terrain.garageDoor's opening through the 0.55 m wall
    // (the east wall: the plan's inner face is x −41.61, the model's Hus B west façade −41.7 (SITE.blocks): kept just inside it)
    { id: 'entrance', x0: -69.95, x1: -41.8, z0: 34.52, z1: 51.8, room: 'Garage', area: 'entrance' },
    { id: 'hallW', x0: -51.4, x1: -9.38, z0: 12.62, z1: 33.16, room: 'Garage', area: 'hallW' },
    { id: 'link', x0: -51.4, x1: -41.8, z0: 33.16, z1: 34.52, room: 'Garage', area: 'hallW' }, // the turn: the entrance hall opens into the big hall
    { id: 'hallE', x0: -9.38, x1: 8.92, z0: 12.62, z1: 28.76, room: 'Garage', area: 'hallE' },
    { id: 'miljo', x0: -69.95, x1: -62.75, z0: 28.55, z1: 34.01, room: 'Miljörum', area: 'entrance' },
    { id: 'miljoDoor', x0: -64.95, x1: -64.05, z0: 34.01, z1: 34.52, room: 'Miljörum', area: 'entrance', door: { kind: 'steel', hinge: 'x0', open: -1, name: 'dörren till miljörummet' } },
    { id: 'bandW', x0: -35.6, x1: -19.25, z0: 7.79, z1: 12.11, room: 'Cykelförråd', area: 'basementW' },
    { id: 'bikeN', x0: -35.6, x1: -19.25, z0: 2.67, z1: 7.5, room: 'Cykelförråd', area: 'basementW' },
    { id: 'bikeNW', x0: -35.6, x1: -24.8, z0: 0.47, z1: 2.67, room: 'Cykelförråd', area: 'basementW' },
    { id: 'bikeGap', x0: -33.6, x1: -32.4, z0: 7.5, z1: 7.79, room: 'Cykelförråd', area: 'basementW' },
    { id: 'el', x0: -24.46, x1: -19.25, z0: 0.47, z1: 2.33, room: 'Elrum', area: 'basementW' },
    { id: 'elDoor', x0: -24.0, x1: -23.1, z0: 2.33, z1: 2.67, room: 'Elrum', area: 'basementW', door: { kind: 'steel', hinge: 'x0', open: 1, name: 'dörren till elrummet' } },
    { id: 'core', x0: -18.95, x1: -16.62, z0: 4.42, z1: 9.58, room: 'Hisshall', area: 'basementW' }, // the stair + lift core (#456: its cross wall north, the lift wall south): its walls, stair and lift are core.js's (#415, CORE)
    { id: 'coreW', x0: -19.25, x1: -18.95, z0: 7.95, z1: 8.85, room: 'Hisshall', area: 'basementW' },
    { id: 'coreE', x0: -16.62, x1: -16.33, z0: 7.95, z1: 8.85, room: 'Hisshall', area: 'basementW' },
    { id: 'bandE', x0: -16.33, x1: 11.12, z0: 7.79, z1: 12.11, room: 'Cykelförråd', area: 'basementE' },
    { id: 'bikeNE', x0: -16.33, x1: -11.08, z0: 0.47, z1: 7.5, room: 'Cykelförråd', area: 'basementE' },
    { id: 'bikeNEDoor', x0: -15.45, x1: -14.55, z0: 7.5, z1: 7.79, room: 'Cykelförråd', area: 'basementE' },
    { id: 'forrad', x0: -10.78, x1: 11.12, z0: 0.47, z1: 7.5, room: 'Förråd', area: 'basementE' }, // LGHFÖRRÅD: "15 extra lägenhetsförråd"
    { id: 'forradDoor', x0: -0.98, x1: -0.08, z0: 7.5, z1: 7.79, room: 'Förråd', area: 'basementE' },
    { id: 'garageDoorL', x0: -15.45, x1: -14.55, z0: 12.11, z1: 12.62, room: 'Garage', area: 'hallW', door: { kind: 'steel', hinge: 'x0', open: 1, name: 'dörren till källaren' } }, // from the basement out into the garage
  ],
  // DRAWING: free-standing / partial walls inside the rectangles [x0, x1, z0, z1]: the förråd room's partitions and the
  // bike rooms' half walls (z 3.2 … 4.8 open between them); the core's lift shaft south of the lobby
  partials: [[-30.35, -30.05, 0.47, 3.2], [-30.35, -30.05, 4.8, 7.5], [-24.8, -24.46, 2.67, 3.2], [-24.8, -24.46, 4.8, 7.5],
    [-5.53, -5.23, 0.47, 3.2], [-5.53, -5.23, 4.8, 7.5], [0.02, 0.32, 0.47, 3.2], [0.02, 0.32, 4.8, 7.5], [5.57, 5.87, 0.47, 3.2], [5.57, 5.87, 4.8, 7.5],
    [-11.08, -10.78, 9.4, 12.11], [-5.53, -5.23, 9.4, 12.11], [0.02, 0.32, 9.4, 12.11], [5.57, 5.87, 9.4, 12.11]],
  // DRAWING: the columns (0.42 m squares, centres) — the big hall's grid (7.9 m) and the entrance hall's; the entrance
  // hall's line at x −58.2 is a row of short walls on the plan, drawn as columns here
  columns: { size: 0.42, grid: { xs: [-41.55, -33.67, -25.75, -17.85, -9.95, -2.05, 5.85], zs: [16.94, 24.44] },
    south: { xs: [-41.55, -33.67, -25.75, -17.85], z: 30.44 }, entrance: { xs: [-64.15, -58.22, -51.7], zs: [36.2, 40.26, 47.56] } },
  // ASSUMPTION (the plan draws no stalls): rows nose to a wall, `w` wide (the big hall: 3 per 7.9 m bay), `d` deep;
  // [x0, x1, z0, z1, nose 'n' | 's'] per row, cut into stalls of ~w; `skip` = stalls left free (the basement door);
  // numbered 1… in this order. `ours` (L1007): straight under our patio (x 0 … 5.75), the user's wish — a charging post
  // and "L1007" on the wall. `pool`: the car pool's two stalls ("bilpool med 2 bilar och laddplatser", plan p. 46),
  // `cars`: the share of the other stalls taken.
  stalls: {
    rows: [[-49.44, 8.92, 12.62, 17.62, 'n', 2.63], [-41.55, -9.95, 28.16, 33.16, 's', 2.63],
      [-69.95, -51.9, 34.52, 39.9, 'n', 2.9], [-69.95, -42.6, 47.8, 51.8, 's', 2.9]],
    skip: [[-17.85, -12.59]], ours: [0.58, 3.21], pool: [[-49.44, -44.18]], cars: 0.55, seed: 23,
  },
  // ASSUMPTION: bike racks in the big hall (CYKELPARKERING) along the middle column row, and in the basement's bike rooms
  // along their walls (the plan draws racks there): [x0, x1, z, facing ±1 (towards +z / −z)]
  bikes: [[-33.2, -26.2, 24.9, 1], [-33.2, -26.2, 24.0, -1], [-35.3, -19.6, 11.6, -1], [-14.2, -11.4, 11.6, -1], [-10.6, -5.8, 11.6, -1],
    [-5.0, -0.2, 11.6, -1], [0.55, 5.3, 11.6, -1], [6.1, 10.8, 11.6, -1], [-35.3, -30.6, 0.95, 1], [-29.8, -25.1, 0.95, 1], [-24.2, -19.6, 7.0, -1],
    [-16.0, -11.4, 0.95, 1]],
  // DRAWING: the 15 förråd (LGHFÖRRÅD) in Hus L's north-east room, four bays between its partitions with a passage
  // through them (z 3.2 … 4.8); ASSUMPTION: two wire-mesh cages per bay each side of it, but one where the room's door
  // comes in, a door `door` m wide in each cage's front, opening into the passage up to `max` rad. `ours` (L1007).
  storage: { bays: [[-10.78, -5.53], [-5.23, 0.02], [0.32, 5.57], [5.87, 11.12]], north: [0.47, 3.2], south: [4.8, 7.5], skipSouth: 1,
    door: 0.9, max: 1.5, speed: 3, ours: 7, seed: 41 },
  // walls with a door we cannot open (the rooms under Hus C, Hus B / A's basements): [x, z, face n|s|e|w, label] — the
  // face the door is seen from (DRAWING: where the plan draws a door on the garage's walls; ASSUMPTION: the labels' text)
  fakeDoors: [[-56.2, 34.52, 's', 'LGHFÖRRÅD'], [-51.4, 23.1, 'e', 'TRAPPHUS C'], [-36.6, 33.16, 'n', 'LGHFÖRRÅD'], [-29.5, 33.16, 'n', 'TRAPPHUS B'],
    [-3.5, 28.76, 'n', 'TRAPPHUS A'], [4.5, 28.76, 'n', 'LGHFÖRRÅD'], [-41.8, 44.4, 'w', 'EL']],
  // #358: a sectional (overhead) door in `sections` panels rising on tracks and running in under the ceiling in `seconds`
  // s; it shuts by itself `auto` s after it opened unless someone / our car is in the opening (it opens again if one
  // comes in while it shuts). A button on a post outside south of the drive (`post`) and on the wall inside (`inside`);
  // an amber warning light blinks while it moves. All ours (ASSUMPTION).
  door: { sections: 5, seconds: 9, auto: 25, passable: 0.8, post: [-71.4, 47.9], inside: [-69.92, 48.4] },
  // fluorescent tubes (ASSUMPTION): a grid over every room (`spacing` m); a motion sensor per area (`area` above) puts
  // them on while the visitor is in it or within `sensor` m of it and `hold` s after; `flicker` s of starting up.
  // `dim`: the daylight left down here (DayCycle.under); each area lends one spot a pool light (lights.extra).
  // `carLight`: the ambient light added while the visitor is down here with the tubes on (#440: the cars and our Renault
  // are lit materials; the baked shell is not), × how far in (DayCycle.lit)
  lights: { hold: 90, flicker: 0.7, amb: 0.22, r: 2.6, dim: 0.92, intensity: 2.2, range: 10, sensor: 8, spacing: 5.2, carLight: 4 },
  // #452 (src/escape.js), all ASSUMPTION (placement, sizes; our own drawings, no real company's): the ways out are the garage
  // door (rect 'doorway') and the stairwell (rect 'core', up to the portik). A distance field over the rectangles (minus
  // partials, columns, förråd cages) gives each spot its way to the nearest. `hang`: green "Nödutgång" signs `w` × w/2
  // m under the ceiling (centre `y` over the floor), double-sided, square across the way (its first `look` m): per face
  // an arrow ahead / left / right or a U-turn, as the way goes for that face's reader — [x, z], or [x, z, face] = one face
  // only; `wall`: flat over a doorway [x, z, face, y] ('ahead'); always lit. `plans`: framed A3 utrymningsplaner (`size` m) on a wall [x, z, face, y over the floor],
  // drawn from the rectangles and turned the way the reader faces, "Du är här" at the plan; an extinguisher beside each.
  escape: {
    w: 0.44, y: 2.25, look: 5,
    hang: [[-64.3, 44], [-53.1, 44], [-47.4, 42], [-68.6, 44, 'e'], [-46.2, 20.8], [-35.7, 20.8], [-25.1, 20.8], [-41, 27], [-30.4, 27], [-20, 27],
      [-15, 18.6], [-4.8, 20.8], [4.35, 20.8], [-30.1, 9.95], [-24.7, 9.95], [-13, 8.6], [-8, 8.6], [-2.6, 8.6], [2.9, 8.6], [-28.7, 4.0], [-22, 4.0],
      [-15, 6.9, 'n'], [-5.4, 4.0], [5.7, 4.0]],
    wall: [[-19.25, 8.4, 'w', 2.35], [-16.33, 8.4, 'e', 2.35], [-16.1, 12.62, 's', 2.35], [-0.53, 7.5, 'n', 2.35]],
    plans: [[-16.98, 9.95, 'n', 1.45], [-13.4, 12.62, 's', 1.5]], size: [0.42, 0.297],
  },
};

// Hus L's stair core by the portik (#415, src/core.js): the stairwell and the lift from the garage (våning −1) to the
// loftgång (våning 3). #456: read off the vector overview plans in the plan brochure (docs/peab/lunden-planritningsbroschyr-
// webb-2024-12-18.pdf pp. 46–50 = kalibrerad/vaning-m1 … 4-300dpi.png; the #253 transform x = (px − 1909.5) × 0.042356,
// z = (py − 1073) × 0.042356). Våning 1–3's sheets share one frame (Hus L's street face at z 0.04; våning 3's sits 0.04 m
// east, shifted here); våning −1's sheet sits ~0.05 m east / 0.11 m north of it, so its values (and GARAGE's) are its own
// frame (±0.1 m). DRAWING: one straight flight per storey, all stacked in the same footprint along the band's WEST wall
// (1.0 m wide with its rail line: the hole x −19.04 … −18.04), each rising NORTH from the landing at the courtyard end
// (bottom step z 7.61; 7.50 on −1's sheet) towards the street, 0.25 m between tread lines: −1 → 1 16 treads (below the cut
// on våning 1's sheet, dashed on −1's), 1 → 2 17 (våning 2's), 2 → 3 16 (våning 3's, whole: the top storey, no break line);
// none on våning 4 (the band is L1205's there, the lift's loft at its courtyard end). On every storey a 1.4 m passage
// along the flights' east side joins the street-end floor (våning 1–2 from the street wall's inner face 0.51, a window in
// it; våning 3 from the loftgång wall's 2.02, with the door out — hinged at its east jamb, opening out — and a glazed
// sidelight west of it) to the landing (the lift door, the ways in); a shaft in the street-end east corner; the lift
// shaft x −19.04 … −17.44, z 9.78 … 12.28 behind the landing's 0.2 m wall (z 9.58), its door x −18.84 … −17.94; in the east
// wall: våning 1 the portik's glazed screen (a door hinged at its south jamb opening out into the portik + a fixed
// sidelight north of it), våning 2 L1101's door, våning 3 L1205's; våning −1: the stairwell bounded north by a cross wall
// (z 4.42; the basement's corridor beyond it, under the flight's top), openings west / east to the bike rooms (GARAGE coreW
// / coreE). The sheets' band is x −19.04 … −16.62; the model keeps −18.95 (L1004's wall, GARAGE). ASSUMPTION: every height
// (storeyFloor / GARAGE.floor, #344 — so the risers 17 × 0.176, 18 × 0.181, 17 × 0.185 m: even, which fits the drawn tread
// counts, but no section gives them), the railings and handrails, the slabs, the window's size (the façade's, exterior.js),
// the doors' leaves, the lift's car, speed and doors, the lights. Not modelled: the portik's inside (wider than its mouths
// on the sheet): its door stays in the portik's west wall with a short passage to the stairwell.
export const CORE = {
  x0: -18.95, x1: -16.62, split: -17.95,         // the band's inner faces; the flights' open (east) side
  foot: 7.61, tread: 0.25, treads: [16, 17, 16], // every flight's bottom step (its south end); per flight −1→1, 1→2, 2→3
  north: [4.42, 0.51, 0.51, 2.02],               // the stairwell's street-end inner face on våning −1, 1, 2, 3
  loftFace: 1.59,                                // våning 3's street face (HUS_L.loftgangDepth ≈): the loftgång wall 1.59 … 2.02
  south: [7.61, 9.58],                           // the landing: the flights' foot … the lift wall's north face
  shaft: { x0: -16.92, z1: [3.36, 3.36, 3.62] }, // the street-end east corner's shaft on våning 1, 2, 3
  // the ways in: the portik's screen (the door's z, its fixed sidelight `side`, the wall's `opening`), the loftgång door
  // (x; its sidelight `side`); the flats' doors in the east wall [storey, z0, z1] (we cannot open them)
  portikDoor: { z: [8.45, 9.48], side: [7.66, 8.4], opening: [7.61, 9.53] },
  loftDoor: { x: [-18.11, -17.07], side: [-18.58, -18.16] },
  flatDoors: [[2, 6.73, 7.74], [3, 6.29, 7.3]],
  lift: { x0: -18.95, x1: -17.44, z0: 9.78, z1: 12.28, door: [-18.84, -17.94], speed: 1.0, accel: 0.6, doorTime: 1.4, wait: 6 },
  light: { hold: 60 },
};

// The lightsaber in Sovrum 2 (#78, src/saber.js): since #324 on two pegboard hooks on the Nerf board's top row (the
// board's front face x 2.772, see TOYS.nerf: an armoury), the switched-off saber (its hilt) lying across them along z.
// Hilt 30 cm, blade 90 cm; the blade colour is picked from `colors` each time it is taken down. `held` = where it sits
// in the view (camera space).
export const SABER = {
  level: 1, x: 2.772, y: 1.72, z: 9.4, hilt: 0.3, blade: 0.9,
  colors: [0x3aa0ff, 0x44ff66, 0xff3030],
  held: { x: 0.26, y: -0.3, z: -0.5 },
  swingSpeed: 4, // rad/s of looking that counts as a swing
  touchEvery: 0.25, // s between contact checks while not swinging (burn marks, #96)
};

// Toys you can take and use (src/toys.js, Holdables like the saber; sizes and spots are our picks).
// Nerf (#86): a pegboard on Sovrum 2's west wall north of the gaming desk (z ≥ 10.83) and clear of the door leaf
// (open, it lies along the wall up to z 8.61; on the east wall the MALM chest hid it); #324: 1.3 × 0.95 m (*guess*), the
// lightsaber (SABER) on its top row, the blasters `spread` m apart below it (an armoury), with three foam blasters
// (click = fire a dart that flies and lands), a dart bandolier and goggles. Wands (#87): three star wands
// and a unicorn headband on hooks on Sovrum 3's east wall, clear of the door's swing (click / waving =
// sparkles + a pling). Flashlight (#89): on the hat shelf of the hall wardrobe by the front door (open
// its sliding front first); click toggles one SpotLight that always exists (0 when off: no recompile).
export const TOYS = {
  // face: +1 = the board faces east (on a west wall), −1 west
  // #236: three different models (`models`: a pistol, a drum blaster, a long one with a clip and a stock), each in its
  // colour with side panels in `accents`, grey details and an orange muzzle; `shift` = m along the board per blaster
  // (the long one sits further from the bandolier). Shapes after Nerf Elite 2.0 / N-Strike, sizes ours.
  nerf: { level: 1, x: 2.752, face: 1, y: 1.35, z: 9.38, board: [1.3, 0.95], spread: 0.32, colors: [0xff7a1a, 0x1f8bff, 0xffd21a],
    models: ['pistol', 'drum', 'long'], accents: [0xf2f2f2, 0xf2f2f2, 0x2f3338], shift: [0, 0, -0.08],
    dart: { speed: 9, gravity: 6, max: 8 }, held: { x: 0.18, y: -0.15, z: -0.45 } },
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
// flower (side table at 1.52, 8.12; since #405 the RANDERS tray's floor at 0.483, the book well inside its rim). `held` = where it sits in the view (camera space).
export const BOOK = { w: 0.15, l: 0.22, h: 0.03, x: 1.57, y: 0.483, z: 8.17, turn: 28,
  held: { x: 0.17, y: -0.24, z: -0.56 } };

// Pingping (#269, src/pingping.js): the penguin cushion between the pillows in Sarah and Olof's bed (the user's photo
// docs/pingping-pingvinkudde.jpg). A squat, squishy body `w` × `h` × `d` m (*guess*: Squishmallow-like, ~40 cm),
// navy velour with an off-white face mask and belly, pink cheeks, a yellow beak, flippers and feet; colours read
// off the photo. `held` = where he sits in your arms (camera space, his bottom centre), `tilt` = leaning back (rad).
// A hug (click / "Krama"): pulled in `pull` m and squashed by `squash` over `hugTime` s, `hearts` rise.
export const PINGPING = { w: 0.4, h: 0.38, d: 0.22, navy: 0x34437a, white: '#ece6da', cheek: '#f0a3ad', beak: '#e8cf6a', feet: 0xe2cf7a,
  home: { z: 0.14, tilt: -0.16 }, held: { x: 0.0, y: -0.57, z: -0.45, tilt: -0.45 }, pull: 0.1, squash: 0.22, hugTime: 0.7, hearts: 14 };

// The big beer on the patio (#117, src/beer.js): a 50 cl tankard (Ø 9 × 16 cm, our pick) that turns up on the
// lounge table (top at 0.40) when you sit down in the lounge sofa; each gulp drinks `gulp` of it.
export const BEER = { x: 4.46, y: 0.4, z: 14.3, r: 0.045, h: 0.16, gulp: 0.2, held: { x: 0.2, y: -0.24, z: -0.45 } };

// The Nerf target (#99, src/target.js): a round archery-style board on a wooden stand on the lawn south of the
// hedge, facing the patio (north), its centre over the hedge so you can shoot from the patio door (~7.5 m).
// Rings from the centre out score `rings` points; the shooter's distance to the hit multiplies them (`range`:
// [up to m, ×]). Our picks.
// Our car (#173): a white Renault Megane E-Tech Electric 2024 (4.20 × 1.78 × 1.50 m per Renault), plate FGZ 56D.
// The key in the hall calls it: it comes east along Sankt Lars väg (our lane, right side to our curb at z −24),
// stops in front of our entrance; called again it leaves west in the far lane. Path and speeds are ours.
// #208: it turns into the car park and stops right outside our door (heading east, passenger side to the house);
// leaving, it swings round at the east end and goes out the same way, west in the far lane. #260: the way in is the
// car park's drive through the hedge in front of the portik (x −13…−7.5). Paths = waypoints (x, z), rounded off at the
// corners (car.js).
export const CAR = {
  l: 4.2, w: 1.78, h: 1.5, color: 0xf2f2ee, plate: 'FGZ 56D',
  // #356: the routes are data — legs of either a waypoint [x, z] or a stretch of a road
  // { road: <SITE.roads name>, from: [x, z], to: [x, z] } driven in the right-hand lane in the direction from → to
  // (car.js `route` samples it with roads.js `along`, so the car follows the road if the road moves), then rounded off.
  // In by the drive through the hedge, over the car park's aisle, out by a loop at the car park's east end (not the
  // pavement) and the same drive. A garage start (#358) is a route in front of these.
  arrive: [{ road: 'Sankt Lars väg', from: [-95, -27], to: [-17, -27] }, [-12.6, -25.1], [-10.6, -22], [-10.25, -15],
    [-7.5, -9.5], [-2, -5.6], [2.9, -5.4]], // ends at our door
  leave: [[2.9, -5.4], [6.5, -5.6], [8.4, -8], [7, -10.6], [3, -11.2], [-4, -11.2], [-8.5, -13.5], [-10.25, -16.3],
    [-10.1, -22], [-11.4, -26.3], { road: 'Sankt Lars väg', from: [-16, -27], to: [-95, -27] }],
  // #358: it lives in its stall in the garage (#417: straight under our patio, GARAGE.stalls.ours, nose to Hus L's
  // basement wall). The key calls it OUT: it backs out of the stall (`reverse`), drives west through the big hall, round
  // the turn into the entrance hall and out through the garage door (which opens for it), up
  // the drive, right onto Karpvägen northbound, right onto Sankt Lars väg and on as `arrive` (from its second leg) to our
  // door. Sent away it goes `leave` (but its last leg), west in the far lane, left down Karpvägen, left into the drive and
  // nose-in to the stall; the door shuts behind it. Waypoints are ours (ASSUMPTION); `slow` m/s in the garage.
  garage: {
    reverse: [[1.895, 14.82], [1.895, 18.4], [3.2, 20.4], [5.2, 21.0]],
    out: [[5.2, 21.0], [-20, 21.0], [-44, 21.0], [-46.6, 23.5], [-46.6, 36.0], [-48.2, 41.6], [-52.5, 43.7], [-60, 43.8], [-67, 43.9], [-72, 44.0],
      [-76.6, 43.6], { road: 'Karpvägen', from: [-78.3, 38.5], to: [-75.8, -22] }, { road: 'Sankt Lars väg', from: [-73, -27], to: [-17, -27] }],
    in: [{ road: 'Sankt Lars väg', from: [-16, -27], to: [-66, -27] }, [-70.5, -27.4], { road: 'Karpvägen', from: [-75.8, -19], to: [-78.6, 40.5] },
      [-76.5, 44.6], [-72, 44.6], [-62, 44.4], [-53, 44.0], [-48.5, 42.4], [-45.8, 38.0], [-45.8, 26], [-43.5, 22.2], [-36, 21.6], [-4, 21.6], [-1.2, 21.3],
      [1.0, 19.6], [1.895, 17.4], [1.895, 14.82]],
    slow: 3,
  },
  lane: 0.25,                      // of the road's width right of its centre line: the middle of the right-hand lane
  speed: 8, brake: 2,              // m/s cruising, m/s² slowing down to the stop
  doorOpen: 1.1,                   // rad: how far a door opens (#250)
  // Music in the car (#268, CarRadio in sonos.js): the SYMFONISK channels from the dashboard (`dash`, local metres).
  // How you hear it (our choice): sitting inside clear; outside through a door that is open a little softer, through the
  // shut doors low and dull (a low-pass). It plays on when you get out, until switched off on the screen, the key sends the
  // car away, or F. While it plays and you sit in the car the house's SYMFONISK speakers are ducked to `duckHouse`.
  // `songLength` (s): the channels never end, so the screen's progress bar runs over a nominal song length.
  music: { gain: 0.45, ref: 0.8, rolloff: 1.3, dash: [0.62, 1.0, 0], songLength: 180, duckHouse: 0.3, redraw: 0.5,
    inside: { gain: 1, cutoff: 18000 }, open: { gain: 0.75, cutoff: 6000 }, shut: { gain: 0.3, cutoff: 500 } },
};

// Where Tilly's daybed stands along Sovrum 4's west wall (#312, the user: more open floor): its centre's z, the head end
// against the window wall — the wall's inner face z 12.2337 (data/plan.json), less the window board's 3 cm nose (world.js:
// the daybed's end, 83 cm high, overlaps the window's west part, x 0.652…, so it stops short of the board, never in the
// reveal), less a 4 mm gap, less half its length (HEMNES_DAYBED.W 2.07). The basketball holder and the posters follow it.
export const DAYBED_Z = 12.2337 - 0.03 - 0.004 - 2.07 / 2;

// Tilly's basketball (src/basket.js, the user): a size 6 ball (Ø 23 cm) in a wall holder over her daybed (Sovrum 4's
// west wall, x 0.202, centred on the bed, ball centre `y` over the floor). Click shoots it on an arc through the point
// you look at, coming down onto it at `entry` rad (the rim) or `flat` (anything else); speed up to maxSpeed m/s,
// ± jitter of it; right click / the
// 🏀 button dribbles (straight down at `dribble` m/s); it bounces with `bounce` (normal speed kept), loses `slip` of the
// speed along a surface per bounce, rolls out with `roll` /s damping, and comes back into the hand within `catch` m.
// The hoop (a portable one, our pick) stands on the asphalt east of our entrance by the hedge (#260), clear of the car's
// loop and the visitor's start, the board facing the house; it is up while the ball is out of its holder.
// Rim 3.05 m, Ø 45 cm, 15 cm in front of the board (regulation); board 112 × 72 cm, its bottom `below` the rim.
// `assist`: looking within this many metres of the rim aims at the rim. A basket from beyond `three` m is a three.
export const BASKET = {
  ball: { r: 0.115, level: 1, x: 0.202, z: DAYBED_Z, y: 1.5, held: { x: 0.17, y: -0.17, z: -0.5 },
    gravity: 9.81, entry: 0.85, flat: 0.25, maxSpeed: 13, jitter: 0.015, dribble: 4.6,
    bounce: 0.8, slip: 0.12, roll: 0.8, catch: 0.42 },
  hoop: { x: 7, z: -13.4, rim: 3.05, rimR: 0.23, rimTube: 0.01, rimZ: 0.38, board: [1.12, 0.72], below: 0.15,
    base: [1.0, 0.3, 0.7], baseZ: -0.75, arm: 0.35, net: 0.42, rise: 1.2, assist: 1.2 },
  three: 6.75,
};

export const TARGET = {
  x: 2.8, z: 19.5, y: 1.4, r: 0.4,
  rings: [10, 8, 6, 4, 2, 1],
  range: [[2, 1], [4, 2], [6, 3], [Infinity, 4]],
};

// Putting held things down (#102, holdable.js / main.js): a table top, worktop or the floor within `reach` m
// of the eye.
export const HOLD = { reach: 2.2 };

// The life simulator (epic #364, src/life.js; docs/livssimulator-inventering.md). `dev` = the developer scenario
// `&life` (#365): a reproducible start in the kitchen, never saved — the visitor's place (x, z, yaw°, pitch°), the
// clock (noon, paused, unless &time is given) and the test things (`items`: life-sim instances, #366): an empty cup and the milk on the free worktop between
// the sink and the hob (x 4.98…5.52 there), an empty wine glass on the dining table (SKANSNÄS, top 0.754). Our picks.
export const LIFE = {
  dev: { at: [4.35, 2.75, -90, -32], hour: 12, cup: [5.24, 2.62], milk: [5.26, 2.95], glass: [3.55, 1.45],
    items: { plate: [3.45, 1.0, 0], cucumber: [3.72, 1.05, 20], butter: [3.35, 1.75, 0], cucumberSlice: [3.75, 1.8, 0] },
    stored: [] }, // in their stores (#369): [type, store, slot] (+ the kitchen's stock, LIFE_FOOD / LIFE_TOOLS) // life items (#366) on the dining table: [x, z, yaw°]
  tooFar: 1.5, // a life-sim thing up to this much past HOLD.reach says "För långt bort" (#367)
  // storage slots (#369, stores.js): the fridge's free glass shelves (m over its floor; 0.82 = the chicken's, 1.2 = the milk's stay
  // as they are) and its door bins [y on the door, spots as fractions of the door's width]; the freezer: the top of the frozen
  // bags in its top basket (1.02 + the bags' 0.35 × 0.26 m). Our picks, from fridge.js's own shelf heights.
  stores: { fridge: { shelves: [0.45, 1.52], bins: [[0.85, [0.3, 0.7]], [1.3, [0.3, 0.7]], [0.4, [0.7]]] }, freezer: { y: 1.117, peas: 0.15 },
    boardRack: { z: 2.95, lean: 10 }, plates: { stack: 0.019 }, glasses: [0.25, 0.5, 0.75] }, // glasses: the drinking glasses' spots across the glass cabinet's lower shelf (fractions, #382) // plates: the height of one plate in the stack (#379) // the cutting board on its long edge against the splashback (#374): its middle's z, leaning ° off upright // peas: the lower open shelf's spot east of the fish-finger carton (x from the middle, #373)
  place: { grid: 0.05, floorGrid: 0.1, margin: 0.04, turn: 45 },
  // saving (#371): localStorage `key` written `every` s after a change; a thing whose place is gone lands on the free worktop (`lost`)
  save: { key: 'lunden.life', every: 1, lost: [5.25, 0.931, 3.0] },
  job: { walk: 0.6 },
  cut: { seconds: 0.6 }, // one cut with the kitchen knife (#375, #376), game seconds
  dispense: { seconds: 0.35 }, // a slice taken out of the bread bag (#377)
  butter: { g: 8, dab: 0.4, spread: 0.9 }, // butter per slice of bread (g, the plan's 8 g) and the dab / the spreading (game s) (#378)
  slice: { seconds: 0.6 }, // one slice off the cheese with the slicer (#378)
  sandwich: { max: 6 }, // at most this many layers on a slice of bread, butter included (#378, #379): "Mackan rymmer inte mer"
  drink: { fill: 1.6, pour: 1, sip: 40, seconds: 0.6, pourMl: 200 }, // the drinking glass (#382): filled at the tap in `fill` s (to the brim, no more), milk poured `pourMl` ml at a time over `pour` s, a sip `sip` ml over `seconds` (game s; our picks)
  wash: { seconds: 2.4, taps: ['köksblandaren'] }, // washing up by hand (#383): a scrub at the running tap of these sinks (game s; our pick)
  rules: { washFirst: true, strictSorting: true, mess: true }, // mess (#388): crumbs and dust come by themselves (false = free play: no automatic mess; `&mess=0`)
  // strictSorting (#386): the wrong bin keeps the waste in the hand (false: in it goes, with a note); #383: a used / dirty thing is refused in its cabinet or drawer ("Diska den först"); false = free play
  eat: { seconds: 0.5 }, // a bite: to the mouth and back (#377, #380); the bite comes off half-way // a timed action (#372) stops when the eye has moved this far (m) from where it started // putting down (#368): snap grids (m), kept this far inside a table's edge, R turns this many degrees
};

// Crumbs and dust (#388, LIFE-024, src/mess.js): spots on a worktop, a table or the floor, each with an amount 0…1 (a spot
// near another of its kind on the same surface grows instead of a new one: within `merge` m). Crumbs come from eating
// (`per.bite` a bite, on the surface under the food or the floor at the eater's feet), from cutting on the board (`per.cut`,
// on the worktop beside it) and from the bread bag (`per.bag`); dust gathers slowly on the floors (one bit every `dust.every`
// game s, at most `dust.perRoom` spots a room, near the walls: within `dust.wall` m of one). `max` per kind = what is
// ever drawn (one InstancedMesh each): a new spot past it grows the nearest one instead, so it never grows without bound.
// `size` = a full spot's width (m); a floor spot must be where the visitor could reach (player.js isFree with `margin`, so
// a little nearer a wall than the body). All our picks.
export const LIFE_MESS = {
  max: { crumb: 48, dust: 32, smear: 16 }, merge: 0.16, per: { bite: 0.25, cut: 0.2, bag: 0.15, spread: 0.5 },
  size: { crumb: 0.16, dust: 0.24, smear: 0.13 }, margin: -0.14,
  dust: { every: 150, perRoom: 3, amount: 0.35, wall: 0.45 },
};

// The drop-off for full rubbish bags (#387, src/waste.js `buildDropoff`): a *guess* — our real waste room is not verified in
// Peab's material, so this is a game spot: three underground containers (Matavfall, Förpackningar, Restavfall) in a row by
// the east end of the car park in front of Hus L, clear of the car's loop. x, z = the middle one, `gap` between them, `size`
// / `h` their tops over the ground (m; our picks).
export const LIFE_WASTE = { dropoff: { x: 10.9, z: -12.4, yaw: 0, gap: 1.1, size: 0.8, h: 1.05 } };

// The dishwasher (#384, src/dishwasher.js; the integrated KEZA9310W of the plan, no product drawing — our picks): its racks roll
// `out` m when the door is down; the lower rack (`y` over the tub's bottom, `h` high) holds `plates` plates on edge, the upper
// one `glasses` glasses upside down, the cutlery tray on top of it `tray` tools.
// #385: a programme takes `seconds` of game time (a short game programme, adjustable); `plinth` = the tub's bottom over the
// floor (the floor spot's height).
export const DISHWASHER = { out: 0.38, lower: { y: 0.05, h: 0.13, plates: 6 }, upper: { y: 0.36, h: 0.11, glasses: 6 }, tray: 4, seconds: 60, plinth: 0.097 };

// The kitchen's food from the start (#373, LIFE-009; the user: no shop, no delivery, no budget — the food is simply there):
// `stock` = [type, store, slot] — where each thing lives (its home); `amounts` = what a fresh one holds, game parameters from
// the plan (docs/livssimulator-plan-2026-10-04.md section 3), not product measures. A thing used up and thrown away is back
// in its home the next time its store is opened after being shut (life.js `restock`), never while the old one is still
// anywhere (in the hand, lying out, half used). The milk is milk.js's carton (#168), the fish fingers fishfingers.js's.
export const LIFE_FOOD = {
  amounts: { cucumber: 300, cheese: 500, butter: 500, peas: 500, breadBag: 12 }, // g, g, g, g, slices
  stock: [['cheese', 'fridge', 0], ['cucumber', 'fridge', 1], ['butter', 'fridge', 6], // the bottom shelf; the butter in the door's top bin
    ['peas', 'freezer', 3], // on the lower open shelf beside the fish-finger carton
    ['breadBag', 'pantry', 0]], // the bottom of the pantry cabinet
};

// The kitchen's tools (#374, LIFE-010), kept like the food (life.js `restock`): the kitchen knife, the butter knife and the
// cheese slicer in the utensil drawer under the hob, the cutting board leaning on the splashback between the sink and the
// hob (`boardRack`: off the worktop's free space, the user finds the kitchen cramped). Our picks.
export const LIFE_TOOLS = {
  stock: [['knife', 'utensils', 0], ['butterKnife', 'utensils', 1], ['cheeseSlicer', 'utensils', 2], ['board', 'boardRack', 0],
    ['plate', 'plates', 0], ['plate', 'plates', 1], ['plate', 'plates', 2], // three plates in the wall cabinet over the free worktop (#379)
    ['bin', 'sinkBins', 0], // the waste bin under the sink (#381): since #386 the grey one, Restavfall
    ['binFood', 'binsFood', 0], ['binPack', 'binsPack', 0], // #386: the green one (Matavfall) and the small blue one (Förpackningar)
    ['glass', 'glasses', 0], ['glass', 'glasses', 1], ['glass', 'glasses', 2]], // three drinking glasses at the front of the glass cabinet (#382)
  // what a tool tag does to a food tag (life.js tool actions): `label` = the action, `not` = the wrong tool's message
  // ("Osthyveln skär inte gurka"); a new tool is an ITEMS entry with one of these tags, nothing else
  uses: [
    { tool: 'tool:cut', target: 'cuttable', label: 'skära', not: 'skär inte' },
    { tool: 'tool:slice', target: 'sliceable', label: 'hyvla', not: 'hyvlar inte' },
    { tool: 'tool:spread', target: 'spreadable', label: 'ta smör ur', not: 'kan inte bre' },
  ],
};

// The life simulator's item types (#366, src/items.js): name (Swedish, definite form as in the prompts), tags (what it
// is and what it can do: 'food', 'tool:cut' / 'tool:spread' / 'tool:slice', 'carrier', 'dishwasherSafe' …), unit
// ('g' | 'ml' | 'count'), the starting amount, a size class (xs … xl: a slot / carrier takes up to its own size),
// `pkg` / `prep` / `clean` = the starting state, `carrier` = what it can hold (slots, the biggest size, accepted tags),
// `model` = the builder in lifemodels.js, `held` = its pose in the hand (camera space), `noun` = the indefinite form in messages
// ("Osthyveln skär inte gurka", #374). Amounts are game parameters from
// the plan (docs/livssimulator-plan-2026-10-04.md: a cucumber 300 g, a slice 10 g), not product measures.
export const ITEMS = {
  plate: { name: 'tallriken', tags: ['dish', 'carrier', 'dishwasherSafe'], unit: 'count', amount: 1, size: 'm', clean: 'clean', model: 'plate',
    carrier: { slots: 6, size: 's', accepts: ['food'], fullText: 'Tallriken är full', order: [0, 1, 2, 3, 4, 5] } }, // the middle first, then round it
  board: { name: 'skärbrädan', tags: ['carrier', 'station'], unit: 'count', amount: 1, size: 'l', clean: 'clean', model: 'board',
    carrier: { slots: 9, size: 'm', accepts: ['food'], fullText: 'Brädan är full', // spot 0 = what is being cut, 1–8 = what was cut
      spots: [{ accepts: ['cuttable', 'sliceable', 'base', 'package'] }, ...Array(8).fill({ size: 's' })] } },
  cucumber: { name: 'gurkan', noun: 'gurka', tags: ['food', 'cuttable'], unit: 'g', amount: LIFE_FOOD.amounts.cucumber, size: 'm', prep: 'whole', model: 'cucumber',
    cut: { into: 'cucumberSlice', g: 10, end: 10, stat: 'cucumberSlices' } }, // a cut gives one 10 g slice (the plan's example, #375 / #376); the last 10 g = the end
  cucumberSlice: { name: 'gurkskivan', noun: 'gurka', tags: ['food', 'topping'], unit: 'g', amount: 10, size: 'xs', prep: 'sliced', model: 'cucumberSlice' },
  cheese: { name: 'osten', noun: 'ost', tags: ['food', 'sliceable'], unit: 'g', amount: LIFE_FOOD.amounts.cheese, size: 's', prep: 'whole', model: 'cheese',
    slice: { into: 'cheeseSlice', g: 12 } }, // the slicer takes one 12 g slice (#378); the last one is what is left
  butter: { name: 'smöret', noun: 'smör', tags: ['food', 'package', 'spreadable'], unit: 'g', amount: LIFE_FOOD.amounts.butter, size: 's', pkg: 'closed', model: 'butter' },
  breadBag: { name: 'brödpåsen', noun: 'bröd', tags: ['food', 'package'], unit: 'count', amount: LIFE_FOOD.amounts.breadBag, size: 'm', pkg: 'closed', model: 'breadBag', dispense: 'breadSlice', dispenseLabel: 'ta en brödskiva', binVolume: 3 }, // "Ta en brödskiva": one slice at a time into the hand (#377)
  peas: { name: 'ärtpåsen', noun: 'ärter', tags: ['food', 'frozen', 'package'], unit: 'g', amount: LIFE_FOOD.amounts.peas, size: 'm', pkg: 'closed', model: 'peas' }, // (#373; cooking them comes later)
  cheeseSlice: { name: 'ostskivan', noun: 'ost', tags: ['food', 'topping'], unit: 'g', amount: 12, size: 'xs', prep: 'sliced', model: 'cheeseSlice' }, // (#378)
  // a waste bin (#381): `fixed` (it stays in its place: no "Ta"), its amount = how full (count units), `capacity`; what is
  // thrown is kept as `parts` per kind ('food' | 'package') for the sorting later (LIFE-022). A thing is waste when it is an
  // empty package, the end of something cut, or leftover food (a slice, a half-eaten sandwich); ITEMS `binVolume` = its
  // units (else 1 for food, 2 for a package). Game parameters, our picks.
  // #386: three bins (game categories, not a claim about the property's real waste system): `sort` = the waste kind it takes
  // (life.wasteKind), `label` its category, `bag` the bag's look; a bin without a bag (tied up and taken out) has machine.nobag
  bin: { name: 'restavfallet', label: 'Restavfall', sort: 'rest', bag: 'black', fullText: 'Restavfallspåsen är full', tags: ['bin', 'fixed'], unit: 'count', amount: 0, size: 'xl', model: 'bin', capacity: 12 },
  binFood: { name: 'matavfallet', label: 'Matavfall', sort: 'food', bag: 'paper', fullText: 'Matavfallspåsen är full', tags: ['bin', 'fixed'], unit: 'count', amount: 0, size: 'xl', model: 'bin', capacity: 8 },
  binPack: { name: 'förpackningarna', label: 'Förpackningar', sort: 'package', bag: 'clear', fullText: 'Förpackningspåsen är full', tags: ['bin', 'fixed'], unit: 'count', amount: 0, size: 'xl', model: 'bin', capacity: 12 },
  // a tied rubbish bag (#386): its amount and parts are what was in the bin (moved, not copied), machine.sort its category
  rubbishBag: { name: 'soppåsen', tags: ['rubbishBag'], unit: 'count', amount: 0, size: 'l', model: 'rubbishBag', held: { pos: [0.2, -0.42, -0.45], rot: [0, 0.3, 0] } },
  breadSlice: { name: 'brödskivan', noun: 'bröd', tags: ['food', 'base'], unit: 'count', amount: 1, size: 's', model: 'breadSlice', bites: 4, crumbs: true }, // eaten in four bites (#377, like the fruit #326); crumbs: every bite drops some (#388)
  knife: { name: 'kökskniven', tags: ['tool', 'tool:cut', 'dishwasherSafe'], unit: 'count', amount: 1, size: 's', clean: 'clean', model: 'knife' },
  butterKnife: { name: 'smörkniven', tags: ['tool', 'tool:spread', 'dishwasherSafe'], unit: 'count', amount: 1, size: 's', clean: 'clean', model: 'butterKnife' }, // (#374)
  // the drinking glass (#382): its amount = the drink in it (ml, up to `capacity`), `machine.drink` = what it is ('water' |
  // 'milk', one at a time: no mixing in this first version); `drinks` = what may go in. 25 cl, our pick.
  glass: { name: 'dricksglaset', noun: 'glas', tags: ['dish', 'glass', 'dishwasherSafe'], unit: 'ml', amount: 0, size: 's', clean: 'clean', model: 'glass', capacity: 250, drinks: ['water', 'milk'],
    held: { pos: [0.16, -0.21, -0.4], rot: [0, 0, 0] } },
  cheeseSlicer: { name: 'osthyveln', tags: ['tool', 'tool:slice', 'dishwasherSafe'], unit: 'count', amount: 1, size: 's', clean: 'clean', model: 'cheeseSlicer' }, // (#374)
};

// A new version loads by itself (#192, #277, main.js `autoReload`): after `still` s without input / movement / panel
// / music (and nothing time-bound going on) "Uppdateras om N" counts down from `countdown` s, any input cancels it
// ("Uppdatering avbruten" for `cancelled` s); then a `fade` s fade-out and the new version. Never still for `fallback`
// s: the old notice with its "Ladda om" button. (The user's numbers: 5 s countdown; the rest are ours.)
export const AUTO_RELOAD = { still: 2.5, countdown: 5, cancelled: 1.5, fade: 0.4, fallback: 300 };

// "Återställ" on the start screen (#303, src/reset.js): every 'lunden.*' key in localStorage / sessionStorage is
// removed EXCEPT these — a whitelist, so a new key is reset by default unless it is added here as "reality" or
// personal. Kept: what the shared world (cloud.js) owns or still has to send (the offline queue must never be
// dropped), the desk drawing (the visitor's own creation; synced when the cloud is on), the score / statistics
// ("Nollställ statistiken" is separate), the leaderboard name and id, and per-visitor conveniences. IndexedDB is not
// touched at all: taped-up drawings (synced or, with the cloud off, the visitor's own) and the cat photos stay.
export const RESET_KEEP = [
  'lunden.cloud.queue', 'lunden.cloud.seenCats', 'lunden.drawing', 'lunden.drawing.updated', // the shared world
  'lunden.stats', 'lunden.name', 'lunden.playerId', // the score and the leaderboard
  'lunden.scoreQueue', // completed players awaiting upload, including offline player changes
  'lunden.changelogSeen', 'lunden.changelogSeenT', 'lunden.installSkipped', 'lunden.mapShown', // conveniences
];

// Performance (#189): small meshes (radius < maxR m) are not drawn once they would look smaller than `k`
// (radius / distance, ~0.6° across), never nearer than `minDist`; meshes up to `maxOcclude` inside the flat are
// not drawn from outside unless seen through a façade opening; re-checked after the camera moved `move` m.
export const PERF = { detail: { maxR: 0.5, k: 0.009, minDist: 3.2, maxOcclude: 4, move: 0.3 } };

// Marks on surfaces (#96, src/marks.js): one ring buffer of at most `max` flat decals in all, one instanced
// mesh per kind, canvas textures. Per kind: size (m, randomised ±25 %), life (s; the last `fade` s fade out).
// burn = the lightsaber (with a short glow and a puff of smoke), star/butterfly = wands, splash = Nerf.
// Our picks. `gap`: no new mark closer than this to the last one, nor sooner than `every` s.
// The AK-47 in the NORDLI chest (#196, src/rifle.js): a folding-stock AKMS, folded ~68 cm (fits the wide bottom drawer).
// `mag` rounds, `rpm` automatic, `spread` (rad) per shot, `range` m; empty → `reloadDelay` s → a `reloadSeconds` reload;
// dropped magazines lie `magLife` s (at most `maxDrops`). `held` = where it sits in the view. Our picks.
export const RIFLE = { mag: 30, rpm: 600, spread: 0.012, range: 60, reloadDelay: 0.25, reloadSeconds: 1.6, magLife: 120, maxDrops: 6,
  held: { x: 0.17, y: -0.24, z: -0.56 } };
export const MARKS = {
  max: 60, fade: 3, gap: 0.06, every: 0.15,
  kinds: {
    burn: { size: 0.09, life: 150 },
    glow: { size: 0.12, life: 1.2 },
    star: { size: 0.07, life: 18 },
    butterfly: { size: 0.08, life: 18 },
    splash: { size: 0.14, life: 30 },
    hole: { size: 0.03, life: 90 }, // bullet holes (#196)
  },
  smoke: { n: 40, life: 1.6, rise: 0.25 },
  // the wands' magic (#97): `stars` star marks round the hit (within `spread` m), 2–3 butterflies flutter there
  magic: { stars: 6, spread: 0.18, colors: [0xff7ad0, 0xb07bff, 0xffd34a, 0x40e0d0], flutter: { n: 12, life: 15, size: 0.09 } },
};

// Shooting things to pieces (#263, src/breaking.js): the glass and china Holdables standing somewhere (home or put
// down, never in the hand) break when the AK-47's bullet, a Nerf dart (only `light` things), the lightsaber's blade or
// a wand's magic reaches them first. Per kind: `shards` pieces of `glass` (see-through) or china, `color`, `size` (m),
// `splash` = the size of the drink's splash mark when it held something. A broken thing is back home after `back` s
// (cups: the next time the cabinet opens), or at once with F. Shards fly, bounce once, lie `lie` s and shrink away
// over `fade` s; at most `max` of each sort. A cat within `catNear` m meows. Points (SCORE: shattered, shatterRange):
// range points = floor(k × (distance − from)^pow) × weapon factor, at most `cap`; the saber gets `saberBonus`. Our picks.
export const BREAK = {
  back: 45, lie: 8, fade: 1.2, max: 120, catNear: 4,
  kinds: {
    glass: { name: 'glaset', shards: 14, glass: true, color: 0xdfeef0, size: 0.022, light: true, splash: 0.16 },
    wine: { name: 'vinflaskan', shards: 18, glass: true, color: 0x1f4a2a, size: 0.03, splash: 0.3 },
    champagne: { name: 'champagneflaskan', shards: 18, glass: true, color: 0x2c4d22, size: 0.03, splash: 0.3 },
    whisky: { name: 'whiskyflaskan', shards: 18, glass: true, color: 0xd8e2e0, size: 0.03, splash: 0.28 },
    beer: { name: 'ölen', shards: 16, glass: true, color: 0xe8f0f2, size: 0.028, splash: 0.28 },
    jug: { name: 'kaffekannan', shards: 16, glass: true, color: 0xdfe6e8, size: 0.028, splash: 0.26 },
    cup: { name: 'koppen', shards: 10, glass: false, color: 0xf3f1ec, size: 0.026, light: true, splash: 0.16 },
  },
  range: { from: 2, k: 0.8, pow: 1.5, cap: 60 }, // 8 m: 11, 15 m: 37
  weapons: { rifle: 1, dart: 1.5, wand: 1, saber: 0 }, // a dart flies in an arc: harder from afar
  saberBonus: 1,
};

// Coffee cups (#90, src/cups.js): three cups in the wall cabinet over the Moccamaster (its door opens with
// E); taken out, a cup stands on the worktop south of the machine (`counter`), fills from the jug (each
// cup takes `pour` of it), is held like a toy and can be put down on any table (furniture surfaces).
// Sizes: a 9 cm tall, 8 cm wide mug (guess).
// Fish fingers in the freezer (#162, src/fishfingers.js): a carton on the lower open shelf, n in it; each one taken
// straight into the hand, eaten in `bites` bites or put down anywhere. Sizes of a typical 15-pack (~9 × 2.5 × 1.6
// cm sticks, the carton ~19 × 13 × 4.5 cm); `held` = the stick in the view (camera space).
// Frying them (#214): in the pan on a lit zone, frozen pale → golden over `seconds`, burnt from `burnAt` (dark by
// `burnt`, smoking); `slots` = how many fit side by side; a fried one steams for `steam` s. Colours multiply the crumb
// texture (frozen = white). Times are our picks.
export const FISH = { n: 15, len: 0.09, w: 0.025, h: 0.016, bites: 3, box: { w: 0.19, d: 0.13, h: 0.045 },
  fry: { seconds: 6, burnAt: 18, burnt: 22, slots: 5, steam: 30, golden: 0xd99a4a, dark: 0x3b2716 },
  held: { x: 0.13, y: -0.12, z: -0.42 } }; // held: a little further out so the hand round it (#242) does not fill the view
// The air fryer (#287, src/airfryer.js): an OBH Nordica Easy Fry Deluxe in brushed stainless on the worktop in the corner left
// of the freezer (the corner unit's top, back to the splashback, a gap to the freezer's side). The product page is blocked
// from the cloud session: W × D × H 30 × 38 × 32 cm is the issue's *guess* for a ~5 l model. `x`, `z` = its centre;
// `basket` = the pull-out drawer (front part of the lower body: depth, height, how far it slides out, `in` s to slide);
// `slots` fish fingers fit in it (2 rows of 3, *guess*). E on the panel with the basket in runs it for `seconds` real
// seconds (the display counts down game time: × `clock` = 24, the 60-minute day, so 20 s shows 8:00) at `temp` °C; it
// cooks fish fingers `rate` × as fast as the pan would, so one run makes them golden (FISH.fry.seconds, a little before
// the end) and they burn early in a third run (FISH.fry.burnAt, "left far too long"). Basket out mid-run: paused. Done: `beeps` beeps. The cord runs up
// the splashback to the corner wall socket's south mouth (KITCHEN_SOCKETS, 'corner-s', #442).
// #296 (the user): further into the corner and turned `rot`° (about y) so the front and basket face diagonally out of it,
// away from both splashbacks (+45 = front towards north-west). `x`, `z` put its rounded footprint (±0.22 m along x and z
// turned) 3.5 cm from the east and south splashbacks (5.50 / 5.484), its flat back towards the corner.
export const AIRFRYER = { x: 5.245, z: 5.229, rot: 45, w: 0.3, d: 0.38, h: 0.32,
  basket: { d: 0.25, h: 0.15, out: 0.2, in: 0.35 }, slots: 6, seconds: 20, clock: 24, temp: 200, beeps: 3,
  get rate() { return 1.2 * FISH.fry.seconds / this.seconds; } };
// A bag of Aviko frozen fries (#301, src/fries.js): a stand-up bag `bag` W × H × D m (*guess* from the issue, ~1 kg), leaning
// back on the freezer's top shelf; `portions` pours in a full bag, `portion` fries per pour, at most `max` portions in the
// basket (its volume, *guess*). In the air fryer they go from frozen `raw` to `golden` after `golden` s of cooking (real
// seconds while it runs: one AIRFRYER run of 20 s, a little before its end), and from `burnAt` s (the third run, "left far
// too long") to `dark` by `burnt`; done, they steam for `steam` s (cooling, like a cup of coffee, #216). E on the basket
// takes `bunch` of them into the hand; each bite eats one. Stick `len` × `t` m. Our picks.
export const FRIES = { bag: { w: 0.24, h: 0.33, d: 0.055 }, portions: 6, portion: 18, max: 2, bunch: 4, len: 0.07, t: 0.009,
  golden: 17, burnAt: 48, burnt: 58, steam: 60, pour: 0.9,
  raw: 0xf2e9c4, goldenColor: 0xe2a447, dark: 0x4a2c12, held: { x: 0.2, y: -0.36, z: -0.58 }, bunchHeld: { x: 0.13, y: -0.12, z: -0.42 } };
// The fruit bowl on the coffee table (#326, src/fruit.js, docs/fruktskal-dorre-koppar.jpg): a Dorre wire bowl in polished
// copper, an open shallow bowl Ø `r` × 2 at the band, `bottom` = the radius of its base ring, `h` high, a flat band `band`
// high round the top, `hooks` zig-zag wires hanging from it down to the base ring, `spokes` in the base wheel, wire Ø
// `wire` × 2 (all *guesses*). On the coffee table's west half (ILVA Woodstock, x 3.04…4.24, z 10.26…10.86), clear of the
// remote (x 3.98) and the middle where the cups go. Fruit (`pieces`, *guess*): `kind` + its spot in the bowl (local
// x, y, z of its bottom, a turn and a tilt); `bites` per kind (an orange and a banana are peeled with the first one),
// `held` = where it sits in the view (camera space).
export const FRUIT = { x: 3.33, y: 0.47, z: 10.52, r: 0.14, bottom: 0.06, h: 0.12, band: 0.015, hooks: 16, spokes: 12, wire: 0.0017,
  copper: 0xc8845e,
  bites: { apple: 4, pear: 4, orange: 4, clementine: 3, banana: 4 },
  pieces: [
    { kind: 'apple', color: 0xb3221c, x: 0.065, y: 0.006, z: 0, turn: 0.3, tilt: 0.25 },
    { kind: 'orange', x: 0.02, y: 0.006, z: 0.062, turn: 1, tilt: 0.2 },
    { kind: 'apple', color: 0x8fbf3a, x: -0.053, y: 0.006, z: 0.038, turn: 2, tilt: 0.25 },
    { kind: 'pear', x: -0.053, y: 0.008, z: -0.038, turn: 0.5, tilt: 0.42 },
    { kind: 'clementine', x: 0.02, y: 0.006, z: -0.062, turn: 2.5, tilt: 0.2 },
    { kind: 'apple', color: 0xc8361f, x: 0.012, y: 0.05, z: 0.004, turn: 4, tilt: 0.1 },
    { kind: 'banana', x: -0.035, y: 0.072, z: 0.025, turn: 0.35, tilt: -0.25 },
    { kind: 'banana', x: -0.05, y: 0.06, z: 0.0, turn: 0.45, tilt: -0.3 },
    { kind: 'banana', x: -0.06, y: 0.05, z: -0.03, turn: 0.55, tilt: -0.35 },
  ],
  held: { x: 0.13, y: -0.12, z: -0.42 } };
// The cat and a fish finger on the floor (#163, cat.js): one within `reach` m in the open (a straight walk with no
// wall or door in between, i.e. the same room) catches its eye; it looks for `notice` s, walks there at `speed` m/s,
// stops `stop` m short (its head over it) and eats it in `eat` s. Taken away first: it looks after it for `look` s.
export const CAT_FISH = { reach: 4, notice: 1.2, speed: 0.55, stop: 0.17, eat: 3, look: 2.5 };
// After a pat the cat walks off (#206, cat.js `leave`): up to `dist` m away from the visitor along the clearest straight line,
// at `speed` m/s, fading out over the last `fade` s, then it is gone.
export const CAT_LEAVE = { dist: 3, speed: 0.6, fade: 1.2 };
// The cat walks on all four (#224, cat.js `pose`): it rises from sitting to standing in `rise` s before it walks and sits
// down again in the same time when it stops; a diagonal-pair gait, one leg cycle per `stride` m (× breed size), legs
// swinging ±`swing` rad, the hind knee flexing up to `knee` rad as the paw comes forward, the body bobbing `bob` m. Our picks.
export const CAT_WALK = { rise: 0.3, stride: 0.3, swing: 0.4, knee: 0.6, bob: 0.006 };
// A cat turning up behind a door sits up on a bed, sofa, chair or table in that room this often (#200, cat.js furnitureSpot),
// on one seen straight from the doorway within `reach` m.
export const CAT_FURNITURE = { chance: 0.4, reach: 5 };
// Tail up (#262, cat.js `updateTail`): now and then (a wait of `every` [min, max] s, `standing` × as fast while it is up on
// its feet) the cat gets up and holds its tail straight up for `seconds` [min, max] s, raised/lowered over `blend` s, turning
// round on the spot over `turn` s (sitting it washes; the tail never goes up while it sits); walking off after a pat it does
// so `leave` of the time. Then a small dark X (`x` m across) shows under the tail root. Seen from behind —
// the eye within `cone`° of straight behind it, within `dist` m, the X on screen, no wall between — it counts once per
// tail-up (stats catButts, SCORE). Our picks.
export const CAT_TAIL_UP = { every: [10, 25], seconds: [4, 8], standing: 3, blend: 0.4, turn: 1.5, leave: 0.6, x: 0.022, cone: 55, dist: 3.5 };

// Steam over hot coffee (#216, cups.js): `strips` soft wisps rising `height` m from the surface, one mesh per cup;
// fresh coffee is hot and cools over `seconds` (real ones steam a few minutes), cold milk cools it by `milk` × its share;
// `opacity` at the hottest, full cup. Our picks, tuned on screenshots.
export const CUP_STEAM = { seconds: 240, strips: 3, segments: 10, height: 0.13, width: 0.018, opacity: 0.4, milk: 2.5, drift: 0.04 };
// "Kaffeturbo!" (#217, src/turbo.js): `cups` cups of coffee within `window` real seconds → `speed` × walking (indoors too)
// for `seconds`; more coffee meanwhile adds `extend` × the time per 3 cups' worth, up to `max` s left; `fov` degrees wider;
// the last `ending` s the tune speeds up; `bpm`, `volume` of the chiptune. Our picks.
export const TURBO = { cups: 3, window: 300, seconds: 120, max: 240, extend: 1, speed: 1.8, fov: 6, ending: 5, bpm: 190, volume: 0.5 };
// The coffee (#316, the user: "we live in Skåne, there we drink it dark" — Zoégas Mollbergs Blandning, a dark roast):
// one colour for the jug (coffee.js), the cups (cups.js) and the mixes (DRINKS.coffee); almost black-brown, not reddish
// (*guess*, tuned on screenshots). `roughness` low so light catching the surface gives a faint glint.
export const COFFEE = { color: 0x1b0f08, roughness: 0.12 };
// Cup patterns (#215, cups.js `DESIGNS`): every cup gets one; opening the cabinet fills an empty shelf spot with a new
// cup of a random pattern (not one already in there). At most `maxOut` cups stand outside the cabinet: past that the
// one put down longest ago goes. `designs` = the pattern names drawn in cups.js (the family's names after #164).
export const CUPS = { n: 3, r: 0.04, h: 0.09, color: 0xf3f1ec, coffee: COFFEE.color, pour: 0.25, counter: { x: 5.2, z: 1.68 },
  sip: 0.2, maxOut: 8, designs: ['blue-stripes', 'mustard-stripes', 'red-dots', 'flowers', 'blue-white', 'cat', 'sarah', 'olof',
    'hearts', 'black-gold', 'rainbow', 'lunden', 'letter-T', 'letter-K', 'letter-W', 'letter-L'],
  held: { x: 0.18, y: -0.2, z: -0.4 }, jugHeld: { x: 0.22, y: -0.26, z: -0.55 } }; // jugHeld: the jug in the view (#141)

// Drinks (#166–#169, src/drinks.js): what a glass or a cup holds. Per drink its colour, opacity and `tint` (how
// strongly it colours a mix: a splash of milk lightens coffee more than its share, guess). `pour`: what one pour
// does in a vessel, as a fraction of the vessel's height: `to` = fill up to that level, `add` = a splash on top
// (whisky ~2–4 cl), `empty` = the level when poured into an empty vessel; never above full. `sip` = one sip from
// a glass, `secs` = how long a pour takes, `tilt` = how far a bottle tips while it pours (rad).
export const DRINKS = {
  wine: { color: 0x5c0a1c, opacity: 0.92, tint: 1, name: 'vin' },
  champagne: { color: 0xeed98a, opacity: 0.6, tint: 1, name: 'champagne' },
  whisky: { color: 0xb8651c, opacity: 0.82, tint: 1, name: 'whisky' },
  milk: { color: 0xf7f5ef, opacity: 1, tint: 2.5, name: 'mjölk', withCoffee: 0xc39a6b }, // withCoffee: its colour in a mix with coffee (café au lait, #168); tint 2 → 2.5 with the darker coffee (#316) so a splash lightens it as much as before
  coffee: { color: COFFEE.color, opacity: 1, tint: 1, name: 'kaffe' }, // #316: dark roast
  water: { color: 0xd8ecf6, opacity: 0.35, tint: 0.2, name: 'vatten' }, // tap water in the life sim's drinking glass (#382): clear, a light tint
  pour: {
    glass: { wine: { to: 0.45 }, champagne: { to: 0.85 }, whisky: { add: 0.2 }, milk: { to: 0.75 } },
    cup: { milk: { empty: 0.8, add: 0.15 }, whisky: { add: 0.12 } }, // milk: a cup of it or a splash in the coffee (#168); whisky: a splash (#169)
  },
  sip: 0.15, secs: 1, tilt: 1.5,
  ml: { glass: 250, cup: 200 }, // a full vessel's volume, for what a pour takes out of the milk carton (#382; our picks)
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

// The visitor's arm and hand (#195, src/hand.js): colours, and points in camera space (x right, y up, −z ahead):
// the shoulder the sleeve comes from (out of view), where a reach starts from, how far beyond that it reaches (m) and in
// how long it goes out and back (s). Our numbers.
// #238: `size` scales the modelled adult hand (palm 8 cm wide); `skinGlow` a faint warm emissive so the shaded side
// isn't grey (cheap stand-in for light through skin); `cuff` = m from the wrist back to the sleeve's cuff; how far
// the fingers close: 1 round a `grip`, `boxCurl` beside a thing without one, `palmCurl` under one carried on the palm.
export const HAND = { skin: 0xe2b292, skinGlow: 0x2a0e06, sleeve: 0x4a5a6e, shoulder: [0.3, -0.5, 0.15], rest: [0.2, -0.26, -0.32],
  reach: 0.4, reachTime: 0.4, size: 0.95, cuff: 0.085, boxCurl: 0.75, palmCurl: 0.2, petCurl: 0.15, hugCurl: 0.45 }; // petCurl: stroking the cat (#242); hugCurl: round Pingping (#269)

// What is in the wardrobes and drawers (#228, src/stuff.js): shared colours, and per person (by room) the clothes:
// `size` (1 adult, ~0.65 a child), garment colours, what hangs on the rod, folded colours, shoes, socks, underwear.
// Who sleeps where: CLAUDE.md. Our picks.
export const STUFF = {
  hanger: 0xc9a77c, hook: 0x9a9ea3, sole: 0x2a2a2a,
  boxes: [0xd9cbb5, 0xf2f2f2, 0xb7c9d6],
  socks: [0x222222, 0xf2f2f2, 0x7a8a99, 0x3b5f94, 0xc0392b],
  under: [0x222222, 0xf2f2f2, 0x5b6b7c, 0x9aa8b6],
  people: [
    { who: 'Sarah & Olof', rooms: ['Sovrum 1'], size: 1, hang: ['shirt', 'dress', 'trousers', 'jacket'],
      colors: [0xf5f5f0, 0x9fb7d0, 0x2e3a4f, 0x6b8f71, 0xd8b4a0, 0x8c2f39, 0x1f1f1f],
      folded: [0xf2f2f2, 0x2e3a4f, 0x9fb7d0, 0x6b8f71, 0x1f1f1f, 0xd8b4a0], shoes: [0x3b2a1e, 0x1f1f1f, 0xe8e2d6] },
    { who: 'Walter & Kian', rooms: ['Sovrum 2'], size: 0.68, hang: ['tee', 'shirt', 'trousers', 'jacket'],
      colors: [0x1d3557, 0x2a9d8f, 0xe63946, 0x6c757d, 0x111111, 0xf4a261, 0x3a86ff],
      folded: [0x1d3557, 0xe63946, 0x6c757d, 0x2a9d8f, 0x111111, 0xf1faee], shoes: [0x1d3557, 0x111111, 0xe63946],
      socks: [0x111111, 0x1d3557, 0xe63946, 0x6c757d, 0xf1faee], under: [0x1d3557, 0x6c757d, 0x2a9d8f, 0x111111] },
    { who: 'Livia & Tuva', rooms: ['Sovrum 3'], size: 0.64, hang: ['dress', 'tee', 'shirt', 'trousers'],
      colors: [0xffafcc, 0xcdb4db, 0xffe66d, 0x95e1d3, 0xffffff, 0xa2d2ff, 0xff70a6],
      folded: [0xffafcc, 0xcdb4db, 0xffe66d, 0x95e1d3, 0xa2d2ff, 0xffffff], shoes: [0xff70a6, 0xcdb4db, 0xffffff],
      socks: [0xffafcc, 0xffe66d, 0xcdb4db, 0xffffff, 0x95e1d3], under: [0xffffff, 0xffafcc, 0xcdb4db, 0xa2d2ff] },
    // Tilly (15, #281): black, lilac, denim, neon green, white, charcoal, a muted pink accent
    { who: 'Tilly', rooms: ['Sovrum 4'], size: 0.76, hang: ['jacket', 'tee', 'shirt', 'trousers'],
      colors: [0x18181b, 0xb79cff, 0x4a6fa5, 0xa3e635, 0xf2f0ec, 0x3a3a40, 0xd8a1b0],
      folded: [0x18181b, 0xb79cff, 0x4a6fa5, 0xa3e635, 0xf2f0ec, 0x3a3a40], shoes: [0x18181b, 0xf2f0ec, 0xb79cff],
      socks: [0x18181b, 0xf2f0ec, 0xb79cff, 0xa3e635], under: [0xf2f0ec, 0x18181b, 0xb79cff] },
  ],
};

// The milk carton in the fridge (#168, src/milk.js): 1 l, 7 × 7 × 19.5 cm with a 3 cm gable (a standard carton).
// #382: it holds `ml` (the label's 1 liter) and runs out: every pour takes what went in (a vessel's share of DRINKS.ml);
// empty, it is a package for the bin, and a full one is back on its shelf the next time the fridge is opened after that.
export const MILK = { w: 0.07, h: 0.195, gable: 0.03, blue: '#2f6fc4', held: { x: 0.2, y: -0.3, z: -0.46 }, ml: 1000 };

// The shared world (#178, #119, src/cloud.js): the address of the Cloudflare Worker in cloudflare/ (taped-up
// drawings, the desk sheet, a feed of cat photos). Empty = off: everything stays in this browser only. Written by
// cloudflare/setup.sh; keep it on one line. Locally (BUILD 'dev') it is off unless the page has &cloud=<url>.
export const CLOUD_URL = 'https://lunden-l1007.olw.workers.dev';

// The score (#198, the global leaderboard; #197 shows it in the HUD), balanced (the user): you can grind for ever, but
// what is easy to repeat gives little and what is rare or hard gives a lot. Our picks.
//  each:   points per counted event (stats.js `bump`), every time.
//  first:  points for each distinct thing the first time (each door, lamp, seat, tap, cabinet front, room, song …:
//          `bump(key, n, id)`; without an id the key itself = one thing); `again` = points for every time after that.
//  breeds: points per cat found, by how rare its breed is (cat.js BREEDS weights: huskatt 70, siames 8, brittiskt
//          korthår 7, maine coon 6, norsk skogkatt 5, perser 3, sphynx 1 of 100); `first.coats` once per new coat.
//  secrets: the secret drawer — `kinds` once per surprise kind found, `rare` once more per rare kind (+ each.secrets).
export const SCORE = {
  each: {
    petted: 8, catPhotos: 2, catFish: 25,                 // a pat (a cat to find first), its photo; feeding one takes a plan
    kittenPets: 12,                                       // a kitten's pat on top of `petted` (#363)
    target: 1, splashes: 0.2, cuts: 0.1, magic: 0.3,      // Nerf target: per target point (rings × distance = skill)
    baskets: 6, threes: 6, dribbles: 0.1,                 // a three = a basket + a three (12)
    turbo: 20,                                            // three cups of coffee in five minutes
    beer: 0.3, coffee: 0.3, wine: 0.3, champagne: 0.3, whisky: 0.3, milk: 0.3, kask: 0.6, water: 0.2, // sips (water: the drinking glass, #382)
    washed: 0.3, scraped: 0.2, dishwasher: 3, rubbishOut: 3, // … a rubbish bag carried out to the drop-off (#387)
                // … and a dishwasher programme run to the end (#385)                            // a thing washed up by hand, a plate scraped into the bin (#383)
    fish: 0.5, fried: 2, chicken: 1, cooked: 8, brews: 2, // cooked = a whole chicken fried golden (burnt: a deduction, #288)
    fries: 0.2,                                           // per fry eaten (#301): a bunch is four
    cucumberSlices: 0.2,                                  // a slice of cucumber cut (#376)
    posted: 3, thrown: 0.5, drawn: 2,
    secrets: 1, stairs: 0.3, steps: 0.01,
    shatterRange: 1,                                      // something shot to pieces from afar: per range point (#263)
  },
  first: {
    doors: 2, lids: 1, flushes: 2, taps: 1, fridge: 2, appliances: 2, cabinets: 1, lights: 1, sat: 2, lay: 2,
    visited: 5, songs: 3, read: 5, car: 15, grill: 10, hood: 3, tv: 3, pc: 5, parasol: 3, clock: 3, calendar: 3,
    blinds: 2, // per window's blind, the first time it is drawn up or down (#273)
    curtains: 2, // Sovrum 1's curtains drawn (#342), like a blind
    coats: 10, greets: 2, // greets: per person (#247)
    catButts: 15, // a cat's bum seen from behind with its tail up (#262): per cat, then `again` per tail-up
    walkRain: 15, walkSnow: 25, walkHail: 40, walkStorm: 30, // out in the weather (#249): the first time, then `again` per shower
    shattered: 5, // per kind of thing shot to pieces (#263)
    pingpingHugs: 10, // hugging Pingping (#269)
    kittens: 300, // a kitten found (#363): the first one, then `again` per kitten (on top of its breed's points)
    miele: 1000, mieleHugs: 20, // Miele found (#328): the rarest find there is (4 × a sphynx), then `again` per find; a hug
    carMusic: 3, // per song played in the car (#268), like the speakers' songs
    airfried: 6, // a batch of fish fingers done in the air fryer (#287): the first time, then `again` per batch
    friesCooked: 8, // a basket of Aviko fries cooked golden (#301): the first time, then `again` per batch
    toaster: 5, // the toaster's lever pushed down, plugged in (#401): the first time, then `again` per toast
    clips: 2, // per kind of clip seen on Tilly's laptop (#283); no points for repeats (they come by themselves)
    fruit: 3, // a piece of fruit from the bowl eaten up (#326): per kind (apple, pear, orange, clementine, banana), then `again`
    nest: 4, // per smart speaker asked something (#325), then `again`
    flights: 25, // the first take-off with the jetpack (#359); no `again` (landing on each roof scores as `roofs`)
    liftFloors: 10, // per floor reached by lift (#415): the first ride, then each storey once; no `again`
    roofs: 20, // per roof stood on (#360): the loftgång, each terrace, Hus L's roof, the loft, a drum, Hus A / B / C, a canopy; no `again`
    toiletPaper: 3, // paper torn off a roll and flushed away (#426): the first time, then `again`
    handwash: 4, handdry: 2, // hands washed at a basin / dried on a towel afterwards (#437): the first time, then `again`
    sandwiches: 40, // a sandwich made and eaten (#380): the first of each combination ("ost- och gurkmackan" …), then `again`
    handBrew: 10, // the first pot brewed by hand: water and coffee filled first (#334); no `again` (each brew has `each.brews`)
  },
  again: {
    sandwiches: 4, // every sandwich after the first of its kind (#380)
    doors: 0.1, lids: 0.1, flushes: 0.2, taps: 0.1, fridge: 0.1, appliances: 0.1, cabinets: 0.05, lights: 0.05,
    sat: 0.1, lay: 0.1, songs: 0.2, read: 0.5, car: 1, grill: 1, hood: 0.2, tv: 0.2, pc: 0.3, parasol: 0.2,
    clock: 0.1, calendar: 0.1, greets: 0.1, catButts: 1, walkRain: 2, walkSnow: 3, walkHail: 4, walkStorm: 3,
    shattered: 0.3, carMusic: 0.2, pingpingHugs: 0.2, miele: 100, kittens: 120, mieleHugs: 0.5, blinds: 0.05, curtains: 0.05, airfried: 0.5, friesCooked: 0.5, toaster: 0.2,
    fruit: 0.3,
    nest: 0.2,
    toiletPaper: 0.1,
    handwash: 0.05, handdry: 0.05,
  },
  breeds: { huskatt: 10, siames: 30, 'brittiskt korthår': 30, 'maine coon': 35, 'norsk skogkatt': 40, perser: 100, sphynx: 250 },
  secrets: { kinds: 10, rare: 40 },
  // A small moral deduction (#288, stats.js `penalize`): points off for careless or unkind things — the fridge/freezer door
  // left open (`fridgeOpen` when its alarm starts, `fridgeLonger` for each further FRIDGE_ALARM.after s it beeps, at most
  // `fridgeMax` of those per time), food burnt (per item), the smoke alarm going off, a drink spilt (poured over a full
  // glass/cup), a cat shot / cut / hit (`catShot` by weapon, the rifle the most). Small next to what normal play gives
  // (a pat 8, a cat 10–250), big enough to notice. Never below 0: a deduction takes at most what the score has (no debt).
  // `fall`: hurt by falling more than FALL.hurt (#361)
  penalties: { fridgeOpen: 5, fridgeLonger: 2, fridgeMax: 3, burnt: 3, smokeAlarm: 5, spill: 2, fall: 10,
    catShot: { rifle: 20, saber: 10, dart: 5, wand: 3 }, kittenShot: { rifle: 30, saber: 15, dart: 8, wand: 5 } }, // a kitten: extra bad (#363)
};
// The fridge and freezer door alarm (#288, fridge.js): open for `after` s (game time) it beeps every `every` s and a red
// LED blinks on the door until it is shut (a real one waits ~1–2 min; ours 60 s). The freezer's timer stands still while
// the changelog note on its door is open (reading it counts as using it).
export const FRIDGE_ALARM = { after: 60, every: 2 };
// A cat that is shot, cut or hit (#288, cat.js `hurt`): it hisses and runs off (CAT_LEAVE, `speed` × as fast) and fades;
// no cat turns up behind a door for `away` s. Nothing graphic.
export const CAT_HURT = { speed: 2.2, away: 90 };
// Kittens (#363, cat.js): now and then a cat turning up (any breed and coat, never Miele) is a kitten, drawn with `chance`
// (~1 in 30 cats: rarer than an ordinary cat, more common than Miele's ~1 in 180; *guess*, to tune with the user). Built from
// the same parts as a grown cat (`shape`: × the breed's own factors): `size` of a grown one, a bigger head, eyes and ears, a
// shorter muzzle, shorter `legs`, a thin short tail (`tail` thickness, `tailLen`), fluffier. Up on the furniture `furniture`
// of the time (CAT_FURNITURE.chance for a grown cat). It plays on the spot every `every` [min, max] s: a pounce (a hop with
// the front paws up), chasing its tail (a turn round) or batting at something, each `play` s; after a pat it pounces at you
// `pounce` of the time and then scampers off `run` × as fast as a grown cat (hurt: that × CAT_HURT.speed too). A light thing
// standing on its floor within CAT_FISH.reach (a cup) catches its eye: it walks there, stops `stop` m short and bats it
// over (main.js: emptied, a splash, no deduction). Its name: one of `names`, or "Lilla" + a cat name (`lilla` of the time).
export const KITTEN = { chance: 1 / 30, furniture: 0.65, every: [3, 7], play: 1.3, pounce: 0.5, run: 1.6, stop: 0.12, look: 8,
  shape: { size: 0.5, head: 1.38, eyes: 1.45, ears: 1.3, muzzle: 0.6, legs: 0.72, tail: 0.55, tailLen: 0.7, fluff: 1.15 },
  lilla: 0.5, names: ['Pyttan', 'Smulis', 'Tussi', 'Lillsnorre', 'Knyttet', 'Pippi', 'Fjutten', 'Nusse', 'Mini', 'Bus', 'Pysen', 'Tofsen'] };
// Miele (#328, cat.js / src/miele.js): the family's own cat (the photo on the Sovrum 1 window board, #322) as a super-rare
// find. `weight` = her draw weight among BREEDS (whose weights add up to 100): ~1 in 180 cats (*guess*, the issue's
// 1 in 150–200); at most once until she has walked off. Seen within `see` m (on screen, no wall between) she counts:
// heart fireworks (`fireworks` shells that pop into `sparks` small hearts each over ~`life` s), SCORE.first.miele.
// E takes her into your arms like Pingping: `held` = where she sits (camera space, her feet), `tilt` back (rad), the
// hands round her sides at `grips` (her frame); a hug (click / "Krama") pulls her in `pull` m, squeezed by `squash`,
// over `hugTime` s. Put down she looks at you for `linger` s, then walks off. Coat colours read off docs/miele-foto-ram.jpg.
export const MIELE = { weight: 0.56, see: 7, fireworks: 7, sparks: 12, life: 3,
  held: { x: 0.0, y: -0.43, z: -0.5, tilt: -0.3 }, grips: [[0.095, 0.16, 0.02], [-0.095, 0.16, 0.02]],
  pull: 0.08, squash: 0.12, hugTime: 0.8, linger: 2,
  colors: { base: '#857461', light: '#a8977f', stripe: '#2a231e', white: 0xf3f1ec, ear: 0x6b5a48, tip: 0x241e1a, eye: 0xe0a62a } };
// The leaderboard: how many rows are shown, how often a changed score is sent (s).
export const LEADERBOARD = { show: 10, every: 30, nameMax: 20 };

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
  unstick: 2.0, // m/s: the glide out of a piece of furniture / the car you ended up inside (#314)
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
// Falling (#361, src/fall.js; player.js tracks `fall`: the highest feet since leaving the ground and the deepest free
// drop under them). A drop of more than `hurt` m hurts (the issue's 3 m): a thud + "aj", the view jolts down, red, then
// black, and the visitor wakes outside our front door (`wake`: 4 m north of the door at x ≈ 1.3 m, the walk test's way
// in; facing the house) — only the place is reset, not the home. Over `soft` m: a soft thud and a knee-bend. Only a
// real free fall counts: the gap under the feet must once have been more than `free` m (going down the stair the feet
// are at most ~two risers, 0.43 m, over a tread; the ramp 0). Timings in seconds; all our own choices.
export const FALL = { hurt: 3, soft: 1, free: 1, wake: { x: 1.3, z: -4.0, yawDeg: 180 },
  red: 0.3, black: 1.0, hold: 0.8, back: 1.2, text: 3.5, jolt: 0.9, dip: 0.3 };
// Up on the roofs (#360, src/roofs.js): outdoors, feet more than `aloft` m over the ground (over our flat: above its
// top, UNIT_TOP) = up there — the roofs' own walls collide instead of the ground's. Our choice (above every outdoor
// step, below the lowest canopy).
export const ROOFS = { aloft: 2.0 };
// The jetpack (#359, src/jetpack.js): our own unbranded model on a wall hook beside the garage door (terrain.garageDoor,
// z 41…47) — since #441 inside the garage — `hook` = its spot (x on the wall, z, the hook's height over the floor there).
// Worn on the back (hands free). Every number is a game choice, not a real jetpack's: `thrust` m/s² up while Space / ⬆ is
// held (gravity 9.8: about 60 % of the time to hover), `down` m/s² extra with C / Ctrl / ⬇, `climb` / `sink` m/s caps,
// `speed` m/s flying across, `accel` 1/s how fast it gets there (inertia), `ceiling` m (model y) and OUTDOOR's edge as the
// bounds; `heat` rises `up` per s of thrust, falls `cool` per s in the air and `ground` per s standing, `warn` beeps,
// at 1 the thrust cuts out until it is down to `resume` (a cut high up = a fall, fall.js).
export const JETPACK = {
  // #441: inside the garage on the entrance hall's west wall (GARAGE.rects entrance x0), between the north stalls and the
  // door's opening, facing east (`face`), `h` over the garage floor; the sign `over` m above the hook, `w` m wide
  hook: { x: -69.95, z: 40.45, h: 1.45, face: 1, floor: GARAGE.floor }, sign: { w: 0.9, over: 0.75 },
  thrust: 16, down: 9, climb: 6, sink: 12, speed: 9, accel: 2.2, ceiling: 40,
  heat: { up: 1 / 45, cool: 1 / 20, ground: 1 / 5, warn: 0.8, resume: 0.35 }, // (hovering just about holds; 45 s of steady thrust)
  drop: 0.55, // m in front of the feet where "Ta av jetpacken" stands it
};

// Two flights with winders between them (from the stair outline on both plans).
// Flight A runs east along the south half, winders turn 180° at the east end,
// flight B runs west along the north half and arrives in the upstairs hall.
// The total rise is not a stair number: it is LEVELS[1].floor − LEVELS[0].floor (stairs.js `stairRise`, #352), split in
// treads + 1 equal risers (3.25 / 16 ≈ 0.203 m today: a model calculation, not a measured or required riser).
// There is no stair drawing or section in the material we have (the plan PDF draws the stair schematically:
// "Fast inredning är schematiskt återgiven"). Waiting for one (all model values now):
//   - the tread split 4 + 8 + 3 and the winders' angles (equal 22.5° about `center`); do not change the count just
//     to get a more usual riser (#352);
//   - the going of each tread and the winder layout; the pivot `center` (taken from the Övre plan outline);
//   - the tread slab thickness under flight B and the winders (`treadSlab`), and that flight A is solid to the floor;
//   - the slab opening `hole` (= the Övre plan stair outline) and the slab zone itself (VERTICAL / SLAB, #344);
//   - flight A's width aZ (Entréplan outline z 6.758–7.552, the model 6.72–7.54).
// tools/stairtest.html checks the geometry: equal risers, no jump along the walking line, the top tread meets the
// upper floor, head room, the collisions, and the Klk under the stair (#338) clears the treads' undersides.
export const STAIR = {
  aX0: 3.50,                 // bottom step (Entréplan plan)
  aZ: [6.72, 7.54],
  center: [4.645, 6.654],    // winder pivot (Övre plan plan)
  winderX1: 5.49,
  winderZ: [5.77, 7.54],
  bX1: 3.86,                 // top step (Övre plan stair outline) = hole.x0: the last riser is the slab edge
  bZ: [5.77, 6.60],
  treads: { a: 4, w: 8, b: 3 }, // guess (no stair drawing)
  treadSlab: 0.25,           // thickness of each tread under flight B and the winders (guess; flight A is solid)
  // Upstairs slab opening = stair outline on Övre plan.
  hole: { x0: 3.86, x1: 5.49, z0: 5.77, z1: 7.54 },
  railHeight: 1.1, // bofakta: H 1,1 m
  newel: 0.08,     // newel post at the railing's corner and ends, square (guess, Peab 3D plan shows heavier posts)
  // Handrails along the flights (#419, stairs.js `handrailRuns` / `buildHandrails`; no handrail detail for L1007 exists,
  // so every number is a *guess*; Peab's render of L1209's stair, docs/peab/trappa-ledstang-render-l1209.png, shows a
  // slim plain rail following the pitch). White like the railing (COLORS.rail, the light render), one merged mesh with
  // the railing's material. `outer` = one continuous rail on the wall side: the living-room wall along flight A, the
  // east party wall round the winders, the north wall along flight B (the wall faces from plan.json; `from` / `to` =
  // where the bottom / top wall ends: the living-room doorway, the upstairs hall's corner — the 0.3 m extensions are
  // cut short there). The railing's top round the opening is 1.3 m+ over flight B's nosings and none stands by flight A,
  // so the inner side gets one per flight too (the issue's rule): `innerA` on the Klk wall, `innerB` on the balusters
  // between the newels. In a dwelling one side would do (BBR 8:232); the second side is our choice.
  handrail: {
    h: 0.9,      // over the nosings, vertically (usual Swedish practice, guess)
    r: 0.02,     // Ø 4 cm round rail (guess)
    gap: 0.05,   // clear gap rail → wall (guess)
    ext: 0.3,    // horizontal extension past the bottom / top nosing (guess), less where the wall ends
    smooth: 0.15, // ± m the pitch line is eased over (the winders' outer goings differ from the flights')
    bend: 0.06,  // ± m the plan corners and the returns to the wall are rounded over
    bracket: { every: 1.0, drop: 0.06, r: 0.006, rose: 0.028, roseT: 0.008 }, // brackets ~1 m apart (guess)
    outer: { south: 7.604, east: 5.551, north: 5.704, from: 3.252, to: 3.802 },
    innerA: { face: 6.704, from: 3.352, to: 4.671 },
  },
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
  splash: { w: 0.2, h: 0.1, color: 0xf6f6f4, grout: 0xc9cdcc, roughness: 0.82 }, // Stänkskydd vit matt 10×20,
  // halvt förband liggande, Kakelfog Sopro ljusgrå 16; roughness: a matt glaze (0.6 gave glare spots, #271)
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

// IKEA HAVBÄCK tall cabinet with a door, dark grey, 40 × 35 × 195 cm (#293, IKEA's photos in docs/havback-hogskap*.jpg):
// wall-hung in the Badrum on the shower's short wall (south), its left-hand corner (SE) seen facing that wall, back to the
// wall. `bottom` = above the floor (*guess* from the room photo); the door hinges on the side-wall side like the photo and
// stops at `max`° (beyond that the brass knob would meet the side wall); `shelves` = heights above the cabinet's bottom
// (grey | glass, *guess* from the open photo). Not upstairs: WC/dusch has 32 cm of north wall beside the shower and 32 cm
// clear east of it — too little for 40 × 35 (the user: only "if it fits").
export const HAVBACK = { w: 0.4, d: 0.35, h: 1.95, bottom: 0.22, color: 0x4a4a48, knob: 0xb48a4e, max: 83,
  shelves: [[0.42, 'grey'], [0.84, 'grey'], [1.23, 'grey'], [1.48, 'glass'], [1.7, 'glass']] };

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
// The toaster (#401, src/toaster.js): the family's OBH Nordica Piano Black (type 2674, docs/brodrost-obh-piano-black.jpg), a
// two-slice toaster kept standing in the bottom drawer of the drawer unit by the corner (the kitchen is cramped: not on the
// worktop). w × d × h *guess* (no measure found; an estimate from the photo, docs/brodrost-matt-gissning.jpg: ~28 × 17 × 18
// cm); `slot` = each slot's length × width (*guess*). `cord` = how far its cord reaches (*guess*; 0.9 → 1.0 in #442: the sockets moved up the wall): it plugs into the nearest
// free wall socket within it (KITCHEN_SOCKETS, #442; the air fryer and the Moccamaster keep theirs). The browning dial stands at
// `dial` (1–7); a toast takes `seconds.base + seconds.step × dial` s (game-paced, like the air fryer's run; our pick).
// `home` = its place in the drawer (drawer-local: in = metres back from the front, along = along the run); `held` = camera space.
export const TOASTER = { w: 0.28, d: 0.17, h: 0.18, slot: { l: 0.13, w: 0.032 }, cord: 1.0,
  dial: 4, seconds: { base: 6, step: 2 }, home: { in: 0.14, along: 0.1 }, held: { x: 0.19, y: -0.33, z: -0.62 } };

// The roast chicken in the fridge (#160): it smokes after `cookSeconds` in the pan on a lit zone, for `smokeSeconds`
// after it leaves the heat (or until it is back in the fridge with the door shut); `darken` = how much browner it
// gets at most; `inPanY` = its origin above the pan's (the pan's floor), `inPanScale` so it fits; `held` = camera space.
export const CHICKEN = { cookSeconds: 10, smokeSeconds: 60, darken: 0.35, inPanY: 0.0, inPanScale: 0.8, held: { x: 0.18, y: -0.3, z: -0.55 },
  // #194: raw it is pale beige-pink (skin, the darker parts), it turns the old golden brown as it fries; cooked, E breaks
  // off the legs and wings and then `bodyBites` pieces of the body, each eaten in `bites` bites; `piece` = in the view
  raw: [0xe9c7a6, 0xddb48f], bodyBites: 3, bites: 2, piece: { x: 0.15, y: -0.17, z: -0.36 } };
// The smoke alarm in the kitchen ceiling (#194, src/hood.js): it goes off after `delay` s of smoke that the cooker hood
// does not draw away (the hood draws what is within `hoodReach` m of its middle, below it). Position: mid-kitchen (ours).
export const SMOKE_ALARM = { x: 4.2, y: 3.0, z: 2.6, delay: 5, hoodReach: 0.6 };

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
  // #319: the east run's corner wall cabinet door hinges at the corner (handle on its north edge, opens to the right);
  // the stop in degrees, before its face meets the return row's corner handle (~3 cm from the corner, 2.4 cm proud)
  cornerDoorMax: 42,
  hoodBottom: 1.6,       // underside of the hood (Spiskåpa Tango) under the hob cabinet
  hoodHeight: 0.08,
  // the under-cabinet LED ("bänkbelysningen") and the hood's light (#221, #271): `pool` = the pool point light each
  // borrows, `out` m out from the wall (still under the wall cabinets / hood, so their fronts are not lit) and `y` m over
  // the worktop; weak, as it is close to the tiles (inverse square: 0.3 m away a strong one made blown-out spots); `wash` = the additive washes' opacity, `soft` = the metres at each end of a wash over which it fades out
  // (no hard edges where a run stops at the hood or a cabinet). Tuned on screenshots at 19:00 (the user's, #271)
  underLights: {
    // #285: one continuous strip `strip` m behind the cabinets' front edge; a weak pool light over the middle of each run
    // (two anchors: one light could not reach the sink), the even look from the washes; `spill` = how far the wash
    // reaches under the hood from a cabinet end, `endSoft` = the fade at the tall unit / freezer (tuned on screenshots, 20:00)
    bench: { pool: { intensity: 0.16, range: 2.5 }, out: 0.33, y: 0.45, wash: 0.45, strip: 0.05, spill: 0.12, endSoft: 0.06 },
    hood: { pool: { intensity: 0.25, range: 2.5 }, out: 0.3, y: 0.4, wash: 0.32 },
    soft: 0.18,
  },
  fridgeHeight: 1.86,    // Electrolux LRT7ME39X / LUS7ME28X: 186 cm
  grille: 0.06,          // ventilationsgaller rostfri (over fridge/freezer and microwave)
  sink: { w: 0.5, d: 0.4, depth: 0.19 }, // Diskho Intra Linea 5040, underlimmad; depth *guess* (typ. 18–20 cm, #122)
  hob: { w: 0.58, d: 0.52, t: 0.006, // Induktionshäll EH60KB6BF
    // its four zones (#158) as [a, b, r] on the glass (a 0 = front edge … 1 = back, b 0 = north … 1 = south, r in
    // fractions of the width); the first is the big front one that glows. A typical 4-zone layout (guess).
    zones: [[0.33, 0.3, 0.2], [0.33, 0.75, 0.15], [0.74, 0.3, 0.15], [0.74, 0.74, 0.17]] },
};

// Wall sockets on the kitchen splashback (#442, src/sockets.js; the user): white double sockets, the usual Swedish kind, at
// the top of the splashback just under the wall cabinets (centre `below` m under KITCHEN.wallBottom, *guess*), on the east
// wall's tiled face `wall` (x, read off the model) facing west: over the Moccamaster (its z), between the sink (z ≤ 2.31) and
// the hob (z ≥ 3.39) and in the corner behind the air fryer (5.478 = the south splashback's face; it replaced the
// "Hörnbox" power box on the worktop). Plate `plate` w (along the wall) × h × t (~15 × 8 cm, *guess*), two round cups `r`
// `pitch` apart; `taken` = which mouth (n = north, s = south) a fixed appliance's cord uses. Merged into the kitchen.
export const KITCHEN_SOCKETS = { wall: 5.545, below: 0.08, plate: { w: 0.15, h: 0.08, t: 0.007 }, r: 0.02, pitch: 0.074,
  color: 0xf3f3f0, at: [{ id: 'coffee', z: 1.4 }, { id: 'hob', z: 2.86 }, { id: 'corner', z: 5.478 - 0.13 }],
  taken: { 'coffee-s': 'kaffebryggaren', 'corner-s': 'airfryern' } };

// Sink bowls (#122, src/interior.js): the inset steel sink in Tvätt (40 × 26 cm as drawn, depth *guess*)
// and the basin in the bathroom vanities (Core Grip with a porcelain top, depth *guess*).
export const LAUNDRY_SINK = { w: 0.22, d: 0.36, depth: 0.15 };

// Wall cabinet over the Tvätt worktop (#138, the user: there is one, with white doors; Peab's redrawn plan does
// not show it). Over the whole run (machines + sink), white Arkitekt plus Frost doors like the base unit, three
// units; bottom 58 cm over the worktop, top 30 cm under the lowered ceiling (RH 2.5). Depth/heights *guess*.
// the wall cabinet covers the north `share` of the worktop: none over the sink (the user, #153)
export const LAUNDRY_CABINET = { depth: 0.35, y0: 1.49, y1: 2.2, units: 2, share: 2 / 3 };
export const VANITY_BASIN = { depth: 0.1 };

// What lies in the cabinets and drawers (#231, src/contents.js): living room, hall wardrobe, bathrooms, laundry.
// Sizes of the things from their real counterparts (a DVD case 135 × 190 × 14 mm, a blu-ray 128 × 148 × 12, a
// game case 135 × 170 × 14, the console the size of a PS5 slim lying down); the rest is a look, not measured.
export const CONTENTS = {
  byas: {
    film: { len: 0.19, h: 0.135, t: 0.014 }, bluray: { len: 0.148, h: 0.128, t: 0.012 }, game: { len: 0.17, h: 0.135, t: 0.014 },
    filmColours: [0x2f5d8a, 0xb8342f, 0xe0b23a, 0x2d2d2d, 0x4c8a4a, 0x7a4c9a, 0xf2f2ee, 0x1c1c1c, 0xd35400, 0x16a085],
    console: { w: 0.36, h: 0.085, d: 0.22 }, router: { w: 0.2, h: 0.04, d: 0.13, aerial: 0.1 },
  },
  besta: {
    album: { n: 8, t: 0.042, h: 0.33, d: 0.31, colours: [0xd8c8a8, 0x2c3e50, 0x7b241c, 0x1e5631, 0x5d6d7e, 0xb9770e] },
    napkins: { w: 0.17, h: 0.045, colours: [0xf4f1e8, 0xc0392b, 0x7fb3d5, 0xf7dc6f, 0xf4f1e8] },
  },
  // the hall wardrobe "G": coats on the rod from the left (len = from the shoulders down, w across, t thick), the
  // grown-ups' long ones first, the kids' short ones after (hem ≥ ~0.7 m: the cat fits under them)
  wardrobe: {
    coats: [
      { len: 0.95, w: 0.44, t: 0.08, colour: 0x2c3e50 }, { len: 0.9, w: 0.44, t: 0.07, colour: 0xa0785a },
      { len: 0.8, w: 0.46, t: 0.1, colour: 0x1c1c1c, hood: true }, { len: 0.75, w: 0.44, t: 0.09, colour: 0x556b2f, hood: true },
      { len: 0.85, w: 0.42, t: 0.07, colour: 0x7b241c }, { len: 0.62, w: 0.36, t: 0.08, colour: 0xe84393, kid: true, hood: true },
      { len: 0.6, w: 0.36, t: 0.08, colour: 0x2e86c1, kid: true, hood: true }, { len: 0.58, w: 0.34, t: 0.08, colour: 0xf1c40f, kid: true, hood: true },
      { len: 0.56, w: 0.34, t: 0.07, colour: 0x27ae60, kid: true }, { len: 0.52, w: 0.32, t: 0.08, colour: 0x8e44ad, kid: true, hood: true },
    ],
    // a slanted shoe rack along the back: heel rail height/depth from the back, the toes up at `tilt`°
    rack: { tilt: 70, heelY: 0.012, heelZ: 0.12, pitch: 0.19 },
    shoes: [[0x1c1c1c, false], [0x6e4b33, false], [0xe9e6df, false], [0xe84393, true]], // [colour, kids' size]
    boots: 0xf1c40f, // a pair of kids' rubber boots
  },
  towels: { w: 0.2, h: 0.04, d: 0.26, stack: 3, colours: [0xf4f4f2, 0x9fb7c8, 0xf4f4f2, 0xd5c4a1] }, // folded, in the vanity
};

// Changelog note (src/changelog.js) on the freezer door: its front is the plan's F cabinet
// z0 − 4 cm (the freestanding freezer sticks out, see interior.js). rotY π = facing north.
export const CHANGELOG_NOTE = { x: 4.38, y: 1.42, z: 4.8844 - 0.04 - 0.002, rotY: Math.PI, w: 0.16, tilt: -0.05,
  scrollLine: 40 }; // px per ↑ ↓ / W S step in the open note (#275)
// The TODO post-its on the fridge door (#340, src/todo.js): real 76 × 76 mm notes, `cols` × `rows` at most (the last
// says "+ N till …" when there are more; ~12 is the issue's guess), `gap` between them, tilted up to ±`tilt`°;
// `top` = the block's top over the door's foot, `fromHinge` = its hinge-side edge from the hinge (the handle side
// stays free); `ppm` = canvas px per metre; `maxChars` = a cleaned-up issue title's length.
export const TODO_NOTES = { size: 0.076, cols: 3, rows: 4, gap: 0.012, margin: 0.008, tilt: 6, top: 1.66, fromHinge: 0.1,
  ppm: 2600, maxChars: 40 };

// Baked ambient occlusion (src/ao.js): darkening at a wall = strength, falling off over
// `radius` metres. Tuned by eye on screenshots.
export const AO = {
  floor: { strength: 0.4, radius: 0.2 },
  ceiling: { strength: 0.3, radius: 0.3 },
};


// Moccamaster (Technivorm KBG, black) on the worktop between the tall unit (oven/microwave) and the
// sink, against the splashback (#59). Size ~32 × 17 × 36 cm (guess, after the KBG series). `z` = centre
// along the east run, `back` = x of its back. E brews for `brewSeconds`: red power light, sound,
// the jug fills.
// #334: brewing needs water in the tank (the jug filled at a tap, poured in) and coffee in the filter (scoops from the jar);
// `scoops` = a full pot (guess), `maxScoops` = what the filter holds.
export const MOCCAMASTER = { back: 5.53, z: 1.4, w: 0.32, d: 0.17, h: 0.36, brewSeconds: 18, scoops: 4, maxScoops: 6 };
// The coffee jar beside it (#334, docs/kaffeburk-sked-*.jpg, src/coffeejar.js): a square glass jar with rounded corners
// ~10 × 10 × 18 cm (guess), a bamboo lid, a beech scoop hanging in a glass loop on its side. `gap` = from the
// Moccamaster's side and from the splashback; `fill` = how high the ground coffee lies (of the height), `slant` = its tilt (m).
export const COFFEE_JAR = { w: 0.1, h: 0.18, r: 0.016, lid: 0.02, gap: 0.03, fill: 0.33, slant: 0.03,
  ground: 0x2a170c, bamboo: 0xd9bc8e, bambooEdge: 0xa7835a, beech: 0xdcc39a, stain: 0x7a5434,
  held: { x: 0.1, y: -0.12, z: -0.42 } };

// Wall shelves in the kitchen (src/shelves.js) where the cat board used to hang: the kitchen face of
// the hall/kitchen partition (x 2.15, z 0.46–1.76), above the light switch (1.05 m) and the framed print (#333). Two oak shelves
// 100 × 20 cm on black brackets (#38). Dressed like a Scandinavian kitchen shelf (#291): cookbooks, glass jars of dry
// goods, stoneware (a speckled jug, plates, a bowl, vases), a mortar, brass candlesticks, a cutting board, three framed
// prints; a face pot with wire glasses and faux baby eucalyptus (#343, it replaced a vase of dried eucalyptus) and a trailing pothos can be taken. Sizes are everyday-object guesses; `colors`
// are soft, muted glazes and materials (guess).
export const WALL_SHELVES = {
  x: 2.15, z0: 0.56, z1: 1.56, depth: 0.2, thick: 0.025, heights: [1.85, 2.25], // raised for the print under them (#333, guess)
  // the face pot on the lower shelf (#343, docs/kruka-ansikte-glasogon-eukalyptus-*.jpg): Ø 11.5 × 11 cm (*guess*), glasses
  // rings Ø 5.2 cm, the plant ~22 cm wide and ~15 cm over the rim (*guess*, measured on the photo against the pot)
  facePot: { z: 0.975, r: 0.0575, h: 0.11, ring: 0.026, branches: 50, spread: 0.1, back: 0.085, seed: 13 },
  colors: {
    oak: 0xd2b48c, bracket: 0x2a2a2a, black: 0x262524, pages: 0xf1ead9,
    books: [0x5d6448, 0xa9674c, 0xd8cbb0, 0x55657a], // olive, terracotta, oat, slate blue
    offwhite: 0xebe6da, sand: 0xcdb89a, sage: 0xa3ae96, clay: 0x9a7258, // stoneware glazes + the bare clay foot / rim
    stone: 0x8f8b84, stone2: 0x7d7973, brass: 0xc9a25a, tin: 0x5f7d78, wax: 0xf3ecdc, wax2: 0xe9dccb,
    pasta: 0xe3c47e, lentils: 0xb0573a, cork: 0xb89a72, olive: 0x6e7a55,
    // the face pot (#343): white gloss, black wire glasses, dots, the engraved smile; the faux eucalyptus' sage / grey-green
    // leaves with yellow-green new tips, its stems and the foam in the pot
    porcelain: 0xf6f4ef, wire: 0x1c1c1c, smile: 0x55514d, euLeaves: [0x6f8a6c, 0x7f9a7c, 0x8ea38d, 0x62795f], euTip: 0xa9bd74,
    euStem: 0x6f7f55, foam: 0x2b2a24,
    pothos: 0x4c7a2f, pothos2: 0x93a845, pothos3: 0x3e6a2a, vine: 0x5a7a3a, soil: 0x3b2c22,
  },
};

// Hall, the wall on the left as you come in (hall face of the hall/kitchen partition, x 2.057,
// z 0.465–1.765), src/keycabinet.js: the mirror IKEA LINDBYN black Ø 110 cm (ikea.com 904.392.18,
// #61; frame width and depth are guesses) and a Solstickan key cabinet (#36; Design House Stockholm,
// white metal, 16.9 × 16 × 5.5 cm per royaldesign.co.uk, hinged on the left) with a Renault Megane
// E-Tech key. The mirror has moved to the living room (#205): the wall behind the armchair on the right seen from
// the room, i.e. the north wall's west part (room face z 7.804, x 0.202–2.152, the living-room door east of it),
// centred on it (x 1.177), its middle 1.5 m up; rotY 0 = facing south (into the living room).
// The cabinet hangs on the narrow wall right of the entrance door (the user, #123): the façade's inner face
// z 0.465, x 1.812–2.057, at eye height above the light switch (x 1.95, y 1.05). rotY 0 = facing south (into
// the hall). Centred on that wall (#135: at x 1.97 the mirror's rim hid its edge), so it overlaps the door's
// 12 mm architrave by ~3 cm and hangs on a 13 mm spacer (z) clear of it.
export const HALL_WALL = {
  x: 2.057, rotY: -Math.PI / 2,
  mirror: { x: 1.177, z: 7.804, rotY: 0, y: 1.5, d: 1.1, frame: 0.018, depth: 0.03 },
  // where LINDBYN hung before #205, the hall wall on the left as you come in: IKEA NISSEDAL black 40 × 150 cm (#226,
  // replacing Rusta "Staffan", #218), a flat black frame ~2.5 cm wide and ~3 cm deep (guess), hung upright and centred
  // on the wall, bottom ~0.4 m / top ~1.9 m up (guess: a full-length mirror)
  tall: { x: 2.057, z: 1.115, rotY: -Math.PI / 2, y: 1.15, w: 0.4, h: 1.5, frame: 0.025, depth: 0.03 },
  // a second NISSEDAL in the upstairs hall (#332, the user): on the west wall (face x 1.5418) right of the WC/dusch door seen
  // from the hall, centred on the free stretch from the north wall stub's face (z 5.1345) to the door's 70 mm
  // architrave (door 6.2444 → 6.1744): z 5.654; the same height over the Övre plan floor as downstairs; facing east
  tallUp: { x: 1.5418, z: 5.654, rotY: Math.PI / 2, y: LEVELS[1].floor + 1.15, w: 0.4, h: 1.5, frame: 0.025, depth: 0.03, level: 1 },
  cabinet: { x: 1.935, z: 0.478, y: 1.5, rotY: 0, w: 0.169, h: 0.16, d: 0.055 },
};

// IKEA SKOGSGRÄNSEN decorative mirror, copper colour, Ø 50 cm (#265, docs/spegel-skogsgransen.png; ikea.com 505.380.79,
// design Anki Gneib, "a sunset over a horizon"): a tinted glass (pale pink at the top, warm peach at the horizon) on a
// copper-plated steel back, the lower `wave` of the diameter thin horizontal copper bars with the wall between them.
// Hung horizontally (bars at the bottom) on the living room's east wall (x 5.5), centred over the secretary
// (FURNITURE `secretary`, z 9.35); its centre `y` (*guess*: ~25 cm of wall over the secretary's top at 1.065 + its
// raised back edge), the copper rim `rim` round the glass and `depth` off the wall are *guesses*. rotY −π/2 = facing west.
export const SKOGSGRANSEN = {
  x: 5.5, z: 9.35, y: 1.58, rotY: -Math.PI / 2, d: 0.5, rim: 0.004, depth: 0.016, panel: 0.003,
  wave: 0.3, bars: 12, bar: 0.0035, copper: 0xc07a52,
  // the glass's tint, top → horizon (rgba over the mirror image), and the Reflector's own colour
  tint: [[0, 'rgba(250,228,226,0.30)'], [0.55, 'rgba(240,190,160,0.42)'], [1, 'rgba(222,140,96,0.62)']], reflect: 0xd6c2b6,
};

// A small yucca palm (Yucca elephantipes, #265) in a white pot on top of the secretary at its north end (on the left
// seen from the room), some leaves in front of the mirror's edge; a Thing you can take (things.js, kind 'plant').
// Pot, trunk and leaf sizes are *guesses* for a ~75 cm plant. x = along the secretary (local, + = south), z = from
// the wall. North: from the sofa (the usual view, from the south-west) it hides only the mirror's edge.
export const YUCCA = {
  x: -0.22, z: 0.11, pot: { r: 0.07, h: 0.13 }, potColor: 0xeeece6,
  trunks: [{ h: 0.36, r: 0.021, lean: [-0.04, 0.02] }, { h: 0.22, r: 0.017, lean: [0.035, 0.03] }],
  leaves: 34, leaf: [0.2, 0.32], width: 0.024, wallGap: 0.045, green: 0x2f5f2c, seed: 7,
};

// The framed photo of Miele, the family's cat (#322, docs/miele-foto-ram.jpg), on Sovrum 1's window board: a thin black
// frame in landscape, `w` × `h` outside with a `border` wide, `depth` deep moulding and no passe-partout (*guess*: an A5 /
// 13 × 18 frame), leaning back `lean` rad on a folding stand; the photo is textures/miele.jpg (cropped and straightened
// from the reference, the frame trimmed). A Thing (things.js, kind 'photo'): taken into the hand; click / "Titta på Miele"
// brings it up close (`look`: its place in the view, camera space) and back. #327: the photo re-exported brighter (gamma
// 0.75, +10 % exposure with a soft shoulder, a little more contrast and colour) and `glow` × daylight emissive (the room's
// lamp counts as `glowLamp` at night) — it faces the room with the window behind it, so it was in its own shadow.
export const PHOTO_FRAME = { w: 0.21, h: 0.16, border: 0.012, depth: 0.012, lean: 0.2, texture: 'textures/miele.jpg', glow: 0.22, glowLamp: 0.6,
  held: { pos: [0.15, -0.22, -0.45], rot: [0.3, -0.15, 0] }, look: { pos: [0, -0.02, -0.3], rot: [0.2, 0, 0] } };

// Sovrum 1's hook rail (#329, src/hooks.js): on the outside of the Klk facing the room door — the Klk's west wall (face
// x 3.80) in the alcove by the door, z 4.16 (its outer corner) … 5.01 (the door wall), the user. An oak board `w` long with `hooks` black
// single hooks, `y` = the board's centre (*guess*); a sage terry dressing gown (`gown`: `len` from the hook, the hem ~0.5 m
// over the floor) and a navy hoodie hung by its hood (`hoodie`) on hooks `on` (0 = north, the board faces west; the room switch by the door wall stays clear); the 3 others empty. No collision.
export const HOOKS = { w: 0.62, h: 0.075, y: 1.72, hooks: 5, board: 0xc9a77c,
  garments: [{ kind: 'gown', on: 1, len: 1.12, color: 0xbfc8b8, belt: 0.36, dz: 0.012 }, { kind: 'hoodie', on: 3, len: 0.68, hood: 0.27, color: 0x283247 }] };
// The kids' hook rails (#330, the same builder; a FURNITURE item's `set` picks one, merged over HOOKS): on the wardrobe's
// exposed end by the room door — the strips of wall between door and wardrobe are too narrow (~13 / 17 cm past the
// architrave and switch). Four hooks at kid height (`y`, *guess*), two left empty; kids' garments `scale`d down (*guess*).
// Sovrum 2 (Walter & Kian): a dark grey board, black hooks (the room's black lamps), a charcoal hoodie with a small red
// print and a navy cap with a white badge. Sovrum 3 (Livia & Tuva): a pale birch board, white hooks (its white lamps), a
// pink zip hoodie with a white zip and a lilac print, a cream tote with a rainbow.
export const KID_HOOKS = {
  sovrum2: { w: 0.5, y: 1.45, hooks: 4, board: 0x3a3b3e, hook: 0x141416,
    garments: [{ kind: 'hoodie', on: 3, len: 0.68, hood: 0.27, color: 0x484a50, print: 0xc0282c, scale: 0.85 },
      { kind: 'cap', on: 0, r: 0.085, color: 0x1d2a44, badge: 0xf2f2f2 }] },
  sovrum3: { w: 0.5, y: 1.45, hooks: 4, board: 0xdcc8a6, hook: 0xf4f3ef, hookMetal: 0.05,
    garments: [{ kind: 'hoodie', on: 3, len: 0.68, hood: 0.27, color: 0xeea6c4, zip: 0xffffff, print: 0x9b7bff, scale: 0.8 },
      { kind: 'tote', on: 0, w: 0.28, h: 0.3, handle: 0.2, color: 0xefe6d2, rainbow: [0xe0524f, 0xf2b33d, 0x5fb36a, 0x4f8fe0] }] },
};

// Towel hooks in both bathrooms (#424, src/hooks.js `towelhooks`, the user's marks in docs/handdukskrok-wc-uppe-markering.jpg
// and docs/handdukskrok-badrum-nere-pil.jpg): two round single hooks like docs/handdukar-krokar-referens.jpg (a round rose,
// a short pin with a flat end) but brushed steel (the user); sizes *guess* from the photo. `y` = the hooks over the floor
// (*guess*, 1.3–1.5 m in the issue), `gap` between them (*guess*). A dusty mauve / taupe terry hand towel on each by its
// loop (colour read off the photo, *guess*; ~30 × 50 cm, hung by the loop it falls ~0.48 m), a woven border band
// near the top and the hem. FURNITURE items 'towelhooks' (loose, no collision).
export const TOWEL_HOOKS = { y: 1.4, gap: 0.17,
  hook: { rose: 0.027, roseT: 0.007, pin: 0.008, len: 0.032, end: 0.011, endT: 0.006, color: 0xd0d3d5, metalness: 0.45, roughness: 0.38 },
  towel: { color: 0x96807d, band: 0xa08986, w: 0.17, len: 0.48 },
  towels: [{ seed: 1.1 }, { seed: 2.7, len: 0.5 }] };
// Washing the hands (#437, src/handwash.js): at a running basin tap with a free hand, "Tvätta händerna" rubs them under
// the stream for `wash` s; wet they show drops and a glossier skin and dry by themselves after `wetFor` s (the last
// `fade` s fading); E on a towel ("Torka händerna") takes `dry` s and swings it `swing` rad. A kitchen towel hangs on the
// oven's handle (`kitchenTowel`: linen with a blue band, ~20 × 42 cm, *guess*), `kitchenTowelAt` m along the handle from its
// middle (towards the worktop), so aiming at the oven door's middle still opens the oven. All our picks.
export const HANDWASH = { wash: 2.2, dry: 1.6, wetFor: 60, fade: 20, swing: 0.12, kitchenTowelAt: 0.14,
  kitchenTowel: { color: 0xe6dfd2, band: 0x4b6683, w: 0.2, len: 0.42, seed: 3.3, slant: 0.2 } };
// Toilet-paper holders (#426, src/toiletpaper.js): one beside each toilet, on the tank's wall in the toilet's own frame
// (x along the wall from the toilet's middle, z out of it, y up): the plate `side` m along the wall (the side with free
// wall in both bathrooms: towards the vanity downstairs, the shaft box upstairs), `y` up (*guess*, ~0.7 m in the issue),
// `wall` = the tiles; a post `arm` out, a rod `rod` long running `dir` (away from the toilet, clear of its tank) with the
// roll on it. Roll: `w` wide, radius `r` full → `core` (a standard roll ~10 × Ø 11 cm, *guess*), `sheets` sheets of
// `sheet` m (*guess*: a short roll); a `tail` hangs at rest, E pulls one sheet out (`pullTime` s) up to `hang` sheets;
// the wad in the hand: radius `wad` [1 sheet, `hang` sheets], `held` = camera space; flushed it swirls away in `swirl` s.
export const TOILET_PAPER = { side: 0.24, y: 0.7, wall: 0.006, arm: 0.075, rod: 0.13, dir: 1, plate: 0.025,
  roll: { w: 0.098, r: 0.055, core: 0.021 }, sheets: 120, sheet: 0.11, tail: 0.035, hang: 4, pullTime: 0.35,
  wad: [0.022, 0.04], held: [0.17, -0.2, -0.42], swirl: 1.6 };

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
// beside the cat board (north of it: on its right seen from the kitchen): a 30 × 45 cm paper calendar with a cat picture for each
// month and the days; E opens a strip to pick the month and the day, which set the day cycle's date.
// Its z is set below with the cat board's: the two are one group centred under the clock (#121, #225).
export const CALENDAR = { x: 2.152, y: 1.5, z: 0, w: 0.3, h: 0.45, rotY: Math.PI / 2 };

// Cork board with photos of petted cats (src/catboard.js), under the kitchen wall clock (WALL_CLOCK: Tvätt/Badrum
// wall, kitchen face x 2.152, z 3.145 to the Badrum door's architrave at 5.174, clock bottom 1.85 m). Real Polaroid
// 600 / i-Type size (#225): 8.8 × 10.7 cm, a 7.9 × 7.9 cm picture 0.45 cm from the top and sides, the wide bottom
// edge for the handwritten name + time. `cols` × `rows` photos with `gap` between them and `margin` round them;
// w / h (the cork, frame `frame` round it) are computed from those. `max` photos fit; a new one replaces the oldest
// that isn't kept (#170). `px` = canvas pixels per metre. The board's top lines up with the calendar's, `space`
// between them, and the group (calendar + board) is centred under the clock. rotY π/2 = facing east.
export const CAT_BOARD = (() => {
  const polaroid = { w: 0.088, h: 0.107, img: 0.079, side: 0.0045 }, cols = 5, rows = 2, gap = 0.015, margin = 0.02;
  const frame = 0.02, space = 0.08;
  const w = cols * polaroid.w + (cols - 1) * gap + 2 * margin, h = rows * polaroid.h + (rows - 1) * gap + 2 * margin;
  const group = CALENDAR.w + space + w + 2 * frame, z0 = WALL_CLOCK.z - group / 2; // the group's north end
  CALENDAR.z = z0 + CALENDAR.w / 2;
  return {
    x: 2.152, y: CALENDAR.y + CALENDAR.h / 2 - frame - h / 2, z: z0 + CALENDAR.w + space + frame + w / 2,
    w, h, frame, polaroid, cols, rows, gap, margin, rotY: Math.PI / 2, max: cols * rows, px: 4000, tilt: 2,
  };
})();

// Room lights (src/lights.js). Intensities are candela-ish (three.js physical lights), tuned by
// eye at night. `pool` = point lights shared by the nearest lit lamps (keep small: Iris 640).
export const LIGHTING = {
  pool: 4,
  switchHeight: 1.05,                     // centre of the switch above the floor
  ceiling: { intensity: 2.4, range: 6, color: 0xffe2b8 },
  spots: { intensity: 2.0, range: 4, color: 0xfff0dc },
  pendant: { intensity: 2.2, range: 5, color: 0xffd9a8 },
  floorLamp: { intensity: 1.6, range: 5, color: 0xffd59a },
  // Lit mirrors (#339, the user: their light and mirror images were too strong): the Badrum's Slot 50 LED, Tilly's
  // Hollywood mirror (VANITY) and the Klk's LED mirror (KLK). `shade` scales the LED / bulbs' emissive colour (they
  // stay a lamp of their own, at dusk too), `reflect` = their mirror image's brightness (×, the Reflector), `glass` = the
  // glints material on their glass (emissive, roughness: a softer hotspot from the pool light), `light` = the Badrum
  // LED's pool light (the shader wash follows it; VANITY.light / KLK.mirror.light for the others). By eye, ~50 %.
  mirror: { shade: 0.3, reflect: 0.85, glass: { emissive: 0x262626, roughness: 0.3 }, light: { intensity: 0.9, range: 3, color: 0xfff1de } },
  // Small lamps (#234: every lamp lights.js gets from world.lamps — floor/work/reading lamps, the SYMFONISK lamp, the
  // BESTÅ spots, the kitchen bench light, the bathroom mirror LED — except those whose spec says `auto: false`, the
  // cooker hood's light) switch themselves on below daylight `on` and off above `off` (hysteresis, like the patio's
  // string lights), fading over `fade` s. E still toggles one; that holds until the automatic state next changes.
  // The ceiling lamps (the room switches) are by hand only. Pool lights move between lamps fading out/in over
  // `poolFade` s; a lamp in the visitor's own room counts as `otherRoom` times nearer than one in another room, one in
  // line of sight `hidden` times nearer than one behind a wall (none for one behind a wall in another room), and a
  // lamp that has a pool light keeps it unless another is `stick` times nearer (no flicker on a doorstep). By eye.
  auto: { on: 0.3, off: 0.4, fade: 1 },
  poolFade: 0.4,
  poolPick: { otherRoom: 3, hidden: 6, stick: 1.5, behind: 1.6, near: 1.5 },
  // #276, #294, #295: every lamp's light wherever the visitor is (src/lampwash.js): each pool anchor of every small lamp
  // and ceiling lamp lights the flat in the lit materials' shaders as its pool light would, where it sees: its visibility
  // polygon (`rays` rays out to its range, stopped by walls, closed doors and the façades' outer faces, so through a
  // window to the glass). It cross-fades with the lamp's pool light, so a lit lamp looks the same from anywhere. A lamp
  // spec's `wash` scales it (default 1). The pool lights `behind` the visitor (and further than `near` m) count as that much further away.
  // `facade` = the inner faces of the north/south façade walls (data/plan.json, both levels): a lamp on a window board
  // casts its rays from just inside them.
  wash: { rays: 192, facade: [0.465, 12.234] },
  wetRooms: ['Badrum', 'WC/dusch'],       // spots in the soffit instead of a ceiling lamp
  pendants: [
    // over the dining table (SKANSNAS.table): the family's three copper pendants (#307, docs/kopparlampor-koksbord.jpg).
    // A copper dome canopy (Ø `canopy`) with two thin arms (`arm` m each) along the table's long axis (z), bent down
    // `bend` at their tips; three glossy copper drop shades (Ø `shadeR` × 2, `shadeH` tall + a `neck`) on black cords
    // from the centre and the arm tips, a frosted diffuser disc in each mouth. The shades' bottoms `bottoms` m above the
    // floor (outer, middle, outer: the middle one higher; the table top is at 0.75). All sizes are *guesses* from the
    // photo. It does not replace the room's ceiling dome (that one lights the worktops by the sink).
    { level: 0, room: 'Kök / matplats', x: 3.5, z: 1.41, style: 'copper3', drop: 0, // = SKANSNAS.table's centre
      canopy: 0.12, arm: 0.38, bend: 0.04, shadeR: 0.085, shadeH: 0.2, neck: 0.035, bottoms: [1.47, 1.6, 1.47],
      copper: 0xc8845e },
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
// Things on top of the MALM chests (the user): a small themed lamp and a pot plant you can take (#185, things.js).
// Sizes are our picks. `x` = across the top (local, +x = the chest's left seen from the front), `z` = front/back.
// Sovrum 2 (Star Wars, Darth Vader sheets): a Death Star lamp (Ø 15 cm globe, cool white) and a cactus in a black pot;
// Sovrum 3 (unicorn sheets): a lying unicorn night light (frosted white, pink glow) and a pink-flowering plant in a lilac pot.
// Each lamp is a lamp of its own (lights.js FloorLamp: E, and on with the dusk, #234); `light` = its pool light.
export const MALM_DECO = {
  vader: { lamp: { x: -0.2, z: -0.06, name: 'dödsstjärnan', r: 0.075, light: { intensity: 0.7, range: 3, color: 0xcfe0ff } },
    plant: { x: 0.24, z: -0.04, name: 'kaktusen' } },
  unicorn: { lamp: { x: 0.2, z: -0.05, name: 'enhörningslampan', light: { intensity: 0.7, range: 3, color: 0xffb8e2 } },
    plant: { x: -0.24, z: -0.04, name: 'blomkrukan' } },
};

// Philips Hue Go (2023, White and Color Ambiance; #409) on Sovrum 1's window board: Ø 14.2 cm, ~22 cm high (galaxus.nl
// retailer data; the charging base not counted). The split between the white body and the frosted diffuser (`split` of
// the height), the handle loop's height (`loop`), the base and the colours are *guesses* from product photos; no logo.
// `scenes` = what E on the handle loop steps through (our picks: warm white, soft pink, teal like the curtains, sunset
// orange); `light` = its pool light (by eye: a soft glow on the board, the reveal and the ceiling).
// JYSK "Hörnbord RANDERS" (#405, docs/sidobord-jysk-randers-*.jpg): JYSK gives Ø 47 cm, height 51 cm, 32 cm between
// the legs both ways, the tray 3 cm high flat-packed (`rim`); steel, powder-coated. Leg Ø 1.2 cm, the thin rails, the
// tray sheet, the rail square's drop under the tray, the cross's height and the caps are *guesses* from the photo. The
// legs stand straight (the photo), not splayed. Colour: dark purple instead of JYSK's black (the user), `color` our pick.
export const RANDERS = { d: 0.47, h: 0.51, rim: 0.03, legs: 0.32, leg: 0.012, thin: 0.004, sheet: 0.003, rail: 0.012,
  cross: 0.1, cap: 0.012, color: 0x3b2240, caps: 0x1c1418, rough: 0.5, metal: 0.25 };

// JYSK café set ABORG, mörk sand (#406, art. 3725144, docs/cafeset-jysk-aborg-*.jpg): the table 60 × 60 × 71 cm (JYSK);
// the turned-down edge, tube Ø and the bars are *guesses* from the photo. The chairs' sizes are not given: 42 × 48 × 80,
// seat 45 cm, a 40 cm deep seat of 7 slats, two 7.5 cm back slats (*guess*, a usual bistro chair). `color` read off the
// photo (a warm grey-taupe), matte powder coat.
export const ABORG = { color: 0x8f8a80, rough: 0.55, metal: 0.2, tube: 0.008,
  table: { w: 0.6, h: 0.71, edge: 0.02 },
  chair: { w: 0.42, d: 0.48, h: 0.8, seat: 0.45, seatD: 0.4, slats: 7, backSlats: [0.62, 0.72], backH: 0.075 } };

// The Philips Hue Go (#409, #428: the classic model, docs/hue-go-produktbild.jpg, src/huego.js): a frosted hemisphere
// lying on its curve, the flat face `tilt`° from straight up towards the room. Ø `d` across the face (*guess*, the classic
// Hue Go ~15 cm), a clear `rimW` rim, the flat `foot` (r, h, how far the sphere is `cut` by it) and the tilt read off the
// photo (*guess*). `scenes` = what "Byt färg" steps through (the box's warm white and rainbow colours, our picks).
export const HUE_GO = {
  d: 0.15, tilt: 45, rimW: 0.004, foot: { r: 0.026, h: 0.004, cut: 0.004 }, body: 0xf6f4f0, rim: 0xe4e6e8, name: 'Hue Go-lampan',
  light: { intensity: 0.7, range: 3, color: 0xffc98a },
  scenes: [{ name: 'varmvitt', color: 0xffc98a }, { name: 'rosa', color: 0xff9fc6 }, { name: 'lila', color: 0xb46cff },
    { name: 'blått', color: 0x4a7dff }, { name: 'turkos', color: 0x4fc3c8 }, { name: 'grönt', color: 0x5fdc6a },
    { name: 'solnedgång', color: 0xff7a35 }],
};

export const SYMFONISK = {
  speaker: { w: 0.15, d: 0.1, h: 0.31 },
  lamp: { baseR: 0.075, baseH: 0.2, stem: 0.04, shadeR: 0.1, shadeH: 0.16 },
  colors: { white: 0xe8e8e4, black: 0x1f2022 },
  // #418 (docs/symfonisk-bokhylla-staende.jpg): a standing speaker with `controls: 'front'` has a light grey fabric front
  // (`front` by colour), a white − ⏯ + strip `controls.w` × `h` with its centre `y` over the bottom and the IKEA tab
  // `tab` wide at the top of the front — read off the photo, *guess*
  front: { white: 0xcfcfca },
  controls: { w: 0.07, h: 0.017, y: 0.026, tab: 0.034 },
};

// Music in the SYMFONISK speakers (#187, src/sonos.js): generated in Web Audio, no files. `channels` = the "songs"
// (⏮ ⏭ step through them), volume in `steps` (start at `start`), `gain` at full volume. Through a wall a speaker
// is `wall` as loud, from the other floor `floor` (on top of the panner's distance fall-off).
// Real music (#416): a channel may list `tracks: [{ title, artist, files: ['music/x.ogg', 'music/x.mp3'] }]` — files in
// music/ with a licence that allows a public website, each one in music/CREDITS.md. They are fetched only when the
// channel plays (the first file this browser can play) and fall back to the generated music if they fail. None yet:
// the download sites are blocked from the cloud sessions, so the user adds them (the candidates are in #416).
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

// The ILVA Woodstock coffee table's shape (#410, furniture.js `coffeetable`, read off ILVA's product photo
// docs/soffbord-ilva-woodstock.jpg; only 120 × 60 × 47 is ILVA's, the rest is *guess*): `top` thickness, corner `radius`,
// how far the long sides `bulge` out past straight (the ends half that), the leg tops set in `legIn` [x, z] from the edges,
// `splay` [x, z] = how much further out the feet stand, `leg` = radius at the top / foot, a thin `apron` rail (height)
// between the leg tops, a shelf of `slats` round dowels Ø `slat` along the length, `shelfY` up, between two end rails.
export const COFFEE_TABLE = { top: 0.025, radius: 0.11, bulge: 0.012, legIn: [0.16, 0.1], splay: [0.06, 0.035], leg: [0.0175, 0.01],
  apron: 0.035, slats: 5, slat: 0.016, shelfY: 0.16 };

export const LANDSKRONA = {
  fabric: 0xa7b39a, // Gunnared ljusgrön
  oak: 0xc9a67a,
  height: 0.78, seatHeight: 0.44, seatDepth: 0.61, armHeight: 0.64, armWidth: 0.12,
  depth: 0.89, legHeight: 0.15,
  sofaWidth: 2.82, chaiseWidth: 0.9, chaiseDepth: 1.58,
  // the chaise's outer arm is the sofa's arm: it ends flush with the sofa's seat cushions, the chaise's
  // long cushion runs on past it (#279, the user)
  chaiseArmDepth: 0.89,
  chairWidth: 0.89,
};

// Decorative cushions and throws in the sofa and the armchair (#278, docs/fatolj-kuddar-filt.jpg; #313, the user's
// photo of what we really have, docs/vardagsrum-prydnadskuddar-filtar.jpg — dark, colours sampled brightened): four
// kinds of cushion — a leaf print on cream (grey-blue / sage, burgundy-plum, mustard-olive, black), a near-black bobble
// knit (raised knobs in a grid), a geometric patchwork (octagons and diamonds of triangles and squares, black to
// off-white) and a blush pink corduroy (wide soft vertical ribs) — and two ribbed fleece throws, plum and dark grey.
// Sizes are guesses: cushions 45 × 45 × 14 cm. Each cushion: `x` across the piece (local, + = the sitter's left),
// `z` from the front of the back cushion, `yaw` (rad, + turns its face towards −x), `lean` (rad back),
// `kind` = print | knit | geo | cord, `crumple` 0–1.
// The sit spots stay clear: no cushion within ~20 cm of a spot's x (furniture.js moves the sofa's three spots a little
// away from the arm so the corner cushion fits).
export const CUSHIONS = {
  size: 0.45, thick: 0.14,
  print: { ground: '#efe8da', colors: ['#7f97a0', '#93a597', '#5e1f33', '#7a2d45', '#c9c07a', '#a39b55', '#1e1c1c'] },
  knit: { cells: 12, color: 0x625650 },              // vertex tint = the grooves; the knobs come out ≈ #2e2824
  geo: { colors: ['#1d1d1f', '#4a4a4c', '#828284', '#b6b5b1', '#cfc2a8', '#efebe2'] },
  cord: { ribs: 9, color: 0xe8c3b8 },                // ribs across the cushion's width, vertex tint
  // along the back from the chaise (left seen from the room, as in the photo) to the arm: knit, geometric, cord, print
  sofa: [
    { x: -1.16, z: 0.1, yaw: 0.75, lean: 0.35, kind: 'knit', crumple: 0.6 },   // the chaise's corner
    { x: -0.57, z: 0.07, yaw: 0.12, lean: 0.4, kind: 'geo', crumple: 0.25 },   // where the chaise meets
    { x: 0.05, z: 0.08, yaw: -0.08, lean: 0.42, kind: 'cord', crumple: 0.45 }, // between the first two seats
    { x: 1.14, z: 0.1, yaw: -0.75, lean: 0.35, kind: 'print', crumple: 0.3 },  // in the corner by the arm
  ],
  // ribbed fleece throws (#313): soft ribs `rib` m apart with a slight sheen; `color` picks one of these
  fleece: { rib: 0.045, plum: 0x3a1a2a, grey: 0x4a4c4f },
  // the folded throw on the chaise's foot end: w × d (folded), `layers` thick, x/z of its centre (z from the front)
  sofaThrow: { w: 0.55, d: 0.4, layer: 0.025, layers: 3, x: -0.98, zFront: 0.42, yaw: 0.08, color: 'plum' },
  armchair: [
    { x: -0.19, z: 0.1, yaw: -0.65, lean: 0.35, kind: 'print', crumple: 0.35 },
    { x: 0.17, z: 0.08, yaw: 0.2, lean: 0.45, kind: 'knit', crumple: 0.8 },
  ],
  // the throw draped over the armchair's right arm (the sitter's; left seen from the front) and onto the seat
  chairThrow: { z0: -0.12, z1: 0.34, hang: 0.25, spill: 0.2, color: 'grey' },
  // the patio's outdoor fabrics (#399, our own): a coarse basket weave `cells` yarn pairs across, tinted per cushion;
  // the striped one has a charcoal `band` stripe on the weave
  weave: { cells: 16 }, stripe: { band: '#4b4d50' },
};

// Patio (src/patio.js). The lounge (Rusta Verona, #408) and the parasol (Ø 3 m, centre pole,
// ecru) are guesses. Seasons (months 1–12): the parasol is up in `parasolMonths` while the sun
// is up and folded otherwise; beers on the table in summer between `beerHours`; a snowman on
// the lawn beyond the hedge in winter.
export const PATIO = {
  frame: 0x3b3e41, // the parasol's pole and base
  // Rusta "Loungemodul Verona" (#408, docs/utesoffa-rusta-verona.jpg, the family's own: docs/utesoffa-verona-utan-dynor.jpg):
  // one module 68.5 × 66 × 67 cm (W × D × H, rusta.se); the rest *guess* from the photos: a square steel tube `tube`, the
  // seat frame's top `base`, seat cushions `seatT` thick, back cushions `backH` × `backT`, arm height `arm`, a divan
  // (backless, no arms) `divanL` long; dark brown-black steel `frame`, wide flat slats, beige / sand `cushion`. #429: the two
  // divans end to end make one long bench; its seats at `bench` (fractions of its length from the north end, our pick)
  verona: { W: 0.685, D: 0.66, H: 0.67, tube: 0.04, base: 0.3, seatT: 0.12, backH: 0.45, backT: 0.14, arm: 0.55, divanL: 1.3,
    bench: [0.17, 0.5, 0.83], frame: 0x2b2522, cushion: 0xd8ccb0 },
  // the small low table from the family's photo (#408): black steel frame, dark wooden slats; 60 × 45 × 40 cm *guess*
  slatTable: { w: 0.6, d: 0.45, h: 0.4, slats: 5, frame: 0x221f1d, wood: 0x3d3029 },
  parasol: { radius: 1.5, height: 2.45, color: 0xe8e1d1, months: [4, 5, 6, 7, 8, 9] },
  pot: { r: 0.3, h: 0.62, color: 0x55595c }, // fibre-clay planter Ø 60 cm (guess)
  beerMonths: [6, 7, 8], beerHours: [12, 23],
  // the cushion box (#400, src/patio.js `dynbox`, our own look): an anthracite slatted wood-look outdoor box, 125 × 58 × 60
  // cm (*guess*, a common size), the lid `lid` thick hinged at the back, opening `max`° (on its stays, short of the screen
  // wall behind it), walls `wall` thick, slats every `slat` m
  dynbox: { L: 1.25, D: 0.58, H: 0.6, lid: 0.035, wall: 0.025, slat: 0.07, max: 88, color: 0x3d4043 },
  // cosy outdoor cushions in the lounge sofa (#399, colours and places our pick; 45 × 45, the lumbar 50 × 30, *guess*),
  // since #408 on the Verona sofa, in its local frame: the back row along x centred on 0 (module centres ±0.3425,
  // ±1.0275; since #429 every module has its back), the back cushions' front at z −0.15, +z = south. `yaw` turns the face
  // (0 = +z, π/2 = +x), `lean` back. Out on the sofa in the parasol's months unless it
  // rains, else in the cushion box (Patio.update)
  cushions: [
    { x: 1.17, z: -0.06, yaw: -0.6, lean: 0.35, kind: 'weave', color: 0xc9952f, crumple: 0.45 },                  // ochre, in the corner by the east arm
    { x: 0.0, z: -0.07, yaw: 0.05, lean: 0.4, kind: 'stripe', color: 0xf2ede2, crumple: 0.3 },                     // off-white striped, between two seats
    { x: 0.685, z: -0.08, yaw: -0.05, lean: 0.3, kind: 'weave', color: 0x8ea488, size: 0.3, w: 0.5, crumple: 0.3 }, // a sage lumbar, between the next two
    { x: -0.48, z: -0.06, yaw: 0.45, lean: 0.4, kind: 'weave', color: 0xb35a3c, crumple: 0.35 },                   // terracotta, at the backs' west end
    // #429: standing on the long bench against the east screen wall (`wall`): `x` along the bench from its north end
    // (0…2.6, +z), `z` out from the bench's outer edge (the screen-wall side), `yaw` 0 = facing west (into the seat)
    { wall: true, x: 0.3, z: 0.12, yaw: 0.35, lean: 0.35, kind: 'stripe', color: 0xe7d8b8, crumple: 0.4 },          // sand striped, in the corner
    { wall: true, x: 0.95, z: 0.11, yaw: -0.05, lean: 0.3, kind: 'weave', color: 0x6f8a96, crumple: 0.35 },         // dusty blue
    { wall: true, x: 1.65, z: 0.1, yaw: 0.05, lean: 0.3, kind: 'weave', color: 0x8ea488, size: 0.3, w: 0.5, crumple: 0.3 }, // a sage lumbar
    { wall: true, x: 2.3, z: 0.11, yaw: -0.3, lean: 0.35, kind: 'weave', color: 0xc9952f, crumple: 0.45 },          // ochre, at the south end
  ],
  // the snowman stands just beyond the gap in the hedge, in view from the patio door and the sofa (#73)
  snowman: { x: 1.4, z: 18.4, months: [12, 1, 2] },
  // paving (#53): 40 × 40 cm light grey concrete slabs, rows in half bond, darker 8 mm joints (our pick);
  // also on the neighbours' patios
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
// The Sovrum 1 double bed's centre line (z): 2.3 until #403, when the user moved it 0.25 m south towards the Klk so the
// RÅGRUND chair could leave the curtain's corner (CURTAINS). Its bedside tables, work lamps, the picture over it, the TV
// across from it and the rug under it follow. Frame z 1.60–3.50: 0.66 m of floor left before the Klk wall (z 4.16).
export const BED1_Z = 2.55;

// Pillows (#308, src/bedding.js `pillow`): `head` = the ordinary pillow in its case (~50 × 60, the chintz set's case,
// 60 across the bed), `hotel` = Hemtex "Hotellkudde" 70 × 100 in a white case (docs/hotellkudde-70x100.jpg), one under
// each head pillow in the Sovrum 1 bed, 100 across, its head end at the headboard. `h` = height in the middle (*guess*:
// a soft hotel pillow ~16 cm, a head pillow ~12 cm), `dent` = the hollow where a head has been.
export const PILLOWS = {
  head: { w: 0.6, d: 0.5, h: 0.12, dent: 0.025 },
  hotel: { w: 1.0, d: 0.7, h: 0.16 },
};

// Bedding in every bed (#309, src/bedding.js `duvet`): duvets `th` thick (*guess*: a soft all-year duvet in its cover
// ~7–8 cm), hanging `drop` over the mattress sides (Sovrum 1: down to the IDANÄS frame's edge; the bunks: to the side
// rails), turned back `fold` m at the head end; `bump` = the low unevenness on top. The mattresses get rounded edges
// (`mattressR`) in a pale ticking (`ticking`) with a fitted sheet (`sheet` colour per set) over the top `sheetH` of it.
// Tilly's bedspread is quilted in channels `quilt` m apart. The bunks' pillows are 50 × 60 (`bunkPillow`).
export const BEDDING = {
  ticking: 0xe4e2db, mattressR: 0.045, sheetH: 0.75,
  sheets: { chintz: 0xf3f1ea, vader: 0x2b2e35, unicorn: 0xf6e9f1, plain: 0xf1f0ea },
  double: { th: 0.08, drop: 0.11, fold: 0.3 },
  bunk: { th: 0.07, drop: 0.075, fold: 0.26 },
  bunkPillow: { w: 0.6, d: 0.45, h: 0.12 },
  spread: { th: 0.035, drop: 0.16, quilt: 0.16 },
};

// IKEA NYMÅNE wall/reading lamp, GU10 (#219, docs/nymane-vagglampa-vit.png): a wall plate with a round switch,
// a short round arm and a cylinder shade pointing down and out, a fabric cord hanging from the plate. All sizes are
// guesses from the product photo. One per bunk berth, on the side wall by the head end (`fromHead` along the bed),
// the plate centre `aboveMattress` over the berth's mattress top, reachable lying there (REST.reach.lie 0.8 m).
// `berths`: the side wall's x, the head end's z, which way along z the bed runs (+1 / −1), rot = the way the lamp faces.
// The bunks (#227, docs/vaningssang-mydal-vit.png): IKEA MYDAL, white lacquered pine, for 90 × 200 mattresses,
// 97 × 207 × 157 cm (ikea.com); posts 5.5 cm; the bed bases' tops at `base` (~85 cm free between them, guess),
// mattresses `mattress` thick; a guard rail of two boards round the top bunk (open by the ladder), two boards in
// each end at both bunks, a straight three-rung ladder on the room side by the foot end
export const MYDAL = { W: 0.97, L: 2.07, H: 1.57, post: 0.055, base: [0.2, 1.1], mattress: 0.12, board: 0.09 };

// Tilly's daybed (#280, docs/hemnes-dagbadd-vit.jpg): IKEA HEMNES dagbädd m 3 lådor/2 madrasser, vit, 80 × 200,
// 207 × 89 × 83 cm (ikea.com). White frame, the back and the ends vertical beadboard (`groove` m apart) in a flat frame
// with a top rail, the ends' cap overhanging a little; an arched apron under the top mattress, the second mattress in the
// pull-out behind it, three drawers with round dark grey knobs (Ø `knob`). Heights of the parts are *guesses* from the
// photo: drawer fronts `drawer` [bottom, height], the pull-out mattress `pullout` [bottom, top], the apron `apron`
// [bottom at the ends, bottom in the middle, top], the top mattress (ÅFJÄLL, quilted with `channels` channels across)
// `mattress` [bottom, top]. Bedding (the user: less pink, a cool 15-year-old): a charcoal bedspread with lilac
// lightning bolts and white stars over the foot end, black / holographic lilac / graphic cushions, a faux-fur one and
// a small muted pink one (our picks).
export const HEMNES_DAYBED = {
  W: 2.07, D: 0.89, H: 0.83, groove: 0.04, knob: 0.03,
  drawer: [0.05, 0.22], pullout: [0.29, 0.345], apron: [0.335, 0.375, 0.42], mattress: [0.42, 0.56], channels: 10,
  colors: { frame: 0xf3f2ee, mattress: 0xf6f6f3, knob: 0x55585c, spread: '#202127', bolt: '#b79cff', star: '#f4f1ff',
    black: 0x18181b, fur: 0xe8e2d8, pink: 0xc7949f },
};

// Tilly's wardrobe (#305, #311, docs/smastad-platsa-garderob.jpg): IKEA SMÅSTAD / PLATSA, the two-door 80 × 57 × 181 cm
// (*guess*, the series also comes 120 wide: its 60 cm doors would reach too far into the room), white carcass and — the
// user's wish — white doors (not the photo's blue), in the NW corner of the north wall (its west side against the west
// wall). French doors (#311): the left one (seen from the front) hinged on the left edge, opening to the left, the right
// one on the right edge, opening to the right, a knob on each by the middle joint. `max` = [left, right] degrees: the
// left stops at 85° so its knob stays clear of the west wall (the door lies almost along it). Inside, as in the photo, a
// shelf near the top, the clothes rail under it, a long hanging space, a shelf low down and a wire basket per door at the
// bottom (heights are guesses from the photo); each door's half has its own contents, drawn only while that door is
// open. Her clothes (from the MULIG rack it replaced, #281) on hangers (stuff.js `garment`, `size`: their sleeves must
// stay inside the 55 cm carcass): an oversized black hoodie, an olive bomber, a plaid-red skirt, cargo pants, a black
// band tee, a denim jacket, a lilac shirt, a neon green tee; folded sweaters and a cap on the top shelf, sneakers on the
// low shelf and in a basket with the tote bag, socks in the other basket (our picks).
export const SMASTAD = {
  W: 0.8, D: 0.57, H: 1.81, t: 0.018, door: 0.018, plinth: 0.06, topShelf: 1.55, rail: 1.49, lowShelf: 0.44,
  baskets: [[0.08, 0.15], [0.255, 0.15]], max: [85, 95], color: 0xf4f4f1, wire: 0xd9dadb, size: 0.75,
  clothes: [['jacket', 0x18181b], ['jacket', 0x4b5440], ['skirt', 0x7a2633], ['trousers', 0x6b6b4e],
    ['tee', 0x111111], ['jacket', 0x4a6fa5], ['shirt', 0xb79cff], ['tee', 0xa3e635]],
  sweaters: [0x2a2a30, 0xb79cff, 0xe9e4da, 0x6f7f96], cap: 0x18181b,
  shoes: [0xf2f0ec, 0x18181b, 0xb79cff], socks: [0xf2f0ec, 0x18181b, 0xb79cff, 0xa3e635], tote: { size: [0.28, 0.32, 0.08], color: 0xe6dcc4 },
};

// Tilly's K-pop posters (#280, the user): invented groups only — no real idols' names, faces, photos or logos. Each is
// drawn on one canvas atlas (src/furniture.js `kposterTexture`), taped to the wall (A2 42 × 59.4, A3 29.7 × 42 cm).
// `wall`: 'west' (face x 0.202) or 'north' (face z 7.804) of Sovrum 4; `at` = z (west) or x (north) of the centre,
// `y` = centre height over the floor. Over the daybed around the basketball holder (DAYBED_Z, y 1.5), north of it and on the
// north wall east of the wardrobe (#311); not on the east wall (the vanity, #282) or the window wall. None may be covered
// by the wardrobe or swept by its open doors (#311, the user: move posters, never cover them; opentest checks it).
export const KPOP_POSTERS = [
  { art: 'nova', size: 'A2', wall: 'west', at: DAYBED_Z - 0.73, y: 1.58 }, // round the holder over the daybed (#312)
  { art: 'moon', size: 'A2', wall: 'west', at: DAYBED_Z + 0.73, y: 1.58 },
  { art: 'bloom', size: 'A3', wall: 'west', at: DAYBED_Z, y: 2.08 },
  { art: 'lumi', size: 'A2', wall: 'north', at: 1.3, y: 1.6 },     // east of the wardrobe, short of the switch (#311)
  { art: 'starlyt', size: 'A2', wall: 'west', at: 9.5, y: 1.58 }, // between the wardrobe's open left door (#311) and nova
];

// Långlampan (#270, docs/langlampan.jpg): a tall slim tube of coarse natural linen with a spiral wire frame and several
// bulbs inside, standing in the living room's NE corner right of the TV (FURNITURE `tubelamp`). The user: it stands on a
// round foot with a ~20 cm stem, the shade starting ~0.2 m above the floor. Shade Ø, height, the wire's pitch, the foot
// and the bulb heights are *guesses* from the photo (about 6–7 × its diameter). Lit it is a cosy, dimmed glow: weaker than
// the NYMÅNE floor lamp (`light`), with soft warm washes on the two corner walls (`wash`: size, centre height, opacity; a look).
export const LANGLAMPA = {
  r: 0.125, h: 1.6, bottom: 0.2, foot: { r: 0.125, h: 0.015 }, stem: 0.01, rim: 0.012, pitch: 0.25,
  bulbs: [0.3, 0.55, 0.8],                   // bulb heights as fractions of the shade (three visible in the photo)
  linen: 0xc9b48a, glow: 0xffcf7a, wire: 0x3a3226, metal: 0x2a2a2c,
  wash: { w: 1.1, h: 2.3, y: 1.15, opacity: 0.32 },
  light: { intensity: 0.8, range: 3.5, color: 0xffc77a },
};

// JYSK DANI floor lamp (#411, docs/golvlampa-jysk-dani-produkt.jpg + golvlampa-jysk-dani.jpg; FURNITURE `dani`): JYSK gives
// Ø 33 × H 54 cm, bamboo / eucalyptus / rattan, E27 max 40 W. The rest is *guess* from the photos: three light wooden legs
// (`legH` of the height, splayed out to `legR`), an upright teardrop cage of `rods` round rattan rods following `profile`
// ([fraction of the cage height, radius] from the bottom ring to the top), a wrapped collar `collar` high at the top, thin
// rings at `rings` (fractions), and a white fabric cylinder inside (`inner`: radius, bottom and top as fractions). Lit it
// is warm and dim (40 W): `light` (the pool light), a striped pool on the floor round it and a soft spot on the ceiling.
export const DANI = {
  h: 0.54, legH: 0.16, legR: 0.15, leg: [0.011, 0.007], rods: 30, rod: 0.005,
  profile: [[0, 0.085], [0.08, 0.13], [0.2, 0.157], [0.33, 0.165], [0.5, 0.158], [0.7, 0.135], [0.88, 0.105], [1, 0.092]],
  collar: 0.045, rings: [0.06, 0.33, 0.66], inner: { r: 0.08, y0: 0.05, y1: 0.68 },
  rattan: 0xb48a58, wood: 0xcfa678, fabric: 0xf3efe6, glow: 0xffc27a,
  floorWash: { r: 0.6, opacity: 0.3 }, ceilingSpot: { r: 0.4, opacity: 0.22 },
  light: { intensity: 0.55, range: 3.2, color: 0xffbf78 },
};

// Livia's pineapple mirror (#412, docs/spegel-ananas-livia.jpg; src/pineapple.js). No sizes given: read off the photo with a
// hand for scale (*guess*): the oval frame `oval` (half-widths x, y) ~34 × 43 cm, the glass ~19 × 29 (`glass`), `depth` 2.2 cm,
// the crown's collar (w, h) and `leaf.n` leaves fanning `spread` rad each side, the middle one `l` long → ~62 cm in all.
// Colour read off the photo (matte mustard yellow); `scale` = one bump tile (2 scales × 2 rows, m), `bump` = its strength.
export const PINEAPPLE_MIRROR = {
  oval: [0.17, 0.215], glass: [0.095, 0.145], depth: 0.022, collar: [0.085, 0.035],
  leaf: { n: 9, l: 0.18, w: 0.056, spread: 1.15 }, color: 0xe8b52a, scale: [0.075, 0.066], bump: 3,
};

export const NYMANE_WALL = {
  plate: { w: 0.06, h: 0.11, d: 0.025 }, button: 0.012, arm: 0.07, shade: { r: 0.035, h: 0.08, tilt: 0.6 }, cord: 0.45,
  fromHead: 0.42, aboveMattress: 0.42, mattress: MYDAL.base.map((b) => b + MYDAL.mattress), // the bunks' mattress tops (#227)
  colors: { white: 0xf2f2ef, black: 0x1c1c1e }, cordColors: { white: 0xe8e6e0, black: 0x222224 },
  light: { intensity: 0.9, range: 3.5, color: 0xffd59a }, // weaker than the floor lamp: one GU10 bulb
  berths: [
    { room: 'Sovrum 3', color: 'white', x: 0.2, head: 0.47 + 0.05, dir: 1, rot: -90 },   // Livia & Tuva, west wall
    { room: 'Sovrum 2', color: 'black', x: 5.55, head: 12.23 - 0.05, dir: -1, rot: 90 }, // Walter & Kian, east wall
  ],
};

// Tilly's vanity (#282, the user): an IKEA ALEX desk, white, 100 × 48 × 76 cm (ikea.com; a column of five drawers at
// one end, two legs at the other — drawer heights are guesses) against Sovrum 4's east wall (face x 2.632) south of the
// door's swing, with make-up on it; a Hollywood mirror over it (glass 60 × 80 cm, thin white frame, globe LED bulbs
// all round — size, bulb count and height are guesses) that is a lamp of its own (E on it; at dusk like the other small
// lamps, #234), a mirror image (#50); a small round lilac velvet stool in front (a seat; 40 cm high, Ø 36, guess).
export const VANITY = {
  w: 1.0, d: 0.48, h: 0.76, drawers: { w: 0.36, n: 5 },
  mirror: { w: 0.6, h: 0.8, frame: 0.018, depth: 0.03, bottom: 0.1, bulb: 0.026, top: 3, side: 4, bottomRow: 3 },
  light: { intensity: 0.5, range: 2.5, color: 0xffe6c4 }, // its pool light, a little whiter than the shaded lamps; halved (#339)
  stool: { r: 0.18, h: 0.42, color: 0xc7a6e0 },
};

// Tilly's laptop on the vanity (#283, src/laptop.js): a thin unbranded rose-gold laptop, 30 × 21 cm, lid open ~110°,
// two stickers on the lid. E on the screen: on, then the next clip; E on the keyboard: on / off. On, it shows an invented
// short-video app ("Klipp": no real brand, no real people) — a phone-shaped column of canvas-drawn clips that swipes up
// to the next one every `swipe` s (the slide takes `slide` s), redrawn at `fps`; each clip has a quiet beat (`bpm`,
// sfx.beat at `gain`) and the house speakers are turned down to `duck` while it plays within `near` m. Sizes are guesses.
export const LAPTOP = { w: 0.3, d: 0.21, base: 0.014, lid: 0.006, open: 110, px: [400, 250], fps: 12, swipe: 7, slide: 0.45,
  gain: 0.1, duck: 0.6, near: 3.5 };

// Smart speakers (#325, src/nest.js): a smart display with a screen on the kitchen window board and two round speakers in
// wall mounts (living room by the patio door, the upstairs hall). Our own plain look: no logo, no wordmark. Sizes after
// the 2nd-gen display (screen 17.8 × 11.8 cm) and the round mini speaker (Ø 9.8 × 4.2 cm) — *guess*; chalk fabric.
// E on one: four white dots wake (the display lights up), a chime, then a made-up answer in Swedish (Web Speech sv-SE,
// silent when muted; a bubble over it, a caption card on the display). The house speakers are ducked to `duck` while one
// talks within `near` m. Display idle: a clock + the weather, now and then Miele's photo (`photoEvery` / `photoFor` s);
// dimmed by night to `night`. `talk`: how long a caption stays (`min` s, + `perChar` s a character); `chime` s before it talks.
export const NEST = {
  fabric: 0xd6d3cd, shell: 0xecebe7, dots: 0xffffff,
  hub: { w: 0.178, h: 0.118, d: 0.009, screen: [0.152, 0.088], lean: 14, lift: 0.03, base: { w: 0.168, d: 0.07, h: 0.06 }, px: [480, 280] },
  mini: { r: 0.049, h: 0.042, mount: 0.008 },
  chime: 0.7, talk: { min: 2.5, perChar: 0.06 }, duck: 0.45, near: 6,
  photoEvery: 40, photoFor: 10, night: 0.35, photo: 'textures/miele.jpg',
};

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
  // a JYSK RANDERS tray table (#405) in the side table's place by the armchair, turned so local = world axes: the flower
  // towards the NW (wall / armchair side), the book (BOOK) on the room side of the tray
  { type: 'randerstable', level: 0, x: 1.52, z: 8.12, rot: 180, flower: true, flowerAt: [-0.09, -0.09] },
  // The ABORG café set (#406, #422) outside our front, in front of the kitchen window (x 3.05–4.66; the front door x 0.80–1.81
  // swings out to z −0.92): the table centred on the window, 3 cm off the façade (its top 0.71 is under the 0.8 sill, so the
  // top-hung sash swings out over it), a little pot plant on its street half, out of the sash's sweep (its 0.96 m top lies ~1.29 m from the sash hinge, the sash is 1.26 m, #422). The chairs
  // either side of it, both facing straight out to the street (rot 0 = −z: furniture.js turns a piece by rot + 180°),
  // parallel, backs to the house, 3 cm off the façade like the table. Clear of the car's stop (x 0.8–5.0, z −6.3…−4.5, CAR) and the green strip (z ≤ −2.9).
  { type: 'aborgtable', level: 0, x: 3.85, z: -0.33, rot: 0, flower: true, flowerAt: [0.12, 0.2] }, // flowerAt local: +z = the street side
  { type: 'aborgchair', level: 0, x: 3.28, z: -0.27, rot: 0 },
  { type: 'aborgchair', level: 0, x: 4.42, z: -0.27, rot: 0 },
  // IKEA BESTÅ display combination with glass doors, white / Lappviken walnut effect, 120 × 42 × 193 cm (#104, ikea.com
  // s79612224): two columns, three 64 cm sections each (walnut door, glass door, walnut door). Wall-hung on the west
  // wall (x 0.202) between the armchair/floor lamp (z < 9.1) and the palm (z > 11.5), 35 cm above the floor (the user:
  // floating; tunable). Section heights, handle colour and the spots' positions are *guesses*.
  { type: 'besta', level: 0, room: 'Vardagsrum', x: 0.202, z: 10.55, y: 0.35, rot: -90, w: 1.2, d: 0.42, h: 1.93,
    sections: [0.64, 0.65], walnut: 0x6e4b33, handle: 0x1e1e20, spots: [-0.4, 0, 0.4], openDeg: 100,
    // the spots on top shine down over the front (#191): a soft wash `w` × `h` down the doors, and the glass section
    // is lit inside (a LED strip under its top, a warm glow on its back wall) — a look, not measured
    wash: { w: 0.5, h: 1.0, opacity: 0.35 }, inside: 0.5,
    light: { intensity: 0.8, range: 3 } }, // its pool light when the spots are on (#234; a look)
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
  // The black and white canvas at the foot of the stair (#286, docs/tavla-svartvit-trappan.jpg): coming down flight A
  // (going west) it is straight ahead, on the passage face of Badrum's east wall (x 2.152). Square, unframed, the canvas
  // wrapped round a ~3.5 cm stretcher with black edges; ~80 × 80 cm (*guess*, 70–90 from the user's photo against a 27"
  // monitor). Centred on the free wall between the Badrum door and the living room (#300, the user): from the door's
  // architrave (jamb z 6.1543 + DOOR_TRIM.width 0.07 = 6.2243) to the corner at the living room's north wall (z 7.8042,
  // plan.json) → z 7.014; centre 1.55 m up (*guess*). textures/tavla-svartvit-trappan.jpg = the photo straightened, the
  // ring light in front of it painted out, the black taken down to ~#1c.
  { type: 'pictures', level: 0, x: 2.152, z: 7.014, y: 1.55, rot: -90, w: 0.8, h: 0.8, gap: 0, frame: 0, depth: 0.035,
    rough: 0.85, cols: 1, rows: 1, atlas: 'textures/tavla-svartvit-trappan.jpg', grid: [1, 1], order: [0] },
  // Four framed pictures in the upstairs stairwell (#220, #233, the user's photos docs/tavla-trappa-*.jpg): the east
  // party wall (inner face x 5.551) across the stair hole, seen face on from the upstairs hall and when turning on
  // the winders; centred on that wall between the hole's side walls (z 5.704–7.604 → 6.654), centre 1.57 m over the
  // Övre plan floor. Each picture is 30 × 40 cm (the user); with a ~3 cm passe-partout and a 2 cm black frame that is
  // 40 × 50 cm outside (*guess* from the photos; the watercolour runs to the frame on white paper, same size), 2 × 2
  // with a 7 cm gap. The atlas (textures/stair-pictures.jpg, cropped and straightened from the photos, 720 × 920 px
  // per frame inside) holds fikus, akvarell | peace, solros; `order` = which atlas cell hangs in each slot, top left
  // → bottom right.
  // The framed print "THIS KITCHEN IS FOR DANCING" (#333, docs/tavla-kitchen-is-for-dancing.jpg), 40 × 50 cm, a thin black
  // frame, no passe-partout, under the kitchen wall shelves (WALL_SHELVES, x 2.15, z 0.56–1.56) on the kitchen face of the
  // hall/kitchen partition, centred under them (z 1.06; the switch at z 1.65 stays free); centre 1.45 m up (*guess*: eye
  // height from the dining table). Drawn on a canvas (`print`, furniture.js paintedPicture): the paper colour and the
  // gold are *guesses* from the photo (cool light, glass reflections); `block` / `width` / `top` = the text's share of
  // the height / the widest line's share of the width / where it starts, measured on the photo.
  { type: 'pictures', level: 0, x: 2.15, z: 1.06, y: 1.45, rot: -90, w: 0.4, h: 0.5, gap: 0, frame: 0.02, depth: 0.025,
    rough: 0.22, cols: 1, rows: 1, grid: [1, 1], order: [0], paint: 'dancing',
    print: { paper: '#c9d3cb', lines: ['THIS', 'KITCHEN', 'IS FOR', 'DANCING'], block: 0.68, width: 0.6, top: 0.17,
      font: "'Bebas Neue', 'Oswald', 'Arial Narrow', 'Liberation Sans Narrow', 'DejaVu Sans Condensed', Impact, sans-serif",
      stem: 0.2, gold: [[0, '#d9b45a'], [0.5, '#a87a2a'], [1, '#6b4a18']] } },
  { type: 'pictures', level: 1, x: 5.551, z: 6.654, y: 1.57, rot: 90, w: 0.4, h: 0.5, gap: 0.07, frame: 0.02, depth: 0.03,
    cols: 2, rows: 2, atlas: 'textures/stair-pictures.jpg', grid: [2, 2], order: [0, 1, 2, 3] },
  // Areca / golden cane palm (#106, the user's Amazon pick: "Gold Palm 130 cm", nursery pot Ø 24) in a big anthracite
  // fibre-clay pot (Ø 40 × 45 cm, our pick) right of the patio door seen from inside (between the west party wall at
  // x 0.2 and the door at x 0.95, the wall's inner face at z 12.23). Canes, frond and leaflet lengths are *guesses*
  // for a ~1.5 m total height.
  // `walls`: the fronds stay inside the west party wall and the façade (#137)
  { type: 'palm', level: 0, x: 0.47, z: 11.96, pot: { r: 0.2, h: 0.45 }, potColor: 0x3d3f42, canes: 15, cane: 0.72, frond: 0.85, leaflet: 0.27,
    walls: { x0: 0.2, z1: 12.23 } },
  // Soffbord ILVA Woodstock, top i oljebehandlad ekfaner (art. 1055729): 120 × 60 × 47 cm, legs in
  // oiled solid oak, a fixed shelf below (ilva.dk product page). Centred on the three seats
  // (x 2.68–4.60), 40 cm in front of the sofa (front at z 11.26). Its shape: COFFEE_TABLE (#410).
  // Hall, right as you come in, between the EL cabinet and the wardrobes (#49, "KL" on the plan; sizes
  // are our pick): a wall coat rack with a hat shelf and hooks (jackets, a cap) above a two-tier
  // black shoe rack with a few pairs on it
  { type: 'coatrack', level: 0, x: 0.2 + 0.14, z: 1.255, rot: -90, w: 0.74 },
  { type: 'shoerack', level: 0, x: 0.2 + 0.16, z: 1.255, rot: -90, w: 0.74 },
  { type: 'coffeetable', level: 0, x: 3.64, z: 11.26 - 0.4 - 0.3, w: 1.2, d: 0.6, h: 0.47 },
  // IKEA BYÅS TV bench, high-gloss white, 160 × 42 × 45 cm (ikea.com, #67): against the wall opposite the
  // sofa (the stair is behind it), east of the living-room door's architrave, near the sofa's centre line
  { type: 'byas', level: 0, x: 4.25, z: 7.8 + 0.21, rot: 180, w: 1.6, d: 0.42, h: 0.45 },
  // Långlampan (#270, LANGLAMPA): in the corner right of the TV seen from the sofa, between the BYÅS's east end (x 5.05)
  // and the secretary (z > 9.0); `corner` = the inner faces of the east and north walls there (data/plan.json)
  { type: 'tubelamp', level: 0, x: 5.551 - 0.16, z: 7.804 + 0.16, corner: [5.551, 7.804] },
  // JYSK DANI (#411, DANI): upstairs hall, on the floor in front of the stair railing (#423, the user: not by Sovrum 1's
  // door): the railing's run along the hole's west edge x 3.86 from the middle wall (z ~6.66) to z 7.54, the lamp by its north end
  // (2 cm past the corner newel post), 2 cm clear of the handrail — out of the walk from the stair top (z 5.77–6.60) to the doors and of the WC door's
  // swing (to x 2.35). `edge` = the hole's edge (STAIR.hole.x0).
  { type: 'dani', level: 1, x: 3.86 - 0.02 - 0.165 - 0.02, z: (STAIR.aZ[0] + STAIR.bZ[1]) / 2 + STAIR.newel / 2 + 0.02 + 0.165, rot: 180, edge: 3.86 },
  // Philips 55" The One PUS8897 on the bench (#68): panel ~123 × 71 cm, thin black bezel, one central
  // anthracite pedestal; depth, stand size and the ~78 cm total height are guesses. E switches it on: a
  // slowly moving colourful demo picture (canvas, ~12 fps) and an Ambilight glow on the wall behind.
  { type: 'tv', level: 0, x: 4.25, z: 7.8 + 0.2, y: 0.45, rot: 180, w: 1.23, h: 0.715, fps: 12 },
  // IKEA SYMFONISK (Sonos) speakers (#186, SYMFONISK below): two bookshelf speakers and the lamp speaker (frosted glass
  // shade) on the window board behind the sofa. #298 (the user): the white and the black bookshelf speakers swapped places.
  // the white one stands in Sovrum 1's window (#201, the user). #418 (Sarah, docs/symfonisk-bokhylla-staende.jpg): standing
  // upright (15 × 10 × 31), the fabric front facing the room, the − ⏯ + strip low on the front, at the far right (east end)
  // of the board, 1.5 cm in from the reveal (x 4.6565), clear of the blind's folded pack (z ≈ 0.16) and the board's front
  // edge (z 0.465). From the west: the Hue Go (where the speaker lay, #409), Miele's photo, the fern (the middle pot slot,
  // ~3.85), the speaker; the other two pot slots are skipped (SILL_PLANTS.skip)
  { type: 'symfonisk', kind: 'speaker', color: 'white', level: 1, x: 4.6565 - 0.015 - 0.075, z: 0.33, y: 0.7, rot: 180, controls: 'front' },
  { type: 'huego', level: 1, x: 3.047 + 0.015 + 0.075, z: 0.33, y: 0.7, rot: 180 },
  // the framed photo of Miele (#322): between the Hue Go and the fern (#418), near the board's front edge (z 0.465) and clear of
  // the blind's folded pack (z 0.19), turned 15° towards the bed (*guess*)
  { type: 'photoframe', level: 1, x: 3.5, z: 0.43, y: 0.7, rot: 195 },
  // the black one on the kitchen window's inner board (#289, the user; it stood at the south end of the worktop): the east
  // end, in the third pot's place (SILL_PLANTS.skip), facing the room, clear of the blind's folded pack (z 0.16)
  { type: 'symfonisk', kind: 'speaker', color: 'black', level: 0, x: 4.48, z: 0.33, y: 0.8, rot: 180 },
  // smart speakers (#325, NEST): the display in the middle pot's place on the kitchen window board (SILL_PLANTS.skip), clear of
  // the blind's pack (z 0.16), turned 15° towards the dining table; a round one in a wall mount on the living room's south
  // wall between the patio door and the west corner (over the palm), one on the upstairs hall's west wall
  { type: 'nesthub', level: 0, x: 3.82, z: 0.35, y: 0.8, rot: 165 },
  { type: 'nestmini', level: 0, x: 0.56, z: 12.2337, y: 1.68, rot: 0, room: 'vardagsrummet' },
  // #332: the upstairs one moved south of the hall's NISSEDAL (HALL_WALL.tallUp, z 5.454–5.854), midway to the WC door's architrave (6.174)
  { type: 'nestmini', level: 1, x: 1.5418, z: 6.014, y: 1.6, rot: -90, room: 'hallen' },
  { type: 'symfonisk', kind: 'lamp', color: 'white', level: 0, x: 4.55, z: 12.3, y: 0.6, rot: 0 },
  // big rug under the sofa's front legs and the coffee table (#55): 300 × 200 × 1.2 cm (size and
  // colours are our pick), light oatmeal with a soft weave and a thin border; no collision
  // Sarah's rug (#171, docs/matta-vardagsrum-sarah.jpg): dark olive with off-white stripes (~2 cm white, 4 cm green)
  // bending round in U arches, square fields of 1 m (3 × 2); colours/stripes read off the photo, size kept at
  // 300 × 200 (Sarah's own may differ)
  { type: 'rug', level: 0, x: 3.9, z: 10.6, w: 3.0, d: 2.0, h: 0.012, color: '#5a6150', stripe: '#e6e1d6', pitch: 0.062, white: 0.022,
    fields: ['ewn', 'nes'] },
  // Uteplats (paved z 12.75–16.8 in front of the hedge, see PATIO). The family's Rusta Verona lounge (#408, replacing the
  // Plantagen Oslo set of #397 / #407), the user's layout (#429): an L. Four modules in a row (x 2.92–5.66) with their backs
  // to the façade under the living-room window (6 cm of air), the east end in the NE corner by the east screen wall (inner
  // face x 5.68), seats facing south (the patio faces WSW), an arm at each end; every module has its back, so the window's
  // opening sash (the west 35 %, x ≤ 3.53) stops against the westernmost back (WINDOWS `max`). Both divans end to end
  // along the east screen wall from the row's east module (z 13.42–16.02): one long bench, cushions against the wall.
  { type: 'veronasofa', level: 0, x: 5.66 - 2 * 0.685, z: 12.76 + 0.66 / 2, rot: 180 },
  // the small slatted table in the L's corner: 0.6 m in front of the row's seats, 0.475 m from the bench's seat front (x 4.975):
  // room to get up from every seat and step out past it (#302)
  { type: 'slattable', level: 0, x: 4.2, z: 12.76 + 0.66 + 0.605 + 0.45 / 2, rot: 180, beers: true },
  // the parasol shades the sofa corner from the afternoon / evening sun (#398): the sun reaches the patio from the
  // south-east of the plan at noon to the west-south-west in the evening (DAY.planNorth); the pole south of the table,
  // the canopy (radius 1.5) leaning `tilt`° towards the plan's south (= true WSW). Chosen with the computed sun in
  // July: a ray from a seated eye towards the sun meets the canopy for 3 of the 7 seats at 15:00, 6 at 16, 6 at 17, 5 at 18 (#429, patiotest)
  { type: 'parasol', level: 0, x: 4.5, z: 15.55, rot: 180, tilt: 12 },
  // large planters with exotic plants (the user's wish): by the patio door and in the SE corner. The
  // banana in the SW corner stood in the gap in the hedge (the way out to the lawn) and is gone (#52).
  // by the hedge, and beside the living-room window
  // the cushion box (#400): on the right as you come out of the patio door, its back to the west screen wall (face
  // x 0.065, 4 cm of air: the lid stops at 88°, its outer face still short of it), south of the palm (z ≥ 13.55), clear of the door's
  // swing (x ≥ 0.95) and well north of the gap in the hedge (z 16.8); the lid opens towards the patio
  { type: 'dynbox', level: 0, x: 0.105 + 0.29, z: 13.7 + 0.625, rot: -90 },
  { type: 'planter', level: 0, x: 0.45, z: 13.25, plant: 'palm', walls: { x0: 0.065, z0: 12.7 } }, // fronds clear of the façade + screen wall (#137)
  { type: 'planter', level: 0, x: 5.3, z: 16.45, plant: 'agave' }, // SE corner by the hedge (#397: the sofa's corner took its old spot; #429: south of the bench's end)
  // Upstairs bedrooms (the user's plan). Beds: rot = direction from the head to the foot end.
  // IKEA NORDKISA bedside tables, bamboo, 40 × 40 cm (ikea.com, #64; the 55 cm height is a guess, about the
  // mattress top): one each side of the double bed's head end (east wall), clear of the Klk door
  // either side of the IDANÄS bed (190 wide, centred at BED1_Z): its sides ∓ 0.95 ∓ 0.22
  ...[BED1_Z - 1.17, BED1_Z + 1.17].map((z) => ({ type: 'nordkisa', level: 1, x: 5.55 - 0.23, z, rot: 90, w: 0.4, h: 0.55 })),
  // IKEA NYMÅNE work lamps with wireless charging, white (#65; base Ø ~20 cm, arms and head guessed from the
  // product photo), one on each bedside table, the head reaching over towards the bed; E on each one
  ...[[BED1_Z - 1.17, 180], [BED1_Z + 1.17, 0]].map(([z, rot]) => ({ type: 'worklamp', level: 1, x: 5.55 - 0.25, z, y: 0.55, rot, onRug: true })), // their tables stand on the rug (#317)
  // The line drawing over the RÅGRUND chair (#404, the user: "about A4 with the frame"): 21 × 30 cm outside, a 2 cm black
  // moulded frame (its inner 0.8 cm a lower step, `step`, *guess* from the photo), a white mount showing ~2 cm beside an
  // 11.5 × 18 cm print (*guess*: the issue's ~2 cm mount inside an A4 frame) of pale warm grey paper. textures/linjeteckning-sovrum1.jpg = docs/tavla-sovrum1-linjeteckning.png
  // (the motif traced off the user's photo) laid on the paper and mount (40 px/cm, made with PIL). On Sovrum 1's west wall
  // (face x 2.71) centred on the chair (z 0.92, #403), clear of the parked west curtain stack (z 0.47–0.70, CURTAINS) and
  // the TV (z ≥ 2.07); the bottom edge 10 cm over the chair's towel rack (1.40 m) → centre 1.65 m (*guess*), under the soffit (2.4)
  { type: 'pictures', level: 1, x: 2.711, z: 0.725 + 0.195, y: 1.65, rot: -90, w: 0.21, h: 0.3, gap: 0, frame: 0.02, step: 0.008,
    depth: 0.025, rough: 0.3, cols: 1, rows: 1, atlas: 'textures/linjeteckning-sovrum1.jpg', grid: [1, 1], order: [0] },
  // IKEA RÅGRUND chair with towel rack, bamboo (#60; H 140, W 39, D 44, seat 48 cm per IKEA/dimensions.com):
  // Sovrum 1, the corner left of the window seen from inside (NW), back and towel rack against the
  // west wall, seat facing into the room (east); the seat is below the window sill (BH 0.7). #403: moved south out of the
  // corner (z 0.725–1.115, the west curtain stack hangs in z 0.47–0.70) and 1 cm west (x 2.70–3.14, clear of the rug);
  // with the bed moved south (BED1_Z) the gap from it to the bed's foot corner stays ~0.52 m
  { type: 'ragrund', level: 1, x: 2.70 + 0.22, z: 0.725 + 0.195, rot: -90, towel: 0x9fb8c9 },
  // the user's big grey shag rug (#317, docs/matta-gra-sicksack-sovrum1.jpg, from under their sofa today) under the double
  // bed: 240 × 340 cm (the user), the long side across the bed so it sticks out on each side (z 0.74–4.14 since #403: as
  // near the bed's centre BED1_Z as fits; clear of the north wall z 0.47 and the Klk wall + sliding door track z 4.16). Along the bed it runs from
  // the head wall (x 5.54, under the NORDKISA tables) 18 cm past the foot (x 3.14) — limited by the room: further west it
  // would run under the RÅGRUND chair (x ≤ 3.14). ~2.8 cm thick, soft rounded edge, no fringe. Colour, line width and
  // pitch *guess* from the warm-lit photo (a neutral grey); pieces standing wholly on it stand on top (rugs.js `rugUnder`)
  { type: 'rug', level: 1, x: 5.54 - 1.2, z: 2.44, w: 2.4, d: 3.4, h: 0.028, edge: 0.012, pattern: 'zigzag', color: '#5c5b59', stripe: '#e8e4dc',
    line: 0.012, pitch: 0.14, seed: 17 },
  // Sovrum 1 (Sarah & Olof), head east, clear of the Klk. Bedding (#83, an IKEA set from a Sellpy ad):
  // sage green with a dense chintz of coral and pink peonies, ochre, slate-blue leaves and grey-green
  // stems, white outlines (colours read off the photo); a pink cushion and a light grey throw to go with it
  // IKEA NORDLI chest of 8 drawers, white, 120 × 99 (#94; the 47 cm depth is a guess). Sovrum 1 has no
  // wardrobe, its storage is the Klk behind the sliding door: inside 1.65 × 1.20 m (x 3.90–5.55,
  // z 4.29–5.48), the door slides in the wall plane. The chest stands against its back (south) wall,
  // pushed against the west wall (#336), 73 cm of floor left in front of it; facing north (into the Klk)
  // the hook rail on the Klk's outside facing the room door, a dressing gown and a hoodie (#329, HOOKS); wall face x 3.80
  // the towel hooks (#424, TOWEL_HOOKS): WC/dusch on the north face of the shaft box between the toilet and the vanity
  // (z 7.054, x 0.202–0.587, facing north), Badrum on the south face of the wall stub right of the vanity towards the Tvätt
  // doorway (z 5.134, x 0.202–0.987, facing south; the vanity starts at z 5.25); + the 6 mm tiles
  { type: 'towelhooks', level: 1, x: 0.395, z: 7.054 - 0.006, rot: 0 },
  { type: 'towelhooks', level: 0, x: 0.75, z: 5.134 + 0.006, rot: 180 },
  // Tvätt (#437): one hook with a white hand towel on the wall stub south of the laundry sink (its face z 4.845, read off
  // the model; x 0.2–0.99 up to the Badrum doorway), facing north, high enough to hang clear of the worktop (*guess*)
  { type: 'towelhooks', level: 0, x: 0.78, z: 4.845, rot: 0, y: 1.58, towels: [{ seed: 4.2, len: 0.46 }],
    towel: { color: 0xe9e6df, band: 0xd6d1c7, w: 0.17, len: 0.46 } },
  // bobble bath mats in the towels' colour (#425, docs/duschmatta-referens.jpg): 50 × 80 (*guess*), `knob` = the bobble
  // pitch (*guess* from the photo), rounded `corner`s; rugs (rugLift: the cat and things put down stand on them), no
  // collision. WC/dusch: across the floor in front of the shower's glass (z 6.034), east of the vanity (x 0.565);
  // Badrum: along the shower corner's east glass (x 1.10), clear of the toilet, the door (it swings out) and the HAVBÄCK
  { type: 'rug', pattern: 'bobble', level: 1, x: 1.0, z: 6.33, w: 0.8, d: 0.5, h: 0.016, corner: 0.035, knob: 0.016, color: 0xb59e9a },
  { type: 'rug', pattern: 'bobble', level: 0, x: 1.4, z: 7.13, w: 0.5, d: 0.8, h: 0.016, corner: 0.035, knob: 0.016, color: 0xb59e9a },
  { type: 'hookrail', level: 1, x: 3.797, z: 4.51, rot: 90 },
  // the kids' hook rails on the wardrobe end by the door (#330, KID_HOOKS): Sovrum 2 on wardrobe L's side wall (face
  // x 3.8516, z 7.80–8.50, facing west; hook 3 = the room end), Sovrum 3 on wardrobe G's end panel (x 1.5037, z 4.21–4.91,
  // facing east; hook 3 = the front end)
  { type: 'hookrail', level: 1, x: 3.849, z: 8.15, rot: 90, set: 'sovrum2' },
  { type: 'hookrail', level: 1, x: 1.506, z: 4.57, rot: -90, set: 'sovrum3' },
  { type: 'nordli', level: 1, x: KLK.westFace + KLK.chestGap + 1.2 / 2, z: 5.48 - 0.235, rot: 0, w: 1.2, h: 0.99, d: 0.47, rifle: true,
    top: { x0: -0.395, x1: -0.03, z0: -0.015, z1: 0.205 } }, // + the AK-47 in the wide bottom drawer (#196); `top` = free of make-up (#331)
  // the Klk's clothes, shelves, make-up corner and LED mirror (#331, src/closet.js; x/z unused) and a soft round rug
  { type: 'klk', level: 1, x: 4.725, z: 4.88, rot: 0 },
  { type: 'cleaning', level: 0, x: 4.5, z: 6.15, rot: 0 }, // what lies and stands in the Klk under the stair (#338, src/cleaning.js; x/z unused)
  { type: 'rug', shape: 'round', level: 1, x: KLK.westFace + KLK.chestGap + 0.6 + KLK.mirror.dx, z: 4.66, d: 0.72, h: 0.022, color: '#e9e1d2', seed: 33 },
  // the mattress centre: the headboard (IDANAS.head) against the east wall
  { type: 'bed', level: 1, x: 5.55 - IDANAS.head - 1.0, z: BED1_Z, rot: 90, w: 1.8, l: 2.0, model: 'idanas', sitUp: { tv: 'Sovrum 1' }, pingping: true, hotel: true, // Pingping between the pillows (#269), hotel pillows under the head pillows (#308)
    // repeat = metres per texture tile (blooms ~8–15 cm)
    bedding: { pattern: 'chintz', ground: '#adc2b1', repeat: 0.9, flowers: ['#d0696b', '#c9505a', '#e9b7bd', '#d4b45a'],
      leaves: ['#6f7b86', '#8a96a0', '#7f9a83'], throw: 0xdcdcd8, cushion: 0xe2a3ab } },
  // The meadow-grass picture over the bed (#284, docs/tavla-sovrum1-angsgras.jpg): 150 × 100 cm outside (the user), a
  // thin flat black frame (~2 cm face, ~3 cm deep, *guess* from the photo). On the east wall (inner face x 5.551) centred
  // on the bed (BED1_Z 2.55 since #403, spanning z 1.80–3.30, so its north end is under the RH 2.4 soffit, z < 1.96): the bottom edge
  // 12 cm over the headboard (IDANAS.headH 1.21) → 1.33–2.33 m, 7 cm under the soffit; above the NYMÅNE work lamps.
  // textures/angsgras-sovrum1.jpg is the photo straightened, the glass's reflections painted out, re-graded towards the print
  // in daylight (#292: levels lifted, a gentle S-curve, +20 % saturation, warm sky / olive grass; the photo was underexposed).
  { type: 'pictures', level: 1, x: 5.551, z: BED1_Z, y: 1.83, rot: 90, w: 1.5, h: 1.0, gap: 0, frame: 0.02, depth: 0.03,
    cols: 1, rows: 1, atlas: 'textures/angsgras-sovrum1.jpg', grid: [1, 1], order: [0] },
  // Bunks: long side against the side wall, head end against the façade (the user's wish);
  // the ladder ends up on the room side at the foot end.
  { type: 'bunk', level: 1, x: 0.2 + 0.5, z: 0.47 + 1.05, rot: 180, w: 0.9, l: 2.0, sheets: 'unicorn' }, // Sovrum 3 (Livia & Tuva)
  // a NYMÅNE wall lamp at every berth (#219): white in Sovrum 3, black in Sovrum 2
  ...NYMANE_WALL.berths.flatMap((b) => NYMANE_WALL.mattress.map((m, i) => ({ type: 'walllamp', level: 1, color: b.color, room: b.room,
    x: b.x, z: b.head + b.dir * NYMANE_WALL.fromHead, y: m + NYMANE_WALL.aboveMattress, rot: b.rot, berth: i ? 'överslafen' : 'underslafen' }))),
  // Livia & Tuva's desk (#92): IKEA ALEX, white, 132 × 58 (ikea.com; the 76 cm height and drawer sizes are
  // guesses), under the window against the north wall, east of the bunk; a white kids' swivel chair in
  // front (a seat, #71) and crafts on the top, the middle left free for the drawing paper (#93)
  // Philips 32" PFS6906 (#100, Elgiganten: 3-sided Ambilight, thin silver bezel; panel ~71 × 41 cm), wall-mounted on
  // Sovrum 3's east wall (x 2.61) straight across from the bunk (z 0.47–2.57), clear of the desk (z < 1.04) and the
  // wands' hooks (z ≥ 2.85); centre 1.2 m up (the user: watchable from both bunks; tunable). Faces west.
  // Sovrum 1 (#213, docs/tv-philips-43-pqs7801.png): Philips 43" PQS7801 QLED (~96 × 56 cm; slim black frame, a silver
  // edge below; Ambilight, the user #223) on the west wall straight across from the double bed (BED1_Z), centre 1.3 m up for
  // sitting up in bed (guess). Faces east.
  { type: 'tv', level: 1, room: 'Sovrum 1', x: 2.752, z: BED1_Z, y: 1.3, rot: -90, w: 0.96, h: 0.56, fps: 12, px: 320, mount: 'wall', frame: 'black', name: 'tv:n' }, // with Ambilight (#223)
  { type: 'tv', level: 1, x: 2.61, z: 1.75, y: 1.2, rot: 90, w: 0.71, h: 0.41, fps: 12, px: 256, mount: 'wall', name: 'tv:n' },
  { type: 'alex', level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.29, rot: 180, w: 1.32, d: 0.58, h: 0.76 },
  { type: 'kidchair', level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.58 + 0.25, rot: 0 },
  // a round dusty-pink short-pile rug (#310, the user; docs/matta-sovrum3-rosa-farg.png for the colour,
  // docs/matta-sovrum3-lizette-rund.png for the shape: "Matta Lizette", several sizes). Ø 160 × 1.2 cm is a guess.
  // #318 (the user): out in the room under the bunk's ladder (room side x ~1.2, z 2.02–2.47) rather than in the corner
  // under the desk: x 0.85–2.45, z 1.45–3.05 — 16 cm from the east wall (x 2.61), well clear of the door's swing
  // (z ≥ 4.2), only the MALM's front corner (x ≤ 1.1, z ≥ 2.58) on it. Colour sampled from the photo. No collision (#55)
  { type: 'rug', shape: 'round', level: 1, x: 1.65, z: 2.25, d: 1.6, h: 0.012, color: '#c8928d', seed: 31 },
  // IKEA MALM chests of 6 drawers, white, 80 × 124 × 50 cm (the user, #235, docs/malm-byra-6-lador.png), one per
  // bunk room with its back against the bunk's free short end (MYDAL posts reach l/2 + post = 1.055 m from its
  // centre), centred on the bunk, facing into the room. Sovrum 3 faces south, Sovrum 2 north.
  { type: 'malm', level: 1, room: 'Sovrum 3', x: 0.2 + 0.5, z: 0.47 + 1.05 + 1.06 + 0.25, rot: 180, w: 0.8, h: 1.24, d: 0.5, seed: 70, deco: 'unicorn' },
  // Livia's pineapple mirror (#412, PINEAPPLE_MIRROR): centred on the west wall (inner face x 0.202) between the MALM's
  // front (z 3.08) and wardrobe G (z 4.21); the oval's centre 1.45 m up (*guess*, child height)
  { type: 'pineapple', level: 1, x: 0.202, z: (3.08 + 4.21) / 2, y: 1.45, rot: -90 },
  // Sovrum 2 (Walter & Kian). watch.z: a seat in the lower bunk (local z, level with the desk's monitor)
  // for watching films on the PC
  { type: 'bunk', level: 1, x: 5.55 - 0.5, z: 12.23 - 1.05, rot: 0, w: 0.9, l: 2.0, sheets: 'vader', watch: { z: -0.3 } },
  { type: 'malm', level: 1, room: 'Sovrum 2', x: 5.55 - 0.5, z: 12.23 - 1.05 - 1.06 - 0.25, rot: 0, w: 0.8, h: 1.24, d: 0.5, seed: 90, deco: 'vader' }, // its MALM (#235)
  // Walter & Kian's neon print "EAT SLEEP GAME REPEAT" (#430, docs/tavla-sovrum2-eat-sleep-game-repeat.webp): ~40 × 50 cm
  // outside (*guess*, the user: "40x50 ca"), a thin black frame (~2 cm face, no passe-partout, *guess* from the photo), the
  // print filling it. On the east wall (inner face x 5.551) centred between wardrobe L's south face (z 8.504, plan.json) and
  // the MALM's front (z 9.87 − 0.25 = 9.62); centre 1.55 m up (*guess*, a little over the pineapple mirror's 1.45 of #412:
  // the boys are older), so its bottom (1.30) clears the MALM top (1.24). textures/eat-sleep-game-repeat-sovrum2.jpg = the
  // photo's print cropped inside the frame and straightened (720 × 920 px = 36 × 46 cm).
  { type: 'pictures', level: 1, x: 5.551, z: (8.504 + 9.62) / 2, y: 1.55, rot: 90, w: 0.4, h: 0.5, gap: 0, frame: 0.02, depth: 0.025,
    rough: 0.5, cols: 1, rows: 1, atlas: 'textures/eat-sleep-game-repeat-sovrum2.jpg', grid: [1, 1], order: [0] },
  // Walter & Kian's gaming corner (#77, #84): a black desk 140 × 70 along the west wall (opposite the bunk),
  // its short end against the south window wall, facing east; curved 34" ultrawide on a monitor arm, RGB
  // tower at the window end (out of the bunk's line of sight), keyboard, mouse, headset, speakers (sizes
  // our pick). E on it switches the PC on (animated game screen, RGB cycling, game sounds). The black/green
  // gaming chair in front of it is a seat (#71) and sitting down starts the PC; sitting in the lower bunk
  // swings the monitor round towards it and plays a film.
  { type: 'gamingdesk', level: 1, x: 2.75 + 0.35, z: 12.23 - 0.7, rot: -90, w: 1.4, d: 0.7, fps: 12 },
  { type: 'gamingchair', level: 1, x: 2.75 + 0.35 + 0.62, z: 12.23 - 0.7, rot: 90 },
  // Sovrum 4 (Tilly): IKEA HEMNES dagbädd m 3 lådor, vit, 207 × 89 × 83 cm (ikea.com, HEMNES_DAYBED), back to the
  // west wall, charcoal and lilac bedding (#280), its head end by the window (#312, DAYBED_Z). rot = the way the seat faces.
  { type: 'daybed', level: 1, x: 0.2 + 0.46, z: DAYBED_Z, rot: -90 },
  // Tilly's vanity (#282, VANITY): against the east wall (face x 2.632) south of the door's swing, short of the window
  // corner; the drawer column at the north end, the free end (the laptop, #283) towards the window; the stool in front
  { type: 'vanity', level: 1, x: 2.632 - VANITY.d / 2 - 0.004, z: 11.45, rot: 90 },
  { type: 'vanitystool', level: 1, x: 2.632 - VANITY.d - 0.2, z: 11.55, rot: -90 },
  // her wardrobe (#305, #311, SMASTAD): back to the north wall in the NW corner, its west side 4 mm off the west wall
  // (face x 0.202); it faces the room (south)
  { type: 'smastad', level: 1, x: 0.202 + 0.004 + SMASTAD.W / 2, z: 7.804 + 0.004 + SMASTAD.D / 2, rot: 180 },
  // her K-pop posters (#280, KPOP_POSTERS): world coordinates, so the item sits at the origin unturned (rot 180 = yaw 0)
  { type: 'kposters', level: 1, x: 0, z: 0, rot: 180 },
  // Tilly's laptop (#283, LAPTOP) on the vanity's free end (vanity-local x 0.29), turned 15° towards the stool
  { type: 'laptop', level: 1, x: 2.632 - VANITY.d / 2 - 0.004 - 0.02, z: 11.45 + 0.29, y: VANITY.h, rot: 75 },
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
