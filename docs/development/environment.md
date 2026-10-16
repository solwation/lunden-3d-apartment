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
src/patiodecor.js      #888: the neighbours' ground-floor patios on Hus L's back (PATIO_DECOR, every placement a *guess*; L1007 is
                       ours, in FURNITURE): reused patio models merged per material, no collision, an `isLOD` gate like the terraces.
                       Turned by +r (r 90 faces east, the opposite sense of TERRACE_DECOR); #1091: chairs face their table, sofas
                       have their backs to the façade. tools/patiodecortest.html checks the facing, door/passage clearance, budget
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees (leaf-card crowns, branching trunks: foliage.js, #679), lit windows, cloudy sky; #604: windows of Hus A–C are `lunden` and go dark in a power
                       cut (`update(hour, night, power)`), the rest of the site and the street lamps do not; world.windowLights passes
                       `power` on to the courtyard's bulbs / bollards and exterior.js's lanterns, lit glass and front-door lights
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
                       from boxwood.js; exterior.js merges ours and the neighbours into one mesh; original collision/snow kept
src/patio.js           patio: Rusta Verona lounge + slatted table (#408), cushion box, parasol, planters with exotic plants;
                       #690: `dynbox(item)` with `inside: 'bow'` builds the same box empty (no blanket / cushions) and exposes
                       `userData.box` (lid, size); FURNITURE's second dynbox stands at the foot of the NW stair by Hus C's NW
                       corner (SITE.terrain.west.stair, down to Karpvägen), its back against the retaining wall south of the
                       stair (x −70.82, z 11.55, `y` = the terrain there), holding the bow (src/bow.js). Which building the user
                       calls the church is not modelled by name (see #690); the box is placed by the stair itself
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
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

Höje å park (#533): `riverpark.js` adds sourced main path lines, approximate aerial canopy patches/glade, woody understory and bank tussocks plus the small mapped western timber footbridge. The old random park rectangle is replaced; nearby Peab tree positions remain. `riverAt` interpolates widths/banks; `terrainGeometry` refines only the corridor with shared boundary heights. `renderedTerrainY` samples its emitted triangles for park paths/plant feet, avoiding hover over analytic curved banks. Main-bank paths follow terrain under bridge decks. Three extra merged batches, ordinary seasonal instanced crowns/trunks, no OUTDOOR expansion. `riverparktest` checks actual source coordinates, terrain contact, small crossing and seasons; [sources, assumptions and browser comparison](../validation/issue-533/README.md).

Western backdrop (#534): `SITE.west` + `sitebackdrop.js` add seven exact OSM polygons (Karpvägen 2–4/6–8/10, the opposite long building and three annexes), with explicit floor/height/roof/window assumptions. Four merged material batches; no interiors, roof access or OUTDOOR changes. Mapped far Karpvägen returns northwest; near road/garage/stairs retain their connection. Source service paths plus approximate aerial parking polygons avoid invented cars/stall counts. Western trees replace the random rectangle and exclude access/buildings; riverpark also excludes new footprints. `westbackdroptest` checks source geometry, actual outward glass/opaque rays, clear planting and garage level; [validation and limits](../validation/issue-534/README.md). Northern way 88457603 excluded for #530. Karpvägen 2–10 (#575): `karpfacade.js` + `SITE.west.karp` replace the generic body on the three Brf S:t Lars Park houses (Hus 1–3, `karp` per building): three brick storeys, recessed light top storey with dark metal end volumes at the park corners, stacked park-side (SW) balconies, stair strips with pale panels and canopies towards Karpvägen, flat black roofs. Own shared brick texture, #569's `neighborGlass()` passed in from surroundings, three extra batches (seven in the west). All sizes are image-read guesses; [sources and comparison](../validation/issue-575/README.md).

Eastern campus (#535): `SITE.east` and `sitebackdrop.js` replace nine illustrative blocks with sixteen mapped footprints, including Montessori wings and Realgym’s actual courtyard hole. HepCat’s detailed geometry stays. Shared brick texture, five exterior batches, sourced access/paths and approximate aerial avenues/groves using existing seasonal tree instances; unchanged OUTDOOR. All heights/floor counts/roof details remain assumptions. `eastbackdroptest` checks source geometry, actual outward windows, open courtyard and tree/access clearance. [Inventory, sources and browser comparison](../validation/issue-535/README.md). School facade across Sankt Lars väg (#564): `schoolfacade.js` and `SITE.school.mapped` keep the single exact polygon `88457612`, add a low footprint-following hip/standing-seam roof, shallow segmental lower arches, rectangular crowned upper windows, glazing bars, continuous jointed white corners, stepped/dentilled cornice, floor band and plinth. Two small shared school masonry/metal textures bring the east campus to seven batches (eight with #569 reflective school panes), below 22k triangles. Ground/rear window counts, profiles and roof dimensions remain photo-based assumptions; [photo analysis and verification](../validation/issue-564/README.md).

Hospital facades east of the site (#576–#581): `src/campusfacades.js` builds buildings whose `SITE.east` entry has `campus: {style, sections, chimneys, …}` from the named style in `SITE.east.facadeStyles`. The OSM polygon stays the outline; `sections` raise boxes of it (clipped to the polygon) to more storeys or a higher eave, and lower parts drop trim, windows and roof under them. Each part gets plinth, bands, cornice/dentils, convex-corner quoins, evenly spaced windows (`bay`, `margin`, per-floor `windows`) and a hip that follows its own outline (`footprintRoof`). Everything merges into the school's batches (schoolBrick now takes vertex tints, modern trim, reflective schoolGlass, schoolRoof): no new draw calls, lights or textures. Byggnad 4 and 9 (#576) use the `ward` style: one storey with white apron, piers and frieze, 4 with a two-storey block whose position is a guess. Photo sources and side identifications: `docs/references/east-campus/sources.json`; [validation](../validation/issue-576/README.md). Byggnad 8 (#578) uses `stenhammar` (the school's language: quoins with planar joints, dentil cornice, keystoned segmental and crowned straight windows), pavilions and centre raised 1.2 m over the wings and a `centre` pediment on the courtyard face; [validation](../validation/issue-578/README.md). Byggnad 88 (#580) uses `anshelm`: brick piers, broad white windows, white soffit and an `inward` roof — four sawtooths rising from the outer eave to reflective glazing over the still open court; the old light flat-roofed `modern` body is gone; [validation](../validation/issue-580/README.md). Byggnad 19 (#581, both OSM parts) uses `laundry`: plain brick, segmental windows under darker brick arches, dark string courses, paired top-floor windows; a three-storey block behind a two-storey front (section `roof` override for its low roof) and a one-storey annex. Since #581 plinths reach the lowest terrain point and a cut wall keeps windows on floors that clear the neighbouring roof; [validation](../validation/issue-581/README.md). Byggnad 2 and 7 (#577) reuse `stenhammar` with their own section boxes; [validation](../validation/issue-577/README.md). Byggnad 1 / Klockhuset (#579) uses `klockhuset` plus `campus.centre`: a risalit box (hides the walls/windows behind it) with pilasters, pediment, great round-arched window and `tower` (clock stage with four dials and hands, dark pyramid roof, open arched lantern, bell roof, gilded spire); working four-face clock (#1067), synchronized to the kitchen clock through the existing day.hour/windowLights update; [validation](../validation/issue-579/README.md). On phones (`lowMemory`, #589) both builders take a `lite` level from `CAMPUS_LOD`: fewer profiles, dentils, joints and glazing bars, coarser roofs, same shapes and windows; [validation](../validation/issue-589/README.md).

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md).

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
