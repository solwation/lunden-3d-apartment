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
The page polls `version.json` every minute; when it differs from `BUILD` it reloads by itself (#192, `autoReload` in
main.js): once the visitor has been still for 2.5 s (no keys/stick/mouse/touch, not walking, no panel, no music) the
picture fades out, the place is saved (resume record) and `?v=<new SHA>` loads, fading back in with "Ny version laddad";
only if they are never still for 5 min does the old "new version" notice (top centre) appear. Its buttons react to a lifted touch as well as a click (`onTap`,
#41), and "Ladda om" navigates to `?v=<new SHA>` so no cache serves the old page
(`tools/updatetest.html`). That button stores a one-time record (`src/resume.js`: position, level, view,
clock, input mode, mute, fullscreen; sessionStorage + localStorage, < 2 min) which the next load reads, deletes and resumes from (the place only — the clock and the calendar always
start at the real time and date, #143; not with `?at=`; a spot inside a wall falls back to START); F5 uses the running record below (a new tab starts at START).
A record made mid-visit skips the start screen (#181, `continueAfterReload`): touch plays at once (sound/fullscreen on the
first touch), mouse & keyboard gets the see-through `#arm` (the next click takes the mouse, #190); "Ny version laddad" fades out at the top after 3 s.
F5 (#203): while visiting, the place (+ view, mode, mute, `BUILD`) is written to this tab's sessionStorage every 2 s and on
`pagehide` (`saveSession`), so an F5 carries on the same way — the note only if the build changed; a new tab starts as usual.
An inline script in index.html's <head> sees a valid record with a mode before anything is drawn and sets
`html.resuming` (start screen hidden, a dark "Laddar…" cover) until main.js has resumed — or drops it on a bad record (#222).
A record made on the start screen (no mode) shows it with "Du fortsätter där du var" + "Börja från start". The start screen
always offers "Gå till startplatsen" (both also set the clock and calendar back to now, `realNow`)
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
textures/              image textures the page loads (published by stamp.sh): stair-pictures.jpg = the 2 × 2 atlas
                       of the stair pictures (#220), cropped/straightened from docs/tavla-trappa-*.jpg
material/              screenshots of our choices in Peab's option portal (local, see below)
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps
src/toilet.js          toilet (Ifö Spira 6260) with an animated lid and a flush button (`flush`, its own E target in
                       world.lids: dips, sfx.flush, the water drains and returns, no flush until refilled, #155)
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO)
src/courtyard.js       the courtyard on the garage box (COURTYARD): walks, pergolas, grill, sandboxes, boule,
                       benches, raised beds, instanced shrubs; collision for what you can walk into
src/grill.js           the courtyard's kettle grill (GRILL, #204): E lights it — the lid swings open, flame sprites, glowing coals,
                       sparks, smoke, crackle + roar, a pool light (lights.extra); out by itself after burnSeconds; F keeps it
src/surroundings.js    the site (SITE): Hus A/B/C + buildings around, roads, paving, the 3 m drop to the park,
                       Höje å, instanced trees, lit windows, cloudy sky
src/lights.js          room switches (E), ceiling lamps/pendant/spots/LED (by hand only), small lamps (FloorLamp:
                       E, and they switch themselves with the dusk, #234); a pool of 4 point lights goes to the lit
                       lamps that matter (own room, in sight, nearest), fading when it moves
src/street.js          Sankt Lars väg's details (SITE.street, #128): curbs, asphalt patches, street lamps (emissive at
                       night), zebra crossing, the site's temporary traffic light + warning signs, cobbles, autumn leaves; the bus stop,
                       the red "Flyttad" sign, a no-parking sign and HepCat's A-board (#129)
src/streetlife.js      life on the street (SITE.life, #113): the car park: one row of stalls along the shrubs (#208) with parked cars
                       (instanced, a colour each, collision); the front yard is asphalt up to the entrance paving, bikes by Hus L's entrances and in racks, the paved square with corten beds and
                       sitting steps in front of Hus C
src/people.js          people in the area (PEOPLE, #114): low-poly figures (one InstancedMesh per body part, a colour each,
                       posed every frame): walkers to and fro on the paths (a dog with one), cyclists on Sankt Lars väg
                       (sfx.bell when they pass close), kids with a ball and in the sandbox, bench sitters, someone on a
                       blanket (not in the snow months), neighbours on the loftgång; daytime only
src/daycycle.js        60-minute day: real solar path for the month (55.7° N), sun → moon light, shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock
src/patio.js           patio: Plantagen Oslo corner lounge set, parasol, planters with exotic plants
                       (furniture builders, FURNITURE + PATIO in config); seasons via Patio.update:
                       parasol folds at night/in winter, beers in summer, snowman in winter
src/wallclock.js       analog kitchen clock (WALL_CLOCK) + the control strip: spool A D / ← →, pause
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
                       interior.js builds the kitchen fronts, vanity drawers, the Stage 50 mirror cabinet, the laundry sink
                       cabinet, the washer/dryer doors and the hall's EL/C cabinet (`buildElCabinet`: fuse box, router) with it
                       (`openFront`, hollow `shell` carcasses); `contents` (a mesh): only drawn while the front is
                       (partly) open (#228)
                       furniture.js `addDrawer` / `addDoor` for furniture (NORDKISA, NORDLI, ALEX, IDANÄS foot end, BYÅS's two end drawers, #212)
src/stuff.js           what is inside wardrobes and drawers (#228, STUFF): `Pack` (tinted boxes merged into one vertex-coloured
                       mesh, no raycast), `garment`, `stack`, `rolls`, `shoes`; `wardrobeFill` (world.js: clothes on the rod,
                       hat shelf, shoes — by the room's person, `personFor`), `drawerFill` (addDrawer `fill`: tees, socks,
                       underwear, pyjamas, jeans, toys, crafts, nightstand). Sovrum 1: NORDLI, NORDKISA, IDANAS drawers;
                       Sovrum 2: wardrobe L; Sovrum 3: wardrobe G + ALEX drawers (#230)
src/ovens.js           oven (drop-down door) + microwave (side door) in the tall unit, E opens (world.lids)
src/hob.js             the induction hob (#158): E switches it on/off (the front zone glows, "9" on the display, a hum);
                       in world.lids, `world.hob` (`zone`, `on`) for the pan/chicken; stays with F but F switches it off
src/pan.js             the frying pan (#159), a Holdable in the middle drawer under the hob (`world.panDrawer`, a child
                       of the drawer while at home); E on the hob with it in the hand stands it on the front zone (`onHob`)
src/chicken.js         the roast chicken in the fridge (#160), a Holdable: E on the pan on the hob lays it in (a child of the
                       pan); fried on a lit zone for CHICKEN.cookSeconds it sizzles, browns and smokes (the smoke follows it)
                       until smokeSeconds after the heat, or at once back in the fridge with the door shut
                       (#194: raw it is pale `CHICKEN.raw`, golden once fried; cooked, E breaks off legs, wings, then body
                       pieces into the hand — `ChickenPiece`, a click eats it; F makes it whole and raw again)
src/hood.js            the cooker hood (#194, `world.hood`, in world.lids): E runs the fan (whoosh, green LED; its light is a
                       separate button = its own lamp, #221 — the fan does not light it, like a real hood) and
                       draws the chicken's smoke up into it; the smoke alarm in the kitchen ceiling (SMOKE_ALARM) beeps
                       and blinks red after `delay` s of smoke the hood does not take (`chicken.freeSmoke`); F: fan off
src/coffee.js          Moccamaster on the worktop (MOCCAMASTER): E brews (red light, sound, the jug fills)
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/rest.js            sitting / lying down (REST): seat & bed spots from furniture userData.rest, look clamp
src/holdable.js        things you take and hold (one at a time): home + pick box, held pose in camera space,
                       use = click / touch button / fast look; E on the home puts it back, E on a table top /
                       worktop / the floor (HOLD.reach) puts it down (`placeAt`, lying by its shape — `restPose`;
                       cups stand). While something is held other things are `blocked` ("Lägg ifrån dig …")
src/hand.js            the visitor's arm + hand (HAND, #195): two meshes in the camera, hidden when empty; holding a thing
                       the palm sits at its `grip` (or beside its box) and follows it; E (main.js `use`) reaches towards the
                       target and back. The detail culler (#189) looks again whenever the held thing changes (`refresh()`)
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
src/saber.js           the lightsaber in Sovrum 2 (SABER), a Holdable; the blade burns marks where it cuts in (#96)
src/rifle.js           the AK-47 (#196, RIFLE): a folding-stock AKMS lying in NORDLI's wide bottom drawer (a Trinket, KINDS.rifle,
                       rides with the drawer); click = a shot, held (`trigger`: mouse button / the touch button) = automatic;
                       hitscan from the eye → a 'hole' mark (marks.js), the lawn target scores, the cat meows; after RIFLE.mag
                       the empty magazine drops to the floor and a full one clicks in; F clears the dropped magazines
src/target.js          the Nerf target on the lawn behind the hedge (TARGET, #99): rings × distance bonus, "+N" badge,
                       a score board beside it (localStorage 'lunden.target'), E clears it; it rises out of the grass
                       only while a holdable with `hitsTarget` (blasters, lightsaber, wands) is in the hand and sinks
                       under it otherwise (#144, #179); saber cuts and wand magic on it score too
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
src/fridge.js          the fridge: hollow, lit, opens with E (in world.lids); `shelfSpot` = the chicken's place; the freezer is
                       the same class (`freezer: true`, #161): drawers + shelves, the changelog note rides on its door
src/catboard.js        cork board in the kitchen (under the wall clock): a real-size Polaroid (offscreen render, #225; the board's
                       size follows from CAT_BOARD.polaroid / cols / rows / gap) of every petted cat,
                       CAT_BOARD.max of them in IndexedDB 'lunden'/'catPhotos', captioned with name + time; E opens
                       #board-view (BoardPanel, #170: keep 📌 = red pin, never pushed off; throw away 🗑 asks twice;
                       arrows/S/Delete; frees the mouse like drawing); a full board drops its oldest unkept photo
src/shelves.js         kitchen wall shelves with portraits, flowers, books, candles (WALL_SHELVES)
src/keycabinet.js      the IKEA LINDBYN mirror Ø 110 (living room since #205), the hall's IKEA NISSEDAL mirror (#226) + the hall's Solstickan key cabinet (E) with the Renault key (E → beep beep);
                       the cabinet is in world.lids, the key (world.carKey) a target only while it is open
src/sillplants.js      flower pots on every inner window board (SILL_PLANTS, #136): five merged meshes, a loose item;
                       `userData.pots` / `rebuild(away)` / `potModel` let one pot be lifted out of the merge (#185)
src/plants.js          SillPot (#185): each window-board pot is a Holdable; its own model is invisible at home, shows (and
                       the merged meshes are rebuilt without it) once taken; the side-table flower and the kitchen shelf's
                       vase / pot plant are plain Things (kind 'plant'); window boards are put-down surfaces too
src/car.js             our white Renault Megane E-Tech (CAR, #173): the hall key calls it in through the gap in the shrubs
                       to stop right outside our door (#208; waypoint paths rounded off) (blinks, a collision box while parked, waits for the visitor), pressed again it U-turns and
                       leaves; sfx.evHum follows it; `&car` = parked (screenshots)
src/signs.js           hand-lettered name signs on the bedroom doors (DOOR_SIGNS)
src/water.js           running water: E on a tap/shower (world.taps from interior.js) → stream + hiss
src/turbo.js           Kaffeturbo (#217, TURBO): TURBO.cups cups' worth of coffee (cups.js passes the coffee per sip) within
                       TURBO.window real seconds → `player.boost` = TURBO.speed (indoors too) for TURBO.seconds, the fov wider,
                       #turbo ("Kaffeturbo!" pops, then a small label with a bar) + #turbo-edge rainbow glow, our own
                       chiptune (square/pulse lead, bass, noise hat; Sonos ducked meanwhile); real time (`turbo.now`), `&turbo`
src/sonos.js           music in the SYMFONISK speakers (#187, SONOS): six generated channels (Web Audio, no files), one mix
                       → a panner per speaker (walls / the other floor muffle), #sonos-panel (⏮ ⏭ ⏯ volume, reading mode)
src/stats.js           visitor statistics (localStorage), "+1" badges per event, the HUD panel
                       (hidden; Tab held / T / 📊 shows it)
                       The score (#197/#198): `totalScore()` from SCORE in config × the counts shows top left (#score,
                       `renderScore` after every count) with a "+N" when it grows
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
src/detail.js          DetailCuller (#189): far-away small meshes and things inside the flat hidden by its walls (seen from
                       outside) go to a layer the camera does not render
src/changelog.js       changelog list + the note on the freezer (E to read)
src/install.js         iPhone "add to home screen" sheet (no fullscreen API there); install link
                       where the browser offers beforeinstallprompt
manifest.webmanifest   web app manifest; icons/ = icon.svg rendered to PNG (192, 512, apple-touch 180)
                       + qr-site.svg, the start screen's QR code to the site (#193; made with OpenCV's
                       cv2.QRCodeEncoder, level M, and checked with cv2.QRCodeDetector on a screenshot; hidden on phones)
data/plan.json         GENERATED — do not edit by hand
data/changelog.json    what changed, for visitors (see Workflow rules)
tools/extract_plan.py  PDF → data/plan.json (stdlib only)
tools/walktest.html    headless movement test
tools/touchtest.html   headless touch-input test (synthetic pointer events)
tools/cattest.html     headless test of cat placement behind every door/wardrobe; up on seats, beds and tables (#200)
tools/roomtest.html    headless test of room detection at known points (+ a picture of the fill)
tools/measuretest.html headless test of the tape measure (wall to wall in the living room)
tools/watertest.html   headless test: aim at every tap/shower, turn it on and off
tools/lighttest.html   headless test: aim at every light switch / floor lamp, toggle it
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter, the photo; then it walks off and is gone)
tools/scoretest.html   headless test: points from 0, a door +1, the grill +10, a fish finger the cat eats +15 (a stat too), reset
tools/notetest.html    headless test of the changelog note ("Nytt", read/close, no walking, swings with the freezer door)
tools/patiotest.html   headless test of the patio seasons (parasol, beers, snowman) + sofa collision
tools/keytest.html     headless test of the hall key cabinet: open, car key reachable only then, beep; the car comes, parks, leaves
tools/esctest.html     headless test of Esc on the start screen (click-to-start cover, ignored over the note)
tools/updatetest.html  headless test of the update notice on a phone-sized touch screen (on top, 44 px, touch works)
tools/perfcount.html   draw calls / triangles at a few spots (compare before/after optimising)
tools/toilettest.html  headless test: flush both toilets (counted, not again until refilled), the lid still opens
tools/oventest.html    headless test: oven + microwave open/close (lamp inside), Moccamaster brews and clicks off
tools/tvtest.html      headless test: TVs on/off (living room + Sovrum 3), new programme each time, the remote, F off
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record
tools/resttest.html    headless test: sit on every seat and lie in every bed (spot, no walking, up again looking the same way;
                       head turned, old spot behind: up in front, #202)
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
tools/opentest.html    headless test: every Openable front (kitchen + furniture) opens/closes with the button; open, none
                       overlaps a closed neighbour or goes through a wall (#154); every kitchen front is stocked (or own/empty)
                       and its contents are hidden when shut and never out through the front (#229); the same for every
                       other front with contents (#230, #231)
tools/bestatest.html   headless test: the BESTÅ display cabinet's six doors open/close, its spots (down over the front) and the
                       lit glass section switch with the room (#191)
tools/holdtest.html    headless test: put things down (coffee table, dining table, floor), one at a time, F → home;
                       the hand (#195): hidden when empty, at the saber's grip, a reach out and back
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
                       on → quiet, break a leg off and eat it, eat it all, F whole again (#194)
tools/postertest.html  headless test: take the drawing (blank sheet stays), back on the desk, tape it up in the hall and on
                       the fridge door (swings with it), none on the kitchen window, reload → both back; look at one (panel, no walking,
                       ×/E close), Släng → ball lands and vanishes, out of storage; Ta ner → taped up elsewhere; lying in each lower bunk:
                       taped under the top bunk, facing down, can be looked at from there (`?shots`, `?panel`)
tools/sonostest.html   headless test: music in all three speakers, songs, volume, panel, pause, upstairs, F; each channel
                       rendered offline (only outside --virtual-time-budget; there it says SKIP)
tools/boardtest.html   headless test: keep / throw away cat photos, a full board, the panel (needs a big virtual-time budget)
tools/detailtest.html  headless test: from the doorstep through the open front door the hall's doors are drawn (#210); inside
                       every Entréplan door is on a drawn layer, open or shut; outside the culler still works
tools/planttest.html   headless test: lift pot plants (window board → table, side table → window board, the shelf), F home
tools/rifletest.html   headless test: the AK-47 rides with its drawer, 30 shots of automatic fire leave bullet holes, reload,
                       the magazine on the floor, a click = one shot, a shot in the lawn target scores, F
tools/turbotest.html   headless test: Kaffeturbo with an injected clock — three cups in five minutes (not spread out, not milk /
                       whisky), faster indoors, the text, more coffee adds time, over again; `walktest.html?turbo` walks at that pace
tools/clocktest.html   headless test of the wall clock (?time=7, spool, pause, sun height by month)
tools/calendartest.html headless test: today's date at the start, pick a date on the calendar, the sun follows
tools/cloudtest.html   headless test of the shared world against `node cloudflare/dev.mjs 8144` (start it first): PUT on
                       taping, someone else's drawing appears, DELETE on throwing, thrown elsewhere → gone here, offline
                       queue, desk sheet, cat photos neither sent nor fetched (#211), a fresh visitor gets them, the
                       leaderboard (name, score, escaped list, a capped cheat), off without &cloud
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
  brick drums at both ends, both right against the house (#42, #172: the west one against the west gable); flat roof with solar panels.
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
  HepCat and the villa outside the plot are placed from the Google Maps screenshot; straight across Sankt Lars väg
  stand a 2.3 m brick wall and a two-storey school with white quoins (`style: 'school'`, `SITE.school`, #126,
  the user's photos in `docs/foton/`); east of our row HepCat Store (brick, white pilasters and a white rendered
  gable part) and the long brick building with dormers behind it (`hepcat`, `hepcatWhite`, `longhouse`, #127).
  The others are drawn in the old
  S:t Lars style (#47, `style: 'old'`: brick, white cornice and string courses, tall arched windows,
  steep dark hip roofs, 3.6 m storeys) after the drone photo/render — storey counts are guesses.
- Windows (#103): below the transom each casement (one per side of the mullion) opens outwards with E
  (`addWindowFrame` in world.js, an Openable each, max 60°, no collision); the transom light is fixed.
  An open casement plays `sfx.wind` (looping gusty noise) until it is closed. The front door has a brass letter
  flap (`letterFlap`, an Openable in world.lids riding on the leaf, kept out of the door's merge via `door.keep`).
- Skärmvägg by the patio H 1.8 m, stair railing H 1.1 m (bofakta). The railing's middle run stands on Entréplan's wall between
  the flights, carried up to the upstairs floor (no slab in the hole), with newel posts (`STAIR.newel`) at its corner and ends (#232).
- U-shaped stair with winders at the east end: flight A (Entréplan, going east), 180° winders,
  flight B (going west) arriving in the upstairs hall. Upstairs slab opening = stair outline on
  Övre plan.
- Stair pictures (#220, #233): four black-framed pictures 2 × 2 (fikus, akvarell | peace, solros) in the upstairs
  stairwell, on the east party wall across the stair hole (seen face on from the upstairs hall and on the winders),
  centred on it (z 6.654), centre 1.57 m over the Övre plan floor. Each picture 30 × 40 cm, 40 × 50 cm outside with
  passe-partout and frame (*guess*). FURNITURE `pictures` (one atlas texture, 720 × 920 px per frame, `order` swaps
  them; two merged meshes), a loose item.
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
  ljusgrön, back to the window, chaise in the SE corner; matching armchair and, in front of it, a dark red upholstered stool (#180, `OTTOMAN`, guessed from the user's photo) in
  the NW corner with a floor lamp (IKEA NYMÅNE, 3 spots aimed at the seat, on the sitter's right, #56)
  and a side table with a small flower. Dimensions in
  `LANDSKRONA` (config) — the chaise/armchair numbers are series estimates. In front
  of the sofa: coffee table ILVA Woodstock, oiled oak veneer top, 120 × 60 × 47 cm, with a shelf.
  Under both: a 300 × 200 cm rug (#55, no collision) in Sarah's pattern (#171, `archRugTexture`: dark olive with
  off-white stripes bending in U arches, square fields per `fields` in its FURNITURE item).
  Opposite the sofa (the wall with the stair behind it): IKEA BYÅS TV bench 160 × 42 × 45, high-gloss
  white (#67; a drawer at each end, an open shelf between, #212), east of the living-room door, with the TV on it (#68: Philips 55", E toggles; an animated
  canvas picture ~12 fps + an additive Ambilight glow; furniture E targets are `world.furnitureTargets`).
  IKEA SYMFONISK speakers (#186, `SYMFONISK`, FURNITURE `symfonisk`): the black bookshelf speaker stands in Sovrum 1's window (#201; it lay on the TV bench),
  the white one stands at the south end of the kitchen worktop, the lamp speaker (frosted glass, its own lamp: E
  toggles it) on the window board behind the sofa, where a sill pot is skipped (`SILL_PLANTS.skip`, also for the black one).
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
- The family (#164): Sarah and Olof are married, two families moved in together — Olof is the father of Tilly,
  Kian and Tuva, Sarah the mother of Walter and Livia. Text that mentions them must not make all five siblings.
- Who sleeps where (the user's plan; "left/right" as you arrive upstairs walking west):
  Sovrum 1 (first right) Sarah & Olof, double bed IKEA IDANÄS 180 × 200 (`IDANAS`, #91), a NORDLI chest of
  drawers in its Klk (an AK-47 in its wide bottom drawer, #196) (no wardrobe in Sovrum 1; the Klk is 1.65 × 1.20 inside, #94) (a sage green IKEA chintz bedding set from a Sellpy ad, #83) with IKEA NORDKISA bedside tables (#64) and white NYMÅNE work
  lamps on them (#65, each its own lamp like the floor lamp) + an IKEA RÅGRUND towel-rack chair in the corner left of
  the window (#60), and a Philips 43" PQS7801 on the west wall across from the bed (#213, black frame, Ambilight #223):
  "sätta dig upp i sängen" (look at the bed's foot half; `aim` on a rest spot) puts it on, getting up puts it off · Sovrum 3 (second right) Livia & Tuva, bunk (unicorn sheets), an IKEA ALEX desk under the window
  with crafts and a kids' chair (#92) ·
  Sovrum 2 (first left) Walter & Kian, bunk (Darth Vader sheets), a gaming desk with a PC along the west wall, short end to the window (#77, #84): sitting in its chair starts the
  PC; a sit spot in the lower bunk (`watch`, a spot `kind` can differ from its piece) swings the monitor arm round and plays a film;
  a lightsaber on hooks on the west wall north of the desk (#78) · Sovrum 4 (second left, ex Allrum) Tilly, IKEA HEMNES
  daybed with pink cushions. Bunks: IKEA MYDAL, white, 97 × 207 × 157 (`MYDAL`, #227: posts, end boards, a two-board guard rail, a straight
  ladder on the room side at the foot end); long side to the side wall, head end to the façade; a white IKEA MALM chest of 6 drawers
  (80 × 124 × 50, `malm`, #235: 2 small + 4 big, clothes inside) with its back against each bunk's foot end; an IKEA NYMÅNE wall/reading lamp at
  every berth on the side wall by the pillow (#219, `NYMANE_WALL`, builder `walllamp`: white in Sovrum 3, black in Sovrum 2), each
  its own lamp (E, also lying there within `REST.reach`). Name signs: `DOOR_SIGNS` → `src/signs.js` (hall side of the door).
- Hall (#49): the plan's "EL" cabinet is really the small EL/C (40 cm, `CABINET_FIXES`) plus the coat
  rack "KL" beside it, which the extractor merged; on that wall (right as you come in) a coat rack with
  jackets and a shoe rack (FURNITURE `coatrack`/`shoerack`). The key cabinet hangs centred on the narrow wall right of the entrance door, above the switch (#123, #135). The round LINDBYN mirror that hung on the left wall now hangs in the living room, centred on the wall behind the armchair on its right (the north wall west of the living-room door, #205); in its place
  hangs an IKEA NISSEDAL mirror, black 40 × 150, upright (`HALL_WALL.tall`, #226; Rusta "Staffan" before, #218).
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
- `&open` — open every door, cabinet door and drawer (screenshots of open doors / wardrobes / furniture).
- `&cat=x,z[,yawDeg[,y]]` — show the cat there; `&catv=i` coat variant, `&catt=s` animation time, `&catwalk` walking (#224).
- `&time=HH[.h]` — start at that hour (default: the browser's time), `&month=1–12`, `&day=1–31` (default: today), `&freeze` pauses the clock,
  `&clock` opens the wall clock's strip,
  `&lights` turns every lamp on, ceiling lamps too, and keeps the small ones on (#234).
- `&car` — our car parked in front of the house. `&water` — turn on every tap and shower. `&tv` — switch the TV on. `&secret=i` — the secret drawer shows surprise i (SECRET.items, with `&open`).
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

`python3 -m http.server` sends no Cache-Control, so a headless Chrome reusing a profile may serve an *old* copy of a
module that hasn't changed for a while (heuristic caching) — give each run a fresh `--user-data-dir=$(mktemp -d)`.

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
- Walking (#224, `CAT_WALK`, `pose` in cat.js): the cat blends between two poses (`POSE.sit` / `POSE.stand`, size-1 local
  metres): it rises in `rise` s before it walks (fish fingers, leaving after a pat) and sits down again when it stops;
  standing, the hips (hind legs on hip pivots: haunch + a hock pivot with shin and paw) are at shoulder height, the back
  level, the tail up. Behaviours set `wantStand`, call `stride(m)` for the diagonal-pair gait and put head offsets in
  `headOff`; `pose` runs after them every frame (the tail tube is rebuilt only while the pose changes). `&catwalk` (with
  `&cat=`) = walking on the spot.
- Every new cat gets a name (`CAT_NAMES`); petting it puts a photo on the kitchen board 0.7 s in
  (`CAT_BOARD` in config: under the wall clock on the Tvätt/Badrum wall, kitchen face; it and the calendar are
  positioned together, centred under the clock).
- Up on the furniture (#200, `CAT_FURNITURE`, `furnitureSpot` in cat.js): a cat turning up behind a door sits on a seat,
  bed or table top in that room `chance` of the time (one seen straight from the doorway within `reach`; the height from a
  ray down onto the furniture, so it sits on the cushion and never in something on a table; `cat.on` = 'sit'/'lie'/
  'table'). `chooseSpot` skips the seat it is on; after a pat it fades where it sits; it ignores fish fingers up there.
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
  hit line crosses a wall outline (`levels[i].wallSegments`) — no switching lamps through walls.
- Kitchen (#221): the under-cabinet LED ("bänkbelysningen", a rocker under the first wall cabinet after the cup cabinet)
  and the hood's light (a button on the hood's front) are lamps of their own in `world.lamps` (lights.js FloorLamp with
  `glows` = additive washes on the worktop/splashback, `light` = pool-light overrides), not the room's switch.
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
  is spooled); an E toggle holds until that state next changes (`updateAuto`). The ceiling lamps start off and follow only
  their switches. The pool (`update`): candidates are scored by distance, × `poolPick.otherRoom` outside the visitor's room
  (rooms.js), × `hidden` behind a wall/door leaf (a lamp behind a wall in another room gets none: it would only shine
  through the wall), ÷ `stick` for the lamp already held; a pool light that moves fades out and in over `poolFade`
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
- Sounds are synthesised (no audio files) and positional — the speakers' music too (`src/sonos.js`); the AudioContext is started by the
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
- Sit / lie (#71/#72, `src/rest.js`, `REST`): builders put `userData.rest = { kind: 'sit'|'lie', name, verb,
  spots }` (local x, seat/mattress y, z, optional dir); buildFurniture turns them into E targets
  (`world.furnitureTargets`). E picks the spot nearest the look ray (not one the cat sits on), the camera
  glides there (lying: looking at the ceiling), walking is off and looking is clamped; E / "Res dig" puts
  you back where you stood (including upstairs: `spawn()` alone would drop you to Entréplan), looking the way you looked while
  seated (lying: level); if your old spot is behind you, on a free spot in front (`standSpot`, #202). While sitting / lying (#184) the
  focus works as standing but within `REST.reach` of the eye (not the seat itself, nothing to sit on): take the remote
  from the sofa, the book from the armchair, put things down within reach; E with nothing in reach, Space / C or the
  touch "Res dig" button (#stand-btn) get you up, keeping what is in the hand. Seats: the
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
- Detail culling (#189, `src/detail.js`, `PERF.detail`): the exterior and new furniture had grown the start view to ~1200
  calls (the whole flat is in the frustum from the street). Small meshes that would look tinier than `k` are moved to a
  layer the camera does not draw (never nearer than `minDist`, so never within reach), and from outside the flat a mesh
  inside it is only drawn when the line to it passes a façade opening (the front door's leaf is solid while it is shut; open,
  the whole doorway counts, #210 — `tools/detailtest.html`). Start view
  1210 → ~410 calls, the other spots a little lower; screenshots differ by a few dozen pixels. Anything new that
  raycasts at small things far away must allow for layer 7.
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
