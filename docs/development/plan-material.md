# Apartment facts, materials and references

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [architecture](architecture.md), [furniture](furniture.md), [graphics](graphics.md).
## Module and test map

```text
docs/                  reference images in git (site map screenshot; docs/peab/ = pages of Peab's plan
                       brochure: situation plan, overview plans per floor, unit plans, aerial render)
                       docs/peab/kalibrerad/ = the overview plans + situation plan at 300 dpi from the
                       collected Peab material, skalstockar.json (m per PDF unit from each 0–25 m scale bar),
                       modell-mot-plan.jpg (the model before #252/#253 over the situation plan); bostader/ = bofakta
                       sheets of Hus L's other units, text/ = Q&A + info brochure text; index: docs/peab/README.md
material/              screenshots of our choices in Peab's option portal (local, see below)
```

## Known facts about the apartment

- Two levels, 5.75 × 12.70 m outside, 63 m² boarea. Row house; side walls are party walls.
- Ceiling height: **Entréplan ~3.0 m**, **Övre plan ~2.8 m**. Peab's fact sheet ("bofakta",
  linked from the project page) gives RH 2.5 m over Tvätt/Badrum and in WC/dusch.
- Vertical reference (#344, `VERTICAL` in config): y 0 = the finished floor (FFL) of our Entréplan = våning 1 = street /
  courtyard level. Per level: FFL, RH (bofakta: 3.0 / 2.8 — *drawing*), the slab zone above it (0.25 between our floors,
  0.35 from Övre plan's ceiling to våning 3's floor = the loftgång deck — *assumption*); våning 3–4 floor-to-floor 3.0, the
  roof build-up 0.3 + 0.05 capping and `SITE.storey` 3.0 for Hus A/B/C — all *assumption* (plan brochure S2 gives only
  storey counts). `LEVELS` (floor, ceiling = RH, top), `SLAB`, `UNIT_TOP` (6.4), `storeyFloor(n)` and
  `HUS_L.storeyHeight` are derived from it; each slab is counted once. RH is not floor-to-floor; BH is from the FFL.
  Missing: a section with levels (plushöjder) — the stair's total rise, façade band, loftgång and roof heights hang on it.
- **Sovrum 1 and Sovrum 3 (north) have a lowered ceiling, RH 2.4 m**, a boxed-in ceiling ~1.5 m
  deep from the façade, because the access balcony (*loftgång*) for the units above runs there.
- Window sill heights (BH) per window are from bofakta; head heights are estimated from Peab's
  renders (see `WINDOWS`). Windows/exterior doors have a glazed transom; the patio door is glazed.
- Façade: red brick (and some white render) per the brochure. The building is "staplade
  radhus": a two-storey unit sits on top of ours, entered from the loftgång (floor 3).
  Neighbours/upper units in `exterior.js` are simplified copies of our façade.
- Peab's 3D plan of L1002–L1007 (peabbostad.se …/planlosningar-i-3d/l1002-…-l1007.jpg, a mirrored
  sibling unit) confirms the stair: straight lower flight between the Klk wall and the living-room
  wall, winders at the far end, white railing with balusters around the opening, oak treads with
  white risers (ours: Ek Chalk treads like the floor, see Material choices).
