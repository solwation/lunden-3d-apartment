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
                       #744 source preflight found that peer counts and received bubble presence did not establish rendered visibility.
                       Its fixture now waits for actual placed/visible peer tags before input, visible typing/sent bubbles before their existing
                       assertions, and a visible baseline before the existing wall-hide/restore check. Authored poses, quality 0, viewport sizes,
                       network/input paths, assertions and screenshot/TTL behavior are retained; no forced visibility or production timeout change.
                       Current pre-edit exclusive desktop diagnostic at source base 8b6a98f observed 7 received typing and 4 sent-line samples,
                       all natively shown, with visible ghost/tags, clear actual wall predicate and in-view projection. The first 14 ms sample was
                       still awaiting transport. Camera matrix refresh changed projected x slightly (0.04↔0.09), without hiding the bubble.
                       This did not reproduce a current product visibility failure or the obsolete chat-toggle error (already replaced by #765).
                       Evidence: /tmp/lunden-chat744/{preflight.json,current-bubble-diagnostic.json,current-bubble-diagnostic.png,diagnostic-log.txt}.
                       Earlier complete written run before #838: 40 PASS / 2 FAIL, terminal SOME FAILED (2), no page errors; final leave assertion +960 s.
                       All 43 check call sites remain (42 normal assertions plus crash catch). Typing/sent/wall/TTL, commands, mute, layout,
                       phone reply and leave pass. The new AV (+588 s) / PÅ (+666 s) missing-message failures are tracked separately in child #838;
                       #744 stayed open at that stage. The menu flow was unchanged in the partial step; reconnect/send timing was not yet diagnosed.
                       Both contexts initially use 480×300; the existing screenshot helper enlarges the capture page for six 960×600 desktop
                       images (five B, one A), and two 667×375 phone images, then restores 480×300. All eight PNG dimensions were checked
                       and images visually reviewed; this is not an entire-run-at-480 claim. A's last image includes its own “Olof syns inte” line,
                       while B's expected received list lacked it; this prompted #838's native rejoin/peer-membership diagnosis below.
                       Full raw log, summary, eight PNGs and runtime/fixture SHA256 provenance: /tmp/lunden-chat744/full/.
                       #838 fixture precondition: after AV menu resume, wait up to 90 s for both native sockets/me ids and reciprocal current
                       peer ids through the existing drive, then send the original message exactly once and log its raw return. All original
                       AV predicates remain with an added readiness condition; PÅ local retention, TTL and eight captures stay unchanged.
                       Corrected passive-CDP/native menu diagnostic at ed7ff32 was healthy (4 PASS): AV reset B's identity/peers, then it
                       rejoined with a new id before the original 1200 ms first send; observed welcome→send gap was 476 ms. Both message
                       receipt and PÅ local retention passed, the latter even with B temporarily disconnected. The earlier loss was not reproduced;
                       mutual membership is a fixture precondition, not evidence of a product defect. An initial observer-only optional-queue
                       error before the menu is retained separately and provides no menu diagnosis. Queue absence is now observed as null.
                       A separate real local Worker protocol case (no browser/WebGL) passes 4 checks: B leaves, a witness confirms an absent-time
                       broadcast completed, B rejoins with a new id without chat replay, and one fresh message is delivered. This intentionally
                       absent-receiver case verifies protocol behavior; it does not reproduce the earlier app menu loss.
                       Native/CDP trace, observer-failure evidence and protocol-case raw events: /tmp/lunden-chat838/.
                       Final complete written #838/#744 acceptance at base 284b046: 42 PASS / 0 FAIL, ALL PASS, exit 0, no pageerrors;
                       final leave assertion +868 s. Original AV and PÅ predicates pass, including receipt while hidden and local retention.
                       Mutual native room readiness was true; the exactly-once first send returned an empty success string. All 43 check
                       call sites (42 normal assertions plus crash catch), TTL, real Worker/input and eight capture paths remain unchanged.
                       Initial contexts were 480×300; six desktop captures are 960×600 and two phone captures 667×375, with the existing
                       helper restoring the prior viewport. All eight images were visually reviewed. The frozen 247 runtime hashes and
                       exact fixture SHA256 matched after completion. Raw log, summary, eight PNGs and provenance: /tmp/lunden-chat838/final/.
                       This validates the fixture readiness changes; the earlier menu loss was not reproduced as a production defect.
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

`christmastest.html` retains its original `PASS/FAIL christmastest` summary and every original ordered check row,
then appends `ALL PASS` / `SOME FAILED` from the same final `pass` flag (#847). Its earlier summary alone was not a runner
completion marker. The output assignment and actual runner parser/classifier were verified in native Chrome DOM for success
with duplicate/dynamic rows, a late failure, a caught exception and both complete original raw logs from #813; all prior
ordered rows stayed identical (five cases). This focused protocol check loads no apartment and does not establish
season-state parity or new runtime timings.

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
| `eastbackdroptest.html` | Default migrated (#818); optional lowmem app stays full/unmeasured | 46 identical ordered PASS rows, 0 FAIL; native 720×480/full → 480×300/test, explicit FULL/LITE facade-builder checks preserved. Actual evidence and capture limits below. |
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
| `tvtest.html` | Retained full after actual #803 mismatch | Original 900×600/index and native touch/fullscreen; 19 PASS per mode but three complete random programme/channel rows differ. Native Ambilight/texture/ray/action/F coverage retained without pixel exemption; see [actual TV disposition](#tv-actual-comparison-disposition-803--752). |

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

Current no-game-iframe HTML inventory: `basementfloortest`, `basementlayouttest`, `beershelfcachetest`, `cattest`, `combatremotetest`, `combatworldtest`, `focusperftest`, `grillchickentest`, `grilltasktest`, `hangtest`, `marksphysicstest`, `musictest`, `nerfcombattest`, `roomtest`, `startuptest`, `statsresettest`, `trapphusrailtest`, `walktest`, `wardrobetest`. They import actual modules or build their own fixture, so adding `&test` to the apartment URL has no benefit; `focusperftest` also measures performance. Their owners retain their existing verification scope.

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

## Reload actual clock/world disposition (#842)

Exactly one unchanged original `reloadtest` full/test pair ran on clean
`081078d`: 900×600, all **16 authored main loads per mode**, real F5/resume,
early-screen/new-tab flows, cache/Date.now paths and every current world/hand/
life/car/storage/clock assertion. Public `runtests --compare --jobs 1 --port 8737
--timeout 40` used a genuine independent monitor session **392086**, runner
**392089**. `/tmp/runtests-392089/reloadtest{,.test}.log` has **43 PASS / 1 FAIL**
per mode, **44 complete ordered rows**, SOME FAILED both. All remaining
restoration assertions executed after the budget failure, with no shortcircuit.
Exact duplicate-sensitive raw differences are:

| Row | Original full | Test |
|---|---|---|
| 3 | `PASS the real clock and date, not the record's (20:47, 12/10) (#143)` | `PASS the real clock and date, not the record's (21:08, 12/10) (#143)` |
| 6 | `PASS restart → the real time and date (20:48, 12/10)` | `PASS restart → the real time and date (21:08, 12/10)` |
| 25 | `FAIL the world record: v 1, 7093 bytes` | `FAIL the world record: v 1, 7077 bytes` |
| 43 | `PASS a new tab: at the start, the real time (21:07), the car in the garage (#358), empty hands, the fridge shut` | `PASS a new tab: at the start, the real time (21:25), the car in the garage (#358), empty hands, the fridge shut` |

The budget check's original `JSON.stringify(world0).length` measures **UTF-16
code units**; "bytes" is its preserved raw label, not independently measured
UTF-8/network size. Independent bug **#845** tracks the native 7093/7077 versus
6000 threshold, outside migration scope; its cause and intended budget remain
open. Neither the failure nor its 16-unit difference was normalized or masked.
Every other complete row matches, including car **3.1 m**, garage **t 0.22**,
cup **0.80**, world clock **21:45 / 10 January / paused**, **37** life views,
plate/half-slice hand restoration and broken-record fallback.

All **32** actual app-ready documents have native URL/timeOrigin identity and
live controller evidence: full false/null API, test real `draw`/`setFull`/
`wantsFrame` functions, `lazy=false/full=false`. All full app-ready sizes were
**900×600**; load **6** later leaves at **1280×800/native fullscreen**, with the
other 15 native pagehide phases 900×600/no fullscreen. Every test app-ready and
native leave phase remains **480×300**, including fullscreen on load 6. Each
mode has 16 native pagehide snapshots plus one beforeunload. All frames were
authoredly removed; no final retained main frame exists. No observation errors
or transport warnings occurred, and no controller/cache/fixture state was
changed by passive observation. No fixture fullscreen guard was added.

Actual monitor exit **1** preserves the mismatches and both unbaselined reds;
exact reported wall times **1246028 ms → 1097220 ms** include passive/capture
overhead and establish no speedup/parity claim. Both screenshots were inspected:
`/tmp/lunden-reload842/reload-full.png` contains all 44 textual rows/red;
`reload-test.png` is cropped to the top rows/SOME FAILED, with row 25 outside
the image. Neither contains a retained scene or proves rendered pixel parity.
Source hashes, all 32 native app-ready documents and their 34 leave snapshots,
whole raw progress, actual exit and exact
differences are retained in `/tmp/lunden-reload842/{run-provenance,verified-disposition,full-loads,test-loads,monitor}.json`;
the recoverable full-half checkpoint is issue comment **6130854164**.
The **entire full-original fixture remains byte-identical**: documentation only,
no seed/time freeze/clock normalization/retry/assertion/baseline/production change.
This completes #741's reviewed 51 named dispositions (49 HTML + 2 CJS),
with #746–#752 closed and #840's actual reset disposition retained. Global
#736 remains open; independent #845 is not implemented by this comparison.

## Reset actual clock/Worker disposition (#840)

Exactly one complete original `resettest` full/test pair ran on clean `fcf3a7c`
with the entire current fixture unchanged (original executable `9645849^`):
900×600, random cache-bust URLs, local/offline Worker transitions, real reset
reload, all storage/drawing/queue/name/photo/score assertions and native clock.
`/tmp/runtests-381263/resettest{,.test}.log` contains **31 PASS / 0 FAIL each**.
The complete ordered duplicate-sensitive comparison differs only at row 19:
`PASS at START at the real time (20:15)` versus
`PASS at START at the real time (20:21)`. Every other complete raw row matches,
including the full retained storage-key list, unchanged score **15**, synced and
queued drawings, cat photo, real reset and final reload. Independent monitor
PID/session **381262** recorded actual runner **381263** exit **1**; the mismatch
is preserved, with no clock freeze/normalization, seed, retry or migration.

Passive external observations supplement the published runner's frame-reuse
metadata. **All four main loads per mode** have actual URL/native timeOrigin
identity guards and live controller readings. Full controllers were false;
test controllers were real, with `draw`, `setFull` and `wantsFrame` functions,
`lazy=false`, `full=false`. No controller method was invoked by observation.
App-ready full dimensions were **900×600** on all four loads; native
beforeunload/pagehide shows the first **two** later expanded to **1280×800**
with fullscreen active. The third left at 900×600 without fullscreen; the final
retained fourth frame was also 900×600/no fullscreen. All test app-ready,
before-navigation and final dimensions stayed **480×300**, including active
fullscreen on the first two. Manual pagehide is separately marked untrusted;
native lifecycle events are trusted. No fixture fullscreen guard was added.

The public runner reuses one owned local Worker process at **8738** across
modes. Each mode's original `DELETE http://localhost:8738/admin/all` returned
**200**, freshly wiping its isolated local data before testing; it is not a
fresh process per mode. Original offline port **9** and the plain fourth dev
load's empty cloud URL remain intact. No production Worker was contacted or
wiped. The original authored wipe and reset behavior were unchanged.

Reported wall times were **475740 ms → 296508 ms**, including passive observer
and final-capture overhead; no speedup/parity claim is made for mismatched raw
outputs. Full final screenshot timed out after 10 seconds; inspected
`/tmp/lunden-reset840/reset-test.png` shows cropped result text only, with no
reset-screen visual claim. No extra app run was made for an image.
`/tmp/lunden-reset840/{run-provenance,verified-disposition,full-loads,test-loads,monitor}.json`
retains all eight identities, lifecycle/final snapshots, native wipe statuses,
complete raw differences and actual exit. The full-original fixture remains
byte-identical; only this documentation changes. Global #736 remains open;
#741 remains open for #842's independent actual reloadtest disposition.

## TV actual comparison disposition (#803 / #752)

One complete `tvtest` full/test pair ran on `fa51ae9` with only a temporary
testMode-only fullscreen guard before its original touch-start. The original
900×600/no-query full branch and every native action/ray/wall/F, random
programme/channel, texture-version and Ambilight-state assertion were retained.
`/tmp/runtests-373561/tvtest{,.test}.log` has **19 PASS / 0 FAIL per mode**;
controller/mode metadata verifies actual **900×600**, no test parameter,
controller false versus **480×300**, test parameter, controller true. Native
fullscreen did not expand the full frame in this run. The complete ordered,
duplicate-sensitive raw comparison differs at exactly three rows:

| Row | Original full | Test |
|---|---|---|
| 6 | `a new programme each time (färgvirvlar: 2 → 0)` | `a new programme each time (superhjältar: 6 → 3)` |
| 8 | `Sovrum 3 TV on: undervattensvärld` | `Sovrum 3 TV on: neonracet` |
| 10 | `Sovrum 1 TV at (2.75, 4.55, 2.55): "Slå på tv:n", on true, new programme 5 → 3, off` | `Sovrum 1 TV at (2.75, 4.55, 2.55): "Slå på tv:n", on true, new programme 6 → 5, off` |

Every other complete result row is identical, including actual texture
**v2 → v8**, Ambilight visible/color-sum on and dark-off **true/true**, remote
channel **1 → 4**, positions and **201** hidden loose items. The original
`Screen.tune` randomness was neither seeded nor normalized; no rerun sought a
match. CLI exit **1** correctly reports this raw mismatch despite both PASS
verdicts. Therefore the temporary guard was removed and **the entire current
full-original fixture file is retained byte-identically**; no migration or
baseline/assertion/production change was made.

The raw reported times were **99891 ms → 76028 ms**, including a failed
10-second final screenshot attempt in **each** mode. Both capture errors are
preserved in `/tmp/lunden-tv803/screenshots.txt`; no image was obtained, no
extra app was run for screenshots, and no speedup or rendered Ambilight/pixel
claim is made. Native glow visibility/material-color and texture-update checks
are functional state coverage, not an automatic renderer exemption.
Frozen runtime source and exact differences are recorded in
`/tmp/lunden-tv803/{run-provenance,verified-disposition}.json`.

#752's remaining TV disposition is now measured and retained full. Its
`anontest.cjs` and `chattest.cjs` viewport/screenshots exceptions remain recorded
in the #798 inventory below; those independent CJS suites are not migrated by
this comparison. #741 remains open specifically for #840's missing actual
resettest disposition; global #736 retains its other independent fixture work.

## Sonos trusted fixture activation (#839)

`sonostest.html` retains its original 900×600/no-query app and every real
channel/currentTime/gain/context/decoder/fetch, authored WAV and missing-file
assertion. Setup now waits up to 180 seconds for actual `__app` and the hidden
loading cover while startup rendering continues. It then exposes its own
readiness gate and waits up to 30 seconds for one trusted click on the actual
game `#start-touch`. After actual cover release, animation is stopped before
the gate, restoring the original manual-step/media setup order. Read-only
`window.__sonosStart` records click trust/user activation/cover state and the
first-media ordering; those observations do not alter raw result rows.

Use the explicit companion with the published runner:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome \
  node tools/sonosstart.cjs sonostest.html --jobs 1 --port 8737
```

The same companion also supports `--compare sonostest.html`; it waits for the
fixture-owned gate and performs exactly one native locator click per mode.
It adds no routes, test-source rewrite, autoplay policy, force click, audio or
clock stub. The explicit wrapper runs the unchanged public runner as a child and combines
its exit with structured IPC activation evidence, preserving every original
nonzero code and forwarding termination for owned cleanup. Missing/failed
activation makes the wrapper exit nonzero even if the child reports success. A plain runner invocation without the companion
now fails with an explicit bounded setup message; manually opening the fixture
and clicking the visible game start button also satisfies its gate.
The unchanged authored fallback/SKIP branches remain intact. First native
acceptance on `7d17c79` (`/tmp/runtests-363854/`) exited 1: native start locator
timed out and the fixture emitted its bounded setup FAIL before any media
assertion. Actual frame was 900×600/controller false. That first proposal had
moved the original animation stop after the click. The corrected ordering
stops only after loading-hidden but before the gate. The companion now records
read-only ready-time frame/DOM/overlay/phone/button rect and hit-test evidence;
no timeout, target or styles changed. This ordering follows the original setup;
software-render starvation is not claimed as the observed first-run cause.
Corrected **written-full** native acceptance on `d662121` plus this reviewed
setup (`/tmp/runtests-368613/sonostest.log`) completed **37 PASS / 0 FAIL**,
runner/wrapper exit 0, 97274 ms and no runtime/crash errors. Read-only readiness
records show authored 900×600, `body.phone=false`, loading hidden, real
`#start-touch` visibly hit-testable. One trusted click recorded active and
hasBeenActive true at 91925.3 ms; first media action was later at 92145 ms with
hasBeenActive true. Native fullscreen subsequently expanded to actual
**1280×800**, no test parameter and controller false. This was a written run,
so `modeVerified=null` correctly makes no full/test comparison claim.

All six real channel clocks advanced (raw **0.03 / 0.07 / 0.07 / 0.07 / 0.07 /
0.07 s**); the real AudioContext was running. Gain **0.177 → 0.232 → 0.126**,
channel rotations, panners, floor muffling, missing-file failure status, complete
fetch list and authored WAV decoder branch (readyState 4, playing, no error)
remain in the untouched raw rows. No autoplay policy override, media/clock stub,
seed, normalization or functional assertion change was used. The actual setup
fix is accepted; #836's later independent full/test pair still must retain
these dynamic raw values without masking differences.

Frozen source and readiness/activation metadata are retained in
`/tmp/lunden-sonos839/{corrected-run-provenance,actual-evidence}.json`. The final
`sonos-full.png` was inspected: it shows the native fullscreen app UI and a
blank sky canvas after the authored animation stop/manual steps; it does not
prove rendered scene or audio playback visually. No fresh rendering or second
app run was added for the image. The initial failed attempt remains preserved;
no claim is made that rendering starvation caused it.

## Test-mode comparison: terrace decoration (#795)

The unchanged original `terracedecortest` executable fixture (`9645849^`)
was compared on clean `3909abb`: 400×300,
`?time=12&month=6&shot&freeze`, with every native merged-geometry, item/deck/door
bound, TerraceGate camera/layer, dusk/day/power color assertion and final
`renderer.render` call retained. `/tmp/runtests-353413/terracedecortest{,.test}.log`
contains **62 PASS / 0 FAIL per mode**, with identical complete ordered raw
rows. Both report 3 merged meshes, **31204** triangles, 8 distinct styles and
all original item counts/door bounds. The six native visibility cases match;
power-cut bulbs use the actual day color, with night **ffcf8a** and day
**d9d5ca**. These are native state/color-field checks, not sampled pixels or
rendered lighting equivalence.

The actual full frame was **400×300**, no test parameter, controller false;
the test frame was **480×300**, test parameter, controller true. Both modes
verified; public runner exit 0 and no runtime/crash errors. Reported times
**105441 ms → 77743 ms** include a failed 10-second full-mode screenshot
attempt after all assertions/metadata. Capture overhead differs, so this pair
is excluded from speedup aggregation. The read-only final-close capture hook
changed no fixture/app state. The available test image
`/tmp/lunden-terracedecor795/terrace-test.png` was inspected and shows cropped
result text; it establishes no terrace visual/pixel claim. Full capture timeout
is retained in `screenshots.txt`; no extra app run was made solely for images.

The final migration changes only iframe width 400→480 and appends `&test`, plus
a disposition comment. All other executable bytes, assertions and raw values
remain unchanged. Source hashes stayed frozen between modes
(`/tmp/lunden-terracedecor795/run-provenance.json`). This closes only #795;
#750, #741 and #736 remain open for their independent fixture work.

## Test-mode comparison: complete terrain scan (#794)

`terraintest` was compared on clean `fb4c8a9`, retaining the original
`9645849^` executable fixture: 400×300, `?time=12&month=6`, the complete 5 cm
OUTDOOR grid, every existing house/stair exclusion and native collision-segment
guard. `/tmp/runtests-342584/terraintest{,.test}.log` contains **25 PASS / 0 FAIL
in each mode**, with byte-identical complete ordered result rows. The actual
continuity scan checked **4973872** neighboring pairs and found **0** unguarded
steps; **274** trees had no asphalt/paving placement. All ramp/stair/garage,
box-edge, per-building plinth and ground values were preserved, including each
printed discrepancy, count and coordinate. No scan reduction, seed, output
normalization or baseline masking was used.

Summary metadata verifies full mode at actual **400×300**, no test parameter,
controller false; test at actual **480×300**, test parameter, controller true.
The public runner exited 0. Its reported times were **106765 ms → 78224 ms**;
the full time includes a failed 10-second final screenshot attempt, so this
pair does not establish a performance improvement. A read-only external close
hook attempted screenshots only after assertions and mode metadata; it did not
change fixture/app state. The successful test screenshot
`/tmp/lunden-terrain794/terrain-test.png` was inspected: it captures cropped
result text, not a terrain visual validation. The full capture timeout is
recorded in `screenshots.txt`; no second app run was made solely for an image.

The final migration changes only the iframe width to 480 and adds `&test`,
with a disposition comment. All executable statements/assertions beyond that
width/query edit remain byte-identical. Source hashes were frozen across the
pair (`/tmp/lunden-terrain794/run-provenance.json`). This closes only #794;
#750, #741 and #736 retain their other independent fixture work.

## Physical ray/detail-layer regression (#805)

Actual pass-through diagnostics on `967e58e` retained the #804 Nerf fix and
all original break assertions. `/tmp/runtests-319008/` records full quality 3,
scale 1, glass cutoff 11.069 m and layer mask 1 versus test quality 0, scale 0.6,
cutoff 6.642 m and glass mask 128 (DetailCuller's hidden layer 7). The physical
ray mask was 1 in both modes. Eye `[7.5, 1.62, -5.328203230275509]`, aim quaternion,
actual shot endpoints, cooldown 0, ammo 29 and accepted shot increment were
identical. Full mode broke the glass; test mode skipped it and hit a downstream
object. The glass body's ancestors were visible. Native physical ray layer
filtering, rather than shot acceptance or eye/aim drift, caused the missing hit.
Full had 21 PASS; test retained the far-shot/points failures and a Nerf failure.
No diagnostic updated transforms/caches, cast extra rays or replaced native hits.
Temporary observation code was removed after the run.

`DETAIL_HIDDEN_LAYER` exports the existing render-only layer 7. Only Marks'
physical raycaster includes it. Renderer and ordinary focus masks, ancestor
visibility and held/protected breakability policies retain their existing
behaviour; the native path now agrees with the existing large-static TriGrid
path. This also affects ordinary games using low detail, not just test mode.

`tools/marksphysicstest.html` is a standalone native module/DOM/2D-canvas
regression with no apartment or WebGL renderer. Actual Chrome serving the exact
old Marks source (`967e58e`) gives 8 PASS / 1 FAIL for a culled dynamic Glass;
fixed source gives **9 PASS / 0 FAIL**. It uses real Glass/Breaker/Marks hits,
quality culling, unchanged renderer/focus exclusion, large-static TriGrid parity,
F-style hidden ancestors, hidden targets and held-glass protection. Raw native
evidence: `/tmp/lunden-rifle805/native-regression-probe.{cjs,json,txt}`; actual
phase observations: `/tmp/lunden-rifle805/actual-phase-comparison.json`.
Actual **uninstrumented** `--compare breaktest.html --jobs 1 --port 8737`
acceptance on `7904a47` plus the physical-ray patch retained the exact #804
fixture blob `5d5e8c6750b430e22b73dfcabac2d78ebaab30d6`, original 900×600
iframe/no-test query and every assertion. `/tmp/runtests-330917/` records
**21 PASS / 0 FAIL in each mode**, including the far rifle hit, +11 range points
and actual Nerf hit. Full took 103251 ms with actual native-fullscreen 1280×800,
no test parameter and controller false; test took 86457 ms with actual 480×300,
test parameter and controller true. Both modes were verified, with no page,
runner or crash errors. The complete ordered logs differ only at row 7:
random shards on the table **7 of 14 → 8 of 14**. CLI exit 1 correctly preserves
that mismatch; this is functional acceptance, not a fixture migration or
raw-row equivalence claim. No seed, normalization, forced hit, retry or diagnostic
instrumentation was used in this acceptance pair. Source/fixture hashes stayed
frozen between modes (`/tmp/lunden-rifle805/fixed-provenance.json`). No new visual
screenshot claim is made for this physical-ray change.

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
| Placement and stored photos (#808 accepted) | bestaplacementtest, artleveltest, boardtest; actual evidence below, default optional art cloud coverage remains unexecuted |
| Care and persistence | bedcaretest, clothtest, colddrawertest |
| Interaction | cheattest, booktest, crouchtest |
| Cooking and cloud state (#811 complete) | cooktest/cuptest retain original full mode after actual raw differences; cloudtest migrated with exact native evidence below |

#812 `bestatest` is accepted after a complete original 900×600/`?time=12&freeze` comparison at frozen `7325270`:
whole raw logs are byte-identical, all 11 ordered PASS rows and ALL PASS, independently monitored actual exit 0.
All six doors retain their original action-label, open, reacquire-the-open-leaf and shut predicates and raw
height/z diagnostics. Spots retain automatic/off-at-noon, emissive 0.9, visible glow opacity 0.35 and off-again
0.04/glow-false checks. App-ready and final native phases prove ONE actual document per mode, full
900×600/null controller versus 480×300/real controller API, both without fullscreen and with distinct child identities.
The approved pre-pair testMode-only fullscreen guard precedes the original touch start; the full branch is inert.
Final source retains the existing test query and 480×300 dimensions; the only net fixture change adds that guard.
No current assertion, matrix/aim sequence, lamp control, seed, quality or result value was changed. Lighting properties are
logical state checks here; quality's shadow/resolution differences do not imply pixel equivalence.
Full 154.887s → test 84.142s, including successful end captures: both PNGs were inspected (all result rows and
cabinet in its closed final state), not door-motion or intermediate glow/shadow pixel equivalence. This is one
shared-machine sample, not a controlled benchmark. All 247 frozen runtime hashes and fixture/helper hashes match.
Raw logs/summary: `/tmp/runtests-442389/`; source/provenance, app-ready/final native phases, independent PID/SID/exit
and both PNGs: `/tmp/lunden-lighting812/besta-*` and `bestatest-*`. The later blind comparison below completes
the bounded #812 scope; broader #738/#736 remain open.

#812 `blindtest` is accepted after a complete original 900×600/noon/month 6/day 21/frozen clear-weather pair at
frozen `88d22bb`: whole 1404-byte raw logs match, all 31 ordered PASS rows and ALL PASS, actual independent exit 0.
All current coverage, shadow-property, slim-pack, real action/panel, held-control/timing, no-walking, score, sash,
close/reopen, dimming, emissive and persistence checks remain unchanged. Exact diagnostics include dark dim 0.85 /
hemi 0.35, light dim 0.30, white glow 0.23 / black 0.00, 41% after 2s, rail/head 5.496/5.500 and every saved blind value.
Each mode really loaded TWO main documents in the same iframe, proved by four unique child URL/timeOrigin
identities at app-ready, first-document beforeunload/pagehide and final records. Full first loaded at 900×600,
then native touch-start fullscreen reached 1280×800 before its reload; the second full document and final phase
returned to 900×600, controller null/no fullscreen. Both test documents and phases were 480×300 with real controller
API/no fullscreen. The approved pre-pair testMode-only fullscreen guard precedes the first original touch start;
full mode stays inert, the second original reload/start behavior remains unchanged. Final source keeps its existing
test query and dimensions; the only net fixture change adds that guard. No assertion, wait, aim/matrix, quality,
seed, lighting value, baseline or result normalization was changed.
Full 179.647s → test 136.102s include successful end captures. Both PNGs were inspected: all raw result rows and
the generic outdoor scene after reload, not blind-motion, room-shadow or glow pixel equivalence. This is one
shared-machine sample, not a controlled benchmark. All 247 frozen source paths and frozen fixture/helpers match.
Raw logs/summary: `/tmp/runtests-457979/`; native per-document/final phases, source/provenance, independent PID/SID/exit
and both PNGs: `/tmp/lunden-lighting812/blind-*` and `blindtest-*`. BESTÅ and blind acceptance completes #812;
this does not close #738/#736 or establish equivalence for other lighting fixtures.

#810 `booktest` retains its original full-mode 900×600/noquery fixture, byte-identical to current HEAD after
removing the approved compare-only testMode fullscreen guard. One complete original full/test pair at frozen
`570f8b8` is DIFFERENT: full 12 PASS / ALL PASS versus test 10 PASS + `FAIL taken again ("(hidden)")` and
`FAIL back on the side table` / SOME FAILED. All 12 checks executed; the first ten raw rows match, including
placement y0.485. The full helper offered “Ta boken” at re-take, while the test action was hidden. Separate open
bug #846 preserves this observation; cause is unknown because test flag and 480×300 changed together.
The original aim's `scene.updateMatrixWorld(true)` and `book.where()` world-position read remain unchanged;
source inspection does not establish a missing-matrix cause. No query/dimension migration, override, normalization,
assertion weakening, baseline masking or retry was made. This is a functional comparison blocker, not an invented
rendering exclusion or a successful speedup sample. Full 130.742s, test 81.510s, actual independent monitor exit 1.
Both app-ready and final native phases proved actual full 900×600/null controller/no fullscreen and test
480×300/real controller API/no fullscreen, with their own genuine child URL/timeOrigin. Both fullPage PNGs were
inspected: raw outcomes/living room capture, not a read-spread or pixel-equivalence claim; times include captures.
All 247 runtime hashes and the exact guarded fixture matched the frozen pair. Raw logs/summary:
`/tmp/runtests-422743/`; source/provenance, native load/final data, PID/SID/exit, helpers and images:
`/tmp/lunden-codes810/book-*` and `booktest-*`; #846 remains open.

#810 `cheattest` is accepted after comparing the original 844×600 queries against test mode at 480×300:
whole raw logs are byte-identical, all 50 ordered PASS rows and ALL PASS preserved, including repeated rejection
cases, private-code/public-list exclusion, native font readiness, console actions, clock/lamp controller state,
world-note ray/read interaction, life cleanup/idempotence and the real normal-home persisted reload.
Frozen source `5bd6bb8`: 220.509s full → 152.906s test, independently monitored actual exit 0. Each mode performed
TWO actual main document loads in the same iframe; four unique child URL/timeOrigin identities at app-ready,
first-document beforeunload/pagehide and second-document final records prove both full loads 844×600/null controller
and both test loads 480×300/real controller API, all without fullscreen. The public runner applied the prescribed
query/dimension comparison; no added data/clock/seed override, route-injected fixture instrumentation,
normalization or assertion change was used. The original unconditional
fullscreen suppression is preserved. Final committed change only reduces the existing test-flagged iframe to
480×300; both existing test queries and all private/near-secret predicates remain unchanged.
Both end PNGs were inspected: all result rows plus the generic night courtyard, not graffiti/font-pixel or action-scene
equivalence. Times include successful captures. Raw logs/summary: `/tmp/runtests-429394/`; runtime/fixture/helper
hashes, phase records, genuine independent PID/SID/exit, source proof and images: `/tmp/lunden-codes810/cheat-*`
and `cheattest-*`. All 247 frozen runtime hashes match; no page or observer errors occurred.


#810 `crouchtest` is accepted: the complete original 900×600/`?shot` full/test comparison at frozen `c91b38b`
has byte-identical raw logs, all 13 ordered PASS rows and ALL PASS, independently monitored actual exit 0.
App-ready and final native records prove ONE actual main document per mode, full 900×600/null controller versus
480×300/real controller API, both without fullscreen. The authored pointer-lock getter, synthetic keyboard and
beforeunload events, and `autoReload.go` stub remain unchanged. Observed beforeunload `eventTrusted:false`
is a synthetic event, not actual navigation; the version-reload assertion tests the original stub, not a second
app load. This is no proof of an OS Ctrl+W/F5 action or a native pointer-lock grant. Final migration changes only
iframe dimensions and adds the test query; all assertions and authored simulations are preserved.
Full 121.986s and test 87.425s include capture attempts: the full screenshot FAILED after 60,000ms and its error
is retained; only the successful test PNG was inspected (all 13 result rows and plain dark canvas).
There is no full-image review, posture/avatar visual claim or pixel-equivalence claim. The asymmetrical capture
cost excludes this pair from aggregate speedup calculations; no extra app load was run to replace the image.
All 247 runtime hashes and exact frozen fixture/helper hashes match. Raw logs/summary: `/tmp/runtests-435043/`;
source/provenance, independent PID/SID/exit, actual phases with child identity, test PNG and full capture error:
`/tmp/lunden-codes810/crouch-*` and `crouchtest-*`.
The bounded #810 comparison scope is complete: cheat 50 PASS and crouch 13 PASS are accepted; book retains
its original full fixture after 12 PASS versus 10 PASS + two FAIL, with #846 still open and cause unknown.
This is not an all-green batch or closure of the broader #738/#736 migration work.


#807 beer-object comparison: `beercantest` retains its original full-mode loader and dedicated `?shots` path.
The first guarded full/test pair at frozen runtime `e8e3fc2` has byte-identical raw logs: 18 PASS plus one TypeError
FAIL (19 ordered rows), SOME FAILED in both modes, actual runner exit 1. The exception occurs at the post-reload
`o2.placed` access because `B.beerCans[idx]` is undefined; the two persistence assertions do not complete.
This is tracked separately in #841; partial red equality does not establish complete migration acceptance, and
no beer-can query/dimension migration or baseline masking was made. The pre-pair guard was removed again to leave
that original fixture unchanged. Full 243.892s: first native load 900×600/controller false, second native-fullscreen
1280×800/controller false. Test 143.573s: both native loads 480×300/controller true. Prepared data/query strings and
all existing assertions were retained. Native observations cover removed and retained frames; both saved final
images were inspected, without a can-visual-equivalence claim. Complete raw logs/summary: `/tmp/runtests-377641/`;
fixture/runtime hashes, passive capture, exit record, native metadata, images and acceptance: `/tmp/lunden-beer807/`.
All 247 frozen runtime hashes matched after this pair.

#807 `beershelfmodeltest` is migrated after a complete accepted original full/test pair at frozen `081078d`:
all 15 ordered PASS rows and ALL PASS are byte-identical, including prepared identities, native 512×256 label
canvas dimensions, four nonoverlapping packages, door state and alternate 330/500 ml bottle geometry. Actual
137.345s at 900×600/controller false → 80.238s at 480×300/real controller API, both without fullscreen;
independently monitored runner exit 0; wall times include the successful final captures. Compared original
`life&shot&cloud=` against the existing test flag; the final committed change only sets 480×300. The original
unconditional fullscreen suppression and all assertions remain. Both saved fullPage PNGs were inspected: result text and kitchen
view support capture/log evidence, not beer-label pixel equivalence. Raw logs/summary: `/tmp/runtests-390315/`;
source/runtime/capture hashes, final native metadata, actual-exit and images: `/tmp/lunden-beer807/shelf-*` and
`beershelfmodeltest-{full,test}.*`.

#807 `beertest` retains byte-identical whole raw logs: 24 ordered PASS rows and ALL PASS, including five gulps,
coffee fill 0.80, lounge position 4.44/0.40/14.09, exact 0.400 table surfaces and both persisted-layout/re-serve
assertions. Original reconstructed full and test pair at frozen `8116db8`: 192.099s → 145.222s, independently
monitored runner exit 0. Both actual full main loads were 900×600/controller false; both actual test main loads
480×300/real controller API, all without fullscreen. Second-load evidence was captured passively before its original
removal, first-load evidence at final retention; fixture and child time origins are labelled separately.
The approved testMode-only first-start fullscreen guard was frozen before the pair; original assertions, coordinates,
saving, reload and second-start behavior are unchanged. Final source retains the existing test URLs and makes the
second iframe 480×300 too, plus that narrow guard. Both final PNGs were inspected: generic patio/result layout,
not beer-pixel equivalence; wall times include those successful captures. Raw logs/summary: `/tmp/runtests-405778/`;
source/runtime/capture hashes, native phase records, monitor PID/SID/exit and images: `/tmp/lunden-beer807/beer-*`
and `beertest-*`. No errors were observed in capture or page execution; #841's separate incomplete beer-can result is unchanged.

#807 `bottletest` has byte-identical whole raw logs: 22 ordered PASS rows and ALL PASS, including all named
bottles/counts, take/place/return interactions, whisky fill 0.20 and reset. Original reconstructed full/test pair
at frozen `f0c07cc`: 104.895s → 77.917s, independently monitored actual exit 0. Authored original 900×600/noquery
became actual native-fullscreen 1280×800/controller false; test stayed 480×300/real controller API/no fullscreen.
The approved testMode-only first-start guard was frozen before the pair. Existing test URL/dimensions are retained
in the final source, with only that guard added; all assertions and actions remain unchanged. Both final images
were inspected: full capture shows a sky-only game surface and HUD, while test shows result text and the generic
outdoor scene. They do not establish bottle-pixel or scene-image equivalence; no extra app run was made for images.
Times include successful end captures. Complete raw logs/summary: `/tmp/runtests-413426/`; original/final hashes,
capture source, actual PID/SID/exit, native child/fixture phase metadata and images: `/tmp/lunden-beer807/bottle-*`
and `bottletest-*`. All 247 frozen runtime hashes match after the pair; no page or observer errors occurred.

All four #807 dispositions are now recorded: shelf/beer/bottle accepted logical migrations, beer-can original
full-mode fixture retained with interrupted persistence checks and separate open bug #841. The red beer-can pair
is descriptive evidence only and excluded from successful speedup aggregation; no all-green batch claim is made.
The comparison/disposition batch #807 is complete; #841 and broader #738/#736 remain open for their own work.


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

HISTORICAL #786 source-only audit: the initial inspection covered eight remaining
#748 fixtures, changed comments only, and found no complete preserved full/test
records at that stage. It did not establish runtime parity. The final dispositions
below now include the later actual #789/#790/#791/#836 comparisons and explicit
source-only viewport/standalone exceptions. All eight #748 dispositions are
complete; broader #741/#736 remain open. Complete ordered raw values, duplicates
and diagnostic rows were retained in each actual comparison.

| Fixture | Final disposition | Evidence / scope |
| --- | --- | --- |
| sabertest | Unmigrated (#836): actual pair differs only in the preserved raw elapsed-ms burn row (566 → 302 ms / 40 steps), not a performance-threshold or rendering exemption. Original 900×600/query/native-start setup retained byte-for-byte. | Both 10 PASS / ALL PASS, other 9 ordered rows identical, no pageerrors; `/tmp/runtests-355460/`, frozen source `3909abb`: runner wall 171.018s at actual native-fullscreen 1280×800/controller false → 86.852s at 480×300/controller true. Both images included; no normalization, migration or speedup aggregation claim. |
| scoretest | Unmigrated (#789): actual full/test comparison differs in real HUD clock text on the first two PASS rows (17:25 → 17:27); preserve original full fixture and every assertion. Functional score/cat/penalty/reset checks are not a rendering exemption. | Both 33 PASS / ALL PASS, 31 remaining ordered rows byte-identical, no pageerrors; `/tmp/runtests-323761/`: runner wall time 164.251s at actual 1280×800 native fullscreen/controller false → 106.220s at 480×300/controller true. Temporary test-mode fullscreen guard removed; original 900×600 attributes/native path unchanged. Both fullPage screenshots included. No output normalization or new migration. |
| secretarytest | Migrated (#836) after the first actual pair: all original unseeded opens, retained current item and later authored LCG seed=7 remain unchanged. This is measured parity, not a new determinism guarantee. | Entire raw logs byte-identical: all 32 ordered PASS rows, repeated drawer rows, exact ten-name sequence and ALL PASS; no pageerrors. `/tmp/runtests-358392/`, frozen source `3909abb`: runner wall 131.607s at actual 900×600/controller false/no fullscreen → 84.677s at 480×300/controller true/fullscreen. Both saved images inspected; test fullscreen overlays some parent text, complete raw rows retained. Only query/size changed. |
| sonostest | Unmigrated (#836): first actual trusted-start full/test pair differs in five preserved real media-currentTime rows; other 32 ordered rows identical. Retain #839 full fixture byte-for-byte (authored 900×600). Not a rendering exemption. | Both 37 PASS / ALL PASS and no pageerrors, context running, all six real recording clocks advance; `/tmp/runtests-371691/`, frozen `fa51ae9`. Landed `sonosstart.cjs --compare sonostest.html --jobs 1 --port 8747` verifies two trusted native clicks after cover release and before first media play; both ready snapshots have phone=false and visible start-touch. Final actual native full 1280×800/controller false → test 480×300/controller true; runner wall 65.244s → 76.169s including both saved/inspected images. Wrapper/runner exit 1 comes from raw DIFFERENT, not activation failure. No guards, seed, normalization, retry, migration or speedup-aggregation claim. |
| southbackdroptest | Migrated (#791): original mapped geometry/raycast/budget/camera/fog/weather/season/material-state assertions preserved. | Entire raw logs byte-identical: all 67 ordered PASS rows and ALL PASS, including 54 footprint rows and exact 10623 triangles; no pageerrors. `/tmp/runtests-338704/`, frozen source `ed7ff32`: runner wall 122.847s at actual 720×480/controller false → 72.916s at 480×300/controller true, including both saved fullPage fixture images. Only query/size changed; no rendering-quality exemption or output normalization. |
| spidersuittest | Final viewport exception: retain original 900×600 and frozen June noon. Existing actual touch jump/crouch/web rectangles, alignment and gaps (web directly above jump, <20 px) require the original view alongside suit/physics flows. | Source inspection only; no new runtime, timing or full/test parity claim. Every original assertion/setup retained; no blanket physics migration. |
| stairtest | Migrated (#790): native stair/ground/collision/soffit/handrail geometry and distance assertions unchanged; switch references remain positions. | Entire raw logs byte-identical: all 37 ordered PASS rows, ALL PASS and both diagnostic lines; no pageerrors. `/tmp/runtests-333169/`, frozen source `7904a47`: runner wall 101.033s at actual 640×400/controller false → 84.379s at 480×300/controller true, including both saved fullPage screenshots. Only fixture query/size changed. Final rebase keeps relevant stairs/player/cleaning/config/world/main blobs; later #805 exports unchanged detail layer 7 and enables it for Marks physical rays, unused here (no whole-src identity claim). |
| startuptest | Standalone `prepareStartup` module with injected fetch/navigation/storage/service-worker cases and real bounded timeout checks. No actual apartment bootstrap or renderer. | Final standalone source disposition; no apartment URL test flag needed. Source inspection only, no new runtime or parity claim. |

HISTORICAL #786 proposals were three comparison children (score/stair/south),
three blocker reviews (saber/secretary/Sonos), a viewport disposition for spider,
and standalone startup. Six audit comments and the source/search snapshots at
`/tmp/lunden-audit786/` document that initial source scope only, not runtime parity.
The final table records actual evidence from closed #789/#790/#791 and #836,
plus the retained original spider viewport and standalone startup. No further
#748 disposition issue remains; #741/#736 continue with their other groups.

## Test-mode source inventory: #750 batch (#787)

At the historical #787 source audit, all eight #750 fixtures bootstrapped the actual apartment and had no
test-mode flag. That audit added six script comments only. No exact-name
matching retained `/tmp/runtests-*/summary.json` evidence was found for these
fixtures at that stage; that audit claimed no new run, timing or equivalence. The preserved green
`tostarttest` pair from #776 is a different fixture from `toasttest` and
`toastertest`, so it cannot supply their acceptance evidence.

Toaster #796 final written acceptance: after the original frozen pair, the shared loader was changed to `?test` and
480×300, with a testMode-only fullscreen suppression immediately before the original first start-touch action.
The second persisted reload/start behavior and all assertions remain unchanged. One written run in the normal
1280×800 runner parent context (`/tmp/runtests-362615/`) passed all 32 rows in 129.275s, exit 0, exactly matching
both retained original-pair outputs. Passive external pre-remove capture proved actual 480×300 and the real
controller API on both written loads, with fullscreen false. The original pair's first test load had native fullscreen
true inside its 480×300 parent; its second test load and both full loads did not. The guard was added after that pair,
not claimed as part of its source. Reversing the minimal loader/guard changes restores the original fixture byte for byte.
The pair completed both ALL PASS verdicts and its exact-row comparison/summary, but the outer tool session reported
exit 143; origin of that termination is unknown (its roughly 300s duration suggests an external deadline, unproven).
No original-pair exit 0 is claimed. Pair timings are descriptive only; #796 is excluded from global speedup aggregation
because its outer termination remains unexplained. All 247 frozen runtime hashes remained unchanged for the written run. Complete
raw logs, original/written fixture hashes, native metadata, passive capture source and acceptance: `/tmp/lunden-toaster796/`.
No production, runner, baseline, assertion or changelog changed; no extra browser load was used for screenshots.


| Fixture | Source disposition | Original iframe / evidence required |
| --- | --- | --- |
| terracedecortest | Migrated #795: native finite merged geometry/triangle budget, terrace bounds, explicit camera/gate layers and assigned dusk/day/power-cut bulb colors. All 62 ordered raw rows match; final render is retained without pixel claims. | Original frozen June noon/shot 400×300 → verified test 480×300; see [terrace decoration evidence](#test-mode-comparison-terrace-decoration-795), including capture overhead. |
| terracetest | Migrated (#793): original terrace polygons/areas/joins and built railing-height assertions retained. | Entire raw logs byte-identical: 33 ordered PASS rows and ALL PASS; no pageerrors. `/tmp/runtests-343861/`, frozen source `fb4c8a9`: runner wall 103.498s at actual 400×300/controller false → 78.528s at 480×300/controller true, including both saved fullPage fixture images. Only query/size changed. |
| terraintest | Migrated #794: ground/road/ramp/stair/plinth values, complete dense 5 cm OUTDOOR continuity pairs, native collision guards and tree-foot placement. All 25 ordered raw rows are identical. | Original 400×300 June noon → verified test 480×300; see [complete terrain scan evidence](#test-mode-comparison-complete-terrain-scan-794), including actual counts and screenshot overhead. |
| thingtest | Migrated (#793): original bottle/glass transforms, hold/place/home, pouring/drinking, fill/color and reset assertions preserved. | Entire raw logs byte-identical: all 23 ordered PASS rows and ALL PASS, including measured heights/fill/tilt/material colors; no pageerrors. `/tmp/runtests-345423/`, frozen runtime `fb4c8a9` plus testMode-only fullscreen guard: runner wall 142.020s at actual native-fullscreen 1280×800/controller false → 80.808s at 480×300/controller true, including both saved fullPage fixture images. Original full path retained; only test mode suppresses fullscreen. |
| toastertest | Migrated (#796): native slot glow/lever, drawer/cord/socket actions and persisted placement/plug state retained. | 32 exact ordered PASS rows and ALL PASS identical, including glow 0.51, popped lever 0.145 and real persisted reload. Original full: both actual 900×600/controller false; compare test: both 480×300/controller API true. `/tmp/runtests-360266/`: 167.595s → 131.353s. |
| toasttest | Migrated (#797): all native bread-slot/carriage/cooking/crumb/topping/eat assertions preserved, including four duplicate eat rows. | 27 exact ordered PASS rows and ALL PASS identical; carriage −0.087, one crumb event and toasted names unchanged. `/tmp/runtests-365716/`: 139.734s at actual 900×600/controller false → 81.505s at 480×300/controller true, exit 0. Both fullPage images saved/reviewed. |
| todotest | Migrated (#793): original committed sample order/title-cleaning, DOM visibility, focus/poster/fridge-door and F-state assertions retained. | Entire raw logs byte-identical: all 16 ordered PASS rows and ALL PASS, including 7 notes, exact priority order and 0.38 m door movement; no pageerrors. `/tmp/runtests-347634/`, frozen runtime `fb4c8a9` plus testMode-only fullscreen guard: runner wall 180.368s at actual native-fullscreen 1280×800/controller false → 93.405s at 480×300/controller true. Includes image attempts: full capture timed out after 60s, test image saved/inspected; no extra app run. This pair is excluded from speedup aggregation because only full wall time includes the unmatched 60s capture timeout. TODO sample unchanged, generated data absent. |
| toilettest | Migrated (#797): all native Flush pool-drop/sheet-opacity/emissive/count/refill and lid-action assertions retained. | 17 exact ordered PASS rows and ALL PASS identical, including 4.4 cm water drop on both floors. `/tmp/runtests-367030/`: 184.390s at actual native-fullscreen 1280×800/controller false → 86.372s at 480×300/controller true, exit 0; authored original 900×600, noon/freeze retained. Both fullPage images saved/reviewed. |

#797 froze the approved testMode-only fullscreen guards before both original full/test comparisons; they affect
only test mode and leave each native full start path intact. After acceptance, only iframe dimensions/query flags
were migrated. Entire ordered outputs were compared without normalization; all 247 runtime hashes match the frozen
`d662121` source, and reversing loader/guard changes restores both original fixtures byte for byte. External final
capture metadata and four images: `/tmp/lunden-toast797/`. Toast images show result text and its generic courtyard
view, supporting captured layout/log evidence, not visual bread/toaster equivalence. Toilet images show the final
closed lid, not mid-flush pixel equivalence. No production, runner, baseline, assertions or changelog changed.

All eight #750 dispositions are now verified/migrated: terrace/thing/TODO (#793), terrain (#794), terrace decor (#795),
toaster (#796) and toast/toilet (#797). Fresh child-state audit found #793–#796 closed before the final #797 delivery.
The wider parents #741/#736 still have other groups to finish.


Quality knobs in `main.js` change resolution, shadows, mirrors, weather particles
and detail culling; they do not assign the above terrace bulb, toaster glow or
flush material fields. That source separation does not prove runtime equivalence
or override any genuine rendering/lighting exception: at the #787 audit these three fixtures remained
conditional until complete native-state results matched in actual full/test runs.
No generic DPR/render call is used to invent an exception, and no measured row
may be normalized or omitted to manufacture a match.

Historical #787 suggested independent children: `terracetest` + `thingtest` + `todotest` (three
ordinary fixtures), `terraintest` alone (large scan), `terracedecortest` alone
(conditional gate/bulb state), `toastertest` alone (two real loads), and `toasttest`
+ conditional `toilettest` (two fixtures). Each child must inspect complete
ordered, duplicate-sensitive rows with source/controller/actual-viewport
provenance before migration to 480×300. #750, #741 and #736 remained open at that audit stage. Source
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
| `reloadtest` | Retained full after actual #842 pair: all 16 loads per mode completed, 43 PASS / 1 FAIL each; four raw clock/record-size rows differ. Independent native budget bug #845 tracked, no normalization or migration. | [Actual reload disposition](#reload-actual-clockworld-disposition-842): 1246028 ms→1097220 ms including observation/capture overhead, no speedup claim. |
| `resettest` | Retained full after actual #840 pair: 31 PASS each, with only raw real-clock row 19 differing 20:15→20:21. All eight native load/controller/lifecycle identities and local Worker wipe-success records verified; no normalization or migration. | [Actual reset disposition](#reset-actual-clockworker-disposition-840): 475740 ms→296508 ms including observation/capture overhead; no speedup claim. |
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
| `trapphusbctest` | Migrated (#801), both actual B and C variants; original actions/assertions/fullscreen suppression preserved. | B: 48 exact ordered PASS, 164.969s → 101.323s (`/tmp/runtests-313324/`). C: 61 exact ordered PASS, 182.024s → 112.617s (`/tmp/runtests-316578/`); actual topfixture `?house=C` via external goto hook. ALL PASS/no pageerrors in all four runs, actual 800×500/controller null → 480×300/real controller per variant. Times include four saved fullPage images. |
| `trapphusrailtest` | Standalone; no game-mode migration applies. | Actual buildWorld/Core/Player modules and manual movement into the rail; no game iframe/bootstrap or WebGL renderer. Source inspection only, no runtime result claimed. |
| `turbotest` | Migrated (#799); original injected clock, coffee/speed/FOV/walk/wall/expiry assertions preserved. | All 10 ordered PASS rows and ALL PASS identical, including ×1.80, 78.0°, 2.38 m, wall x 0.71 and 115 → 150 s; no pageerrors. `/tmp/runtests-295099/`: 198.024s at actual full-screen 1280×800/controller null → 119.221s at 480×300/real controller. Both fullPage screenshots included; only test-mode controllers suppress native fullscreen. |
| `turntest` | Rendering/performance exemption. | Actual warm-up and rendered frames gate WebGL program/texture counts and record uploads, shadows, mirrors and phase times; optional readPixels synchronization. Test mode changes the measured rendering workload. |

Tostart provenance was checked against acceptance base `bcbf1ae`: the fixture and relevant
player/rest/jetpack/spidersuit/car/core/world blobs match exactly; the toStart handler is unchanged.
Later main/config differences are unrelated chat/compass UI changes; the whole source tree is not claimed
identical. The source and exact-row audit is retained at `/tmp/lunden-audit788/tostart-provenance.json`.

All eight dispositions in this audit are now handled: historical tostart acceptance, touch/turn exemptions,
standalone rail, and verified toys/turbo (#799), stairwell A (#800), stairwell B/C (#801) migrations.
B used frozen base `3af9f37`; C used `967e58e` after #743. Relevant fixture/main/core/corehouse/player/world
blobs match; config changed only the CHAT export. Chat/Ghosts mirror-typing code differs, so whole-src
identity is not claimed. This fixture never opens/writes chat, and actual C probes report open=false/typing=false;
the new predicate requires both. Separate source/URL/controller/image evidence: `/tmp/lunden-stair801/`.
Parent #751 is complete after #799/#800/#801: all eight fixture dispositions are recorded above.
The broader parents #741/#736 remain open for their other groups.


## Test-mode comparison: basement and scene state (#806)

Each pair restores only original query/dimensions from `9645849^` for the full baseline,
retaining every current action/assertion/reload/storage branch. The earlier after-only
flagging is not parity evidence. First pair frozen runtime `a709ebb`; source/setup snapshots:
`/tmp/lunden-basement806/`. Wall times include external final fixture screenshots.

| Fixture | Actual ordered result / disposition | Full → test evidence |
| --- | --- | --- |
| basementhudtest | Accepted existing test-mode fixture: complete logs byte-identical, all 8 ordered PASS rows and ALL PASS; no pageerrors. Every source byte restored to current committed fixture after the temporary baseline. | `/tmp/runtests-375801/`: runner wall 59.028s at actual 720×480/controller false → 71.476s at 480×300/controller true, both fullPage images saved/inspected. Original fullscreen suppression retained; no speedup inferred. This proves native logical HUD/room state, not rendered-scene equivalence (full sky canvas after authored animation stop, test courtyard image). |
| basementvisittest | Accepted existing test-mode fixture: entire raw logs byte-identical, all 14 ordered PASS rows and ALL PASS; no pageerrors. All current actions, resume records, two reloads and full reset preserved; temporary original-query/dimension baseline removed, final fixture bytes equal the current source. | `/tmp/runtests-385630/`, frozen `6c1a1ee`: genuine monitor exit 0, runner wall 319.861s at actual 720×480/controller false → 274.945s at 480×300/controller true, including both saved/inspected images. Passive read-only evidence verifies 8 distinct document timeOrigins, 8 app-ready + 6 beforeunload + 6 pagehide + 2 final snapshots, no failed/null app records or fullscreen; actual test APIs verified for every reload/reset. Earlier runner controller=null records remain explicit, completed by `/tmp/lunden-basement806/visit-loads.jsonl` and `visit-evidence.json`. Native tested-state parity; no rendered-scene equivalence claim. |
| boxwoodtest | Existing `?test` accepted after original 480×300 `?shot&cloud=` baseline on frozen `170da56`; current fixture restored byte-for-byte. | `/tmp/runtests-403966`: 13 ordered PASS, 0 FAIL in each mode; complete logs byte-identical. Actual app-ready and final snapshots show 480×300/no fullscreen throughout, full null/false controller versus real test controller API. Native hedge bounds/gaps/rays/collision, shared mesh/material fields, parking seasonal colors and snow/evergreen states pass unchanged; no rendered-scene equivalence claim. Wall times 86.615s → 78.607s include both reviewed captures; independent monitor exit 0. |
| bridgetest | Existing `?test` accepted after original 720×480 `?shot&cloud=` baseline on frozen `ea86a20`; current fixture restored byte-for-byte. | `/tmp/runtests-408367`: 17 ordered PASS, 0 FAIL in each mode; complete logs byte-identical, including all joins, unchanged camera-layer water ray and exact 2770-triangle budget. Actual app-ready and final snapshots show full 720×480/null controller versus test 480×300/real controller API, neither fullscreen. Wall times 103.042s → 78.214s include both reviewed captures; independent monitor exit 0. Final images show native courtyard views, not a bridge visual inspection or rendered-scene equivalence claim. |

All four #806 fixtures now have current-assertion full/test evidence; their previously committed test-mode setup is retained without source edits, new seeds, normalization or baseline changes. HUD proves native logical state, and the other pairs preserve complete ordered native results; captures do not establish rendered-scene equivalence.

## Placement and stored photos: BESTÅ acceptance (#808, partial)

`bestaplacementtest` now has actual original-full/test evidence supporting its
existing 480×300/test loader. At frozen runtime `f766604`, the baseline restored
only the original `?life&shot&r=` query from `9645849^`; both authored main loads,
current assertions, random cache-busting values, and the original unconditional
fullscreen suppression remained unchanged. The published runner used one job:
`--compare bestaplacementtest.html --port 8737 --timeout 20 --verbose`.

Both complete raw logs are byte-identical (11 PASS, 0 FAIL, ALL PASS), including
the real wall preview/rotation, old floor-placement save, all six doors, loose
contents, reload persistence, targeted restore and ceiling constraint. Both
unique app-ready documents per mode, the first document's beforeunload/pagehide
snapshots and the retained final document stayed 480×300 without fullscreen.
Full controllers were false; test controllers were true with native draw,
setFull and wantsFrame functions, lazy/full false. All URL/timeOrigin identities
matched, with no observer errors or transport warnings. Runner modes were
verified and the independently monitored process exited 0.

Elapsed full/test times were 157.834/146.059 seconds, including passive capture
overhead. Both final screenshots timed out after 10 seconds; no image or visual
equivalence is claimed, and this pair is excluded from speedup aggregation.
Complete logs/summary are in `/tmp/runtests-410251/`; frozen fixture/runtime
hashes, helper hashes, native snapshots, capture errors and actual process exit
are retained in `/tmp/lunden-placement808/besta/`. All frozen runtime blobs
matched after the pair. The written loader returns to its existing test query;
no executable assertion or placement behavior changed. Art-level and board
comparisons remain pending under #808; #738 and #736 remain open.

## Test-mode comparison: bed and cleaning care (#809)

Current assertions and authored actions are retained. Original setups already match
`9645849^`; none of these three fixtures had been test-flagged there. Each fixture
requires its own complete ordered native full/test pair; source counts are not
runtime acceptance. Evidence and passive observer/capture snapshots are retained
under `/tmp/lunden-care809/`; wall times include reviewed final captures.

| Fixture | Disposition | Actual evidence |
| --- | --- | --- |
| bedcaretest | Migrated by adding `test` to the shared load URL only; existing 480×300, unconditional fullscreen suppression, pixelRatio(.15), all 22 predicates and three real loads remain unchanged. | Frozen `f0c07cc`, `/tmp/runtests-414727`: 22 ordered PASS and ALL PASS in each mode, entire logs byte-identical, no pageerrors; actual monitor exit 0. Wall 248.734s → 207.695s. Passive native evidence: six documents, six app-ready + four beforeunload + four pagehide + two final records; all 480×300/no fullscreen, full controller false/null versus real test APIs for every load. Runner's four earlier controller=null records remain explicit, completed by `bedcare-loads.jsonl`/`bedcare-evidence.json`. Both captures show raw results and the final courtyard/HUD, not a bed visual inspection or rendered-scene equivalence. |
| clothtest | Migrated query/size to `?test&life&shot`/480×300 after guarded original 900×600 baseline; approved testMode-only fullscreen suppression precedes original start-touch, with full-false behavior unchanged. | Frozen `711cbd2` plus guard (`ea2dea6`, clean HEAD `d5c6b30`), `/tmp/runtests-424561`: all 14 ordered PASS/ALL PASS, entire logs byte-identical, no pageerrors, actual monitor exit 0; wall 104.558s → 71.880s including captures. Passive app-ready and native removal-pagehide verify full 900×600/null controller versus test 480×300/real controller APIs, same document URL/timeOrigin, neither fullscreen. The original fixture removes its iframe: final app metadata is absent, and the saved/inspected image contains all text results only. Both captures used the same unknown-mode filename, so the full capture was overwritten by test; no full-image review or rendered-scene equivalence claim, and no extra app run. This pair is excluded from speedup aggregation because the original full capture was overwritten. |
| colddrawertest | Migrated only initial query/size (900×600 → 480×300) and reload test-query; existing unconditional fullscreen suppression and every drawer/access/store/amount predicate remain unchanged. | Frozen `65bf575`, `/tmp/runtests-436650`: complete byte-identical logs, 77 ordered PASS/ALL PASS per mode, no pageerrors; independent setsid/Popen/wait monitor actual exit 0. Four native documents, four ready + two beforeunload + two pagehide + two final records verify full 900×600/null controller versus test 480×300/real APIs, no fullscreen. Runner initial controller=null records are preserved and completed by passive evidence. Wall 232.867s → 157.230s includes two separately saved/inspected images showing all results and final courtyard/HUD; no drawer visual or rendered-scene equivalence claim. First interrupted attempt (session 60501, tool exit 143, no child-exit artifact or complete pass, cause unknown) remains separately retained, not counted as a product verdict. |

All three #809 fixtures now have complete unchanged-predicate native full/test acceptance. The original cloth full capture was overwritten and that pair remains excluded from speedup aggregation; first interrupted cold-drawer evidence stays explicit. No production, seed, clock, baseline or runner change was needed.

## Placement and stored photos: art-level acceptance (#808, partial)

At frozen runtime `784e67b`, `artleveltest` restored only its original
480×300/full query from `9645849^` for a published jobs1 comparison. All three
authored main loads and both concurrently retained live clients were preserved,
as were the existing unconditional fullscreen suppression, random cache-busting
values, transforms, selection, cancellation, restoration and reload assertions.
The default empty cloud parameter leaves the optional cloud-sync assertion
unexecuted; source emits no SKIP row, and no optional-cloud coverage is claimed.

Both complete raw logs are byte-identical (961 bytes, 20 PASS, 0 FAIL, ALL PASS),
including repeated wall-preview/rotation rows. All six distinct app-ready
documents, four leave snapshots and four retained final snapshots stayed
480×300 without fullscreen. Full controllers were false; every test controller
had native draw/setFull/wantsFrame functions with lazy/full false. URL/timeOrigin
identities matched, with no observer errors or transport warnings. The public
runner verified both modes; the independent monitor exited 0.

Elapsed full/test times were 283.713/244.012 seconds including capture overhead.
The full screenshot timed out after 10 seconds; the saved test viewport image
contains cropped textual results, with the final sibling row and ALL PASS below
the image. It provides no artwork/scene equivalence evidence. This asymmetrically
captured pair is excluded from speedup aggregation. Complete raw logs/summary:
`/tmp/runtests-418929/`; frozen source/helper hashes, native snapshots, actual
exit, image and capture error: `/tmp/lunden-placement808/artlevel/`. All frozen
runtime blobs matched after the pair. The written fixture returns to its
existing test query without assertion changes. Board remains pending under
#808; #738 and #736 remain open.

## Placement and stored photos: board acceptance (#808)

`boardtest` was compared at frozen runtime `8262288` with original 900×600,
noon/freeze query and every current assertion unchanged. The only pre-pair
addition suppressed fullscreen immediately before the original touch solely
when the actual test controller exists; the original full branch stayed intact.
The fixture creates fixed 8×6 canvas JPEG inputs and exercises native CatBoard
photos, panel/key actions and IndexedDB. Its fresh Board constructor reload is
not a second apartment load, and it never calls the renderer snapshot helper.

Both complete raw logs are byte-identical (529 bytes, 13 PASS, 0 FAIL, ALL PASS),
including exact retained names `Katt0 Katt4 Katt5 Katt6 Katt7 Katt8 Katt9 Katt10
Katt11 Katt12` and eight kept of nine after reload. Each mode has one distinct
app-ready document and matching retained final snapshot: full 900×600/controller
false, test 480×300/controller true with native draw/setFull/wantsFrame functions,
lazy/full false. Neither phase was fullscreen. URL/timeOrigin identities match,
with no observer errors, transport warnings or raw pageerrors. Runner modes
were verified; the independently monitored process exited 0.

Full/test elapsed times were 265.790/112.978 seconds including capture overhead.
Full capture timed out after 10 seconds; the saved test viewport shows all result
rows vertically (long text clipped horizontally) and a partial courtyard/HUD,
not the photo-board artwork or rendered-scene equivalence. This asymmetric
capture excludes the pair from speedup aggregation. Complete logs/summary:
`/tmp/runtests-426465/`; frozen source/helper hashes, passive snapshots, actual
exit, image and capture error: `/tmp/lunden-placement808/board/`. All frozen
runtime blobs matched after the pair.

The written board now uses 480×300/test and retains the mode-only fullscreen
guard, which preserves its small iframe under a normal written-run context.
All executable assertions, native JPEG/IndexedDB actions and full-branch
behavior are unchanged. BESTÅ and art-level retain their previously written
480×300/test setup with actual acceptance documented above. All three #808
dispositions are complete; art-level's optional default-empty cloud branch
remains explicitly unexecuted. #738 and #736 stay open for their other batches.

## Cooking and cloud state: cook disposition (#811, partial)

`cooktest` retains its exact original full-mode executable and 900×600/no-query
setup. At frozen runtime `5bd6bb8`, one actual published jobs1 full/test pair
preserved all current #774 fixture bindings/catch, native actions and assertions.
Only a temporary actual-testMode fullscreen guard preceded the original touch;
it was removed after the non-identical comparison, leaving the full source
byte-for-byte unchanged. No retry, seed, normalization or baseline change was made.

Both modes completed all 82 ordered PASS rows, 0 FAIL, ALL PASS. The sole exact
raw difference was row 65: `PASS they lie in the basket (y 0.047 over its bottom)`
in full versus `PASS they lie in the basket (y 0.046 over its bottom)` in test.
The native predicate passes in both; equality is not established, and this pair
does not diagnose the difference's cause. Hob/pan/chicken/fish/airfryer/fries,
physical aiming, material colors, smoke/alarm and F-restoration coverage remained
complete, including repeated and dynamic rows. The independent monitor exited 1
for the comparison; both runner modes were verified, without raw pageerrors.

The full document was app-ready at authored 900×600/controller false, then its
retained final phase was actual native-fullscreen 1280×800. The test document
and retained final stayed 480×300/no fullscreen/controller true, with native
draw/setFull/wantsFrame functions, lazy/full false. Unique URL/timeOrigin
identities matched without observer errors or transport warnings.

Elapsed full/test times were 120.320/83.254 seconds including passive capture
overhead. Both final screenshots timed out after 10 seconds; no PNG or visual
equivalence is claimed. The non-identical pair is excluded from speedup
aggregation. Complete logs/summary: `/tmp/runtests-433051/`; frozen source/helper
hashes, native phases, capture errors and actual monitor exit:
`/tmp/lunden-cooking811/cooktest/`. All frozen runtime blobs matched after the
pair. Cup and cloud comparisons remain pending under #811; #738/#736 stay open.

## Cooking and cloud state: cup disposition (#811, partial)

`cuptest` retains its exact original full-mode source and 900×600/no-query setup.
One complete published jobs1 comparison at frozen runtime `80c9fa4` preserved
all native coffee/mocca/scoop/water/cup/whisky/steam/refill/F predicates and loops.
A temporary testMode-only fullscreen guard before the original touch was removed
after the non-identical comparison. No retry, seed, normalization, baseline or
assertion change was made.

Both modes completed 75 ordered PASS rows, 0 FAIL, ALL PASS; the earlier syntactic
67 check-call estimate is not a runtime count, because authored loops emit eight
additional rows. The complete raw differences are:

| Ordered result row | Full | Test |
| --- | --- | --- |
| 68 | `PASS three cups, three patterns (blue-white, olof, letter-K)` | `PASS three cups, three patterns (black-gold, hearts, lunden)` |
| 69 | `PASS opened again: a new cup on the empty spot (olof, letter-K, black-gold), 1 out` | `PASS opened again: a new cup on the empty spot (hearts, lunden, mustard-stripes), 1 out` |
| 72 | `PASS put back on the free spot, still "mustard-stripes"` | `PASS put back on the free spot, still "lunden"` |

All other ordered rows match, including native physical aiming, vertex bounds,
liquid/color/steam values, cabinet refills and held-state restoration. Both runner
modes were verified; the independent monitor exited 1 for exact comparison,
without raw pageerrors. This pair does not establish a cause for the differences.

The native full document was app-ready at authored 900×600/controller false,
then retained final 1280×800/fullscreen. Test app-ready/final stayed 480×300/no
fullscreen with genuine draw/setFull/wantsFrame APIs, lazy/full false. Unique
URL/timeOrigin identities matched without observer errors or transport warnings.
Elapsed full/test times were 138.937/105.543 seconds including capture overhead.
Full capture timed out after 10 seconds; the saved test viewport contains only
the cropped top textual results, with differing pattern rows below the image.
No cup artwork/rendered-scene equivalence is claimed. The non-identical pair is
excluded from speedup aggregation. Complete logs/summary: `/tmp/runtests-440136/`;
frozen hashes, native phases, actual exit and capture evidence:
`/tmp/lunden-cooking811/cuptest/`. All frozen runtime blobs matched after the pair;
removing only the temporary guard restores the exact original fixture. Cloud
remains pending under #811; #738/#736 stay open.

## Cooking and cloud state: cloud acceptance (#811)

At frozen runtime `08ec9ae`, one published jobs1 comparison preserved the original
900×600/cloud queries, every current assertion and all three native apartment
loads, including the about:blank/IndexedDB transition. Only the pre-pair actual
testMode fullscreen guard preceded the sole original touch; the full branch
remained intact. Fixed 420×297 own-canvas JPEG inputs, native drawings/desk/queue/
privacy/name/leaderboard paths, existing fetch logging and dead-localhost offline
behavior were unchanged. An old drawing comment did not establish a renderer
exception; the acceptance comes from actual native outcomes.

Both entire raw logs are byte-identical (1025 bytes, 24 PASS, 0 FAIL, ALL PASS),
including offline queue length 1, score 5, the cleaned/capped `Fuskimg src=x 3000`
row and the full native top-list string with Anonym 13. Real PUT/DELETE/image/
new-visitor/desk-sheet/personal-cat-photo/local-cloud-off checks all completed.
Runner modes were verified; the independent monitor exited 0, with no raw
pageerrors. The public runner reused one owned local Worker process across both
modes. Each mode's existing DELETE `http://localhost:8738/admin/all` returned
200 before application loading, freshly wiping local data; no fresh-process
claim or extra state bypass is made.

All six distinct app-ready documents have matched URLs/timeOrigins: full
900×600/controller false, test 480×300 with genuine draw/setFull/wantsFrame APIs
and lazy/full false. Eight native leave snapshots and two retained final
snapshots were also captured. Full's first document leaves at native fullscreen
1280×800; its second leaves and third remains final at 900×600/no fullscreen.
All test phases stay 480×300/no fullscreen. Initial runner null controller
records remain explicit, completed by passive native evidence. No observer
errors or transport warnings occurred; final local-mode cloud URL is empty.

Elapsed full/test times were 411.082/225.799 seconds including capture overhead.
Full capture timed out after 10 seconds; the saved test viewport contains only
cropped top text, with the leaderboard/final local-off rows below the image.
No drawing/photo artwork or rendered-scene equivalence is claimed. Asymmetric
capture excludes this pair from speedup aggregation. Complete logs/summary:
`/tmp/runtests-445110/`; frozen runtime/local-Worker/helper hashes, native phases,
wipes, actual exit, capture error and image: `/tmp/lunden-cooking811/cloudtest/`.
All frozen source blobs matched after the pair.

The written cloud fixture now uses 480×300/test and keeps the reviewed mode-only
fullscreen guard; reversing only dimensions/query/descriptive comment exactly
recreates the frozen guarded fixture. Assertions and all native paths remain
unchanged. All #811 dispositions are complete: cook's one raw basket-position
difference and cup's three raw pattern differences retain full originals; cloud
has exact current-assertion acceptance. #738 and #736 remain open.

## Christmas complete native state comparison (#813)

`christmastest` is accepted for logical test-mode migration: only `test` is added
to its shared load URL. Original 480×300, all ten authored real loads, date/freeze/
random-cache queries, unconditional fullscreen suppression, every season/move/
cancel/hidden-target/collision/legacy-id predicate, active-light scores/slots and
CPU-animated bulb colors remain unchanged. The fixed four-slot pool is not a
quality knob; this acceptance comes from actual complete native results, not a
material-name exemption or simplified subset.

At frozen runtime `53826f4`, `/tmp/runtests-448157/` contains byte-identical full
and test raw logs (2454 bytes each): 43 ordered PASS rows including the original
`PASS christmastest` summary, hence 42 actual checks, zero FAIL/pageerrors. All
20 actual game documents are verified by 20 app-ready + 18 trusted beforeunload
+ 18 trusted pagehide records, with unique URL/timeOrigin identities retaining
original random query values. Every document is 480×300 without fullscreen;
full controllers are null/false, every test controller exposes real draw/setFull/
wantsFrame APIs. The runner's earlier detached controller=null records remain
explicit, completed by passive native evidence. Three final snapshots (one full,
two concurrent-close test captures) retain the correct final documents/controllers.

The original output uses `PASS/FAIL christmastest`, while the public runner waits
for `ALL PASS/SOME FAILED`: BOTH CLI verdicts are TIMEOUT, comparison is n/a and
the independently monitored actual exit is 1. This protocol mismatch is tracked
separately in #847; no sentinel/runner/assertion fix is included here. Wall times
1218.924s/1320.458s include the original twenty-minute sentinel waits and capture
attempts, and this pair is excluded from speedup aggregation. The full PNG was
saved/inspected and shows all raw rows plus final kitchen/rearranging UI. Both
test captures timed out after 60s; errors are retained, no test PNG/review or
intermediate tree/light-pixel/rendered-scene equivalence is claimed, and no extra
app was started. Source/fixture/runner/helper hashes, all native phases, capture
errors and genuine setsid/Popen/wait PID/SID/PGID/exit are retained under
`/tmp/lunden-christmas813/`. The query-only migration preserves the original
fixture's output and checks; #847 owns the independent output-protocol correction.

## Entry and east geometry: east backdrop acceptance (#818, partial)

One complete published jobs1 comparison at frozen runtime `e172e47` used the
whole original 720×480/shot/month6/cloud-empty fixture without pre-pair edits.
All current native source-polygon/window/roof/courtyard/tree/triangle assertions
and explicit FULL/LITE campus-facade builder checks remained intact. The default
pair did not execute the top fixture's optional `?lowmem` apartment branch.

Both entire raw logs are byte-identical (2737 bytes, 46 PASS, 0 FAIL, ALL PASS),
including every actual source polygon, window rays, 62 park trees, 75351 campus
triangles and the explicit phone-detail builder's 23854 of 59085 triangles with
unchanged windows/eaves/ridges/tower. The independently monitored runner exited 0
and verified both modes, without raw pageerrors. Full app-ready/retained final
were 720×480/controller false; test app-ready/final were 480×300 with genuine
draw/setFull/wantsFrame APIs, lazy/full false. Neither mode entered fullscreen.
Both unique URL/timeOrigin identities matched, with no observer errors/warnings.

Elapsed full/test times were 111.579/86.476 seconds including capture overhead.
Full capture timed out after 10 seconds; the saved test viewport contains cropped
top textual results, with later geometry rows and ALL PASS below the image.
No campus artwork/rendered-scene equivalence is claimed. Asymmetric capture
excludes the pair from speedup aggregation. Complete logs/summary:
`/tmp/runtests-461385/`; frozen runtime/reference/helper hashes, native phases,
actual exit, image and capture error: `/tmp/lunden-entry818/eastbackdroptest/`.
All frozen source blobs matched after the pair.

The written default now uses 480×300/test. Optional top `?lowmem` keeps its
original 720×480/full app query and low-memory triangle budget; no actual
lowmem-app parity is claimed. The existing explicit FULL/LITE builder comparison
is still executed by the default fixture. Reversing only conditional setup and
its descriptive comment reproduces the exact frozen original; no assertions,
matrices, quality overrides, seeds or normalization were added. Entrance plants
and gables remain pending under #818; #739/#736 stay open.
