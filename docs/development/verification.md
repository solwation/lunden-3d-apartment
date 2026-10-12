# Browser verification and test selection

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [local-development](local-development.md), [performance](performance.md).
HUD layout only (#707, #716): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/hudlayouttest.cjs http://localhost:8000 /tmp/hud-shots` checks the real index DOM, styles and icon initializer at 844×390, 667×375, 932×430, 568×320 and 1280×720 with zero, symmetric and asymmetric safe insets. It checks the exact 4 px safe-area edge placement (#766), shared shells, modular cells, score hierarchy, icon accessibility, compass height/top equal to the badges with a 4 px gap beside the right badge (#767), unclipped compact data/cardinal text, adjunct/control overlap, lives 12 px below the actual compass with real Combat hurt updates and combat visibility, disabled state and blur fallback. It suppresses game bootstrap; its screenshots are HUD-only, not game-render or gameplay evidence. `CHROME_PATH` optionally selects Chrome.

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
                       Pages drive ghosts / combat updates themselves (SwiftShader frames take seconds). combatsteps.cjs requires
                       reciprocal connected foes and propagated weapons before dependent shots (timeout throws), keeps peers
                       moving during both full-quality screenshots, and stops/restores camera yaw plus screenshot state in finally.
                       Socket closes/reconnects are logged. #769 uses test=lazy and paused automatic loops during gameplay,
                       explicit real updates, and full rendering for both pictures. Its warm-cache setup verifies the actual
                       Nerf muzzle arc clear within 30 s; every subsequent real shot keeps the production 2 s deadline.
                       This does not certify cold first shots, rendered combat FPS or physical phones; see issue-769 evidence
                       and the existing #714/#715 cold-cache limitation.
                       Worker protocol: node --test cloudflare/players.test.mjs (13 PASS in the #768 review).
tools/combatstepstest.cjs (#768): no bootstrap/WebGL, real Ghosts/Combat and local dev.mjs sockets test readiness success,
                       actual disconnect/reconnect, timeout before action, callback/restoration throws and stopped keep-alive work.
                       Run PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/combatstepstest.cjs http://localhost:8721 http://localhost:8722.
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
                       sent, the client's burst limit, complete newest rows fitting viewport height, 60-second TTL fade, menu PÅ/AV (remembered) / show, B as a touch
                       phone: the column clear of the buttons and the stick's corner, "Anonym"; #676 "skriver…" / line bubbles over the ghost
                       (flag only, pause, close, replace, TTL, wall, leave, no 3D objects); #719 the word filter, /tysta + /prata;
                       screenshots into SHOTS. ~10 min. Also `node --test cloudflare/chat.test.mjs` (word filter)
tools/chatsettingtest.cjs (#765) actual Chat module plus production index DOM/CSS, bootstrap suppressed, no apartment or WebGL:
                       menu PÅ/AV persistence across reload, log/speech/typing visibility with outgoing flags preserved (#735),
                       60-second TTL, wrapped row capacity after resize/rotation and while AV, safe areas at phone/desktop sizes.
                       PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/chatsettingtest.cjs http://localhost:8765 /tmp/lunden-chat765
                       Does not replace the live two-player networking/game checks in chattest.
tools/mirrortypingtest.cjs (#743) real Chat/Ghosts and local Worker: key/send/close/deadline/hidden/disconnect/reconnect,
                       shared atlas leases, repeated reset, name replacement, older-canvas fallback, non-raycast sprite and UV changes without uploads.
                       Default also loads the actual apartment at 900×600, quality 3, with controlled paused frames at the hall mirror:
                       existing reflection hooks, actual sprite draw/main-camera exclusion, bounded texture/draw delta and lifecycle disappearance;
                       SHOTS contains the actual mirror image and JSON evidence. --module-only suppresses bootstrap and does not verify rendered mirrors.
                       PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=… node tools/mirrortypingtest.cjs BASE LOCAL_WORKER [--module-only]
                       #743 desktop SwiftShader validation: corrected actual run 38 PASS, 0 FAIL, no page errors; single before/after pass,
                       921→922 aggregate calls and 120→121 textures, texture.version 1; disconnect releases the typing texture.
                       Actual reflected sprite corners fit hall glass at the normal 1.62 m standing eye. Send, close, deadline, hidden and
                       disconnect each draw no typing; afterMirror hides both own objects. Final module-only run adds the explicit self-anchor
                       check (27 PASS). The initial run had 37 PASS but image review exposed an above-glass anchor; this was corrected and
                       rerun, rather than treating counters as visual evidence. Local artifacts: /tmp/lunden-mirror743/{corrected-log.txt,
                       actual-results.json,actual-hall-mirror-typing.png,final-module-log.txt}; initial-clipped-* and full-log.txt retain the first run.
                       Paused controlled desktop frames are lifecycle/draw checks, not phone performance or cold-frame timing claims.
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
(process groups, so a test's Chromium goes too). HTML tests run in headless Playwright Chromium (SwiftShader flags, DPR 1; 1280×800 context normally, 480×300 in the compare test pass);
the runner polls `#out` every 2 s until `ALL PASS` / `SOME FAILED`, or reports TIMEOUT (`--timeout MIN`, default 20) / CRASH.
Needs Playwright (`PLAYWRIGHT_MODULE=…` or a global install; `CHROME_PATH` optional). Logs: `/tmp/runtests-<pid>/<test>.log` and
`summary.json`, never the repo. `--jobs N` runs N tests at once (default 1, **max 2**: the VM is shared), `--list` shows the selection,
`--verbose` prints each test's output.

Output: PASS / KNOWN / FAIL / TIMEOUT per test with the time and the number of FAIL lines, then a summary. **KNOWN** = it fails only
with lines listed in `tools/baseline.json` (`{ "test": ["FAIL line", …] }`: the exact known-red lines, **no times**, e.g. resttest's
#302 lines); any FAIL line not in the baseline is printed as `NEW` and makes the exit code 1. `--update-baseline name…` rewrites those
tests' entries from completed runs only (do it only for failures someone has filed as a `Bugg:` issue).
Known FAIL occurrences are consumed in order: fewer known failures are allowed, while extra duplicates or reordered failures
are NEW. TIMEOUT/CRASH/ERROR never become KNOWN and are excluded from baseline updates, including signal-terminated CJS scripts.

The tracked baseline preserves resttest's existing 19 ordered rows and duplicate occurrences (#302). Historical additions:

| Test | Tracked bug | Exact FAIL rows | Source/query audit and raw evidence |
|---|---|---:|---|
| `streetlighttest` | [#762](https://github.com/solwation/lunden-3d-apartment/issues/762) | 2 | `0d8ebd4^` had `?shot&time=12&month=10&freeze`, no `test`; `/tmp/runtests-184368/` |
| `stucktest` | [#763](https://github.com/solwation/lunden-3d-apartment/issues/763) | 9 | `e863d73^` used `load('?shot')`, no `test`; `/tmp/runtests-184368/` |
| `taskstest` | [#770](https://github.com/solwation/lunden-3d-apartment/issues/770) | 1 | `97bd2b3^` had `?life&shot`, no `test`; `/tmp/runtests-192659/` |

Each full/test log pair has identical complete ordered rows (11, 17 and 93 respectively), including measured values;
only viewport/query changed in the subsequent fixture migration. At the 2026-10-12 audit, production source was unchanged since these runs.
The migrations retained those red assertions. Baseline JSON contains only exact FAIL strings, no timings.
After the separate fixture fixes, `streetlighttest` is 29 PASS / 0 FAIL in 70.582 s on `7f3aa05`
(`/tmp/runtests-252850`), and `taskstest` is 96 PASS / 0 FAIL in 73.245 s on `7488651`
(`/tmp/runtests-244812`). Their source-matched green runs remove both resolved entries. After #763, the unchanged `15ae17c` stuck fixture
also passed: 61 PASS / 0 FAIL, 148 real walking checks, 183.456 s (`/tmp/runtests-259368`). Its source-matched
green run removes the last resolved entry; the current baseline retains exactly resttest's 19 old FAIL occurrences.
21 classification/provenance/actual CLI checks pass, including extra duplicate/reorder exit 1 and excluded timeout/signal-crash
updates (`/tmp/lunden-773-baseline-probe.{txt,json}`); the lifecycle probes load no browser or apartment.

Ordinary runs preserve the fixture's URL and viewport as written. `--compare` runs each HTML test twice: first removing only
`test` from local game document URLs, then adding it when absent (retaining an explicit variant such as `test=lazy`). Other
query options, including quality flags, stay intact. The first pass retains fixture sizing and its 1280×800 browser context;
the second uses a 480×300 browser context plus a top-page iframe stylesheet. Native fullscreen can enlarge the first pass,
while the second remains 480×300 even in fullscreen (#776). This is not a guarantee of full quality when the fixture itself
requests lower quality.
Use `--jobs 1` for sequential comparisons; with `--jobs 2` the passes share load.

The comparison checks every ordered PASS/FAIL row, including duplicates and measured values. `DIFFERENT` makes the CLI exit 1
even when both fixtures report PASS. `IDENTICAL` describes equivalence, not a green verdict: identical known-red results remain
KNOWN and untracked failures remain FAIL. Row-numbered differences show missing or changed lines without normalization.
Timeouts and tests that never load the game print `n/a`; CJS tests run once with their script-defined mode.

`summary.json` records loaded game URLs, test variants, actual child viewport, and controller mode when the frame is retained.
Detached reloads retain URL evidence; their controller may be unavailable. A loaded URL/controller mode mismatch is ERROR.
The summary prints observed mode rather than assuming an unchanged URL means no game was loaded. When HTML and CJS selections
share a basename, raw log filenames include the extension to avoid overwriting one another.

The #771 runner changes have 22 light DOM/CLI checks: actual Chrome document routing, the production query parser, child viewport,
ordered/duplicate rows, CLI exit status, and same-named HTML/CJS logs. Probe artifacts are `/tmp/lunden-737-mode-probe.{txt,json}`,
`/tmp/lunden-737-cli-probe.{txt,json}` and `/tmp/lunden-737-cli-duplicate-probe.{txt,json}`. These probes load no apartment or WebGL;
they do not replace #737's required game-test acceptance runs or claim a game timing improvement.

The #776 native-fullscreen Chrome DOM probe reproduces the old 1280×800 test-pass escape and verifies the corrected
480×300 context, actual Fullscreen API, production query parser, mode/controller evidence and preserved query options
(`/tmp/lunden-776-fullscreen-probe.{txt,json}`). The first #773 rest pair is explicitly query-only at 1280×800 in both
passes (`/tmp/runtests-230917`); it must not be described as a 480×300 test run. The corrected actual rest pass on
`cd77387` is 480×300 with `?test`, controller true and verified mode: 569.040 s, 133 PASS / 19 old FAIL, KNOWN.
All 152 ordered rows match the saved 745.511 s full pass at 1280×800. An export-only VM wrapper called the exact committed
`runHtml`, `classify` and `compareLines`, avoiding a duplicate full run (`/tmp/lunden-776-rest-testpass.{txt,log,json}`).
The fixture, rest/player modules and config outside unrelated CHAT/COMPASS UI changes match the full-pass source `bcbf1ae`;
intervening chat/HUD changes are not represented as an identical production tree. No fixture or production code was changed.

The resize stylesheet waits for the top document root (#760). Chrome DOM probes cover normal, inline-sized and dynamically
inserted iframes: their actual frame and child viewport become 480×300 without init-script errors; child documents stay unmodified.

### Remaining-test audit (#742 / #754)

Excluded/no-benefit rows follow source inspection and claim no new browser run or timing. Migrated rows report measured complete before/after result equivalence; other groups own their migration evidence.

| Test | Status / reason | Before → after time |
|---|---|---|
| `combatremotetest.cjs` | No benefit: actual module-only HTML fixture, no apartment bootstrap or renderer. | Not run for migration |
| `dialogtest.cjs` | Excluded: static real dialog viewport bounds; bootstrap blocked. | Not run for migration |
| `firstframetest.cjs` | Excluded: real phone compilation/uploads and first-frame/loading-cover rendering. | Not run for migration |
| `hudlayouttest.cjs` | Excluded: real HUD viewport bounds; bootstrap suppressed. | Not run for migration |
| `updatetest.html` | Excluded: 844×390 phone layout/hit testing and hardcoded 422px centre. | Not run for migration |
| `veronatest.html` | Migrated: all 34 ordered PASS rows identical, no FAIL; 480×300 and `&test`. | 59 s → 73 s (single pair, no speedup) |
| `viewporttest.cjs` | Excluded: viewport/buffer dimensions, rotation and adaptive resolution. | Not run for migration |
| `visitlightstest.html` | Excluded: lamp brightness measured from rendered pixels. | Not run for migration |
| `visittest.html` | Migrated: all 63 ordered PASS rows identical, including shadow-target state and actual resume; no FAIL across 2 game loads. | 171 s → 138 s (single pair) |
| `walktest.html`, `wardrobetest.html` | No benefit: actual modules/geometries without apartment iframe or rendering. | Not run for migration |
| `wandtest.html` | Migrated: all 7 ordered PASS rows identical, no FAIL; 480×300 and `?test`. | 98 s → 76 s (single pair) |
| `wateringtest.html` | Migrated: all 27 ordered PASS rows identical, no FAIL across 3 game loads including reload/reset; existing 480×300 plus `?test`. | 228 s → 201 s (single pair) |
| `watertest.html` | Migrated: all 57 ordered PASS rows identical, including real ray/action and wash/dry results; no FAIL. | 200 s → 138 s (single pair) |
| `weathertest.html` | Excluded: full particle `drawRange` and light-intensity checks; test-mode quality 0 scales particles to 0.35. Source audit only. | Not run for migration |
| `westbackdroptest.html` | Migrated: all 25 ordered PASS rows identical, including raycast/geometry counts; no FAIL. | 97 s → 73 s (single pair) |
| `zzplanttest.html` | Migrated: all 13 ordered PASS rows identical, no FAIL across 2 game loads; local-only (`cloud` unset). | 128 s → 135 s (single pair, no speedup) |

### d–l source inventory (#779; parent #739 / #736)

Initial #779 source audit: 40 HTML fixtures comprise 36 actual-main iframes and four independent fixtures.
At that audit none of those 36 game URLs selected test mode. The CJS grill wrapper is counted separately.
The table is alphabetical; **Candidate** means a full ordered before/after comparison is still required,
including every reload, actual-main assertion and original viewport. #779 ran or migrated no fixture;
subsequent verified migrations are recorded in their own rows below.
A `setPixelRatio` call or one final `render` call alone does not justify a rendering exclusion.

| Fixture (`tools/`) | Audit disposition | Concrete source requirement |
|---|---|---|
| `detailtest.html` | Full rendering | Detail culler: nearby doors drawn and distant details hidden. |
| `dishrackpicktest.html` | Migrated (#785) | 30 identical ordered PASS rows, zero FAIL; actual 900×600 full/controller false → 480×300 test/controller true. 109.395 s → 77.926 s, single pair (`/tmp/runtests-277486`). Rack/cup rays, mouse/touch and inventory preserved. |
| `drawtest.html` | Conditional candidate | Samples own 2D paper canvas via projected pointer coordinates, not WebGL pixels; retain pointer coverage. |
| `eastbackdroptest.html` | Candidate | Campus source geometry/rays and full/lowmem model-detail parity (retain lowmem subcase). |
| `eggtest.html` | Migrated (#785) | 27 identical ordered PASS rows, zero FAIL; actual 640×400 full/controller false → 480×300 test/controller true. 81.321 s → 71.104 s, single pair (`/tmp/runtests-279045`). Cooking/actions, colour/opacity and save/load preserved. |
| `entrancedoortest.html` | Full rendering | 128×128 render-target pixel readback of handles/glazing. |
| `entranceplantstest.html` | Candidate | Actual plant bounds, pots/floors and collision paths; DPR alone is not exclusion. |
| `esctest.html` | Candidate | Escape/back state through actual DOM controls. |
| `falltest.html` | Candidate | Fall, landing/damage, respawn and geometric paths. |
| `fishtest.html` | Migrated (#785) | 29 exact ordered PASS rows, zero FAIL: original 900×600 iframe enters native fullscreen (actual 1280×800/controller false, 132.108 s). Compare test was 480×300/controller true, 74.350 s (`/tmp/runtests-281141`). Guarded written test in normal 1280×800 runner stays 480×300/controller true, 72.279 s (`/tmp/runtests-291884`); matches retained full `/tmp/runtests-281141`. Fish-finger actions and full cat walking/animation coverage retained; testMode-only fullscreen suppression. |
| `flowtest.html` | Full rendering | Actual renderer geometry-memory growth assertion over cooking and reloads. |
| `focusperftest.html` | Own fixture | 48×48 GPU shader compilation/reuse/disposal; no main iframe. Importmap blocked: #780. |
| `foliagetest.html` | Full rendering | Actual crown readPixels/shade count, cut-out shadows and lowmem atlas. |
| `gabletest.html` | Candidate | Actual gable geometry/layout and ray checks. |
| `garagetest.html` | Candidate | Garage geometry/doors, player navigation and saved state. |
| `grillchickentest.html` | Own fixture | Own 800×520 scene/render images (toDataURL), chicken/grill modules; #780 importmap blocker. |
| `grillinteractiontest.cjs` | Full rendering | Real pointer lock/touch and desktop/touch/eating scene/HUD screenshots; keep its authored viewport/capture path. |
| `grillinteractiontest.html` | Full rendering | CJS-controlled pointer lock/touch and actual scene/HUD screenshots; HTML requires run717 invocation. |
| `grilltasktest.html` | Own fixture | Task modules and paper-canvas image, no main iframe. |
| `grilltest.html` | Candidate | Actual focus/actions and flame visibility, lamp k/lid state; preserve those properties. |
| `hallcaretest.html` | Candidate | Care actions, item geometry, points and reload state. |
| `halltasktest.html` | Candidate | Task cards/actions, inventory/restocking and multiple real reloads. |
| `hangtest.html` | Own fixture | buildWorld and garment bounding boxes, no main iframe/renderer. |
| `holdtest.html` | Candidate | Held object actions, parenting/visibility and stored state. |
| `hudiconstest.html` | Full rendering | 844×390 HUD bounds, 44px controls, blur fallback and scene draw-call equality. |
| `interactionoutlinetest.html` | Full rendering | 160×160 render-target brightness pixels, shader patches and draw-pass equality. |
| `inventorytest.html` | Candidate | Actual inventory/action invariants. |
| `itemtest.html` | Candidate | Item/module checks plus real-app item integration; keep both. |
| `jetpacktest.html` | Candidate | Actual flight/collision/heat, flame visibility, controls and saved state. |
| `jumpontest.html` | Candidate | Jump/landing/collision cases and actual controls. |
| `keytest.html` | Candidate | Key/action access and saved state. |
| `kittentest.html` | Candidate | Kitten behavior/actions and actual scene/state. |
| `laptoptest.html` | Candidate | Actual laptop actions and DOM panel/state. |
| `laundrytest.html` | Conditional candidate | Programme/actions/reloads with real-time values in rows; exact comparison may differ, no normalization. |
| `life2test.html` | Candidate | Actual life/item action integration and persistence. |
| `life3test.html` | Candidate | Actual life/item cooking/actions and persistence. |
| `lifetest.html` | Candidate | Full life inventory/food/storage/reload action flows. |
| `lifttest.html` | Candidate | Lift/stair navigation, panel state, collisions and reload. |
| `lighttest.html` | Full rendering | Pool/wash intensities, lamp fading and actual detail-culler visibility. |
| `loadingtest.html` | Full startup | Early loading/resume covers versus __app readiness; test mode changes warmup lifecycle. |
| `loosemirrorstest.html` | Explicit reflection exclusion (#736) | Parent explicitly retains this mirror test; current assertions cover reflector registration/transforms and lamp pool anchors, without reflection-pixel sampling. |

At the #779 audit, no valid paired d–l migration logs were found in retained `/tmp/runtests-*/summary.json` records
(exact fixture-name matching). This is a local evidence search, not a claim that no external run exists.
Antigravity's 9645849 report contains 18 **after-only** migrated tests, all a–c; its d–l comments do not
establish verification. The two invalid d–l importmaps and the matching a–c map are tracked separately
in #780; this audit leaves them unchanged. Evidence and source line references are retained in
`/tmp/lunden-audit779/{inventory,source-evidence,retained-runner-evidence}.json`.
Suggested independent three-fixture batches and conditional followups are in #779's issue comment;
#739 / #736 remain open. Dynamic rows (especially laundry's live programme time) must remain exact;
no normalization, assertion removal or baseline mutation is permitted to make a pair match.

### m–p source and recovered-branch inventory (#784; parent #740 / #736)

Source audit only: the current tracked range has **31 HTML files**, including `perfcount.html`
with 29 actual-main iframes and two independent fixtures.
Their authored default game URLs do not select test mode. The three assigned CJS wrappers are counted separately.
Every candidate still needs a complete ordered before/after pair covering original viewport and all reloads;
no executable fixture changes or new browser results are part of this audit.

| Fixture (`tools/`) | Audit disposition | Concrete source requirement / evidence limit |
|---|---|---|
| `bowtest.cjs` | Full screenshot rendering | Actual 960×600 game, box/drawn bow/in-flight/stuck arrow screenshots; quality=0 already, no testmode query. |
| `ghostbadgetest.cjs` | Own rendering fixture | Bootstrap blocked; actual Worker/controlled THREE renderer, exact 7 calls/6 textures, cleanup and desktop/phone images. |
| `ghosttest.cjs` | Full screenshot rendering; dynamic rows | Actual multi-page/Worker and visible ghost/name-tag screenshots; 320×200 already. PASS rows include elapsed wall time; no normalization permitted. |
| `measuretest.html` | Unverified branch claim | dd8810d reports parity; ordered logs/actual viewport-controller evidence unavailable locally. Current 900×600 source equals its original baseline. |
| `menutest.html` | Candidate; reported mismatch | Branch full-page crash versus test PASS is not parity; current original 900×600 menu/reset fixture retained. |
| `mieletest.html` | Unverified branch claim | Reported parity lacks retained logs. getImageData samples its own coat-texture canvas, not the framebuffer; original 900×600 source retained. |
| `milktest.html` | Unverified branch claim | Reported parity lacks retained logs; actual carton/pour/drink actions, original 900×600 source retained. |
| `mirrortest.html` | Explicit reflection exclusion (#736) | Actual active Reflector and ghost before/after-mirror drawing hooks; retain reflection mode. |
| `musicintegrationtest.html` | Candidate; trusted activation | Actual appliance/failed-recording media; requires real #music-test-start click and audio waits (old run reported >10 min). |
| `musicreloadtest.html` | Candidate; trusted activation | Actual Sonos selection/playback after reload; requires real #music-test-start click in reloaded iframe. |
| `musictest.html` | Own fixture | Actual audio recordings/decoding/analyser and module lifecycle, no apartment iframe. |
| `neighboropeningstest.html` | Full reflection/lighting | Shared reflection envMap and night envMapIntensity/emission/window-colour checks for actual glazing. |
| `nerfcombattest.html` | Own fixture | Own THREE/Combat/Ghosts/Worker/audio fixture and final 640×400 WebGL scene; no apartment iframe. |
| `nerftest.html` | Candidate | Actual blaster use, flying dart camera layers, wall splash position/colour, floor drop and splash fade. |
| `nesttest.html` | Conditional candidate; random rows | Smart speakers: mocked speechSynthesis, clock/weather answers, ducking, wall targets/F; random chosen answers and answer counts appear in rows, preserve them exactly. |
| `nonpctest.html` | Candidate | Removed outdoor NPC/people.js, absent greeting targets, timed speech bubbles and retained old greets/score. |
| `northbackdroptest.html` | Candidate | Actual mapped north footprints, outward-window rays, terrain/plinth/access bounds and triangle budget; no lowmem subcase. |
| `notetest.html` | Viewport exclusion | Paper scrollHeight/clientHeight and numeric scroll positions/keyboard repeat rows depend on note-panel viewport. |
| `olofcartest.html` | Conditional candidate; random rows | Actual driver/car travel, garage/doors/seats and scoring; randomly chosen dad-joke text is included in results. |
| `oloftest.html` | Conditional candidate; random rows | Actual Olof seats/behavior/actions and non-repeating jokes; randomly chosen joke text is included in results. |
| `opentest.html` | Candidate | Actual fronts/hinges/collisions and stored contents bounds/visibility. |
| `oventest.html` | Candidate | Actual appliance actions, cooking/brewing timers and lamp state; retain all emissive checks. |
| `papertest.html` | Candidate | Actual roll/strip/wad ray-actions, finite paper counts, flushing/stats and reset. |
| `patiopalmtest.html` | Candidate | Actual plant/pot topology, bounds, material and collision footprint. |
| `patiotest.html` | Candidate | Actual patio seasonal/object/action/storage flows. |
| `pctest.html` | Candidate | Actual PC/game/rest interaction and monitor state. |
| `perfcount.html` | Explicit performance exclusion (#736) | Actual renderBufferDirect screen calls/triangles, shadow/mirror/env passes and texture-memory budgets. |
| `pettest.html` | Candidate | Actual pet action/geometry, star visibility/count and return-to-idle; preserve particle checks. |
| `planttest.html` | Candidate | Actual plant/item ray-actions, placement, ownership and reset. |
| `plantwindtest.html` | Full pixel rendering | 192×192 render-target readback asserts moving foliage, focused foliage and pixel-identical pottery. |
| `portiktest.html` | Candidate | Actual portik/bin geometry, walk/actions, save/reload and reset. |
| `posterplacementtest.html` | Candidate | Actual independent poster transforms/layout and optional cloud migration; preserve every cloud/reload subcase. |
| `postertest.html` | Conditional candidate | Paper-canvas pointer drawing and geometry/actions; optional ?shots captures real renderer images and must keep full-render semantics. |
| `powertest.html` | Full lighting | Actual pools/washes, flickering supply, emissive appliance lamps and night-window lighting through cut/repair/reload. |

Recovered `origin/wip/740-tests-m-p` tip `dd8810d` has six fixture edits in its own commit:
measure/menu/miele/milk URL/size changes and mirror/perf comments. The measured merge base with current main is `8c3712a`;
compare the own commit, not its entire diff against today's main. All four original pre-edit HTML
bodies are byte-identical to current main in this audit. Only dd8810d's six-file fixture commit is audited; older chat/changelog work is outside scope.
The #740 handoff reports measure/miele/milk parity, but no exact matching retained local runner summaries
or ordered raw logs were recovered. They remain **unverified**, with no claimed timing/speedup.
Menutest's reported full crash versus test PASS is not a valid pair and its branch migration stays off main.
No cherry-pick or branch rewrite occurred. Evidence/source references are in
`/tmp/lunden-audit784/{inventory,source-evidence,recovered-740,retained-runner-evidence}.json`;
the local evidence search does not rule out external logs. Small followup proposals are in #784's comment.
#740 / #736 stay open; retain explicit mirror/performance exclusions, optional full screenshot paths,
trusted audio activation/waits, random answer/joke rows and all original assertions. The earlier d–l loosemirrorstest row also now
honors #736's explicit exclusion; it is not a future migration candidate.

### TV/chat/anonymous source audit (#798; parent #752 / #741 / #736)

Source-only disposition of the three remaining #752 fixtures. All keep their authored URLs,
viewports, runtime/Worker behavior, assertions and capture paths; no testkit or testcontroller is used.
No app/browser was started in this audit and no fixture was migrated.

| Fixture (`tools/`) | Disposition | Concrete checks and current evidence |
|---|---|---|
| `anontest.cjs` | Viewport/screenshots exclusion | Two sequential 640×420 real app contexts plus privacy bounds/close checks at 640×420, 390×844, 844×390 and 1280×720; six actual screenshots. Worker-generated identities/timestamps appear in result JSON. The second anonymous identity is a direct API POST, not a second simultaneous rendered app. |
| `chattest.cjs` | Viewport/screenshots exclusion | Two independent 480×300 browsers against the Worker, `shot&quality=0&cloud` and fixed positions; actual line capacity/bubble visibility, 667×375 touch bounds and eight screenshots (default 960×600 desktop). PASS/FAIL rows include elapsed seconds and dynamic diagnostics; retain them exactly. |
| `tvtest.html` | Exact-row blocker; Ambilight lighting-state review | Original 900×600/index and native touch/fullscreen behavior; actual additive Ambilight visibility/colour on/off, canvas texture-version updates, TV/remote ray-actions and wall/F checks. No framebuffer readback. Random channel/program names and texture-version values remain in rows. |

Anontest's retained #772 **scripted** run has 23 PASS / 0 FAIL, 324.104 s
(`/tmp/runtests-226631/{anontest.log,summary.json}`, six images under `shots/`). Its executable fixture
is unchanged from the verified source; later application/HUD/chat changes prevent calling that old run
current-runtime acceptance. It is not a full/test pair, and neither the runner's CJS `--compare` label
nor unchanged source establishes parity. No new timing or speedup is claimed.
Current chattest uses `#menu-chat-setting` and contains no `#chat-toggle` after #765.
#744's removed-selector crash describes older source; its bubble-visibility failures were not
reverified against the current app here and are not silently repaired or declared resolved.
The CJS screenshot/viewport exceptions follow #736. TV's Ambilight glow/canvas-state assertions
are not automatically a rendering exemption without pixel measurement; its exact random rows need
a separately scoped disposition. No existing suite is a blanket 480×300 migration candidate.
A later logic-only split or known-failure investigation needs a separately scoped
child and complete actual evidence while retaining all original coverage and dynamic values.
Source line evidence and retained-run provenance: `/tmp/lunden-audit798/{inventory,source-evidence,retained-runner-evidence}.json`.
#752 / #741 / #736 remain open for the coordinator's remaining disposition work.

Current no-game-iframe HTML inventory: `basementfloortest`, `basementlayouttest`, `beershelfcachetest`, `cattest`, `combatremotetest`, `combatworldtest`, `focusperftest`, `grillchickentest`, `grilltasktest`, `hangtest`, `musictest`, `nerfcombattest`, `roomtest`, `startuptest`, `statsresettest`, `trapphusrailtest`, `walktest`, `wardrobetest`. They import actual modules or build their own fixture, so adding `&test` to the apartment URL has no benefit; `focusperftest` also measures performance. Their owners retain their existing verification scope.

Remaining CJS ownership: #738 owns a–c HTML; #739 owns d–l HTML plus `grillinteractiontest`; #740 owns m–p HTML plus `ghosttest`, `ghostbadgetest`, `bowtest`; #741 owns r–t HTML plus `chattest`/`anontest`. `combattest` and `crashtest` already use test mode. `glrestoretest` and `phonememtest` retain full rendering/performance semantics; `nocheathints` has no game bootstrap, and `basemententrytest` already opens its actual-main iframe in `&test=lazy`. No result or timing is inferred from these classifications. #736 remains open until all groups publish actual evidence.

.cjs tests receive `<game url> [<worker url> testtoken]`, `BASE`, `SHOTS`, and a resolved `PLAYWRIGHT_MODULE`.
The same dependency is exposed through `NODE_PATH` for scripts using `require('playwright')`; `CHROME_PATH` and legacy
`CHROME` share the configured executable. Scripts mentioning `cloudflare/dev.mjs` or assigning `worker = process.argv[3]`
get an owned Worker at `--port`+1+slot. Each port must be free before startup; startup errors fail rather than reusing
someone else's listener. Per-test timeout and SIGINT/SIGTERM clean up owned process groups and browsers, including
children left behind by an exited script. Raw output is collected through process close. No broad process-name kills.
The #772 light probes exercise actual CLI/Worker/Chrome DOM lifecycle (15 checks), HTML-browser SIGTERM cleanup (2 checks),
and a resolved-index Playwright override. Evidence: `/tmp/lunden-772-{lifecycle,html-signal}-probe.{txt,json}` and
`/tmp/lunden-772-resolved-index-probe.txt`; these are not game/anontest acceptance.
Actual unchanged `anontest.cjs` acceptance then passed through the runner with its own Worker: 23 PASS, zero FAIL,
324.104 s and exit 0 (`/tmp/runtests-226631/{anontest.log,summary.json}`; six screenshots under `shots/`).
The dialog/start and privacy screenshots were reviewed; no fixture or production changes were needed.

HTML cloud fixtures whose source advertises `cloudflare/dev.mjs` also get an owned Worker per job slot. The runner passes
its URL through the fixture's existing top-page `?worker=` option (`cloudtest.html`, `resettest.html`), leaving game URLs
and fixture wipe/assertions intact. `summary.json` records that URL as `worker`. Ordinary and compare runs use the same
owned-port/startup/timeout/signal cleanup; HTML fixtures without that dependency start no Worker. The 14 light #777 checks
use actual CLI/Chrome DOM, the production query parser and real Worker state/wipe, two slots, collision, timeout and signal
cleanup (`/tmp/lunden-777-html-worker-probe.{txt,json}`), without apartment/WebGL startup.

Migrating a test (#736): use a valid full/test comparison with identical complete ordered rows, then change the logic fixture's
iframe to 480×300 with `?test…` (`.cjs`: `testkit.open`). Drawing, mirror, lighting, pixels and viewport checks retain full size
and a `// no &test: <reason>` marker. Where a single step needs a real picture, use `shot()` / `__app.testMode.setFull(true)`.
Shared-machine timings are noisy; repeat before claiming a gain.

### #737 final acceptance (2026-10-12)

| Test/run | Actual mode and viewport | Ordered results | Elapsed | Raw evidence |
|---|---|---|---:|---|
| `resttest` full | no `test`, controller false, 1280×800 | 133 PASS / 19 old FAIL, KNOWN | 745.511 s | `/tmp/runtests-230917/resttest.log` |
| `resttest` corrected test | `?test`, controller true, 480×300 | identical complete 152 rows, KNOWN | 569.040 s | `/tmp/lunden-776-rest-testpass.{log,json}` |
| `tostarttest` full | no `test`, controller false, 480×300 | 36 PASS / 0 FAIL | 95.506 s | `/tmp/runtests-230917/tostarttest.log` |
| `tostarttest` test | `?test`, controller true, 480×300 | identical complete 36 PASS rows | 80.749 s | `/tmp/runtests-230917/tostarttest.test.log` |
| `cooktest` | fixture's no-test full mode, controller false, 900×600 | 82 PASS / 0 FAIL | 132.925 s | `/tmp/runtests-229228/{cooktest.log,summary.json}` |
| `anontest.cjs` | script-defined, its own Worker | 23 PASS / 0 FAIL | 324.104 s | `/tmp/runtests-226631/{anontest.log,summary.json}` |

The actual CLI compare run on `bcbf1ae` exited 0 and recorded distinct URL/controller modes. Its original rest pair had
1280×800 in both passes (query-only, 745.511→605.217 s); #776 replaces that test-side evidence with the verified 480×300
run on `cd77387`, as described above. Tostart's two runs already used 480×300. Both complete ordered comparisons are
identical, including duplicates and measured values. These are single shared-machine timing samples, not controlled speed benchmarks.
Cook evidence is the exact unchanged assertion fixture fixed separately in #774 (`3bf6918`); its old missing bindings were
not added to a baseline or silently bypassed. Anonymous CJS acceptance ran on `de5c9fb`; its fixture is unchanged.
All game runs completed without browser log errors, crashes or timeouts. Six anonymous screenshots were reviewed and copied
to `/tmp/lunden-runner-resume/`. The light routing, dependency, native-fullscreen and HTML Worker lifecycle probes remain
separate evidence; they do not stand in for game acceptance. Sixteen final source/log/mode/baseline checks pass
(`/tmp/lunden-773-final-audit.{txt,json}`), with no additional browser startup. #736's remaining test-migration work is still separate.

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

## Break fixture Nerf aim correction (#804)

The shared full/test Nerf failure in #802 came from the fixture's manual aim:
it targeted the glass center plus 0.15 m. A light preflight used the exact
source-extracted first BESTÅ wine-glass LatheGeometry, actual `stepNerf`
(speed 30 m/s, gravity 4 m/s²) and actual `Marks.segment` swept intersections.
That original trajectory crossed the glass center plane about 47.5 mm above
the rim, with no glass intersections; center aim produced two genuine bowl
intersections. This preflight used no apartment renderer or forced hit.
Source/module provenance is in `/tmp/lunden-nerf804/`.

The only executable fixture change removes that vertical aim offset. The real
`toys.darts.fire`, its launch offset and one-second simulation remain unchanged,
as do every glass/bottle/shatter/score assertion and production module.
One targeted actual CLI `runtests breaktest.html --jobs 1 --port 8737` on
`3af9f37` plus this narrow patch exited 0: **21 PASS / 0 FAIL**, 104.451 s,
with no browser errors, crashes or timeouts. Actual original URL contained no
`test`, controller was false and observed viewport was **900×600**; native
fullscreen did not expand this run. The runner reports `mode: written` and
`modeVerified: null` because this was a single fixture acceptance, not a mode
comparison. Raw evidence: `/tmp/runtests-306705/{breaktest.log,summary.json}`;
source-byte/coverage checks: `/tmp/lunden-nerf804/actual-run-checks.json`.

The existing no-test source and #802's comparison disposition remain in place.
This fixes the manually elevated fixture shot; it does not establish migration
parity or resolve the separate test-only far rifle shot/points issue #805.

## Test-mode comparison: objects and motion (#802)

Actual CLI `--compare baskettest cartest breaktest --jobs 1 --port 8737`
ran on `b1c04e5`, preserving current assertions. Basket/car received temporary
original 900×600/query restoration from `9645849^`; break already had original
900×600/no-test source. Temporary basket/break fullscreen guards applied only
when the actual test controller existed; their full-mode paths were preserved.
These guards are removed from the final retained full-mode fixtures. Exact
source copies, guard/query/dimension patches and duplicate-sensitive row checks
are in `/tmp/lunden-motion802/`; complete raw logs and actual metadata are in
`/tmp/runtests-297658/`.

| Fixture | Observed full → test viewport | Actual rows / disposition | Full → test elapsed |
| --- | --- | --- | --- |
| baskettest | 1280×800 → 480×300 | 19 PASS each; row 11 differs (`x 0.334` → `x 0.339`). Restore full original 900×600/no-test source. | 85.221 → 80.631 s |
| cartest | 900×600 → 480×300 | complete byte-identical 40 PASS, 0 FAIL; retain existing 480×300/test source. | 99.746 → 74.366 s |
| breaktest | 1280×800 → 480×300 | full 20 PASS / 1 FAIL; test 18 PASS / 3 FAIL; retain full original 900×600/no-test source. | 101.227 → 77.756 s |

Basket/break's full-mode native fullscreen expanded their source iframes to
1280×800; the table reports observed sizes rather than claiming 900×600.
Each full controller was false and each test controller true, with verified
modes and no browser errors, crashes or timeouts. The CLI correctly exited 1
for nonidentical pairs and break's failures. These timings are single shared-
machine samples; they do not justify a performance claim for mismatched runs.

Basket's early wall throw uses unseeded speed jitter before its later outside-
shot random override; no positions or diagnostic rows were normalized.
Break's random shard-on-table row differed `11 of 14` → `12 of 14`. Its
`FAIL a Nerf dart breaks the glass` occurs in both modes. The test pass also
fails `a shot from ~8 m breaks it` and the corresponding points row
(`0 range points vs 0; +0 in all`), while full mode passes both. These are actual
pair differences requiring separate investigation, not evidence of a proven
mode-caused production defect or an interchangeable pair. The shared Nerf failure is tracked in #804; the test-only far rifle shot and
consequent points mismatch are tracked in #805. No failure was added to baseline
or assertion softened.

Car's complete ordered radio gain/cutoff, screen state, interaction and route
rows match. Its existing fullscreen suppression and every current source byte
are unchanged after temporary baseline restoration; the actual test viewport
is verified 480×300. Only car has migration acceptance here. Basket's unsafe
after-only flag is removed; explicit comments preserve basket/break full-mode
dispositions. #738 and #736 remain open.

## Test-mode comparison: actions (#792)

Three actual full/test pairs now verify this bounded #738 batch. The CLI
`runtests --compare actionlabeltest actiontest clicktest --jobs 1 --port 8737`
exited 0 on `0d90eb6` with temporary **dimension/query-only** restoration from
`9645849^`, retaining every current assertion. The previous after-only report
is not used as comparison evidence. Exact patches, source blobs and preserved
fixture copies are in `/tmp/lunden-actions792/baseline-provenance.json` and
`*.dimension-query.diff`; actual raw logs and metadata are in
`/tmp/runtests-284352/`.

| Fixture | Observed full → test viewport | Complete ordered results | Full → test elapsed |
| --- | --- | --- | --- |
| actionlabeltest | 844×390 → 480×300 | identical 8 PASS, 0 FAIL | 94.643 → 75.385 s |
| actiontest | 800×500 → 480×300 | identical 25 PASS, 0 FAIL | 95.032 → 70.331 s |
| clicktest | 900×600 → 480×300 | identical 30 PASS, 0 FAIL | 111.496 → 85.834 s |

Each full game loaded without `test` and with controller false; each test game
loaded with `test` and controller true. All modes were verified, with no browser
errors, crashes or timeouts. Manual comparison found each complete raw log
byte-identical, including duplicate-sensitive ordering, measured positions,
click counts and the action's actual `56 %` prompt. These are single shared-machine
samples, not controlled performance benchmarks. Click's random cache-busting
URL value naturally differs between loads; no result value was normalized.

Action labels now use 480×300 in source. Action and click retain their existing
480×300/test flags, now supported by actual original-sized full/test evidence;
all executable assertions are unchanged. #738 and #736 remain open for the
other source-inventory batches and dispositions.

## Test-mode source inventory: a–c (#778)

This is a source audit of all 43 a–c HTML fixtures, not migration acceptance.
Commit `9645849` added test-mode flags to 18 fixtures, but its #738 report
explicitly describes post-change runs only. Those flags do not prove equivalent
results. No complete valid full/test pair for this group was located in the
local runner summaries examined for this audit. Future comparisons must keep
current assertions and compare complete ordered rows, including duplicates.
For fixtures changed by `9645849`, reconstruct the original URL and dimensions
from its parent in a temporary baseline; do not restore obsolete assertions.

| Disposition | Fixtures | Source evidence / next step |
| --- | --- | --- |
| Standalone (6) | basementfloortest, basementlayouttest, beershelfcachetest, cattest, combatremotetest, combatworldtest | No apartment bootstrap or WebGL renderer. Floor/layout/cat test native world geometry; combat tests preserve CPU/raycast/cache timing assertions. Remote combat needs its CJS driver's historical helper. Beer-shelf cache tests browser cache, image decoding and texture-label data; its invalid import map is tracked in #780. Five executable-module comments now identify the standalone reasons. |
| Companion driver (1) | basemententrytest | Existing `test=lazy`, 900×600, real pointer-lock/touch/walking checks. The CJS companion invokes `runBasementEntries`; the HTML runner alone does not execute its checks. Needs driver-specific comparison. |
| Full rendering/audio/viewport exceptions (5) | architecturetest, carsoundtest, compasstest, cupshadetest, curtaintest | Architecture and cup shade read rendered pixels; car sound measures real analyser/RMS audio and rain workload; compass asserts changing viewport/safe-area bounds; curtain asserts daylight/shadow/texture behaviour. Preserve their full-quality behaviour. |
| Lighting-state review (3) | bestatest, blindtest, christmastest | Emissive/daylight state, hemisphere intensity or active light slots affect assertions. Existing test flags in the first two do not establish safe equivalence; decide coupling before migration. |
| Raw clock-row blockers (2) | calendartest, clocktest | Current time/date or advancing clock/angle values appear in result rows. A deterministic source change needs separate review before exact comparisons; do not normalize measured output. |
| Exact-pair candidates (26) | Listed in the batches below | Source inspection found no framebuffer/audio/viewport assertion requiring full mode. This is a candidate classification, not a passing comparison. |

Create separate comparison issues for these eight bounded batches (3–4 fixtures
per issue). Each needs its own actual full/test runs and unchanged assertions:

| Batch | Fixtures |
| --- | --- |
| Actions | actionlabeltest, actiontest, clicktest |
| Basement and scene state | basementhudtest, basementvisittest, boxwoodtest, bridgetest |
| Objects and motion | baskettest, cartest, breaktest |
| Beer objects | beercantest, beershelfmodeltest, beertest, bottletest |
| Placement and stored photos | bestaplacementtest, artleveltest, boardtest |
| Care and persistence | bedcaretest, clothtest, colddrawertest |
| Interaction | cheattest, booktest, crouchtest |
| Cooking and cloud state | cooktest, cuptest, cloudtest |

`bedcaretest`'s pixel-ratio setup is not a rendering assertion; its comment now
identifies the candidate status. `boardtest` and `cloudtest` use `toDataURL` to
create synthetic uploaded pictures, not sample rendered apartment pixels, so
their existing heuristic comments need separate correction during comparison.
Action labels (844×390), cheats (844×600), and beer-shelf models (900×600) still
have large iframes despite existing test flags. Preserve actual dimensions in
the evidence rather than assuming every flagged fixture uses 480×300.

The actual full-mode cook run after #774 has 82 PASS / 0 FAIL
(`/tmp/runtests-229228`, 132925 ms); the full-mode compass run after #767 has
45 PASS / 0 FAIL (`/tmp/runtests-242392`, 158664 ms). These are full-mode
acceptance evidence only. The lightweight native Chrome import-map probe
(`/tmp/lunden-audit778/importmap-probe.json`) reproduced beer-shelf cache's
invalid JSON and unresolved bare `three` import without starting the apartment.
#780 owns the parser fix (also focusperftest and grillchickentest); #738 and #736
remain open for actual migration work.

## Test-mode source inventory: #748 batch (#786)

This bounded source audit covers all eight remaining #748 fixtures. It changes
comments only; no URL, viewport, assertion or baseline was migrated. No matching
local `/tmp/runtests-*/summary.json` records were found for these eight names,
so no complete preserved full/test comparison is claimed. #748, #741 and #736
remain open. Future comparisons must retain every complete ordered result row,
including duplicates and measured values.

| Fixture | Source disposition | Separate next step |
| --- | --- | --- |
| sabertest | Exact-row timing blocker: `performance.now()` elapsed milliseconds for 40 steps are printed in a PASS/FAIL row, but are not the predicate's performance threshold. This is not a renderer exception. Original iframe 900×600. | Own deterministic-evidence decision before comparison; do not strip the measurement. |
| scoretest | Candidate: score arithmetic, HUD text, actual item/cat interactions and penalty/reset state; no pixel, analyser or viewport assertion. Original iframe 900×600. | Own comparison child; preserve all large interaction branches and measured rows. |
| secretarytest | Exact-row randomness review: the ordered `seen` names are printed. The fixture assigns an LCG only after earlier drawer opens; `SecretDrawer.pick()` excludes the retained current item, and seeding does not reset that item. Thus earlier unseeded state can affect later seeded rows. Original iframe 900×600, frozen noon. | Own source/evidence review before comparison; preserve names and order, not just set membership. |
| sonostest | Exact-row media blocker: real HTML media `currentTime`, gain, AudioContext/decoder state and fetched-file names appear in rows. AudioContext presence alone does not establish a renderer/audio-quality exception. Original iframe 900×600. | Own media evidence decision, preserving real playback and autoplay behaviour; no clock normalization. |
| southbackdroptest | Conditional state candidate: native mapped polygons/geometry, raycasts, triangle budget, camera/fog visibility and seasonal instance/material state. No rendered-pixel sample. Quality knobs change resolution, shadows, mirrors, particles and detail culling; camera far/fog state is configured separately, and `daycycle.js` computes fog from overcast. Original iframe 720×480. | Own comparison child if all native state rows match; retain weather/season assertions and full source provenance. |
| spidersuittest | Viewport exception: actual touch jump/crouch/web button rectangles and pixel gaps are asserted alongside extensive suit/physics flows. Original iframe 900×600, frozen June noon. | Own single-fixture disposition issue preserving original viewport; no blanket physics migration. |
| stairtest | Large candidate: native stair walking/ground/collision/soffit/handrail geometry and distances. `lights.switches` supplies switch positions, not rendered light output. Original iframe 640×400. | Own single-fixture comparison child preserving every geometry result row and diagnostic line. |
| startuptest | Standalone `prepareStartup` module with injected fetch/navigation/storage/service-worker cases and real bounded timeout checks. No actual apartment bootstrap or renderer. | Standalone disposition; no apartment URL test flag needed. |

Six correctly placed script comments record the standalone, viewport and
conditional/blocker reasons. This is source evidence only, with no new runtime,
performance or migration-equivalence result. Proposed work is three separate
comparison children (`scoretest`, `stairtest`, conditional `southbackdroptest`),
three separate blocker reviews (`sabertest`, `secretarytest`, `sonostest`), and a
single-fixture viewport disposition for `spidersuittest`; `startuptest` needs no
mode migration. Source snapshots and the local evidence search are retained in
`/tmp/lunden-audit786/`.

## Test-mode source inventory: #750 batch (#787)

All eight #750 fixtures bootstrap the actual apartment and currently have no
test-mode flag. This source audit adds six script comments only. No exact-name
matching retained `/tmp/runtests-*/summary.json` evidence was found for these
fixtures; no new run, timing or equivalence is claimed. The preserved green
`tostarttest` pair from #776 is a different fixture from `toasttest` and
`toastertest`, so it cannot supply their acceptance evidence.

| Fixture | Source disposition | Original iframe / evidence required |
| --- | --- | --- |
| terracedecortest | Conditional native-state candidate: finite merged geometry/triangle budget, terrace bounds and explicit `TerraceGate.update(camera)` layer tests. Bulb colors are assigned by `exterior.userData.update(night, power)`; a final render does not assert framebuffer output. No measured frame-time threshold. | 400×300, frozen June noon/shot; preserve gate and day/night/power-cut color rows, check actual state parity before any migration. |
| terracetest | Candidate: terrace polygons/areas/joins and actual railing geometry bounding-box height. No viewport or pixel assertion. | 400×300, June noon; complete ordered geometry rows. |
| terraintest | Large candidate: ground/road/ramp/stair/plinth values, dense 5 cm OUTDOOR continuity pairs, collision guards and tree-foot placement. The pair count and sampled discrepancies are actual printed values. | 400×300, June noon; own single-fixture comparison, preserve the complete scan and all raw values. |
| thingtest | Candidate: actual bottle/glass transforms, held/place/home actions, fill/color material data, pouring/drinking and reset state. A material color field is not a sampled rendered pixel. | 900×600; all native interaction/state rows. |
| toastertest | Conditional native-state candidate: slot glow opacity and lever positions are assigned in `Toaster.update(dt)` independently of quality knobs. Actual drawer/cord/socket actions and a second main load validate persisted placement/plug state. | 900×600 on both loads; preserve glow assertions and real reload, verify both actual mode/viewports. |
| toasttest | Candidate: actual life-item bread slots, carriage, cooking/crumb events, names, butter/cheese actions and eating. Counted crumbs are domain events, not a particle/render measurement. | 900×600; preserve all cooking/actions and repeated eat rows, including duplicates. |
| todotest | Candidate: committed sample-data priority order/title cleaning, DOM panel visibility, native focus/poster and fridge-door transforms. `offsetHeight > 0` checks visibility, not fixed viewport/pixel spacing. | 900×600; use the same local sample source (published `data/todo.json` can differ), preserve names/order/focus text. |
| toilettest | Conditional native-state candidate: flush water position, sheet opacity/visibility and pool emissive intensity are assigned in `Flush.update(dt)` from refill time. No actual rendered-pixel/light analyser assertion. | 900×600, frozen noon; retain all material-state/flush/lid assertions and raw drop values. |

Quality knobs in `main.js` change resolution, shadows, mirrors, weather particles
and detail culling; they do not assign the above terrace bulb, toaster glow or
flush material fields. That source separation does not prove runtime equivalence
or override any genuine rendering/lighting exception: these three fixtures stay
conditional until complete native-state results match in actual full/test runs.
No generic DPR/render call is used to invent an exception, and no measured row
may be normalized or omitted to manufacture a match.

Suggested independent children: `terracetest` + `thingtest` + `todotest` (three
ordinary fixtures), `terraintest` alone (large scan), `terracedecortest` alone
(conditional gate/bulb state), `toastertest` alone (two real loads), and `toasttest`
+ conditional `toilettest` (two fixtures). Each child must inspect complete
ordered, duplicate-sensitive rows with source/controller/actual-viewport
provenance before migration to 480×300. #750, #741 and #736 remain open. Source
snapshots, comment-byte checks and the local evidence search are retained in
`/tmp/lunden-audit787/`.

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
| `rearrangetest` | Migrated: all 28 ordered PASS lines and ALL PASS identical at baseline `f553436`; no pageerrors (logs `/tmp/runtests-175654`). | 94.415s → 70.563s |
| `rearrangetvtest` | Migrated: all 9 ordered PASS lines and ALL PASS identical (logs `/tmp/runtests-160072`). | 159.183s → 136.002s |
| `rearrangeuitest` | Exempt: landscape-phone viewport and touch target layout need 844×390. | Not run: deliberate viewport exemption. |
| `reloadtest` | Unmigrated: real wall-clock values in PASS labels across scene loads prevent reliable exact output comparison. Source-audited blocker, not a rendering exemption. | Not measured; no output normalization. |
| `resettest` | Unmigrated: the real current clock is included in a PASS label across four game loads; reliable exact row comparison would require forbidden normalization. This is a source-audited comparison blocker, not a rendering exemption. | Source audit only; no new browser run or timing (#747). |
| `resttest` | Already migrated (#703). Reused source-matched full/test acceptance: all 152 ordered rows identical, including duplicate known failures (133 PASS / 19 FAIL); SOME FAILED both. Fixture blob `9e9d34a`, rest/player unchanged from full base `bcbf1ae`; test evidence `/tmp/lunden-776-rest-testpass.{log,json,txt}`, preserved full `/tmp/runtests-230917/resttest.log`. | 745.511s at actual 1280×800 → 569.040s at actual 480×300; controller false → true (#747/#776). |
| `returnmarkerstest` | Migrated: all 15 ordered PASS rows and ALL PASS identical; no pageerrors. Actual return/placement actions, contour material/transform checks and interaction-ray exclusion unchanged; `/tmp/runtests-254016/`. | 83.109s at 640×400 → 70.054s at 480×300; controller false → true; wall-clock times include end-of-run screenshots (#747). |
| `rifletest` | Migrated: all 12 ordered PASS rows and ALL PASS identical, including exact shot/hole/ammo/reload/drop/target-score values; no pageerrors. Only test-mode controllers suppress native fullscreen so written ?test also retains the intended fixture size; original full-mode path and all actions/assertions preserved. `/tmp/runtests-263389/`. | 132.827s at actual 900×600 → 89.373s at actual 480×300; controller null → real controller; both fullPage screenshots included (#747). |
| `riverparktest` | Migrated: all 19 ordered PASS rows and ALL PASS identical, including measured tree/understory/shore counts, 5480 triangles and 0.025 m maximum terrain gap; no pageerrors. Original geometry-budget/raycast/season assertions unchanged; `/tmp/runtests-261347/`. | 112.386s at 720×480 → 78.847s at 480×300; controller false → true. Includes screenshot attempts; full capture timed out after 15s, test image saved (#747). |
| `rollreplacetest` | Migrated: all 22 ordered PASS rows and ALL PASS identical; no pageerrors. Four real game loads per pass retain all URL records (earlier reload controllers unavailable, final live controller verified); original touch/identity/exchange/save/reset assertions unchanged. Existing 480×300, DPR 0.15 and fullscreen suppression retained; `/tmp/runtests-269323/`. | 335.605s → 283.920s; final actual 480×300/controller null → real controller. Both fullPage screenshots included (#782, Del av #747). |
| `rooftest` | Exempt: asserts full lamp-pool allocation and quality-dependent DetailCuller visibility from the roof; retain original rendering/viewport. | Source audit only; no new browser run (#747). |
| `roomtest` | Already standalone: actual buildWorld/roomAt modules; no game iframe, apartment bootstrap or WebGL renderer. Canvas only illustrates room ownership. | Source audit only; no new browser run (#747). |
| `statsresettest` | Already standalone: real stats/score/persistence modules and DOM, no game iframe, apartment bootstrap or WebGL. No game test-mode migration applies. | Source audit only; no new browser run. |
| `storetest` | Migrated: all 17 ordered PASS lines and ALL PASS identical at baseline `34b0d86`; no pageerrors (logs `/tmp/runtests-184368`). | 98.264s → 69.506s |
| `streetlighttest` | Migrated with tracked pre-existing failures (#762): all 11 ordered rows identical (9 PASS / 2 FAIL), SOME FAILED both; no pageerrors. Assertions unchanged. | 100.732s → 72.214s |
| `streetsigntest` | Exempt: compares actual renderer.info.render.calls with signs shown/hidden; requires original rendering and viewport. | Source audit only; no new browser run. |
| `stucktest` | Migrated with tracked pre-existing failures (#763): all 17 ordered rows identical (8 PASS / 9 FAIL), SOME FAILED both; no pageerrors. Assertions unchanged. | 220.582s → 185.018s |
| `tablesettingtest` | Migrated: all 25 ordered PASS rows and ALL PASS identical; no pageerrors, 3 game loads including reload/reset. Existing 480×300 and DPR 0.15 retained. | 223.777s → 202.649s |
| `targettest` | Migrated: all 15 ordered PASS rows and ALL PASS identical; no pageerrors. Dart/score/geometry state assertions unchanged. | 97.170s → 73.548s |
| `taskstest` | Migrated with tracked pre-existing failure (#770): all 93 ordered rows identical (92 PASS / 1 FAIL), SOME FAILED both; no pageerrors. Existing stop-loop, task-card action, reward/reset/persistence assertions retained. | 87.022s → 73.903s |

For the first four migrated fixtures (follow, placement, reset and TV), the runner resize init script raised a document-root
`appendChild` pageerror (#760), so its CSS injection was skipped. Each fixture already sets
480×300 in both runs, keeping this dimension pair valid. The game URL redirect still enabled `&test`.


Street-light fixture correction (#762): `tools/streetlighttest.html` now validates each L1001–L1008 front-door wash
and its complete ground-pool interval against the actual `world.openings` and `husLLayout` positions, rather than a
combined batch count. Portik wall/floor/ceiling geometry is checked separately. All 4320 front-pool vertices remain
in front of the façade and follow `groundY`; original day/night/fade/street-slope requirements remain. Actual app run:
**29 PASS, 0 FAIL**, 71 s, no pageerrors, existing `&test` and 480×300 iframe unchanged. Evidence:
`/tmp/runtests-252850/streetlighttest.log` and `summary.json`. The older migration pair above remains historical evidence;
no production, migration, baseline or changelog changed, and no new surveyed/Peab measurement is claimed.


Stuck fixture correction (#763): `tools/stucktest.html` seeds level-0 outdoor records/teleports at the actual coded
`groundY`, retains nominal indoor storey floors, and snapshots grounded/free/main-floor after getting up. Every
get-up then runs the original walking criterion (>0.5 m, not inside an obstacle) without short-circuiting earlier
checks. Individual terrain outcomes and failed direction/position attempts are retained. Final actual-app run:
**61 PASS, 0 FAIL**, 183.456 s, all 148 get-ups and 148 walking checks (52 outdoor positions), including all eight
negative-height dynbox cases and all six swing doors; no pageerrors. Both loads remain 480×300 in the existing test
mode. Evidence: `/tmp/runtests-259368/stucktest.log` and `summary.json`.

The first repair run (`/tmp/runtests-255661/stucktest.log`) passed all get-ups but reported two door FAIL rows after
an extra endpoint-free/main-floor restriction was added to the general walking helper. That out-of-scope restriction
was removed before the final run; the original walking condition is preserved. Those failures are not evidence of a
production walking defect. Old migration evidence remains unchanged; no production, migration, baseline, changelog
or surveyed/Peab height claim is part of this correction.


## Navigation, toys and stairwell source audit (#788 / #751)

This is a source disposition, with no new browser run or new timing measurement.
All fixture URLs, sizes, actions and assertions remain unchanged. Generic render calls,
DPR setup and checks of gameplay/material state do not by themselves justify a rendering exemption.

| Fixture | Disposition | Evidence / remaining work |
|---|---|---|
| `tostarttest` | Already migrated (#703); reuse preserved acceptance. | All 36 ordered PASS rows identical, no pageerrors; `/tmp/runtests-230917/tostarttest{,.test}.log` and `summary.json`: 95.506s → 80.749s, actual 480×300 both, controller false → true. Historical runtime, not a new run. |
| `touchtest` | Viewport exemption. | First load uses fixed 900×600 touch coordinates (joystick 120,450 and look 700,300); shrinking to 480×300 changes the input regions and places points outside the view. Keep original first load and subsequent action-menu checks. |
| `toystest` | Migrated (#799); all original blaster/wand/flashlight actions and assertions retained. | All 23 ordered PASS rows and ALL PASS identical, including dart/drop heights, sparkle count and beam direction; no pageerrors. `/tmp/runtests-292691/`: 132.243s at actual 900×600/controller null → 85.098s at 480×300/real controller. Both fullPage screenshots included; only test-mode controllers suppress native fullscreen. |
| `trapphusatest` | Migrated (#800); original stairs/lifts/doors/collision/save/HUD/geometry/power-state assertions preserved. | All 60 ordered PASS rows and ALL PASS identical, including repeated stair/lift checks and exact coordinate/height/door/save values; no pageerrors. `/tmp/runtests-302672/`: 174.591s at actual 800×500/controller null → 106.810s at 480×300/real controller. Both fullPage screenshots included; existing fullscreen suppression unchanged. |
| `trapphusbctest` | Comparison candidate; not migrated. | Same functional distinction as A; retain independent B and C variants (`?house=C` on the fixture), every route/save/power assertion and complete exact ordered output. Both variants need full/test pairs. |
| `trapphusrailtest` | Standalone; no game-mode migration applies. | Actual buildWorld/Core/Player modules and manual movement into the rail; no game iframe/bootstrap or WebGL renderer. Source inspection only, no runtime result claimed. |
| `turbotest` | Migrated (#799); original injected clock, coffee/speed/FOV/walk/wall/expiry assertions preserved. | All 10 ordered PASS rows and ALL PASS identical, including ×1.80, 78.0°, 2.38 m, wall x 0.71 and 115 → 150 s; no pageerrors. `/tmp/runtests-295099/`: 198.024s at actual full-screen 1280×800/controller null → 119.221s at 480×300/real controller. Both fullPage screenshots included; only test-mode controllers suppress native fullscreen. |
| `turntest` | Rendering/performance exemption. | Actual warm-up and rendered frames gate WebGL program/texture counts and record uploads, shadows, mirrors and phase times; optional readPixels synchronization. Test mode changes the measured rendering workload. |

Tostart provenance was checked against acceptance base `bcbf1ae`: the fixture and relevant
player/rest/jetpack/spidersuit/car/core/world blobs match exactly; the toStart handler is unchanged.
Later main/config differences are unrelated chat/compass UI changes; the whole source tree is not claimed
identical. The source and exact-row audit is retained at `/tmp/lunden-audit788/tostart-provenance.json`.

Remaining comparison child: stairwell B/C (#801) with both variants remains unverified and unreserved.
Toys + turbo (#799) and stairwell A (#800) are now verified and migrated.
The parent #751 remains open until its remaining comparisons and dispositions are handled.