- Hus L / "Parklängan" (overview plans + aerial render in `docs/peab/`, `HUS_L` in config): a straight
  four-storey bar along Sankt Lars väg (the user's "L-byggnad" = Hus L, not an L shape). Våning 1–2:
  L1001–L1004 | stair core with a ground-floor portik (L1101 above it) | L1005–L1008; all units the
  same way round (not mirrored), we are L1007, L1008 is the east end — our neighbour on the left seen
  from the street (#42): kitchen window on the gable, no window beside its door, no Sovrum 1 window
  upstairs, the escape spiral stair right against the house (`HUS_L.endUnitNorthHidden`, towers). Våning 3–4: L1201–L1209 on the same grid (L1208 above us, L1205 over the
  core). The units share their party walls (#252): 5.55 m between wall centres (`HUS_L.pitch`; our plan.json
  draws both 0.2 m walls in full, W = 5.75), core 8.175 m, end units 0.38 m wider; 53.3 m gable to gable —
  `husLLayout` in exterior.js gives the units' façade strips (greet.js uses it too), white render with brick pilasters on the street side, entered from the loftgång on våning 3 (their north face 1.57 m behind ours, `HUS_L.loftgangDepth`: bofakta + the overview plans, #354). Courtyard side (#337, `HUS_L.court`,
  bofakta L12xx 1:100 + Peab's render `docs/peab/info-s16-render.jpg`): våning 3 brick, flush with ours (measured windows); våning 4 set
  back 1.9 m in white render (window BH 1.2 + terrace door) behind roof terraces (slab deck, parapet + coping, white railing,
  skärmväggar h 1.8 between units); over the core L1205's 3 m loft over the lift stays flush in brick and rises over the roof,
  breaking the terrace row; some of those windows are lit at night; greet.js `occluders` have våning 4 set back (rain on the terraces); spiral stairs in
  brick drums at both ends, both right against the house (#42, #172: the west one against the west gable); flat roof with solar panels.
- Site (`SITE`): measured on the situation/overview plans (1:500, Hus L horizontal = our axes, metres
  from our NW corner), scale from the sheets' 0–25 m scale bars (#253, `docs/peab/kalibrerad/`; the first
  tracing was 3.6 % too big and was scaled by 5.55 / 5.75). Hus A (x −9.8…9.4, z 28.8…52.9, våning −1…4),
  B (x −41.7…−22.6, z 33.3…57.4, −1…3), C (x −70.6…−51.4, z 12.6…36.7, 1…5), each 19.2 × 24.1 m, brick with low hip roofs; the courtyard is on a garage and the
  ground drops ~3 m south of it.
  Å-husen's shape (#258, per block `corners` / `recesses`, `SITE.loggia`, `SITE.hipRoof`; `aHouse` / `loggias` in
  surroundings.js): an outline extruded per storey band — corner loggias of their own size (A/B: north 3.4 × 2.0, south
  5.9 × 2.05 with a mid pier; Hus C turned, its NE one opening east), white-rendered entrance recesses with a dark glazed
  door (A/B north on våning 1, A west / B east on the park level, Hus C east with loggias above), a low hip roof (ridge N–S).
  #348: each house has its own roof (`roofSpec`: `SITE.hipRoof` defaults + the block's `hip`), its eaves on its own wall
  top; A's and B's roof plans (våning 5 / våning 4 sheets) give the eave line (overhang 0.18), the 45° hips and a roof box
  (`hip.box`); the rise, the box height and everything of Hus C's roof (no roof plan) are guesses.
  #266: every loggia storey has a glazed door (inner corner) + a window on its longer inner wall (`loggiaOpenings`, lit at
  night with the window lights); piers and parapets are plain brick (`facadeTexture(true)`); a loggia whose floor is at the
  ground just outside its front (`frontGround`) gets a brick parapet with a coping and an opening next to the flat's wall,
  the ones above the slatted railing; the entrances have a glazed door + sidelight (lit stair hall at night), a canopy
  and a house letter plate (A/B/C).
  #345: the outer façades' windows are no longer a 3 × 3 m grid: `SITE.facades` lists the openings per house, face and
  storey as read off the calibrated overview plans (våning −1…5; count and horizontal placement sourced, heights and the
  mullion/transom guessed, `openingSize`); `aHouseParts` makes those faces plain brick and `openingDecals` puts each
  opening on as a decal (one atlas, `openingTexture`), lit at night by `buildWindowLights`. A face without a list keeps
  the old grid texture as the fallback (none of A/B/C's faces now).
  Terrain (#79, `SITE.terrain`, `groundY(x, z)` in surroundings.js): the street north of Hus L, our Entréplan
  and the raised courtyard on the garage box (`terrain.box`, #254: edges from våning −1 and the level lines on
  våning 1 — west part x −70.5…−41.7 to z 52.5, between B and A to z 33.3, east of that to Hus A's north face)
  are y 0 (#346: `terrain.ref` — every terrain height is relative to the courtyard = Entréplan's floor, no real plushöjd
  is known (`ref.plus` null); `terrain.documented` = S2's only level differences (~3 m park, ramp ~0.9, east stair ~1.4,
  NW stair ~1 m), local conditions, never summed; slopes / break points between them are guesses; the garage drive is
  level with the garage floor; `tools/terraintest.html` checks the joins, plinths and that walkable ground has no
  unguarded step); around the box the ground is one storey lower (`park` −3, Å-husen A/B suterräng); retaining
  walls with a railing where the box meets it (none along a house's façade), the garage door in its west face
  south of Hus C (z 41…47) with an asphalt drive from Karpvägen (#357: walkable inside, src/garage.js — p46 room layout; parking/cages/heights assumed), stairs down to the park level (`terrain.stairs`:
  between Hus C and B, #254).
  East edge (#255): the box ends at x 11.6; the `terrain.ramp` x 11.6…13.5 falls 0.9 m from a landing (the box's last
  part, z 24.5…27.25) by the walk along Hus A north to the street by Hus L's gable (#256, walkable: outdoors
  `player.groundAt` uses `groundY`), with a wall + railing along the street; from the landing a stair goes 1.4 m down
  to a walk east to Sankt Lars väg. Sloping streets (#256, the user: the street towards HepCat slopes): Sankt Lars väg's
  east leg follows `terrain.east.profile` (level with the entrances up to z −10, −0.9 by the gable, −1.4 at the stair's
  foot, the park level by z 44), the strip along Hus L's gable falls from the entrance path to the ramp's foot (a
  plinth under the gable), a grass bank (`east.level` → `east.walk`) joins the level front yard; Karpvägen west of
  Hus C's façade line follows `terrain.west.profile` (−1 by Hus C, the park level by the garage drive), with the plan's
  wide stair ("NIVÅSKILLNAD CA 1M", `west.stair`: treads ending where the sloping verge meets them) down from the bike
  yard's west edge. world.js's flat plate covers the street side only where it is level (`terrainNorth`); HepCat and the
  long building stand on plinths down the slope. The box edge pieces are collision too
  (`surroundings.userData.segments`, those in `OUTDOOR`), so the visitor never walks off it — except down a stair (#355:
  `groundY` has the `terrain.stairs`' treads and the NW stair's, the edge is open at a stair's top, its sides collide).
  Hus A's stair core (#637, `CORE_A`): read off the five calibrated sheets (kalibrerad/vaning-m1 … 4-300dpi.png, transform #253, ±0.15 m;
  one frame at Hus A): the stair hall is ~1.85 m wide (x −1.05 … 0.80) from the lift's front wall (z 37.3) to the stair's south wall
  (z 45.5) on every storey; the lift's car ~1.1 × 2.15 m with its door south; the stair two flights side by side with winders at the
  south end (≈ 0.22 m treads) from z 42.84; the entrance door in the recess's back wall swings 0.7 m outwards, hinged east, a fixed
  glazed strip west of it; the lobby east of the shaft (x 0.22 / 1.13 … 2.5) on våning 1 and −1 (the garage's `passageA*` rects); the
  basement hall's openings west (z 41.4 … 42.75) and east (z 37.3 … 40.1). Heights (storeys 3.0, slabs 0.25), the winders as a landing,
  the door / guard sizes, the lift's car / speed and the flats' doors are *guess*; the interior fire doors (plan z ≈ 38.2 and 41.1)
  and the flats are not modelled.
  Courtyard (#80, `COURTYARD`, re-measured on the calibrated situation plan in #259 — the transform is in its
  comment): the Borggården between Hus L, C and A with stone walks (along the patios; the south walk along Hus B
  to Hus A's west façade, a little square at the edge between B and A; along Hus A's north side to the east stair;
  the walk between Hus C and the courtyard with a branch to C's entrance), lawns round the tree squares and gravel
  only round the playground and the boule strip, the pergola with a dining table, a grill, a sandbox, a boule
  court (not on the plan: guess), benches and tree squares; south of Hus C a second pergola, a sandbox and
  four odlingslådor; the trees between A and B on the lower green. #355: the whole block is walkable (`OUTDOOR`
  x −78.5…27.5, z −14…64: the car park, Karpvägen and the garage drive, the park level round Hus B / A, Sankt Lars väg's
  east leg, through the portik); Hus L's row (`husLLayout`, open at the portik), the Å-husen's outlines with their
  entrance recesses walked into (`recessFloors`: the floor at the recess's storey) and the box edge collide. **True north**: FOJAB's arrow puts it 58° left of plan-up, so the
  plan's "north" (entrance) faces ENE (bearing 58°, `DAY.planNorth`) and the patio WSW. The schools outside the
  plot are placed from the Google Maps screenshot; HepCat, the long brick building and the villa follow the situation
  plan's outlines (#261: HepCat z −10.8…10 right by the road, an open gap, the long building z 23…61.6 + an annex); straight across Sankt Lars väg
  stand a 2.3 m brick wall and a two-storey school with white quoins (`style: 'school'`, `SITE.school`, #126,
  the user's photos in `docs/foton/`); east of our row HepCat Store (brick, white pilasters and a white rendered
  gable part) and the long brick building with dormers south of it (`hepcat`, `hepcatWhite`, `longhouse`, #127).
  The others are drawn in the old
  S:t Lars style (#47, `style: 'old'`: brick, white cornice and string courses, tall arched windows,
  steep dark hip roofs, 3.6 m storeys) after the drone photo/render — storey counts are guesses.
- Windows (#103, #272): one top-hung sash per window, no mullion — below the fixed transom (if any) it opens with E,
  the bottom swinging out (`addWindowFrame` in world.js, a 'flap' Openable, `WINDOW_TOP_HUNG_MAX`, no collision).
  The living-room window is three-part (the L1004 render): the transom over the whole width, an off-centre mullion,
  a wide fixed pane on the left and a narrow sash on the right seen from inside (`split` / `opens` in `WINDOWS`).
  The neighbours' / upper units' fake windows (exterior.js) copy the transom bar, mullion and sash rails (`win`).
  Sovrum 2's south window (#353): smaller than Sovrum 4's (the user, #107), as the original sheet already draws it, so the
  drawing governs: the PDF opening (~1.41 m, read off the drawing, not verified) and BH 0.7; head 2.25 / no transom are guesses.
  Pleated blinds (#273, `BLINDS`, src/blinds.js): bottom-up plissé in every window (dark blackout in the bedrooms,
  white on Entréplan), folded by default on the window board, drawn up to the head (over the transom too); the sash opens
  outwards behind a drawn blind. Blackout blinds up = the room gets dark by day (sun shadow + `DayCycle.dim`).
  An open casement plays `sfx.wind` (looping gusty noise) until it is closed. The front door has a brass letter
  flap (`letterFlap`, an Openable in world.lids riding on the leaf, kept out of the door's merge via `door.keep`).
- Skärmvägg by the patio H 1.8 m, stair railing H 1.1 m (bofakta). The railing's middle run stands on Entréplan's wall between
  the flights, carried up to the upstairs floor (no slab in the hole), with newel posts (`STAIR.newel`) at its corner and ends (#232).
  Handrails (#419, `STAIR.handrail`, all sizes *guess*): one continuous wall-side rail (living-room wall along flight A,
  the east party wall round the winders, the north wall along flight B) and one per flight on the inner side (the Klk wall
  along flight A, on the balusters along flight B — the railing's top is 1.3–1.7 m over flight B's nosings); the bottom
  extensions are cut short by the living-room doorway, the top ones by the upstairs hall's wall corner and the newels.
- U-shaped stair with winders at the east end: flight A (Entréplan, going east), 180° winders,
  flight B (going west) arriving in the upstairs hall. Upstairs slab opening = stair outline on
  Övre plan. #352: the total rise is the floor levels' (`stairRise`), 15 treads (4 + 8 + 3) + 1 = 16 equal risers
  (3.25 / 16 ≈ 0.203 m: a model calculation, not a measured riser; don't change the count to get a usual riser).
  No stair drawing or section exists in our material — the list of values waiting for one is in the comment over
  `STAIR` in config. `SOFFITS[i].extent` says how sure each box is ('rooms' = the named rooms' outline, 'guess').
  tools/stairtest.html checks the geometry.
- The Klk under the stair on Entréplan (#338, `CLEANING`): x 3.47–5.55, z 5.70–6.61 (east of x 4.67 it runs on under the
  winders); head room slopes from the slab (3.0) over flight B's soffit (2.39–2.80) to the winders (1.58–2.19). Cleaning
  things kept neatly: shelves on the north wall, the mop bucket + tool rail at the low east end, the stick vacuum on the south wall.
- Foot of the stair (#286): coming down flight A (west) you face Badrum's east wall (x 2.152, passage side); an unframed
  black and white canvas ~80 × 80 cm (*guess*) hangs there centred on the wall between the Badrum door's architrave and the living room (#300: z 7.014, centre 1.55 m) — FURNITURE
  `pictures` with `frame: 0` (a black stretcher box, the picture on its face), textures/tavla-svartvit-trappan.jpg.
- Stair pictures (#220, #233): four black-framed pictures 2 × 2 (fikus, akvarell | peace, solros) in the upstairs
  stairwell, on the east party wall across the stair hole (seen face on from the upstairs hall and on the winders),
  centred on it (z 6.654), centre 1.57 m over the Övre plan floor. Each picture 30 × 40 cm, 40 × 50 cm outside with
  passe-partout and frame (*guess*). FURNITURE `pictures` (one atlas texture, 720 × 920 px per frame, `order` swaps
  them; two merged meshes), a loose item.
- Upstairs hall (#411): a JYSK DANI rattan floor lantern (Ø 33 × 54, `DANI`, builder `dani`; shape from
  docs/golvlampa-jysk-dani*.jpg, *guess*) on the floor in front of the stair railing's west run by the corner post (#423, not by Sovrum 1's door), a small lamp of its own
  ('rottinglampan', dusk on/off) with a striped pool on the floor (cut at the stair hole) and a spot on the ceiling.
- Doors: Badrum and Klk on Entréplan swing into the passage by the stair, so all swing doors
  start closed. The dashed door to Allrum is a tillval that **we have chosen** (`OPTIONS.allrumDoor`
  + a short extra wall in `EXTRA_WALLS`) → Allrum becomes **Sovrum 4** (four bedrooms upstairs).
  Wardrobes (G, and L in Sovrum 2 — `WARDROBE_LABELS`) are hollow with two sliding fronts on separate
  tracks (one open at a time).
- Interior doors (#45, `DOOR_TRIM`): the swing leaf fills the gap with a 3 mm fog at hinge, latch and
  head; architraves (70 × 12 mm, door colour, one merged mesh per level) frame every interior swing
  and sliding door on both wall faces — 8 mm on a sliding panel's track side. Light switches sit just
  past the architrave on the latch side.
- Sliding doors run towards the side with enough wall to park the panel (the plan arrows
  are not reliable — the Tvätt arrow pointed through a 19 cm wall stub into the hall).
- Vardagsrum furniture (wanted by the user): IKEA LANDSKRONA 3-sits + schäslong, Gunnared
  ljusgrön, back to the window, chaise in the SE corner (its outer arm ends flush with the sofa's seat
  cushions, the chaise cushion runs on past it full width, `chaiseArmDepth`, #279); decorative cushions of our four kinds (#313,
  `docs/vardagsrum-prydnadskuddar-filtar.jpg`; along the back from the chaise: a near-black bobble knit, a geometric patchwork,
  a blush pink corduroy, a leaf print on cream) and a folded plum ribbed fleece throw on the chaise's foot end; in the armchair
  the leaf print and the bobble knit with a dark grey fleece throw draped over its right arm (`CUSHIONS`, #278; the
  sofa's sit spots keep clear of the corner cushion); matching armchair and, in front of it, a dark red upholstered stool (#180, `OTTOMAN`, guessed from the user's photo; a seat since #445, 'pallen') in
  the NW corner with a floor lamp (IKEA NYMÅNE, 3 spots aimed at the seat, on the sitter's right, #56)
  and a dark purple JYSK RANDERS tray table (#405, `RANDERS`, src/randers.js, Ø 47 × 51) with a small flower and the book. Dimensions in
  `LANDSKRONA` (config) — the chaise/armchair numbers are series estimates. In front
  of the sofa: coffee table ILVA Woodstock, oiled oak veneer top, 120 × 60 × 47 cm (#410, `COFFEE_TABLE`: a soft rounded top, splayed tapered legs, a shelf of round dowels).
  Under both: a 300 × 200 cm rug (#55, no collision) in Sarah's pattern (#171, `archRugTexture`: dark olive with
  off-white stripes bending in U arches, square fields per `fields` in its FURNITURE item).
  Opposite the sofa (the wall with the stair behind it): IKEA BYÅS TV bench 160 × 42 × 45, high-gloss
  white (#67; a drawer at each end, an open shelf between, #212), east of the living-room door, with the TV on it (#68: Philips 55", E toggles; an animated
  canvas picture ~12 fps + an additive Ambilight glow; furniture E targets are `world.furnitureTargets`).
  In the NE corner right of the TV (seen from the sofa) stands "långlampan" (#270, `LANGLAMPA`, builder `tubelamp`,
  docs/langlampan.jpg): a round foot, a ~20 cm stem, a tall linen tube with a spiral wire and bulbs inside; a small lamp
  (dusk on/off, E on the shade), lit it glows warm with additive washes on the two corner walls and a dim pool light.
  IKEA SYMFONISK speakers (#186, `SYMFONISK`, FURNITURE `symfonisk`): the white bookshelf speaker stands in Sovrum 1's window (#201, colours swapped in #298),
  the black one at the east end of the kitchen window's inner board (#289, #298; that spot was the worktop's, left free), the lamp
  speaker (frosted glass, its own lamp: E toggles it) on the window board behind the sofa; a sill pot is skipped where each
  stands (`SILL_PLANTS.skip`).
  Smart speakers (#325, `NEST`, src/nest.js): a smart display in the middle pot's place on the kitchen window board (turned 15°
  towards the dining table), a round one in a wall mount 1.68 m up on the living room's south wall between the patio door and
  the west corner (over the palm), one 1.6 m up on the upstairs hall's west wall (x 1.54, z 6.01: left of the NISSEDAL mirror, by the WC door, #332).
  The secretary "Bang" (#118): fully open, its flap is a put-down surface (#447: a surface rect with a `gate` group shown only
  then; furniture.js `standingOn` finds anything standing on such a surface, whatever kind of thing it is) and it does not close
  while something stands on it ("Ta bort det som står på skivan först").
  Over the secretary "Bang" (#118) on the east wall: the IKEA SKOGSGRÄNSEN mirror Ø 50, copper (#265, `SKOGSGRANSEN`, hung with
  the wavy bars at the bottom, centre 1.58 m up), and on the secretary's north end a small yucca palm (`YUCCA`, a Thing you can
  take, kind 'plant') whose leaves cover the mirror's north edge; the owl and the cactus moved south.
- Front (#406, #422): a JYSK ABORG café set, mörk sand (`ABORG`, src/aborg.js, builders `aborgtable` / `aborgchair`), in front of
  the kitchen window: the 60 × 60 × 71 table 3 cm off the façade under the sill (the top-hung sash swings out over it),
  without a pot plant (#490), with a put-down surface; the two chairs
  (seats) west and east of it, both facing straight out to the street, backs to the house.
- Patio (user's wish): the family's own Rusta "Loungemodul Verona" (#408, replacing the Plantagen Oslo set of #397 / #407; `PATIO.verona`, builder `veronasofa`; docs/utesoffa-rusta-verona.jpg, docs/utesoffa-verona-utan-dynor.jpg): an L (#429) — four 68.5 × 66 × 67 modules in a row, backs to the façade under the living-room window, the east end in the NE corner, an arm at each end; every module has its back, so the window's opening sash only opens 4° and stops against the westernmost back (`max` on its WINDOWS entry, world.js `addWindowFrame`); both divans end to end along the east screen wall from the row's east module, one long bench (z 13.42–16.02); dark steel tube, beige / sand cushions; seven seats, the row's facing south, the bench's three west towards the table; the small low slatted table in the L's corner (`slattable`, `PATIO.slatTable`, 60 × 45 × 40 *guess*); outdoor cushions (`PATIO.cushions`, #399, one merged mesh: ochre, off-white striped, a sage lumbar, terracotta along the backs; sand striped, dusty blue, a sage lumbar, ochre standing against the screen wall on the bench, `wall: true`) lie in it Apr–Sep unless it rains, else in the cushion box (#400, `dynbox` / `PATIO.dynbox`: anthracite slatted, 125 × 58 × 60 *guess*, back to the west screen wall right of the patio door; E opens the lid, an Openable flap, 88°; a blanket + the put-away cushions inside, drawn while open; #445: a seat too — looking at its front / ends "Sätta dig på dynboxen", two spots on the shut lid, none while it is open ("Stäng locket först", rest.js `taken` / `blocked`), and its lid is no target while you sit on it; #447: the shut lid is a put-down surface, cups too, and does not open while something stands on it, "Ta bort det som står på locket först"). A parasol south of the table, its canopy tilted towards the plan south (true WSW, `tilt`) so it shades the seats in the afternoon / evening (#398; up Apr–Sep while
  the sun is up), two big planters (palm by the patio door, agave in the SE corner by the hedge; the banana that blocked the
  gap in the hedge is gone, #52), two beers on the table Jun–Aug
  12–23, a snowman on the lawn just beyond the gap in the hedge Dec–Feb (`PATIO` in config), on snow (#73). Floor: 40 × 40 light grey slabs in half
  bond (`PATIO.paving`, `pavingTexture` in patio.js, UVs in metres), also on the neighbours' patios.
  LED string lights on both screen walls (#81, `PATIO.stringLights`, `buildStringLights`): one InstancedMesh
  of bulbs, on below daylight 0.3 / off above 0.4 with a 1 s fade, each string borrows a pool light
  (`lights.extra`); `&lights` keeps them on; hidden with F.
  E on the parasol folds/unfolds it (#51, `patio.targets`); the hand-made choice holds until the automatic
  state itself changes (sunrise/sunset, season). Not a target while F hides the furniture.
- Material choices (Sarah's screenshots in `material/`): parquet Ek Chalk (white-stained oak),
  walls/doors NCS S 0500-N, stair treads in the same Ek Chalk parquet as the floors (an extra-cost
  choice; `buildStairs([M.floor, M.riser])`, #54) with white risers, hall granitkeramik City Amsterdam
  30×60, wet rooms City Amsterdam 15×15 + white matt 20×40 wall tiles, kitchen fronts Form Tall
  (grey-green shaker) with black Solo handles, Delaware stone worktop, white 10×20 half-bond
  splashback, stainless fridge/freezer, black oven/microwave/hob. The photos of the kitchen and
  bathroom are *example* layouts with our materials — the kitchen layout is
  `material/Köksritning.jpg` (tall oven unit, wall cabinets, top cabinets over fridge/freezer,
  gypsum boxing above the hood). Colours/sizes live in `FINISH` / `KITCHEN` in config.
- The family (#164): Sarah and Olof are married, two families moved in together — Olof is the father of Tilly,
  Kian and Tuva, Sarah the mother of Walter and Livia. Text that mentions them must not make all five siblings.
- Who sleeps where (the user's plan; "left/right" as you arrive upstairs walking west):
  Sovrum 1 (first right) Sarah & Olof, double bed IKEA IDANÄS 180 × 200 (`IDANAS`, #91; centred on `BED1_Z` 2.55, moved 0.25 m south towards the Klk in #403 — its tables, lamps, picture, the TV and the rug follow; a white 70 × 100 hotel pillow under each chintz head pillow, `PILLOWS`, `hotel`, #308, docs/hotellkudde-70x100.jpg), under a 150 × 100 cm black-framed meadow-grass picture on the east wall, 1.33–2.33 m up, clear of the soffit (#284, `pictures` item, textures/angsgras-sovrum1.jpg from docs/tavla-sovrum1-angsgras.jpg), a NORDLI chest of
  drawers in its Klk, against its west wall (#336, `KLK.westFace`) (an AK-47 in its wide bottom drawer, #196) (no wardrobe in Sovrum 1; the Klk is 1.65 × 1.20 inside, #94; fitted out in #331,
  `KLK`, src/closet.js: Peab's shelf + clothes rail on wall standards along the east wall and a shelf over the NORDLI per L1204's fittings
  sheet, docs/klk-sovrum1-inredning-*.png; Sarah's and Olof's clothes, make-up on the chest under a lit LED mirror, a round cream rug) (a sage green IKEA chintz bedding set from a Sellpy ad, #83) with IKEA NORDKISA bedside tables (#64) and white NYMÅNE work
  lamps on them (#65, each its own lamp like the floor lamp) + an IKEA RÅGRUND towel-rack chair against the west wall left of
  the window, just south of the curtain's west stack (#60, #403: z 0.725–1.115), under an A4 black-framed line drawing (#404, a `pictures` item with a moulded `step`, centre 1.65 m up), the user's grey shag rug 240 × 340 with a white zig-zag under the bed (#317, `pattern: 'zigzag'`, 2.8 cm;
  across the bed, z 0.74–4.14, from the head wall to 18 cm past the foot), and a Philips 43" PQS7801 on the west wall across from the bed (#213, black frame, Ambilight #223):
  "sätta dig upp i sängen" (look at the bed's foot half; `aim` on a rest spot) puts it on, getting up puts it off; Pingping, a navy
  penguin cushion, sits between the pillows (#269, docs/pingping-pingvinkudde.jpg); teal jungle-animal print curtains on a ceiling track under the soffit in front of the window (#342, `CURTAINS`, docs/gardiner-sovrum1-turkos-djurmonster.jpg; two-part, meeting in the middle, #362; open by default, parked at
  the sides, both stacks off the glass — the west one in the NW corner by the wall, #403); a framed photo of Miele, the family's cat, stands on the window
  board (#322, `PHOTO_FRAME`, builder `photoframe`, textures/miele.jpg from docs/miele-foto-ram.jpg; a Thing, kind
  'photo': "Titta på Miele" brings it up close); on that board from the west (#409, #418): a Philips Hue Go
  (#428, docs/hue-go-produktbild.jpg: the classic frosted hemisphere on its curve, the flat face tilted to the room; `HUE_GO`,
  src/huego.js: a lamp of its own; looked at, the shared action menu (#367) offers "Tänd/Släck" and "Byt färg", which steps
  through `scenes` — FloorLamp.recolor: glow, pool light and shader wash; the colour is kept over a reload, keep.js `lamps.colors`), the photo, the fern (the middle pot slot), the speaker
  standing upright at the east end, its light grey fabric front to the room with the − ⏯ + strip low on it (`controls: 'front'`,
  docs/symfonisk-bokhylla-staende.jpg); an oak hook rail with five black hooks on the Klk's outside facing the room door (its west wall in the alcove
  by the door, #329, `HOOKS`, `src/hooks.js`): a sage waffle dressing gown and a navy hoodie (hung by its hood), three hooks empty,
  clear of the switch · Sovrum 3 (second right) Livia & Tuva, bunk (unicorn sheets), an IKEA ALEX desk under the window
  with crafts and a kids' chair (#92), a birch hook rail with white hooks on wardrobe G's end by the door: a pink zip hoodie and a rainbow
  tote, two hooks empty (#330, `KID_HOOKS`), a round dusty-pink short-pile rug Ø 160 (guess) out in the room under the bunk's ladder (#318)
  (#310, `shape: 'round'` on a `rug` item; `src/rugs.js` `rugLift`: the cat's floor spots and things put on the floor stand on a rug) ·
  Sovrum 2 (first left) Walter & Kian, bunk (Darth Vader sheets), a gaming desk with a PC along the west wall, short end to the window (#77, #84): sitting in its chair starts the
  PC; a sit spot in the lower bunk (`watch`, a spot `kind` can differ from its piece) swings the monitor arm round and plays a film;
  a 1.3 × 0.95 m pegboard on the west wall north of the desk: the lightsaber on its top row, three Nerf blasters, a
  bandolier and goggles (#78, #86, #324); a dark grey hook rail with black hooks on wardrobe L's side wall by the door: a charcoal
  hoodie with a red print and a navy cap, two hooks empty (#330, `KID_HOOKS`); on the east wall between wardrobe L and the MALM a
  black-framed 40 × 50 neon print "EAT SLEEP GAME REPEAT" (*guess* size, centre 1.55 m up, #430, a `pictures` item) · Sovrum 4 (second left, ex Allrum) Tilly (15), IKEA HEMNES
  daybed along the west wall, its head end against the window wall short of the window board (#312, `DAYBED_Z`: more
  open floor; the holder and the posters follow it) (`HEMNES_DAYBED`, #280: beadboard back and ends, an arched apron, a quilted top mattress, the pull-out's below,
  round knobs; a charcoal bedspread with lilac bolts, black / holographic / graphic / faux-fur cushions), its three drawers
  open (basketball shoes | hair things | shoes), her basketball in a wall holder over it (`src/basket.js`), invented K-pop
  posters round it and on the north wall (`KPOP_POSTERS`, one canvas atlas, builder `kposters`; no real idols or logos), a white IKEA SMÅSTAD /
  PLATSA wardrobe 80 × 57 × 181 in the NW corner of the north wall (`SMASTAD`, builder `smastad`, #305, #311,
  docs/smastad-platsa-garderob.jpg; it replaced the MULIG rack of #281): white French doors (E, Openables), the left hinged
  on the left and opening to the left (max 85°: its knob stays off the west wall), the right to the right; her clothes on
  the rail, sweaters and a cap on the top shelf, sneakers, socks and a tote bag on the low shelf / in wire baskets (each
  door's half drawn only while that door is open); no poster is covered by it or its open doors (opentest checks); a vanity on the east wall by the window (#282, `VANITY`, builders `vanity` / `vanitystool`):
  an IKEA ALEX 100 × 48 with a drawer column (make-up, hair things, clothes), make-up on the top, a Hollywood mirror with
  14 globe bulbs (a lamp of its own, `sminkspegelns lampor`, at dusk like #234; a Reflector) and a lilac stool (a seat
  with an invisible pick box over it); on its free end a rose-gold laptop (#283, `src/laptop.js`, `LAPTOP`) playing an
  invented short-video feed ("Klipp"). Bunks: IKEA MYDAL, white, 97 × 207 × 157 (`MYDAL`, #227: posts, end boards, a two-board guard rail, a straight
  ladder on the room side at the foot end); long side to the side wall, head end to the façade; a white IKEA MALM chest of 6 drawers
  (80 × 124 × 50, `malm`, #235: 2 small + 4 big, clothes inside; in Sovrum 2 the second drawer holds only the folded
  Spider-Man suit, item `suit`, #597, src/spidersuit.js) with its back against each bunk's foot end on top (`MALM_DECO`, item `deco`) a themed lamp of its own (a Death Star in Sovrum 2, a unicorn in Sovrum 3) and
  a pot plant you can take (a cactus | a pink flower); an IKEA NYMÅNE wall/reading lamp at
  every berth on the side wall by the pillow (#219, `NYMANE_WALL`, builder `walllamp`: white in Sovrum 3, black in Sovrum 2), each
  its own lamp (E, also lying there within `REST.reach`). Name signs: `DOOR_SIGNS` → `src/signs.js` (hall side of the door).
- Hall (#49): the plan's "EL" cabinet is really the small EL/C (40 cm, `CABINET_FIXES`) plus the coat
  rack "KL" beside it, which the extractor merged; on that wall (right as you come in) a coat rack with
  jackets and a shoe rack (FURNITURE `coatrack`/`shoerack`). The key cabinet hangs centred on the narrow wall right of the entrance door, above the switch (#123, #135). The round LINDBYN mirror that hung on the left wall now hangs in the living room, centred on the wall behind the armchair on its right (the north wall west of the living-room door, #205); in its place
  hangs an IKEA NISSEDAL mirror, black 40 × 150, upright (`HALL_WALL.tall`, #226; Rusta "Staffan" before, #218). A second one hangs in the upstairs hall on the
  west wall right of the WC/dusch door, centred between the corner and the architrave (`HALL_WALL.tallUp`, z 5.654, #332).
- Dining set (user's choice, #62/#57/#63): IKEA SKANSNÄS table and 4 chairs, brown beech (`SKANSNAS`, one
  frame colour for both; light woven paper-cord seats): the table rectangular 150 × 90 (closed; 205
  extended is not modelled), short end to the kitchen window; 2 + 2 chairs on the long sides, pushed
  in under the top. Over it the family's three copper pendants (#307, docs/kopparlampor-koksbord.jpg, `LIGHTING.pendants`
  style 'copper3', `copperPendants` in lights.js): a dome canopy with two arms along the table, glossy copper drops on
  black cords (the middle one higher), frosted discs that glow with the kitchen switch, one pool anchor; merged into 4
  meshes; the copper reflects a small painted room (`roomEnv`, strength by daylight / switch). The kitchen's ceiling dome
  stays. The user finds the kitchen cramped easily — keep it airy. F (#75) shows the bare flat: `world.looseItems` (furniture, kitchen shelves, the hall
  mirror/key cabinet/coat rack, door signs, the Moccamaster, the cat board) are hidden, their collision
  segments go, the cat leaves and none turns up, hidden things are no E target and give no light.
  Kept: Peab's kitchen and wet rooms (incl. bathroom mirrors), wardrobes, doors, stair, ceiling lamps,
  switches, the wall clock, the note on the freezer. Plants by a wall get `walls: { x0, x1, z0, z1 }` on their FURNITURE item (`keepInside` in furniture.js squeezes
  leaves short of those lines, #137). New loose things must join `world.looseItems`
  and be kept out of `mergeStatic`. Keep the Sovrum 1 bed clear of the Klk sliding door — the cat test needs floor there.
- Badrum (#293, `HAVBACK`): an IKEA HAVBÄCK tall cabinet, dark grey 40 × 35 × 195, wall-hung 22 cm up in the SE corner
  (the shower's short wall, its left-hand corner), hinged on the side-wall side (max 83°: the brass knob would meet the
  wall), towels, bottles and toilet rolls inside (`havbackContents`). Not in WC/dusch: only 32 cm free beside its shower.
- Towel hooks (#424, `TOWEL_HOOKS`, FURNITURE 'towelhooks', the user's marks): two round brushed-steel hooks 1.4 m up (*guess*)
  with dusty mauve terry hand towels — WC/dusch on the shaft box's north face between the toilet and the vanity (z 7.054),
  Badrum on the wall stub's south face right of the vanity towards the Tvätt doorway (z 5.134). Loose items, no collision.
  Bath mats (#425): a bobble mat 50 × 80 (*guess*) in the same colour in each — FURNITURE `rug` with `pattern: 'bobble'`
  (furniture.js `bobbleRug`: rounded corners, a knob canvas as map + bump, one material), in front of the WC/dusch shower and
  along the Badrum shower corner's east glass; rugs, so `rugLift` puts the cat and things on them.
- Toilets: the redrawn plan has them rotated; bofakta shows the tank against the wall, so
  `toiletAgainstWall` re-orients them. Modelled as Ifö Spira 6260 (`TOILET` in config,
  `src/toilet.js`); the lid opens/closes with E (`world.lids`, kept out of `world.doors` so the
  cat logic and door tests don't see them).
- Site (the user, `docs/tomten-google-maps.jpg`): Kv. Lunden is the empty plot by Karpvägen /
  S:t Lars väg in S:t Lars park, Lund (~55.70° N, 13.17° E), next to HepCat Store, between
  Realgymnasiet, Lunds Montessorigrundskola and Kunskapsskolan; woods towards Höje å to the south.
  77 Swan-marked homes in four buildings. Peab's PDFs are on the project page (plan brochure with
  situation plan + overview plans, info brochure, bofakta; there are no façade drawings) —
  peabbostad.se is blocked from the cloud sessions (it works from the user's machine), so pages
  that are used go into `docs/peab/`.
- More info: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/

Values marked *guess* in `src/config.js` (slab thickness, upstairs window heads, soffit depth,
cabinet heights) should be checked against Peab's material and corrected there — not by
hard-coding numbers elsewhere.


#523 basement audit: [p46 overlays and scope](../validation/issue-523/README.md). Distinguish the sourced 15 **extra rentals** from ordinary LGHFÖRRÅD under C/B/A. Boundaries/openings are graphical measurements (~0.15 m), not construction dimensions; 22 ordinary cages, finishes, swing directions, racks, parked cars and sensor lighting remain explicit assumptions in GARAGE.

Bridge registration #532: same FOJAB/compass bearing (58°), OSM HepCat-centre anchor to its existing plan placement, approximate 3–5 m horizontal accuracy. The road and separate GC source ways are distinct; manufacturer confirms GC's 40 m, while all heights, other lengths/widths and support/rail details remain visual assumptions. [Evidence and source/assumption boundary](../validation/issue-532/README.md).

L1004 (#574, `VISIT_UNITS` / `STANDARD`): bofakta "240822-bofakta-l1002-…-l1007" (checked 2026-10-09) is one sheet for
L1002–L1007: 126 m², 5 rok, våning 1–2 (63 + 63 m²), uteplats 22 m², the same plan as ours, not mirrored. L1004 is the last
flat west of the stair core (`husLLayout` slot, x −24.825…−19.07). Standard finish per the info brochure (S1 p. 20, p. 30):
smooth white Marbodal fronts, white Electrolux appliances, white walls and ceilings, limestone window boards (grey/brown),
matt-lacquered 3-stav oak parquet with white skirting, windows white inside; hall klinker is a tillval (bofakta "KL"), so
parquet there. Colours and everything unnamed (worktop, handles, tiles, sanitary ware, mixers, wall cabinets, hood) are
*guess* in `STANDARD`. Its name plate reads "Lasse & Erika", L1201's "Linus m. Fam" (the user's wish, #623, not Peab material).

L1201 (#573, `L1201` in config, `src/l1201plan.js`): bofakta-l1201.pdf (2024-11-08; Peab's object page's PNG points at L1205's,
so the sheet is the source): 99 m², 4 rok, våning 3–4 (54 + 45 m²), entrance from the loftgång, takterrass 12 m²; the base plan
with Allrum (the third bedroom is the alternative plan). Read off the sheet: outside 6.01 × 11.10 m (entrance floor), the upper
floor 9.20 m deep; the west gable 0.46 m; all façade openings agree with HUS_L.street / court (±2 cm). RH 2.5 is the sheet's
legend default, the Klk upstairs RH 2.2; floor-to-floor 3.0 and window heads 2.3 are assumptions. Its stair is our stair type
mapped onto the sheet's outline (*guess*); the bathtub is dashed on the sheet (a tillval): the standard shower is built.

