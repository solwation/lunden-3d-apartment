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
src/testmode.js        `&test` (#703): cheap drawing for headless test runs, game logic unchanged (see "Test mode" below); `__app.testMode`
tools/runtests.cjs     test runner (#737): runs chosen HTML / .cjs tests headless, times them, compares FAIL lines with `tools/baseline.json` (see "Test runner" below)
tools/baseline.json    the KNOWN red lines per test (no times), read by runtests.cjs
tools/testkit.cjs      shared Playwright helper (#703): `launch()`, `open(browser, url, { viewport = 480×300, test = true, lazy, init, arg })` (DPR 1, `&test` added), `shot(page, path)` (full size + shadows + quality 3, then back)
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
                       Server-only diagnostic changes (#720) can use the focused 14-case crash.test.mjs suite plus a light
                       Chrome endpoint roundtrip against dev.mjs: POST snap/beat → authenticated GET → public GET, with
                       cache:no-store for public reads. Verify warm/counter overshoot, worst tuple, invalid-field omission
                       and identity filtering; this does not require WebGL or claim a physical-phone crash reproduction.
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
tools/combatworldtest.html combat collision (#715/#714), actual Three modules without WebGL: 462 focused checks cover native
                       hit/face/UV/normal equivalence, private grid/spatial-index quotas and ownership, authored bounds,
                       mutations/disposal, layers/custom propagation, instanced paths, curved finite segments, cooperative
                       yielding/deadlines/cancellation and shared urgent-build ownership. #out reports ALL PASS/FAIL.
                       This fixture does not measure apartment FPS or physical-phone PvP.
tools/combatremotetest.cjs remote-dart spatial integration (#715), actual Combat.remote/reach and Darts.update without
                       WebGL: controlled sparse mesh, same two shots/60 steps, bitmap admission disabled, independent native
                       633c18c helper reference versus current spatial-ready views; reports active-count/endpoint equality and CPU.
                       Companion HTML requires the runner-supplied historical source. No apartment/FPS/phone claim.
tools/nerfcombattest.html Nerf (#714), small rendered actual-module scene and two players against local dev.mjs on 8718:
                       25 m server rule, actual muzzle/visible dart at 22 m, floor/range stops, wall/miss/capsule ordering,
                       confirmed nonpositional WebAudio, mute and denial. Separate transport-spy lifecycle checks cover
                       deferred snapshot, one normal shot message, reset/disconnect/unarmed, deadline and queue overflow.
                       Start `node cloudflare/dev.mjs 8718 testtoken`; #out reports 32 checks. Keep nerftest's paint regression.
tools/ghosttest.cjs    other players as ghosts (#666; avatars since #705: outline, skinned mesh, ~20 min under a busy SwiftShader, the first avatar frame compiles the skinned program): two Playwright pages against `node cloudflare/dev.mjs 8146 testtoken` (real ws:// via
                       cloudflare/devws.mjs): ?mp=0 / no cloud off, see each other with tags Olof / "Anonym", position, standing still sends
                       nothing, a move arrives interpolated, the room's count, greeting (#673: focus "hälsa på Anonym" via touch, the line,
                       points once, B sees A wave + bubble, a screenshot of the wave), a closed / hidden tab disconnects; screenshots into SHOTS.
                       Pages load one at a time and pause their frames where timing matters (SwiftShader).
                       Also `node --test cloudflare/players.test.mjs` (cap, limits, brake). ~5 min under SwiftShader
tools/chattest.cjs     the chat (#675): two pages, a browser each (480×300, `&quality=0`), against dev.mjs: the console opens as the chat bar, A's line reaches B
                       as plain text with A's name, cheat codes (/day, bare codes, a secret, /unknown, /help) stay local and are never
                       sent, the client's burst limit, ≤ CHAT.show lines, TTL fade, hide (remembered, unseen count) / show, B as a touch
                       phone: the column clear of the buttons and the stick's corner, "Anonym"; #676 "skriver…" / line bubbles over the ghost
                       (flag only, pause, close, replace, TTL, wall, leave, no 3D objects); #719 the word filter, /tysta + /prata;
                       screenshots into SHOTS. ~10 min. Also `node --test cloudflare/chat.test.mjs` (word filter)
tools/ghostbadgetest.cjs (#672) bounded real Ghosts + local PlayerRoom badge fixture without apartment bootstrap; name/score,
                       anonymous/max score, score-only rate/idle, sharing, texture-history disposal, draw counts and leave;
                       desktop/iPhone-size rendered screenshots. Same environment/arguments as ghosttest (no admin token needed)
tools/clocktest.html   headless test of the wall clock (?time=7, spool, pause, sun height by month)
tools/hangtest.html    hanging clothes inside what they hang in (#610): the hall coat rack's jackets within its width, clear of the EL/C
                       cabinet and wardrobe G; all fitted wardrobes' contents (+ the hall life jacket) inside the carcass; SMÅSTAD's clothes
tools/veronatest.html  the patio's Verona lounge as three movable parts: seven seats, frame corner x 5.66, seasonal cushions west of
                       the east screen wall (x 5.68), sitting, independent rotation/cushion following, rearranging and layout migration
```

## Test mode (`&test`, #703)

Under SwiftShader most tests check function (positions, state, messages), not pictures, yet every frame is drawn in full.
`&test` makes drawing cheap and leaves the game alone: antialiasing off, `renderer.shadowMap.enabled = false`, the adaptive
quality pinned to level 0 (existing knobs: pixel ratio ×0.6, no mirrors, 0.35× particles, nearest detail culling; an
explicit `&quality=n` wins), no start warm-up (headless skips it anyway). `&test=lazy` also leaves the loop's own `render()`
out (matrices are still updated; the logic frames still run). `__app.testMode.setFull(true)` raises quality 3 and shadows
(not antialiasing), `.draw()` renders one frame right now, `setFull(false)` goes back. `tools/testkit.cjs` wraps this for
Playwright tests: a 480×300 viewport at DPR 1, `&test` on every URL, `shot(page, path)` for the occasional real picture
(the first full-quality frame compiles the shadow programs: minutes under SwiftShader, so take pictures sparingly).
HTML tests that open the game in an iframe use `f.width = 480; f.height = 300` and `?test` in the URL.

Use full quality (no `&test`, no testkit default) for anything that *measures or compares drawing*: `perfcount`, `turntest`,
`phonememtest`, `glrestoretest`, `viewporttest`, `cupshadetest`, `entrancedoortest`, `mirrortest` and the like, shadow /
reflection / pixel-colour checks and `&shot` screenshots. Migrated so far (#703): `combattest.cjs` (`&test`, full quality only
around its two screenshots), `crashtest.cjs` (`&test`), `resttest.html`, `tostarttest.html`. Others are logic-only and can move over
step by step (`ghosttest.cjs`, the iframe tests: small iframe + `?test`); do not move a test whose result depends on drawing.

What it buys (2026-10-11, a 4-CPU VM at load average 13–22 shared with other agents; wall clock, noisy): a test is cheaper per frame, not
per step. `combattest.cjs` (three pages): before, aborted after 49 min (A and B took 33 min to see each other, then a page crashed);
after, ALL PASS in 16 min. `crashtest.cjs` 514 s → 459 s. `resttest.html` 442 s → 346 s (same output both ways). `tostarttest.html`
49–78 s → 77–90 s: no gain, since its time is its own JS and a cheaper frame only lets the game loop run more often; the numbers swing by
±50 % between runs, so compare repeated runs. `walktest.html` does not load the game at all and gains nothing. The first full-quality
frame of `shot()` compiles the shadow programs (~3 min under that load); later shots are cheap. resttest has 4 pre-existing FAILs
("#302 … not across false", `soffan #3`, `fåtöljen #0`), identical with and without `&test`.

## Test runner (`tools/runtests.cjs`, #737 / #736)

`node tools/runtests.cjs resttest tostarttest cooktest` (or `--group a-c|d-l|m-p|r-t|u-z`, the file name's first letter) runs the named
`tools/*test*.html` / `*.cjs` tests. It starts its own `tools/devserve.py` (`--port`, default 8133) and kills only the PIDs it started
(process groups, so a test's Chromium goes too). HTML tests run in headless Playwright Chromium (SwiftShader flags, 1280×800, DPR 1);
the runner polls `#out` every 2 s until `ALL PASS` / `SOME FAILED`, or reports TIMEOUT (`--timeout MIN`, default 20) / CRASH.
Needs Playwright (`PLAYWRIGHT_MODULE=…` or a global install; `CHROME_PATH` optional). Logs: `/tmp/runtests-<pid>/<test>.log` and
`summary.json`, never the repo. `--jobs N` runs N tests at once (default 1, **max 2**: the VM is shared), `--list` shows the selection,
`--verbose` prints each test's output.

Output: PASS / KNOWN / FAIL / TIMEOUT per test with the time and the number of FAIL lines, then a summary. **KNOWN** = it fails only
with lines listed in `tools/baseline.json` (`{ "test": ["FAIL line", …] }`: the exact known-red lines, **no times**, e.g. resttest's
#302 lines); any FAIL line not in the baseline is printed as `NEW` and makes the exit code 1. `--update-baseline name…` rewrites those
tests' entries from the run (do it only for failures someone has filed as a `Bugg:` issue).

`--compare` runs every HTML test twice (as written, then with `&test`) and prints whether the PASS/FAIL result lines are identical and the
time ratio; with `--jobs 2` the two runs go side by side on the same load. The `&test` run needs no change to the test file: a context
route answers the iframe's `../index.html` request with a 302 to the same URL plus `?test`, and a stylesheet injected into the test page
forces every iframe to 480×300 (!important beats `f.width = 900`). The compare line says how many game loads were switched; a test
that never opens `../index.html` prints `n/a`, as does a run that timed out. A test that does not open the game itself gains nothing.
Result lines are compared as written (numbers in them included): a line that shows a measured value will differ between runs, so look at
the `only full` / `only &test` lines before calling a migration safe.

The resize stylesheet waits for the top document root (#760). Chrome DOM probes cover normal, inline-sized and dynamically
inserted iframes: their actual frame and child viewport become 480×300 without init-script errors; child documents stay unmodified.

### Remaining-test audit (#742 / #754)

These classifications follow source inspection; no timing or before/after browser equivalence is claimed for this audit. Other groups own their migration evidence.

| Test | Status / reason | Before → after time |
|---|---|---|
| `combatremotetest.cjs` | No benefit: actual module-only HTML fixture, no apartment bootstrap or renderer. | Not run for migration |
| `dialogtest.cjs` | Excluded: static real dialog viewport bounds; bootstrap blocked. | Not run for migration |
| `firstframetest.cjs` | Excluded: real phone compilation/uploads and first-frame/loading-cover rendering. | Not run for migration |
| `hudlayouttest.cjs` | Excluded: real HUD viewport bounds; bootstrap suppressed. | Not run for migration |
| `updatetest.html` | Excluded: 844×390 phone layout/hit testing and hardcoded 422px centre. | Not run for migration |
| `viewporttest.cjs` | Excluded: viewport/buffer dimensions, rotation and adaptive resolution. | Not run for migration |
| `visitlightstest.html` | Excluded: lamp brightness measured from rendered pixels. | Not run for migration |
| `walktest.html`, `wardrobetest.html` | No benefit: actual modules/geometries without apartment iframe or rendering. | Not run for migration |

Current no-game-iframe HTML inventory: `basementfloortest`, `basementlayouttest`, `beershelfcachetest`, `cattest`, `combatremotetest`, `combatworldtest`, `focusperftest`, `grillchickentest`, `grilltasktest`, `hangtest`, `musictest`, `nerfcombattest`, `roomtest`, `startuptest`, `statsresettest`, `trapphusrailtest`, `walktest`, `wardrobetest`. They import actual modules or build their own fixture, so adding `&test` to the apartment URL has no benefit; `focusperftest` also measures performance. Their owners retain their existing verification scope.

Remaining CJS ownership: #738 owns a–c HTML; #739 owns d–l HTML plus `grillinteractiontest`; #740 owns m–p HTML plus `ghosttest`, `ghostbadgetest`, `bowtest`; #741 owns r–t HTML plus `chattest`/`anontest`. `combattest` and `crashtest` already use test mode. `glrestoretest` and `phonememtest` retain full rendering/performance semantics; `nocheathints` has no game bootstrap, and `basemententrytest` already opens its actual-main iframe in `&test=lazy`. No result or timing is inferred from these classifications. #736 remains open until all groups publish actual evidence.

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

Dialog cards (#725): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/dialogtest.cjs http://localhost:8127 [/tmp/shots]` loads the static `index.html` (scripts blocked) and shows every overlay with a `.card` on its own at 390×844, 844×390, 667×375, 640×420 and 1280×720; each card's `getBoundingClientRect()` must lie inside the viewport and the page must not scroll sideways. The start card `#overlay .card` (and `#install`, `#reset-confirm`) are content-box with 28px padding, so their `max-height` subtracts the 56px padding (#726); no known exceptions remain. Run after adding or restyling a dialog; `BEFORE=1` forces the old content-box.

Viewport rotation (#567): `tools/viewporttest.cjs` uses Playwright against the running local server. Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/viewporttest.cjs http://localhost:8137` (omit the environment overrides if Playwright/Chromium are already installed in the usual locations). It holds the real plan request during the first rotation and writes `/tmp/lunden-viewport.log` and `.png` by default; `VIEWPORT_OUTPUT` changes that prefix. Covers delayed CSS layout without a second window resize, repeated rotations, camera/buffer agreement, zero-size recovery, adaptive resolution, duplicate-event coalescing and actual touch console/pause/resume taps. Its `matchesSurface` waits poll every 100 ms (`polling: 100`), not Playwright's default `raf` polling: under heavy CPU load headless Chromium can stall `requestAnimationFrame` after `setViewportSize`, so an rAF-polled wait timed out with the buffer still at the previous size even though the resize handling was correct (#731). Run `touchtest.html` for joystick/interaction regression. Physical mobile Safari/Chrome, browser bars and installed home-screen mode need device testing separately.

Phone memory probe (#628): `python3 tools/devserve.py 8628 . &` then `PLAYWRIGHT_MODULE=$(npm root -g)/playwright node tools/phonememtest.cjs http://localhost:8628 [--cpu 1,4,6] [--route living,mirrors,stairwell] [--dwell 800] [--shots] [--nowarm] [--budget-mb N] [--profile desktop] [--out DIR]`. iPhone 14 Pro profile (844×390 landscape, DPR 3, UA, touch), WebGL allocation totals (textures incl. mips, renderbuffers incl. MSAA, buffers, canvas), CPU canvases, geometry copies, JS heap, long tasks, CPU throttling via CDP, per-step table and the largest items; the iOS budget is a parameter and a *guess*. A run takes ~5 minutes (the start warm-up alone ~3 min under SwiftShader); start it in the background and poll, since foreground commands time out. Numbers and findings: [performance](performance.md).

Park basement entries (#729): run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/basemententrytest.cjs http://localhost:8729` after starting the development server. `SHOTS` overrides `/tmp/lunden-basement-entry/result.json`'s directory. The driver waits bounded initialization, clicks the real mouse-start button, obtains PointerLock and runs `tools/basemententrytest.html`: actual E focus from outside before below, closed/open/jamb traversal to both −1 landings and back, the touch action handler in controlled touch mode, far animated leaves, courtyard pick/collision exclusion, continuous park paving, tree/shrub-instance clearance and floor coverage. It uses `&test=lazy`, with no automatic rendering; this is not a physical-phone touch/FPS test. [Measured scope and manual full-quality images](../validation/issue-729/README.md).

## Test-mode migration: r–t (#741)

Exemptions below are source-audited, with no new browser run.
Paired measurements, when recorded, use `runtests --compare --jobs 1` on the Surface, Chrome/SwiftShader.
Complete ordered PASS/FAIL lines are checked manually; timings are wall clock, not game FPS.

| Test | Status / reason | Before → after |
|---|---|---|
| `rearrangefollowtest` | Migrated: all 15 ordered PASS lines and ALL PASS identical at baseline `892c633` (logs `/tmp/runtests-160072`). | 231.912s → 203.326s |
| `rearrangemirrortest` | Exempt: reflection/render correctness needs original rendering settings. | Not run: deliberate rendering exemption. |
| `rearrangeplacementtest` | Migrated: all 15 ordered PASS lines and ALL PASS identical (logs `/tmp/runtests-160072`). | 153.505s → 133.424s |
| `rearrangeresettest` | Migrated: all 17 ordered PASS lines and ALL PASS identical (logs `/tmp/runtests-160072`). | 80.641s → 69.723s |
| `rearrangetvtest` | Migrated: all 9 ordered PASS lines and ALL PASS identical (logs `/tmp/runtests-160072`). | 159.183s → 136.002s |
| `rearrangeuitest` | Exempt: landscape-phone viewport and touch target layout need 844×390. | Not run: deliberate viewport exemption. |
| `reloadtest` | Unmigrated: real wall-clock values in PASS labels across scene loads prevent reliable exact output comparison. Source-audited blocker, not a rendering exemption. | Not measured; no output normalization. |
| `statsresettest` | Already standalone: real stats/score/persistence modules and DOM, no game iframe, apartment bootstrap or WebGL. No game test-mode migration applies. | Source audit only; no new browser run. |
| `streetsigntest` | Exempt: compares actual renderer.info.render.calls with signs shown/hidden; requires original rendering and viewport. | Source audit only; no new browser run. |

For these four migrated fixtures, the runner resize init script raised a document-root
`appendChild` pageerror (#760), so its CSS injection was skipped. Each fixture already sets
480×300 in both runs, keeping this dimension pair valid. The game URL redirect still enabled `&test`.
