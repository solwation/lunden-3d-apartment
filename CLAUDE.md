# CLAUDE.md — lunden-3d-apartment

Browser-based first-person 3D walkthrough of apartment **L1007, Kv. Lunden** (Peab), built from
the dimensioned floor plan `L1007_mattsatt_planritning.pdf`. The user writes in Swedish — reply
in Swedish. Code, comments and this file are in English; UI text is Swedish.

## Workflow rules

- **No branches, no PRs.** Commit and push directly to `main`.
- **Basic function first.** Work that isn't needed right now goes into a GitHub issue
  (`gh issue create`) instead of being done on the side. Keep issues small and concrete;
  reference the issue number in the commit that resolves it (`Fixes #N`).
- **Label issues `in-progress` when you start on them** (`gh issue edit N --add-label
  in-progress`) and remove the label if you stop without finishing
  (`--remove-label in-progress`). Closing via `Fixes #N` is enough when done.
- Verify changes in a real browser before pushing (see *Testing*). Don't claim something
  works from reading the code alone.
- **Every user-visible change gets an entry in `data/changelog.json`** (Swedish, newest first,
  next `id`), in the same commit. It is shown on the start screen and on the note on the freezer;
  entries newer than the visitor's last visit are marked "Nytt".
- Keep this file and `README.md` up to date when behaviour, structure or known facts change.

## Architecture

Static site, no build step for development, no npm. Every push to `main` deploys to
https://solwation.github.io/lunden-3d-apartment/ (public repo) via
`.github/workflows/pages.yml`, which runs `tools/stamp.sh`: it copies the site to `_site`,
writes the commit SHA into `src/version.js` (`BUILD`) and `version.json`, and appends
`?v=SHA` to module imports / `data/plan.json` so a reload never mixes cached old modules.
The page polls `version.json` every minute and shows a "new version" notice (top centre)
when it differs from `BUILD`. Locally `BUILD = 'dev'` and no checks run. Keep imports
between `src/` files in the form `from './x.js'` on one line so the stamp regex finds them.
Use relative paths only.

