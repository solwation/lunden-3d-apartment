# Site, streets and neighbours

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [architecture](architecture.md), [plants](plants.md), [plan-material](plan-material.md).
Neighbor openings (#516): `src/exterior.js` keeps all existing opening extents, floor placements, split panes/transoms and end-unit variations. All four street/courtyard storeys now have 6 cm outer jambs and 4.5 cm sash rails matching the existing L1007 window model; patio leaves use doors.js's 7 cm rails/10 cm bottom rail and shared chrome handle dimensions. Existing green ground/loft entrance leaves retain entryParts/entryHandleParts and gain outer jambs/hinges. Rubber seals and visible hardware join merged material batches. No neighbor interactions/interiors or collision changes. `tools/neighboropeningstest.html` checks every exposed pane against its original opening bounds, all eight face/storey combinations, shared reflection materials, night lighting and unchanged L1007 functions; `entrancedoortest` checks opaque static glazing separately from the real entrance's clear pane. [Validation](../validation/issue-516/README.md).

## Module and test map

```text
src/courtyard.js       the courtyard on the garage box (COURTYARD): walks, pergolas, the grill's side table (the kettle is grill.js's, #678), sandboxes, boule,
                       benches, raised beds, instanced shrubs; collision for what you can walk into. #683 shares streetlife.js's city-bike geometry,
                       shaped steel wheel holders and spoke alpha texture; rack collision is unchanged. #438: every bench is a seat
                       (`targets`: invisible pick boxes with rest.js spots, `world.courtyardTargets`, kept with F; since #670 no
                       neighbour sits on them; #900 also removes indoor Olof seat reservations), the pergola tables
                       and the grill's side table are put-down surfaces (`surfaces` → world.cupSurfaces); the benches' / tables'
                       collision is `seats` (segments + footprints outside `fixedSegments`, so getting up works as for furniture)
                       #682: `bench()` is a park bench (COURTYARD.bench, sizes *guess*): five eased seat slats, three back slats
                       leaning 15°, two black steel end frames (`bar`: flat profiles along a polyline) with armrests; the pergola
                       table is six planks and its benches three slats each on steel trestles every ~1.6 m. All timber shares a
                       256 × 64 grain texture (`woodGrain`) with box-projected UVs along each board and a tone per board
                       (`grain`, vertex colours) — still one wood and one metal batch; seats, spots and collision unchanged
                       #681: the playground — the playhouse has falu-red lap boards (paint boxes tilted out at the foot, also up the
                       gables), a timber sill and door step, white corner boards, a framed board door with a handle, two windows with
                       sash bars, sill and a set-back pane, a felt roof with battens, ridge cap, white barge boards and a 15 cm eave;
                       the sandboxes have broad top boards, a triangular seat in each corner and heaped sand (hill, pit, piled at the
                       boards; the sand batch is mottled by vertex colour, `mottle`, no texture) with a sand pie, bucket, spade and
                       mould (vertex-coloured plastic in the bikes' batch, `tint`); a wooden A-frame swing (COURTYARD.swing) and a
                       little slide (COURTYARD.slide) — equipment, places and sizes *guess*. Swing legs / seats and the slide collide
                       #453: no bench within 1 m of a way in at the ground (surroundings.js `groundWaysIn`: the loggias' parapet
                       openings, the entrance recesses; resttest checks); Hus A's two north benches stand between loggia and entrance
                       #637, #638, #639: Hus A's, B's and C's main entrance recesses are `walkIn` (SITE.blocks; A / B face 'n', C face 'e'): a real door into the stair core (corehouse.js, architecture.md)
src/boule.js           #1370: local pétanque on the boule court (BOULE): throwing circle, instanced boules + jack, the scoreboard lectern;
                       rules/physics in boulerules.js / boulephysics.js (details: interactions.md "Courtyard pétanque")
src/terracedecor.js    the furnished roof terraces (#605, TERRACE_DECOR, all *guess*): one style per terrace L1202–L1209 (palms /
                       bananas / agaves from patio.js `planter`, olive and box trees, loungers, tables and chairs, parasols, grills,
                       rugs, a sofa, raised beds, railing boxes, string lights); L1201 stays EMPTY (#573). Decoration only (no
                       targets, no collision, `raycast` off). Three merged meshes for the whole row (solid / soft with plant wind /
                       bulbs, warm after dusk via exterior's update); an `isLOD` gate puts them on layer 7 from north of the
                       set-back wall below the roof and beyond `far`. Foliage is squeezed clear of screens / wall (`fitCrown`).
                       Hooked in by one line at the end of exterior.js (`userData.terraceDecor`)
tools/terracedecortest.html L1201 empty, every other terrace furnished in its own style, items on the deck and clear of the
                       terrace door, no leaf through a screen / the wall, three meshes, triangle budget, the gate, the bulbs,
                       every chair / sofa faces its table (#1091; the module turns items by −r: r 90 faces west)
src/patiodecor.js      #888, #1120: the neighbours' ground-floor patios on Hus L's back (PATIO_DECOR, every placement/colour a *guess*;
                       L1007 is ours, in FURNITURE, never touched). #1120: like the roof terraces, each patio gets a varied style
                       (bistro, matgrupp, lounge, solstolar, grill, odling, grönska; dealt by a seeded shuffle) built from
                       terracedecor.js's exported generic models (`DECOR_BUILD`, `Parts`, `rng`, `fitCrown`) — none of our own
                       Åborg/Verona/Randers pieces. Colours from `palette`, a seeded mirror/shift per flat (`patioLayout(id, style)`).
                       Two merged meshes (solid; soft with plant wind), no collision, an `isLOD` gate like the terraces; seats face
                       their table, sofas have their backs to the façade (#1091). Hus A/B/C's ground loggias only carry their simple
                       loggia plants (surroundings.js), no copied furniture. tools/patiodecortest.html checks the facing, door/passage
                       clearance, hedge/screen-wall clearance, determinism, no L1007 models, budget
src/busstop.js         #1301: the bus stop "Lund Sankt Lars" (`SITE.busStop`, OSM platform way 189432570 + shelter node 2000527685, saved in docs/references/surrounding-views/bus-stop-sankt-lars-2026-10-18.json):
                       a low platform (kerb stones, tactile strip), glass shelter with bench, bin and a generic green/yellow stop sign (no operator logo) in four merged meshes, ground-following
                       via `renderedTerrainY`; every size *guess*. `src/busstopgeo.js` (pure) holds the kerb frame, `onBusStop` (the park trees keep off it) and the shelter's three glass collision
                       segments (farwalk.js); the platform is visual only (+4 cm over the ground, like the paths). The bus bay's approach road (way 95035967) is in SITE.south.access.
                       The cycle route to Circle K is the existing asphalt park path 61112061 (#1235), which meets the stop; Circle K itself lies beyond `WALK`. Test: `node --test tools/busstopgeotest.mjs`.
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees (leaf-card crowns, branching trunks: foliage.js, #679), lit windows, cloudy sky; #604: windows of Hus A–C are `lunden` and go dark in a power
                       cut (`update(hour, night, power)`), the rest of the site and the street lamps do not; world.windowLights passes
                       `power` on to the courtyard's bulbs / bollards and exterior.js's lanterns, lit glass and front-door lights;
                       #1153: corner loggias buried on a storey (`buriedLoggia`, `y < g - 1.2`) are solid in `outline(b, st)` (våning −1 storage in Hus A/B) without piers or inner walls below ground;
                       #1428: A/B's north corner loggias first open above solid basement corners. A top-only white floor at
                       y 0 closes the visual gap without a coplanar slab side against the brick. `raisedLoggiaFloors` gives
                       the same 3.4 × 2.0 m rectangles to `groundY`/Player because the terrain mesh omits A/B's footprints.
                       Both north corners in A and B were missing the floor and returned basement height −3 m; their south
                       corners already have slabs at −3 m. C's four ground loggias have slabs at y 0, while L uses its separate
                       patio builder. Parapet openings, doors, dimensions and storey data are unchanged. Native World/Player
                       ray and fall checks and matched normal-game images are in `/tmp/orkester-katt-20261020/patio1428/`.
                       The separate pre-existing parapet-gap collision is tracked in #1430; its failed walk probe is retained.
                       #1274: surrounding building roofs (`SITE.blocks`: Villa/kyrkan, HepCat, etc.) and greenhouse expose walkable surfaces and wall bounds in `userData.walk` so visitors land on and walk the roofs instead of falling through;
                       #1294: the same for EVERY mapped backdrop building (west/east/north/south, campus, Karpvägen, S:t Lars 41, outbuildings): `src/buildingroofs.js` `buildingRoofWalk` turns the backdrops' `userData.buildings` records (outline + holes, `eave`, `roofY(x, z)` = the drawn roof's height set by each builder, else flat at the eave + `BUILDING_ROOFS.flatLift`) into polygon surfaces + ring walls (up to the roof line) appended to `userData.walk`; a new backdrop type needs only a `roofY` on its record. No draw calls; `Roofs` (src/roofs.js) looks surfaces/walls up through a 20 m grid. `tools/roofaudittest.html` drops the Player on every building inside `WALK` and flies it at the walls
src/greet.js           speech bubbles (GREET, #247): `sayMine` (your line at the bottom), `say` (a line over a head — our car driver Olof, #599/#900),
                       speech = Web Speech API sv-SE (silent when muted); `occluders` (the houses as boxes) for weather.js.
                       Greeting neighbours was removed with them in #670; an old save's stats `greets` still scores
src/roads.js           the roads' shapes (SITE.roads, #257): rectangles, centre lines (`path` [x, z, r]: corners rounded to arcs,
                       `w` per point, pavements `walks`) and junction `fillets`; `samples`, `onRoad(x, z, margin)` (trees keep
                       off), `along` (lamp rows), `pathStrip` / `filletGeometry` (meshes on the ground, built by surroundings.js).
                       Sankt Lars väg turns south round the plot's NE corner in a curve; Karpvägen runs along Hus C, bends
                       west into the park and meets Sankt Lars väg with rounded corners
src/street.js          Sankt Lars väg's details (SITE.street, #128): curbs (along every `path` road and fillet, not across
                       another road), asphalt patches, street lamps in rows along a road (emissive at night; #434: a warm pool on
                       the ground under each head, `lamps.pool`, one merged additive mesh from groundglow.js, fading with dusk), zebra crossing, the site's temporary traffic light + warning signs, cobbles, autumn leaves; the bus stop,
                       the red "Flyttad" sign, a no-parking sign and HepCat's A-board (#129)
src/streetsigns.js     street name signs (SITE.streetSigns, #583): a pole per junction of two differently named streets and at the two
                       bends by the block, a blue blade along each leg with the name and, where sourced, the house numbers that way
                       with an arrow; one shared canvas atlas (a slot per text + arrow side), all faces one mesh, poles + blade
                       edges another: two draw calls, no shadows, no collision
src/streetlife.js      life on the street (SITE.life, #113): the car park as on the situation plan (#260): asphalt from the hedge (SITE.shrubs,
                       z −16.3; the drive through it in front of the portik) to a low green strip along Hus L's entrances (z −3.5…−2.9, open
                       at the portik, no collision), one row of stalls nose to the hedge west of the drive with parked cars (instanced, a colour
                       each, collision); no bikes along Hus L's entrances (#529); the bike yard NW of Hus L / north of Hus C (lawns, a tree, two rows of
                       racks; west of x −66 is left for #256's stair down to Karpvägen); #683 uses one shared city-bike model across the site,
                       courtyard and basement, with an alpha spoke atlas; #436: low concrete edges (`life.edges`, one
                       merged mesh, 5 cm, no collision) where the car park's asphalt meets grass and round the yard's lawns
src/patiohedge.js      all patio hedges (#680): rounded corners, tapered foot and a gently uneven top, one shared leaf atlas
                       (#1143: dented form, dark foot, stems and tone variation from the shared src/hedgeform.js, plants.md)
                       from boxwood.js; exterior.js merges ours and the neighbours into one mesh; original collision/snow kept
src/patio.js           patio: Rusta Verona lounge + slatted table (#408), cushion box, parasol, planters with exotic plants;
                       #690: `dynbox(item)` with `inside: 'bow'` builds the same box empty (no blanket / cushions) and exposes
                       `userData.box` (lid, size); FURNITURE's second dynbox stands at the foot of the NW stair by Hus C's NW
                       corner (SITE.terrain.west.stair, down to Karpvägen), its back against the retaining wall south of the
                       stair (x −70.82, z 11.55, `y` = the terrain there), holding the bow (src/bow.js). Which building the user
                       calls the church is not modelled by name (see #690); the box is placed by the stair itself
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
                       #1121: in front of the hedge (x 2.15–3.42, z 15.6–16.3) L1007's own 67 cm kettle grill with a side table
                       (src/grill.js `weberkettle`, GRILL.big, FURNITURE; spot and sizes *guess*): east of the walk from the patio
                       door to the gap in the hedge, west of the parasol; E lights it like the courtyard grill, movable like the
                       other patio pieces (tools/patiogrilltest.cjs)
src/carmodel.js        car bodies from a side profile (#250, MEGANE: `top` / `belt` / `bot` lines, wheel arches, plan rounding, a
                       shoulder, the glasshouse leaning in): `buildCar(spec, { doors })` — with doors: four hinged doors (lower
                       panel, black frame + glass, handle, mirror), the cabin (dashboard, OpenR screens, steering wheel on the
                       left, console, front seats, rear bench); without: a closed body as per-material geometries (`parts`);
                       `lite` (#251) = coarser (~5k triangles) for the parked cars (streetlife.js: paint / trim in vertex
                       colours / glass / tyres, instanced, a little variety in size)
src/car.js             our white Renault Megane E-Tech (CAR, #173; the model from carmodel.js, #250). Olof drives it when called (#599, src/olof.js
                       `OlofDriver`, see animals-audio.md). #915: Player protection checks the existing upcoming route polyline rather than only the car's
                       current tangent. The original clearance includes speed²/(2×actual controller deceleration), keeping the same obstacle in a bend/reverse leg
                       and permitting a stop before it; vertical/lateral/behind exclusions remain. The #915 safety fix kept original speeds; #901 now uses gameplay guesses9.5m/s cruise and3.5m/s garage with the same brake2, routes and door logic.
                       OlofDriver show/hide controls a green rear ÖVNINGSKÖR sign between plate and lights, including restored arriving/parked/leaving cars; no driver, garage/gone or hidden means no sign. #358: it lives in its stall (7) in the
                       garage (state 'garage', `toGarage`; doors / seats work there too, `parked`); the key sends it OUT — it backs
                       out (`CAR.garage.reverse`, a cusp: `route` pieces, `revEnd`), the garage door opens for it (it waits / stops
                       short), up the drive, Karpvägen north, Sankt Lars väg east and on as before to our door; sent away it goes
                       back the same way round into the stall nose-in (`CAR.garage.in`) and the door shuts by itself; `via` 'street'
                       = the old route (&car, a 'gone' car); `car.ground` (main.js) = the terrain / the garage floor, pitched on
                       slopes; its save record carries the garage door (`gd`). Parked, E on a door opens /
                       shuts it (kind 'cardoor', `car.targets()`), E on a front seat whose door is open sits you in it (rest.js,
                       looking ahead; getting up puts you back by the door); not drivable; the key shuts open doors before it
                       leaves; the screens wake while a door is open / someone sits; `car.box()` keeps the rain out; the hall key calls it in through the car park's drive
                       (in front of the portik, #260; asphalt of its own, SITE.roads 'Infarten', #356) to stop right outside our door (#208; routes =
                       data: waypoints and road legs `{ road, from, to }` in the right-hand lane via roads.js `along`, rounded off,
                       `waypoints`; cartest checks the whole car stays on asphalt) (blinks, a collision box while parked, waits for the visitor), pressed again it U-turns and
                       leaves; sfx.evHum follows it; `&car` = parked (screenshots). Music (#268, `CAR.music`): sitting in a front
                       seat the centre screen is a target (kind 'carmusic', `musicTarget.aimAt` picks its ⏮ ⏯ ⏭ row; a click works
                       like E): `car.radio` (CarRadio in sonos.js) plays the SYMFONISK channels from the dashboard, clear inside,
                       quieter through an open door, low and dull through shut ones; the screen (its own canvas, carmodel.js
                       `drawScreen`) shows now playing; it plays on after you get out, stops when the key sends the car away or on F;
                       the house speakers are ducked while you sit with it on; stats carMusic (per song)
src/signs.js           hand-lettered name signs on the bedroom doors (DOOR_SIGNS)
tools/patiotest.html   headless test of the patio seasons (parasol, beers, snowman) + sofa collision; the Verona lounge is read as its three parts (#692, #706: 7 seats, 3 cushion meshes); a cup on the cushion box's shut lid keeps it shut (#447); all season checks run in forced clear weather, plus an explicit rain-cloud fold at April 09:00 (#1081)
tools/cartest.html     headless test: our parked car — open the driver's / passenger's door, the seat only then, sit inside looking
                       ahead, out by the door; the key shuts the doors first, then it drives off (#250); music (#268): seated, the
                       centre screen on / ⏭ / off, plays on outside (muffled with the doors shut), no target from outside, off as it leaves;
                       both routes keep the whole car on asphalt, clear of the bus stop and the stalls (#356); the garage's routes
                       (#358) too, in the garage clear of its parked cars and columns
tools/streetlighttest.html headless test (#434): the street lamps' ground pools hidden by day, lit at night (on the ground),
                       no flicker just under the switching level, out in the morning; #433: eight front-door lights, off by
                       day, lit after dusk, their pools outside the house; #1078: 17 patio/terrace lamps' washes/pools in
                       the same meshes after the portik's, the Å-husen's loggia lamps, and all of them out in a power cut;
                       #1092: the front-door and patio washes cut round every façade opening (`userData.parts` per lamp)
tools/terraintest.html headless test (#346): the courtyard = the reference level, S2's level differences kept, the ramp's
                       ends / the stairs' feet / the garage drive meet their ground, no ground rises past a retaining wall,
                       every plinth reaches the ground, no unguarded step > 5 cm in OUTDOOR (5 cm grid; a stair's riser
                       is a step, the inside of an Å-hus is skipped, #355); no tree on asphalt or paving (#435)
tools/streetsigntest.html headless test (#583): two meshes / one atlas, both faces of every blade, posts off asphalt and paths,
                       every number range exactly the sourced one (OSM addr:housenumber, Karpvägen 2–10 from #575), ≤ 2 draw calls
tools/nonpctest.html   headless test (#670): no People / PEOPLE, nothing to greet at the old bench sitter's place, the bubbles
                       (yours and one over Olof's head) show and go, an old save with `greets` loads and keeps its points
```


## No neighbours outside (#670)

There are no figures outside except our car driver Olof (#599/#900) and the cats: the walkers with the dog, the cyclist on Sankt Lars väg (and its
bell), the bench sitter by Hus A and the loft neighbour (src/people.js, `PEOPLE`, #114/#239/#521) were removed because the
low-poly figures broke the realism (the user, 2026-10-11). Playgrounds, sandboxes, benches and walks stay; every courtyard bench
spot is free for the visitor (resttest #670 block). The greeting action went with them; an old save's `greets` keeps its points
(SCORE.first/again) and its stats row. `tools/nonpctest.html` checks it.

Entrance bicycles (#529): removed SITE.life.bikes and the separate façade-bike loop in streetlife.js. Outdoor bicycles are generated only at the existing SITE.life.racks inside the paved bike yard NW of Hus L/north of Hus C, as on docs/peab/situationsplan.png and kalibrerad/situationsplan-300dpi.jpg. Those seven loose facade bikes had no collision segments, so removing them leaves no invisible obstacles. Existing rack collision remains confined to the yard. Basement cycle-room racks continue to exist; their wider layout corrections belong to #523. No relocation to invented coordinates. walktest checks entry and block routes; real views check the clear frontage and occupied yard.

Bicycles (#683): `streetlife.js` `bikeGeometry()` is shared by the site racks, courtyard rack, basement bike rooms and illustrative cage contents. Frames add city-bike details and wider tyres; rims, hubs, chain and pedals share material batches. Spokes use two small alpha cards per bike and one 128 px canvas texture, with a single merged spoke draw for the basement. Rack collision bounds stay unchanged. Dimensions and fittings remain visual guesses. #905 registers the nine actually occupied NW-yard instances for the existing Player bicycle mode; source-order IDs and opposite rack yaw come from the unchanged generated matrices. Four original batches, their colors, rack collision and parking RNG are preserved. The eight additional pick helpers share invisible geometry/material and add no rendered draw.

The basement (#523) now includes the missing western CYKEL room and ordinary storage under C/B/A; no bikes among garage cars. Assumed stalls leave actual doorways clear, while our stall 18, car-pool spaces and routes stay in place. `surroundings.js` clips only the garage-facing A/B north skin at the same GARAGE door rectangles, leaving higher façades intact. See [plan comparison and limitations](../validation/issue-523/README.md). #647: `terrainGeometry()` leaves out the grass cells inside the Hus A / Hus B footprints (recesses keep theirs): the plane at y −3.01 lay 1.3 cm under the basement floors and drew over them as green patches (store rooms, the lower walls); the grid has lines on the footprint / recess edges. Hus A's west recess is 0.75 m deep (was 1.0, *guess*) so its door stands 4 cm behind the end wall of the basement's west passage (GARAGE `passageAWest` x −9.05, p46) instead of 0.29 m inside the corridor.

Höje å crossings (#532): `src/sitegeo.js` registers OSM to the existing HepCat model centre using DAY.planNorth; `SITE.geo` stores the anchor. `src/riverbridge.js` builds separate road/40 m GC bridges and the sourced local river section in four merged material batches; `SITE.bridges` and `SITE.river` retain explicit vertical/structural assumptions. Ground geometry dips under the decks; ordinary ground queries return their surface, without extending OUTDOOR. Source-based tree exclusion keeps water clear; pavement clipping avoids floating road sidewalks across the GC gap. `tools/bridgetest.html` checks source registration, actual under-deck water and surfaces; [sources, before/after and limits](../validation/issue-532/README.md). Detailed shore paths/vegetation are #533.

Steeper river banks (#1233, part 1): `SITE.river.bankScale` (*guess* .55) shortens every bank span in `riverAt`, so ground falls to the water over roughly 6–8 m instead of 11–15 m; `SITE.riverPark.treeDensity` (*guess* 1.45), `treeSpacing` 6, `shrubCount` 190 and `shoreCount` 380 give denser woodland/shrubs/bank tussocks. No new batches or textures; OUTDOOR unchanged. Cycle/walking paths (#1233, part 2 = #1235): the OSM snapshot has no `highway=cycleway` along the river in the modelled area (its cycleways lie north of Lunden and far south), so the asphalt/paved `path` ways are the shared walking/cycling route. `SITE.riverPark.paths` now holds 13 more mapped ways (61112061 along the south bank, 95035891, 148276374, 237019752, 1432565774, 130448444, 159284497 and small gravel links), each with `surface` from its OSM tag: asphalt/paved is dark asphalt (`park-paths-asphalt`), unpaved/ground/dirt/untagged beige gravel (`park-paths`). Colours and the widths of the added ways are *guess*. Strips use `renderedTerrainY` (10 cm pieces on slopes), skip pieces outside the modelled terrain or on roads, and keep trees clear through `onParkPath`. One extra draw call (second path batch), no textures. The larger walkable area is #1236 (below).

Walkable area beyond the block (#1236, user answer on #1233 2026-10-18): `WALK` (config.js, *guess* bounds, grown in slices) is the outer wall of what the visitor can walk; `OUTDOOR` stays the home block (respawn zones, ball returns). Slice 1: x −110…110, z −14…165, down the slopes to Höje å, over the road and GC bridges and the timber footbridge. Slice 2: x −110…175, z −160…165 adds the whole school campus up to the Klockhuset's clock tower (sampled `groundY` equals `renderedTerrainY` over the area except under the bridge decks); the Klockhuset's drawn centre (`campus.centre`: pilasters, pediment, tower) is its own collision box in front of the OSM footprint. Slice 3: `WALK` x −260…320, z −200…250 (the whole modelled terrain except its rim); trunks outside the home block (`treeFeet`, diamonds by kind `WALK.trunk`, *guess*) block; `buildingRescue` moves a visitor who lands in a far building's outline or closed courtyard (e.g. Realgymnasiet's hole, by jetpack) out to the street; `onWaterRescue` / `onEdge` (main.js `badge`) say "Plask! …" (the river, #1281) / "Du flyttades ut på gatan" / "Här slutar promenadområdet" (once per 20 s at the wall). No new meshes, textures or draw calls: `perfcount` stays within budget (506/520 calls, 306/320 MB). `src/farwalk.js` derives collision from the backdrops' own data: every `SITE.west/east/north/south` building polygon (+ holes), the styled blocks (HepCat, Villa), the bridges' side rails (deck ends open); `farWalls(x, z)` returns a stable per-40 m-bucket list that `Player.walkSegments` adds outdoors (no per-frame allocation beyond the existing spread). The river is no wall (#1281): walking, sliding, falling or flying down so that the feet are `WALK.waterDepth` (0.15 m) under the water line over river terrain (`inWater`: `surfaceY` under `SITE.bridges.waterY`; decks and the under-bridge footpath's floor, 0.6 m over the water, are dry) is a splash: `Player.splashCheck` puts the visitor on the nearest dry bank (`splashBank`: rings of 1 m steps up to `WALK.bankMax` round the splash, the first spot with a dry margin `WALK.bankClear`, over the water line by `WALK.bankDry`, calm ground (under `maxSlope * slideOut`), 0.15 m clear of every `farWalls` segment (buildings, the paddock fence, rails, trunks, cars), off the decks; the last dry spot is the fallback), velocity zero, no fall (`safeUntil`: `main.js` skips `Fall.land` for `WALK.splashSafe` s), then `onWaterRescue('water', at)`: `sfx.splash` (procedural plunge + bubbles in `audio.js`), a one-element blue wash fading over 1.2 s (no texture, no draw call) and the badge "Plask! Du ramlade i ån". The jetpack hovering above the water does not splash (feet over the line); coming down into it does. Ground steeper than `WALK.maxSlope` (0.7, ~35°, *guess*: the park paths stay under it, the drop from the shore path into the water, the steepest bank edges and the bridge embankments are over) cannot be climbed: `Player.slideStep` drops the uphill part of a step, adds a slide down the fall line (`slideAt`, speed easing up to `WALK.slideSpeed` at `slideAccel`, running out over a few tenths of a second), and a move that would gain height on it is undone (along the contour is fine); the slide stops once the ground eases under `maxSlope * slideOut` (hysteresis, no flicker at the limit). Not while flying, on roofs/decks, on stairs, in the lift or indoors (`z > 60` outdoors, feet on the terrain). Same code path for keyboard and touch input (it works on the step, not the input). Other players see only the ordinary position updates. Slopes below the limit are walkable (terrain-following through `groundY`, `PLAYER.stepUp`). `tools/farwalktest.html` / `.cjs` walks the real world: bank slope, splash and bank respawn (also along 20 river points: dry, calm, clear of walls), no splash under the bridges or with the jetpack hovering, slide on too steep ground (limit lowered for the park path; the real steep west bank edge), hysteresis, both bridges, rails, HepCat, Villa, outer edge. The bicycle follows both rules (#1304, `Player.bikeSplash` / `bikeSteepUp`, called from `bikeStep`): riding into the river gives the same `splashCheck` (message, splash, `safeUntil`), then the bike is set on the bank pointing away from the water (the first free heading of a few; else the rider is put off beside it); the bike cannot climb ground steeper than `WALK.maxSlope` (it stops; riding down is allowed, no roll-back slide — kept simple); the under-bridge footpath and the decks are dry for it too. Checked in `tools/farwalktest.html` (stub bike).

Höje å valley elevation and bridge span (#1285, supersedes #1271 local underpass dip): Höje å does NOT lie in a ravine and the footpath does NOT plunge into a skate-ramp depression under the bridge. Instead, the river and bank terrain generally lie lower than the road level across the bridge. The bridge spans bank-to-bank between abutments (ends at z ~100 and z ~145.8) with the road deck at deckY (-3), river surface at waterY (-6.2, ~10.5 m vs ~7.5 m ASL in Lantmäteriet height data, guess), riverbed at bedY (-6.8) and the bank path at shoreY (-5.5, guess, 0.7 m above water level). This naturally gives 2.05 m clearance under the road bridge slab and 2.32 m under the GC deck (PLAYER.headroom 1.85). The valley slope rises smoothly from shoreSpan (7.5 m) over valleySpan (8.5 m) to the base park terrain (-3), seamlessly meeting the bridge abutments on both sides without floating or sunken parts. `tools/bridgetest.html`, `tools/riverparktest.html` and `tools/farwalktest.html` verify clearance, bank-to-bank span, abutment joins and walking continuity. Screenshots: `docs/hoje-a-fran-bron.png`, `docs/hoje-a-fran-gangen.png`, `docs/hoje-a-fran-sidan.png`.

Höje å park (#533): `riverpark.js` adds sourced main path lines, approximate aerial canopy patches/glade, woody understory and bank tussocks plus the small mapped western timber footbridge. #1337/#1338: the footbridge's deck (`deckY` -3) ends on two earth ramps instead of vertical abutment boxes: `SITE.riverPark.woodBridge.ramp` (`slope` 0.125 along the ramp, `flank` 0.6 sideways, steep `front` face under the deck end, `reach` 3.6 m, `dirs` = each ramp's heading, towards the next points of the mapped park paths 51890086 NW / 1432565773 SE, which also keeps the fill off the paddock fence; all *guess*). `parkFillAt(x, z)` is the analytic fill height; `groundY` = `max(terrain, fill)` there (so walking, the bike, plants and the paddock follow), the walking surface joins the gravel batch (`park-paths`, +3 cm) and the grass embankment joins the `site-terrain` mesh (`parkRampFill`, same material, season and snow): no new draw call. Trees, shrubs and tussocks keep off the footprint (`parkFillFootprint`). `tools/farwalktest.html` walks both ramps and the deck on foot and by bike, held W, both ways (the ground along the ramps never steps or exceeds 80 % of `WALK.maxSlope`). Checked as well, not affected (their ends meet the valley slope, no vertical boxes): the road bridge and the GC bridge over Höje å (abutments follow the shoreSpan/valleySpan slope, #1285). The old random park rectangle is replaced; nearby Peab tree positions remain. `riverAt` interpolates widths/banks; `terrainGeometry` refines only the corridor with shared boundary heights. `renderedTerrainY` samples its emitted triangles for park paths/plant feet, avoiding hover over analytic curved banks. Main-bank paths follow terrain under bridge decks. Three extra merged batches, ordinary seasonal instanced crowns/trunks, no OUTDOOR expansion. `riverparktest` checks actual source coordinates, terrain contact, small crossing and seasons; [sources, assumptions and browser comparison](../validation/issue-533/README.md).

Timber ramp bank seams (#1389): both earth-fill tops were open sheets whose outer edges stood above the emitted valley terrain (about 1.2 m at either deck end), so a bank-level view saw through the sides. `parkRampFill(renderedTerrainY)` appends only exposed outward-facing side triangles to the existing `site-terrain` mesh. The lower edges split at every terrain grid/subgrid line and diagonal; the upper edges split at the ramp's own hinges, so they meet the actual rendered planes without changing the top surface. The top keeps its x/z grass UVs; the new vertical faces use horizontal edge distance and world y to avoid stretched grass detail, with the same material and draw call. `groundY`, bridge/water meshes, walking passage, river fall, lamp support and all assumed deck heights stay as before. This site crossing is not a house-geometry variant; A/B/C/L have no equivalent ramp. The neutral correction is tracked separately for the public site in kvarteret-lunden#107.

Western backdrop (#534): `SITE.west` + `sitebackdrop.js` add seven exact OSM polygons (Karpvägen 2–4/6–8/10, the opposite long building and three annexes), with explicit floor/height/roof/window assumptions. Four merged material batches; no interiors, roof access or OUTDOOR changes. Mapped far Karpvägen returns northwest; near road/garage/stairs retain their connection. Source service paths plus approximate aerial parking polygons avoid invented cars/stall counts. Western trees replace the random rectangle and exclude access/buildings; riverpark also excludes new footprints. `westbackdroptest` checks source geometry, actual outward glass/opaque rays, clear planting and garage level; [validation and limits](../validation/issue-534/README.md). Northern way 88457603 excluded for #530. Karpvägen 2–10 (#575): `karpfacade.js` + `SITE.west.karp` replace the generic body on the three Brf S:t Lars Park houses (Hus 1–3, `karp` per building): three brick storeys, recessed light top storey with dark metal end volumes at the park corners, stacked park-side (SW) balconies, stair strips with pale panels and canopies towards Karpvägen, flat black roofs. Own shared brick texture, #569's `neighborGlass()` passed in from surroundings, three extra batches (seven in the west). All sizes are image-read guesses; [sources and comparison](../validation/issue-575/README.md).

Eastern campus (#535): `SITE.east` and `sitebackdrop.js` replace nine illustrative blocks with sixteen mapped footprints, including Montessori wings and Realgym’s actual courtyard hole. HepCat’s detailed geometry stays. Shared brick texture, five exterior batches, sourced access/paths and approximate aerial avenues/groves using existing seasonal tree instances; unchanged OUTDOOR. All heights/floor counts/roof details remain assumptions. `eastbackdroptest` checks source geometry, actual outward windows, open courtyard and tree/access clearance. [Inventory, sources and browser comparison](../validation/issue-535/README.md). School facade across Sankt Lars väg (#564): `schoolfacade.js` and `SITE.school.mapped` keep the single exact polygon `88457612`, add a low footprint-following hip/standing-seam roof, shallow segmental lower arches, rectangular crowned upper windows, glazing bars, continuous jointed white corners, stepped/dentilled cornice, floor band and plinth. Two small shared school masonry/metal textures bring the east campus to seven batches (eight with #569 reflective school panes), below 22k triangles. Ground/rear window counts, profiles and roof dimensions remain photo-based assumptions; [photo analysis and verification](../validation/issue-564/README.md).

Hospital facades east of the site (#576–#581): `src/campusfacades.js` builds buildings whose `SITE.east` entry has `campus: {style, sections, chimneys, …}` from the named style in `SITE.east.facadeStyles`. The OSM polygon stays the outline; `sections` raise boxes of it (clipped to the polygon) to more storeys or a higher eave, and lower parts drop trim, windows and roof under them. Each part gets plinth, bands, cornice/dentils, convex-corner quoins, evenly spaced windows (`bay`, `margin`, per-floor `windows`) and a hip that follows its own outline (`footprintRoof`). Everything merges into the school's batches (schoolBrick now takes vertex tints, modern trim, reflective schoolGlass, schoolRoof): no new draw calls, lights or textures. Byggnad 4 and 9 (#576) use the `ward` style: one storey with white apron, piers and frieze, 4 with a two-storey block whose position is a guess. Photo sources and side identifications: `docs/references/east-campus/sources.json`; [validation](../validation/issue-576/README.md). Byggnad 8 (#578) uses `stenhammar` (the school's language: quoins with planar joints, dentil cornice, keystoned segmental and crowned straight windows), pavilions and centre raised 1.2 m over the wings and a `centre` pediment on the courtyard face; [validation](../validation/issue-578/README.md). Byggnad 88 (#580) uses `anshelm`: brick piers, broad white windows, white soffit and an `inward` roof — four sawtooths rising from the outer eave to reflective glazing over the still open court; the old light flat-roofed `modern` body is gone; [validation](../validation/issue-580/README.md). Byggnad 19 (#581, both OSM parts) uses `laundry`: plain brick, segmental windows under darker brick arches, dark string courses, paired top-floor windows; a three-storey block behind a two-storey front (section `roof` override for its low roof) and a one-storey annex. Since #581 plinths reach the lowest terrain point and a cut wall keeps windows on floors that clear the neighbouring roof; [validation](../validation/issue-581/README.md). Byggnad 2 and 7 (#577) reuse `stenhammar` with their own section boxes; [validation](../validation/issue-577/README.md). Byggnad 1 / Klockhuset (#579) uses `klockhuset` plus `campus.centre`: a risalit box (hides the walls/windows behind it) with pilasters, pediment, great round-arched window and `tower` (clock stage with four dials and hands, dark pyramid roof, open arched lantern, bell roof, gilded spire); working four-face clock (#1067), synchronized to the kitchen clock through the existing day.hour/windowLights update; [validation](../validation/issue-579/README.md). On phones (`lowMemory`, #589) both builders take a `lite` level from `CAMPUS_LOD`: fewer profiles, dentils, joints and glazing bars, coarser roofs, same shapes and windows; [validation](../validation/issue-589/README.md).

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md). Sankt Lars väg 41 (#1117): `stlars41.js` models the neo-renaissance brick villa based on Wikimedia Commons photography (two 3-storey corner pavilions with chimneys, 2-storey middle section with risalit, low flat-pitched roofs, arched entrance and narrow round-arched windows). The OSM polygon stays unchanged, merged into `southbackdrop` facade/roof/glass batches without adding draw calls or textures.

Garage/core regressions (#562): `garagetest` and `lifttest` verify the short touch label Öppna together with the exact basement/cage/portik interaction target identity, then retain actual opening/collision/walking checks.

Neighbor glazing (#569): ABC uses the listed `facadeOpenings` unchanged, layered white frame/sash trim and seals with three opaque reflective panes per opening; existing anthracite loggia/entrance glazing uses the same shared `neighborGlass()` material. Existing occupied-window light routines are retained in front of the main panes. Nearby school 88457612 reuses this material without changing historical trim or adding geometry. More distant atlas/backdrop houses retain their simpler rendering. One ABC seal batch and one school glass batch; no new environment textures, lights or reflection passes. [Measurements and comparison](../validation/issue-569/README.md).

Northern surroundings (#530): `SITE.north`/`sitebackdrop.js` add three missing exact footprints; seven western bodies from #534 and eastern campus bodies remain unique. Far Sankt Lars väg follows its mapped northwestern turn; sourced Källby/Alvägen paths, aerial pixel parking traces and seasonal avenue/grove trees complete the ground. Five exterior batches, shared textures, unchanged OUTDOOR. All untagged heights/roof/parking/tree details are assumptions; no old proposed buildings. `northbackdroptest` checks source polygons, actual outward window rays and no duplicates. [Registration controls, sources and before/after](../validation/issue-530/README.md).

Car regressions (#563): `cartest` checks the short Öppna/Sitt ner labels together with the exact front-door/seat target on each side, and excludes the seat target while its door is shut. Actual opening, seating, music, getting out and all four asphalt/garage routes remain checked.

Street name signs (#583): `streetsigns.js` + `SITE.streetSigns` put 11 posts / 23 blades at every junction of two differently named streets in the model (OSM junction nodes; by the block the Peab-based `SITE.roads`) and at Sankt Lars väg's NE bend and Karpvägen's bend into the park; campus service roads, paths and our drive get none. Names from the OSM snapshots; numbers only where sourced: Karpvägen 2–10 (#575), Sankt Lars väg 41–70 (every mapped address, all south of Höje å; the near stretch and the forks south of the river show the name only), Sävsländegatan/Nattsländegatan 2–20 and Hattsnäckegränden 2–12 (complete OSM sets). Look and sizes are *guess*. Two draw calls in every outdoor-facing view. [Sources, selection and before/after](../validation/issue-583/README.md).

Lawn surfaces (#688): `src/grass.js` shares one 256 px seamless detail map across the terrain/courtyard grass,
world.js's flat ground and streetlife.js's entrance/bike-yard lawns. Terrain and lawn UVs are world x/z metres,
so different-sized surfaces retain the same scale. Two broad shader waves add gentle irregular tone variation,
without geometry, lights or extra draws. `GRASS` holds artistic *guesses*. Autumn warms the existing lawn tints;
`registerSnow` removes/restores the map and the seasonal hook disables/restores broad patches, leaving winter
snow uniform. Courtyard paths, lawn boundaries, terrain heights and collision remain unchanged.

Park basement access (#729): `SITE.basementPaving` connects the existing C/B stair foot around B south to the green between A/B, with branches to B's east and A's west −1 doors. These simple paving rectangles are at the existing park level −3 m; widths and detailed alignment are *guess*, guided by the situation plan rather than a grading survey. The A branch bends south of the sourced tree at (−14.8,42.2); no authored tree is moved. Only guessed `COURTYARD.plantings` shrub instances whose actual bounds plus PLAYER.radius overlap this new paving are omitted, consuming the original random sequence so retained plants/vines keep their poses and colours. C's drawn basement doors remain internal garage connections, not invented outdoor entries. [Source inventory and verification](../validation/issue-729/README.md).

Courtyard bicycles (#906): all five original rack models now expose independent ride records. Their original visible geometry, colors, UVs, shadows, rack collision and two material batches remain unchanged. Riding transforms only the selected bicycle’s contiguous position/normal ranges; the toy tail and four other bicycles remain untouched. Batch bounding boxes/spheres refresh after movement. Invisible pick helpers add no rendered bicycle. The shared Player bicycle controller supplies support, collision, extraction and safe standing reload.


## Working clock tower (#1067)

`campusfacades.js` keeps the original Klockhuset tower position, dimensions and rim geometry; it returns the dial centre,
radius, square width and original face/ink colours as `clock` metadata instead of baking frozen hands into `east-modern`.
`sitebackdrop.js` creates `TowerClock` and exposes `userData.clocks/updateClocks`; `surroundings.js` forwards the same
fractional hour supplied by `world.windowLights.update(day.hour, ...)`. Main already uses that day.hour for WallClock,
so pause, time changes, spool/reverse and midnight need no independent timer. Houses A/B/C/L geometry and collision are
unaffected; only the external building1 tower has a dial descriptor. Both campus detail levels retain all four faces.

`src/towerclock.js`: two instanced draws (four dials + eight hands), 144 triangles for the entire clock, one shared256px
canvas texture, no extra lights/shadows and no per-frame repaint. The former static inner dials/hands are removed.
Instances avoid the small-detail distance cutoff; a conservative sphere covers every hand angle at screen edges.
TOWER_CLOCK in config holds the legibility ratios and depth offsets (*visual guesses*, not new surveyed dimensions).
Basic dial/hand materials keep contrast at night. `tools/towerclocktest.cjs BASE OUT` verifies actual WebGL campus builds,
all outward clock faces against the real WallClock, DayCycle/ClockPanel pause/spool/midnight and static upload when paused.
Close and100m south/west images are captured for both desktop and low-memory campus geometry.

[Rendering and verification images](../validation/issue-1067/README.md).

## School courtyards, parking, and roads south of Höje å (#1262)

`SITE.east.access` and `SITE.south.parking`/`SITE.south.access` map courtyards, parking areas, stall lines, and access roads from OpenStreetMap snapshot data (`osm-south-2026-10-08.json`, `campus-areas-2026-10-08.json`):
- School courtyards and parking: school parking lots (OSM ways 145221623, 44447969), paved and asphalt school courtyards (ways 145221566, 145221567, 145221572, 145221740, 94054863, 145221570).
- South parking lots and street-side bays along Sankt Lars väg: parking areas (ways 145221619, 850235113, 145221624, 145221626, 145221628, 145221629) with sourced stall counts/capacities and marked stall dividers (`0xeeeeea`, *guess* width 0.1 m) and concrete curbs (`0xb0aba2`, *guess* width 0.15 m); street-side perpendicular parking bays along Sankt Lars väg (ways 1379042014, 1379042106, 1379042188, 1379042235, 1379043164, 1379043165).
- Sourced service access roads south of Höje å: ways 850235114, 850235115, 36918923, 189432572, 30633544, 30633545, 145221590, 145221588.
- Materials and batching: asphalt (`0x5f6164`), gravel (`0xb5ac90`), paving (`0xa7a397`). East access and courtyards are merged into the existing `east-access` mesh with vertex colors. South parking, stall dividers, curbs, access roads, and paths are merged into the single existing `south-land` mesh with vertex colors. No new draw calls, textures, or lights are introduced, remaining strictly within the performance budget (`tools/perfcount.html`). Forest trees in the south exclude parking polygons (`!onParking(x, z)`).


## Pony paddock (#1280)

The kidney-shaped meadow south of the timber footbridge (OSM field way 237019759, `SITE.south.fields`, ~9 700 m²) is a fenced paddock with two C ponies.
Everything is a *guess* except the outline (`PADDOCK` in `src/config.js`: inset, post spacing, rail heights, gate, sizes, speeds, colours, view distance).

```text
src/paddockgeo.js   plan geometry, no three.js: outline, the fence line (outline inset 1.2 m), posts (<= 3 m apart), the gate span nearest the footpath
                    (-116, 220), `fenceSegments()` (collision), `insideFence(x, z, margin)`; shared by farwalk.js, paddock.js and the node test
src/paddock.js      `fenceGeometry` (posts, three rails, a braced gate, a plank trough with water, a three-sided field shelter: ONE vertex-coloured
                    mesh, no textures, no raycast), `ponyGeometry`/`ponyMaterial` (#1293: lofted `Soup.tube` barrel, crested neck + mane, head with muzzle/star/ears, jointed legs with hooves, tail; ~540 triangles per pony; legs, neck, head, ears and tail move in the
                    vertex shader from `aPart`/`aPivot` and the per-instance `aAnim`/`aAnim2`; coat/accent colour + star mark per instance), the shelter after the photo (dark timber posts, braces, plank walls, green sedum roof), `Paddock` (two instances in ONE
                    InstancedMesh: Zoey white, Princess brown; graze / stand / walk between 5 m waypoints that are flat and clear of trunks, the river
                    and the fence; within 40 m of the eye they walk to the places nearest to it and watch), `paddockLandParts` (the worn track along the fence,
                    merged into the south backdrop's land mesh so it is snow-covered with the rest)
src/ponyblanket.js  #1397: one two-instance winter-rug mesh, sharing the actual torso matrix buffer and parent culling; no new animal behaviour
src/farwalk.js      the fence (closed gate included) is in `farSegments()`: walking into it stops, nothing is walkable through the gate (design choice); #1295: the stile's opening has two side walls
                    (`stileWalls()`) and `stileSurface(x, z)` / `stileBase()` give the steps' walking height (player.js `groundAt` adds it as a candidate, so the ordinary `PLAYER.stepUp` 0.45 walks it)
tools/paddocktest.cjs, tools/paddockgeotest.mjs, tools/stiletest.cjs   browser checks and node plan-geometry checks (verification.md)
```

Ponies are not targets (no raycast: rays, Nerf darts and arrows pass through, like the gulls); only the pet pick boxes (animals-audio.md) are tested by the focus ray, and a pat makes a nicker. Not simulated or drawn beyond `viewDist` 280 m
from the paddock or underground; the fence is drawn whenever in view. Cost at the gate: +2 draw calls, ~8 000 triangles (`tools/perfcount.html` spots `paddock`).
**Stile (#1295):** `PADDOCK.stile` (all *guess*): in the span next to the gate (`stile` in paddockgeo.js: the next span, else the one before, that is at least `minSpan` long) the fence has a 1 m opening
with steep steps (three risers of 0.38 m, treads 0.3 m, a 0.5 m platform over the fence line) on both sides, drawn into the fence mesh (no extra draw call) and walked with the ordinary step-up. The ponies cannot use it: they stay inside
`insideFence`, and fence rails, gate and fence collision are otherwise unchanged. If the steps are moved, the opening, side walls, rails and heights all follow `stile`.
**Shade trees (#1316):** `PADDOCK.trees` (*guess*, `[x, z, scale]`, 2-3 of them) are built by surroundings.js `trees()` as kind `'big'` (the shared trunk/crown batches, the seasonal colours and bare winter crowns from seasons.js, `aoTrees` shadows, trunk collision through `treeFeet`/farwalk `WALK.trunk.big`), so they add no draw calls; paddockgeotest checks they are >= 10 m inside the fence and >= 25 m from the gate, and the ponies' waypoints keep clear of them.
**Rain and snow (#1316):** `src/paddockshelter.js` (no three.js) holds the sheltered places (`shelterSpots`: two under the field shelter's roof, `PADDOCK.rain.treeSpots` on a `ring` x scale m ring under each shade tree), `RainWatch` (rain >= `on` begins a shower, it ends once the rain has been under `off` for `dry` s) and `snowCovered(month)` (`SEASON.snowMonths`). `Paddock.update(dt, hidden, rain)` gets the weather's strength from main.js (0 for snow weather). When a shower begins each pony seeks cover with probability `chance` (at least one does); `Paddock.shelterDecide` (before ordinary field behaviours) sends it to the best free place (near, with some choice, ponies at least `pony.gap` apart), it stands there (idle) and neither grazes nor comes to the fence until the rain has been over for `dry` s, then it is released and walks out. `Paddock.rainy` / `p.spot` / `p.seek` are the flags other behaviours read (grazing, #1315, only ever starts in `decide`, which the shelter overrides). In the snow months (#1352) both ponies remain visible at normal scale in their assigned places under the existing shelter roof, with normal pet targets. They walk there when the paddock is in view, or occupy the places immediately when offscreen; ordinary distance culling still applies. Assigned winter occupants are exempt from the larger field separation gap so they stay inside their stalls. They walk out again outside the snow months; the month hook is `registerSeasonal`.
**Winter rugs (#1397):** `PADDOCK.blanket` contains assumed blue/burgundy colours, a six-section
open-bottom drape matching the existing 1.32m local torso, 2.5cm clearance and a 70cm hem.
`ponyblanket.js` creates two instances in one standard-material mesh (70triangles per rug,
140total, one additional draw only with visible winter ponies; no textures, lights, shadow casting
or raycast). It is a child of the pony mesh and shares its exact `instanceMatrix` buffer, so
position/yaw/actual scale follow the current body without copied animation or per-frame allocation.
The existing torso is rigid; head, neck, legs, ears and tail animate outside the drape. Seasonal
visibility uses the same snow months, parent visibility and existing sphere preserve distance,
underground, ancestor and frustum culling. Summer hides and winter restores the same geometry/material.
No shelter placement, terrain, collision, feeding decision or pony dimensions change.
Neutral geometry/snow-month presentation is applicable to the downstream's existing generic scenery
ponies; track a selective transfer separately, never importing named animals or pet/score/audio code.
**Shelter site (#1335/#1336):** the field shelter no longer stands at a fixed waypoint. `shelterSite` (paddockshelter.js, pure) searches a 1.5 m lattice within 45 m of the gate for the point nearest the old spot whose footprint (`footprintGround`: 5x5 samples over the shelter + `PADDOCK.shelter.pad`) varies by at most `maxRelief` (0.2 m), is at least `edge` (8 m) inside the fence with all corners inside, clear of trunks and the river, 9 m from the trough, open side towards the gate. `fenceGeometry` puts the floor at the highest ground under it and extends the posts and a sill board down to the lowest ground (`sink`), so nothing hangs in the air even if the ground varies a little. Numbers are *guess*. Checked by paddockgeotest.mjs (the old site, -135/225, dropped 0.7 m and is rejected) and paddocktest.cjs (relief, inside, in view of the gate, flat trough).
Downstream (kvarteret-lunden): the fence/ground could be transferred as a generic paddock; the named ponies are personal gameplay and must not be.

**Hay at the shelter (#1396):** `src/paddockfeed.js` owns two low wooden hay boxes, placed from
`this.spots.shelter` and the existing two roof/body spots. `PADDOCK.feed` dimensions,1.05m muzzle
reach,16s meal,95s pause,120s refill and5s initial stagger are gameplay/visual assumptions, not
measured husbandry data. Each pony walks naturally to its own body spot, faces the box, lowers
its existing grazing neck and consumes a shrinking portion only while aligned/head down.
The local ambient portions refill automatically; there is no hunger, inventory or saved feeding state.
Winter/rain refuge decisions take precedence until the pony reaches cover; a pat pauses consumption
and its normal completion resumes the meal. Finished meals clear their feed goal, allowing ordinary
visitor watching, wandering and grass grazing. Close feeding occupants share the existing roof stalls
without the field separation push. Distance/underground culling freezes the local feeding clock.
Two instances share one vertex-colour mesh: +1 draw,648 triangles, no textures/lights/shadows.
No changes to shelter/pony sizes, terrain, fence/stile or walking routes. This pony feeding gameplay
has no applicable public downstream transfer.

**Nearer shelter frame (#1395):** after the existing flat-site search, `relocateShelter` tries one assumed rigid
transform about the shelter centre:11.5m east,1m north and−30° yaw. The trough, shelter, winter decoration
and roof shelter spots share the frame; no size, animal behaviour, gate/stile, terrain or path changes.
The original0.2m footprint relief,8m centre clearance and2.5m conservative corner clearance remain.
All sampled trough corners retain an assumed1.5m walking strip and the existing0.3m relief check.
Trunk/river clearances apply to both fittings, and a rejected move retains the original site.
Current actual World: shelter distance to the fence15.443→9.365m, relief0.026→0.091m;
trough body corners remain at least1.767m inside. These are rendered-model checks, not surveyed placements.
Ground-dependent posts, sills and winter bedding use the relocated frame's actual ground as before.
The neutral public import is tracked in[kvarteret-lunden#102](https://github.com/solwation/kvarteret-lunden/issues/102);
no original animal interaction or personal content belongs in that transfer.

## East campus car parks: the lot behind HepCat Store (#1278)

A visitor reported that the area behind HepCat Store is a whole car park in reality. The repository's OSM snapshots (`docs/references/surrounding-views/*.json`) hold **no** `amenity=parking` / `parking_space` ways and no stall data; the polygon of that lot (way 145221623, "Parkering vid Sankt Thomas/Klockhuset", x 38.7…85.5, z −19…17 east of HepCat's x 28…36) and the campus' east lot (44447969) were added by #1262 (web-sourced, 2026-10-18) without stalls, kerbs or cars, and drawn as one flat 4-corner polygon that sank under the sloping ground (the lot falls 1.7 m from z −19 to 17).
- `src/parkinglayout.js` (no THREE, shared by drawing and collision): a lot = a `SITE.east.access` polygon with a `capacity`; its aisles = the `SITE.east.access` service ways whose segments run inside it (for way 145221623 the ways 145221608 and 145221600). Stalls stand along each aisle on both sides, square to it, `PARKING_LOT.bayD` deep from the aisle's edge, kept only if wholly inside the polygon, off other roads, outside buildings and not overlapping a stall. Result: 36 stalls behind HepCat (the polygon's guessed capacity is 35) and 10 on the east campus lot; cars fill ~50 % by a fixed seed, a quarter reversed in.
- `PARKING_LOT` (config.js): stall 2.5 × 5.0 m, line 0.1 m, edge strip 0.3 m, fill/seed/lifts are all *guesses*; positions follow the sourced polygons and service ways, the stall layout itself is not surveyed (the sources show no stalls). A local session with web access can replace it with the real marking (photos/aerial) by editing `parkinglayout.js` inputs or adding explicit `bays` per polygon.
- `src/sitebackdrop.js` `eastLotParts`: the asphalt of these polygons (triangles ≤ `PARKING_LOT.mesh` 8 m) is cut by `cutAtTerrain` along the terrain mesh's own grid lines and cell diagonals (`renderedTerrainY.grid()`, #1309; beyond the mesh the edge row/column is held, so virtual lines 1 km out are used) and every piece sampled at its corners with `renderedTerrainY` (lift 0.02, under the roads' own 0.025), so it is parallel to the ground it covers and never dips under a terrain fold (the earlier corner-only 3 m sampling left up to 9 cm deep green slivers, mostly along the south edge); the `access` material also wears the `DECAL_OFFSET` depth bias (as kvarteret-lunden#70 does, which instead kept 1 m triangles); if the terrain grid changes, `eastlottest`'s dense ray test (0.5 m grid on both lots, asphalt never under the rendered terrain) catches a regression. the stall lines (lift 0.045) and the flat concrete edge strip (0.035; none across road mouths or at buildings) are cut every 2.5 m to follow the slope; all of it merged into the existing `east-access` vertex-colour mesh (no new draw call, no texture).
- `src/eastlot.js`: the cars as four instanced batches (paint, trim, glass, tyres from `streetlife.js carGeometry`) in `east-lot-cars`, tagged `userData.carBatch = 'eastlot'` so the view LOD (`viewlod.js`, #1213/#1246) draws the far ones coarse; each car stands on the ground under its footprint, pitched/rolled to the slope. `src/farwalk.js` adds each car's footprint as a collision box (`parkedCarSegments()`); the aisles stay open.
- Test: `tools/eastlottest.html` (stalls/cars inside their polygon, clear of roads/buildings/each other; asphalt covers the polygon on the terrain; walkable gradient; cars block, aisles stay open; batches/LOD; no new mesh). Perfcount spot `east lot`.

Real elevation data (#1288, slice 1): `data/elevation.json` is a 10 m grid (x -260...320, z -200...460, 59 x 67, decimetres, 26 KB; z 250...460 added by #1360, before that z -200...250 = `WALK`, 59 x 46, 18 KB) sampled from Copernicus DEM GLO-30 (30 m, tile N55 E013, AWS Open Data `copernicus-dem-30m`, no account; licence: Copernicus DEM licence, attribution "Contains modified Copernicus data"). Lantmateriet's markhojdmodell needs an account/API key and was not used. GLO-30 is a **DSM** (roofs and canopy included): `h` is the DSM as sampled, `g` a bare-earth estimate (minimum of the 3 x 3 samples 30 m round the point; strips most building/canopy height but can be 1-2 m low in narrow valleys). Both are relative to `g` at the courtyard (plan 0,0 = the model's y 0; absolute 14.75 m ASL, DSM 17.7 m). Plan to lon/lat uses `SITE.geo` (+ `DAY.planNorth`), horizontal registration ~3-5 m, so the 10 m grid is not finer than the data (30 m). Regenerate: `python3 -I tools/elevation_grid.py <tile.tif>` (own TIFF decoder, standard library only; the tile is downloaded to its own directory, never executed). `tools/elevationcompare.cjs` (server on any port; `PLAYWRIGHT_MODULE`/`CHROME_PATH`) samples the model's terrain (`groundBelowDeckY`) on the same grid and `tools/elevationtable.py` prints the deviation. Result 2026-10-18 (m, model = current terrain; ground = `g`; bold deviation = more than 2 m):

```
point                                         x      z   model     DSM  ground g-model
L1007 courtyard (ref)                         0      0     0.0     3.0     0.0     0.0
Street east of block (Sankt Lars vag)        45    -30     0.0     3.4     2.7     2.7
Park south of block                           0     40    -3.0     1.7    -0.6     2.4
Meadow before the river (SE)                100     60    -3.0    -0.7    -3.1    -0.1
Road bridge north end                        24     98    -3.0    -1.8    -2.1     0.9
Water under road bridge                      24    123    -6.4    -2.2    -3.2     3.2
South bank                                   24    150    -3.0    -2.2    -3.1    -0.1
St Lars area (south, Hus 41 front)          -20    250    -3.0     6.3    -1.9     1.1
Karpvagen / west park                      -120     40    -3.0     2.3     0.4     3.4
School: Klockhuset front                     45   -100     0.0     7.6     6.5     6.5
School: parking E of Klockhuset              62      0    -0.4     2.7     0.2     0.6
Campus north edge                            40   -190     0.0     6.5     6.5     6.5
Far west (x-250,z0)                        -250      0    -0.2     3.4     2.3     2.5
Far east (x300,z-50)                        300    -50     0.0     1.0    -1.1    -1.1
Far SW (x-200,z220)                        -200    220    -6.7    -3.0    -3.8     2.9
Far SE (x280,z220)                          280    220    -3.0     4.7     1.2     4.2
```

Höje å cross-sections (#1339, 2026-10-19): `python3 -I tools/elevationsections.py <GLO-30 tile> sections.json` (22 stations every 25 m along `SITE.river.path`, samples every 5 m over ±60 m) and `node tools/elevationsections.cjs sections.json http://localhost:PORT out.json` (model `groundBelowDeckY` against GLO-30 `h`/`g` on the same points). Result (m, courtyard = 0): the model's channel is a constant trench, bed -6.8, water -6.2, shore -5.5, about 20 m wide (valley -4 or lower over 35 m), at **every** station; GLO-30's lowest `g` over the same ±60 m is -2.7...-4.9 and its position along the transect jumps ±60 m between stations, so a 30 m cell (the `g` minimum filter is 90 m wide) cannot see an 8 m river at all: the grid says nothing about the channel's depth, only about the floodplain. The floodplain beside the river agrees with the model within about 1 m almost everywhere (model -3.0 flat, `g` -2.6...-4.2); exceptions: far west (x < -200) `g` is -4.2...-4.8, i.e. 1.2-1.8 m lower than the model's -3.0, and `g` falls about 1.8 m from x 35 to x -230 (-3.0 → -4.8) while the model's water level, bed and shore are constant along the whole river. So #1288's grid is not wrong, it just cannot refine the channel; a depth/fall check needs finer data. Lantmäteriet's open `dtm-cog` (Markhöjdmodell, 1 m, CC BY 4.0) is searchable without an account at `https://api.lantmateriet.se/stac-hojd/v1/search` (tile m617_38 covers the site, SWEREF 99 TM + RH2000, float32, deflate, 512² blocks) but the GeoTIFF download itself answers 401 (Basic auth, Geotorget credentials needed): not fetched. The later #1349 reference extraction below uses a working open alternative and supersedes the access blocker; it does not turn ground data into measured bathymetry.

Findings: the model is flat (0) over the whole north (campus, hospital area) while the ground rises 2.5-6.5 m towards the Klockhuset and the northern edge (a 3-6 m step to the block is missing); east of the block Sankt Lars vag lies ~2.7 m higher than the courtyard in the data (the model has 0); the park level -3 holds roughly (-0.6 to -3.1) with the meadow/south bank exact; the river valley in the data is shallower and wider than the model's (-3.2 vs -6.4 under the bridge; the DEM mixes water and bank in a 30 m cell, so the model's river depth from #1285 is NOT overruled by it); the south side (St Lars area) is about 1-3 m higher than the model's -3 (+4 m far SE); the far south-west corner lies 3 m higher. Everything away from the block is generally +1...+3 m higher than the flat -3 plain, and the north +3...+6 m. 

Terrain from the grid (#1305): `src/elevation.js` samples `g` with a C1 Catmull-Rom surface (clamped at the grid edge; bilinear kinks on the 10 m lines would put the 4 m terrain mesh up to ~20 cm off the analytic `terrainY`) from `src/elevationgrid.js` (generated by `tools/elevation_js.py` from `data/elevation.json`, a synchronous module so every page/test has it without a fetch). `surroundings.js` `terrainY` = `terrainBase + w * (g - terrainBase)` with `w` = `elevationWeight`: 0 inside `ELEVATION.protect` (a rectangle x -86...46, z -36...72 round Hus A/B/C/L, the courtyard, the box, the ramp and the designed Karpvägen / Sankt Lars väg profiles; L1007's courtyard stays y 0), smooth-stepped to 1 over `ELEVATION.ramp` (30 m), back to 0 within 32 m (+30 m ramp) of Höje å (so #1285's valley depth, bridges and abutments are untouched) and over 30 m towards the mesh's x edges and its south edge (the flat -3.01 planes beyond; the grid ends at z 250). The terrain mesh now starts at the world's north edge (`backgroundGround.z0`, 5 m rows north of `terrainNorth`); world.js's flat north plate is gone. Everything that samples the ground (roads/paths via `pathStrip`, east/west/north backdrop buildings - `base` = highest footprint corner, `bottom` = lowest -0.1 -, trees, cars, paddock) follows; paved/gravel polygons of the backdrops are cut into <= 4 m triangles 3 cm higher (`PAVE_MESH`, `PAVE_LIFT`) so they stay on the slope. Not following (#1306): the bridge decks (`deckY` -3), the Peab block and its neighbours (protected), `southbackdrop.js`'s flat -3.01 land/field planes, and any object that hard-codes y 0 / -3 in the far field. Max gradient on the 4 m grid and the number of cells over `WALK.maxSlope` (37, all river banks) are unchanged. Deviation after (same table, m, g - model): street east of block 2.7 (0.1 at the protect edge), north/school 6.5 -> 0.0, far west/east/SE 0.0, far SW 2.9 (river valley kept), St Lars south 0.8, river points unchanged (kept). The heights are the DSM-based estimate, not surveyed.

Building pads (#1306): on the elevation grid's sloping ground the far buildings (`SITE.west/east/north/south` outlines, z <= 260, not touching the protected block or the river valley) stand on a level pad: `makeBuildingPads` in `surroundings.js` (`ELEVATION.pad` 10 m grade, `padRamp` 8, `padMin` 0.4, *guess*) takes the mean raw ground under the footprint (outline + 4 m samples) as the level, `terrainY` makes the footprint flat and grades back over 10 m (neighbouring footprints stay flat). Everything samples `terrainY`, so base, plinth, `roofY`/walls (#1294), paving, roads and trees follow; the grey plinth that grew up to 5 m on slopes after #1305 is gone (plinth only where the pad meets the mesh's 4 m lattice, < 0.4 m). Buildings partly inside the protected block (Östra längan, Consensum, Realgymnasiet's edge) keep their old plinth. `southbackdrop.js` fields and car parks are cut (`terrainTriangles`, 6 m, only where they touch the terrain mesh).

## The playhouse's secret children's room (#1319, part 1 #1326)

The red playhouse (`COURTYARD.playhouse`, #112/#681) is the way into a hidden children's room. E on its door (`courtyard.js`: an invisible pick box, target `kind: 'playhouse'`) goes through `main.js` `enterPlayroom()`: every avatar height is admitted (#1489), then a short fade (`PLAYROOM.fadeMs`) hides the teleport via `Player.spawn`. The room (`src/playroom.js`, `Playroom`) is a separate hidden interior at `PLAYROOM.x/z` (-1500, -1500: outside `WALK`, inside the Worker's ±5000 m pose limit and further than `GHOSTS.far` from the playhouse), 18 x 10.4 x 2.7 m (the fantasy clubhouse, #1374), built from a handful of merged meshes; its group is `visible = false` until you are inside (zero draw calls outside, about a dozen inside; `world.playroom.inside` is synced every frame, so a respawn or resume elsewhere undraws it). `Player` has an `inPlayroom` mode like `below`/`inCore`: its own floor (`groundAt`), four wall segments (`walkSegments`, `isFree`, `nearestFree`), ceiling, the furniture's footprints as obstacles (#1327), not `outdoors`/`aloft`, and the far-walk / slide / splash code skips it. `main.js` sets `day.under = 1` and `day.lit = PLAYROOM.lit` inside (no sun, an ambient lift) and names the place "Lekstugan · Barnrummet". The 1.7 m door in the south wall (height *guess*, interaction available regardless of avatar height; `playroomExit` pick box) leads out again: `Playroom.outsideSpot`, `PLAYROOM.outside` m north of the playhouse's door wall facing away from it. A height change inside never throws you out (the door always works). A reload inside saves that outside spot (`placeNow`). Multiplayer: the ordinary pose stream already carries the room coordinates, so players in the room see each other and a player who goes in simply vanishes from the courtyard (too far for `GHOSTS.far`); `Ghost.push` treats a jump over `GHOSTS.jump` (100 m) as a teleport (no streak across the map). Furniture now follows the three-room clubhouse layout (#1374): eight cinema chairs and a shared wall screen in BIO, the centered billiard table in BILJARD, and four themed computer desks/chairs along the two SPEL side walls (#1488). See [furniture](furniture.md#clubhouse-screens-and-computer-stations-1488) for the current models and [shared computer controls](interactions.md#shared-computers-1488). All chairs use ordinary rest targets and existing standing/looking mechanics. Collision: each piece's footprint is a convex polygon in `Playroom.footprints` (`Player.obstacles`/`isFree`) and its edges are appended to `segments`. The disco ball (`Playroom.update(dt)`, called from main.js only while inside) turns, and `furniture.ball.spots` light spots (one quad each in a single alpha-textured mesh, coloured per vertex, no real light) are where fixed rays from the ball, swung round the vertical axis by `spotSpin`, meet a wall, the floor or the ceiling; the 26 positions are recomputed per frame. TV/game function, billiards and sound stay in #1328-#1330. All sizes are our own choices (*guess*). `tools/playroomtest.cjs` is the browser test.

## Paths and roads: audit (#1341)

`node tools/pathaudit.mjs [--json]` audits every footpath, cycle path, pavement and road of the playable area against the data the game draws (`SITE.roads` incl. their `walks`, `SITE.riverPark.paths`, `SITE.west/north/east/south` `paths`/`access`; roads.js `samples`/`onRoad`/`isVehicleWay`, riverbridge.js `deckAt`). It stubs `three` for node, so it needs no install. Categories: **dead-end** (a footpath end that meets no road, way, building, paving, bridge, the timber footbridge or the WALK edge ±10 m), **gap** (an end 0.3–6 m short of another way, or park-strip quads clipped away mid-way, cf. #1317), **on-road** (a footpath drawn over asphalt of another colour at an equal/higher lift; `on-road (trimmed)` = so in the data but cut at the edge when drawn), **overlap** (duplicate/parallel strips at the same lift: z-fighting). Run it after changing any of those data sets; the aim is zero `on-road` and no new dead ends.

Root cause of the footpaths lying over roads (#1341): OSM footways end on (or cross) the road's centre line, and the backdrops drew them at lift 0.025 over the local roads' 0.012, so a light strip stuck out over Karpvägen / Sankt Lars väg. `pathStrip(…, trim)` (roads.js) now takes a predicate; quads that touch it are cut into 0.25 m pieces and pieces whose centre is on vehicle asphalt (`onVehicle`: `SITE.roads` + every asphalt way ≥ 3.9 m wide of the backdrops, `isVehicleWay`) are left out, so the footpath ends at the carriageway's edge. Applied to the footpaths of `riverpark.js` (not under the bridge decks) and `sitebackdrop.js` (west, north, east; the south backdrop only has carriageways). New footpath data must be listed with `w < 3.9` or another surface than asphalt to count as a footpath. Dead ends are closed with a connector in the data (`SITE.basementPaving`: the 1.5 m strip from the park's gravel path 123898762 to the walk round Hus B, which the park's z 64 clip had left in the open grass; north 1228396154 now runs on to Karpvägen's centre line).

Road asphalt in the terrain (#1341): the terrain mesh interpolates linearly between its grid nodes (10 m rows / 12 m columns far from the block), so where the ground is curved it rose through the local roads' asphalt (measured with the exact `groundY` + 0.012 lift: up to 0.24 m on Sankt Lars väg's northwest stretch, 0.09 m on Karpvägen's bend by Hus C) as green holes. surroundings.js now lays the roads' asphalt and pavements on `roadGround = max(groundY, renderedTerrainY)` with the terrain's grid (roads.js `pathStrip` cuts far strips along it, as for the park paths, #1313): about +950 asphalt and +380 pavement triangles in all. The backdrops' own roads (`sitebackdrop.js`/`southbackdrop.js`) already used `renderedTerrainY`. Fillets and the rectangular roads (the car park, the garage drive) still use the exact ground.

Remaining ends closed (#1346–#1348, all new points *guess*, the rest stays OSM): west 342815193 (the walk along Karpvägen 6–8's entrance side, which ran 15 m past the last stair spur into the grass) now turns in to the building's SE gable corner (-144.4,114.7); north 44447980 (service way, w 4 like the other `north.access` ways; only the `paths` footpaths are w 2) curves in to Östra långan's east corner (-111.3,18.6); north 850235116 starts at Hus 130578354's east face (-142.2,-142.95) instead of 3.6 m short of it. Karpvägen 2–4 and 10 spurs (342815184–190/195) all end on a building, another path or a road. The audit's **overlap** check measures against the other way's interior only: ways that meet end to end (Sankt Lars väg → 189432530, 36918924/45211117 → 1147690112, all collinear asphalt with the same lift) abut and are not duplicates. The south backdrop has only asphalt carriageways, no footpaths, so the `trim` of #1341 is not needed there; new footpaths in `SITE.south` would need it.


Junction edges (#1351): `roads.js` `vehicleTrim` clips the emitted path/pavement triangles against the actual carriageway triangles, fillet fans and rectangular road surfaces, indexed once by nearby cells (`polygoncut.js`). This replaces the 25 cm whole-width discard for park/backdrop paths and also clips the local pavements, including where a sharp bend made them overlap their own road. Cuts preserve terrain-grid subdivisions and sample the rendered ground at new road-edge vertices; under-bridge park paths retain their existing exception. Float32-collapsed triangles are omitted before merging. No extra material batches, road coordinates or widths. `node --test tools/polygoncuttest.mjs` checks area, winding, oblique cuts, height interpolation, boundary/contained cases and overlapping cutters; `tools/roadjunctiontest.html` checks emitted triangles against actual road meshes for all west/north/east/park paths and local pavements, both exact kerbs of an oblique crossing and the bridge exception, with a rendered overview. Recheck riverparktest and perfcount after changes to this clipping.

The map-to-local-street join on Sankt Lars väg also omits the redundant 1.58 m right-angle jog and eases into the existing straight with an 8 m radius (*guess*); the width entry moves with its control point. This removes the sharp paving spur by Karpvägen without changing the local straight or carriageway widths. The junction browser fixture checks that the transition is eased and the per-point widths remain aligned.


## Fine ground-height references for Höje å (#1349)

The user chose an alternative the agent could obtain without a user account. `node tools/riverheight-api.mjs OUTPUT.json` samples the public `https://api.kart-api.se/v1/hojd` endpoint using the existing `SITE.river.path` and `sitegeo.js` registration. The provider identifies its source as Lantmäteriet Markhöjdmodell, a 1 m ground grid, RH 2000, CC BY 4.0 ([provider documentation](https://kart-api.se/en/guides/elevation-sweden/)). This is a point-API export through a third-party provider, not a downloaded original GeoTIFF or independent verification of its survey date. The tool makes 60 sequential bounded requests, preserves completed responses for resumption and marks incomplete exports explicitly.

[The checked reference export](../references/elevation-hoje-a/point-api-2026-10-19.json) contains all 19 centreline anchors, five cross-sections at offsets -24/-12/-6/-3/0/3/6/12/24 m and a ground sample at the model origin. All 60 responses are valid and none is NODATA. Re-running against the existing private export verified its cached coordinates/responses without new requests. The ± offsets are chosen sampling distances, not surveyed channel widths.

Absolute ground-model heights in RH 2000 (m):

| Along river (m) | Centreline | Lowest sampled profile point | Offset -24 m | Offset +24 m |
|---:|---:|---:|---:|---:|
| 0.0 | 9.09 | 9.07 | 9.73 | 10.92 |
| 102.7 | 8.96 | 8.96 | 10.35 | 10.96 |
| 190.4 | 8.92 | 8.92 | 10.50 | 10.75 |
| 361.8 | 8.85 | 8.51 | 10.71 | 10.12 |
| 525.6 | 8.67 | 8.66 | 10.46 | 11.24 |

The centreline samples are not monotonic: the lowest of all 19 is 8.45 m at about 234 m along the river. Do not turn noisy raster values into a current-water or bed profile without interpretation. A ground model cannot establish submerged bathymetry. Existing horizontal registration is only approximately 3–5 m, so a nominal centreline sample can fall on a bank; a 1 m source grid does not improve that registration. The sampled model-origin ground is 14.36 m RH 2000, **not** a surveyed apartment floor elevation or a replacement for `SITE.terrain.ref.plus = null`.

The complete municipal `terrain-rgb-1281-1m.pmtiles` archive was also downloaded and two PNG tiles decoded locally to check coverage. [Source, SHA256, size and archive metadata](../references/elevation-hoje-a/archive-metadata-2026-10-19.json) are retained in git; the 114,617,592-byte binary remains outside the repository. Its maximum zoom is 15 with 256 px tiles: approximately 2.693 m per exported pixel at Lund and 0.1 m RGB height steps. Despite the filename/source grid, this is **not** a 1 m output raster. All 58 archive probe points had data; the independent point API is retained for the finer reference profiles. Attribute reused values to Lantmäteriet (via kart-api), CC BY 4.0.

This delivery changes references and the offline tool only. It changes no rendered ground, path, bridge, water or building height and no game's network calls. Interpretation and runtime application remain in #1350; the same public source can be assessed there for downstream use.


## Relative downstream grade for Höje å (#1350)

`tools/riverfall.mjs` interprets the 19 checked centreline ground points from #1349 offline: take all 171 pairwise height/distance slopes and their median, −0.0009170995546035121 m/m. This gives a relative fall of 0.482070 m over 525.646 m. The [reproducible interpretation](../references/elevation-hoje-a/fall-interpretation-2026-10-19.json) retains the input hash, raw/trend pairs, residuals, method and limitations. This robust trend avoids following the isolated 8.45 m raster low as a water surface. It is a visual interpretation of approximately registered ground data, **not measured flow, water level or bathymetry**. Attribution: Lantmäteriet via kart-api, CC BY 4.0. The larger 1.8 m GLO-30 floodplain estimate in #1339 is historical evidence at a different resolution/width, not the chosen channel-grade value.

`SITE.river.fall.perM` stores the relative slope. `riverAt` now exposes cumulative `along` metres; `riverFallAt`, `waterYAt` and `shoreYAt` in `riverbridge.js` share one road-bridge-centre datum. Existing guessed water −6.2, bed −6.8 and shore −5.5 remain the reference levels there; the guessed 0.6 m submerged depth and 0.7 m shore clearance stay constant. Upstream water becomes −6.006 m, downstream −6.488 m. The channel, shore and floodplain cross-section follow the same grade and fade smoothly back into existing terrain before the protected river corridor ends (32 m). This does not establish the apartment floor's RH2000 elevation.

Water mesh vertices, plant wet/dry filtering, `farwalk.inWater`/candidate-specific `splashBank`, `Player.splashCheck` (feet against the **local** surface) and the splash's sound position all use the same level. The timber bridge's earth-front toe reaches below its local shore; its deck, ramp top slope and lateral slope stay fixed. Native snapshots verify the road/GC bridges' concrete, steel and asphalt geometry and mapped park path controls/widths byte-for-byte against 387f802e. Path surfaces continue to sample the rendered ground, with original routes/widths and under-deck exception.

Checks: `node --test tools/riverfalltest.mjs`, `tools/bridgetest.html`, `tools/riverparktest.html`, `tools/farwalktest.cjs` (including feet just above/below the actual upstream/downstream water), and `tools/perfcount.html`. Inspect full-quality images at the road underpass, timber ramp, western bank and overview. Keep original-only Player/audio adapters out of the public import; its navigation has its own water recovery.

### Winter shelter decorations (#1345)

`src/shelterwinter.js` builds ground-following straw bedding with loose pieces, front-beam greenery and 16 warm unlit bulbs at the current `Paddock.spots.shelter`. It samples the same ground/`footprintGround` frame as the shelter. `PADDOCK.shelter.winter` centralizes visual guesses; the bedding clears the existing ground+.07m worn-land overlay. Two merged vertex-colour meshes (3,362 triangles total), no textures, lights or shadows added; a small standard-material emissive term keeps the bedding readable at night, and Basic-material bulbs remain warm. They do not illuminate the scene.

`Paddock.update` shows the group only in the existing snow months and while the paddock is near/not underground. Geometry and materials are built once and reused on season changes. No changes to shelter placement, horse behaviour, pet targets or collision. The full-app winter/day/night/summer/culling test is `tools/shelterwintertest.cjs`, with paddockgeotest for the unchanged site/fence contracts. Neutral scenery transfer is tracked in public kvarteret-lunden#92; no personal content or gameplay is part of that transfer.

## South of the road bridge: missing escarpment (#1357, data in #1360)

Analysis 2026-10-19 (numbers in the #1357 comment): the registration of `data/elevation.json` is correct: same transform as `sitegeo.js`, LM channel lows on the OSM centreline, no systematic DSM-trough offset. The ground south of the road bridge is nevertheless a flat −3 plain, for three reasons. (1) `g` (3 × 3 minimum, 90 m) drags the valley floor 30–45 m up every slope. The DSM shows Sankt Lars väg climbing from about −2.3 at z 150 to +3.5 at z 205 and the open car park 145221619 at about +3.5…4, while `g` starts rising only at z 215–230. (2) The grid ends at z 250, `elevationWeight` fades to −3 by the mesh edge at z 260, and `southbackdrop.js` `farGround` is a flat −3.01, so the houses above the paddock (Sankt Lars väg 41–45) stand at the paddock's level. (3) The river corridor (32 + 30 m) and the road, which has no profile of its own, leave no embankment. A morphological opening of `g` over the whole grid is not a fix: it raises the ground by 1.5 m on average and fits the wooded valley's LM points worse (+1.5 m vs +0.6 m). A road profile without the southern grid would create a false slope at z 230–260. Rendered heights are therefore unchanged until #1360 is done. A local agent must run `node tools/riverheight-api.mjs OUT.json --set south-road` (77 named points: road centreline, five cross-sections ±30 m, paddock, plateau houses, footbridge ends; `--dry` lists them) and `python3 -I tools/elevation_grid.py <tile> --z1 460`. Then the road embankment (side slopes *guess* until the cross-sections exist), the plateau and `farGround` can follow sourced heights.

South-of-the-bridge heights (#1360, 2026-10-19): `node tools/riverheight-api.mjs OUT.json --set south-road` was run (77 valid points, none NODATA, 77 sequential requests, sha256 `d5b777212d4f581b756e8113cd6e7ce276bea31ebc87d4608b597e65f167d260`); [the export](../references/elevation-hoje-a/point-api-south-road-2026-10-19.json) is checked in (Lantmäteriet Markhöjdmodell via kart-api, RH 2000, CC BY 4.0; model origin 14.36 m as in #1349). `data/elevation.json` / `src/elevationgrid.js` were regenerated with `python3 -I tools/elevation_grid.py <tile> data/elevation.json --z1 460` + `python3 -I tools/elevation_js.py` (GLO-30 tile, "Contains modified Copernicus data"): `h`/`g` for z -200...250 are bit-identical to before, rows z 260...460 are new (`g` 3 x 3 minimum kept, the opening/max variant was not saved). Rendered effect: `gridGround` is no longer clamped at z 250, so the Catmull-Rom surface differs for z >= 241 (max 1.63 m raw at x -18, z 260), but `elevationWeight` fades to 0 at the mesh's south edge (z 260), so the weighted change is at most about 7 cm (z 241...260); nothing else in the model reads the new rows yet. The profile numbers and what the model needs are in the #1357 comment.


## Walking-route lighting (#1363)

`src/pathlamps.js` derives assumed lamp placements from eleven existing OSM path records in `SITE.riverPark.paths`. `PATH_LIGHTS` holds all guessed dimensions/spacing:4.6m poles,18m spacing,0.65m outside path edges. Candidates leave every sourced walking strip clear, avoid roads/bridge decks/water/horse field/fence, preserve separation from supplied `treeFeet`, and can use the opposite verge at an obstruction. These are new visual fittings, not surveyed existing lamps.

`street.js` appends their instances to the existing street post/head batches and their ground glows to `streetLampPools`; no new light object/material batch. Existing road instance matrices and pool position prefixes stay byte-identical. Road fittings keep `groundY`; new park poles and every glow vertex use `renderedTerrainY` supplied by surroundings. `pools.userData.pathStart` separates the two support surfaces for regression checks. Existing night hysteresis/fade controls both; original roads retain8-ring/28-segment pools, new paths use5/20 to bound triangle work.

The seeded component constructs41 additional placements before tree exclusions, same22 daytime /24 nighttime draws, +8200 daytime and+22960 nighttime rendered triangles (transparent double-sided glows include both passes). Native placement3/3 and actual WebGL component8/8 pass; original road data and sloped support are checked. `tools/streetlighttest.html` now checks appended pools against their actual rendered terrain and passes35/35, including dusk/morning and the existing building-light power cut. Actual full-world north-park night images were opened before/after; they show the walking strip lit. This is Chromium, not physical-phone FPS. Matched phone landscape perfcount: peak485 calls before/after (existing370 limit failure, #1361), max886135→894335 triangles (limit950000), textures about96MiB (limit225). Paddock/bus-stop views gain two previously culled post/head batches (49→51 /58→60); no global peak-call increase. No budget is raised.

Relevant public architecture transfer needs its own issue/source SHA; personal/playroom content is excluded.

## Supplemental road lighting (#1371)

`src/roadlamps.js` places assumed 6.2 m fittings beside the existing mapped carriageways: the full local Sankt Lars väg/Karpvägen plus western, northern, eastern and southern service/road polylines at least3.5m wide. Parking polygons and footpaths receive no road rows. `ROAD_LIGHTS` centralizes guessed32m spacing, verge clearance, tree/building/river clearances and a compact3-ring/12-segment ground glow. Post locations are not surveyed. Both verges are tried; all walking strips, roads/junctions, buildings, tree trunks, water, bridge decks, parking polygons, the bus-stop platform and the paddock are excluded. Existing street/park fittings take precedence and are never moved.

The extra placements append to street.js's existing post/head/pool batches: no new light objects, materials or mesh batches. Posts and every glow vertex use `renderedTerrainY`; the old road and park matrix/geometry prefixes stay byteidentical. The known synthetic fixture adds114 posts after existing park fittings,22800 daytime/36480 nighttime triangles, with22/24 total component draws unchanged when both old/new batches are visible. A former unlit eastern view gains two night draws as the existing head/pool batches enter view; no claim of equal calls in every camera. A/B/C/L are not remodelled.

Tests: `node --test tools/roadlampstest.mjs tools/pathlampstest.mjs` and native WebGL `tools/roadlampstest.cjs BASE` (same PLAYWRIGHT_MODULE/CHROME_PATH/SHOTS variables as pathlampstest). The park component test explicitly suppresses supplemental road placements so its original park-only budget remains meaningful; the new road test exercises all existing park geometry plus real supplemental road generation. See verification.md for full-world evidence.

## Lamp support over the timber-bridge earth fill (#1378)

`renderedParkFillY` in riverpark.js uses the exact existing grass offset (`woodBridge.ramp.grassLift`,−0.01m, moved from the previous literal). Native frozen-source comparison confirms unchanged ramp index/position/normal bytes. `lampGroundY` in surroundings.js takes the higher of the rendered terrain and this rendered fill surface and is supplied only to the appended park/road lamp fittings. Old road fitting prefixes, physics, bridge geometry, A/B/C/L and plant terrain callbacks are unchanged. Glow vertices use the same surface plus their existing5cm offset; no new triangles, lights, materials or batches.

Actual full-World baseline15f9b005: one pole2.215059m below the highest drawn triangle,489 overlapping glow vertices with max2.667783m deviation. `tools/lamprampstest.cjs` samples actual site-terrain triangles at those fixtures, rather than comparing a ground callback to itself. `tools/lamprampstest.mjs` covers unchanged ramp bytes and both ramps' interior grass triangles (Float32 edge coordinates may round outside an analytic footprint, so native height comparison uses triangle centroids). Public#95 already avoids ramp-footprint pole placements, but its generic ground-light support is reviewed separately.

## Southern crossroad and narrow service link (#1433)

Only OSM SERVICE145221576 and199056948 are added (254.150m), using the same committed
2026-10-08 snapshot and1cm-rounded `geoToPlan` registration as#1432. Exact shared nodes
connect36918924,145221573 and the two new roads. Neither way has sourced width/surface:
asphalt is guessed, as are4.5m for145221576 and3m for the short199056948 single lane.
The latter's4/4.5m candidates intersect house45 and were rejected without moving nodes
or buildings. Whole emitted-triangle edges clear all building bodies/courtyard holes;
minimum boundary distance is3.027892m and0.370694m respectively. These are model clearances,
not surveyed civil dimensions. `highway: 'service'` explicitly retains vehicle semantics
below the old3.9m width heuristic; existing untyped roads and actual footways keep their
old classification. Both strips reuse#1432's existing exact terrain opt-in.

Actual World before/after data preserves terrain, pads/controls,70southern trees and all
old south-land position/normal bytes around one1822triangle insertion. Park paths plus
west/east/north access geometry stay exact despite the vehicle-clip registration. Existing
automatic lighting adds seven guessed fittings along145221576; all117old roadside records
stay exact. Cost is1822asphalt+1400post/head+420night-pool triangles, no new batches,
materials or textures. All road points are outside WALKz250: verification is local geometry/
ray support and normal camera views, with no claimed production walk or expanded boundary.
A/B/C/L house layout is outside this site-road scope and their dimensions/openings stay intact.
Neutral transfer is queued separately as LOW kvarteret-lunden#117, depending on#116;
no public implementation or reservation is part of this source change.

## Northern southern-site service entrance (#1432)

`SITE.south.access` adds only service ways145221573/145221582/145221583/145221596
(286.622m) from the committed2026-10-08 OSM snapshot. `geoToPlan` coordinates are
rounded to1cm like existing data, preserving the shared30633546 and145221590 nodes.
The raw ways only have `highway=service`:4.5m width and asphalt remain explicit guesses.
Their `terrain: 'triangles'` opt-in makes `pathStrip` use the existing `cutAtTerrain`
with `renderedTerrainY.surfaceGrid()`; each new face lies on one actually emitted
terrain triangle, including refined cells. Old strip generation and terrain stay unchanged.
The new road lift is25mm. Where existing parking overlaps it, the unchanged52mm
parking surface and76mm paint/kerb remain the top layer; those surfaces are not regraded
as part of this road change (#1390/#1416 retain that separate scope).

The new asphalt adds2273triangles in `south-land`, with no new batch/material/texture.
Existing automatic roadside lighting adds four guessed fittings and removes one old
30633546 fitting at(7.1821,238.9569), which would stand in the new entrance. The other
113 roadside records retain their exact positions. Net lighting cost is600post/head
triangles and180night-pool triangles; total resource growth3053triangles. Existing
park/east footway clipping is unchanged in the actual World. Southern forest records
and trunk matrices remain exact; full-width strips plus the0.5m tree exclusion margin
do not touch either forest. No building foot, opening, parking polygon/paint, bridge,
paddock or height control changes. A/B/C/L house geometry is outside this site-road scope.

Only the northern entrance and branch are inside existing `WALK.z1=250`; three real
Player W-key routes cover those connections. The rest receives local emitted-surface
and endpoint rays, not a claimed production walk. See `tools/serviceaccess1432test.mjs`
and [verification](verification.md). Neutral downstream transfer is tracked separately
as kvarteret-lunden#116, always low priority.

## Southern plateau and parking support (#1381)

The existing10m GLO grid already reaches z460; the drawn terrain and south backdrop now use that extent,
adding8m rows after the original z260 boundary. The ten plateau/paddock controls in `SOUTH_PLATEAU` come from
`docs/references/elevation-hoje-a/point-api-south-road-2026-10-19.json` (77-source-point export, provider LM/CC BY4.0).
They are relative to the existing14.36RH2000 model origin, not measured apartment floors or bathymetry;
horizontal registration remains approximately3–5m. `southPointGround` uses compact35m smooth corrections,
blended in over z225..240. The original raw ground and platform list are evaluated north of that fade,
so southern platform averages cannot change the northern terrain indirectly. New platforms can use a nearby
control within3m and a4m flat apron; those choices are interpolation/platform assumptions.

Sankt Lars41/45 platforms are about+1.83/+1.94, versus the paddock control−3.51. Parking polygons are cut
along the actual terrain triangles; stall paint and kerb bands are clipped along those same triangle boundaries.
Simply tilting long paint quads left a candidate band1.3m above its parking slope. The final actual emitted
mesh is checked at2154parking points, including20paint probes, with maximum error0.000002m from the52mm paving or76mm paint/kerb lift (paint now sits24mm above the paving). Paddock trees, animals,
shelter and ground AO use the same expanded boundary. No road or bridge grade is changed in this slice;
#1382 owns the bank/bridge profile. A frozen native comparison retains58243northern terrain positions and
all four river-bridge position buffers byte for byte.

The terrain has81862→89490triangles. The southern component grows from19729 to34310triangles because
it now represents a sloping additional200m strip and ground-following markings. Its old23000allowance
is extended by a field and paving/paint layer per added4m-column×8m-row cell (limit40252); this is an
explicit coverage-dependent component-budget change. The global PERF budgets remain unchanged. The
phone landscape run has445draws (pre-existing #1361/#1383 failure) and932906triangles≤950000/~97MiB.
No FPS or physical-phone stability is established. Neutral source/data transfer is tracked in public#98.

Desktop quality0 is separately over budget before this change: frozen0b89b99b gives1,019,892triangles
in big hall, versus1,042,099after (+22,207), same494draws/~308MiB. Both report SOME FAILED;
this pre-existing desktop triangle bug is #1387. Its global1,000,000limit is unchanged.
The final navigation rerun passes all53checks; the emitted parking/backdrop checks and six native
source/interpolation tests pass. Three new personal clubhouse reports were imported separately while
this work ran; they are not part of the terrain source changes.

## Southern road embankment (#1382)

`SOUTH_BANK` holds the11road controls and five10-point cross-sections from the same77-point LM export.
`src/southbank.js` interpolates the longitudinal crest and separate west/east section shapes; a4m half-width
crest and15m outer feather are interpolation assumptions. The original bridge deck datum−3 remains
a guess: ground samples do not measure deck elevation. A linear147..152tie-in preserves both existing
decks and their undersides, piers and rails; the first smooth tie-in reached0.78gradient and was rejected
as unwalkable. GC approach asphalt now samples the actual road/terrain support instead of a constant−3.
The crest continues along mapped road30633546 toward the plateau, with an assumed narrowing to6m and
fade262..286. LM point registration stays approximately3–5m; no floor/bathymetry claim. All ten plateau
controls, northern terrain, water, timber bridge and its lamp support stay outside this correction.

`tools/southbanktest.mjs` checks source values, continuous walkable crest, separate low banks, bounded
fades and unchanged deck/concrete/steel/water. `tools/farwalktest.html` adds four actual Player routes
for both directions over the road/GC southern connection. Public transfer has its own issue#99, after#98.

Final verification: native16/16, actual navigation57/57 (103.2s), backdrop69/69, river park after
local-server restart ALL PASS. Both bank sides, deck approach and overhead images were opened;
276actual GC-approach vertices differ by at most4.41µm from the road/terrain sampler plus25mm.
Terrain topology remains89490triangles; southern component33586≤40252. Desktop quality0 still
fails the known global triangle budget#1387:494draws/1042209triangles/~261MiB. Phone landscape
still fails the known call budget#1383:445draws/932900triangles/~97MiB. Both full checks exit1;
no global budgets changed. These are browser measurements, not FPS or physical-phone stability.
House A/B/C/L terrain lies north of the correction start147; their actual geometry is unchanged.


## Paddock track and field surface (#1420)

The worn-track quads and the one field identified by `PADDOCK.field` are split along
actual emitted terrain triangles before their existing70mm/48mm offsets are applied.
`renderedTerrainY.surfaceGrid()` exposes the already-built river cell subdivisions;
`cutAtTerrain` uses them only when explicitly requested. The older `grid()` remains
unchanged for roads, parking and other fields. Terrain samples, bank geometry, grass,
collision, pony behavior and every polygon footprint are unchanged. A/B/C/L building
geometry is unaffected; none has an equivalent paddock overlay.

This selectively reuses the projection principle already verified in public
`solwation/kvarteret-lunden@5cfecd3d5eab5a778529f63b19ec3b9d1698524f` (#105).
No further public transfer is needed: its neutral track/field fix is already present.
No public source tree, personal content, gameplay or Cloudflare integration was copied.


## Bus boarding apron (#1417)

The inferred asphalt between the unchanged OSM platform kerb and the bus bay is
merged into `south-land`. `busstopgeo.js::busStopApron` follows the nearest edge
of the three already emitted bus-bay road meshes, including their seam overlaps.
The asphalt outline between these mapped features is a visual assumption; the
broad eastern wedge (about6.48m) is not a surveyed bus-lane width. No road centre,
platform, shelter, terrain, height control, collision or bridge is moved.
Only88 local road triangles participate; identical winning-edge intervals merge
exactly (36polygons, about30ms native diagnostic), retaining every boundary switch.
The apron is projected through the actual `surfaceGrid` cells at the roads' existing
2.5cm lift. It adds344triangles and no draw calls/materials/textures.

Verification: native6/6; actual World before/current triangle multisets preserve
all previous southern geometry, terrain and complete platform/shelter exactly.
All344 new triangle centroids match the terrain lift within0.000001m; independent
terrain rays agree within0.000001m.396 apron rays and36 road-edge seam probes have
no holes; the unchanged road tessellation meets it with at most5.54mm height change.
Four real W-key routes pass both ways along the platform and across the apron.
Desktop's19standard poses pass438calls/996536triangles at quality0; phone results
are recorded in verification.md. The pre-existing terrain intrusions inside the
platform were unchanged by#1417 and are corrected separately in#1429 below.
A/B/C/L house equivalents: not applicable; this is the one mapped bus stop.
Neutral public transfer is queued separately as
[kvarteret-lunden#110](https://github.com/solwation/kvarteret-lunden/issues/110), low priority.

## Addressed southern low-rise windows (#1418)

`SITE.south.lowRiseWindows.sources` explicitly selects39 addressed main bodies
from the checked-in2026-10-08 OSM snapshot:13 Sankt Lars väg buildings,10 each
on Sävsländegatan/Nattsländegatan and6 on Hattsnäckegränden. `building=yes`
does not establish use or facade details. Seven unaddressed/uncertain bodies
remain blank; the seven generic landmarks and detailed Sankt Lars väg41 retain
all old glass. `src/southwindows.js` appends480 simple panes/960triangles to the
existing shared glass batch, after its unchanged old geometry. Longitudinal faces
parallel to the existing assumed ridge receive the existing guessed bay/window/
sill pattern; gables and short returns stay blank. This is a visual assumption,
not surveyed window positions. Footprints, holes, base/eave/roof heights, paths,
parking, terrain and materials remain unchanged. Houses A/B/C/L use separate
builders and are not affected by this south-only selection.
Neutral downstream transfer is queued separately in
[public#111](https://github.com/solwation/kvarteret-lunden/issues/111), priority low;
original#1418 remains open after source delivery until that transfer is verified.


## Bus platform follows the emitted terrain (#1429)

`busstop.js::busStopStripGeometry` partitions the unchanged platform and tactile
rectangles with `cutAtTerrain` on `ground.surfaceGrid()` (then `grid()` fallback).
Callers without a grid retain the original1m strips. The platform remains at4cm
and the tactile strip at4.4cm above the terrain: no raised lift or flattened ground.
The mapped kerb/bounds, width, kerb stones, shelter, furniture, glass, sign, collision,
walking support, terrain and#1417 boarding asphalt are unchanged. There is only one
mapped stop, with no A/B/C/L house equivalent. Neutral public port#113 is queued LOW.

Native9/9 includes folded/refined actual triangles, unchanged rectangle area/bounds,
upward normals, lift and legacy fallback. A fresh actual844×390 lowmem World on
b6472013 reproduces6.093cm grass intrusion before the change;462 independent actual
platform/terrain rays then give at least3.99993cm clearance. All48 paving and12tactile
triangle centroids preserve the exact lifts within0.000001m. Actual footprint areas
are76.446640m² and3.351879m² (float32 precision); original mapped bounds are retained.
Canonical old builder positions match the actual scene; its full CPU attributes
verify unchanged kerb/other meshes/materials, since phones release uploaded CPU arrays.
Four real W-key routes pass; mobile and wider1280×800 framings use the same phone
World, with render/readback together. Wider images are not a desktop profile.
The platform changes152→156triangles; the actual same-pose submission is56calls/
321186→56/321190. No batches/materials/textures are added. Its corrected interior
height slightly changes the3D culling bound, so zero calls at one pose is not a global
zero-call guarantee. The conductor approved a conservative bound of one additional
existing platform batch/156triangles against reviewed b6472013 full profiles:
desktop≤438/996940/~309MiB; landscape≤370/831317/~97; portrait≤291/722401/~101.
All remain within unchanged caps. These are composed bounds, not new full profiles.

## Ground loggia collision openings (#1430)

The existing12 `groundWaysIn` loggia intervals (four each in A/B/C, including
C's east-facing one) also cut `groundOutline`'s ground collision segments.
`segmentopenings.js` subtracts only collinear interval unions and retains source
cut coordinates exactly; the connection follows the existing walk-in entrance/
vestibule handling. Remaining parapets, retaining walls and five entrance mouths
are unchanged. There is no visual/measurement/floor change; the independent four
A/B north floor/support fixes belong to#1428. Hus L's separate patio paths do
not use this builder. Native/actual navigation checks are in verification.md.
Neutral downstream transfer is queued as
[public#114](https://github.com/solwation/kvarteret-lunden/issues/114), priority low;
original#1430 remains open after source delivery until that transfer is verified.
