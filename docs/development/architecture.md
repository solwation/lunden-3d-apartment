# Architecture and geometry

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [plan-material](plan-material.md), [environment](environment.md), [verification](verification.md).
## Check corresponding houses

The user requires house-layout fixes to check equivalent elements in A/B/C/L automatically.
Shared CoreHouse code does not imply identical data or culling partitions. Inspect each relevant
variant and record affected/unaffected/not-applicable results; use representative browser checks.
Preserve per-house dimensions, intended openings/glass, collision and rendering budgets.
The B/C distant-entry regression #976 is covered by the shared shell section below.
Reports #975 (A basement→garage obstruction) and #977 (basement door details/handles)
remain separate investigations; this entrance fix does not claim to resolve them.

## Apartment door fittings (#1044)

`doorfittings.js` supplies cached, merged brushed-steel rounded L levers and round roses
for `SwingDoor`, with thumbturns for bathroom/WC doors and oval cylinders for entrance
leaves. Fitting dimensions in `DOOR_FITTINGS` are visual assumptions (*guess*), not verified
Peab measurements. Existing roses were already round; the former grips/necks were boxes.
`fitPrivacyDoors` samples both sides of the closed opening using the completed production
RoomMap, before the moving leaves are merged, for both L1007 and visited-flat builders.
The security strike is a separate stationary group at the closed leaf's latch jamb; its
mesh retains `userData.door`, keeping interaction and the exterior DetailCuller bypass.
Opening dimensions, animation, collision segments and existing E/touch dispatch are unchanged.
Static neighbour façade hardware (`entryHandleParts`, ground/loft/patio) and A/B/C core doors
use separate builders and retain their previous appearance; this is apartment fitting work,
not a layout correction or new lock mechanic.

`tools/doorfittingstest.cjs GAME OUT [--baseline]` uses actual `SwingDoor`, plan leaves,
`RoomMap`, privacy binding and production `mergeStatic`, with illustrative jambs and lighting.
It checks open/close, fixed hinges, unchanged closed openings, moving/restored collision
segments, both raycast faces, bathroom/WC thumbturn selection and shared fitting geometry.
The bounded room-map fixture reconstructs plan-wall and doorway barriers; it does not build
production `buildLevel`/World or exercise E/touch dispatch, visited flats or a physical phone.
Final browser result: 8/8 PASS, CLI0, no browser exceptions. Baseline: 5/5 PASS.

Measured **after production leaf merge** (meshes / triangles): bedroom 2/220 → 2/468;
bathroom and WC each 2/220 → 2/588; entrance 4/316 → 4/684 plus stationary strike 1/48.
Thus leaf draw counts stay unchanged; each entrance strike adds one draw call. Shared fitting
geometry has 456 triangles for ordinary doors, 576 with locks. No FPS claim.
Before/after bedroom, bathroom, WC and entrance PNGs, open entrance strike view, source
SHA256 hashes and raw results are retained outside git under
`/tmp/lunden-doors1044-20261015/{before-merged,published-green}`. Pictures were opened and inspected;
they establish component appearance rather than full-apartment lighting or gameplay.
Two post-rebase attempts in `published-inputs` stopped before assertions with connection
refused after the original dev server exited143; their failure file is retained. The final
`published-green` run owns its bounded server and completed successfully.

## Module and test map

