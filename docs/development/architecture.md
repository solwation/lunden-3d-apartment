# Architecture and geometry

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [plan-material](plan-material.md), [environment](environment.md), [verification](verification.md).
## Module and test map

```text
src/entrancedoor.js    shared green entry leaves and small high panes, actual recess/opening geometry (#497)
src/portik.js          calibrated union of portik spaces, room boundaries and collision (#520)
src/config.js          everything NOT in the PDF: heights, soffits, stair layout, colours
src/world.js           builds meshes + per-level collision segments from data/plan.json
src/stairs.js          stair treads + walking height function (stairHeight) and the treads' underside (stairUnderside: head room,
                       collision, the Klk under it); the rise is LEVELS[1].floor − LEVELS[0].floor in equal risers (#352)
                       handrails (#419, `handrailRuns` / `buildHandrails`, STAIR.handrail): white Ø 4 cm rails on brackets, 0.9 m
                       over the nosings (eased through the winders), returns into the wall; merged with the M.rail parts
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
                       rects, some with a steel door), walls stand on every rect edge touching no other rect (`wallLines`). The
                       entrance hall behind `terrain.garageDoor`, the turn into the big hall under the courtyard (the plan's
                       column grid, painted stalls / numbers on canvas floors, parked `lite` cars instanced, the car pool's two,
                       bike racks), our stall straight under our patio (charger, "L1007"), Hus L's basement through a steel door
                       (bike rooms, Elrum, the core's Hisshall — #415 — and the 15 wire-mesh förråd in LGHFÖRRÅD: cage doors one
                       InstancedMesh + invisible pick boxes, kind 'cabinet'), the Miljörum under Hus C (bins), fake doors on the
                       neighbours' walls. Per sensor area MeshBasic materials with the tubes' light baked into vertex colours
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
                       two-panel doors that never close on someone in the doorway (#314), the visitor rides (`snap`), a hum, a
                       pling, the floor display; keep.js part `lift`; stats `liftFloors` (SCORE.first per storey). exterior.js
                       leaves the band / passage out of the core's solid, world.js its ground plate; HUD "Hus L · Trapphus ·
                       våning N" / "Hiss"
src/rooms.js           room detection: walls + door gaps rasterised, BFS from the room labels
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


Entrance handles (#519): static ground-floor and loft green entrances share `entryHandleParts` in src/entrancedoor.js, with rose, neck and lever outside both leaf faces. The loft-only handle embedded in the leaf was removed. Hardware is merged into one mesh; entrance animation/collision stays unchanged. tools/entrancedoortest.html checks exposed hardware from both faces of every static entrance and the interactive entrance closed, half open and fully open.

Basement floor support (#539): Player.groundAt includes GARAGE.floor anywhere inside the garage rectangles, including underneath the apartment footprint. Previously the `!inside` condition discarded this floor on crossing x=0 into the apartment projection (e.g. z=4 in the storage corridor), causing unbounded falling. Garage rectangle membership includes its boundary so shared doorway edges carry feet as well. Floor meshes and room layout remain the source of the floor extents. tools/basementfloortest.html samples all basement floor rectangles, exact storage-door joins, and keyboard/touch travel to both ends and back; garage, walk and lift tests cover the adjoining routes.

Neighbor opening details (#516): exterior.js adds jambs, sashes, seals and shared door hardware inside the existing facade holes on all four street/courtyard storeys. Opening positions, widths, heights and variations are unchanged; the simplified neighbor glazing is opaque and reflective. L1007 retains its transparent moving windows/entrance and collision. `NEIGHBOR_OPENINGS` separates existing model dimensions from visual assumptions; `neighboropeningstest` and `entrancedoortest` verify both sets.
