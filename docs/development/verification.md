# Browser verification and test selection

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [local-development](local-development.md), [performance](performance.md).
HUD layout only (#707, #716): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/hudlayouttest.cjs http://localhost:8000 /tmp/hud-shots` checks the real index DOM, styles and icon initializer at 844×390, 667×375, 932×430, 568×320 and 1280×720 with zero, symmetric and asymmetric safe insets. It checks shared shells, modular cells, score hierarchy, icon accessibility, compass/adjunct/control overlap, lives 12 px below the actual compass with real Combat hurt updates and combat visibility, disabled state and blur fallback. It suppresses game bootstrap; its screenshots are HUD-only, not game-render or gameplay evidence. `CHROME_PATH` optionally selects Chrome.

## Module and test map

```text
src/grill.js           the courtyard's kettle grill (GRILL, #204): E lights it — the lid swings open, flame sprites, glowing coals,
                       sparks, smoke, crackle + roar, a pool light (lights.extra); out by itself after burnSeconds; F keeps it
                       #678: the kettle itself (GRILL.kettle, Weber Original Kettle 57 cm look, sizes *guess*): `kettleBody` (lathed
                       bowl with rolled rim, side handles, lid hook, One-Touch lever, aluminium legs, wheels on an axle, ash catcher,
                       cooking + charcoal grates) and `kettleLid` (dome over the rim without a gap, damper, handle on a heat shield),
                       one vertex-coloured matt enamel material, two draw calls; hinged at the back (−z), handle to the front
src/wallclock.js       analog kitchen clock (WALL_CLOCK) + the control strip: spool A D / ← →, pause
tools/entrancedoortest.html entrance panes/hardware, the name plate (#595), animation and actual rendered handle pixels with normal culling (#497/#519)
src/quality.js         adaptive graphics level + knob registry (#592); src/warmup.js the start's warm-up; src/hitchlog.js `&perf` hitch log
src/detail.js          DetailCuller (#189): far-away small meshes and things inside the flat hidden by its walls (seen from
                       outside) go to a layer the camera does not render; roots with `userData.moving` (our car, the cat,
                       darts, the basketball) are judged every update, not only when the camera moves (#267); #695: from outside also by
                       box projection onto the façade, the flat's walls and the floor between the storeys, and outline lines too
tools/jumpontest.html  the plain jump's apex vs the suit's (#696) and landing on benches / sofa / armchair / ottoman (#693) and the TV bench, bed and daybed (#699; backrest / headboard / ends are walls, the TV does not block the bench), the patio lounge (backs and arms are walls) and slatted table, the coffee table and the courtyard's raised beds (#701, #702), kerbs under the step-up: stable, jump on, walk off, hurt by a 4 m drop, no climbing by walking, table and wall hold
tools/lighttest.html   headless test: aim at every light switch / floor lamp, toggle it
tools/powertest.html   the power cut (#604): fuse box, flicker, Kv. Lunden dark / surroundings lit, hold-to-mend on touch, reload has power;
                       #612: fridge/freezer/oven/microwave lamps dark, brew/dishwasher/washer/dryer paused and resumed, the lift's rescue drive
tools/visitlightstest.html  the visitable flats' lamps (#620): a switch with a wall behind it in every room of L1004 and L1201, E lights / puts out, the frame gets brighter, power cut + mend, no extra light object
tools/perfcount.html   draw calls / triangles at a few spots (compare before/after optimising); fails past PERF.budget (#592), `?lowmem&w=390&h=844` for phones;
                       counts each draw to the screen (#695: `renderer.info` was reset by nested renders and under-counted the start view)
tools/firstframetest.cjs (#697) phone startup, program/buffer/texture counts and loading-cover order before the first full view;
                       `PLAYWRIGHT_MODULE=… node tools/firstframetest.cjs http://localhost:8697`, STARTUP_OUTPUT outside repo
tools/turntest.html    turn-around hitches (#592): after the warm-up, 360° turns at nine spots; 0 new programs / textures (Playwright)
tools/oventest.html    headless test: oven + microwave open/close (lamp inside), Moccamaster brews and clicks off
tools/thingtest.html   headless test: a wine bottle to the coffee table and back to the rack, a glass, F sends them home;
                       pour wine into a glass and drink it empty, whisky splashes into a tumbler, back in the BESTÅ = empty
tools/cuptest.html     headless test: an empty cup out without brewing, onto the worktop, brew, take the jug, pour, jug back,
                       carry the cup to the dining and coffee tables, a cup back into the cabinet; whisky in a cup of
                       coffee (#169): a splash, a warmer colour, never over full, drunk up as kaffekask
tools/cupshadetest.html the closed cup cabinet door vs its neighbour, pixel by pixel at noon + two evenings; hand-built doors receive shadows (#602); notes, signs, hob, letter box, suit too (#607); coffee maker, toaster, drawers, smart devices, lamp speaker (#609)
tools/grilltest.html   headless test: light the grill (flames, light, lid), F keeps it, put it out, it burns out by itself
tools/postertest.html  headless test: take the drawing (blank sheet stays), back on the desk, tape it up in the hall and on
                       the fridge door (swings with it), none on the kitchen window, reload → both back; look at one (panel, no walking,
                       ×/E close), Släng → ball lands and vanishes, out of storage; Ta ner → taped up elsewhere; lying in each lower bunk:
                       taped under the top bunk, facing down, can be looked at from there (`?shots`, `?panel`)
tools/boardtest.html   headless test: keep / throw away cat photos, a full board, the panel (needs a big virtual-time budget)
tools/detailtest.html  headless test: from the doorstep through the open front door the hall's doors are drawn (#210); inside
                       every apartment Entréplan door is on a drawn layer, open or shut; exterior portik doors are excluded (#544); outside the culler still works
tools/breaktest.html   headless test: the AK-47 breaks a glass on the dining table from 2 m and ~8 m (shards on the table, a wine
                       splash, more points far away), the timer mends it, a dart breaks a glass but not a bottle, the saber a
                       bottle, a held glass is not hit, none through a wall, a cup goes, F mends all (#263)
tools/curtaintest.html headless test (#342, #362): Sovrum 1's curtains open at the start, one stack each side (the west one by the west wall
                       and clear of the RÅGRUND chair, both off the glass, #403), E opens the sideways strip, no walking, ◀ draws both together
                       symmetrically until they meet in the middle and no further, D parts them, A at `speed`, scores once, the daylight cut, the teal glow, a reload
tools/blindtest.html   headless test: a blind in every window, folded at the start, dark upstairs / light downstairs; E opens the
                       mode (no walking), ▲ up to the head and no further, S down to folded, W at BLINDS.speed, the first pull
                       scores, the room's daylight cut (blackout > white), white glows, × / E close, the sash opens behind it,
                       the state survives a reload
tools/glrestoretest.cjs  (#628, #713, simulated phone profile) forces real app `WEBGL_lose_context` loss + restore: one reload back at the same
                       place/view, matched seeded curtain pixels rebuilt, no reload loop, and suppressed-reload control loses the SAME freed map's pixels.
                       It explicitly verifies the production `freeCanvasAfterUpload` hook shrinks the actual source to 1×1 after upload. Pixel images are a
                       **production texture in a 64×64 probe** through `app.renderer`, not full-scene or physical-device evidence. The harness routes only the
                       main animation-loop hook to stop rendering; `__app` readiness means construction completed, not first full view/warm-up completed.
                       No synthetic texture fallback or production quality change. Run after touching `freeCanvasAfterUpload` / `reloadOnContextRestore`:
                       `PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/dir node tools/glrestoretest.cjs http://localhost:8137`; construction bounded to 180 s
                       per page, probe tasks to 60 s, restore events to 15 s. Three real app constructions; console logs and four 64×64 pixel images saved in SHOTS.
tools/crashtest.cjs    crash reports (#629): Playwright + `node cloudflare/dev.mjs 8144 tok`; run after touching src/crashlog.js, cloudflare/crash.js or the
                       reset keys; includes bounded pre-failure history and two real WebGL loss/recovery pairs through the public API
                       (also `node --test cloudflare/crash.test.mjs`). Waits on conditions (page `stats`, Worker rows), never fixed sleeps, and
                       refreshes the phone profile's 60 s reload guard (`lunden.glReloadAt`) before each forced context loss and stops the game's render
                       loop for the layout part (SwiftShader frames take 1–15 s and the game applies a resize in a frame) (#650); a failing check
                       dumps what the Worker holds. ~6–8 min under SwiftShader; clear old rows first (`DELETE /admin/crash`) or restart `dev.mjs`
tools/bowtest.cjs      the bow (#690): one page, frames driven by hand: the box on the ground by the NW stair and clear of it, shut = not
                       takeable, open = bow + quiver, take, a too-short draw, full draw (string, nocked arrow), the arrow's arc, its
                       heading, sticking, a tap shot, back in the box; screenshots (box open, drawn, in flight, stuck). ~3–5 min
tools/combattest.cjs   fights (#667): three pages (A, B, C) against dev.mjs: unarmed B a ghost and not hittable, armed all solid, hearts only in a
                       fight, B shown no shots while unarmed; A's missed dart drawn on B from the same start / direction / speed (the blasters'
                       pool, drawn only), A's thrown ball on B (screenshot), ten hits (points / deductions / lives), out of lives → start,
                       full lives, weapon and stats kept; C's screenshot.
                       Pages drive ghosts / combat updates themselves (SwiftShader frames take seconds); ~10 min. Also players.test.mjs
tools/combatworldtest.html combat collision broad phase (#715), actual Three modules without WebGL: legacy hit equivalence,
                       authored bounding-box identity/content, private-grid readiness and empty-space rejection, pending fallback,
                       exact edge/corner/zero-length/finite near-far queries, nonuniform transforms, position/interleaved/index
                       mutation, disposal/accounting caps, layers/moving/visibility/material arrays, custom false/redirected hits,
                       instances and deforming geometry bypass. Open the page via devserve; #out reports ALL PASS/FAIL.
                       This focused fixture is not a full apartment frame benchmark or a physical-phone PvP validation.
tools/ghosttest.cjs    other players as ghosts (#666): two Playwright pages against `node cloudflare/dev.mjs 8146 testtoken` (real ws:// via
                       cloudflare/devws.mjs): ?mp=0 / no cloud off, see each other with tags Olof / "Anonym", position, standing still sends
                       nothing, a move arrives interpolated, the room's count, a closed / hidden tab disconnects; screenshots into SHOTS.
                       Also `node --test cloudflare/players.test.mjs` (cap, limits, brake). ~5 min under SwiftShader
tools/ghostbadgetest.cjs (#672) bounded real Ghosts + local PlayerRoom badge fixture without apartment bootstrap; name/score,
                       anonymous/max score, score-only rate/idle, sharing, texture-history disposal, draw counts and leave;
                       desktop/iPhone-size rendered screenshots. Same environment/arguments as ghosttest (no admin token needed)
tools/clocktest.html   headless test of the wall clock (?time=7, spool, pause, sun height by month)
tools/hangtest.html    hanging clothes inside what they hang in (#610): the hall coat rack's jackets within its width, clear of the EL/C
                       cabinet and wardrobe G; all fitted wardrobes' contents (+ the hall life jacket) inside the carcass; SMÅSTAD's clothes
tools/veronatest.html  the patio's Verona lounge as three movable parts: seven seats, frame corner x 5.66, seasonal cushions west of
                       the east screen wall (x 5.68), sitting, independent rotation/cushion following, rearranging and layout migration
```

## Testing

`tools/statsresettest.html` (#712) is a light DOM/real stats-module test: dynamically scored counters, reset object identity, rendered zero, immediate persistence, repeated reset and actual reload, including taskCounts/legacyTaskPoints and restored first/repeat task awards (#709). It runs without the apartment/game bootstrap or WebGL; it does not replace gameplay button tests.

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
the installed Playwright Chromium (for example `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --no-sandbox`; some environments provide `/opt/pw-browsers/chromium`). Such a VM has ~4 CPUs: run at most ~3 headless test
runs (agents) at a time, more only slows every one down. `/orkester [område]` (.claude/commands/orkester.md) runs a
session as an orchestrator that works through the open issues with subagents under these rules.
Several orchestrators (separate VMs) sync through issue #420 (label `orkester`, kept off the fridge notes): each keeps
one status comment there and reserves whole chains with `in-progress` + a comment on each issue.

Worker tests in a cloud session (#635): `tools/cloudtest.html` and `tools/resettest.html` need `node cloudflare/dev.mjs 8144` (admin token
default `testtoken`; the tests stop at once with a clear FAIL if the wipe is refused). Run one at a time, open `http://localhost:<port>/tools/<test>.html`
in Playwright Chromium (flags above, a fresh `--user-data-dir`) and poll `#out` until it starts with `ALL PASS` / `SOME FAILED`; no proxy setting is
needed for localhost (`NO_PROXY` already covers it). Under SwiftShader each takes up to ~10 min. `tools/reloadtest.html` needs no Worker.

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
- every test that refers to what you moved or renamed: `rg -l` tools/*.html for the config key, builder, module or
  the old coordinates (e.g. moving the Sovrum 1 bed must run tvtest, which aims at the bed's TV);
- walktest / stucktest only when walls, doors, collision, furniture footprints, terrain or player movement changed;
  touchtest only for input changes; perfcount only for geometry that adds meshes / materials.
- Not the whole list "to be safe"; a pre-existing failure you happen to see goes into an issue, not into your change.


Openable button test (#545): opentest uses exact focused-target identity before clicking each front, clears seated/held/input state between cases, updates scene matrices for manual steps and reacquires the moved front before closing. Sampling points on the open front handles sashes partly covered by curtain stacks; clicks on neighbouring seats/items do not count as cabinet actions. All 84 fronts retain geometry/contents checks.

Viewport rotation (#567): `tools/viewporttest.cjs` uses Playwright against the running local server. Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/viewporttest.cjs http://localhost:8137` (omit the environment overrides if Playwright/Chromium are already installed in the usual locations). It holds the real plan request during the first rotation and writes `/tmp/lunden-viewport.log` and `.png` by default; `VIEWPORT_OUTPUT` changes that prefix. Covers delayed CSS layout without a second window resize, repeated rotations, camera/buffer agreement, zero-size recovery, adaptive resolution, duplicate-event coalescing and actual touch console/pause/resume taps. Run `touchtest.html` for joystick/interaction regression. Physical mobile Safari/Chrome, browser bars and installed home-screen mode need device testing separately.

Phone memory probe (#628): `python3 tools/devserve.py 8628 . &` then `PLAYWRIGHT_MODULE=$(npm root -g)/playwright node tools/phonememtest.cjs http://localhost:8628 [--cpu 1,4,6] [--route living,mirrors,stairwell] [--dwell 800] [--shots] [--nowarm] [--budget-mb N] [--profile desktop] [--out DIR]`. iPhone 14 Pro profile (844×390 landscape, DPR 3, UA, touch), WebGL allocation totals (textures incl. mips, renderbuffers incl. MSAA, buffers, canvas), CPU canvases, geometry copies, JS heap, long tasks, CPU throttling via CDP, per-step table and the largest items; the iOS budget is a parameter and a *guess*. A run takes ~5 minutes (the start warm-up alone ~3 min under SwiftShader); start it in the background and poll, since foreground commands time out. Numbers and findings: [performance](performance.md).
