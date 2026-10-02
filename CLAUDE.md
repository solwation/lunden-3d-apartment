# CLAUDE.md — lunden-3d-apartment

Browser-based first-person 3D walkthrough of apartment **L1007, Kv. Lunden** (Peab), built from
the dimensioned floor plan `L1007_mattsatt_planritning.pdf`. The user writes in Swedish — reply
in Swedish. Code, comments and this file are in English; UI text is Swedish.

## Workflow rules

- **No branches, no PRs.** Commit and push directly to `main`.
- **Basic function first.** Work that isn't needed right now goes into a GitHub issue
  (`gh issue create`) instead of being done on the side. Keep issues small and concrete;
  reference the issue number in the commit that resolves it (`Fixes #N`).
- **Several agents work in parallel (other computers push to `main` too).** Never take an issue that
  is labelled `in-progress` (`gh issue list --state open --json number,title,labels`). Before starting
  **each** new issue: `git pull --rebase origin main`, then `git status` must be clean and
  `git reset --hard origin/main` if it is not (nothing of value should be uncommitted between issues);
  re-check the issue's label right before labelling it. Work on one issue at a time until done.
- **Label issues `in-progress` when you start on them** (`gh issue edit N --add-label
  in-progress`). The label must never outlive the work: **remove it** (`--remove-label
  in-progress`) when you stop without finishing, when you close the issue after implementing it
  (`Fixes #N` closes it, but does not remove the label — do that too), and when you **reopen** an
  issue. A reopened issue starts without the label until someone picks it up again.
- **Reference images** (screenshots, product photos, Peab renders) that the user sends in with a
  request are always committed to `docs/` (descriptive file names, e.g. `docs/sekretar-bang-oppen.png`)
  and linked from the issue as `https://github.com/solwation/lunden-3d-apartment/blob/main/docs/<file>`,
  so the agent working on the issue sees them. Push the images before creating the issue.
- Verify changes in a real browser before pushing (see *Testing*). Don't claim something
  works from reading the code alone.
- **Every user-visible change gets an entry in `data/changelog.json`** (Swedish, newest first,
  next `id`), in the same commit — **one short sentence**, no digressions. It is shown only on the
  note on the freezer (the start screen says nothing about news; visitors find the note themselves);
  entries newer than the visitor's last visit are marked "Nytt".
- Keep this file and `README.md` up to date when behaviour, structure or known facts change.

## Architecture