```text
src/entrancedoor.js    shared green entry leaves and small high panes, actual recess/opening geometry (#497)
src/portik.js          calibrated union of portik spaces, room boundaries and collision (#520)
src/config.js          everything NOT in the PDF: heights, soffits, stair layout, colours
src/world.js           builds meshes + per-level collision segments from data/plan.json
src/stairs.js          stair treads + walking height function (stairHeight) and the treads' underside (stairUnderside: head room,
                       collision, the Klk under it); the rise is LEVELS[1].floor − LEVELS[0].floor in equal risers (#352)
                       handrails (#419, `handrailRuns` / `buildHandrails`, STAIR.handrail): white Ø 4 cm rails on brackets, 0.9 m
                       over the nosings (eased through the winders), returns into the wall; merged with the M.rail parts; an optional mapped
                       geometry `g` builds them on another flat's stair of our type (L1201, #619)
src/doors.js           SwingDoor / SlidingDoor (E to open/close, animated, dynamic collision); wardrobeDoors
                       shares rebated G/L carcasses with world.js (WARDROBE assumptions; wardrobetest, #537)
src/exterior.js        Hus L (HUS_L): brick row with the core/portik, neighbours' patios, rendered upper
                       units with pilasters, loftgång, spiral-stair drums (a doorway `gap` onto the loftgång / landing; inside a visual-only
                       spiral stair, `HUS_L.spiral`, #444: column, open treads, wall handrail, top landing + guard, all *guess*),
                       roof with solar panels; the portik paved through (its own material: no snow) with opal ceiling lamps
                       lit with the front-door lights (`HUS_L.portikLamp`, #451); `husLLayout` gives each
                       strip its flat ids (`lower` L1001…, `upper` L1201…); the upper flats' street openings are their own
                       (`HUS_L.street` per type from bofakta, `floor` = the flat's own floor, not the building storey, #347)
                       `husLTerraces`: the roof terraces per flat (id, polygon, area vs the brochure's 10/11/12 m², #350)
                       `HUS_L.doorLamp` (#433): a wall light on the latch side of every street-side front door of våning 1
                       (L1001–L1008), lit after dusk: the glass glows, an additive wash on the brick + a pool on the ground
                       (groundglow.js, two meshes for the row)
                       `HUS_L.patioLamp` (#1078, all *guesses*): the same kind of light with an integrated socket under it by
                       every courtyard patio door (L1001–L1008, ours too) and roof-terrace door (L1201–L1209), east of the
                       door; `patioLamps` adds only geometry to the door lights' meshes (no mesh/material/light), so it
                       switches with them and goes out in a power cut. The brochure's building description covers all of
                       Kv. Lunden, so the same fixture sits by every Å-hus (A/B/C) loggia door (surroundings.js
                       `loggiaLamp`, 52 lamps: three meshes `loggiaLampGlass/Wash/Pools`, wash/pool kept inside the loggia)
                       `HUS_L.gableWindows`: every gable opening tagged gable / building storey / flat from the end flats'
                       bofakta (L1001 west, L1008 + L1209 east; none for L1201 or on våning 4; no flat is mirrored, #351)
src/roofs.js           the walkable roofs (#360, `world.roofs`): surfaces (rect or disk, flat `y` or a slope function, an `id` per roof)
                       and walls with a height range, listed by the builders (`userData.walk`: exterior.js — the loftgång + the east
                       drum's landing, each terrace, Hus L's roof + solar panels (step over), the loft over the lift, the drums' top
                       landings; the façades, railings, set-back wall, skärmväggar; surroundings.js — the Å-husen's hip roofs (on
                       the slope), roof boxes, vent hoods, entrance canopies) + OUTDOOR's edge. `under` / `standingOn` / `topAt` /
                       `walls(y0, y1)`. Walking off an edge falls (fall.js). Up there: lights.update / sonos / reflections get level
                       −1 (no pool light for the flat's lamps: the lampwash shows them), `behindWall` hides the flat under the roof,
                       the rain stops on the surface (`weather.surfaceAt`), the HUD says "Utomhus · <roof>", stats `roofs` (first
                       per roof, SCORE.first.roofs). Not walkable: the old S:t Lars houses, the school, HepCat, pergolas, parapet tops
src/garage.js          the garage under the courtyard + Hus L's basement (#357, #417, GARAGE in config): the våning −1 plan's layout
                       (DRAWING, measured on docs/peab/kalibrerad/vaning-m1-300dpi.png with the #253 transform; heights, stalls,
                       cages, lights = ASSUMPTION): `GARAGE.rects` = walkable rooms (room name + sensor area; doorways are thin
                       rects, some with a steel door), walls stand on every rect edge touching no other rect (`wallLines`: the 5 cm samples only find the cell, each wall end is bisected to the exact neighbouring rect edge, #646 — a cell grid left up to 2 cm cracks at jambs and corners through which the terrain showed as green lines; a thin doorway rect gets a soffit at its head and a steel leaf fills it up to `doorHead`, full width). The
                       entrance hall behind `terrain.garageDoor`, the turn into the big hall under the courtyard (the plan's
                       column grid, painted stalls / numbers on canvas floors, parked `lite` cars instanced, the car pool's two,
                       bike racks), our stall straight under our patio (charger, "L1007"), Hus L's basement through a steel door
                       (bike rooms, Elrum, the core's Hisshall — #415 — and 15 extra rental cages: cage doors one
                       InstancedMesh + invisible pick boxes, kind 'cabinet'), ordinary LGHFÖRRÅD and basement lobbies under C/B/A
                       (#523, 22 illustrative cages, not a surveyed count), the Miljörum under Hus C (bins). Unsupported
                       fake doors replaced by real doorways; A/B north brick skin clipped at their garage openings. Per sensor area MeshBasic materials with the tubes' light baked into vertex colours
                       (colour = on/off, motion sensor + flicker); nothing drawn unless the camera is down here (or just the
                       entrance from west of the door, `near`, else `blackout`); one pool-light spot per area (lights.extra),
                       `under` cuts the daylight (DayCycle.under). player.js `below` (in its rects at the floor's height):
                       its `segments` / `dynamic()` / `obstacles()` instead of the level's (+ our car in its stall, `extra`); #358:
                       `GarageDoor` (GARAGE.door): sectional panels (one InstancedMesh) up the tracks and in under the ceiling, a
                       button on a post outside + one inside (kind 'garagebutton'), an amber light blinking + sfx.garageMotor
                       while it moves, a wall while shut (also world.movingSegments), shuts by itself after `auto` s, never on
                       the visitor / the car (opens again); the box edge over the door is
                       `world.upperSegments` (only up on the courtyard); rooms Garage / Förråd / Hisshall (HUD, stats); no rain
src/escape.js          the basement's ways out (#452, GARAGE.escape): `escapeField` = the distance to the nearest exit (the garage door,
                       the stairwell's landing) over the garage rects minus partials / columns / cages, `path` down it; `drawExit`
                       = our own green "Nödutgång" pictogram (running figure, door, arrow ahead / left / right / U-turn), and
                       `planTexture` draws the utrymningsplaner from the same rects, turned the way each reader faces ("Du är här",
                       arrows, exits, extinguishers, legend). garage.js `escape()` hangs the signs square across the way (each face
                       its reader's arrow), flat ones over the doorways, the framed plans + extinguishers; always-lit sign material
src/core.js            Hus L's stair core by the portik (#415, CORE in config): a walkable stairwell in the band beside the portik
                       (#456, DRAWING: read off the vector overview plans of every storey, see CORE's comment — one straight
                       flight per storey (16 / 17 / 16 treads of 0.25), all stacked along the band's west wall, each rising
                       north from the landing at the courtyard end (the lift, the ways in) to the street-end floor; a passage
                       along the flights' east side back to the next landing; none on våning 4; heights = ASSUMPTION) from the
                       garage lobby (våning −1, a cross wall north) to våning 3; windows out to the street on våning 1 and 2
                       (#457); the portik's glazed screen (door + sidelight, a passage to the landing), våning 3's door out
                       onto the loftgång (+ sidelight); walls with height ranges
                       (`segments(feet)`), `heights(x, z)` = every floor / flight there (player.js `inCore`, `groundAt`). `Lift`:
                       four stops (Y −3, 0, 3.25, 6.4), call buttons + a car panel (kinds 'liftcall' / 'liftbtn'), sliding
                       two-panel doors that never close on someone in the doorway (#314), the visitor rides (`snap`); the passenger
                       experience is `src/liftpanel.js` (#640, below); keep.js part `lift`; stats `liftFloors` (SCORE.first per storey). exterior.js
                       leaves the band / passage out of the core's solid, world.js its ground plate; HUD "Hus L · Trapphus ·
                       våning N" / "Hiss"
                       The flats' doors on the east wall (L1101 våning 2, L1205 våning 3; `CORE.flatDoors` / `flatDoorParts`, #626, sizes *guess*):
                       fixed, no opening; `buildFlatDoors` bakes leaf, architrave, lever handle, lock cylinder, letter box and peephole into the
                       stairwell's vertex-coloured mesh, plus ONE extra textured mesh for the plate and number sign (number only, names are the user's)
src/corehouse.js       Hus A's, B's and C's stair cores (#637, #638, #639, #652; CORE_A / CORE_B / CORE_C in config, DRAWING from kalibrerad/vaning-m1 … 4 read by scanning the
                       sheets along lines; heights / winders / doors / car sizes = *guess*, listed in the comment above CORE_B): the same interface
                       as core.js (`Core.attach` in main.js: `world.core.parts` = A, B, C in that order, which is also the order of
                       keep.js' `a` list of lifts; `houseAt` → "Hus B · Trapphus · våning N" / "Hiss"), but the walls are DATA: `walls` =
                       thick wall runs ({ ax, t, a, s: [first, last stop], holes: [{ a, h, s?, leaf? | glass? }] }; a hole is an opening, a closed
                       flat door (`leaf`) or a fixed pane), `floors` = the våning-1 lobby's rects (floor + ceiling slab), `lights` = its lamps,
                       `numbers` = the floor plates, `cap` = the shaft's top. Hus B (−1, 1, 2, 3): hall band x −33.08 … −31.16, z 41.74 …
                       50.0, the lift north of it (door south), the lobby from the entrance (z 35.4: one door + a fixed glazed sidelight, Hus A's mirrored, #727) 2.28 m wide north of the shaft, then the strip west of it; Hus C (−1, 1 … 5):
                       a long hall band x −62.34 … −60.44, z 20.12 … 30.54 with the stair at its south end and the lift WEST of it (door east:
                       `lift.side: 'e'`, built in a frame turned 90° — core.js' `Lift` has `rot`, `loc`, `wseg`, `wpt`), the lobby from the east
                       entrance (x −53.4) west to the hall's east wall. The stair (16 risers per storey in one run: 4 straight treads of `stair.tread` per flight + 7 winders round the stringer's end, `stairS` /
                       `stairY` as #644), the lights, the floor plates and the lift are the same in all three.
                       Hus A (#637, #643, #644, #649, #652; −1, 1 … 4 = y −3 … 9): hall band x −1.05 … 0.80, z 37.3 … 45.5, the lift north of it (car x −0.40 …
                       0.80, door south through the 0.3 thick front wall z 37.0 … 37.3: `lift.side: 's'`), two flights from the hall's edge z 42.84 (tread 0.25) with
                       winders over the south end; våning 1's lobby from the courtyard entrance (the recess's back wall z = `SITE.blocks` 'Hus A' z0 + the recess depth, the
                       glazed door hinged east, the fixed sidelight west of it: a `glass` hole; `world.core.parts[0].doors[0]`) runs south east of the shaft and joins the hall
                       (`floors`: three rects). Its walls are mostly `thin: true` runs (planes of no thickness, one collision line, as the old CoreA drew them). The flats' doors
                       (15: våning 1 three, 2–4 four, `leaf` holes in the side walls, z 37.35 … 38.2 / 40.28 … 41.1, the east north one hinged south, #649) and the cross
                       wall's single door at z 41.45 (våning 1–4; a `plain` leaf hole: no number, sign or cell, no doorway collision, `into`: swings south) are real `makeDoor`
                       doors. The −1 openings west to the passage and east onto the lobby / förråd corridor are holes in the thin side walls (garage.js: `core` rects, thin
                       rects `coreAWest` / `coreAEast`). Differences from the old corea.js: the hall's ceiling on the top storey is now drawn over the whole hall (before only
                       over the stair part: from there the sky showed), the number plates, signs and panes have outlines in B / C too, the entrance wall is a 0.12 m box
                       and has no dark lintel above the door.
                       Every stop's wall piece is one box (`sbox`, faces cut up about every 1.2 m so the baked lights vary) + a plain box for the
                       edge lines; the openings' floors are `zones` (what `contains` / `heights` answer for them). A `core` garage rect marks the
                       band on −1 (config GARAGE: `coreB` + thin rects `coreBWest` / `coreBSouth` over the hall wall's openings; `passageCN` /
                       `coreC` / `passageCS` split Hus C's corridor, `passageCE` begins at the band's east wall); the other passage rects keep to
                       what the plans show. surroundings.js: `walkIn` is generalised (`walkIn(b, r)`, face 'n' or 'e', the spec's `entrance`:
                       `door`, `height`, `cut`; `cutRects` takes the face; the vestibule's floor and collision per face). The hall's south end on
                       −1 is open (#654): `CORE_C.lane` makes the −1 flight a single straight flight in the hall's east half (solid treads, rails, a guarded hole in våning 1's floor that `heights` / `stairS` know: `laneS`, `inHole`) so the west half is a free lane from the steel door `entryC` through the south wall's 2.4 m opening (thin garage rect `coreCSouth`) to the hall and the corridor north; the upper storeys keep the winder stair. Seen from above through the stairwell the opening shows the clear colour (the garage group is not drawn from y ≥ 0). NOT modelled: the interior
                       fire doors, the flats behind the doors (#653: the flats' doors open like Hus A's: a `leaf` hole's `hinge` ('n' | 's') and `flats` (the number per stop) in CORE_B / CORE_C make a `makeDoor` leaf per storey, merged to one mesh (`leafify`), `buildFlatDoors` for the architrave / number signs, a 1.3 m dark entrance cell behind each that the doorway collision keeps you out of; `HOUSE_FLAT_DOORS`: 25 leaves in Hus C, 12 in Hus B; #656: a `leaf` hole may sit in a wall along x too, Hus C's fifth flat in the hall's north end, `hinge` 'w' | 'e', `into` = swings away from the hall, `buildFlatDoors`' 8th tuple entry `alongX`); Hus A's former class CoreA (src/corea.js) is gone (#652): CORE_A is data like the others. Cost (SwiftShader, loaded VM): about 0.3–0.6 s
                       to build one, 52–67 meshes / 7.5–12 k triangles, drawn only while the camera is within 6 m of the core or
                       up to 14 m out in front of the entrance door (`near`; the wider 12 m first used put perfcount's 'park' spot at 517 of 520 calls).
                       #887: Hus A's actual glazed entrance, fixed sidelight and single-storey lobby (`walls` with s [1,1], lobby floors at stop 1)
                       live in `CoreHouse.exterior`, attached beside its detail object by `Core.attach`. The same opaque walls/floor/ceiling and moving door
                       remain frustum-tested from L1007's patio; the lift, stairs and upper floors keep the original `near` gate. Nothing closes the intentional
                       glass or passages, and no collision/source dimensions change. The original triangles are partitioned, not duplicated.
                       Hus C stands at y 0: its stair well has a hole in the terrain mesh (surroundings.js `TERRAIN_PITS` = `CORE_C.pit`; the grass
                       would cover the flights below våning 1) and aHouse drops the body's underside cap of a walk-in house; the floors' tops lie 6 mm over
                       their levels (the grass at y 0 inside the footprint fought with våning 1's floor).
src/rooms.js           room detection: walls + door gaps rasterised, BFS from the room labels
src/visitunit.js       other flats you can walk into (#574, VISIT_UNITS): `VisitUnit` = a visited flat's collision (world
                       coordinates), doors / windows / lids as E targets (`visit` flag: no score, no cat, not kept), rooms,
                       stair and slabs; `world.units` / `world.unitAt(x, z)`; player.js `unit` / `unitLevel`
src/standardinterior.js Peab's standard fixed interior (STANDARD): white kitchen + appliances, laundry, wet rooms; the kitchen's
                       cupboard doors and drawers open, empty (#621, interior.js `openFront` / `shell`), drawn batched
                       (`batchFronts`: one mesh + one set of edges, moved per front in the vertex shader); the rest static
src/l1201plan.js       L1201's own floor plan (#573), plan.json's format, read off its bofakta sheet's vector paths (comments: sources)
tools/visittest.html   #574: L1004 at its slot, in through its front door, round Entréplan, onto its patio, up its stair,
                       walls / doors hold, HUD, empty of our things, nothing saved, resume inside it, shadows follow;
                       its kitchen fronts open with E, batched, focusable (#621)
data/plan.json         GENERATED — do not edit by hand
tools/extract_plan.py  PDF → data/plan.json (stdlib only)
tools/roomtest.html    headless test of room detection at known points (+ a picture of the fill)
tools/stairtest.html   headless test (#352): equal risers from floor to floor, no jump along the walking line, the top tread at the
                       slab edge, head room, collisions by the treads' top / underside, the soffits, the Klk's things under the treads; the handrails
                       (#419): h over the nosings / the pitch, level extensions, returns, inside the walls' clearance, clear of
                       the walking line, switches, pictures and door swings
tools/garagetest.html  headless test (#357, #417): in from the drive (below, drawn, "Garage"), the tubes on, daylight cut, no rain inside,
                       walls / the turn / the big hall to its east wall / a column / a parked car hold, out of a car (#314), our
                       stall under the patio, the basement's steel door to the bike room and the Hisshall, the Miljörum, 15
                       förråd, per-area sensors, a
                       förråd shut holds / E opens / walk in, the courtyard above stays at y 0 and its edge over the door holds;
                       #358: the door shut holds, the post's button opens it, it stays open while you stand in it, shuts by
                       itself, opens again if you step in, the inside button; our Renault in its stall (a box, its doors / seat)
                       #452: every exit sign's arrow leads closer to an exit, the ways in the entrance hall / basement / förråd,
                       the two plans with "Du är här" on the floor in front, the signs always lit
tools/trapphusrailtest.html headless test (#625): våning 3's landing has a guard across the stair hole's south edge (the east
                       guard alone left it open since no flight goes on), walking north from the landing stops at it
tools/trapphusatest.html headless test (#637): Hus A: the entrance door holds / E opens, the lobby, the hall, the stair on foot 1 → 4 and down to −1
                       without a fall, the guard on 4, the closed-off space under the stair on −1, the lift to every stop (riding along,
                       doors held open), the basement hall east into the lobby and the garage through the steel door and west through the
                       passage, out through the entrance again, walls hold, a reload mid-ride, power cut, both lifts saved, rides counted; #643: the 15 flat doors + the cross wall's
                       open / shut (E), one mesh per leaf, the doorway stops you, an open door along the lift wall stops you short
tools/trapphusbctest.html headless test (#638, #639): `?house=B` / `?house=C`, the same route as trapphusatest through that house's lobby, hall, stair
                       (every storey up and down, the guard, the closed-off space under it; Hus C's −1 lane and flight, #654: the route from the steel door `entryC` through the hall to the north corridor), flat door and walls, the lift (every stop, riding along, doors
                       held open), the basement's openings into the garage passages and through the steel door, out through the entrance, a reload
                       mid-ride, power cut, saved lifts (a: A, B, C) and the rides counted (`b…` / `c…`)
tools/lifttest.html    headless test (#415): the portik's door holds shut / E opens, the stairwell on våning 1, the lift called, a ride
                       to −1 riding along (no way out while it moves), out into the basement, doors held open by someone in
                       the doorway, up to 3 and out onto the loftgång, the stairs 1 → 2 → 3 and 1 → −1 on foot without a fall,
                       a reload mid-ride, the rides counted
tools/rooftest.html    headless test (#360): placed on the loftgång (level, the railing, no way into the upper units, no pool light for
                       the flat's lamps, the culler hides its inside, the railing at the east end, both sides of the east drum's landing and by the west drum's doorway holds (#449), into both drums), our terrace (railing,
                       set-back wall, skärmvägg), Hus L's roof (a panel row, the loft in the way, off the edge onto the loftgång), Hus A's
                       slope and eaves, a canopy; the rain ends on each roof; the first visits counted
tools/terracetest.html Hus L's roof terraces (#350): one per upper flat, areas vs 10/11/12 m², the joins at the loft and
                       the gables, the railing's top over the finished deck
tools/gabletest.html  Hus L's gables (#351): each opening tagged with side / storey / end flat, inside its storey (not in a
                       slab), its wall's extent and clear of the spiral-stair drums; no overlaps; the special cases kept
```

