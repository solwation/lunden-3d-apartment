# Site, streets and neighbours

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [architecture](architecture.md), [plants](plants.md), [plan-material](plan-material.md).
Neighbor openings (#516): `src/exterior.js` keeps all existing opening extents, floor placements, split panes/transoms and end-unit variations. All four street/courtyard storeys now have 6 cm outer jambs and 4.5 cm sash rails matching the existing L1007 window model; patio leaves use doors.js's 7 cm rails/10 cm bottom rail and shared chrome handle dimensions. Existing green ground/loft entrance leaves retain entryParts/entryHandleParts and gain outer jambs/hinges. Rubber seals and visible hardware join merged material batches. No neighbor interactions/interiors or collision changes. `tools/neighboropeningstest.html` checks every exposed pane against its original opening bounds, all eight face/storey combinations, shared reflection materials, night lighting and unchanged L1007 functions; `entrancedoortest` checks opaque static glazing separately from the real entrance's clear pane. [Validation](../validation/issue-516/README.md).

## Module and test map

```text
src/courtyard.js       the courtyard on the garage box (COURTYARD): walks, pergolas, grill, sandboxes, boule,
                       benches, raised beds, instanced shrubs; collision for what you can walk into. #438: every bench is a seat
                       (`targets`: invisible pick boxes with rest.js spots, `world.courtyardTargets`, kept with F; a spot a
                       people.js bench sitter is on is `taken`, and a sitter is away while you sit on its spot), the pergola tables
                       and the grill's side table are put-down surfaces (`surfaces` → world.cupSurfaces); the benches' / tables'
                       collision is `seats` (segments + footprints outside `fixedSegments`, so getting up works as for furniture)
                       #453: no bench within 1 m of a way in at the ground (surroundings.js `groundWaysIn`: the loggias' parapet
                       openings, the entrance recesses; resttest checks); Hus A's two north benches stand between loggia and entrance
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees, lit windows, cloudy sky
src/greet.js           greeting the people outside (GREET, #247): looking at one within `reach` (not through a house: boxes for
                       SITE.blocks + Hus L, the flat's walls via `behindWall`) the action is "Hälsa på grannen / barnet /
                       cyklisten"; a random line from you (bubble at the bottom), the answer a moment later in a bubble over
                       the head; speech = Web Speech API sv-SE (pitch/rate per person, children higher; silent when muted);
                       the person waves (people.js `answer`, `greetT`), a walker stops and turns to you; stats `greets`
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
                       racks; west of x −66 is left for #256's stair down to Karpvägen); #436: low concrete edges (`life.edges`, one
                       merged mesh, 5 cm, no collision) where the car park's asphalt meets grass and round the yard's lawns
src/people.js          people in the area (PEOPLE, #114): low-poly figures (one InstancedMesh per body part, a colour each; #239:
                       lathe-turned torso/arms/legs, knees (#243: thigh + shin, `kneeL/R`), hands and shoes ride the arm / shin; a rounded dog;
                       posed every frame): walkers to and fro on the paths (a dog with one), cyclists on Sankt Lars väg
                       (sfx.bell when they pass close); #521 reduces 19 figures to six adults: three walkers, one cyclist,
                       one bench sitter and one loft neighbour. No children, orphan ball or blanket; sandboxes remain. Daytime only
src/patio.js           patio: Rusta Verona lounge + slatted table (#408), cushion box, parasol, planters with exotic plants
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
src/carmodel.js        car bodies from a side profile (#250, MEGANE: `top` / `belt` / `bot` lines, wheel arches, plan rounding, a
                       shoulder, the glasshouse leaning in): `buildCar(spec, { doors })` — with doors: four hinged doors (lower
                       panel, black frame + glass, handle, mirror), the cabin (dashboard, OpenR screens, steering wheel on the
                       left, console, front seats, rear bench); without: a closed body as per-material geometries (`parts`);
                       `lite` (#251) = coarser (~5k triangles) for the parked cars (streetlife.js: paint / trim in vertex
                       colours / glass / tyres, instanced, a little variety in size)
src/car.js             our white Renault Megane E-Tech (CAR, #173; the model from carmodel.js, #250). #358: it lives in its stall (7) in the
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
tools/patiotest.html   headless test of the patio seasons (parasol, beers, snowman) + sofa collision; a cup on the cushion box's shut lid keeps it shut (#447)
tools/cartest.html     headless test: our parked car — open the driver's / passenger's door, the seat only then, sit inside looking
                       ahead, out by the door; the key shuts the doors first, then it drives off (#250); music (#268): seated, the
                       centre screen on / ⏭ / off, plays on outside (muffled with the doors shut), no target from outside, off as it leaves;
                       both routes keep the whole car on asphalt, clear of the bus stop and the stalls (#356); the garage's routes
                       (#358) too, in the garage clear of its parked cars and columns
tools/streetlighttest.html headless test (#434): the street lamps' ground pools hidden by day, lit at night (on the ground),
                       no flicker just under the switching level, out in the morning; #433: eight front-door lights, off by
                       day, lit after dusk, their pools outside the house
tools/terraintest.html headless test (#346): the courtyard = the reference level, S2's level differences kept, the ramp's
                       ends / the stairs' feet / the garage drive meet their ground, no ground rises past a retaining wall,
                       every plinth reaches the ground, no unguarded step > 5 cm in OUTDOOR (5 cm grid; a stair's riser
                       is a step, the inside of an Å-hus is skipped, #355); no tree on asphalt or paving (#435)
tools/streetsigntest.html headless test (#583): two meshes / one atlas, both faces of every blade, posts off asphalt and paths,
                       every number range exactly the sourced one (OSM addr:housenumber, Karpvägen 2–10 from #575), ≤ 2 draw calls
tools/greettest.html   headless test: "Hälsa på grannen" on the bench sitter, your line, the answer, the wave, counted, not through
                       Hus A, a walker stops and turns to you (#247)
```


## Sparse adults (#521)

`PEOPLE` contains three adult paths (street with dog, entrance walk and patio walk), one cyclist, one bench sitter near Hus A and one eastern loft neighbour. Sandbox children, ball players, the child walker and selected extra adults are absent from the instance buffers. Empty ball/blanket settings do not create their props. Playground meshes, seating and walkways remain unchanged. `tools/peopletest.html` checks population, buffers, animations, props and day/winter visibility; `greettest` verifies greetings still work for remaining neighbours.

Entrance bicycles (#529): removed SITE.life.bikes and the separate façade-bike loop in streetlife.js. Outdoor bicycles are generated only at the existing SITE.life.racks inside the paved bike yard NW of Hus L/north of Hus C, as on docs/peab/situationsplan.png and kalibrerad/situationsplan-300dpi.jpg. Those seven loose facade bikes had no collision segments, so removing them leaves no invisible obstacles. Existing rack collision remains confined to the yard. Basement cycle-room racks continue to exist; their wider layout corrections belong to #523. No relocation to invented coordinates. walktest checks entry and block routes; real views check the clear frontage and occupied yard.

The basement (#523) now includes the missing western CYKEL room and ordinary storage under C/B/A; no bikes among garage cars. Assumed stalls leave actual doorways clear, while our stall 18, car-pool spaces and routes stay in place. `surroundings.js` clips only the garage-facing A/B north skin at the same GARAGE door rectangles, leaving higher façades intact. See [plan comparison and limitations](../validation/issue-523/README.md).

Höje å crossings (#532): `src/sitegeo.js` registers OSM to the existing HepCat model centre using DAY.planNorth; `SITE.geo` stores the anchor. `src/riverbridge.js` builds separate road/40 m GC bridges and the sourced local river section in four merged material batches; `SITE.bridges` and `SITE.river` retain explicit vertical/structural assumptions. Ground geometry dips under the decks; ordinary ground queries return their surface, without extending OUTDOOR. Source-based tree exclusion keeps water clear; pavement clipping avoids floating road sidewalks across the GC gap. `tools/bridgetest.html` checks source registration, actual under-deck water and surfaces; [sources, before/after and limits](../validation/issue-532/README.md). Detailed shore paths/vegetation are #533.

Höje å park (#533): `riverpark.js` adds sourced main path lines, approximate aerial canopy patches/glade, woody understory and bank tussocks plus the small mapped western timber footbridge. The old random park rectangle is replaced; nearby Peab tree positions remain. `riverAt` interpolates widths/banks; `terrainGeometry` refines only the corridor with shared boundary heights. `renderedTerrainY` samples its emitted triangles for park paths/plant feet, avoiding hover over analytic curved banks. Main-bank paths follow terrain under bridge decks. Three extra merged batches, ordinary seasonal instanced crowns/trunks, no OUTDOOR expansion. `riverparktest` checks actual source coordinates, terrain contact, small crossing and seasons; [sources, assumptions and browser comparison](../validation/issue-533/README.md).

Western backdrop (#534): `SITE.west` + `sitebackdrop.js` add seven exact OSM polygons (Karpvägen 2–4/6–8/10, the opposite long building and three annexes), with explicit floor/height/roof/window assumptions. Four merged material batches; no interiors, roof access or OUTDOOR changes. Mapped far Karpvägen returns northwest; near road/garage/stairs retain their connection. Source service paths plus approximate aerial parking polygons avoid invented cars/stall counts. Western trees replace the random rectangle and exclude access/buildings; riverpark also excludes new footprints. `westbackdroptest` checks source geometry, actual outward glass/opaque rays, clear planting and garage level; [validation and limits](../validation/issue-534/README.md). Northern way 88457603 excluded for #530. Karpvägen 2–10 (#575): `karpfacade.js` + `SITE.west.karp` replace the generic body on the three Brf S:t Lars Park houses (Hus 1–3, `karp` per building): three brick storeys, recessed light top storey with dark metal end volumes at the park corners, stacked park-side (SW) balconies, stair strips with pale panels and canopies towards Karpvägen, flat black roofs. Own shared brick texture, #569's `neighborGlass()` passed in from surroundings, three extra batches (seven in the west). All sizes are image-read guesses; [sources and comparison](../validation/issue-575/README.md).

Eastern campus (#535): `SITE.east` and `sitebackdrop.js` replace nine illustrative blocks with sixteen mapped footprints, including Montessori wings and Realgym’s actual courtyard hole. HepCat’s detailed geometry stays. Shared brick texture, five exterior batches, sourced access/paths and approximate aerial avenues/groves using existing seasonal tree instances; unchanged OUTDOOR. All heights/floor counts/roof details remain assumptions. `eastbackdroptest` checks source geometry, actual outward windows, open courtyard and tree/access clearance. [Inventory, sources and browser comparison](../validation/issue-535/README.md). School facade across Sankt Lars väg (#564): `schoolfacade.js` and `SITE.school.mapped` keep the single exact polygon `88457612`, add a low footprint-following hip/standing-seam roof, shallow segmental lower arches, rectangular crowned upper windows, glazing bars, continuous jointed white corners, stepped/dentilled cornice, floor band and plinth. Two small shared school masonry/metal textures bring the east campus to seven batches (eight with #569 reflective school panes), below 22k triangles. Ground/rear window counts, profiles and roof dimensions remain photo-based assumptions; [photo analysis and verification](../validation/issue-564/README.md).

Hospital facades east of the site (#576–#581): `src/campusfacades.js` builds buildings whose `SITE.east` entry has `campus: {style, sections, chimneys, …}` from the named style in `SITE.east.facadeStyles`. The OSM polygon stays the outline; `sections` raise boxes of it (clipped to the polygon) to more storeys or a higher eave, and lower parts drop trim, windows and roof under them. Each part gets plinth, bands, cornice/dentils, convex-corner quoins, evenly spaced windows (`bay`, `margin`, per-floor `windows`) and a hip that follows its own outline (`footprintRoof`). Everything merges into the school's batches (schoolBrick now takes vertex tints, modern trim, reflective schoolGlass, schoolRoof): no new draw calls, lights or textures. Byggnad 4 and 9 (#576) use the `ward` style: one storey with white apron, piers and frieze, 4 with a two-storey block whose position is a guess. Photo sources and side identifications: `docs/references/east-campus/sources.json`; [validation](../validation/issue-576/README.md). Byggnad 8 (#578) uses `stenhammar` (the school's language: quoins with planar joints, dentil cornice, keystoned segmental and crowned straight windows), pavilions and centre raised 1.2 m over the wings and a `centre` pediment on the courtyard face; [validation](../validation/issue-578/README.md). Byggnad 88 (#580) uses `anshelm`: brick piers, broad white windows, white soffit and an `inward` roof — four sawtooths rising from the outer eave to reflective glazing over the still open court; the old light flat-roofed `modern` body is gone; [validation](../validation/issue-580/README.md). Byggnad 19 (#581, both OSM parts) uses `laundry`: plain brick, segmental windows under darker brick arches, dark string courses, paired top-floor windows; a three-storey block behind a two-storey front (section `roof` override for its low roof) and a one-storey annex. Since #581 plinths reach the lowest terrain point and a cut wall keeps windows on floors that clear the neighbouring roof; [validation](../validation/issue-581/README.md). Byggnad 2 and 7 (#577) reuse `stenhammar` with their own section boxes; [validation](../validation/issue-577/README.md). Byggnad 1 / Klockhuset (#579) uses `klockhuset` plus `campus.centre`: a risalit box (hides the walls/windows behind it) with pilasters, pediment, great round-arched window and `tower` (clock stage with four dials and hands, dark pyramid roof, open arched lantern, bell roof, gilded spire); no working clock; [validation](../validation/issue-579/README.md).

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md).

Garage/core regressions (#562): `garagetest` and `lifttest` verify the short touch label Öppna together with the exact basement/cage/portik interaction target identity, then retain actual opening/collision/walking checks.

Neighbor glazing (#569): ABC uses the listed `facadeOpenings` unchanged, layered white frame/sash trim and seals with three opaque reflective panes per opening; existing anthracite loggia/entrance glazing uses the same shared `neighborGlass()` material. Existing occupied-window light routines are retained in front of the main panes. Nearby school 88457612 reuses this material without changing historical trim or adding geometry. More distant atlas/backdrop houses retain their simpler rendering. One ABC seal batch and one school glass batch; no new environment textures, lights or reflection passes. [Measurements and comparison](../validation/issue-569/README.md).

Northern surroundings (#530): `SITE.north`/`sitebackdrop.js` add three missing exact footprints; seven western bodies from #534 and eastern campus bodies remain unique. Far Sankt Lars väg follows its mapped northwestern turn; sourced Källby/Alvägen paths, aerial pixel parking traces and seasonal avenue/grove trees complete the ground. Five exterior batches, shared textures, unchanged OUTDOOR. All untagged heights/roof/parking/tree details are assumptions; no old proposed buildings. `northbackdroptest` checks source polygons, actual outward window rays and no duplicates. [Registration controls, sources and before/after](../validation/issue-530/README.md).

Car regressions (#563): `cartest` checks the short Öppna/Sitt ner labels together with the exact front-door/seat target on each side, and excludes the seat target while its door is shut. Actual opening, seating, music, getting out and all four asphalt/garage routes remain checked.

Street name signs (#583): `streetsigns.js` + `SITE.streetSigns` put 11 posts / 23 blades at every junction of two differently named streets in the model (OSM junction nodes; by the block the Peab-based `SITE.roads`) and at Sankt Lars väg's NE bend and Karpvägen's bend into the park; campus service roads, paths and our drive get none. Names from the OSM snapshots; numbers only where sourced: Karpvägen 2–10 (#575), Sankt Lars väg 41–70 (every mapped address, all south of Höje å; the near stretch and the forks south of the river show the name only), Sävsländegatan/Nattsländegatan 2–20 and Hattsnäckegränden 2–12 (complete OSM sets). Look and sizes are *guess*. Two draw calls in every outdoor-facing view. [Sources, selection and before/after](../validation/issue-583/README.md).
