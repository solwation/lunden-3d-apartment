# CLAUDE.md — lunden-3d-apartment

Browser-based first-person 3D walkthrough of apartment **L1007, Kv. Lunden** (Peab), built from
the dimensioned floor plan `L1007_mattsatt_planritning.pdf`. The user writes in Swedish — reply
in Swedish. Code, comments and this file are in English; UI text is Swedish.

## Workflow rules

- **No branches, no PRs.** Commit and push directly to `main`.
- **Basic function first.** Work that isn't needed right now goes into a GitHub issue
  (`gh issue create`) instead of being done on the side. Keep issues small and concrete;
  reference the issue number in the commit that resolves it (`Fixes #N`).
- **Problems found along the way become bug issues, not fixes on the fly** (the user): a failing test or bug outside
  your issue's scope (pre-existing, or caused by someone else's change) gets its own issue titled `Bugg: …` with a
  `Lapp:` line, what fails, how to reproduce and the suspected cause/commit — then carry on and finish your own issue.
  Only fix it in your change if your change caused it.
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
- **Priorities are labels.** Every issue carries exactly one of `priority: high`, `priority: medium`,
  `priority: low` (set it when creating the issue; the user decides when unsure, default `priority: medium`).
  When picking work, take the highest-priority open issue that is not `in-progress` (oldest first within a level;
  `gh issue list --state open --label "priority: high"`); an issue without a priority label counts as medium. Change a
  priority only when the user asks. Topic labels (e.g. `architecture`) are optional extras. Architecture issues whose
  exact measurements are missing from Peab's material keep their geometry preliminary: centralise and mark the values as
  assumptions (*guess*), never replace one guess with another and call it verified (docs/peab/arkitekturgranskning-2026-10-04.md).