Static site, no build step for development, no npm. Every push to `main` deploys to
https://solwation.github.io/lunden-3d-apartment/ (public repo) via
`.github/workflows/pages.yml`, which runs `tools/stamp.sh`: it copies the site to `_site`,
writes the commit SHA into `src/version.js` (`BUILD`) and `version.json`, and appends
`?v=SHA` to module imports / `data/plan.json` so a reload never mixes cached old modules.
The page polls `version.json` every minute and shows a "new version" notice (top centre)
when it differs from `BUILD`. Its buttons react to a lifted touch as well as a click (`onTap`,
#41), and "Ladda om" navigates to `?v=<new SHA>` so no cache serves the old page
(`tools/updatetest.html`). That button stores a one-time record (`src/resume.js`: position, level, view,
clock; sessionStorage + localStorage, < 2 min) which the next load reads, deletes and resumes from (not
with `?at=`; a spot inside a wall falls back to START); F5 finds none and starts at START. The start screen
says "Du fortsätter där du var" with "Börja från start", and always offers "Gå till startplatsen"
(`tools/reloadtest.html`). Locally `BUILD = 'dev'` and no checks run. Keep imports
between `src/` files in the form `from './x.js'` on one line so the stamp regex finds them.
Use relative paths only.

```
index.html             page shell, HUD, start overlay, import map (three from jsDelivr, pinned)
src/config.js          everything NOT in the PDF: heights, soffits, stair layout, colours
src/world.js           builds meshes + per-level collision segments from data/plan.json
src/stairs.js          stair treads + walking height function (stairHeight)
src/doors.js           SwingDoor / SlidingDoor (E to open/close, animated, dynamic collision)
src/exterior.js        Hus L (HUS_L): brick row with the core/portik, neighbours' patios, rendered upper
                       units with pilasters, loftgång, spiral-stair drums, roof with solar panels
src/player.js          WASD/arrow/joystick movement, circle-vs-segment collision, step-up, gravity
src/touch.js           on-screen joystick (left) + drag-to-look (right), multi-touch pointer events
src/main.js            renderer, lights, input modes, door raycast prompt/button, loop (step)
src/version.js         BUILD stamp + polling for a newer published version
src/cat.js             the cat: random coat, washing animation, appears/moves/vanishes behind doors
src/furniture.js       loose furniture from FURNITURE in config (IKEA LANDSKRONA sofa/armchair …)
src/interior.js        fitted kitchen, laundry, bathroom fittings, tiled floors/walls (FINISH, KITCHEN,
                       TILED_ROOMS in config); merged into one mesh per material
docs/                  reference images in git (site map screenshot; docs/peab/ = pages of Peab's plan
                       brochure: situation plan, overview plans per floor, unit plans, aerial render)
material/              screenshots of our choices in Peab's option portal (local, see below)
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps
src/toilet.js          toilet (Ifö Spira 6260) with an animated lid
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO)
src/courtyard.js       the courtyard on the garage box (COURTYARD): walks, pergolas, grill, sandboxes, boule,
                       benches, raised beds, instanced shrubs; collision for what you can walk into
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees, lit windows, cloudy sky
src/lights.js          room switches (E), ceiling lamps/pendant/spots/LED, floor lamp; a pool of 4
                       point lights follows the nearest lit lamps on the visitor's level
src/daycycle.js        60-minute day: real solar path for the month (55.7° N), sun → moon light, shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock
src/patio.js           patio: Plantagen Oslo corner lounge set, parasol, planters with exotic plants
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
src/wallclock.js       analog kitchen clock (WALL_CLOCK) + the control strip: spool A D / ← →, pause
src/rooms.js           room detection: walls + door gaps rasterised, BFS from the room labels
src/minimap.js         plan view with the visitor's arrow, current room highlighted; hidden, shown with the
                       stats (Tab / T / 📊, #85), K shows it alone
src/measure.js         tape measure (Q / 📏): two points on any surface, distance label
src/cabinets.js        wall cabinets with side-hung doors that open with E (kind 'cabinet', in world.lids), e.g. the
                       Tvätt wall cabinet over the worktop (LAUNDRY_CABINET, #138)
src/ovens.js           oven (drop-down door) + microwave (side door) in the tall unit, E opens (world.lids)
src/coffee.js          Moccamaster on the worktop (MOCCAMASTER): E brews (red light, sound, the jug fills)
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/rest.js            sitting / lying down (REST): seat & bed spots from furniture userData.rest, look clamp
src/holdable.js        things you take and hold (one at a time): home + pick box, held pose in camera space,
                       use = click / touch button / fast look; E on the home puts it back, E on a table top /
                       worktop / the floor (HOLD.reach) puts it down (`placeAt`, lying by its shape — `restPose`;
                       cups stand). While something is held other things are `blocked` ("Lägg ifrån dig …")
src/book.js            the book on the side table by the armchair (BOOK, #140), a Holdable: click / "Läs" opens
                       #book-panel (a spread; A D / ← → / click turn pages, E / Esc close; reading mode)
src/saber.js           the lightsaber in Sovrum 2 (SABER), a Holdable; the blade burns marks where it cuts in (#96)
src/target.js          the Nerf target on the lawn behind the hedge (TARGET, #99): rings × distance bonus, "+N" badge,
                       a score board beside it (localStorage 'lunden.target'), E clears it
src/marks.js           marks on surfaces (MARKS, #96): `hit(from, to)` = first surface on a segment (glass, doors, lids
                       → none; the cat → meow), `add(kind, hit)` / `burn(hit)`; one ring buffer, an InstancedMesh per
                       kind (burn, glow, star, butterfly, splash) with a per-instance fade, a Points puff of smoke;
                       `magic(hit, eye)` = the wands' stars + fluttering butterflies (#97); darts splash paint (#98)
src/trigrid.js         world-space triangle grid per big static mesh, so short segment hits skip three's full raycast
src/remote.js          the TV remote on the coffee table (REMOTE), a Holdable: click = next programme (on if off),
                       right click / ⏻ (touch) = power, on the TV in the look direction (not through walls)
src/toys.js            Nerf blasters + darts (Sovrum 2), magic wands + sparkles (Sovrum 3), the flashlight
                       (hall wardrobe; one always-present SpotLight), all Holdables (TOYS)
src/cups.js            coffee cups (CUPS): the wall cabinet over the Moccamaster opens; a cup is taken straight into the
                       hand (empty, brewed or not, #141), put down on a table / worktop / floor, back in the open cabinet
                       with E on it; the jug is a Holdable (Jug): E on a standing cup pours, E on the hot plate puts it back
src/drawing.js         crayon drawing on the paper on the Sovrum 3 desk (DRAWING): canvas texture, drawing mode
                       (view down, pointer free, palette #draw-panel, 1–9, E/Esc back), saved in localStorage
src/calendar.js        the cat calendar (CALENDAR): a cat per month, the days, the chosen date; #cal-panel picks it
src/fridge.js          the fridge: hollow, lit, opens with E, smoking roast chicken (in world.lids)
src/catboard.js        cork board in the kitchen (under the wall clock): a photo (offscreen render) of every petted cat,
                       newest 10 in IndexedDB 'lunden'/'catPhotos', captioned with name + time
src/shelves.js         kitchen wall shelves with portraits, flowers, books, candles (WALL_SHELVES)
src/keycabinet.js      hall wall: IKEA LINDBYN mirror Ø 110 + Solstickan key cabinet (E) with the Renault key (E → beep beep);
                       the cabinet is in world.lids, the key (world.carKey) a target only while it is open
src/sillplants.js      flower pots on every inner window board (SILL_PLANTS, #136): five merged meshes, a loose item
src/signs.js           hand-lettered name signs on the bedroom doors (DOOR_SIGNS)
src/water.js           running water: E on a tap/shower (world.taps from interior.js) → stream + hiss
src/stats.js           visitor statistics (localStorage), "+1" badges per event, the HUD panel
                       (hidden; Tab held / T / 📊 shows it)
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
src/changelog.js       changelog list + the note on the freezer (E to read)
src/install.js         iPhone "add to home screen" sheet (no fullscreen API there); install link
                       where the browser offers beforeinstallprompt
manifest.webmanifest   web app manifest; icons/ = icon.svg rendered to PNG (192, 512, apple-touch 180)
data/plan.json         GENERATED — do not edit by hand
data/changelog.json    what changed, for visitors (see Workflow rules)
tools/extract_plan.py  PDF → data/plan.json (stdlib only)
tools/walktest.html    headless movement test
tools/touchtest.html   headless touch-input test (synthetic pointer events)
tools/cattest.html     headless test of cat placement behind every door/wardrobe
tools/roomtest.html    headless test of room detection at known points (+ a picture of the fill)
tools/measuretest.html headless test of the tape measure (wall to wall in the living room)
tools/watertest.html   headless test: aim at every tap/shower, turn it on and off
tools/lighttest.html   headless test: aim at every light switch / floor lamp, toggle it
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter)
tools/notetest.html    headless test of the changelog note ("Nytt", read/close, no walking)
tools/patiotest.html   headless test of the patio seasons (parasol, beers, snowman) + sofa collision
tools/keytest.html     headless test of the hall key cabinet: open, car key reachable only then, beep
tools/esctest.html     headless test of Esc on the start screen (click-to-start cover, ignored over the note)
tools/updatetest.html  headless test of the update notice on a phone-sized touch screen (on top, 44 px, touch works)
tools/perfcount.html   draw calls / triangles at a few spots (compare before/after optimising)
tools/oventest.html    headless test: oven + microwave open/close (lamp inside), Moccamaster brews and clicks off
tools/tvtest.html      headless test: TVs on/off (living room + Sovrum 3), new programme each time, the remote, F off
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record
tools/resttest.html    headless test: sit on every seat and lie in every bed (spot, no walking, up again)
tools/pctest.html      headless test: switch the gaming PC on/off (game moves, RGB cycles), the chair is a seat and
                       starts the PC, the bunk seat swings the monitor round (film)
tools/sabertest.html   headless test: take the lightsaber, swing it, hang it back
tools/toystest.html    headless test: blaster (dart lands), wand (sparkles), flashlight (beam follows the view)
tools/wandtest.html    headless test: a wand's magic on the wall (stars + butterflies), none in the sky, gone after a while
tools/nerftest.html    headless test: a dart leaves a paint splash in the blaster's colour on the wall, drops, fades
tools/targettest.html  headless test: target points (rings × distance bonus), a dart in the bullseye, E clears the score
tools/mirrortest.html  headless test: in front of every mirror its Reflector is the active one, on the glass (#139)
tools/booktest.html    headless test: take the book, read, turn pages, close, put it down, back on the side table
tools/bestatest.html   headless test: the BESTÅ display cabinet's six doors open/close, its spots light with the room
tools/holdtest.html    headless test: put things down (coffee table, dining table, floor), one at a time, F → home
tools/cuptest.html     headless test: an empty cup out without brewing, onto the worktop, brew, take the jug, pour, jug back,
                       carry the cup to the dining and coffee tables, a cup back into the cabinet
tools/drawtest.html    headless test: drawing mode, a crayon line from pointer events, clear, E back, saved
tools/clocktest.html   headless test of the wall clock (?time=7, spool, pause, sun height by month)
tools/calendartest.html headless test: today's date at the start, pick a date on the calendar, the sun follows
tools/stamp.sh         build the published site with a version stamp (used by CI)
```

### Geometry pipeline

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

### Known facts about the apartment (from the PDF + the user)

- Two levels, 5.75 × 12.70 m outside, 63 m² boarea. Row house; side walls are party walls.
- Ceiling height: **Entréplan ~3.0 m**, **Övre plan ~2.8 m**. Peab's fact sheet ("bofakta",
  linked from the project page) gives RH 2.5 m over Tvätt/Badrum and in WC/dusch.
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
  upstairs, the escape spiral stair right against the house (`HUS_L.endUnitNorthHidden`, towers). Våning 3–4: L1201–L1209 on the same 5.75 m grid (L1208 above us, L1205 over the
  core), white render with brick pilasters, entered from the loftgång on våning 3; spiral stairs in
  brick drums at both ends; flat roof with solar panels.