```
index.html             page shell, HUD, start overlay, import map (three from jsDelivr, pinned)
src/config.js          everything NOT in the PDF: heights, soffits, stair layout, colours
src/world.js           builds meshes + per-level collision segments from data/plan.json
src/stairs.js          stair treads + walking height function (stairHeight)
src/doors.js           SwingDoor / SlidingDoor (E to open/close, animated, dynamic collision)
src/exterior.js        brick façades, neighbouring units, stacked unit above, loftgång, street
src/player.js          WASD/arrow/joystick movement, circle-vs-segment collision, step-up, gravity
src/touch.js           on-screen joystick (left) + drag-to-look (right), multi-touch pointer events
src/main.js            renderer, lights, input modes, door raycast prompt/button, loop (step)
src/version.js         BUILD stamp + polling for a newer published version
src/cat.js             the cat: random coat, washing animation, appears/moves/vanishes behind doors
src/furniture.js       loose furniture from FURNITURE in config (IKEA LANDSKRONA sofa/armchair …)
src/interior.js        fitted kitchen, laundry, bathroom fittings, tiled floors/walls (FINISH, KITCHEN,
                       TILED_ROOMS in config); merged into one mesh per material
material/              screenshots of our choices in Peab's option portal (local, see below)
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps
src/toilet.js          toilet (Ifö Spira 6260) with an animated lid
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO)
src/surroundings.js    neighbourhood: brick blocks with gable roofs, instanced trees, cloudy sky
src/rooms.js           room detection: walls + door gaps rasterised, BFS from the room labels
src/minimap.js         plan view with the visitor's arrow, current room highlighted (K toggles)
src/measure.js         tape measure (Q / 📏): two points on any surface, distance label
src/fridge.js          the fridge: hollow, lit, opens with E, smoking roast chicken (in world.lids)
src/signs.js           hand-lettered name signs on the bedroom doors (DOOR_SIGNS)
src/water.js           running water: E on a tap/shower (world.taps from interior.js) → stream + hiss
src/stats.js           visitor statistics (localStorage) + the translucent HUD panel (T toggles)
src/changelog.js       changelog list (start screen) + the note on the freezer (E to read)
data/plan.json         GENERATED — do not edit by hand
data/changelog.json    what changed, for visitors (see Workflow rules)
tools/extract_plan.py  PDF → data/plan.json (stdlib only)
tools/walktest.html    headless movement test
tools/touchtest.html   headless touch-input test (synthetic pointer events)
tools/cattest.html     headless test of cat placement behind every door/wardrobe
tools/roomtest.html    headless test of room detection at known points (+ a picture of the fill)
tools/measuretest.html headless test of the tape measure (wall to wall in the living room)
tools/watertest.html   headless test: aim at every tap/shower, turn it on and off
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter)
tools/notetest.html    headless test of the changelog note ("Nytt", read/close, no walking)
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
  white risers. The surroundings (`SURROUNDINGS`) are illustrative, after the drone photo.
- Skärmvägg by the patio H 1.8 m, stair railing H 1.1 m (bofakta).
- U-shaped stair with winders at the east end: flight A (Entréplan, going east), 180° winders,
  flight B (going west) arriving in the upstairs hall. Upstairs slab opening = stair outline on
  Övre plan.
- Doors: Badrum and Klk on Entréplan swing into the passage by the stair, so all swing doors
  start closed. The dashed door to Allrum is a tillval that **we have chosen** (`OPTIONS.allrumDoor`
  + a short extra wall in `EXTRA_WALLS`) → Allrum becomes **Sovrum 4** (four bedrooms upstairs).
  Wardrobes (G, and L in Sovrum 2 — `WARDROBE_LABELS`) are hollow with two sliding fronts on separate
  tracks (one open at a time).
- Sliding doors run towards the side with enough wall to park the panel (the plan arrows
  are not reliable — the Tvätt arrow pointed through a 19 cm wall stub into the hall).
- Vardagsrum furniture (wanted by the user): IKEA LANDSKRONA 3-sits + schäslong, Gunnared
  ljusgrön, back to the window, chaise in the SE corner; matching armchair + footstool in
  the NW corner with a floor lamp and a side table with a small flower. Dimensions in
  `LANDSKRONA` (config) — the chaise/armchair/footstool numbers are series estimates.
- Material choices (Sarah's screenshots in `material/`): parquet Ek Chalk (white-stained oak),
  walls/doors NCS S 0500-N, stair white-lacquered oak/white, hall granitkeramik City Amsterdam
  30×60, wet rooms City Amsterdam 15×15 + white matt 20×40 wall tiles, kitchen fronts Form Tall
  (grey-green shaker) with black Solo handles, Delaware stone worktop, white 10×20 half-bond
  splashback, stainless fridge/freezer, black oven/microwave/hob. The photos of the kitchen and
  bathroom are *example* layouts with our materials — the kitchen layout is
  `material/Köksritning.jpg` (tall oven unit, wall cabinets, top cabinets over fridge/freezer,
  gypsum boxing above the hood). Colours/sizes live in `FINISH` / `KITCHEN` in config.
- Who sleeps where (the user's plan; "left/right" as you arrive upstairs walking west):
  Sovrum 1 (first right) Sarah & Ofluf, double bed · Sovrum 3 (second right) Livia & Tuva, bunk ·
  Sovrum 2 (first left) Walter & Kian, bunk · Sovrum 4 (second left, ex Allrum) Tilly, IKEA HEMNES
  daybed with pink cushions. Name signs: `DOOR_SIGNS` → `src/signs.js` (hall side of the door).
- Dining set (user's wish): table 180 × 90, short end to the kitchen window, 3 + 3 chairs, dark
  brown wood. F toggles all furniture (`world.setFurniture`, which also swaps the collision
  segments). Keep the Sovrum 1 bed clear of the Klk sliding door — the cat test needs floor there.
- Toilets: the redrawn plan has them rotated; bofakta shows the tank against the wall, so
  `toiletAgainstWall` re-orients them. Modelled as Ifö Spira 6260 (`TOILET` in config,
  `src/toilet.js`); the lid opens/closes with E (`world.lids`, kept out of `world.doors` so the
  cat logic and door tests don't see them).
- More info: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/

Values marked *guess* in `src/config.js` (slab thickness, window sill/head, soffit depth,
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
- `&water` — turn on every tap and shower.
- `&note` — open the changelog note. `&pet` (with `&cat=`) — the cat is being petted.
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
- Look at a visible cat + E pets it: purring (`sfx.purr`), eyes shut, head rubs the visitor's hand
  (`PET_TIME` in cat.js). Raycasts ignore visibility, so main.js only adds the cat as a target
  while it is visible. Tests must call `updateMatrixWorld` on objects they move (no render runs).
- Room detection: labels come from the PDF plus `EXTRA_ROOMS` (WC/dusch upstairs, the passage by
  the stair = Hall); `ROOM_DIVIDERS` split open-plan areas (hall | kitchen | passage | living room).
- Statistics (`src/stats.js`): cats found per coat, cats petted, doors, toilet lids, steps/metres,
  stair trips, time inside; reset on the start screen.
- Sounds are synthesised (no audio files) and positional; the AudioContext is started by the
  start-screen buttons (browser autoplay rules). M / the speaker button mutes.

## Input notes

- Start screen has two buttons: *Mus & tangentbord* (pointer lock) and *Touch* (joystick).
  A Surface has both, so the visitor chooses.
- Phones/tablets: the Touch button goes fullscreen and calls `screen.orientation.lock('landscape')`
  (Android); in portrait with a coarse pointer (≤ 1100 px wide) a "rotate" overlay covers the page
  (iOS can't lock). Headless Chrome doesn't emulate `pointer: coarse` — test the overlay by hand.
- GNOME's "disable touchpad while typing" (on by default) blocks touchpad look while a WASD key
  is held — not a bug in the app. Arrow keys ← → turn as a keyboard-only fallback.

## Conventions

- Plain ES modules, no framework, no bundler. Keep three.js pinned in the import map.
- Target hardware includes a Surface Pro (Intel Iris 640): keep draw calls and lights modest,
  pixel ratio capped at 1.5, one shadow-casting light.
- New tunable numbers go in `src/config.js` with a comment saying where they come from.
