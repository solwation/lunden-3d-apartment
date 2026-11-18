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
// the window rows, the loftgång / upper units / roof heights (exterior.js, greet.js, weather.js) and so the
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

// The name plate on the stairwell side of the front door, centred over the letter box (#595, src/signs.js
// namePlate). Text from the issue; size, height, font and colours are visual assumptions (*guess*): a typical
// small engraved brass-look plate, 14 x 3.5 cm, its centre `y` m above the floor (the letter box sits at 0.85 m).
export const NAME_PLATE = { text: 'Budil Wingren', w: 0.14, h: 0.035, t: 0.003, y: 0.95,
  font: "600 64px 'Helvetica Neue', Helvetica, Arial, sans-serif", color: '#c9a650', edge: '#8a6d2c', ink: '#1d1a14',
  roughness: 0.45, metalness: 0.35 };

// Interior doors: standard Swedish 21M leaf (2.1 m). Exterior doors have a glazed transom (överljus)
// above the leaf, like the windows. Checked (#3) against Peab's render of L1004's living room, same
// unit type (docs/peab/l1004-vardagsrum-render.jpg, scaled by RH 3.0 m): patio door head ≈ 2.65 m,
// leaf incl. frame ≈ 2.2 m — within the estimate's error, so the values are kept.
// #497: muted dark green and a small thin high pane, visual assumptions (no verified RAL/NCS or glazing dimensions).
export const ENTRY_DOOR = { color: 0x314d3c, roughness: .58, thickness: .04,
  glass: { width: .36, height: .12, top: .12, frame: .015, thickness: .008,
    frameColor: 0x566b5c, frameRoughness: .4, frameMetalness: .25, color: 0xb5cbd0, opacity: .48, roughness: .22 } };
export const DOOR_HEIGHT = 2.1;
// Interior door finish (#45): the leaf fills the opening with an even `gap` (fog) at hinge, latch and
// head; white architraves (dörrfoder) `width` × `thickness` around the opening on both wall faces,
// in the door colour. On a sliding door's track side they are `slideThickness` thin, so the panel
// (running 1 cm off the wall) clears them.
export const DOOR_TRIM = { gap: 0.003, width: 0.07, thickness: 0.012, slideThickness: 0.008 };
// #1044 visual fitting dimensions, metres: illustrative assumptions (guess), not Peab measurements.
export const DOOR_FITTINGS = { height: 1, backset: .065, roseRadius: .026, roseDepth: .008,
  neck: .038, lever: .115, radius: .009, bend: .018, segments: 12,
  lockDrop: .075, lockRadius: .021, lockDepth: .014, turnHeight: .012, turnWidth: .031,
  turnDepth: .008, slotHeight: .026, slotWidth: .003, cylinderHeight: .052, cylinderWidth: .034,
  strikeHeight: .24, strikeWidth: .038, strikeDepth: .003 };
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

// Radiators under the windows (#1071). SOURCED: Peab heats with water-borne radiators on district heating (info brochure
// 2024-09-11, informationsbroschyr text line 697; fragor-och-svar.txt:150–153), and the floor plans' legend says
// "R RADIATOR PLACERAS UNDER FÖNSTER OM INTE ANNAT ANGES"; Peab's L1004 render (docs/peab/l1004-vardagsrum-render.jpg)
// shows a white panel radiator. Every size below is a *guess* (no radiator schedule in Peab's material): a white compact
// single-panel radiator with convector (type 11-ish), centred under the window board. `bottom` = its underside over the
// floor (cleaning gap), `under` = the clearance from the window board's underside to its top grille, `step` = product
// heights/widths come in 0.1 m steps (the height is rounded down and kept within `min`…`max`), `width` = its share of the
// window opening (rounded to `step`), `gap` = wall to back panel (the brackets), `depth` = back panel to front face,
// `panel` = a panel's thickness. `valve`: a thermostat valve on the east end near the top (a body `len` out of the end,
// radius `r`, `drop` under the top; a head of radius `head` × `headLen`); `pipe` = two white pipes (radius `r`, centre
// `spacing` along x, the first `inset` in from the end) from its underside down into the floor, each with a `rosette`.
// Skipped where the window board is too low for `min` (glass to the floor / a door), over a cabinet or over a floor
// opening. It sticks out under 9 cm from the wall: inside the player's own wall clearance (PLAYER.radius), so no collision.
export const RADIATOR = {
  bottom: 0.15, under: 0.12, step: 0.1, min: 0.3, max: 0.9, width: 0.8,
  gap: 0.015, depth: 0.05, panel: 0.014,
  valve: { len: 0.045, r: 0.011, drop: 0.045, head: 0.024, headLen: 0.075 },
  pipe: { r: 0.0075, spacing: 0.05, inset: 0.035, rosette: 0.022 },
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
// `tile` = m of fabric per pattern repeat. Our picks / *guess* unless noted. `dim` optionally overrides the shared daylight loss (the short kitchen valance only);
// full lengths use CURTAIN_LIGHT.diffuseTransmission. `glow` = the teal emissive by day (a little light through the cotton), lamp =
// from a lit room. `speed` m/s of the east panel's leading edge while A / D are held (the west one keeps pace: same share).
// `rail` = side-wall inner faces at the track, from data/plan.json (#468); cloth stops may sit inward of these.
// #499: cotton/linen light approximation, visual ASSUMPTIONS rather than measured fabric data.
// Slight see-through uses one depth-tested pass per folded sheet, preserving its gathered density.
// Direct sun remains blocked by the cloth's solid shadow; transmitted light contributes diffuse room fill.
export const CURTAIN_LIGHT = { opacity: .94, diffuseTransmission: .46, roughness: .96, backlightGain: 1.35, warmGain: 1.2 };

export const CURTAINS = [
  // Sovrum 1 (Sarah & Olof, L1 North): Jungle-print teal cotton panels
  { level: 1, room: 'Sovrum 1', materialId: 'f-curtain-bedroom1', facade: 'north', theme: 'jungle', rail: [2.7017, 5.5514], west: 2.71, stop: 2.72, meet: 3.855, east: 5.32, z: 0.6, glass: [3.15, 4.56], stack: 0.22,
    top: 2.36, drop: 0.015, fullness: 1.4, amp: 0.028, tile: 0.7, speed: 0.38,
    colors: { ground: '#2f7c86', track: 0xf3f2ee, glow: 0x3fa3ad, warm: 0xffc27a }, glow: { day: 0.18, lamp: 0.08 } },
  // Sovrum 2 (Walter & Kian, L1 South): Star Wars / gaming sci-fi motif on dark navy
  { level: 1, room: 'Sovrum 2', materialId: 'f-curtain-bedroom2', facade: 'south', theme: 'starwars', rail: [2.7517, 5.5514], west: 2.77, stop: 2.78, meet: 3.85, east: 5.53, z: 12.12, glass: [3.22, 4.47], stack: 0.22,
    top: 2.76, drop: 0.02, fullness: 1.4, amp: 0.028, tile: 0.65, speed: 0.38,
    colors: { ground: '#141a29', track: 0xf3f2ee, glow: 0x223254, warm: 0xffc27a }, glow: { day: 0.15, lamp: 0.07 } },
  // Sovrum 3 (Livia & Tuva, L1 North): Unicorn / pastel rainbow theme on soft cream
  { level: 1, room: 'Sovrum 3', materialId: 'f-curtain-bedroom3', facade: 'north', theme: 'unicorn', rail: [0.202, 2.6067], west: 0.90, stop: 0.92, meet: 1.80, east: 2.59, z: 0.58, glass: [1.25, 2.34], stack: 0.22,
    top: 2.36, drop: 0.015, fullness: 1.4, amp: 0.028, tile: 0.6, speed: 0.38,
    colors: { ground: '#fdf6fa', track: 0xf3f2ee, glow: 0xffeef7, warm: 0xffc27a }, glow: { day: 0.22, lamp: 0.09 } },
  // Sovrum 4 (Tilly, L1 South): K-pop & dark violet/lilac theme
  { level: 1, room: 'Sovrum 4', materialId: 'f-curtain-bedroom4', facade: 'south', theme: 'kpop', rail: [0.202, 2.6317], west: 0.22, stop: 0.23, meet: 1.45, east: 2.61, z: 12.12, glass: [0.72, 2.19], stack: 0.22,
    top: 2.76, drop: 0.02, fullness: 1.4, amp: 0.028, tile: 0.6, speed: 0.38,
    colors: { ground: '#201826', track: 0xf3f2ee, glow: 0x3d2b4c, warm: 0xffc27a }, glow: { day: 0.15, lamp: 0.07 } },
  // Kök / matplats (#464): one 51 cm valance on the existing ceiling rail; length is a visual choice (*guess*).
  { level: 0, room: 'Kök / matplats', materialId: 'f-curtain-kitchen', facade: 'north', theme: 'linen_kitchen', rail: [2.1516, 5.5512], style: 'valance', name: 'gardinkappan', initial: 1, west: 2.1516, stop: 2.17, meet: 3.85, east: 5.5312, z: 0.58, glass: [3.15, 4.56], stack: 0.22,
    top: 2.96, drop: 2.45, fullness: 1.4, amp: 0.028, tile: 0.6, speed: 0.38, dim: 0.03,
    panels: [{ id: 'valance', from: 2.17, to: 5.5312, park: 'left' }],
    colors: { ground: '#ede7dc', track: 0xf3f2ee, glow: 0xf8f4ec, warm: 0xffc27a }, glow: { day: 0.22, lamp: 0.08 } },
  // Vardagsrum (#566, #570): broad IKEA leaf print from docs/gardiner-vardagsrum-ikea-img-0571.jpg.
  // Ink shade matches the living-room rug's olive green (#5a6150) for harmony with the room.
  // #584 (the user: the print looked too big and clumsy): `tile` .90 → .45 m, twice as many repeats each way. Read off
  // the photo: ~8–9 lobes across one panel, taking it as IKEA's usual 145 cm width (*guess*), gives lobes of ~12–16 cm,
  // i.e. a ~.45 m repeat (the canvas holds 2 × 2 lobe clusters). White ground and rail/panel dimensions retained.
  { level: 0, room: 'Vardagsrum', materialId: 'f-curtain-living-room', facade: 'south', theme: 'ikea_leaves', rail: [0.2018, 5.5512], west: 0.202, stop: 0.22, meet: 3.855, east: 5.531, z: 12.10, glass: [2.88, 4.81], stack: 0.22,
    top: 2.96, drop: 0.02, fullness: 1.4, amp: 0.028, tile: 0.45, speed: 0.38,
    panels: [{ id: 'west', from: 0.22, to: 2.15, park: 'left' }, { id: 'middle', from: 2.15, to: 3.855, park: 'left' }, { id: 'east', from: 3.855, to: 5.531, park: 'right' }],
    colors: { ground: '#fafaf6', ink: '#5a6150', track: 0xf3f2ee, glow: 0xf8f8f3, warm: 0xffc27a }, glow: { day: 0.20, lamp: 0.08 } },
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
// #1677: OSM ids of the houses by Sävsländegatan, Nattsländegatan and Hattsnäckegränden (shared by the window rows and `south.villas`).
const SOUTH_VILLAS = [
      '333642383', '333642385', '333642389', '333642392', '333642396', '403628166', '403628168', '403628172', '403628174', '403628178', // Sävsländegatan
      '333642384', '333642387', '333642391', '333642393', '333642395', '367079610', '367079611', '367079612', '367079613', '367079616', // Nattsländegatan
      '333642386', '333642390', '333642397', '403628164', '403628170', '403628176', // Hattsnäckegränden
];
// #1678: OSM ids of the houses along Sankt Lars väg south of the hospital (nr 56-66; shared by the window rows and `south.whiteHouses`).
const SOUTH_LARS_VAG = ['88457551', '88457559', '88457560', '88457562', '88457571', '88457572', '88457578', '88457584', '88457587', '88457589', '88457593', '88457596', '88457604'];
// #1807 (Google 3D 05_norra_skolor_*, 06_kunskapsskolan_*): colours of the school yards' optional `detail` (play corners, see src/schoolyard.js): `fence` a mid green mesh fence, `pad` the teal
// play surface that shows in the oblique views at the long pavilion; hex values, like every position and size in a `detail`, are a *guess*.
const YARD_COLORS_1807 = {"lawn":0x5d8a3a,"sand":0xd6c39a,"hedge":0x3b5828,"wood":0x8a6a48,"seat":0x2f2f2f,"roof":0xa8483a,"slide":0xc9a227,"fence":0x3f8a52,"pad":0x2a9d8f};
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
    // #1151: windows in the box's park-facing retaining walls, where våning −1 (docs/peab/kalibrerad/vaning-m1-300dpi.png,
    // p46) draws window symbols in the garage's outer wall: `edges` = [box edge z (south faces, looking +z), [[x0, x1] …]],
    // read at 23.61 px/m with the entrance hall's inner faces (x −69.95 / −41.61, z 51.8) as anchors (±0.1 m). The south
    // wall of INFART GARAGE between Hus C and the C/B stair has four 1.82 m windows plus a 0.97 m one between the stair and
    // Hus B; the big hall's wall between Hus B and Hus A (the level line z 33.3) three. Only the horizontal placement and
    // count are sourced: `sill` / `head` (metres over the park level outside) are *guess* (the plans give no heights,
    // under the garage's ceiling −0.35); frames / panes reuse the Å-husen's listed windows (NEIGHBOR_OPENINGS.site).
    boxWindows: { sill: 1.1, head: 2.2, edges: [
      [52.5, [[-66.35, -64.53], [-61.35, -59.53], [-56.31, -54.49], [-52.84, -50.97], [-43.05, -42.08]]],
      [33.3, [[-20.61, -18.79], [-17.39, -15.57], [-14.17, -12.35]]]] },
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
    // to Sankt Lars väg (z 30…31.8). #254: "TRAPPA" between Hus C and Hus B (from the level line at z 52.5 down to
    // z ≈ 59). #1204: x −47.4…−44.4, the full flight width drawn on våning −1 and våning 1 (both ≈ 3.0 m, ±0.15 m
    // graphical reading; was 1.5 m); risers, landing and handrail height stay as before (not dimensioned, *guess*).
    stairs: [{ x0: 11.6, x1: 13.5, z: 27.25, step: 0.3, drop: 1.4, steps: 9, walk: { x0: 11.6, x1: 19.7, z0: 29.95, z1: 31.8 } }, // the walk meets the pavement along Sankt Lars väg (SITE.roads)
      { x0: -47.4, x1: -44.4, z: 52.5, step: 0.3, landing: 1.0 }],
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
  // `slab`: the loggia / recess floor slabs' thickness (guess, #266; #1471: the walk's front walls under each upper floor).
  loggia: { pier: 0.5, rail: 1.05, plants: 0.35, mid: 4.5, midAt: 3.5, slab: 0.22,
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
  // courtyard deck are not inferred as outdoor doors; #729 verifies the A/B park entries separately. Only the horizontal placement and the count are sourced: the plans give
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
  // centres and sizes. A greenhouse in its yard and a brick wall with a black coping along the pavement (2.0 m since #1534).
  school: { bay: 3.0, storey: 8.6, roofPitch: 0.32, rows: [{ y: 2.05, s: [0.95, 1.6, 1] }, { y: 5.95, s: [0.95, 1.35, 1] }],
    // #564 photo interpretation, not measured: see docs/validation/issue-564/README.md.
    mapped: { roofRise: 1.05, roofSlope: .24, roofGrid: 1.2, seam: .6,
      white: 0xeeeae1, joint: 0xc3bbb0, glass: 0x405660,
      // Edge indices of unchanged OSM 88457612. Two windows on visible outer fronts;
      // centre/rear/connecting-wing counts obscured by trees are guesses.
      bays: [4,0,2,5,2,0,4,0,4,0,4,0,2,5,2,0,4,0,4,0],
      fronts: [4,8,12], width: 1.5, sill: [1.05,5.25], head: [3.45,7.5],
      archRise: .20, frame: .12, mullion: .045, quoin: .65, jointStep: .43,
      plinth: .72, belt: [4.3,.22], cornice: [[-.45,.32,.12],[-.23,.14,.23],[-.08,.16,.34]],
      dentil: { step: .48, width: .16, height: .22, depth: .20 },
      chimneys: [[-34,-62],[-12,-62],[11,-62]], chimney: [.65,1.45,.65], cap: [.82,.12,.82],
      brick: { mortar: '#96877b', base: [125,64,46], variation: 26 },
      metal: ['#53585b','#333a3e','#697074'] },
    // #1534 (the user's photo docs/foton/mur-overgangsstalle-busskur-mittemot.jpg, taken from Lunden's verge west of the
    // crossing looking NNE): the wall is ~2 m high and ends at the campus road into Realgymnasiet's yard (the photo's right,
    // with the barrier, the long building and Klockhuset beyond: the EAST end) in a bus shelter. The wall turns back in a
    // short angle (the shelter's west gable) to a recessed brick back wall; a flat roof juts out over the pavement on a
    // single post; a long bench against the back wall, a bin on it. #1702 (the user's close-up
    // docs/foton/busskur-murhorn-narbild.jpg) corrected the details: the roof is dark weathered timber with a thick
    // fascia and reaches ~2.8 m out from the back wall, a grey timber post ~0.15 m stands under its front edge east of
    // the middle, a black downpipe runs down the wall at the roof's east end, the bench is light grey weathered timber,
    // and the back wall *continues* east in the same line (`wallEast` m) with a street-name plate and ends at a grey
    // sheet-metal cabinet and a big boulder. Every number is a *guess* read off the photos (heights from the bench seat ~0.45 m).
    wall: { x0: -26, x1: 13.6, z: -32.15, h: 2.0, t: 0.3,
      shelter: { len: 6.0, depth: 1.3, // along the street from the wall's end (x1); the back wall's line `depth` m behind the wall's
        wallEast: 5.5,                 // #1702: the back wall goes on this far east of the open end, in its line (*guess*, ~5-7 m in the photo)
        roof: { y: 2.5, t: 0.22, out: 2.8, east: 0.6, west: 0.9, beam: 0.25 }, // underside y, slab thickness; out = m past the back wall's front face; the open end / the gable overhang; the carrying beam's depth below the slab (along the back wall)
        post: { s: 0.15, east: 0.6, inset: 0.4 },                        // grey timber post: `east` m east of the shelter's middle, `inset` m behind the roof's front edge
        bench: { len: 4.4, depth: 0.42, h: 0.45, t: 0.06, gap: 0.05 }, // light grey timber bench along the back wall (gap = off the bricks)
        bin: { w: 0.38, h: 0.8, d: 0.28, y: 0.5, from: 2.0 },          // a tall black bin hung on the back wall `from` m inside the open end (just east of the post)
        pipe: { r: 0.045, off: 0.1 },                                  // black downpipe `off` m east of the open end, from the roof down the wall
        sign: { w: 0.6, h: 0.1, y: 1.45, from: 2.6 },                  // street-name plate on the continuing wall, `from` m east of the open end
        cabinet: { w: 0.35, d: 0.9, h: 1.5, gap: 0.5 },                // grey sheet-metal cabinet `gap` m past the wall's east end (d along the street)
        boulder: { r: 0.65, gap: 1.6, back: 0.2 } } },                 // the big stone: `gap` m past the wall's end, `back` m off the back wall's line
    // #1534: the greenhouse stands west of the shelter and the big maple (x 9) in the photo; it was x 13…21 (*guess*, #126)
    greenhouse: { x0: 0, x1: 8, z0: -36.8, z1: -33.6, h: 2.2, ridge: 1.0 },
    chimneys: [-14, -3, 8, 17] },
  // HepCat Store and the long brick building behind it, east of our row across Sankt Lars väg (#127, the user's photos
  // docs/foton/hepcat-store-sidan-byggnadsstallning.jpg, sidogatan-tegelhus-plattak-byggplats.jpg): a storey and a
  // half of brick with white pilasters and a white rendered middle part with its own gable, a dark standing-seam
  // metal roof; behind it a long low brick building with dormers and yellow-framed windows. `rows` = window lights.
  // #1533 (the user's photos docs/foton/hepcat-store-fasad-mot-lunden.jpg, hepcat-store-gavel-nr21-soder.jpg): drawn by
  // src/hepcat.js from the two blocks below. `model`: every metre value is read off the photos (*guess*, no drawings).
  // The north end (z0) is hipped, the south end (z1, nr 21 facing the school nr 20) a gable; the white middle a
  // cross gable over two storeys. `bay` = one brick bay between the white pilasters (each wing 2 bays).
  hepcat: { bay: 4.1, storey: 4.2, model: {
    pitch: 0.75, overhang: 0.6, verge: 0.45,   // wing roof rise per m (~37°), eave overhang, verge at the nr 21 gable (*guess*)
    whitePitch: 1.0, whiteOverhang: 0.5,       // the middle's cross gable, ~45° (*guess*)
    pilaster: 0.45, plinth: 0.45,              // white pilasters / quoins, stone plinth height (*guess*)
    pair: { w: 0.6, gap: 0.2, sill: 0.95, h: 1.5 }, // the paired windows with eared surrounds (*guess*)
    door: { w: 2.2, h: 2.4 },                  // nr 21's dark double door (*guess*)
    chimney: [32.6, 4.5, 0.55, 0.9],           // x, z, side, height over the ridge: one black chimney on the south wing (*guess*)
    pxPerM: 40 } },                            // the façade atlas' resolution (one 512² canvas for the whole house)
  hepcatWhite: { bay: 4.4, storey: 6.0 },
  longhouse: { bay: 2.6, storey: 3.8, rows: [{ y: 1.6, s: [0.9, 1.2, 1] }], dormers: 5 },
  blocks: [
    // Kv. Lunden, Å-husen (overview plans): storeys counted from `base`; red brick, low hip roof
    { name: 'Hus A', x0: -9.76, x1: 9.42, z0: 28.8, z1: 52.86, base: -3, storeys: 5, roof: 'hip', // våning -1…4; north face on the box edge (#246)
      hip: { box: { x0: -1.64, x1: 1.28, z0: 33.49, z1: 37.39, h: 1.0 } }, // roof plan on the våning 5 sheet (#348)
      corners: { nw: [3.4, 2.0], ne: [3.4, 2.0], se: [5.9, 2.05], sw: [5.9, 2.05] },
      recesses: [{ face: 'n', a0: 0.23, a1: 2.22, depth: 2.1, from: 1, to: 1, door: 1, walkIn: true }, // the main entrance from the courtyard (våning 1); a real door into the stair core (#637, CORE_A)
        { face: 'w', a0: 41.4, a1: 43.4, depth: 0.75, from: 0, to: 0, door: 0, walkIn: true, basement: { door: [42.25, 43.30], side: [41.46, 42.25], height: 2.1, floorEdge: -9.05 } }] },    // #729, #1258: p46 exterior leaf range + sidelight; setback 0.75 and finish/height remain *guess* (formerly decorative, #647)
    { name: 'Hus B', x0: -41.74, x1: -22.6, z0: 33.3, z1: 57.35, base: -3, storeys: 4, roof: 'hip', // våning -1…3
      hip: { box: { x0: -33.59, x1: -30.67, z0: 38.01, z1: 41.91, h: 1.0 } }, // roof plan on the våning 4 sheet (#348)
      corners: { nw: [3.4, 2.0], ne: [3.4, 2.0], se: [5.9, 2.05], sw: [5.9, 2.05] },
      recesses: [{ face: 'n', a0: -34.58, a1: -32.5, depth: 2.1, from: 1, to: 1, door: 1, walkIn: true }, // mirrored: west of the middle; a real door into the stair core (#638, CORE_B)
        { face: 'e', a0: 46.1, a1: 48.1, depth: 1.0, from: 0, to: 0, door: 0, walkIn: true, basement: { door: [46.8, 47.85], side: [46.10, 46.80], height: 2.1, floorEdge: -23.6 } }] },
    { name: 'Hus C', x0: -70.6, x1: -51.4, z0: 12.6, z1: 36.68, base: 0, storeys: 5, roof: 'hip', hip: {}, // våning 1…5; no roof plan: the defaults (#348)
      corners: { nw: [5.5, 2.1], ne: [2.0, 4.15], se: [5.4, 2.0], sw: [6.1, 2.0] },
      recesses: [{ face: 'e', a0: 21.5, a1: 24.8, depth: 2.0, door: 0, walkIn: true }] },  // the entrance, loggias above it; a real door into the stair core (#639, CORE_C)
    // outside the plot (#47): the old S:t Lars hospital buildings, as on Peab's drone photo and aerial
    // render (docs/peab/): red brick with white trim, steep dark hip roofs, high storeys and tall
    // white windows. Storey counts and heights are read off those pictures — guesses, not surveyed.
    // #261: outlines from the situation plan (the user's photos agree: HepCat right by the road, the long building
    // further south behind an open gap); the long building's east side and the annex's depth are off the sheet (guess)
    { name: 'HepCat Store', x0: 28.2, x1: 36.4, z0: -10.8, z1: 10.0, base: 0, storeys: 1, roof: 'gable', style: 'hepcat' }, // #127; roof/chimney: hepcat.model (#1533)
    { name: 'HepCat Store, the white middle', x0: 27.9, x1: 36.4, z0: -2.6, z1: 1.8, base: 0, storeys: 1, roof: 'gable', style: 'hepcatWhite' },
    // #535: school/longhouse placeholders moved to source-based SITE.east; the photo-based wall remains.
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
    crossing: { x0: 9.5, x1: 12.5, z0: -30, z1: -24 }, // #1534: checked against the photo: it lands on the far pavement just west of the shelter
    // #1534: grey concrete slabs in front of the shelter, from the wall / the shelter's back wall to the road's curb, x0…x1
    // (on to the campus road's mouth); a grey timetable pillar at its edge, two big stones by the campus road (all *guess*)
    shelterPaving: { x0: 8.5, x1: 22.5, lift: 0.02, step: 0.5, curb: 0.1, behind: 2.5 }, // `behind`: m further north past the shelter's open end
    timetable: { at: [21.3, -31.5], w: 0.38, d: 0.24, h: 1.85 },
    stones: [], // [x, z, radius]; #1702: the big boulder at the continuing wall's end is `wall.shelter.boulder`
    // #1554 (docs/foton/skolbyggnad-fran-brofastet.jpg): the pedestrian crossing at the road bridge's north end with a refuge island and two yellow bollards, blue crossing signs
    // either side, and the orange vertical HEMSÖ flag by the school's yard mouth. The snapshot has no crossing/island/flag nodes: every position and size is a *guess*, placed by eye from the photo.
    // `crossings`: bars 50 cm wide along the traffic, repeated across the road (`axis: 'x'`: the road runs north-south here) between x0…x1, z0…z1 deep; bars stay clear of the island.
    bridgehead: {
      crossings: [{ x0: 21.4, x1: 28.4, z0: 79.5, z1: 82.5, axis: 'x' }],
      island: { x0: 24.1, x1: 25.7, z0: 78.3, z1: 83.7, h: 0.12, lift: 0.025, bollards: [[24.9, 78.9], [24.9, 83.1]], bollardH: 0.8, bollardR: 0.05 },
      signs: [[29.4, 78.4, 0], [20.4, 83.6, 0]], signY: 2.3, // [x, z, yaw°], on the pavements either side of the road, sign face centre height
      flag: { at: [76.5, 62], pole: 6.4, w: 0.9, h: 2.8, yaw: 0 }, // a banner hanging from the top of the pole
    },
    trafficLight: null, warnings: [], // #1843: this local work is complete; bridgehead bollards/other signs remain.
    cobbles: { x0: 17.2, x1: 19.5, z0: -17.5, z1: -12.5 }, // inside the corner, by the end of our car park
    leaves: { n: 1400, months: [9, 10, 11], areas: [[-60, 12, -24, -18], [-30, 10, -32.1, -30.05], [19, 21, -12, 12]] },
    // signs (#129/#1843): ordinary stops on both existing pole sites; the temporary red cover on ours has been removed.
    // a no-parking sign at the car park, HepCat's A-board on its pavement. [x, z, facing yaw°]
    busStop: [20.6, -28.7, 0], restoredBusStop: [6.5, -23.75, 0], busStopName: 'Lund S:t Lars Karpvägen', busStopFaceOffset: .04, // guess: clear the existing 3 cm-radius pole
    noParking: [-13.6, -16.9, 0], aBoard: [28.4, -12.2, -60], // by HepCat's north corner (#261, photo)
  },
  // Street name signs (#583, src/streetsigns.js; sources and selection: docs/validation/issue-583/README.md). One post at every
  // junction of two differently named streets in the model plus the two clear bends by the block (Sankt Lars väg round the
  // NE corner, Karpvägen into the park); campus service roads and our drive get none. Each `blades` entry lies along a leg
  // of the junction: `dir` = that leg's unit direction [dx, dz] from the junction (roads.js / SITE.*.paths), `nums` = the
  // house numbers that lie that way, drawn with an arrow. Names: OSM 2026-10-08 (docs/references/surrounding-views/).
  // Numbers, never invented: Karpvägen 2–10 = Brf S:t Lars Park's Hus 1–3 (#575); Sankt Lars väg 41–70 = every
  // addr:housenumber the OSM snapshot has on Sankt Lars väg, all south of Höje å (none is mapped by the block, so the near
  // stretch shows the name only; which fork south of the river carries which number is not clear from OSM → names only
  // there); Sävsländegatan 2–20, Nattsländegatan 2–20, Hattsnäckegränden 2–12 = their complete OSM address sets.
  // Källby ängaväg / Alvägen have no mapped numbers. Post positions: at the corner nearest the walkable area (near) or
  // between two legs ~4 m off the junction (far), clear of the asphalt. Look and sizes are visual *guesses* after the
  // usual Swedish blue gatunamnsskylt (white text, white border); no collision (like street.js's signs).
  streetSigns: {
    post: { h: 3.0, r: 0.035, sink: 0.3, color: 0x8e9296 },  // galvanised pole, its foot sunk into the ground (*guess*)
    blade: { w: 1.4, h: 0.28, d: 0.025, gap: 0.05, top: 2.95 }, // blades stacked down from `top` (m over the ground, *guess*)
    colors: { bg: '#1d4f9c', fg: '#ffffff' },                   // blue sign, white text and border (*guess*)
    font: 'bold %px "Arial Narrow", "Helvetica Neue", Arial, sans-serif', // stands in for Tratex; long names are squeezed (*guess*)
    atlas: { w: 1024, h: 1024, cols: 2 },                     // one shared canvas for every blade face (≤ LOW_MEMORY's 1024)
    signs: [
      // near the block
      { at: [-71.2, -21.2], blades: [{ name: 'Karpvägen', nums: '2–10', dir: [0, 1] }, { name: 'Sankt Lars väg', dir: [1, 0] }] }, // Sankt Lars väg × Karpvägen, off the old walker's turn (#114)
      { at: [17.9, -18.6], blades: [{ name: 'Sankt Lars väg', dir: [-1, 0] }, { name: 'Sankt Lars väg', nums: '41–70', dir: [0, 1] }] }, // the bend at the NE corner, on the inner pavement clear of the campus road's mouth
      { at: [-82.2, 68.6], blades: [{ name: 'Karpvägen', nums: '2–10', dir: [-0.976, 0.217] }, { name: 'Karpvägen', dir: [0.293, -0.956] }] }, // Karpvägen's bend into the park
      // the backdrop (OSM junction nodes)
      { at: [-122.19, -35.02], blades: [{ name: 'Källby ängaväg', dir: [-0.82, 0.58] }, { name: 'Sankt Lars väg', dir: [0.83, 0.56] }] },
      { at: [-137.55, -35.2], blades: [{ name: 'Alvägen', dir: [-0.56, -0.83] }, { name: 'Källby ängaväg', dir: [0.85, -0.52] }] },
      { at: [-202.13, 28.2], blades: [{ name: 'Karpvägen', nums: '2–10', dir: [0.36, 0.93] }, { name: 'Källby ängaväg', dir: [0.9, -0.44] }] },
      { at: [23.36, 212.12], blades: [{ name: 'Sankt Lars väg', dir: [-0.51, 0.86] }, { name: 'Sankt Lars väg', dir: [0.13, -0.99] }] }, // the fork south of the river
      { at: [51.14, 218.42], blades: [{ name: 'Sankt Lars väg', dir: [0.25, 0.97] }, { name: 'Sankt Lars väg', dir: [0.9, -0.43] }] },
      { at: [132.92, 219.85], blades: [{ name: 'Sävsländegatan', nums: '2–20', dir: [0.6, 0.8] }, { name: 'Hattsnäckegränden', nums: '2–12', dir: [0.81, -0.58] },
        { name: 'Nattsländegatan', nums: '2–20', dir: [-0.4, -0.92] }] },
      { at: [223.57, 211.17], blades: [{ name: 'Hattsnäckegränden', nums: '2–12', dir: [-0.28, -0.96] }, { name: 'Sävsländegatan', dir: [0.97, -0.25] }] },
      { at: [247.98, 204.21], blades: [{ name: 'Sävsländegatan', nums: '2–20', dir: [0.16, 0.99] }, { name: 'Nattsländegatan', nums: '2–20', dir: [-0.61, -0.79] }] },
    ],
  },
  // Life on the street (#113, src/streetlife.js). #260, the situation plan (docs/peab/kalibrerad/situationsplan-300dpi.jpg):
  // "P-platser för S:t Lars området" between the hedge (z −16.3) and a low green strip along Hus L (z −3.5…−2.9, open at
  // the portik); one row of stalls nose to the hedge (the plan's ticks, z −16.3…−11.3), none from the drive (in front of
  // the portik — the plan's photo covers that stretch: guess) to the east end; the aisle in front of the entrances. Parked
  // car colours are ours. #529: no bicycles along Hus L's entrances. NW of Hus L, north of Hus C, the plan's
  // "Cykelvänligt kvarter" yard: a lawn with a tree and two smaller ones, a paved bike place with two rows of racks, a
  // narrow lawn east of it; light paving round it (west of x −66 is left for the stair down to Karpvägen, #256).
  life: {
    lot: { x0: -70.5, x1: -13, z0: -16.3, depth: 5, stall: 2.5 }, fill: 0.65,
    carColors: [0xf0f0ec, 0x23272c, 0x8d9399, 0x1f6f78, 0x7b1e22, 0x2d4e7a, 0xc9c3b8, 0x0f1012],
    // the low green strip along the entrances: a concrete edge, grass and clipped entrance hedge (clear passages by every front doorway)
    strip: { z0: -3.5, z1: -2.9, h: 0.1, parts: [[-46, -10.6], [-8.5, 5.8]],
      // #496 correction: clipped entrance hedge IN this existing bed; parking shrubs stay original.
      // Assumed 58 cm total height above ground, 44 cm depth and 35 cm clear margin either side of each doorway.
      hedge: { height: .5, depth: .44, rounding: .045, color: 0x48733c, roughness: .92, bump: .009,
        texturePeriod: .32, textureLeaves: 1700, snowDepth: .035, entranceMargin: .35,
        cell: .30, dent: .03, footScale: .9 } }, // #1143 (cell .11 → .17 in #1211, .30 in #1223: perfcount budget): shared hedge form (hedgeform.js), *guess*
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
    // #1351: join the mapped west extension to the local straight without the old 1.58 m right-angle jog; 8 m easing radius is a visual guess.
    { name: 'Sankt Lars väg', path: [[-256.22, -291.48], [-243.52, -289.9], [-237.28, -289.55], [-225.08, -288.32], [-208.34, -287.08], [-195.0, -284.95], [-177.57, -282.79], [-154.54, -277.33], [-151.97, -274.75], [-149.99, -272.15], [-148.38, -269.65], [-147.13, -266.84], [-145.1, -260.27], [-140.56, -241.82], [-135.7, -219.86], [-129.65, -185.87], [-128.8, -178.12], [-127.48, -165.95], [-127.2, -161.66], [-126.9, -141.65], [-127.42, -108.38], [-127.67, -69.23], [-127.53, -61.63], [-126.67, -51.73], [-125.36, -46.47], [-124.14, -42.86], [-122.25, -40.5], [-119.72, -38.26], [-116.31, -36.46], [-110.65, -33.5], [-105.83, -31.41], [-98.07, -29.8], [-82.28, -27, 8], [24.3, -27, 13], [24.1, 0, 30], [25.5, 26, 30], [25.5, 70], [23.9, 100], [23.3, 145.8], [26.53, 188.72]], w: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6.4, 7, 7, 7, 7, 7],
      walks: [{ side: 1, w: 2.5 }, { side: -1, w: 2 }] }, // our pavement; the far one along the school's wall (#126)
    { name: 'Karpvägen', path: [[-75.8, -27], [-75.8, 22, 30], [-79.9, 51, 20], [-84.5, 66, 8], [-105.74,70.72], [-125.37,63.39], [-191.7,40.27], [-196.1,38.73], [-200.83,37.12], [-202.86,35.86], [-204.59,33.56], [-206.22,30.1], [-207.84,25.96]], w: 5.8 },
    { name: 'Karpvägen, hörnen', fillets: [{ x: -78.7, z: -24, sx: -1, sz: 1, r: 9 }, { x: -72.9, z: -24, sx: 1, sz: 1, r: 3 }] },
    { name: 'Gården framför Hus L', x0: -70.5, x1: 13.5, z0: -16.3, z1: -3.5 }, // the car park up to the green strip (#260)
    // the car park's drive (#356): asphalt from Sankt Lars väg over our pavement and the planting strip through the gap in
    // the hedge (SITE.shrubs gaps, x −13…−7.5) into the car park, with rounded mouth corners (the situation plan's photo
    // covers it: guess, like the gap itself, #260)
    { name: 'Infarten', path: [[-10.25, -24.5], [-10.25, -16.1]], w: 5.5 },
    { name: 'Infarten, hörnen', fillets: [{ x: -13, z: -24, sx: -1, sz: 1, r: 2 }, { x: -7.5, z: -24, sx: 1, sz: 1, r: 2 }] },
  ],
  // #729: simple connected park paving, traced approximately from the light strips in the situation plan.
  // Straight strips typically 1.5 m wide; terminal rectangles/route/widths are *guess*, all on existing park ground (-3); no surveyed levels.
  basementPaving: [
    { x0: -47.4, x1: -44.4, z0: 58.6, z1: 59.0 }, // the existing C/B stair's foot (#1204: its full width)
    { x0: -47.4, x1: -16.7, z0: 59.0, z1: 60.5 }, // around B south, clear of its façade/patios
    { x0: -16.7, x1: -15.2, z0: 42.0, z1: 60.5 }, // the green between A/B
    { x0: -22.6, x1: -16.7, z0: 46.45, z1: 47.95 }, // branch to B east
    { x0: -15.2, x1: -11.4, z0: 43.3, z1: 44.8 }, // A dogleg south of the sourced tree at (-14.8,42.2)
    { x0: -11.4, x1: -9.76, z0: 42.0, z1: 44.8 }, // short final approach to A west
    { x0: -27.4, x1: -25.9, z0: 60.5, z1: 66.0 }, // #1341: joins the gravel path from the river park (OSM 123898762, which the park's clip cuts off at z 64) to the walk round B south: it began in the open grass 3.5 m short of it (*guess* position, the path's own end)
  ],
  paving: [
    { x0: -46.33, x1: 13.5, z0: -3.5, z1: 0 },  // path along Hus L's entrances (under the green strip too, #260)
  ],                                         // the pavements: roads' `walks`; the courtyard's own walks: COURTYARD
  // #535: visible terrain extent covers the sourced campus; independent of OUTDOOR walking bounds.
  backgroundGround: {x0:-350,x1:340,z0:-340,z1:460},
  // #532: geographic registration uses FOJAB/DAY.planNorth (58°) and the HepCat OSM footprint centre
  // (way 130578353) matched to the existing Peab-based model centre. Horizontal accuracy ~3–5 m, not surveying.
  geo: {anchor:{lon:13.181015825,lat:55.684965075,x:32.3,z:-.4},source:'OSM 2026-10-08, way 130578353'},
  // Bridge ways 23873379 / 44447984 (same-date OSM snapshot); deck GC length 40 m from Hjalmarssons.
  // All heights, widths, pier dimensions, rail/truss section sizes and colours below are visual ASSUMPTIONS.
  bridges: {road:{ends:[[23.9,100],[23.3,145.8]],width:7.2,slab:.45,pier:.75,foot:1.8},
    gc:{ends:[[18.1,101],[17.8,146.5]],length:40,width:3,slab:.18,truss:1.45,panels:10,steel:.10},
    deckY:-3,waterY:-7,bedY:-7.6,pool:1.2,shoreY:-5.5,shoreSpan:7.5,valleySpan:8.5,rail:1.1,post:.07,railStep:1.9,approach:8,pierMargin:.2,
    // #1285 (supersedes #1271 local underpass cut): Höje å and its valley lie generally lower than the road bridge.
    // Road deck at deckY (-3); waterY (-7), bedY and shoreY below are visual guesses at the road-bridge centre (#1350).
    // #1684: waterY/bedY were -6.2/-6.8, which left the water only 0.7 m under the 15 m wide shore flat (a player report: the river looked like it floated
    // over the ground). Both are 0.8 m lower now (*guess*), the shore flat unchanged, so the water lies 1.5 m under the bank crest; the water
    // ribbon also runs under the whole bank slope (riverbridge.js) and surfaces exactly where the sloping bank meets the water line.
    // #1944: `pool` (m, *guess*, no bathymetry): the bed deepens from bedY at the channel's edge (width/2) to bedY - pool at the centre line, i.e. 1.8 m of
    // water mid-channel, so a diver has room; the bed's edge, the banks, the shore and the water line are unchanged (riverbridge.js riverGround).
    // No surveyed apartment-floor RH2000 datum or measured bathymetry. Riverbed at bedY (-7.6), shore/path at shoreY (-5.5), 1.5 m above water (#1684); gives 2.05 m clearance
    // under road slab and 2.32 m under GC bridge). Valley slopes up from shoreSpan (4.5 m past bank) over valleySpan
    // (8.5 m) to base terrain (-3), meeting the road bridge abutments (ends at z ~100 and z ~145.8) from bank to bank.
    underpass:{floorY:-5.5,pier:.2},
    // #1530: road-bridge cross-section and railings after the user's photos (docs/foton/hoje-a-vagbron-langs-vagen.jpg looks
    // NE along the road = model north, so its left is model west, the GC side; hoje-a-fran-stora-bron-norrut.jpg shows the
    // green parapet close up). Every size and colour here is a *guess* read from the photos; the 7.2 m deck width is kept.
    // West (−x, towards GC): carriageway | verge with guard rail | granite kerb | raised footway | green parapet (wide top
    // rail, X braces between posts, close vertical bars). East (+x): granite kerb | guard rail | #1704 raised G/C path | green parapet (the black plate edge is gone). Concrete edge beams (kantbalkar) on both sides stand above the deck and keep the slab's underside (#1285).
    // #1704 (photo docs/foton/vagbron-gc-bana-bada-sidor.jpg): the east side has a gång- och cykelbana too, built as part of the road
    // bridge's own cross-section (`eastWalk`, *guess* 3 m wide like the west gc bridge, same raised height and green parapet as the west
    // footway), not as a separate bridge: the photo shows it carried by the same slab outside the guard rail, and a separate span would
    // have to sit beside the abutments. The slab, abutments and edge beams widen to the east only; the underside height stays (#1285).
    // West (#1704): the raised footway and the GC bridge (0.4-0.7 m apart, the gap runs out with the two centrelines) read as ONE wide path in the photo, so the
    // road's west parapet and the GC truss's east side are dropped, `westFill` (*guess*) closes the gap on the road slab and the GC bridge's own outer truss is the path's outer rail.
    // #1730 inner: x offsets (*guess*, from docs/foton/vagbron-gc-bana-bada-sidor.jpg) of the tall green slatted rail between the guard rail and the G/C path;
    // west = metres beyond the footway's kerb, east = metres from the east slab edge (w, +x). Same profile as `parapet`.
    roadDeck:{inner:{west:.09,east:-.12},eastWalk:{w:3,h:.12},westFill:{w:.75},edge:{w:.3,up:.25,out:.05},walk:{w:1.4,h:.12},kerb:{w:.15,h:.13},verge:.4,
      parapet:{h:1.15,inset:.08,top:[.15,.04],mid:.12,low:.33,post:.1,bay:2.6,brace:[.06,.02],slat:[.02,.012],slatStep:.11},
      plate:{h:.9,t:.03,rail:1.1,post:.08,bay:2.6},
      guard:{h:.6,beam:.3,t:.05,post:.1,step:3.2,gap:.15},
      colors:{green:0x3d5a4e,black:0x1f2423,galv:0x9ea5a3,granite:0x8f8e8a,gcSteel:0x3d5a4e}}},
  // #532 foundation: sourced horizontal river centreline near the two bridges; #533 owns detailed banks/paths/vegetation.
  // Width and uniform depth remain assumptions; do not describe these as measured water levels or surveyed banks.
  // #1233: `bankScale` (guess) shortens every bank span (visual estimates below) so the slope down to the water is steeper; the real
  // slope is not surveyed. 1 = the #533 profile, 0.55 = roughly 25-35 degrees mid-slope.
  river: {width:8,bank:10,bankScale:.55,
    // #1350: interpreted relative downstream trend from #1349's 19 ground-model points (Lantmäteriet via kart-api, CC BY4.0).
    // Median of171 pairwise slopes, reproduced by tools/riverfall.mjs; ~0.482m fall over525.646m. NOT measured water/bathymetry.
    // Existing water/bed/shore levels stay anchored at the road-bridge centre; the bank/valley cross-section is still a guess.
    // #1790: the 19 sampled stations are path[upstream.count …] (the #532 section); the trend is extrapolated over the upstream stretch
    // (no elevation samples there, *guess*). It stays anchored at the road bridge, so every existing level is unchanged.
    fall: { perM: 0.0009170995546035121 },
    // #533 widths/bank spans are visual estimates from the aerial/2016 photos, not surveyed dimensions.
    // #1531: the user's photo from the bridges looking west (docs/foton/hoje-a-fran-stora-bron-norrut.jpg) shows a narrow, overgrown
    // channel (~4–6 m of open water): #532-section vertices 6–10 (x 75 … −67, the stretch through the bridges; path index + upstream.count)
    // narrowed from 9,8,8,8,7 (*guess*).
    // `valleyWidths` keeps the #533 widths for the shore flat/valley footprint (riverGround), so the walking shore, under-bridge paths
    // and piers stay put: the bank from bed to shore keeps its slope and the wider shore flat carries the reeds and understory.
    // #1790: the six upstream vertices take the neighbouring #533 vertex's 6 m channel, 6 m valley and 13 m bank (*guess*: no photo or survey there).
    widths:[6,6,6,6,6,6, 6,6,7,8,8,9,7,4,3.5,4,5.5,7,6,6,6,7,7,6,6],
    valleyWidths:[6,6,6,6,6,6, 6,6,7,8,8,9,9,8,8,8,7,7,6,6,6,7,7,6,6],
    banks:[13,13,13,13,13,13, 13,14,15,12,11,12,13,11,10,10,12,14,13,7,3,3,13,12,10],
    // #1790 (the user: Höje å all the way to Malmövägen, which crosses it on a short bridge, OSM 57357001, ~(456, -24), east of the terrain):
    // `upstream.count` OSM nodes of way 137217705 (same 2026-10-08 snapshot and registration, sitegeo.js) prepended up to the terrain's east
    // edge (x 340); EDGE_BACKDROP's 'Höje å uppströms' strip carries the river on from the edge to Malmövägen. The old section starts at index `count`.
    // North of z 60 the terrain only took the river's profile west of x 195 (the home block's guard); the valley opens over `open` x (m)
    // east of it. The old `edgeFade` transition remains outside the river corridor; #1814 joins the channel itself to carved far banks instead
    // of rising over the water. Widths, bank/fall extrapolation and transitions remain *guess*.
    upstream: { count: 6, open: [195, 210], edgeFade: 8, boundary: [340, 25.38] },
    // #1814: further OSM way 137217705 nodes through the west terrain edge; existing path/station indices stay intact.
    // Width, bank and relative fall beyond the sampled section remain the neighbouring visual assumptions.
    downstream: { path: [[-256.19,263.74],[-268.91,283.27],[-292.46,311.54],[-308.44,332.5],[-322.75,343.94],[-338.5,351.1],[-350,355.5]] },
    // #1800: the terrain took the river's profile only south of z 60 (the home block's guard), a step of up to ~2.2 m at z 60 for x ~140-195;
    // north of z 60 the profile now eases out over `northFade` m (*guess*: the widest bank is 15 m). South of z 60 nothing changes.
    northFade: 16,
    terrainSubdivisions:3, terrainRefineRadius:28, path:[[333.48,25.71],[300.14,33.37],[280.48,38.61],[259.89,49.27],[228.37,59.59],[216.35,64.62],
    [204.64,74.37],[190.76,79.13],[131.38,74.61],[127.15,83.64],[124.35,101.96],
    [116.11,114.02],[105.35,119.29],[74.99,119.53],[44.31,119.8],[1.16,125.14],[-15.1,129.89],[-67.45,166.11],
    [-89.43,183.37],[-101.32,198.71],[-110.41,205.34],[-181.7,207.36],[-220.92,225.61],[-235.63,235.51],[-248.18,251.46]],
    source:'OSM river way 137217705, local section registered to the existing model; 2026-10-08 (upstream nodes to x 340: #1790)'},
  // #533: main park paths are OSM 2026-10-08; canopy patches/glade traced approximately on the registered aerial.
  // Counts, species mix, widths, heights, branch detail and the small western timber bridge are visual ASSUMPTIONS.
  // Nearby Peab trees and OUTDOOR remain unchanged. No claim of an individual-tree survey.
  // #1235: every path carries `surface` (asphalt|gravel) from its OSM `surface` tag (asphalt/paved -> asphalt; unpaved/ground/dirt/untagged -> gravel).
  // OSM has no highway=cycleway along the river in the modelled area (the mapped cycleways lie north of Lunden and far south), so the asphalt
  // paths (path + surface=asphalt, shared foot/cycle use) are the cycle route. Surface colours and the widths of the added ways are *guess*.
  riverPark: {
    surfaces: {asphalt:{color:0x5f6164},gravel:{color:0xb5ac90}},
    paths: [
      {"source":"27185148","surface":"asphalt","path":[[-200.07,180.53],[-200.37,184.39],[-201.95,187.43],[-208.76,194.32],[-215.41,200.85],[-227.39,211.23],[-237.82,219.32],[-248.16,229.58],[-255.99,242.35],[-265.44,257.65],[-270.74,265.48],[-272.82,267.58]],"w":2.4},
      {"source":"44447962","surface":"asphalt","path":[[44.88,203.85],[37.91,203.57],[28.48,203.89],[21.24,203.65]],"w":2.4},
      {"source":"44447963","surface":"gravel","path":[[103.93,63.38],[101.0,69.87],[95.97,75.69],[89.35,79.83],[59.89,90.49],[51.41,95.47],[36.22,106.44],[29.23,110.87],[6.57,111.81],[-3.04,112.12],[-19.69,116.64],[-41.72,125.32],[-58.01,134.01],[-76.42,143.99],[-87.02,150.59],[-100.48,158.69],[-112.31,163.72],[-143.19,174.31]],"w":1.8},
      {"source":"44447964","surface":"asphalt","path":[[21.24,203.65],[19.97,211.53],[16.84,219.12],[13.53,223.29],[10.63,226.42],[2.42,232.88]],"w":2.4},
      {"source":"44447973","surface":"gravel","path":[[-143.19,174.31],[-164.82,132.16],[-179.29,118.02],[-197.07,110.89],[-210.7,111.1],[-222.98,112.95],[-235.57,116.6],[-244.18,117.27]],"w":1.8},
      {"source":"51890086","surface":"asphalt","path":[[-131.05,199.16],[-143.19,174.31]],"w":2.4},
      {"source":"123898761","surface":"gravel","path":[[-38.41,84.43],[-43.7,86.47],[-60.68,87.01],[-70.18,84.72]],"w":1.8},
      {"source":"123898762","surface":"gravel","path":[[-41.72,125.32],[-40.18,109.62],[-39.76,91.6],[-38.41,84.43],[-34.53,80.61],[-31.15,75.44],[-28.7,67.46],[-26.65,63.98]],"w":1.8},
      {"source":"123898768","surface":"asphalt","path":[[-200.07,180.53],[-191.63,180.56],[-165.47,178.9],[-143.19,174.31]],"w":2.4},
      {"source":"130537426","surface":"gravel","path":[[-70.18,84.72],[-69.95,91.15],[-72.1,126.02],[-76.42,143.99]],"w":1.8},
      {"source":"185706718","surface":"gravel","path":[[2.42,232.88],[-19.44,235.65],[-37.76,238.95],[-52.03,241.04],[-64.21,239.79],[-81.58,235.31],[-95.84,232.68],[-106.42,229.2],[-111.74,227.09]],"w":1.8},
      {"source":"1228396153","surface":"asphalt","path":[[92.56,207.89],[83.04,205.95],[76.03,204.19],[58.01,201.56],[51.45,202.12],[44.88,203.85]],"w":2.4},
      {"source":"1432565773","surface":"asphalt","path":[[-111.74,227.09],[-116.2,219.98],[-121.76,214.85],[-124.08,212.06]],"w":2.4},
      {"source":"1432565775","surface":"asphalt","path":[[21.24,203.65],[19.52,177.95],[17.8,146.49]],"w":2.4},
      {"source":"44447981","surface":"asphalt","path":[[18.22,80.29],[18.05,100.96]],"w":3},
      // #1235: remaining mapped asphalt/paved (shared walking+cycling) and unpaved paths of the river park, OSM way coordinates; widths are guesses.
      {"source":"61112061","surface":"asphalt","path":[[540.61,192.9],[530.74,191.76],[526.36,191.07],[524.71,190.8],[521.43,189.0],[519.92,188.06],[518.66,184.69],[520.02,165.18],[517.0,125.47],[513.53,111.39],[505.05,82.87],[492.31,51.73],[489.97,47.96],[486.88,43.91],[483.28,41.81],[479.89,40.96],[475.36,40.79],[465.24,44.85],[456.09,48.6],[440.8,55.23],[417.75,66.1],[375.54,84.82],[345.04,98.55],[303.67,116.66],[279.76,127.45],[264.15,132.96],[247.57,138.78],[234.38,141.11],[214.89,146.1],[197.53,150.66],[183.63,155.17],[162.53,160.06],[143.76,166.49],[129.95,170.84],[119.47,173.94],[112.87,177.46],[107.67,182.72],[97.39,197.8],[93.47,205.4],[92.56,207.89]],"w":2.4},
      {"source":"95035891","surface":"asphalt","path":[[-180.81,367.04],[-185.31,356.11],[-187.52,349.84],[-187.8,344.03],[-186.99,336.47],[-185.6,330.73],[-182.84,325.12],[-176.85,319.08],[-137.33,290.79],[-135.2,289.34],[-131.87,286.33],[-125.24,279.92],[-121.48,274.69],[-117.58,268.07],[-114.01,258.81],[-111.83,248.67],[-110.01,236.37],[-111.74,227.09]],"w":2.4},
      {"source":"148276374","surface":"asphalt","path":[[92.56,207.89],[103.53,210.79],[109.35,212.09],[114.28,217.79],[118.7,223.57],[156.3,277.38],[164.46,289.13],[170.93,298.19],[170.45,303.9]],"w":2.4},
      {"source":"237019752","surface":"asphalt","path":[[-6.65,240.02],[-19.42,248.89],[-44.62,267.09],[-55.63,275.27],[-67.28,285.78],[-72.05,291.41]],"w":2.4},
      {"source":"1432565774","surface":"asphalt","path":[[2.42,232.88],[-6.65,240.02]],"w":2.4},
      {"source":"130448444","surface":"asphalt","path":[[-227.39,211.23],[-239.49,198.6],[-247.13,192.86],[-254.92,189.89],[-258.99,189.43]],"w":2.4},
      {"source":"159284497","surface":"asphalt","path":[[-292.69,45.08],[-293.03,50.25],[-292.31,55.08],[-288.79,58.92],[-285.33,60.75],[-279.68,63.3],[-273.38,68.22],[-269.62,73.71],[-264.15,83.08],[-252.89,102.35],[-244.18,117.27],[-237.8,128.53],[-223.45,149.8],[-200.07,180.53]],"w":2.4},
      {"source":"44447975","surface":"gravel","path":[[-67.28,285.78],[-74.14,288.35],[-77.74,286.17],[-82.45,282.01],[-87.81,273.05],[-99.24,249.59],[-111.74,227.09]],"w":1.8},
      {"source":"1320452139","surface":"gravel","path":[[109.35,212.09],[114.79,213.27],[117.37,212.86],[121.04,211.21],[122.86,208.89]],"w":1.8},
      {"source":"909507376","surface":"gravel","path":[[-273.09,97.16],[-264.15,83.08]],"w":1.8},
      {"source":"909507377","surface":"gravel","path":[[-320.93,123.26],[-313.22,116.44],[-301.24,108.32],[-283.51,101.35],[-273.09,97.16],[-257.74,100.06],[-252.89,102.35]],"w":1.8},
      {"source":"185706716","surface":"gravel","path":[[-59.87,262.16],[-57.18,263.63],[-55.03,265.37]],"w":1.8},
      {"source":"185706717","surface":"gravel","path":[[-44.62,267.09],[-48.82,267.2],[-50.64,267.34],[-53.0,267.91],[-53.64,268.53],[-54.19,269.83],[-54.6,271.62],[-55.63,275.27]],"w":1.8},
    ],
    patches: [
      {"name":"western-bank","polygon":[[-250,238],[-232,216],[-180,194],[-140,196],[-139,214],[-190,222],[-232,248]],"n":18},
      {"name":"north-bank","polygon":[[-125,185],[-104,164],[-78,143],[-52,127],[-15,121],[-1,130],[-26,149],[-69,170],[-107,199]],"n":20},
      {"name":"south-bank","polygon":[[-106,221],[-101,191],[-69,180],[-27,155],[5,138],[4,165],[-52,196],[-85,230]],"n":17},
      {"name":"bridge-east-bank","polygon":[[35,106],[74,105],[112,107],[120,121],[83,140],[39,144]],"n":14},
      {"name":"eastern-bend","polygon":[[121,61],[166,58],[202,61],[211,83],[183,95],[139,96],[139,114],[126,116],[115,93]],"n":15},
      {"name":"park-edge","polygon":[[-129,80],[-110,82],[-83,106],[-92,135],[-106,137],[-130,112]],"n":6},
      {"name":"bridge-west","polygon":[[-64,112],[-8,106],[13,108],[13,140],[-8,144],[-64,146]],"n":18,"scale":[0.85,1.35],"kinds":{"tree":0.6,"birch":0.4}}, // #1531 (guess): the leafy wall west of the bridges, ordinary trees and birches with low crowns
      // #1674: the valley's two OSM landuse=forest areas that lie inside the river park (way 165719099: the wooded south slope towards the bus stop; way 333646812: the north bank under Karpvägen),
      // filled with big, broad crowns spaced `spacing` m apart (fewer, larger crowns than the older patches; the same shared instanced batches, so no extra draw calls). Polygons are the OSM nodes
      // (docs/references/surrounding-views/osm-south-2026-10-08.json) projected by sitegeo.js; `n` (exact, not multiplied by treeDensity) and `scale` are *guess* values for the dense canopy of the Google 3D view.
      {"name":"forest-165719099","source":"165719099","polygon":[[-48.6,180.3],[-31,171.5],[-11.9,165.3],[7.6,166.3],[14.2,171.7],[14.2,184.9],[10.9,213.3],[2.1,223.5],[-25.6,230.1],[-37.7,231.7],[-52.6,219.1],[-57.1,205.9]],"n":34,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      {"name":"forest-333646812","source":"333646812","polygon":[[-129.1,196],[-119.7,176],[-120.2,169.1],[-110.1,164.7],[-98.8,159.9],[-87.5,153.1],[-70.7,143.9],[-61.4,139],[-56,140.4],[-48.9,145],[-46.2,147.4],[-59.3,155.1],[-75.5,166.3],[-90.1,177.7],[-101.7,189.8],[-112.9,198.5],[-121.8,201.5],[-127.3,201]],"n":16,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      // #1685: the rest of the valley's wooded slopes, which Google 3D shows as continuous canopy (OSM has no more landuse=forest ways inside the park). *guess* polygons that follow the corridor beyond the older
      // patches (north of the western reach and its far tip; the pony paddock along the south bank is left alone; both sides of the eastern reach and the south side of its bend); same big crowns and spacing as #1674, placed after every older patch so they only fill the gaps between earlier trees.
      {"name":"forest-west-north","polygon":[[-262,218],[-238,196],[-205,186],[-160,185],[-142,193],[-146,200],[-190,197],[-232,222]],"n":14,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      {"name":"forest-west-south","polygon":[[-300,262],[-282,252],[-262,262],[-266,276],[-290,276]],"n":4,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      {"name":"forest-east-north","polygon":[[36,98],[70,92],[100,96],[112,104],[84,108],[40,106]],"n":6,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      {"name":"forest-east-south","polygon":[[38,146],[84,142],[116,126],[124,134],[96,156],[60,168],[40,168]],"n":7,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      {"name":"forest-bend-south","polygon":[[139,98],[183,97],[211,85],[218,94],[186,112],[140,116]],"n":6,"exact":true,"spacing":8.5,"scale":[1.7,2.5]},
      // #1790 (*guess*): a loose belt of bank trees along the upstream stretch to the terrain's east edge (SITE.river.upstream); last, so every older patch keeps its trees
      {"name":"upstream-banks","polygon":[[214,50],[240,40],[272,23],[300,15],[326,9],[328,42],[302,53],[280,59],[250,70],[226,80]],"n":10},
    ],
    glades: [
      {"name":"central-lawn","polygon":[[-93,89],[-76,83],[-46,86],[-46,111],[-65,121],[-86,124]]},
    ],
    treeScale: [1.2,2.6], // #1804 (*guess*): wider size spread for the valley canopy (was 1.35–2.35); positions unchanged
    treeSpacing: 6,
    treeDensity: 1.45, // #1233 (guess): multiplies each patch's `n`, denser woodland by the river
    // #1804 (*guess*, Google 3D set 2026-11-02: the valley is a closed canopy): smaller ordinary trees (kind 'tree', one lobe each, ~106
    // triangles) filling the gaps between the patch trees, `n` per named patch, at least `spacing` m from every park tree; their own
    // `seed`, built after every other site tree. Desktop only: phones (lowMemory) keep exactly the older trees.
    infill: { seed: 1804, spacing: 4.5, scale: [1.0, 1.6], patches: { 'western-bank': 6, 'north-bank': 8, 'south-bank': 8, 'bridge-east-bank': 5, 'eastern-bend': 5, 'forest-west-north': 4 } },
    shrubScale: [0.8,1.9],
    shrubCount: 190,
    shoreCount: 380,
    // #1790 (*guess*): shore tufts and shrubs sampled along the six upstream segments (SITE.river.upstream) in their own seeded loops, about the
    // older segments' density per segment, so the #533 stretch keeps its exact layout
    upstream: { shore: 120, shrubs: 50, seed: 1790 },
    shoreHeight: [0.25,0.7],
    shoreOffset: [0.5,2.2],
    pathClearance: 0.6,
    bridgeClearance: 1.5,
    branchCount: 3,
    woodBridge: {"source":"51890085","ends":[[-131.05,199.16],[-124.08,212.06]],"width":2.2,"deckY":-3,"slab":0.22,"rail":1.1,"postStep":2,"railSize":0.08,"postSize":0.1,
      // #1337/#1338: the deck ends on earth ramps, no vertical abutment boxes. Along the bridge axis the fill falls from deckY by `slope` per metre over `length` m (it then lies under the valley terrain, which rises to meet it);
      // #1378: grassLift retains the existing -1 cm rendered grass offset; shared by its mesh and lamp support.
      // `flank`: the fill's sides fall this much per metre sideways (under WALK.maxSlope, so they are walkable); `front`: the steep fill face towards the river under the deck end; `reach`: half-width of the fill (m, from its axis); `dirs`: each ramp's heading away from the deck end - towards the next points of the mapped park paths 51890086 (NW) and 1432565773 (SE; it also keeps the fill off the paddock fence beside that path). All *guess* values: the heights are the DSM estimate.
      "ramp":{"grassLift":-0.01,"slope":0.125,"length":14,"flank":0.6,"front":1,"reach":3.6,"dirs":[[-0.439,-0.898],[0.704,0.71]]}},
    // #1531: the view west from the bridges after the user's photo (docs/foton/hoje-a-fran-stora-bron-norrut.jpg, true NNW = model west):
    // a weeping birch on the south (left) bank and a weeping willow on the north (right) bank closest to the bridges, maples under the
    // willow, reeds standing in the water margins and a dense leafy wall beyond. Positions, sizes and species are *guess* from the photo.
    // `x`: the stretch [west, east] (plan x) the reeds/extra understory fill (east end just short of the GC deck); `specimens`: [x, z, scale,
    // kind] (`weep`: the hanging birch/willow crowns in surroundings.js); `reeds`: tall shore-growth tufts from `edge` m inside the water edge
    // (`edge[0]` by the bridge, `edge[1]` at the far end, so the reed narrows the channel further away) to `edge[2]` m up the bank;
    // `shrubs`: extra understory on both banks of the stretch, `offset` [min, max] m from the water edge.
    bridgeView: {x: [-60, 14],
      specimens: [[7.5, 131.5, 1.25, 'weepingBirch'], [1.5, 134, 1.05, 'weepingBirch'], [9, 116.6, 1.3, 'willow'], [3.5, 118.6, 0.95, 'tree'], [-3, 117.6, 1.05, 'tree']],
      reeds: {count: 240, height: [0.9, 1.9], radius: [0.12, 0.34], leaves: 8, edge: [0.6, 1.5, 0.8]},
      shrubs: {count: 80, offset: [0.6, 5]},
    },
    shoreRadius: [0.16,0.46],
    shoreLeaves: 5,
    shrubAspect: [1,0.65,0.8],
    twigWidth: 0.2,
    branchReach: 2,
    branchRise: 1,
    branchWidth: 0.55,
  },
  // #1301: the bus stop "Lund Sankt Lars" (A) at the fork south of the river, where the asphalt cycle route to Circle K (OSM 61112061,
  // SITE.riverPark.paths) meets Sankt Lars väg. Source OSM 2026-10-18 (api.openstreetmap.org, docs/references/surrounding-views/bus-stop-sankt-lars-2026-10-18.json):
  // platform way 189432570 (bench, bin, shelter, lit, tactile_paving; Skånetrafiken), shelter node 2000527685, stop_position 2000527662, the bus bay
  // roads 189432572 / 95035967. The platform way is its road-side kerb line; the platform lies on the far side (width, heights, colours: *guess*).
  // Generic Swedish-style bus shelter and green/yellow stop sign without any operator logo; every dimension is a visual *guess*. Plan coordinates via SITE.geo.
  busStop: {
    source: 'OSM way 189432570 + node 2000527685 (2026-10-18)',
    kerb: [[33.39, 190.95], [35.59, 192.31], [51.45, 202.12]], // the platform way: the road-side edge, platform to its left (−normal)
    width: 3.6, lift: 0.04, kerbH: 0.1, kerbW: 0.18, // platform width (m), surface lift over the ground, kerb stone height / width (*guess*)
    tactile: { w: 0.6, color: 0xd8c25a, from: 0.25, len: 6 }, // tactile paving strip along the kerb (OSM tactile_paving=yes), pale yellow, 6 m centred on the node 2000527695 (*guess*)
    colors: { paving: 0x8d8b86, kerb: 0xbdb9b0, steel: 0x3b4046, wood: 0x9a6b3f, glass: 0xaecbd0, bin: 0x2f5d3a },
    shelter: { at: [36.89, 189.99], len: 3.4, depth: 1.5, h: 2.5, roof: 0.1, glassY: [0.15, 2.3], post: 0.08, bench: { len: 2.0, depth: 0.42, h: 0.46 } }, // node 2000527685 = the shelter's centre; sizes *guess*
    sign: { s: 11, t: 0.55, h: 2.6, panel: [0.5, 0.7], colors: { bg: '#0b5d3b', fg: '#ffffff', accent: '#f2c400' }, name: 'Sankt Lars' }, // stop sign s m along the kerb from its first point, t m in from it (the bus's stopping point, *guess*)
    bin: { s: 5.2, t: 2.8, r: 0.17, h: 0.8 }, // OSM bin=yes (position *guess*)
    cycleSign: { at: [60.5, 199.9], yaw: -90, h: 2.4, panel: [0.6, 0.21], color: '#1d5fb4', text: 'Circle K' }, // direction sign beside the cycle route (OSM 61112061, 2.4 m asphalt) 9 m east of the platform end; faces west (yaw: normal = (sin, cos)); *guess*
  },
  // #534 west: exact OSM footprint points registered by SITE.geo; levelsSource distinguishes tagged floors.
  // Heights, colours, windows and roof details are visual assumptions. Access paving/tree locations are approximate aerial traces.
  west: {
    buildings: [
      {"source":"88457595","polygon":[[-158.68,-1.64],[-133.86,21.34],[-132.7,20.1],[-125.0,27.23],[-126.15,28.48],[-101.59,51.23],[-93.17,42.14],[-114.82,22.09],[-112.14,19.2],[-125.86,6.5],[-128.67,9.53],[-150.39,-10.6],[-158.68,-1.64]],"name":"\u00d6stra l\u00e4ngan vid Karpv\u00e4gen","levels":4,"levelsSource":"visual assumption"}, // #1680: four storeys, pale grey façade, dark roof as the light buildings by Watson Detective Dogs in the Google 3D view (*guess*)
      {"source":"342815181","polygon":[[-130.47,90.14],[-121.66,80.77],[-113.22,88.71],[-102.44,98.85],[-111.26,108.21],[-130.47,90.14]],"name":"Karpv\u00e4gen 10","levels":4,"levelsSource":"OSM","karp":{"hus":1,"stairs":[0.5]}},
      {"source":"342815182","polygon":[[-153.7,124.37],[-192.7,87.66],[-183.95,78.35],[-173.43,88.24],[-155.62,105.01],[-144.94,115.06],[-153.7,124.37]],"name":"Karpv\u00e4gen 6\u20138","levels":4,"levelsSource":"OSM","karp":{"hus":2,"stairs":[0.3,0.7]}},
      {"source":"342815183","polygon":[[-231.56,32.51],[-224.31,39.32],[-222.72,40.83],[-207.76,54.91],[-197.32,64.74],[-206.06,74.02],[-231.46,50.11],[-236.1,55.04],[-244.93,46.73],[-231.56,32.51]],"name":"Karpv\u00e4gen 2\u20134","levels":4,"levelsSource":"Brf facts","karp":{"hus":3,"stairs":[0.3,0.7]}},
      {"source":"476125237","polygon":[[-149.41,68.89],[-152.38,66.19],[-147.9,61.25],[-144.93,63.95],[-149.41,68.89]],"name":"Komplementbyggnad 476125237","levels":1,"levelsSource":"visual assumption"},
      {"source":"476125238","polygon":[[-133.68,88.04],[-138.18,83.93],[-128.48,73.32],[-123.98,77.43],[-133.68,88.04]],"name":"Komplementbyggnad 476125238","levels":1,"levelsSource":"visual assumption"},
      {"source":"476125239","polygon":[[-143.85,79.7],[-148.03,75.77],[-136.81,63.83],[-132.62,67.77],[-143.85,79.7]],"name":"Komplementbyggnad 476125239","levels":1,"levelsSource":"visual assumption"},
    ],
    paths: [
      {"source":"44447979","path":[[-106.67,73.46],[-105.74,70.72],[-114.61,59.62],[-123.24,44.7],[-126.11,38.14],[-129.39,33.03],[-136.69,26.15],[-169.74,-4.22]],"w":1.8},
      {"source":"342815184","path":[[-157.59,80.9],[-161.1,77.79]],"w":1.8},
      {"source":"342815185","path":[[-155.54,96.56],[-147.16,87.38]],"w":1.8},
      {"source":"342815186","path":[[-151.23,100.52],[-155.62,105.01]],"w":1.8},
      {"source":"342815187","path":[[-169.24,83.98],[-173.43,88.24]],"w":1.8},
      {"source":"342815188","path":[[-109.52,80.55],[-123.94,75.7],[-131.02,69.62]],"w":1.8},
      {"source":"342815190","path":[[-164.4,88.42],[-157.59,80.9],[-140.42,61.94]],"w":1.8},
      {"source":"342815193","path":[[-204.7,51.42],[-169.24,83.98],[-164.4,88.42],[-155.54,96.56],[-151.23,100.52],[-139.68,111.12],[-144.4,114.7]],"w":1.8}, // #1346: the last point is a *guess*: the walk along the façade ended in open grass at the gable, so it now turns in to the SE gable corner of Karpvägen 6–8
      {"source":"342815195","path":[[-196.65,42.17],[-192.69,43.58],[-140.42,61.94],[-127.94,66.21],[-106.67,73.46],[-109.52,80.55],[-113.22,88.71]],"w":1.8},
    ],
    access: [
      {"source":"333642399","path":[[-105.74,70.72],[-94.36,79.13],[-87.63,84.85],[-82.37,86.66],[-77.43,86.81],[-70.18,84.72],[-67.08,80.8],[-64.88,72.28],[-64.54,67.71],[-65.92,63.05],[-79.26,48.81]],"w":3.5},
      {"source":"342815192","path":[[-147.16,87.38],[-131.02,69.62],[-127.94,66.21],[-125.37,63.39]],"w":3.5},
      {"source":"342815194","path":[[-191.7,40.27],[-192.69,43.58],[-193.8,47.27],[-193.23,49.03],[-191.44,50.93],[-161.1,77.79]],"w":3.5},
      {"source":"aerial approximate parking trace 1","pixels":[[539,226],[554,228],[555,272],[536,274]],"polygon":[[-218.85,44.5],[-212.51,36.83],[-187.61,51.61],[-193.12,62.9]]},
      {"source":"aerial approximate parking trace 2","pixels":[[532,294],[552,291],[541,350],[520,356]],"polygon":[[-183.36,72.11],[-178.06,59.9],[-148.98,86.61],[-152.96,100.41]]},
      {"source":"aerial approximate parking trace 3","pixels":[[566,388],[583,386],[596,440],[579,443]],"polygon":[[-119.07,85.9],[-114.26,75.72],[-79.61,87.3],[-83.86,97.82]]},
    ],
    trees: [[-100,13,1.5],[-101,27,1.6],[-91,40,1.4],[-107,57,1.65],[-143,43,1.8],[-162,25,1.8],[-157,56,1.6],[-191,67,1.7],[-202,94,1.9],[-221,95,1.8],[-219,123,1.9],[-193,140,1.6]],
    storey: 3,
    roofRise: 1.5,
    annexRise: 0.5,
    window: [1.25,1.55],
    sill: 0.85,
    bay: 3.5,
    frame: 0.08,
    facade: 0xe3e1dc, // #1680: pale grey-white (was beige 0xd1c6b2) as the light four-storey houses in the Google 3D view of 2026-10-29 (colour read from the image, *guess*)
    roof: 0x4a5664,   // #1680: dark blue-grey (was green-grey 0x56605d), as every roof in that view (*guess*)
    plinth: 9999754,
    glass: 3230037,
    pathLift: 0.025,
    // #575 Karpvägen 2–10 (Brf S:t Lars Park; docs/validation/issue-575/README.md). Sourced: four storeys, red brick, flat felt roofs
    // (Brf "Mäklarinfo": tre fyravåningshus, tegel/puts, papptak); the Brf colour photo (date unknown): three brick storeys with a dark
    // metal coping, a recessed light-rendered fourth storey with dark sheet-metal end volumes, white-framed windows, vertical strips of
    // windows with pale infill panels; the planned project render (not the as-built) and the situationsplan: all balconies stacked on the
    // park (south-west) side, Hus 1 = Karpvägen 10, Hus 2 = 6–8, Hus 3 = 2–4, parking/entrances on the Karpvägen (north-east) side.
    // `stairs` = stair-strip positions along the entrance side (fraction of that façade's length). EVERY dimension and count below is a
    // visual *guess* read from those images, not a measurement.
    karp: {
      park: [-0.69, 0.72],      // unit direction of the park side (SW, situationsplan); façades facing it within ~45° get the balconies
      brickLevels: 3,           // brick storeys under the recessed top storey (photo)
      plinth: 0.35,             // light concrete plinth above the highest ground (*guess*)
      parapet: 0.45,            // brick parapet above the top-storey floor, capped with dark metal (*guess*)
      coping: 0.22,             // dark coping band height (*guess*)
      setback: 1.6,             // recess of the light top storey behind the brick face (*guess*)
      topHeight: 2.9,           // top storey from the parapet to the roof edge (*guess*)
      fascia: 0.32,             // dark roof-edge band of the top storey (*guess*)
      endBox: { length: 4.6, width: 6, rise: 0.25, window: [2.4, 1.7] }, // dark metal end volumes at both ends of the long axis, flush with
                                // the gable at its park-side corner (photo/render; size *guess*, corner read from both images)
      bay: 3.6,                 // window rhythm on the brick façades (*guess*)
      gableStrip: 15,           // gables shorter than this get one central strip of windows and pale panels (photo; *guess*)
      topBay: 4.4,              // window rhythm in the top storey (*guess*)
      window: [1.1, 1.5], sill: 0.85, frame: 0.07, mullion: 0.06, // white-framed windows (*guess*)
      strip: { width: 1.35, window: 1.45, door: [1.5, 2.3] }, // stair / gable strips: glazing per storey, pale panels between (*guess*)
      balcony: { spacing: 10.5, width: 4.4, depth: 1.6, slab: 0.2, rail: 1.05, glass: [2.6, 2.2], groundLift: 0.45 }, // stacked park-side
                                // balconies (render; count per façade = length / spacing, all sizes *guess*)
      roofBox: [2.4, 1.3, 1.2], // white roof housings (render; size *guess*)
      brick: { mortar: '#c4beb5', base: [172, 96, 82], variation: 24 }, // the photo's salmon-red brick, light mortar (colours read from the photo)
      colors: { render: 0xeeeeea, metal: 0x3b3f43, coping: 0x2f3236, frame: 0xf2f1ec, panel: 0xdfe9e3, plinth: 0xb4b1aa,
        slab: 0xf3f2ee, rail: 0xd9e4e5, roofBox: 0xe6e6e2, roof: 0x465263, canopy: 0x3b3f43 }, // #1680: roof 0x465263 dark blue-grey instead of 0x34373a, matching the dark roofs on the brick houses (Audionom, Lingua Montessori) in the Google 3D view (*guess*)
    },
  },
  // #535: east-campus source polygons replace old illustrative school/longhouse blocks; HepCat is preserved.
  // Named campus polygons identify buildings; names are orientation only. All floor counts/heights/roof details remain assumptions.
  // #536 existing south-bank OSM footprints/landuse. All untagged heights, colors and roof details are visual assumptions.
  south: {
    // #1418: OSM 2026-10-08 addressed main bodies; building=yes does not verify use or window positions.
    // Seven unaddressed/uncertain bodies stay blank. Longitudinal-only rows, face cutoff and spacing are visual guesses.
    lowRiseWindows: { parallelCos: .98, minFaceShare: .45, sources: [
      ...SOUTH_LARS_VAG,
      ...SOUTH_VILLAS,
    ] },
    // #1677: the terraced houses and villas by Nattsländegatan, Sävsländegatan and Hattsnäckegränden (the `lowRiseWindows` rows
    // after Sankt Lars väg) are red-brown with dark grey, low-pitched roofs, some with solar panels, in the Google 3D view of
    // 2026-10-29. Every colour, pitch and panel placement is a *guess* read from that image. `rise` replaces the 1.6 m gable (annexes `annexRise`);
    // `solar`: dark quad on the south slope, `along`/`across` fractions of the ridge length / half the span, `lift` over the roof (m).
    // #1795 (Google 3D review 2026-11-02, 03_sodra_bebyggelse): the terraces are not one colour: salmon/pink-orange to beige render and
    // grey to blue-grey roofs, a little different in pitch. `facades`/`roofs`/`rises` are small palettes; each house takes one entry
    // from a hash of its OSM id (stable, not random; the first entries are the old single values). All *guess*, read by eye.
    villas: { facade: 0x9a4f3f, roof: 0x4b4e53, rise: 0.95,
      facades: [0x9a4f3f, 0xb8664d, 0xc4806a, 0xa95c47, 0xc99a7c, 0xb2705a],
      roofs: [0x4b4e53, 0x5d636b, 0x3f4349, 0x6b727c, 0x555d6b],
      rises: [0.95, 0.8, 1.1],
      solar: { color: 0x1f2735, lift: 0.04, along: [0.12, 0.88], across: [0.1, 0.85], sources: [
        '367079611', '367079612', '333642395', '333642390', '403628164', '403628176', '333642385', '403628172',
      ] },
      sources: SOUTH_VILLAS },
    // #1678: the white rendered two-storey houses with red tile roofs along Sankt Lars väg furthest south (ThinkTank, Skinnsömmeriet, the
    // small farm houses by the road) in the Google 3D view of 2026-10-29: the `lowRiseWindows` Sankt Lars väg rows plus the unnumbered
    // small bodies 88457554, 88457611, 145221620, 145221625, 145221627. Which OSM body is which house is read from the overview and is
    // a *guess*, like every colour. `barn`: the tall narrow barn-like body (OSM 88457556, 45 m long) has a dark, steeper and higher
    // gable roof (`rise` replaces the 1.6 m gable). Same vertex-colour batches as `villas`: no new draw call.
    // #1795: Google shows white, cream, pale yellow and pale pink render with orange-red tile roofs (one blue-grey metal roof) and
    // pitches from low to steep. Same hash palettes as `villas`; the barn keeps its own dark roof. *guess*
    whiteHouses: { facade: 0xf0ebe0, roof: 0x9c3b27, rise: 1.6,
      facades: [0xf0ebe0, 0xf5f2ec, 0xe9dcc0, 0xe6cdbd, 0xdcd8cc],
      roofs: [0x9c3b27, 0xb54a2e, 0x8a3324, 0xc65b33, 0x9c3b27, 0x6e7b8b],
      rises: [1.6, 1.3, 2.0, 2.4],
      barn: { roof: 0x3a3d43, rise: 4.6, sources: ['88457556'] },
      sources: [...SOUTH_LARS_VAG, '88457554', '88457611', '145221620', '145221625', '145221627', '88457556'] },
    // #1806 (Google 3D review 2026-11-02, 03_sodra_bebyggelse): the villas and white houses stand in hedged gardens. One low clipped hedge
    // per plot side, as thin vertex-coloured tents in the south backdrop's facade batch (4 triangles per `piece`; no draw call, none on phones).
    // The plot is the house's footprint box grown by `side` / `back` / `front` m; the front (the side nearer a road or path) stays open, the
    // back and both sides get hedge. Pieces on a road/path (`roadClear` m beyond its half width), on a parking lot, inside any building or inside
    // an earlier house's plot (shared boundary) are left out. Every size, colour and margin is a *guess* read by eye from the Google views.
    gardens: { color: 0x3d5a2c, width: 1.1, height: 1.5, sink: 0.05, piece: 14, side: 3.6, back: 5, front: 6, roadClear: 0.8,
      sources: [...SOUTH_VILLAS, ...SOUTH_LARS_VAG, '88457554', '88457611', '145221620', '145221625', '145221627'] },
    // #1556 (the user's in-game report): the old four-storey hospital pavilions take nr 41's brick style (#1529,
    // src/brickstyle.js) on their own OSM footprints, storeys, eaves and roofs. Their facades are not photographed:
    // every value is *guess*, chosen to echo nr 41. `plinth` white plinth height over the base, `frieze` the eave
    // frieze's projection, `belts` the storey lines with a belt course (floor k), `beltLift` its top over that floor,
    // `rise` the segmental head's peak over the window's sides, `frame` the white frame's width (all m).
    // The small two-storey houses and the Sävsländegatan/Nattsländegatan/Hattsnäckegränden terraces keep their style.
    // #1722: the pavilions' street entrances (src/brickstyle.js planEntrances). No OSM entrance nodes are in the repo, so the places
    // are *guess*: the faces of at least `minEdge` m looking at the nearest street (Sankt Lars väg, service ways, paths) within `reach` m
    // get a door where the street's nearest point meets them (`margin` m from the ends at least); a second face too when it is within
    // `second` x the first's distance and `apart` m from its door, `max` per building. Door `w` x `h`, white `frame` width, canopy
    // (`out` projection, `side` extra width each way, `t` thickness, `lift` over the door head), `clear` m kept free of windows beside
    // the door; steps: a `landing` m deep, then `tread` m deeper per step of about `rise` m (at most `maxSteps`, down to the ground). All m.
    brickEntrance: { minEdge: 12, reach: 45, margin: 3.5, second: 1.6, apart: 12, max: 2, w: 1.5, h: 2.3, frame: 0.1, canopy: { out: 0.8, side: 0.3, t: 0.12, lift: 0.3 },
      clear: 0.4, landing: 1.0, tread: 0.32, rise: 0.17, maxSteps: 8, side: 0.25 },
    brickStyle: { plinth: 0.7, frieze: 0.15, belts: [1], beltLift: 0.1, rise: 0.2, frame: 0.07, sources: [
      '88457576', '88457590', 'relation/1309428', '88457592', '88457598', '88457594', '88457599', // Sankt Lars väg 42, 43, 44, 45, 46, 47, 54
    ] },
    // #1676: the old hospital pavilions' roofs (src/pavilionroof.js), read roughly from the Google 3D views of 2026-10-29
    // (docs/references/google-3d-2026-10-29): dark blue-grey slate/sheet hips, rows of gabled dormers, a wider gable in the middle
    // of each long eave and brick chimneys. All *guess*. `roof` the hip colour; `dormer` dormer cheeks, `roof` dormer roofs share it;
    // dormers every `spacing` m along an eave (`endMargin` from the corners, edges under `minEdge` m left out), `inset` m inward of
    // the eave line, `dormerWidth/Height/Gable/Depth` m; the risalit gable on edges of at least `risalitEdge` m (and 60 % of the
    // longest) is `risalitWidth` wide. Chimneys: `chimneys` at most, `chimneySpacing` m apart, within `chimneyBand` m of the highest
    // roof point and `chimneyEdge` m from every wall, `chimneySize` m square rising `chimneyRise` above the roof. On phones
    // (`?lowmem`) panes are dropped and `liteSkip` leaves out every other dormer; `liteChimneys` keeps the chimneys.
    pavilionRoof: { roof: 0x4a5663, dormer: 0x8a8c8c, chimney: 0x7a3a28, spacing: 7.5, endMargin: 4, minEdge: 14, inset: 1.6,
      dormerWidth: 1.5, dormerHeight: 1.2, dormerGable: 0.7, dormerDepth: 1.8,
      risalitEdge: 24, risalitWidth: 4.5, risalitHeight: 2.0, risalitGable: 1.4, risalitDepth: 2.2, risalitInset: 0.6,
      chimneys: 4, chimneySpacing: 18, chimneyBand: 1.0, chimneyEdge: 3, chimneySize: 0.9, chimneyRise: 1.6,
      liteSkip: true, liteChimneys: true },
    // #1793: Google 3D review 2026-11-02 (docs/references/google-3d-2026-11-02, 01_huvudbyggnad). Everything below is read by eye from
    // those oblique views (+-10-20 m, no measurements) and is *guess*. `brickHouses`: nr 48 and 49 are red-brick pavilions with
    // dark mauve roofs, not white farm houses (`facade`; `roofs` per OSM id). `annexes`: low volumes OSM does not map next to the old
    // pavilions, as plain boxes in the existing south facade/roof batches (no new draw call): `c` centre [x, z], `size` [along, across]
    // m, `yaw` degrees turning the along axis from +x towards +z, `h` eave height over the lowest ground corner, `roof`
    // 'flat' | 'gable' (ridge along `size[0]`) with `rise` m, `hoods` rooftop boxes [along, across, w, d, h] from the centre (pipes/vents).
    brickHouses: { facade: 0x9b4a38, roofs: { '88457584': 0x7b4d4a, '88457589': 0x4e4a55 } },
    annexes: { facade: 0xe6e4dc, roof: 0x9aa1a8, hipRoof: 0x9fb4a8, hood: 0xc9ccce, brick: 0x9b4a38, gableRoof: 0x6e4a48, items: [
      // the low white service building on the south-east side of nr 47 (flat grey roof with ventilation hoods) and its lower wing
      { name: 'Service building nr 47', c: [93, 368], size: [30, 15], yaw: -35, h: 5.5, roof: 'flat', hoods: [[-8, 0, 3, 2.5, 1.4], [0, 2, 4, 3, 1.8], [8, -1, 2.5, 2.5, 1.2]] },
      { name: 'Service wing nr 47', c: [108, 381], size: [14, 9], yaw: -35, h: 3.6, roof: 'flat', hoods: [[0, 0, 2.5, 2, 1]] },
      // small red-brick 1.5-storey pavilions with gable roofs (one south-east of nr 46, one west of nr 42)
      { name: 'Pavilion by nr 46', c: [127, 332], size: [11, 7], yaw: -35, h: 4.2, roof: 'gable', rise: 2.4, brick: true },
      { name: 'Pavilion by nr 42', c: [-125, 372], size: [12, 7.5], yaw: -35, h: 4.2, roof: 'gable', rise: 2.4, brick: true },
      // #1794: the western quarter's Thermo Fisher hall (Google 3D 02_vastra_kvarteret: pale green-grey hipped roof, dark flat wing on its south-west
      // side) and two small neighbours. OSM has none of them (only the car park 145221622 around it); the positions were read by projecting
      // the Google views through the game camera and anchoring on the modelled nr 44 (+-20-30 m, the h270 view put the hall ~100 m further west),
      // sizes and colours by eye. `wall` / `roofColor` override the shared colours, `roof: 'hip'` is a hipped roof.
      { name: 'Thermo Fisher hall', c: [-9, 495], size: [34, 22], yaw: -30, h: 8, roof: 'hip', rise: 3.2, wall: 0x7d8588, roofColor: 0xb3cbbb },
      { name: 'Thermo Fisher low wing', c: [-12, 517], size: [26, 12], yaw: -30, h: 5.5, roof: 'flat', wall: 0x565b60, roofColor: 0x30343a },
      { name: 'Barn west of the hall', c: [-56, 524], size: [24, 11], yaw: -30, h: 4.2, roof: 'gable', rise: 3, wall: 0xcdbfae, roofColor: 0xa77f7b },
      { name: 'House in the western woods', c: [-117, 493], size: [12, 8], yaw: -30, h: 4.2, roof: 'gable', rise: 2.6, wall: 0xd8d0c0, roofColor: 0x4e5662 },
    ] },
    buildings: [
      {"source":"88457551","polygon":[[246.3,350.37],[250.7,348.97],[251.42,351.23],[255.49,349.95],[258.92,360.68],[244.6,365.21],[241.15,354.37],[246.99,352.53],[246.3,350.37]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 64","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457554","polygon":[[42.86,466.69],[57.77,455.6],[62.18,461.53],[47.28,472.62],[42.86,466.69]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 88457554","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457556","polygon":[[58.51,430.48],[70.09,422.28],[96.08,459.0],[84.5,467.19],[58.51,430.48]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 88457556","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457559","polygon":[[234.92,258.9],[245.88,255.63],[251.7,275.09],[240.73,278.36],[234.92,258.9]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 57","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457560","polygon":[[118.04,465.66],[137.2,452.9],[142.35,460.63],[123.18,473.4],[118.04,465.66]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 70","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457562","polygon":[[185.44,274.55],[195.36,271.59],[197.94,280.25],[200.81,289.86],[190.89,292.82],[185.44,274.55]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 56","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457566","polygon":[[111.46,406.49],[117.55,402.01],[133.74,424.05],[127.64,428.53],[111.46,406.49]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 88457566","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457571","polygon":[[262.53,288.02],[272.98,285.76],[276.81,303.31],[266.36,305.56],[262.53,288.02]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 61","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457572","polygon":[[226.18,298.1],[236.68,295.43],[241.32,313.64],[230.81,316.31],[226.18,298.1]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 59","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457576","polygon":[[-98.02,346.44],[-97.38,345.85],[-96.37,345.29],[-94.69,345.44],[-93.82,345.69],[-93.23,346.06],[-92.74,346.62],[-92.59,347.58],[-92.6,348.32],[-93.07,349.11],[-93.83,349.73],[-95.01,350.59],[-91.28,355.72],[-67.29,338.35],[-71.71,332.25],[-64.03,326.7],[-58.6,334.18],[-56.78,332.86],[-52.39,338.9],[-54.13,340.17],[-50.55,345.11],[-58.22,350.66],[-60.62,347.34],[-84.81,364.84],[-83.13,367.16],[-90.81,372.72],[-109.63,346.8],[-101.84,341.17],[-98.02,346.44]],"levels":4,"levelsSource":"OSM","name":"Sankt Lars väg 42","roof":"hipped","roofSource":"OSM","rise":3.5,"facade":11831152},
      {"source":"88457578","polygon":[[278.2,343.1],[292.41,339.37],[295.54,351.2],[281.33,354.94],[278.2,343.1]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 63","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457584","polygon":[[12.07,369.86],[21.23,362.94],[32.84,378.31],[23.68,385.23],[12.07,369.86]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 48","keepBase":3.746237,"roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457587","polygon":[[205.63,337.29],[222.82,333.55],[225.52,345.96],[208.34,349.7],[205.63,337.29]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 60","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457589","polygon":[[28.79,402.26],[46.42,389.56],[54.38,400.62],[36.76,413.32],[28.79,402.26]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 49","keepBase":4.168658,"roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457590","polygon":[[-87.34,419.56],[-84.2,417.35],[-69.96,437.49],[-92.37,453.28],[-106.59,433.16],[-103.71,431.13],[-114.73,415.54],[-117.2,417.27],[-132.8,395.19],[-111.3,380.05],[-95.69,402.14],[-98.33,404.01],[-87.34,419.56]],"levels":4,"levelsSource":"visual assumption","name":"Sankt Lars väg 43","roof":"hipped","roofSource":"visual assumption","rise":3.5,"facade":11831152},
      {"source":"88457592","polygon":[[35.41,256.31],[31.65,251.19],[39.08,245.74],[51.17,262.19],[53.52,260.47],[57.38,265.72],[55.01,267.45],[58.06,271.58],[50.63,277.03],[48.09,273.57],[23.78,291.39],[25.51,293.74],[17.69,299.47],[14.2,294.72],[11.95,296.37],[9.08,292.46],[11.35,290.79],[5.23,282.47],[13.06,276.73],[17.96,283.4],[42.25,265.61],[38.54,260.56],[37.29,261.17],[36.39,261.61],[35.22,261.82],[34.05,261.54],[33.32,260.84],[32.96,259.95],[33.07,258.99],[33.68,257.9],[34.57,257.02],[35.41,256.31]],"levels":4,"levelsSource":"OSM","name":"Sankt Lars väg 45","roof":"hipped","roofSource":"OSM","rise":3.5,"facade":11831152},
      {"source":"88457593","polygon":[[208.53,360.78],[212.96,359.49],[213.59,361.67],[217.96,360.4],[221.12,371.21],[206.18,375.54],[203.07,364.86],[209.21,363.08],[208.53,360.78]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 66","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457594","polygon":[[87.21,358.27],[75.96,366.38],[76.77,367.5],[68.67,373.33],[64.89,368.09],[60.12,371.52],[56.13,366.01],[61.16,362.39],[48.07,344.29],[56.29,338.36],[59.57,342.88],[83.23,325.83],[80.71,322.34],[89.4,316.09],[101.55,332.9],[100.27,333.82],[107.98,344.48],[99.0,350.95],[98.54,350.32],[96.0,352.16],[99.32,356.76],[90.64,363.01],[87.21,358.27]],"levels":4,"levelsSource":"visual assumption","name":"Sankt Lars väg 47","roof":"hipped","roofSource":"visual assumption","rise":3.5,"facade":11831152},
      {"source":"88457596","polygon":[[187.66,310.34],[197.42,307.41],[199.86,315.52],[202.82,325.36],[193.06,328.29],[187.66,310.34]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 58","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457598","polygon":[[76.91,253.56],[86.43,247.22],[87.29,248.5],[96.55,262.35],[105.03,256.69],[120.21,279.38],[111.81,284.99],[119.48,296.44],[109.8,302.89],[99.81,287.95],[103.0,285.82],[90.76,267.53],[87.64,269.6],[76.91,253.56]],"levels":4,"levelsSource":"visual assumption","name":"Sankt Lars väg 46","roof":"hipped","roofSource":"visual assumption","rise":3.5,"facade":11831152},
      {"source":"88457599","polygon":[[-227.64,427.37],[-198.18,406.55],[-190.36,417.62],[-195.13,420.99],[-173.39,451.74],[-193.91,466.24],[-215.65,435.48],[-219.81,438.44],[-227.64,427.37]],"levels":4,"levelsSource":"visual assumption","name":"Sankt Lars väg 54","roof":"hipped","roofSource":"visual assumption","rise":3.5,"facade":11831152},
      {"source":"88457604","polygon":[[247.54,325.75],[263.03,322.38],[265.6,334.15],[250.11,337.53],[247.54,325.75]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars väg 62","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"88457611","polygon":[[228.64,333.03],[240.93,329.75],[241.96,333.6],[229.67,336.88],[228.64,333.03]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 88457611","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"145221569","polygon":[[-58.26,284.51],[-35.42,267.93],[-21.1,287.58],[-27.44,292.18],[-23.83,297.14],[-34.34,304.75],[-37.93,299.81],[-43.95,304.18],[-58.26,284.51]],"levels":3,"levelsSource":"user photos docs/foton/stlars41-*.jpg 2026-10-23 (#1529): 3 storeys over a white plinth, the SE wing 2","name":"Sankt Lars väg 41","roof":"hipped","roofSource":"user photos (#1529): low hipped dark-grey metal roofs","rise":2.2,"facade":11831152,"template":"stlars41","model":{"plinth":1.0,"storey":3.4,"frieze":0.5,"wingLevels":2,"wingEaveLift":-0.1,"wingRise":0.5,"overhang":0.45,"tower":{"w":3.8,"proj":0.3,"depth":3.6,"extra":1.6,"rise":0.6},"towerSW":12.16,"towerSE":5.4,"chimneys":[[11,19],[16,19],[6,6],[22,6]],"modelSource":"#1529: storey count, wing, the two stair towers (41A on the SE face beside the wing, 41B centred on the SW face), hipped roofs and window rhythm read from the photos; every metre value here is *guess*"}},
      {"source":"145221620","polygon":[[100.85,468.36],[108.9,463.0],[115.05,472.23],[107.01,477.6],[100.85,468.36]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 145221620","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"145221625","polygon":[[256.34,373.65],[262.74,371.95],[265.88,383.8],[259.48,385.5],[256.34,373.65]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 145221625","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"145221627","polygon":[[275.98,319.81],[281.59,318.31],[284.75,330.23],[279.13,331.71],[275.98,319.81]],"levels":2,"levelsSource":"visual assumption","name":"Sankt Lars 145221627","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642383","polygon":[[212.15,225.99],[219.7,223.98],[222.56,234.74],[215.0,236.75],[212.15,225.99]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 14","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642384","polygon":[[217.02,182.16],[211.7,175.63],[220.03,168.83],[225.36,175.36],[217.02,182.16]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 16","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642385","polygon":[[149.37,243.37],[156.92,241.36],[159.78,252.12],[152.22,254.14],[149.37,243.37]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 2","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642386","polygon":[[180.53,213.2],[172.7,215.46],[169.88,205.73],[177.71,203.46],[180.53,213.2]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 8","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642387","polygon":[[125.03,194.33],[130.86,189.95],[137.1,198.3],[131.28,202.66],[125.03,194.33]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 2","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642389","polygon":[[169.12,238.41],[176.68,236.4],[179.55,247.17],[171.99,249.18],[169.12,238.41]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 6","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642390","polygon":[[202.73,207.42],[194.68,209.86],[191.75,200.24],[199.81,197.8],[202.73,207.42]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 12","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642391","polygon":[[148.61,182.57],[155.82,180.45],[158.97,191.19],[151.78,193.32],[148.61,182.57]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 6","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642392","polygon":[[235.4,218.83],[242.96,216.82],[245.81,227.59],[238.26,229.6],[235.4,218.83]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 18","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642393","polygon":[[189.49,179.7],[182.97,181.6],[180.33,172.58],[186.86,170.68],[189.49,179.7]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 12","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642395","polygon":[[233.93,202.98],[229.02,197.14],[237.09,190.37],[241.99,196.2],[233.93,202.98]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 20","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642396","polygon":[[190.06,232.27],[197.62,230.26],[200.48,241.02],[192.92,243.03],[190.06,232.27]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 10","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"333642397","polygon":[[157.39,217.75],[151.0,222.51],[144.53,213.84],[150.93,209.08],[157.39,217.75]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 4","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"367079610","polygon":[[182.97,181.6],[176.43,183.51],[173.8,174.48],[180.33,172.58],[182.97,181.6]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 10","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"367079611","polygon":[[211.7,175.63],[206.38,169.1],[214.71,162.3],[220.03,168.83],[211.7,175.63]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 14","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"367079612","polygon":[[229.02,197.14],[224.12,191.3],[232.2,184.53],[237.09,190.37],[229.02,197.14]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 18","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"367079613","polygon":[[130.86,189.95],[136.68,185.59],[142.93,193.93],[137.1,198.3],[130.86,189.95]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 4","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"367079616","polygon":[[155.82,180.45],[163.01,178.32],[166.18,189.07],[158.97,191.19],[155.82,180.45]],"levels":2,"levelsSource":"visual assumption","name":"Nattsländegatan 8","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628164","polygon":[[194.68,209.86],[186.64,212.31],[183.71,202.7],[191.75,200.24],[194.68,209.86]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 10","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628166","polygon":[[197.62,230.26],[205.18,228.25],[208.03,239.02],[200.48,241.02],[197.62,230.26]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 12","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628168","polygon":[[219.7,223.98],[227.26,221.97],[230.13,232.74],[222.56,234.74],[219.7,223.98]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 16","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628170","polygon":[[151.0,222.51],[144.6,227.28],[138.14,218.61],[144.53,213.84],[151.0,222.51]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 2","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628172","polygon":[[242.96,216.82],[250.52,214.82],[253.38,225.59],[245.81,227.59],[242.96,216.82]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 20","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628174","polygon":[[156.92,241.36],[164.48,239.36],[167.34,250.12],[159.78,252.12],[156.92,241.36]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 4","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628176","polygon":[[172.7,215.46],[164.88,217.73],[162.06,208.0],[169.88,205.73],[172.7,215.46]],"levels":2,"levelsSource":"visual assumption","name":"Hattsnäckegränden 6","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"403628178","polygon":[[176.68,236.4],[184.25,234.4],[187.1,245.16],[179.55,247.17],[176.68,236.4]],"levels":2,"levelsSource":"visual assumption","name":"Sävsländegatan 8","roof":"gable","roofSource":"visual assumption","rise":1.6,"facade":13024420},
      {"source":"relation/1309428","polygon":[[-6.89,413.53],[-4.15,417.38],[-2.9,416.49],[3.63,425.64],[-30.89,450.23],[-37.82,440.5],[-36.41,439.49],[-38.52,436.52],[-44.47,440.77],[-53.21,428.5],[-55.18,429.91],[-59.0,424.56],[-57.17,423.24],[-60.14,419.09],[-51.86,413.17],[-49.79,416.07],[-25.18,398.49],[-27.01,395.92],[-19.01,390.19],[-16.08,394.29],[-14.04,392.83],[-10.38,397.96],[-12.51,399.48],[-3.96,411.45],[-6.89,413.53]],"holes":[[[-19.36,406.49],[-43.73,423.89],[-33.66,437.99],[-6.7,418.74],[-9.05,415.45],[-11.65,417.29],[-19.36,406.49]]],"levels":4,"levelsSource":"visual assumption","name":"Sankt Lars 44","roof":"hipped","roofSource":"visual assumption","rise":3.5,"facade":11831152},
    ],
    forests: [
      {"source":"165719103","polygon":[[-24.51,244.86],[-26.44,242.01],[-47.35,240.49],[-67.09,249.61],[-82.67,251.43],[-89.86,244.46],[-119.94,238.45],[-138.37,248.8],[-144.05,273.73],[-139.86,297.39],[-126.95,303.81],[-117.3,308.18],[-138.6,320.46],[-146.24,328.06],[-169.07,323.69],[-180.14,327.51],[-186.33,341.38],[-201.83,358.93],[-205.24,368.35],[-197.26,372.1],[-24.51,244.86]],"n":40},
      {"source":"165719106","polygon":[[-132.43,494.36],[-137.45,503.77],[-162.94,519.35],[-182.77,522.14],[-205.84,524.05],[-215.26,527.49],[-141.35,635.99],[39.0,511.3],[29.79,507.91],[-11.26,533.9],[-31.53,547.2],[-126.76,605.27],[-140.21,605.33],[-156.32,594.68],[-169.83,576.61],[-173.9,557.44],[-165.9,544.64],[-157.8,537.74],[-125.78,520.12],[-105.66,503.8],[-85.28,489.4],[-61.28,481.35],[-47.56,490.21],[-45.0,486.92],[-38.7,478.83],[-39.44,465.53],[-51.21,454.96],[-66.01,449.21],[-96.95,468.4],[-111.85,475.42],[-132.43,494.36]],"n":30},
    ],
    fields: [
      {"source":"91913055","polygon":[[280.76,518.29],[295.47,522.72],[403.87,429.29],[493.05,344.52],[498.52,336.7],[505.43,325.23],[508.3,314.41],[509.24,301.09],[508.12,271.34],[517.04,199.9],[512.82,145.66],[506.63,108.61],[491.9,69.86],[484.62,47.98],[475.48,45.31],[446.45,57.01],[322.89,110.33],[261.11,136.12],[240.16,141.69],[217.63,149.14],[254.5,200.75],[268.88,234.4],[327.54,372.46],[209.73,404.43],[280.76,518.29]],"color":9016921},
      {"source":"165719101","polygon":[[-157.8,537.74],[-125.78,520.12],[-105.66,503.8],[-85.28,489.4],[-61.28,481.35],[-47.56,490.21],[-24.69,520.84],[-19.4,532.9],[-31.53,547.2],[-126.76,605.27],[-140.21,605.33],[-156.32,594.68],[-169.83,576.61],[-173.9,557.44],[-165.9,544.64],[-157.8,537.74]],"color":9083762},
      {"source":"237019759","polygon":[[-125.6,213.43],[-121.69,216.75],[-116.22,223.52],[-112.59,229.85],[-111.67,235.71],[-112.42,241.42],[-113.94,248.93],[-115.77,258.36],[-119.21,266.97],[-123.51,274.69],[-132.67,284.83],[-137.41,288.75],[-145.78,283.52],[-156.55,275.38],[-165.13,271.61],[-170.08,272.74],[-174.73,275.66],[-182.39,281.45],[-197.97,293.4],[-207.88,302.2],[-212.67,308.73],[-219.42,313.33],[-226.19,315.97],[-238.71,320.5],[-247.63,323.2],[-265.62,330.83],[-274.25,316.98],[-275.61,310.13],[-258.76,282.05],[-230.7,250.38],[-189.9,219.8],[-173.79,213.37],[-158.58,211.16],[-140.66,212.13],[-125.6,213.43]],"color":8362575},
    ],
    paths: [
      {"source":"30633546","surface":"asphalt","path":[[27.71,213.61],[24.37,219.25],[16.9,227.36],[8.31,233.97],[3.68,236.83],[-2.35,240.57],[-21.89,254.04],[-39.24,267.33],[-72.05,291.41],[-134.7,334.97],[-180.81,367.04],[-190.9,374.57],[-194.2,377.03]],"w":6},
      {"source":"36918924","surface":"asphalt","path":[[45.85,215.95],[48.33,225.53],[61.04,242.66],[76.61,264.96],[84.9,276.19],[100.69,298.56],[105.48,305.28],[109.17,309.03],[113.03,312.18],[118.18,314.55],[128.99,318.64],[147.12,323.27],[157.53,327.25],[162.42,329.97],[167.1,334.61]],"w":6},
      {"source":"45211117","surface":"asphalt","path":[[205.42,403.66],[237.21,454.42],[242.66,463.23],[255.26,485.83],[270.83,513.68],[289.03,545.56]],"w":6},
      {"source":"189432530","surface":"asphalt","path":[[26.53,188.72],[27.8,193.47],[28.48,203.89],[28.32,208.78],[27.71,213.61],[36.38,215.15],[45.85,215.95]],"w":6},
      {"source":"189432586","surface":"asphalt","path":[[45.85,215.95],[51.03,213.49],[56.01,210.85],[60.06,208.7],[62.73,207.66],[66.07,207.19],[69.35,207.41],[72.56,208.06],[79.44,209.89],[114.28,217.79]],"w":4.5},
      {"source":"333642408","surface":"asphalt","path":[[251.76,202.57],[252.43,206.62],[247.63,209.18],[220.8,216.0],[145.9,237.02],[138.98,234.6],[127.27,218.98],[120.07,218.27]],"w":4.5},
      {"source":"333642411","surface":"asphalt","path":[[220.8,216.0],[218.37,207.59],[203.54,189.33],[146.58,205.15],[127.27,218.98]],"w":4.5},
      {"source":"333642412","surface":"asphalt","path":[[114.28,217.79],[120.07,218.27]],"w":4.5},
      {"source":"343241050","surface":"asphalt","path":[[127.27,218.98],[122.86,208.89],[116.87,201.25],[115.61,198.43],[115.49,196.53],[116.15,194.81],[117.61,192.83],[137.0,179.36],[192.34,162.88],[212.71,157.02],[218.25,158.77],[251.76,202.57]],"w":4.5},
      {"source":"1147690112","surface":"asphalt","path":[[167.1,334.61],[173.12,342.21],[184.14,363.66],[194.62,384.62],[205.42,403.66]],"w":6},
    ],
    // #1262: sourced service access roads south of Höje å (OSM snapshot 2026-10-08 / 2026-10-18)
    access: [
      // #1433: same committed OSM snapshot/projection as #1432. Only highway=service is sourced.
      // Asphalt/width are guesses; 199056948 uses a narrow 3 m single lane to clear the unchanged house45 footprint.
      {"source":"145221576","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-97.60,388.93],[16.04,308.22],[17.82,306.95],[76.61,264.96]],"w":4.5,"terrain":"triangles"},
      {"source":"199056948","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-10.07,291.54],[0.80,285.10],[17.82,306.95]],"w":3,"terrain":"triangles"},
      // #1432: OSM snapshot osm-south-2026-10-08.json, projected by sitegeo.js and rounded to 1 cm like existing shared nodes.
      // Raw tags only say highway=service: 4.5 m width and asphalt are visual guesses, not surveyed civil levels/materials.
      // Opt in only these new strips to exact emitted terrain triangles; existing roads retain their original geometry.
      {"source":"145221573","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-127.61,345.26],[-99.51,325.04],[-85.75,315.14],[-72.11,305.33],[-58.09,295.24],[-43.79,315.05],[-10.07,291.54],[-24.28,273.42],[11.51,247.67],[3.68,236.83]],"w":4.5,"terrain":"triangles"},
      {"source":"145221582","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[11.51,247.67],[31.81,234.04]],"w":4.5,"terrain":"triangles"},
      {"source":"145221583","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-99.51,325.04],[-90.69,337.26]],"w":4.5,"terrain":"triangles"},
      {"source":"145221596","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-72.11,305.33],[-63.07,317.85]],"w":4.5,"terrain":"triangles"},
      {"source":"850235114","surface":"asphalt","path":[[61.04,242.66],[73.13,233.86]],"w":4.5},
      {"source":"850235115","surface":"asphalt","path":[[60.53,217.65],[73.13,233.86],[82.72,246.3]],"w":4.5},
      {"source":"36918923","surface":"asphalt","path":[[45.85,215.95],[46.16,211.77],[46.1,209.57],[45.43,205.77],[44.88,203.85]],"w":4.5},
      {"source":"95035967","surface":"asphalt","path":[[44.88,203.85],[34.91,195.45]],"w":4.5}, // #1301: the bus bay's approach (psv-only one-way), missing before
      {"source":"189432572","surface":"asphalt","path":[[34.91,195.45],[30.49,192.5],[26.53,188.72]],"w":4.5},
      {"source":"30633544","surface":"asphalt","path":[[205.42,403.66],[201.18,405.79],[181.19,415.77],[165.86,417.17],[152.17,419.96],[137.95,425.61],[130.67,429.21],[120.07,431.09],[114.48,433.98],[108.38,439.73],[103.1,445.37],[102.06,452.75],[107.83,459.09],[116.59,461.57],[125.79,454.77],[181.19,415.77]],"w":4.5},
      {"source":"30633545","surface":"asphalt","path":[[194.62,384.62],[205.62,380.22],[279.48,359.11],[273.25,340.22],[265.3,314.56],[213.05,330.44],[173.12,342.21]],"w":4.5},
      {"source":"145221590","surface":"asphalt","path":[[-85.75,315.14],[-76.77,327.58]],"w":4.5},
      {"source":"145221588","surface":"asphalt","path":[[27.71,396.53],[9.95,373.66]],"w":4.5},
      // #1435: inner service loop from the saved 2026-10-08 OSM snapshot. Its tags identify service roads only; width/asphalt are visual guesses.
      {"source":"145221614","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-10.57,376.93],[12.47,408.16],[19.61,402.79],[27.71,396.53],[43.50,384.31],[49.03,380.04],[68.88,405.62]],"w":4.5,"terrain":"triangles"},
      {"source":"145221585","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[43.50,384.31],[26.85,362.85]],"w":4.5,"terrain":"triangles"},
      {"source":"145221592","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[19.61,402.79],[38.47,427.10]],"w":4.5,"terrain":"triangles"},
      {"source":"145221599","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[36.11,343.59],[58.24,372.91],[49.03,380.04]],"w":4.5,"terrain":"triangles"},
      // #1463: whole western service way from the same saved 2026-10-08 OSM snapshot; it joins 30633546, 145221573 and 145221576 at mapped nodes.
      // Its outer end (-68.60,417.65) is the mapped node toward future outer-ring way 95036048 (no invented link/turnaround). Width/asphalt are guesses.
      {"source":"145221612","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[-68.60,417.65],[-74.73,422.08],[-97.60,388.93],[-108.93,372.45],[-127.61,345.26],[-134.70,334.97]],"w":4.5,"terrain":"triangles"},
      // #1449: parking-access service ways from the same saved 2026-10-08 OSM snapshot. 335403605 (highway=service only) ends inside parking 1379042188; width/asphalt are guesses.
      // 335403606 is tagged surface=paved, which this file renders as asphalt (#1235 convention; surfaceSource records the tag); no width tag -> width is a guess; it ends at the shared node of 36918924/1147690112. No parking data touched.
      {"source":"335403605","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[170.45,303.90],[203.24,294.12],[206.07,293.22],[224.41,287.47]],"w":4.5,"terrain":"triangles"},
      {"source":"335403606","highway":"service","surface":"asphalt","surfaceSource":"osm:paved","widthSource":"guess","path":[[170.45,303.90],[169.79,315.10],[168.79,322.27],[168.17,327.49],[167.10,334.61]],"w":4.5,"terrain":"triangles"},
      // #1464: whole outer service ring 95036048 and its separate footway 199056947 from the same saved 2026-10-08 OSM snapshot (unchanged geoToPlan).
      // Both carry only highway tags: 4.5 m / 2 m widths and asphalt are guesses. The ring joins 36918924 at (167.10,334.61) and (100.69,298.56), the inner loop
      // at its mapped nodes and 145221612's bare outer end (-68.60,417.65); the footway stays a footway linking 145221576 (16.04,308.22) to the ring (39.28,341.23).
      {"source":"95036048","highway":"service","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[167.10,334.61],[159.81,341.58],[97.32,385.52],[68.88,405.62],[38.47,427.10],[-12.64,463.26],[-18.96,467.75],[-23.66,470.88],[-25.66,471.59],[-27.58,471.64],[-30.00,471.18],[-32.38,469.61],[-68.60,417.65],[-10.57,376.93],[36.11,343.59],[39.28,341.23],[100.69,298.56]],"w":4.5,"terrain":"triangles"},
      {"source":"199056947","highway":"footway","surface":"asphalt","surfaceSource":"guess","widthSource":"guess","path":[[16.04,308.22],[39.28,341.23]],"w":2,"terrain":"triangles"},
    ],
    // #1262: sourced parking areas and street-side bays south of Höje å (OSM snapshot 2026-10-18)
    // #1805 (Google 3D review 2026-11-02, 01_huvudbyggnad / 02_vastra_kvarteret): the hospital car parks are edged by clipped hedges in the
    // references; the game left them bare. Reuses the #1737/#1797 `yard` mechanism (hedge boxes only, src/schoolyard.js) in the south `land` batch:
    // no draw call. Each path runs 1 m outside one long edge of the OSM car park named in the comment. Lengths, height and colour are a *guess*
    // read by eye; phones (`lowMemory`) skip them. Visual only, no collision.
    yard: { lawns: [], sand: [], play: [], lift: { sand: 0.05, lawn: 0.08 }, colors: { hedge: 0x3b5828 },
      hedge: { h: 1.0, w: 0.8, piece: 8, sink: 0.3, paths: [
        [[-19.9, 258], [26.7, 225.1]],     // 145221619, NW edge
        [[67.5, 381], [106, 353.6]],       // 145221626, NW edge
        [[-125.4, 332.8], [-61.8, 287.2]], // 145221628, NW edge
        [[-14.4, 383.2], [39.3, 345.1]],   // 145221629, NW edge
      ] } },
    parking: [
      {"source":"145221619","name":"Parkering norr om Sankt Lars väg 45","surface":"asphalt","capacity":30,"capacitySource":"guess","polygon":[[-19.37,258.81],[27.25,225.93],[37.02,239.75],[-9.59,272.63]],"grade":{"transition":6,"transitionSource":"guess","anchor":[10,248],"anchorSource":"SOUTH_PLATEAU LM control"},"layout":{"start":1.5,"boxes":true,"entrance":{"road":"145221573","margin":0.25},"source":"guess"}}, // #1436: plane pinned to the sourced (10,248) control; its two fitted slopes and the 6 m inner edge transition are guesses (4 m raised the lot-edge slope, 8 m reached the control). #1437: two rows of 15 complete 2.5×5 m boxes (guess) from 1.5 m along the lot, a 6.93 m clear aisle over mapped service ways 145221573/145221582, and the north-west row and kerb left open where 145221573 enters from road 30633546 (its 4.5 m guessed strip + 0.25 m guessed margin)
      {"source":"850235113","name":"Parkering Sankt Lars väg 46","surface":"asphalt","capacity":25,"capacitySource":"guess","polygon":[[63.78,234.37],[53.36,220.22],[64.7,211.13],[77.05,225.2],[73.03,228.14],[74.46,230.92],[79.33,227.41],[92.14,245.05],[87.29,248.5],[86.43,247.22],[76.91,253.56],[68.67,242.1],[72.64,239.41],[69,230.78]],"grade":{"transition":4,"transitionSource":"guess"},"layout":{"aisle":{"road":"850235115"},"clear":["850235114"],"margin":0.25,"rows":[{"side":-1,"offset":2.55,"to":17},{"side":-1,"offset":3,"from":17},{"side":1,"offset":3}],"source":"guess"}}, // #1440: OSM has no floor levels; fitted plane and 4 m transition are assumptions. #1441: whole 2.5×5 m boxes (guess) either side of mapped way 850235115 as the aisle, 3 m from its centre line (a 6 m clear aisle, guess); side −1 is the north-east row, side +1 the south-west row. West of the neck (17 m along the way) the north-east row sits 2.55 m out (0.25 m clear of the slightly bent way's 4.5 m strip), where the opposite row has no room, so the clear aisle there stays wider than 6 m. Mapped entrance 850235114 and both way strips (+0.25 m guess) stay free of boxes
      // #1794: the two large car parks of the western quarter, OSM footprints (OSM API pull 2026-11-02, docs/references/surrounding-views/osm-west-2026-11-02.json); plain asphalt: no capacity, kerb or stall lines, which would hover over the slope between their endpoints
      {"source":"145221622","name":"Parkering Thermo Fisher","surface":"asphalt","capacity":0,"capacitySource":"guess","polygon":[[-33.48,489.92],[-1.56,468.12],[26.42,508.95],[-5.5,530.75],[-33.48,489.92]]},
      {"source":"145221630","name":"Parkering väster om Sankt Lars väg 43","surface":"asphalt","capacity":0,"capacitySource":"guess","polygon":[[-191.17,385.03],[-153.04,356.85],[-129.02,389.26],[-142.99,399.58],[-96.62,462.12],[-109.87,471.93],[-156.21,409.42],[-167.12,417.48],[-191.17,385.03]]},
      {"source":"145221624","name":"Parkering vid Nattsländegatan","surface":"asphalt","capacity":15,"capacitySource":"guess","polygon":[[129.03,295.85],[147.96,281.76],[157.54,294.58],[138.61,308.68]],"grade":{"transition":4,"transitionSource":"guess"}}, // #1442: no mapped floor levels; plane and 4 m edge transition are inferred from the existing terrain
      {"source":"145221626","name":"Parkering Sankt Lars väg 47","surface":"asphalt","capacity":20,"capacitySource":"guess","polygon":[[68.12,381.83],[106.57,354.46],[113.4,364.03],[74.96,391.4]],"grade":{"transition":2,"transitionSource":"guess","clip":true},"layout":{"row":"south","count":18,"boxes":true,"source":"guess"}}, // #1443: OSM has no floor levels; the fitted plane and its 2 m inner edge transition are assumptions, drawn on terrain cells clipped along the outline and its 2 m inset (only the band fades; outside the outline the drawn ground is unchanged). The lot is 47.2×11.76 m, so one row of 18 whole 2.5×5 m boxes (guess) along the south-east long edge, away from house 47, and a 6.76 m clear aisle (≥6 m guess); no mapped way reaches the lot (145221599/145221614 end ≥13 m away), so no access road is drawn
      {"source":"145221628","name":"Parkering väster om Sankt Lars väg 41-43","surface":"asphalt","capacity":45,"capacitySource":"guess","polygon":[[-124.86,333.62],[-61.23,288.04],[-46.07,309.14],[-93.04,342.78],[-98.19,335.6],[-114.87,347.54]],"grade":{"transition":6,"transitionSource":"guess","clip":true,"tin":true,"maxSlope":0.2,"fade":"linear"},"layout":{"aisle":{"road":"145221573","to":4},"clear":["145221583"],"margin":0.25,"rows":[{"side":-1,"offset":2.55},{"side":1,"offset":3.45}],"source":"guess"}}, // #1444: OSM has no floor levels. The concave lot between houses 41 and 42 falls about 3.3 m and one plane missed its ground by 2.4 m, so its 6 m inset core is drawn as a few civil sub-planes (its six corners least-squares fitted to the ground along the core edge, triangulation with sub-planes ≤ maxSlope 0.2 preferred) and a linear 6 m clipped edge band. All values are guesses. The band towards house 41 (≈0.53) is steeper than the ground there was (0.31); the whole lot lay south of the old WALK.z1 250 (walkable since #1714), where the user accepted WALK.maxSlope 0.7 as the limit (2026-10-23). #1445: 58 whole 2.5×5 m boxes (guess) either side of mapped way 145221573 (aisle axis, vertices 0–4; branch way 145221583 and both 4.5 m strips +0.25 m kept clear); the lot is only ~7.8 m wide north-west of the way, so that row stands 2.55 m and the south-east row 3.45 m from its centre line, a 6.0 m clear aisle (guess). Capacity 45 (guess) is unchanged and unused by the layout
      {"source":"145221629","name":"Parkering söder om Sankt Lars 44","surface":"asphalt","capacity":40,"capacitySource":"guess","polygon":[[-13.78,384],[39.85,345.93],[61.52,376.34],[54.83,381.08],[68.7,400.55],[30.48,427.69],[19.81,412.72],[11.1,418.91]],"grade":{"transition":6,"transitionSource":"guess","clip":true,"tin":true,"maxSlope":0.2,"fade":"linear"},"layout":{"aisle":{"road":"145221614","from":1,"to":5},"clear":["145221588","145221585","145221592","145221599","95036048"],"margin":0.75,"buildings":true,"rows":[{"aisle":{"road":"145221614","from":1,"to":5},"side":-1,"offset":3},{"aisle":{"road":"145221614","from":1,"to":5},"side":1,"offset":3},{"aisle":{"road":"145221614","from":0,"to":1},"side":-1,"offset":3},{"aisle":{"road":"145221614","from":5,"to":6},"side":1,"offset":3},{"aisle":{"road":"145221599","from":0,"to":1},"side":1,"offset":3},{"aisle":{"road":"145221585"},"side":-1,"offset":3},{"aisle":{"road":"145221585"},"side":1,"offset":3},{"aisle":{"road":"145221588"},"side":-1,"offset":3},{"aisle":{"road":"145221588"},"side":1,"offset":3},{"aisle":{"road":"145221592"},"side":-1,"offset":3},{"aisle":{"road":"145221592"},"side":1,"offset":3}],"source":"guess"}}, // #1446: OSM has no floor levels. Same civil sub-plane mechanism as 145221628 (#1444): the 6 m inset core of this concave eight-corner lot is triangulated over its own corners, least-squares fitted to the ground along the core edge, with a linear 6 m clipped edge band. All values are guesses; the whole lot lay south of the old WALK.z1 250 (walkable since #1714). #1447: 56 whole 2.5×5 m boxes (guess) facing the mapped ways inside the lot (145221614 in three straight legs, 145221585/588/592/599; each row runs only along its own way); every mapped way keeps a 6 m clear aisle (4.5 m strip, margin 0.75 m, guess) and every box stays 0.75 m off houses 48/49 (`buildings`). Capacity 40 (guess) is unchanged and unused by the layout
      {"source":"1379042014","name":"Gatuparkering Sankt Lars väg 66","surface":"asphalt","capacity":6,"capacitySource":"OSM","orientation":"perpendicular","polygon":[[223.09,383.62],[237.66,379.24],[236.23,374.21],[221.72,378.62]],"grade":{"transition":1.5,"transitionSource":"guess","clip":true,"fit":"minimax"},"layout":{"row":"south","count":6,"boxes":true,"street":{"road":"30633545","apron":"guess"},"source":"guess"}}, // #1450: OSM gives outline, perpendicular orientation and capacity 6 only. Plane (minimax fit on the drawn cells), 1.5 m edge transition, one row of six 2.5×5 m boxes on the far edge and the apron over the 0.38–0.64 m grass gap to street 30633545 (the driving lane) are guesses
      {"source":"1379042106","name":"Gatuparkering Sankt Lars väg 61","surface":"asphalt","capacity":8,"capacitySource":"OSM","orientation":"perpendicular","polygon":[[242.06,313.41],[261.49,307.78],[262.95,312.82],[243.52,318.44]],"grade":{"transition":2,"transitionSource":"guess","clip":true,"fit":"minimax","crease":[[250,300],[250,330]]},"layout":{"row":"north","count":8,"boxes":true,"street":{"road":"30633545","apron":"guess"},"source":"guess"}}, // #1451: OSM gives outline, perpendicular orientation and capacity 8 only. Plane (minimax fit on the drawn cells), 2 m edge transition, one row of eight 2.5×5 m boxes on the far (north) edge and the apron over the 0.10–0.37 m grass gap to street 30633545 (the driving lane) are guesses; the pocket straddles the drawn ground's ridge on terrain grid line x=250, so the plane is creased there (two planes meeting at the ridge, guess); house 59 stands 0.77 m off the west end, outside the clipped outline
      {"source":"1379042188","name":"Gatuparkering Sankt Lars väg 59","surface":"asphalt","capacity":8,"capacitySource":"guess","polygon":[[211.61,300.5],[221.15,297.59],[219.46,292.05],[227.62,289.56],[223.97,277.62],[206.27,283.03]],"grade":{"transition":4,"transitionSource":"guess","clip":true,"fit":"minimax"},"layout":{"aisle":{"road":"335403605","from":2},"margin":0.25,"rows":[{"side":-1,"offset":3,"to":16},{"side":1,"offset":3}],"source":"guess"}}, // #1452: OSM gives the concave six-corner outline only (capacity 8 is a guess). Plane (minimax fit on the drawn cells, cut as two convex parts), 4 m edge transition, whole 2.5×5 m boxes 3 m either side of service way 335403605's straight end (a 6 m clear aisle, guess; the way is the driving lane and stays clear), five on the north side up to 16 m along it and three on the south side up to the notch, so the eight boxes keep the turning space at the way's end free
      {"source":"1379042235","name":"Gatuparkering Sankt Lars väg 56","surface":"asphalt","capacity":4,"capacitySource":"guess","orientation":"perpendicular","polygon":[[194.92,304.69],[203.26,302.25],[201.82,297.37],[193.49,299.82]],"grade":{"transition":1.5,"transitionSource":"guess","clip":true,"fit":"minimax"},"layout":{"row":"south","count":3,"boxes":true,"street":{"road":"335403605","apron":"guess"},"source":"guess"}}, // #1452: OSM gives the outline and orientation only (capacity 4 is a guess: 8.69 m would give 2.17 m per car). Plane (minimax fit on the drawn cells), 1.5 m edge transition, one row of three whole 2.5×5 m boxes on the far (south) edge and the apron over the grass gap to service way 335403605 (the driving lane) are guesses
      {"source":"1379043164","name":"Gatuparkering Sankt Lars väg 62","surface":"asphalt","capacity":3,"capacitySource":"OSM","orientation":"perpendicular","polygon":[[254.09,369.16],[262.83,366.87],[264.05,371.54],[255.32,373.83]],"grade":{"transition":1.5,"transitionSource":"guess","clip":true,"fit":"minimax"},"layout":{"row":"south","count":3,"boxes":true,"bayDepth":4.8,"street":{"road":"30633545","apron":"guess"},"source":"guess"}}, // #1451: as 1379042106; the pocket is only 4.83 m deep, so its three 2.5 m boxes are 4.8 m deep (guess) and stay inside the outline, along house 145221625 6 cm beyond the far edge
      {"source":"1379043165","name":"Gatuparkering Sankt Lars väg 64","surface":"asphalt","capacity":6,"capacitySource":"OSM","orientation":"perpendicular","polygon":[[268.36,365.42],[283,360.95],[284.54,365.98],[269.9,370.46]],"grade":{"transition":1.5,"transitionSource":"guess","clip":true,"fit":"minimax"},"layout":{"row":"south","count":6,"boxes":true,"street":{"road":"30633545","apron":"guess"},"source":"guess"}}, // #1450: as 1379042014; the apron covers the 0.56–1.17 m gap and, beyond the street's bend, closes back to the pocket corner within 2 m (guess)
    ],
    storey: 3,
    window: [
      1.1,
      1.7,
    ],
    bay: 3.5,
    sill: 1,
    // #1804 (*guess*, Google 3D set 2026-11-02): wider spread of woodland crown sizes (was height 8–14, radius 3–5), so the
    // southern woodland screens read as a closed, uneven canopy; same instances, same triangles. Radius stays below bigTrees.radius.
    treeHeight: [
      7,
      16,
    ],
    treeRadius: [
      2.8,
      6.4,
    ],
    // #1675: old, broad-crowned broadleaf trees on the lawns between the hospital pavilions (nr 41–47, Asylen, Lime, Repligen) as in Google 3D / the aerial photo:
    // `height` / `radius` m of the crown ellipsoid (clearly bigger than the sparse woodland's treeHeight/treeRadius), `spacing` m between big trees, `clearance` m kept from
    // pavilion footprints / roads (beyond half their width) / car parks / the sparse woodland's trees. Groups are open lawn polygons (OSM has no tree rows here → positions
    // and counts are *guess*, kept few: they share the two instanced woodland batches, ~62 triangles each on phones, within the #1474 far-detail budget).
    bigTrees: {
      height: [15, 21],
      radius: [7.5, 10.5],
      spacing: 15,
      clearance: { building: 5, road: 3.5, parking: 3, forest: 8 },
      groups: [
        {"name":"lawn-south-of-41","polygon":[[-52,306],[-8,306],[-8,352],[-52,352]],"n":9},
        {"name":"lawn-between-45-and-47","polygon":[[2,306],[46,306],[46,372],[2,372]],"n":10},
        {"name":"lawn-east-of-45","polygon":[[56,276],[90,276],[90,334],[56,334]],"n":5},
        {"name":"lawn-south-of-44","polygon":[[6,418],[46,418],[46,460],[6,460]],"n":6},
        {"name":"allee-along-road","polygon":[[-30,300],[-22,300],[24,372],[16,376]],"n":6,"spacing":14},
      ],
    },
    ground: {"x0":-1000,"x1":1000,"z1":1000},
    view: {"fogNear":45,"fogFar":650,"cameraFar":1000},
    roofColor: 5396570,
  },

  // #530 actual northern footprints; untagged height/roof/window/parking/tree details are visual assumptions.
  north: {
    buildings: [
      {"source":"88457603","polygon":[[-219.17,-78.69],[-229.29,-71.35],[-231.82,-74.79],[-218.49,-84.33],[-217.03,-82.97],[-211.54,-86.95],[-194.95,-71.63],[-192.19,-74.62],[-175.03,-58.77],[-177.92,-55.65],[-156.76,-36.1],[-164.31,-27.92],[-188.84,-50.58],[-188.06,-51.43],[-198.07,-60.68],[-198.8,-59.88],[-219.17,-78.69]],"name":"Hunnerupshemmet / 85","levels":3,"levelsSource":"visual assumption","storey":3.3,"roofRise":1.5,"modern":true,"facade":13158845},
      {"source":"130578354","polygon":[[-216.76,-111.89],[-190.19,-148.42],[-142.0,-144.04],[-142.48,-138.37],[-145.27,-137.73],[-145.25,-133.12],[-147.54,-133.02],[-147.92,-128.31],[-178.44,-130.69],[-177.54,-135.41],[-180.42,-135.17],[-182.79,-132.73],[-180.82,-130.74],[-199.49,-104.67],[-202.27,-106.75],[-204.21,-104.73],[-207.36,-107.04],[-208.88,-105.43],[-216.76,-111.89]],"name":"Norra vinklade byggnaden","levels":3,"levelsSource":"visual assumption","storey":3.3,"roofRise":0,"modern":true,"roof":"flat","facade":13158845},
      {"source":"88457569","polygon":[[-79.24,-183.84],[-79.24,-187.9],[-67.04,-187.91],[-67.04,-187.51],[-44.11,-187.53],[-44.12,-187.48],[-32.59,-187.49],[-32.54,-170.24],[-47.62,-170.22],[-47.62,-173.03],[-66.27,-173.02],[-66.26,-171.06],[-79.44,-171.05],[-79.46,-178.99],[-82.01,-178.98],[-82.02,-183.83],[-79.24,-183.84]],"name":"Norra tegelpaviljongen","levels":2,"levelsSource":"visual assumption","storey":3.3,"roofRise":3.5,"modern":false},
    ],
    paths: [
      {"source":"145221574","path":[[-218.5,-275.76],[-209.58,-274.06],[-199.71,-272.82],[-196.73,-272.57],[-183.32,-271.16],[-181.36,-270.83],[-169.51,-269.43],[-163.37,-268.78],[-158.97,-266.88],[-155.86,-264.28],[-154.06,-262.32],[-152.5,-260.3],[-151.59,-258.32],[-150.78,-256.54],[-149.7,-249.52],[-147.49,-239.4],[-144.04,-218.39],[-141.07,-202.84],[-138.03,-186.26],[-136.06,-177.03],[-134.64,-167.06],[-134.42,-161.84],[-134.19,-156.36],[-134.94,-142.23]],"w":2},
      {"source":"145221606","path":[[-232.79,-296.36],[-226.39,-297.2],[-211.43,-295.2],[-206.47,-295.52],[-194.34,-294.19],[-189.77,-293.9],[-170.21,-289.86],[-163.93,-289.71],[-160.78,-291.35],[-157.49,-292.88],[-153.82,-292.63],[-146.12,-291.56],[-143.07,-290.91],[-140.51,-288.4],[-139.43,-285.67],[-137.6,-279.17],[-135.12,-266.13],[-134.36,-263.1],[-132.81,-256.2],[-130.42,-243.44],[-123.11,-211.56],[-118.45,-185.03],[-117.56,-178.82]],"w":2},
      {"source":"159287727","path":[[-117.56,-178.82],[-117.46,-161.61],[-116.25,-142.47],[-116.26,-141.56],[-116.41,-134.1],[-114.37,-97.63],[-113.97,-85.75],[-109.6,-74.81],[-103.88,-65.7],[-94.85,-57.64],[-84.21,-49.06],[-71.1,-38.72],[-63.88,-36.37],[-47.2,-33.16],[-40.63,-32.74],[-28.31,-32.92],[-18.17,-32.82],[9.1,-32.56],[8.07,-29.4],[7.34,-26.01],[5.73,-16.66]],"w":2},
      {"source":"159287752","path":[[-117.56,-178.82],[-112.54,-178.68],[-106.78,-177.47],[-102.02,-175.07],[-96.33,-173.27],[-89.56,-171.62],[-83.62,-170.1],[-78.85,-167.43],[-74.67,-161.09]],"w":2},
      {"source":"850235116","path":[[-142.2,-142.95],[-138.79,-142.8],[-134.94,-142.23],[-126.9,-141.65],[-116.26,-141.56]],"w":2}, // #1348: the first point is a *guess*: OSM starts this stub 3.6 m short of Hus 130578354's east face (x ≈ -142.2), so it now reaches the wall
      {"source":"850235118","path":[[-136.06,-177.03],[-128.8,-178.12],[-117.56,-178.82]],"w":2},
      {"source":"1228396154","path":[[-134.94,-142.23],[-136.7,-112.47],[-135.91,-93.07],[-136.34,-82.39],[-135.95,-55.32],[-136.18,-42.22],[-135.59,-39.25],[-135.03,-36.44],[-133.25,-32.55],[-127.52,-25.21],[-124.78,-23.59],[-118.18,-21.03],[-109.65,-19.77],[-98.61,-19.27],[-88.35,-19.7],[-82.44,-19.74],[-71.38,-19.76],[-74.4,-19.77]],"w":2},
    ],
    access: [
      {"source":"130442838","path":[[-328.08,-124.07],[-323.0,-120.18],[-308.47,-106.87],[-294.15,-95.19],[-287.95,-90.27],[-281.28,-87.3],[-268.18,-86.87],[-252.75,-90.02],[-246.43,-91.23],[-220.28,-96.79],[-217.74,-97.13],[-208.55,-96.74],[-202.11,-94.5],[-196.04,-90.41],[-191.55,-86.32],[-162.88,-57.88],[-149.43,-44.61],[-143.88,-36.74],[-142.39,-34.33],[-138.88,-29.12]],"w":5.5},
      {"source":"1228396156","path":[[-122.25,-40.5],[-126.71,-37.33],[-133.25,-32.55],[-138.88,-29.12],[-141.83,-27.33],[-142.59,-26.76],[-153.52,-18.64],[-161.23,-12.33],[-169.74,-4.22],[-178.3,3.76],[-191.96,15.4],[-201.0,22.65],[-207.84,25.96],[-212.87,26.79],[-218.82,26.96],[-225.59,26.18],[-239.76,22.92],[-245.38,23.13],[-249.76,24.21],[-254.67,25.98],[-260.95,29.66],[-277.71,41.57],[-284.23,43.98],[-292.69,45.08]],"w":5.5},
      {"source":"44447972","path":[[-245.38,23.13],[-247.4,16.96],[-248.84,15.17],[-256.9,9.48],[-272.91,-2.94],[-280.02,-7.87],[-283.25,-11.44],[-285.64,-16.72],[-285.35,-23.11],[-280.55,-32.49],[-269.86,-41.43],[-261.11,-49.49],[-257.73,-55.57],[-255.56,-66.31],[-254.74,-79.37],[-252.75,-90.02]],"w":4},
      {"source":"44447980","path":[[-142.59,-26.76],[-133.02,-11.63],[-124.68,-0.37],[-117.93,4.55],[-111.92,6.21],[-105.69,11.63],[-107.8,15.8],[-111.3,18.6]],"w":4}, // #1347: the last two points are a *guess*: OSM ends the way in open grass 10 m short of Östra långan (88457595), so it now curves in to that building's east corner (-112.14,19.2); w 4 matches the other service ways of `north.access` (60420594 …), only the footpaths in `paths` are 2
      {"source":"60420594","path":[[-127.2,-161.66],[-117.46,-161.61],[-74.67,-161.09]],"w":4},
      {"source":"159287720","path":[[-74.67,-161.09],[-43.26,-160.79],[16.87,-158.49]],"w":4},
      {"source":"850235117","path":[[-127.2,-161.66],[-134.42,-161.84],[-145.2,-161.29],[-149.02,-161.36],[-165.15,-161.75]],"w":4},
      {"source":"aerial interpretation","pixels":[[768,60],[802,64],[748,282],[716,281]],"polygon":[[-197.95,-91.21],[-192.05,-98.57],[-148.98,-54.11],[-153.89,-46.77]]},
      {"source":"aerial interpretation","pixels":[[1026,18],[1051,8],[1110,103],[1085,121]],"polygon":[[-170.08,-157.66],[-168.77,-164.96],[-137.94,-164.88],[-137.39,-156.4]]},
    ],
    trees: [
    ],
    treeScale: [
      1.2,
      1.7,
    ],
    treeRows: [
      {"name":"Kallby-avenue","from":[-234,12],"to":[-145,-44],"step":13},
      {"name":"Alvagen-avenue","from":[-276,-97],"to":[-215,-106],"step":12},
      {"name":"north-street","from":[-118,-54],"to":[-115,-163],"step":14},
    ],
    treePatches: [
      {"name":"Hunnerup-park","polygon":[[-265,-55],[-245,-83],[-219,-38],[-238,-13]],"n":14},
      {"name":"north-campus","polygon":[[-135,-182],[-105,-199],[-93,-180],[-102,-172]],"n":8},
    ],
    storey: 3.3,
    roofRise: 1.5,
    annexRise: 0.5,
    window: [
      1.1,
      1.8,
    ],
    sill: 0.9,
    bay: 3,
    frame: 0.07,
    facade: 16777215,
    plinth: 8750455,
    glass: 3490893,
    roof: 5593950,
    pathLift: 0.025,
  },

  east: {
    lod: { start: 30, end: 42 }, // #1969: m from a detailed campus batch's bounding box at which it fades (src/lod.js BatchLod) into its light level (CAMPUS_LOD), only that beyond `end` (*guess*: from the flat the three batches are 45 – 80 m away)
    buildings: [
      {"source":"88457546","polygon":[[39.82,-133.52],[50.71,-133.78],[50.79,-130.68],[64.45,-131.0],[64.9,-113.43],[50.44,-113.08],[50.33,-117.48],[45.1,-117.36],[45.18,-114.52],[26.82,-114.08],[26.39,-131.02],[39.88,-131.33],[39.82,-133.52]],"name":"Sankt Thomas skola / byggnad 1 (Klockhuset)","levels":1,"levelsSource":"Commons 2014 photo and Hemsö: two tall storeys; Google 3D (#1734): a one-storey front wing towards the courtyard","storey":4.6,"frameColor":15657439,
        // #1733: the centre (risalit, pediment, great arched window, entrance, clock tower) stands on the park side (model −z,
        // true NE) over the OSM outline's 11 m projection (x 39.8–50.8, z −131.3 → −133.8), not on the courtyard side: Google 3D
        // (docs/foton/snedbild-klockhuset-sankt-thomas.png) shows the tower behind the roof from the courtyard, which has a
        // one-storey front wing instead (#1734). x / face are the projection's edges 0.1–0.2 m proud (*guess*); the tower keeps
        // its 4 m offset behind the face.
        // #1743: the tower stands on the main roof's park-side slope (eave +0 at z -131, ridge +4.4 at z -125.3), so its south dial
        // sank into the slope behind the ridge; `tower.base` 1.4 → 3.0 lifts the white plinth block and the dials clear of the roof (*guess*).
        // #1734 (same snapshot): towards the courtyard two two-storey pavilions with their own taller hips, a recessed
        // two-storey centre (court wall z -120) with three tall round-arched upper windows and a canted bay next to the east
        // pavilion, and a one-storey wing with a low lean-to hip in front of it (the base outline, `levels` 1). Every
        // boundary, the pavilions' 0.6 m raise, the wing's slope and the arch/bay sizes are *guess*es read off the oblique view.
        // `roofs`: the wing's hip parts (split where its court front steps by 1.4 m); a section's own box is its hip part.
        "campus":{"style":"klockhuset","chimneys":[[32,-122.5],[60.5,-124],[53,-125.6]],
          "sections":[{"name":"west pavilion","box":[26,-132,38.2,-113.5],"levels":2,"raise":.6},{"name":"centre","box":[38.2,-134.5,56.5,-120],"levels":2,"roofs":[[38.2,-131.1,56.5,-120]]},{"name":"east pavilion","box":[56.5,-132,65.5,-117],"levels":2,"raise":.6}],
          "roofs":[{"box":[38.2,-120,45.15,-112],"slope":.12},{"box":[45.15,-120,65.5,-112],"slope":.12}],
          "court":{"face":-120,"normal":1,"arches":[44.2,47.4,50.6],"sill":5.6,"height":3.0,"width":1.5,"bay":{"x":[53,55.8],"depth":1.1,"from":5.5}},
          "centre":{"mailbox":true,"x":[39.6,51.0],"face":-133.9,"normal":-1,"depth":5,"render":4.75,"pilasters":true,"pediment":2.1,"roofBack":2.2,
            "window":{"sill":4.9,"height":3.9,"width":2.6},
            "tower":{"z":-129.9,"base":3.0,"width":3.6,"stage":4.0,"clock":.8,"clockFace":15328456,"clockRim":2829099,"lantern":2.3,"lanternHeight":2.7,"opening":2829099,"dome":1.7,"spire":2.4,"gilt":13280832}}}},
      {"source":"88457547","polygon":[[138.12,-129.52],[138.19,-137.81],[133.49,-137.87],[133.57,-147.48],[137.9,-147.43],[137.94,-151.12],[149.85,-150.99],[149.82,-147.73],[154.48,-147.67],[154.39,-138.06],[150.15,-138.11],[150.07,-129.28],[166.05,-129.1],[165.94,-116.99],[149.39,-117.17],[148.9,-63.59],[161.35,-63.45],[161.24,-52.48],[136.64,-52.75],[136.71,-59.94],[136.28,-59.94],[136.91,-129.54],[138.12,-129.52]],"name":"H\u00f6jebroskolan / byggnad 9","levels":1,"levelsSource":"Commons 2014 photo of the south block and long wing: one storey","storey":4.7,"frameColor":15657439,
        "campus":{"style":"ward","chimneys":[[143,-75],[143,-95],[143,-115],[149,-57.5],[144,-142]]}},
      {"source":"88457552","polygon":[[105.08,-126.68],[116.15,-126.46],[116.21,-129.88],[126.08,-129.69],[126.0,-126.27],[127.31,-126.24],[127.14,-117.41],[125.83,-117.44],[125.71,-111.53],[115.85,-111.72],[115.97,-117.63],[104.89,-117.86],[104.79,-112.25],[91.54,-112.51],[91.65,-118.12],[80.5,-118.34],[80.35,-111.1],[70.85,-111.29],[71.23,-130.27],[80.74,-130.08],[80.68,-127.17],[91.83,-126.95],[91.87,-129.08],[105.11,-128.82],[105.08,-126.68]],"name":"F\u00f6rskolan Freinet / byggnad 7","levels":2,"levelsSource":"Commons 2014 photo (Freinetskolan sign) and Hemsö By7: two storeys","storey":4.3,"frameColor":15657439,
        "campus":{"style":"stenhammar","sections":[{"name":"west pavilion","box":[70.5,-130.6,80.6,-110.8],"raise":1.2},{"name":"centre","box":[91.7,-129.4,104.95,-112],"raise":1.2},{"name":"east pavilion","box":[115.95,-130.2,127.6,-111.2],"raise":1.2,"roofs":[[115.95,-130.2,126.05,-111.2],[126.05,-126.5,127.6,-117.2]]}],
          "roofs":[{"box":[80.8,-128,91.5,-117],"dormers":3},{"box":[105.1,-128,115.9,-116.5],"dormers":3}],
          "chimneys":[[75.8,-120.7],[98.3,-120.6],[121.5,-120.6],[86,-122.6],[110.5,-122.2]]}},
      {"source":"88457558","polygon":[[273.63,-69.61],[292.05,-79.29],[296.27,-71.27],[277.85,-61.58],[273.63,-69.61]],"name":"Komplementbyggnad 88457558","levels":1,"levelsSource":"visual assumption","storey":3.6,"roofRise":2,"frameColor":15657439},
      {"source":"88457565","polygon":[[228.12,-65.56],[261.7,-65.44],[261.68,-53.62],[260.67,-53.63],[260.66,-49.35],[252.87,-49.38],[252.88,-54.29],[228.1,-54.38],[228.12,-65.56]],"name":"F\u00f6rskolan Kastanjen","levels":1,"levelsSource":"visual assumption","storey":3.6,"roofRise":2,"frameColor":15657439},
      {"source":"88457581","polygon":[[89.73,17.57],[89.78,-8.74],[115.39,-8.64],[115.38,-1.76],[115.37,4.0],[115.34,19.86],[107.99,19.84],[107.98,25.63],[94.57,25.58],[94.58,17.58],[89.73,17.57]],"name":"Kunskapsskolan / byggnad 19","levels":1,"levelsSource":"Commons 2014 photo: three-storey block behind a two-storey front, one-storey annex","storey":3.9,"frameColor":15657439,
        "campus":{"style":"laundry","sections":[{"name":"two-storey front","box":[89.5,-9,96.5,17.7],"levels":2,"roof":{"rise":.8,"slope":.25}},{"name":"three-storey block","box":[96.5,-9,115.6,19.9],"levels":3}],"chimneys":[[108.5,4.5]]}},
      // #1732: the low building behind Realgymnasiet's hall (OSM 88457600, x 79.5...90.6, z 39.4...63.9) and the small annex against the hall's SE gable, read from the user's
      // Google Maps top view (docs/foton/satellit-sankt-lars-bro-skala-20m.png, 0.196 m/px, #1715's transform; the roofs lie ~3 m west of the OSM outline, which the hall's
      // own outline does not) and oblique view (docs/foton/snedbild-realgymnasiet-lagt-hus-bakbyggnad.png): a higher NE wing, a lower strip recessed along its NW side,
      // a lower, wider SW part, all flat and dark-roofed on brick walls; the annex has a flat roof with a light ventilation unit (`units`: [x, z, width, depth, height]
      // on the flat roof). The SW part stops at z 64.4, short of the roof's ~66 in the image, so service way 44447967 (OSM, 4.5 m) stays mostly clear. Every number is a *guess*.
      {"source":"guess-1732-ne","osm":"88457600","polygon":[[81.6,40.8],[87.3,40.8],[87.3,57],[81.6,57],[81.6,40.8]],"name":"Låg byggnad bakom Realgymnasiet, högre NÖ-del (guess)","levels":1,"levelsSource":"guess from the top and oblique views (#1732)","storey":4.0,"roof":"flat","windows":false,"facade":14513752},
      {"source":"guess-1732-recess","osm":"88457600","polygon":[[79.8,40.8],[81.6,40.8],[81.6,55],[79.8,55],[79.8,40.8]],"name":"Låg byggnad bakom Realgymnasiet, indragen låg del (guess)","levels":1,"levelsSource":"guess from the top and oblique views (#1732)","storey":2.8,"roof":"flat","windows":false,"facade":14513752},
      {"source":"guess-1732-sw","osm":"88457600","polygon":[[77,57],[87.3,57],[87.3,64.4],[77,64.4],[77,57]],"name":"Låg byggnad bakom Realgymnasiet, lägre SV-del (guess)","levels":1,"levelsSource":"guess from the top and oblique views (#1732)","storey":3.2,"roof":"flat","windows":false,"facade":14513752},
      {"source":"guess-1732-annex","polygon":[[73,40.6],[79.2,40.6],[79.2,47.2],[73,47.2],[73,40.6]],"name":"Tillbyggnad vid Realgymnasiets sal (guess)","levels":1,"levelsSource":"guess from the top and oblique views (#1732)","storey":3.8,"roof":"flat","windows":false,"facade":14513752,"units":[[77.4,43.5,3.4,2.2,1.0]]},
      {"source":"88457601","polygon":[[147.34,-3.67],[125.29,-3.73],[124.91,-1.56],[115.38,-1.76],[115.37,4.0],[125.33,4.25],[126.01,24.18],[148.79,24.33],[147.34,-3.67]],"name":"\u00d6stra paviljongen vid Kunskapsskolan / byggnad 19","levels":2,"levelsSource":"guess: lower eastern part of byggnad 19 (Hemsö map), not photographed","storey":3.9,"frameColor":15657439,
        "campus":{"style":"laundry","chimneys":[[137,10]]}},
      {"source":"88457606","polygon":[[105.93,-66.55],[116.99,-66.33],[117.06,-69.76],[126.92,-69.55],[126.86,-66.13],[128.15,-66.1],[127.98,-57.28],[126.68,-57.3],[126.56,-51.39],[116.7,-51.6],[116.82,-57.49],[105.74,-57.72],[105.64,-52.11],[92.39,-52.39],[92.49,-57.98],[81.35,-58.21],[81.21,-50.96],[71.71,-51.16],[72.07,-70.14],[81.58,-69.94],[81.53,-67.04],[92.67,-66.81],[92.72,-68.95],[105.96,-68.68],[105.93,-66.55]],"name":"F\u00f6rskolan Framtiden / byggnad 8","levels":2,"levelsSource":"Commons 2014 photo and Hemsö By8: two storeys","storey":4.3,"frameColor":15657439,
        "campus":{"style":"stenhammar","sections":[{"name":"west pavilion","box":[71,-70.6,81.4,-50.5],"raise":1.2},{"name":"centre","box":[92.55,-69.4,105.85,-51.7],"raise":1.2},{"name":"east pavilion","box":[116.9,-70.2,128.6,-50.9],"raise":1.2,"roofs":[[116.9,-70.2,126.9,-50.9],[126.9,-66.5,128.6,-56.9]]}],
          "roofs":[[81.5,-68,92.5,-57],[106,-67.5,116.8,-56.5]],
          "centre":{"x":[92.72,105.96],"face":-68.82,"normal":-1,"depth":0,"pedDepth":1.6,"pediment":1.9,"roofBack":2.5},
          "chimneys":[[76.6,-61.2],[122.6,-61],[99.3,-61.5],[87,-62.6],[111.5,-62.2]]}},
      {"source":"88457612","polygon":[[-5.23,-65.15],[6.26,-65.2],[6.22,-71.29],[15.76,-71.33],[15.89,-52.58],[6.38,-52.54],[6.35,-56.62],[-5.13,-56.57],[-5.11,-53.63],[-18.01,-53.57],[-18.04,-56.52],[-29.02,-56.47],[-29.0,-53.72],[-38.79,-53.67],[-38.89,-70.68],[-29.02,-70.73],[-28.98,-65.05],[-18.13,-65.1],[-18.17,-70.15],[-5.26,-70.22],[-5.23,-65.15]],"name":"NTI / skolan \u00f6ver gatan","levels":2,"levelsSource":"visual assumption","storey":4.3,"roofRise":3,"frameColor":15657439,"classic":true},
      // #1762 (corrects #1756 on the user's report): Nordic Wellness S:t Lars Sportcenter stands EAST of Sankt Lars väg, in the angle
      // between Sankt Lars väg and Skånevägen, as in both Google 3D views (docs/nordic-wellness-st-lars-maps-mot-*.jpg). #1756 had put it on
      // the 1177 geocode of Sankt Lars väg 90 (model -203.8, -237.0), which is OSM 88457557 "Grenhuset" (Sankt Lars väg 90, west of the road,
      // not modelled). The outline is the fitted rectangle (68.8 x 36.7 m, turned 8.7 deg, within ~1 m of every OSM corner) of OSM way
      // 1136415461 (building=yes, no name; Overpass 2026-11-01, docs/references/surrounding-views/nordic-wellness-osm-check-2026-10-31.json):
      // the short WSW face towards Sankt Lars väg (12 m from its centreline, 3 m from footway 145221606), the long NNW face towards Skånevägen (20 m, not modelled).
      // That this way is the gym, the three storeys and the whole `model` are *guess-1762*. p[0] -> p[1] is the NNW face from the road end
      // (src/nordicgym.js local frame): #1824 keeps a 12 m brick front at the road, the #1823 circulation corner beside it, and a full-height green hall behind.
      // Outside WALK (z >= -200); the far end reaches past SITE.backgroundGround.z0 (-340) onto EDGE_BACKDROP's flat north ground.
// #1824: photo-read hall/panels, plinth, rear parking and stair; all dimensions/colours are guesses.
      // #1823: glass dimensions/colours are photo-read guesses; a shallow opaque reflection/stair scene.
      // #1822: front dimensions/colours and 6 m entrance strip are guesses, not surveyed.
      {"source":"guess-1762","osm":"1136415461","polygon":[[-206.67,-299.53],[-196.29,-367.49],[-160.04,-361.95],[-170.42,-293.99],[-206.67,-299.53]],"name":"Nordic Wellness S:t Lars Sportcenter (guess)","levels":3,"levelsSource":"guess from the Google 3D views (#1745): two to three storeys; footprint OSM 1136415461 (#1762)","template":"nordicgym","model":{"storey":3.6,"lowHeight":4.6,"low":{"w":14,"d":9},"brick":14457474,"brickLow":13931644,"roof":6316128,"roofThick":0.3,"panel":1846346,"panelHeight":0.14,"panelRow":2.1,"panelGap":0.45,"panelMargin":1.6,"panelEastInset":6.5,"unit":{"w":4,"h":1.6,"d":3,"x":-178.71,"z":-361.16},"unitColor":13487565,"glassColor":6982806,"mullion":14474460,"window":{"w":2,"h":1.6,"sill":1,"bay":4.2},"windowColor":2240570,"hall":{"parkingLift":0.045,"lineLift":0.06,"lineW":0.1,"planterH":0.18,"plantScale":[2,0.7,1],"stairXOffset":0.7,"treadThick":0.06,"landingD":0.8,"landingThick":0.08,"railSize":0.045,"railH":0.9,"loadingSill":0.08,"loadingFaceOffset":0.025,"windowFaceGap":0.015,"frontDepth":12,"plinthH":1.4,"baseColor":4349254,"panelColors":[7705447,8165743,7179361],"bands":3,"bay":3,"seam":0.045,"bandOffset":0.065,"bandShift":0.3,"concrete":9606541,"windowCount":5,"windowW":2.75,"windowH":1.25,"windowBay":2.9,"windowStart":2.7,"windowBand":1,"windowSill":0.55,"windowColor":2634543,"loadingW":3.2,"loadingH":1.2,"loadingOffset":6,"parkingDepth":13,"parkingInset":2.4,"asphalt":6317417,"line":14934226,"stallW":2.8,"stallD":5,"stalls":6,"stairH":3.2,"stairRun":4.2,"stairW":0.85,"stairSteps":10,"steel":9214878,"plantR":0.65,"plantColor":5402179},"front":{"sign":{"width":6.8,"height":0.52,"top":0.1,"right":0.7,"offset":0.08,"far":180,"canvas":[1024,128],"marginPx":6,"titlePx":84,"titleY":86,"subtitlePx":28,"color":"#8cddc8","anisotropy":4,"alphaTest":0.06},"treeFractions":[0.22,0.8],"treeOffset":2.4,"treeH":3.6,"treeR":0.8,"treeLeaf":4945222,"treeBark":6770237,"brick":10902352,"roofTrimH":0.12,"count":7,"margin":2.6,"upperW":2.05,"upperH":2.05,"upperSill":0.85,"groundW":2.1,"groundH":3.15,"groundSill":0.2,"frame":0.13,"frameColor":2434341,"paneColor":7969195,"litColor":16772525,"lightColor":16768901,"washW":1.5,"washH":1.15,"lampW":0.22},"glass":{"east":6,"south":12,"bay":2,"sill":0.05,"head":0.25,"frame":0.12,"offset":0.035,"recess":2.4,"frameColor":10274702,"backColor":6987442,"skyColor":8304826,"reflectionColor":11129039,"openColor":3886937,"openH":0.65,"stairColor":6842470,"doorColor":5211518,"globeColor":16775116,"globeR":0.22,"cord":0.025,"globes":[[1.6,4.8],[4.1,6.6]],"stair":{"margin":0.65,"inset":0.85,"steps":16,"width":0.85,"stringer":0.12,"railH":1,"rail":0.045},"door":{"along":1.5,"w":1.5,"h":2.6,"railY":1.05,"handleOut":0.08,"handleH":0.45,"handleW":0.035,"handleY":0.9,"canopy":0.45},"pavingColor":11973555,"pad":{"depth":2.1,"thick":0.08,"extra":0.5},"rackColor":5396570,"rack":{"count":2,"spacing":1.4,"offset":1.5,"w":0.7,"h":0.8,"bar":0.045}}}},
      {"source":"130578352","polygon":[[125.46,40.62],[119.55,40.67],[119.67,53.05],[125.59,53.0],[125.46,40.62]],"name":"Komplementbyggnad 130578352","levels":1,"levelsSource":"visual assumption","storey":3.6,"roofRise":2,"frameColor":15657439},
      {"source":"130678797","polygon":[[-41.57,-134.49],[-31.06,-134.87],[-30.95,-131.92],[-21.25,-132.27],[-21.36,-135.15],[-5.68,-135.72],[-5.58,-133.09],[4.47,-133.45],[4.35,-136.54],[15.03,-136.93],[15.85,-115.25],[4.21,-114.83],[3.94,-121.73],[-3.76,-121.45],[-3.63,-117.88],[-19.49,-117.3],[-19.68,-122.28],[-31.94,-121.83],[-31.75,-116.71],[-40.87,-116.38],[-41.57,-134.49]],"name":"\u00d6stra borgg\u00e5rden, byggnad 2","levels":2,"levelsSource":"Commons 2014 photo: two storeys","storey":4.3,"frameColor":15657439,
        "campus":{"style":"stenhammar","sections":[{"name":"west pavilion","box":[-42,-135.2,-31.3,-115.9],"raise":1.2},{"name":"centre","box":[-21.3,-136,-5.62,-117],"raise":1.2},{"name":"east pavilion","box":[4.2,-137.3,16.3,-114.6],"raise":1.2}],
          "roofs":[{"box":[-30.9,-133.5,-21.4,-120],"dormers":3},{"box":[-5.5,-134.5,4.1,-121.4],"dormers":3},[-5.62,-121.4,-3.5,-117.5]],
          "chimneys":[[-36.3,-125.3],[-13.5,-126.5],[10,-125.9],[-26.4,-127],[-0.6,-127.5]]}},
      {"source":"130681301","polygon":[[72.93,40.79],[46.47,40.46],[46.68,19.41],[28.4,19.19],[28.0,58.28],[72.74,58.83],[72.93,40.79]],"name":"Realgymnasiet, Sankt Lars v\u00e4g 20 (l\u00e5nga tegelbyggnaden)","levels":1,"levelsSource":"user photos docs/foton/skolbyggnad-*.jpg 2026-10-23 (#1532): a one-storey range and gable house, a two-storey hall","storey":3.8,"roofRise":2,"frameColor":13675862,"template":"realgym20",
        // #1532 (src/realgym20.js): three volumes on the kept OSM outline, read from the user's two photos; every metre here is *guess*.
        // gable: the SW gable house (`length` m along the road from the south front, windows at local metres from its SW corner);
        // range: the long one-storey part north of it (same eave, lower roof); hall: the taller part east of the gable house.
        "model":{"plinth":0.45,"minSill":0.5,"overhang":0.35,"frame":0.07,"chimneyHeight":1.2,
          "gable":{"eave":5.6,"rise":5.0,"length":11,"window":{"sill":1.0,"head":3.6,"width":1.7,"cover":0.5},"southWindows":[3.0,7.0,11.0,15.0],"westWindows":[2.6,5.8],"peak":{"sill":6.7,"head":8.0,"width":1.2}},
          "range":{"rise":2.6,"bay":2.2,"window":{"sill":0.9,"head":3.4,"width":0.9,"cover":0.6}},
          "hall":{"parkingLift":0.045,"lineLift":0.06,"lineW":0.1,"planterH":0.18,"plantScale":[2,0.7,1],"stairXOffset":0.7,"treadThick":0.06,"landingD":0.8,"landingThick":0.08,"railSize":0.045,"railH":0.9,"loadingSill":0.08,"loadingFaceOffset":0.025,"windowFaceGap":0.015,"eave":9.0,"rise":4.6,"bay":3.4,"margin":2.0,"window":{"sill":1.2,"head":7.6,"width":1.1,"transom":4.4},"round":0.8,"roundAt":0.45,"chimney":[34.5,9.0],"vent":[24.0,9.0]},
          "tower":{"b":9.6,"width":2.6,"proj":0.5,"extra":2.0,"rise":1.0,"window":{"sill":0.5,"head":1.6,"width":0.8}},
          "gableDormer":{"a":1.0,"b":[3.5,8.0],"top":7.5},
          "dormers":[{"a":0.8,"b":[16.0,20.0],"top":7.0},{"a":0.8,"b":[24.5,26.0],"top":6.6},{"a":0.8,"b":[29.5,31.0],"top":6.6}],
          "downpipes":[0.5,11.2,38.6],"vents":[[13.5,16.5,3.0,8.0,1.2]]}},
      // #1703 (docs/foton/parkering-brofaste-nedsankt-hus.jpg, -oversikt.jpg): the low brick house behind the car row, one storey with a flat dark roof about 1-1.5 m over the cars;
      // simple wall box + flat roof in the shared batches, no windows (`windows: false`). Every number is a *guess*.
      // #1731: position and size read from the user's Google Maps top view (docs/foton/satellit-sankt-lars-bro-skala-20m.png, 0.196 m/px, mapped with #1715's transform) and
      // oblique view (docs/foton/snedbild-realgymnasiet-lagt-hus-bakbyggnad.png): the roof is ~9 x 9 m, x ~34...43.5, z 58.5 (against the gable house's south front, under
      // its south windows) ... ~67.5; not in a notch of the OSM outline, whose SW corner the image confirms. #1735: the west edge now stands at x 34.5, just behind the stalls
      // (`guess-1554`, x 29.4...34.4: the top view puts the row at the kerb, cars nose to the street, fronts about in line with the school's west front x ~28-29, and a narrow hedge x ~31...33.5 is not modelled). The house is sunken towards the river, which the flat model terrain here
      // does not show: one 2.6 m storey with its floor `sunk` 1.15 m, so the roof stands 1.45 m over the ground, about the cars' roof height, and the gable's south windows
      // above it look as if they start at the roof, as in docs/foton/parkering-brofaste-nedsankt-hus.jpg (their model sill is 1.0 m). The OSM service way 44447967 (x 52.9) is now clear of it.
      {"source":"guess-1703","polygon":[[34.5,58.55],[43.5,58.55],[43.5,67.5],[34.5,67.5],[34.5,58.55]],"name":"Lågt tegelhus bakom parkeringen (guess)","levels":1,"levelsSource":"guess from docs/foton/parkering-brofaste-nedsankt-hus.jpg and the top view (#1731)","storey":2.6,"sunk":1.15,"roof":"flat","windows":false,"facade":14513752},
      {"source":"145221568","polygon":[[43.51,2.27],[43.59,-7.33],[50.43,-7.26],[50.34,2.34],[43.51,2.27]],"name":"Komplementbyggnad 145221568","levels":1,"levelsSource":"visual assumption","storey":3.6,"roofRise":2,"frameColor":15657439},
      {"source":"88457613","polygon":[[-64.12,-68.25],[-63.81,-121.44],[-67.62,-121.47],[-67.63,-120.2],[-77.62,-120.28],[-77.54,-133.09],[-67.3,-133.01],[-67.32,-130.44],[-64.01,-130.41],[-64.01,-132.44],[-63.91,-149.78],[-59.73,-149.75],[-59.7,-153.85],[-51.38,-153.78],[-51.4,-150.45],[-46.25,-150.41],[-46.3,-141.13],[-50.67,-141.15],[-50.68,-139.83],[-57.96,-139.88],[-58.01,-132.56],[-50.03,-132.49],[-50.46,-56.41],[-74.94,-56.6],[-74.87,-68.33],[-64.12,-68.25]],"name":"Montessorigrundskolan / byggnad 4","levels":1,"levelsSource":"Commons 2014 photo: one-storey wards; two-storey block from Hemsö By4 photo (position guess)","storey":4.7,"frameColor":15657439,
        "campus":{"style":"ward","sections":[{"name":"two-storey block","box":[-64.3,-133.2,-49.8,-120.1],"levels":2}],"chimneys":[[-57.2,-72],[-57.2,-92],[-57.2,-112],[-57,-126.6],[-55.5,-146]]}},
      {"source":"relation/1309427","polygon":[[24.22,-78.12],[61.31,-77.75],[61.01,-40.76],[23.92,-41.13],[24.22,-78.12]],"holes":[[[36.21,-66.93],[51.38,-66.63],[51.09,-49.91],[35.92,-50.2],[36.21,-66.93]]],"name":"Realgymnasiet / byggnad 88","levels":2,"levelsSource":"current photo (ednia.se) and Hemsö By88: two storeys","storey":3.5,"frameColor":15657439,
        "campus":{"style":"anshelm"}},
    ],
    paths: [
      {"source":"61112064","surface":"gravel","path":[[248.57,20.99],[262.52,11.51],[269.96,5.6],[274.94,1.24],[280.52,-4.93],[285.42,-10.66],[290.56,-17.79],[296.05,-26.85],[306.75,-46.47],[314.76,-59.29],[322.42,-72.87],[325.33,-81.47],[325.52,-89.03],[322.12,-100.48],[319.97,-106.14],[318.65,-110.25],[317.22,-116.09],[315.66,-121.19],[315.06,-124.8],[313.34,-131.43]],"w":2},
      {"source":"61112065","surface":"gravel","path":[[248.57,20.99],[239.56,21.12],[235.14,22.82],[228.02,25.33],[202.15,34.86],[193.02,34.82]],"w":2},
    ],
    access: [
      {"source":"30633554","surface":"asphalt","path":[[64.6,-23.58],[66.93,-86.35],[66.75,-136.67],[66.68,-157.77]],"w":4.5},
      {"source":"33646346","surface":"asphalt","path":[[17.4,-21.81],[25.5,-22.71],[42.02,-22.6],[64.6,-23.58]],"w":4.5},
      {"source":"44447961","surface":"asphalt","path":[[130.35,-23.46],[130.2,-33.79],[130.09,-49.96],[129.42,-89.2],[128.56,-151.91],[128.42,-159.55]],"w":4.5},
      {"source":"44447965","surface":"asphalt","path":[[197.71,-58.66],[222.18,-60.24],[228.75,-69.41],[266.49,-70.78],[266.5,-36.36],[278.76,-31.43],[286.82,-29.24],[296.05,-26.85],[314.79,-29.99],[328.24,-32.14]],"w":4.5},
      {"source":"44447967","surface":"asphalt","path":[[52.88,64.43],[73.18,67.8],[103.93,63.38]],"w":4.5},
      {"source":"60420592","surface":"asphalt","path":[[16.87,-158.49],[44.01,-157.94]],"w":4.5},
      {"source":"60420593","surface":"asphalt","path":[[64.6,-23.58],[104.66,-22.41],[120.84,-23.07],[130.35,-23.46],[143.67,-21.3],[165.49,-25.18],[181.13,-33.32],[188.29,-38.62],[191.25,-43.72],[197.71,-58.66],[197.28,-137.02],[197.48,-146.01],[195.99,-159.04]],"w":4.5},
      {"source":"60420597","surface":"asphalt","path":[[44.01,-157.94],[66.68,-157.77],[128.42,-159.55],[195.99,-159.04]],"w":4.5},
      {"source":"130731429","surface":"asphalt","path":[[197.71,-58.66],[210.05,-70.57],[217.75,-84.81],[222.28,-99.05],[225.38,-109.87],[225.64,-121.57],[224.99,-130.7],[229.24,-135.59],[236.26,-136.82],[244.55,-135.95],[250.31,-132.0],[251.65,-126.35],[251.25,-119.51],[246.62,-113.21],[235.66,-110.93],[229.21,-111.4],[225.38,-109.87]],"w":4.5},
      {"source":"145221600","surface":"asphalt","path":[[62.44,9.9],[77.08,10.13],[77.56,-14.55]],"w":4.5},
      {"source":"145221608","surface":"asphalt","path":[[42.02,-22.6],[41.59,9.63],[62.44,9.9],[62.84,-12.92],[64.6,-23.58]],"w":4.5},
      {"source":"159284495","surface":"asphalt","path":[[103.93,63.38],[111.66,62.1],[124.13,56.78],[132.13,55.42],[151.46,51.2],[175.16,45.0],[190.09,38.61],[193.02,34.82]],"w":4.5},
      {"source":"159284525","surface":"asphalt","path":[[193.02,34.82],[195.65,30.96],[197.66,13.19],[197.5,-9.96],[194.66,-29.07],[188.29,-38.62]],"w":4.5},
      // #1262: sourced school area parking (OSM 2026-10-18)
      {"source":"145221623","name":"Parkering vid Sankt Thomas/Klockhuset","surface":"asphalt","capacity":35,"capacitySource":"guess","polygon":[[38.68,15.41],[40.14,-19.07],[85.54,-17.08],[84.09,17.41]],
       // #1797 (Google 3D review 2026-11-02, 06_kunskapsskolan_h000/h180): a clipped hedge lines the car park's north edge, which the game left bare; reuses the #1737 yard
       // mechanism with hedges only (no sand, lawns or play frames). Two runs with a gap for the footpath into the yard (x ~56-62); path and height are a *guess* read by eye from the oblique views; drawn in the same `access` batch.
       "yard":{"lawns":[],"sand":[],"play":[],"lift":{"sand":0.05,"lawn":0.08},
        "hedge":{"paths":[[[46,-19.9],[55,-19.7]],[[63,-19.4],[71,-18.6]]],"h":0.7,"w":0.7,"piece":4,"sink":0.3},
        "colors":{"lawn":0x5d8a3a,"sand":0xd6c39a,"hedge":0x3b5828,"wood":0x8a6a48,"seat":0x2f2f2f,"roof":0xa8483a,"slide":0xc9a227}}},
      {"source":"44447969","name":"Östra campusparkeringen","surface":"asphalt","capacity":20,"capacitySource":"guess","polygon":[[196.06,-37.72],[189.82,-21.9],[192.2,7.75],[206.2,7.66],[204.71,-19.6]]},
      // #1262: sourced school area courtyards (OSM 2026-10-08 campus-areas)
      // #1796 (*guess*, Google 3D 05_norra_skolor_*): the yards are greyer than the old beige, and Freinet's and Montessori's get one lawn oval each (`yard` with only `lawns`, merged into the access batch: no draw call)
      {"source":"145221566","name":"Förskolan Framtiden gård","surface":"paved","color":0x9a9a90,"polygon":[[129.42,-89.2],[66.93,-86.35],[64.6,-23.58],[104.66,-22.41],[120.84,-23.07],[130.35,-23.46],[130.2,-33.79],[130.09,-49.96]],
       // #1807: a lawn and a fenced play corner south of building 8 (all *guess*; phone mode keeps the plain yard)
       "yard":{"lawns":[],"sand":[],"play":[],"hedge":{"paths":[],"h":1.0,"w":0.8,"piece":4,"sink":0.3},"lift":{"sand":0.05,"lawn":0.08},
        "detail":{"lawns":[{"centre":[104,-35],"radii":[22,9],"angle":0,"n":24}],"sand":[[[74,-47],[88,-47],[88,-38],[74,-38]]],
         "play":[{"kind":"swing","at":[81,-42.5],"yaw":0,"size":[3,2.2]},{"kind":"climb","at":[77,-42],"yaw":0,"size":[2,2,1.8]},{"kind":"bench","at":[92,-44],"yaw":0,"size":[1.6]}],
         "hedge":{"paths":[[[70,-49],[91,-49],[91,-30]]],"h":1.2,"w":0.12,"piece":4,"sink":0.3,"color":"fence"}},
        "colors":YARD_COLORS_1807}},
      {"source":"145221567","name":"Förskolan Freinet gård","surface":"paved","color":0x9a9a90,"polygon":[[129.42,-89.2],[66.93,-86.35],[66.75,-136.67],[66.68,-157.77],[128.42,-159.55],[128.56,-151.91]],"yard":{"sand":[],"hedge":{"paths":[],"h":1.0,"w":0.8,"piece":4,"sink":0.3},"play":[],"lawns":[{"centre":[97,-92],"radii":[27,16],"angle":0,"n":24}],"lift":{"sand":0.05,"lawn":0.08},"detail":{"sand":[[[131,-133],[138.5,-133],[138.5,-121],[131,-121]]],"pads":[[[131,-116],[138.5,-116],[138.5,-107],[131,-107]]],
        "play":[{"kind":"climb","at":[133.2,-128],"yaw":0,"size":[2,2,1.8]},{"kind":"house","at":[136.6,-125],"yaw":0,"size":[1.6,1.6,1.4]},{"kind":"swing","at":[134.8,-111.5],"yaw":0,"size":[3,2.2]},{"kind":"bench","at":[135,-100],"yaw":90,"size":[1.6]}],
        "hedge":{"paths":[[[130.5,-105],[139,-105]]],"h":1.2,"w":0.12,"piece":4,"sink":0.3,"color":"fence"}},
        "colors":YARD_COLORS_1807}},
      {"source":"145221572","name":"Sankt Thomas skolgård","surface":"gravel","polygon":[[18.5,-86.12],[66.93,-86.35],[66.75,-136.67],[17.39,-134.96]],
       // #1737 (docs/foton/snedbild-klockhuset-sankt-thomas.png, Google 3D heading 99°): the playground in front of Klockhuset's yard face: an oval lawn,
       // play-sand patches round the wooden play frames, a sandbox, and clipped hedges along the yard's edges towards Realgymnasiet (z ≈ -87) and Förskolan Freinet
       // (x ≈ 66); the hedge stops at z -104 so the walk past the face to the east (z ≈ -108) stays open. Every size and position is *guess* (pixels mapped
       // through the yard's four corners); drawn in the east `access` batch by src/schoolyard.js, visual only (no collision).
       "yard":{"lawns":[{"centre":[47,-101.5],"radii":[9.5,5.5],"angle":15,"n":28}],
        "sand":[[[27,-88],[39,-88],[41,-93],[38,-99],[31,-104],[26,-101],[25,-93]],[[44,-87.9],[56,-87.9],[57,-91.5],[50,-93.5],[44,-92]],[[59.5,-97],[65.4,-97],[65.4,-104],[59.5,-104]]],
        "hedge":{"paths":[[[29,-86.9],[66.2,-87.1],[66.1,-104]]],"h":1.0,"w":0.8,"piece":4,"sink":0.3},
        "play":[{"kind":"swing","at":[50,-90],"yaw":0,"size":[3,2.2]},{"kind":"house","at":[33,-91],"yaw":15,"size":[1.6,1.6,1.4]},{"kind":"climb","at":[32.5,-99.5],"yaw":15,"size":[2,2,1.8]}],
        "lift":{"sand":0.05,"lawn":0.08},
        "colors":{"lawn":0x5d8a3a,"sand":0xd6c39a,"hedge":0x3b5828,"wood":0x8a6a48,"seat":0x2f2f2f,"roof":0xa8483a,"slide":0xc9a227}}},
      {"source":"145221740","name":"Realgymnasiet gård","surface":"paved","polygon":[[22.16,-40.01],[21.34,-85.05],[62.29,-83.09],[60.36,-26.09],[37.75,-26.74],[27.84,-26.65],[23.63,-26.86],[21.37,-33.48]]},
      // #1703 (docs/foton/parkering-brofaste-*.jpg): the bridgehead car park is ONE row of about 7 stalls square to Sankt Lars väg (cars nose to the street, no aisle of its own),
      // standing at the kerb (#1735: x 29.4, just past the road's east edge x ~29; *guess*, +-1 m) from the south corner of Realgymnasiet's gable house to the crossing; behind it stands the low "sunken" brick house (`guess-1703` in `buildings`).
      // The OSM snapshot has no parking area there, so the outline, the row (`row.path` = the kerb line, `side` -1 = stalls on its +x side), the capacity and the fill are all *guess*;
      // stalls, lines, kerb strip and cars come from the shared east-lot engine (PARKING_LOT, #1278). Replaces #1554's 15 m deep two-sided lot and its aisle `guess-1554-aisle`.
      {"source":"guess-1554","name":"Parkeringsrad vid bron (guess)","surface":"asphalt","capacity":7,"capacitySource":"guess","fill":0.9,"reversed":0.1,"noseToAisle":true,"row":{"path":[[29.4,59.6],[29.4,77.1]],"side":-1},"polygon":[[29.05,59.2],[34.8,59.2],[34.8,77.5],[29.05,77.5]]},
      {"source":"94054863","name":"Höjebroskolan skolgård","surface":"paved","color":0x9a9a90,"polygon":[[130.09,-49.96],[129.42,-89.2],[128.56,-151.91],[167.4,-153.51],[171.8,-51.62]],
       // #1807: a play corner and lawn in the open court of the long pavilion (all *guess*, read off a top view; phone mode keeps the plain yard)
       "yard":{"lawns":[],"sand":[],"play":[],"hedge":{"paths":[],"h":1.0,"w":0.8,"piece":4,"sink":0.3},"lift":{"sand":0.05,"lawn":0.08},
        "detail":{"lawns":[{"centre":[160,-78],"radii":[5,14],"angle":0,"n":20}],"sand":[[[154.5,-112],[165.5,-112],[165.5,-102],[154.5,-102]]],
         "play":[{"kind":"climb","at":[158,-107],"yaw":0,"size":[2,2,1.8]},{"kind":"house","at":[163,-107],"yaw":0,"size":[1.6,1.6,1.4]},{"kind":"bench","at":[160,-93],"yaw":0,"size":[1.6]}],
         "hedge":{"paths":[[[154,-100],[166,-100]]],"h":1.2,"w":0.12,"piece":4,"sink":0.3,"color":"fence"}},
        "colors":YARD_COLORS_1807}},
      {"source":"145221570","name":"Lunds Montessorigrundskola gård","surface":"gravel","color":0xa89f86,"polygon":[[-105.75,-85.22],[-106.28,-142.26],[-76.54,-155.82],[-44.43,-155.28],[-47.41,-52.64],[-84.23,-55.41],[-103.88,-73.75]],"yard":{"sand":[],"hedge":{"paths":[],"h":1.0,"w":0.8,"piece":4,"sink":0.3},"play":[],"lawns":[{"centre":[-78,-102],"radii":[24,42],"angle":0,"n":24}],"lift":{"sand":0.05,"lawn":0.08},"detail":{"sand":[[[-72,-153],[-56,-153],[-56,-144.5],[-72,-145]]],"play":[{"kind":"climb","at":[-65,-149],"yaw":0,"size":[2,2,1.8]},{"kind":"swing","at":[-58,-150.5],"yaw":0,"size":[3,2.2]},{"kind":"bench","at":[-64,-143],"yaw":0,"size":[1.6]}],
        "hedge":{"paths":[[[-74,-143],[-54,-143]]],"h":1.2,"w":0.12,"piece":4,"sink":0.3,"color":"fence"}},
        "colors":YARD_COLORS_1807}},
    ],
    trees: [
      [56.94,-193.99,"564870146"],
      [33.45,-178.24,"564870159"],
      [33.48,-190.92,"564870160"],
      [33.52,-204.74,"564870163"],
      [57.09,-179.06,"564870229"],
    ],
    treeScale: [1.45,2.4], // #1738: larger crowns, as in the Google 3D oblique (guess; was 1.2-1.8)
    // Approximate aerial-interpreted avenue strips and park clusters; not individually mapped trees.
    treeRows: [{"name":"west-campus-avenue","from":[58,-151],"to":[60,-30],"step":13},{"name":"central-crossing","from":[74,-19],"to":[181,-19],"step":14},{"name":"eastern-park-avenue","from":[207,-151],"to":[209,-57],"step":14},{"name":"northern-courtyard","from":[73,-166],"to":[182,-166],"step":15}],
    treePatches: [{"name":"east-park","polygon":[[177,-148],[192,-144],[190,-75],[174,-69]],"n":10},{"name":"east-meadow-edge","polygon":[[206,-22],[219,-60],[242,-46],[227,-5]],"n":12},{"name":"far-park","polygon":[[269,-153],[302,-147],[299,-96],[274,-100]],"n":8},
    // #1738: denser groves north and east of the Klockhuset and between the buildings, read from the Google 3D oblique (docs/foton/snedbild-klockhuset-sankt-thomas.png); positions and counts are a *guess*. Appended last so the earlier patches keep their random positions; spots on buildings/paths are filtered out.
    {"name":"klockhuset-north","polygon":[[18,-195],[112,-195],[112,-152],[18,-152]],"n":26},{"name":"klockhuset-northwest","polygon":[[-8,-170],[22,-170],[22,-120],[-8,-120]],"n":12},{"name":"klockhuset-east-between","polygon":[[66,-150],[126,-150],[126,-135],[66,-135]],"n":10},{"name":"east-park-dense","polygon":[[177,-160],[195,-160],[195,-70],[177,-70]],"n":14}],
    // Mapped tree positions; dimensions/age/species are assumptions. Slight size variation, no random relocation.
    // #576–#581 (src/campusfacades.js): photo-based facades of the old hospital buildings, from the Commons photos
    // (Peter Sondhauss, March 2014) and Hemsö's historical photos in docs/references/east-campus/. Proportions are read
    // from the photos against storey and window heights; every metre here is a *guess*, not a measurement.
    // `storeys` = floor heights from the plinth, `windows` per floor (sill/head from the floor, `arch` = rise of a
    // segmental head, `crown` key/cornice), `bay` = window spacing, `margin` = clear wall at each end of a stretch.
    facadeStyles: {
      // Byggnad 4 and 9 (#576): one-storey wards of the 1870s, today white render over the plinth (apron), white piers
      // between the brick window bays and a white frieze under the eaves; dark metal hip roofs with brick chimneys.
      ward: { storeys: [4.7, 4.0], bay: 2.9, margin: 1.7, wall: 0xffffff, trim: 0xeeeae1, joint: 0xc3bbb0, glass: 0x405660,
        windows: [{ sill: 1.25, head: 3.55, width: 1.25, arch: .22, crown: 'key' }, { sill: .95, head: 3.0, width: 1.15, crown: 'cornice' }],
        plinth: .85, plinthColor: 0xd9d4ca, apron: 1.2, piers: { width: .72, depth: .06, edge: .4 }, frieze: .85,
        cornice: [[-.28, .26, .12], [-.12, .14, .26], [.0, .12, .36]], frame: .12, mullion: .045,
        roof: { rise: 2.6, slope: .55, grid: 2 }, chimney: [.62, 1.5, .62] },
      // Byggnad 2, 7 and 8 (#577, #578): Stenhammar's two-storey wards like the school (#564, byggnad 3): red brick, white
      // rusticated quoins, plinth and floor band, a white cornice with dentils, segmental ground-floor windows with keystones
      // and straight upper ones under cornice crowns. End pavilions and centre stand taller than the linking wings
      // (`sections` with `raise`); dark metal hips with brick chimneys. #1733: Google 3D (docs/foton/snedbild-klockhuset-sankt-thomas.png)
      // shows steep hips (~40-45°) with a ridge over every pavilion, centre and wing, and rows of gabled dormers on the
      // wings of byggnad 2 and 7: `hip` roofs with `slope` (rise per metre, *guess*), parts from the sections and the
      // building's `roofs` boxes (src/campusfacades.js), eaves `overhang` m; `dormer` sizes and spacing in m, *guess*.
      stenhammar: { storeys: [4.3, 4.3], bay: 2.75, margin: 2.45, wall: 0xffffff, trim: 0xeeeae1, joint: 0xc3bbb0, glass: 0x405660,
        windows: [{ sill: 1.05, head: 3.45, width: 1.35, arch: .2, crown: 'key' }, { sill: .95, head: 3.2, width: 1.35, crown: 'cornice' }],
        plinth: .8, bands: [{ h: .22 }], cornice: [[-.45, .32, .12], [-.23, .14, .23], [-.08, .16, .34]],
        dentil: { step: .55, width: .16, height: .22, depth: .09 }, quoin: .65, jointStep: .43, frame: .12, mullion: .045,
        roof: { hip: true, slope: .95, overhang: .15, rise: 1.1, grid: 2 }, chimney: [.65, 1.45, .65],
        dormer: { width: 1.3, height: 1.15, gable: .6, inset: 1.3, spacing: 3.0, margin: 1.6 } },
      // Byggnad 88 (#580, Klas Anshelm 1959-60): two storeys of red brick with projecting brick piers between broad
      // white-framed windows (centre post, low transom), a deep white eave soffit, and four sawtooth roofs that rise from
      // the outer eaves; #1744: the ridge ring now falls back to the eave at the open court (as the Google 3D view shows, no
      // glazed wall round the court), so the court's inner brick walls end under a closed roof edge. `inward` (glazed faces) is no longer used.
      anshelm: { storeys: [3.5, 3.4], bay: 3.15, margin: 1.0, wall: 0xffffff, trim: 0xf1efe9, glass: 0x405660,
        windows: [{ sill: .8, head: 2.6, width: 2.1, bars: false, rails: [.22] }, { sill: .75, head: 2.55, width: 2.1, bars: false, rails: [.22] }],
        plinth: .4, plinthColor: 0xa9a59d, cornice: [], soffit: { depth: .6, color: 0xf1efe9 }, frame: .08, mullion: .05,
        piers: { width: .5, depth: .16, edge: .25, brick: true, color: 0xffffff },
        roof: { rise: 4.5, slope: .9, grid: 2 } }, // #1733: steep outer slopes up to the glazing as in Google 3D (rise/slope *guess*)
      // Byggnad 19 (#581, Axel Kumlien 1910-11, the laundry): plain red brick without the white render of the older
      // wards: segmental windows under brick arches with white frames, a centre post and transom, a dark string course
      // at each floor, a corbelled brick eave and dark standing-seam hips; the top floor has paired windows.
      laundry: { storeys: [3.9, 3.7, 3.4], bay: 3.3, margin: 1.5, wall: 0xffffff, trim: 0x93503a, glass: 0x405660,
        frameColor: 0xf1efe9, sillColor: 0xe6e2da,
        windows: [{ sill: .9, head: 3.0, width: 1.3, arch: .24, header: .2, headerColor: 0x7e3c2b, bars: false, rails: [.7] },
          { sill: .9, head: 2.8, width: 1.2, arch: .24, header: .2, headerColor: 0x7e3c2b, bars: false, rails: [.7] },
          { sill: .75, head: 2.35, width: 1.0, arch: .22, header: .18, headerColor: 0x7e3c2b, bars: false, rails: [.68], pair: 1.45 }],
        plinth: .55, plinthColor: 0x6f4537, bands: [{ dy: -.05, h: .1, depth: .1, color: 0x2e2a28 }],
        cornice: [[-.3, .22, .1], [-.12, .16, .2]], frame: .07, mullion: .05,
        roof: { rise: 3.2, slope: .55, grid: 2 }, chimney: [.9, 2.2, .9] },
      // Byggnad 1 / Klockhuset (#579, Stenhammar 1877-79): a white-rendered ground floor, brick upper floor between white
      // pilasters, dentil cornice and steep hips per part (#1733, as `stenhammar`); on the park-side axis (#1733) a projecting centre with pediment, a great
      // round-arched window and a clock tower (four dials, open arched lantern, dark bell roof, gilded spire), after the 2014 photo.
      klockhuset: { storeys: [4.6, 4.5], bay: 3.0, margin: 1.6, wall: 0xffffff, trim: 0xf0ede6, joint: 0xd2ccc2, glass: 0x405660,
        windows: [{ sill: 1.2, head: 3.5, width: 1.25, arch: .18 }, { sill: 1.0, head: 3.3, width: 1.25, crown: 'cornice' }],
        plinth: .7, apron: 4.75, piers: { width: .7, depth: .06, edge: .35 }, bands: [{ h: .26 }],
        cornice: [[-.4, .3, .12], [-.2, .14, .24], [-.06, .16, .36]], dentil: { step: .5, width: .16, height: .22, depth: .09 },
        quoin: .7, frame: .12, mullion: .045, roof: { hip: true, slope: .95, overhang: .15, rise: 2.2, grid: 2 }, chimney: [.65, 1.4, .65] },
    },
    // #1797: `laundry` (Kunskapsskolan / byggnad 19 and its eastern pavilion only; no other building uses it) rendered grey (0x4d5564 -> about 94,106,120 on screen) where Google's 06_kunskapsskolan shows
    // a darker, bluer slate (about 60,75,105 on screen); 0x3c4864 is a *guess* by eye. The northern `ward`/`stenhammar`/`klockhuset` styles (#1796's area) are untouched here.
    // #1679 (docs/references/google-3d-2026-10-29/): roof colours read off Google's 3D views, where the campus roofs are
    // blue-grey slate rather than the old near-black metal. All values are *guess*es, not measurements; they tint the one
    // shared roof batch through vertex colours (no extra draw call). `styles` by `campus.style`, `classic` for the
    // school-style NTI building, `sources` = an OSM id's own colour (wins over its style; a building's `campus.roofColor` too).
    roofColors: {
      // #1796 (docs/references/google-3d-2026-11-02, 05_norra_skolor_*): the pavilions' roofs are dark slate grey in Google's views, so the
      // pale blues of #1679 are lowered to the same dark family as the laundry's; *guess*, read by eye from the oblique images.
      styles: { ward: 0x4f5b72, stenhammar: 0x4c586f, anshelm: 0x464f60, laundry: 0x3c4864, klockhuset: 0x4f5b72 },
      classic: 0x56627a,
      sources: {},
    },

    storey: 3.6,
    roofRise: 3,
    annexRise: 1,
    window: [1,1.9],
    sill: 0.95,
    bay: 2.8,
    frame: 0.07,
    facade: 16777215,
    roof: 4541521,
    plinth: 7758680,
    glass: 3230037,
    pathLift: 0.025,
  },
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
  ],
};

// The courtyard on the garage box (#80, src/courtyard.js), traced on the situation plan (docs/peab/
// situationsplan.png, p. 3; plan metres as in SITE) and the info brochure p. 16 ("plattsatta gångar,
// en pergola, grillplats, sittytor, en lekplats för barnen och en boulebana", grusgångar, trädrader).
// Items the plan does not show are marked guess.
// The courtyard's kettle grill lit (#204, src/grill.js): `flames` flame sprites up to `height` m, `sparks` sparks, a pool
// light of `light` while it burns; it goes out by itself after `burnSeconds`. Our numbers.
// #678 `kettle`: modelled on a Weber Original Kettle 57 cm — every size read off product photos (*guess*): bowl radius `r`
// at its rim `rim` m over the ground, `depth` deep; the lid `lidH` over the rim (≈ 0.99 m to the handle's top); the
// cooking grate `grate` and the charcoal grate `coal` m under the rim; leg radius `leg`, wheel diameter `wheel`, the ash
// catcher's diameter `ash` at `ashY` m
export const GRILL = { flames: 16, height: 1.0, sparks: 40, light: 3.2, burnSeconds: 300,
  kettle: { r: 0.285, rim: 0.72, depth: 0.26, lidH: 0.22, grate: 0.07, coal: 0.16, leg: 0.0125, wheel: 0.16, ash: 0.35, ashY: 0.24 },
  // #1121: L1007's own bigger kettle on the patio, after a Weber Original Kettle 67 cm (≈ 1.07 m high to the handle) with
  // a work surface bolted to its side — the same model scaled up, every size *guess* from product photos; same keys as
  // `kettle`. `table`: the side table on the kettle's left as you face its front, `w` × `d` m, its top `h` up, `gap` m out
  // from the rim, a slatted dark-grey composite top `t` thick on a black steel frame with a wire shelf `shelf` m up
  big: { r: 0.335, rim: 0.76, depth: 0.3, lidH: 0.26, grate: 0.08, coal: 0.18, leg: 0.014, wheel: 0.18, ash: 0.4, ashY: 0.25,
    table: { w: 0.5, d: 0.42, h: 0.76, t: 0.022, gap: 0.03, slats: 6, shelf: 0.3, top: 0x3a3c3e, frame: 0x161718 } } };

// #1370: a local pétanque game on the courtyard's boule court (COURTYARD.boule). Ball and jack sizes follow the
// FIPJP rules (boule 70.5–80 mm, 650–800 g; jack 30 ± 1 mm wooden); the rest are playability *guess*es scaled to the
// 3.2 × 8.8 m court (the rules' 6–10 m jack distance does not fit, so `jackMin`/`jackMax` are shortened).
export const BOULE = {
  sync: { version: 1, every: 400, maxSeconds: 12, step: 1 / 120, sample: 4, pendingMs: 5000, reachSlack: .15, controlReach: 4, maxCoord: 1000 }, // #1854: bounded command/replay limits (*guess*); no per-frame traffic
  ballR: 0.0375, ballMass: 0.7, jackR: 0.015, jackMass: 0.015, // FIPJP sizes; masses in kg
  surface: 0.03, edge: 0.08,         // the gravel's top and the timber edge's thickness (courtyard.js draws them)
  friction: 1.6,                     // rolling deceleration on stenmjöl, m/s² (*guess*: a boule stops ~0.5 m after landing)
  bounce: 0.55, edgeBounce: 0.3,     // ball/ball and timber-edge restitution (*guess*)
  stopSpeed: 0.02, maxStep: 1 / 240, // m/s at rest, s per substep
  circle: { dz: 0.7, r: 0.25, reach: 1.0 }, // the throwing circle 0.7 m in from the north edge (rules: 35–50 cm across);
                                     // `reach`: how far from its centre you may stand (*guess*, eases touch play)
  jackMin: 4, jackMax: 8,            // valid jack distance from the circle, m (*guess*, scaled from the rules' 6–10 m)
  roll: 0.5, minLand: 0.4,           // a throw lands `roll` m short of the aimed spot and rolls on to it (*guess*)
  scatter: 0.025,                    // landing spread per metre thrown (*guess*)
  flight: 0.45, flightPerM: 0.07, arc: 0.25, // throw flight time (s) and apex height per metre (*guess*)
  balls: 3, target: 13,              // tête-à-tête: three boules each, the game is to 13
  reach: 11,                         // m: the court can be aimed at from the circle across its full length
  near: 40,                          // m: drawn and simulated only this close (like the playroom's billiards)
  // the lectern (pulpet) with the scoreboard east of the court, facing it (west); sizes *guess*
  desk: { x: -32.85, z: 21.2, w: 0.62, d: 0.42, h: 1.05, tilt: 0.42, board: [0.56, 0.36], canvas: [512, 330],
    buttonY: 0.36, buttonH: 0.17 }, // the two buttons: bottom strip of the board (fraction of its height from the centre / tall)
};

// #688: grass appearance, all *guess* by eye from the realism screenshots; no botanical survey.
export const GRASS = {
  textureSize: 256, tile: 1.6, seed: 688, blades: 2300, bladeLength: [2, 7],
  // #1681: the ground read olive/khaki from the air: the old summer 0x718b50 (x detail map ~ 87,107,56) was dull, and the autumn
  // khaki 0x94845b was mixed in at 55 % for ALL of September, so early-autumn lawns were already straw (~103,104,60) while the
  // far land (summer mean) stayed green. Greener summer base; `autumnMix` by month (0 = none): September barely turns, the
  // browning arrives in October/November (*guess* by eye from the Google 3D references, docs/references/google-3d-2026-10-29).
  summer: 0x609548, autumn: 0x94845b, autumnMix: { 9: 0.12, 10: 0.5, 11: 0.6 },
  detailRange: [190, 244], detailNoise: 24, strawTint: 0.94, bladeTint: 0.91, strokeWidth: 0.7,
  patchScale: 0.45, patchStrength: 0.10, patchWarmth: 0.035, patchFrequencies: [0.73, 0.87, 0.31],
};

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
  // #1968: the pergolas' 272 string-light bulbs (spheres of r 0.03, 80 triangles) fade, a pergola at a time, into octahedra
  // (`r`: about the same mean silhouette area, 8 triangles) between `start` and `end` m from the pergola's box, where a bulb is
  // about two pixels (src/lod.js BatchLod; `margin` m of overlap; all *guess*, by eye at 1280 x 800). Desktop only.
  bulbLod: { start: 18, end: 24, margin: 1, r: 0.04 },
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
  // #682: a park bench after the common wooden-slat / black steel kind (every size *guess*, from product photos): `slats`
  // seat slats `slatW` × `slatT` m with `gap` between them, `back` back slats `backW` wide leaning `tilt`° back from
  // upright; the two steel end frames (`frame` m from the middle, a `bar` × `barT` m profile) carry armrests `arm` m up
  bench: { slats: 5, slatW: 0.07, slatT: 0.035, gap: 0.01, back: 3, backW: 0.085, tilt: 15, frame: 0.72, bar: 0.05, barT: 0.014, arm: 0.65 },
  grillTable: { dx: -0.62, w: 0.5, d: 0.45, h: 0.8 },
  beds: [{ x0: -68.9, x1: -67.1, z0: 41.4, z1: 42.6 }, { x0: -68.9, x1: -67.1, z0: 43.5, z1: 44.8 }, { x0: -68.9, x1: -67.1, z0: 45.7, z1: 46.9 },
    { x0: -68.9, x1: -67.1, z0: 47.9, z1: 49.1 }], // odlingslådor
  // shrubs and perennials on the green between Hus A and B (park level; the plan shows lawn on the box)
  plantings: [{ x0: -22.2, x1: -10.2, z0: 34, z1: 56, n: 16 }],
  // #112 (after Peab's courtyard renders; places are guesses): low path bollards that light up at dusk along the
  // patio walk, the south walk and the walk along Hus A, a red wooden playhouse by the sandbox, a bike rack with bikes
  // by the portik walk
  bollards: { h: 0.8, r: 0.07, rows: [{ x0: -42.47, x1: 9.65, z: 17.85, step: 6 }, { x0: -43.5, x1: -21.5, z: 29.75, step: 7 },
    { x0: -12, x1: 10, z: 26.85, step: 6 }],
    // #1525: each bollard lights the ground round it at night: an additive pool (groundglow.js, no light object) of
    // radius `r` m, warm `color` at `peak` opacity; lit above `on` night, out below `off`, `fade` s (sizes/strength *guess*
    // by eye, like the street lamps' #434 pools); 5 rings × 20 segments keep it to ~180 triangles a bollard
    pool: { r: 3.4, color: 0xffcf8f, peak: 0.45, on: 0.35, off: 0.3, fade: 1.5, rings: 5, segs: 20 } },
  // #1525: lit ground-floor windows of Hus A–C spill a faint pool onto the ground in front of them at night (one additive
  // mesh, its per-window strength the window's own lit level). Windows whose sill is within `maxUp` m of the ground
  // outside; the pool's centre `out` m out, radii `along` × window width and `across` m; `peak` opacity (all *guess* by eye)
  windowSpill: { maxUp: 2.6, out: 1.6, along: 0.9, across: 2.2, color: 0xffd6a0, peak: 0.32, rings: 3, segs: 12 },
  playhouse: { x0: -29.9, x1: -27.8, z0: 23.8, z1: 25.7, h: 1.3, ridge: 1.9, color: 0x9c2f24, trim: 0xf2efe7 },
  // #681 (Peab's brochure p. 16 only promises "en lekplats för barnen"; the situation plan shows the gravel playground, so
  // the equipment, places and sizes are all *guess*): a wooden A-frame swing (beam `len` m along x at height `h`, legs
  // splayed `spread` m to either side, two rubber seats) in the playground's free north-west corner and a little slide
  // (platform `h` m up, a `len` m chute in `color` running east) along its south edge
  swing: { x: -27.9, z: 21.0, len: 2.4, h: 2.1, spread: 0.7,
    // #1413: gentle seated motion, gameplay *guesses*; neither dimensions nor the stand's location change.
    angle: 0.24, period: 2.6, returnRate: 3 },
  // #1414: assisted ladder/slide durations, seated eye and clear landing distances are gameplay guesses.
  slide: { x: -27.3, z: 28.6, h: 1.0, len: 2.0, color: 0xd9452b,
    ride: { approach: .3, climb: 1.1, settle: .4, slide: .95, runout: .2, exit: .55, eye: .65, pitch: -.3, entryReach: 1.35, exitGap: .3, exitSide: .5, maxExitDrop: .3, clearanceStep: .12 } },
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
// #498: entrance plants inspired by the Peab rendering (docs/references/framsida-hack-dorrar-planteringar-2026-10-08.jpg).
// All counts, species, pot dimensions, foliage scales and offsets below are visual ASSUMPTIONS in metres.
// Pots stand beside doors against the façade, leaving the loftgång's outer walking lane and core/stairs clear.
export const ENTRANCE_PLANTS = {
  counts: [1, 2, 1, 1, 2, 1, 2, 1], // west → east, independently repeated at ground and loft entrances
  groundZ: -.40, loftWallOffset: .40, doorGap: .45, foliageRadius: .34,
  variants: [
    { plant: 'palm', pot: { r: .18, h: .40 }, foliageScale: [.48, .72, .48], color: 0x656964 },
    { plant: 'banana', pot: { r: .16, h: .32 }, foliageScale: [.48, .65, .48], color: 0xa36f51 },
    { plant: 'agave', pot: { r: .20, h: .35 }, foliageScale: [.64, .76, .64], color: 0xc4bda9 },
  ],
  // #1967: beyond `end` m (camera to the plant's foot) a plant is drawn by the merged still copy of all the entrance plants
  // (one draw call, vertex colours, no sway: PLANT_WIND moves a leaf 6 cm at most, ~3 px at 15 m) and from `start` m its own
  // pot, soil and leaves fade into it with the dithered pixel fade of src/lod.js. `margin` m of slack round the zone for
  // switching the meshes; `pad` m round a plant when asking whether a far one is in view; `roughness` of the copy's one
  // material (the originals are 0.7 – 1). All *guesses* by eye; the 14 – 18 m zone follows the ~15 m named in #1967.
  lod: { start: 14, end: 18, margin: 1, pad: 1.5, roughness: 0.85 },
};

// #605: furnished roof terraces on Hus L (src/terracedecor.js; decoration only, nothing to pick or sit on). EVERY item,
// position, size, colour and style below is our own *guess* — no neighbour's terrace is documented. Per terrace (id from
// exterior.js husLTerraces): `items`, each { k: kind, u: m east of the terrace's west edge (negative: from its east edge),
// v: m south of the set-back wall (the deck is HUS_L.court.setback − 0.25 = 1.65 m deep to the parapet), r: yaw in
// degrees }; chairs and sofas face south (+z) at r 0 and r 90 turns them to face WEST (−x) (#1091: seats face their table). L1201 is left EMPTY on purpose (#573 makes it a visitable empty flat). The terrace door (court.upper's sill-0
// opening) keeps `door.margin` m either side and `door.depth` m out from the wall clear (tools/terracedecortest.html).
// Railing boxes hang on the railing's inner side (`railBox`); string lights are drawn by additive-free bulbs that glow
// after dusk (no lights). `far` m: beyond it, or seen from north of the set-back wall below Hus L's roof (the building
// hides the terraces), the merged decor is not drawn. `hue` jitters each plant's green a little so no two match.
export const TERRACE_DECOR = {
  skip: ['L1201'], far: 160, hue: 0.025,
  // #1968: [start, end] m of each kind's dithered fade-out (src/lod.js), measured to the nearest point of the terrace row;
  // beyond `end` the kind is not drawn. The bulbs (r 0.022) are under a pixel from ~35 m; the soft things (leaves, flowers,
  // parasol cloth: a palm is ~7 px tall at 70 m) and the furniture (a pixel or two at 110 m) end where they no longer read
  // (*guess*, by eye at 1280 × 800 from raised viewpoints south of the yard). Keep bulbs <= soft <= solid <= `far` (the
  // old cut for everything, still the limit with `&nolod`). `phone`: the low-memory profile ends each kind earlier.
  lod: { bulbs: [30, 38], soft: [60, 72], solid: [105, 120], phone: { bulbs: [22, 30], soft: [45, 56], solid: [80, 92] } },
  door: { margin: 0.12, depth: 0.9 },
  railBox: { d: 0.2, h: 0.17, drop: 0.03, color: 0x3d3f3c },
  bulbs: { day: 0xd9d5ca, night: 0xffcf8a, on: 0.35, r: 0.022 },
  terraces: {
    L1202: { style: 'medelhav', items: [ // terracotta, white and Greek blue
      { k: 'rug', u: 1.35, v: 0.86, w: 2.3, d: 1.25, c: 0xf2efe6, s: 0x2f5d9e },
      { k: 'table', type: 'bistro', u: 1.0, v: 0.85, c: 0xf4f2ec, f: 0x2a2c2e },
      { k: 'chair', u: 0.42, v: 0.85, r: -90, c: 0x2f5d9e },
      { k: 'chair', u: 1.58, v: 0.85, r: 90, c: 0x2f5d9e },
      { k: 'parasol', u: 1.0, v: 0.85, R: 0.8, c: [0xf6f4ee, 0x2f5d9e] },
      { k: 'olive', u: 2.45, v: 0.36, pot: [0.24, 0.42], pc: 0xb5643c },
      { k: 'potflowers', u: 0.22, v: 0.2, pot: [0.14, 0.22], pc: 0xb5643c, c: [0xd8262f, 0xe8484f] },
      { k: 'agave', u: 4.38, v: 0.42, pot: [0.22, 0.34], pc: 0xb5643c, s: 0.8 },
      { k: 'olive', u: -0.38, v: 0.42, pot: [0.22, 0.4], pc: 0xf3f0e8, s: 0.85, fruit: 0xf2c522 },
      { k: 'lantern', u: 4.55, v: 1.32 },
      { k: 'railbox', u: 0.2, u1: 2.6, c: [0xd8262f, 0xe8484f, 0xf5f2ee] },
      { k: 'railbox', u: 4.2, u1: -0.2, c: [0xd8262f, 0xf5f2ee] },
    ] },
    L1203: { style: 'djungel', items: [ // palms and bananas, a lounger in the green, fairy lights
      { k: 'rug', u: 1.35, v: 0.9, w: 2.4, d: 1.2, c: 0x4f6b43 },
      { k: 'palm', u: 0.36, v: 0.4, pot: [0.27, 0.52], pc: 0x2e3133, s: 1.0 },
      { k: 'banana', u: 2.45, v: 0.42, pot: [0.24, 0.45], pc: 0x2e3133, s: 0.95 },
      { k: 'lounger', u: 1.3, v: 1.16, c: 0x5d7f4f, f: 0x8a6a48 },
      { k: 'side', u: 2.5, v: 1.28, c: 0x8a6a48, glass: true },
      { k: 'palm', u: -0.42, v: 0.45, pot: [0.25, 0.5], pc: 0x2e3133, s: 0.9 },
      { k: 'agave', u: 4.4, v: 1.32, pot: [0.2, 0.3], pc: 0x6b6f6a, s: 0.7 },
      { k: 'banana', u: -0.4, v: 1.25, pot: [0.18, 0.34], pc: 0x6b6f6a, s: 0.7 },
      { k: 'lights', a: [0.05, 0.04, 2.3], b: [2.8, 0.04, 2.3], sag: 0.16, n: 14 },
      { k: 'lights', a: [0.05, 0.04, 2.3], b: [0.05, 1.6, 1.78], sag: 0.1, n: 8 },
      { k: 'railbox', u: 0.25, u1: 2.6, c: [0xf5f2ee], trail: true },
    ] },
    L1204: { style: 'grill', items: [ // a long wooden table for friends and a kettle grill
      { k: 'table', type: 'wood', u: 1.35, v: 0.85, w: 1.3, d: 0.72, c: 0xa77b4f, f: 0x2b2d2f },
      { k: 'chair', u: 1.0, v: 0.28, r: 0, c: 0xa77b4f, cc: 0xc9472f },
      { k: 'chair', u: 1.7, v: 0.28, r: 0, c: 0xa77b4f, cc: 0xc9472f },
      { k: 'chair', u: 1.0, v: 1.42, r: 180, c: 0xa77b4f, cc: 0xe2b33c },
      { k: 'chair', u: 1.7, v: 1.42, r: 180, c: 0xa77b4f, cc: 0xe2b33c },
      { k: 'agave', u: 0.25, v: 0.3, pot: [0.2, 0.36], pc: 0x6b6f6a, s: 0.75 },
      { k: 'bush', u: 2.55, v: 0.3, pot: [0.2, 0.36], pc: 0x6b6f6a, c: 0x3c6b35 },
      { k: 'grill', u: 4.6, v: 0.5, c: 0x1d1e20 },
      { k: 'banana', u: -0.38, v: 1.26, pot: [0.2, 0.38], pc: 0x6b6f6a, s: 0.8 },
      { k: 'lights', a: [0.05, 0.04, 2.25], b: [2.75, 0.04, 2.25], sag: 0.18, n: 13 },
      { k: 'railbox', u: 0.2, u1: 2.6, c: [0x7e5aa6], herbs: true },
    ] },
    L1205: { style: 'skandinavisk', items: [ // grey and white, a lounger, lavender
      { k: 'rug', u: 1.25, v: 0.88, w: 2.1, d: 1.2, c: 0xb9b6ae, s: 0xe9e6de },
      { k: 'lounger', u: 1.2, v: 1.14, c: 0xd6d3cb, f: 0x2f3235, t: 0x8fb3c9 },
      { k: 'olive', u: 0.3, v: 0.36, pot: [0.22, 0.42], pc: 0xeceae4, s: 0.95 },
      { k: 'side', u: 2.28, v: 1.25, c: 0x2f3235, lantern: true },
      { k: 'table', type: 'bistro', u: 4.6, v: 1.05, c: 0x2f3235, f: 0x2f3235 },
      { k: 'chair', u: 4.6, v: 0.5, r: 0, c: 0x2f3235, cc: 0xd6d3cb },
      { k: 'bush', u: -0.3, v: 0.32, pot: [0.2, 0.34], pc: 0xeceae4, c: 0x355f34 },
      { k: 'railbox', u: 0.2, u1: 2.35, c: [0x8a6cc0, 0x9d84cc], lavender: true },
      { k: 'railbox', u: 3.9, u1: -0.2, c: [0x8a6cc0], lavender: true },
    ] },
    L1206: { style: 'blommor', items: [ // flowers everywhere, a green bistro set
      { k: 'potflowers', u: 0.2, v: 0.18, pot: [0.13, 0.2], pc: 0xb5643c, c: [0xe34b8c, 0xf08fb8] },
      { k: 'potflowers', u: 0.55, v: 0.16, pot: [0.11, 0.17], pc: 0xf3f0e8, c: [0xf5f2ee, 0xf2d33c] },
      { k: 'potflowers', u: 0.88, v: 0.2, pot: [0.14, 0.22], pc: 0x2f5d9e, c: [0xd8262f] },
      { k: 'potflowers', u: 2.3, v: 0.18, pot: [0.15, 0.24], pc: 0xb5643c, c: [0x8a6cc0, 0xf5f2ee] },
      { k: 'potflowers', u: 2.62, v: 0.25, pot: [0.11, 0.18], pc: 0xb5643c, c: [0xf08a2c] },
      { k: 'table', type: 'bistro', u: 1.45, v: 1.02, c: 0x3f6b4a, f: 0x3f6b4a },
      { k: 'chair', u: 0.88, v: 1.02, r: -90, c: 0x3f6b4a, cc: 0xf08fb8 },
      { k: 'chair', u: 2.02, v: 1.02, r: 90, c: 0x3f6b4a },
      { k: 'bush', u: 4.62, v: 0.42, pot: [0.24, 0.4], pc: 0xf3f0e8, c: 0x3f6f3a, bloom: [0xe9a1c8, 0xc98fd6] },
      { k: 'banana', u: -0.35, v: 1.25, pot: [0.2, 0.36], pc: 0xb5643c, s: 0.75 },
      { k: 'railbox', u: 0.2, u1: 2.7, c: [0xe34b8c, 0xf5f2ee, 0x8a6cc0, 0xf08fb8], trail: true },
      { k: 'railbox', u: 4.15, u1: -0.2, c: [0xe34b8c, 0xf2d33c] },
    ] },
    L1207: { style: 'solbad', items: [ // two sun loungers under a big parasol, a palm
      { k: 'lounger', u: 1.2, v: 0.44, c: 0xf2efe6, f: 0xe8e6e0, t: 0xf2c522 },
      { k: 'lounger', u: 1.2, v: 1.2, c: 0x3e8fb0, f: 0xe8e6e0, t: 0xe85f4a },
      { k: 'parasol', u: 2.35, v: 0.84, R: 0.75, c: [0xf2c522, 0xf6f4ee] },
      { k: 'side', u: 2.45, v: 1.35, c: 0xe8e6e0, glass: true },
      { k: 'palm', u: 4.55, v: 0.42, pot: [0.27, 0.55], pc: 0xf3f0e8, s: 1.05 },
      { k: 'agave', u: -0.32, v: 1.3, pot: [0.2, 0.32], pc: 0xf3f0e8, s: 0.75 },
      { k: 'railbox', u: 4.2, u1: -0.2, c: [0xf2c522, 0xf08a2c] },
    ] },
    L1208: { style: 'odling', items: [ // raised beds with tomatoes and herbs, a red grill
      { k: 'raised', u: 0.62, v: 0.3, len: 1.05, crop: 'tomato' },
      { k: 'raised', u: 1.85, v: 0.3, len: 1.05, crop: 'herbs' },
      { k: 'table', type: 'bistro', u: 1.25, v: 1.17, c: 0xc8b48a, f: 0x2b2d2f },
      { k: 'chair', u: 0.68, v: 1.17, r: -90, c: 0x9a7650 },
      { k: 'chair', u: 1.82, v: 1.17, r: 90, c: 0x9a7650 },
      { k: 'grill', u: 4.55, v: 0.45, c: 0xa62a24 },
      { k: 'olive', u: -0.36, v: 1.22, pot: [0.2, 0.36], pc: 0xb5643c, s: 0.8 },
      { k: 'can', u: 2.35, v: 0.8, r: 30, c: 0x2f7a5a },
      { k: 'railbox', u: 0.2, u1: 2.65, c: [0xd8262f], herbs: true },
    ] },
    L1209: { style: 'lounge', items: [ // a corner sofa, a low table, big palms and lights (the widest terrace, at the gable)
      { k: 'rug', u: 1.4, v: 0.9, w: 2.3, d: 1.3, c: 0x7a5c48, s: 0xd9c7a8 },
      { k: 'sofa', u: 1.3, v: 0.4, len: 2.2, c: 0x6e5a44, cc: 0xe6e1d6, pillows: [0x2f5d9e, 0xe2b33c, 0xc9472f] },
      { k: 'sofa', u: 0.42, v: 1.12, len: 0.75, r: -90, end: true, c: 0x6e5a44, cc: 0xe6e1d6, pillows: [0x3e8fb0] },
      { k: 'table', type: 'low', u: 1.55, v: 1.18, w: 0.85, d: 0.5, c: 0x6e5a44, f: 0x6e5a44, lantern: true },
      { k: 'palm', u: 4.6, v: 0.45, pot: [0.28, 0.56], pc: 0x2e3133, s: 1.1 },
      { k: 'palm', u: -0.45, v: 1.15, pot: [0.24, 0.48], pc: 0x2e3133, s: 0.85 },
      { k: 'agave', u: 2.6, v: 0.3, pot: [0.18, 0.32], pc: 0x2e3133, s: 0.65 },
      { k: 'lights', a: [0.05, 0.04, 2.35], b: [2.8, 0.04, 2.35], sag: 0.16, n: 14 },
      { k: 'lights', a: [-0.15, 0.04, 2.35], b: [-0.15, 1.55, 1.15], sag: 0.12, n: 9 },
      { k: 'railbox', u: 0.95, u1: 2.7, c: [0xf5f2ee, 0xe9e6de], trail: true },
    ] },
  },
};

// #888, #1120: furnished ground-floor patios on Hus L's back (src/patiodecor.js; decoration only, nothing to pick or sit on).
// EVERY style, colour and position is our own *guess* — no neighbour's patio is documented. #1120: like the roof
// terraces (TERRACE_DECOR), each neighbour gets its own varied furniture built from terracedecor.js's generic models
// (no longer our own Åborg / Verona / Randers pieces), laid out by a deterministic random stream per flat (`seed`):
// the `styles` are dealt out over the patios in a seeded shuffle (all different while there are enough), and each
// layout picks its colours from `palette`, may be mirrored across the free zone and shifts a little.
// L1007 is skipped: our own patio's furniture is in FURNITURE (PATIO) and stays as it is.
// Local frame: u m east of the unit origin ox, v m south of the south façade D. The patio door (u 0.95–1.87, `door.depth`
// out) and the passage to the hedge opening (`passage` u 0–1.9) keep clear: furniture stands in `zone` (u0–u1, v0–v1,
// in front of the patio hedge at v ≈ 4.05). Chairs face their table, sofas have their backs to the façade (#1091).
export const PATIO_DECOR = {
  skip: ['L1007'], far: 140, seed: 1120, jitter: 0.15,
  door: { x0: 0.95, x1: 1.87, depth: 1.1 },
  passage: { x0: 0.0, x1: 1.9 },
  zone: { u0: 2.1, u1: 5.55, v0: 0.2, v1: 3.75 },
  fence: { u0: 0.08, u1: 5.67 }, // the screen walls either side (plan.json site.fences) — plant crowns stay inside
  styles: ['bistro', 'matgrupp', 'lounge', 'solstolar', 'grill', 'odling', 'grönska'],
  palette: {
    frame: [0x2a2c2e, 0xf1efe9, 0x3c5a45, 0x2f5d9e, 0x9a9da0, 0xb04a32],
    wood: [0xa77b4f, 0x8a6a48, 0xc19a6b, 0x6e5440],
    cushion: [0xe2b33c, 0xc9472f, 0x5d7f4f, 0xe9e4d8, 0x2f5d9e, 0x9a9da0, 0xd98aa0],
    pot: [0xb5643c, 0x2e3133, 0x6b6f6a, 0xf3f0e8, 0x7a5a44],
    parasol: [[0xf6f4ee, 0x2f5d9e], [0xe9e4d8], [0xc9472f, 0xf6f4ee], [0x5d7f4f, 0xe9e4d8], [0xe2b33c, 0xf6f4ee], [0x2a2c2e]],
    rug: [[0xf2efe6, 0x2f5d9e], [0x4f6b43], [0x9a9da0, 0xe9e4d8], [0xc9472f, 0xf2efe6], [0xd8cdb5]],
    flowers: [[0xd8262f, 0xe8484f], [0xf5f2ee, 0xf2c522], [0xd98aa0, 0xf5f2ee], [0x8a5fb8, 0xb59ad8], [0xe08a2c, 0xf2c522]],
  },
};


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
  core: {
    w: 8.175, portik: [3.4, 5.1], portikHeight: 3.0,
    // L1101 street openings on våning 2 (#457, DRAWING overview plan p. 48; sill/head ASSUMPTION)
    l1101: [{ x0: 3.67, x1: 4.98, sill: 0.8, head: 2.4 }, { x0: 6.51, x1: 7.31, sill: 0.8, head: 2.4 }],
  }, // stair core
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
  // #1078: Peab's "utvändig belysningsarmatur med integrerat eluttag vid uteplats, balkong eller terrass" (information
  // brochure:698–700) by every courtyard-side patio door (L1001–L1008, ours too) and roof-terrace door (L1201–L1209).
  // Model, side, height and sizes are all *guesses* (no drawing or product named): doorLamp's dark box with a frosted
  // front, centre `y` m over the door's floor, `dx` m east of the door opening (into the gap before the next window; the
  // west side if that would leave the unit's strip), `w` × `h` × `d`; under it a `socket` housing (w × h × d, its top
  // `gap` m under the lamp) with a light hinged cover. Lit with doorLamp (its on / off / fade, colour and peaks): the
  // glass joins the lanterns' glow, its `wash` and `pool` (radii rx along the façade, rz out, centre `z` out from the
  // wall; both halved to fit a terrace's depth) join the door lights' two additive meshes (src/exterior.js patioLamps).
  patioLamp: { dx: 0.28, y: 1.95, w: 0.12, h: 0.2, d: 0.1, socket: { w: 0.09, h: 0.1, d: 0.06, gap: 0.03 },
    wash: { w: 2.0, h: 2.3, y: 1.8 }, pool: { rx: 2.2, rz: 1.4, z: 1.45 } },
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
  solar: { x: [[-39.96, -25.77], [-24.13, -6.37], [-4.83, 9.56]], z: [[3.5, 4.5], [5.4, 6.4], [7.4, 8.4], [9.4, 10.4]],
    // Peab's renders show the panels tilted slightly up towards the sun (#1232). Tilt about the panel's long (x) axis,
    // the north (-z) edge raised so the face looks south; all three values are assumptions (*guess*): no source measures them.
    tilt: 10,          // degrees above horizontal (*guess*)
    thickness: 0.05,   // panel slab thickness, m (*guess*; was a 0.07 flat box)
    lift: 0.04,        // lowest edge (south) above the roof capping, m (*guess*: mounting rail)
  },
};

// Seasons (src/seasons.js, #73), by the day cycle's month (the wall clock can change it). Tree crowns:
// hue/saturation/lightness per month (each tree varies around it), `leaves` = how much crown is left
// (0 = bare branches in winter). Snow months: ground, roofs, hedges and paving turn white.
export const SEASON = {
  snowMonths: [12, 1, 2],
  // month → [hue, sat, light, leaves]   (spring light yellow-green, summer deep green, autumn mixed)
  // #1804 (*guess*, by eye against the Google 3D set docs/references/google-3d-2026-11-02): May–September darker and bluer
  // (summer hue 0.28–0.29 → 0.31–0.32, light 0.27–0.30 → 0.16–0.18; September 0.2 / 0.32 read as autumn yellow-green), so
  // the canopy reads as the dense dark blue-green of the reference. Spring, autumn and winter months are unchanged.
  trees: {
    1: [0.08, 0.2, 0.22, 0], 2: [0.08, 0.2, 0.22, 0], 3: [0.22, 0.45, 0.42, 0.45], 4: [0.24, 0.55, 0.45, 0.85],
    5: [0.28, 0.45, 0.22, 1], 6: [0.33, 0.36, 0.12, 1], 7: [0.34, 0.34, 0.1, 1], 8: [0.33, 0.33, 0.11, 1],
    9: [0.3, 0.35, 0.12, 1], 10: [0.09, 0.65, 0.38, 0.95], 11: [0.06, 0.45, 0.3, 0.45], 12: [0.08, 0.2, 0.22, 0],
  },
  blossomMonths: [4, 5], // some trees flower white/pink
  snow: { ground: 0xeef3f7, roof: 0xf4f7fa, hedge: 0xdfe8ec, paving: 0xe6ebee },
};

// Footprints in the snow (#1773, src/footprinttrail.js, src/footprints.js, cloudflare/trails.js). In the snow months players (shoe
// prints, left and right) and the outdoor cats (small paw prints) leave prints where snow lies outdoors: not on the ploughed roads
// (roads.js onRoad), not in water, not under a roof / canopy / balcony, not indoors. Each print fades out linearly and is gone `life`
// s after it was made. All prints are one instanced quad mesh (one draw call, a canvas atlas: shoe | paw), at most `max` of them;
// a print fades out with distance between `fadeFrom` × and 1 × `drawDist` (phone `drawDistPhone`) m and the mesh is hidden while no
// live print is that near (no draw call). Shoe: `size` [width, length] m, `step` m between prints, `side` m off the line, a new line
// after a gap over `jump` m; paw the same (cats walk nearly in one line). `opacity`: a fresh print's alpha. `room`: the players room's
// bounded memory for late joiners (cloudflare/trails.js): a sparse point per `gap` m walked, a new trail after a jump over `jump` m,
// at most `max` points, none older than `life`; memory only, no KV or storage (#1689), lost when the room hibernates. `catOuting`: on
// snow days an outdoor cat goes out for `out` s of some `slot`-s windows (chance `chance`, scaled by its personality's traits when it
// has them, #1772), a pure function of the clock so every client agrees and a late joiner rebuilds the last `life` s. All *guess*.
export const FOOTPRINTS = {
  life: 1800, max: 2000, drawDist: 30, drawDistPhone: 20, fadeFrom: 0.7, opacity: 0.55, color: 0x8796ab,
  shoe: { size: [0.12, 0.29], step: 0.68, side: 0.1, jump: 3 },
  paw: { size: [0.055, 0.06], step: 0.16, side: 0.035, jump: 2 },
  room: { gap: 1.2, jump: 6, max: 1200 },
  catOuting: { slot: 1500, out: 480, chance: 0.45 },
};

// Leaf-card crowns and branching trunks (#679, src/foliage.js) for the site's trees, shrubs, the courtyard's plantings and
// vines and the far southern woodland. All visual choices (*guess*), tuned by eye against screenshots, no measurements:
// `atlas` / `atlasPhone` px of the shared leaf atlas (2 × 2 cells); `cards` per lobe [desktop, phone] per level and the
// core's icosphere `coreDetail` (triangles: detail 0 = 20, 1 = 80; a card = 2, drawn two-sided; the old flat-shaded lobe
// was 80), `coreHoles` leaf-shaped holes punched into the core's atlas cell; a lobe
// is radius 1 (instance-scaled): the opaque `core` radius, `lump` its unevenness, `coreJitter` its normals' scatter (no smooth
// ball), `coreShade` its extra darkening (the shaded inside), the cards' centres between `shell` radii,
// `size` their edge, `tilt` rad off the tangent plane, `jitter` of their normals; `ao` the vertex-colour darkening at the
// bottom centre, `bright` an overall lift (the texture and `ao` darken; seasons' colours were set for flat faces);
// `leafLight` the leaves' grey range in the atlas, `coreGround` the core's; `alphaTest` the card cut-off.
// Trunk (height 1, instance-scaled): `base` / `top` radii, `sides`, a leader up the middle, `branches` (the first `forks`
// of them forking once) from `from` up, reaching `reach` out and `rise` up (into the crown); ~46 triangles, the old
// plain cylinder 28 (the crowns save more than the branches cost); `bark` px of the bark textures, `color` / `birchColor` their tints.
export const FOLIAGE = {
  atlas: 512, atlasPhone: 256,
  cards: { tree: [20, 18], shrub: [14, 10], far: [8, 5] }, coreDetail: { tree: 0, shrub: 0, far: 0 }, coreHoles: 220,
  // #1723: a far lobe has only 8 (phone 5) cards, so its opaque 20-triangle core read as a solid faceted block in the crown
  // from the south street; the far core is smaller and its few cards larger (same triangles per lobe; *guess*, by eye)
  coreScale: { tree: 1, shrub: 1, far: 0.62 }, cardScale: { tree: 1, shrub: 1, far: 1.4 },
  core: 0.42, lump: 0.18, coreJitter: 0.45, coreShade: 0.95, shell: [0.45, 0.85], size: 0.72, tilt: 0.6, jitter: 0.35,
  ao: 0.45, bright: 1.22, leafLight: [0.62, 1.0], coreGround: 0.45, alphaTest: 0.4,
  trunk: { base: 0.2, top: 0.1, sides: 5, farSides: 4, branches: 3, forks: 2, from: 0.5, reach: 0.95, rise: 0.3, color: 0x8a735f, birchColor: 0xf2efe8 },
  bark: 64,
  // #1083: a crown standing near an Å-hus (SITE.blocks) is narrowed so its leaf cards stay `wallClearance` m outside the
  // façade instead of poking through the brick and windows (a pruned crown; *guess*, by eye — no measurement)
  wallClearance: 0.2,
  // #1246: the site's tree batches (trunks, birches, crowns) are split into square cells of this side (m, *guess*: ~5 cells
  // across the site, so a view drops the cells behind it while a cell stays big enough to keep draw calls modest), each its
  // own InstancedMesh with its own bounding sphere, so frustum culling skips whole groups of trees instead of drawing all ~1500
  // crowns and ~1200 trunks from every spot.
  cell: 130,
  // #1958: distance LOD of the site's trees with a dithered crossfade (src/lod.js). Between `start` and `end` m (measured to
  // the instance centre) a tree is drawn at both levels, a Bayer-dither pattern fading the full one out and the far one in;
  // before `start` only the full tree, after `end` only the far one (the 36-triangle 'far' lobe, a 14-triangle trunk).
  // Narrow on purpose (both levels are drawn inside it). *guess*, by eye: 50 m is about where a lobe's cards stop reading
  // as single cards; phones switch earlier (their frames are the tighter ones). `margin`/`step`: instances join a level's
  // buffer `margin` m before the shader needs them and the packing is redone when the camera moved `step` m (margin > step).
  lod: { start: 46, end: 54, startPhone: 30, endPhone: 38, margin: 2, step: 1, trunkTint: 0.72 },
};

export const FENCE_HEIGHT = 1.8; // bofakta: Skärmvägg H = 1,8 m
// #1786: how the patio / roof-terrace screen walls (skärmväggar) look. Peab's courtyard render (docs/peab-radhusrad-innergard.png)
// shows them as greige-olive vertical boards in a light cream frame, not a flat plane; boards, colours and post width are
// read by eye from that render (*guess*). The thickness stays the drawn 5 cm (patio, plan.json site.fences) / 6 cm (terraces),
// so collision, furniture clearances and occluders are unchanged; posts are as thick as the wall. One shared canvas texture,
// UVs u in metres along the wall, v over the wall's height (src/screenwall.js) — no extra material or draw call.
export const SCREEN_WALL = {
  board: 0.09, boards: 8, // m per board, boards per texture repeat
  color: [158, 151, 118], vary: 0.06, groove: [98, 92, 72], // boards (sRGB), ±vary brightness per board, the gaps between them
  frame: [214, 207, 182], rail: 0.06, post: 0.07, // the cream top rail (m from the top) and the end posts (m along the wall)
};

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
  A: 2.1, LH: 1.9, // L1201 (#573): the ventilation unit's cupboard, linen shelving (heights *guess*)
};
// Sliding wardrobe joinery (#537): construction assumptions, not measured Peab details.
export const WARDROBE = {
  carcass: 0.02, plinth: 0.08, panel: 0.02, firstTrack: 0.015, trackSpacing: 0.025,
  overlap: 0.04, edgeGap: 0.002, sealWidth: 0.008, sealGap: 0.001, railLip: 0.012,
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
// the stair, and the clear floor below its high soffit, are where a cat can turn up: the shelf collides only from
// `solid`[0] east and `solid`[1] deep, so the way in under flight B stays open), a tool rail on the east wall under the
// winders, a mop bucket in the SE corner with the mop leaning on the east wall, a stick vacuum in a dock on the south wall.
export const CLEANING = {
  shelf: { x0: 3.87, x1: 4.63, z: 5.704, d: 0.30, t: 0.02, ys: [0.72, 1.12, 1.52, 1.92], standards: [3.95, 4.50], solid: [4.10, 0.2] },
  rail: { x: 5.551, z0: 5.80, z1: 6.32, y: 1.30 },
  bucket: { x: 5.24, z: 6.50, r: 0.155, h: 0.30 },
  // Gameplay choice: #485 tripled the former 1.0 mess units to 3.0, #1096 doubled that to 6.0; suction and dirt
  // amounts stay the same.
  vacuum: { x: 4.20, z: 6.609, dock: 1.18, dustCapacity: 6.0 },
};

// Where a visit starts: out on the grass in front of the entrance façade, facing the house with the
// gaze slightly up, so the whole unit (and Hus L above it) is in view (#35). yaw 180 = facing south.
export const START = { x: 2.875, z: -12, yawDeg: 180, pitchDeg: 8 };
// Walkable area outside: in front of the north façade (x range, back to z0), our patio and, through
// the gap in the hedge (SW corner), the lawn behind the row of patios up to z1 (#52).

// Weather (#248, src/weather.js): per date a seeded draw. `rain` = the chance per day of showers by month (Jan…Dec):
// spring and autumn, a little in summer, none in the snow months (Lund's wettest months are Jul–Nov, the user wants
// spring and autumn); `second` = the chance of a second shower that day. `thunder`: late summer (from / to as [month,
// day]) a chance per day of a thunderstorm starting between `hours`. Lengths in game hours (DAY.minutes: real hours
// at the real-time day, #1145), `ramp` = h to come and go. Drops: `drops` streaks within `radius` m of the eye, `height` m above it,
// falling `speed` m/s, `len` m long, slanted by `wind`. Overcast: the sun × (1 − `sunCut`), fog `fogFar` m. Lightning
// every `flash.every` real s (random in between), thunder after distance / 343 m/s. Our numbers.
export const WEATHER = {
  rain: [0, 0, 0.3, 0.38, 0.3, 0.12, 0.12, 0.15, 0.38, 0.5, 0.45, 0], second: 0.35,
  showers: { len: [1, 4.5], ramp: 0.35, strength: [0.45, 1] },
  thunder: { from: [7, 20], to: [8, 31], chance: 0.4, hours: [14, 20], len: [1, 2.5] },
  drops: 1800, radius: 13, height: 9, speed: 9.5, len: 0.5, wind: 0.12,
  sunCut: 0.85, fogFar: 80,
  flash: { every: [6, 22], dist: [400, 4000], light: 2.2 },
  sound: 0.07, // #1470: assumed comfortable rain gain, down from .22 (~10 dB); indoors retains 30% plus muffling.
  // #249: snow — the chance per day by month (Jan…Dec; mostly the snow months), `flakes` Points drifting down at `speed`
  // m/s, swaying `sway` m/s, `size` m; hail — short showers in `months` (`chance` per day) and at the start of a
  // thunderstorm (`storm`): `stones` white pellets of `size` m falling ~`speed` m/s, bouncing once
  snow: { chance: [0.38, 0.4, 0.1, 0, 0, 0, 0, 0, 0, 0, 0.06, 0.35], len: [1.5, 6], flakes: 2400, speed: 1.1, sway: 0.35, size: 0.07 },
  hail: { months: [3, 4, 5], chance: 0.12, len: [0.25, 0.6], storm: 0.3, speed: 11, stones: 2200, size: 0.05, lie: 2.5 }, // lie: s a pellet lies on the ground at most
  // out in it (#249): `metres` walked outdoors while at least `min` of it falls counts once per shower
  experience: { min: 0.3, metres: 20 },
  // #674: the temperature in the HUD badge. Simulated days (no real data): `climate` = Lund's mean temperature by month (Jan…Dec,
  // °C) and the half-swing between the day's low (~03:00) and high (~15:00) — our *guess* from memory of Skåne's 1991–2020
  // normals (SMHI), not looked up; `anomaly` = the standard-ish spread (°C) of a day's offset from the month's mean (seeded per
  // date, blended into the neighbouring days so midnight has no jump); `sun` = °C a clear afternoon adds in that month, `wet` =
  // °C a shower takes off, `snowMax` = snow never falls above this, `fade` = s a switch between simulated and real weather
  // (and a forced one) takes to blend (rain, cloud and temperature).
  climate: { mean: [0.5, 0.4, 2.8, 7.5, 12, 15.5, 17.8, 17.4, 13.6, 8.8, 4.7, 1.8], swing: [2, 3, 4, 5, 5.5, 5.5, 5.5, 5.5, 4.5, 3, 2, 1.5],
    anomaly: 3.2, sun: [0.3, 0.5, 1, 1.5, 2, 2.5, 2.5, 2.5, 1.5, 1, 0.4, 0.2], wet: 1.5, snowMax: 0.5, fade: 3, forcedSnow: -2 },
  // #674: real weather (src/realweather.js, Open-Meteo, CC BY 4.0, free for non-commercial use without a key, CORS open). A month at a
  // time: a month that ended more than `finalDays` days ago comes from the archive (ERA5, final, cached for good, at most `keepMonths`
  // kept), a newer one from the forecast API (its past days + the next `ahead` days; cached `ttl` s, a stale copy is used while
  // it is fetched anew); further ahead: simulated. Only the site's coordinates (rounded to `digits` decimals) and dates are sent.
  // `timeout` s per request, `retry` s before a failed month is tried again, `startAfter` ms after the first frame before the first
  // request (a test's &weatherapi=/path/fixture.json starts at once and replaces both URLs by that same-origin file).
  real: { archive: 'https://archive-api.open-meteo.com/v1/archive', forecast: 'https://api.open-meteo.com/v1/forecast',
    hourly: 'temperature_2m,precipitation,rain,snowfall,weather_code', zone: 'Europe/Stockholm', digits: 3,
    finalDays: 7, ahead: 6, ttl: 3 * 3600, timeout: 20, retry: 300, startAfter: 1500, keepMonths: 12, keyPrefix: 'lunden.weather.',
    rainMm: 2.5, snowCm: 1, // mm / cm per hour that count as a full strength shower (lighter falls weaker); *guess*
    cloud: { 1: 0.05, 2: 0.2, 3: 0.55, 45: 0.6, 48: 0.6 } }, // overcast by WMO weather code when nothing falls
};

// Speech bubbles (#247, src/greet.js): Olof's lines and your own show for `bubble` s. The neighbours to greet were
// removed in #670 (with their lines and `reach`).
export const GREET = { bubble: 2.8 };
// #1343: personal near-avatar kiss; distances/effect size are playability guesses. Reserved greeting index, never random.
export const KISS = { phrase: 15, range: 1.35, serverRange: 1.6, hearts: 10, scale: 1.8, line: 'Puss på dig, {n}!',
  // #1398: animation/audio timings and pose are playability guesses; +100 is the user's explicit reward.
  duration: 2.2, contact: .85, release: 1.25, lean: .65, head: .5, forward: .12,
  pucker: .018, narrow: .4, muzzleWidth: .085, muzzleHeight: .075, muzzleFront: [.05, .1], muzzleTop: [.046, .068], noseFade: .15, faceGap: .12, mouthHeight: 1.5, receipts: 256, soundRange: 12,
  hum: .36, humHz: 180, smackHz: 850, soundGain: .7,
  humGain: .3, overtoneGain: .08, smackGain: .7, smackDuration: .085, smackQ: 2, smackAttack: .003,
  popDuration: .075, popHz: [480, 140], popGain: .3 };
// #2058: the pout's muzzle skin fades out smoothly above the lips over `muzzleTop` [from, to] (head-bone y m, the nose's base
// ~.063, AVATAR_NOSE) and over `noseFade` of the nose's own height (noseBlend), so the nose and the cheeks beside it stay put
// and no triangle between them tears; *guess* by eye (docs/verification/2058).
// #1405: a hug between any two nearby players, chosen from the same E/touch menu as greeting (and kissing for Sarah/Olof).
// `phrase` is a reserved greeting index (below PLAYERS.greetPhrases, never chosen at random); ranges as KISS (client / server
// margin, m); `gap` the distance between the two bodies' centres in the embrace, `duration`/`contact`/`release` s of the
// shared envelope; `hands` the arm targets in the figure frame (L high over the shoulder, R round the waist), `pole` the
// elbows. All playability guesses (*guess*); no score.
export const HUG = { phrase: 14, range: 1.35, serverRange: 1.6, gap: 0.34, duration: 2.6, contact: 0.7, release: 1.9,
  line: 'Kram på dig, {n}!', hands: { L: [0.13, 1.36, 0.36], R: [-0.13, 1.12, 0.33] }, pole: [1, -0.1, 0.25], head: 0.25 };

// Olof at the wheel (#900): shared figure colours and the existing car greeting/pose rules.
export const OLOF = {
  colors: { hoodie: 0x5a2029, cuff: 0x4a1a22, tee: 0x606063, zip: 0xb9bcc0, jeans: 0x3a3c41, shoe: 0x2a2523, skin: 0xe2b59b,
    hair: 0x9c8b63, beard: 0x7f776d, beardLight: 0x999087, ear: 0xc78f77,
    eye: 0x2a2420, can: 0xc9cdd2, canBand: 0x1f5e3a, canTop: 0x9aa0a6 },
  // #1156: he is drawn with the players' avatar (src/avatar.js) in a fixed look made from his colours above: short hair
  // (style 0), long sleeves, a full beard with moustache (facial 3) in his grey `beard`, dark brown eyes (EYES[1]), the
  // standard 175 cm and an average build; the face sliders in the middle (defaultFaceLook).
  look: { style: 0, sleeves: 1, gender: 0, facial: 3, build: 1, tall: 1, eyes: 0x3b2618 },
  // at the wheel of our car (#599, src/olof.js OlofDriver): `at` [x, z] his hips in the car's frame (facing +x) (the driving seat's cushion, carmodel.js seats: x −0.04, z −0.37; seat top 0.54),
  // `floor` the foot well (carmodel.js: 0.29 + half its 0.05), `seat` the cushion's top above it, `wheel` [x, y, z] where his
  // hands hold it (carmodel.js: the wheel's centre 0.42, 0.93, −0.37, tilted 0.42 rad), `pedals` how far forward his feet are,
  // `lean` into the backrest (`wheel`, `pedals` in his own frame: x his left, z forward, y up from the foot well);
  // `box` the pick box [x0, y0, z0, x1, y1, z1] in his frame, out through the driver's window
  // (above the door's handle, so the door still opens). Placement by eye (*guess*); `jokeTime` s his bubble.
  car: { at: [0, -0.37], floor: 0.315, seat: 0.17, wheel: [0, 0.6, 0.4], pedals: 0.76, lean: 0.2,
    box: [-0.27, 0.6, -0.3, 0.62, 1.17, 0.35], jokeTime: 5,
    hello: ['Hej Olof!', 'Tjena Olof!', 'Hallå där, Olof!', 'Hej chauffören!'],
    jokes: ['Varför är matteboken så ledsen? Den har så många problem.', 'Vad sa nollan till åttan? Snyggt bälte!',
      'Vad sa den ena väggen till den andra? Vi ses i hörnet!', 'Jag skulle dra ett skämt om parkering, men alla bra platser var redan tagna.',
      'Jag försökte skriva ett skämt om elbilar, men det blev aldrig riktigt laddat.', 'Vilken bil gillar skogen bäst? En Granault!',
      'Varför tog trafikljuset inte semester? Det hade fullt upp med att byta om.', 'Vad gör en bil på gymmet? Den kör på!'] },
};

// The walkable area outdoors (#355): the whole block Kv. Lunden — the car park in front of Hus L (z0, as before), Karpvägen
// with the garage drive (x0: its far kerb, Karpvägen's `w` 5.8 about x −75.8), the park level south of the box (z1: short of
// the park's woods, SITE.treeAreas) and Sankt Lars väg's east leg (x1: short of HepCat Store's west face, 27.9). Inside it
// Hus L's row (but the portik), the Å-husen's outlines, the box's edge (not down its stairs, `SITE.terrain.stairs`) and the
// ramp's wall stop the visitor (world.js; surroundings.js `userData.segments`). The bounds are a choice, not a plot line.
export const OUTDOOR = { x0: -78.5, x1: 27.5, z0: -14, z1: 64 };

// #1236 (user answer on #1233, 2026-10-18): the visitor may walk well beyond the block, down to Höje å and along its park paths
// (over the two bridges), later also among the school buildings to the clock tower. `WALK` is the outer edge of that
// walkable area (world.js: the perimeter wall, also at every height for the roofs/jetpack); OUTDOOR stays the home block for
// respawn zones and ball returns. Bounds are a choice (*guess*), grown in steps as the terrain/buildings behind them get collision.
// `cell` m: edge of the buckets the far collision (src/farwalk.js) is looked up in. `wade` m: how far from the water's edge the
// shallow bank already stops the visitor (water is an obstacle; the bed follows SITE.bridges.bedY plus the local river fall, so ground there is still under the local water line). `rescue` m: where a visitor who still ends up in the river
// is put back, measured from the edge of the water (*guess*). `maxSlope` rise/run: steeper ground holds the visitor back
// (the #1233 banks stay under it: bankScale .55 gives roughly 0.5-0.7).
// #1278 (a visitor: the area behind HepCat Store is a whole car park in reality): the east campus' OSM parking polygons
// (SITE.east.access entries with a `capacity`, #1262: the snapshot has no stall data) get marked stalls, an edge strip and parked cars,
// laid out by src/parkinglayout.js. Stalls stand along the OSM service ways that run inside a polygon (the lot's aisles), on both
// sides, square to the aisle. Every number here is a *guess* (a typical Swedish car park: stalls 2.5 x 5.0 m, DIN/SS 2.5 m wide); the
// positions follow the sourced ways and polygon, the stall count is whatever fits (not the polygon's guessed `capacity`).
export const PARKING_LOT = {
  bayW: 2.5, bayD: 5.0,    // m: a stall along the aisle x across it (*guess*)
  edgeClear: 0.3,          // m: stalls keep this far inside the polygon's edge and out of any other road (*guess*)
  lineW: 0.1, lineColor: 0xeeeeea,  // marked stall lines (same width/colour as the south lots, #1262; *guess*)
  kerbW: 0.3, kerbColor: 0xb0aba2,  // flat concrete edge strip along the polygon, left out across road mouths and at buildings (*guess*)
  mesh: 100,               // m: longest triangle edge of the asphalt before it is cut along the terrain mesh's own grid lines and diagonals (#1309, sitebackdrop.js cutAtTerrain), which is what makes it follow the sloping ground behind HepCat (z -19 to 17 falls 1.7 m) without gaps; the cuts keep the triangle count low (was 3.0 m sampled only at corners)
  lift: { asphalt: 0.02, kerb: 0.035, line: 0.045 }, // m over the terrain: under the roads' own 0.025 so the aisles stay on top, lines/edge over both
  fill: 0.5, seed: 1278,   // share of stalls with a car (*guess*; the other lots' cars seed their random pick the same way), fixed seed
  reversed: 0.25,          // share of cars that stand nose out
  car: { hx: 2.17, hz: 0.92 }, // half length, half width of the street car park's footprint (streetlife.js: 4.34 x 1.84 m), nose toward +x before the yaw
};
// #1294: every mapped building inside WALK has a walkable roof (src/buildingroofs.js), made from the backdrop's own records: the drawn roof's
// height where the builder gives it (`roofY`), else flat at the eave + `flatLift` (*guess*: flat felt / sheet roofs and the S:t Lars 41 pavilions).
// `wallStep` m: spacing of the samples that set a wall's height along a gable end (*guess*); `wallLift` m: the wall's top over the roof line;
// `depth` m: the walls reach this far under y 0 (the garage-box cut and the river park lie lower).
export const BUILDING_ROOFS = { flatLift: 0.05, wallStep: 4, wallLift: 0.05, depth: 10 };
// #1305: the terrain outside the built block follows data/elevation.json's bare-earth grid (src/elevation.js). The weight is 0 inside
// `protect` (a rectangle round Hus A/B/C/L, the courtyard, the garage box and Karpvägen / Sankt Lars väg's designed profiles: today's
// levels, y 0 = courtyard), rises smoothly to 1 over `ramp` m, drops to 0 again within `river` [clear, ramp] m of Höje å (#1285's
// valley depth is kept: the DSM mixes water and bank in a 30 m cell) and over `edge` m towards the mesh's x edges and its south edge
// (the flat -3.01 planes beyond). All *guess* tunables; roads, paths, tree feet and the backdrop buildings sample the terrain themselves.
/** #1311: where the terrain mesh gets coarser (triangle budget, perfcount big hall): columns outside x colWest..colEast are 12 m instead of 4 m (the river
 * corridor reaches x ~204 + its refine radius 28, so the east stays fine to colEast), rows further than rowNear north of `terrainNorth` are 10 m instead of 5 m. *guess* */
// #1381: added southern rows8m sample the10m DEM (display guess); old rows north of260 are retained.
// #1382: LM ground controls from the same77-point export, relative to14.36RH2000.
// These do NOT measure a bridge deck. Preserve deckY=-3 as an explicit guess;147..152 is an assumed tie-in.
// Flat half-width4m, outer feather15m and the extension to the plateau are interpolation guesses.
export const SOUTH_BANK = { start:147, full:152, flat:4, feather:15, extensionWidth:6, extensionFeather:6, extensionEnd:248, plateauControl:[-20,262], fade:[262,286],
 road:[[23.3,145.8,-1.02],[23.6,152,-0.34],[23.8,160,-0.3],[24.3,168,-0.18],[24.9,176,-0.06],[25.6,184,0.02],[26.5,188.7,0.15],[27.8,193.5,0.29],[28.4,203.9,0.54],[28.3,208.8,0.6],[27.7,213.6,0.66]],
 cross:[[150,23.6,[[-30.0,-4.3],[-20.0,-4.33],[-12.0,-2.27],[-8.0,-0.55],[-5.0,-0.17],[5.0,-0.29],[8.0,-1.03],[12.0,-3.4],[20.0,-3.7],[30.0,-3.7]]],[165,24,[[-30,-4.18],[-20,-4.11],[-12,-2.26],[-8,-0.41],[-5,-0.2],[5,-0.24],[8,-0.24],[12,-2.24],[20,-3.17],[30,-3.23]]],[180,25.4,[[-30.0,-4.3],[-20.0,-3.97],[-12.0,-1.74],[-8.0,0.07],[-5.0,-0.02],[5.0,0.09],[8.0,0.01],[12.0,0.03],[20.0,-2.47],[30.0,-2.39]]],[195,27.8,[[-30.0,-3.39],[-20.0,-2.88],[-12.0,-0.2],[-8.0,0.47],[-5.0,0.42],[5.0,0.27],[8.0,0.22],[12.0,0.38],[20.0,0.41],[30.0,-0.44]]],[210,28.4,[[-30.0,-2.34],[-20.0,-1.23],[-12.0,0.68],[-8.0,0.72],[-5.0,0.57],[5.0,0.58],[8.0,0.61],[12.0,0.64],[20.0,0.62],[30.0,0.83]]]] };

export const TERRAIN_FAR = {
  colWest: -150, colEast: 235, rowNear: 60, southRow: 8,
  renderSplit: { x: 0, z: 60 } // #1462: measured complete-cell render grouping only; no change to heights or grid.
};
// #1381: southAnchor3m/apron4m below are platform/interpolation guesses consistent with the3–5m registration.
// #1381: sampled LM ground via kart-api, docs/references/elevation-hoje-a/point-api-south-road-2026-10-19.json
// (CC BY 4.0 per provider). Relative to the existing 14.36 RH2000 origin, NOT a surveyed apartment floor.
// Radius35m and a225..240m north fade are interpolation guesses; only local dry-ground samples, never bathymetry.
export const SOUTH_PLATEAU = { radius: 35, fade: [225, 240], points: [[-150,255,-3.52],[-130,240,-3.51],[-170,272,-3.57],[-125,275,-2.54],[-40,286,1.83],[30,272,1.94],[10,248,1.26],[-20,262,1.58],[-90,265,-1.0],[-70,275,1.15]] };
// #1543: outside a graded parking lot, groundY eases from the drawn terrain at the outline (where the lot's own
// groundY follows the drawn triangles) back to the smooth sampler over `fade` m (*guess*: under the 2.36 m from lot
// 145221619 to the (-20,262) control, which keeps its sourced value; the seam was up to 0.29 m in one frame).
export const PARKING_SEAM = { fade: 2 };
export const ELEVATION = { protect: { x0: -86, x1: 46, z0: -36, z1: 72 }, ramp: 30, river: [32, 30], edge: 30,
  pad: 10, padRamp: 8, padMin: 0.4, southAnchor: 3, southApron: 4 }; // #1306: far buildings stand on a level pad (the ground's mean under them) that grades back over `pad` m, unless the ground under the footprint varies by less than `padMin` m (*guess*)
// #1714: z1 452 (was 250) takes in Sankt Lars väg 42-47 with 44's courtyard and 54; the terrain ends at SITE.backgroundGround.z1 460, so the edge stays 8 m away (*guess*)
// #1817: the paddock's fence reaches x -274.34; x0 -285 leaves the whole meadow and body margin inside WALK, 65 m before the drawn terrain edge (*guess*).
export const WALK = { x0: -285, x1: 320, z0: -200, z1: 452, cell: 40, maxSlope: 0.7, // gradient (rise/run, ~35°) above which the ground cannot be climbed and you slide back (#1281, *guess*; the park paths (0.3-0.45) stay under it; the drop from the shore path into the water (up to ~0.8), the steepest bank edges and the bridge embankments are over)
  slideOut: 0.85, slideSpeed: 3.5, slideAccel: 9, // #1281: hysteresis (sliding stops below maxSlope * slideOut), the slide's top speed (m/s) and acceleration (m/s²), *guess*
  waterDepth: 0.15, splashSafe: 2, // #1281: feet this far under the water line (m) are in the river; no fall damage for `splashSafe` s after the splash
  bikeEdge: 1.6, // #1719: the edge notice's margin (m) on the bicycle, which stops ~1 m short of the wall (measured in farwalktest, z 450.9 vs 452); on foot 0.6
  bankStep: 1, bankMax: 40, bankDry: 0.4, bankClear: 1.5, // #1281: the bank search's ring step and reach (m), how far over the water line a bank point must be (m) and the dry margin round it (m)
  trunk: { big: 0.45, tree: 0.3, birch: 0.2, young: 0.15 } }; // `trunk`: half-width of a tree trunk's collision diamond by kind (*guess*, the drawn trunks are thinner than a body)

// #1943: swimming in Höje å (src/swim.js the pure rules, src/player.js `swimStep`, src/avatar.js the pose). On foot in the river (the same
// stretch the #1281 splash rule covered) the visitor floats instead of being put back on the bank; the bicycle keeps the old splash.
// Everything here is a gameplay choice (*guess*): the river's flow is not measured, the bed is 0.6 m under the drawn water line at the channel's edge and 1.8 m mid-channel (#1944, SITE.bridges.pool).
export const SWIM = {
  speed: 0.9, // m/s through the water at full input (*guess*: a calm breaststroke / slow crawl, well under PLAYER.walk 1.6)
  current: 0.35, // m/s the water carries a swimmer downstream along the centre line (*guess*: "slight"; with `speed` 1.25 m/s down, 0.55 m/s up)
  eye: 0.12, bob: 0.015, bobHz: 0.9, // m the eye floats over the local water line ("eyes just above the surface"), its bob (m) and rate (Hz), *guess*
  exitReach: 8, // m: how far from the water's edge a walkable bank spot is looked for when swimming into the bank (farwalk.js splashBank; *guess*)
  climbSpeed: 3, // m/s the swimmer is helped up the (too steep to walk) bank to that spot (*guess*)
  rescueAfter: 4, // s of swimming against an edge with no way up before the old #1281 rescue puts the swimmer on the nearest bank (*guess*)
  // The avatar (others and the mirror image see it): the torso leans forward `lean` rad when swimming (`treadLean` treading water), the water
  // line sits `chin` m over the neck joint so only the head is above it, the head is tipped back by `head` x the lean to look ahead.
  // Crawl strokes: each hand circles its shoulder (`reach` m fore/aft, `lift` m up/down, centre `up` m over the shoulder), `strokeHz` cycles/s at
  // `speed`; treading: the hands scull out to the sides at the surface. Legs trail back (`legs` rad from the vertical, `kick` m flutter).
  // `strokeSpeed` m/s through the water: above it the arms stroke. All *guess*, by eye.
  avatar: { ease: 5, lean: 1.0, treadLean: 0.3, head: 0.85, chin: 0.04, strokeHz: 0.8, strokeSpeed: 0.2, reach: 0.4, lift: 0.27, up: 0.07, out: 0.05,
    scull: { out: 0.4, fwd: 0.2, sweep: 0.09, hz: 0.55 }, legs: 1.05, treadLegs: 0.15, kick: 0.09, kickHz: 2.2 },
  // #1944: diving. Crouch (Ctrl / C, the touch toggle) held while swimming takes the swimmer under the surface with a diving mask on; letting
  // go brings them back up. Everything is a gameplay choice (*guess*); the water is SITE.bridges.pool + 0.6 m deep mid-channel (also a guess).
  dive: {
    rate: 1.3, // m/s the eye goes down / comes up (*guess*: the 1.4 m to the bed mid-channel takes about a second)
    eyeOverBed: 0.4, // m the diver's eye stays over the bed, so the deepest dive follows the bed and never goes through it (*guess*)
    under: 0.1, // m the eye must be under the water line to count as diving (`Player.diving`) (*guess*)
    // The view under the surface (src/divelook.js): the scene's fog takes the sky's horizon colour x `tint` and is pulled in to `near` … `far` m
    // (murky river water, *guess*), and one DOM element lays a colour wash with a darker rim (the mask's edge) over the picture. No render pass.
    look: { tint: [0.34, 0.6, 0.52], near: 0.1, far: 8, wash: 'radial-gradient(ellipse at center, rgba(20,92,108,.36) 40%, rgba(3,24,32,.74) 100%)', fade: 0.25 },
    // The avatar under water: the torso lies nearly level (`lean` rad from upright), the legs trail straight back (`legs` rad from the vertical)
    // with `kick` x the surface flutter, eased in at `ease` /s. *guess*, by eye, so the figure clears the bed at `eyeOverBed`.
    avatar: { lean: 1.42, legs: 1.5, kick: 0.5, ease: 4 },
    // The diving mask (cyklop) on the face while diving (head bone frame, m; avatar.js `diveMask`): a dark rubber skirt `w` x `h` round both eyes
    // from z `back` to `front`, one glass pane in it and a strap round the head (`strap` radius, `band` height). Shape and colours *guess*.
    mask: { w: 0.15, h: 0.066, y: 0.106, back: 0.086, front: 0.14, wall: 0.009, strap: 0.111, band: 0.016, rubber: 0x15181c, glass: 0x7fb4c9 },
  },
  // #1949: the air while diving (swim.js `airStep`, src/diveair.js the meter, the warning and the sounds). The user: "about a minute under
  // water, less when swimming, less still against the current; the last 10 seconds the meter turns red, the picture shakes and gets black
  // edges; out of air = dead". The factors and the looks are gameplay choices (*guess*).
  air: {
    seconds: 60, // s of air holding still under the surface (the user's "about 1 minute")
    swim: 1.6, // x as fast while stroking with or across the current (60 s -> 37.5 s; *guess*)
    upstream: 2.4, // x as fast stroking straight against the current (-> 25 s; in between by the upstream part of the stroke; *guess*)
    warn: 10, // s left at the current rate when the warning starts (the user's "last 10 seconds")
    recover: 15, // s of air back per second at the surface or on land (an empty meter is full again in 4 s; *guess*)
    // The warning's look and sound, growing with the warning 0 … 1 (*guess*, by eye): the camera's roll (`roll` rad) and offset (`shift` m)
    // shake at `hz`; one DOM vignette whose clear middle shrinks from `clear[0]` to `clear[1]` % of the screen's half diagonal and whose
    // black edge goes from `dark[0]` to `dark[1]` opaque; heartbeats every `beat[0]` … `beat[1]` s; bubbles every `bubbles[0]` … `bubbles[1]` s
    // while under water; a gasp when surfacing with under `gasp` of the air left; under water every sound is low-passed at `muffle` Hz.
    look: { roll: 0.02, shift: 0.012, hz: 9, clear: [78, 18], dark: [0.55, 0.97], beat: [0.95, 0.38], bubbles: [1.6, 3.6], gasp: 0.35, muffle: 900 },
  },
  // #1951: a swim stroke with the jump button (Space / the touch jump button; swim.js `kickStart`, `kickStep`, `kickDepth`; player.js
  // `swimStep`). The user: "press jump to swim one stroke up or forwards, the way you look; to swim faster, or up when under water".
  // One press = one push the way the eye looks that fades out; under the surface it has the look's vertical part too, at the surface it goes
  // level along the heading at full strength (never out of the water). All gameplay choices (*guess*), tuned by feel.
  kick: {
    speed: 1.8, // m/s the push starts at, on top of the ordinary stroke and the current (*guess*: twice SWIM.speed, so a stroke is clearly felt)
    time: 0.8, // s over which the push fades linearly to nothing (one stroke carries 0.72 m; *guess*)
    hold: 0.5, // a push up / down against the crouch rule (held = sink, released = float up) stops that rule while it is at least this x SWIM.dive.rate (swim.js `kickDepth`; *guess*)
    pause: 0.6, // s from one stroke's start before the next can start (*guess*: strokes in a row add about 1.1 m/s on average, not more)
    // The avatar: both arms pull together from stretched out ahead (`reach` m in front of the shoulders) out to the sides (`out` m) and back
    // to the hips over `time` s (at the surface the sweep is `lift` m higher, so the arms show over the water), the legs' flutter grows by `legs` x; others see it when the speed through the water jumps by `jump` m/s to
    // over `over` m/s (ghosts.js; the ordinary stroke never passes SWIM.speed). *guess*, by eye.
    avatar: { time: 0.7, reach: 0.5, out: 0.3, lift: 0.14, legs: 1.5, jump: 0.45, over: 1.15 },
    sound: { gain: 0.5, under: 0.7 }, // the swish's loudness at the surface, and x this under it (audio.js `swimStroke`; *guess*)
  },
};

// #1952: things drifting downstream on and in Höje å, so the water is seen to flow (src/riverdrift.js the pure rules, src/riverdriftview.js
// the two draw calls). The user: "small bubbles or particles floating downstream". Everything is a look chosen by eye (*guess*): the real
// river's flow, foam and litter are not measured. Positions are a pure function of time along the smoothed centre line; nothing is simulated.
// #1956: what grows and lies in Höje å (src/riverflora.js places it, src/riverfloraview.js draws it). Everything here is *guess*: no
// survey of the river's bed or plants; the kinds are what a slow lowland stream in Skåne plausibly has (pondweed-like ribbons,
// yellow / white water lilies near the banks, field stones). `ends`: m kept clear at both ends of the line; `range`: m up / downstream
// of the eye that is filled in; `drawDist`: m from the centre line within which anything is drawn.
// stones: `perM` per metre of river, half-size `size` (min, max; mostly small: the share is cubed), sunk `sink` of their height into the bed.
// weeds: clumps `perM` per metre inside patches (`patch` m long, a `share` of them planted), height `h` (never nearer the surface than
//   `clear` m), `lean` (downstream, at the tip, per m of height) and `sway` (amplitude per m of height, Hz) in the current.
// lilies: a cluster every `every` m with chance `chance`, `pads` leaves within `spread` m, radius `r`, between `bank` (shares of the half
//   width) from the centre line; a `flower` share of the pads carries one. Leaves in the months `months`, flowers in `bloom`.
export const RIVER_FLORA = {
  seed: 1956, ends: 12, range: 55, drawDist: 80,
  stones: { perM: 0.6, size: [0.06, 0.4], sink: 0.35, colors: [0x6f6a60, 0x857f72, 0x5a5650, 0x7a705e] },
  weeds: { perM: 1.1, patch: 9, share: 0.6, h: [0.3, 0.95], clear: 0.12, lean: 0.3, sway: [0.1, 0.35], colors: [0x3f6b2e, 0x4f7a34, 0x2f5a3a, 0x6b7f3a] },
  lilies: { every: 24, chance: 0.65, pads: [4, 9], spread: 2.2, r: [0.11, 0.2], bank: [0.45, 0.85], flower: 0.3, lift: 0.012, months: [5, 9], bloom: [6, 8],
    pad: 0x3d7a35, stem: 0x2c4f2a, petal: 0xf6f3ea, heart: 0xe8c23a },
};
export const RIVER_DRIFT = {
  speed: SWIM.current, // m/s downstream: the same water that carries a swimmer (the public version without swimming: 0.35, *guess*)
  path: { step: 1, smooth: 5 }, // the centre line resampled every `step` m with its corners rounded over +-`smooth` m (*guess*: a 90° bend is cut by ~1.7 m)
  pier: { clear: 0.3, bend: 3 }, // lanes pass a bridge pier `clear` m off its (askew) box, steering out over `bend` m up / downstream (*guess*)
  // On the surface (one mesh of flat quads, one draw call): `count` things within `range` m up / downstream of the camera's station, drawn
  // only while the camera is within `drawDist` m of the centre line. Lanes use `laneMax` of the channel's half width less `margin` m; things
  // fade over `fade` m at the window's ends and `endFade` m at the river's ends. Flecks: half-width `size` m (min, max), `stretch` x as long
  // along the flow, opacity `alpha` (min, max), lying `lift` m over the water. One in `leaf.share` is a leaf.
  surface: { count: 300, range: 48, drawDist: 75, laneMax: 0.82, margin: 0.4, fade: 8, endFade: 10, lift: 0.015,
    size: [0.035, 0.1], stretch: 1.7, alpha: [0.3, 0.8], color: 0xeef3ee,
    leaf: { share: 0.05, size: [0.06, 0.09], stretch: 1.6, alpha: 0.95, colors: [0x9a7a2e, 0x7d5a27, 0x6f7f35] } },
  // Under water (one Points object, one draw call, only while the eye is under the surface): `count` specks within `range` m (the dive's
  // fog ends at SWIM.dive.look.far), between `top` m under the surface and `bed` m over the bed; `size` m across, opacity `alpha` (min,
  // max); a share `silt` of them are dark specks instead of pale bubbles; `bob` m of slow up-and-down at `bobHz`.
  under: { count: 220, range: 9, laneMax: 0.9, margin: 0.25, fade: 2.5, endFade: 10, top: 0.06, bed: 0.25,
    size: 0.04, alpha: [0.4, 0.9], color: 0xdff0ea, silt: 0.3, siltColor: 0x6b6046, bob: 0.03, bobHz: 0.25, night: 0.25 },
};

// The garage under the courtyard and Hus L's basement (#357, #417, src/garage.js), per the våning −1 overview plan
// (plan brochure p. 46; docs/peab/garage-vaning-m1.jpg, measured on docs/peab/kalibrerad/vaning-m1-300dpi.png with the
// #253 transform x = (px − 1909.5) × 0.042356, z = (py − 1073) × 0.042356 — it fits Hus L's outline on this sheet:
// x −41.6 … 11.6, z 0 … 12.6). DRAWING = read off that plan (inner faces of the drawn walls, ±0.1 m); everything
// marked ASSUMPTION is ours (heights, stall sizes / count / numbers, column size, door widths, the förråd cages' split,
// the tubes). Rectangles are walkable floor (plan x/z); walls stand on every rectangle edge that does not touch another
// rectangle (garage.js), so a doorway is a small rectangle through the wall.
export const GARAGE = {
  floor: -3,          // = SITE.terrain.park: the drive is level with the door (#346)
  parkDoorMaterial: { color: 0x7d858b, roughness: .7 }, // *guess*: existing steel colour, daylight-lit park leaves (#729)
  // #1152: A/B exterior park doors are glazed per user; rail/pane sizes and tint are visual guesses, not surveyed.
  parkDoorGlass: { stile: .12, rail: .08, bottom: .16, thickness: .012, color: 0x9fb4bf, opacity: .35, roughness: .05, metalness: .3 },
  floorLift: .003, // existing visible floor offset, *guess*: shared by the park thresholds (#729)
  doorClearance: .25, // #523: assumed extra side clearance at actual basement doorways
  doorHead: 2.1, // ASSUMPTION: existing basement lintel height; shared with the A/B brick openings.
  // #977: Basement & garage door details and hardware (steel doors and storage cages).
  // Dimensions and offsets are visual assumptions (*guess*) based on Swedish standard commercial/basement
  // steel doors (Daloc / Robust) and wire mesh storage partitions (Troax).
  doorDetails: {
    frameWidth: 0.045,       // *guess*: steel frame casing width lining doorway opening
    frameCasingProud: 0.012, // *guess*: frame architrave casing proud of wall face
    thresholdHeight: 0.018,  // *guess*: low steel threshold height at floor
    leafThickness: 0.05,     // steel door leaf thickness (Daloc S30/S33)
    handleHeight: 1.05,      // standard Swedish door handle height
    handleBackset: 0.08,     // distance from strike edge to handle center
    escutcheon: [0.055, 0.22, 0.006], // [width, height, projection] satin steel backplate
    cylinder: [0.03, 0.012],         // [diameter, projection] lock cylinder / thumb turn housing
    lever: [0.125, 0.018, 0.018],    // [length, height, depth] L-shaped lever handle
    leverNeck: 0.035,                 // projection of handle neck from plate
    hinges: { count: 3, height: 0.09, positions: [0.25, 1.05, 1.85] },
    colors: {
      leaf: 0x7d858b,
      frame: 0x54585c,
      plate: 0xc8ccd0,
      lever: 0xdde0e4,
      cylinder: 0x36393c,
      hinge: 0x5a5f64,
    },
    cage: {
      haspPlate: [0.05, 0.14, 0.008],
      haspLoop: [0.02, 0.035, 0.035],
      pullHandle: [0.016, 0.13, 0.045],
      hinges: { count: 2, height: 0.08, positions: [0.35, 1.75] },
    },
  },
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
    { id: 'bikeNEDoor', x0: -15.45, x1: -14.55, z0: 7.5, z1: 7.79, room: 'Cykelförråd', area: 'basementE', door: {kind:'steel',hinge:'x0',open:-1,name:'dörren till östra cykelrummet'} },
    { id: 'forrad', x0: -10.78, x1: 11.12, z0: 0.47, z1: 7.5, room: 'Hyrförråd', area: 'basementE' }, // LGHFÖRRÅD: "15 extra lägenhetsförråd"
    { id: 'forradDoor', x0: -0.98, x1: -0.08, z0: 7.5, z1: 7.79, room: 'Hyrförråd', area: 'basementE', door: {kind:'steel',hinge:'x0',open:1,name:'dörren till hyrförråden'} },
    { id: 'garageDoorL', x0: -15.45, x1: -14.55, z0: 12.11, z1: 12.62, room: 'Garage', area: 'hallW', door: { kind: 'steel', hinge: 'x0', open: 1, name: 'dörren till källaren' } }, // from the basement out into the garage
    // Unlabelled utility cells have no inferred function; the drawing shows no UC access.
    {id:'roomCN',x0:-62.3,x1:-60.55,z0:13.05,z1:15.1,room:'Källarrum C',area:'entrance'},
    {id:'roomCNDoor',x0:-62.1,x1:-61.1,z0:15.1,z1:15.5,room:'Källarrum C',area:'entrance',door:{kind:'steel',hinge:'x0',open:-1,name:'dörren till nordligaste källarrummet C'}},
    {id:'roomCAnnexS',x0:-64.5,x1:-62.8,z0:17.25,z1:18.75,room:'Källarrum C',area:'entrance'},
    {id:'roomCAnnexSDoor',x0:-62.8,x1:-62.3,z0:17.5,z1:18.5,room:'Källarrum C',area:'entrance',door:{kind:'steel',hinge:'x0',open:-1,name:'dörren till källarrummets sidocell C'}},
    // #638: Hus B's stair core (CORE_B, src/corehouse.js) is the `core` rect: its band (hall + stair + lift) is drawn / walled there; the
    // thin rects are the openings in the hall's west wall (x −33.38 … −33.08) towards the passages (as Hus A's coreA*; re-read on vaning-m1)
    // #729 DRAWING: B's east corridor on p46, towards its exterior park door (±0.15 m).
    // The core-wall bridge is restricted to the flat landing north of stair.top; its 0.9 m clear width is *guess*.
    {id:'coreBPark',x0:-31.16,x1:-30.86,z0:46.1,z1:47.0,room:'Trapphus B',area:'hallW'},
    {id:'passageBEast',x0:-30.86,x1:-23.6,z0:46.1,z1:47.9,room:'Trapphus B',area:'hallW'},
    {id:'parkBRecess',x0:-23.52,x1:-22.6,z0:46.1,z1:48.1,room:'Trapphus B',area:'hallW',outside:'e'},
    {id:'parkBSide',x0:-23.6,x1:-23.52,z0:46.10,z1:46.80,room:'Trapphus B',area:'hallW'},
    {id:'parkBDoor',x0:-23.6,x1:-23.52,z0:46.8,z1:47.85,room:'Trapphus B',area:'hallW',door:{kind:'steel',hinge:'x0',open:1,line:-23.6,park:true,name:'källardörren till hus B'}},
    {id:'coreB',x0:-33.08,x1:-31.16,z0:41.74,z1:50,room:'Trapphus B',area:'hallW',core:true},
    {id:'coreBWest',x0:-33.6,x1:-33.08,z0:41.8,z1:43.4,room:'Trapphus B',area:'hallW'},
    {id:'coreBSouth',x0:-33.6,x1:-33.08,z0:44.9,z1:45.9,room:'Trapphus B',area:'hallW'},
    // #729 DRAWING: west corridor's wider end around the actual p46 leaf z42.25..43.30.
    // Existing recess setback, finish/head and outward swing are *guess*, not construction details.
    {id:'passageAWestEnd',x0:-9.05,x1:-6.8,z0:42.75,z1:44.1,room:'Trapphus A',area:'hallE'},
    {id:'passageAWestWing',x0:-6.8,x1:-1.37,z0:42.75,z1:43.4,room:'Trapphus A',area:'hallE'},
    {id:'parkARecess',x0:-9.76,x1:-9.12,z0:41.4,z1:43.4,room:'Trapphus A',area:'hallE',outside:'w'},
    {id:'parkASide',x0:-9.12,x1:-9.05,z0:41.46,z1:42.25,room:'Trapphus A',area:'hallE'},
    {id:'parkADoor',x0:-9.12,x1:-9.05,z0:42.25,z1:43.30,room:'Trapphus A',area:'hallE',door:{kind:'steel',hinge:'x0',open:-1,line:-9.01,park:true,name:'källardörren till hus A'}},
    {id:'passageAWest',x0:-9.05,x1:-1.37,z0:41.4,z1:42.75,room:'Trapphus A',area:'hallE'},
    // #637: Hus A's stair core (CORE_A, src/corehouse.js) is the `core` rect: its band (hall + stair) is drawn / walled there; the
    // thin rects are its openings on this storey (west towards the passage, east onto the lobby), as Hus L's coreW / coreE
    {id:'coreA',x0:-1.05,x1:.8,z0:37.3,z1:45.5,room:'Trapphus A',area:'hallE',core:true},
    {id:'coreAWest',x0:-1.37,x1:-1.05,z0:41.4,z1:42.75,room:'Trapphus A',area:'hallE'},
    {id:'coreAEast',x0:.8,x1:1.13,z0:37.3,z1:40.1,room:'Trapphus A',area:'hallE'},
    // #523: room interior faces and openings read from p46 (graphic accuracy about 0.15 m); see validation.
    {id: 'bikeFarNW',x0: -41.45,x1: -35.9,z0: 0.47,z1: 7.5,room: 'Cykelförråd',area: 'basementW'},
    {id: 'bikeFarNWDoor',x0: -40.72,x1: -39.65,z0: 7.5,z1: 7.79,room: 'Cykelförråd',area: 'basementW',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till västra cykelrummet'}},
    {id: 'bandFarW',x0: -41.45,x1: -35.6,z0: 7.79,z1: 12.11,room: 'Källarpassage',area: 'basementW'},
    {id: 'bikeStorageGap',x0: -11.08,x1: -10.78,z0: 3.2,z1: 4.8,room: 'Hyrförråd',area: 'basementE'},
    {id: 'hallCNiche',x0: -53.4,x1: -51.4,z0: 21.3,z1: 25,room: 'Garage',area: 'hallW'},
    // #639: Hus C's stair core (CORE_C, src/corehouse.js): the corridor (m1: inner faces x −62.32 … −60.42) is split into the part north of
    // the hall, the `core` rect (the hall + stair + lift lobby, z 20.12 … 30.54) and the dead end south of the stair's wall
    {id: 'passageCN',x0: -62.34,x1: -60.44,z0: 15.5,z1: 20.12,room: 'Trapphus C',area: 'entrance'},
    {id: 'coreC',x0: -62.34,x1: -60.44,z0: 20.12,z1: 30.54,room: 'Trapphus C',area: 'entrance',core: true},
    {id: 'coreCSouth',x0: -62.34,x1: -60.44,z0: 30.54,z1: 30.88,room: 'Trapphus C',area: 'entrance'}, // #654: the opening in the stair's south wall on −1 (CORE_C.lane)
    {id: 'passageCS',x0: -62.34,x1: -60.44,z0: 30.88,z1: 34.01,room: 'Trapphus C',area: 'entrance'},
    {id: 'entryC',x0: -62.1,x1: -61.1,z0: 34.01,z1: 34.52,room: 'Trapphus C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till trapphus C'}},
    {id: 'passageCE',x0: -60.44,x1: -53.9,z0: 23.44,z1: 24.6,room: 'Trapphus C',area: 'entrance'},
    {id: 'entryCE',x0: -53.9,x1: -53.4,z0: 23.4,z1: 24.4,room: 'Trapphus C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till hisshallen C'}},
    {id: 'storeCNW',x0: -69.9,x1: -64.8,z0: 17.25,z1: 24.3,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNWWing',x0: -64.8,x1: -62.8,z0: 19.05,z1: 22.95,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNWDoor',x0: -62.8,x1: -62.3,z0: 20.05,z1: 21.05,room: 'Förråd C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till förråd C väst'}},
    {id: 'roomCW',x0: -69.9,x1: -62.8,z0: 24.65,z1: 28.25,room: 'Källarrum C',area: 'entrance'},
    {id: 'roomCWDoor',x0: -62.8,x1: -62.3,z0: 24.9,z1: 25.9,room: 'Källarrum C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till källarrummet C'}},
    {id: 'roomCWJoin',x0: -67.85,x1: -66.85,z0: 24.3,z1: 24.65,room: 'Källarrum C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren mellan källarrummen C'}},
    {id: 'storeCNETop',x0: -60.2,x1: -51.95,z0: 13.05,z1: 16.95,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNEAlcove',x0: -60.2,x1: -58.55,z0: 16.95,z1: 19,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNE',x0: -58.55,x1: -51.95,z0: 17.25,z1: 21.1,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNEWing',x0: -60.2,x1: -57.65,z0: 19.35,z1: 23,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNEJoin',x0: -56.6,x1: -55.15,z0: 16.95,z1: 17.25,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCNETopDoor',x0: -60.55,x1: -60.2,z0: 15.6,z1: 16.6,room: 'Förråd C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd C norr'}},
    {id: 'storeCNEDoor',x0: -60.55,x1: -60.2,z0: 20.05,z1: 21.05,room: 'Förråd C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd C öst'}},
    {id: 'elC',x0: -57.35,x1: -53.55,z0: 21.4,z1: 23,room: 'Elrum C',area: 'entrance'},
    {id: 'elCDoor',x0: -56.1,x1: -55.1,z0: 23,z1: 23.3,room: 'Elrum C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till elrum C'}},
    {id: 'storeCSE',x0: -60.2,x1: -51.95,z0: 25,z1: 34.01,room: 'Förråd C',area: 'entrance'},
    {id: 'storeCSEDoor',x0: -54.7,x1: -53.7,z0: 24.6,z1: 25,room: 'Förråd C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd C söder'}},
    {id: 'storeCSEOutsideDoor',x0: -56.7,x1: -55.7,z0: 34.01,z1: 34.52,room: 'Förråd C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren från garaget till förråd C'}},
    {id: 'utilityC',x0: -69.9,x1: -64.8,z0: 13.05,z1: 16.95,room: 'Undercentral C',area: 'entrance'},
    {id: 'utilityCAnnex',x0: -64.5,x1: -62.8,z0: 13.05,z1: 16.95,room: 'Källarrum C',area: 'entrance'},
    {id: 'utilityCDoor',x0: -62.8,x1: -62.3,z0: 15.6,z1: 16.6,room: 'Källarrum C',area: 'entrance',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till norra källarrummet C'}},
    {id: 'entryB',x0: -34.5,x1: -33.45,z0: 33.16,z1: 33.7,room: 'Trapphus B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till trapphus B'}},
    {id: 'passageBN',x0: -34.8,x1: -32.4,z0: 33.7,z1: 38.45,room: 'Trapphus B',area: 'hallW'},
    {id: 'passageBMid',x0: -34.8,x1: -33.6,z0: 38.45,z1: 43.45,room: 'Trapphus B',area: 'hallW'},
    {id: 'passageBS',x0: -35.35,x1: -33.6,z0: 43.8,z1: 45.8,room: 'Trapphus B',area: 'hallW'},
    {id: 'passageBJoin',x0: -34.6,x1: -33.6,z0: 43.45,z1: 43.8,room: 'Trapphus B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till södra hisshallen B'}},
    {id: 'passageBEnd',x0: -35,x1: -33.6,z0: 45.8,z1: 47.55,room: 'Trapphus B',area: 'hallW'},
    {id: 'storeBNW',x0: -41.08,x1: -35.1,z0: 33.7,z1: 40.5,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBNWWing',x0: -37.6,x1: -35.1,z0: 40.5,z1: 43.45,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBNWDoor',x0: -35.1,x1: -34.8,z0: 37.05,z1: 38.05,room: 'Förråd B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till förråd B väst'}},
    {id: 'storeBNE',x0: -31.9,x1: -26.3,z0: 33.7,z1: 36.05,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBNEWing',x0: -31.9,x1: -28.35,z0: 36.05,z1: 38.45,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBNEDoor',x0: -32.4,x1: -31.9,z0: 35.35,z1: 36.35,room: 'Förråd B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd B öst'}},
    {id: 'elB',x0: -41.08,x1: -37.9,z0: 40.8,z1: 42.6,room: 'Elrum B',area: 'hallW'},
    {id: 'elBDoor',x0: -37.9,x1: -37.6,z0: 41.25,z1: 42.25,room: 'Elrum B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till elrum B'}},
    {id: 'storeBSW',x0: -41.08,x1: -35.75,z0: 43.8,z1: 47.55,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBSWWing',x0: -41.08,x1: -37.85,z0: 47.55,z1: 50.3,room: 'Förråd B',area: 'hallW'},
    {id: 'storeBSWDoor',x0: -35.75,x1: -35.35,z0: 44.55,z1: 45.55,room: 'Förråd B',area: 'hallW',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till förråd B söder'}},
    {id: 'entryA',x0: 1.3,x1: 2.35,z0: 28.76,z1: 29.3,room: 'Trapphus A',area: 'hallE',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till trapphus A'}},
    {id: 'passageAN',x0: 0.02,x1: 2.5,z0: 29.3,z1: 34,room: 'Trapphus A',area: 'hallE'}, // #637: re-read on vaning-m1 — the corridor ends at the lift shaft's north wall (z 34)
    {id: 'passageAMid',x0: 1.13,x1: 2.5,z0: 34,z1: 37.3,room: 'Trapphus A',area: 'hallE'}, // … beside the shaft (its east wall x 0.8 … 1.13)
    {id: 'passageAS',x0: 1.13,x1: 2.5,z0: 37.3,z1: 41,room: 'Trapphus A',area: 'hallE'}, // … and in front of the lift's lobby / the förråd's door; the band's opening east is coreAEast
    {id: 'storeANW',x0: -9.05,x1: -0.25,z0: 29.3,z1: 33.15,room: 'Förråd A',area: 'hallE'},
    {id: 'storeANWWing',x0: -3.55,x1: -1.4,z0: 33.15,z1: 35.35,room: 'Förråd A',area: 'hallE'},
    {id: 'storeANWInner',x0: -1.4,x1: -0.25,z0: 33.15,z1: 34.2,room: 'Förråd A',area: 'hallE'},
    {id: 'storeANWDoor',x0: -0.25,x1: 0.05,z0: 31.95,z1: 32.95,room: 'Förråd A',area: 'hallE',door: {kind: 'steel',hinge: 'x0',open: -1,name: 'dörren till förråd A väst'}},
    {id: 'storeANE',x0: 2.85,x1: 8.9,z0: 29.3,z1: 35.65,room: 'Förråd A',area: 'hallE'},
    {id: 'storeANEWing',x0: 2.85,x1: 5.35,z0: 35.65,z1: 38.4,room: 'Förråd A',area: 'hallE'},
    {id: 'storeANEDoor',x0: 2.5,x1: 2.85,z0: 32.9,z1: 33.9,room: 'Förråd A',area: 'hallE',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd A öst'}},
    {id: 'elA',x0: 5.7,x1: 8.9,z0: 35.95,z1: 37.8,room: 'Elrum A',area: 'hallE'},
    {id: 'elADoor',x0: 5.35,x1: 5.7,z0: 36.3,z1: 37.3,room: 'Elrum A',area: 'hallE',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till elrum A'}},
    {id: 'storeASE',x0: 2.9,x1: 8.9,z0: 38.8,z1: 43.2,room: 'Förråd A',area: 'hallE'},
    {id: 'storeASEWing',x0: 5.15,x1: 8.9,z0: 43.2,z1: 45.65,room: 'Förråd A',area: 'hallE'},
    {id: 'storeASEDoor',x0: 2.5,x1: 2.9,z0: 39.6,z1: 40.6,room: 'Förråd A',area: 'hallE',door: {kind: 'steel',hinge: 'x0',open: 1,name: 'dörren till förråd A söder'}},
  ],
  // DRAWING: free-standing / partial walls inside the rectangles [x0, x1, z0, z1]: the förråd room's partitions and the
  // bike rooms' half walls (z 3.2 … 4.8 open between them); the core's lift shaft south of the lobby
  partials: [[-30.35, -30.05, 0.47, 3.2], [-30.35, -30.05, 4.8, 7.5], [-24.8, -24.46, 2.67, 3.2], [-24.8, -24.46, 4.8, 7.5],
    [-5.53, -5.23, 0.47, 3.2], [-5.53, -5.23, 4.8, 7.5], [0.02, 0.32, 0.47, 3.2], [0.02, 0.32, 4.8, 7.5], [5.57, 5.87, 0.47, 3.2], [5.57, 5.87, 4.8, 7.5],
    [-38.45,-38.15,8.9,12.11],[-35.9,-35.6,8.9,12.11],[-30.35,-30.05,9.4,12.11],[-24.8,-24.46,9.4,12.11],
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
  // #523: racks only in the dedicated CYKEL rooms shown on p46; no inferred racks in car-parking areas.
  // Rack depth/spacing/bike occupancy are visual assumptions; the existing room-side rows follow the drawing
  // along their walls (the plan draws racks there): [x0, x1, z, facing ±1 (towards +z / −z)]
  // #704: a rack's bikes and stalls are drawn in full (bikeGeometry(1), ~1 400 triangles a bike) within `bikeLodNear` m of the camera,
  // beyond it as the coarse set (bikeGeometry(0), ~480): the racks' ~110 k triangles in the big hall's view were over budget. *guess*
  bikeLodNear: 10, bikeLodFade: 4, // #1988: guessed 4 m dither zone centred on near + row radius
  rideableBikeRows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  bikes: [[-41.15,-36.2,.95,1], [-29.75,-25.1,11.6,-1], [-10.6, -5.8, 11.6, -1],
    [-5.0, -0.2, 11.6, -1], [0.55, 5.3, 11.6, -1], [6.1, 10.8, 11.6, -1],  [-29.8, -25.1, 0.95, 1],[-29.8,-27.9,7,-1],[-26.6,-25.1,7,-1], [-24.2, -19.6, 7.0, -1],
    [-16.0, -11.4, 0.95, 1]],
  // DRAWING: the 15 extra rental förråd (LGHFÖRRÅD) in Hus L's north-east room, four bays between its partitions with a passage
  // through them (z 3.2 … 4.8); ASSUMPTION: two wire-mesh cages per bay each side of it, but one where the room's door
  // comes in, a door `door` m wide in each cage's front, opening into the passage up to `max` rad. `ours` (L1007).
  storage: { bays: [[-10.78, -5.53], [-5.23, 0.02], [0.32, 5.57], [5.87, 11.12]], north: [0.47, 3.2], south: [4.8, 7.5], skipSouth: 1,
    door: 0.9, max: 1.5, speed: 3, ours: 7, seed: 41,
    // #523: illustrative cage subdivisions in ordinary storage rooms, NOT a surveyed count or allocation.
    // x0,x1,z0,z1,front,count,room id,building; room boundaries above follow p46. Legacy L rental cages stay first.
    ordinary: [
      [-69.6,-65.1,17.6,19.5,'s',2,'storeCNW','C'],[-59.9,-52.3,13.4,15.2,'s',3,'storeCNETop','C'],
      [-58.2,-52.3,19.1,20.7,'n',2,'storeCNE','C'],[-59.9,-55.4,25.3,27.4,'s',2,'storeCSE','C'],
      [-40.8,-36,34,36.1,'s',2,'storeBNW','B'],[-31.6,-26.6,34,35.7,'s',2,'storeBNE','B'],
      [-40.8,-37.4,44.1,45.7,'s',2,'storeBSW','B'],[-8.8,-.55,29.6,31.4,'s',3,'storeANW','A'],
      [3.2,8.6,29.6,31.4,'s',2,'storeANE','A'],[5.45,8.6,43.7,45.35,'n',2,'storeASEWing','A'],
    ] },
    // #523: C/B/A storage and lobby doors above replace the old unsupported wall-mounted dummy doors.
  fakeDoors: [],
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
      [-15, 6.9, 'n'], [-5.4, 4.0], [5.7, 4.0],[-39,5],[-61.45,23.8],[-61.45,30],[-34,37],[-33.8,44.5],[1.3,33],[1.8,39.5]],
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
// the doors' leaves, the lift's car, speed and doors, the lights. #520 models the wider portik interior and its small room.
// #520: scale-calibrated interior faces from printed p.47 (unlabelled spaces, not verified functions).
// Mouths retain HUS_L.core.portik; the passage widens to the east and joins the existing stair screen.
export const PORTIK = {
  west: -16.12, east: -11.37, north: .55, south: 11.77,
  room: { west: -13.3, east: -11.37, north: 7.85, south: 11.6, wallWest: -13.8, wallNorth: 7.35 },
  door: { x: -13.55, z0: 9.5, z1: 10.55, height: DOOR_HEIGHT, color: 0x6d5a45 },
};
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
  flatDoors: [[2, 6.73, 7.74, 'L1101'], [3, 6.29, 7.3, 'L1205']],
  // the flats' door parts (#626, core.js buildFlatDoors; metres, depth `proud` = from the wall face, all *guess*: no
  // door drawing from Peab): leaf 2.1 m, a 7 cm wide architrave 2.2 cm proud, a name plate as ours (NAME_PLATE size, 0.95 m up)
  // and a 15 cm number sign beside the door; the plate and the sign carry the flat's number only
  flatDoorParts: { height: 2.1, leaf: 0.012, proud: 0.022, frame: 0.07, plate: [0.14, 0.035, 0.95], sign: 0.15,
    leafColor: 0x7a6248, panelColor: 0x8d7456, frameColor: 0xf0eee8, steel: 0xb8bcbf, brass: 0xc9a650, dark: 0x1b1c1d },
  // street-façade window on våning 1 and 2 (#457, DRAWING overview plans pp. 47–48): x ≈ −18.55 … −17.15;
  // sill and head heights are an ASSUMPTION
  window: { x: [-18.55, -17.15], sill: 0.8, head: 2.4 },
  // rescue: m/s the car creeps down to the stop below in a power cut (#612, battery rescue drive; *guess*)
  lift: { x0: -18.95, x1: -17.44, z0: 9.78, z1: 12.28, door: [-18.84, -17.94], speed: 1.0, accel: 0.6, doorTime: 1.4, wait: 6, rescue: 0.25,
    floors: ['−1', '1', '2', '3'] }, // the stops' names, bottom first (våning −1 = the garage's basement, 1–3 the storeys; #640)
  light: { hold: 60 },
};

// The lifts' panel, mirror, indicators (#640, src/liftpanel.js; shared by every house's lift). Peab's material gives no
// button, plate, display or mirror sizes: ALL of these are *guess*es from ordinary residential lift fittings.
export const LIFT_PANEL = {
  pxPerM: 640, radius: 0.034, pitch: 0.15, firstY: 1.0, carPlateW: 0.17, carZ: 0.45, // the car's button column (east wall)
  callPlateW: 0.11, callPitch: 0.12, callY: 1.1,                                     // beside each landing door
  indW: 0.5, indCarY: 2.17, indLandingY: 2.2, digit: '#ff7a1a',                      // floor indicators (over the doors)
  mirrorInset: 0.2, mirrorBottom: 1.05, mirrorTop: 2.0,                              // back wall, above the handrail (y 0.95)
  pressMs: 220, darkPlate: 0.3,                                                      // pressed look; plates in a power cut
};

// The flats' doors' entrance cell and the number atlas' scale (Hus A's, B's and C's cores; see CORE_A and the comment before CORE_B).
const HOUSE_FLAT_DOORS = { cell: { depth: 1.3, height: 2.5 }, scale: 0.5 };

// Hus A's stair core (#637; since #652 CORE_A is data for src/corehouse.js like CORE_B / CORE_C, the former src/corea.js is gone): the stairwell and the lift from the basement (våning −1, y −3) up to våning 4
// (y 9), five stops; the main entrance from the courtyard (SITE.blocks 'Hus A' recess, våning 1) and the garage's door
// 'entryA' lead in. DRAWING: read off the calibrated overview plans docs/peab/kalibrerad/vaning-m1 … 4-300dpi.png (the
// #253 transform x = (px − 1909.5) × 0.042356, z = (py − 1073) × 0.042356, ±0.15 m; all five sheets share one frame at
// Hus A): the stair hall is a band x −1.05 … 0.80 (inner faces) running south from the lift's front wall (z 37.3) to the
// stair's south wall (z 45.5), the same on every storey; the lift shaft lies north of it (the car x −0.40 … 0.80, z 34.5
// … 37.0, its door in the south wall, a counterweight strip west of the car walled off); the stair is two flights side by
// side (x −1.05 … −0.19 and −0.09 … 0.80, a stringer between) from the hall's south edge z 42.84, turning at winders
// over the south end; on våning 1 and −1 the lobby from the entrance door (z 30.9 = the recess's back wall) runs south
// east of the shaft and joins the band (the plan: x 0.22 … 2.5 north of the shaft, 1.13 … 2.5 beside it, z 37.3 … 38.9
// in front of the lift). On −1 the band's west wall has the opening towards the west passage (GARAGE passageAWest, to
// Hus A's park-level door) and its east wall the opening onto the lobby / the förråd corridor.
// ASSUMPTION / *guess* (the sheets draw no sections or details): every height (SITE.storey 3.0 per storey, the slabs
// 0.25, the doors 2.1 m, the guards 1.1 m), the winders' count (#644: drawn as fans over the stair's south end, modelled as 7 winders after 4 straight treads
// in each flight: 16 equal risers of 0.1875 m, the straight treads 0.25 m deep; the fan's rays are equal shares of the walls' outline), the lift car, speed and doors,
// the entrance door's size (the plan's swing is 0.7 m; 0.85 m used: x 1.37 … 2.22, hinged east, opening out into the
// recess) with its fixed sidelight west of it, the flats' doors' sizes and numbers (#643, `flatDoors`), the lights. #643: the plans'
// door arcs across the hall at z 37.3 … 38.2 and 40.3 … 41.1 are NOT fire doors (the issue guessed so) but the flats' own doors
// (each arc's radius = the 0.85 m leaf, its centre = the hinge on the wall, the leaf swinging into the hall), one pair per
// storey; plus the single door in the cross wall at z ≈ 41.3. NOT modelled: the flats behind the doors.
// #652: the cross wall, the lobby, the shaft and the hall's side walls are `walls` (thin: true = a plane of no thickness, as the old corea.js drew them;
// the lift's front wall and the entrance wall are boxes); the flats' doors: `leaf` holes (#643) with `flats` = the flat per storey (stops index 1–4):
// [z0, z1] ±0.15 m read off the plans, hinge 'n' | 's' (which jamb; the leaf swings into the hall), 2.1 m high (*guess*). #649: the east side's north
// door is hinged SOUTH (*guess*) so an open leaf lies across the hall at z 38.2, not along the lift's front wall (z 37.3) over its doors. The flat
// numbers: Peab's planritningsbroschyr numbers Hus A's flats A1001–A1004 (våning 1), A1101–A1104, A1201–…, A1301–… and its key plan puts them in this
// order (north-west, north-east / south-west, south-east of the hall: A1102 A1103 / A1101 A1104; våning 1: A1004 A1001 / A1003 A1002) — which flat is
// behind which door is read off that key plan's text order, a *guess*. Behind each door a 1.3 m deep entrance cell (HOUSE_FLAT_DOORS, *guess*, 2.5 m
// high, dark) you cannot enter: the flats are not modelled. #643: the single door in the cross wall at z ≈ 41.45 (våning 1–4; the plans: a 0.85 m
// leaf hinged at its west end, swinging south towards the stair; the wall east of it is solid): `plain` (no number, sign or cell, no doorway collision).
const A_BLOCK = SITE.blocks.find((b) => b.name === 'Hus A'), A_Z = A_BLOCK.z0 + A_BLOCK.recesses.find((r) => r.face === 'n' && r.door != null).depth; // the recess's back wall (the entrance door's line)
export const CORE_A = {
  house: 'Hus A',
  stops: [-3, 0, 3, 6, 9],                 // våning −1, 1, 2, 3, 4 = SITE.blocks 'Hus A' base + n × SITE.storey (*guess*: equal storeys)
  labels: ['−1', '1', '2', '3', '4'],
  slab: 0.25, ceilingTop: 2.7,             // *guess*: the slab thickness; the top storey's clear height
  band: { x0: -1.05, x1: 0.80, z0: 37.3, z1: 45.5 },
  // #644: winders. `top` = the hall's edge, `run` = z of the stringer's south end (the winders' pivot), `risers` per storey in one run
  // (16 of 0.1875 m: the plans show the straight treads ≈ 0.25 m deep, `straight` of them in each flight, the rest winders round the
  // pivot: 7 = a rectangle each beside the stringer + 5 fan-shaped over the south end, the plan draws ~8 rays: the counts are a *guess*)
  stair: { top: 42.84, run: 44.6, well: [-0.19, -0.09], risers: 16, straight: 4, tread: 0.25, guard: 1.1 },
  car: { x0: -0.40, x1: 0.80, z0: 34.5, z1: 37.0 },   // the shaft north of the hall: the car; a counterweight strip west of it is walled off. `front` = the car's door face (the wall is 0.3 thick south of it)
  lift: { side: 's', front: 37.0, wall: 37.3, door: [-0.25, 0.65], speed: 1.0, accel: 0.6, doorTime: 1.4, wait: 6, rescue: 0.25 },
  flatDoors: HOUSE_FLAT_DOORS,
  hallLights: 1,                            // one lamp per storey over the hall (B / C: one every ~3.4 m)
  walls: [
    // the hall's west wall: on −1 the opening towards the west passage (garage rect 'coreAWest', 2.1 m high *guess*), the flats' doors on 1–4
    { ax: 'x', t: [-1.05, -1.05], a: [37.3, 45.5], s: [0, 4], thin: true, holes: [
      { a: [41.4, 42.75], h: 2.1, s: [0, 0] },
      { a: [37.35, 38.2], h: 2.1, s: [1, 4], leaf: true, hinge: 'n', flats: [null, 'A1004', 'A1102', 'A1202', 'A1302'] },
      { a: [40.28, 41.1], h: 2.1, s: [1, 4], leaf: true, hinge: 's', flats: [null, 'A1003', 'A1101', 'A1201', 'A1301'] }] },
    // … the east wall: on −1 the opening onto the lobby / the förråd corridor (garage rect 'coreAEast'), on 1 into the lobby in front of the lift (2.3 m), the flats' doors
    { ax: 'x', t: [0.80, 0.80], a: [37.3, 45.5], s: [0, 4], thin: true, holes: [
      { a: [37.3, 40.1], h: 2.1, s: [0, 0] }, { a: [37.3, 38.9], h: 2.3, s: [1, 1] },
      { a: [37.35, 38.2], h: 2.1, s: [2, 4], leaf: true, hinge: 's', flats: [null, null, 'A1103', 'A1203', 'A1303'] },
      { a: [40.28, 41.1], h: 2.1, s: [1, 4], leaf: true, hinge: 's', flats: [null, 'A1002', 'A1104', 'A1204', 'A1304'] }] },
    { ax: 'z', t: [45.5, 45.5], a: [-1.05, 0.80], s: [0, 4], thin: true },                                              // the stair's south wall
    { ax: 'z', t: [37.0, 37.3], a: [-1.05, 0.80], s: [0, 4], holes: [{ a: [-0.25, 0.65], h: 2.1 }] },                   // the lift's front wall (0.3 thick): a doorway at every stop
    { ax: 'x', t: [-0.40, -0.40], a: [34.5, 37.0], s: [0, 4], thin: true }, { ax: 'x', t: [0.80, 0.80], a: [34.5, 37.0], s: [0, 4], thin: true },   // the shaft's walls
    { ax: 'z', t: [34.5, 34.5], a: [-0.40, 0.80], s: [0, 4], thin: true },
    { ax: 'z', t: [41.45, 41.45], a: [-1.05, 0.80], s: [1, 4], thin: true, holes: [{ a: [-0.90, -0.05], h: 2.1, leaf: true, plain: true, hinge: 'w', into: true }] }, // the cross wall
    // våning 1's lobby (the basement's is the garage's rects): the west wall, the shaft's north and east faces, the east wall, the lift lobby's south wall and the shaft's corner
    { ax: 'x', t: [0.22, 0.22], a: [A_Z, 34.0], s: [1, 1], thin: true }, { ax: 'z', t: [34.0, 34.0], a: [0.22, 1.13], s: [1, 1], thin: true },
    { ax: 'x', t: [1.13, 1.13], a: [34.0, 37.3], s: [1, 1], thin: true }, { ax: 'x', t: [2.50, 2.50], a: [A_Z, 38.9], s: [1, 1], thin: true },
    { ax: 'z', t: [38.9, 38.9], a: [0.80, 2.50], s: [1, 1], thin: true }, { ax: 'z', t: [37.3, 37.3], a: [0.80, 1.13], s: [1, 1], thin: true },
    // the entrance wall: the door's opening (x 1.37 … 2.22) and the fixed sidelight west of it (x 0.28 … 1.32, its frame's post up to the door: 1.37), the solid rest
    { ax: 'z', t: [A_Z - 0.06, A_Z + 0.06], a: [0.22, 2.50], s: [1, 1], holes: [{ a: [1.37, 2.22], h: 2.2 }, { a: [0.28, 1.37], h: 2.2, glass: true }] },
  ],
  // the lobby (våning 1): north part, the strip beside the shaft, the lift lobby
  floors: [{ r: [0.22, 2.50, A_Z - 0.06, 34.0], s: 1 }, { r: [1.13, 2.50, 34.0, 37.3], s: 1 }, { r: [0.80, 2.50, 37.3, 38.9], s: 1 }],
  cap: [-0.40, 0.80, 34.2, 37.3],           // the shaft's top
  // the entrance door in the recess's back wall (the door's size: the plan's swing is 0.7 m; 0.85 m used: hinged east, opening out into the recess)
  entrance: { face: 'n', line: A_Z, door: [1.37, 2.22], side: [0.28, 1.32], height: 2.2, hinge: 'hi', name: 'porten till trapphus A' },
  numbers: { x: -1.05, z: 39.2, dir: 1 },   // the floor number plates on the hall's west wall by the lift (facing east)
  lights: [[1.35, 32.4], [1.8, 35.6], [1.6, 38.2]], // the lobby's lamps [x, z]
};

// #653: Hus B's and Hus C's flats' doors in the halls open like Hus A's (CORE_A.flatDoors, #643): a leaf swinging into the hall (hinge at the
// jamb the plans draw: the north doors 'n', the south doors 's' — read off the arcs of docs/peab/kalibrerad/vaning-1 / -2, as A's), an
// entrance cell behind each that you cannot enter (the doorway stops you), the flat's number on a plate and a sign. `leaf` holes of CORE_B / CORE_C
// carry `hinge` and `flats` (the number per stop index, null = no door there). All sizes *guess* (as A's); which number is behind which
// door is read off the brochure's key plan (planritningsbroschyr p. 'Översiktsplaner': B våning 1: B1004 B1001 / B1003 B1002, våning 2 / 3: B1102
// B1103 / B1101 B1104 resp. B1202 B1203 / B1201 B1204; C våning 1: C1003 C1004 / C1002 C1001 (+ C1005 in the middle), våning 2–5: C1102 C1103 /
// C1101 C1105 (+ C1104), the same for 13xx, 14xx: north-west, north-east / south-west, south-east of the hall) — a *guess* which flat is which door.
// C's fifth flat per storey (C1005 / C1104 …) has its door in the hall's north end (#656, a `leaf` hole in a wall along x: `hinge` 'w' | 'e', `into` =
// swings away from the hall); the north-east flat's door sits at z 22.05 … 22.9 on våning 2–5 (#656).

// Hus B's and Hus C's stair cores (#638, #639, src/corehouse.js): the same kind of walkable stairwell + lift as Hus A's
// (CORE_A), described as data. `walls` are thick wall runs: { ax: 'x' = a wall along z (x range `t`, z range `a`) | 'z' = along x
// (z range `t`, x range `a`), s: [first, last] stop index, holes: [{ a: [from, to], h, s?: stops, leaf?: a flat's door (openable, #653: `hinge` 'n' | 's', `flats` the number per stop),
// glass?: a fixed pane }] (a hole without leaf / glass is an opening) }; `floors` are the våning-1 lobby's rects [x0, x1, z0, z1]
// (a floor on stop `s`, its ceiling under stop s + 1). DRAWING: read off the calibrated overview plans
// docs/peab/kalibrerad/vaning-m1 … 4-300dpi.png (the #253 transform x = (px − 1909.5) × 0.042356, z = (py − 1073) × 0.042356,
// ±0.15 m; wall faces measured by scanning the sheets along lines). ASSUMPTION / *guess*, as for CORE_A: every height
// (SITE.storey 3.0 per storey, slab 0.25, doors 2.1 m, the entrance door 2.2 m, the guards 1.1 m), the winders' count and widths (drawn as fans: 16 equal risers of 0.1875 m per storey in one run, 4 straight
// treads of 0.28 m in each flight and 7 winders, as CORE_A's #644), the lift cars' size, speed and doors, the entrance
// door's size and swing (opens out into the recess, hinged at its `hinge` end), the flats' doors (#653: they open like Hus A's, see
// HOUSE_FLAT_DOORS), the lights, and the walls' thickness where the plans draw a double line. NOT modelled (follow-up issues): the interior
// fire doors across the halls, the flats behind the doors.
//
// Hus B (våning −1, 1, 2, 3 = y −3, 0, 3, 6; the entrance recess in the north face, mirrored: west of the middle): the stair hall
// band x −33.08 … −31.16 from the lift's south wall (z 41.74) to the stair's south wall (z 50.0), the lift north of it (car
// 1.76 × 2.42, door south, off-centre towards the east wall), two flights side by side from z 47.0 with winders round the stringer's end (z 49.05).
// On våning 1 the lobby from the entrance (z 35.4 = the recess's back wall) is 2.28 m wide (x −34.78 … −32.50, Hus A's lobby mirrored: x' = −32.28 − x;
// the plan's free width is 2.12 m + a 0.38 m recess in the east wall, #727) down to the shaft's north face (z 38.34), then runs south along the shaft's
// west side (x −34.78 … −33.38) and opens into the hall at z 41.74 … 42.62. On −1 the hall's west wall has two openings towards the passages (garage rects
// `coreBWest` / `coreBSouth`, GARAGE).
export const CORE_B = {
  house: 'Hus B',
  stops: [-3, 0, 3, 6],                 // våning −1, 1, 2, 3 = SITE.blocks 'Hus B' base + n × SITE.storey (*guess*: equal storeys)
  labels: ['−1', '1', '2', '3'],
  slab: 0.25, ceilingTop: 2.7,          // *guess*: the slab thickness; the top storey's clear height
  band: { x0: -33.08, x1: -31.16, z0: 41.74, z1: 50.0 },
  stair: { top: 47.0, run: 49.05, well: [-32.17, -32.07], risers: 16, straight: 4, tread: 0.28, guard: 1.1 }, // as CORE_A's (#644): `run` = the stringer's south end, the winders' pivot
  car: { x0: -33.0, x1: -31.24, z0: 39.02, z1: 41.44 },                              // the car (*guess*: the plan draws the shaft 1.9 × 2.4)
  lift: { side: 's', front: 41.44, wall: 41.74, door: [-32.35, -31.3], speed: 1.0, accel: 0.6, doorTime: 1.4, wait: 6, rescue: 0.25 },
  flatDoors: HOUSE_FLAT_DOORS,
  walls: [
    // the west wall of the hall and the shaft (x −33.38 … −33.08), with the flats' doors, the openings on −1 and into the lobby on 1
    { ax: 'x', t: [-33.38, -33.08], a: [38.34, 50.4], s: [0, 3], holes: [
      { a: [41.8, 43.4], h: 2.1, s: [0, 0] }, { a: [44.9, 45.9], h: 2.1, s: [0, 0] },   // −1: to the passages
      { a: [41.74, 42.62], h: 2.1, s: [1, 1] },                                         // 1: into the lobby
      { a: [42.15, 43.05], h: 2.1, s: [2, 3], leaf: true, hinge: 'n', flats: [null, null, 'B1102', 'B1202'] },
      { a: [44.75, 45.65], h: 2.1, s: [1, 3], leaf: true, hinge: 's', flats: [null, 'B1003', 'B1101', 'B1201'] }] },
    { ax: 'x', t: [-31.16, -30.86], a: [38.34, 50.4], s: [0, 3], holes: [
      { a: [46.1, 47.0], h: 2.1, s: [0, 0] }, // #729: park corridor, flat basement landing; width *guess* within p46 hall
      { a: [42.15, 43.05], h: 2.1, s: [1, 3], leaf: true, hinge: 'n', flats: [null, 'B1001', 'B1103', 'B1203'] },
      { a: [44.75, 45.65], h: 2.1, s: [1, 3], leaf: true, hinge: 's', flats: [null, 'B1002', 'B1104', 'B1204'] }] },
    { ax: 'z', t: [38.34, 39.02], a: [-33.08, -31.16], s: [0, 3] },                       // the shaft's north wall
    { ax: 'z', t: [41.44, 41.74], a: [-33.08, -31.16], s: [0, 3], holes: [{ a: [-32.35, -31.3], h: 2.1 }] }, // its front wall: a doorway at every stop
    { ax: 'z', t: [50.0, 50.4], a: [-33.38, -30.86], s: [0, 3] },                         // the stair's south wall
    // våning 1's lobby: west wall (a flat's door), the entrance wall (the door's opening), east wall north of the shaft, south wall
    { ax: 'x', t: [-35.08, -34.78], a: [35.4, 43.9], s: [1, 1], holes: [{ a: [42.45, 43.35], h: 2.1, leaf: true, hinge: 's', flats: [null, 'B1004'] }] },
    // #727: like Hus A's (mirrored): the door (x −34.50 … −33.60, hinged at its west end) + the fixed sidelight east of it (−33.60 … −32.56), solid piers each side
    { ax: 'z', t: [35.34, 35.46], a: [-34.78, -32.50], s: [1, 1], holes: [{ a: [-34.50, -33.60], h: 2.2 }, { a: [-33.60, -32.56], h: 2.2, glass: true }] },
    { ax: 'x', t: [-32.50, -32.50], a: [35.4, 38.34], s: [1, 1], thin: true },     // #727: the lobby's east wall north of the shaft (A's x 2.50, mirrored)
    { ax: 'z', t: [43.56, 43.9], a: [-35.08, -33.38], s: [1, 1] },
  ],
  floors: [{ r: [-34.78, -33.08, 35.4, 43.56], s: 1 }, { r: [-33.08, -32.50, 35.4, 38.34], s: 1 }],
  cap: [-33.38, -30.86, 38.34, 41.74],          // the shaft's top (over the walls round the car)
  entrance: { face: 'n', line: 35.4, door: [-34.50, -33.60], side: [-33.60, -32.56], height: 2.2, hinge: 'lo', name: 'porten till trapphus B' }, // #727: the plan: ONE door (swing 0.93 m, hinged west) + a fixed glazed sidelight, as Hus A's mirrored (x' = −32.28 − x); `cut` = the whole recess
  numbers: { x: -31.16, z: 44.0, dir: -1 },     // the floor number plates on the east wall (facing west)
  lights: [[-33.6, 36.9], [-34.1, 40.3], [-34.0, 42.8]], // the lobby's lamps [x, z] (the first over the wider part, #727)
};

// Hus C (våning −1, 1 … 5 = y −3, 0, 3, 6, 9, 12; the entrance recess in the east face, våning 1 = the courtyard's level): the stair hall
// band x −62.34 … −60.44 running north–south from z 20.12 (the hall's north wall; on −1 the garage corridor goes on north) to
// the stair's south wall (z 30.54); the stair (two flights side by side from z 27.75, winders round the stringer's end z 29.7) at its south end, the
// lift WEST of the hall (car x −64.98 … −62.90, z 23.45 … 24.8, door east through the 0.56 m front wall x −62.90 … −62.34). On
// våning 1 the lobby from the entrance door (x −53.4, the recess's back wall: a door z 23.15 … 24.05 with a fixed pane z 22.3 … 23.1 beside
// it) runs west (x −57.54 … −53.34, z 21.5 … 24.92, then the strip z 23.44 … 24.92 to the hall's east wall, whose opening is z 23.44 … 24.92).
// On −1 the same opening (z 23.44 … 24.6) leads east to the steel door 'entryCE' (hisshallen C) and the hall's north end is open to the
// corridor north (garage rect `passageCN`); the south end opens through the stair's south wall (garage rect `coreCSouth`) to `passageCS` and the
// steel door 'entryC' (#654: the −1 flight sits in the east half, see `lane`, the west half is the lane). The entrance (the courtyard's level, y 0) and the garage hall (y −3) differ by one storey: the stair and the lift.
export const CORE_C = {
  house: 'Hus C',
  stops: [-3, 0, 3, 6, 9, 12],            // våning −1, 1 … 5 = SITE.blocks 'Hus C' base 0 + n × SITE.storey; −1 = GARAGE.floor (*guess*: equal storeys)
  labels: ['−1', '1', '2', '3', '4', '5'],
  slab: 0.25, ceilingTop: 2.7,
  band: { x0: -62.34, x1: -60.44, z0: 20.12, z1: 30.54 },
  stair: { top: 27.75, run: 29.7, well: [-61.44, -61.34], risers: 16, straight: 4, tread: 0.28, guard: 1.1 },
  car: { x0: -64.98, x1: -62.90, z0: 23.45, z1: 24.8 },
  lift: { side: 'e', front: -62.9, wall: -62.34, door: [23.7, 24.75], speed: 1.0, accel: 0.6, doorTime: 1.4, wait: 6, rescue: 0.25 },
  flatDoors: HOUSE_FLAT_DOORS,
  walls: [
    { ax: 'x', t: [-62.64, -62.34], a: [19.82, 22.9], s: [0, 5], holes: [{ a: [20.2, 21.0], h: 2.1, s: [1, 5], leaf: true, hinge: 'n', flats: [null, 'C1003', 'C1102', 'C1202', 'C1302', 'C1402'] }] },  // the hall's west wall north of the lift
    { ax: 'x', t: [-62.9, -62.34], a: [22.9, 25.3], s: [0, 5], holes: [{ a: [23.7, 24.75], h: 2.1 }] },                            // the lift's front wall: a doorway at every stop
    { ax: 'z', t: [22.9, 23.45], a: [-65.32, -62.9], s: [0, 5] }, { ax: 'z', t: [24.8, 25.3], a: [-65.32, -62.9], s: [0, 5] },   // the shaft's north and south walls
    { ax: 'x', t: [-65.32, -64.98], a: [22.9, 25.3], s: [0, 5] },                                                                    // … and west wall
    { ax: 'x', t: [-62.64, -62.34], a: [25.3, 30.88], s: [0, 5], holes: [{ a: [25.5, 26.4], h: 2.1, s: [1, 5], leaf: true, hinge: 's', flats: [null, 'C1002', 'C1101', 'C1201', 'C1301', 'C1401'] }] },  // west wall south of the lift
    { ax: 'x', t: [-60.44, -60.14], a: [19.82, 30.88], s: [0, 5], holes: [
      { a: [23.44, 24.6], h: 2.1, s: [0, 0] }, { a: [23.44, 24.92], h: 2.1, s: [1, 1] },                                     // −1: to the steel door, 1: into the lobby
      { a: [20.2, 21.0], h: 2.1, s: [1, 1], leaf: true, hinge: 'n', flats: [null, 'C1004'] },
      // #656: on våning 2–5 the north-east flat's door is at z 22.05 … 22.9 (vaning-2 … 4-300dpi.png; våning 5: no calibrated sheet, the same as 4, *guess*), hinged at its south end
      { a: [22.05, 22.9], h: 2.1, s: [2, 5], leaf: true, hinge: 's', flats: [null, null, 'C1103', 'C1203', 'C1303', 'C1403'] },
      { a: [25.5, 26.4], h: 2.1, s: [1, 5], leaf: true, hinge: 's', flats: [null, 'C1001', 'C1105', 'C1205', 'C1305', 'C1405'] }] },
    { ax: 'z', t: [19.82, 20.12], a: [-62.64, -60.14], s: [0, 5], holes: [{ a: [-62.34, -60.44], h: 2.1, s: [0, 0] },       // north wall (−1: the corridor goes on)
      // #656: the fifth flat's door (C1005 / C1104 …) in the hall's north end, x −61.62 … −60.77 on våning 1–4 (the plans: hinged at its west end, swinging north into the flat); våning 5 *guess*
      { a: [-61.62, -60.77], h: 2.1, s: [1, 5], leaf: true, hinge: 'w', into: true, flats: [null, 'C1005', 'C1104', 'C1204', 'C1304', 'C1404'] }] },
    { ax: 'z', t: [30.54, 30.88], a: [-62.64, -60.14], s: [0, 5], holes: [{ a: [-62.34, -60.44], h: 2.4, s: [0, 0] }] },       // the stair's south wall (−1: the way through to the steel door, #654)
    // våning 1's lobby
    { ax: 'z', t: [23.0, 23.44], a: [-60.14, -57.54], s: [1, 1] },
    { ax: 'x', t: [-57.84, -57.54], a: [21.2, 23.44], s: [1, 1] },
    { ax: 'z', t: [21.2, 21.5], a: [-57.84, -53.34], s: [1, 1] },
    { ax: 'z', t: [24.92, 25.26], a: [-60.14, -53.34], s: [1, 1] },
    { ax: 'x', t: [-53.46, -53.34], a: [21.5, 24.92], s: [1, 1], holes: [{ a: [23.15, 24.05], h: 2.2 }, { a: [22.3, 23.15], h: 2.2, glass: true }] },
  ],
  floors: [{ r: [-60.44, -57.54, 23.44, 24.92], s: 1 }, { r: [-57.54, -53.34, 21.5, 24.92], s: 1 }],
  cap: [-65.32, -62.34, 22.9, 25.3],
  // #654: on −1 the stair is ONE straight flight in the east half (x −61.34 … −60.44) from the hall's south end (`foot`, the south wall's inner face) north to
  // the hole it climbs through in våning 1's floor (its north edge z = foot − (risers − 1) × tread = 26.79), so the west half stays a free lane
  // from the steel door `entryC` through the south wall's opening up to the hall and the corridor north. *guess*: the plan (vaning-m1) draws a lower flight
  // z 26.6 … 28 + a cupboard z 28.4 … 29.6 and a dashed gate at z ≈ 30.5, not enough to read a flight from; every number here is ours (a 0.25 m tread: steeper than the upper winders').
  lane: { foot: 30.54, tread: 0.25 },
  pit: [-62.34, -60.44, 26.79, 30.54],        // the stair well's footprint (+ the −1 flight's hole in våning 1's floor): a hole in the terrain mesh (the courtyard-level grass inside Hus C's footprint, y 0, would cover the flights below våning 1)
  entrance: { face: 'e', line: -53.4, door: [23.15, 24.05], side: [22.3, 23.1], height: 2.2, hinge: 'hi', cut: [22.3, 24.05], name: 'porten till trapphus C' },
  numbers: { x: -60.44, z: 21.52, dir: -1 },     // #656: clear of the north-east door (z 22.05 … 22.9 on våning 2–5) and its sign (north of it)
  lights: [[-59.0, 24.2], [-55.5, 23.2]],
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
  grip: [0, 0.11, 0], // model-local hilt grip center along ridged segment; hand fit is a visual guess (#913)
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
    // #714 play tuning guess: useful 25 m arc, 30 m/s launch and gentler foam-dart drop; server shares range.
    dart: { range: 25, speed: 30, gravity: 4, max: 8 }, held: { x: 0.18, y: -0.15, z: -0.45 },
    grip: [0, -0.088, 0.092] }, // model-local pistol grip center across blaster models; visual guess (#913)
  wands: { level: 1, x: 2.61, y: 1.45, z: [2.85, 3.2, 3.55], colors: [0xff7ad0, 0x9b7bff, 0x5fd7ff],
    held: { x: 0.2, y: -0.22, z: -0.42 }, headband: { z: 3.9 }, reach: 8, // reach: m to the surface the magic lands on (#97)
    grip: [0, 0.08, 0] }, // model-local handle along lower shaft; visual guess (#913)
  // #604: in the hall's EL/C cabinet, lying on top of the fuse box (x 0.21…0.32, z 0.51…0.82, top y 1.75), at hand in a
  // power cut; `turn` = its yaw (0: along the cabinet, lens to the north). Spot on the box is our pick.
  flashlight: { level: 0, x: 0.3, y: 1.776, z: 0.665, turn: 0.05, back: ['elskåpet', 'lägga tillbaka ficklampan i'], held: { x: 0.2, y: -0.2, z: -0.38 },
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
  // #1927 visual guesses from the retained product photo; fixed dimensions/grips and hug mechanics stay authoritative.
  surface: { bodySegments:[40,24],frontSegments:[36,24],limbSegments:[12,8],exponent:2.6,
    faceSize:512,normalSize:256,roughness:1,normalStrength:.32,pileSlope:.65,faceGrain:14,
    seamColor:'#b7aea1',threadColor:'#e1d8c9',seamWidth:.004,threadWidth:.0018,threadDash:[.004,.003],
    seamInset:.010,seamBand:.10,gatherDepth:.012,gatherY:-.52,gatherBand:.18,gatherWaves:5 },
  home: { z: 0.14, tilt: -0.16 }, held: { x: 0.0, y: -0.57, z: -0.45, tilt: -0.45 }, pull: 0.1, squash: 0.22, hugTime: 0.7, hearts: 14,
  grips: [[0.188, 0.182, 0.03], [-0.188, 0.182, 0.03]] }; // *guess* #914: sides around flippers (P.h * 0.48)

// The big beer on the patio (#117, src/beer.js): a 50 cl tankard (Ø 9 × 16 cm, our pick) that turns up on the
// lounge table (top at 0.40) when you sit down in the lounge sofa; each gulp drinks `gulp` of it.
export const BEER = { x: 4.38, y: 0.4, z: 14.3, r: 0.045, h: 0.16, gulp: 0.2, held: { x: 0.2, y: -0.24, z: -0.45 } };

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
  learner: { width: 0.8, height: 0.16, y: 0.78, offset: 0.07 }, // #901 visual placement (guess), between plate and rear lights
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
    slow: 3.5, // #901 gameplay speed (guess); same garage route and safety stops
  },
  lane: 0.25,                      // of the road's width right of its centre line: the middle of the right-hand lane
  speed: 9.5, brake: 2,            // #901 cruise m/s is a gameplay guess; original braking unchanged
  doorOpen: 1.1,                   // rad: how far a door opens (#250)
  // Music in the car (#268, CarRadio in sonos.js): the SYMFONISK channels from the dashboard (`dash`, local metres).
  // How you hear it (our choice): sitting inside clear; outside through a door that is open a little softer, through the
  // shut doors low and dull (a low-pass). It plays on when you get out, until switched off on the screen, the key sends the
  // car away, or F. While it plays and you sit in the car the house's SYMFONISK speakers are ducked to `duckHouse`.
  // `songLength` (s): the channels never end, so the screen's progress bar runs over a nominal song length.
  music: { gain: 0.45, ref: 0.8, rolloff: 1.3, dash: [0.62, 1.0, 0], songLength: 180, duckHouse: 0.3, redraw: 0.5,
    inside: { gain: 1, cutoff: 18000 }, open: { gain: 0.75, cutoff: 6000 }, shut: { gain: 0.3, cutoff: 500 } },
  // The weather heard from inside the car (#664, weather.js `cabinMix`): with every door shut the rain is knocked down by
  // `shut.db` dB and dulled to `shut.cutoff` Hz (a little leaks through, never silent); a door that is open lets it
  // through almost as outdoors (`open`); in between follows the widest door's angle (the doors swing eased, so it fades
  // in and out). `thunderDb`: the same for thunder (a rumble that still carries). All values our choice (*guess*).
  cabin: { shut: { db: -18, cutoff: 800 }, open: { db: -3, cutoff: 5500 }, thunderDb: -12 },
};

// Where Tilly's daybed stands along Sovrum 4's west wall (#312, #459): its centre's z, clear of the south window's
// curtains (rail z 12.12, folds and wave depth). The basketball holder and the posters follow it.
export const DAYBED_Z = 12.2337 - 0.12 - 2.07 / 2;

// Tilly's basketball (src/basket.js, the user): a size 6 ball (Ø 23 cm) in a wall holder over her daybed (Sovrum 4's
// west wall, x 0.202, centred on the bed, ball centre `y` over the floor). Click shoots it on an arc through the point
// you look at, coming down onto it at `entry` rad (the rim) or `flat` (anything else); speed up to maxSpeed m/s,
// ± jitter of it; right click / the
// 🏀 button dribbles (straight down at `dribble` m/s); it bounces with `bounce` (normal speed kept), loses `slip` of the
// speed along a surface per bounce, rolls out with `roll` /s damping, and comes back into the hand within `catch` m.
// The hoop (a portable one, our pick) stands on the asphalt at the east short end of the car park (#1018, #1037),
// facing west in over the parking lot. Clear of the car's loop, parked cars and the pedestrian walkway along Hus L.
// Rim 3.05 m, Ø 45 cm, 15 cm in front of the board (regulation); board 112 × 72 cm, its bottom `below` the rim.
// `assist`: looking within this many metres of the rim aims at the rim. Court lines follow FIBA regulations.
// Ball return (#1036): a ball that bounces or is thrown outside walkable space (over fences/railings, down inaccessible
// slopes or beyond OUTDOOR) smoothly returns to the basketball court (at the free throw line / court centre).
// #1853: small informal football field on the open grass west/southwest of Hunnerup/85.
// Placement, dimensions, fittings and rolling/control values are visual/play assumptions, not surveyed dimensions.
// The location is bounded by existing trees/paths and WALK; the static site samples the actual rendered terrain.
export const FOOTBALL = {
  at: [-262, -21], yaw: 0, width: 16, length: 24, runoff: 2, apron: 5, apronSpan: [-8, 12],
  goalWidth: 3, goalHeight: 1.8, goalDepth: 1.3, postR: .035, netStep: .32,
  lineWidth: .07, lineLift: .025, centerRadius: 2.5, circleSteps: 32, boxWidth: 7, boxDepth: 4,
  drawDist: 140, ballDrawDist: 60, ballR: .11, ballDetail: 2,
  reserveSpacing: 1.5, footAhead: .65, reach: 1.8, maxDribbleSpeed: 10, moveSlack: .5,
  groundRange: [2.2, 3.4], heightSlack: .6, playHeightSlack: .35, kick: [7, 13], maxBallSpeed: 19,
  gravity: 9.81, airDrag: .25, headerReach: .55, headerHeight: [.85, 1.95], headerSpeed: 8, headerLift: 3.5,
  maxHeight: 15, maxVerticalSpeed: 18,
  friction: 2, tickMs: 10, maxTicks: 1400, stopSpeed: .025, postBounce: .55, ballBounce: .6,
  goalResetMs: 2200, outResetMs: 1500, commandMs: 150, confirmMs: 350,
  maxGoals: 1000000, creditPlayers: 48,
  bench: { side: 12, offsets: [-5, 5], length: 2.1, depth: .48, seat: .48, slat: .05, back: .4, leg: .065 },
  fountain: { at: [12, 9], height: .9, base: .44, bowlR: .18, streamR: .006, streamRise: .12,
    drinkSeconds: 1.2, everyMs: 5000, ml: 50 },
  colors: { line: 0xf0efe6, frame: 0xe3e5e4, net: 0xc6ccc8, wood: 0x986b45, metal: 0x686e72,
    water: 0xbde1ef, ball: 0xf3f1e9, patch: 0x24262a, reserve: 0x245e91 },
};

export const BASKET = {
  ball: { r: 0.115, level: 1, x: 0.202, z: DAYBED_Z, y: 1.5, held: { x: 0.17, y: -0.17, z: -0.5 },
    gravity: 9.81, entry: 0.85, flat: 0.25, maxSpeed: 13, jitter: 0.015, dribble: 4.6,
    bounce: 0.8, slip: 0.12, roll: 0.8, catch: 0.42 },
  hoop: { x: 12.2, z: -9.9, rot: -90, rim: 3.05, rimR: 0.23, rimTube: 0.01, rimZ: 0.38, board: [1.12, 0.72], below: 0.15,
    base: [1.0, 0.3, 0.7], baseZ: -0.75, arm: 0.35, net: 0.42, rise: 1.2, assist: 1.2 },
  court: {
    baselineLocalZ: -0.30,
    freeThrowDist: 5.80,
    freeThrowLen: 3.60,
    keyWidth: 4.90,
    freeThrowRadius: 1.80,
    noChargeRadius: 1.25,
    threeRadius: 6.75,
    threeCornerX: 6.0,
    lineWidth: 0.05,
    halfWidth: 6.0,
    depth: 9.0,
    returnSpot: { x: 6.7, z: -9.9 },
  },
  three: 6.75,
  return: {
    delay: 0.8, // seconds out of bounds before return starts
    speed: 4.5, // m/s rolling back to the court
    outBounds: { x0: -78.5, x1: 27.5, z0: -14, z1: 64 },
  },
};

// #1708: the target's own points (rings × distance, up to 40 a shot) stay as they are on the board and in the
// statistics; the game score gets only `perPoint` of each, and at most `perDay` per local day, for every weapon
// (a rifle hits every 0.25 s). Both numbers are guesses: a perfect shot ≈ 4 points, a minute of rifle fire hits the cap.
export const TARGET_SCORE = { perPoint: 0.1, perDay: 30 };

export const TARGET = {
  x: 12.45, z: 25.7, rot: 90, y: 1.4, r: 0.4, // #1017: east landing, back toward the fence (source-based placement, not surveyed)
  // #1820 gameplay guesses: move after ~50 board points, ~50 m onto inspected free park grass.
  moveEvery: 50, moveDist: 50, moveSlack: 5, hitEvery: .1,
  moveSpots: [
    [-40,64],[-34,64],[-22,64],[-16,64],[-10,64],[-4,64],[2,64],[8,64],
    [14,64],[-40,70],[-34,70],[-22,70],[-4,70],[2,70],[8,70],[14,70],
    [-40,76],[-34,76],[-28,76],[2,76],[8,76],[14,76],[-40,82],[-28,82],
    [2,82],[8,82],[14,82],[-34,88],[-28,88],[2,88],[8,88],[14,88],
    [-34,94],[-28,94],[-22,94],[-4,94],[2,94],[8,94],[14,94],[-34,100],
    [-28,100],[-22,100],[-16,100],[-10,100],[-4,100],[2,100],[8,100],[14,100],
    [-34,106],[-28,106],[-16,106],
  ], // inspected with real ground/trees/roads; docs/verification/1820
  rings: [10, 8, 6, 4, 2, 1],
  range: [[2, 1], [4, 2], [6, 3], [Infinity, 4]],
};

// Putting held things down (#102, holdable.js / main.js): a table top, worktop or the floor within `reach` m
// of the eye.
// #531: artistic tuning, 12% brighter in linear light on the active target only.
// Ordinary materials/depth testing stay intact; no additional render passes or edges.
export const INTERACTION_OUTLINE = { brightness: 1.12 };
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
  // as they are) and its door bins [y on the door, spots as fractions of the door's width]; freezer slots 0–2 now sit
  // on its upper glass shelf instead of anonymous frozen blocks (#504). Stable store/slot ids preserve saved food.
  stores: { fridge: { shelves: [0.45, 1.52], bins: [[0.85, [0.3, 0.7]], [1.3, [0.3, 0.7]], [0.4, [0.7]]],
    pack: { y: 1.2, dx: 0.1 } }, freezer: { y: 1.604, peas: 0.15 }, // fridge.pack: slot 11, the sausage pack (#1188): on the milk's shelf, its ~17 cm pack clear of the carton (at −0.12) and the liner (our pick)
    boardRack: { z: 2.95, lean: 10 }, plates: { stack: 0.019 }, glasses: [0.25, 0.5, 0.75] }, // glasses: the drinking glasses' spots across the glass cabinet's lower shelf (fractions, #382) // plates: the height of one plate in the stack (#379) // the cutting board on its long edge against the splashback (#374): its middle's z, leaning ° off upright // peas: the lower open shelf's spot east of the fish-finger carton (x from the middle, #373)
  // #1862: supportTolerance permits small drawn caps/coatings over walking support; waterClearance rejects wet surface contact (m, guess).
  place: { grid: 0.05, floorGrid: 0.1, supportTolerance: .15, waterClearance: .03, margin: 0.04, turn: 45, outlineOpacity: .85 },
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

// The drop-off for full rubbish bags (#387/#520, src/waste.js `buildDropoff`).
// Peab's room functions are unlabelled. #538: the user places the same three categories along
// the open bay's east (apartment-facing) wall, fronts toward the passage (west). Dimensions,
// 10 cm wall clearance and centring on this wall are game assumptions, not measured bin positions.
// Fixed geometry is rebuilt from config on reload/reset; saves never restore a bin transform.
export const LIFE_WASTE = { dropoff: { x: PORTIK.east - 0.5, z: (PORTIK.north + PORTIK.room.wallNorth) / 2, yaw: -90, gap: 1.0, width: 0.68, depth: 0.85, h: 1.07 } };

// #1052: assumed household stock, two shallow piles per tray compartment; laneOffset is a width fraction, other offsets in metres
// reveal the detailed #1039 pieces without raising the piles over the existing insert.
export const CUTLERY_STOCK = { perPile: 3, laneOffset: 0.23, layerRise: 0.004, sideStep: 0.003, depthStep: 0.012 };

// The dishwasher (#384, src/dishwasher.js; the integrated KEZA9310W of the plan, no product drawing — our picks): its racks roll
// `out` m when the door is down; the lower rack (`y` over the tub's bottom, `h` high) holds `plates` plates on edge, the upper
// one `glasses` glasses upside down, the cutlery tray on top of it `tray` tools.
// #385: a programme takes `seconds` of game time (a short game programme, adjustable); `plinth` = the tub's bottom over the
// floor (the floor spot's height).
export const DISHWASHER = { out: 0.38, lower: { y: 0.05, h: 0.13, plates: 6 }, upper: { y: 0.36, h: 0.11, glasses: 6 }, tray: 4, seconds: 60, plinth: 0.097 };

// #504: cold drawer geometry/slots are assumptions based on the existing fridge/freezer model,
// not a manufacturer drawing. Preserve basket heights; 30 cm travel leaves their backs on the runners.
export const COLD_DRAWERS = {
  fridge: [[0.09, 0.31]], freezer: [[0.1, 0.4], [0.42, 0.72], [0.74, 1.0], [1.02, 1.28]],
  out: 0.30, speed: 2, wall: 0.006, sideClearance: 0.015, endClearance: 0.03,
  slotAcross: [-0.24, 0.24], slotDepth: [0], slotLift: 0.002,
};

// The kitchen's food from the start (#373, LIFE-009; the user: no shop, no delivery, no budget — the food is simply there):
// `stock` = [type, store, slot] — where each thing lives (its home); `amounts` = what a fresh one holds, game parameters from
// the plan (docs/livssimulator-plan-2026-10-04.md section 3), not product measures. A thing used up and thrown away is back
// in its home the next time its store is opened after being shut (life.js `restock`), never while the old one is still
// anywhere (in the hand, lying out, half used). The milk is milk.js's carton (#168), the fish fingers fishfingers.js's.
export const LIFE_FOOD = {
  amounts: { cucumber: 300, cheese: 500, butter: 500, peas: 500, breadBag: 12 }, // g, g, g, g, slices
  stock: [['cheese', 'fridge', 0], ['cucumber', 'fridge', 1], ['butter', 'fridge', 6], ['eggCarton', 'fridge', 2], // the bottom shelf; the butter in the door's top bin
    ['peas', 'freezer', 3], // on the lower open shelf beside the fish-finger carton
    ['breadBag', 'pantry', 0], // the bottom of the pantry cabinet
    ['sausagePack', 'fridge', 11], ['bunBag', 'pantry', 1], // #1124: grill sausages on the milk's shelf (#1188), hot-dog buns on the pantry shelf
    ['billysBox', 'freezerDrawer4', 0], ['gorbysBox', 'freezerDrawer4', 1], // #1209: frozen pan pizzas and pirogs (appended: old saves get them by restock); #1219: in the top freezer drawer, not beside the fries (items.js MIGRATIONS[2] moves old saves)
    ['iceCreamBox', 'freezerDrawer3', 0]], // #1229: ice cream cone box in the drawer under Billys and Gorbys
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
// Egg size, stock and game-paced frying times are assumptions (#484).
// #1124 (an in-game wish): grill sausages and hot-dog buns. Pack/bag counts, sizes (a ~13 cm × Ø 2.4 cm grill sausage, a
// ~16 cm bun), colours and game-paced grilling times are assumptions; `slots` = sausage spots across a kettle's grate (m from
// its middle along x, scaled with the kettle), kept clear of the whole chicken in the middle.
export const SAUSAGE = { pack: 6, buns: 4, len: 0.13, r: 0.012, seconds: 12, burnAt: 36, slots: [-0.2, -0.165, 0.165, 0.2],
  bun: { len: 0.16, h: 0.04, w: 0.055 }, colors: { raw: 0xd9a294, grilled: 0x9a4d22, burnt: 0x2e1a10 } };
// #1209 (part of #1206, an in-game wish): Billys Pan Pizza and Gorby's pirogs in the freezer. Box counts and sizes are
// assumptions (*guess*: a ~13 cm square pan pizza ~2.4 cm thick, a ~13 × 7 cm pirog), not product measures; the boxes'
// prints are our own canvas versions of the brands' colours (Billys red/yellow, Gorby's blue/yellow). Each piece comes
// wrapped in plastic (pkg 'closed'): "packa upp" takes the film off; frozen, it cannot be eaten yet (heating: #1210).
export const FROZEN_MEALS = {
  billys: { count: 3, box: [0.165, 0.09, 0.15], piece: [0.13, 0.024, 0.13], crust: 0xc98b45, film: 0.006 },
  gorbys: { count: 4, box: [0.15, 0.08, 0.17], piece: [0.13, 0.034, 0.072], crust: 0xc58a4a, film: 0.006 },
  frost: 0.35, // how pale/frosty a frozen piece looks (0 = as baked, 1 = white)
};
// #1229: Ice cream cones in the freezer (a box of 6 cones with three flavours: vanilla, strawberry, chocolate).
// Placed in freezerDrawer3 (under Billy and Gorby in freezerDrawer4). The cones are paper-wrapped (pkg closed);
// unwrapping ('ta av pappret') allows eating the cone in bites.
export const ICECREAM_CONES = {
  count: 6,
  box: [0.18, 0.09, 0.14],
  flavors: {
    vanilla: { id: 'vanilla', name: 'vaniljstruten', label: 'ta en vaniljstrut', color: 0xfff6dd, wrap: 0x3a7bd5 },
    strawberry: { id: 'strawberry', name: 'jordgubbsstruten', label: 'ta en jordgubbsstrut', color: 0xf4729b, wrap: 0xe64980 },
    chocolate: { id: 'chocolate', name: 'chokladstruten', label: 'ta en chokladstrut', color: 0x542e18, wrap: 0x845ec2 },
  },
  cone: { h: 0.11, r: 0.024, waffle: 0xd49b55 },
};
// #1210: warming a plate of food in L1007's microwave (src/microwave.js). The panel's time button cycles `presets` (display
// seconds); one real second runs `clock` display seconds. A heatable food (ITEMS `heat`: warm / hot / burn in display seconds
// of microwaving) turns "varm" at `warm`, "het" (too hot to eat) at `hot` and "bränd" at `burn`. All numbers are game parameters, *guess*.
export const MICROWAVE = { presets: [30, 60, 90, 120], clock: 6, beeps: 1, cav: { r: 0.12, plateY: 0.053 },
  heat: { warm: 25, hot: 75, burn: 110 } };
export const EGG = { count: 6, crack: .65, seconds: 8, burnAt: 24, shellRadius: .022, whiteRadius: .051, yolkRadius: .017, carton: { w: .155, d: .105, h: .067 } };
// Laundry gameplay and interior proportions are assumptions (#395/#550), not product specifications.
export const LAUNDRY = {
  // #632: taller and narrower than the first 42 x 42 x 36 cm; 32 x 32 x 52 cm is a *guess* (a common laundry basket), its east
  // face stays where it was (x 1.99, against Tvätt's east wall). `lay` = per slot [x, y above the floor, z, tilt x, yaw, tilt z]: the clothes lie in a heap.
  basket: { pos: [1.83, 0, 4.16], w: .32, d: .32, h: .52, slots: 3,
    lay: [[-.03, .08, .02, .2, .5, -.15], [.04, .14, -.03, -.25, -1.1, .2], [-.01, .20, .04, .15, 2.3, .25]] },
  drum: { radius: .16, depth: .30, shell: .012, centerY: .42, slots: 3 },
  garment: { w: .18, d: .22, thick: .022, colors: [0x617b96,0xb77b73,0xa496b8] },
  wardrobe: { reserve: .34, slots: 2, stackStep: .041, shelfGap: .002, pickDepth: .025, pickHeight: .12, accessGap: .005 },
  panel: { w: .26, h: .065, lift: .36, offset: .008, pickDepth: .02 },
  washSeconds: 35, drySeconds: 25,
};
// Plant care game amounts, timing, can/rack geometry and display changes are assumptions (#553).
export const WATERING = {
  capacity: 1000, dose: 120, seconds: 1.2, soilWet: .55, dryLift: .88, dryLeaf: .96,
  home: [.50,.91,4.22], can: { r: .065, h: .18, spout: .15, handle: .06, color: 0x537c6b },
  tilt: .65, streamRadius: .003, pickMargin: .025, rackPick: [.34,.24,.2], soilRoughness: .35,
  wall: .006, bottom: .012, spoutRadius: .009, handleRadius: .008, waterInset: .007, waterBottom: .015, waterHeadroom: .02,
};
// Bed-care time and rumpled-cloth displacement are visual/game assumptions (#555).
export const BED_CARE = {seconds:1.4,height:.055,pull:.16,waveX:8,waveZ:12};
// Fixed place settings relative to the existing six chairs; spacing/pick sizes are game assumptions (#554).
export const TABLE_SETTING = {inset:.17,glassIn:.14,glassAhead:.13,lift:.001,pick:[.34,.15,.34],pickIn:.04,pickY:.065,pickZ:.02};
// Hall chores reuse the existing shell jacket/sneaker models. Floor starts, picks and access clearance are game assumptions (#556).
export const HALL_CARE = {jacket:{len:.78,color:0x2f4a63,kind:'shell',floor:[1.15,.002,1.65]},shoes:{color:0xe9e6df,boot:false,floor:[1.20,.002,2.72],gap:.05},
  jacketPick:[.30,.84,.14],shoePick:[.22,.13,.28],floorJacketPick:[.30,.12,.84],floorShoePick:[.22,.13,.28],wardrobePick:[.12,.9,.045],access:.055,frontGap:.015,
  tidy:{hallCoatRack:'hallJacket',hallWardrobeHook:'hallJacket',hallShoeRack:'hallShoes'}}; // tidy store → item type: the hall task's goals (#594)
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

export const ITEMS = {
  toiletRoll: {name:'toalettrullen',tags:['toiletRoll'],unit:'count',amount:TOILET_PAPER.sheets,size:'s',model:'toiletRoll',held:{pos:[.15,-.23,-.42],rot:[.15,0,.2]}},
  hallJacket: {name:'jackan',tags:['hallJacket'],unit:'count',amount:1,size:'m',model:'hallJacket',held:{pos:[.12,-.34,-.48],rot:[.35,0,0]}},
  hallShoes: {name:'skorna',tags:['hallShoes'],unit:'count',amount:1,size:'m',model:'hallShoes',held:{pos:[.14,-.28,-.44],rot:[.2,0,0]}},
  wateringCan: { name: 'vattenkannan', noun: 'vattenkanna', tags: ['wateringCan','fillable'], unit: 'ml', amount: 0, capacity: WATERING.capacity, fullText: 'Vattenkannan är full', size: 'm', model: 'wateringCan', held: {pos:[.16,-.30,-.48],rot:[.1,-.25,0]} },
  laundryClothes: { name: 'plagget', noun: 'plagg', tags: ['laundry'], unit: 'count', amount: 1, size: 's', clean: 'dirty', moisture: 'dry', model: 'laundryClothes' },
  eggCarton: { name: 'äggkartongen', tags: ['food', 'package'], unit: 'count', amount: EGG.count, size: 'm', pkg: 'closed', model: 'eggCarton', dispense: 'rawEgg', dispenseLabel: 'ta ett ägg' },
  rawEgg: { name: 'ägget', tags: ['food'], cook: 'egg', unit: 'count', amount: 1, size: 'xs', model: 'rawEgg' },
  friedEgg: { name: 'det stekta ägget', tags: ['food', 'topping'], cook: 'egg', unit: 'count', amount: 1, size: 's', model: 'friedEgg', bites: 4, needsCooking: true, heat: { ...MICROWAVE.heat, cookBurn: EGG.burnAt } },
  // #1124: grill sausages (raw → grilled on a lit kettle grill → burnt) and hot-dog buns; the grilled sausage goes in a bun
  sausagePack: { name: 'korvpaketet', noun: 'korv', tags: ['food', 'package'], unit: 'count', amount: SAUSAGE.pack, size: 'm', pkg: 'closed', model: 'sausagePack', dispense: 'sausage', dispenseLabel: 'ta en grillkorv' },
  sausage: { name: 'korven', noun: 'korv', tags: ['food', 'topping', 'sausage'], cook: 'sausage', unit: 'count', amount: 1, size: 's', model: 'sausage', bites: 3, needsCooking: true, cookText: 'Grilla korven först', heat: { ...MICROWAVE.heat, cookBurn: SAUSAGE.burnAt } },
  bunBag: { name: 'korvbrödspåsen', noun: 'korvbröd', tags: ['food', 'package'], unit: 'count', amount: SAUSAGE.buns, size: 's', pkg: 'closed', model: 'bunBag', dispense: 'hotdogBun', dispenseLabel: 'ta ett korvbröd' },
  // #1209: frozen meals from the freezer; the piece is wrapped (pkg closed) until unwrapped (`unwrap` = that action's label)
  billysBox: { name: 'Billys-kartongen', noun: 'pizza', tags: ['food', 'frozen', 'package'], unit: 'count', amount: FROZEN_MEALS.billys.count, size: 'm', pkg: 'closed', model: 'billysBox', dispense: 'billys', dispenseLabel: 'ta en Billys pan pizza' },
  billys: { name: 'pizzan', noun: 'pizza', tags: ['food', 'frozen'], unit: 'count', amount: 1, size: 's', pkg: 'closed', model: 'billys', bites: 4, needsCooking: true, heat: { ...MICROWAVE.heat },
    cookText: 'Pizzan är djupfryst – värm den först', unwrap: 'packa upp pizzan', wrappedName: 'den inplastade pizzan', frozenName: 'den frysta pizzan', hotName: 'den varma pizzan' },
  gorbysBox: { name: 'Gorbys-kartongen', noun: 'piroger', tags: ['food', 'frozen', 'package'], unit: 'count', amount: FROZEN_MEALS.gorbys.count, size: 'm', pkg: 'closed', model: 'gorbysBox', dispense: 'pirog', dispenseLabel: 'ta en Gorbys pirog' },
  pirog: { name: 'pirogen', noun: 'pirog', tags: ['food', 'frozen'], unit: 'count', amount: 1, size: 's', pkg: 'closed', model: 'pirog', bites: 3, needsCooking: true, heat: { ...MICROWAVE.heat },
    cookText: 'Pirogen är djupfryst – värm den först', unwrap: 'packa upp pirogen', wrappedName: 'den inplastade pirogen', frozenName: 'den frysta pirogen', hotName: 'den varma pirogen' },
  // #1229: ice cream cone box and cones in three flavours
  iceCreamBox: { name: 'glasskartongen', noun: 'strutglass', tags: ['food', 'frozen', 'package'], unit: 'count', amount: ICECREAM_CONES.count, size: 'm', pkg: 'closed', model: 'iceCreamBox',
    dispenseOptions: [
      { type: 'iceCreamConeVanilla', label: 'ta en vaniljstrut' },
      { type: 'iceCreamConeStrawberry', label: 'ta en jordgubbsstrut' },
      { type: 'iceCreamConeChocolate', label: 'ta en chokladstrut' },
    ] },
  iceCreamConeVanilla: { name: 'vaniljstruten', noun: 'strutglass', tags: ['food', 'frozen'], unit: 'count', amount: 1, size: 's', pkg: 'closed', model: 'iceCreamConeVanilla', bites: 4,
    unwrap: 'ta av pappret', wrappedName: 'den inslagna vaniljstruten', frozenName: 'vaniljstruten', eatClosedText: 'Ta av pappret först', crumbs: true },
  iceCreamConeStrawberry: { name: 'jordgubbsstruten', noun: 'strutglass', tags: ['food', 'frozen'], unit: 'count', amount: 1, size: 's', pkg: 'closed', model: 'iceCreamConeStrawberry', bites: 4,
    unwrap: 'ta av pappret', wrappedName: 'den inslagna jordgubbsstruten', frozenName: 'jordgubbsstruten', eatClosedText: 'Ta av pappret först', crumbs: true },
  iceCreamConeChocolate: { name: 'chokladstruten', noun: 'strutglass', tags: ['food', 'frozen'], unit: 'count', amount: 1, size: 's', pkg: 'closed', model: 'iceCreamConeChocolate', bites: 4,
    unwrap: 'ta av pappret', wrappedName: 'den inslagna chokladstruten', frozenName: 'chokladstruten', eatClosedText: 'Ta av pappret först', crumbs: true },
  hotdogBun: { name: 'korvbrödet', noun: 'korvbröd', tags: ['food', 'base', 'bun'], unit: 'count', amount: 1, size: 's', model: 'hotdogBun', bites: 4 },
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
  'lunden.bestiary', 'lunden.catCards.migrated', // the old board photos were copied into the cat binder (#1249): a reset must not copy thrown-away ones back
  'lunden.stats', 'lunden.name', 'lunden.playerId', // the score and the leaderboard
  'lunden.avatar', // the character's chosen look incl. its height (#1148); "Ny spelare" still drops it (main.js onNewPlayer)
  'lunden.scoreQueue', // completed players awaiting upload, including offline player changes
  'lunden.crash.pid', 'lunden.crash.sent', 'lunden.crash.out', // crash reports (#629): the random id, the daily send counter (a reset is no way round the cap) and unsent reports; lunden.crash.beat is dropped: a reset's reload is no crash
  'lunden.changelogSeen', 'lunden.changelogSeenT', 'lunden.installSkipped', 'lunden.mapShown', // conveniences
];

// Performance (#189): small meshes (radius < maxR m) are not drawn once they would look smaller than `k`
// (radius / distance, ~0.6° across), never nearer than `minDist`; meshes up to `maxOcclude` inside the flat are
// not drawn from outside unless seen through a façade opening; re-checked after the camera moved `move` m.
// Phone whole-box occlusion (#1361): occlusionMargin = 5 mm inside actual opaque rectangles
// (guess); never infer solidity across a doorway or the stair opening.
// `hitch` (#592, src/hitchlog.js, `&perf`): a frame of at least `ms` is logged with what changed in it; the last `keep` are
// kept in `__app.hitch.log`. 50 ms = three missed frames at 60 Hz, the point where a turn visibly freezes (*guess*).
// Warm-up (#432, #592, src/warmup.js): starts `frames` frames after the scene is built; the idle texture uploads take at
// most `sliceMs` ms per idle slot (*guess*: half a 60 Hz frame).
// Adaptive graphics level (#592, src/quality.js): 0 = lowest … levels − 1 = highest; the tables below give each knob's
// value per level. The regulator (#1510, `auto`, see quality.js) judges `window`-second windows against the target's frame
// budget (1000 / 30 or 60 ms); at most one step per `cooldown` s. Frames longer than `ignoreOver` s are stalls: kept in
// the diagnostics, excluded from adaptation. Phones (lowMemory) start at `startLowMemory`; the level reached is remembered
// per device (localStorage). pixelRatio is a factor of the device's (capped) ratio, never below `minPixelRatio`; the
// shadow map size is also capped by LOW_MEMORY on phones; mirror 0 = no mirror images. All values *guess*, from
// #460's tiers (0.65 / 0.85 / 1.0 resolution, 0.7 / 0.85 / 1.0 detail, shadows every 1.0 / 0.6 / 0.4 s).
export const QUALITY = {
  levels: 4, startLowMemory: 2, ignoreOver: 0.25, cooldown: 1.5, minPixelRatio: 0.5,
  // #1509/#1510: the player's 30/60 FPS target sets the budget (1000 / target ms) every ratio below is relative to; a load
  // budget, not a promise, and no render cap. All *guess* unless noted, chosen against the UHD 630 route (#1510 README):
  // window 1 s (a median over ~30–60 frames; one load/save stall cannot move it); over 1.3 × budget (60: 21.7 ms ≈ 46 fps,
  // 30: 43 ms ≈ 23 fps) or ≥ 20 % hitches of ≥ 3 × budget (60: 50 ms, #592's hitch) in `downAfter` 2 windows in a row → down;
  // a stall is one frame ≥ 6 × budget (diagnostics only); headroom = median ≤ 1.1 × budget without hitches for `upAfter`
  // 5 windows (#592's 5 s), `blocked` 20 s after a down (#592); a step up is a trial judged over `trialWindows` windows
  // after `settle` s (the reallocation frames after a step / pause), reverted on failure and then not retried for `backoff`
  // s, doubling to `backoffMax`. `cpuShare`: a median main-thread work ≥ 0.8 × the median interval counts as CPU-bound.
  // `minGain`: a down step that improves the median by < 8 % over `responseWindows` windows is reverted. `keep`: log size.
  auto: { window: 1, over: 1.3, hitch: 3, hitchShare: 0.2, downAfter: 2, stall: 6, headroom: 1.1, upAfter: 5, blocked: 20,
    settle: 0.6, trialWindows: 3, backoff: 60, backoffMax: 600, cpuShare: 0.8, minGain: 0.08, responseWindows: 2, keep: 24 },
  // #1512 Ultra = index `levels` (4) of every table below: an explicit choice only (Auto stays within 0…levels − 1),
  // offered only on a non-phone device with the full resource profile (main.js `top`). It is Hög with ONE richer
  // family, the sun's shadow map: 4096² instead of 2048² over the same ±14 m box (texel ≈ 0.7 instead of ≈ 1.4 cm,
  // so the PCF-soft edges of blinds, leaves and chair legs are about half as wide). Same shadow programs (the map size
  // is a uniform), same casters and cadence; cost: 4 × the shadow pass's fill and ~+96 MB of GPU memory for the map
  // and its depth buffer (*estimate*, RGBA8 + 32-bit depth). Not measured on strong hardware (none available, #1512).
  names: ['Lägsta', 'Låg', 'Medel', 'Hög', 'Ultra'],
  pixelRatio: [0.6, 0.75, 0.9, 1, 1],
  shadowSize: [1024, 1024, 2048, 2048, 4096],
  shadowInterval: [1.0, 0.75, 0.5, 0.4, 0.4],
  mirror: [0, 256, 256, 512, 512], mirrorEvery: [1, 3, 2, 1, 1], // mirror image size (0 = none) and drawn every n-th frame; #1207: level 1 keeps a cheap image (256², every 3rd frame, no extra memory: the shared target is 256² already) so a device that stepped down once does not see empty mirrors; only the lowest level has none
  detail: [0.6, 0.75, 0.9, 1, 1],
  particles: [0.35, 0.6, 0.85, 1, 1],
};
// #669 (phone, `sliced`): iPhone crash reports show ONE frame of 4.4-4.7 s (the heartbeat's lagMs) in the warm-up's
// `compiling` phase right before WebGL context loss; ~110 programs of the mirror variants compile in one frame (SwiftShader:
// 109 programs = 1 s on a desktop CPU; ANGLE's shader translation is on the main thread; a phone is several times slower, *guess*)
// and the draw-everything frame uploads ~1250 geometries and ~100 textures at once. So on phones the warm-up works in slices:
// `programs` new programs / `compileMs` ms per frame, `batch` objects per renderer.compile call, `drawObjects` objects or
// `drawVertices` vertices per draw slice, `ready` ms at most waiting for a slice's programs (KHR_parallel_shader_compile) and
// `timeout` ms at most for any compile wait (a wait that never ends kept the warm-up in `compiling` for ever). Not measured on a device.
export const WARM = { frames: 3, sliceMs: 8, programs: 4, compileMs: 20, batch: 8, drawObjects: 120, drawVertices: 200000, ready: 1500, timeout: 8000 };
// `budget` (#592, tools/perfcount.html fails past it): per view at the highest quality level, `calls` draw calls and
// `tris` triangles at any perfcount spot, `texMB` the estimated GPU memory of every material's textures (w × h × 4 bytes
// + mips, capped at the device's texture size); `lowMemory` the same on phones (`?lowmem`). About 20 % over what the
// scene used when they were set (2026-10-09): new things fit, a doubling does not slip in unnoticed (*guess*). Raise one
// only on purpose, with the reason in the commit.
// `detail.lowMemoryOutside` (#695): on phones, small things inside the flat seen from outside it (through its windows) are cut at
// this share of their usual distance — the start view from the street drew the kitchen's cups and jars at 15 m (*guess*).
// `detail.lowMemoryEdgesOutside` (#1223): their outline line sets (doors, lids, appliances) only within this many m (*guess*).
// #884: half-second display windows keep the always-visible FPS readable (UI choice, not a hardware target).
export const HUD_FPS = { everyMs: 500 };
// #1383: phoneUnitK angular cutoff and phoneUnitPad bounding margin are visual LOD guesses for whole simple furnishings.
export const PERF = { frustumPad: 0.01, // metres: conservative Float32 transform guard for exact-box frustum proof (#1453)
  detail: { maxR: 0.5, k: 0.009, minDist: 3.2, maxOcclude: 4, move: 0.3, occlusionMargin: 0.005, phoneUnitK: 0.07, phoneUnitPad: 0.2, lowMemoryOutside: 0.7, lowMemoryEdgesOutside: 6, proxyExtraTris: 2000, proxyMaxVertices: 10000 }, hitch: { ms: 50, keep: 100 }, // #1540 proxy limits: *guess* (docs/development/performance.md)
  // #1507: bounded ~60 s at 60 Hz; trace only gaps over 50 ms (diagnostic budget guesses).
  intervals: { keep: 3600, markMs: 50 },
  budget: { calls: 520, tris: 1000000, texMB: 320, lowMemory: { calls: 370, tris: 950000, texMB: 225 } } };

// Phones and tablets (low memory, #585): iOS Safari kills the tab ("Ett problem inträffade flera gånger") once the page's
// textures, geometry and canvases outgrow its memory budget. Measured with an iPhone UA in headless Chromium:
// ~280 MB of textures, 15 of them larger than 1024 px. On such devices every texture is uploaded at most
// `maxTextureSize` px on its longest side (three's own resize, the source canvas/image stays as it is), the sun's
// shadow map is `shadowMapSize`² and the dynamic resolution never goes above `maxPixelRatio`. `&lowmem` forces it on a desktop.
export const LOW_MEMORY = { maxTextureSize: 512, shadowMapSize: 1536, maxPixelRatio: 1.25,
  coveredFrameMs: 100, // #669: at most 10 GPU frames/s under reading/pause panels, *guess*; simulation is unchanged
  shadowHoldEvery: 0.15 }; // #1100: after "Använd" (and #1192 while the sun moves, e.g. spooling the clock) the shadow map is redrawn at most every 0.15 s, not every frame, *guess*
// #628: maxTextureSize 1024 → 512. tools/phonememtest.cjs (iPhone 14 Pro landscape 844×390, DPR 3, ratio ≤ 1.0 → at most 844 px
// across) showed 262 textures at 207 MB after the start warm-up, 145 MB of it in ~27 textures of 513–1024 px (+ mips);
// a screen under 850 px wide gains nothing from a larger base level (*guess*: judged by screenshots, not by a device).
// #662: a little finer again, one knob at a time (tools/phonememtest.cjs, docs/development/performance.md): maxPixelRatio
// 1.0 → 1.25 (+3 MB: level 2 now draws at 1.125×, the top level at 1.25×) and shadowMapSize 1024 → 1536 (+5 MB; the
// quality levels 0–1 stay at 1024 through QUALITY.shadowSize). maxTextureSize 768 was measured and NOT taken (+42 MB).
// To go back: maxPixelRatio 1.0, shadowMapSize 1024. The 600 MB iOS budget is a *guess*; the adaptive levels still step down.

// Startup resource profile (#1511, src/resourceprofile.js): chosen once before the house is built. `light` fetches the
// copies in textures/light/ of the listed photographed pictures instead of the full files. `max` = their longest side,
// equal to LOW_MEMORY.maxTextureSize, so on a phone the GPU texture is the same size as before (three used to shrink the
// full file at upload); made by tools/lighttextures.cjs. Auto picks light when the renderer's upload cap is ≤ `max` or
// navigator.deviceMemory reports ≤ `deviceMemory` GB (*guess*: conservative, Chromium only); `&res=light|full` overrides
// and is remembered (`&res=auto` forgets). Every listed file needs its light copy (tools/resourceprofiletest.cjs).
// #1549: the same max also bounds procedural AO, meal packaging and the painted kitchen picture before painting.
export const RESOURCE_PROFILE = { light: { max: LOW_MEMORY.maxTextureSize, deviceMemory: 2, textures: [
  'textures/stair-pictures.jpg', 'textures/angsgras-sovrum1.jpg', 'textures/tavla-svartvit-trappan.jpg',
  'textures/tavla-akvarell-schaslong.jpg', 'textures/the-gulag-sovrum2.jpg', 'textures/linjeteckning-sovrum1.jpg',
  'textures/eat-sleep-game-repeat-sovrum2.jpg', 'textures/tavla-guld-lila-vardagsrum.jpg'] } };
// #1195 (phones, src/shadowtiles.js): a shadow-casting InstancedMesh whose instances spread over more than `minSpread` m
// (the site's trees, the parked cars) casts through `size` m squares, so the ±14 m shadow box no longer draws the whole
// site's batch on every shadow redraw. `size` *guess*: about the shadow box's width; smaller squares mean more objects to
// test per shadow pass, larger ones more far instances drawn. Batches under `minInstances` are left alone.
export const SHADOW_TILES = { size: 32, minInstances: 8, minSpread: 40 };
// #1213 (phones, src/viewlod.js): in the view, a parked car (the north street's car park, the garage) further than `carNear`
// m from the camera is drawn as a coarse body (streetlife.js `carFarGeometry`, ~100 instead of ~5.1 k triangles), all of
// them in one draw call; the near ones keep the full batches. #1988: both levels dither-fade through `fade` m centred on
// the old near distance; packing includes a `step` m margin and is redone after moving `step` m. All are visual guesses.
// #1246: desktop uses the same split from `carNearDesktop` (*guess*: a parked car's silhouette and colour hold up to ~60 m).
export const VIEW_LOD = { carNear: 30, carNearDesktop: 60, fade: 8, step: 1 };

// Camera near plane by altitude (#1276): the 24-bit depth buffer resolves about d²/(near·2²⁴) m at distance d, so with the
// walking near plane of `min` m (0.05) coplanar layers (window panes and reveals, roofs, road/ground overlays, 2 mm insets)
// z-fight and the far houses shimmer from the air (jetpack, 320 m ceiling). Above `free` m over the ground the near plane
// grows by `perMetre` m per metre, capped at `max` m; walking, roofs and indoors keep `min`. All *guess* (nothing nearer than
// a few metres is in view that high up; the cap keeps ~4 mm resolution at 300 m).
export const VIEW_NEAR = { min: 0.05, outdoor: 0.12, free: 3, perMetre: 0.02, max: 1.5 };
// `outdoor`: walking on the open ground (not indoors, in the stairwell, a visited flat, the garage or a vehicle) the near plane is
// 0.12 m: the body stops 0.22 m (PLAYER.radius) from a wall, so nothing is cut; far façades get 2.4× the depth precision.

// Depth bias for window glass drawn a few cm in front of a façade (#1276, src/neighborglass.js, sitebackdrop.js, southbackdrop.js):
// polygonOffset is counted in depth-buffer steps, so unlike the 1–7 cm geometry inset it keeps winning at 300 m, where one step of
// a 24-bit buffer is ~10 cm and the layers flickered. 2 steps pull a pane ~20 cm at 400 m, less than any reveal or neighbour wall.
export const DECAL_OFFSET = { factor: -1, units: -2 };

// Campus facades on phones (#589, src/lowmemory.js): #576–#581 took the east backdrop from ~21k to ~75k triangles. On
// LOW_MEMORY devices campusfacades.js and schoolfacade.js keep every body, roof, colour, window and the clock tower but
// drop dentils, quoin joints and the finer glazing bars (centre post and one rail stay), merge each stepped cornice into
// one profile, draw sills and window crowns as flat planes, round arches with `curve` segments and lay the roofs on a
// `roofGrid`× coarser grid. `maxTris` = the east backdrop's triangle budget on phones (eastbackdroptest); all *guess*, except that
// `maxTris` was re-measured in #1468: 41 367 triangles at c6a1653b + ~2 % = 42 200 (desktop budget: CAMPUS_TRIS in the test).
export const CAMPUS_LOD = { curve: 3, roofGrid: 2, maxTris: 42200 };

// Marks on surfaces (#96, src/marks.js): one ring buffer of at most `max` flat decals in all, one instanced
// mesh per kind, canvas textures. Per kind: size (m, randomised ±25 %), life (s; the last `fade` s fade out).
// burn = the lightsaber (with a short glow and a puff of smoke), star/butterfly = wands, splash = Nerf.
// Our picks. `gap`: no new mark closer than this to the last one, nor sooner than `every` s.
// The AK-47 in the NORDLI chest (#196, src/rifle.js): a folding-stock AKMS, folded ~68 cm (fits the wide bottom drawer).
// `mag` rounds, `rpm` automatic, `spread` (rad) per shot, `range` m; empty → `reloadDelay` s → a `reloadSeconds` reload;
// dropped magazines lie `magLife` s (at most `maxDrops`). `held` = where it sits in the view. Our picks.
// The bow (#690, src/bow.js): our own recurve bow (laminated wood limbs, a dark riser with a grip, a string) with a quiver
// of arrows, in the cushion box at the foot of the NW stair (FURNITURE `inside: 'bow'`). Hold to draw (mouse button / the
// touch action button), let go to shoot: full draw after `drawTime` s, at least `minDraw` of it to loose an arrow (less:
// the string just goes back), the arrow leaves at speed[0] … speed[1] m/s with the draw (a real recurve ~50–60 m/s; ours
// slower so the arc shows, *guess*); a click / tap without holding looses one at `tap` of a full draw. Arrows (`len` m)
// fly under `gravity`, turn with their path, stick in what they hit for `stick` s; at most `arrows` at once (the oldest
// goes); unlimited. `held`: the bow's place in the view (camera space), shown at `heldScale` (a full-size bow would fill the
// view). All our picks (*guess*).
export const BOW = { held: { x: 0.09, y: -0.06, z: -0.7 }, heldScale: 0.6, drawTime: 0.9, minDraw: 0.15, speed: [14, 42], tap: 0.5, gravity: 9.81,
  len: 0.72, stick: 20, flight: 6, arrows: 12, pull: 0.32,
  grip: [0, -0.02, -0.005] }; // model-local leather-cylinder centre; hand fit is a visual guess (#910)
// #1954: the inventory (src/holdable.js): `slots` places for carried things, one of them the hand; `stack`: squirrel nuts that share a
// place (the user's numbers, 2026-11-15).
export const INVENTORY = { slots: 5, stack: 8 };
// #1953: the harpoon gun in the box by Höje å (src/harpoon.js, rules in src/harpoonflight.js). All *guess* (a ~0.75 m band speargun for
// fresh water; no product measured): `held` / `grip` the camera-space pose and the model-local hand point; `spear` its length (m);
// `speed` m/s off the gun; `drag` 1/s the water slows it by, `sink` m/s² it drops in water, `gravity` in the air; `line` m of line (the
// spear turns back when it is that far from the muzzle), `flight` s at most on the way out, `stuck` s it sits in something solid before
// it is reeled in, `reel` m/s on the way back; `hit`: m round a fish (+ `len` x its length) and round a shark's fin that count as a hit;
// `verdict` s to wait for the room's answer once the spear is back; `bank` m: how far a swimmer's catch is looked for a dry spot ashore.
export const HARPOON = { held: { x: 0.17, y: -0.2, z: -0.42 }, grip: [0, -0.06, 0.07], spear: 0.8, speed: 24, drag: 1.1, sink: 0.5, gravity: 9.81,
  line: 10, flight: 2.5, stuck: 0.35, reel: 14, hit: { fish: 0.2, len: 0.4, shark: 1.3 }, verdict: 3, bank: 25 };
export const RIFLE = { mag: 30, rpm: 600, spread: 0.012, range: 60, reloadDelay: 0.25, reloadSeconds: 1.6, magLife: 120, maxDrops: 6,
  held: { x: 0.17, y: -0.24, z: -0.56 },
  grip: [0, -0.062, 0.088] }; // model-local pistol grip center; hand fit is a visual guess (#913)
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
// seconds (the display counts down game time: × `clock` = 24 h / DAY.minutes, 1 at the real-time day #1145, so 20 s shows 0:20) at `temp` °C; it
// cooks fish fingers `rate` × as fast as the pan would, so one run makes them golden (FISH.fry.seconds, a little before
// the end) and they burn early in a third run (FISH.fry.burnAt, "left far too long"). Basket out mid-run: paused. Done: `beeps` beeps. The cord runs up
// the splashback to the corner wall socket's south mouth (KITCHEN_SOCKETS, 'corner-s', #442).
// #296 (the user): further into the corner and turned `rot`° (about y) so the front and basket face diagonally out of it,
// away from both splashbacks (+45 = front towards north-west). `x`, `z` put its rounded footprint (±0.22 m along x and z
// turned) 3.5 cm from the east and south splashbacks (5.50 / 5.484), its flat back towards the corner.
export const AIRFRYER = { x: 5.245, z: 5.229, rot: 45, w: 0.3, d: 0.38, h: 0.32,
  basket: { d: 0.25, h: 0.15, out: 0.2, in: 0.35 }, slots: 6, seconds: 20, temp: 200, beeps: 3,
  get clock() { return 24 * 60 / DAY.minutes; }, // (DAY is defined further down; read at run time)
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
// An ignored cat goes on its way (#1154, cat.js `update`): after `after` s in view with no engagement (a pat, being held or
// just put down, a fish finger, a kitten's toy) it walks off away from the visitor like after a pat (CAT_LEAVE) and is gone.
// Any engagement starts the count over; kept across a reload (keep.js `cat.i`). 60 s is the in-game report's wish (*guess*).
export const CAT_IGNORED = { after: 60 };
// A cat put down outdoors / on a roof (#1287) stays where it is (sitting) until picked up; left alone this long (s) it fades away
// there (it cannot walk home: nothing there to navigate, and it must not fall off an edge). *guess*
export const CAT_OUTDOOR = { stay: 600 };
// The cat walks on all four (#224, cat.js `pose`): it rises from sitting to standing in `rise` s before it walks and sits
// down again in the same time when it stops; a diagonal-pair gait, one leg cycle per `stride` m (× breed size), legs
// swinging ±`swing` rad, the hind knee flexing up to `knee` rad as the paw comes forward, the body bobbing `bob` m. Our picks.
// #1918: authored anatomy estimates (guess), relative to the established cat pivots.
// Immutable surfaces; pose/contact/gameplay anchors stay in cat.js.
export const CAT_SURFACE = {
  segments: { small: [8, 6], main: [12, 8], muzzle: [12, 8], eye: [8, 6], limb: 8, ear: [4, 3] },
  bodyWidth: .9, bodyTaper: .12, bodyDepth: .94, neckForward: .5, headScale: .92,
  headWidth: [.9, .12, .28, .5], headFrontDepth: .91,
  eye: [.0105, .0072, .003], pupil: [.0026, .0062, .0012],
  eyePosition: [.031, .012, .054], pupilDepth: .0025, eyeYaw: .3, eyeProfile: [.22, .8],
  shut: { scale: [.0105, .0014, .0015], y: .01, z: .056 },
  muzzleHeight: [.63, .16], muzzleDepth: [.76, .24],
  nose: { scale: [.0075, .005, .006], y: -.012, muzzleDepth: .67, offset: .004 },
  ear: { width: .029, taper: .75, base: -.012, height: .052, back: -.012, rim: .005, recess: .008,
    position: [.045, .056, -.005], rotation: [-.12, 0, -.18] },
  limbBulge: [1.04, 1.08],
  patch: { bodyZ: [.35, .75], bodyX: [.42, .68], headZ: [.55, .78], headX: [.10, .10, .26, .1] },
};
export const CAT_WALK = { rise: 0.3, stride: 0.3, swing: 0.4, knee: 0.6, bob: 0.006 };
// #542: assumed clearance for a resting cat on Entréplan below the high stair soffit.
export const CAT_FLOOR_HEADROOM = 0.8;

// A cat turning up behind a door sits up on visible furniture in that room this often (#200); reach in metres.
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
// the last `ending` s the recording speeds up; `volume` is its gain. Our picks.
export const TURBO = { cups: 3, window: 300, seconds: 120, max: 240, extend: 1, speed: 1.8, fov: 6, ending: 5, volume: 0.5 };
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
  beer: { color: 0xd99a1e, opacity: 0.92, tint: 1, name: 'öl' }, // existing patio beer finish; ordinary glass fill follows champagne (visual guesses)
  beerLots: 64, // #1007 conservative guess: bounded source ledgers per glass; refuse a new source before taking ml
  wine: { color: 0x5c0a1c, opacity: 0.92, tint: 1, name: 'vin' },
  champagne: { color: 0xeed98a, opacity: 0.6, tint: 1, name: 'champagne' },
  whisky: { color: 0xb8651c, opacity: 0.82, tint: 1, name: 'whisky' },
  milk: { color: 0xf7f5ef, opacity: 1, tint: 2.5, name: 'mjölk', withCoffee: 0xc39a6b }, // withCoffee: its colour in a mix with coffee (café au lait, #168); tint 2 → 2.5 with the darker coffee (#316) so a splash lightens it as much as before
  coffee: { color: COFFEE.color, opacity: 1, tint: 1, name: 'kaffe' }, // #316: dark roast
  water: { color: 0xd8ecf6, opacity: 0.35, tint: 0.2, name: 'vatten' }, // tap water in the life sim's drinking glass (#382): clear, a light tint
  pour: {
    glass: { beer: { to: 0.85 }, wine: { to: 0.45 }, champagne: { to: 0.85 }, whisky: { add: 0.2 }, milk: { to: 0.75 } },
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
  reach: 0.4, reachTime: 0.4, size: 0.95, cuff: 0.085, boxCurl: 0.75, palmCurl: 0.14, palmPitch: -0.32, petCurl: 0.15, hugCurl: 0.45, // palmPitch: level palm under ball (*guess*, #914); petCurl: stroking the cat (#242); hugCurl: round Pingping (#269)
  // The Spider-Man suit's arms (#636, hand.js `suit`; all *guess*, camera space like `rest`): shooting a web = the classic
  // pose (palm up, index and little finger out, middle and ring finger folded in, the thumb over them — the `web` pose)
  // with the palm at `webAt` for `webHold` s after the shot, `webEase` s in and out; the strand leaves the palm (spidersuit.js).
  // Swinging (#911): camera-space resting targets follow the anchor slightly, without pushing either hand out of view.
  // The free left target is in its mirrored frame; a relaxed curl avoids a rigid spread. All pose values are visual guesses.
  // Climbing: both hands flat on the wall at `climbAt` (right hand; the left mirrored), reaching `climbReach` m along the
  // way you move, one cycle per `climbStride` m climbed (hands alternate), the fingers tipped `wallTilt` rad off the vertical towards the wall.
  suit: { webAt: [0.17, -0.1, -0.44], webHold: 0.9, webEase: 0.16, webKick: 0.04,
    swingAt: [0.18, -0.12, -0.43], swingFollow: 0.1, // guess: visible wrist with a small anchor response
    swingLeftAt: [0.2, -0.12, -0.45], swingLeftFollow: 0.04, swingLeftCurl: 0.15, swingLeftSpread: 0.25, // guess: free relaxed hand
    climbAt: [0.23, 0.03, -0.34], wallTilt: 0.35, climbReach: 0.16, climbStride: 1.1, climbFade: 0.25 } };

// #1917: authored visual hand/forearm profiles, in the existing Hand frame (metres before HAND.size).
// These are anatomy/art guesses, not measured personal dimensions. The four finger anchors and grip controls stay fixed;
// the thumb metacarpal starts inside the palm, and the same fitted anchor is used by its ring.
export const HAND_SURFACE = {
  radial: 16, fingerSteps: 18, palmSteps: 18, palmRadial: 32, knuckleEdgePower: 8,
  // z, half palm width (Y), back depth (-X), palm depth (+X).
  palm: [[-.098,.031,.0223,.0223],[-.065,.029,.021,.021],[-.028,.0255,.017,.018],
    [-.004,.027,.014,.019],[.019,.035,.013,.022],[.042,.040,.014,.022],
    [.064,.040,.014,.021],[.082,.039,.013,.018],[.096,.034,.010,.014]],
  thenar: { y:.020,z:.032,width:.022,length:.035,depth:.004 },
  knuckles:[[-.040,.081],[-.028,.087],[-.0095,.095],[.0095,.098],[.029,.095],[.040,.089]],
  thumbStart:[.002,.018,.012],
  tendons: { from:.018,to:.088,depth:.0013,width:.0045 },
  knuckle: { depth:.0035,width:.011,length:.013,offset:.008,relaxed:.4 },
  fingerShape: [[0,1],[.15,1.04],[.35,.94],[.48,1.01],[.64,.90],[.75,.91],[.88,.80],[.97,.46],[1,0]],
  fingerDepth:.88, nail: { steps:4,radial:8,from:.77,to:.94,arc:.64,depth:.00055,shade:1.08 },
  creases: { steps:20,width:.00035,lift:.0001,shade:.94,paths:[
    [[-.026,.065],[-.008,.059],[.014,.061],[.028,.069]],
    [[-.027,.041],[-.011,.042],[.008,.047],[.023,.049]],
    [[.011,.008],[-.002,.023],[-.002,.044],[.014,.059]],
  ] },
  // shoulder-to-cuff normalized Z; width/depth remain in metres, as the original sleeve.
  arm: [[0,.050,.0425],[.20,.048,.041],[.45,.045,.038],[.68,.042,.035],[.86,.0375,.032],[1,.036,.0306],[1.025,.033,.028]],
  bareArm: [[0,.045,.037],[.20,.041,.032],[.45,.037,.026],[.70,.033,.023],[.90,.029,.020],[1,.027,.019],[1.05,.022,.015]],
};

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

// Crash reports (#629, src/crashlog.js): only with the cloud on (CLOUD_URL / &cloud=). All numbers are our own picks (*guess*),
// kept small so the report is cheap and the Worker's cap (cloudflare/crash.js) is never reached by honest use.
export const CRASHLOG = {
  beatMs: 2000,        // heartbeat to localStorage: one small JSON write, outside the render loop
  deadIfWithinMs: 6000, // a "running" beat this fresh at start = another tab of the same browser is alive, not a crash
  quickReturnS: 180,   // #1629: a 'killed' report whose next start came within this many seconds is `why: 'quick'`, later ones `late` (likely closed browser / power-off); a classification, not a filter
  maxBytes: 12_000,    // a report is trimmed below this before sending (the Worker refuses > 16 kB)
  perSession: 12, perDay: 20, // bounded reports; ordinary errors once a day, distinct WebGL episodes separately (#642)
  historySamples: 12, // ~24 seconds of cheap pre-failure counters at beatMs; diagnostic choice, not a device limit
  errorLines: 20, actions: 12, // ring buffers: last console.error lines, last key / tap events
  layoutTolerance: 2, layoutChecksMs: [300, 1000, 3000], layoutPerSession: 3, // #567: canvas vs surface: px off that counts, checks after a resize / rotation, layout reports per page
  textureEveryMs: 60_000, textureSliceMs: 1.5, // the texture-memory estimate walks the scene (~25 ms in all): this often, in slices of this many ms 40 ms apart
};

// #511: four packages on the front of the upper free fridge shelf. Dimensions are model assumptions
// based on normal 330/440/473/500 ml packages, not product-specific measured drawings.
export const BEER_SHELF = {
  endpoint: CLOUD_URL + '/beer-shelf', defaultURL: './data/beer-shelf-default.json', timeout: 8000,
  cache: 'lunden.beerShelf.v1', y: 1.523, frontDepth: 0.11, across: [-0.33, -0.11, 0.11, 0.33],
  can: { diameter: 0.066, height330: 0.115, height440: 0.149, height473: 0.168, height500: 0.168, tabRadius: .009, tabWire: .0015, tabDepth: -.005 },
  bottle: { diameter: 0.065, height330: 0.23, height500: 0.27, neck: 0.018, bodyFraction: .63, shoulderFraction: .15, neckFraction: .22, capHeight: .006 },
  productCrop: [.12, .24, .76, .57],
};
// #587: a beer taken from that shelf and drunk straight from the can / bottle (src/beercan.js). Game parameters (our picks,
// *guess*): `sips` gulps empty any package whatever its ml, `lift` = how much higher the empty one rides in the hand.
export const BEER_CAN = { held: { x: 0.2, y: -0.27, z: -0.44 }, sips: 5, lift: 0.02, cooldown: 0.6 };


// The score (#198, the global leaderboard; #197 shows it in the HUD), balanced (the user): you can grind for ever, but
// what is easy to repeat gives little and what is rare or hard gives a lot. Our picks.
//  each:   points per counted event (stats.js `bump`), every time.
//  first:  points for each distinct thing the first time (each door, lamp, seat, tap, cabinet front, room, song …:
//          `bump(key, n, id)`; without an id the key itself = one thing); `again` = points for every time after that.
//  breeds: points per cat found, by how rare its breed is (cat.js BREEDS weights: huskatt 70, siames 8, brittiskt
//          korthår 7, maine coon 6, norsk skogkatt 5, perser 3, sphynx 1 of 100); `first.coats` once per new coat.
//  secrets: the secret drawer — `kinds` once per surprise kind found, `rare` once more per rare kind (+ each.secrets).
export const SCORE = {
  taskDayBonus: 15, // #994: completed three-task daily set (*guess*, ordinary first sandwich/bed reward scale).
  // #709: points per task, first completion / later daily completions (*guess*).
  tasks: {
    grillChicken: { first: 45, again: 8 }, // #710: hard discovery task (*guess*, suggested 40–50); one reward per local calendar day
    makeSandwich: { first: 15, again: 3 }, resetKitchen: { first: 30, again: 5 },
    snackClean: { first: 10, again: 2 }, tidyHall: { first: 20, again: 4 },
    washDish: { first: 10, again: 2 }, makeBed: { first: 15, again: 3 },
  },
  each: {
    love: 100, // #1398: the initiator earns +100 for a completed, server-accepted kiss (user).
    petted: 8, catPhotos: 2, catFish: 25,                 // a pat (a cat to find first), its photo; feeding one takes a plan
    medalPoints: 1,                                       // medal bonus points (#1711, src/medalcatalog.js bonusFor), added via bump('medalPoints', n)
    ponyPets: 1,                                          // a pat of a paddock pony (#1320)
    duckFeeds: 6,                                         // #1827 (*guess*): capped via DUCKS.scorePerDay, every feed still counts
    squirrelFeeds: 6,                                     // a squirrel took a nut from the hand (#1672, *guess*)
    fishFeeds: 6,                                         // a river fish took a cracked mussel from a swimmer's hand (#1946, *guess*: as a squirrel)
    kittenPets: 12,                                       // a kitten's pat on top of `petted` (#363)
    target: 0, splashes: 0.2, cuts: 0.1, magic: 0.3,      // Nerf target: scored via TARGET_SCORE (#1708), not here
    footballGoals: 1, // #1853: exactly one base point per server-counted goal, no new medal/bonus
    baskets: 6, threes: 6, dribbles: 0.1,                 // a three = a basket + a three (12)
    turbo: 20,                                            // three cups of coffee in five minutes
    beer: 0.3, coffee: 0.3, wine: 0.3, champagne: 0.3, whisky: 0.3, milk: 0.3, kask: 0.6, water: 0.2, // sips (water: the drinking glass, #382)
    washed: 0.3, scraped: 0.2, dishwasher: 3, rubbishOut: 3, // … a rubbish bag carried out to the drop-off (#387)
                // … and a dishwasher programme run to the end (#385)                            // a thing washed up by hand, a plate scraped into the bin (#383)
    fish: 0.5, fried: 2, chicken: 1, cooked: 8, brews: 2, // cooked retains legacy earned points (#160)
    catFishFeeds: 5, // #1766: a cat ate a raw caught fish (*guess*, once per fish; below a fish finger's catFish)
    fishEaten: 3, fishCooked: 4, // #1754: a caught fish eaten up / cooked through without burning (*guess*; the catch itself scores by species, FISHING.points)
    grilledChicken: 35, // #708: one whole chicken grilled golden (*guess*, issue suggests 30–40); once per bird
    fries: 0.2,                                           // per fry eaten (#301): a bunch is four
    cucumberSlices: 0.2,                                  // a slice of cucumber cut (#376)
    posted: 3, thrown: 0.5, drawn: 2,
    secrets: 1, stairs: 0.3, steps: 0.01,
    danceSeconds: 1, // #1829 (*guess*), capped via DANCE.scorePerDay
    gymReps: 1, // #1828: per completed outdoor exercise cycle (*guess*), daily-capped by OUTDOOR_GYM.scorePerDay
    shatterRange: 1,                                      // something shot to pieces from afar: per range point (#263)
    pvpHits: 5,                                           // another player hit (#667); the room allows COMBAT.perMinute points a minute
  },
  first: {
    doors: 2, lids: 1, flushes: 2, taps: 1, fridge: 2, appliances: 2, cabinets: 1, lights: 1, sat: 2, lay: 2,
    visited: 5, songs: 3, read: 5, car: 15, grill: 10, hood: 3, tv: 3, pc: 5, parasol: 3, clock: 3, calendar: 3,
    blinds: 2, // per window's blind, the first time it is drawn up or down (#273)
    curtains: 2, // Sovrum 1's curtains drawn (#342), like a blind
    cleanRoom: 15, // the first clean room: "Rent i köket!" (#390)
    coats: 10, greets: 2, // greets: per person greeted (#247); since #670 the other players (#673: once per player and session)
    catButts: 15, // a cat's bum seen from behind with its tail up (#262): per cat, then `again` per tail-up
    walkRain: 15, walkSnow: 25, walkHail: 40, walkStorm: 30, // out in the weather (#249): the first time, then `again` per shower
    shattered: 5, // per kind of thing shot to pieces (#263)
    pingpingHugs: 10, // hugging Pingping (#269)
    kittens: 300, // a kitten found (#363): the first one, then `again` per kitten (on top of its breed's points)
    miele: 1000, mieleHugs: 20, // Miele found (#328): the rarest find there is (4 × a sphynx), then `again` per find; a hug
    carMusic: 3, // per song played in the car (#268), like the speakers' songs
    olof: 25, // greeting our driver: the first arrival, then `again` per new arrival
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
    hotdogs: 20, // #1124: a hot dog (a grilled sausage in a bun) eaten: the first time, then `again` (guess)
    sandwiches: 40, // a sandwich made and eaten (#380): the first of each combination ("ost- och gurkmackan" …), then `again`
    tasks: 30, // legacy generic rewards (#392), retained only for #709 score migration
    sharkFin: 400, // #1769: the shark caught in Höje å (src/shark.js), once; no `again` (*guess*)
    fishQuest: 150, // #1754: the hidden fishing quest (src/fishquest.js) completed, once; no `again`. The hardest daily task gives 45 the first time (*guess*)
    handBrew: 10, // the first pot brewed by hand: water and coffee filled first (#334); no `again` (each brew has `each.brews`)
  },
  again: {
    hotdogs: 2,
    sandwiches: 4, // every sandwich after the first of its kind (#380)
    tasks: 5, // legacy generic repeat reward, retained for #709 score migration
    doors: 0.1, lids: 0.1, flushes: 0.2, taps: 0.1, fridge: 0.1, appliances: 0.1, cabinets: 0.05, lights: 0.05,
    sat: 0.1, lay: 0.1, songs: 0.2, read: 0.5, car: 1, grill: 1, hood: 0.2, tv: 0.2, pc: 0.3, parasol: 0.2,
    clock: 0.1, calendar: 0.1, greets: 0.1, catButts: 1, walkRain: 2, walkSnow: 3, walkHail: 4, walkStorm: 3,
    shattered: 0.3, carMusic: 0.2, pingpingHugs: 0.2, miele: 100, kittens: 120, mieleHugs: 0.5, blinds: 0.05, curtains: 0.05, airfried: 0.5, friesCooked: 0.5, toaster: 0.2,
    fruit: 0.3,
    olof: 5,
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
    catShot: { rifle: 20, saber: 10, dart: 5, wand: 3 }, kittenShot: { rifle: 30, saber: 15, dart: 8, wand: 5 }, // a kitten: extra bad (#363)
    pvpHurt: 2, // hit by another player in a fight (#667, *guess*)
    spray: 1 }, // #1707: each started second of spraying with a spray can (the user: "kostar poäng"; 1 per second is a *guess*)
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
// find. `weight` = her draw weight among BREEDS (whose weights add up to 100): 1.5 ≈ 1 in 68 cats (*guess*, #1134 raised it
// from 0.56 ≈ 1 in 180, which nobody ever met); at most once until she has walked off. `daily` (#1134, *guess*): until she has
// been seen on the visitor's local date, the k-th new cat of that day (1-based) is her with an extra chance
// clamp((k − grace) / (by − grace), 0, 1) on top of `weight`: the first `grace` cats are ordinary draws, then 1/6, 2/6 … and
// the `by`-th cat at the latest is her (with CHANCE_APPEAR 0.3 roughly 25 door openings, a short play session). Median
// about the 5th cat, so she still feels like a find rather than a fixture; once seen today only `weight` applies again. Seen within `see` m (on screen, no wall between) she counts:
// heart fireworks (`fireworks` shells that pop into `sparks` small hearts each over ~`life` s), SCORE.first.miele.
// E takes her into your arms like Pingping: `held` = where she sits (camera space, her feet), `tilt` back (rad), the
// hands round her sides at `grips` (her frame); a hug (click / "Krama") pulls her in `pull` m, squeezed by `squash`,
// over `hugTime` s. Put down she looks at you for `linger` s, then walks off. Coat colours read off docs/miele-foto-ram.jpg.
export const MIELE = { weight: 1.5, daily: { grace: 2, by: 8 }, see: 7, fireworks: 7, sparks: 12, life: 3,
  held: { x: 0.0, y: -0.43, z: -0.5, tilt: -0.3 }, grips: [[0.108, 0.16, -0.005], [-0.108, 0.16, -0.005]], // *guess* #914: sides of ribcage
  pull: 0.08, squash: 0.12, hugTime: 0.8, linger: 2,
  carryPurr: 3.2, // #1061 *guess*: two breathing cycles per renewable, cancellable carry sound (s).
  colors: { base: '#857461', light: '#a8977f', stripe: '#2a231e', white: 0xf3f1ec, ear: 0x6b5a48, tip: 0x241e1a, eye: 0xe0a62a } };
// The leaderboard: how many rows are shown, how often a changed score is sent (s).
export const LEADERBOARD = { show: 10, every: 30, nameMax: 20 };
// Other players as ghosts with a name tag (#666, src/ghosts.js; the room and its cost cap: cloudflare/players.js). Only with
// the cloud on (CLOUD_URL / &cloud=); `enabled: false` or ?mp=0 switches it off. The client sends at most `hz` states a
// second and only when it moved (more than `move` m or `turn` rad), a heartbeat every `beatMs` (auto-answered, not billed),
// and disconnects when the tab is hidden or after `idleMs` without moving (reconnects on the next step). Reconnect delays
// `retry` (ms, growing), a full room `fullRetry`, a room switched off by the admin brake `offRetry`; the month's cap (close
// 4001) keeps it off for the rest of the calendar month. Look: `opacity`, drawn `delay` ms behind (interpolation), hidden
// beyond `far` m, the name tag beyond `tagFar` m, at most `max` ghosts. All our picks (*guess*).
// #1147: guessed cradle in the avatar's unscaled figure frame; natural cat size is preserved.
export const GHOST_CAT = { gripWidth: .16, gripY: 1.02, gripZ: .38, elbow: [.6, -.6, -.5] };
// `jump`: a state this many metres from the last is a teleport (the children's room, #1319): the others' ghost appears there instead of streaking across the map
export const GHOSTS = { enabled: true, hz: 5, move: 0.02, turn: 0.03, beatMs: 10_000, idleMs: 120_000,
  stateEvery: 400, // #1763: a changed state is sent at least this often (ms) even while the outbox (squirrel / paddock snapshots, shots) waits; the rest of the hz budget stays the outbox's (*guess*, the issue's ~400 ms)
  resendMs: 3000, // #1759: a state left unchanged this long is sent once more (the room's per-second limit may have dropped it after a network stall's burst; *guess*)
  retry: [2000, 5000, 15_000, 30_000, 60_000, 300_000], fullRetry: 60_000, offRetry: 600_000,
  opacity: 0.25, delay: 200, jump: 100, far: 900, tagFar: 15, max: 30, // #1296: `far` reaches across the whole walk/fly area (WALK x -260..320, z -200..250 is ~740 m corner to corner, camera far 1000); beyond `tagFar` the tag grows with distance (constant angular size, never fogged) so a far player stays a visible marker instead of vanishing
  lod: { start: 30, end: 37, margin: 1 }, // #1966: from `start` m a plain standing player fades (src/lod.js) into the shared far figure, only that beyond `end`; it starts where the pose stops (AVATAR.poseFar); `margin` m of slack for both buffers (*guess*)
  tagWidth: 0.64, tagHeight: 0.16, tagY: 1.98, tagNamePx: 22, tagScorePx: 18, // #672: 20% smaller sprite; two compact lines (*guess*)
  scoreMax: 1e7, // matches the existing leaderboard validation in cloudflare/worker.js; display only, not authoritative
  outbox: 3, // outbox: shots waiting for the 5 Hz budget (#667)
  outboxHard: 8, // #1777: the player's own one-off actions (river fish catch, door, squirrel take / put / feed, pool, music …) may wait up to this many; snapshots / cosmetic events never beyond GHOSTS.outbox (*guess*: a few rare clicks within a 5 Hz budget)
  // #673: greeting another player (E on them): one of `hello` (an index goes to the room, never free text; {n} = their
  // name), at most one every `greetEvery` s (the room allows the same), the greeter's ghost waves its right arm `wave` s for
  // everybody who sees it. Our picks (*guess*).
  hello: ['Hej {n}!', 'Tjena {n}!', 'Hallå där, {n}!', 'Hej {n}, vad kul att ses!', 'Hej hej!', 'Tjenare!'], greetEvery: 3, wave: 2.5 };
// Join / leave notices (#1333, src/joinnotice.js, shown as a badge at the top by main.js): someone else is only announced as gone
// after `graceMs` without coming back (an Alt+Tab or short tab switch disconnects at once, so it must not count; they are
// recognised by name), notices within `batchMs` become one line naming at most `names` players (then "och N till"). `anon` =
// the name of a player without one. Our own picks (*guess*).
export const JOIN_NOTICE = { graceMs: 45_000, batchMs: 1500, names: 3, anon: 'Anonym' };
// The players' avatars (#705, src/avatar.js): a neutral human figure (Olof's skeleton, src/olof.js) in the ghosts' place and in our
// own mirror image (#691). Without a weapon only an outline: alpha `fill` inside (very faint) rising to `rim` at the silhouette
// (a fresnel term of power `rimPower`, in the shader, no extra pass), a little emissive so it reads in the dark; armed and solid it
// is lit normally (`emissiveSolid`). `walkSpeed` m/s: above it the legs walk; `poseFar` m: beyond it the pose is not updated;
// `bodyTurn` rad: how far the head may turn from the body before the body follows. All by eye (*guess*).
export const AVATAR = { fill: 0.07, rim: 0.85, rimPower: 2.2, emissiveOutline: 0.28, emissiveSolid: 0.06, walkSpeed: 0.25, poseFar: 30, bodyTurn: 0.9 };
// #1916 visual guesses in the unchanged humanoid bone frame (metres): continuous
// elliptical ring surfaces [height, half-width, half-depth, centre-z]. Rings at
// either side of an elbow/knee share the same surface and blend the existing bones.
// These are artistic proportions, not measured anatomy or gameplay colliders.
export const AVATAR_SURFACE = {
  // #1995 authored surface-response guesses: one PBR material, no image maps.
  // Detail is in bind-pose metres and fades with pixel footprint at distance.
  finish: { skin: 0.55, cloth: 0.92, hair: 0.48, eye: 0.16, shoe: 0.72, accessory: 0.6,
    metalRoughness: 0.28, metalness: 0.72, weaveRate: 950, weaveStrength: 0.045,
    hairSway: 0.18, hairBend: 12, hairRate: 170, hairStrength: 0.09, skinRate: 155, skinStrength: 0.018 },
  sides: 12, jointBlend: 0.055, wristBlend: 0.028, shoulderBlend: 0.45,
  attachInner: [0.03, -0.04], attachHeight: [-0.04, 0.05], clothOverlap: 0.005, jawTop: 0.075,
  folds: { jointWidth: 0.12, cuffWidth: 0.05, jointRate: 95, cuffRate: 120, cuffStrength: 0.6, legCuff: -0.79, legWide: [-0.07, -0.42], angle: 2 },
  arm: [[0.05, 0.012, 0.014], [0.035, 0.038, 0.039], [0.005, 0.054, 0.051], [-0.035, 0.055, 0.05],
    [-0.08, 0.05, 0.045], [-0.13, 0.044, 0.042], [-0.19, 0.041, 0.041], [-0.235, 0.036, 0.038],
    [-0.26, 0.035, 0.036], [-0.28, 0.035, 0.036], [-0.30, 0.035, 0.036], [-0.325, 0.038, 0.038],
    [-0.36, 0.039, 0.038], [-0.405, 0.035, 0.034], [-0.455, 0.029, 0.03], [-0.49, 0.025, 0.027],
    [-0.525, 0.021, 0.024], [-0.55, 0.019, 0.023], [-0.575, 0.019, 0.023]],
  // #2001 authored ribcage and sewn shoulder loft, torso-local metres.
  // The three hole rows must remain consecutive, with 24 torso / 12 arm sides.
  // The first horizontal arm ring and short cuff sit BELOW the hole, so the
  // 90-degree change of cross-section cannot fold the inner attachment back.
  body: { sides: 24, hole: [.40, .475, .55], armStart: -.17, armholeRound: .57735026919,
    shoulderRows: [.2, .4, .6, .8, .9], shoulderBulge: [.022, .009], pumpJoin: .4,
    chest: .007, bust: .017, chestAt: .43, chestWidth: .14, hemShade: .90,
    // #2019 the sweater's lowest rings flare out by `hemFlare` m (guess; a hem lying over the waistband, not on it) and fade out between the heights `hemFlareTo` (m), so the hem stands clear of the trousers' seat and thighs instead of z-fighting with them.
    hemFlare: .014, hemFlareTo: [-.012, .12],
    hoodieLength: .055, hoodieTaper: .25, hoodieEase: .008,
    // #2022 pose-driven corrective (src/avatararmfix.js), replacing #2013's static follow weights; guesses chosen by a random search on
    // tools/avatarshouldervolume.mjs. `lift`: smoothstep edges on the upper arm's elevation in the torso frame (−1 hanging, 0 horizontal).
    // A lifted arm moves up to `share` of the torso weight within `radius` m of its shoulder pivot (height scaled by `tall`; `low` = share
    // kept below the pivot, faded over ±`blend` m) to the shoulder bone, and re-blends the sewn shoulder rows' torso share τ as (1-τ)^rows,
    // `rows` = [below, above, height m from the pivot, blend m]. Hanging, forward and rifle-hold arms keep the plain rig weights.
    armFix: { lift: [-.6, -.2], share: .13, radius: [.05, .21], tall: .6, low: .33, blend: .17, rows: [1.03, .96, -.09, .034] },
    male: [[-.025,.174,.119],[-.012,.174,.119],[.045,.166,.117],[.12,.155,.11],
      [.25,.145,.102],[.34,.163,.112],[.40,.179,.119],[.475,.187,.122],[.55,.166,.102],
      [.578,.12,.076],[.596,.071,.060],[.607,.056,.055]],
    female: [[-.025,.177,.123],[-.012,.177,.123],[.045,.169,.120],[.12,.149,.106],
      [.25,.132,.095],[.34,.153,.111],[.40,.169,.12],[.475,.176,.119],[.55,.156,.098],
      [.578,.114,.074],[.596,.069,.060],[.607,.056,.055]] },
  leg: [[0.04, 0.042, 0.052], [0.015, 0.066, 0.076], [-0.04, 0.079, 0.083], [-0.12, 0.077, 0.079],
    [-0.22, 0.07, 0.071], [-0.31, 0.061, 0.061], [-0.375, 0.052, 0.054], [-0.41, 0.049, 0.052],
    [-0.44, 0.05, 0.052], [-0.47, 0.049, 0.051], [-0.51, 0.052, 0.053], [-0.57, 0.055, 0.059],
    [-0.63, 0.052, 0.057], [-0.7, 0.045, 0.05], [-0.77, 0.038, 0.042], [-0.81, 0.036, 0.038], [-0.845, 0.035, 0.037]],
  sleeve: { ease: 0.006, short: -0.195, long: -0.49, fold: 0.003 },
  trouser: { ease: 0.004, fold: 0.0035 },
  // #1995 the head's column concentration toward the front and the extra head rings once added for the nose; the nose itself is
  // AVATAR_NOSE since #2048 (src/avatarnose.js, on its own finer grid inside these rings).
  nosePatch: { concentration: 1.65, rings: [0.065, 0.080, 0.087, 0.116, 0.134] },
  headSides: 24,
  head: [[-0.022, 0.020, 0.050, 0.035], [-0.012, 0.041, 0.060, 0.034], [0.005, 0.057, 0.065, 0.03],
    [0.025, 0.073, 0.078, 0.025], [0.05, 0.084, 0.088, 0.02], [0.075, 0.096, 0.099, 0.014],
    [0.1, 0.103, 0.108, 0.01], [0.125, 0.101, 0.105, 0.01], [0.15, 0.093, 0.097, 0.01],
    [0.175, 0.081, 0.084, 0.01], [0.195, 0.063, 0.067, 0.01], [0.211, 0.04, 0.044, 0.01], [0.221, 0.001, 0.001, 0.01]],
  face: { cheek: [0.003, 0.05, 0.04, 0.073, 0.035], brow: [0.003, 0.127, 0.018], chin: [0.003, 0.01, 0.025], socket: [0.013, 0.022, 0.013], front: [0.25, 0.9] },
  eye: { upper: 0.0054, lower: 0.0042, outer: [0.0175, 0.008], skinLift: 0.0006, normalStep: 0.001, columns: 12, rows: 4, irisDepth: 0.22, pupilDepth: 0.12, lidDepth: 0.9, scleraBase: 0.85, scleraRound: 0.15 },
  cloth: { waistFold: 0.003, sideFold: 0.003, waveAngle: [3, 2], waveHeight: [38, 30], waist: [0.10, 0.10], side: [0.32, 0.16], rings: [0.075, 0.10, 0.17, 0.21, 0.30, 0.36, 0.40] },
  hair: { wave: 0.0016, frequency: 7, flow: 2, part: [-18, 7, 0.003], streak: 0.12,
    // #2012 fine strands round the head bone's axis (hair and facial hair): `strands` per turn, `sway` radians of
    // waviness at `bend` rad/m of height, `strength` the shade contrast. Guesses by eye, faded with pixel footprint.
    strands: 72, sway: 0.09, bend: 40, strength: 0.13 },
};
// #2048 the nose (src/avatarnose.js), all *guess* by eye against the before views (docs/verification/2048) in raking light,
// head-bone metres before faceWarp (the face looks +z; eye centre y 0.107, lip seam 0.043). `dorsum` rows top first
// [y, half width, projection]: the bridge narrowest between the eyes, widest at the tip, narrowing under it into the columella.
// `tip` / `base` / `ala` / `nostril`: [height or depth m, x (mirrored), y, half width, half height]; the tip's two domes, the lower
// nose's body between the wings, the alar wings (`ala[5]` the edge's sharpness: higher = flatter top, steeper crease) and the
// nostrils' dip. `blend` the smooth maximum's fillet m where forms meet. `crease` [-, radius (of the wing's), width] the alar
// crease's ambient occlusion. `maxProjection` scales the vertex attribute noseBlend (≥ the highest point). `grid`: the finer
// skin round the nose, `columns` head columns either side of the middle and the rings from `top` to `bottom` replaced by a grid
// of columns `x` (mirrored) and rows `y` (top first). `mask`: the sliders' reach (after faceWarp): across from `x[0]` to
// `x[1]` (low) / `x[2]` (up the bridge, between `narrow` heights), vertically `y` [in from, in to, out from, out to], width only
// below `widthTop`, length about `pivot` times `length`. `shade`: the nostrils' albedo darkening and its power, the ambient
// light taken from [nostril, crease]. A shape variant (#2049) scales these forms.
export const AVATAR_NOSE = {
  body: [[0.140, 0.0075, 0], [0.130, 0.0072, 0.0012], [0.121, 0.0070, 0.0032], [0.112, 0.0078, 0.0058], [0.104, 0.0090, 0.0096],
    [0.096, 0.0106, 0.0146], [0.089, 0.0124, 0.0182], [0.083, 0.0140, 0.0198], [0.0785, 0.0150, 0.0200], [0.0750, 0.0150, 0.0190],
    [0.0720, 0.0155, 0.0160], [0.0695, 0.0158, 0.0105], [0.0675, 0.0150, 0.0055], [0.0655, 0.0140, 0.0020], [0.0635, 0.0130, 0]],
  ridge: [[0.124, 0.004, 0], [0.112, 0.0042, 0.0006], [0.098, 0.0046, 0.0012], [0.086, 0.0052, 0.0010], [0.078, 0.0055, 0]],
  tip: [0.0022, 0.0028, 0.0775, 0.0055, 0.0055],
  ala: [0.0056, 0.0148, 0.0676, 0.0078, 0.0716, 0.0058, 0.0046, 2.2, 0.7],
  nostril: [0.0045, 0.0055, 0.0663, 0.0036, 0.0024],
  blend: 0.008, crease: [0.0012, 1.0, 0.25], maxProjection: 0.025,
  grid: { columns: 3, top: 0.142, bottom: 0.05,
    x: [0, 0.0019, 0.0038, 0.0057, 0.0077, 0.0098, 0.0119, 0.0140, 0.0163, 0.0190, 0.0222],
    y: [0.135, 0.126, 0.117, 0.108, 0.100, 0.093, 0.087, 0.082, 0.0785, 0.0755, 0.0728, 0.0703, 0.068, 0.0658, 0.0636, 0.0612, 0.0588, 0.0563] },
  mask: { x: [0.006, 0.032, 0.02], narrow: [0.085, 0.105], y: [0.05, 0.064, 0.1, 0.12], widthTop: [0.088, 0.11], pivot: 0.09, length: 0.5 },
  skin: [0.04, 0.3],
  shade: { nostril: 0.7, nostrilPower: 2, ambient: [0.5, 0.35] },
};
// #2060 the nose width slider's sideways reach (src/avatarnose.js noseMask), head-bone metres after faceWarp, [low, at the bridge]
// blended over AVATAR_NOSE.mask.narrow: a point at x moves by (width − 1) · x / (1 + (x / peak)²) faded out from `from` to `reach`.
// #2048's x · smoothstep fade piled the moved cheek up in a thin ring round the wings (squeezed to a quarter at the widest
// slider: a shading edge). This keeps most of the wing's movement (12 mm between the narrowest small and the widest large nose,
// 13 before) but spreads the cheek's over 4 cm, still narrow at the bridge so the inner eye corners stay put. *Guess* by eye,
// tuned so no strip of skin is squeezed below about 0.65.
export const AVATAR_NOSE_WIDTH = { peak: [0.024, 0.0125], from: [0.0075, 0.002], reach: [0.055, 0.02] };
// #2049 the nose's shape variants (src/avatarnose.js noseFormOffset), a look field `noseForm`: 0 straight (#2048's nose, the default
// and every old code), 1 convex (aquiline), 2 upturned (snub), 3 broad with a flat bridge. All 26 lowercase tags are taken, so it
// shares the nose size's `n` tag: the value is `noseSize + 10 * noseForm` (`n6` a larger straight nose as before, `n14` a
// middle-sized convex one); an old client reads a combined value as the middle size. Each variant is a smooth offset of the
// bind position in the vertex shader (uniform uNoseForm, the variant's weights), so the geometry stays shared and the
// size / width sliders still apply on top. All *guess* by eye, head-bone metres after faceWarp (the vertex shader's frame, eye
// height 0.107, the tip at 0.0775). `box`: [x half width, y from, y to] where the offsets act. `hump` (convex): a bump on the
// dorsum [height, y, half height, half width] and the tip's `droop` m down (times noseBlend, below `low` [from, to] in y);
// `upturn`: the tip's `lift` m up (times noseBlend, below `low`) and a `scoop` [depth, y, half height, half width] in the
// dorsum; `broad`: the bridge's projection lowered by `flat` [bridge, tip] shares (blended over `split` in y) and the nose
// widened by `widen` across `x` [from, reach low, reach at the bridge] (narrowing between `narrow` heights) faded in over
// `bottom` (the upper lip stays put) and out over `top` in y (the inner eye corners stay put). `fd` m: the vertex shader's finite-difference step for the normals,
// `faceRound` m the face's sideways curvature radius (the widening follows it back; taken out of the slope a normal implies).
export const AVATAR_NOSE_FORMS = {
  names: ['Rak', 'Böjd', 'Uppnäsa', 'Bred'], label: 'Näsans form',
  box: [0.052, 0.05, 0.145],
  hump: [0.0032, 0.098, 0.017, 0.0095], droop: 0.003, low: [0.079, 0.095],
  upturn: { lift: 0.005, scoop: [0.002, 0.094, 0.014, 0.0085] },
  broad: { flat: [0.45, 0.12], split: [0.078, 0.098], widen: 0.2, x: [0.004, 0.05, 0.02], narrow: [0.08, 0.1], bottom: [0.052, 0.064], top: [0.096, 0.114] },
  fd: 0.0005, faceRound: 0.1,
  slopeFade: 0.002, // #2060: m of nose height over which the height's slope (from the normal) fades in, *guess* (no step in shading at the nose's edge)
};
// #2043 the head's silhouette (src/avatarcontour.js), head-bone metres, *guess* by eye against the before views
// (docs/verification/2043). rings: extra head-shell heights on the cubic profile through AVATAR_SURFACE.head / AVATAR_FACE.jaw,
// only where the outline curves (jaw angle, chin, cheek, back of the skull, crown); chin: the flat underside rounded as a
// quarter ellipse `depth` deep, one ring per `angles` (degrees); neck: rings top first [y, rx, rz, centre z], open at both
// ends (the top inside the head, the bottom inside the collar; the old cylinder spanned y -0.04..0.08, the neck slider's
// range), set back under the jaw, `sides` columns; larynx [y, half height, half width] m and its bump (male, female).
export const AVATAR_CONTOUR = {
  rings: [-0.0035, 0.015, 0.0375, 0.0575, 0.108, 0.142, 0.1625, 0.185, 0.203],
  chin: { depth: 0.006, angles: [30, 60] },
  neck: { sides: 16, larynx: [0.0, 0.012, 0.011], larynxAmp: [0.0035, 0.0012],
    rings: [[0.07, 0.044, 0.043, -0.008], [0.014, 0.045, 0.043, -0.006], [-0.012, 0.048, 0.046, -0.004], [-0.042, 0.055, 0.053, 0]] },
};
// #2047 the avatar ear (src/avatarear.js), head-bone metres before the face warp, in the ear's own frame: origin at the old
// attachment point [±0.1, 0.095, 0], `L` outwards, y up, z forwards. *Guess* by eye against adult ear proportions (about 6 × 3 cm,
// the helix standing 1.5–2 cm off the scalp). `cols` columns round the outline, `outline` [up, down, front, back] half-extents,
// `round` its superellipse exponents (upper, lower half) and `tilt` (z per y: the top leans back), `lobeTaper` the lobe's narrowing; `centre` the concha's
// [y, z]; `rings` the front surface's radial stations (0 = the concha's floor, 1 = the helix's edge); `floor`/`rise` the concha floor and
// the bowl's rim, `antihelix`/`scapha`/`helix`/`tragus`/`lobe` the folds' [height, station, half width]; `rim` the helix's thickness
// (helix, lobe); `back` the cranial surface's rings [station, L, flare share] down to a root inside the head; `flare` the angle (rad)
// about a vertical hinge at z = `hinge`, scaled by height from `flareLow` (lobe) to 1 (top) — steeper than the anatomical 25–35°
// cephalo-auricular angle because the skull behind the ear already curves away and the face warp narrows x by 0.93; `shade` cavity darkening [concha, scapha,
// sulcus]; `lobePoint` [station, angle°] where earrings pierce the lobe.
export const AVATAR_EAR = {
  cols: 20, outline: [0.027, 0.0285, 0.012, 0.0172], round: [2.6, 2.1], tilt: 0.12, lobeTaper: 0.2, centre: [-0.0055, 0.0035],
  rings: [0.2, 0.4, 0.55, 0.68, 0.78, 0.88, 0.96, 1],
  floor: 0.0006, rise: 0.0048, antihelix: [0.0062, 0.58, 0.085], scapha: [0.003, 0.76, 0.06], helix: [0.0048, 0.92, 0.07],
  tragus: [0.0042, 0.72, 0.12], lobe: [0.0025, 0.75, 0.3], rim: [0.0032, 0.0045],
  back: [[0.8, -0.003, 0.85], [0.55, -0.002, 0.4], [0.35, -0.007, 0]],
  flare: 0.76, flareLow: 0.45, hinge: 0.008, shade: [0.62, 0.82, 0.86], lobePoint: [0.7, 272],
};
// The avatars' face (#1101, src/avatar.js addFace / faceWarp), *guess* by eye against the skull / jaw ellipsoids of
// PVP_RIFLE_HEAD, head-bone frame (metres, the face looks +z). eye: [x, y, z] of the eyeball's centre, its radius / scale,
// the iris and pupil radii, the eye colours; ridge: the brow ridge over each eye [x, y, z, r, scale]; brow: the arc
// [x, y, z, radius, arc, tilt]; nose: [top, bottom, face z, half width top / bottom, protrusion top / bottom];
// lips: upper / lower [y, z, r, scale]; chin; warp: the whole head's `width`
// (x) and the jaw narrowing toward the chin (`narrow` share of x at the chin, between heights `y` and depths `z`); lipTint: lip colour = skin mixed toward it.
// #2065: authored lip volume in head-local metres (visual guesses). Existing outline, seam and controls stay shared.
export const AVATAR_LIP_VOLUME = { rows: 2, upperBulge: 0.004, lowerBulge: 0.0055,
  borderBase: 0.00015, edgeLift: 0.00075, seamThickness: 0.001,
  philtrumBorder: 0.009, philtrumRise: 0.0008, philtrumX: 0.004, philtrumWidth: 0.0025 };

export const AVATAR_FACE = {
  skullSegments: [18, 12], jawSegments: [14, 10], blend: 0.014, // blend: m either side of the skull / jaw seam shaded as one
  // #2063: inset 12 mm into the orbit; the extra 4 mm hides the far eye at oblique angles. Depth is fixed when sizing the opening (*guess*, m).
  eye: { at: [0.034, 0.107, 0.0975], r: 0.013, scale: [1, 0.72, 0.4], iris: 0.0062, pupil: 0.0028, white: 0xebe5db, irisColour: 0x6e5236, pupilColour: 0x141010 },
  lid: { r: 0.0142, scale: [1.04, 0.76, 0.62], upper: 0.37, lower: 0.18 },
  socket: { r: 0.0185, scale: [1.08, 0.72, 0.3], z: 0.107, shade: 0.88 },
  // #2063: spectacles stay in front of the nasal bridge when the eye centre is inset (*guess*, head-local m).
  accessoryFront: 0.1265,
  ridge: { at: [0.031, 0.126, 0.099], r: 0.028, scale: [1.2, 0.3, 0.36], shade: 0.93 },
  brow: { at: [0.035, 0.1265, 0.1175], radius: 0.034, arc: 1.0, tilt: -0.1, turn: 0.38, tube: 0.0027, cols: 12 },
  // #2002: rounded chin sections and skin-seated lips (head-local metres); the ear is AVATAR_EAR (#2047).
  jaw: [[-0.022, 0.033, 0.050, 0.035], [-0.012, 0.047, 0.060, 0.034], [0.005, 0.061, 0.065, 0.030]],
  mouth: { cols: 12, halfWidth: 0.023, seamY: 0.043, lift: 0.0035, upper: 0.006, lower: 0.007, border: 0.003 },
  nose: { top: 0.115, bottom: 0.071, z: 0.113, width: [0.0045, 0.0135], depth: [0.009, 0.027], alar: [0.0095, 0.0755, 0.1165, 0.0068] },
  lips: { upper: [0.047, 0.1085, 0.02, [1, 0.2, 0.2]], lower: [0.039, 0.108, 0.018, [1, 0.24, 0.25]], seam: 0x4a2a28, bend: 7 },
  chin: { at: [0, 0.012, 0.093], r: 0.018, scale: [1.2, 0.8, 0.7] },
  warp: { width: 0.93, narrow: 0.14, y: [0.075, 0], z: [0, 0.1] },
  lipTint: 0xb0605a,
};
// The avatars' talking mouth (#1122, src/avatar.js mouthWeight / Avatar.talk) *guess* by eye, not measured: the lower lip,
// chin and lower beard drop by up to `drop` m (head-bone frame) in the vertex shader while the dark lip seam stretches into the
// opening; the drop fades over `below` m under the seam and back to nothing at `chinY`, within `halfWidth` m of the middle
// (the corners stay shut) and in front of `frontZ`. The rhythm walks the line's letters at `rate` letters/s (Swedish speech is
// roughly 5 syllables ≈ 13 letters a second), opening by `vowel` / `consonant` / `space` and closing for `pause` letters at
// punctuation; `follow` 1/s eases the mouth towards it. A chat line talks for at most `maxSecs` (and never past its bubble);
// a spoken line follows the voice's start / word boundaries / end, closed after `liveMax` s if the end never comes.
export const AVATAR_MOUTH = { drop: 0.009, below: 0.004, chinY: -0.03, halfWidth: 0.024, frontZ: [0.05, 0.085],
  rate: 13, vowel: 1, consonant: 0.4, space: 0.08, pause: 3, follow: 22, maxSecs: 6, liveMax: 20 };
// #2038: small conversational gestures while a figure talks (src/avatartalk.js), *guess* by eye; local, no network field. The talking
// amount follows `avatar.talking` at `rise` / `fall` 1/s (exactly 0 once quiet). A gesture every `gap` [min, max] s lasts `dur` [min, max] s:
// a free hand lifts by `lift` [towards the middle, up, forward] m (scaled `amp` [min, max] per gesture; the right hand, the left
// `left` of the time, both `both`), the head nods `nod` rad down over `nodDur` s. Between gestures the hands keep `rest` of the lift
// (the right one fully, the left `restLeft`); `beat` m up and down with the mouth; `open` the share of the gesturing hand's finger curl
// that opens; the head tilts up to `tilt` rad at `tiltHz`. Running / crouching mute it.
export const AVATAR_TALK = { rise: 3, fall: 2.5, gap: [0.6, 2], dur: [0.9, 1.5], amp: [0.6, 1], lift: [0.08, 0.22, 0.26], left: 0.3, both: 0.2,
  rest: 0.22, restLeft: 0.35, beat: 0.015, open: 0.55, nod: 0.1, nodDur: 0.55, tilt: 0.08, tiltHz: 0.21 };
// The avatars' facial expressions (#2031, src/avatarface.js) *guess* by eye, not measured. Three weights 0 … 1 (smile, surprise,
// grimace) come locally from what the figure already does: `cues` says how strongly a greeting wave, a hug, a kiss or a laugh
// smiles, a scream surprises, and a hit (held `flinch` s), crying, gym work and running grimace; no network field. Each weight
// eases towards its goal at `rise` 1/s and back at `fall` 1/s (no jumps); a grimace mutes the other two. The shapes are vertex
// offsets in the head-bone frame (metres), weighted by smooth fields of the bind position so skin, lips, beard and brows on the
// same spot move together: `corner` [x, y, σx, σy] round the mouth corners with each expression's [out, up, forward] there;
// `cheek` [x, y, σx, σy] lifted by `cheekLift` (and puffed by `cheekPuff` when smiling); the brow band from `band` [rise from,
// full at, fade from, gone at] (y), arched about `arch` [x, σ], raised `browUp` by surprise and lowered `browDown` / drawn in
// `browIn` (share of x) by a grimace, most at the inner ends (`inner` [full to, gone at] |x|); `front` [z from, full at] keeps it
// on the face; `squint` / `widen` close / open the eyes (their height about the eye's centre); `jaw` the surprise's mouth drop.
export const AVATAR_EXPR = { rise: 7, fall: 2.4, flinch: 0.7,
  cues: { wave: 0.9, hug: 1, kiss: 0.7, laugh: 1, scream: 1, cry: 0.75, hit: 1, gym: 0.6, run: 0.35 },
  corner: [0.023, 0.044, 0.012, 0.012], smile: [0.003, 0.0055, -0.0012], surprise: [-0.0022, -0.0006, 0.0006], grimace: [0.0042, -0.002, -0.0008],
  cheek: [0.04, 0.078, 0.016, 0.014], cheekLift: [0.0024, 0, 0.0016], cheekPuff: 0.0008,
  band: [0.108, 0.12, 0.15, 0.185], arch: [0.035, 0.03], browUp: 0.0065, browDown: 0.0055, browIn: 0.18, inner: [0.02, 0.055], front: [0.05, 0.085],
  squint: [0.22, 0, 0.36], widen: 0.18, jaw: 0.004 };
// The avatars' full beard (#1097) and moustache, since #2051 in src/avatarbeard.js; all *guess* tuned by eye against the avatar head, not
// measured: degrees from `centre` (head-bone frame, metres). Full beard: a grid of `columns` × `rows` over ±`azimuth`, from `bottom` (under the
// chin) up to the cheek line `cheek` [front, sideburn] rising between |azimuth| `cheekAz`; facial 1 drops to `chinTop` under the lips
// between |azimuth| `notch`. #2041 the moustache variant's mouth `opening`: the grid's quads within `frame` [± columns from the middle, from
// row, to row] give way to `rings` bands narrowing to an oval round the #2002 lips and their skin band (lips ±13.5°, -24.4 … -16.5°; band
// ±13.6°, -26.2 … -14.6°, measured from the bind geometry): centre elevation `e`, `half` [azimuth, elevation] degrees, its ends raised `bend`.
// #2051: the shell lies on the head's real skin (head + neck mesh) `lift` m above it plus `thick` [chin, cheeks, facial 3's moustache bulk] m
// times density^0.7, so its edges sit on the skin. `edge`: the grid reaches `rise` above the cheek line, which facial 3 lowers by `dip`
// [degrees, eased out between |azimuth| from, to] under the nose and which wanders by `wobble` [degrees, from |azimuth|]; the density fades
// over `top` [under the nose / lip, cheeks, sideburns], `neck`, `back` (behind the jaw) and `mouth` degrees; `patch` thins the upper cheeks.
// `moustache` (facial 2): a band from `top` to `bottom` elevation at the middle (`philtrum` lower at the centre), its ends `droop`ing by
// |azimuth| `half` and tapering to points from `taper` × half, fading over `feather` [above, below] degrees; a `cols` × `rows` grid with a
// `margin` (degrees) round it, `thick` m; facial 3 blends to moustache hairs within |azimuth| `blend` above the mouth. `hair`: lanes `lane` m
// apart, one hair per `cell` m along them, `len` [min, max] m (`lenM` on a moustache), `width` m half-width at the root (stylised ≈ 3× real),
// a random `lean` / `curl` (lanes over its length), present with chance `fill` × the density at its root; beard lanes converge downwards by
// `converge` (1/degree about elevation `y0`), moustache lanes fall outwards by `slope` [linear, quadratic]; `shade` [min, max] per hair, the
// undercoat `base` (`baseShade`) only where the density is above `baseFrom`; on the silhouette it gives way by `graze` [from, to, strength]
// (1 − |n·v|). `radius` m: the arc per degree; `budget`: triangles per option incl. its flyaways (#2042: +10 % of the ≈ 8,200-triangle head). Without MSAA the uncovered beard is skin (`skinShade` × the look's skin).
export const AVATAR_BEARD = { centre: [0, 0.075, 0.02], azimuth: 92, bottom: -76, columns: 32, rows: 12, cheek: [-6, 10], cheekAz: [22, 90],
  chinTop: -27, notch: [8, 22], lift: 0.0005, thick: [0.011, 0.005, 0.004], radius: 0.088, skinShade: 0.7,
  opening: { frame: [4, 7, 12], e: -20.6, half: [15, 6.2], bend: 1.3, rings: 3 },
  edge: { rise: 3, dip: [4, 8, 20], wobble: [1.2, 25], top: [3.5, 10, 6], neck: 16, back: 18, mouth: 2.5, patch: 0.3 },
  moustache: { half: 27, top: -8, bottom: -16.5, philtrum: 1, droop: 5, taper: 0.55, feather: [2.5, 1.0], thick: 0.0035, margin: 2, cols: 16, rows: 6, blend: [16, 30] },
  hair: { lane: 0.00045, cell: 0.003, len: [0.005, 0.009], lenM: [0.004, 0.008], width: 0.00013, lean: 1.2, curl: 0.8, fill: 0.9,
    converge: -0.006, y0: -30, slope: [0.25, 0.012], shade: [0.7, 1.12], base: 1, baseFrom: 0, baseShade: 0.82, graze: [0.55, 0.9, 0.85] }, budget: 1000 };
// #2061 (part of #2042) the full beard's sideburn up into the scalp's hairline (src/avatarbeard.js), all *guess* by eye in profile and
// three-quarter from behind, not measured. Behind |azimuth| `from` [start, full] (degrees round AVATAR_BEARD.centre) the beard's top follows
// the visible hairline (AVATAR_HAIR.hairline, mapped into the beard's angles at `r` m from AVATAR_HAIR.centre, sampled every `step` degrees
// over `span`) `over` degrees above it, so the beard runs on under the hair's soft edge (#2050) instead of stopping short of it.
// `flat` [degrees below the line, share]: the beard thins towards the line to that share of its thickness and lies under the hair shell.
// `back` the back edge's feather (degrees) in front of the ear (it was a hard grid edge above the jaw).
export const AVATAR_SIDEBURN = { from: [72, 78], over: 6, r: 0.098, step: 2, span: [60, 100], flat: [10, 0.12], back: 9 };
// The avatars' hairstyles (#1102, src/avatar.js hairParts) *guess* by eye against the avatar head (PVP_RIFLE_HEAD skull / jaw / ears):
// shells projected from `centre` (head-bone frame, m) onto the skull, lifted by a thickness. `hairline`: the hair's lower edge,
// [|azimuth|, elevation] in degrees (0 = straight ahead): forehead → temples → sideburn in front of the ear → over the ear → nape;
// `beanie` the knitted hat's lower edge the same way. `thick` m by style: [crown, sides, back]; `streak` the strand shading
// (± fraction per column); long hair (style 1): the curtain round the back from |azimuth| `long.from`, hanging from the
// hairline at its front edge, rising to elevation `long.top` between |azimuth| `front` and `back`, down to `long.hem` [sides, back] m
// below the head bone, `long.gap` m off the shoulders, `long.depth` m thick.
export const AVATAR_HAIR = { centre: [0, 0.09, 0], bunAt: [0, 0.212, -0.078], /* #2014: the bun's centre in the head frame (the bun's geometry and its sway read it) */ rows: 8, step: 12, streak: 0.07,
  flow: { sweep: 22, ridge: 0.0045, groups: 9, edge: 1.2, longGroups: 7, longRidge: 0.010, longSway: 5 },
  // #2012 aesthetic guesses: a finer column `fine` (degrees) for |azimuth| below `fineTo`, rows packed towards the
  // hairline by `rowPower`, the edge lifted only `edgeLift` of the thickness (feathered over `featherTo` of the rows) and
  // tufts `tuft` [degrees down, period in degrees, |azimuth| where they fade]; `clump` sharpens the strand-group ridges
  // (power on the cosine) and `clumpShade` darkens their valleys in the vertex shade.
  // #2050: the tufts are gone (the soft edge, AVATAR_HAIRLINE, breaks the line instead); `hairline` has temple recessions (|azimuth|
  // 24–34) and tapering sideburns (64–72) — *guess* by eye, not measured. The shells' columns stay laid out from `cols` (the
  // earlier corners; the long curtain starts at `long.from`, the curly one at 72), so the finer line costs no triangles.
  cols: [0, 22, 42, 58, 64, 72, 78, 102, 120, 146, 180], fine: 6, fineTo: 80, rowPower: 1.45, edgeLift: 0.08, featherTo: 0.5, clump: 2.2, clumpShade: 0.1,
  hairline: [[0, 37.5], [14, 37], [24, 38.5], [32, 37.5], [42, 30], [52, 21], [58, 14], [63, 2], [66, -4.5], [69, -5.5], [73, 1], [78, 13], [102, 15], [120, -6], [146, -26], [180, -30]],
  beanie: [[0, 35], [35, 32], [60, 19], [80, 9], [100, 9], [140, -8], [180, -14]],
  thick: [[0.016, 0.006, 0.009], [0.014, 0.011, 0.013], [0.006, 0.004, 0.005], [0.004, 0.003, 0.004], [0.011, 0.006, 0.009]], // (#2054: curly's shell thinner, its curls give the volume)
  // #2054 curl volumes (src/avatarcurls.js), aesthetic guesses by eye in metres/degrees: `seg` a clump's segments [round, along];
  // `groove` the coil's depth (share of the radius), `coil` its turn rate (radians per radian along the axis), `grooveShade` /
  // `occlusion` how much darker the grooves / the side towards the head are, `tone` ± a clump's shade, `hug` how much flatter its head
  // side is, `depth` its thickness (share of its width), `stretch` [1, max] its elongation, `out` m the scalp curls' outermost reach off
  // the skull (under the headphones' band and headwear; `hat` [m, degrees]: only so far near the lowest hat edge, src/avatarcurls.js
  // curlReach), `shellShade` the scalp shell under them (darker: depth between the curls),
  // `soften` how far a clump's normals lean towards its outward axis (shaded as lumps of one mass, no grazing rim round each).
  // `scalp`: radius [edge, crown] m (± `jitter`), grown over `grow` degrees above the hairline, `margin` + `reach` × its own angular
  // radius above the line, `turn` ± degrees off hanging down, `sink` share of the shell's thickness, `bury` share of its depth below
  // that, `loft` m random extra lift, dart throwing `tries` / `max` / `pack` (share of the radii's sum kept between centres).
  // `curtain`: the ringlets' radius m, `stretch` their elongation, `turn`, `out` / `gap` / `loft` off the curtain and the body,
  // `below` how far (share of the curtain's height) they may hang below its hem, `shadeLow` darker towards the hem.
  // `fine` the fragment's strands: `period` m, `warp` the domain warp, `coil` / `strand` / `gap` the shade of crests, strands and gaps,
  // `relief` m their height for the shading normal, `turn` radians the gloss's strand direction turns with them, `gloss` its strength.
  curly: { seg: [8, 4], groove: 0.08, coil: 3.2, grooveShade: 0.25, occlusion: 0.42, tone: 0.1, hug: 0.3, depth: 0.85, stretch: [1, 1.4],
    out: 0.027, hat: [0.014, 30], shellShade: 0.62, soften: 0.7,
    scalp: { r: [0.008, 0.0165], jitter: 0.2, grow: 20, margin: 0.5, reach: 1, turn: 70, sink: 0.4, bury: 0.2, loft: 0.004, tries: 6000, max: 80, pack: 0.6 },
    curtain: { r: [0.0095, 0.0145], stretch: [1.3, 1.8], turn: 30, out: 0.3, gap: 0.003, loft: 0.004, below: 0.12, shadeLow: 0.12, tries: 4000, max: 50, pack: 0.62 },
    fine: { period: 0.011, warp: [1.1, 0.7], coil: 0.2, strand: 0.16, gap: 0.3, relief: 0.0012, turn: 1.6, gloss: 0.55 } },
  long: { wave: 0.006, top: 50, from: 64, front: 72, back: 100, hem: [-0.035, -0.25], gap: 0.016, depth: 0.012, rows: 8 } };
// The avatars' skin and material shading (#1104, src/avatar.js skinShading / clothShade) *guess* tuned by eye in day and
// evening light, not measured: soft areas in the head bone's frame (metres; H = 0.1 is the head's centre) as
// [x (mirrored), y, z (in front of it), radius, strength, horizontal stretch] with an RGB multiplier: warm cheeks / nose tip / lip surround,
// darker eye sockets, the shadow under the jaw on the neck and inside the ears; `hand`/`limb` warm the bare hands and
// elbows a little; `rimTint` [r, g, b, strength] reddens skin at grazing angles (scattered light). `cloth` darkens clothes in folds (armpits, crotch — kept faint, #1189 —, behind the knee) and hair underneath, per vertex.
export const AVATAR_SKIN = {
  cheek: [0.056, 0.072, 0.06, 0.028, 0.85], blush: [1.08, 0.8, 0.76],
  nose: [0, 0.074, 0.12, 0.02, 0.18], lipRim: [0, 0.042, 0.09, 0.02, 0.4],
  eye: [0.034, 0.113, 0.06, 0.014, 0.2, 1.3], socket: [0.66, 0.58, 0.62], // #2044: the socket is sculpted now (AVATAR_SCULPT), so less paint (was 0.35)
  under: [-0.03, 0.04, 0.55], underTint: [0.8, 0.74, 0.74], ear: [0.085, 0.102, 0.5],
  hand: [1.03, 0.94, 0.92], limb: [1.02, 0.96, 0.95], rimTint: [1.0, 0.86, 0.8, 0.6],
  cloth: { armpit: 0.22, crotch: 0.1, knee: 0.12, hairUnder: 0.25 },
};
// #2032 living skin (src/avatarskin.js), all *guess* tuned by eye in day light and backlight, not measured. Bind-pose metres.
// `pore` / `grain`: [period m, depth m] of the procedural micro-normal (pits / broad shallow dimples; stylised larger than real pores so they
// survive a close-up), each fading out between `fade` [start, end] pixels per period (no shimmer at distance or in the far fade).
// `poreTop` / `grainTop` = the wave sums' threshold for a pit / dimple (of 3), `poreRough` the extra roughness in the pits, `tZone` = shine on the nose.
// `flush` [r, g, b] multiplies the albedo by `ear` / `nose` / `cheek` [x, y, z, radius, strength] / `knuckle` / `joint` strengths.
// `knuckle` / `joint` = [y in the hand bone's frame (m), half-width m]. Backlight: `sss` [r, g, b] (times √albedo, so darker skin glows
// less but still red), `wrap` (wrapped diffuse past the terminator, 0 … 1), `wrapK`, `back` [distortion, power, strength] and the
// thickness `thin` per part (ear, nose, finger, other skin); the ear's (head frame: centre height `y`, half height `h`, half depth `w` m,
// measured from the bind geometry) is `inner` in the middle and full at the rim.
export const AVATAR_SKIN_DETAIL = {
  // #2067: fine dense relief (period/height m), artist guesses; filter out before a wave falls below 4 pixels.
  pore: [0.00065, 0.000001], poreTop: 0.2, grain: [0.0015, 0.0000015], grainTop: 0.3, fade: [6, 4], poreRough: 0.025, tZone: 0.1,
  detail: { base: 0.28, cheek: [0.046, 0.072, 0.028], mouth: [0.043, 0.029, 0.014] },
  flush: [1.05, 0.84, 0.82], ear: 0.55, nose: 0.35, cheek: [0.05, 0.068, 0.05, 0.034, 0.3],
  knuckle: [-0.053, 0.009, 0.8], joint: [-0.077, 0.006, 0.5],
  sss: [1.0, 0.25, 0.12], wrap: 0.45, wrapK: 0.6, back: [0.35, 3.0, 0.65], thin: { ear: 1, nose: 0.4, finger: 0.55, other: 0 },
  earRim: { y: 0.095, h: 0.028, w: 0.014, inner: 0.3 },
};
// #2044 (part of #2042) the face's sculpted forms (src/avatarsculpt.js), all *guess* by eye against the avatar head in raking light and
// backlight, not measured. Head-bone frame before faceWarp (metres; eye centre y 0.107, lip seam 0.043). Each form is
// [depth m (+ out, − in), ax, ay, bx, by, σ m, smile gain, σ m left of a → b (default σ)]: a soft Gaussian ridge / groove round the
// segment a → b, mirrored in x (a wider left σ makes a one-sided fold: the cheek falling steeply into the nasolabial line).
// `shape` forms move the head skin itself (in headSculpt, so the lids and brows seat on them): the upper-lid sulcus under the brow
// ridge and the ridge. The others are finer than the head's vertex grid (about 16 mm between columns on the cheek), so they only
// bend the shading normal, analytically per pixel (`fine` ones also take `cavity` × depth (mm) of the ambient light out of their hollows):
// `form` the cheekbone and the hollow under it, `fine` the nasolabial fold (the cheek's edge falling into it), the philtrum's two
// columns and its groove, the mouth corners and the bulge outside them. They deepen by smile gain × the #2031 smile and fade out
// between `fade` [from, to] bind metres per pixel (`form` / `fine`), so nothing shimmers at distance.
// `lip`: the lip border's roll [height m, σ m, offset m outside the outline] and the soft colour transition across the outline
// [share of skin on the lip edge, over m inside; share of lip colour on the skin, over m outside].
export const AVATAR_SCULPT = {
  // #2066: geometry-only profile forms (artistic guesses, head-local m). The shared skin/lip query and beard probe follow them.
  jawRise: { height: 0.018, x: [0.035, 0.09], y: [0.035, -0.025], z: [0.02, 0.10] },
  shape: {
    radix: [-0.0025, 0, 0.129, 0, 0.126, 0.009, 0],
    upperLip: [0.0018, 0, 0.057, 0, 0.052, 0.014, 0],
    mentolabial: [-0.004, 0, 0.027, 0.020, 0.027, 0.006, 0, 0.009],
    chinPad: [0.005, 0, 0.006, 0.020, 0.006, 0.014, 0],
    sulcus: [-0.0022, 0.026, 0.1175, 0.044, 0.1165, 0.0055, 0],
    ridge: [0.0012, 0.018, 0.1255, 0.048, 0.1245, 0.005, 0],
  },
  form: {
    cheekbone: [0.0022, 0.040, 0.091, 0.062, 0.084, 0.011, 0.3],
    submalar: [-0.0008, 0.046, 0.061, 0.062, 0.058, 0.012, 0],
  },
  fine: {
    nasolabial: [0.0005, 0.0225, 0.0735, 0.033, 0.040, 0.0028, 1.2, 0.008],
    philtrum: [0.0001, 0.0035, 0.0655, 0.0062, 0.0505, 0.0025, 0],
    philtrumGroove: [-0.00012, 0, 0.064, 0, 0.052, 0.003, 0],
    corner: [-0.0005, 0.0235, 0.0445, 0.0235, 0.0445, 0.0024, 0.6],
    modiolus: [0.0003, 0.029, 0.043, 0.029, 0.043, 0.0035, 0.8],
  },
  lip: { roll: [0.0001, 0.0008, 0.0004], blend: [0.4, 0.0012, 0.25, 0.001] },
  cavity: 0.35, fade: { form: [0.004, 0.012], fine: [0.0015, 0.004] },
};
// #2040 flyaway hairs (src/avatarflyaway.js), all *guess* tuned by eye against a low sun, not measured. Per hairstyle (0 short, 1 long,
// 2 bun, 3 beanie, 4 curly) and beard (`beard` facial 1/3, `moustache` facial 2): `n` strands of `seg` segments (2 triangles each),
// `len` [min, max] m, `out` how much they leave the surface (vs. following the hair's flow down/back), `sag` droop (share of the length),
// `curl` [turns, radius m]. Strands are camera-facing ribbons widened in the vertex shader: `width` [root, tip] half-width m (stylised,
// about 3× a real hair), never drawn narrower than `minPx` px wide; alpha = real/drawn width → alpha-to-coverage (needs MSAA, else off).
// They fade out between `fade` [start, end] m from the camera (the far figure #1966 has none). `spacing` m = the least root distance,
// `rootIn` m = how far the root sits inside the hair. `flutter` = the tip's share of the hair sway (#2014). `rim`: soft backlight on
// all hair and beard [strength, edge power, back power, × on flyaways (thin: more light through)] tinted `tint` [scale, lift] of √albedo. Budget: ≤ `budget` triangles per avatar.
export const AVATAR_FLYAWAY = {
  styles: [
    { n: 44, seg: 3, len: [0.018, 0.04], out: 0.75, sag: 0.25, curl: [0, 0] },
    { n: 56, seg: 4, len: [0.03, 0.07], out: 0.55, sag: 0.3, curl: [0, 0] },
    { n: 40, seg: 3, len: [0.015, 0.035], out: 0.6, sag: 0.2, curl: [0, 0] },
    null,
    { n: 40, seg: 5, len: [0.02, 0.045], out: 0.7, sag: 0.15, curl: [1.6, 0.004] },
  ],
  beard: { n: 30, seg: 2, len: [0.006, 0.013], out: 0.6, sag: 0.45, curl: [0, 0] },
  moustache: { n: 10, seg: 2, len: [0.005, 0.01], out: 0.5, sag: 0.5, curl: [0, 0] },
  width: [0.0004, 0.00012], minPx: 1.1, fade: [6, 10], spacing: 0.009, rootIn: 0.0015, flutter: 1.6,
  rim: [0.7, 4.0, 3.0, 3.0], tint: [0.5, 0.03], budget: 600,
};
// #2046 brows of hairs (src/avatarbrow.js), all *guess* by eye against close-ups, not measured. Head-bone metres before the face warp,
// the brow's own position AVATAR_FACE.brow.at [x, y]. Centre line: x = at.x + (u − 0.5) · `length` (u 0 = the head by the nose, 1 = the
// tail), y = at.y + `arch` · sin(π · u^k) − `drop` · u with the arch's top at u = `peak`. `half` [head, tail] m half-thickness, tapering from
// `taper` [from, to] u; the body fades in over `ends` [0] and out over [1] (u). A thin `lift` m above the skin, a grid of `cols` × `rows`
// (2 triangles each) reaching `reach` [head, body] m above and `below` m under the body for the hair tips. Hairs: one per cell of `cell` m
// along the brow × `lane` m across its flow lines, `len` [min, max] m, `width` m half-width at the root (stylised ≈ 3× a real hair, thinner
// at the tip), rising at `slope` [head, tail] (dy/dx: upright by the nose, lying down outwards) easing over `settle` m; a cell has a hair
// with chance `fill` × the body's density there. `base` [head, tail] = the coverage of the fine undergrowth between them. `shade`
// [min, max] darkens each hair. Coverage is alpha-to-coverage (MSAA); without MSAA the colour mixes towards the skin (`skinShade` × skin).
// Budget: ≤ `budget` triangles for both brows (the old tubes 96; +10 % of the ≈ 3,500-triangle head = 350).
export const AVATAR_BROW = {
  length: 0.042, arch: 0.0042, peak: 0.6, drop: 0.0034, half: [0.0038, 0.0011], taper: [0.12, 1.0], ends: [[-0.07, 0.07], [0.8, 1.0]],
  lift: 0.0007, cols: 14, rows: 3, reach: [0.0036, 0.0016], below: 0.0003, span: [-0.06, 1.04],
  cell: 0.0015, lane: 0.00042, len: [0.003, 0.005], width: 0.00012, slope: [2.4, 0.16], settle: 0.006, fill: 1,
  base: [0.66, 0.28], shade: [0.62, 0.95], skinShade: 1.0, budget: 200,
};
// #2050 the soft hairline (src/avatarhairline.js), all *guess* by eye against close-ups, not measured. The visible hairline is
// AVATAR_HAIR.hairline (elevation by |azimuth| from AVATAR_HAIR.centre, plus its `flow.edge` wave); the scalp shell reaches `drop` degrees
// below it (geometry the soft edge hides, room for the baby hairs; a curtain's top stays on the line). In the fragment shader the hair's
// coverage thins from full at `band` m above the line (measured across it) to nothing `baby` m below it: an under-layer that fades in over
// the band's upper part and single hairs along the meridians (`lane` lanes per turn × `cell` m along them, one hair per cell, `len`
// [min, max] m, `width` m half-width at the root, thinner at the tip), present with chance `fill` [at the line, `edge` share of it just
// above] rising to 1 at the band's top; below the line only short baby hairs (`babyLen`, `babyWidth`, chance `babyFill`) at the forehead
// and temples (fading out between |azimuth| `babyTo`) and fainter at the nape (`nape` × the chance). `shade` [min, max] darkens each hair;
// `under` = where the under-layer starts (share of the band); `wobble` m = a slow wave on the line along its length (uneven, not a ruled edge).
// Coverage is alpha-to-coverage (MSAA, as the brows #2046); without MSAA a dithered cut-out. No triangles of its own.
export const AVATAR_HAIRLINE = {
  drop: 3.2, band: 0.009, baby: 0.0042, lanes: 1500, cell: 0.0011, len: [0.0024, 0.0042], width: 0.0001, edge: 0.2,
  babyLen: [0.0016, 0.0034], babyWidth: 0.00006, babyFill: 0.4, babyTo: [62, 76], nape: 0.5, shade: [0.72, 1.0], under: 0.15, wobble: 0.0016,
};
// #2052 anisotropic hair gloss (src/avatarhairgloss.js), all *guess* tuned by eye in daylight, backlight and under the night street lamps,
// not measured. Kajiya-Kay lobes [shift along the normal, exponent, strength] (+ the secondary's hue scale): a sharp white `primary`
// towards the root and a broader hair-tinted `secondary` towards the tip. `jitter` breaks the band per strand group: [shift amplitude,
// groups per turn, rate per bind metre up, fine strands per turn, fine amplitude]. `fade` [from, to] bind metres per pixel over which the
// jitter goes and the lobes broaden to `far` [exponent share, strength share] (no flicker at distance). `wrap` lets the band reach a
// little past the terminator; `wet` the most a lower roughness (#2018 wet hair) sharpens it; `lamp` the #2039 street lamps' share;
// `brow` / `beard` / `fly` the gloss on brows, beards and flyaways; `below` ° under the shell's edge where the strands start to hang;
// the bun's coil within `bunRadius` m of AVATAR_HAIR.bunAt round its axis tilted `bunTilt` rad (as hairParts).
export const AVATAR_HAIR_GLOSS = {
  primary: [-0.06, 140, 0.12], secondary: [0.1, 30, 0.2, 1.0], jitter: [0.05, 18, 30, 90, 0.03],
  fade: [0.0012, 0.005], far: [0.3, 0.75], wrap: 0.2, wet: 2.5, lamp: 1.8, brow: 0.35, beard: 0.8, fly: 0.6, below: 10,
  bunRadius: 0.058, bunTilt: -0.66,
  // #2068: dark hair reflects its own colour in a narrower band; bright hair keeps #2052's lobes (visual *guess*, linear albedo).
  darkRange: [0.045, 0.25], darkSharp: [3.0, 2.4], secondaryWarm: [1.0, 0.86, 0.7],
};
// #2053 (part of #2042) long hair in locks (src/avatarlonghair.js), all *guess* by eye against the avatar in daylight and backlight, not measured.
// The curtain (AVATAR_HAIR.long) is split into `perCol` locks per curtain column, each a ribbon of `rows` rows (packed towards the tip by
// `rowPower`) from the scalp's lowest row down to its own tip: overlapping its neighbours by `overlap` of its width below `overlapAt` [from, to]
// (share of its length), tapering from `taper` [min, max] of its length to `tip` of its width, its edges' normals bent `bend` across it (a
// rounded lock), edges `edgeShade` darker. Every other lock lies on the outer layer: `air` [at the top, at the tip] m further out (a little
// air between the layers) and `outerShort` m shorter. Each lock's length varies by ±`jag` m (golden-angle scatter) about the curtain's hem; a
// lock ends early where the sweater below juts out more steeply than `stop[0]` (dr/dy) or has pushed it out by `stop[1]` m in all: it rests on
// the shoulder instead of passing into it or fanning out over it.
// Behind the locks a shorter, darker under-layer (`under`: length share of its shortest lock, `inset` m inside them, `rows`, shade at its
// bottom) keeps the curtain closed where the locks part; its inner surface is `depth` m (at most) behind it. The locks' lowest `backRows`
// rows also have a back face (seen from in front, past the neck). `clear` m = the least gap to the sweater (both figures, before the
// head's faceWarp). `front`: per side `n` strands brought forward over the shoulders: root |azimuth| `root` [first, step], hanging to
// `end` [|azimuth|, head-frame y m] (+ `step` per strand), `width` m, `rows`, `lift` m off whatever they lie on, skinned from the head to
// the torso between head-frame heights `torso` [from, to] m (the part on the chest stays on it when the head turns). The rest of the
// curtain shares up to `torso[2]` with the torso bone between heights `torso` [from, to] m (it rests on the back and shoulders when the head
// nods or turns). Budget: the head's triangles grow by at most +10 % (#2042).
export const AVATAR_LONGHAIR = {
  perCol: 2, rows: 8, rowPower: 0.8, overlap: 0.5, overlapAt: [0.06, 0.3], taper: [0.68, 0.86], tip: 0.1, bend: 0.5, edgeShade: 0.86,
  air: [0.0012, 0.0045], outerShort: 0.018, jag: 0.03, stop: [2, 0.012], clear: 0.007, backRows: 3, torso: [-0.02, -0.14, 0.85],
  under: { length: 0.9, inset: 0.0025, rows: 4, shade: 0.74, depth: 0.012 },
  front: { n: 2, root: [71, 8], end: [52, -0.175], step: [5, -0.03], width: 0.026, rows: 8, lift: 0.0025, torso: [-0.03, -0.09] },
};
// #2055 (part of #2042) short hair (style 0) and the bun (style 2) without the smooth helmet (src/avatarshorthair.js), all *guess* by eye
// against the before views (docs/verification/2055), not measured. Head-bone metres / degrees round AVATAR_HAIR.centre.
// `tiers`: overlapping locks laid along the shell's own strand flow (its sweep and clump twist, so the #2052 gloss follows them), each
// tier [count, root share, tip share, width m, tip lift m, length jitter (share)]: crown, middle and the lowest tier, whose tips reach
// the soft hairline (#2050). A lock is `rows` rows long, three vertices across, root sunk `sink` m into the shell, tip closed back down.
// Short hair's per-column tousle (#2012, 0.0045 m) is replaced by the locks. `part` the side parting [extra groove depth m, half
// width °, scalp tint at its middle (0 … 1), tint half width m, share where it starts / ends]; locks keep `partClear` ° off it.
// `ears` [from, to] |azimuth| ° where the lowest tier stops `earLift` (share) higher so it stays above the ear.
// `jag`: the nape's and the ears' uneven edge, a line pulled down in tufts: [depth m, tufts per turn, sharpness (power), from |az| °
// (none in front), full from °, share over the ear, full again from °]; the short shell runs that much lower there.
// `bun`: the knot as twisted ropes coiled round its tilted axis (AVATAR_HAIR_GLOSS.bunTilt): `ropes` × `turns`, `segs` along each,
// `sides` round, radius from `r` [outer, inner] m (round the axis), height `y` [start, end] m, rope thickness `thick` [start, end] m,
// three-ply twist `ply` [depth share, turns along the rope]; a darker core sphere `core` m. `combed` the bun's own combed-back locks
// [count, root share, tip share, width m, lift m] over its thin shell.
export const AVATAR_SHORT_HAIR = {
  tiers: [[7, 0.98, 0.6, 0.032, 0.0065, 0.12], [11, 0.8, 0.34, 0.03, 0.005, 0.15], [15, 0.52, 0.05, 0.028, 0.0036, 0.2]],
  rows: 4, sink: 0.0008, tousle: 0,
  part: [0.004, 5, 0.36, 0.003, [0.02, 0.12], [0.55, 0.8]], partClear: 11,
  ears: [74, 108], earLift: 0.14,
  jag: [0.013, 24, 1.6, 55, 70, 0.45, 112],
  bun: { ropes: 2, turns: 1.45, segs: 30, sides: 6, r: [0.031, 0.011], y: [-0.019, 0.024], thick: [0.014, 0.009], ply: [0.22, 5], core: 0.027 },
  combed: [14, 0.06, 0.82, 0.016, 0.0018],
};
// Combat between players (#667, src/combat.js; the room's check: cloudflare/players.js COMBAT). Only when both hold a weapon:
// `weapons` = what counts, in the order they are looked for (the room's list must have each one: there its range and rate);
// remove one here to leave it out. Both armed: drawn solid (`solid` opacity), else a ghost. A hit is judged by the shooter
// against the other's body (a vertical capsule `body` [from, to] m above the feet, `hitRadius` m), not through a wall; the
// lightsaber is a swing (anything within its range and `saberCone`, the cosine of the half-angle, in front). The jetpack is no weapon (#1705). `lives` until the
// room's welcome says otherwise. The HUD's hearts only while a fight is on. All our picks (*guess*).
// #873: gameplay balance guesses, not surveyed distances: first 5 m retain the existing 5-point hit;
// each complete 2 m thereafter adds 1 point, capped at 15 extra. Geometry is the room's accepted feet-to-feet distance.
export const PVP_SCORE = { nearMetres: 5, metresPerPoint: 2, maxBonus: 15 };
/** Shared authoritative hit reward; invalid geometry cannot award points. */
export function pvpHitPoints(distance) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return SCORE.each.pvpHits + Math.min(PVP_SCORE.maxBonus, Math.floor(Math.max(0, distance - PVP_SCORE.nearMetres) / PVP_SCORE.metresPerPoint));
}
export const COMBAT = { weapons: ['saber', 'nerf', 'wand', 'rifle', 'ball', 'bow', 'web'], lives: 10, portionLife: 1, solid: 1,
  // Confirmed-hit HUD duration/spacing: brief, clear of the crosshair (UX assumptions, #875).
  hitMarker: { lifeMs: 700, offsetPx: 20, livesGapPx: 6 }, // #904: UI clearance choice, not a physical measurement
  // Technical collision limits: fixed bitsets plus reserved bookkeeping, built during short idle slices (#715).
  // Native cold-query chunks bound triangle work; the existing2ms/2s clocks remain cooperative, not hard frame guarantees.
  collision: { cells: 32, clusters: 32, spatialBudgetBytes: 16 * 1024 * 1024, maxSpatialEntries: 1024, predictionMs: 2000, nativeChunkTriangles: 128, budgetBytes: 1024 * 1024, recordReserve: 4096, buildMs: 2, minTriangles: 200, queryCells: 512 },
  body: [0.25, 1.75], hitRadius: 0.4, saberCone: 0.5, flash: 0.35,
  // the others' shots drawn here: at most `lines` streaks (rifle, wand, web, flames) and `balls` balls at once, each gone
  // after `shotLife` s; their darts reuse the blasters' pool (in `dartColor`)
  lines: 16, balls: 3, shotLife: 4, dartColor: 0x1f6fff };
// Chat (#675, src/chat.js): while the players' room (#666) is on, the console is a chat. Lines show see-through in a
// column on the left for `ttl` s (fading out over the last `fade` s), complete rows that fit the viewport, newest at the bottom; `max`
// characters (the room's CHAT.max in cloudflare/players.js, kept equal by hand); sent no faster than the room allows: a
// burst of `burst`, then one per `everyMs`. The hide/show choice in localStorage `hiddenKey`. All our picks (*guess*).
// "skriver…" and the lines as bubbles over the ghosts (#676): our flag goes off `typingMs` after the last key and is
// repeated every `typingAgain` ms while typing (the room passes a repeat after 5 s); someone else's goes off by itself
// after `typingStale` ms without word. The bubble sits `bubbleGap` m over the name tag, full size within `bubbleNear` m,
// then smaller with distance down to `bubbleMin`. All our picks (*guess*).
// #765: 60 seconds doubles the old reading time; row capacity is measured from the viewport.
export const CHAT = { ttl: 60, bubbleTtl: 10, fade: 3, max: 140, burst: 3, everyMs: 1000, hiddenKey: 'lunden.chat.hidden',
  typingMs: 4500, typingAgain: 6000, typingStale: 15_000, bubbleGap: 0.12, bubbleNear: 4, bubbleMin: 0.55,
  // #743: bounded mirror-only atlas; glyph/dot styling and 1.2 s/.2 s cycle match index.html's chat bubble CSS.
  mirrorTyping: { frameWidth: 128, frameHeight: 32, frames: 12, columns: 4, fontPx: 14, dotPx: 4, gapPx: 2,
    paddingPx: 10, period: 1.2, stagger: .2, dotLift: 3, dim: .25 } };

// Drawing with crayons (#93, src/drawing.js): an A3 sheet in the middle of the ALEX desk in Sovrum 3. E on it:
// the view goes down over the paper, the mouse is freed and you draw with crayons (palette at the bottom,
// keys 1–9, "Sudda allt"); E / Esc / "Klar" goes back. The drawing is kept in localStorage.
export const DRAWING = { level: 1, x: 2.61 - 0.66 - 0.02, z: 0.465 + 0.31 + 0.08, w: 0.42, h: 0.297, px: 840, eye: 0.3,
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

// Drawings that are part of the home (#618, #1099): ordinary taped-up drawings (looked at, taken down, moved, thrown)
// that start at `pos` and are kept only in this browser — never sent to the cloud (which deletes taped-up drawings
// after 24 h) nor removed by its sync. Moved, the new spot is saved locally; thrown away, it is back here on the
// next load. `rot` in radians. Empty since #1883: "Till mamma" (the only one) is now a framed picture (FURNITURE,
// `pictures` on the kitchen wall), moved only in rearrange mode.
export const HOME_DRAWINGS = [];
// Ids of former home drawings (#1883): an IndexedDB 'drawings' record, a server copy or a drawing in the hand
// (bicycle stow) with one of these ids is dropped on load instead of going up as a drawing, so an old save never
// shows it twice next to its framed picture.
export const RETIRED_HOME_DRAWINGS = ['fixed-till-mamma'];

// Sitting and lying down (#71/#72, src/rest.js): eye height above the seat / mattress, how far you can
// turn your head (yaw ± from the way the seat faces) and the pitch range, and the move time.
// #1818: rest/pick anchors mirror the existing generic decor and schoolyard builders (metres; visual guesses).
export const OUTDOOR_SEATS = {
  pickHeight: .3, pitch: .6,
  chair: { width: .42, depth: .4, seat: .47, cushion: .045 },
  sofa: { depth: .75, seat: .44, offset: .08 },
  lounger: { width: 1.9, depth: .62, seat: .32, offset: .3 },
  schoolBench: { seat: .49, depth: .4 }, schoolSwing: { width: .45, depth: .2, thickness: .05, seat: .45, chain: .012 },
};

// #1811: image-interpreted outdoor gym on the grass SW of Östra längan by Karpvägen.
// Location, dimensions, timber/steel colours, clearance and exercise motions are visual/gameplay guesses from the report photo.
export const OUTDOOR_GYM = {
  use: { entryGap: .85, endInset: .35, stride: .2, speed: 1, turn: 3, grip: 1.8, hangBody: .3, netBodyOffset: .2, netEye: 1.15, dipGrip: 1.05, dip: .22, dipBody: .36, ankle: .05, hip: .9, torso: .69, legReach: .72, stepFootZ: .75, observerReach: 2.5, pressLean: .3, crunch: .65 }, // #1842: visual/contact and input-distance guesses

  effort: { gain: .2, decay: .42, pulseGap: .07, stroke: 28, maxStep: .25 }, // #1836: gameplay guesses; fresh F presses / CSS-pixel touch reversals
  scorePerDay: 30, // #1828: exercise-point ceiling per local day (*guess*); all repetitions still count for medals
  at: [-143, 33], yaw: -45, pad: [18, 12], padStep: 1, padLift: .035,
  wood: 0xc78446, steel: 0x989d99, chips: 0x82725c, post: .085, bar: .03, board: .045,
  entry: 2.3, eye: 1.62, bench: .52, logRadius: .16,
  pullHeight: 2.35, pullRise: .42, stepHeight: .42, stepTravel: .48,
  geometry: {
    postSides: 8, logSides: 10, slatGap: .012, footPlate: [.23,.12,.035], plateOffset: .02,
    pull: { postX: .85, topExtra: .12, braceDrop: .2, braceBack: .55, eyeZ: .35, lookZ: -.45 },
    press: { postX: .65, logY: .95, logZ: .4, logLength: 1.75, benchW: .7, benchD: 1.85,
      footZ: .7, footX: .24, slatX: .22, slatW: .2, crossD: .18, halfW: .38, halfD: .95, eyeZ: .62 },
    step: { footX: .85, footZ: .65, boardW: 2.2, boardD: .25, depth: 1.8, slats: 6, halfW: 1.15, halfD: .95, eyeZ: 1.2 },
  },
  // #1835: photo-read appearance, population and layout; all dimensions/colours are guesses, not a survey.
  landscape: {
    gravel: 0xa9a08e, corten: 0x7e482f, black: 0x252725, padded: 0x684832, rope: 0x777b72,
    edgeHeight: .10, edgeWidth: .025, grainSize: 64, grainRepeat: 1.6,
    approach: { from: [-9,0], to: [-15,0], width: 2 },
    frame: .14, boltR: .025, bracket: [.20,.22,.035],
    inclines: [[-5,2.4],[5,2.7]], incline: { width: .75, run: 2.6, low: .3, high: 1.15, rails: .55, slats: 4 },
    parallel: { at: [0,-2.5], halfW: .9, halfD: 1.1, height: 1.05, padR: .16 },
    benches: [[-5,-5],[4.5,-5]], bench: { width: 3.2, rows: 2, rowDepth: .45, height: .38, rise: .22, slatW: .24, slatOffset: .13, legInset: .4 },
    bin: { at: [-8,3.8], width: .5, depth: .5, height: .95, overhang: .04, lid: .05 },
    lamps: { at: [[-8.7,-5.5],[8.7,5.5]], height: 3.2, radius: .045, arm: .55, head: [.25,.10,.14] },
    course: { postR: .11, beamW: .16, patch: [-3,9.5,6,2.4],
      stumps: [[-5,8.8,.28],[-4.2,9.6,.45],[-3.2,9.8,.65],[-2.2,9.6,.4],[-1,9.9,.55],[.2,10.2,.32]],
      portal: [-2.5,14,2.2,2.5], net: [-4.5,12,2.1,1.5], netRows: 4, netCols: 6, ropeR: .012, netBottom: .25, netInset: .15, netSag: .08, collisionStep: .4,
      balance: [[1,9.6,1,13,.35],[1,13,4,15,.45],[4,15,5.8,12.2,.28]] },
  },
  stations: [
    { id: 'pullup', label: 'Räckhäv', name: 'räcket', x: -5.2, z: -2.1, period: 2.8, box: [1.95, 2.35, .7] },
    { id: 'press', label: 'Bänkpress', name: 'bänkpressen', x: 0, z: 1.5, period: 2.6, box: [1.8, 1.4, 2.1], lift: .34 },
    { id: 'step', label: 'Step-up', name: 'stepbrädan', x: 5.1, z: -2.1, period: 2.4, box: [2.3, .8, 1.9] },
  ],
};

export const REST = {
  sitEye: 0.72, lieEye: 0.22, move: 0.5,
  // #1150: visual rest anchors, guesses based on the shared Olof skeleton (metres before avatar scaling).
  avatarSeat: 0.45, avatarLieHip: 0.9, avatarLieClearance: 0.1,
  // #1234: a lying figure sinks under the cover: its centre line (spot `body`, local y) is `avatarLieSink` below the
  // duvet's top, and the torso tilts up `avatarLieTilt` rad so the head rests on the pillows (*guesses*, tuned by eye).
  avatarLieSink: 0.1, avatarLieTilt: 0.4,
  // #1275: a lie spot is where the HEAD rests (the pillow); the figure is rooted at the hips, so `restState` moves it
  // `avatarLieTorso` * cos(tilt) (hips to head bone along the tilted torso, metres before avatar scaling; measured on the
  // pose, *guess* for other builds) towards the feet. Without it the head poked through the headboard.
  avatarLieTorso: 0.69,
  // #1237: pose 3 "long sit" (chaise, sitting up in bed): the legs stretch out on the furniture; the feet `avatarLegsUp` above the
  // seat surface and `avatarLegsReach` in front of the hip (*guesses*; the leg is 0.85 m long and the hip sits 0.07 m forward, so it is almost straight).
  avatarLegsUp: 0.08, avatarLegsReach: 0.9,
  sit: { yaw: 1.7, pitch: [-1.1, 0.8] },
  lie: { yaw: 1.3, pitch: [0.15, 1.45], startPitch: 1.45 }, // lying on your back, looking at the ceiling
  reach: { sit: 1.7, lie: 0.8 }, // how far from the eye you can reach things while sitting (leaning forward) / lying (#184, #472)
};

// Touch controls' scale (#1087): the walking stick and the right-thumb buttons follow the screen's short side
// (CSS px, landscape height on a phone) so a small phone, a large phone and a tablet all get thumb-sized controls.
// The fractions and clamps are layout choices tuned by eye at 844×390, 667×375 and 1180×820 (*guess*, no physical
// thumb measurement); the 48 px floor keeps the target size from #1057 (interactions.md). touch.js writes them as CSS
// variables; src/hudicons.css owns the look.
export const TOUCH = {
  stickTravel: { frac: 0.15, min: 48, max: 84 }, // px the knob can travel from the centre (was a fixed 56)
  button: { frac: 0.145, min: 48, max: 64 },     // round cluster buttons (was 56, 48 on short landscape)
  gap: { frac: 0.02, min: 8, max: 12 },          // space between cluster buttons (was 8)
  hintOpacity: 0.5,                              // the idle stick hint at the lower left: visible, never loud
  // Stick feel (#1088, part 2 of #1082; *guess* values tuned by eye after common virtual-stick guidance, not measured):
  // deflection r = distance / stickTravel. Below `deadZone` nothing moves (a resting thumb never drifts); from there to
  // `full` the output rises along t^`curve` (fine walking near the centre), and from `full` out it is 1, so the rim
  // reliably passes PLAYER.sprintStick. `follow`: a thumb dragged past the rim pulls the base along behind it.
  stick: { deadZone: 0.1, full: 0.9, curve: 1.5, follow: true },
  // Drag-to-look (#1088): `sens` rad per CSS px (the old fixed 0.005 in main.js); `smooth` s is the time constant over
  // which each finger movement is eased into the view, evening out uneven touch-event timing (0 = raw, *guess*).
  look: { sens: 0.005, smooth: 0.03 },
  // Own layout (#1090, part 4 of #1082; src/touchlayout.js; *guess* ranges chosen by eye): size factors for the cluster
  // buttons (0.8 keeps a 57 px phone button at about 46 px, near the 48 px floor of #1057) and the stick, opacity so a
  // control never vanishes, the largest offset from its slot (× the short side), and px kept clear of the safe edges.
  custom: { buttonScale: [0.8, 1.6], stickScale: [0.7, 1.5], opacity: [0.3, 1], maxOffset: 3, margin: 4 },
  // #1116 (src/hudicons.js fitChoiceLabels; *guess* values chosen by eye): a choice button whose longest word does not
  // fit its column may shrink its font by `shrink` px, then spans both columns, and only then shrinks to `minFont` px
  // (still readable on a phone; short landscape already uses 13) before a word may be split mid-word.
  choiceFit: { shrink: 2, minFont: 11 },
};

export const PLAYER = {
  unstick: 2.0, // m/s: the glide out of a piece of furniture / the car you ended up inside (#314)
  eye: 1.62,
  radius: 0.22,
  walk: 1.6,   // m/s
  run: 3.2,   // indoor sprint (Shift / full stick); retained in flats, cores and garage (#546, #1832)
  runOutdoor: 4.8, // #1832: faster outdoor sprint (+50%, gameplay guess); ordinary walking is unchanged
  sprintStick: 0.95, // joystick deflection that counts as "all the way out"
  strideWalk: 0.62, strideRun: 0.95, // metres per footstep sound
  turnSpeed: 1.9, // rad/s for the arrow keys
  crouchEye: 0.95,   // eye height on your haunches (Ctrl / the touch button, #70)
  crouchSpeed: 0.5,  // walking speed factor while crouching
  mouseSens: 0.0013, // rad per pixel of mouse/touchpad movement under pointer lock (was 0.0022, too twitchy, #46)
  stepUp: 0.45,
  headroom: 1.85,
  // The ordinary jump (#636, #696; player.js; Space / the touch jump button, indoors and out, no suit needed): `jump` m/s up,
  // so v² / 2g ≈ 0.70 m of feet height (*guess*): just over a chair's / sofa's seat (~0.45 m) but not onto anything taller;
  // the suit's SPIDER.jump goes 2.5 m. The clipped entrance hedge (SITE.life.strip.hedge: 0.58 m over the ground, 0.44 m
  // deep, so a body of `radius` is held over 0.88 m of path) is cleared at a sprint (a walk of 1.6 m/s only just fails).
  // `hurdle` m: a low obstacle (a collision segment with a top: the boxwood hedge, a bench / sofa you can land on, #693)
  // no longer holds once the feet are within this of its top (knees tucked, *guess*).
  jump: 3.7, hurdle: 0.22,
};
// Random death destinations (#863): sampling zones derived from the existing lot/block/walkable extents.
// Insets/search counts are gameplay choices (guess), not surveyed safe points; every candidate is collision/terrain checked.
const respawnA = SITE.blocks.find(block => block.name === 'Hus A'), respawnB = SITE.blocks.find(block => block.name === 'Hus B');
export const RESPAWN = { samples: 8, grid: 5, ringEdges: 64, regions: [
  { id: 'parking', x0: SITE.life.lot.x0 + .5, x1: SITE.life.lot.x1 - .5,
    z0: Math.max(SITE.life.lot.z0, OUTDOOR.z0) + .5, z1: SITE.life.lot.z0 + SITE.life.lot.depth - .5 },
  { id: 'green', x0: respawnB.x1 + 1, x1: respawnA.x0 - 1, z0: Math.max(respawnA.z0, respawnB.z0) + 1, z1: Math.min(respawnA.z1, respawnB.z1) - 1 },
  { id: 'river-side', x0: respawnB.x0 + 1, x1: respawnA.x1 - 1, z0: Math.max(respawnA.z1, respawnB.z1) + 1, z1: OUTDOOR.z1 - .5 },
] };

// Falling (#361, src/fall.js; player.js tracks `fall`: the highest feet since leaving the ground and the deepest free
// drop under them). A drop of more than `hurt` m hurts (the issue's 3 m): a thud + "aj", the view jolts down, red, then
// black, and the visitor wakes at a checked random outdoor point (RESPAWN) — only the place is reset, not the home. Over `soft` m: a soft thud and a knee-bend. Only a
// real free fall counts: the gap under the feet must once have been more than `free` m (going down the stair the feet
// are at most ~two risers, 0.43 m, over a tread; the ramp 0). Timings in seconds; all our own choices.
// #868: fatal 6 m is a gameplay assumption (twice existing hurt); ack timeout bounds a lost network result, not healing. maxReport 100 m is a generous input limit (guess).
export const FALL = { hurt: 3, fatal: 6, maxReport: 100, ackMs: 10000, soft: 1, free: 1,
  red: 0.3, black: 1.0, hold: 0.8, back: 1.2, text: 3.5, jolt: 0.9, dip: 0.3 };
// Up on the roofs (#360, src/roofs.js): outdoors, feet more than `aloft` m over the ground (over our flat: above its
// top, UNIT_TOP) = up there — the roofs' own walls collide instead of the ground's. Our choice (above every outdoor
// step, below the lowest canopy).
export const ROOFS = { aloft: 2.0 };
// The jetpack (#359, #520): own unbranded model on the east wall of the portik's small room.
// Placement is a game choice; no room function is specified by Peab's plan.
// Worn on the back (hands free). Every number is a game choice, not a real jetpack's: `thrust` m/s² up while Space / ⬆ is
// held (gravity 9.8: about 60 % of the time to hover), `down` m/s² extra with C / Ctrl / ⬇, `climb` / `sink` m/s caps,
// `speed` m/s flying across, `accel` 1/s how fast it gets there (inertia), `ceiling` m (model y) and OUTDOOR's edge as the
// bounds; `heat` rises `up` per s of thrust, falls `cool` per s in the air and `ground` per s standing, `warn` beeps,
// at 1 the thrust cuts out until it is down to `resume` (a cut high up = a fall, fall.js).
export const JETPACK = {
  // #520: east wall of the portik room, faces west. h above floor; sign over m above hook, w m wide.
  hook: { x: -11.39, z: 9.1, h: 1.45, face: -1, floor: 0 }, sign: { w: 0.9, over: 0.75 },
  thrust: 16, down: 9, climb: 6, sink: 12, speed: 9, accel: 2.2, ceiling: 320, // ceiling: *guess* (#1250, was 40): above the cloud deck (SKYLAYER) with room to spare
  heat: { up: 1 / 45, cool: 1 / 20, ground: 1 / 5, warn: 0.8, resume: 0.35 }, // (hovering just about holds; 45 s of steady thrust)
  drop: 0.55, // m in front of the feet where "Ta av jetpacken" stands it
};
// Thin air (#1282): the higher over the ground, the faster the jetpack climbs and flies and the lighter gravity feels, so the
// cloud deck (SKYLAYER) is reached quickly. Not physics; every number a *guess*. Between `from` and `full` m above the ground the
// factor eases (smoothstep, no jerk) from 1 up to `climb` (× the climb cap), `speed` (× the flying speed) and down to `gravity`
// (× g while the jetpack is worn); the thrust follows the climb factor so it can still get there. Capped above `full`.
JETPACK.thin = { from: 10, full: 200, climb: 3, speed: 2.5, gravity: 0.6 };
/** The thin-air factors at `h` m over the ground: { climb, speed, gravity } (all 1 near the ground). */
export function jetThin(h) {
  const T = JETPACK.thin, t = Math.min(1, Math.max(0, (h - T.from) / (T.full - T.from))), e = t * t * (3 - 2 * t);
  return { climb: 1 + (T.climb - 1) * e, speed: 1 + (T.speed - 1) * e, gravity: 1 + (T.gravity - 1) * e };
}

// The cloud deck (#1251/#1368, src/daycycle.js `deck`): one flat cloud layer between `base` and
// `top` m above the ground (all *guess*: low clouds, a few hundred metres up, nothing measured). Flying up into it whites the
// view out (fog `near`/`far` m inside it); above `top` + `fade` m the sky is clear and the sun strong whatever the weather
// below (the lighting follows `above`, 0…1, eased over `fade` m). The deck is a single quad: it appears over the last `approach`
// m below `base` (from the ground the sky shader's clouds already cover it), initially `radius` m round the eye; above, it spans the camera far plane.
// `cloudy` = ground weather's overcast from which a deck forms (full at `full`). Approaching by flight also forms it in fair
// weather; clearly above, the opaque sea covers the camera far plane and overhead sky clouds vanish. Ground weather is unchanged.
// No textures: the density is procedural noise in the shader.
export const SKYLAYER = { base: 150, top: 190, fade: 30, approach: 70, radius: 900, near: 1, far: 28, cloudy: 0.12, full: 0.6, scale: 0.006 };

// Birds (#1252/#1924, src/birds.js): a few gulls circling the area, exclusive near/far instanced batches, no lights, no textures,
// no sound. All numbers *guess*. `count` birds (`lowMemoryCount` on phones), the last `high` of them at flight altitude (`highAlt`
// m, above the cloud deck of SKYLAYER; only drawn in clear weather or from above the deck), the rest between `alt` m round the
// area's `center` (plan x/z, round the courtyard) at `radius` m (ranges [min, max]) at `speed` m/s along the circle. `span` m wingspan, `flap` Hz. Shown by day
// (daylight ≥ `day`), not in rain / snow (rain ≥ `rain`) nor inside the cloud whiteout; faded over `fade` (1/s); not drawn when the
// eye is further than `far` m from the centre.
export const BIRDS = { center: { x: -30, z: 30 }, count: 10, lowMemoryCount: 5, high: 3, radius: [30, 100], alt: [30, 90], highAlt: [215, 290], speed: [6, 10], span: 1.6, flap: 2.6, bank: 0.35, day: 0.3, rain: 0.1, fade: 1.5, far: 500 };


// Gull art/LOD (#1924): artistic guesses, not surveyed wildlife dimensions. Near span1.6m;
// distant birds retain2x visibility scaling, without the former additional1.8x high-flock enlargement.
// Motion seeds/circle paths and weather gates remain BIRDS's established values.
export const GULL_SURFACE = {
  lodNear: 45, farScale: 2, scaleFrom: 25, scaleTo: 75,
  highScale: 1, bobHz: .31, bobAmplitude: 2.5, seedPhase: 3,
  flapAngle: .65, glideRate: .43, glideGate: [.25,.7], bankSway: .07, bankRate: .4,
  light: [.25,.8,.4], shade: [.58,.42],
  colors: { body: 0xe9e9df, wing: 0xb9c1c7, tip: 0x303941, bill: 0xd5ac45, eye: 0x202629 },
  sides: 8, rings: 5, eyeSides: 4, eyeRings: 3, billSides: 4,
  body: { scale: [.053,.053,.18], at: [0,0,-.02] },
  head: { scale: [.039,.044,.051], at: [0,.039,.153] },
  eye: { radius: .006, at: [.035,.051,.168] },
  bill: { radius: .014, length: .075, at: [0,.028,.226] },
  wingRoot: .025, wingThickness: .006, wingCamber: .012,
  wing: [[.025,.095],[.20,.075],[.35,.015],[.50,-.09],[.43,-.115],[.33,-.075],[.17,-.045],[.025,-.085]],
  tail: [[-.04,-.16],[-.07,-.29],[0,-.28],[.07,-.29],[.04,-.16]],
  farBody: [[-.04,.13],[0,.29],[.04,.13],[.055,-.15],[0,-.29],[-.055,-.15]],
  farWing: [[.025,.095],[.25,.035],[.50,-.09],[.32,-.105],[.025,-.085]],
  farTail: [[-.03,-.16],[-.07,-.29],[.07,-.29],[.03,-.16]],
};

// Hot-air balloon (#1646, src/balloon.js, src/balloongeo.js): now and then one drifts round the area above the cloud deck (SKYLAYER) and a
// visitor who flies up (jetpack) can land in its basket and be carried along. All numbers *guess*. Visible `window` s of every `period` s of
// the shared wall clock (so every client agrees), circling the plan point `center` at `radius` m and `speed` m/s at the floor height `floor` m
// (above the deck's top + fade). `fadeIn` s: scales up / down at the ends of the window (no collision until fully grown). Basket: a round
// floor of `basketR` m with a `rim` m high wall (low enough for a jump to clear, so you can step out; flying clears it too). Envelope: radius
// `envR` m, its lowest point `envLow` m over the floor; `stripes` coloured gores. Not drawn / not updated outside the window (nor underground).
// #1770 (all *guess*): the gores are the rainbow; #1779 (user: never found it): common again, `window` 1800 s of every `period` 2400 s (~75 %; #1770 had 600 of 9000 s); the gores are the
// rainbow, `rainbow` red, orange, yellow, green, blue, indigo, violet repeated round the envelope (14 `stripes` = two whole rainbows, so the
// seam between the last and the first stripe is violet -> red like every other cycle). `beer`: `count` bottles of `ml` ml (Swedish 33 cl)
// standing on the basket floor `ring` m from its centre, `step` rad apart round it; bottle `h` m tall, `r` m radius (a common 33 cl
// long-neck), `name` the label's (made-up) name. They are drunk like the fridge-shelf beers (BEER_CAN.sips gulps) and restocked full at
// every new appearance (src/balloonbeer.js).
// #1784 (user: still never seen): measured in headless Chromium with the real wall-clock schedule, it rendered correctly but was hard to find:
// at `radius` 260 it was always ~290 m from the courtyard, ~25 px tall from above the deck and a hazy ~10 px dot from the ground, and up only 75 %
// of the time. Now `radius` 100 (it circles over the houses, 40-150 m from the courtyard, visible overhead from the ground in clear weather) and
// `window` 2160 s of 2400 (90 %, a 4 min gap keeps one restock per appearance). Both *guess*.
export const BALLOON = { center: { x: -30, z: 30 }, radius: 100, speed: 3.5, floor: 250, period: 2400, window: 2160, fadeIn: 25, basketR: 1.15, rim: 0.6, envR: 8.5, envLow: 5, stripes: 14, far: 900,
  rainbow: [0xe0302a, 0xf2851c, 0xf6d02a, 0x3fa83c, 0x2f6fd2, 0x4a3aa0, 0x8c3fb4],
  beer: { count: 4, ml: 330, ring: 0.8, step: 0.17, at: Math.PI * 0.75, h: 0.24, r: 0.031, name: 'Ballonglager' } };

// The pony paddock (#1280, src/paddock.js, src/paddockgeo.js): the kidney-shaped meadow south of the timber footbridge (OSM landuse
// way `field` below, SITE.south.fields) is fenced in and holds two C ponies. Everything here is a *guess* (no survey, the report only
// names the animals): `inset` m from the mapped outline to the fence line; post-and-rail fence `post`/`rails`/`rail` sizes (m, rail
// heights above the ground), `postStep` m between posts; the closed `gate` (m wide, never walkable, collision like the rest of the
// fence) sits at the span nearest `gateNear` (the footpath along the north-east edge). C pony withers 1.27-1.37 m: `pony.withers`
// 1.32; `speed` walk m/s, `turn` rad/s, `graze`/`idle` [min, max] s per pose; ponies come to the fence when the eye is within
// `curious` m (never nearer than `keep` m to the fence line); `viewDist` m from the paddock centre beyond which the ponies are
// neither simulated nor drawn; `waypoint` m grid of places they walk between (flat, clear of trees, the river and the fence).
// `track` m wide worn ribbon inside the fence. Coats and the two names are the reporter's: white Zoey, brown Princess.
// #1919: authored pony surface/tessellation estimates (guess), within the existing
// 1.32 m rig/contact/rug frame. No per-frame geometry construction.
export const PONY_SURFACE = {
  radialSegments: 12, longitudinalSteps: 2, legSteps: 1, splineTension: .5,
  // t along the retained neck/head axes, crest offset, half-width, half-depth.
  neck: [[-.14,.01,.15,.20],[.08,-.015,.18,.27],[.26,-.005,.145,.21],[.46,.02,.115,.16],[.62,.02,.1,.13],[.74,0,.09,.115]],
  head: [[-.04,0,.082,.10],[.08,-.008,.097,.118],[.18,-.02,.087,.105],[.34,-.012,.061,.074],[.46,-.006,.066,.070],[.54,0,.072,.064],[.58,0,.045,.035]],
  star: [[.20,.082,.012,.006],[.245,.075,.024,.007],[.285,.067,.010,.006]],
  eyes: { at: [.14,.035,.092], scale: [.006,.020,.029] },
  nostrils: { at: [.505,.005,.067], scale: [.005,.017,.023] },
  faceSegments: [6,4],
  hair: { radial: 6, steps: 1, offsets: [-.024,0,.024], width: .012, depth: .04,
    mane: [[0,.22],[.25,.22],[.5,.21],[.78,.16]],
    forelock: [[-.025,.125],[.05,.145],[.17,.11]],
    tail: [[1.2,-.72,.025,.035],[1.1,-.85,.028,.035],[.75,-.92,.025,.025],[.2,-.9,.006,.006]] },
  ears: [[0,.024,.015],[.055,.035,.018],[.115,.020,.009],[.155,.002,.002]],
};

export const PADDOCK = {
  field: '237019759', inset: 1.2, postStep: 3, post: { w: 0.13, h: 1.3 }, rails: [0.55, 0.95, 1.25], rail: { w: 0.06, h: 0.12 },
  gate: { w: 3.2, near: [-116.2, 219.98] }, track: { w: 0.9, inset: 3.2, color: 0x80724c }, color: 0x7f9a4f,
  wood: [0x8a6a45, 0x7d5f3d, 0x94754d], waypoint: 5, treeClear: 2.6, riverClear: 7, maxSlope: 0.3, viewDist: 280, curious: 40, keep: 2.5,
  pony: { withers: 1.32, neck: [0, 1.12, 0.55], speed: 0.85, turn: 1.4, graze: [6, 16], idle: [3, 8], gap: 2.2,
    animals: [{ name: 'Zoey', coat: 0xdddbd5, accent: 0x93918c, seed: 7 }, { name: 'Princess', coat: 0x7a4426, accent: 0x1b1410, seed: 19, star: true }], // grey/white with a lighter-grey mane, tail and legs; bay with black points and a white star (photo in #1293)
    pet: 2.6, // s a pat takes (#1293: the pony stops, turns its head, flicks its ears, nickers)
    hearts: 10, heartScale: 2.5 }, // #1320: hearts per pat and their size/rise relative to a hug's (*guess*, readable at a few metres)
  // Grazing (#1315, all *guess*): the paddock's long grass is ONE instanced mesh of crossed-blade tufts (a jittered grid every `spacing` m, `w` m wide,
  // `colors` base -> tip) whose height the vertex shader takes from a coarse `cell` m grass-length mask (0 grazed .. 1 long): `long` / `short` m tall. A grazing
  // #1342: the tuft is two crossed quads (4 triangles) whose alpha is a procedural row of `blades` fine blades per row, three rows (fragment shader), `w` m wide and `long` m tall at most: a low shaggy
  // carpet instead of few big tufts; `regrow` mask units per REAL second (the game day is real time, #1145): a fully grazed meadow is long again after 72 h, also while the
  // player is away: the mask is kept in localStorage (at most every `save` s) with its time stamp and caught up on the next visit. (all *guess*)
  // pony's muzzle (`reach` m ahead of its body, only with the head down) eats a `bite` m radius at `rate` mask units/s; the grass regrows `regrow` units/s
  // (slow, so the pattern lasts for a session); the mask starts per session with `patches` grazed patches of radius `radius` m (min, max) at level `level`,
  // plus `around` m round the trough and the shelter (the ponies stand there most). Ponies prefer a long-grass place to graze (`tries` random places, best
  // mask) and walk on when the grass under them is shorter than `hungry`. `period` s between mask uploads.
  grass: { cell: 1.5, spacing: 1.0, w: 1.2, long: 0.28, short: 0.02, blades: 11, colors: [0x4a7a2a, 0x93b457], reach: 1.15, bite: 1.3, rate: 0.6, regrow: 1 / (72 * 3600), save: 20,
    patches: 10, radius: [4, 9], level: 0.05, around: 4, tries: 4, hungry: 0.35, period: 0.15, margin: 1.6 },
  // #1397: assumed winter rugs in the pony's existing 1.32 m local frame; open neck/underside, no cloth simulation.
  blanket: { colors: [0x315b75, 0x843e50], clearance: 0.025, hem: 0.70, trim: 0.035, trimTone: 0.42,
    sections: [[-0.72, 0.73, 1.26, 0.18], [-0.64, 0.68, 1.30, 0.22], [-0.3, 0.62, 1.27, 0.26],
      [0.05, 0.6, 1.29, 0.26], [0.35, 0.66, 1.34, 0.24], [0.50, 0.72, 1.29, 0.21]] },
  trough: { w: 1.7, d: 0.5, h: 0.42 }, shelter: { w: 4.2, d: 2.6, h: 2.3,
    // #1335/#1336 (all *guess*): the shelter stands where the ground under its footprint (+ `pad` m round it) varies by at most `maxRelief` m (the old spot dropped 0.7 m, so one side hung in the air
    // over the slope), at least `edge` m inside the fence; the posts/sill reach down to the lowest ground there (`sink` m below it), the floor level is the highest ground.
    maxRelief: 0.2, pad: 0.8, edge: 8, cornerClear: 2.5, sink: 0.15,
    // #1395: assumed rigid move towards the gate-side fence, about the shelter centre; no terrain alteration.
    // Retain the original flat-site fallback if either footprint fails. Trough relief retains the existing 0.3 m check.
    move: { delta: [11.5, -1], yaw: -Math.PI / 6, passage: 1.5, troughRelief: 0.3 },
    // #1345: winter bedding/greenery/bulbs are visual guesses, two merged batches and no extra lights.
    winter: { straw: { inset: 0.2, offset: 0.075, thickness: 0.025, grid: 10, blades: 140, bladeLength: 0.16, bladeWidth: 0.008, colors: [0xa77b36, 0xc99c4f, 0xd6af68] },
      garland: { drop: 0.03, sag: 0.1, step: 0.1, radius: 0.075, leafLength: 0.2, colors: [0x274d28, 0x38613a, 0x486e3a] },
      lights: { count: 16, radius: 0.036, drop: 0.075, colors: [0xffd48b, 0xffe3aa, 0xffc46b] } } },
  // #1316 (all *guess*): big shade trees in the meadow, [x, z, scale] like `SITE.bigTrees` (surroundings.js builds them as kind 'big': the shared crown/trunk batches,
  // so no extra draw calls; their trunks block through `treeFeet` like every other tree); at least 10 m inside the fence and 25 m from the gate (paddockgeotest checks).
  trees: [[-170, 247, 1.2], [-215, 270, 1.3], [-235, 293, 1.15]],
  // Weather (#1316, src/paddockshelter.js; all *guess*): rain (the weather's strength 0..1, not snow) of at least `on` sends ponies to a sheltered spot, until it has been under `off`
  // for `dry` s; each rain a pony goes with probability `chance` (at least one does, the others may stand out in it). A sheltered spot is under the shelter's roof (two, at +-`shedX` m
  // across it) or on a ring of `ring` x tree scale m round a tree (under the crown, clear of the trunk; `treeSpots` of them each). In the snow months (SEASON.snowMonths: the ground
  // is white) the ponies stand visibly in their two places under the shelter roof (#1352), and walk out again when the snow is gone.
  rain: { on: 0.12, off: 0.03, dry: 20, chance: 0.8, ring: 2.3, treeSpots: 4, shedX: 0.9 },
  // #1396: two hay boxes at the existing roof stalls; visual dimensions (m) and ambient feeding times (s) are guesses.
  feed: { w: 0.8, d: 0.65, base: 0.06, rail: 0.045, h: 0.1, mound: 0.14, strand: 0.025, strands: 22,
    wood: 0x765337, hay: [0xd6ad55, 0xb88d35, 0xe2c778], reach: 1.05, arrive: 0.15, neck: 1.1, facing: 0.2,
    seconds: 16, interval: 95, refillSeconds: 120, stagger: 5, rate: 0.09, empty: 0.015 },
  // the stile beside the gate (#1295, *guess*): `w` m wide, `minSpan` m the fence span it needs, three risers of `rise` m (under PLAYER.stepUp 0.45, so the ordinary
  // stepping walks it) over two treads of `tread` m either side of a platform that is 2 × `platform` m long; `reach` m from the fence line to the walls' ends
  stile: { w: 1.0, minSpan: 1.9, rise: 0.38, tread: 0.3, platform: 0.25, reach: 0.95, post: 0.95 },
};

// The Spider-Man suit (#597, src/spidersuit.js): folded in the second drawer of Walter & Kian's MALM (Sovrum 2; the
// MALM entry's `suit: true`). E puts it on / lays it down folded (like the jetpack, `drop` m in front of the feet).
// With it on, outdoors only: walking into the façade of a building listed in roofs.js (a roof surface above you behind
// the wall) holds you on it; W / the stick up climbs, S down, A / D sideways, Space lets go; within `reach` m of a roof's
// edge you pull yourself over onto it. Webs: a click with nothing in focus and empty hands (touch: the 🕸 button) shoots
// a strand to what the crosshair hits within `range` m, a web splat stays there `life` s; at most `max` at once
// (draw calls, #592). Every number is a game choice (*guess*), not a measurement.
export const SPIDER = {
  climb: 2.2, side: 1.6, // m/s up / down and sideways on a wall (*guess*)
  minWall: 1.0, // m: the roof behind a wall must be at least this far over the feet to grab it (no fences, no kerbs) (*guess*)
  reach: 1.3, // m over the feet within which a roof's edge is pulled over (*guess*)
  probe: 0.3, // m past the body's radius where the wall / the roof behind it is looked for (*guess*)
  drop: 0.5, // m in front of the feet where "Ta av dig dräkten" lays it (*guess*)
  web: { range: 35, life: 8, max: 4, speed: 60, size: 1.2 }, // m, s, webs at once, m/s of the strand, m across a splat (*guess*)
  jump: 7, // m/s up off the ground with Space / the touch jump button: about v² / 2g = 2.5 m high (#600, *guess*); indoors (#636) the ceiling stops it (player.js `ceilingAt`)
  // swinging on a web that stuck (#600): `pull` m/s² towards the anchor, `reel` m/s the strand shortens, `speed` m/s at
  // most, `gravity` the share of gravity felt on the strand (more zip than pendulum), `arrive` m from the anchor (the
  // hands) = there, `max` s at most on one strand, `stall` s getting no closer = let go, `fling` 1/s the air's drag on the
  // speed kept after letting go (*guess*)
  swing: { pull: 18, reel: 4, speed: 16, gravity: 0.4, arrive: 1.0, max: 4, stall: 0.6, fling: 0.4 },
  colors: { red: 0xc8202a, blue: 0x1d3f9a, line: 0x140a0a }, // the suit (own drawing, no licensed artwork)
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
  // Entréplan's north wall steps back 12 cm here (plan.json; Övre plan draws the same spot as a closed shaft inside the
  // wall). The recess stays in the cupboard under flight B (cleaning.js); above the treads world.js closes it (#1526).
  niche: { x0: 3.9814, x1: 4.5313, z0: 5.5844, z1: 5.7044 },
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
  fence: 0xa7b6aa, // grey-green screen wall (skärmvägg) until #1786; the walls now use SCREEN_WALL's board texture
  brick: 0x8a3b2a,
  mortar: 0xcfc6b8,
  balcony: 0x8fa396, // pinnaräcke grågrön (brochure)
  asphalt: 0x5d5f61,
  paving: 0xb9b4aa,
  water: 0x47657a,
  solar: 0x1d2735,
};

// #2069: visual timber/varnish assumptions, not measured oak finish data. Existing plank metres stay in FINISH/STANDARD.
export const PARQUET_SURFACE = {
  ppm: 300, boards: 6, lengths: 2, seed: 7, stagger: { one: .37, three: .53 }, anisotropy: 8,
  fibresPerMetre: 220, wave: [7, .0038, 19, 1.7, .0009], pathStep: 12, lineWidth: .65,
  dark: [120, 95, 70], light: [245, 229, 204], alpha: .14,
  forkEvery: 7, forkLength: .26, forkWidth: .075, forkSteps: 12,
  roughScale: .5, roughBase: 255, roughGrain: .012, roughWidth: 3.5,
};