- **Every new issue gets a `Lapp: <text>` line** in its body (#340): 2–6 plain everyday Swedish words
  ("Laga glitchiga kuddar", "Kaffeburk vid bryggaren") — the open issues are post-its on the fridge door; without
  the line the title is cleaned up automatically (src/todo.js `cleanTitle`).
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
  **The id is picked last:** after your final `git pull --rebase`, right before pushing, renumber your entry to
  the file's max id + 1 and keep it on top — never an id chosen when the work started (parallel agents push in
  between). The ids must stay unique and strictly descending in file order; `tools/stamp.sh` warns (`::warning::`
  in the Pages run) when they are not. The published order and "Nytt" do not rely on the id (#341):
  `tools/changelog_stamp.py` gives each entry `t` = the committer time of the commit that added its id line
  (rewording an entry later keeps its `t`; needs full history, `fetch-depth: 0`) and sorts by it; the page keeps the
  highest `t` seen (`lunden.changelogSeenT`, migrated from the old id key) and falls back to file order + id without `t`.
- Keep this file and `README.md` up to date when behaviour, structure or known facts change.

## Architecture

Static site, no build step for development, no npm. Every push to `main` deploys to
https://solwation.github.io/lunden-3d-apartment/ (public repo) via
`.github/workflows/pages.yml`, which runs `tools/stamp.sh`: it copies the site to `_site`,
writes the commit SHA into `src/version.js` (`BUILD`) and `version.json`, and appends
`?v=SHA` to module imports / `data/plan.json` so a reload never mixes cached old modules.
It also writes a **content hash** (`CONTENT` in version.js, `content` in version.json, #304) of what the page loads:
index.html, the manifest, icons/, src/, data/, textures/, music/ and stamp.sh — not tools/, docs/, the PDF or the .md files.
It also writes `data/todo.json` from the repo's open issues (`tools/todo.py`, REST API with the workflow's
GITHUB_TOKEN, `[]` on any error) AFTER the hash and outside it (#340): a changed TODO list reloads nobody; the Pages
workflow also runs once a day (schedule) so the post-its follow the issues. Locally `data/todo.sample.json` is used.
Commits that only touch docs/, material/, cloudflare/, `*.md` or cloud.yml do not deploy at all (`paths-ignore`).
The page polls `version.json` every minute; when its content hash differs from `CONTENT` (`isNewer`; a file without a
hash falls back to the SHA) it reloads by itself — a new SHA with the same content (tests, reference images) is no
reload, so a reload without a note entry means an invisible fix (#192, `autoReload` in
main.js, `AUTO_RELOAD` in config): once the visitor has been still for 2.5 s (no keys/stick/mouse/touch, not walking, no panel,
no music, nothing time-bound: coffee brewing, frying, the airfryer, the dishwasher (#385), the grill, Kaffeturbo, the car's music, a ball in the air) "Uppdateras om
5 … 1" counts down at the top (#277, `#countdown`; any input or movement cancels it: "Uppdatering avbruten"), then the
picture fades out, the place and the world are saved (resume record) and `?v=<new SHA>` loads, fading back in with "Ny version laddad";
only if they are never still for 5 min does the old "new version" notice (top centre) appear. Its buttons react to a lifted touch as well as a click (`onTap`,
#41), and "Ladda om" navigates to `?v=<new SHA>` so no cache serves the old page
(`tools/updatetest.html`). That button stores a one-time record (`src/resume.js`: position, level, view,
clock, input mode, mute, fullscreen; sessionStorage + localStorage, < 2 min) which the next load reads, deletes and resumes from (not with `?at=`; a spot
inside a wall falls back to START); F5 uses the running record below (a new tab starts at START). The automatic update and "Ladda om" also put
a `world` part in it (#277, `src/keep.js` `saveWorld` / `loadWorld`, versioned plain JSON, every part optional and read tolerantly): the
game's clock and date (spooled / paused — only a new visit starts at the real time, #143), the car (`Car.saveState`: arriving / leaving
carries on along its path, parked with its doors, the music), open doors / lids / fronts / windows, room lamps + small lamps (on/off and the
dusk state, not the pool), TV / PC / hob / hood / grill, the coffee in the jug, the Sonos, the parasol's hand choice, things put down and the
one in the hand (cups with pattern and contents, glasses, the served beer), sitting / lying (`sitAt`), the cat. Fresh as before: the
chicken / fish fingers / fries in the air fryer (the bag itself is kept like the milk), taps, a drawing in the hand, F5 (place only).
A record made mid-visit skips the start screen (#181, `continueAfterReload`): touch plays at once (sound/fullscreen on the
first touch), mouse & keyboard gets the see-through `#arm` (the next click takes the mouse, #190); "Ny version laddad" fades out at the top after 3 s.
F5 (#203): while visiting, the place (+ view, mode, mute, `BUILD`) is written to this tab's sessionStorage every 2 s and on
`pagehide` (`saveSession`), so an F5 carries on the same way — the note only if the build changed; a new tab starts as usual.
An inline script in index.html's <head> sees a valid record with a mode before anything is drawn and sets
`html.resuming` (start screen hidden, a dark "Laddar…" cover) until main.js has resumed — or drops it on a bad record (#222).
A record made on the start screen (no mode) shows it with "Du fortsätter där du var" + "Börja från start". The start screen
always offers "Gå till startplatsen" (both also set the clock and calendar back to now, `realNow`)
and "Återställ" (#303, `src/reset.js`, `resetHome` in main.js): after a question (#reset-confirm, Avbryt / Esc changes nothing)
every 'lunden.*' key in local/sessionStorage goes except the whitelist `RESET_KEEP` in config (the cloud's queue and
seen list, the desk drawing, the stats/score, the leaderboard name + id, conveniences) — a new key is reset unless it is
added there — and the page reloads clean (no resume / F5 record): START, the real time, everything shut / off / at home,
"Hemmet är återställt" on the start screen. IndexedDB is never touched: every taped-up drawing stays (synced ones, and
with the cloud off the visitor's own — their creations, not the home's state), the cat photos too; nothing is sent to
the cloud (`tools/resettest.html`, with `node cloudflare/dev.mjs`)
(`tools/reloadtest.html`). Locally `BUILD = 'dev'` and no checks run. Keep imports
between `src/` files in the form `from './x.js'` on one line so the stamp regex finds them.
Use relative paths only.

```
index.html             page shell, HUD, start overlay, import map (three from jsDelivr, pinned)
src/config.js          everything NOT in the PDF: heights, soffits, stair layout, colours
src/architectureedges.js sharp architectural edges (#474), captured before loose furniture/decor is added;
                       excludes transparent overlays, cabinet contents and explicit loose roots. One static batch per floor,
                       one per moving door/fitting/lift anchor; 30° creases, no triangle diagonals, 1 mm depth bias with depth testing.
                       world.js and core.js build them once; furniture and loose things have no outlines. tools/architecturetest.html
                       verifies batching, exclusions, moving doors/lift, no box diagonals and real WebGL occlusion.
src/world.js           builds meshes + per-level collision segments from data/plan.json
src/stairs.js          stair treads + walking height function (stairHeight) and the treads' underside (stairUnderside: head room,
                       collision, the Klk under it); the rise is LEVELS[1].floor − LEVELS[0].floor in equal risers (#352)
                       handrails (#419, `handrailRuns` / `buildHandrails`, STAIR.handrail): white Ø 4 cm rails on brackets, 0.9 m
                       over the nosings (eased through the winders), returns into the wall; merged with the M.rail parts
src/doors.js           SwingDoor / SlidingDoor (E to open/close, animated, dynamic collision)
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
src/player.js          WASD/arrow/joystick movement, circle-vs-segment collision, step-up, gravity; outdoors the terrain (`groundY`, #256);
                       `isFree` / `obstacles` / `nearestFree` / `unstick` (#314, see Input notes); up on the roofs (#360): `aloft`
                       (outdoors > ROOFS.aloft m over the ground, over our flat above UNIT_TOP − 0.3) = `outdoors`, level 0, the
                       roofs' walls instead of a level's segments, no obstacles; `groundAt` takes the highest roof ≤ feet + stepUp
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
src/fall.js            falling (#361, FALL): player.js keeps `fall` (the highest feet since leaving the ground + the deepest free gap
                       under them) and calls `onLand(drop, gap)`; only a gap over FALL.free counts (the stair's risers, the ramp never).
                       Over FALL.hurt (3 m): sfx.landing + sfx.ouch ("aj"), the view jolts, #fall goes red then black, no walking, the
                       visitor wakes at FALL.wake outside the front door facing the house, "Du slog dig …" while it fades in; only the
                       place is reset (`onWake` hooks, e.g. the jetpack of #359 going home), a deduction `fall` + stats `falls`. Over
                       FALL.soft: a soft thud and a knee-bend. Off a roof's edge (#360) or the jetpack's thrust cut high up (#359; with
                       it on, the drop = the landing speed v² / 2g); `&fall=h` drops you from h m (falltest.html)
src/jetpack.js         the jetpack (#359, JETPACK): our own unbranded pack (one vertex-coloured mesh) on a wall hook inside the garage
                       beside the garage door (#441: `hook` on the entrance hall's west wall, `face`, `floor`) under the yellow sign
                       "Låna Jetpack på eget ansvar. Se upp för fiskmåsar." (`sign`); E puts it on (hands free; outdoors and in the
                       garage — under its / the stairwell's ceiling no thrust, "Inte inomhus", walking back in keeps it on),
                       `player.jet` = it: Space / ⬆ (#jet-up) thrust, C / Ctrl / ⬇ down faster, WASD / the stick steer at `speed` with
                       inertia (`player.flying`, `player.jv`), no thrust = falling; `ceiling`, OUTDOOR's edge and the roofs' walls
                       hold (+ `roofs.blocks` / `above`: a roof edge or canopy in the way of the body); the landing hurts by the speed
                       it came down at (v² / 2g as the drop, fall.js); heat (#jetpack bar, `heat`) cuts the thrust when full.
                       E with nothing else (`dropTarget`, touch: "Ta av dig jetpacken") stands it down in front of you; walking in
                       through a door with it on stands it down outside; F / waking after a fall (`fall.onWake`) send it home; keep.js
                       part `jetpack`; flames (rig on your back) + smoke (one Points) + #jet-glow + sfx.jetRoar; stats `flights`
                       (SCORE.first: the first take-off); `&jetpack` = on from the start (tools/jetpacktest.html)
src/touch.js           on-screen joystick (left) + drag-to-look (right), multi-touch pointer events
src/main.js            renderer, lights, input modes, door raycast prompt/button, loop (step)
src/version.js         BUILD stamp + polling for a newer published version
src/keep.js            the world's state across a page-made reload (#277): saveWorld / loadWorld, one part per module
src/reset.js           "Återställ" on the start screen (#303): clears every local 'lunden.*' key except RESET_KEEP (config)
src/cat.js             the cat: random coat, washing animation, appears/moves/vanishes behind doors
src/miele.js           Miele (#328): `HeartFireworks` (heart shells that pop into small hearts) and `MieleHeld` (a Holdable with no
                       home: the cat object rides in it, hand.js 'hug'; click / "Krama" hugs; put down she walks off)
src/furniture.js       loose furniture from FURNITURE in config (IKEA LANDSKRONA sofa/armchair …)
src/cleaning.js        the Klk under the stair on Entréplan (#338, CLEANING in config): `cleaningFittings` (world.js, stay with F: a white
                       wall shelf on the north wall, a tool rail on the east wall, the vacuum's dock) + the `cleaning` builder (a loose
                       item: toilet paper, kitchen roll, labelled bins Städ / Tvål / Påsar, bottles, a mop bucket with its mop, broom,
                       squeegee, dustpan, a step stool, a plain stick vacuum with a blue charging LED); kept under the stair's soffit
src/closet.js          Sovrum 1's walk-in closet (#331, KLK in config): `klkFittings` (world.js, Peab's: white wall standards, a high
                       shelf on the side wall + the far wall, a chrome rail under the side one; stays with F) and the `klk` FURNITURE
                       builder (loose): clothes on the rail, things on the shelves, make-up on the NORDLI, an LED mirror over it (a
                       lamp of its own, 'spegelns lampa', + a Reflector)
src/rugs.js            the rugs furniture.js built (#55, #310, #317): `rugLift(level, x, z)` = a shown rug's top over the floor there
                       (the cat follows it as it walks); `rugUnder` from config: a piece whose whole footprint is on a rug
                       (or `onRug`) is built standing on top of it
src/bedding.js         bedding shapes shared by every bed: `pillow(w, d, h, opts)` (#308) — a stuffed case with pinched-in sides (the
                       corners stick out), full in the middle, thin at the seams, low bumps, a head `dent`, `base(x, z)` to lie on
                       something (a pillow on a pillow); planar metre UVs; `geo.userData.top(x, z)` = its top for stacking
                       `duvet(w, l, th, opts)` (#309): a thick soft shell over a mattress with rounded edges, hanging `drop` over
                       the sides with a flare, low bumps (crumpled near the head), rounded seams, `quilt` channels, `extentL`
                       (a throw ending on top); UVs in metres along the cloth. furniture.js `addMattress` (ticking + a fitted
                       sheet) / `addDuvet` (+ the fold turned back at the head end) build every bed with them (BEDDING)
src/hooks.js           hook rails (#329, HOOKS): Sovrum 1's oak board, black hooks, a terry dressing gown and a hoodie (soft `drape` tubes);
                       #330 the kids' rails (KID_HOOKS, item `set`): `garments` list of gown | hoodie (zip, print) | cap | tote
                       #424 `towelhooks` (TOWEL_HOOKS): two round brushed-steel hooks on a bathroom wall, a mauve terry hand towel on each
src/cushions.js        decorative cushions (one atlas material: leaf print | bobble knit | geometric | corduroy | outdoor weave | striped weave (#399), vertex-colour
                       tint, #313) and the ribbed fleece throws (plum folded on the chaise, grey draped over the armchair's
                       arm; one material per colour) for the LANDSKRONA pieces (CUSHIONS, #278)
src/interior.js        fitted kitchen, laundry, bathroom fittings, tiled floors/walls (FINISH, KITCHEN,
                       TILED_ROOMS in config); merged into one mesh per material; a tiled room's floor runs on through
                       its door openings (`doorwayTiles`, world.js `doorways`, #306): to the closed leaf, the front door's whole depth
docs/                  reference images in git (site map screenshot; docs/peab/ = pages of Peab's plan
                       brochure: situation plan, overview plans per floor, unit plans, aerial render)
                       docs/peab/kalibrerad/ = the overview plans + situation plan at 300 dpi from the
                       collected Peab material, skalstockar.json (m per PDF unit from each 0–25 m scale bar),
                       modell-mot-plan.jpg (the model before #252/#253 over the situation plan); bostader/ = bofakta
                       sheets of Hus L's other units, text/ = Q&A + info brochure text; index: docs/peab/README.md
textures/              image textures the page loads (published by stamp.sh): stair-pictures.jpg = the 2 × 2 atlas
                       of the stair pictures (#220), cropped/straightened from docs/tavla-trappa-*.jpg; angsgras-sovrum1.jpg = the picture over the
                       Sovrum 1 bed (#284), straightened, reflections painted out; miele.jpg = the cat photo in the window-board
                       frame (#322), cropped and straightened from docs/miele-foto-ram.jpg; linjeteckning-sovrum1.jpg = the line drawing over the RÅGRUND
                       chair (#404), docs/tavla-sovrum1-linjeteckning.png on pale paper inside a white mount;
                       eat-sleep-game-repeat-sovrum2.jpg = Sovrum 2's neon print (#430), cropped inside the frame and straightened
                       from docs/tavla-sovrum2-eat-sleep-game-repeat.webp
material/              screenshots of our choices in Peab's option portal (local, see below)
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps
src/toilet.js          toilet (Ifö Spira 6260) with an animated lid and a flush button (`flush`, its own E target in
                       world.lids: dips, sfx.flush, the water drains and returns, no flush until refilled, #155); #321: a deep
                       bowl (rings `TOILET.bowl.profile`, all the porcelain one merged mesh), toilet-blue water (its own mesh);
                       a flush runs streaks down an inset copy of the bowl and swirls the water (emissive spiral), idle = no work
src/toiletpaper.js     toilet-paper holders (#426, TOILET_PAPER): brushed steel beside each toilet (on the tank's wall, the side away from it);
                       E on the roll pulls out a sheet (it turns, sfx.paper, up to `hang`), E on the strip tears it off into the hand as a
                       wad (no placeAt): E on a toilet (main.js `toiletPaper.aim`) opens the lid, drops it in and flushes, it swirls away
                       (stats toiletPaper); the roll thins, F puts full rolls back; not loose, nothing saved
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO)
src/courtyard.js       the courtyard on the garage box (COURTYARD): walks, pergolas, grill, sandboxes, boule,
                       benches, raised beds, instanced shrubs; collision for what you can walk into. #438: every bench is a seat
                       (`targets`: invisible pick boxes with rest.js spots, `world.courtyardTargets`, kept with F; a spot a
                       people.js bench sitter is on is `taken`, and a sitter is away while you sit on its spot), the pergola tables
                       and the grill's side table are put-down surfaces (`surfaces` → world.cupSurfaces); the benches' / tables'
                       collision is `seats` (segments + footprints outside `fixedSegments`, so getting up works as for furniture)
                       #453: no bench within 1 m of a way in at the ground (surroundings.js `groundWaysIn`: the loggias' parapet
                       openings, the entrance recesses; resttest checks); Hus A's two north benches stand between loggia and entrance
src/grill.js           the courtyard's kettle grill (GRILL, #204): E lights it — the lid swings open, flame sprites, glowing coals,
                       sparks, smoke, crackle + roar, a pool light (lights.extra); out by itself after burnSeconds; F keeps it
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees, lit windows, cloudy sky
src/lights.js          room switches (E), ceiling lamps/pendant/spots/LED (by hand only), small lamps (FloorLamp:
                       E, and they switch themselves with the dusk, #234); a pool of 4 point lights goes to the lit
                       lamps that matter (own room, in sight, nearest), fading when it moves
src/weather.js         weather (WEATHER, #248): a seeded draw per date (`showersOn`, `rainAt`): showers in spring/autumn (a little
                       in summer, none Dec–Feb), thunderstorms 20 Jul – 31 Aug; follows the clock/calendar. Rain = one
                       LineSegments of streaks around the eye ending on the ground or a roof (`roofAt`: the house boxes of
                       greet.js `occluders` + our unit; a walkable roof's real top where there is one, #360), DayCycle `overcast` (grey sky, fog, weaker sun) and `flash`
                       (lightning), sfx.rain (muffled indoors) / sfx.thunder after distance / 343; the small lamps come on
                       earlier, the people go in, the parasol folds; 🌧 / ⛈ in the HUD; `&weather=rain|storm|snow|hail|clear`.
                       #249: each shower has a `kind`: snow (mostly Dec–Feb; slow swaying Points, a lighter sky, silent),
                       hail (spring, and at the start of some storms; white pellets that bounce once and lie a moment, a
                       louder rattle); ❄️ / 🧊 in the HUD. Walking WEATHER.experience.metres outdoors while it falls calls
                       `onExperience` once per shower → stats walkRain / walkSnow / walkHail / walkStorm (big points the
                       first time, a little each later shower; a badge every time)
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
src/groundglow.js      light without lights (#434, #433): additive fall-off decals — `poolGeometry` (an ellipse draped over `groundY`),
                       `washGeometry` (an upright one on a wall), `glowMaterial` (one per set, opacity = the level), `fadeGlow`
src/streetlife.js      life on the street (SITE.life, #113): the car park as on the situation plan (#260): asphalt from the hedge (SITE.shrubs,
                       z −16.3; the drive through it in front of the portik) to a low green strip along Hus L's entrances (z −3.5…−2.9, open
                       at the portik, no collision), one row of stalls nose to the hedge west of the drive with parked cars (instanced, a colour
                       each, collision); bikes by Hus L's entrances; the bike yard NW of Hus L / north of Hus C (lawns, a tree, two rows of
                       racks; west of x −66 is left for #256's stair down to Karpvägen); #436: low concrete edges (`life.edges`, one
                       merged mesh, 5 cm, no collision) where the car park's asphalt meets grass and round the yard's lawns
src/people.js          people in the area (PEOPLE, #114): low-poly figures (one InstancedMesh per body part, a colour each; #239:
                       lathe-turned torso/arms/legs, knees (#243: thigh + shin, `kneeL/R`), hands and shoes ride the arm / shin; a rounded dog;
                       posed every frame): walkers to and fro on the paths (a dog with one), cyclists on Sankt Lars väg
                       (sfx.bell when they pass close), kids with a ball and in the sandbox, bench sitters, someone on a
                       blanket (not in the snow months), neighbours on the loftgång; daytime only
src/daycycle.js        60-minute day: real solar path for the month (55.7° N), sun → moon light, shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock
src/patio.js           patio: Rusta Verona lounge + slatted table (#408), cushion box, parasol, planters with exotic plants
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
src/wallclock.js       analog kitchen clock (WALL_CLOCK) + the control strip: spool A D / ← →, pause
src/blinds.js          pleated blinds, bottom-up (BLINDS, #273): one per window in the reveal on the room side of the frame
                       (the living room's split window: two), `blind: 'dark' | 'light'` per WINDOWS entry; the fabric (a
                       zig-zag rebuilt only while it moves, castShadow) + the top rail are two meshes per blind, the bottom
                       rail / cords are baked; E opens #blind-panel (BlindPanel, reading mode like the clock's strip): W / S,
                       ↑ / ↓ or ▲ ▼ held; the visitor's room loses daylight (`DayCycle.dim`) by its blinds' cover; a white
                       one glows by day and warm from a lit room (`lights.roomLit`); localStorage 'lunden.blinds'; F keeps them
src/curtains.js        Sovrum 1's curtains (#342, CURTAINS): two floor-length teal jungle-print panels (our own canvas print) on a white
                       ceiling track under the soffit from the west wall; a split (#362): they meet at the window's middle and part
                       to either side, the same share of their way (the west one to an end stop by the west wall, #403: the RÅGRUND
                       chair moved south out of the corner; both stacks clear of the glass); wave folds rebuilt only while they move (count fixed, spacing shrinks); part of Blinds
                       (`blinds.curtains`): E opens #blind-panel sideways (A / D, ← / →, ◀ ▶ held: together / apart), the daylight cut (`dim`, less than blackout), a teal glow by
                       day, saved in 'lunden.blinds'; fittings: F keeps them; stats `curtains`; `&curtains=0…1`
                       #463: Vardagsrum has three botanical linen panels on a wall-to-wall rail over the patio door too. Optional
                       CURTAINS.panels defines each closed span and parking side; cover sums the window overlap.
                       #464: kitchen valance is one short panel (hem 2.45 m), initially spread along the existing rail, dim 0.03.
                       #468: every rail spans the room's side-wall faces (CURTAINS.rail, plan.json); kitchen cloth spans the full width too. Living-room fabric matches both the kitchen's botanical motif and its light background.
                       Its '-valance' state id avoids inheriting the removed long curtains' position; subsequent positions save normally.
src/rearrange.js       furniture cheat (#465): Enter / >_ opens a terminal; either exact code "olof is the goat" or "sarah is the goat" unlocks rearrangement.
                       buildFurniture exposes stable movable ids and separates framed pictures before per-frame merging.
                       E/click selects and confirms, R/turn rotates, X/cancel abandons the local 35%-opacity ghost. Rugs never
                       carry things above them; support surfaces identify carried furniture and local Holdables/life items.
                       Confirmed world poses update footprints, seat targets, surface heights, light anchors/washes, rug data
                       and Marks caches. Local cached authoritative layout is lunden.furniture.layout; unlock is a convenience.
                       GET/PUT /furniture uses DrawingRoom's serialized durable storage, revision-checked atomic batches;
                       conflicts cancel and pull the winning layout, previews never sync. Decorative mirrors (LINDBYN, both NISSEDAL, SKOGSGRÄNSEN, pineapple, vanity and closet) are independent
                       wall pieces with their reflectors; furniture builders expose wallMirrors, detached before layout restoration.
                       Bathroom mirrors/cabinets remain fixed. tools/rearrangemirrortest.html and tools/loosemirrorstest.html verify
                       independent movement, reflection, restoration, reload and fixed-mirror exclusion.
                       Enter opens clickable rearrangement controls with a free cursor; Esc exits the mode and cancels the preview,
                       including native pointer-unlock events. Touch keeps its input mode when leaving the menu.
                       Original-position reset (button / Home) asks for confirmation and uses the same atomic move; detached Thing supports and the fruit bowl follow
                       furniture, including layouts saved before #475.
                       Whole-layout reset also asks for confirmation, writes every registered home pose atomically, and rejects a changed global revision (#481).
                       tools/rearrangeresettest.html covers both confirmations, cancellation, followers and all-room reset.
                       Physical bounds ignore Ambilight; the TV targets support surfaces and follows BYÅS in the same saved batch, repairing legacy sunk TV poses on load (#478, tools/rearrangetvtest.html). Browser tests: tools/rearrangetest.html, tools/rearrangefollowtest.html;
                       Worker tests: cloudflare/layout.test.mjs. Development: cloudflare/dev.mjs and ?cloud=http://localhost:8145.
src/lampwash.js        every lamp's light wherever the visitor is (#276, #294, #295, LIGHTING.wash): each pool anchor (small lamps
                       and ceiling lamps) lights the flat inside the lit materials' own shaders (`patch(scene)`: onBeforeCompile on
                       every MeshStandard/Lambert/Phong material, re-scanned every 120 frames; no extra mesh or draw call) exactly
                       like its pool light (same fall-off and range, Lambert on the surface's colour, no specular), only where it
                       sees: its visibility polygon (rays to walls, closed doors but not wardrobe fronts (#297), the façades' outer faces) is a row of a float
                       texture; lamp data in a small float texture. It shows k × (1 − pool) and the pool light k × pool (cross-fade,
                       Lights.update → `set(i, k, pool)`), so a lit room looks the same near, far, upstairs or from outside
src/rooms.js           room detection: walls + door gaps rasterised, BFS from the room labels
src/minimap.js         plan view with the visitor's arrow, current room highlighted (top right, under the HUD buttons); hidden, shown with the
                       stats (Tab / T / 📊, #85), K shows it alone
src/measure.js         tape measure (Q / 📏): two points on any surface, distance label
src/contents.js        what is inside cabinets/drawers (#228), shared: `attachContents(meshes, openable, { carry })` — world-space
                       meshes (merged per material), hidden while the front is shut, shown as it opens; `carry` = they ride
                       in the drawer (children of its pivot), else they stand in the carcass; no E targets; `openable.contents`.
                       #231 (CONTENTS in config): a `Pack` with two finishes (matte / gloss, vertex colours) + `frameMatrix(dir,
                       origin)` and the builders: `byasDrawer` (games, pads, remotes | films) / `byasMiddle` (console, router; the
                       open middle, always drawn), `bestaContents` (per wooden door: board games, albums, napkins), `hallWardrobe`
                       (world.js: coats on hangers above cat height, hats/scarves/gloves, a slanted shoe rack along the back,
                       rubber boots — the middle of the floor stays free for the cat; always drawn, stays with F), `mirrorCabinet`
                       (Stage 50), `vanityDrawer` (towels | brushes, plasters, hair ties), `laundrySink` (detergent, basket, pegs)
src/kitchenstuff.js    the kitchen's cabinet/drawer contents (#229): `fillKitchen(P, kind, box)` — plates, bowls, glasses, mugs,
                       dry goods, spices, tea, pots, baking tins, serving/festive china, the corner unit's machines, cutlery,
                       utensils, rolls; interior.js `stock()` fills each front (`o.stock` = the kind, or 'own' / 'empty')
src/cabinets.js        wall cabinets with side-hung doors that open with E (Openables, max 90°; `corner` = that end's door
                       hinges away from the side wall, #154; in world.lids), e.g. the
                       Tvätt wall cabinet over the machines, none over the sink (LAUNDRY_CABINET, #138, #153)
src/openables.js       Openable (#103): the shared helper for fronts that open with E — 'hinge' (with a `max` stop, never
                       through a neighbour), 'flap' (bottom- or top-hinged), 'drawer'; kind 'cabinet', in world.lids.
                       interior.js builds the kitchen fronts, vanity drawers, the Stage 50 mirror cabinet, the Badrum's
                       HAVBÄCK tall cabinet (`havback`, #293), the laundry sink cabinet, the washer/dryer doors and the hall's EL/C cabinet (`buildElCabinet`: fuse box, router) with it
                       (`openFront`, hollow `shell` carcasses); `contents` (a mesh): only drawn while the front is
                       (partly) open (#228)
                       furniture.js `addDrawer` / `addDoor` for furniture (NORDKISA, NORDLI, ALEX, IDANÄS foot end, BYÅS's two end drawers, #212)
src/stuff.js           what is inside wardrobes and drawers (#228, STUFF): `Pack` (tinted boxes merged into one vertex-coloured
                       mesh, no raycast; `rbox` = rounded, #240: folded stacks, garments, shoes; socks are capsules), `garment`, `stack`, `rolls`, `shoes`; `wardrobeFill` (world.js: clothes on the rod,
                       hat shelf, shoes — by the room's person, `personFor`), `drawerFill` (addDrawer `fill`: tees, socks,
                       underwear, pyjamas, jeans, toys, crafts, nightstand). Sovrum 1: NORDLI, NORDKISA, IDANAS drawers;
                       Sovrum 2: wardrobe L; Sovrum 3: wardrobe G + ALEX drawers (#230)
src/ovens.js           oven (drop-down door) + microwave (side door) in the tall unit, E opens (world.lids)
src/hob.js             the induction hob (#158): E switches it on/off (the front zone glows, "9" on the display, a hum);
                       in world.lids, `world.hob` (`zone`, `on`) for the pan/chicken; stays with F but F switches it off
src/pan.js             the frying pan (#159), a Holdable in the middle drawer under the hob (`world.panDrawer`, a child
                       of the drawer while at home); E on the hob with it in the hand stands it on the front zone (`onHob`)
src/sockets.js         the kitchen's wall sockets (#442, KITCHEN_SOCKETS): white double sockets at the top of the splashback
                       under the wall cabinets (over the Moccamaster, between the sink and the hob, in the corner; they replaced
                       the "Hörnbox" on the worktop), merged into the kitchen (stay with F); `mouths()` (fixed: the Moccamaster's
                       and the air fryer's, `taken`), `nearestFree`, `cordToMouth` (a cord along the worktop and up the wall), `plugAt`
src/toaster.js         the toaster (#401, TOASTER): an OBH Nordica Piano Black (no logo; a canvas label with the dial and four buttons), a
                       Holdable standing in the bottom drawer of the drawer unit by the corner (`world.toasterDrawer`, rides with it, "Öppna
                       lådan först"); put down upright, its front to you (a worktop surface runs from the hob to the corner too); E on the plug
                       beside it plugs it into the nearest free wall socket within TOASTER.cord ("För långt från uttaget", sockets.js,
                       #442), the cord along the worktop and up the splashback to it; E on the lever / front toasts (glowing slots, tick + hum, pops with a pling after
                       TOASTER.seconds; again = STOP; unplugged: "Brödrosten är inte inkopplad"); taking it unplugs it; F: home, unplugged;
                       keep.js keeps it plugged in (`keepState` / `loadKeep`, a hook any Holdable can use); empty toasting for now (#394)
src/chicken.js         the roast chicken in the fridge (#160), a Holdable: E on the pan on the hob lays it in (a child of the
                       pan); fried on a lit zone for CHICKEN.cookSeconds it sizzles, browns and smokes (the smoke follows it)
                       until smokeSeconds after the heat, or at once back in the fridge with the door shut
                       (#194: raw it is pale `CHICKEN.raw`, golden once fried; cooked, E breaks off legs, wings, then body
                       pieces into the hand — `ChickenPiece`, a click eats it; F makes it whole and raw again)
src/hood.js            the cooker hood (#194, `world.hood`, in world.lids): E runs the fan (whoosh, green LED; its light is a
                       separate button = its own lamp, #221 — the fan does not light it, like a real hood) and
                       draws the chicken's smoke up into it; the smoke alarm in the kitchen ceiling (SMOKE_ALARM) beeps
                       and blinks red after `delay` s of smoke the hood does not take (`chicken.freeSmoke`); F: fan off
src/coffee.js          Moccamaster on the worktop (MOCCAMASTER): E brews (red light, sound, the jug fills); tank + switch on the left, jug
                       on the right (#315); the coffee colour (jug, cups, mixes) is COFFEE in config, a dark Scanian roast (#316).
                       #334: it only brews with water in the see-through tank and coffee in the open filter basket, else the switch
                       says what is missing (`blockedText`); the jug held at a running tap fills with water (`fillTarget`), at the
                       machine pours it into the tank (`tankTarget`); brewing drains the tank and leaves wet grounds (`spent`), so
                       every pot needs both again; `prime()` fills both (tests), `reset()` (F) empties them; keep.js keeps them
src/coffeejar.js       the coffee jar beside the Moccamaster (#334, COFFEE_JAR, docs/kaffeburk-sked-*.jpg): rounded square glass, ground
                       coffee on a slant, dust on the glass, a bamboo lid that flips up while the beech scoop (a Holdable, `Scoop`)
                       is out of its glass loop; E on the jar takes the scoop full / fills it again / (full) hangs it back; the
                       full scoop at the Moccamaster tips into the filter (`filterTarget`, a puff, sfx.scoop); `aim(item, door)` =
                       the ritual's focus swaps (main.js updateFocus); stats `handBrew` = the first pot by hand
src/airfryer.js        the air fryer (AIRFRYER, #287): an OBH Nordica Easy Fry Deluxe in the worktop corner left of the freezer, turned
                       `rot` 45° with its front diagonally out of the corner (#296; one group, so the basket's slide, the panel,
                       the slots and the vents turn with it), its cord up the splashback to the corner wall socket (#442); E on the handle pulls the basket out / in, E on the panel starts / stops a run
                       (200° + a game-time countdown, fan hum, glowing vents; basket out = paused; "End" + beeps); fish fingers go
                       in the open basket (`FishPack.airfryHeld`, a child of the basket; a look into the open basket takes the
                       nearest one), cook golden in one run, burn in a third (smoke from the vents → the smoke alarm); a loose
                       item; F: off, in, emptied. Fries (#301) go in instead of fish fingers (one kind at a time), see fries.js
src/fruit.js           the copper fruit bowl on the coffee table (#326, FRUIT, docs/fruktskal-dorre-koppar.jpg): a Dorre wire bowl (band,
                       zig-zag wires, base wheel; one merged mesh, roomEnv copper) with apples, a pear, an orange, a clementine and
                       bananas; each piece a holdable like the fish finger: E takes it, click / "Ät" bites (a scoop out of it in the
                       flesh colour; an orange / a banana is peeled first, a banana bitten off from the tip), eaten after
                       FRUIT.bites; put down anywhere, E on the bowl puts it back in its spot (anything else: "Inte i fruktskålen");
                       stats fruit (SCORE.first per kind); a loose item, F puts every piece back whole; the cat never sits in it
src/fries.js           Aviko frozen fries (#301, FRIES): a stand-up bag (canvas print, our own plain wordmark) leaning on the freezer's
                       top shelf, a Holdable like the milk (not hidden with F, sent home); in the hand, E on the open air-fryer basket
                       pours a portion (the bag tips, sfx.pourFries; FRIES.portions per bag, FRIES.max in the basket, not with fish
                       fingers): a heap of sticks (one InstancedMesh, a child of the basket) that drop in, cook pale → golden in one
                       run, burn in a third (smoke from the vents → the smoke alarm, a deduction); done and pulled out they steam
                       (cups.js `Steam`) for FRIES.steam s; E with a free hand takes a bunch (FriesBunch: click / "Ät" eats one fry,
                       put down / taken again); stats fries / friesCooked / friesBurnt; F: emptied, the bag full; `&fries` = a done
                       basket out (screenshots)
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors); the lit mirrors (Badrum LED, Hollywood, Klk) use `litMirrorMaterial` + `litEmissive` + `litReflect` (LIGHTING.mirror, #339)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders; `dim` scales a lit mirror's image (#339)
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/rest.js            sitting / lying down (REST): seat & bed spots from furniture userData.rest, look clamp
src/holdable.js        things you take and hold (one at a time): home + pick box, held pose in camera space,
                       use = click / touch button / fast look; E on the home puts it back, E on a table top /
                       worktop / the floor (HOLD.reach) puts it down (`placeAt`, lying by its shape — `restPose`;
                       cups stand). While something is held other things are `blocked` ("Lägg ifrån dig …")
                       #368: `placeAt(p, yaw)` + `poseAt(obj, p, yaw)` (every class that puts down its own way has one; Miele
                       none): main.js snaps the spot (LIFE.place: a 5 cm grid inside a table's / worktop's edges, 10 cm on the
                       floor), the turn = the view in 45° steps + R / the ⟳ button (#turn-btn), and a faint ghost of the thing
                       (`itemGhost`, its meshes with one see-through material) stands exactly where E will put it; without
                       `poseAt` the ring as before. Looking away cancels (still in the hand); a life item never goes under the floor
src/hand.js            the visitor's arm + hand (HAND, #195, #238): three meshes in the camera (sleeve, cuff, the hand: palm,
                       thumb, four three-joint fingers of capsules + the bare wrist, with morph targets relaxed | grip |
                       spread), hidden when empty; holding a thing the fingers close round its `grip` (or the right edge of
                       its box; `handCurl` overrides how far they close: the fish finger is pinched) and follow it, `handPose: 'palm'`
                       (the basketball) carries it on the palm turned up; petting the cat with a free hand (#242) the palm
                       strokes it (`cat.petHand()`, its own spare hand only while you hold something) and `player.kneel` crouches;
                       E (main.js `use`) reaches towards the target and back with the fingers opening. The detail culler (#189) looks again whenever the held thing changes (`refresh()`)
src/pingping.js        Pingping (#269, PINGPING): the penguin cushion between the pillows in the Sovrum 1 bed, a Thing (kind 'pingping'):
                       held in both arms (hand.js `handPose: 'hug'`, `hugGrips`; the left arm = the right one mirrored); click /
                       "Krama" hugs (pulled in + squashed, sfx.squeak, rising hearts, stats pingpingHugs); `soft` = may go down on
                       the bed's / sofa's `soft` surfaces too (furniture surfaces with `soft: true`: not for cups, not cat tables)
src/beer.js            the big beer (BEER, #117), a Holdable: served on the lounge table when you sit in the lounge sofa,
                       click / "Drick" drinks a gulp (the level drops), back on the table = full; cups drink too
src/book.js            the book on the side table by the armchair (BOOK, #140), a Holdable: click / "Läs" opens
                       #book-panel (a spread; A D / ← → / click turn pages, E / Esc close; reading mode)
src/things.js          bottles and glasses (#152): furniture builders list `userData.things` (wine rack, BESTÅ), each
                       becomes a Holdable: take, stand on a table, back in its own place. Bottle: `drink`, tips while it
                       pours; Glass (#167): with something that pours in the hand (`drink` + `pour(secs)`), E on a glass
                       standing out pours (DRINKS.pour.glass); click / "Drick" sips; back in the BESTÅ = empty; a full
                       vessel's target has `blockedText` ("Vinglaset är fullt") instead of "Lägg ifrån dig …"
                       Trinket (#182): the secretary's things (`trinket()` in furniture.js, origin at the bottom centre, merged
                       per material); home = a local spot in its drawer (`homeParent`), so it rides along; its back box sits
                       in the drawer, raycasts only while held and is blocked ("Öppna lådan först") while the drawer is shut
src/drinks.js          what a glass / cup holds (DRINKS, #166): `Contents` (amounts per drink, pour over a second, sip in
                       proportion, mixed colour weighted by `tint`), `pourAmount(vessel, drink, fill)`, `GlassLiquid` (a
                       lathe up to the level inside the glass's inner profile, `inner` from furniture.js); colours mix in
                       sRGB, milk uses its `withCoffee` colour in coffee (café au lait)
src/secret.js           the secret drawer (SECRET, #183): all surprises (SECRETS in furniture.js) are Trinkets in it, one shown;
                       each open draws a new one by weight (never the same twice, rare ones pling, stats.secrets/secretKinds),
                       at most `keep` left lying around (older ones go home hidden); `&secret=i` picks the first one
src/milk.js            the milk carton in the fridge (MILK, #168), a Holdable at `fridge.milkAt`: E with the fridge open
                       takes it, it pours milk into glasses and cups (DRINKS.pour); not hidden with F, only sent home
                       #382: it holds MILK.ml and loses what it pours (a vessel's share of DRINKS.ml); empty ("den tomma
                       mjölkkartongen", `drink` null) it is a package for the bin (`discard`: gone until the fridge is opened
                       again after being shut, then full at home); its amount is kept with the life sim (`life.keepPart('milk')`)
src/saber.js           the lightsaber in Sovrum 2 (SABER), a Holdable; the blade burns marks where it cuts in (#96)
src/rifle.js           the AK-47 (#196, RIFLE): a folding-stock AKMS lying in NORDLI's wide bottom drawer (a Trinket, KINDS.rifle,
                       rides with the drawer); click = a shot, held (`trigger`: mouse button / the touch button) = automatic;
                       hitscan from the eye → a 'hole' mark (marks.js), the lawn target scores, the cat meows; after RIFLE.mag
                       the empty magazine drops to the floor and a full one clicks in; F clears the dropped magazines
src/target.js          the Nerf target on the lawn behind the hedge (TARGET, #99): rings × distance bonus, "+N" badge,
                       a score board beside it (localStorage 'lunden.target'), E clears it; it rises out of the grass
                       only while a holdable with `hitsTarget` (blasters, lightsaber, wands) is in the hand and sinks
                       under it otherwise (#144, #179); saber cuts and wand magic on it score too
src/basket.js          Tilly's basketball (BASKET): a Holdable in a wall holder over her daybed; click shoots it on an arc
                       through the point you look at (near the rim: at the rim, coming down at `entry`), right click / the
                       🏀 button (#power-btn, its icon = the held thing's `altIcon`) dribbles; out of the hand it bounces off
                       every raycast surface (`marks.segment`, glass and doors too), rolls out, lies still (placed), and is
                       caught when it passes the hand (or E). `Hoop`: a portable hoop on the asphalt west of our entrance,
                       up while the ball is out of its holder (rises like the Nerf target), analytic collision (rim, board,
                       pole, base); down through the rim = a basket (stats baskets / threes from beyond `three` m)
src/marks.js           marks on surfaces (MARKS, #96): `hit(from, to)` = first surface on a segment (glass, doors, lids
                       → none; the cat → meow), `add(kind, hit)` / `burn(hit)`; one ring buffer, an InstancedMesh per
                       kind (burn, glow, star, butterfly, splash) with a per-instance fade, a Points puff of smoke;
                       `magic(hit, eye)` = the wands' stars + fluttering butterflies (#97); darts splash paint (#98)
src/breaking.js        shooting things to pieces (#263, BREAK): glasses, bottles, cups, the jug and the beer are registered
                       (`breaker.add(item, kind)`); Marks.hit with `{ weapon }` (rifle / dart / saber / wand; `glass: true` =
                       the bullet goes through window panes) smashes one standing in the way (not held; darts only `light`
                       kinds): `item.shatter()` (Holdable: hidden, no E target; a cup goes 'spare'), shards in two pooled
                       InstancedMeshes (glass / china) that bounce once and fade, a 'splash' of what it held, sfx.shatter,
                       a cat near meows; `mend()` after BREAK.back s or F. Stats shattered (first per kind) + shatterRange
                       (`Breaker.points`: distance × weapon)
src/trigrid.js         world-space triangle grid per big static mesh, so short segment hits skip three's full raycast
src/remote.js          the TV remote on the coffee table (REMOTE), a Holdable: click = next programme (on if off),
                       right click / ⏻ (touch) = power, on the TV in the look direction (not through walls)
src/toys.js            Nerf blasters (#236: pistol, drum, long — rounded profiles merged per material) + darts (Sovrum 2), magic wands + sparkles (Sovrum 3), the flashlight
                       (hall wardrobe; one always-present SpotLight), all Holdables (TOYS)
src/cups.js            coffee cups (CUPS): the wall cabinet over the Moccamaster opens; a cup is taken straight into the
                       hand (empty, brewed or not, #141), put down on a table / worktop / floor, back in the open cabinet
                       with E on it; the jug is a Holdable (Jug): E on a standing cup pours, E on the hot plate puts it back;
                       a cup holds a Contents (drinks.js): milk and whisky pour in too (DRINKS.pour.cup); coffee + whisky =
                       `kask` ("koppen med kaffekask", sips count as stats.kask, #169);
                       patterns (#215, `DESIGNS`, CUPS.designs; `&cups=i,j,k`): opening the cabinet puts a cup of a new pattern on
                       every empty shelf spot (a spare from the pool, or the one put down longest ago past CUPS.maxOut); spare
                       cups are out of the scene (state 'spare'); a cup put back keeps its pattern; F: none out, three in
                       steam (#216, CUP_STEAM): a few swaying wisps in one mesh per cup while it is hot (`heat`: fresh coffee 1,
                       cools over CUP_STEAM.seconds, milk cools it), leaning back when the cup moves
src/fishfingers.js     fish fingers (FISH, #162): a carton on the freezer's lower shelf; E takes one straight into the hand
                       (FishFinger, like a cup), click / "Ät" bites (FISH.bites, shorter each time, sfx.chew), put down
                       anywhere / taken again / E on the carton puts it back; F clears them away and refills the carton;
                       fried (#214): E on the pan on the hob lays one in (FISH.fry.slots, not with the chicken), frozen pale →
                       golden after fry.seconds, burnt + smoke from burnAt; fried ones steam, crunch, never go back in the carton
src/drawing.js         crayon drawing on the paper on the Sovrum 3 desk (DRAWING): canvas texture, drawing mode
                       (view down, pointer free, palette #draw-panel, 1–9, E/Esc back), saved in localStorage;
                       "Ta teckningen" / T takes the sheet into the hand (a blank one stays), E on the desk puts it back
src/posters.js         drawings taped up (#176): HeldDrawing (the sheet in the hand, shares setHeld) and Posters — E on a
                       wall (near a wall outline, or a material with userData.poster) / the fridge or
                       freezer door (child of the door, swings with it) tapes it up if the whole sheet lies flat on one
                       mesh (9 probes); also the underside of a top bunk (material userData.posterCeiling, #199: facing
                       down, the picture's top = the viewer's screen-up, rec.up; within REST.reach.lie when lying in the
                       lower bunk); one plane + canvas texture with tape per poster; max DRAWING.maxPosted; IndexedDB
                       'lunden'/'drawings'
                       E on a poster (kind 'poster') opens #poster-panel (#177, reading mode): Släng (S) / Ta ner (T) /
                       Stäng (E, Esc, ×); Ta ner keeps its id, put back without taping = back up where it was
src/paperball.js       a drawing thrown away (#177): crumpled in front of the camera, thrown, bounces on the floor (walls:
                       the level's collision segments), shrinks away after DRAWING.ballSeconds; not saved
src/idb.js             the shared IndexedDB 'lunden' (version 2: catPhotos + drawings) — every module opens it here
src/cloud.js           the shared world (#178, #119): inert unless CLOUD_URL (config) is set on the published site, or the
                       page has &cloud=<url>. Taped-up drawings (posters.onPut/onDelete) and the desk sheet (drawing.onSaved)
                       go into a queue (localStorage 'lunden.cloud.queue', kept offline)
                       sent in order; a pull at start (`cloud.ready`), every minute and on tab focus merges the server in
                       (newer `updated` wins; synced drawings missing on the server come down). Cat photos are personal and
                       never synced (#211). Silent; &sync=debug logs
src/leaderboard.js     the global leaderboard (#198), only with the cloud on: optional name on the start screen (#lb-name,
                       never blocks starting; localStorage 'lunden.name', a random 'lunden.playerId'), the top list there
                       (#lb-start) and under the stats (setStatsExtra); the score (stats.js totalScore, SCORE in config) is
                       POSTed as text/plain when changed, every LEADERBOARD.every s, sendBeacon when hidden; names escaped
cloudflare/            the Worker (NOT published on Pages): worker.js (API, limits, CORS, admin emergency brake), wrangler.toml,
                       setup.sh (the user's one-command setup: login, KV, deploy, ADMIN_TOKEN, CLOUD_URL into config),
                       dev.mjs (the same Worker on Node with an in-memory KV, for tests), README.md (Swedish, for the user);
                       .github/workflows/cloud.yml redeploys on cloudflare/** changes when the repo has Cloudflare secrets
src/calendar.js        the cat calendar (CALENDAR): a cat per month, the days, the chosen date; #cal-panel picks it
src/todo.js            the TODO post-its on the fridge door (#340, TODO_NOTES): loadTodo (data/todo.json, else
                       todo.sample.json), sorted by `byPriority` (high → medium → low, oldest first; no `prio` = low,
                       #431), `cleanTitle` (an issue title → a short phrase), one canvas atlas on one plane (a child of
                       the door, kept clear of drawings via posters.reserved); each note: the text, `#N` small top right,
                       a muted "pågår ✓", 🐞 / ★. Only a teaser (#431): no E target (the plane is out of raycasts), no
                       list to read; F keeps them
tools/todo.py          the open issues → data/todo.json at publish time (stamp.sh); `Lapp:` line, kind, in-progress,
                       `prio` from the `priority: …` label (none = low, for the post-its only), sorted like loadTodo
src/fridge.js          the fridge: hollow, lit, opens with E (in world.lids); `shelfSpot` = the chicken's place; the freezer is
                       the same class (`freezer: true`, #161): drawers + shelves, the changelog note rides on its door;
                       open past FRIDGE_ALARM.after s it beeps and a red LED blinks (`onAlarm` → a deduction, #288; the note
                       open pauses the freezer's timer, `paused`); F shuts both
src/catboard.js        cork board in the kitchen (under the wall clock): a real-size Polaroid (offscreen render, #225; the board's
                       size follows from CAT_BOARD.polaroid / cols / rows / gap) of every petted cat,
                       CAT_BOARD.max of them in IndexedDB 'lunden'/'catPhotos', captioned with name + time; E opens
                       #board-view (BoardPanel, #170: keep 📌 = red pin, never pushed off; throw away 🗑 asks twice;
                       arrows/S/Delete; frees the mouse like drawing); a full board drops its oldest unkept photo
src/shelves.js         kitchen wall shelves (WALL_SHELVES, #291; raised to 1.85 / 2.25 m in #333 for the framed print "THIS KITCHEN IS FOR
                       DANCING" 40 × 50 under them, a FURNITURE `pictures` item drawn on a canvas: `paint` / `print`): cookbooks, glass jars, lathe-turned stoneware (speckle map),
                       brass candlesticks, a mortar, a cutting board, framed prints (one canvas atlas); merged per material;
                       the white face pot with wire glasses and faux baby eucalyptus hair (#343, `WALL_SHELVES.facePot`, lower
                       shelf, 'krukan med glasögonen'; it replaced the eucalyptus vase) and the trailing pothos are Things (kind 'plant', #185)
src/keycabinet.js      the IKEA LINDBYN mirror Ø 110 (living room since #205), the hall's IKEA NISSEDAL mirror (#226; a second upstairs, #332), IKEA SKOGSGRÄNSEN
                       over the secretary (#265, `SKOGSGRANSEN`: tinted glass + a tint overlay, copper bars below the horizon)
                       + the hall's Solstickan key cabinet (E) with the Renault key (E → beep beep);
                       the cabinet is in world.lids, the key (world.carKey) a target only while it is open
src/sillplants.js      flower pots on every inner window board (SILL_PLANTS, #136): five merged meshes, a loose item;
                       `userData.pots` / `rebuild(away)` / `potModel` let one pot be lifted out of the merge (#185).
                       #290: big lush plants (`leafShape` leaves; pelargon, orchid, violet, cactus, ivy, basil, monstera,
                       pothos, fern, olive), squeezed short of the blind's pack (`sill.blind`, `clear`) and the reveal;
                       ivy / pothos trail over the board's edge (`trail`; lying flat round the pot once taken)
src/plants.js          SillPot (#185): each window-board pot is a Holdable; its own model is invisible at home, shows (and
                       the merged meshes are rebuilt without it) once taken; the side-table flower and the kitchen shelf's
                       vase / pot plant are plain Things (kind 'plant'); window boards are put-down surfaces too
src/aborg.js           the JYSK ABORG café set outside the kitchen window (#406, ABORG): a folding table + two folding chairs (seats)
src/randers.js         the JYSK RANDERS tray table by the armchair (#405, RANDERS): tray, rails, straight legs, a low cross
src/huego.js           the Philips Hue Go on Sovrum 1's window board (#409, #428, HUE_GO): the classic frosted bowl, a lamp of its own; its
                       action menu (#367, an ActionSet; FloorLamp `options`) = Tänd/Släck + Byt färg (scenes), the colour kept by keep.js
src/laptop.js          Tilly's laptop on the vanity (#283, LAPTOP): an unbranded rose-gold laptop with stickers; `Feed` draws "Klipp",
                       an invented short-video app (no real brand / people) on a canvas — eight canvas clips (`CLIPS`) in a phone
                       column, user, caption, likes, progress bar — swiping up every `swipe` s; two E targets (kind 'laptop'): the
                       screen (on, then the next clip) and the keyboard (on / off); a quiet beat per clip (sfx.beat), the Sonos
                       ducked within `near` m; each clip kind counts once (stats `clips`); F / toggleFurniture switches it off
src/nest.js            smart speakers (#325, NEST): a smart display (screen + fabric base) on the kitchen window board and two round
                       ones in wall mounts (living room by the patio door, the upstairs hall), our own plain look (no logo); builders
                       `nesthub` / `nestmini`, E target kind 'nest'. `Nests` (main.js): E wakes one (four white dots / the screen),
                       sfx.nest chime, then a random answer never the same twice in a row (`choose`): the game's time (`timePhrase`),
                       date, weather, the coffee, jokes, Lund / Höje å / cat facts, pep, silliness, or a sound (fanfare, drum roll,
                       boop); speech = Web Speech sv-SE (silent when muted), a bubble over a round one, a caption card on the display;
                       the display idles with a clock + weather icon, Miele's photo now and then, dimmed by night (canvas redrawn on
                       change); the Sonos ducked while one talks near; stats `nest` (first per speaker); F hushes / hides them
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
src/pineapple.js       Livia's pineapple mirror in Sovrum 3 (#412, PINEAPPLE_MIRROR): an extruded oval frame with a scale bump map,
                       a crown of leaves with a herringbone bump, an oval glass with its own Reflector ('ananas')
src/signs.js           hand-lettered name signs on the bedroom doors (DOOR_SIGNS)
src/water.js           running water: E on a tap/shower (world.taps from interior.js) → stream + hiss
src/handwash.js        washing the hands (#437, HANDWASH): a running basin tap (not a shower) with a free hand offers a menu
                       ("Tvätta händerna" | "Stänga av …", main.js `tap.options`): both hands rub under the stream (hand.js
                       `rub`, sfx.handwash) and are wet (`setWet`: glossier skin + drops) until dried or after `wetFor` s;
                       E on a towel ("Torka händerna på …", kind 'towel': the bathrooms' and Tvätt's `towelhooks` towels,
                       hooks.js `towelTarget`, and the kitchen towel on the oven's handle bar, built here) dries them, the
                       towel swings; stats handwash / handdry; F: dry. Not saved
src/turbo.js           Kaffeturbo (#217, TURBO): TURBO.cups cups' worth of coffee (cups.js passes the coffee per sip) within
                       TURBO.window real seconds → `player.boost` = TURBO.speed (indoors too) for TURBO.seconds, the fov wider,
                       #turbo ("Kaffeturbo!" pops, then a small label with a bar) + #turbo-edge rainbow glow, our own
                       CC0 chiptune (generated fallback; Sonos ducked meanwhile); real time (`turbo.now`), `&turbo`
src/sonos.js           music in the SYMFONISK speakers (#187, SONOS): six CC0 channels, two recordings each, one mix
                       → a panner per speaker (walls / the other floor muffle), #sonos-panel (⏮ ⏭ ⏯ volume, reading mode);
                       `Composer` (channel sub-mix + scheduling) is shared with the car's `CarRadio` (#268).
                       Real music (#416): a channel's `tracks` (files in music/, licences in music/CREDITS.md) stream through
                       an <audio> + MediaElementAudioSourceNode into its sub-mix, fetched only when it plays (`trackSrc`
                       picks .ogg / .mp3 by canPlayType); a failed / refused file falls back to the generated music; the
                       panel / car screen show "title – artist". Twelve CC0 recordings (under 20 MB, 64 kbps Opus + MP3, mono; ten full tracks, two 120 s excerpts),
                       checked/downloaded 2026-10-07. Titles/artists/source links/licences/edits in music/CREDITS.md and
                       music/index.html ("Om musiken" in the start/pause menu); original hashes in music/sources.json.
src/music.js           shared lazy MusicFile transport: format fallback, 8 s stall timeout, release media on stop;
                       MusicLoop for the positional PC/laptop and non-positional Kaffeturbo (faster near the end).
                       MUSIC in config selects tracks; the original sound effects stay synthesised. PC game/film gets
                       game/ambient music; TVs have no programme audio and remain silent. tools/musictest.html checks
                       every real Opus/MP3, audible samples, lazy loading, failed formats, mute and loop cleanup;
                       tools/musicintegrationtest.html covers appliance playback, radio rotation, shutdown and fallback
                       (click its Starta musiktest button with a real browser/Playwright click to activate iframe media)
src/stats.js           visitor statistics (localStorage), "+1" badges per event, the HUD panel
                       (hidden; Tab held / T / 📊 shows it; touch, #245: narrower than the right-hand controls, scrolls with a
                       finger — touch.js ignores #stats — ⤢ full screen in columns, ✕ closes; rows go into #stats-body)
                       The score (#197/#198): `totalScore()` from SCORE in config shows top left (#score, `renderScore` after
                       every count) with a "+N" when it grows. Balanced (the user): you can grind for ever, but easy repeats give
                       little and rare / hard things a lot — `each` = points per event, `first` = per distinct thing the first
                       time (`bump(key, n, id)`, main.js `idOf(thing)` = name + position; doors, lamps, seats, taps, fronts,
                       songs, rooms, new cat coats) and `again` (fractions) every time after, `breeds` = per cat by how rare
                       its breed is, `secrets` = per surprise kind (+ rare kinds); `rawScore()` unrounded. Repeats show no badge
                       Deductions (#288, SCORE.penalties, `penalize(key, sub)`): the fridge/freezer door alarm (and more while it
                       beeps), food burnt, the smoke alarm, a spill (E on a full glass/cup with a pourer: it runs over, a splash),
                       a cat shot / cut / hit (by weapon); a red "−N reason" by the score, `stats.penalties` counts, the "Avdrag"
                       row; a deduction takes at most what the score has (`penaltyPoints`): never below 0, no debt. The
                       leaderboard gets the net score (the Worker keeps each row's best)
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
src/detail.js          DetailCuller (#189): far-away small meshes and things inside the flat hidden by its walls (seen from
                       outside) go to a layer the camera does not render; roots with `userData.moving` (our car, the cat,
                       darts, the basketball) are judged every update, not only when the camera moves (#267)
src/life.js            the life simulator (epic #364) glue; the `&life` developer scenario (#365). What it builds on:
                       docs/livssimulator-inventering.md (the inventory: reuse / extend / missing per system).
                       `Life` (__app.life): the instances (`life.items`) + a view per instance, `LifeItem` (#366) = a Holdable
                       whose model follows the instance's place (world → `life.group`, a loose item; hand; a store slot's or a
                       carrier's anchor) and state (`view.show`); take / placeAt / putBack move the instance (never lost: home,
                       else where it last lay, else at your feet)
                       The kitchen's food (#373, LIFE_FOOD: `stock` [type, store, slot] + `amounts`): a cheese, a cucumber and a
                       butter in the fridge, frozen peas on the freezer's lower shelf beside the fish fingers, a bread bag in the
                       pantry, labels of our own (lifemodels.js `label`). `life.restock(store)` gives every stock entry with no thing
                       of that type and home left anywhere a fresh one in its home: at the start of a visit (after `restore()`) and
                       whenever a store is opened after being shut (life.update) — never while the old one is in the hand / out / half used
                       The tools (#374, LIFE_TOOLS.stock, same restock): the kitchen knife, butter knife and cheese slicer on the
                       utensil drawer's towels, the cutting board on its long edge against the splashback between sink and hob
                       (store 'boardRack', only the board, "Ställa skärbrädan på sin plats")
src/tasks.js           optional everyday tasks (#392): TASK_NOTE card on the kitchen worktop opens a Swedish panel (E/click/touch).
                       Domain events prepared/bite/ate, washed/dishwasher, wipe, rubbishOut and vacuumed complete goals in any
                       order; real kitchen worktops only, empty bins need no disposal. Sets deduplicate goals; life.keepPart('tasks')
                       saves progress without replaying bonuses on load. SCORE.first.tasks=30 per task id, again.tasks=5 after
                       explicit "Gör igen"; stats.tasks counts completions. Hints toggle persists as lunden.taskHints.
                       The panel releases pointer lock, closes with its button/E/Escape, and permits touch scrolling.
                       Browser regression: tools/taskstest.html (actual cooking, cloth and vacuum, permutations, save, UI/score).
src/cooking.js         the life sim's kitchen work (M1): actions judged by the tags of the held tool and the food (LIFE_TOOLS.uses:
                       tool tag → food tag, `label`, `not`): the wrong tool is a blocked row "Osthyveln skär inte gurka", nothing used;
                       a new tool = an ITEMS entry with a 'tool:…' tag (ITEMS `noun` = the indefinite form in messages)
                       The cutting board as a station (#375): a cut (action 'cut', the Runner, LIFE.cut.seconds) needs the board on a
                       worktop (`life.worktopAt`, world.js's kitchen surfaces carry `userData.worktop`: "Lägg skärbrädan på
                       arbetsbänken först"), the food on its spot 0 (along the back) and a free result spot (two rows of four in front;
                       none: "Brädan är full", nothing used); a food's ITEMS `cut: { into, g }`; held at a plate, 'pushSlices' moves
                       the board's slices over (as many as fit)
                       Cutting (#376): 'cut' / 'cut3' ("Skära en skiva" / "tre skivor", LIFE.cut.seconds each): the knife chops down
                       per slice (sfx.chop), each cut exactly `cut.g` off and one slice of exactly that (the mass balance); the last
                       `cut.end` g are the end ("gurkänden", `items.namers`, `life.isEnd`: no slice, a scrap); stats cucumberSlices;
                       the slices' faces show the seeds (a canvas texture)
                       The bread bag (#377): 'open' takes its clip off; 'dispense' (ITEMS `dispense` / `dispenseLabel`, LIFE.dispense)
                       "Ta en brödskiva" — one at a time into a free hand, the loaf shorter, 0 = an empty package (pkg 'empty') that
                       stays. A thing with ITEMS `bites` is eaten with a click / the touch button ("Äta", LifeItem `useLabel` /
                       `onUse` → action 'eat', LIFE.eat): to the mouth, a bite off (the slice's outline rebuilt with bite marks),
                       sfx.chew; the last bite removes it; `life.emit` / `onEvent` domain events 'bite', 'ate'
                       Butter and cheese (#378, LIFE.butter / LIFE.slice): 'dab' — the butter knife at the open pack takes LIFE.butter.g
                       (the knife's `machine.load`, a yellow lump; the pack empty → pkg 'empty'); 'spread' — onto a slice of bread
                       anywhere but the hand, the bread's first part { type: 'butter', amount } (a yellow film, lifemodels.js
                       `sandwichLayers`); 'slice' — the cheese slicer at the block on the board / a worktop: a cheeseSlice of
                       ITEMS `slice.g` (on a free board spot / beside the block), the last one is what is left and the block goes;
                       the tools turn `clean: 'used'`
                       A sandwich (#379) = a slice of bread with `parts` (butter, cheeseSlice, cucumberSlice in order, any mix, at most
                       LIFE.sandwich.max): 'addTopping' — a slice in the hand onto the bread is removed and becomes a part of exactly
                       its amount (moved, never copied); named from its parts (`items.namers.breadSlice`: "ost- och gurkmackan",
                       "ostmackan", "gurkmackan", "smörgåsen"); three plates (LIFE_TOOLS.stock) stand in the wall cabinet over the free
                       worktop (store 'plates', interior.js stock 'platesLife': its static stack left out)
                       Eating it (#380): taken off a plate it remembers it (`machine.plate`); each bite gives that plate crumbs (clean
                       'used', the plate's `crumbs` shown) and a 'crumbs' event; the last bite emits 'ate' { name, parts, amount } and,
                       with anything on it, bump('sandwiches', 1, name) — SCORE.first per combination ("Du gjorde en macka!"), then
                       `again`; put back half eaten it stays (and is saved). A LifeItem's meshes a `show()` builds later (layers) get
                       its E target too (`refresh`)
                       The bin under the sink (#381): an ITEMS 'bin' (`fixed`: no "Ta", a target only with something in the hand) in
                       store 'sinkBins' — the grey bin behind the bins' door (interior.js gives that front `bin`: its bottom centre,
                       size; the anchor is scaled to it, the model built 1 × 1 × 1: "Avfall" label, a rising heap); 'throwAway' with
                       the front open: `life.wasteKind` = 'package' (an empty one) / 'food' (the end, slices, leftovers) — else "Det
                       där ska inte slängas"; amount += ITEMS `binVolume` (else 1 / 2) up to `capacity` ("Avfallshinken är full",
                       the waste stays in the hand); `parts` count the kinds (for LIFE-022). Another bin = a store slot + a stock entry
                       A non-life holdable is waste too when it has `wasteKind` + `discard()` (the empty milk carton, #382)
src/waste.js           the life sim's rubbish (M2). #386: three bins under the sink (game categories): ITEMS 'binFood' Matavfall
                       (green, store 'binsFood', behind either door), 'binPack' Förpackningar (small blue, 'binsPack', the left
                       door, `leftDoor` on the bins' front), 'bin' Restavfall (grey, 'sinkBins'); ITEMS `sort` / `label` / `bag` /
                       `fullText`. 'throwAway' names the bin ("slänga gurkänden i matavfallet"); the wrong one: "Gurkänden →
                       Matavfall", the waste stays in the hand (LIFE.rules.strictSorting; false = in it goes with a note);
                       scraps only into Matavfall. A bin with something in it is a target with a free hand: 'tieBag' "Knyta ihop
                       påsen" → an ITEMS 'rubbishBag' in the hand with the bin's amount + parts (moved), the bin empty with
                       `machine.nobag`; 'newBag' "Sätta i en ny påse" (off the roll: no item). items.js ITEMS_VERSION 2:
                       MIGRATIONS[1] splits a saved single bin's food / packages into the new bins
                       #387 `buildDropoff` (__app.dropoff): the drop-off by the car park's east end (LIFE_WASTE.dropoff, a game
                       spot, *guess*): three underground containers with a lid per category (life targets, `dropoff` = the
                       sort; their outline is collision + an obstacle polygon); 'dropBag' "Slänga matavfallspåsen i
                       matavfallsbehållaren" — only a rubbish bag ("Bara soppåsar här"), its own category while sorting is strict;
                       the bag is removed (one emptying, one reward: stats rubbishOut), the lid lifts and lands with a thud.
                       items.js `serialize` leaves out a default amount and a home that is the slot it is in (#387: the reload
                       record stays under reloadtest's limit; `create` gives both back)
src/dishes.js          the life sim's drinks and dishes (M2): #382 the drinking glass (ITEMS 'glass', amount = ml of drink up to
                       `capacity`, `machine.drink` 'water' | 'milk', one at a time): three at the front of the glass cabinet's lower
                       shelf (store 'glasses', LIFE_TOOLS.stock; kitchenstuff 'glasses' keeps its front row free); held at a running
                       basin tap the tap's rows (main.js wraps `tap.options`: life rows + handWash's) offer 'fillWater' (to the brim,
                       LIFE.drink.fill, "Dricksglaset är fullt") and 'pourOut'; the milk carton in the hand on a glass standing out
                       'pourIn' (LIFE.drink.pourMl, never over the brim, "Häll ut vattnet först", "Mjölken är slut"); 'drink' = a
                       click / "Dricka" (LIFE.drink.sip ml, the glass used, stats water / milk); the level is drinks.js GlassLiquid
                       #383 cleanliness (`clean` 'clean' | 'used' | 'dirty'; lifemodels smears, the glass's milky film, the cup's
                       ring): food on a plate / the board = used, eaten off a plate = dirty + `machine.crumbs`, a cut dirties the
                       knife and the board, butter / cheese the butter knife / slicer, milk drunk the glass, a sip the coffee cup
                       (cups.js `dirty`, keep.js `u`); 'scrape' (a plate at the open bin: its food + crumbs in, still dirty);
                       'wash' at the running kitchen tap (LIFE.wash.taps / seconds: a scrub + sfx.handwash, then clean; food on
                       it / a drink in it first); stores with `cleanOnly` (utensils, plates, glasses, boardRack) and the cup
                       cabinet refuse a used / dirty thing ("Diska den först") while LIFE.rules.washFirst (`life.rules`, free play
                       = false); 'pourOut' empties a coffee cup too; stats washed / scraped. items.set: a machine field set to
                       null is removed
src/dishwasher.js      the dishwasher (#384, DISHWASHER): `buildRacks` (interior.js's DM unit) — two wire racks, Openable 'drawer's
                       in world.lids ("Dra ut / Skjuta in underkorgen"), `blocked` while the door is up ("Fäll ner luckan först");
                       the door is blocked while a rack is out ("Skjut in korgarna först"); a cutlery tray rides on the upper rack.
                       Each rack's `slots` (world pose, size, accepts) become stores.js 'dwLower' (6 plates on edge), 'dwUpper' (6
                       glasses upside down), 'dwTray' (4 tools); a store's `refuse(item)` (life.js putIn): not `dishwasherSafe`
                       ("Skärbrädan diskas för hand"), the wrong rack ("Tallrikar i underkorgen", "Glas i överkorgen", "Bestick i
                       bestickkorgen"), food / a drink left (refused: "Skrapa av … först", "Häll ut … först"); taking needs the door
                       down and the rack out ("Öppna diskmaskinen först", "Dra ut … först"). Coffee cups (src/cups.js, #455)
                       can also be parked in the upper rack ('dwUpper', upside down) and come out clean after a programme.
                       `DishProgramme` (#385, __app.dishProg): E on the panel (a pick box on the door's top band, `door.panelAt`)
                       "Starta diskmaskinen" (door shut, something used / dirty in it) → running for DISHWASHER.seconds of game
                       time: sfx.dishwasher (hum + swishes), a red spot on the floor, an LED; the door opened = paused, shut = on
                       with the time left (the panel's row shows "Diskar – 0:42 kvar"); done: sfx.pling + "Disken är klar", stats
                       dishwasher; only what was in it at the start and still is becomes clean; nothing added while it runs /
                       is paused (refused); kept with the life sim (`x.dishwasher`: state, time left, the ids); a running one
                       holds back the auto-update (main.js); F stops it (nothing washed)
src/actions.js         what you can do with a life-sim thing (#367): `ActionSet.define({ id, label, applies, check, run, consumes,
                       result, duration, interrupt, order, quiet })`, `list(ctx)` = the rows with a Swedish `reason` when blocked
                       ("Öppna kylen först", "Tallriken är full", "För långt bort"); life.js `baseActions`: putOn, take, open, close.
                       main.js: a life target (kind 'life', `options()`) with one row = the usual prompt / button; several = #choices
                       (mouse & keyboard: a list under the crosshair, E = the marked row, 1–4 pick, the wheel moves the mark; touch:
                       a big button per row instead of #action); a life thing up to LIFE.tooFar past reach says "För långt bort"
                       Timed actions (#372, `Runner`, life.runner): an action with `duration` > 0 runs validate (check) → reserve (its
                       inputs `lock`ed, its output places promised in `items.reserved`) → animate (game time: step's dt) → commit at
                       `commitAt` (the check again, then consume + create in one step) → done; an interruption before the commit uses
                       nothing, after it the result stays. life.update interrupts on a hand change or walking LIFE.job.walk m off;
                       main.js on F and sitting down; locks / promises are never saved; the prompt shows "Skära en skiva … 40 %";
                       a running job holds the automatic update back
src/items.js           the life sim's things as data (#366, ITEMS in config), no three.js: instances with a stable id
                       ('cucumber#3'), exactly one place (world | hand | slot of a store | on a carrier), an amount in g / ml /
                       count never below 0, pkg / prep / clean / machine fields; `check(item, place)` = the Swedish reason it
                       can't go there (a shut store, too big, taken, a carrier on itself); `move`, `consume`, `remove`, `audit`
src/stores.js          the life sim's storage places (#369, LIFE.stores): slots with a size class registered with items.js (`addStore`)
                       + an anchor per slot (life.anchors) — the fridge's free glass shelves and door bins (on the door), the freezer
                       (on the frozen bags of its top basket), the pantry (the wall cabinet beyond the hob, interior.js stock
                       'pantry': boxes / jars at the back, slots in front) and the utensil drawer (on its towels). Anchors sit in the
                       front's contents group (contents.js: ride with a drawer, hidden while shut). A pick box per store is the target
                       "Lägga … i kylskåpet" (action putIn) while a life item is held; shut: "Öppna kylen först", full: "Fryslådan är
                       full" — nothing moves. interior.js `stock()` leaves `o.stockFrame` (the contents box, `at(u, d, y)`, `yaw`)
                       Carriers (#370): an item type with `carrier` { slots, size, accepts, spots (per-spot accepts / size: the
                       board's spot 0 = what is being cut, 1–8 = slices), order, fullText } holds others ('on' places, models on its
                       anchors: they ride when it is carried, put down or put in the fridge — `carriers: true` stores only); never on
                       itself or on what lies on it; actions putOn (the held thing onto a carrier) and loadOnto (a plate in the hand,
                       E on a slice: onto the plate)
                       Saving (#371): `items.serialize()` / `load(rec)` — versioned (`ITEMS_VERSION`, `MIGRATIONS[v]`), tolerant: an
                       unknown type is skipped (logged with &debug), a thing whose store / carrier / slot is gone goes home, else onto
                       the free worktop (LIFE.save.lost), a record with nothing readable keeps what is there. It lives in two places:
                       keep.js's `life` part (page-made reloads: everything, the hand too) and the persistent `lunden.life` key
                       (life.js `flush`, LIFE.save.every s after a change and on pagehide; `restore()` at the start of a visit, empty-
                       handed — the home's stock is kept between visits, nothing is used up or goes bad while away). Never with &life
                       (`persist: null`); "Återställ" clears it (not in RESET_KEEP) and blocks the last write (`resetHome.going`)
src/lifemodels.js      the life sim's models (#366): plate, cutting board, cucumber, slice, cheese, butter, bread bag, bread slice,
                       knife, frozen peas (#373), butter knife, cheese slicer (#374), drinking glass (#382: `level(kind, ml)`) — own shapes, labels of our own (`label`); `show(item)` shows the amount / package; carriers have `anchors` (their spots)
src/mess.js            crumbs and dust (#388, LIFE-024, M3; LIFE_MESS): spots { kind crumb | dust | smear, level, x y z, surf worktop |
                       table | floor, room, amt 0…1 } drawn as one InstancedMesh per kind (flat canvas decals in life.group, a fuller
                       spot bigger; never a raycast target). Crumbs from the life sim's 'crumbs' event (`fromEvent`): a bite (on the
                       table / worktop under the food, else the floor at the eater's feet — the flat's floors only, where player.js
                       `isFree` with LIFE_MESS.margin says the visitor reaches, else `nearestFree`), a cut on the board (beside it on
                       the worktop), a slice out of the bread bag; dust now and then (`update`: one bit every dust.every s near a
                       wall, at most dust.perRoom spots a room). A spot near another of its kind grows (merge); past `max` the
                       nearest grows instead: never unbounded, the draw calls fixed (perfcount's "mess cap" line). `take(x, z, r,
                       { level, y, rate, kinds, ok })` removes it (the vacuum, the cloth), events 'add' / 'take'. Saved by amount as
                       the life record's `x.mess` (keepPart). Off: LIFE.rules.mess = false or `&mess=0`; &life starts clean
src/changelog.js       changelog list + the note on the freezer (newest `t` first, "Nytt" by the highest `t` seen, #341; E to read; `scrollNote`: ↑ ↓ / W S, PageUp/Down, Space,
                       Home/End scroll it, the wheel is passed on under pointer lock, #275)
src/install.js         iPhone "add to home screen" sheet (no fullscreen API there); install link
                       where the browser offers beforeinstallprompt
manifest.webmanifest   web app manifest; icons/ = icon.svg rendered to PNG (192, 512, apple-touch 180)
                       + qr-site.svg, the start screen's QR code to the site (#193; made with OpenCV's
                       cv2.QRCodeEncoder, level M, and checked with cv2.QRCodeDetector on a screenshot; hidden on phones)
data/plan.json         GENERATED — do not edit by hand
data/changelog.json    what changed, for visitors (see Workflow rules)
tools/extract_plan.py  PDF → data/plan.json (stdlib only)
tools/walktest.html    headless movement test (+ #355: round the block, the stairs, the recess, the portik, sprint, nearestFree; #417: garage door → the
                       turn → the big hall → our stall → the basement door → the Hisshall; #415: the portik → down the stairwell → the garage lobby → up to
                       våning 3 → the loftgång)
tools/touchtest.html   headless touch-input test (synthetic pointer events); the choice menu (#367, &life): the butter's two rows as
                       buttons, a tap opens it without turning the view, a number / E pick, one action = the usual button, slice → plate
tools/cattest.html     headless test of cat placement behind every door/wardrobe; up on seats, beds and tables (#200)
tools/roomtest.html    headless test of room detection at known points (+ a picture of the fill)
tools/measuretest.html headless test of the tape measure (wall to wall in the living room)
tools/watertest.html   headless test: aim at every tap/shower, turn it on and off; at every basin wash the hands (#437: the menu,
                       rubbing, wet), the tap off next, dry them on the nearest towel (it swings), counted once; drying by itself
tools/lighttest.html   headless test: aim at every light switch / floor lamp, toggle it
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter, the photo; then it walks off and is gone)
tools/mieletest.html   headless test of Miele (#328, &miele): her coat, first sight (fireworks, +1000, once), taken up (both hands, not
                       hit by a shot), the board photo "Miele", a hug, not on a table, down on the floor → walks off, found again
                       (+100), F while held, the rarity (seeded draws, ~1 in 180) and the lock
tools/scoretest.html   headless test: points from 0, a door (again: a little), the grill, a fish finger the cat eats, cats by breed
                       (+ a new coat), 100 sips (no cap), a basket / a three, secret kinds (+ rare), the balance; deductions (#288):
                       the fridge alarm (+ longer, the note pauses the freezer), a burnt fish finger, the smoke alarm, a spill, the cat
                       shot (hiss, flight, once, no cat for a while), never below 0 / no debt, the red "−N"; reset
tools/todotest.html    headless test of the TODO post-its (#340): the sample loads, sorted by priority (no label = low,
                       #431), on the fridge door (swing with it), no E target / no panel, no drawing over them, F keeps
                       them, cleanTitle
tools/notetest.html    headless test of the changelog note ("Nytt", read/close, no walking, swings with the freezer door;
                       scrolling keys, a W held from before ignored, #275)
tools/patiotest.html   headless test of the patio seasons (parasol, beers, snowman) + sofa collision; a cup on the cushion box's shut lid keeps it shut (#447)
tools/cartest.html     headless test: our parked car — open the driver's / passenger's door, the seat only then, sit inside looking
                       ahead, out by the door; the key shuts the doors first, then it drives off (#250); music (#268): seated, the
                       centre screen on / ⏭ / off, plays on outside (muffled with the doors shut), no target from outside, off as it leaves;
                       both routes keep the whole car on asphalt, clear of the bus stop and the stalls (#356); the garage's routes
                       (#358) too, in the garage clear of its parked cars and columns
tools/keytest.html     headless test of the hall key cabinet: open, car key reachable only then, beep; the car starts in its stall (#358),
                       comes out through the opened garage door, parks, leaves back into its stall, the door shuts
tools/clicktest.html   headless test of left click as E (#443): nothing under #arm, the freezer and a fish finger by click, put down on
                       the table where the ghost showed, a blocked target nothing, eaten by click / right click with nothing in focus,
                       the rifle still shoots at the freezer, seated a click does not stand you up, the remote's right click = power
tools/esctest.html     headless test of Esc on the start screen (click-to-start cover, ignored over the note)
tools/crouchtest.html  headless test: C crouches (Ctrl too, other Ctrl shortcuts prevented), seated C stands up, leaving mid-visit
                       asks (beforeunload), not on the start screen nor on a new-version reload (#274)
tools/updatetest.html  headless test of the update notice on a phone-sized touch screen (on top, 44 px, touch works);
                       `isNewer`: a new SHA with the same content hash is no reload, a changed hash is (#304; on a stamped
                       site it also checks the page's own version.json);
                       the countdown 5 … 1, cancelled by a key / mouse move / the stick / a touch, held back by brewing (#277)
tools/perfcount.html   draw calls / triangles at a few spots (compare before/after optimising)
tools/papertest.html   headless test: each toilet's paper holder — pull sheets out (the roll turns, max 4), tear the strip into the hand
                       (pulling blocked), throw it in the toilet (the lid opens, it flushes, counted, swirls away), F refills (#426)
tools/toilettest.html  headless test: flush both toilets (counted, not again until refilled), the lid still opens; mid-flush
                       the water has dropped, runs down the bowl and swirls, after it is back and still (#321)
tools/oventest.html    headless test: oven + microwave open/close (lamp inside), Moccamaster brews and clicks off
tools/tvtest.html      headless test: TVs on/off (living room + Sovrum 3), new programme each time, the remote, F off
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record;
                       the world kept (#277): the car still arriving then parks, a cup of coffee in the hand, the fridge open, lamps,
                       sitting, a bottle put down, the TV, the cat, the game's clock; a new tab fresh at the real time
                       the life sim (#371): an opened butter with 185 g, a cut cucumber + slices on the board, a used plate with half a
                       slice, then that plate in the hand across a reload; a broken life part harms nothing; lunden.life is written
tools/resttest.html    headless test: sit on every seat and lie in every bed (spot, no walking, up again looking the same way;
                       head turned, old spot behind: up in front, #202; every spot ahead / turned, from behind: free floor, #302; in every bed the eye clear of the bedding, #308; no two bedding surfaces within 1.5 mm, #335)
tools/stairtest.html   headless test (#352): equal risers from floor to floor, no jump along the walking line, the top tread at the
                       slab edge, head room, collisions by the treads' top / underside, the soffits, the Klk's things under the treads; the handrails
                       (#419): h over the nosings / the pitch, level extensions, returns, inside the walls' clearance, clear of
                       the walking line, switches, pictures and door swings
tools/stucktest.html   headless test (#314): a 5 cm scan of both floors (doors open; the free floor in one piece, pockets out of
                       reach listed), getting up from every seat / bed with the old spot inside it, F putting the sofa / bed back
                       round you, the car parking on you, the hoop rising under you, a door shut on you, a resume record in the bed
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
tools/falltest.html    headless test (#361): a 2.5 m drop is soft, a 5 m drop hurts (red, black, no walking, awake at the front door,
                       counted + a deduction); the stair up / down (also crouched), the ramp,
                       the outdoor stairs (#355), out of the top bunk, a resume record: no free fall
tools/rooftest.html    headless test (#360): placed on the loftgång (level, the railing, no way into the upper units, no pool light for
                       the flat's lamps, the culler hides its inside, the railing at the east end, both sides of the east drum's landing and by the west drum's doorway holds (#449), into both drums), our terrace (railing,
                       set-back wall, skärmvägg), Hus L's roof (a panel row, the loft in the way, off the edge onto the loftgång), Hus A's
                       slope and eaves, a canopy; the rain ends on each roof; the first visits counted
tools/jetpacktest.html headless test (#359): the jetpack on its hook beside the garage door, E puts it on (hands free, HUD), Space lifts
                       (the climb cap, flames, heat, the first flight counted), letting go falls, a soft landing, the ceiling, C down faster,
                       OUTDOOR's edge, onto Hus C's roof (counted), stood down there and on again, keep.js round trip, Hus L / Hus A hold,
                       overheating cuts out, a cut high up hurts (home on its hook), in through the front door = stood down outside,
                       F home, touch ⬆ and "Ta av dig jetpacken"
tools/pctest.html      headless test: switch the gaming PC on/off (game moves, RGB cycles), the chair is a seat and
                       starts the PC, the bunk seat swings the monitor round (film)
tools/sabertest.html   headless test: take the lightsaber, swing it, hang it back
tools/toystest.html    headless test: blaster (dart lands), wand (sparkles), flashlight (beam follows the view)
tools/wandtest.html    headless test: a wand's magic on the wall (stars + butterflies), none in the sky, gone after a while
tools/nerftest.html    headless test: a dart leaves a paint splash in the blaster's colour on the wall, drops, fades
tools/targettest.html  headless test: target points (rings × distance bonus), a dart in the bullseye, E clears the score;
                       down in the ground empty-handed, up with a blaster / the saber / a wand (#179)
tools/mirrortest.html  headless test: in front of every mirror its Reflector is the active one, on the glass (#139)
tools/booktest.html    headless test: take the book, read, turn pages, close, put it down, back on the side table
tools/beertest.html    headless test: sit in the lounge sofa → beer, drink it empty, back = full, a sip of coffee, F
tools/thingtest.html   headless test: a wine bottle to the coffee table and back to the rack, a glass, F sends them home;
                       pour wine into a glass and drink it empty, whisky splashes into a tumbler, back in the BESTÅ = empty
tools/milktest.html    headless test: the milk not reachable through the closed fridge, take it, back on its shelf, pour into a
                       glass, an empty cup and a cup of coffee (lighter brown), up to full, on the worktop, F sends it home
tools/secretarytest.html headless test: the secretary's flap (desk) and its 8 drawers open/close, the open desk blocks;
                       its trinkets (#182): the car to the coffee table stays when the drawer closes, back in it rides along,
                       its place blocked while the drawer is closed, the crayons, the owl, F sends them home;
                       the secret drawer (#183): 10 seeded opens never repeat, a surprise left on the table stays, SECRET.keep
                       #447: a cup down on the open desk (none on the shut flap), the flap does not close under it
tools/opentest.html    headless test (#384: the dishwasher's racks with their door down, behind the front while in): every Openable front (kitchen + furniture) opens/closes with the button; open, none
                       overlaps a closed neighbour or goes through a wall (#154); every kitchen front is stocked (or own/empty)
                       and its contents are hidden when shut and never out through the front (#229); the same for every
                       other front with contents (#230, #231)
tools/bestatest.html   headless test: the BESTÅ display cabinet's six doors open/close, its spots (down over the front) and the
                       lit glass section switch with the room (#191)
tools/holdtest.html    headless test: put things down (coffee table, dining table, floor), one at a time, F → home; the preview
                       (#368): the cup's ghost on the grid inside the table, ⟳ / R turn 45°, looking away cancels, down as the ghost;
                       the hand (#195): hidden when empty, at the saber's grip, a reach out and back; Pingping (#269): take him
                       (both hands on his sides), a hug (squashed, counted), onto the sofa (not a cup), back in the bed, F
                       the fruit bowl (#326): an apple bitten three times then eaten (counted), a pear on the dining table, an
                       orange back in the bowl, a cup not into it, F refills it
tools/cuptest.html     headless test: an empty cup out without brewing, onto the worktop, brew, take the jug, pour, jug back,
                       carry the cup to the dining and coffee tables, a cup back into the cabinet; whisky in a cup of
                       coffee (#169): a splash, a warmer colour, never over full, drunk up as kaffekask
tools/fishtest.html    headless test: open the freezer, eat a fish finger, put one on the dining table and the floor, one
                       back in the carton (it counts down), F clears them and refills it; the cat walks to one on the
                       floor (on all four: up first, hips raised, every leg swings, sits to eat, #224) and eats it,
                       ignores one on the table, stops when it is taken up first (#163)
tools/drawtest.html    headless test: drawing mode, a crayon line from pointer events, clear, E back, saved
tools/grilltest.html   headless test: light the grill (flames, light, lid), F keeps it, put it out, it burns out by itself
tools/cooktest.html    headless test: the induction hob on/off (glow), F switches it off; the pan: drawer → hob → drawer, F; the chicken:
                       fry, smoke, the fridge shut stops it, it stops by itself, F; fish fingers fried, eaten, burnt (#214); raw/golden, no hood → the alarm, the hood
                       on → quiet, break a leg off and eat it, eat it all, F whole again (#194); the air fryer: turned 45°, the basket out diagonally on the worktop (#296), three in, start,
                       countdown, paused while out, golden + "End", one out and eaten, burnt in a third run (smoke, the alarm), F (#287);
                       Aviko fries (#301): the bag from the freezer, two portions poured (a third does not fit, no fish finger with
                       them), golden, "End", steam, a bunch and three bites, burnt + smoke + the alarm, F
tools/postertest.html  headless test: take the drawing (blank sheet stays), back on the desk, tape it up in the hall and on
                       the fridge door (swings with it), none on the kitchen window, reload → both back; look at one (panel, no walking,
                       ×/E close), Släng → ball lands and vanishes, out of storage; Ta ner → taped up elsewhere; lying in each lower bunk:
                       taped under the top bunk, facing down, can be looked at from there (`?shots`, `?panel`)
tools/sonostest.html   headless test: music in all three speakers, songs, volume, panel, pause, upstairs, F; each channel
                       rendered offline (only outside --virtual-time-budget; there it says SKIP)
tools/boardtest.html   headless test: keep / throw away cat photos, a full board, the panel (needs a big virtual-time budget)
tools/detailtest.html  headless test: from the doorstep through the open front door the hall's doors are drawn (#210); inside
                       every Entréplan door is on a drawn layer, open or shut; outside the culler still works
tools/planttest.html   headless test: lift pot plants (window board → table, side table → window board, the shelf; the face pot to the
                       dining table and back on its shelf, #343), F home
tools/baskettest.html  headless test: the daybed's drawers (shoes, hair things), take the ball → the hoop rises, dribble and
                       catch, a throw at the wall stays in the room, shots from 4 m (a basket) and 7.5 m (a three), a miss, F
tools/rifletest.html   headless test: the AK-47 rides with its drawer, 30 shots of automatic fire leave bullet holes, reload,
                       the magazine on the floor, a click = one shot, a shot in the lawn target scores, F
tools/breaktest.html   headless test: the AK-47 breaks a glass on the dining table from 2 m and ~8 m (shards on the table, a wine
                       splash, more points far away), the timer mends it, a dart breaks a glass but not a bottle, the saber a
                       bottle, a held glass is not hit, none through a wall, a cup goes, F mends all (#263)
tools/toastertest.html headless test (#401): the toaster in its shut drawer is blocked, open → take → on the worktop upright; unplugged
                       refuses, plugged in at the corner wall socket (and the hob–sink one, #442), toasts (glow, the update waits, counted), pops, STOP, taking unplugs, too far
                       refuses, back in the drawer rides with it, F, a page-made reload keeps it plugged in
tools/turbotest.html   headless test: Kaffeturbo with an injected clock — three cups in five minutes (not spread out, not milk /
                       whisky), faster indoors, the text, more coffee adds time, over again; `walktest.html?turbo` walks at that pace
tools/terracetest.html Hus L's roof terraces (#350): one per upper flat, areas vs 10/11/12 m², the joins at the loft and
                       the gables, the railing's top over the finished deck
tools/streetlighttest.html headless test (#434): the street lamps' ground pools hidden by day, lit at night (on the ground),
                       no flicker just under the switching level, out in the morning; #433: eight front-door lights, off by
                       day, lit after dusk, their pools outside the house
tools/terraintest.html headless test (#346): the courtyard = the reference level, S2's level differences kept, the ramp's
                       ends / the stairs' feet / the garage drive meet their ground, no ground rises past a retaining wall,
                       every plinth reaches the ground, no unguarded step > 5 cm in OUTDOOR (5 cm grid; a stair's riser
                       is a step, the inside of an Å-hus is skipped, #355); no tree on asphalt or paving (#435)
tools/weathertest.html headless test: showers per season, thunderstorms only in late summer, a shower ramps in; with &weather=storm:
                       drops (none inside Hus L), grey sky, a flash and back, ⛈ in the HUD, people in; snow only in winter, hail in
                       spring / storms, snowflakes not in Hus L, walking 20 m out in it counts once, not indoors; clear = no rain
tools/gabletest.html  Hus L's gables (#351): each opening tagged with side / storey / end flat, inside its storey (not in a
                       slab), its wall's extent and clear of the spiral-stair drums; no overlaps; the special cases kept
tools/greettest.html   headless test: "Hälsa på grannen" on the bench sitter, your line, the answer, the wave, counted, not through
                       Hus A, a walker stops and turns to you (#247)
tools/curtaintest.html headless test (#342, #362): Sovrum 1's curtains open at the start, one stack each side (the west one by the west wall
                       and clear of the RÅGRUND chair, both off the glass, #403), E opens the sideways strip, no walking, ◀ draws both together
                       symmetrically until they meet in the middle and no further, D parts them, A at `speed`, scores once, the daylight cut, the teal glow, a reload
tools/blindtest.html   headless test: a blind in every window, folded at the start, dark upstairs / light downstairs; E opens the
                       mode (no walking), ▲ up to the head and no further, S down to folded, W at BLINDS.speed, the first pull
                       scores, the room's daylight cut (blackout > white), white glows, × / E close, the sash opens behind it,
                       the state survives a reload
tools/laptoptest.html  headless test: Tilly's laptop (#283) on with E on the screen, swipes by itself and with E, every clip kind
                       counted once, off with the keyboard, not through the wall from Sovrum 2, F
tools/nesttest.html    headless test (#325): aim at the display and both round speakers, press: an answer, the wake light, the
                       caption / bubble, the (mocked) speech call, counted, the Sonos ducked, quiet after; 300 presses never repeat;
                       the time answer follows the game clock; the weather; muted = no speech; not through a wall; F hides them
tools/kittentest.html  headless test of kittens (#363): the seeded draw (~KITTEN.chance, never Miele), found (stats, points, badge), smaller
                       with paws on the floor, plays on the spot, a pat (kittenPets, more points, the photo marked), a pounce then a
                       fast scamper, a cup on the floor batted over (no deduction), hurt: faster and a bigger deduction
tools/clocktest.html   headless test of the wall clock (?time=7, spool, pause, sun height by month)
tools/calendartest.html headless test: today's date at the start, pick a date on the calendar, the sun follows
tools/resettest.html   headless test of "Återställ" (#303) against `node cloudflare/dev.mjs 8144`: Avbryt / Esc change nothing; the
                       home's keys and resume / F5 records go, the queue, drawings (wall, desk, server), score, name and cat
                       photo stay, START at the real time with the notice; the queued drawing still goes out; a later reload fresh
tools/cloudtest.html   headless test of the shared world against `node cloudflare/dev.mjs 8144` (start it first): PUT on
                       taping, someone else's drawing appears, DELETE on throwing, thrown elsewhere → gone here, offline
                       queue, desk sheet, cat photos neither sent nor fetched (#211), a fresh visitor gets them, the
                       leaderboard (name, score, escaped list, a capped cheat), off without &cloud
tools/actiontest.html  headless test (#372): the plan's cutting action through the Runner — a double press consumes once (−10 g,
                       one 10 g slice), interrupted before the commit nothing is used, after it the slice stays, a save mid-action has
                       no locks, the last 4 g, a full board; in &life: the menu, F / walking off / the hand changing stop it, keepWorld
tools/storetest.html   headless test (#369): the stores' slots; the shut fridge refuses ("Öppna kylen först"), open: in, taken out with E
                       and back in with "Lägga osten i kylskåpet", not through the shut door; a full freezer keeps the thing in the hand;
                       the knife rides with the drawer, hidden while shut; reopening never duplicates; F → its home slot; the pantry
tools/itemtest.html    headless test (#366): items.js with plain asserts (two instances, amounts never < 0, one place, carriers,
                       stores, events, carriers without cycles) and the view in the game (&life: take the cucumber, half used = half as long,
                       down, F; a plate loaded with bread + two slices: carried, put down turned, in and out of the fridge, one taken off)
tools/lifetest.html    headless test of the life sim's M1, the sandwich flow (#373 …): the stock in its places named in the prompt, the
                       cucumber out and back, used up → a fresh one on the next opening (never while the old one is out), a new
                       visit keeps the amounts (lunden.life); each tool taken and put back with E, the board off its place and
                       back, the wrong tool's messages with nothing used (#374); no cut off a worktop, a full board, the board carrying
                       its slices, pushing them onto a plate (#375); one / three slices, the chop, the mass balance, fast presses,
                       slices taken one by one, the end, a reload (#376); the bread bag closed / opened, slices down to 0 and no
                       further, the empty bag stays, a slice on a plate, one eaten plain in four bites (#377); a dab and spreading
                       (exact grams, the layer, double presses), cheese slices on the board and the worktop, the last bits (#378); a
                       plate from the cabinet, toppings moved exactly once, names, the layer limit, carried to the table, a reload (#379);
                       seated at the dining table: taken in reach, bites, put back half eaten, the used plate, 'ate', points once (#380);
                       the bin (front first, it fills, full, no knife / plate) and the whole M1 flow in the visitor's own home with a
                       page-made reload in the middle (#381)
tools/life3test.html   headless test of the life sim's M3, clean the home: crumbs from bites on the floor at the feet (one spot that
                       grows, its room), over the table, beside the board after a cut, saved and loaded by amount, dust near the
                       walls where you reach (per room), the cap, the automatic mess off / &mess=0 (#388). `?only=388` runs sections
tools/life2test.html   headless test of the life sim's M2, reset the kitchen: the drinking glass from its cabinet, filled at the
                       running tap to the brim (half-way nothing, double presses), sips, used, milk from the carton up to the brim,
                       no mixing, the carton running out, thrown away and back full, poured out at the tap, the carton saved (#382);
                       used / dirty plates (crumbs, smear), refused in the cabinet, scraped into the bin, washed up by hand
                       (half-way nothing, walking off), the knife and board after a cut, free play, the glass's film, the coffee
                       cup's ring and its cabinet, a record (#383); the dishwasher's racks: door / rack blocking, the right rack,
                       scrape / pour out first, the board by hand, riding along, a full rack, a shut door blocks taking (#384);
                       the programme: refused empty / door down, the panel, the time left, paused, nothing added mid-run, a
                       glass taken out stays dirty, a record, done = clean, unloading, F (#385); three bins: the wrong one names
                       the right one, free sorting, tying the bag (moved, not copied), a new bag, an old single bin migrated (#386);
                       the drop-off: the whole cycle out through the front door, the wrong container, one emptying per bag, only
                       rubbish bags, again with a new bag, the containers collide (#387). `?only=383,385` runs sections
tools/inventorytest.html headless test (#365): the `&life` scenario's start state, the visitor's records untouched, the
                       integration points the inventory names; without &life the game starts at START
tools/stamp.sh         build the published site with a version stamp (used by CI)
tools/changelog_stamp.py the published changelog.json (run by stamp.sh): `t` per entry from git history, newest first,
                       a warning on duplicate / out-of-order ids (#341)
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
  south of Hus C (z 41…47) with an asphalt drive from Karpvägen (#357: walkable inside, src/garage.js — layout guessed), stairs down to the park level (`terrain.stairs`:
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
  the kitchen window: the 60 × 60 × 71 table 3 cm off the façade under the sill (the top-hung sash swings out over it; the little
  flower — a Thing, back on 'cafébordet' — on its street half, out of the sash's sweep) and a put-down surface, the two chairs
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
  (80 × 124 × 50, `malm`, #235: 2 small + 4 big, clothes inside) with its back against each bunk's foot end on top (`MALM_DECO`, item `deco`) a themed lamp of its own (a Death Star in Sovrum 2, a unicorn in Sovrum 3) and
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

## Running locally

ES modules + `fetch` need HTTP (not `file://`):

```
python3 -m http.server 8137    # in the repo root → http://localhost:8137/
```

URL parameters (debugging / screenshots):

- `?at=x,z,yawDeg[,pitchDeg[,feetY]]` — place the camera. yaw 0 = north (−z), 90 = west,
  180 = south, −90 = east. `feetY` = 3.25 for Övre plan; on the roofs (#360): 6.4 the loftgång (`?at=3,0.8,-90,0,6.4`),
  9.46 a terrace (`?at=3,11.5,180,0,9.46`), 12.75 Hus L's roof between the panel rows (`?at=3,5,0,0,12.75`).
- `&shot` — hide the start overlay.
- `&open` — open every door, cabinet door and drawer (screenshots of open doors / wardrobes / furniture).
- `&cat=x,z[,yawDeg[,y]]` — show the cat there; `&miele` — Miele instead (with `&cat=`), else the next cat to turn up is her (#328); `&catv=i` coat variant, `&catt=s` animation time, `&catwalk` walking (#224), `&cattail` its tail up (#262);
  `&kitten` a kitten (#363; with `&cat=`, else the next cat to turn up is one).
- `&time=HH[.h]` — start at that hour (default: the browser's time), `&month=1–12`, `&day=1–31` (default: today), `&freeze` pauses the clock,
  `&clock` opens the wall clock's strip,
  `&lights` turns every lamp on, ceiling lamps too, and keeps the small ones on (#234).
- `&jetpack` — the jetpack on your back (outdoors, #359).
- `&weather=rain|storm|snow|hail|clear` — force the weather (#248, #249).
- `&blinds=0…1` — every pleated blind drawn up that far (#273; not saved).
- `&fries` — golden, steaming fries in the open air-fryer basket (#301).
- `&toaster` — the toaster out on the worktop by the corner, plugged in and toasting (#401).
- `&mess=0` — no automatic crumbs or dust (#388, LIFE.rules.mess).
- `&life` — the life simulator's developer scenario (#365, `src/life.js` `devScenario`, `LIFE.dev`): everything at home and
  shut (not with `&open`), no cat, noon paused (unless `&time`), the visitor in the kitchen, an empty cup + the milk on the worktop, a wine glass
  on the dining table; life items on the dining table and in the drawer (`LIFE.dev.items` / `stored`) + the kitchen's stock, fresh (LIFE_FOOD, #373). The resume / F5 records are neither read nor written (`resume.js`), so the visitor's own place stays.
- `&warm` — run the start's shader / upload warm-up (#432) in headless Chrome too (it skips it otherwise).
- `&fall=h` — drop from h m (default 5) above the ground where you start (#361; with `&at=`): over 3 m it hurts.
- `&hoop` — the basketball hoop up out front. `&car` — our car parked in front of the house. `&water` — turn on every tap and shower. `&tv` — switch the TV on. `&laptop` — Tilly's laptop on. `&secret=i` — the secret drawer shows surprise i (SECRET.items, with `&open`).
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

In a cloud session (no `google-chrome`, cdn.jsdelivr.net blocked): `python3 tools/devserve.py [port] [root]` serves
the checkout with three.js from the npm tarball (cached in ~/.cache), and Chrome is Playwright's
`/opt/pw-browsers/chromium --no-sandbox` (same flags as below). Such a VM has ~4 CPUs: run at most ~3 headless test
runs (agents) at a time, more only slows every one down. `/orkester [område]` (.claude/commands/orkester.md) runs a
session as an orchestrator that works through the open issues with subagents under these rules.
Several orchestrators (separate VMs) sync through issue #420 (label `orkester`, kept off the fridge notes): each keeps
one status comment there and reserves whole chains with `in-progress` + a comment on each issue.

`python3 -m http.server` sends no Cache-Control, so a headless Chrome reusing a profile may serve an *old* copy of a
module that hasn't changed for a while (heuristic caching) — give each run a fresh `--user-data-dir=$(mktemp -d)`.

To test the update notice locally: `tools/stamp.sh /tmp/site abc1234`, edit
`/tmp/site/version.json` to another version **and another `content` hash** (only a changed hash reloads, #304),
serve `/tmp/site` and load it.

Run the walk test after any change to walls, doors, stairs or player movement, and the touch
test after input changes. Headless SwiftShader renders only a few frames per second, so tests
drive `window.__app.step(dt)` / `Player.update` directly instead of waiting on frames. Take
screenshots into the session scratchpad, not the repo.

**Scope the tests to what the change can reasonably affect** (the user: save time and tokens, don't run the whole
suite every time):
- the test(s) for the feature you touched, plus a new or extended test for new behaviour;
- every test that refers to what you moved or renamed: `grep -l` tools/*.html for the config key, builder, module or
  the old coordinates (e.g. moving the Sovrum 1 bed must run tvtest, which aims at the bed's TV);
- walktest / stucktest only when walls, doors, collision, furniture footprints, terrain or player movement changed;
  touchtest only for input changes; perfcount only for geometry that adds meshes / materials.
- Not the whole list "to be safe"; a pre-existing failure you happen to see goes into an issue, not into your change.

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
- Walking (#224, `CAT_WALK`, `pose` in cat.js): the cat blends between two poses (`POSE.sit` / `POSE.stand`, size-1 local
  metres; the legs are turned, tapering `limb`s, #241): it rises in `rise` s before it walks (fish fingers, leaving after a pat) and sits down again when it stops;
  standing, the hips (hind legs on hip pivots: haunch + a hock pivot with shin and paw) are at shoulder height, the back
  level, the tail up. Behaviours set `wantStand`, call `stride(m)` for the diagonal-pair gait and put head offsets in
  `headOff`; `pose` runs after them every frame (the tail tube is rebuilt only while the pose changes). `&catwalk` (with
  `&cat=`) = walking on the spot.
- Tail up (#262, `CAT_TAIL_UP`, `updateTail` / `tailIdle` in cat.js): now and then (sooner while it is on its feet, and
  `leave` of the times it walks off after a pat) the cat gets up, raises its tail straight up (`TAIL_UP`, blended over either
  pose; the tube is rebuilt while `tailU` changes), turns round on the spot and a small dark X (`parts.butt`) shows under the
  tail root; sitting it never does, a pat lowers it. Seen from behind (`buttFacing`: within `cone`° and `dist` m, main.js
  `checkCatButt`: on screen, not `behindWall`) it counts once per tail-up (`tailPeriod`): stats `catButts`, SCORE.first per cat.
- Miele (#328, `MIELE` in config, `MIELE_COAT` + the BREEDS entry 'Miele' with `superRare` in cat.js, src/miele.js): the family's
  own cat (the photo on the Sovrum 1 window board, #322), a brown mackerel tabby and white (docs/miele-foto-ram.jpg): the tabby
  is painted on canvases (`tabbyTextures`: the coat material's map — white below the middle, stripes, a white V up the face —
  and rings on the tail), the rest plain colours; amber eyes. Drawn by her BREEDS `weight` (~1 in 180 cats), never through
  `&catb`; `mieleLock` keeps a second one out until she has walked off. Named "Miele" always. First seen (main.js
  `checkMiele`: within `see` m, on screen, not `behindWall`) once per time she turns up: heart fireworks, a trill + pling,
  stats `miele` (SCORE.first 1000, again 100), "💖 Du hittade Miele!"; not counted as a found cat / breed. E takes her up
  (`cat.pickUp` into `MieleHeld.model` in the camera; pet only with the hand busy): held she sits, paws forward, looking up,
  no fish fingers / leaving / tail-up, out of the E and weapon raycasts (`cat.held`); click / "Krama" hugs (stats
  `mieleHugs`); her board photo the first time she is held or hugged. E on the floor / a bed / a sofa (`softOnly`: a table
  says "Miele får inte vara på bordet") puts her down (`putDown`): she looks at you, meows, then `leave`s; F or another
  thing in the hand puts her down at your feet. Not kept across a reload while held / walking off.
- Every new cat gets a name (`CAT_NAMES`); petting it puts a photo on the kitchen board 0.7 s in
  (`CAT_BOARD` in config: under the wall clock on the Tvätt/Badrum wall, kitchen face; it and the calendar are
  positioned together, centred under the clock).
- Up on the furniture (#200, `CAT_FURNITURE`, `furnitureSpot` in cat.js): a cat turning up behind a door sits on a seat,
  bed or table top in that room `chance` of the time (one seen straight from the doorway within `reach`; the height from a
  ray down onto the furniture, so it sits on the cushion and never in something on a table; `cat.on` = 'sit'/'lie'/
  'table'). `chooseSpot` skips the seat it is on; after a pat it fades where it sits; it ignores fish fingers up there.
- Kittens (#363, `KITTEN` in config): a new cat (any breed and coat, never Miele) is a kitten with `KITTEN.chance` (~1 in 30,
  *guess*; `cat.kitten`, `setCat(breed, coat, kitten)`); the same parts and POSE re-proportioned by `shapeOf` (× KITTEN.shape:
  half size, bigger head / eyes / ears, short muzzle, short legs — `legs` lowers the body in `pose` — a thin short tail,
  fluffier); a squeaky 'kitten' voice (`sfx.meow` / `sfx.purr`); named from `KITTEN.names` or "Lilla …"; up on the furniture
  more often. It plays on the spot (`updatePlay`: pounce with `hopY`, tail chase, batting; never moves), after a pat may pounce
  at you (`leaving.pounce`) and runs `KITTEN.run` × faster (hurt too), and bats a cup standing on its floor over (`updateToy`,
  main.js `toySource` / `onTip`: emptied, a splash, no deduction). Stats `kittens` (SCORE.first / again) / `kittenPets`
  (SCORE.each, on top of `petted`), the "🐾 Kattunge!" badge, a "kattunge" tag on its board photo, `kittenShot` deductions.
- Hurt (#288, `hurt(weapon, from)`, CAT_HURT): a rifle bullet, a dart, the lightsaber or a wand's magic on the cat makes it
  hiss (`sfx.hiss`) and run off (`leave`, faster, no pat stops it), once per flight; no cat turns up behind a door for
  `away` s; `onHurt` → a deduction. Nothing graphic.
- After a pat (#206, `CAT_LEAVE`, `leave`/`updateLeaving` in cat.js) the cat turns, walks off away from the visitor along
  the clearest straight line (walls, doors, furniture) and fades out (its materials are transparent at opacity 1 all
  the time: no recompile); petted again on the way, it stays. The board photo is taken 0.7 s of game time into the pat
  (`cat.onPhoto`).
- Fish fingers (#163, `CAT_FISH`, `updateFish` in cat.js): a visible cat scans `cat.fishSource()` (the fish fingers
  lying out) for one on its own floor within `reach` with a straight, wall- and door-free path (= the same room),
  turns its head and meows, gets up and walks there, eats it (head down, it shrinks,
  `sfx.chew`, then a purr) and washes again; taken up first → it looks at the visitor. Petting, hide and a new spot
  cancel it. Counted as `catFish` in the stats.
- Interaction raycasts only test pickables, so `behindWall` in main.js rejects hits whose eye →
  hit line crosses a wall outline (`levels[i].wallSegments`) or a slab / ceiling outside the stair hole (`throughSlab`, #446) — no
  switching lamps through walls, no bed upstairs through the kitchen ceiling.
- Kitchen (#221): the under-cabinet LED ("bänkbelysningen", a rocker under the first wall cabinet after the cup cabinet)
  and the hood's light (a button on the hood's front) are lamps of their own in `world.lamps` (lights.js FloorLamp with
  `glows` = additive washes on the worktop/splashback, `light` = pool-light overrides), not the room's switch. #271: their pool lights sit under the cabinets / hood, weak and away from the tiles, the washes ease
  out and fade at the ends (`KITCHEN.underLights`), the splashback is matt (roughness 0.82) — no glare spots or hard edges.
  #285: the bench light is one continuous 1 cm strip behind the front edge of every wall cabinet (cup cabinet → sink →
  corner → the return over the corner unit), one even wash per run (ends at the hood cross-fade with the hood's wash, ends
  in the corner do not fade), and two weak pool-light anchors (FloorLamp `anchors`: [{ offset, height, light }], one
  candidate each), one over each run, so the sink is as lit as the hob end.
- Lights: switches are placed automatically by the latch side of each interior swing door (room
  side), snapped onto a wall outline segment that faces the room and covers the whole plate (`wallFace`,
  #76; lighttest checks every switch has a wall right behind it) plus `LIGHTING.manual` for open rooms and the downstairs Klk (door spans the whole wall).
  Lamp emissive parts use one material per room (`lampMaterials` in interior.js). Extra additive glows register
  with `addLampGlow` (switched by opacity); a material with `userData.lit` keeps its own lit colours (Sovrum 1's black
  string shade, `style: 'string'` in `LIGHTING.pendants`, #174). Never add
  per-lamp PointLights — reuse the pool (constant light count = no shader recompiles).
  Small lamps vs ceiling lamps (#234): everything in `world.lamps` (furniture `lights` + interior `mirrorLamps`: the floor
  lamp, the NYMÅNE work and bunk reading lamps, the SYMFONISK lamp, the BESTÅ spots with their washes — a lamp of their own
  now, E on a spot — the bench light, the bathroom mirror LED) is a `FloorLamp`; unless its spec has `auto: false` (the
  cooker hood's light) it goes on below `LIGHTING.auto.on` daylight and off above `.off` with a `fade` (also when the clock
  is spooled); an E toggle holds until that state next changes (`updateAuto`). None of that depends on where the visitor
  is, and since #276/#294 neither does how a lit lamp looks: its light in the shaders (`src/lampwash.js`) lights its room
  (furniture too) whether the visitor is near, in another room, on the other floor or outside (lit windows all night), and
  cross-fades with its pool light; the ceiling lamps have it too (#295: a room lit by its switch is lit from anywhere). A
  lamp spec's `wash` scales it. The lit parts of every lamp (materials tagged `userData.lamp` by lights.js) are never culled
  as small detail (#294). lighttest checks every room switch: glow, a pool light standing in the room, its wash on/off.
  The ceiling lamps start off and follow only their switches. The pool (`update`) gives the few lamps that matter real
  point lights (specular glints) instead of their shader light: candidates are scored by distance, × `poolPick.otherRoom` outside the visitor's room
  (rooms.js), × `hidden` behind a wall/door leaf (a lamp behind a wall in another room gets none: it would only shine
  through the wall), × `behind` for one behind the look direction (#276), ÷ `stick` for the lamp already held; a pool light that moves fades out and in over `poolFade`
  (the old nearest-4 jump made a lit room go dark as you walked out of it).
- Day cycle: `DAY` in config. Every visit starts at the browser's own time and date (#95; `&time` /
  `&month` / `&day` override, `&month` alone = the 15th); the date rolls over at midnight. The sun
  position is computed (declination, hour angle, equation of time, CEST in summer) for Lund and
  rotated into plan axes by `DAY.planNorth`. The wall clock in the kitchen (centred on the wall between the hall and the Badrum door, over the cat board + calendar) opens a strip at the bottom
  (`reading` mode, so no walking, but looking works): hold A D / ← → / ⏪ ⏩ to spool, Space / ⏸ pause. The
  date is picked on the cat calendar beside the cat board (`src/calendar.js`, `CALENDAR`): E opens
  #cal-panel, A D / ← → / ◀ ▶ months, W S / ↑ ↓ days (held keys repeat; a key already held while walking up is ignored), or click a day. The neighbours' windows are one instanced additive mesh with a
  random evening/morning routine per window (`buildWindowLights` in surroundings.js).
- Trees (#130): big old trees with several crown lobes by the school (`SITE.bigTrees`), slim young maples along our
  pavement (`treeAreas` `young`), a shrub row (`SITE.shrubs`); all lobes are one instanced mesh coloured by the season.
- Seasons (#73, `SEASON` + `src/seasons.js`): crowns get a colour per month (fresh, deep green, mixed autumn
  per tree, bare in Dec–Feb; some blossom in Apr–May) and in `SEASON.snowMonths` registered materials
  (`registerSnow`: lawn, park, roads, paving, hedges, roofs) turn white. Only colours/instance matrices
  change, once per month change (`applySeason` in the loop).
- Statistics (`src/stats.js`): cats found per coat, cats petted, doors, toilet lids, steps/metres,
  stair trips, time inside; reset on the start screen.
- Sound effects are synthesised and positional; music uses lazy CC0 recordings with generated fallbacks (#416). The AudioContext is started by the
  start-screen buttons (browser autoplay rules). M / the speaker button mutes.

## Input notes

- A visit starts outside, ~12 m in front of the entrance façade facing the house (`START` in config);
  the walkable outdoor area is `OUTDOOR` (#355): the whole block — in front of Hus L, behind it (our patio, out through
  the gap in the hedge), through the portik, round Hus A, B and C and down the stairs to the park level and the garage
  drive; Hus L's row is a wall except our façades; the neighbours' screen walls and hedges collide
  (`exterior.userData.segments`). walktest walks from `START` in through the front door and round the block.

- Start screen has two buttons: *Mus & tangentbord* (pointer lock) and *Touch* (joystick).
  A Surface has both, so the visitor chooses. Touch-only devices (`(pointer: coarse) and
  (hover: none)` → `body.phone`, set by an inline script in index.html) get a short start screen:
  no key list, one *Börja* button (= Touch). `&phone` forces it for screenshots.
- Esc on the start screen = *Mus & tangentbord*. Browsers don't treat Esc as a user activation, so
  it can't call requestPointerLock/start audio: it hides the start screen and shows `#arm` (see-through, a small "Klicka för att styra med musen" line, #190);
  the next click runs the same `startMouse()`. A refused pointer lock is retried once while the click still counts as a
  gesture, else `#arm` — never the start screen again. Ignored for 0.7 s after Esc frees the
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
  #274: the documented key is **C** (seated, C gets you up instead; its auto-repeats don't crouch), because Ctrl + W
  = the browser's close-tab, which a page cannot `preventDefault`. Ctrl still crouches, and while it is held other
  Ctrl shortcuts are prevented. In fullscreen made by the page (Touch start) `navigator.keyboard.lock(GAME_KEYS)`
  (Chromium) captures them, Ctrl+W too; released on leaving fullscreen. Mouse & keyboard is not forced fullscreen.
  Fallback: a `beforeunload` guard while visiting (not on the start screen); the page's own reloads (autoReload,
  "Ladda om") set `reloading` and pass.
- Never stuck (#314): `player.isFree(x, z, level)` = clear of every segment (walls, doors, furniture, moving parts) by the
  radius + a margin, inside no `obstacles()` (furniture footprints + `world.movingPolys`: the parked car, the hoop's base) and
  not in the stair hole. Collision is segments only, so a visitor put inside an obstacle (F putting the furniture back, the car
  parking on you, the hoop rising, a resume record) could never leave: `unstick()` (first thing in `Player.update`) glides
  them at `PLAYER.unstick` to `nearestFree` (spiral search, not through a wall or door); a resume does it at once. `&debug`
  logs each one. The gap at the foot of the double bed (past RÅGRUND) to the window side is only ~8 cm wider than the
  visitor: passable, but aim for it.
- Sit / lie (#71/#72, `src/rest.js`, `REST`): builders put `userData.rest = { kind: 'sit'|'lie', name, verb,
  spots }` (local x, seat/mattress y, z, optional dir); buildFurniture turns them into E targets
  (`world.furnitureTargets`). E picks the spot nearest the look ray (not one the cat sits on), the camera
  glides there (lying: looking at the ceiling), walking is off and looking is clamped; E / "Res dig" puts
  you back where you stood (including upstairs: `spawn()` alone would drop you to Entréplan), looking the way you looked while
  seated (lying: level); if your old spot is behind you, on a free spot in front (`standSpot`, #202); a spot counts as free only outside every furniture
  footprint (`levels[i].footprints`) and reached from the seat through no wall, window or other piece (`standFree`, #302: not on / over
  the dining table), else the old spot, else the nearest free one all round, else the nearest free floor; out of a bed the old
  spot whenever it is free (#314). While sitting / lying (#184) the
  focus works as standing but within `REST.reach` of the eye (not the seat itself, nothing to sit on): take the remote
  from the sofa, the book from the armchair, put things down within reach; E with nothing in reach, Space / C or the
  touch "Res dig" button (#stand-btn) get you up, keeping what is in the hand. Seats: the
  sofa (3 + the chaise), armchair, 4 dining chairs, the lounge sofa (3), RÅGRUND; beds: the double bed (2
  sides), both bunks (lower/upper), the daybed. F stands you up first.
- Left click as E (#443, main.js `click`, the only place it is decided; touch keeps its buttons): reading the book, the
  next page; in another panel nothing. Holding a weapon or the ball (`clickIsUse` on the class: the rifle, blasters, the
  saber, wands, the basketball) a click always fires / throws. Otherwise, with something in focus a click is E on it (open,
  take, put down where the ghost shows, pour, sit, pet, greet, the menu's marked row) — a blocked target: nothing (spilling
  is E's only); with nothing in focus it uses what you hold (eat, drink, hug, read, light), empty-handed or seated nothing
  (E / Space / C get you up). The jetpack's "stand it down" fallback is E's only. Right click = the held thing's `useAlt`
  (the remote's power, the ball's dribble) if it has one, else its use (eat, drink …). The prompt says "Klicka (E) för att
  …" when a click does it (+ " · högerklick: ät" from `useLabel`), "Tryck E …" while a weapon is held. The mousedown that
  takes the pointer lock (#arm, a click on the page) does nothing else: `locked` is still false then (tools/clicktest.html).
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
- Detail culling (#189, `src/detail.js`, `PERF.detail`): the exterior and new furniture had grown the start view to ~1200
  calls (the whole flat is in the frustum from the street). Small meshes that would look tinier than `k` are moved to a
  layer the camera does not draw (never nearer than `minDist`, so never within reach), and from outside the flat a mesh
  inside it is only drawn when the line to it passes a façade opening (the front door's leaf is solid while it is shut; open,
  the whole doorway counts, #210 — `tools/detailtest.html`). Start view
  1210 → ~410 calls, the other spots a little lower; screenshots differ by a few dozen pixels. Anything new that
  raycasts at small things far away must allow for layer 7. Anything new that moves by itself (while the visitor may
  stand still) and exists when the culler is built needs `userData.moving` on its root (#267).
- Warm-up (#432, `warmUp` / `warmRender` in main.js): the first time the flat's inside was drawn (the front door opened
  after a fresh start) three compiled the shadow-depth programs and uploaded the geometry / textures in one frame — a
  freeze of seconds. Three frames in (after lampwash's patch) `renderer.compileAsync` compiles every material's program,
  then one frame is drawn with every layer and no frustum culling (shadows too), behind the start screen. SwiftShader
  320 × 200: the door's first frame 5680 → 28 ms. Skipped in headless Chrome (`HeadlessChrome` UA) unless `&warm`;
  `&perf` logs its times. Materials made later (cups, cat coats) still compile when first drawn.
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