## Geometry pipeline

The PDF is vector (ReportLab). `tools/extract_plan.py` decodes the page content streams and
classifies paths by colour/line width: wall polygons (dark fill), windows (white rects with
dark outline, full wall depth), glazed door frames (same but thin), door swings (grey arcs +
dark leaf line; dashed = Peab *tillval*), sliding doors (dashed grey line + arrow), fixed
cabinets (light fill, labelled by the text inside), sanitary fixtures, site (patio, hedge,
fences) and room labels. Scale comes from the 1 m segment of the scale bar on each page
(Entréplan is 1:55, Övre plan 1:50 — they differ).

Regenerate after changing the extractor: `python3 tools/extract_plan.py`

Plan coordinates (metres): **x = east**, **z = south** (z = 0 is the outer face of the
entrance/north façade, the patio is at z > 12.7). Three.js uses the same x/z with y up.
North = −z (the bedrooms Sovrum 1/3 face north).

## Recent implementation notes

Small high entrance panes (#497): ENTRY_DOOR centralizes assumed muted dark green (0x314d3c, not a verified RAL/NCS), finish and 36 x 12 cm glass, with 15 mm surround/12 cm top clearance/8 mm glazing. src/entrancedoor.js supplies identical divided leaf geometry/materials for the interactive north entrance and all corresponding ground/loftgang static entries. Over 97% of the leaf stays solid; opening is real, not glazing over opaque leaf. Neighbor simplified building masses leave full recessed entrance cavities clear, so the green leaf is visible from the loftgang and its pane is not backed by opaque mass. Inner doors, patio glazing, stair-core doors and the white terrace rail finish remain unchanged. EntryPane metadata retains the small closed-door sight opening in DetailCuller as well as existing transom; opening animation, letter flap, handles and moving collision retain their existing behavior. tools/entrancedoortest.html verifies pane size/location/solid proportion, both faces, animation/collision, static ground/loft doors and their mass apertures, culling and inner-door color. tools/detailtest.html passes.

Portik rooms (#520): PORTIK config reads interior faces from Peab printed p.47 (PDF spread 24, right half; scale-calibrated overview). src/portik.js supplies one union of spaces/cells/boundary segments to exterior.js hollow masses/paving and world.js collision. The straight 1.7 m-mouth tunnel is replaced with an open 4.75 m-wide bay and a 1.93 × 3.75 m room behind a 1.05 m door in its thick west wall. Existing street/court mouths, stairwell and upper storeys remain. Core's screen moves to the drawn west interior face; its connector stays hollow. The room door is appended to world.doors, retained during merge and uses ordinary animation/collision/save. LIFE_WASTE.dropoff moves to the open bay (x -12.95/z 1.2, 1 m spacing), leaving the through route clear (superseded by #538: the row is now along the east wall, yaw −90°, centre derived from PORTIK). JETPACK.hook moves to the small room's east wall (x -11.39/z 9.1, floor 0, faces west); home/reset/reload derive it from config and thrust stays off below the portik ceiling. Actual room functions are unlabelled: bin/jetpack use and all heights/finishes are assumptions. docs/validation/issue-520/README.md documents calibrated overlay, dimensions, both-direction views and checks. portiktest covers walkable/hollow spaces, walls, actual door/jetpack/bin actions, saving/real reload/reset; lifttest, jetpacktest and walktest guard existing routes and flights.


Entrance handles (#519): static ground-floor and loft green entrances share `entryHandleParts` in src/entrancedoor.js, with rose, neck and lever outside both leaf faces. The loft-only handle embedded in the leaf was removed. Hardware is merged into one mesh; entrance animation/collision stays unchanged. tools/entrancedoortest.html checks exposed hardware from both faces of every static entrance and the interactive entrance closed, half open and fully open. Follow-up on 2026-10-09: the interactive handle geometry was correct, but DetailCuller hid its merged centre as an interior object behind the closed facade. Tagged `door.exterior` meshes now bypass facade occlusion while retaining distance culling; ordinary depth testing still hides the back face behind the door/walls. The entrance test now uses normal camera layers and compares actual scene pixels with/without hardware at three open states, both faces and three unobstructed view angles. Rays with `enableAll` alone cannot catch layer-7 disappearance.

Front-door name plate (#595): `namePlate` in src/signs.js puts one canvas-textured thin box ("Budil Wingren") on the stairwell face of L1007's front door, centred over the letter box, as a child of the leaf so it swings with it. Its edge/back faces sample the plate's border colour (one mesh, one draw call, a 512 px canvas). Size, height, font and colours are visual assumptions in `NAME_PLATE` (src/config.js). It carries `userData.door` like the other exterior door hardware, so DetailCuller treats it as facade hardware (#519) and E on it uses the door. tools/entrancedoortest.html checks its text, parent and placement.

Basement floor support (#539): Player.groundAt includes GARAGE.floor anywhere inside the garage rectangles, including underneath the apartment footprint. Previously the `!inside` condition discarded this floor on crossing x=0 into the apartment projection (e.g. z=4 in the storage corridor), causing unbounded falling. Garage rectangle membership includes its boundary so shared doorway edges carry feet as well. Floor meshes and room layout remain the source of the floor extents. tools/basementfloortest.html samples all basement floor rectangles, exact storage-door joins, and keyboard/touch travel to both ends and back; garage, walk and lift tests cover the adjoining routes.

Neighbor opening details (#516): exterior.js adds jambs, sashes, seals and shared door hardware inside the existing facade holes on all four street/courtyard storeys. Opening positions, widths, heights and variations are unchanged; the simplified neighbor glazing is opaque and reflective. L1007 retains its transparent moving windows/entrance and collision. `NEIGHBOR_OPENINGS` separates existing model dimensions from visual assumptions; `neighboropeningstest` and `entrancedoortest` verify both sets.

Window reveals (#1076): every Hus L street/courtyard window (våning 1–4, neighbours, L1101/core and the loft) sits back in a reveal of its façade's own skin (brick or render) with a sheet-metal sill flashing in the capping batch. The frame plane is L1007's existing `HUS_L_REVEAL.frame` (world.js), so the blinds, window boards and casements inside are unchanged; neighbours' windows move back to it and their simplified masses (`mass()` in exterior.js) leave reveal pockets open. L1007's and the visited flats' (L1004, L1201) reveals reach into world.js's frames (`inset` 2 mm inside the wall faces against flicker). Doors (entries, patio and terrace doors) and gable windows stay as before. Depths and flashing sizes are *guess* (Peab's illustration is not dimensioned); no extra draw calls (≈ +6k triangles). Hus A/B/C were checked and are not affected: their reveals are the #146 painted atlas plus #569's layered trim in `surroundings.js`, built separately from Hus L.

Downpipes (#1077): Hus L gets dark round downpipes after Peab's courtyard illustration (`HUS_L_DOWNPIPES`, every position and size *guess*): on the street four under the loftgång's fascia (L1002|L1003, both sides of the core, L1006|L1007; west of each seam, clear of the entrance pots), on the courtyard three under the terraces' coping or the loft roof (L1002|L1003, beside L1205's loft east wall next to the portik, L1006|L1007). Each has clips, a rainwater head and a shoe bending out at the ground (`groundY`); exterior.js `downpipes` skips (with a console warning) any pipe that would come within `clear` of an opening, wall light or entrance pot on its façade. The geometry joins the wall lights' dark housing mesh: no extra draw call (≈ +1k triangles); collision is a thin box round each foot. Hus A/B/C were checked: they already have their grey pipes (surroundings.js, #109/#146) and are not changed.

Basement layout #523: [source comparison, explicit scope and browser evidence](../validation/issue-523/README.md). The 15 Hus L cages are extra rentals; ordinary C/B/A rooms follow p46. C/B/A stairs and lift shafts remain closed basement stubs, not functioning vertical circulation. `GARAGE.storage.ordinary` is illustrative, no verified cage count. Existing four pool lights and sensor areas are reused. `tools/basementlayouttest.html` checks actual collision routes and visible leaf widths; `tools/basementvisittest.html` checks actual focus, opaque openings, sensors, page reload and full reset.

Background footprint geometry (#534): `sitebackdrop.js` extrudes registered polygons to illustrative eaves, with coloured plinths covering existing terrain, two clipped roof planes aligned to the dominant edge and merged outward window/frame decals. These are closed background volumes beyond OUTDOOR, not new apartment/core/roof collision. Floor tags and guessed counts are separate fields in SITE.west; dimensions are not surveyed. [Source/assumption boundary](../validation/issue-534/README.md).

Eastern campus (#535): `SITE.east` and `sitebackdrop.js` replace nine illustrative blocks with sixteen mapped footprints, including Montessori wings and Realgym’s actual courtyard hole. HepCat’s detailed geometry stays. Shared brick texture, five exterior batches, sourced access/paths and approximate aerial avenues/groves using existing seasonal tree instances; unchanged OUTDOOR. All heights/floor counts/roof details remain assumptions. `eastbackdroptest` checks source geometry, actual outward windows, open courtyard and tree/access clearance. [Inventory, sources and browser comparison](../validation/issue-535/README.md).

Northern surroundings (#530): `SITE.north`/`sitebackdrop.js` add three missing exact footprints; seven western bodies from #534 and eastern campus bodies remain unique. Far Sankt Lars väg follows its mapped northwestern turn; sourced Källby/Alvägen paths, aerial pixel parking traces and seasonal avenue/grove trees complete the ground. Five exterior batches, shared textures, unchanged OUTDOOR. All untagged heights/roof/parking/tree details are assumptions; no old proposed buildings. `northbackdroptest` checks source polygons, actual outward window rays and no duplicates. [Registration controls, sources and before/after](../validation/issue-530/README.md).

Visitable flats (#574): `VISIT_UNITS` lists flats you can walk into besides ours. L1004 uses the shared L1002–L1007 sheet
(`plan: 'shared'` = data/plan.json; bofakta is one sheet for all six, not mirrored), so world.js `buildVisitFlat` runs the
same `buildLevel` / `buildStructure` (slab, roof zone, stair, railing) into a group at the flat's `husLLayout` slot (`ox`
−24.825) with `how.standard`: the standard materials (STANDARD: 3-stav oak, limestone window boards) and
`standardinterior.js` instead of interior.js; none of our tillval (no Allrum door or its wall/lintel, Allrum stays Allrum, no
hall klinker), no hall-wardrobe contents, cleaning fittings, EL cabinet contents, blinds, curtains, plants, lamps or
furniture; its front door gets our name-plate code with its own text (`plate`, "Lasse & Erika"; L1201's "Linus m. Fam" — the user's wish, #623). exterior.js
(`visits`) leaves its façade holes open and draws no mass or entrance pot there (its patio, hedge and screen walls stay);
the core's west mass starts at its outer face. Its Entréplan walls join level 0's segments (from the street too), the row's
façade lines are cut there; its Övre plan has segments of its own (player.js), its Entréplan doors come through
`world.movingSegments(0)`. The sun's shadow box moves onto it within `STANDARD.near` m (main.js). Nothing is saved for it:
doors and windows start shut on every visit, nothing can be put down in it (`floorSpot`). Its geometry beyond the shared sheet
is as preliminary as L1007's (SLAB, soffits, stair: *guess* where marked).

L1201 (#573): the west end flat of våning 3–4, entered from the loftgång, the second `VISIT_UNITS` entry (`plan: 'L1201'`).
Its sheet is its own (`src/l1201plan.js`: walls, openings, door swings, cabinets and fixtures read off bofakta-l1201.pdf's
vector paths at 1:100, ±1–2 cm drawing measures; the base plan with Allrum; the dashed bathtub is a tillval, the shower is
the standard). `L1201` in config holds what the sheet gives besides: RH 2.5 (the legend), the Klk's RH 2.2 soffit, sills,
the opening (stair + the "Öppet upp" void), the galley kitchen, the wet rooms; floors = våning 3 / 4 (VERTICAL, assumption).
world.js `buildVisitFlat` builds it with `buildLevel` (now taking `how.levels / hole / windows / soffits / extDoorHead /
kitchen`) in a group at its slot's `ox` and `oz` = HUS_L.loftgangDepth, and `buildOwnStructure`: the slab, the roof zone,
our stair mapped onto its outline (`stairMap`: same type, mirrored in x and scaled, risers 3.0 / 16; geometry baked, the
winding turned back; *guess*: no stair drawing) and the H 1.1 railing. Its handrails (#619) are ours (#419) built on its
stair: `handrailRuns(g)` / `buildHandrails(material, g)` take `stairMap`'s x / z / y maps, its wall faces (`L1201.handrail`)
and flight B's newels; without `g` ours, unchanged; no collision (inside the walls' clearance, as ours). `VisitUnit` now takes per-level
footprints, an opening, stair functions and `ground` (false: its walls are its own, not level 0's); `world.unitAt(x, z, y)`
tells its rooms from its roof and its terrace. exterior.js leaves its street / courtyard openings open (no fake glass, no
entrance leaf, no mass) and cuts the roof walk walls at its street door and terrace door (`gappedLine`); player.js adds its
door leaves to the loftgång / terrace collision (`doorSegmentsAt`). tools/visittest.html walks the loftgång → hall → galley
→ living room → its stair → Allrum (the railing holds; the handrails over the nosings, into the wall, clear of the walk) →
terrace → back → Sovrum 1.
The wall between flight A / the winders and the living room (plan wall `half: true`, z 8.091–8.195) is a sloping half wall
(#624, world.js `buildHalfWall`, `L1201.halfWall`): its top 1.0 m over the treads' nosings (*guess*, no section in Peab's material;
brochure photo docs/parklangan-halvvagg-trappa-broschyr.png), ending in a vertical edge at its low end; buildLevel skips its full-height prism and
its line-of-sight segment but keeps its collision segment, so it still stops you. visittest.html checks its top height, edge and collision.
Only L1201 has the half wall (#631: the user; #627 wrongly gave it to ours and L1004 too and was undone): ours and L1004 keep the whole wall along flight A / the winders (plan.json x 3.2515–5.5512, z 7.6042–7.8042); the living room's light switch at x 3.4 sits on it. `buildHalfWall` is generalised for either climb direction and a ceiling cap (`low: 'x0'|'x1'`), but only `L1201.halfWall` uses it; stairtest.html and visittest.html check that ours and L1004 have none.


Lift panel (#640): `src/liftpanel.js` `buildLiftPanel({ car, group, box, floors: [{ y, label }], landingZ, callX, press, doorTime })` builds everything a rider sees and hears, so Hus A/B/C lifts (#637-#639) call it with their own floor list and car box (names come from config: `CORE.lift.floors`, Hus L `['−1','1','2','3']`; sizes in `LIFT_PANEL`, all *guess*). Car: one canvas plate on the east wall with a round button per stop (lit ring until the car arrives, pressed look 220 ms); beside each landing door a call plate with ▲/▼ as the stop has floors above/below (lit while called); a floor indicator (large name + direction triangle) over the car's door and over every landing door, all sharing one texture and redrawn only when the floor/direction changes; a mirror (frame + baked gradient picture, no reflection pass or cube map) on the back wall above the handrail. Pick areas are invisible boxes (`noArchitectureEdges`) sized for touch. Core's `Lift` only calls `panel.pressed(k, inCar)` (E on a button), `panel.sync(lift)` each update (also in the rescue drive) and `panel.mains(on)`. Sounds (all through `sfx`, so they follow the game's sound setting): button click, door slide at each open/close start, `sfx.liftHum` while moving, a soft tick passing a floor, `sfx.liftChime` on arrival (higher going up). Power cut: no call is kept, lit buttons go out, indicators and plates dark, no chime or hum; the rescue drive still opens the doors with their sound. About 10 draw calls for the whole lift.

Park-level basement entries (#729): Hus A west (leaf z42.25…43.30) and B east (46.8…47.85) are real Garage glazed doors (#1152) behind their own `SITE.blocks[].recesses[].basement` walk-in specs; main-entry CORE_A/B/C specs stay independent. Garage rects join the recess mouths to A's wider corridor end and B's east corridor. B's east core-wall opening is only `s:[0,0]`, z46.1…47.0 on the flat −1 landing, north of the rising flight. Niche and doorway floors are partitioned with the passage (one surface at GARAGE.floor + floorLift); grass is omitted under the niches. West-facing façade clipping now uses the west plane/normal. The two actual animated leaves/picks have an independent exterior batch, so far approaches do not lose closed doors or draw the entire garage; picks and outdoor leaf collisions are restricted to basement height. [Sources, guesses and focused validation](../validation/issue-729/README.md); `tools/basemententrytest.cjs` drives the actual E/touch/floor routes.

## Entrances across A/B/C/L (#976)

All three `CoreHouse` variants keep their actual glazed entrance, lobby floors/ceiling and original static wall shell in `exterior`, alongside the gated lift/stair details. The A-only partition from #887 left B/C facade openings empty beyond the near rectangle. B’s fixed sidelight faces a multi-storey shaft wall, while C’s door looks through its corridor into the hall/shaft. Selecting only single-storey lobby walls or walls immediately touching lobby floors therefore leaves holes. The final shared implementation retains every original static wall run and existing dark flat-door cell, using each house’s actual data. It moves geometry between batches without adding walls, changing openings or copying A’s dimensions. The complete triangle/color/material multiset and collision/zone/floor/door dimensions stay identical. Lift, stair and other detail remain on the original near gate; all shell meshes retain normal frustum culling.

A’s original representative view already worked after #887 and remains protected. B and C are independently reproduced and corrected; their actual different entry orientation, corridor, shaft and openings remain intact. L uses the separate `Core` plus `exterior.js`/`portikPlan` envelope, unchanged by this source fix. L’s through-passage is intentional and remains open; it must not be filled merely because background is visible through it. Representative browser far/near checks cover A/B/C and L independently at quality0/3.


## Glazed A/B park doors (#1152)

Only `Garage.parkLeaves` changes from solid infill to stiles/rails around a clear
pane, following the user's report. `GARAGE.parkDoorGlass` records visual rail,
pane and tint assumptions; existing doorway extents, frames, hardware, hinge,
animation and full-leaf collision remain unchanged. The two glass panes share
one extra instanced draw, using the exact same matrices as their metal leaves;
no textures, lights or live reflection pass are added. Internal steel leaves,
including A/B core/garage and C's basement connections, retain their original
geometry. C has no independently evidenced common outdoor basement door. L has
no corresponding park door; its existing portik glazing remains unchanged.

`tools/parkdoorglasstest.cjs BASE OUT [BASELINE_GARAGE_JS]` constructs the actual
Garage and drives its production targets/update/instance matrices. Both A/B
leaves are checked open/closed, including glass openings in actual opaque
geometry, panes, unchanged collision/height gates and inside/outside WebGL
captures. This bounded component omits World/facade construction, E/touch input
and physical-phone/FPS measurements. The public viewer's equivalent transfer
is tracked in [kvarteret-lunden #43](https://github.com/solwation/kvarteret-lunden/issues/43).