- Site (`SITE`): measured on the situation/overview plans (1:500, Hus L horizontal = our axes, metres
  from our NW corner). Hus A (x −10…9.5, z 30…54, våning −1…4), B (x −43…−24, z 34…59, −1…3),
  C (x −73…−53, z 12.5…37.5, 1…5), brick with low hip roofs; the courtyard is on a garage and the
  ground drops ~3 m south of it.
  Terrain (#79, `SITE.terrain`, `groundY(x, z)` in surroundings.js): the street north of Hus L, our Entréplan
  and the raised courtyard on the garage box (`terrain.box`, edges traced on the situation plan — guess)
  are y 0; around the box the ground is one storey lower (`park` −3, Å-husen A/B suterräng); retaining
  walls with a railing where the box meets it, the garage door in its west face at Karpvägen by Hus C,
  the roads outside the box go down over `slope` m south of Hus L (guess).
  Courtyard (#80, `COURTYARD`, traced on the situation plan + info brochure p. 16): the Borggården between
  Hus L, C and A with stone walks, gravel, the pergola with a dining table, a grill, a sandbox, a boule
  court (not on the plan: guess), benches and tree squares; south of Hus C a second pergola, a sandbox and
  odlingslådor; the trees between A and B on the lower green. Walkable behind Hus L up to the main walk
  (`OUTDOOR` x −46…, z ≤ 29.5). **True north**: FOJAB's arrow puts it 58° left of plan-up, so the
  plan's "north" (entrance) faces ENE (bearing 58°, `DAY.planNorth`) and the patio WSW. The schools,
  HepCat and the villa outside the plot are placed from the Google Maps screenshot and drawn in the old
  S:t Lars style (#47, `style: 'old'`: brick, white cornice and string courses, tall arched windows,
  steep dark hip roofs, 3.6 m storeys) after the drone photo/render — storey counts are guesses.
- Skärmvägg by the patio H 1.8 m, stair railing H 1.1 m (bofakta).
- U-shaped stair with winders at the east end: flight A (Entréplan, going east), 180° winders,
  flight B (going west) arriving in the upstairs hall. Upstairs slab opening = stair outline on
  Övre plan.
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
  ljusgrön, back to the window, chaise in the SE corner; matching armchair + footstool in
  the NW corner with a floor lamp (IKEA NYMÅNE, 3 spots aimed at the seat, on the sitter's right, #56)
  and a side table with a small flower. Dimensions in
  `LANDSKRONA` (config) — the chaise/armchair/footstool numbers are series estimates. In front
  of the sofa: coffee table ILVA Woodstock, oiled oak veneer top, 120 × 60 × 47 cm, with a shelf.
  Under both: a 300 × 200 cm light rug (#55, no collision).
  Opposite the sofa (the wall with the stair behind it): IKEA BYÅS TV bench 160 × 42 × 45, high-gloss
  white (#67), east of the living-room door, with the TV on it (#68: Philips 55", E toggles; an animated
  canvas picture ~12 fps + an additive Ambilight glow; furniture E targets are `world.furnitureTargets`).
- Patio (user's wish): Plantagen Hörngrupp Oslo antracit (corner sofa 198 + 186 × 72 × 76, table
  120 × 60 × 40) with its back to the hedge and the east screen wall, a parasol (up Apr–Sep while
  the sun is up), two big planters (palm by the patio door, agave in the SE corner; the banana that blocked the
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
- Who sleeps where (the user's plan; "left/right" as you arrive upstairs walking west):
  Sovrum 1 (first right) Sarah & Ofluf, double bed IKEA IDANÄS 180 × 200 (`IDANAS`, #91), a NORDLI chest of
  drawers in its Klk (no wardrobe in Sovrum 1; the Klk is 1.65 × 1.20 inside, #94) (a sage green IKEA chintz bedding set from a Sellpy ad, #83) with IKEA NORDKISA bedside tables (#64) and white NYMÅNE work
  lamps on them (#65, each its own lamp like the floor lamp) + an IKEA RÅGRUND towel-rack chair in the corner left of
  the window (#60) · Sovrum 3 (second right) Livia & Tuva, bunk (unicorn sheets), an IKEA ALEX desk under the window
  with crafts and a kids' chair (#92) ·
  Sovrum 2 (first left) Walter & Kian, bunk (Darth Vader sheets), a gaming desk with a PC along the west wall, short end to the window (#77, #84): sitting in its chair starts the
  PC; a sit spot in the lower bunk (`watch`, a spot `kind` can differ from its piece) swings the monitor arm round and plays a film;
  a lightsaber on hooks on the west wall north of the desk (#78) · Sovrum 4 (second left, ex Allrum) Tilly, IKEA HEMNES
  daybed with pink cushions. Bunks: long side to the side wall, head end to the façade. Name signs: `DOOR_SIGNS` → `src/signs.js` (hall side of the door).
- Hall (#49): the plan's "EL" cabinet is really the small EL/C (40 cm, `CABINET_FIXES`) plus the coat
  rack "KL" beside it, which the extractor merged; on that wall (right as you come in) a coat rack with
  jackets and a shoe rack (FURNITURE `coatrack`/`shoerack`). The mirror is centred on the left wall; the key cabinet hangs centred on the narrow wall right of the entrance door, above the switch, clear of the mirror (#123, #135).
- Dining set (user's choice, #62/#57/#63): IKEA SKANSNÄS table and 4 chairs, brown beech (`SKANSNAS`, one
  frame colour for both; light woven paper-cord seats): the table rectangular 150 × 90 (closed; 205
  extended is not modelled), short end to the kitchen window; 2 + 2 chairs on the long sides, pushed
  in under the top. The user finds the kitchen cramped easily — keep it airy. F (#75) shows the bare flat: `world.looseItems` (furniture, kitchen shelves, the hall
  mirror/key cabinet/coat rack, door signs, the Moccamaster, the cat board) are hidden, their collision
  segments go, the cat leaves and none turns up, hidden things are no E target and give no light.
  Kept: Peab's kitchen and wet rooms (incl. bathroom mirrors), wardrobes, doors, stair, ceiling lamps,
  switches, the wall clock, the note on the freezer. Plants by a wall get `walls: { x0, x1, z0, z1 }` on their FURNITURE item (`keepInside` in furniture.js squeezes
  leaves short of those lines, #137). New loose things must join `world.looseItems`
  and be kept out of `mergeStatic`. Keep the Sovrum 1 bed clear of the Klk sliding door — the cat test needs floor there.
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

## Running locally

ES modules + `fetch` need HTTP (not `file://`):

```
python3 -m http.server 8137    # in the repo root → http://localhost:8137/
```

URL parameters (debugging / screenshots):

- `?at=x,z,yawDeg[,pitchDeg[,feetY]]` — place the camera. yaw 0 = north (−z), 90 = west,
  180 = south, −90 = east. `feetY` = 3.25 for Övre plan.
- `&shot` — hide the start overlay.
- `&open` — open every door (screenshots of open doors / wardrobes).
- `&cat=x,z[,yawDeg[,y]]` — show the cat there; `&catv=i` coat variant, `&catt=s` animation time.
- `&time=HH[.h]` — start at that hour (default: the browser's time), `&month=1–12`, `&day=1–31` (default: today), `&freeze` pauses the clock,
  `&clock` opens the wall clock's strip,
  `&lights` turns every lamp on (they also start on when arriving in the dark).
- `&water` — turn on every tap and shower. `&tv` — switch the TV on.
- `&phone` — the short touch-only start screen. `&install` — show the iPhone install sheet. `&note` — open the changelog note. `&pet` (with `&cat=`) — the cat is being petted.
- `&clip=y` — clip everything above height y (cut-away plan view, e.g.
  `?shot&at=2.87,6.35,0,-90,16&clip=2.5` for Entréplan from above, `clip=5.6` + feet 19 for Övre plan).

## Testing

Headless Chrome with SwiftShader works on this machine:

```
# screenshot
google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 --virtual-time-budget=8000 --screenshot=/path/out.png \
  "http://localhost:8137/?shot&at=1.0,11.8,-40,0"

# movement/collision/stair test — prints PASS/FAIL per route
google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=60000 --dump-dom http://localhost:8137/tools/walktest.html

# touch input (joystick + look + start button) — prints PASS/FAIL
google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=30000 --dump-dom http://localhost:8137/tools/touchtest.html
```

To test the update notice locally: `tools/stamp.sh /tmp/site abc1234`, edit
`/tmp/site/version.json` to another version, serve `/tmp/site` and load it.

Run the walk test after any change to walls, doors, stairs or player movement, and the touch
test after input changes. Headless SwiftShader renders only a few frames per second, so tests
drive `window.__app.step(dt)` / `Player.update` directly instead of waiting on frames. Take
screenshots into the session scratchpad, not the repo.

## Cat and sound

- Opening an interior door/wardrobe: 30 % chance a cat appears on the far side (random free
  floor spot visible from the doorway, or inside the wardrobe). Close + reopen that door:
  50 % it's gone, else it moved. A cat appearing from nowhere gets a new random coat.
- Breeds (`BREEDS` in cat.js) have a weight and a shape (size, fluff, ears, muzzle, tail); perser
  and sphynx are `rare` and count as "ovanliga katter". `&catb=i` picks a breed for screenshots.
  Rare breeds have a `voice` ('trill' perser, 'rasp' sphynx) passed to `sfx.meow`/`sfx.purr`, and
  stars (one additive `Points`, raycast disabled) rise around them while they are petted.
- Look at a visible cat + E pets it: purring (`sfx.purr`), eyes shut, head rubs the visitor's hand
  (`PET_TIME` in cat.js). Raycasts ignore visibility, so main.js only adds the cat as a target
  while it is visible. Tests must call `updateMatrixWorld` on objects they move (no render runs).
- Room detection: labels come from the PDF plus `EXTRA_ROOMS` (WC/dusch upstairs, the passage by
  the stair = Hall); `ROOM_DIVIDERS` split open-plan areas (hall | kitchen | passage | living room).
- Every new cat gets a name (`CAT_NAMES`); petting it puts a photo on the kitchen board 0.7 s in
  (`CAT_BOARD` in config: under the wall clock on the Tvätt/Badrum wall, kitchen face).
- Interaction raycasts only test pickables, so `behindWall` in main.js rejects hits whose eye →
  hit line crosses a wall outline (`levels[i].wallSegments`) — no switching lamps through walls.
- Lights: switches are placed automatically by the latch side of each interior swing door (room
  side), snapped onto a wall outline segment that faces the room and covers the whole plate (`wallFace`,
  #76; lighttest checks every switch has a wall right behind it) plus `LIGHTING.manual` for open rooms and the downstairs Klk (door spans the whole wall).
  Lamp emissive parts use one material per room (`lampMaterials` in interior.js). Never add
  per-lamp PointLights — reuse the pool (constant light count = no shader recompiles).
- Day cycle: `DAY` in config. Every visit starts at the browser's own time and date (#95; `&time` /
  `&month` / `&day` override, `&month` alone = the 15th); the date rolls over at midnight. The sun
  position is computed (declination, hour angle, equation of time, CEST in summer) for Lund and
  rotated into plan axes by `DAY.planNorth`. The wall clock in the kitchen (centred on the wall between the hall and the Badrum door, over the cat board + calendar) opens a strip at the bottom
  (`reading` mode, so no walking, but looking works): hold A D / ← → / ⏪ ⏩ to spool, Space / ⏸ pause. The
  date is picked on the cat calendar beside the cat board (`src/calendar.js`, `CALENDAR`): E opens
  #cal-panel, A D / ← → / ◀ ▶ months, W S / ↑ ↓ days (held keys repeat; a key already held while walking up is ignored), or click a day. The neighbours' windows are one instanced additive mesh with a
  random evening/morning routine per window (`buildWindowLights` in surroundings.js).
- Seasons (#73, `SEASON` + `src/seasons.js`): crowns get a colour per month (fresh, deep green, mixed autumn
  per tree, bare in Dec–Feb; some blossom in Apr–May) and in `SEASON.snowMonths` registered materials
  (`registerSnow`: lawn, park, roads, paving, hedges, roofs) turn white. Only colours/instance matrices
  change, once per month change (`applySeason` in the loop).
- Statistics (`src/stats.js`): cats found per coat, cats petted, doors, toilet lids, steps/metres,
  stair trips, time inside; reset on the start screen.
- Sounds are synthesised (no audio files) and positional; the AudioContext is started by the
  start-screen buttons (browser autoplay rules). M / the speaker button mutes.

## Input notes

- A visit starts outside, ~12 m in front of the entrance façade facing the house (`START` in config);
  the walkable outdoor area is `OUTDOOR`: in front of Hus L and behind it (our patio, out through the
  gap in the hedge to the lawn up to `z1`), each closed off by the façade line beside our unit; the
  neighbours' screen walls and hedges collide (`exterior.userData.segments`). walktest walks from `START` in through the front door.

- Start screen has two buttons: *Mus & tangentbord* (pointer lock) and *Touch* (joystick).
  A Surface has both, so the visitor chooses. Touch-only devices (`(pointer: coarse) and
  (hover: none)` → `body.phone`, set by an inline script in index.html) get a short start screen:
  no key list, one *Börja* button (= Touch). `&phone` forces it for screenshots.
- Esc on the start screen = *Mus & tangentbord*. Browsers don't treat Esc as a user activation, so
  it can't call requestPointerLock/start audio: it hides the start screen and shows `#arm` ("Klicka
  för att börja"); that click runs the same `startMouse()`. Ignored for 0.7 s after Esc frees the
  mouse and while the install sheet, note, board or rotate overlay is up (`tools/esctest.html`).
- App name everywhere (title, manifest name/short_name, apple-mobile-web-app-title): "Kv. Lunden L1007".
- iPhone (Safari/Chrome) can't go fullscreen, and the browser bars shifted the tap targets of the
  bottom-right buttons; `src/install.js` asks to add the page to the home screen first (skippable
  per session). The page uses `viewport-fit=cover` with `--sl/--sr/--st/--sb` safe-area insets on
  every HUD element, and `body` is `position: fixed` so iOS never scrolls/zooms it.
- Phones/tablets: the Touch button goes fullscreen and calls `screen.orientation.lock('landscape')`
  (Android); in portrait with a coarse pointer (≤ 1100 px wide) a "rotate" overlay covers the page
  (iOS can't lock). Headless Chrome doesn't emulate `pointer: coarse` — test the overlay by hand.
- Sprint (#43): Shift, or the touch stick pushed past `PLAYER.sprintStick`, runs at `PLAYER.run` —
  outdoors only (`player.outdoors` = outside the flat's footprint); inside it is walking pace. The
  stick's knob turns green while sprinting; footsteps use a longer stride. Moves are sub-stepped (5 cm).
- Crouch (#70): hold Ctrl (or the 🧎 toggle on touch) → eye `PLAYER.crouchEye` 0.95 m at `crouchSpeed` (50 %),
  no sprint; you only stand up again where there is head room (`roomToStand`: not under the stair's
  upper flight). Released on blur / losing pointer lock so nobody gets stuck down.
- Sit / lie (#71/#72, `src/rest.js`, `REST`): builders put `userData.rest = { kind: 'sit'|'lie', name, verb,
  spots }` (local x, seat/mattress y, z, optional dir); buildFurniture turns them into E targets
  (`world.furnitureTargets`). E picks the spot nearest the look ray (not one the cat sits on), the camera
  glides there (lying: looking at the ceiling), walking is off and looking is clamped; E / "Res dig" puts
  you back where you stood (including upstairs: `spawn()` alone would drop you to Entréplan). Seats: the
  sofa (3 + the chaise), armchair, 4 dining chairs, the lounge sofa (3), RÅGRUND; beds: the double bed (2
  sides), both bunks (lower/upper), the daybed. F stands you up first.
- GNOME's "disable touchpad while typing" (on by default) blocks touchpad look while a WASD key
  is held — not a bug in the app. Arrow keys ← → turn as a keyboard-only fallback.

## Performance (#48)

- `&perf` shows fps, pixel ratio, draw calls, triangles, geometries, textures; `tools/perfcount.html`
  prints draw calls per spot. Baseline → after the first pass: start view 793 → 362 calls, kitchen
  162 → 109, living room 184 → 87, upstairs 148 → 88 (screenshots pixel-identical).
- `src/merge.js` `mergeStatic`: world.js bakes every static, opaque, single-material mesh into one
  per material and cell (Entréplan / Övre plan / outside); doors (leaf + handles merged per door,
  `tagged`), lids, appliances, the key cabinet, furniture, exterior and surroundings are kept out.
  furniture.js merges each piece on its own (not the parasol; `userData.keep` for the beers). Anything
  new that moves, toggles visibility or is a pick target must be in a kept object or have
  `userData.door` — otherwise it gets baked in.
- Shadows: `shadowMap.autoUpdate = false`; redrawn when the sun moved > 0.2°, for 1.5 s after any E
  action (doors swing), and at least twice a second (`updateShadows` in main.js).
- Mirror images (#50): one Reflector (512²) per mirror, at most ONE active per frame (nearest in view
  within 4 m, visitor's level) and none once dynamic resolution has stepped down. The Badrum mirror's
  LED strip is its own lamp (`mirrorLamps` in interior.js → `world.lamps`, switched like the floor lamp).
- Dynamic resolution: pixel ratio drops in 0.85× steps (not below 0.6×) after 2 s under 30 fps, comes
  back after 4 s over 50 fps; off with `&shot`.

## Conventions

- Plain ES modules, no framework, no bundler. Keep three.js pinned in the import map.
- Target hardware includes a Surface Pro (Intel Iris 640): keep draw calls and lights modest,
  pixel ratio capped at 1.5, one shadow-casting light.
- New tunable numbers go in `src/config.js` with a comment saying where they come from.
