# Browser verification and test selection

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [local-development](local-development.md), [performance](performance.md).
HUD layout only (#707, #716): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/hudlayouttest.cjs http://localhost:8000 /tmp/hud-shots` checks the real index DOM, styles and icon initializer at 844×390, 667×375, 932×430, 568×320 and 1280×720 with zero, symmetric and asymmetric safe insets. It checks the exact 4 px safe-area edge placement (#766), shared shells, modular cells, score hierarchy, icon accessibility, compass height/top equal to the badges with a 4 px gap beside the right badge (#767), unclipped compact data/cardinal text, adjunct/control overlap, lives 12 px below the actual compass with real Combat hurt/life updates and weapon-dependent visibility (full unarmed hidden, injured unarmed visible even offline, full armed combat visible), disabled state and blur fallback. It suppresses game bootstrap; its screenshots are HUD-only, not game-render or gameplay evidence. `CHROME_PATH` optionally selects Chrome.

Armed greeting priority (#872): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/armedgreettest.cjs http://localhost:8867 /tmp/armed-greet` runs complete verbatim main.js production functions/listener bodies with current weapon checks, actual index DOM/THREE/Ghosts and source identity checks. It covers unarmed greeting, close armed touch, old ghost focus after weapon changes, E/keyup and pointer release (no latched rifle), primary mouse, suit/web/jetpack and preserved ordinary object E. Bootstrap/WebGL are suppressed; world collaborators and weapon effects are stand-ins, so the screenshot certifies action-label DOM rather than an actual-world shot/physical phone. No baseline or assertions are relaxed.

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
tools/rearrangesetup.js synchronous tools-only setup (#814): native unlocked/persist/real enable state, usable in full mode; no console/Worker bypass
tools/runtests.cjs     test runner (#737): runs chosen HTML / .cjs tests headless, times them, compares FAIL lines with `tools/baseline.json` (see "Test runner" below)
tools/baseline.json    the KNOWN red lines per test (no times), read by runtests.cjs
tools/testkit.cjs      shared Playwright helper (#703): `launch()`, `open(browser, url, { viewport = 480×300, test = true, lazy, init, arg })` (DPR 1, `&test` added), `shot(page, path)` (full size + shadows + quality 3, then back)
tools/lighttest.html   headless test: aim at every light switch / floor lamp, toggle it
tools/powertest.html   the power cut (#604): fuse box, flicker, Kv. Lunden dark / surroundings lit, hold-to-mend on touch, reload has power;
                       #612: fridge/freezer/oven/microwave lamps dark, brew/dishwasher/washer/dryer paused and resumed, the lift's rescue drive
tools/visitlightstest.html  the visitable flats' lamps (#620): a switch with a wall behind it in every room of L1004 and L1201, E lights / puts out, the frame gets brighter, power cut + mend, no extra light object
tools/perfcount.html   draw calls / triangles at a few spots (compare before/after optimising); fails past PERF.budget (#592), `?lowmem&w=390&h=844` for phones;
                       counts each draw to the screen (#695: `renderer.info` was reset by nested renders and under-counted the start view)
tools/startuprecoverytest.html / .cjs (#864) native request/body/cache stalls, optional fallbacks, retry and saved storage;
                       .cjs aborts/stalls bootstrap and five dependency/scene requests in actual index DOM, clicks retry, checks resume/home and normal hidden/done cancellation; clock advances the real 120 s budget, scene only stubbed (no WebGL/physical phone evidence)
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
tools/nerfapartmentprobe.cjs (#715): bounded actual apartment local Blaster/Darts/Marks plus injected Combat.remote/Darts/reach;
                       --cache-acceptance: ordinary 480x300/DPR1 native 30s cache progress, independent before/after solid-hit
                       metadata, real 60-step two-source effects, 2s obstacle and two manual draws; direct CDP PNG bounded 15s.
                       Two body/tip meshes per dart (four combined), actual child layers/frustum/quality/covers/source hashes.
                       Checkpoints before PNG; cleanup/actual CLI separate; failed first fixture guard remains CLI 1/image incomplete.
                       production drawing at quality0 (no test mode), paused automatic loop, cold/local-warm effect intervals,
                       separately reported remote-cache readiness and 2s obstacle query, JSON before screenshot. No network,
                       physical-phone/FPS or native-parity claim; see docs/validation/issue-715/README.md.
tools/trigridprofile.cjs / .html (#715): native Three, production furniture component + controlled sphere; historical
                       a336e30 constructor phase copy/bin diagnosis; PROFILE_REF=current selects current source. Not full apartment/GPU.
tools/markscoldprofile.cjs / .html (#715): actual Marks.meshes/buildFurniture, current instrumented bounds/grid/copy/bin/hits/native/residual phases versus separate uninstrumented cold/retained queries and fresh actual Darts. Strict anchors, exact result parity, raw JSON before screenshot; no production timing hooks or renderer/phone claim.
                       COMPARE_REF=<published SHA> adds unchanged Marks reference, native extrema edge cases and balanced natural-RNG A/B; separately recorded/replayed RNG provides exact original-edge Darts/splash/fits parity, not benchmark timings.
tools/trigridcopytest.cjs / .html (#715): independent unchanged a336e30 TriGrid reference; exact Float32/material/cell/big
                       membership and hit parity, indexed/transformed/BackSide/drawRange/authored-bounds preservation;
                       balanced reversed-order uninstrumented construction and actual local Marks/Darts cold/warm samples.
                       No renderer/app/physical phone; run marksphysicstest.html too after TriGrid changes.
tools/hitmarkertest.cjs (#875): actual index DOM/Ghosts/Combat with local Worker WebSocket receipts, no bootstrap/WebGL;
                       accepted hit+sound/score callback, miss/rejected weapon, renew/expire/reset/paused timer, optional head
                       receipt, phone 844×390/667×375/568×320 + desktop 1280×720 layout/pointer/action-click captures.
                       Run game and Worker URLs as first/second args; PLAYWRIGHT_MODULE/CHROME_PATH/SHOTS supported.
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

[Global filename inventory and measured summary (#764)](test-mode-inventory.md) records all current HTML/CJS dispositions, published pairs and pending evidence; group-owner rows below remain authoritative.

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

## Explicit private fixture inputs (#854)

Private-code fixtures use tools-only `secret-test-inputs.js` and external HTML companion
`tools/secretfixture.cjs`. Provision an untracked JSON file **outside the checkout** with exactly
`{"codes":["first private input","second private input"]}` (replace both placeholders with the actual
original inputs, in original first/second order). Set `LUNDEN_SECRET_TEST_INPUTS` to its absolute path.
The shared Node loader `tools/secret-test-inputs.cjs` exports `loadSecretTestInputs`,
`validateSecretTestInputs` and `redact`; Node Worker fixtures can reuse it. No input derivation/fallback is
performed by any runner. Missing/unreadable/invalid/inside-checkout provision is FAIL, never a skip;
input strings are passed exactly, without normalization. Keep private JSON out of source control/logs.

Start the normal isolated `tools/devserve.py`, then run, for example:

```sh
LUNDEN_SECRET_TEST_INPUTS=/absolute/private-inputs.json PLAYWRIGHT_MODULE=/path/to/playwright \
  node tools/secretfixture.cjs http://localhost:8813 cheattest /tmp/private-fixture-shots
```

The companion installs input only on `/tools/` documents before fixture execution; app documents receive
no injected global. It uses the usual runner's 1280×800 top viewport/DPR1 and Chromium flags, with no
query/frame dimensions/test-mode override. Fixture-authored actions, parser/form inputs and reloads run
normally. Ordinary failed assertion rows do not terminate execution: authored final ALL PASS/SOME FAILED
is required. Rearrangetest/rearrangeuitest's existing caught Error-stack output is explicitly terminal without a verdict.
Classification uses original output before optional privacy redaction, which cannot change acceptance;
logs/screenshots/native reload URL/timeOrigin/mode/viewport records go to the external output directory.
Do not infer logical or pixel parity from sanitized output. Both actual input values must still traverse the
production console/parser; the rearrangement setup helper does not substitute for them.

Loader preflight: 14 Node cases for malformed/missing/external path, exact strings and redaction; five
native Chrome cases for missing-input failure before app construction, exact frozen provider values and
non-tools gating. Actual companion CLI stub DOM success/failure runs verify terminal status and exits.
An additional actual companion stub-DOM case writes an early FAIL, then a later action and final SOME
FAILED; the companion retains the later action and exits1 only at terminal. Final rebase preserved concurrent
runner/doc disposition updates; all232 frozen runtime/provider/fixture hashes still match.
These lightweight checks do not construct/render the apartment or establish gameplay/state parity.
Both complete authored fixtures then ran at frozen 694e099 plus only provider/include/input/log-label
substitutions: cheattest 50 PASS/ALL PASS, exit0,54.196s; rearrangetest28 PASS/ALL PASS,exit0,30.740s
including captures, zero pageerrors. Whole-source inversion of those substitutions restores both originals
exactly; assertion predicates/actions/real console/form/parser/help/graffiti/neutral refusal/enable/layout
persistence/reset/life reload remain unchanged. All232 frozen runtime/data/index/helper/fixture paths match
following both runs. Cheattest's three original near-miss values are derived exactly from the private inputs;
only their public result labels change to near input1–3 to avoid exposing private near-values. No raw-log
parity, seed/baseline normalization, quality change or parser/setup bypass is claimed.

Native records show cheattest's TWO actual documents with authored test&life&shot&cloud= and later
ordinary test&shot&cloud=,480×300/real testMode/no fullscreen. Rearrangetest keeps its ONE actual
480×300/test&life&shot/testMode/no fullscreen document, same ready/final URL/timeOrigin. The inspected
fullPage PNGs show all50/28 rows plus final native courtyard/living room-HUD views respectively, not
intermediate graffiti/cleanup/movement pixels or rendered-scene equivalence. These are original test-mode
whole-suite runs, not full-render comparisons, Worker writes or physical-device coverage. Runtime hashing
and further multiplayer/console fixture changes belong to #853/#855/#856, not this input preparation.

Artifacts: `/tmp/lunden-priority-854/{inputs.json,loader.cjs,native.cjs,native.json,companion-native.cjs,
latefail-native.cjs,frozen-cheat.json,frozen-rearrange.json,cheat-exit.txt,rearrange-exit.txt}` plus
`cheattest/` and `rearrangetest/` complete logs/native metadata/inspected PNGs. The private inputs.json is
untracked and external; never publish its content. Owned browser/runner/server were stopped after runs.

#855 extends the companion's explicit authored Error-catch terminal support to rearrangeuitest, whose
original catch also has no ALL PASS/SOME FAILED marker. A native stub-DOM actual companion CLI run
retains its Error stack and exits1 without starting an apartment. Direct native UI missing-input failure
occurs before any app iframe; chattest's missing-input Node entry exits1 before requiring Playwright.
The shared provider and exact supplied strings/near-slash value were checked without printing them.
Whole rearrangeuitest at frozen a44752a plus provider/input and three additional private-input assertions:
26 PASS/ALL PASS (all23 original rows plus3), actual exit0,44.847s including capture, no pageerrors.
Actual ready/final preserve ONE844×390 full-mode life&shot&cloud= document, no fullscreen, same native
URL/timeOrigin. All254 frozen src/data/cloudflare/index/helper/fixture paths matched after the run.
The inspected fullPage PNG shows all26 rows plus final kitchen/HUD and rearrangement status overlay;
its final direct disable precedes the next UI step, so the rendered overlay is not a post-disable paint proof.
There is no pixel-parity, physical-phone, Worker-write or timing-improvement claim. Both inputs use the
original actual form/parser; extra assertions check real unlocked/enable/persist and public exclusion.
Reversing only provider/input and those explicit additional checks/actions restores the complete original
source exactly, including its authored key/menu/preview/reset/landscape-layout actions and predicates.
Evidence: `/tmp/lunden-priority-855/ui/{rearrangeuitest.log,rearrangeuitest.json,rearrangeuitest.png}`,
`ui-exit.txt` and `frozen-ui.json`. Owned runner/browser/server stopped after the short UI grant.

The separate original chattest attempt before #862 produced44 PASS then a native fullscreen resize crash,
SOME FAILED(1), exit1 at+244s, zero pageerrors. Five actual960×600 images were reviewed; the final three
captures and phone/Anonym/leave assertions did not run. Its whole CJS acceptance was explicitly blocked,
not passed or published. Source/partial log/exit/PNG evidence remains `/tmp/lunden-priority-855/`.

After #862 published its scoped native viewport fix c802339, the preserved private-input candidate was
integrated by controlled stash/fetch/rebase in its own checkout. Candidate SHA256
`6b47d8b53fe9b7c42ff20668e9a1e7ec83cdccf0cab4f4ac37752541bf7d8fdc` exactly matches the durable
862-combined-validation.cjs/proof reference. All43 original check call sites remain in original order with
five explicit added private-input/bare-unknown checks (48 total including crash catch), and all eight capture
names/call paths remain. The shared helper SHA256 is bc723daefb803568d14b81d5538201f198c855f9b548748d3617815ae38ec2f4.
Input provision is explicit LUNDEN_SECRET_TEST_INPUTS absolute external JSON, with no fallback/skip or
normalization. Missing provision fails before Playwright; Node-only preflight also checks malformed/path
provision and exact original private input/near-slash equivalence without logging values.

Run the actual two-client CJS driver against isolated devserve/Worker, retaining original shot&quality=0&cloud
URLs/poses, both480×300 normal pages, six960×600 desktop and two667×375 phone captures:

```sh
LUNDEN_SECRET_TEST_INPUTS=/absolute/private-inputs.json PLAYWRIGHT_MODULE=/path/to/playwright \
  SHOTS=/tmp/private-chat-shots node tools/chattest.cjs http://localhost:8813 http://localhost:8823
```

Both canonical inputs still traverse original actual form/parser; added checks cover first/second real
unlocked/enable/persist, absence from help/graffiti/both chat columns, and ordinary bare unknown text as a
real transmitted chat line. Original neutral near-slash refusal, Enter/input/room/bubble/menu/TTL/rate-limit
and leave logic remains intact. Original result predicates/counters classify before private output redaction;
no sanitized-log parity claim. Passive app-ready metadata records native URL/timeOrigin/mode/viewport,
without input/app overrides.

Complete combined acceptance was then run by the #862 worker on frozen d1036f9 plus the exact above
combined candidate at devserve8812/Worker8822. Attempt2:47 PASS,0FAIL,ALL PASS, actual Node/wrapper
exit0, zero pageerrors, all8 captures and final native leave/bubble-removal assertion at+389s. Independent
monitor wall413.379s includes cleanup (not a CPU/render benchmark); all1261 frozen-file hashes matched
at the run. Actual app-ready records retain both authored480×300/full-mode shot&quality=0&cloud URLs,
poses/timeOrigins and no fullscreen. Phone transition natively exited real fullscreen then reached667×375;
all old viewport/menu/bubble/TTL/network/input/capture checks and five added private-input checks passed.

All eight attempt2 images were reviewed by the orchestrator and fixture owner: six960×600 desktop and
two667×375 phone captures, including actual typing/sent bubbles, hidden/fitted log, phone chat and the
nighttime A view showing the Anonym response. Pictures are their capture-time views, not proof of all
intermediate pixels or rendered-scene equivalence. The final leave is verified by the native assertion;
there is no separate post-leave image. No physical-phone, production layout-Worker write, authentication,
client-hash migration or speedup claim. Runtime client migration remains #856.

Keep the independent incomplete attempt1 separate: tool exit143/SIGTERM, sender unknown,46PASS,
zeroFAIL,7captures,no final verdict/leave and no measured Node exit. It is not a completed suite or product
failure; the reason for that interruption is unknown. Both attempts/raw progress and source proof remain
in `/tmp/lunden-priority-862/{attempt-1,attempt-2,frozen-whole.json,combined-proof.json,
interrupted-attempt-1.json}`. The successful monitor is `attempt-2/monitor.json`; original failed-fullscreen
attempt and separate successful UI evidence remain `/tmp/lunden-priority-855/`. Owned processes were
closed after each attempt. The published final driver must match combinedSHA and relevant runtime bytes;
final rebase provenance records unrelated documentation/fixture changes separately from tested source.
Final rebase onto0ba00b9 retained both #862/#855 sections and the exact measured combined driver.
Full1261-file freeze comparison has exactly three differences: test-mode-inventory.md and verification.md
(documentation), plus unrelated tools/posterplacementtest.html. No new tracked files. The conservative
253-path set (all src/data/cloudflare, index, devserve, viewport helper, private-input loader and exact driver)
remains byte-identical; all CSS under src is included. The full freeze is not a blanket match. Durable proof:
`/home/devcontainers/.local/state/lunden-orkester/20261013-priority/855-final-rebase-proof.json`.

## Test runner (`tools/runtests.cjs`, #737 / #736)

`node tools/runtests.cjs resttest tostarttest cooktest` (or `--group a-c|d-l|m-p|r-t|u-z`, the file name's first letter) runs the named
`tools/*test*.html` / `*.cjs` tests. It starts its own `tools/devserve.py` (`--port`, default 8133) and kills only the PIDs it started
(process groups, so a test's Chromium goes too). HTML tests run in headless Playwright Chromium (SwiftShader flags, DPR 1; 1280×800 context normally, 480×300 in the compare test pass);
the runner polls `#out` every 2 s until `ALL PASS` / `SOME FAILED`, or reports TIMEOUT (`--timeout MIN`, default 20) / CRASH.
The standalone combat/Nerf fixtures also finish with `ALL PASS N checks` or `FAIL N checks`; combatworld adds the
literal suffix `; actual Three, no WebGL`. `tools/runnerverdict.cjs` accepts exactly these whole-line summaries (#861),
with no arbitrary success suffix. Both completion and success classification use this grammar; raw FAIL rows and
baseline comparison are unchanged. `node --test tools/runnerverdict.test.cjs` checks accepted and rejected summaries.
Needs Playwright (`PLAYWRIGHT_MODULE=…` or a global install; `CHROME_PATH` optional). Logs: `/tmp/runtests-<pid>/<test>.log` and
`summary.json`, never the repo. `--jobs N` runs N tests at once (default 1, **max 2**: the VM is shared), `--list` shows the selection,
`--verbose` prints each test's output.

`node tools/runtests.cjs --test-only pctest.html` (#860) is an optional **iteration** run: each selected HTML fixture runs
once with actual `&test`, DPR 1, a 480×300 context and the same iframe override/URL normalization/mode verification as
`--compare`'s test half. Authored query variants such as `test=lazy` remain; actions and assertions are not rewritten.
Console, per-fixture logs and JSON summaries explicitly say `iteration/test-only, NOT full/test parity`; the JSON mode
is `test-only`, with no comparison object. A standalone fixture that loads no game has null mode verification.
`--compare` still runs both modes for acceptance. `--test-only` rejects `--compare`, `--update-baseline` and any selected
`.cjs` script (scripts own their mode); choose explicit `.html` names if a bare name selects both formats. It reads the
ordinary failure baseline without modifying it. `node --test tools/runneriteration.test.cjs` exercises actual CLI,
server and browser native DOM/query/reload/isolation and controller evidence in a minimal temporary repo, without
loading the apartment/WebGL. This protocol regression supplies no game parity or performance claim.

Representative #860 measurement on frozen `297f9e8` used the unchanged current `pctest.html` and exactly three
real app documents: one `--compare` full/test pair, then a separate `--test-only` invocation. Both CLI processes exited
0; the pair retained all nine identical ordered PASS rows and its own ordinary mode-verified comparison. The separate
iteration run also completed nine PASS rows, actual `?test`/480×300 controller, explicit iteration scope and no
comparison object. All 232 recorded source/data/index/runner/fixture/server hashes remained unchanged throughout.

| Workflow | Actual process wall time | Actual runner times (capture included) | Passive capture time |
|---|---:|---:|---:|
| `--compare pctest.html` | 77.233 s | full 46.342 s + test 30.282 s | 9.150 s + 5.079 s |
| `--test-only pctest.html` | 31.233 s | test-only 30.599 s | 5.381 s |

These are one observed sample per workflow, with the same 60-second fullPage capture bound after completion; no
suite-wide or rendering speedup is inferred. Test-only deliberately omits the full run. Capture coverage differs:
the inspected full PNG is 1280×800 native fullscreen with the final PC/weapon-wall/HUD scene and no parent results;
both test PNGs are 830×492 fullPage captures showing all nine rows vertically (long text clips at the right) and the
480×300 final iframe. The parent capture width is not the app viewport. No rendered-pixel equivalence or intermediate
PC-action image is claimed. Each retained document has matching observed ready/final URL and timeOrigin, empty cloud,
no page errors; full observations already show fullscreen/null controller, test observations have the real draw/setFull/
wantsFrame controller and no fullscreen. No earlier full initial viewport is inferred from those later observations.

Source freeze, native identities, raw output, three reviewed PNGs, helper hashes and timings are retained in
`/tmp/lunden-priority-860/`; actual paired runner logs are `/tmp/runtests-1472694/`, separate iteration logs
`/tmp/runtests-1474199/`. The latter is iteration evidence only; it does not replace full/test acceptance for #736.


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

#820 grill acceptance at frozen `6f6ae93` is a single complete original-sized full/test pair, with unchanged
current assertions and original random flame/spark/crackle behavior. The approved pre-pair testMode-only
fullscreen guard immediately precedes the first original touch start; it is inert in full mode. Final migration
adds the test query and 480×300 dimensions, retaining that guard. Native app-ready and final records prove one
real document per mode with distinct child URL/timeOrigin: full ready 900×600/no controller before native touch
fullscreen reached 1280×800; test remains 480×300 with real controller API, no fullscreen.
Both successful end PNGs were inspected: full shows the fullscreen closed-grill/night scene (fixture text covered),
test shows all six raw result rows plus the closed-grill/night scene. Neither proves intermediate flame/light/lid
pixel equivalence. Timings include both captures and are one shared-machine sample, not a controlled benchmark.
All 247 frozen source paths and frozen fixture/helper hashes match. Raw logs: `/tmp/runtests-465595/`; provenance,
actual ready/final phases, independent monitor PID/SID/exit and both PNGs: `/tmp/lunden-objects820/grill-*` and
`grilltest-*`. The later hold/inventory/item acceptances are recorded below; the bounded #820 scope is now complete.
Broader #739/#736 remain open.


#820 hold acceptance at frozen `4f865cf`: complete 3348-byte raw logs are byte-identical, all 80 ordered PASS
rows and ALL PASS, genuine independent exit 0. Original repeated table/retake rows, held-model/one-hand rules,
saber geometry, grip/reach, Pingping hands/hug/hearts, photo, fruit bite/refill and placement ghost/grid/turn checks
are unchanged. Diagnostics retain grip 0.072m, both hands 0.061m, hug 0.80/9cm and bitten skin 3.9→2.3cm.
Original random hearts and existing seeded fruit geometry are preserved, without new seeds, waits, matrix/quality
changes or output normalization. Native ready/final records prove one real document per mode: full 900×600 at
ready → native fullscreen 1280×800 at final, controller null; test 480×300 with real controller API/no fullscreen.
The approved pre-pair testMode-only guard immediately precedes the original touch start and is inert in full mode;
final migration adds the test query and 480×300 dimensions while retaining that guard and every current assertion.
Full 166.267s → test 90.448s include successful end captures. Both PNGs were inspected: fullscreen kitchen/table
covers the upper fixture text in full (later result rows remain visible); test shows all 80 rows plus final kitchen/table.
Neither establishes intermediate hand/hug/fruit/placement pixel equivalence. Single shared-machine sample, not a
controlled benchmark. All 247 frozen source paths and exact fixture/helper hashes match. Raw logs:
`/tmp/runtests-470986/`; provenance, actual ready/final phases, independent PID/SID/exit and both images:
`/tmp/lunden-objects820/hold-*` and `holdtest-*`. Inventory/item acceptances follow; broader #739/#736 remain open.


#820 inventory acceptance at frozen `aa5b2c2`: all 18 ordered PASS rows and ALL PASS match in complete
961-byte raw logs; independently monitored actual exit 0. Original life/no-life queries, real local/session-storage
resume-record preservation, no-F5-record check, 2500ms wait, stock/integration invariants and dynamic stock/world
record-key diagnostics remain unchanged. Each mode loads TWO separate actual iframes (life scenario then normal
START), removes the first and retains the second. Four unique child URL/timeOrigin identities at app-ready,
first-frame passive pre-remove/pagehide and second-frame final records prove both full documents 700×450/controller
null and both test documents 480×300/real controller API, all without fullscreen. Final migration changes only the
shared iframe dimensions and adds test to both original queries; no guard, fixture instrumentation, wait/clock/seed,
storage, quality, matrix, assertion or result changes. The existing uncaught-error behavior is preserved.
Full 186.611s → test 143.456s include successful end captures. Both PNGs were inspected: all 18 result rows and
the normal-start house façade, not inventory-item or pixel equivalence. Single shared-machine sample, not a
controlled benchmark. All 247 frozen source paths and exact fixture/helper hashes match. Raw logs:
`/tmp/runtests-477108/`; actual per-load/pre-remove/final records, provenance, independent PID/SID/exit and both
images: `/tmp/lunden-objects820/inventory-*` and `inventorytest-*`. Item acceptance follows; broader #739/#736 remain open.


#820 item acceptance at frozen `00e816c`: complete 3124-byte raw logs match, all 64 ordered PASS rows and
ALL PASS, genuine independently monitored exit 0. This includes 46 domain and 18 real-app view-adapter rows,
with both original try/catch sections, instance/amount/place/carrier/store/save/audit/event rules and model
parenting/amount/holding/placement/fridge predicates unchanged. The source estimate of 65 counted an `I.check`
domain-helper call; it was not an extra emitted assertion. Exact dynamic IDs/events and cucumber y0.754 remain.
One actual main document per mode is proved by distinct child URL/timeOrigin at ready/final: full 800×500/controller
null versus test 480×300/real controller API, both without fullscreen. Final migration changes only iframe dimensions
and appends test to the original life/shot query. No guard, new seed, wait, pose/matrix/quality, domain/view assertion,
storage or output normalization was added. The original module domain tests still run before the actual app adapter.
Full 147.304s → test 80.783s include successful end captures. Both PNGs were inspected: all 64 rows vertically and
final kitchen worktop with cucumber (some long test rows crop at the right edge), not intermediate carrier/hand/amount-change
pixel equivalence. One shared-machine
sample, not a controlled benchmark. All 247 frozen source paths and exact fixture/helper hashes match. Raw logs:
`/tmp/runtests-486410/`; source/provenance, actual ready/final phases, independent PID/SID/exit and both images:
`/tmp/lunden-objects820/item-*` and `itemtest-*`. All four #820 fixtures are accepted: grill 6, hold 80, inventory 18,
item 64 identical PASS rows; this closes only the bounded #820 scope, not broader #739/#736.


#823 laptop logical acceptance at frozen `b1d956b`: complete 553-byte raw logs match, all 13 ordered PASS rows and
ALL PASS, independently monitored actual exit 0. All current screen/keyboard/wall/F, texture-update, automatic/manual
swipe and per-kind score predicates and diagnostics remain unchanged, including texture v2→v8 and seeded clip order.
Original native RAF and explicit steps are preserved; no new seed, clock/wait, quality, matrix, assertion or result
normalization was applied. One actual document per mode has distinct child URL/timeOrigin at ready/final: full ready
900×600/null controller → native fullscreen 1280×800 at final; test ready/final 480×300/real API/no fullscreen.
The approved pre-pair testMode-only fullscreen guard immediately precedes the original touch start and is inert in
full mode. The minimal migration adds the test query and 480×300 dimensions, retaining that guard.
Full 120.034s and test 94.092s INCLUDE capture attempts: full screenshot failed after 60,000ms; its error is retained,
only test PNG exists and was inspected (all 13 result rows, vanity and off laptop). No full-image review, playing-clip
pixel equivalence or extra replacement app load is claimed. Asymmetrical capture cost excludes this pair from
aggregate speedup calculations. All 247 frozen source paths and exact guarded fixture/helper hashes match.
Raw logs/summary: `/tmp/runtests-496140/`; actual ready/final phases, source/provenance, independent PID/SID/exit,
test PNG and full capture error: `/tmp/lunden-life823/laptop-*` and `laptoptest-*`. Laundry disposition follows;
Life2 acceptance follows; the bounded #823 scope is complete, while broader #739/#736 remain open.


#823 laundry retains its WHOLE original executable at frozen `d390634` (no new test query or guard). The one
complete original full/test pair has 61 PASS rows and ALL PASS in both modes, but DIFFERENT raw output and
actual independent compare exit 1. The sole difference is original real-time diagnostic row 28:

| Full | Test |
| --- | --- |
| `PASS actual reload keeps exact game time and original start load without offline progress (left 26.50 of 26.5 s, at most 8.52 s run since the app was up)` | `PASS actual reload keeps exact game time and original start load without offline progress (left 26.45 of 26.5 s, at most 5.04 s run since the app was up)` |

All other 60 ordered rows and terminal verdict match; no functional assertion failed. No output normalization,
seed, extra wait/timer/matrix/quality adjustment, baseline mask or retry was made, and no product cause is established.
All seven actual SAME-iframe documents per mode completed (two original life/shot/cloud-empty and five
shot/cloud-empty/time12 URLs): 14 unique child identities at ready, 12 beforeunload observations and 12 pagehide phases,
and both final records prove original full 480×300/null controller versus test 480×300/real API, all without fullscreen.
Original unconditional fullscreen suppression, DPR .15, storage/programme/member-id/pause/replacement/fold/wardrobe
coverage and real performance.now ran/left diagnostics remain unchanged. Authored resetHome.go is a stub; the final
explicit load is the real new document. Original catch-only FAIL stack behavior was preserved and did not execute.
Full 634.573s and test 477.422s include successful captures but are descriptive only, excluded from speedup aggregation.
Both PNGs were inspected: all 61 rows and generic final house façade at original low DPR, no intermediate garment/
programme/folding pixel equivalence. All 247 frozen source paths and exact unchanged fixture/helper hashes match.
Raw logs/summary: `/tmp/runtests-503245/`; source/provenance, all actual ready/leave/final phases, independent PID/SID/exit
and both PNGs: `/tmp/lunden-life823/laundry-*` and `laundrytest-*`. This is a blocked exact-row migration disposition,
not a rendering exemption or fixed product defect. Life2 acceptance follows; broader #739/#736 remain open.


#823 life2 acceptance at frozen `30cebbe`: complete 6482-byte raw logs match, all 137 ordered PASS rows and
ALL PASS, genuine independently monitored exit 0. The default pair ran ALL six original sections, each in its own
real life/shot iframe, with every current action, store/carrier, drink/clean/rack/programme, bin/drop-off, score,
record-roundtrip, repeated audit and dynamic diagnostic retained. The optional `only` section filter remains unchanged;
serialize/load checks restore records and are not extra app-document loads. The approved pre-pair testMode-only
fullscreen guard remains immediately before each original loader touch-start, inert in full mode. Final migration
changes only shared iframe dimensions and appends test to the original query template; no new seed, normalization,
wait/timer, matrix, quality, baseline or assertion change.
Twelve unique child document identities at ready, twelve pagehide observations and twelve passive pre-remove records
prove SIX actual loads/removals per mode. All full ready phases were 900×600/controller null/no fullscreen; the first
full pre-remove remained 900×600/no fullscreen, the other five reached native fullscreen 1280×800. Every test ready/
pre-remove phase was 480×300 with real controller API/no fullscreen. Final native frames are EMPTY in both modes,
as authored: all six frames were removed. No recorded lazy/full fields or event-isTrusted claim is made.
Both successful fullPage PNGs were inspected: all 137 rows vertically and ALL PASS, text only (some long test rows
crop at the right edge), no app-scene or intermediate-item pixel equivalence. Full 387.369s → test 403.815s includes
captures; test was slower in this single shared-machine sample, so no speedup claim.
Unequal horizontal result coverage excludes this pair from qualified timing aggregation. All 247 frozen source paths and
exact guarded fixture/helper hashes match. Raw logs/summary: `/tmp/runtests-513972/`; source/provenance, all actual
ready/pagehide/pre-remove/final phases, independent PID/SID/exit and both text PNGs:
`/tmp/lunden-life823/life2-*` and `life2test-*`.
The bounded #823 scope is complete: laptop has 13 identical logical PASS rows with full capture missing and no visual/
aggregate claim; laundry retains its whole original full fixture after 61 PASS per mode with one real-time raw-row
mismatch; life2 has 137 identical PASS rows. This is not an all-migrated or speedup claim; #739/#736 remain open.

| Fixture (`tools/`) | Audit disposition | Concrete source requirement |
|---|---|---|
| `detailtest.html` | Full rendering | Detail culler: nearby doors drawn and distant details hidden. |
| `dishrackpicktest.html` | Migrated (#785) | 30 identical ordered PASS rows, zero FAIL; actual 900×600 full/controller false → 480×300 test/controller true. 109.395 s → 77.926 s, single pair (`/tmp/runtests-277486`). Rack/cup rays, mouse/touch and inventory preserved. |
| `drawtest.html` | Original full retained (#825) | Both complete modes have 8 PASS, but actual red-pixel count row 5 differs (393 versus 379); other 7 rows exact. Comparison exit 1. Whole current original query/dimensions/executable restored and pre-pair guard removed; no normalization, migration or proven product bug/cause. |
| `eastbackdroptest.html` | Default migrated (#818); optional lowmem app stays full/unmeasured | 46 identical ordered PASS rows, 0 FAIL; native 720×480/full → 480×300/test, explicit FULL/LITE facade-builder checks preserved. Actual evidence and capture limits below. |
| `eggtest.html` | Migrated (#785) | 27 identical ordered PASS rows, zero FAIL; actual 640×400 full/controller false → 480×300 test/controller true. 81.321 s → 71.104 s, single pair (`/tmp/runtests-279045`). Cooking/actions, colour/opacity and save/load preserved. |
| `entrancedoortest.html` | Full rendering | 128×128 render-target pixel readback of handles/glazing. |
| `entranceplantstest.html` | Migrated (#818) | 15 identical ordered PASS rows, 0 FAIL; actual original 300×150/full → 480×300/test. Authored renderer/geometry/collision calls retained; native/capture evidence below. |
| `esctest.html` | Accepted in #819 | Complete original full/test logs byte-identical, five ordered PASS; actual 900×600/null controller versus 480×300/real test APIs. Authored synthetic Escape/arm click and pointer-lock request wrapper retained; no OS-input/native pointer-lock grant claim. |
| `falltest.html` | Accepted in #819 | Complete original full/test logs byte-identical, all 27 ordered PASS including untouched numeric/conditional walk diagnostics; actual 900×600/null controller versus 480×300/real test APIs. Authored pointerLock getter and synthetic pointerlockchange retained. |
| `fishtest.html` | Migrated (#785) | 29 exact ordered PASS rows, zero FAIL: original 900×600 iframe enters native fullscreen (actual 1280×800/controller false, 132.108 s). Compare test was 480×300/controller true, 74.350 s (`/tmp/runtests-281141`). Guarded written test in normal 1280×800 runner stays 480×300/controller true, 72.279 s (`/tmp/runtests-291884`); matches retained full `/tmp/runtests-281141`. Fish-finger actions and full cat walking/animation coverage retained; testMode-only fullscreen suppression. |
| `flowtest.html` | Full rendering | Actual renderer geometry-memory growth assertion over cooking and reloads. |
| `focusperftest.html` | Own fixture | 48×48 GPU shader compilation/reuse/disposal; no main iframe. Importmap blocked: #780. |
| `foliagetest.html` | Full rendering | Actual crown readPixels/shade count, cut-out shadows and lowmem atlas. |
| `gabletest.html` | Migrated (#818) | 40 identical ordered PASS rows, 0 FAIL; native original 400×300/full → 480×300/test. Gable-opening layout/bounds/drum-distance checks unchanged; actual evidence and missing captures below. |
| `garagetest.html` | Accepted in #819 | Complete original full/test logs byte-identical, all 51 ordered PASS including numeric geometry/doors/lighting/rain/exit diagnostics; actual 800×500/null controller versus 480×300/real test APIs. Original fullscreen suppression and quality-coupled particle predicates preserved. |
| `grillchickentest.html` | Own fixture | Own 800×520 scene/render images (toDataURL), chicken/grill modules; #780 importmap blocker. |
| `grillinteractiontest.cjs` | Full rendering | Real pointer lock/touch and desktop/touch/eating scene/HUD screenshots; keep its authored viewport/capture path. |
| `grillinteractiontest.html` | Full rendering | CJS-controlled pointer lock/touch and actual scene/HUD screenshots; HTML requires run717 invocation. |
| `grilltasktest.html` | Own fixture | Task modules and paper-canvas image, no main iframe. |
| `grilltest.html` | Migrated (partial #820) | All 6 ordered PASS rows and ALL PASS byte-identical; real focus/action/flame/lamp/lid/F/burnout checks preserved, including 16 flames / light 0.79 / lid 1.90 rad. Actual full ready 900×600 → native fullscreen 1280×800, controller null; test 480×300/real API/no fullscreen. 102.908s → 82.333s, actual exit 0; `/tmp/runtests-465595/`. |
| `hallcaretest.html` | Migrated (#821) | 24 identical ordered PASS rows, 0 FAIL across three real loads per mode; original/test actual 480×300, genuine native controller/API evidence. Care, geometry, reload/reset and fallback actions preserved; evidence below. |
| `halltasktest.html` | Migrated (#821) | 17 identical ordered PASS rows, 0 FAIL across six real main loads and three blank transitions per mode; native original 640×400/full → 480×300/test. Actual focus, task/bonus, storage/reload/pre-#594 saves and inventory audit preserved; evidence below. |
| `hangtest.html` | Own fixture | buildWorld and garment bounding boxes, no main iframe/renderer. |
| `holdtest.html` | Migrated (partial #820) | All 80 ordered PASS rows and ALL PASS byte-identical; all hold/grip/hug/fruit/placement predicates and duplicate table/retake rows preserved. Full ready 900×600 → native fullscreen 1280×800/controller null; test 480×300/real API/no fullscreen. 166.267s → 90.448s, actual exit 0; `/tmp/runtests-470986/`. |
| `hudiconstest.html` | Full rendering | 844×390 HUD bounds, 44px controls, blur fallback and scene draw-call equality. |
| `interactionoutlinetest.html` | Full rendering | 160×160 render-target brightness pixels, shader patches and draw-pass equality. |
| `inventorytest.html` | Migrated (partial #820) | All 18 ordered PASS rows and ALL PASS byte-identical; original storage/scenario/integration/dynamic-key predicates preserved. Both actual full documents 700×450/controller null → both test 480×300/real API, no fullscreen. 186.611s → 143.456s, actual exit 0; `/tmp/runtests-477108/`. |
| `itemtest.html` | Migrated (#820) | All 64 ordered PASS rows and ALL PASS byte-identical: 46 domain + 18 real-app adapter checks, both try/catch sections preserved. Actual full 800×500/controller null → test 480×300/real API, no fullscreen. 147.304s → 80.783s, actual exit 0; `/tmp/runtests-486410/`. |
| `jetpacktest.html` | Accepted in #822 | Complete original full/test logs byte-identical, 37 ordered PASS with exact numeric flight/heat/roof/native keep/touch rows; native 900×600/null controller versus 480×300/real test APIs. Original input simulation and every state predicate retained. |
| `jumpontest.html` | Accepted in #822 | Complete original full/test logs byte-identical, 35 ordered PASS plus exact full info furniture diagnostic; native original 900×600/null controller versus 480×300/real test APIs. Authored pointerLock getter/synthetic event retained. |
| `keytest.html` | Migrated (#821) | 21 identical ordered PASS rows, 0 FAIL; original authored 900×600/full enters native 1280×800 fullscreen → 480×300/test. Native cabinet/key, garage/asphalt/collision and DetailCuller layer/cut diagnostics preserved; evidence below. |
| `kittentest.html` | Original full retained (#822) | Both complete modes have 16 PASS, but exact raw rows 2/12 differ in native cat name/breed/score/badge and photo name. Comparison exit 1; no normalization, migration or proven product bug/cause. Current original including #848 writer restored byte-for-byte, pre-pair guard removed. |
| `laptoptest.html` | Logical parity (#823); full capture failed | All 13 ordered PASS rows and ALL PASS byte-identical, including texture v2→v8 and seeded clip order. Full ready 900×600 → native fullscreen 1280×800/controller null; test 480×300/real API/no fullscreen. Actual exit 0; `/tmp/runtests-496140/`. Full screenshot timed out; test-only image, exclude speedup aggregation. |
| `laundrytest.html` | Retain original full (#823); real-time row differs | Complete 61 PASS / ALL PASS in both modes, but exact row 28 differs (left 26.50/ran 8.52 versus left 26.45/ran 5.04). Seven real documents per mode, original 480×300/full controller null versus test real API/no fullscreen. Actual compare exit 1; `/tmp/runtests-503245/`. No migration or speedup aggregation. |
| `life2test.html` | Migrated (#823) | All 137 ordered PASS rows and ALL PASS byte-identical; six complete default sections/six actual removed frames per mode, all action/save/audit/timer/score diagnostics and optional filter preserved. Full ready 900×600/controller null (five later native fullscreen1280×800) → test480×300/real API/no fullscreen. 387.369s →403.815s, actual exit0, no speedup claim; `/tmp/runtests-513972/`. |
| `life3test.html` | Original full retained (#824); dust admission fixed (#849) | Subsequent complete default fix-verification has68 PASS each; strict raw rows6/11 still differ, so no migration/normalization. Native boundary regression14 PASS/2 FAIL→16 PASS proves the separate admission/storage fix; old unrecorded failed spot remains unknown. Evidence below. |
| `lifetest.html` | Original full retained (#824); canonical stock amount check corrected (#850) | Subsequent complete written-full acceptance has133 PASS/0 FAIL, including intact eggCarton place/store/slot/amount predicate. Historical identical-red pair is retained below; no new test-mode pair or migration. All original thirteen-app default flows preserved. |
| `lifttest.html` | Migrated (#824) | 24 identical ordered PASS rows, 0 FAIL; native original 800×500/full → 480×300/test. One actual main document per mode; lift.loadState is native state restoration, not an app reload. Doors/panel/collision/ride/stair predicates preserved; evidence below. |
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
| `measuretest.html` | Accepted in #826 | Actual complete original full/test logs byte-identical, all 3 ordered PASS; native original 900×600/null controller versus 480×300/real test APIs. Current wall-distance/DOM-label/third-clear actions retained, superseding the earlier unverified branch claim. |
| `menutest.html` | Accepted in #827 | Complete original full/test logs byte-identical, all 18 ordered PASS; actual 900×600/null controller versus 480×300/real test APIs before authored iframe removal. Original menu/reset actions and reset navigation stub retained; supersedes the earlier unverified branch claim. |
| `mieletest.html` | Accepted in #826 | Complete full DEFAULT action/photo/fireworks/rarity flow has byte-identical logs, all 29 PASS; actual original 900×600/null controller versus 480×300/real APIs. No only=fireworks shortcut; unchanged own-coat-canvas/native colors/hand/action predicates supersede unverified branch claim. |
| `milktest.html` | Accepted in #826 | Complete original full/test logs byte-identical, all 16 ordered PASS; native 900×600/null controller versus 480×300/real APIs. Actual carton/pour/fill/hex/contents/drink/held/F actions retained; no rendered-liquid pixel comparison. |
| `mirrortest.html` | Explicit reflection exclusion (#736) | Actual active Reflector and ghost before/after-mirror drawing hooks; retain reflection mode. |
| `musicintegrationtest.html` | Migrated (#851); trusted activation | Complete original pair and final written test each preserve 17 PASS/ALL PASS and identical 921-byte logs. Real native button/media preserved; original companion exit1 CDP errors retained, written runner/companion0 with separate native OS policy evidence. No qualified timing or scene-pixel equivalence claim. |
| `musicreloadtest.html` | Migrated (#852); trusted activation | Complete 3 PASS/ALL PASS and identical 249-byte logs; original two actual 480×300 documents/DPR.15/first play-save preserved, one trusted second-document click per mode. Actual runner/companion0 and OS argv policy verified; no new media/analyser or pixel-equivalence claim. |
| `musictest.html` | Own fixture | Actual audio recordings/decoding/analyser and module lifecycle, no apartment iframe. |
| `neighboropeningstest.html` | Full reflection/lighting | Shared reflection envMap and night envMapIntensity/emission/window-colour checks for actual glazing. |
| `nerfcombattest.html` | Own fixture | Own THREE/Combat/Ghosts/Worker/audio fixture and final 640×400 WebGL scene; no apartment iframe. |
| `nerftest.html` | Accepted in #828 | Complete original full/test logs byte-identical, all 7 ordered PASS; actual 900×600/null controller versus 480×300/real test APIs. Blaster, flight layers, wall splash position/colour, floor drop and fade retained; capture coverage differs. |
| `nesttest.html` | Original full retained (#829) | Actual complete pair: 31 PASS per mode, nine ordered random-answer/speech/caption rows differ. Original 900×600/rain/time fixture retained; original speech mock, clock/weather, ducking, wall/F and 300 presses preserved. See actual evidence below. |
| `nonpctest.html` | Accepted in #828 | Complete original full/test logs byte-identical, all 10 ordered PASS; actual 900×600/null controller versus 480×300/real test APIs. Missing People fetch, greeting/speech expiry and original old-save score/storage flow retained. |
| `northbackdroptest.html` | Accepted in #828 | Complete original full/test logs byte-identical, all 14 ordered PASS; actual 720×480/null controller versus 480×300/real test APIs. All mapped footprints, 426/426 window rays, 39 trees and 8380-triangle budget retained; no lowmem subset. |
| `notetest.html` | Viewport exclusion | Paper scrollHeight/clientHeight and numeric scroll positions/keyboard repeat rows depend on note-panel viewport. |
| `olofcartest.html` | Original full retained (#829) | Actual complete pair: 31 PASS per mode; greeting and dad-joke rows differ. Whole original 900×600/time12/month6 fixture, existing fullscreen suppression, native car/driver/door/seat/scoring and record restoration retained. See actual evidence below. |
| `oloftest.html` | Original full retained (#829) | Actual complete pair: 21 PASS per mode plus identical geometry diagnostic; greeting/joke rows differ. Whole original 900×600/time12/month6/olof0 fixture, authored canSee mock/forced scenario and 200 unseeded joke checks retained. See actual evidence below. |
| `opentest.html` | Accepted in #830 | Complete original full/test logs byte-identical, all 189 ordered PASS; actual 900×600/null controller versus 480×300/real APIs. All 90 fronts, conditional action labels, clashes/poster sweeps, free-floor and contents loops retained; captures show only early rows. |
| `oventest.html` | Accepted in #830 | Complete original full/test logs byte-identical, all 19 ordered PASS; actual 900×600/null controller versus 480×300/real APIs. Appliance actions/angles/emissive lamps, stats and whole coffee brewing/water/grounds flow retained. |
| `papertest.html` | Accepted in #830 | Complete original full/test logs byte-identical, all 22 ordered PASS; full starts 900×600/null and finishes native fullscreen 1280×800, test remains 480×300/real APIs. Whole roll/strip/wad/ray/quantity/flush/stats/F flows retained; full capture timed out. |
| `patiopalmtest.html` | Accepted in #831 | Complete original full/test logs byte-identical, all 15 ordered PASS; actual 720×480/null controller versus 480×300/real APIs. Whole pot/soil/ray/bump/wind/canopy/collision/native geometry predicates retained, 10632 triangles/2.62 m canopy. |
| `patiotest.html` | Accepted in #831 | Complete original full/test logs byte-identical, all 33 ordered PASS; actual900×600/null versus480×300/real APIs. Whole season/weather/collision/seat/shade/lid/cup native loops and original optional parent shot branch retained. |
| `pctest.html` | Accepted in #831 | Complete original full/test logs byte-identical, all 9 ordered PASS; actual900×600/null versus480×300/real APIs. Current screen CanvasTexture/fan-colour, chair/bunk actions and yaw/facing predicates retained; capture coverage differs. |
| `perfcount.html` | Explicit performance exclusion (#736) | Actual renderBufferDirect screen calls/triangles, shadow/mirror/env passes and texture-memory budgets. |
| `pettest.html` | Original full retained (#832) | Actual complete two-live-app pair: 17 PASS per mode; full/test badge row differs by room prefix. Native pet/hand/eyes/photo JPEG/IndexedDB/stats/rare stars and all unseeded values retained; see actual evidence below. |
| `planttest.html` | Accepted in #832 | Complete original full/test logs byte-identical: 23 PASS, 1035 bytes; native 900×600/null controller versus 480×300/real test APIs. All original held/merged-vertex/placement/focus/F checks retained; capture scope differs. |
| `plantwindtest.html` | Full pixel rendering | 192×192 render-target readback asserts moving foliage, focused foliage and pixel-identical pottery. |
| `portiktest.html` | Accepted in #832 | Complete original three-load full/test pair: 36 ordered PASS, whole 1704-byte logs identical. Native 480×300 in all six documents, full/null versus real test APIs; actual collision/geometry/door/jetpack/bin/bag/reload/reset coverage retained. See qualified evidence below. |
| `posterplacementtest.html` | Fixture precondition corrected (#857); complete pair (#833) | On frozen `2fc232f` plus fixture-only in-flat level1 start, full/test each 15 ordered PASS; complete raw logs identical, modes verified. Full/test screenshots reviewed. No product code change. |
| `postertest.html` | Complete pair verified (#833) | Full/test each 37 ordered PASS; only row 19 differs in panel clock minute (12:22/12:26), with modes verified. Full/test screenshots reviewed; no parity/migration claim. Original pointer drawing/IndexedDB/actions preserved; see actual evidence below. |
| `powertest.html` | Full lighting | Actual pools/washes, flickering supply, emissive appliance lamps and night-window lighting through cut/repair/reload. |

Historical recovery audit: `origin/wip/740-tests-m-p` tip `dd8810d` contained six fixture edits
(measure/menu/miele/milk URL/size changes and mirror/perf comments). Its measured merge base was
`8c3712a`; no cherry-pick or branch rewrite was performed. The earlier evidence search did not recover
matching local raw logs for the four fixtures, so that branch was not accepted from its handoff alone.
Those historical limitations are superseded by the actual disposition below and the linked child issues.
Evidence/source references for the old audit remain in
`/tmp/lunden-audit784/{inventory,source-evidence,recovered-740,retained-runner-evidence}.json`.
The earlier d–l loosemirrorstest exclusion also remains required by #736.

**Current #740 disposition:** all nine split issues #826–#834 are closed, and every m–p fixture now has
a current entry in the alphabetic table above. Accepted migrations are backed by complete ordered full/test
results in their child issue reports. Original full behavior is retained for actual differences or visual,
reflection, lighting and viewport dependencies; `ghosttest.cjs`, `ghostbadgetest.cjs` and `bowtest.cjs`
remain separate rendering fixtures as documented. The completed #833 poster comparison records 15 identical
placement rows and 37 drawing rows per mode with only the panel clock minute different. No blanket mode parity
or aggregate performance claim is made. This closes the m–p group; parent #736 remains open for other groups.

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

`tools/fixtureviewport.cjs` (#862) synchronizes the headless chat driver's three existing viewport call sites:
leave actual fullscreen with the real `document.exitFullscreen()` promise, set the original target size, then wait
for actual nonfullscreen DOM width/height (10-second bound, errors propagate). The phone sequence still clicks the
real start-touch control, waits for its actual async fullscreen entry (10-second bound), inserts the same messages,
and exits that native mode before applying the authored 667×375 viewport. Screenshot grow/restore targets,
render-frame waits, all eight captures, original assertions/actions/queries and product requestFullscreen stay intact.
No feature stub, rendering/mode override or ignored failure is added. This fixes the Chromium native window contract,
not a phone-rendering performance issue.

`PLAYWRIGHT_MODULE=... node --test tools/fixtureviewport.test.cjs` verifies native DOM-only Chromium entry/windowState
fullscreen, real exit/windowState normal, actual 667×375/480×300/960×600 transitions, repeated native entry, preserved
requestFullscreen function and touch/input state. `FIXTURE_VIEWPORT_ARTIFACTS=/tmp/...` retains native JSON and two
DOM-only screenshots. On Chrome149.0.7827.55 the old direct resize reproduced Browser.setWindowBounds's fullscreen
error; the synchronized path passed. Both native PNGs were inspected and show the button/input at requested sizes;
no apartment, WebGL, physical phone or game screenshot acceptance is established by this regression.
Whole #862 acceptance completed on frozen `d1036f9` with an explicit validation-only #855 input overlay:
combined driver SHA-256 `6b47d8b53fe9b7c42ff20668e9a1e7ec83cdccf0cab4f4ac37752541bf7d8fdc`, published native
helper `bc723daefb803568d14b81d5538201f198c855f9b548748d3617815ae38ec2f4`. The byte-inverse proof retains all
43 original check sites (including catch) and eight captures in exact authored order; only the five approved #855
checks/preflight/redaction/ready observation are added. That overlay is preserved for #855 and is not committed as #862.

Attempt1 reached 46 PASS and seven reviewed captures, then its direct exec session and server reported SIGTERM/143
without a test catch/verdict or Node exit file. Signal sender is unknown; the original 60-minute driver deadline was
not reached, and no 300/360-second tool limit is established. This interrupted run supplies no whole acceptance.
A separately authorized attempt2 used the same exact source/driver and an owned bounded test monitor (900 seconds,
15-second heartbeat, own process groups only). Actual Node and wrapper exited0, ALL PASS47/0 FAIL, no page errors,
all eight original PNG and final leave completed. Final monitor wall413.379 seconds includes readiness and cleanup;
this is test lifecycle time, not phone frame time or a speedup measurement. Both actual app-ready observations were
480×300, full rendering/no test mode. The phone sequence logged actual `leftFullscreen:true` then 667×375 and passed
its original non-overlap/bottom-gap check; anonymous reply and final ghost/bubble leave also passed.

All eight attempt2 PNG were inspected: six original960×600 desktop captures show literal markup, typing/line bubbles,
hidden chat, fitted rows and the final anonymous reply in A's night scene; the two667×375 phone captures show actual
lines/controls and the open input bar. No virtual-keyboard, physical-phone or rendered-pixel parity claim is made.
All1261 tracked source hashes matched the measured freeze before/after that whole run. Later final rebase differs
exactly in `docs/development/test-mode-inventory.md`, `docs/development/verification.md` (incoming completed-group/
poster dispositions plus this final note), `tools/posterplacementtest.html` (unrelated fixture precondition fix), and
`tools/chattest.cjs` (intentional removal of this agent's #855 validation overlay to published #862 bytes). All other
frozen files, including chat/runtime/Worker/private-input provider and native helper/test, remain byte-identical;
no blanket full-freeze or fresh whole rerun after these unrelated docs/fixture changes is claimed. The measured
combined bytes remain saved for #855's controlled publication; its input changes are not part of #862's final commit.

Evidence: `/tmp/lunden-priority-862/attempt-1/` (interrupted), `attempt-2/` (complete raw log/eight PNG/monitor actual
exit and cleanup), `frozen-whole.json`, `combined-proof.json` and `final-rebase-proof.json` alongside them. Only owned
server/Worker groups were terminated by the successful monitor's finally cleanup; no client/browser/listener remains.

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
| Companion driver (1) | basemententrytest | #837 verifies all 56 current native checks with the whole original CJS inputdriver: full900/controller null versus480/test=lazy/real APIs, real mouse-start and PointerLock retained. Entire raw logs match; HTML alone does not invoke the checks. Evidence below. |
| Historical full-quality classifications (5) | architecturetest, carsoundtest, compasstest, cupshadetest, curtaintest | Architecture/cup shade read scene pixels, car sound measures analyser/RMS/rain workload (later #843 retains original after three actual raw differences), compass asserts viewport/safe-area bounds. Curtain state/own-texture pixels were included at this audit; its later complete #844 pair supports test-mode migration below. Preserve the other four fixtures' full behavior. |
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

#814 replaces ONLY ordinary rearrangement setup in artleveltest, bestaplacementtest, beertest,
returnmarkerstest and zzplanttest. The shared classic tools/rearrangesetup.js preserves each original script
kind and synchronous call position: unlocked=true, same child native localStorage boolean key with caught
storage getter/set failure, actual enable(true), original true return even when busy/saving refuses activation.
The helper is gated to parent /tools/ pages and excluded from the published site by tools/stamp.sh; it works
without a testMode flag. Production code parsing and Worker credential checks remain unchanged;
no renderer/quality/query change is introduced. Undoing script include and setup-call replacement yields all five current
original fixture bodies exactly, including every assertion/action/timer/storage/reload and optional cloud case.

A lightweight native module probe at frozen 2b548e0 gave 11 PASS/ALL PASS, actual exit 0, 4.075765s. Actual THREE/
Rearrange classes use an explicit empty-world/offline constructor, no apartment/WebGL/Worker; both original
reference inputs are provisioned in untracked external JSON and never printed/published. Free/busy/saving,
selected-preview cancellation, repeated setup, native persistence and new-instance unlocked-but-disabled
state match original valid unlock exactly. Unavailable storage getter is an explicitly simulated harness
case, not a measured browser-security failure. Native timers and owned browser/server were closed. The
inspected image shows all eleven semantic result rows only; no placement/render/Worker claim. Relevant
R/config/stamp/helper/probe hashes remain unchanged after rebase.

One representative complete returnmarkerstest used current source at frozen b72c279 with ONLY its existing
test flag temporarily removed. Actual authored 480×300/one app, original unconditional fullscreen suppression,
manual animation stop, matrix/control/contour/placement/raycast logic and all fifteen unchanged raw checks
were retained: 15 PASS/ALL PASS, actual independent runner exit 0, 78.587s (monitor 79.554587s). One actual app-
ready and one final record retain the same URL/timeOrigin: life&shot,480×300/null controller/no fullscreen.
No historical 640/900 reconstruction, comparison pair, timing improvement or quality override is claimed.
The inspected fullPage image shows all fifteen result rows/ALL PASS and final kitchen/cup cabinet/HUD;
intermediate contours or scene-pixel equivalence are not claimed. Before restoring source, all 247 frozen
source paths, three passive-helper hashes, exact measured full fixture 6fe20e18 and setup helper 2c2dd621
matched. The WHOLE authored default 480/test setup was then restored exactly 1d0df9d9; final commit changes
only the helper/include/setup calls and this documentation, not test modes or other source behavior.

The other four full runtime suites and optional real-cloud branches were NOT rerun by this bounded setup
issue. They retain their complete original assertions/queries/actions and are supported here by whole-source
inverse and actual generic setup-state equivalence, not fabricated runtime claims. Code-parser/private inputs,
actual client/Worker writes and console coverage remain separate in #817/#853–#856; #756 stays open.
Native module/source/provenance/process/exit/image evidence: `/tmp/lunden-setup814/native-*`; representative
complete raw/summary: `/tmp/runtests-628913/`, source/helpers/native identity/image/cleanup:
`/tmp/lunden-setup814/representative-*`, `returnmarkers-*` and `returnmarkerstest-full.*`.

#859 moves patiottest's existing lines array to the same onload callback scope before its outer try,
so the unchanged reason/stack/prior-row writer can reach it even if loading fails before any check. The
catch appends only SOME FAILED; normal writers, gameplay/actions/loops and optional SHOT return remain
unchanged. Native Chrome static-DOM lexical/writer probe: seven PASS/ALL PASS, actual exit0. The original
ReferenceError/running-output counterexample is retained; explicitly thrown cases before first check and
after accumulated PASS/FAIL rows preserve the complete stack/reason/rows and one terminal. Normal success
and assertion-failure text match exactly. The inspected image shows seven writer-only results; no natural
apartment exception or gameplay-fix claim. Whole inverse restores original source. Evidence
`/tmp/lunden-protocol859/`; original counterexample `/tmp/lunden-patio831/patio-writer-probe.{cjs,json}`.

#858 changes only posterplacementtest's catch writer: accumulated PASS/FAIL rows and the complete error
stack are retained byte-for-byte, followed by the standard SOME FAILED terminal. A native Chrome static-DOM
probe gave seven PASS/ALL PASS, actual exit0: original missing-terminal counterexample, expected multiline
stack, exact previously captured actual preview-FAIL/TypeError text, one new terminal, and both unchanged
normal success/assertion-failure terminals. The inspected image shows those seven writer-only results;
no apartment/gameplay rerun or fix of #857's preview failures is claimed. Whole source inverse removes only
the appended terminal; evidence `/tmp/lunden-protocol858/` and preserved actual #833 full-progress text.

#815 extends ONLY ordinary rearrangement setup to christmastest, loosemirrorstest,
rearrangemirrortest, veronatest and posterplacementtest. Five classic includes and seven synchronous setup
calls retain original script kinds/call positions. The shared helper is unchanged from #814: unlocked=true,
child native boolean persistence with storage failure caught, actual enable(true), and original true return
even when busy/saving refuses activation. No query, dimensions, renderer, quality, wait, action, assertion,
output, reload or optional cloud branch changes. Whole inverse of only includes/setup calls reproduces all
five complete original fixture bodies. Posterplacement query/dimension disposition belongs separately to
#833; this issue changes only its setup include/call. Explicit #736 full/reflection exclusions remain.

The unchanged helper reuses #814's actual eleven-check native THREE/Rearrange empty-world/offline semantic
probe with both privately provisioned legacy references. Free/busy/saving/selected cancellation, repeat,
boolean persistence and new-instance unlocked-but-disabled state matched original valid unlock. The
unavailable storage getter was explicitly simulated, not a measured browser-security failure. Actual exit0
and inspected text-only image cover that bounded module behavior; no additional module run is claimed.

One complete representative loosemirrorstest at frozen 1fb73e8 retained current authored480×300/life&shot,
original full mode and unconditional fullscreen suppression, ONE actual document, all seven movable
mirrors/fixed bathroom mirrors/night-light anchors/cabinet exclusions, real confirm/restore and final native
renderer.render. All35 unchanged raw checks PASS/ALLPASS, independent runner exit0,104.386s (monitor105.390937s).
ONE actual-ready and ONE final record have the same URL/timeOrigin,480×300/null controller/no fullscreen.
The inspected successful fullPage PNG retains all35 rows/ALLPASS plus final kitchen/rearrangement overlay;
intermediate mirror movement, reflection/shadow pixels or framebuffer equivalence are not claimed. All247
frozen source paths, three passive helpers, exact measured fixture and unchanged setup helper match before
publication. This is one full-mode setup acceptance, not a comparison pair or timing improvement.

The other four complete runtime suites and optional real-cloud branches were NOT rerun. Whole-source
inverse and generic native setup-state equivalence support their retained setup semantics, not fabricated
runtime claims. Private console parsing and actual Worker credential/protocol coverage remain separate in
#817/#853–#856; #756 stays open. Source/setup/helper/native/image/exit evidence is `/tmp/lunden-setup815/`;
complete raw/summary `/tmp/runtests-638864/`; reusable module evidence `/tmp/lunden-setup814/native-*`.


#816 reuses the unchanged tools-only setup helper in rearrangefollowtest, rearrangeplacementtest,
rearrangeresettest and rearrangetvtest. Only four classic includes and four synchronous setup call sites
change; reversing those substitutions reproduces each complete original source exactly. Authored queries,
480×300 frames, actions, assertions, storage/reset/hidden-state behavior and real reloads remain intact.
Production parsing, Worker credentials, seeds and baselines are untouched; the helper remains tools-gated,
excluded from publication and independent of testMode.

A fresh lightweight native THREE/Rearrange empty-world/offline probe gave 12 PASS/ALL PASS, exit 0:
both original valid inputs (privately extracted, not published) matched free/busy/saving, selected-preview
cancellation and repeat state, including actual enable/status and true return. Native boolean persistence
restored a new controller unlocked but disabled. An unavailable localStorage getter was explicitly simulated,
not an observed browser-security failure. The inspected native PNG shows these twelve text rows only.

One complete representative rearrangetvtest ran at frozen e254f78 plus these setup substitutions with ONLY
its existing test query temporarily removed. All nine unchanged checks PASS/ALL PASS, actual harness exit 0,
67.784 s including capture; no pageerrors. Two actual app-ready documents and the final snapshot retained
480×300/null test controller/no fullscreen. The second ready state natively restored unlocked=true with
persisted boolean true and enabled=false; final setup had enabled=true with the same reload URL/timeOrigin.
The inspected fullPage image shows all nine rows and the final kitchen/HUD/rearrangement overlay, not TV
placement pixels or intermediate movement. All 229 frozen src/data/index/helper/actual full-fixture hashes
matched after the run. The authored default test-query fixture was then restored byte-for-byte.
Final rebase preserved the concurrent combatworld/crashlog diagnostics; these two runtime files differ
from the frozen full run. Rearrange, its setup helper/config/data and all four whole-source inverses remain
unchanged. The final rebased app was not rerun; the full result belongs to the stated frozen source.
The twelve lightweight native semantic checks were rerun on final rebased 068db63: 12 PASS/ALL PASS,
exit 0, image inspected, no WebGL. The broad 229-file post-rebase assertion failed on those two concurrent
diagnostic files; a shell sequencing error let the already-reviewed push continue despite that assertion.
This is not an all-source-match claim. Frozen pre-rebase files and current relevant setup contracts remain
separately verified. No extra full run was requested for these unrelated diagnostics.

The other three complete runtime suites were not rerun. This is full-mode setup acceptance, with source
inversion and module-state equivalence, not historical parity, a speedup, cloud/physical-device coverage or
rendered-scene equivalence. Evidence: `/tmp/lunden-priority-816/{native.cjs,native.json,native.png,full.cjs,
full.log,full.json,full.png,exit.txt,frozen.json,tv-default.html}`. Owned browser/runner/server were stopped.


#852 `musicreloadtest` migrated after one complete original two-document full/test pair at frozen `3b9dffb`:
all three PASS rows and ALL PASS are byte-identical in the complete 249-byte raw logs. Actual public runner 0
and companion 0, full 197.164s/test 144.358s (independent monitor 343.633s), including both successful captures.
These are descriptive shared-machine samples pending final #764 timing qualification, not a controlled
benchmark or automatic aggregate speedup claim. Original 480×300, renderer DPR.15 in BOTH loads,
shot/cloudempty/time12 then same-iframe real reload=1, first unconditional fullscreen suppression/synthetic
touch-start, Sonos channel 3/volume 7/play and native saveResume/world are preserved byte-for-byte apart from
appending test in the shared original URL prefix. No new guard or first-document click was inserted.
All four actual app-ready records retain four unique URL/timeOrigin identities, first-document beforeunload
and pagehide observations and retained-second final records: full 480×300/null controller versus test 480×300
with real draw/setFull/wantsFrame API Boolean, no fullscreen in any observed phase. Exactly one trusted normal
locator click per mode targets ONLY the second actual reload=1 document's existing music-test-start gate;
actual isTrusted/userActivation and same-document identity/removal recorded. First original play/save remains
unchanged; second button only removes itself/resolves and native resumed pointerdown activates production audio.
Native clock/title behavior and original 20 step.01/wait50ms loop remain unchanged, as do all three predicates:
six original channel IDs, channel index 3/new matching genre/volume 7/playing restoration, recording/artist title.
There is no invented media-currentTime/RMS/analyser assertion where this fixture does not have one.
Both CDP Browser.getBrowserCommandLine queries failed (--enable-automation absent) and are retained as
diagnostic-only. Separate /proc fallback records each actual newly owned Chrome 613795/614538, parent public
runner 613768, executable and Chrome's ONE joined argv, with no autoplay-policy/Autoplay-feature override;
caller arguments unchanged. No flags, AudioContext/media stubs, seed/clock/timer changes, new waits, quality/
matrix override, result normalization, baseline or assertion edits. Original catchFAILstack WITHOUT verdict is
also retained; it did not execute here and is not silently repaired into a completion marker.
Both actual fullPage PNGs were inspected: full 1280×800 and test 791×402 show all three vertical result rows,
ALL PASS and final low-DPR entry façade/HUD (test's long second result line meets the right edge). They support
native capture/result/final-layout evidence, not intermediate speaker/playback or scene-pixel equivalence.
All 247 frozen source paths, exact original fixture and four helper hashes match. Undoing ONLY shared query
addition reproduces the WHOLE frozen original. Raw/summary: `/tmp/runtests-613768/`; original/final source proof,
actual per-document lifecycle, trusted inputs, separate CDP/OS policy, PID/SID/runner-versus-companion exits,
cleanup and both images: `/tmp/lunden-music852/`. The reviewed external companion uses the PUBLIC HTML runner;
its activation/policy accounting never rewrites fixture results. Parent #834's two fixtures now have concrete
complete dispositions (#851 and #852); broader #740/#736 remain open.

#851 `musicintegrationtest` migrated after one complete original plain-index/default-iframe full/test pair at
frozen `1a8d210` and one meaningful final written-context verification. Every current 17 PASS row and ALL PASS
matches in the complete 921-byte raw logs, including the native running AudioContext and actual recording path
`music/morning-blue.ogg`, radio rotation/wrap, PC/laptop/Kaffeturbo streaming/release, playbackRate 1.25,
failed-file silent fallback and zero generated notes. Original real media clocks/waits and authored turbo.now
manual test clock, synthetic ended events, failedFiles and native oscillator counter remain exact; no new
seed, clock/wait, quality/matrix, media/AudioContext, baseline, normalization or assertion changes.
The original fixture did not author 900×600: its one plain-index iframe had default 300×150. Final source sets
480×300 and test query; one later-reviewed testMode-only fullscreen suppression follows app lookup, BEFORE
the original renderer.setAnimationLoop(null) and existing music-test-start gate. Full mode is inert, and the
whole inverse of ONLY dimensions/query/guard equals the original frozen executable. Renderer stopping before
the gate remains authored behavior; it is not an output marker or a measured native stop-field claim.
Both original modes received exactly one native normal button click, with actual isTrusted/userActivation
and matching URL/timeOrigin evidence. Full ready 300×150/null controller → after-click/final 1280×800/fullscreen;
original test ready 480×300/real three-method API → after-click/final 480×300/fullscreen. Original public runner
exit 0 is separate from companion exit 1: BOTH CDP Browser.getBrowserCommandLine queries failed because
--enable-automation was absent. Those failures are retained. Separate native Linux /proc reads of owned
Chrome PIDs 602997 and 603524 (parent runner 602960) found no autoplay-policy/Autoplay-feature override; these
observations are in the orchestration tool transcript, not a successful CDP record or the absent watch file.
The two successful original PNGs were inspected: full is fullscreen sky/HUD covering ALL parent result text;
test shows a fullscreen 480 HUD/dark façade over the left and only right-edge raw-text fragments. They prove
capture/layout state, not recording/action/scene-pixel equivalence. Original full85.299s/test77.483s and
monitor165.030s are descriptive only; unequal horizontal result coverage excludes this pair from qualified
speedup aggregation. No app was rerun merely to hide the policy-query failures or replace those images.
The one final written test uses the normal 1280×800 public-runner parent, new frozen candidate source and
separately versioned companion. Actual ready/click/after/final remains 480×300/test API/no fullscreen;
one same-document trusted click, all 17 PASS/ALL PASS and whole raw 921 bytes equal retained original full.
Actual public runner 0 AND companion 0, 75.212s (independent monitor77.330s). CDP still fails and is explicitly
preserved as diagnostic-only: separate /proc fallback records actual owned Chrome 607130/parent runner 607104,
executable and Chrome's one joined argv plus original caller arguments, with no autoplay override. No flag
was added. The successful written PNG shows all 17 result row/ALL PASS and a final dark façade/HUD/toasts;
no intermediate music/appliance-pixel or controlled timing claim. Its capture observer's intendedMode/file
suffix full means normal 1280 parent; actual URL?test/controller and public summary mode written identify the
real test mode. No absent lazy/full/isTrusted lifecycle fields are invented.
All 247 frozen source paths, each exact fixture and versioned helper hashes match; original four pair helpers
remain untouched. Original raw/summary: `/tmp/runtests-602960/`, original PID/SID/exit, native inputs/finals,
CDP failures and both PNGs: `/tmp/lunden-music851/`. Written raw/summary: `/tmp/runtests-607104/`; guarded source,
OS-policy/input/final identity, runner-versus-companion exits, image and proofs: `/tmp/lunden-music851-written/`.
The existing gate still needs a trusted real click; the reviewed external companion forks the PUBLIC HTML
runner and separately accounts activation/policy failures without rewriting its output or media. Its written
monitor invokes musicintegrationstart-v2.cjs with no --compare; the historical original monitor used --compare.
This completes bounded #851. #834's separate musicreload work was completed later in #852; #740/#736 remain open.

#843 `carsoundtest` retains its entire original 900×600/car/rain/time14/October5 fixture after one complete
actual full/test pair at frozen `7b3a972`. Both modes produced all 13 PASS rows and ALL PASS, but the two
complete 557-byte raw logs differ in three preserved measured rows: outdoors RMS 0.0544 → 0.0547; open-door
RMS 0.0360 versus 0.0544 → 0.0357 versus 0.0547; shut-door RMS remains 0.0025 but relative level is
-26.6 → -26.8 dB. The other ten result rows match exactly, including rain 0.8, openness 1.00/0.000,
gradual cabin gain 0.414 → 0.126, zero cabin rain streaks in 120 frames and mute RMS 0.00000.
Actual independently monitored comparison exit is 1 for DIFFERENT, not a failed fixture assertion.
No normalization, seed, retry, timer/quality/matrix override or source migration was applied; the complete
fixture remains byte-for-byte original. This native result supplies a concrete full-mode disposition,
not an automatic audio/render exception or a proven cause of the small RMS differences.
The fixture-authored Chrome flag `--autoplay-policy=no-user-gesture-required` was forwarded identically
in both launches by the external companion; actual argument lists were recorded. This is specific to
carsound's existing authored environment and supplies no autoplay override for #834/#851/#852 music tests.
Original real AudioContext/AnalyserNode FFT2048, native settling/sampling waits, all door/seat/standUp/mute
and cabin-particle scans remain untouched. Source quality scales the active particle count; these native
observations do not record that count or prove why measured audio differs.
Two actual app-ready records and two final records retain matching URL/timeOrigin identities: full 900×600,
null controller/no fullscreen versus test 480×300 with the real three-method controller API/no fullscreen.
The original unconditional fullscreen suppression is unchanged. Both successful fullPage PNGs were
inspected: all thirteen rows/ALL PASS and the final rainy car/exterior/HUD; no intermediate cabin/door
animation or pixel equivalence claim. Full 143.207s and test 89.882s (monitor 234.084s) include both captures;
these are descriptive samples only and excluded from speedup aggregation because raw parity failed.
All 247 frozen source paths, exact whole fixture and four helper hashes match. Complete logs/summary:
`/tmp/runtests-575769/`; provenance, actual launch arguments, native identities/finals, PID/SID/exit,
cleanup, both PNGs and exact raw diff: `/tmp/lunden-carsound843/`. This completes bounded #843's concrete
disposition; broader #738/#736 remain open.

| #843 fixture | Current disposition |
| --- | --- |
| `carsoundtest.html` | Original full retained after 13 PASS/ALL PASS each but three real RMS/dB raw differences; original authored autoplay flag is identical in both modes. Actual full 900/null versus test 480/real API, no fullscreen; no migration or aggregate speedup claim. |

#844 `curtaintest` is accepted after one complete original 900×600/noon/June21/frozen clear-weather pair at
frozen `06adc19`: all 99 ordered PASS rows and ALL PASS are byte-identical in the complete 5563-byte raw logs,
actual independently monitored exit 0. All current six-room/valance geometry and wall clearance, real panel/actions,
pointer/key/timing, score, daylight/emissive, saved-six-pose real reload, UV/material/glow/transmission predicates
and exact diagnostics remain unchanged. The texture read is `living.tex.image`'s own 2D `getImageData`, not scene
framebuffer pixels; actual print values 69.2% ink / 30.3% white and all repeated loops match without new seed,
clock/wait/timer, pose/matrix, quality, baseline, normalization or assertion edits. The obsolete exclusion comment
now describes the actual own-texture comparison. Final migration changes shared dimensions to 480×300 and appends
test to original URL0 (also inherited by original &r=1 reload), retaining the approved pre-pair testMode-only guard
before FIRST original touch start. Full mode is inert; no second touch or new reload behavior was added.
Each mode really loads TWO documents in the same iframe: four unique child URL/timeOrigin identities at ready,
first-document beforeunload/pagehide observations and final records verify full first ready 900×600/controller null →
native fullscreen 1280×800 at leave, reload ready/final 900×600/no fullscreen. Every test phase is 480×300 with real
controller API/no fullscreen. No absent lazy/full/event-isTrusted fields are claimed.
Both successful fullPage PNGs were inspected: all 99 rows/ALL PASS and final patterned-bedroom curtain/HUD (test
long line near the right edge), not intermediate movement/shadow/framebuffer equivalence. Full 232.442s and test
172.067s include both captures; these are descriptive shared-machine samples pending final #764 timing qualification,
not a controlled benchmark or aggregate speedup claim. All 247 frozen source paths and exact guarded fixture/helper
hashes match. Raw logs/summary: `/tmp/runtests-557057/`; source/provenance, native ready/navigation/final phases,
independent PID/SID/exit and both PNGs: `/tmp/lunden-curtains844/curtain-*` and `curtaintest-*`.
This completes bounded #844; broader #738/#736 remain open.

| #844 fixture | Current disposition |
| --- | --- |
| `curtaintest.html` | Migrated after 99 complete identical PASS rows; own 2D print and every current reload/state/interaction assertion preserved. Actual full first 900→nativeFS1280, reload 900/noFS versus test 480/realAPI/noFS; no intermediate scene-pixel claim. |

#835 calendar retains original 900×600/plain-index setup and the whole current assertion body after one complete
original full/test pair at frozen `e4c0feb`. Both modes produced 13 PASS rows and ALL PASS, but exact comparison
is DIFFERENT, actual independent exit 1. Only raw result rows 1 and 4 differ:

| Result | Full | Test |
| --- | --- | --- |
| Browser time/date | `PASS starts at the browser's time and date (03:19, 13/10)` | `PASS starts at the browser's time and date (03:22, 13/10)` |
| Chosen date preserves time | `PASS 21 June chosen, the time unchanged (03:19)` | `PASS 21 June chosen, the time unchanged (03:22)` |

The other 11 rows and terminal verdict match, including original panel/key/date/sun/midnight/close checks; no
functional assertion failed. Real date/clock values were preserved without seed, clock/date/angle normalization,
wait, quality, matrix, baseline or assertion changes. The approved compare-only testMode fullscreen guard was
removed; this keeps the ORIGINAL full setup, not the old unverified 480×300/test default from `9645849`.
One actual child document per mode at ready/final, with matching URL/timeOrigin, proves full 900×600/controller
null versus test 480×300/real controller API, both without fullscreen. Full screenshot failed after 60,000ms,
with error retained and no full PNG; only test PNG was inspected (13 rows vertically, a long sun row cropped at
the right edge, final dark calendar/kitchen scene). No full-image review or visual full/test equivalence is claimed.
Full 151.360s / test 86.420s include capture attempts, descriptive only and excluded from timing aggregation;
no extra replacement app load or retry was run. All 247 frozen source paths and exact guarded fixture/helper
hashes match. Raw logs/summary: `/tmp/runtests-530119/`; original/frozen source proof, native ready/final phases,
independent PID/SID/exit, test image and full capture error: `/tmp/lunden-clocks835/calendar-*` and `calendartest-*`.
This is a blocked live-row migration disposition, not a rendering exemption or fixed product defect. Clock acceptance
follows; the bounded #835 scope is complete, while broader #738/#736 remain open.

| #835 fixture | Current disposition |
| --- | --- |
| `calendartest.html` | Original full retained; complete 13 PASS per mode with two live-clock raw differences, actual compare exit 1. |
| `clocktest.html` | Qualified logical acceptance: all 18 ordered PASS rows and ALL PASS byte-identical, native original900→fullscreen1280/null versus test480/real API/no fullscreen. Full capture failed, test-only image, timings excluded; details below. |

#835 clock has qualified logical acceptance after one complete original 900×600/time=7 pair at frozen `a48c856`:
all 18 ordered PASS rows and ALL PASS are byte-identical in the complete 719-byte raw logs, actual independent exit 0.
All original hand-snapshot/date, action/panel/no-walking, pace/pause, pointer/key spool, sun/info and close predicates
and diagnostic values remain unchanged. This sample's hands are 7.000/7.000 and minutes 0.000/0.000; no clock,
date/angle normalization, extra seed/wait/timer, matrix, quality, baseline or assertion change was made, and no
future loading-time invariance is claimed. The approved pre-pair testMode-only fullscreen guard remains AFTER
the original hand snapshot and BEFORE the original touch start, inert in full mode. Final migration changes only
iframe dimensions to 480×300 and appends test to the original time=7 query, retaining that guard.
Two distinct child document identities at actual ready/final, with matching URL/timeOrigin, prove one load per mode:
full ready 900×600/controller null/no fullscreen → final native fullscreen 1280×800; test ready/final 480×300 with
real controller API/no fullscreen. The observer records those values; no absent lazy/full/event-isTrusted fields are inferred.
Full screenshot failed after 60,000ms, error retained and no full PNG; only test PNG was inspected (all 18 rows
vertically and clock-wall/HUD scene, long result row cropped at the right edge). The screenshot error's font-log
text establishes no cause. There is no full-image review or visual full/test-equivalence claim and no replacement app run.
Full 131.764s / test 96.255s include capture attempts, descriptive only; unequal captures exclude qualified timing
aggregation. All 247 frozen source paths and exact guarded fixture/helper hashes match. Raw logs/summary:
`/tmp/runtests-543909/`; source/provenance, actual ready/final phases, independent PID/SID/exit, test PNG and full
capture error: `/tmp/lunden-clocks835/clock-*` and `clocktest-*`.
The bounded #835 scope is complete: calendar keeps original 900×600/plain current body after 13 PASS per mode
with two live-clock raw differences, clock has 18 exact logical PASS rows with full capture missing. This does not
claim both migrated, visual equivalence or a speedup; #738/#736 remain open.

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

#810 initially retained the original full-mode 900×600/noquery `booktest` fixture, byte-identical to that HEAD after
removing the approved compare-only testMode fullscreen guard. One complete original full/test pair at frozen
`570f8b8` is DIFFERENT: full 12 PASS / ALL PASS versus test 10 PASS + `FAIL taken again ("(hidden)")` and
`FAIL back on the side table` / SOME FAILED. All 12 checks executed; the first ten raw rows match, including
placement y0.485. The full helper offered “Ta boken” at re-take, while the test action was hidden. Separate open
bug #846 preserved this observation; that pair alone did not isolate the cause because test flag and 480×300 changed together.
The original aim's `scene.updateMatrixWorld(true)` and `book.where()` world-position read remain unchanged;
source inspection does not establish a missing-matrix cause. No query/dimension migration, override, normalization,
assertion weakening, baseline masking or retry was made. This is a functional comparison blocker, not an invented
rendering exclusion or a successful speedup sample. Full 130.742s, test 81.510s, actual independent monitor exit 1.
Both app-ready and final native phases proved actual full 900×600/null controller/no fullscreen and test
480×300/real controller API/no fullscreen, with their own genuine child URL/timeOrigin. Both fullPage PNGs were
inspected: raw outcomes/living room capture, not a read-spread or pixel-equivalence claim; times include captures.
All 247 runtime hashes and the exact guarded fixture matched the frozen pair. Raw logs/summary:
`/tmp/runtests-422743/`; source/provenance, native load/final data, PID/SID/exit, helpers and images:
`/tmp/lunden-codes810/book-*` and `booktest-*`. The later #846 follow-up below resolves the matrix-restoration bug.

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
The bounded #810 comparison scope is complete: cheat 50 PASS and crouch 13 PASS were accepted; book initially retained
its original full fixture after 12 PASS versus 10 PASS + two FAIL. The later #846 source fix and current comparison follow below.
This is not an all-green batch or closure of the broader #738/#736 migration work.


#807 historical beer-object comparison retained the original full-mode loader and dedicated `?shots` path.
The current #841 fix and complete accepted comparison below supersede that blocked disposition.
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
and `beertest-*`. No errors were observed in this capture or page execution; #841's later beer-can fix is documented below.

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

All four original #807 dispositions were recorded: shelf/beer/bottle accepted logical migrations, beer-can
retained with interrupted persistence checks. That red pair remains excluded from successful timing aggregation.
The later #841 fix and complete native comparison below supersede the blocked beer-can disposition; broader
#738/#736 remain open. No all-green claim is made for the original historical batch.


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

## Escape and native routes comparison (#819, partial)

`esctest` is migrated by changing only iframe query/dimensions. On frozen
`30ba542`, `/tmp/runtests-463514/` contains complete byte-identical raw logs:
five ordered PASS and ALL PASS per mode, zero FAIL/pageerrors, independently
monitored actual exit 0. Ready and final native snapshots verify one actual main
document per mode, original 900×600/null controller versus 480×300/real test
controller APIs, same URL/timeOrigin within each pass and no fullscreen.
All authored DOM actions, synthetic Escape, pointer-lock request wrapper and
arm.click are preserved: this is no OS-keyboard or native pointer-lock grant proof.
Wall 100.864s → 78.177s includes two saved/inspected fullPage captures showing
final courtyard/HUD and result text; raw logs retain every complete long row.
No rendered-scene equivalence is claimed. Frozen source/helper hashes, native
phases and independent PID/SID/PGID/exit are retained in
`/tmp/lunden-routes819/esctest/`. The garage comparison is completed below;
#739/#736 stay open.

## Entry and east geometry: entrance plants acceptance (#818, partial)

At frozen runtime `e66690b`, one complete published jobs1 pair preserved the whole
original fixture: no authored iframe dimensions, phone/shot/cloud-empty query,
unconditional fullscreen suppression, setAnimationLoop(null), DPR .15 and
setSize(180,120,false). These authored renderer calls remain unchanged; they
do not prove every animation loop stopped or add wind/physical-phone coverage.
Viewport and requested renderer size are separate quantities.

Both complete raw logs are byte-identical (968 bytes, 15 PASS, 0 FAIL, ALL PASS),
including 10 plants on each level, all native leaf/base/door/lane bounds, shared
mesh geometry, both walking directions, ground/loft pot collisions and the real
front-door passage. The independent monitor exited 0 and runner modes were
verified, without raw pageerrors. Original app-ready/final viewport was actually
300×150/controller false, not merely a source default estimate; test ready/final
was 480×300 with native draw/setFull/wantsFrame functions, lazy/full false.
Neither entered fullscreen. Unique URL/timeOrigin identities matched, with no
observer errors or transport warnings; both final cloud URLs were empty.

Elapsed full/test times were 89.626/74.245 seconds including successful final
captures, a single uncontrolled sample. Both images were saved and reviewed.
Full shows all result rows and HUD over blank sky; test shows all result rows
vertically with long text clipped horizontally and only a cropped HUD below.
Neither demonstrates plant artwork or rendered-scene/pixel equivalence. Complete
logs/summary: `/tmp/runtests-467497/`; frozen runtime/helper hashes, native phases,
actual exit and images: `/tmp/lunden-entry818/entranceplantstest/`. All frozen
source blobs matched after the pair.

The written fixture now explicitly uses 480×300/test; all native predicates and
authored renderer calls are intact. Reversing only dimensions/query/descriptive
comment exactly recreates the frozen original. Gable remains pending under
#818; #739/#736 stay open.

## Fall, landing and complete routes acceptance (#819, partial)

`falltest` is migrated by changing only iframe query/dimensions. On frozen
`8e27302`, `/tmp/runtests-468971/` has complete byte-identical raw logs: all 27
ordered PASS and ALL PASS in each mode, zero FAIL/pageerrors, independently
monitored actual exit 0. Every original numeric landing/damage/wake diagnostic,
conditional up/down stair route (including east/park/NW), ramp, crouch, bunk and
resume check remains unchanged, with no skipped path, normalization or new seed.
Ready/final native evidence verifies one actual document per mode, original
900×600/null controller versus 480×300/real test APIs, no fullscreen and stable
URL/timeOrigin within each pass. The authored pointerLockElement getter and
synthetic pointerlockchange are retained simulations, not a native pointer-lock
grant. Wall 170.288s → 91.162s includes both saved/inspected fullPage images with
complete output and final hall view; intermediate fall-cover pixels or rendered
scene equivalence are not claimed. Frozen source/helper hashes, native phases
and genuine PID/SID/PGID/exit: `/tmp/lunden-routes819/falltest/`. The garage
comparison is completed below; #739/#736 remain open.

## Entry and east geometry: gable acceptance (#818)

One complete published jobs1 pair at frozen runtime `85d4672` used the whole
original 400×300 and `?time=12&month=6` query, with no pre-pair edits or fullscreen
guard. It preserved every native opening tag/end-flat/storey/slab/wall-boundary/
drum-distance assertion and the existing hidden-opening/escape-stair cases.
There was no added shot/cloud parameter, matrix update, seed or normalization.

Both entire raw logs are byte-identical (4017 bytes, 40 PASS, 0 FAIL, ALL PASS),
including all measured heights, wall extents and drum distances. Runner modes
were verified and the independent monitor exited 0, without raw pageerrors.
Full app-ready/retained final stayed 400×300/controller false; test ready/final
stayed 480×300 with genuine draw/setFull/wantsFrame APIs, lazy/full false.
Neither entered fullscreen. Unique URL/timeOrigin identities matched, with no
observer errors or transport warnings; both final cloud URLs were empty.

Elapsed full/test times were 64.132/71.929 seconds including capture overhead;
the test sample was slower. Both final screenshots timed out after 10 seconds,
so there is no PNG or gable/scene visual-equivalence evidence. This pair is
excluded from speedup aggregation. Complete logs/summary: `/tmp/runtests-472999/`;
frozen runtime/helper hashes, native phases, actual exit and capture errors:
`/tmp/lunden-entry818/gabletest/`. All frozen source blobs matched after the pair.

The written gable fixture now uses width 480/test; reversing only width/query
reproduces the exact frozen original, with all executable assertions intact.
All three #818 default dispositions have actual complete ordered acceptance:
east 46 rows, entrance plants 15, gable 40. EAST's optional top `?lowmem` app
branch remains original 720×480/full and unexecuted by its default pair; its
authored explicit FULL/LITE builder comparison is preserved and was executed.
Capture limitations remain separate from native logical acceptance. Parents
#739/#736 stay open.

## Garage complete native state acceptance (#819)

`garagetest` is migrated by changing only query/dimensions. Its original
800×500/time=12/month=6/weather=rain and unconditional fullscreen suppression
were preserved in the complete comparison at frozen `37306f8`. All current
51 geometry/doors/walking/car/sensor/light/rain/escape/canvas/material predicates
and numeric diagnostics remain untouched, including actual quality-coupled
particle state: no seed, quality, matrix, timer, wait or normalization change.
`/tmp/runtests-474447/` has complete byte-identical logs, 51 ordered PASS and
ALL PASS in each mode, zero FAIL/pageerrors and independently monitored exit 0.
Ready/final native snapshots verify one actual main document per mode with stable
URL/timeOrigin, full 800×500/null controller versus 480×300/real test APIs,
neither fullscreen. Wall 190.733s → 119.878s includes both saved/inspected
fullPage images: result text plus final rainy patio/HUD. Long row completeness
is established by raw logs, not the image's visible width; no intermediate garage
visual inspection or rendered-scene equivalence is claimed. Frozen hashes,
native phases and genuine PID/SID/PGID/exit:
`/tmp/lunden-routes819/garagetest/`.

All three #819 fixtures now have complete unchanged-predicate native full/test
acceptance: ESC 5, fall 27 and garage 51 ordered PASS per mode. The bounded batch
is complete; broader #739/#736 remain open.


## Kitten exception output protocol (#848)

The original `kittentest.html` unhandled-rejection reason and stack are retained
verbatim, followed by `FAIL unhandled rejection` and `SOME FAILED`. The existing
public runner can finish and classify this path as failure. No normal-path
assertions, actions, geometry, seeds, queries, viewport or runner code changed.
Five native Chrome DOM cases dispatched genuine unhandled rejections (Error,
string, null, undefined and an error containing an ALL PASS line); the actual
runner parser/classifier reported FAIL in every case, with original output intact.
Artifacts: `/tmp/lunden-protocol848/native-dom.json`. This isolated protocol
verification loads no apartment renderer and makes no kitten gameplay, full/test
parity, screenshot or timing claim. The complete #822 comparison remains separate.

## Hall care and keys: hall-care acceptance (#821)

One complete published jobs1 pair at frozen runtime `f109e19` used the whole
original 480×300 fixture: life/shot/cloud-empty first load, then the two authored
shot/cloud-empty/noon loads for reload and reset. Original fullscreen suppression,
DPR .15, matrix updates, fallback actions and resetHome.go stub were unchanged.
No new seed, normalization, baseline, quality override or assertion was added.

Both complete raw logs are byte-identical (1733 bytes, 24 PASS, 0 FAIL, ALL PASS),
including native crouched touch/floor bounds, hook/shelf/wardrobe occupancy,
wrong/full-target refusal, original item identities, reload and real reset.
All six app-ready documents, eight beforeunload/pagehide snapshots and two
retained final snapshots stayed 480×300 without fullscreen; same-URL reloads
were distinguished by their native timeOrigins. Full controllers were false;
every test document had real draw/setFull/wantsFrame APIs, lazy/full false.
Earlier runner null controller records remain explicit, completed by passive
native evidence. There were no observer errors/warnings or raw pageerrors;
all native cloud URLs were empty. Runner modes were verified and the independent
monitor exited 0.

Elapsed full/test times were 249.236/206.070 seconds including successful final
captures, a single uncontrolled sample. Read-only capture timeout was set to
60 seconds for both modes before freezing; no old artifacts or fixture output
were changed. Both images were saved/reviewed: full contains all 24 text rows,
ALL PASS and courtyard/HUD; test is cropped top text with later rows/verdict
and scene below the image. Neither visually demonstrates the hall-item actions
or rendered-scene equivalence. This differently cropped pair is excluded from
qualified timing aggregation. Complete logs/summary: `/tmp/runtests-480283/`;
frozen runtime/helper hashes, native phases, actual exit and images:
`/tmp/lunden-hall821/hallcaretest/`. All frozen source blobs matched after the pair.

Written hall-care now adds test only in the shared load query; all original
queries/480×300/branches/assertions remain intact. Reversing only that prefix
and descriptive comment recreates the exact frozen original. Hall-task and key
acceptance is documented below; #739/#736 stay open.

## Jump-on complete native platform acceptance (#822, partial)

`jumpontest` is migrated by changing only iframe query/dimensions after its
original 900×600/shot/time=12/month=6/freeze pair at frozen `664ff82`.
`/tmp/runtests-484199/` retains entire byte-identical raw logs: all 35 ordered
PASS, the complete unnormalized `info furniture` object, numeric/duplicate/
conditional platform and furniture diagnostics, and ALL PASS; no FAIL/pageerrors,
independently monitored actual exit 0. All original action/geometry/landing/
apex/table/wall checks and authored pointerLockElement getter/synthetic
pointerlockchange remain untouched; no native input grant is claimed.
Passive ready/final evidence verifies one actual main document per mode, full
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
URL/timeOrigin identity and no fullscreen. Wall 147.180s → 103.016s includes
both saved/inspected viewport captures: full shows result text and a partial
final canvas, with long rows cropped at the right; test shows only the top
roughly eighteen result rows, clipped at the right and bottom, without the final
verdict or scene. This pair is excluded from speedup aggregation because capture
coverage is asymmetrical. Complete row/diagnostic proof
comes from raw logs, not image coverage; no platform-scene or pixel equivalence
is claimed. Frozen source/helper hashes, native snapshots and genuine monitor
PID/SID/exit: `/tmp/lunden-flight822/jumpontest/`. Jetpack and kitten final
dispositions are recorded below. #739/#736 remain open. Kitten's legitimate error-writer
protocol fix #848 is preserved separately from the approved pre-pair testMode-only
fullscreen guard and unchanged authored random/seed behavior.

## Hall care and keys: hall-task acceptance (#821)

One complete published jobs1 pair at frozen runtime `fa20d4b` preserved the whole
original 640×400/shared shot/cloud-empty/noon loader, all six actual main loads
and three authored about:blank transitions per mode. Native storage writes after
blank, focus/touch/task-card actions, completion bonus, refills, pre-#594 records
and inventory audit all remained intact. Original fullscreen suppression and
DPR .15 were unchanged, with no new seed, normalization, quality/matrix override
or added wait.

Both entire raw logs are byte-identical (1127 bytes, 17 PASS, 0 FAIL, ALL PASS).
All twelve app-ready documents have distinct native timeOrigins and matched
URLs; twenty beforeunload/pagehide snapshots and two retained final snapshots
match those document identities. Full phases were 640×400/controller false;
test phases were 480×300 with genuine
draw/setFull/wantsFrame APIs, lazy/full false. Neither mode entered fullscreen;
all cloud URLs were empty. Same-URL reloads were not mistaken for earlier
documents. Six blank transitions were separately observed after main documents,
without app/controller/timeOrigin claims for blank pages. Earlier runner null
controller records remain explicit, completed by passive native evidence. There
were no observer errors/warnings or raw pageerrors; runner modes were verified
and the independent monitor exited 0.

Elapsed full/test times were 452.636/386.015 seconds including successful final
captures, a single uncontrolled sample. Capture timeout was 60 seconds in both
modes before freezing. Both images were saved/reviewed: full has all 17 rows,
ALL PASS and final kitchen/HUD; test has all rows/verdict vertically, long text
clipped on the right and only a tiny frame edge below. Neither establishes the
intermediate task-card/hall-item visuals or rendered-scene equivalence. This
differently cropped pair is excluded from qualified timing aggregation. Complete
logs/summary: `/tmp/runtests-488125/`; frozen runtime/helper hashes, all native
phases/blank transitions, actual exit and images:
`/tmp/lunden-hall821/halltasktest/`. All frozen source blobs matched after the pair.

Written hall-task now uses 480×300/test in the existing shared loader. Reversing
only dimensions/query/descriptive comment recreates the exact frozen original;
all actions, predicates and authored storage records remain unchanged. Key
acceptance is documented below; #739/#736 stay open.

## Jetpack complete native flight acceptance (#822, partial)

`jetpacktest` is migrated by changing only query/dimensions after original
900×600/shot/time=12/month=6/freeze at frozen `a4b6e17`.
`/tmp/runtests-493799/` retains complete byte-identical raw logs: all 37 ordered
PASS and ALL PASS, zero FAIL/pageerrors, independently monitored actual exit 0.
Every flight/garage/portik/roof/wall/heat/flame/keep-world/touch predicate and
numeric row, including original F/portik and full landing JSON, stays unchanged.
The authored pointerLock getter, synthetic change/keys/touch inputs are retained;
no native OS-input or pointer-lock grant proof is claimed. Native ready/final
records verify one actual main document per mode with stable URL/timeOrigin,
full 900×600/null controller versus 480×300/real test APIs, no fullscreen.
Wall 129.351s → 84.154s includes both saved/inspected viewport captures. Full
shows all vertical rows, long rows clipped at the right, ALL PASS and partial
final facade/HUD; test shows only approximately the top eighteen result rows,
clipped at the right/bottom, with no final verdict or scene. Raw logs prove every
complete diagnostic; no intermediate flight/flame or rendered-pixel equivalence
is claimed. This pair is excluded from speedup aggregation because capture
coverage differs. Frozen source/helper hashes, native snapshots and genuine
monitor PID/SID/exit: `/tmp/lunden-flight822/jetpacktest/`. Kitten final
disposition is recorded below; #739/#736 remain open.

## Hall care and keys: key acceptance (#821)

One complete published jobs1 pair at frozen runtime `3c5bfe9` preserved the
original 900×600/plain-index setup and every cabinet/key/car/garage/asphalt/
collision/DetailCuller-layer predicate and raw diagnostic. Only the reviewed
actual-testMode fullscreen guard preceded the original touch; the guard had no
effect in full mode. There was no quality/matrix/seed/wait/normalization or assertion change.
The layer/cut checks were judged from actual outcomes, without an automatic
renderer exemption.

Both complete raw logs are byte-identical (1301 bytes, 21 PASS, 0 FAIL, ALL PASS),
including 3667 arriving frames, 3357 leaving frames, 45 car meshes, zero hidden
of 69345 arriving/street checks and zero hidden of 67500 leaving checks. Cabinet
access/LED/beeps, native garage-door passage, asphalt/collision/parked positions
and the second street call all completed unchanged. Runner modes were verified
and the independent monitor exited 0, without raw pageerrors.

Full app-ready was authored 900×600/controller false/no fullscreen; the same
document's retained final was native fullscreen 1280×800. Test ready/final stayed
480×300/no fullscreen with genuine draw/setFull/wantsFrame APIs, lazy/full false.
Both unique native URL/timeOrigin identities matched; no observer errors or
transport warnings, and both cloud URLs were empty.

Elapsed full/test times were 120.204/105.717 seconds including successful final
captures, a single uncontrolled sample. Capture timeout was 60 seconds in both
modes before freezing. Both images were saved/reviewed: full is the native
fullscreen outdoor night scene/HUD with no fixture result text; test is cropped
top result text, later rows/scene below the image. Neither proves intermediate
key-cabinet/car-mesh visuals or rendered-scene equivalence. Capture asymmetry
excludes this pair from qualified timing aggregation. Complete logs/summary:
`/tmp/runtests-497881/`; frozen runtime/helper hashes, native phases, actual exit
and images: `/tmp/lunden-hall821/keytest/`. All frozen source blobs matched after
the pair.

Written key now uses 480×300/test and retains the reviewed mode-only fullscreen
guard. Reversing only dimensions/query recreates the exact frozen guarded
fixture, with all executable predicates intact. All three #821 dispositions are
complete: hall-care 24, hall-task 17 and key 21 exact ordered PASS rows per mode,
including the authored reload/reset/blank/storage flows and complete diagnostic
rows. Capture
limitations remain separate from native logical acceptance. #739/#736 stay open.

## Kitten complete raw-difference disposition (#822, final)

`kittentest` retains its whole current original 900×600/plain-index full setup,
including the legitimate #848 exception-writer correction. The approved pre-pair
testMode-only fullscreen guard has been removed; fixture bytes are exactly HEAD.
On frozen `618bf33` plus the guard, `/tmp/runtests-500047/` completed both modes:
16 ordered PASS and ALL PASS in each, zero FAIL/pageerrors. Exact raw comparison
is DIFFERENT and the independent monitor exited 1: only row 2 differs in native
cat name/breed/score/badge (full Lilla Ebba/siames/+342.0/ordinary-cat badge versus
test Smulis/perser/+412.0/rare-cat badge), and row 12 differs in its photo name.
The other fourteen PASS rows are exact, including authored seed2024 draw, play
loops, geometry, petting, cup and hurt diagnostics; no predicate or seed changed.
Original temporary cat.rand-pounce behavior remains untouched. This pair proves
no fixed cause or product failure; no retry, normalization or migration was made.

Two native ready and two final records verify one actual app document per mode:
full starts at authored 900×600/null controller, then original touch requests
native fullscreen with final 1280×800; test remains 480×300/real test APIs without
fullscreen. URLs/timeOrigins match within each pass. Wall 136.067s/95.962s
includes both saved/inspected captures and is excluded from speedup aggregation
because raw results differ and capture coverage is asymmetrical. Full image is
the native fullscreen night living-room/table/rug/HUD without parent results or
cat; test shows all sixteen vertical rows/ALL PASS with long text cropped right
and only a thin canvas edge. No cat/action-scene or rendered-pixel equivalence
is claimed. Current/frozen fixture and helper hashes, complete raw differences,
actual native phases and genuine monitor PID/SID/exit:
`/tmp/lunden-flight822/kittentest/`.

All three bounded #822 dispositions are complete: jump-on 35 and jetpack 37
identical PASS rows accepted; kitten retains original full after two distinct
but individually passing complete results. #739/#736 remain open.

## Life simulation and lift: lift acceptance (#824)

One complete published jobs1 pair at frozen runtime `d12b74d` used the whole
original 800×500 and exact time12/month6 query, with no shot/cloud/freeze additions
or pre-pair edits. Original unconditional fullscreen suppression and every
native door/panel/lit-state/collision/lift/stair/ride-count predicate remained
unchanged. The authored lift.loadState mid-ride operation restores a native
state record; its raw "reload mid-ride" label does not mean another app load.

Both entire raw logs are byte-identical (1129 bytes, 24 PASS, 0 FAIL, ALL PASS),
including all measured positions/heights/door states, zero falls and ride-floor
keys v0/v3. There was one actual app-ready document and matching retained final
per mode: full 800×500/controller false, test 480×300 with genuine draw/setFull/
wantsFrame APIs, lazy/full false. Neither entered fullscreen; native URL/
timeOrigin identities matched without observer errors/warnings. Both cloud URLs
were empty. Runner modes were verified and the independent monitor exited 0,
without raw pageerrors.

Elapsed full/test times were 137.890/89.181 seconds including successful final
captures, a single uncontrolled sample. Capture timeout was 60 seconds in both
modes before freezing. Both images were saved/reviewed: full shows all 24 rows/
ALL PASS and a cropped final stair-wall/HUD view; test shows cropped top text
with later checks and scene below the image. Neither demonstrates every
intermediate door/ride/stair visual or rendered-scene equivalence. Capture
asymmetry excludes the pair from qualified timing aggregation. Complete logs/
summary: `/tmp/runtests-509679/`; frozen runtime/helper hashes, native phases,
actual exit and images: `/tmp/lunden-life824/lifttest/`. All frozen source blobs
matched after the pair.

Written lift now uses 480×300/test; reversing only dimensions/query reproduces
the exact frozen original with all executable predicates intact. LIFE3 and LIFE
actual dispositions are documented below with whole default flows and original
source filters preserved. #739/#736 stay open.

## Drawing complete native pixel-count disposition (#825)

`drawtest` retains its whole current original 900×600/plain-index full setup and
executable, including the existing audit comment; approved pre-pair testMode-only
fullscreen guard removed, fixture bytes exactly HEAD. On frozen `1c9f120` plus
the guard, `/tmp/runtests-511316/` completed both modes with 8 ordered PASS and
ALL PASS, zero FAIL/pageerrors. Exact comparison is DIFFERENT and the independent
monitor exited 1: only row 5 differs, 393 versus 379 actual red pixels; all other
seven rows are exact. The original own 840×594 paper canvas/getImageData,
normalized synthetic pointer path, CSS-rect/camera-raycast mapping, crayon
Math.random alpha/radius/scatter, ink/state/clear/camera-return and local storage
checks remain untouched. No new seed, normalization, retry or cause/product-failure
claim is made; sampling its own 2D canvas does not establish a generic renderer
exemption or rendered-scene equivalence.

Two actual ready and two final native records verify one app document per mode,
full 900×600/null controller versus test 480×300/real draw/setFull/wantsFrame APIs,
no fullscreen and stable URL/timeOrigin identity. Wall 154.452s/83.204s includes
both saved/inspected viewport captures and is excluded from speedup aggregation
because raw results differ and image coverage is asymmetrical. Full shows all
results and final desk/room/HUD; test shows all eight vertical rows/ALL PASS but
only the upper canvas strip. Neither image proves the intermediate paper-pixel
count or action-pixel equivalence; raw predicates retain those native measurements.
Frozen source/helper hashes, complete raw difference, native phases and genuine
setsid/Popen/wait PID/SID/exit: `/tmp/lunden-draw825/`. This bounded disposition
is complete; #739/#736 remain open.


## Book placement and low-quality follow-up (#846)

The original guarded 900×600/plain-index fixture reproduced both old failures at
`d95eede`: full 12 PASS versus test 10 PASS/2 FAIL, actual exit 1. Passive native
observations preserved original step/use/raycast calls and recorded their actual
results. The first placement preview's restPose temporarily detached the model
and measured it at the origin, then restored local pose/parent without restoring
world matrices. At original steps 12–16 its four mesh matrices still described
the origin. Quality 0's detail distances hid those meshes on layer 7; the unchanged
camera let the cached hidden state persist even after the fixture's original
scene-matrix update. The focus ray on layer 0 returned no book hit. Full quality
3 kept the same meshes on layer 0 and hit the book at 1.5388 m. This is a measured
state sequence, not an inference solely from the simultaneous flag/viewport change.

restPose now updates the model's world matrices after restoring its parent/pose.
No quality override, culling threshold, ray layer, wait, seed or assertion changed.
A fresh current pair at `eef495a` plus this fix/changelog 702 used the exact same
guarded original fixture and observers. Both complete logs are byte-identical:
371 bytes, 12 PASS/ALL PASS, zero FAIL, actual monitor exit 0. Native observations
show restored held-world coordinates instead of the origin, all four meshes on
layer 0 and the actual “Ta boken” focus at the original retake action in both modes.
Each mode had one actual document: full ready 900×600/null controller, native
fullscreen 1280×800 at final; test 480×300 with real draw/setFull/wantsFrame APIs,
lazy/full false and no fullscreen. URL/timeOrigin identities remain stable.

Both PNGs were inspected: full native fullscreen shows sky/HUD without parent
results; test shows all twelve results/ALL PASS and the final room/table view.
Neither proves intermediate reading-spread/table pixels or scene equivalence.
Instrumented wall times 92.493/82.174 seconds include captures; diagnostic and
capture asymmetry exclude them from qualified timing aggregation. Original red
evidence remains `/tmp/runtests-519443/` and `/tmp/lunden-book846/`; fixed current
logs are `/tmp/runtests-521617/`, with native states, frozen hashes, actual exit,
images and semantic-only changelog formatting proof in `/tmp/lunden-book846-fixed/`.
All 229 frozen source paths matched before final setup/formatting edits.

Written booktest now uses 480×300/test with the approved pre-pair fullscreen guard.
Reversing only its query/dimensions exactly reproduces the tested guarded original;
all twelve executable predicates and original scene updates remain intact. The
changelog's original compact format was restored with identical parsed tested data.
The old #810 blocked disposition is superseded by this actual current comparison;
#738/#736 remain open.

## Life simulation and lift: LIFE3 disposition (#824)

One complete published jobs1 default pair at frozen runtime `945e95a` preserved
the whole original 900×600, all five sections/six apps and original removals.
The original only-filter remains; no filtered shortcut was used. All native
random crumbs/dust, dock/vacuum/wall/floor/cat/cloth/bin-conservation/status-bar
predicates and diagnostics were unchanged. The temporary mode-only fullscreen
guard was removed after the non-identical pair; the complete written fixture
again matches its original full executable byte-for-byte.

Both modes completed all 68 ordered result rows: full67 PASS/1 FAIL/SOME FAILED,
test68 PASS/0 FAIL/ALL PASS. No section exception or short-circuit occurred; later
sections completed and all six apps were removed. Exact differences were:

| Ordered row | Full | Test |
| --- | --- | --- |
| 6 | `PASS a cut: crumbs beside the board on the worktop (worktop 5.02,2.25)` | `PASS a cut: crumbs beside the board on the worktop (worktop 5.23,1.98)` |
| 10 | `FAIL dust on the floors near the walls, where you reach (32 spots on 2 floors)` | `PASS dust on the floors near the walls, where you reach (32 spots on 2 floors)` |
| 11 | Passing raw per-room JSON dictionary, 13 room/floor keys | Passing raw per-room JSON dictionary, 11 room/floor keys; complete unchanged dictionaries retained in both logs and acceptance artifact |

Independent bug #849 records the native dust predicate failure with unknown
cause; this pair does not identify which floor/room/free-space/wall conjunct or
random state failed, or establish a quality/viewport cause. No seed, tolerance,
normalization, retry or baseline masking was added. Both runner modes were
verified; the independent monitor exited 1, with no raw pageerrors.

All twelve app-ready documents have distinct native timeOrigins and matched
URLs: full ready900×600/controller false, test ready480×300 with genuine
draw/setFull/wantsFrame APIs, lazy/full false. Twelve trusted pagehide snapshots
confirm original removals: full first leaves900×600/no fullscreen, other five
leave1280×800/native fullscreen; all test leaves480×300/no fullscreen. Final
retained frames are empty in both modes. Initial runner null-controller records
remain explicit, completed by native evidence, without observer errors/warnings.
All cloud URLs were empty; five life/shot plus one mess0 load per mode completed.

Elapsed full/test times were 362.702/390.156 seconds including successful final
captures, with a 60-second capture bound in both modes. Test was slower. Both
images were saved/reviewed: full cropped textual results include the dust FAIL;
test cropped top text includes its corresponding PASS. Later rows/verdicts are
below both viewport images; no app scene is retained. No dust/vacuum/cloth visual
equivalence or qualified timing aggregation is claimed. Complete logs/summary:
`/tmp/runtests-523326/`; frozen source/helper hashes, native phases, complete raw
diffs, actual exit and images: `/tmp/lunden-life824/life3test/`. All frozen source
blobs matched after the pair. LIFE disposition is documented below; subsequent
#849 native component proof and complete product verification are documented
separately below, without identifying this old failed spot. #739/#736 remain open.

## Tape measure complete native acceptance (#826, partial)

`measuretest` is migrated by changing query/dimensions and retaining the approved
pre-pair testMode-only fullscreen suppression before original touch, full-false
behavior unchanged. On frozen `945e95a` (current holdable fix/changelog702 included)
plus the guard, `/tmp/runtests-527971/` has complete byte-identical raw logs:
three ordered PASS and ALL PASS in each mode, zero FAIL/pageerrors, independently
monitored actual exit 0. Original center-ray geometry, matrices, exact 5.349 m
readout, `5,35 m` DOM label and third-clear action/predicates remain unchanged;
no native OS-touch/input grant or renderer-pixel equivalence is claimed.
Two actual ready and two final snapshots verify one app document per mode,
original 900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
no fullscreen, empty cloud URL and matching URL/timeOrigin identities.
Wall 163.185s → 78.950s includes two saved/inspected viewport captures: full shows
all three result rows/ALL PASS and final living-room/HUD; test shows all results
but only an upper canvas strip. No intermediate measuring-line or label-pixel
inspection is claimed. This pair is excluded from speedup aggregation because
capture coverage differs. Frozen current/guarded fixture/helper hashes, complete
raw/native records and genuine setsid/Popen/wait PID/SID/exit:
`/tmp/lunden-measure826/measuretest/`. Miele and milk acceptance follow below;
#740/#736 remain open. No shorter `only=fireworks` Miele result will substitute
for its full default action/rarity/photo flow.

## Life simulation and lift: LIFE disposition (#824)

One complete published jobs1 default pair at frozen runtime `a48c856` preserved
the whole original 900×600, all nine M1 sections, two-load own-home session-resume
flow and separate two-load persistence flow: thirteen actual apps per mode.
All stock/tool loops, actions/reasons, carrying/mass balance, geometry/material/
layers, score/events/audits and original storage/Date.now/world records remained
unchanged. Native life.load/keep-record restoration is not another app reload;
the authored remove/new-load flows are actual apps. There was no seed, clock/
normalization, quality/matrix, wait or cleanup override.

The whole raw logs are byte-identical (7566 bytes), but both are red:133 ordered
result rows =132 PASS/1 FAIL/SOME FAILED. Exact row7 is
`FAIL eggCarton: in fridge slot 2, 6 count`. Terminal verdict and trailing blank
are not result rows. All later default checks completed, without exception or
short-circuit. This red equality does not establish migration acceptance. The
temporary approved guard was removed; whole written LIFE is byte-for-byte
original full source. No baseline mask or repeat-to-green was added.

Independent fixture-contract bug #850 records the actual quantity6 and source
expected value undefined: LIFE_FOOD.stock includes eggCarton, while
LIFE_FOOD.amounts lacks that key; canonical ITEMS uses EGG.count. The amount
comparison therefore fails, while other native place/store/slot conjuncts were
not separately instrumented. This is not evidence of corrupted stock or a
quality/viewport cause, and no sidefix was made in #824.

All twenty-six app-ready documents have distinct native timeOrigins and matched
URLs: full ready900×600/controller false, test ready480×300 with genuine
draw/setFull/wantsFrame APIs, lazy/full false. Twenty-six trusted pagehide
snapshots confirm all original removals: every full leaves1280×800/native
fullscreen, every test leaves480×300/no fullscreen. Both final retained-frame
arrays are empty. Earlier runner null controllers remain explicit, completed by
native evidence with no observer errors/warnings; all cloud URLs were empty.
Runner modes were verified and the independent monitor exited 1.

Elapsed full/test times were 857.679/855.317 seconds including successful final
captures, with a 60-second bound in both modes. Both images were saved/reviewed:
full cropped top text and test cropped top/right text show the egg FAIL, while
later rows/terminal verdicts are below both viewport images; no scene remains.
No food/life-item visual equivalence or qualified timing aggregate is claimed.
Complete logs/summary: `/tmp/runtests-534447/`; frozen runtime/helper hashes,
native phases, exact original-restoration proof, actual exit and images:
`/tmp/lunden-life824/lifetest/`. All frozen source blobs matched after the pair.

All #824 dispositions are complete: lift's24 exact PASS rows support its small
setup; LIFE3 retains original full after raw random/dust differences and #849;
LIFE retains original full after identical red output and #850. The later #849
admission/storage fix and #850 canonical-amount correction are documented separately; broader #739/#736 remain open.

## Miele complete default native acceptance (#826, partial)

`mieletest` is migrated by changing only query/dimensions and retaining the
approved pre-pair testMode-only fullscreen suppression, original touch behavior
in full mode unchanged. At frozen `e51e120` plus guard, `/tmp/runtests-549594/`
has entire byte-identical raw logs, all 29 ordered PASS and ALL PASS per mode,
zero FAIL/pageerrors and independently monitored actual exit 0. The DEFAULT
whole fixture ran: no `only=fireworks` filter. Every coat/own-2D-texture/eye,
actual discovery score/badge, native CPU heart-color/timing, original random
endpoint loops, carry/hand/held-shot/photo/hug/not-table/drop/walk-off/reappear/F,
seed12345 rarity4000 and lock2000 predicate remains unchanged. Original RNG
restoration and optional shorter filter path are preserved, with no new seed,
normalization, subset or quality/clock/matrix/wait modification.
Two actual ready and two final records verify one app document per mode, original
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs, stable
URL/timeOrigin, no fullscreen and empty cloud URL. Wall 284.932s → 198.814s
includes both saved/inspected viewport captures: full shows all twenty-nine
vertical rows/ALL PASS and final hall/HUD; test shows roughly eighteen upper
result rows, clipped right/bottom; ALL PASS is visible at the top, while later
checks and the scene lie below the capture. Raw logs prove
complete diagnostics; no intermediate cat/fireworks/holding/action-pixel or
rendered-scene equivalence is claimed. This pair is excluded from speedup
aggregation because capture coverage differs. Frozen source/helper hashes,
complete raw/native records and genuine setsid/Popen/wait PID/SID/exit:
`/tmp/lunden-measure826/mieletest/`. Milk acceptance follows below; #740/#736 stay open.


## Beer-can reload: startup-order fix and complete native acceptance (#841)

The distinct stage diagnosis at frozen `a3971a5` reproduced full 20 PASS versus
test 18 PASS then the original reload TypeError, actual exit 1 (`/tmp/runtests-546191/`).
Cache open/match succeeded with no prior entry. The prepared request started at
2056.6 ms with its original 8000 ms timeout; its HTTP200 handler and JSON read ran
at 36539.0/36539.2 ms. The delayed abort timer fired at 36547.8 ms, JSON rejected with
AbortError at 36548.3 ms, and fallback selected zero beers at 36550.2 ms. All six native
prepared responses contained the same original 688157-byte/four-beer data. The
logging-only module had an exact inverse and one disclosed passive JSON observer;
this was cause diagnosis, not migration or performance evidence. Original raw
stages, bodies, mode records and images remain in `/tmp/lunden-beer841-stage/`.

Main now awaits its existing beerShelfData promise immediately before synchronous
buildWorld(plan). Cache, endpoints, decoding, fallback and every existing timeout
remain unchanged. An uncached unavailable refresh can defer construction until
its existing bound; this change prevents heavy construction from starving pending
network/body callbacks. No labels, restore keys or saved-state amounts are changed.

The uninstrumented whole original fixture at frozen `fa54745` plus this fix and
changelog 703 has byte-identical 996-byte logs: all 20 ordered PASS and ALL PASS
per mode, independently monitored exit 0 (`/tmp/runtests-551600/`). No loader source
routing or fixture diagnostic injection was present. Both real save/remove/reload
flows complete, including worktop 264 ml and held 378 ml. Four distinct native ready
documents verify original 900×600/null controller versus 480×300/real three-method
API, lazy/full false in test; all four shelves/packages/can arrays contain four.
Four trusted removal records show full's first 900/no fullscreen and second 1280
fullscreen, versus both test 480/no fullscreen; final arrays are empty.

Both actual fullPage captures were inspected with all 20 rows vertically and
ALL PASS; test's longest row is clipped at the right edge. Full 1280×800 and
test 673×341 contain text only because original apps are removed. Neither is
beer-pixel or scene-image equivalence. Elapsed 190.690/137.552 s includes capture,
descriptive only and excluded from qualified timing aggregation. All 229 frozen
runtime files and three helper hashes match. Complete provenance, native phases,
actual PID/SID/exit, raw logs and images: `/tmp/lunden-beer841-fixed/`.

Written default setup uses 480×300/test and retains the tested full-inert FS guard;
undoing only loader dimensions/query reconstructs the whole tested original.
The authored ?shots path keeps its original 900×600/full queries, camera/step and
retained reload; that branch was source-verified, not run as another screenshot
app. Every current assertion, original action and both persistence checks remain.
This current acceptance supersedes #807's interrupted result; #738/#736 stay open.

## Milk complete native action acceptance (#826, final)

`milktest` is migrated by changing only query/dimensions and retaining the approved
pre-pair testMode-only fullscreen suppression before original touch, original
full-mode behavior unchanged. At frozen `06adc19` plus guard (existing beer-shelf
startup barrier and changelog703 included), `/tmp/runtests-554030/` has entire
byte-identical logs: all 16 ordered PASS and ALL PASS per mode, zero FAIL/pageerrors,
independently monitored actual exit 0. Every current stand-search, matrix, door/
carton/held/pour/tilt/native fill/color-hex/contents/sip/F predicate and diagnostic
remains untouched; no seed, normalization, timer, wait, quality or matrix override.
Two actual ready and two final records verify one main document per mode, original
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs, stable
URL/timeOrigin identities, no fullscreen and empty cloud URL.
Wall 137.067s → 84.697s includes both saved/inspected viewport captures. Both show
all sixteen vertical result rows and ALL PASS; full shows final fridge/carton/
beer-shelf/HUD, while test has long text clipped right and only a thin canvas
edge. No intermediate pour/liquid-pixel/action-scene equivalence is claimed.
This pair is excluded from speedup aggregation because capture coverage differs.
Frozen source/helper hashes, complete raw/native records and genuine monitor
PID/SID/exit: `/tmp/lunden-measure826/milktest/`.

All three bounded #826 fixtures have complete unchanged-predicate native parity:
measure 3, full DEFAULT Miele 29 and milk 16 ordered PASS per mode. Each pair has
its recorded frozen runtime; milk includes the later `06adc19` startup fix, and
no repeat of the earlier pairs is claimed. #740/#736 remain open.

## Menu complete native acceptance (#827)

The complete original default `menutest.html` was compared on frozen
`4daabbb6a80ce0a47bf2641b64596a2b517b2bb5`, with its original 900×600/plain
index setup and the 480×300/test setup. Both logs contain all 18 ordered PASS
rows and `ALL PASS`; the entire 797-byte outputs are identical. The independent
monitor recorded actual exit 0. Evidence is retained in `/tmp/runtests-561485`
and `/tmp/lunden-menu827`; observed runner wall times were 82.830 s and 72.916 s,
including both successful captures. These are descriptive measurements pending
#764 timing qualification.

The passive observer recorded one actual app document per mode: original
900×600/null controller and 480×300/real draw/setFull/wantsFrame APIs, with
stable URL/timeOrigin identities, no fullscreen and empty cloud query.
Both ready snapshots and trusted removal-pagehide snapshots retain those
identities. The original fixture removes the iframe before publishing results,
so final app-frame snapshots are empty. Runner `controller: null` is retained
and supplemented by the observer's actual pre-removal API evidence.

Both actual PNGs show all 18 result rows and `ALL PASS`, with no observed
right/bottom crop. They show the text-only final document after iframe removal;
there is no rendered scene or intermediate menu-state pixel comparison.
All original button, instructions, to-start, confirmation/cancellation and
session-storage predicates remain unchanged. The original `resetHome.go` stub
remains: this checks the authored reset flow, not actual reset navigation.
Natural uncaught exceptions, actions and waits are unchanged; no guard, new
seed, normalization or quality override was added. Migration changes only the
iframe query and dimensions. Reversing those two lines reproduces the entire
frozen original fixture; runtime source/data, runner and helper hashes match
that pair's recorded base. Parent #740 and #736 remain open.

## Native dust placement admission (#849)

`Mess.dust` now rounds candidate x/z with the existing millimetre `round()` before
room/free-space/wall validation, matching the coordinates subsequently stored
and drawn by `add()`. The clearance/wall thresholds, per-room/cap/merge rules,
RNG calls per candidate and rejection loop are unchanged. The original complete
`life3test.html` remains unchanged; this product fix is not a fixture migration.

The old #824 dust failure has no recorded per-spot constituents. One original
full diagnostic using the authored `only=388` filter completed both apps and
all 15 section rows with PASS: all 32 stored dust spots satisfied floor, room,
native free-space and wall criteria. A transparent wrapper observed only the
32 calls naturally made by the unchanged predicate and restored method identity
and ownership in `finally`. The failure did not reproduce; there was no retry,
and no old failed spot or viewport/quality cause was identified. Actual exit 0,
native phases and text-only PNG: `/tmp/runtests-555809/` and
`/tmp/lunden-dust849/`. This filtered diagnosis is not default/migration proof.

`messplacementtest.html` reproduces a separate admission/storage defect using
actual Mess/Player methods in an explicit controlled one-wall domain: one
verified segment from the current plan, no other furniture/doors/visited units,
and a named domain room. No main app or WebGL renderer is created. Fixed inputs
to the existing `dust(rng)` callback are regression data; global randomness and
native random rotation are not replaced or asserted. With the unchanged native
test source, current source `06adc19` produced 14 PASS/2 FAIL/exit 1: a reachable
raw candidate at .0802 m was stored at .07990000000000003 m, below native
.07999999999999999 m clearance; a near-wall raw candidate at .44999 m was stored
at .45009999999999994 m, beyond the .45 m wall bound plus the fixture's 1e-6.
The ordinary point and all floor/room/native mesh-count checks passed.

After the minimal source fix, the identical 16 criteria/inputs produce 16 PASS,
0 FAIL/ALL PASS/actual exit 0. Each rejected boundary candidate consumes its
original three callback values before the next valid candidate is accepted
(six total); the ordinary case still consumes three. Both genuine PNGs show
all 16 rows/verdicts, with no apartment/scene claim. Complete raw/JSON/source,
helper hashes and actual cleanup: `/tmp/runtests-558678/`,
`/tmp/runtests-560475/`, `/tmp/lunden-dust849/component-before/` and
`/tmp/lunden-dust849/component-after/`. All frozen component source/helper
hashes matched; these controlled-domain failures do not identify the old
unrecorded failed spot.

One complete original default Life3 fix-verification pair at `4daabbb` plus the
approved product patch ran all five sections/six actual apps per mode, without
an only-filter, fixture edit or fullscreen guard. Both complete 68-row logs have
68 PASS/0 FAIL/ALL PASS, including dust row 10 and the original vacuum, cloth,
bin, cap/conservation, save/load and diagnostic flows. Strict comparison still
exits 1: row 6 retains raw cut coordinates `5.46,2.09` versus `5.25,2.47`, and row
11 retains different complete per-room dictionaries. Those unseeded values are
not normalized or retried, and no exact migration parity is claimed.

All twelve native app-ready documents have distinct matched URL/timeOrigins:
full six ready900×600/controller false/no fullscreen; first two trusted pagehide
snapshots remain900×600/no fullscreen, last four leave1280×800/native fullscreen.
Test all six ready480×300 have real draw/setFull/wantsFrame functions, lazy/full
false/no fullscreen; all six trusted pagehide snapshots remain480×300 but have
native fullscreen active. No source guard was used; the public test context
constrains that fullscreen viewport. Both final retained-frame arrays are empty,
all cloud URLs empty, and there are no observer errors/warnings. Earlier runner
null controllers remain explicit and are completed by these native snapshots.

Actual elapsed full/test423.667/391.501 seconds includes final captures with the
same60-second bound. Both saved PNGs were reviewed: full top~52 textual rows,
test top~19 with right/bottom cropping; the dust PASS is visible, later rows and
terminal verdicts are below both images and no scene remains. No dust, vacuum,
cloth or apartment pixel proof or qualified timing aggregation is claimed.
Complete ordered logs/summary: `/tmp/runtests-563581/`; frozen runtime/helper
hashes, actual exit/cleanup, native ready/leave/final records, raw differences
and images: `/tmp/lunden-dust849/default-pair/`. All230 frozen native/new-test
blobs and three helper hashes matched after this pair. The original whole
Life3 fixture remains full; the later #850 fixture correction is documented below, while broader #739/#736 remain open.

## Basement entry native input-driver acceptance (#837)

The original whole basemententrytest.cjs driver ran the complete current HTML
body at frozen d7f0497: a full900×600/shot/cloud-empty baseline (only removing
the original test=lazy flag) and the480×300 candidate with its existing authored
shot/test=lazy/cloud-empty query. Both entire CJS logs, including the original
loading/input messages, are3969 bytes and byte-identical: all56 PASS, ALL PASS,
zero failures or page errors. Both result.json records are identical. Each
independent runner exits0; the setsid monitor's actual exit is0. No ordinary
CJS --compare support is assumed or added.

The original normal Playwright click on the actual mouse-start button and
bounded native PointerLock wait are unchanged. Read-only native snapshots at
ready, after that click and after all checks have stable URL/timeOrigins:
full900×600/controller false versus test480×300/real draw/setFull/wantsFrame,
lazy true/full false. PointerLock is false at ready and true after activation
and at final in both; fullscreen remains false and cloud URL empty. One actual
document per mode is retained. Original E KeyboardEvents and the fixture's
controlled touch.enabled/activeMode assignments are authored synthetic input,
not physical-phone gestures.

All HouseA/B closed/open/far-leaf/focus/E/touch/jamb/courtyard checks, physical
Player/corridor/landing/connected-paving routes, shrub-instance/tree clearance,
native normals, coplanar overlap and floor support remain. The no-invented-C-door
predicate remains too. No source assertion, diagnostic, matrix, pose, random
seed, quality, wait, renderer loop or input handler was changed. The original
driver's240s entry-ready,10s PointerLock and15s default bounds are unchanged;
the external monitor permits20min per mode and adds only three read-only
metadata snapshots and the same60s final viewport capture.

Both actual950×950 parent PNGs were inspected: all56 result rows and ALL PASS
are visible, with only an upper app/HUD strip below them. There is no intermediate
door/movement or scene-pixel comparison. Whole driver wall100.790s versus60.877s
includes those external observations/captures; these descriptive samples are
excluded from aggregate timing because the driver was instrumented. Native
phase/result/raw/image/source/helper/PID/SID/exit/cleanup evidence is retained in
/tmp/lunden-basement837/. All230 frozen source paths and four helper hashes
matched physically. This baseline preceded the independent #849 Mess.dust fix;
that later change and its changelog do not alter this fixture's asserted routes
or its unchanged CJS driver. Final migration changes only HTML dimensions to
480×300; reversing that line restores the entire original fixture. Existing
test=lazy and original renderer.setAnimationLoop(null) remain. #738/#736 stay open.

## Nerf complete native acceptance (#828, partial)

On frozen `874faa6d59e83ba9bc84713eccce5e0bf2f776aa`, the complete original
900×600/plain index Nerf flow and 480×300/test flow produced byte-identical
281-byte logs: all seven ordered PASS and ALL PASS, actual monitor exit 0.
Evidence: `/tmp/runtests-579449` and `/tmp/lunden-north828/nerftest`.
Original flight-layer `true,true`, splash count 1, wall x 2.752, colour r 0.01,
floor y 3.258 and lifetime rows remain exact, with every authored step and
matrix update unchanged. No new seed, normalization or quality override.

Both actual ready/final pairs have stable URL/timeOrigin identities: full
900×600/null controller and test 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. The single prepair
`requestFullscreen = undefined` guard applies only with actual testMode before
original start-touch; original touch behavior in full mode is preserved.
Migration changes only iframe query/dimensions beyond that approved setup;
reversing them reproduces the entire frozen guarded fixture. Source/data/index,
runner and helper hashes match the measured base.

Both inspected PNGs show all seven vertical result rows and ALL PASS. Full
shows the final dark bedroom blaster rack/HUD; test clips the long flight-layer
row on the right and the final canvas below its upper portion. No intermediate
dart/splash pixel or rendered-scene equivalence is claimed. Wall times
132.917 s and 83.153 s include both successful captures; this pair is excluded
from speedup aggregation because capture coverage differs. Nonpc and north acceptance follow below; parent #740/#736 remain open.


## No-neighbours complete native acceptance (#828, partial)

The complete original default flow on frozen
`874faa6d59e83ba9bc84713eccce5e0bf2f776aa` produced identical 385-byte logs:
all ten ordered PASS and ALL PASS in both modes, actual monitor exit 0.
Original 900×600/time12/month6 and 480×300/test retained the real missing-People
404 fetch, no greeting target, both authored speech strings and expiry, old
`greets` 3/score 4, stats row and no-page-errors predicate. Original localStorage
write/removal, actions, loops, waits and caught exception stack remain intact.
No new seed, output normalization or quality override was added.

Actual ready/final snapshots retain one stable URL/timeOrigin per mode:
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs with
lazy/full false, no fullscreen and empty cloud query. The prepair single
undefined requestFullscreen guard applies only with actual testMode before
original start-touch; original full-mode touch behavior remains. Reversing
query/dimensions reproduces the whole frozen guarded fixture; native runtime,
runner and helpers match its recorded hashes. Evidence:
`/tmp/runtests-581153` and `/tmp/lunden-north828/nonpctest`.

Both inspected PNGs show all ten rows and ALL PASS without observed result
text crop. Full shows the final empty bench/house facade and HUD; test captures
only the upper final canvas. No intermediate speech-bubble or rendered-scene
pixel equivalence is claimed. Wall 107.714 s and 78.889 s includes both captures;
this pair is excluded from speedup aggregation because scene capture coverage
differs. North acceptance follows below; parent #740/#736 remain open.

## Canonical starting-food amount assertion (#850)

`lifetest` now checks each starting stock amount against the existing canonical
`ITEMS[type].amount`, using the same config module already imported. Every
native item/place.at/store/slot conjunct and exact raw label is retained. No
production quantity/configuration is changed or duplicated. Mechanically undoing
the import and amount-lookup changes reproduces the whole original fixture
byte-for-byte, including its thirteen authored app loads, all action/stock/tool/
mass-balance/audit/session-resume/persistence flows, catches and final verdict.
There is no filter, fullscreen guard, seed, normalization, baseline or migration.

The prior #824 complete original pair remains preserved: each mode had
132 PASS/1 FAIL/SOME FAILED, whole 7566-byte logs identical, including row 7
`FAIL eggCarton: in fridge slot 2, 6 count`. Its expected lookup was undefined,
because eggCarton is absent from `LIFE_FOOD.amounts`; the item definition already
uses `EGG.count` (6). The old label alone did not separately measure the other
place/store/slot constituents or prove stock corruption or a viewport cause.

A native Node amount-contract preflight imported the unchanged actual Items
and config modules and created all six stock types in a controlled world place:
cheese500 g, cucumber300 g, butter500 g, eggCarton6 count, peas500 g and breadBag12
count. Every native created amount matches the canonical definition; all five
old defined values are unchanged and only the old eggCarton lookup is missing.
This is an amount-contract preflight, not app/store/slot/lifecycle proof. Exact
source script/JSON/provenance and whole-fixture inverse:
`/tmp/lunden-egg850/`. No DOM, renderer or app was started for this preflight.

One complete original written-full default acceptance at `c161596` plus only
the approved two-line fixture correction completed all thirteen actual apps and
133 ordered PASS rows/0 FAIL/ALL PASS, with actual monitor exit 0. Row 7 is now
`PASS eggCarton: in fridge slot 2, 6 count`; its complete native compound predicate
remains intact. All stock/tool/cutting/sandwich/waste/audit and session-resume/
persistence flows completed without exceptions or short-circuit. Comparing
the entire historical full133-row log to this log finds only row 7 FAIL→PASS
and the terminal verdict; the runtimes differ, so this is not mode/migration
parity. No new test-mode pair was run for this fixture-contract correction.

All thirteen native app-ready documents have distinct matching URL/timeOrigins,
900×600/controller false/API null/no fullscreen and empty cloudURL: nine life/
shot, two shot/time12/freeze and two shot. Thirteen matching trusted pagehide
snapshots confirm removals: the first and last remain900×600/no fullscreen;
the middle eleven leave1280×800/native fullscreen. No source guard was added.
Final retained frames are empty, with no observer errors/warnings. Runner's
written-mode `modeVerified:null` and initial null controllers remain explicit;
this is one full acceptance, not a verified mode comparison.

Actual elapsed834.305 seconds includes the successful final60-second-bounded
capture. The saved PNG was reviewed: top~52 text rows, including the egg PASS,
with some long right-cropped lines; later rows/terminal verdict are below the
image and no scene remains. No egg/food/apartment pixel proof or qualified
timing aggregation is claimed. Complete raw/summary: `/tmp/runtests-584133/`;
actual exit/cleanup, all native phases, image, source/helper hashes and whole
fixture inverse: `/tmp/lunden-egg850/acceptance/`. All229 frozen native/fixture
blobs and three helper hashes physically matched after the run. The fixture
retains original full sizing/queries; broader #739/#736 remain open.

## Northern backdrop complete native acceptance (#828, final)

On frozen `8ad5bc7ee43d64e3408cc72b21a8cfb8118de094`, the complete original
720×480/shot/month6/cloud-empty flow and 480×300/test flow produced identical
830-byte logs: all 14 ordered PASS and ALL PASS, actual monitor exit 0.
All three actual mapped footprint rows, five material batches, ground/plinth
bounds, outward window rays 426/426, road/access/source predicates, 39 clear
trees, walking boundary and actual 8380-triangle budget remain unchanged.
There is no lowmem subset, seed, normalization, quality override or new guard.
Original matrix updates and geometry loops are intact; reversing query and
iframe dimensions reproduces the entire measured original fixture.

Both actual ready/final pairs retain stable URL/timeOrigin identities:
720×480/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. Native source/data/index,
runner and three helper hashes match that measured base. Evidence:
`/tmp/runtests-590124` and `/tmp/lunden-north828/northbackdroptest`.

Both inspected PNGs show all 14 vertical rows and ALL PASS. Full shows the
final near apartment facade; test clips long rows on the right and the canvas
below its upper strip. Neither is a directed image of the mapped northern
buildings; no north-building or rendered-scene pixel equivalence is claimed.
Wall 106.741 s and 74.015 s includes both successful captures; this pair is
excluded from speedup aggregation because capture coverage differs.

All three bounded #828 dispositions are complete: Nerf 7, nonpc 10 and north
14 ordered PASS per mode with whole byte-identical logs. Each frozen base is
recorded above; all authored actions, storage flows, diagnostics and original
assertions remain. Parent #740 and #736 stay open.


### Smart speaker actual disposition (#829, partial)

`nesttest.html` was measured once with the public runner's complete original
full/test comparison, one fixture job and a 20-minute bound per mode. Frozen
base `1a8d210` plus only the reviewed pre-pair testMode-only fullscreen guard
preserved the whole original 900×600 `?time=12&weather=rain` fixture. All
existing actions, matrix calls, speechSynthesis mock, speaker loops, authored
clock/weather cases, mute/ducking/wall/F checks and 300 unseeded presses remained.
There was no new seed, normalization, subset or retry.

Both complete logs contain 31 ordered PASS and ALL PASS, but nine rows differ:
3–5 choose fanfare/sound/caption versus joke-lemon/speech/caption; 10–12 choose
time/speech/bubble versus lund-cathedral/speech/bubble; 17–19 choose
stlars/speech/bubble versus pep-day/speech/bubble. Both 300-press rows report
0 repeats and 32 different answers. All exact strings and duplicate rows remain
in `/tmp/runtests-604659/nesttest.log` and `nesttest.test.log`; whole log sizes
and differences are recorded in `/tmp/lunden-smart829/nesttest/ordered-differences.json`.
The independent monitor exited 1 at 05:04:59 UTC because comparison was
nonidentical, despite both functional verdicts being green. The temporary
guard was removed and the entire original full fixture restored byte-for-byte;
no migration or exact mode equivalence is claimed.

Each mode has one actual main document with matching ready/final URL and
timeOrigin: full 900×600/null controller, test 480×300 with real draw/setFull/
wantsFrame functions and lazy/full false. All four snapshots show no fullscreen
and empty cloudURL; no leave event or reload was recorded. All 229 frozen
native source/data/index/runner/fixture blobs and three helper hashes match
the measured source. Native DetailCuller quality, camera projection and
viewport-based bubble placement were retained, without a renderer exemption.

Both actual PNGs were inspected. Full shows ALL PASS and all 31 rows plus a
partial final window/courtyard/HUD scene; test shows only the top roughly
18 rows, clips long text on the right and retains no scene. No directed speaker
image or rendered-scene pixel equivalence is claimed. Samples 114.512 s and
90.619 s include successful captures (60-second bound in both modes); unequal
capture coverage excludes this pair from qualified speedup aggregation.
Source, native snapshots, monitor and images remain in
`/tmp/lunden-smart829/nesttest`. Olofcar/Olof dispositions are documented below;
parents #740 and #736 remain open.

## Openable-front complete native acceptance (#830, partial)

On frozen `1a8d210dc8623b538a123964ffb79524b1c51fc9`, the complete original
900×600/time12/freeze flow and 480×300/test flow produced identical 9072-byte
logs: all 189 ordered PASS and ALL PASS, actual monitor exit 0. All 90 fronts,
conditional opening/closing labels (including repeated rows), neighbour/wall
AABB and poster sweeps, original free-floor searches/reacquisition and contents
loops remain intact. Original dynamic rows retain 31 kitchen fronts/21 filled,
45 other fronts with contents and both dishwasher rack depths. No new seed,
normalization, quality override, matrix, wait or assertion change.

Actual ready/final pairs retain stable URL/timeOrigin identities: full
900×600/null controller versus test 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. The single approved
undefined requestFullscreen guard applies only with actual testMode before
original start-touch; original full behavior and uncaught async exceptions
remain. Reversing query/dimensions reproduces the whole frozen guarded source;
native source/data/index, runner and three helper hashes match that base.
Evidence: `/tmp/runtests-608329` and `/tmp/lunden-open830/opentest`.

Both inspected viewport PNGs show ALL PASS and only early result rows: full
shows about 51 rows and test about 18; remaining checks and the final scene lie
below both captures. Complete raw logs preserve all 189 rows. No cabinet-state,
poster or rendered-scene pixel equivalence is claimed. Wall 162.368 s and
121.823 s includes both successful captures; this pair is excluded from speedup
aggregation because capture coverage differs. Oven and paper acceptance follow below; #830/#740/#736 remain open.

## Lossless compact world records (#845)

`Items.serialize()` now omits only package/preparation/cleanliness/moisture
values equal to their type defaults, which `create()` already restores.
`TasksManager.save()` omits untouched per-task defaults while retaining all
changed fields, top-level pool/visibility/time, and explicit zero counters and
deadlines when completion or failure changes the load fallback. Readers remain
unchanged and accept earlier version 1/2 records. The original world-size
assertion remains `< 6000`; no rounding, truncation or threshold increase.

The original full-mode diagnostic on frozen `8ad5bc7` (runner 592892) measured
7090 UTF-16 code units and failed the size assertion. It later timed out at the
original 20-minute bound: its raw log has 39 PASS and one FAIL, not a completed
44-check verdict. The last capture contains an additional late plate check.
This failed history remains in `/tmp/lunden-world845` and
`/tmp/runtests-592892`. An offline native data-module reconstruction of that
actual snapshot reduces 7090 to 5723 code units and preserves all 37 items and
task state; permissive storage/event adapters make this a serialization proof,
not an apartment-placement or reload measurement.

The new standalone `tools/savecompacttest.html` uses real Items/Tasks classes
with disclosed Life event/storage adapters and no renderer. Its initial
39-check body gave 37 PASS/2 FAIL against the old serializers and 39 PASS after
the fix. The final 40-check body adds goal-derived completion with explicit
zeros and passed all 40 natively (probe 615265, exit 0). Default fields for all
26 item types, changed flags/amounts/machine data, old explicit records, pool,
partial goals, failure/replenishment, deadlines and tolerant migration are covered.

Unchanged whole `taskstest.html` and `itemstest.html` passed all 96 and 64 checks
respectively in one public written run (runner 612056, exit 0). Actual children
were test-mode 480×300 with real draw/setFull/wantsFrame APIs and no fullscreen,
despite normal parent viewport and helper filename `full`. Their complete PNGs
were inspected. The later goal-derived completion safeguard was added after
these two regressions and covered by the new 40th module check and the complete
world acceptance below; no claim that their frozen task hash includes that
later change.

Complete world acceptance used one public written run, runner 615882, on
`0d2e7f6` plus the final serializers and a temporary fixture setup. Every
original assertion, action, record, timer, branch, size threshold and all 44
checks remained. Setup alone changed child dimensions to 480×300, appended
`test` to the original queries and suppressed fullscreen only with actual
testMode before original touch activation. All 44 PASS and ALL PASS were
recorded, exit 0, 05:39:51–05:57:52 UTC. The native record measured 5713 UTF-16
code units (the existing label says bytes). All 16 actual document identities
have native pagehide and 15 pre-remove snapshots; 14 have app-ready snapshots
and the F5 source has beforeunload. All observed children retain their actual
URLs/timeOrigins, 480×300, real controller APIs and no fullscreen. No trusted
lifecycle flag or lazy/full telemetry was recorded by these helpers. All frames
were removed by the fixture before the final empty-frame snapshot.

All 229 frozen source/fixture/runner SHA-256 hashes and three helper hashes
were independently verified before restoring the whole original 900×600/full
fixture byte-for-byte. The full-page PNG was inspected: all 44 rows and ALL
PASS are visible, with no retained scene. Logs, helpers, source hashes,
monitor and capture remain in `/tmp/lunden-world845/reload-written` and
`/tmp/runtests-615882`. This single temporary test-mode acceptance proves the
fix across the complete reload flow; it is not a new full/test comparison,
pixel-equivalence result or eligible speedup sample. The original full fixture
is retained under its earlier #842 disposition.


### Olof driver actual disposition (#829, partial)

`olofcartest.html` was measured once with the complete original full/test
comparison, one public fixture job and a 20-minute bound per mode. Frozen
base `2b548e0` preserved the entire original 900×600 `?time=12&month=6`
fixture, including its existing unconditional fullscreen suppression. All
native car travel, driver poses/distances, greetings, scoring, four-door loop,
visitor seats and original saveState/loadState actions remained. loadState
restores a state record within the same app; it is not a main-page reload.
No seed, normalization, extra mock, subset or retry was added.

Both complete logs contain 31 ordered PASS and ALL PASS; only check rows
7 and 8 differ. Full says "Hallå där, Olof!" and the parking joke; test says
"Tjena Olof!" and the wall/corner joke. The complete original strings remain
in `/tmp/runtests-623035/olofcartest.log` and `olofcartest.test.log`, with
whole-file differences in `/tmp/lunden-smart829/olofcartest/ordered-differences.json`.
The independent monitor exited 1 at 06:10:18 UTC for the nonidentical comparison;
there were no functional FAIL rows. The entire original full fixture remains
byte-identical to HEAD, without migration or exact mode-equivalence claim.

Each mode has one retained native app with matching ready/final URL and
timeOrigin: full 900×600/null controller, test 480×300 with real draw/setFull/
wantsFrame functions and lazy/full false. All four snapshots show no fullscreen
and empty cloudURL, without a leave/reload event or readiness error. All 229
frozen native source/data/index/runner/fixture blobs and three helper hashes
match the measured source; native detail/camera/viewport coupling was retained.
Evidence and monitor ownership cleanup remain in
`/tmp/lunden-smart829/olofcartest`.

Both actual PNGs were inspected. Full shows ALL PASS and all 31 text rows
plus a partial final facade/trees/HUD; test shows only the top 18 rows with
long text cropped on the right and no scene. Neither is a directed final
car/driver image; no rendered-car pixel equivalence is claimed. Samples
126.147 s and 86.568 s include successful captures (60-second bound in both
modes); unequal capture coverage excludes qualified speedup aggregation.
Nest and Olofcar have honest original-full dispositions; the Olof outcome is
documented below. Parents #740 and #736 remain open.

## Oven and coffee complete native acceptance (#830, partial)

On frozen `60ffd9aeafc4e929cbea1a6c82ff45a14d347ed7`, the complete original
900×600/plain index and 480×300/test flows produced identical 709-byte logs:
all 19 ordered PASS and ALL PASS, actual monitor exit 0. Both original appliance
button/open/close actions, 88°/85° angles and emissive intensity 1.1, appliance/
toilet-lid stats, all missing-water/grounds prompts, native 0.50→1.00 jug fill,
light switching and spent-grounds predicates remain unchanged. Original steps,
waits, matrices, coffee steam randomness and natural uncaught exceptions remain;
no new seed, normalization or quality override.

Both actual ready/final pairs retain stable URL/timeOrigin identities:
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. The approved single
undefined requestFullscreen guard applies only with actual testMode before
original start-touch, preserving original full behavior. Reversing query and
iframe dimensions reproduces the whole frozen guarded source. Native runtime,
runner and helper hashes match this distinct base, including the legitimate
#845 Items/Tasks serializer fix; no repeat of the earlier Open pair is claimed.
Evidence: `/tmp/runtests-625439` and `/tmp/lunden-open830/oventest`.

Both inspected PNGs show ALL PASS. Full shows all 19 rows and the final coffee
maker/counter/HUD, with lower canvas below the capture; test shows about 18
rows, with the final used-grounds row and scene below the capture. Complete raw
logs preserve that final row. No intermediate appliance-lamp/brewing pixel or
rendered-scene equivalence is claimed. Wall 135.958 s and 84.926 s includes both
successful captures; excluded from speedup aggregation because capture coverage
differs. Paper acceptance follows below; parents #740/#736 stay open.


### Olof actual disposition (#829, final)

`oloftest.html` was measured once with the complete original full/test
comparison, one public fixture job and a 20-minute bound per mode. Frozen
base `967d691` plus only the reviewed pre-pair testMode-only fullscreen guard
preserved original 900×600 `?time=12&month=6&olof=0`, all native seat/mesh/IK/
hand/action/scoring/state predicates and matrix calls, the authored temporary
canSee mock and forced appearance, and 200 unseeded no-repeat joke selections.
No new seed, mock, normalization, filter or retry was added.

Both whole logs contain 21 ordered PASS, ALL PASS and the same standalone
geometry diagnostic: 5650 triangles, 16950 vertices, 1.10 MiB of CPU/GPU vertex
buffers. Whole-file comparison, including that non-PASS diagnostic, differs
only at check rows 13/14 (physical file lines 15/16): "Hallå där, Olof!" versus
"Skål, Olof!", and the television/sofa joke versus the sofa/support joke.
All exact strings remain in `/tmp/runtests-630744/oloftest.log` and
`oloftest.test.log`; complete differences are retained under
`/tmp/lunden-smart829/oloftest/ordered-differences.json`. The independent
monitor exited 1 at 06:24:13 UTC for the nonidentical comparison; no functional
FAIL occurred. The temporary guard was removed and the entire original full
fixture restored byte-for-byte, without migration or exact equivalence claim.

Each mode has one retained native main document with matching ready/final
URL and timeOrigin: full 900×600/null controller, test 480×300 with real
three controller functions and lazy/full false. All four snapshots show no
fullscreen and empty cloudURL, with no leave/reload event or readiness error.
All 229 frozen native source/data/index/runner/fixture blobs and three helper
hashes match the measured source. Native detail/camera/viewport coupling
remained; geometry/state checks do not imply rendered-figure pixel equality.

Both actual PNGs were inspected. Full shows ALL PASS, all 21 checks and the
geometry row above a partial final sofa/window/HUD scene after Olof has gone.
Test shows only the top roughly 17 checks, clips long text on the right and
retains no scene; late checks lie below the viewport. Neither is a directed
image of Olof's earlier pose. Samples 123.771 s and 83.384 s include successful
captures (60-second bound in both modes); unequal capture coverage excludes
qualified speedup aggregation. All source/native/monitor/image evidence remains
in `/tmp/lunden-smart829/oloftest`.

All three bounded #829 dispositions are complete: Nest 31, Olofcar 31 and
Olof 21 PASS per mode, with each actual raw mismatch preserved and each entire
original full fixture retained. No sidebug, production/runner/baseline change
or migration is inferred from these green-but-different outcomes. Parents
#740 and #736 remain open.

## Toilet-paper complete native acceptance (#830, final)

On frozen `ea95ae4c6e4100a2cad2d08890f7cacb64b7b196`, the complete original
900×600/life-shot-time12-freeze and 480×300/test flows produced identical
1440-byte logs: all 22 ordered PASS and ALL PASS, actual monitor exit 0.
Both holders retain every authored native ray/action/sheet/strip/wad/flush/stat
loop and original matrix/wait calls: length 0.145, roll turn 2.01 rad, radius
55.0→54.4 mm, toiletPaper stats 1/2 and finite used quantities preserved by F.
No new seed, output normalization, quality override or assertion change.

Ready/final records retain one stable URL/timeOrigin per mode. Original full
starts at 900×600/null controller without fullscreen and finishes in actual
native HTML fullscreen at 1280×800/null controller. Test remains 480×300 with
real draw/setFull/wantsFrame APIs, lazy/full false and no fullscreen; cloud query
is empty in both. The approved single undefined requestFullscreen guard applies
only with actual testMode before original touch; native full behavior remains.
Reversing query/dimensions reproduces the whole frozen guarded source. Runtime
source/data/index, runner and all helper hashes match that recorded base.
Evidence: `/tmp/runtests-633490` and `/tmp/lunden-open830/papertest`.

The full screenshot timed out after its 60-second bound; no full PNG exists or
was visually reviewed. The saved/inspected test PNG shows ALL PASS and about
18 early rows, with long lines clipped right and the last four checks/scene
below the capture. All 22 raw rows remain complete. No paper/wad/intermediate
flush or rendered-scene pixel equivalence is claimed. Wall 173.381 s and
84.117 s includes those capture attempts; this pair is excluded from speedup
aggregation because of the unmatched full capture timeout and coverage limits.

All bounded #830 dispositions are complete: Open 189, Oven 19 and Paper 22
ordered PASS per mode with whole byte-identical raw logs. Their distinct frozen
bases and qualified native/capture scope are recorded above; no rerun of earlier
pairs after legitimate later source changes is claimed. Parents #740/#736 stay
open.

## Poster placement original failure (#833, historical partial)

Superseded by the complete verified pair in “Poster comparison completed” below. This records the earlier failure before #857 identified and corrected the fixture precondition.

The first complete-source comparison attempt used frozen `9cdaa49` and the
whole original `9645849^` fixture, authored 480×300/shot/cloud-empty. No setup,
action, matrix, assertion, seed, query or timing change was applied to this
fixture. Actual first app readiness proved the original full URL, 480×300,
null controller and no fullscreen. The first four checks passed; wall preview
and rotation failed, then `R.candidate.clone()` threw a caught TypeError.
The whole failure output is retained in
`/tmp/lunden-posters833/posterplacementtest/full-progress.json`.

The original catch writes accumulated checks and the stack but no standard
terminal, so the runner kept waiting after fixture execution had ended. Root
explicitly requested SIGTERM; actual runner 637111 exited 143 at 06:40:34 UTC
(start 06:34:15). This is an interrupted run, not a native timeout, a completed
full/test pair, a new baseline, migration or timing sample. No test-mode pass,
other two authored documents or optional Worker branch completed in this run.
Final observation reports the closed-frame error; no PNG was retained or
visually reviewed. All 229 source/fixture/runner SHA-256 hashes and three
passive helper hashes were independently verified unchanged after cleanup.

Preview cause is unestablished and tracked separately in #857; missing failure
terminal is #858. The original checks remain. Later #815 changes only the
fixture's ordinary setup helper/include, separately verified and documented;
that change is absent from this historical failure. Native source, monitor,
owned signal request and helpers remain beside the complete observed output.
The drawing-poster comparison and complete placement acceptance remain pending;
#833/#740/#736 stay open.


## Poster drawing earlier disposition (#833, historical partial)

Superseded by the complete verified pair in “Poster comparison completed” below. The following preserves the earlier red full-run evidence; it is not the final disposition.

One unchanged default `postertest.html` full/test pair ran on frozen `eea338a`
plus only the approved pre-pair testMode fullscreen suppression in the original
load helper. Original 900×600, both Math.random cache-busting loads, all current
pointer drawing, wall/fridge/door actions, native IndexedDB, panel/throw/re-tape/
bunk predicates and optional `?shots`/`?panel` branches remained. Those optional
branches were not executed by the default pair. No seed, normalization, subset,
retry or new wait was added.

Full produced 28 authored rows: 24 PASS and four FAIL, then original catch
SOME FAILED and TypeError at fixture line 188:43, reading `fq.rec` from undefined.
Failures are after-reload wall only/stored1, × close, E/Esc close and thrown
storage0. It never reached the final nine take-down/re-tape/bunk checks.
Test completed all 37 PASS and ALL PASS, including both duplicated bunk flows.
Check rows 17/21/22/23 differ by failures/storage; row19 is the actual panel
clock 10:32 versus 10:36; full lacks rows 29–37. All raw strings, duplicates,
error and unexecuted scope remain in `/tmp/runtests-647020/postertest.log` and
`postertest.test.log`. The independent monitor exited 1 at 08:38:25 UTC. A green
complete test half does not make a red truncated full half equivalent: the
whole original full fixture is restored byte-for-byte, guard removed, no
migration. The after-reload failure is distinct from #857's earlier placement
preview issue; no causal or mode/quality/viewport diagnosis is inferred.

The passive live full checkpoint copied actual catch-written #out text, not
runner completion; later public logs and monitor establish the final result.
All four actual document identities have native app-ready evidence: full
900×600/null controller, test 480×300/real draw/setFull/wantsFrame APIs and
lazy/full false. First documents have matching trusted beforeunload/pagehide:
full 900×600/no fullscreen, test 480×300/no fullscreen. Retained second full
final is 1280×800/native fullscreen HTML; test final remains 480×300/no fullscreen.
All URLs/timeOrigins match their native identities and all cloudURL values
are empty, with no readiness errors. Early public metadata has controller:null
for first loads; the separate passive real app-ready API snapshots supply
those observations. All 229 frozen source/data/index/runner/fixture Git blobs
and three helpers physically match before restoring the entire original.

Both actual PNGs were inspected: full native fullscreen shows final door/floor/
HUD, without parent results or a directed drawing image. Test shows ALL PASS
and top 18 text rows, clips long text right and retains no scene. Neither proves
rendered-drawing pixels or coverage of optional shots. Samples 298.014 s and
197.933 s include successful captures (60 s bound both modes); red incomplete
full flow and unequal capture coverage exclude qualified speedup aggregation.
Complete source/native/monitor/capture/restoration proof remains in
`/tmp/lunden-posters833/postertest`. #833 remains open for placement followup;
#740/#736 remain open. No source/runner/baseline fix was made in this disposition.


## Poster comparison completed (#833, #857)

The original placement-preview failure was caused by its fixture placing the player at the outdoor spawn while only raising `y` to the apartment's upper floor. Native `Player.level` correctly returned 0 outside the apartment footprint, so the level-1 poster candidate was rejected and the fixture then dereferenced a null candidate. `tools/posterplacementtest.html` now initializes the fixture player at `(2.875, 3.25, 10.2)`, inside the apartment on level 1. Assertions, actions, waits, query, viewport, and production code are unchanged. The exact one-file fixture patch and 1,259 tracked-file freeze are recorded in `/tmp/lunden-preview857-source/compare-freeze-before.json` and `compare-freeze-after.json`; the hashes match after both test and screenshot runs.

On frozen `2fc232f` plus that fixture-only change, the complete serial `--compare` returned 1 because the drawing test reports a wall-clock string. `posterplacementtest.html` passed all 15 ordered checks in full and test; its 748-byte raw logs are byte-identical and both loaded modes were verified. `postertest.html` passed all 37 ordered checks in both modes; its 1,588-byte logs differ only at row 19, panel clock `Ritad 13 okt 12:22` versus `Ritad 13 okt 12:26`. No failure or missing row occurred. Primary comparison logs and `summary.json` are in `/tmp/runtests-679880`; measured fixture times were 229.506→191.214 s and 281.017→156.988 s, respectively, excluding the separate screenshot pass.

A later one-browser serial pass captured the four full/test final states without changing fixture actions. All ten parent/iframe PNGs in `/tmp/runtests-679880/shots2` were inspected. Placement captures show all 15 result rows and the retained app views; drawing captures show the full apartment scene and the test viewport scene. These are final-state captures, not pixel-equivalence evidence. The screenshot pass re-ran each fixture; both pairs again passed with the same ordered counts and the same sole clock-row difference. Its runner was restored byte-for-byte afterwards; `git diff --check` is clean and port 8847 is free. No production source, runner, baseline or runtime data changed. #833/#857 can close on these complete results; parent #740/#736 remain open.


### Cat petting actual disposition (#832, partial)

`pettest.html` was measured once with the complete original full/test
comparison, one public fixture job and a 20-minute bound per mode. Frozen
base `1fb73e8` plus only two reviewed pre-pair testMode-only fullscreen guards
preserved both original simultaneous 900×600 app frames: plain index followed
by `?cat=2.8,9.8,180&catb=6`. All original actions, matrix calls, stats deletion,
real board/JPEG/IndexedDB/photo waits, ordinary/rare cat predicates and
unseeded star values remained. No seed, normalization, subset or retry was added.

Both complete logs contain 17 ordered PASS and ALL PASS. Whole-file comparison
differs only at check row 3 (physical file line 4): full badge is
"✋ Klappat katt +1", test badge is
"🏠 Nytt rum: Vardagsrum✋ Klappat katt +1". Both report wrist distance
0.065 m, walk distance 0.80→1.79 m, photo 0→1 named Misse, petted count 1,
sphynx voice rasp and 26 lit stars/top y 0.61. The exact difference is retained;
no viewport/quality/timing cause is inferred from this one pair. Raw files:
`/tmp/runtests-640536/pettest.log` and `pettest.test.log`. The independent
monitor exited 1 at 06:54:49 UTC for nonidentical comparison, with no functional
FAIL. Both temporary guards were removed and the entire original full fixture
restored byte-for-byte; no migration or exact mode equivalence is claimed.

All four actual app documents have matching ready/final URLs and timeOrigins.
Full ready dimensions are 900×600/null controller/no fullscreen; both full
final documents report native 1280×800/fullscreen HTML. All test ready/final
snapshots remain 480×300 with real draw/setFull/wantsFrame APIs and lazy/full
false, no fullscreen. All cloudURL values are empty; no leave/reload event or
readiness error was recorded. All 229 frozen native source/data/index/runner/
fixture blobs and three helper hashes match the measured source. The original
real renderer photo snapshot and native quality/detail/camera coupling remain;
JPEG presence and particle state are not rendered-photo equivalence claims.

Both actual PNGs were inspected. Full native fullscreen shows the final rare
cat near the sofa/coffee table/rug/HUD, without parent result text. Test shows
ALL PASS and all 17 rows vertically, clips long text on the right and retains
only a thin frame edge/no scene. Neither captures the earlier active petting,
hand contact or rising stars; no directed pose/photo/pixel equivalence is
claimed. Samples 318.124 s and 164.671 s include successful captures (60-second
bound in both modes); unequal capture coverage excludes qualified speedup
aggregation. Source/native/monitor/capture/cleanup evidence remains in
`/tmp/lunden-pets832/pettest`. Plant and Portik are documented below;
parents #740 and #736 remain open.

## Detailed patio palm native acceptance (#831, partial)

On frozen `5fdef73f3cc825936193d6f0227a3dc30e6f4ab5`, the complete original
720×480/shot/cloud-empty and 480×300/test flows produced identical 935-byte logs:
all 15 ordered PASS and ALL PASS, actual monitor exit 0. Original pot profile,
48-segment geometry, recessed-soil ray, own bump textures, leaf shades/wind
buffers, curved trunk, actual canopy/wall bounds and collision footprint remain
unchanged; native triangle budget is 10632 and canopy height 2.62 m. No guard,
new seed, normalization, quality override, matrix or assertion changes.

One actual ready/final document per mode retains stable URL/timeOrigin:
720×480/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. No reload or leave event
was authored or observed. Native source/data/index, runner and helper hashes
match the measured base. Reversing only iframe query/dimensions reproduces the
whole frozen original. Evidence: `/tmp/runtests-651062` and
`/tmp/lunden-patio831/patiopalmtest`.

Both inspected PNGs show all 15 vertical result rows and ALL PASS. Full shows
the final near apartment facade, while test clips long rows right and the canvas
below its upper strip. Neither is a directed Palm image; no leaf/material/palm
or rendered-scene pixel equivalence is claimed. Wall 108.851 s and 83.638 s
includes both successful captures; excluded from qualified speedup aggregation
because capture coverage differs. Patio acceptance follows below; PC acceptance follows below; parents #740/#736 stay open.

## Patio complete native acceptance (#831, partial)

On frozen `5fdef73f3cc825936193d6f0227a3dc30e6f4ab5`, the complete original
900×600/shot default flow and 480×300/test flow produced identical 2543-byte
logs: all 33 ordered PASS and ALL PASS, actual monitor exit 0. Every authored
season/weather state JSON, cushion/F, native box-lid/geometry, collision/seat/
window/door/gap loop, two string-light months, parasol automatic/manual cases,
shade rays (4/7/7/6 seats) and cup/lid surface action remains unchanged.
No guard, new seed, normalization, timer, quality or matrix override was added.
The original optional parent-fixture `?shot` branch still returns SHOT after
the cup placement; it was not selected in this complete default comparison.
Original nested caught stack and outer error behavior were preserved in the
measured source; the separate bounded catch-writer issue #859 is not a gameplay
failure claim or an invisible change to this pair.

One actual ready/final document per mode retains stable URL/timeOrigin:
900×600/null controller versus 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. No reload or leave event
was authored/observed. Physical source/data/index, fixture/runner and helper
hashes match the recorded base; reversing only query/dimensions reproduces the
whole measured original. Evidence: `/tmp/runtests-655303` and
`/tmp/lunden-patio831/patiotest`.

Both inspected PNGs show ALL PASS. Full shows all33 vertical rows with long
text clipped right and a partial final open-lid/parasol-pole scene; test shows
only top~18 rows with right crop and no scene/late checks. Complete raw logs
preserve all33 rows. No intermediate seasonal/string-light/shade or rendered-
scene pixel equivalence is claimed. Wall113.105s and79.045s includes both saved
captures; excluded from qualified speedup aggregation because coverage differs.
PC acceptance follows below; parents #740/#736 stay open.


## Gaming PC native acceptance (#831, final)

On frozen `1e4bd17c0770ae83fe26b25b57b129ec8a069aca`, the complete original
900×600/plain index and 480×300/test flows produced identical 445-byte logs:
all nine ordered PASS and ALL PASS, actual monitor exit 0. Original PC button,
actual screen CanvasTexture-version and fan-colour changes, dark-screen/off,
chair/bunk seat actions, native monitor yaw0.02/facing1.000 and stand-up state
remain unchanged. Original matrices, waits, loops and uncaught exceptions are
retained; no new seed, normalization or quality override.

One actual ready/final document per mode retains stable URL/timeOrigin:
900×600/null controller versus480×300/real draw/setFull/wantsFrame APIs,
lazy/full false, no fullscreen and empty cloud query. The approved single
undefined requestFullscreen guard applies only with actual testMode before
original touch; full-mode behavior remains unchanged. Query/dimension inverse
reproduces the whole frozen guarded fixture; removing only that guard reproduces
whole original/current HEAD. Native227 source/data/index paths, fixture/runner
and all three helper hashes match the recorded base. Evidence:
`/tmp/runtests-658034` and `/tmp/lunden-patio831/pctest`.

Both inspected PNGs show all nine vertical result rows and ALL PASS. Full shows
the final game/PC/bedroom display rack/HUD; test clips long rows right and retains
only the upper scene. No intermediate film/seat/fan or rendered-scene pixel
equivalence is claimed. Wall119.928s and77.898s includes both successful captures;
excluded from qualified speedup aggregation because capture coverage differs.

All bounded #831 dispositions are complete: Palm15, Patio33 and PC9 ordered
PASS per mode with whole byte-identical logs. Their distinct frozen bases and
native/capture limits are retained above. Parents #740/#736 remain open.


### Plant placement verified pair (#832, partial)

One complete original full/test `planttest.html` pair ran on frozen `3fc6188`,
without any preparatory source guard or other change. Full retained original
900×600/plain index and existing unconditional fullscreen suppression; test
used 480×300/`?test`. All original 23 checks, required-feature errors, actions,
matrix calls, native focus/held state, merged-vertex counts/model visibility,
placement heights and cafe absence/double-F return remained. No seed,
normalization, branch removal, extra wait, matrix or quality override was added.

Both whole ordered logs are byte-identical, 1035 bytes, 23 PASS/0 FAIL and ALL PASS.
The duplicate "in the hand" and dining-table rows remain in their exact order.
Native values include 11 pots/5 merged meshes, 63252→55602 vertices, table y 0.755,
board y 0.801, lower-shelf y 1.850 and F-restored 63252 vertices. Public raw logs:
`/tmp/runtests-661924/planttest.log` and `planttest.test.log`. Independent
monitor exited 0 at 09:08:30 UTC; all owned session processes ended and port 8737
was verified without listener and reusable. The final fixture changes only
iframe 900×600→480×300 and plain index→`?test`; reversing those bytes reproduces
the entire frozen original. All executable predicates/actions remain unchanged.

One actual app per mode has matching ready/final URL and timeOrigin: full
900×600/null controller versus test 480×300/real draw/setFull/wantsFrame APIs,
lazy/full false. All four native snapshots show no fullscreen and empty
cloudURL, no leave/reload events or readiness errors. All 229 frozen native
source/data/index/runner/fixture Git blobs and three helper hashes physically
match before migration. Native quality/detail/focus coupling remains; accepted
logical rows do not establish rendered-plant pixel equality.

Both actual PNGs were inspected. Full shows ALL PASS and all 23 vertical rows
plus the final shelves/plants/face pot/HUD; test shows only the top 18 rows,
clips long text right and retains no scene. F-return predicates have complete
raw evidence but lie below the test capture. No placed-pot or scene pixel
comparison is claimed. Samples 107.945 s and 69.435 s include successful captures
with 60-second bounds in both modes; unequal image coverage excludes qualified
speedup aggregation. Source/native/monitor/image/inverse/cleanup evidence
remains in `/tmp/lunden-pets832/planttest`. Portik is documented below;
parents #740/#736 stay open. No production/runner/baseline changes.


### Portik verified pair (#832, final)

One complete original full/test `portiktest.html` pair ran on frozen `6cab681`,
with the entire original 480×300 fixture unchanged, no new guard. All native
walking/collision/opaque-geometry rays, door/lid/jetpack/waste actions, original
matrix calls, renderer loop/DPR/setSize setup, three-container loops, world
record restore and actual resume/reload/reset flows remained. No seed,
normalization, branch removal or extra ray/matrix/step/wait was added.

Both whole logs are byte-identical: 1704 bytes, 36 ordered PASS, 0 FAIL and
terminal ALL PASS, including all duplicated container/lid checks. Raw files:
`/tmp/runtests-669376/portiktest.log` and `portiktest.test.log`. Independent
monitor exited 0 at 09:28:15 UTC; all owned session processes ended and port
8737 was verified without listener and reusable. The proposed written fixture
adds only test flags to the two original explicit URLs; iframe dimensions,
Math.random reload suffix, native reset navigation and all other bytes remain.
Reversing those two flags reconstructs the entire frozen original.

All six actual app documents have distinct timeOrigins and real readiness
snapshots at 480×300: full/null controller versus real test draw/setFull/
wantsFrame functions, lazy/full false. Each mode has four trusted native
beforeunload/pagehide snapshots plus one retained final, matching URL/identity,
all without fullscreen and with empty cloudURL. The third reset document
actually reuses the second reload URL, with a new timeOrigin. Early public
metadata has null controller for the first two loads; separate passive actual
app-ready API snapshots establish those identities/modes. No readiness errors.
All 229 frozen source/data/index/runner/fixture blobs and three helper hashes
match the acceptance source; the fixture remains original until reviewed.

Rebase to `d57d739` preserves later owner changes. Only frozen-file deltas are
CombatWorld path diagnostic telemetry outside Portik's native action path and
the public runner's stricter verdict helper. Both retained complete Portik logs
pass that new parser's completion/success checks without another app run.
Measured source remains explicitly `6cab681`; no claim of remeasuring new main.

Both actual PNGs were inspected. Full shows all 36 rows and ALL PASS with a
limited final blank-sky/HUD strip; test shows only the first 19 rows, clips
long text right and retains no scene. No directed room/bin/jetpack image or
scene pixel equivalence is claimed. Samples 163.061 s and 161.266 s include
successful captures (60-second bound both modes); unequal image coverage
excludes qualified speedup aggregation. All source/native/monitor/image/
ordered/inverse/cleanup proof remains in `/tmp/lunden-pets832/portiktest`.

All bounded #832 dispositions are complete: Pet retains original full after
17 PASS per mode but one raw badge mismatch; Plant and Portik accept identical
23/36 PASS pairs respectively. No production/runner/baseline fix is included.
Parents #740/#736 remain open.


## Opponent lives (#865)

Start `python3 tools/devserve.py 8851 .` and `node cloudflare/dev.mjs 8852`, then `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/ghostlivestest.cjs http://localhost:8851 http://localhost:8852 /tmp/ghost-lives`. The default uses actual Ghosts/Combat and three WebSocket clients with native 2D textures, blocks WebGL, and suppresses only the apartment bootstrap. It checks authoritative damage, observer pickup, both weapon removals, death/reset, reconnection/departure, nondefault/invalid counts and cached resource release. It preserves existing combat participant rules and reports page errors. `node --test cloudflare/players.test.mjs` also covers forged client lives, late welcome, hibernation and generic server publication.

Optional `--render` adds one small controlled actual Ghosts/Three scene after the native checks, with desktop/phone-size armed and phone-size unarmed captures; it requires an exclusive graphics slot. It never boots the apartment. Native texture captures are not rendered-game evidence, and phone-size Chromium images are not a physical iPhone acceptance or performance measurement.


## Phone note/pause rendering regression (#669)

`PLAYWRIGHT_MODULE=… CHROME_PATH=… PHONE_PANEL_OUTPUT=/tmp/panels node tools/phonepaneltest.cjs http://localhost:8840`
loads one real apartment with `lowmem`, touch/coarse-pointer emulation, quality 0 and
no `&test`/`&shot`. After a complete visible startup it stops the automatic render
loop, installs Playwright's controlled clock and drives actual `frame()` callbacks.
The render wrapper calls the original renderer and records shadow requests/draws;
there is no replacement scene or renderer. Covers real note-open/use, its DOM close
button, pause, opaque portrait rotation and immediate return to normal drawing.
The clock allows deterministic frequency checks without claiming GPU time/FPS.
Three screenshots record note, pause and portrait states. `BASELINE_MAIN=/tmp/main-before.js`
can route the exact previous main source to demonstrate the old unnecessary shadow
hold and covered draws. Report the source baseline and any changed imported modules;
this is a narrow draw-policy comparison, not complete build or pixel equivalence.

## Life recovery (#867)

`node --test cloudflare/recovery.test.mjs cloudflare/players.test.mjs` verifies exact
minute boundaries, more damage without phase reset, hibernation, late/duplicate alarms,
max, fractional shared-health values, death/reset, disconnect/idle, admin off→on, cap,
scheduling failure and retry after committed health, and due recovery before fresh damage.
Run local devserve8871 and dev.mjs8872, then
`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/recoverytest.cjs http://localhost:8871 http://localhost:8872 /tmp/recovery`.
The actual Ghosts/Combat/Worker fixture waits one real server minute, checks local unarmed
recovery and immediate remote state/badge sync, and captures native HUD/texture evidence.
Bootstrap is suppressed and WebGL forbidden; these captures are neither apartment
rendering nor physical phone acceptance. Recovery does not change hit/death counters.

The same recovery browser fixture also checks offline use of the actual Combat replica
at 59,999/60,000 ms, preserved phase after new damage, delayed
catch-up/max, death reset and actual WebSocket reconnection clearing the offline phase.
Its injected offline clock supplies boundary evidence; no actual Fall.land integration
is claimed by that fixture alone. Captures wait for actual HUD text before saving.

#865 validation: the native fixture passed 14 checks, the existing combat lifecycle helper passed 17 checks, and PlayerRoom passed 14 Node regressions (including forged lives/hibernation/death). After integrating the later shared recovery/startup and #863 respawn changes on `f5a33be`, one bounded owned monitor ran the exact published `ghostlivestest.cjs --render`: 15 PASS, 0 FAIL, 0 page errors and actual Node exit 0. The original 14 native checks ran before WebGL was permitted, followed by one real small Ghosts/Three render phase and three visually reviewed 1280×720/844×390 armed/unarmed images. The armed images show `❤ 10` over B/123 p and Observer/246 p; the unarmed image keeps both name/score tags and removes lives. The three owned processes exited (runner 0, server/Worker terminated in monitor finally); artifacts, actual exit/cleanup and 246 frozen runtime/Worker/fixture hashes are in `/tmp/lunden-priority-865/render`. This is source-specific room/label regression evidence, not apartment gameplay, physical-iPhone acceptance, authentication or FPS evidence. Fall damage/minute recovery are separate issues; #865 adds neither.

Use `--fall` with recoverytest for the shared fall channel from #868. Real clients
combine one PvP hit with an unarmed lower fall (10→9→4), then receive the same
minute recovery (4→5) locally and remotely, and the second lower fall confirms
actual death/reset to max. Offline uses actual `Combat.fall`: lower fall10→5,
controlled due minute5→6, second lower fall6→1 surviving, then fatal fall→max
and no remaining recovery phase. This is the actual damage channel/replica, not
a replacement damage model; actual `Fall.land`/world/spawn coverage remains #869.
The combined harness captures native HUD4/10 and restored remote badge5.


## Defeated-player statistics (#871)

Run `node --test cloudflare/players.test.mjs` for accepted lethal receipt UUIDs, unique deaths, ignored client receipts and no ordinary/victim/fall receipt, alongside all existing room/life rules. Start `python3 tools/devserve.py 8865 .` and `node cloudflare/dev.mjs 8866`, then `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/killstest.cjs http://localhost:8865 http://localhost:8866 /tmp/lunden-player-kills`. The native fixture uses real Ghosts/Combat/Worker with two actual WebSockets, original index statistics DOM/CSS and browser localStorage, while suppressing only apartment bootstrap and refusing WebGL. It checks real ordinary/two lethal results, unchanged per-hit points, immediate count/receipt persistence, invalid/legacy/own/hurt/fall results, actual reconnect and two genuine reloads, home-reset whitelist and statistics reset with retained receipts. The actual Swedish row must be visible and inside the viewport before the native DOM image is captured.

Initial native runs passed the logic but their images remained under the loader/hidden HUD and are not accepted statistics-image evidence. The corrected `native-hud` run passed all 24 checks with actual exit0/no pageerrors and zero WebGL calls; its reviewed image shows “Dödade spelare 1” in the original panel. Artifacts: `/tmp/lunden-priority-871/{native,native-visible,native-hud}`. This is actual native room/storage/statistics evidence, not apartment gameplay, a live deployment or a physical-phone measurement.


#871 final native acceptance on `42d7c31`: 25 PASS, zero FAIL/pageerrors/WebGL requests, actual exit0 with no signal or timeout. Two real accepted lethal hits crossed PlayerRoom→Ghosts→Combat→statistics; the extra finite-negative/missing/NaN/positive remaining-health check calls the receipt reducer with explicitly synthetic fresh UUIDs and is not a third server kill. The final reviewed original-panel image shows “Dödade spelare 1”; actual visibility and viewport bounds passed. Seven frozen Combat/stats/config/Ghosts/PlayerRoom/index/driver hashes stayed identical through publication. Final artifacts: `/tmp/lunden-priority-871/final/{native.log,result.json,statistics.png,exit.json,process.json}`, `final-source-hashes.json`. Its bounded-process wall duration is a test observation, not a performance comparison. The server-first `339b173` automatic Cloudflare run 38399861493 and actual wrangler-action step completed successfully; no manual deployment or live room/physical-phone acceptance is claimed. The earlier covered captures remain separately recorded and are not accepted UI evidence.

## Shared crouch pose (#878)

`node --test cloudflare/players.test.mjs cloudflare/recovery.test.mjs` includes pose
validation, standing legacy/default/invalid input, late welcome, hibernation and
preserved health/weapon/score. Start devserve8871 and dev.mjs8872, then run
`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/crouchposetest.cjs http://localhost:8871 http://localhost:8872 /tmp/crouch`.
Actual Player/Ghosts/Avatar/Worker checks cover stationary crouch with exactly one
state message, actual rather than wanted crouch under controlled low headroom,
returning standing, moving crouch, pose interpolation, actual head-bone/skinned-head
vertex positions, weapon-hand attachment, mirror visibility restoration and late
welcome. All native checks forbid WebGL and suppress apartment bootstrap; complete
metrics remain in result.json and a compact native readout PNG. Measurements belong
to that run's actual randomized avatar appearance, not universal head heights.

After an exclusive graphics grant, `--render` adds two controlled actual-avatar
standing/crouching pictures with the same actual peer/model, camera framing, skeleton,
material and held prop. It does not replace the player shape. The renderer completes
with `gl.finish()` before capture; this phase is measured and fails above60s. These
component renders are neither apartment nor physical-phone performance acceptance.


## Bounded semantic polling (#880)

Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome SEMANTIC_WAIT_OUTPUT=/tmp/lunden-semantic-wait node --test tools/semanticwait.test.cjs`. It uses real Chromium Page/Frame execution with timer-driven synthetic readiness and deliberately stopped JavaScript rAF callbacks. Exact historical `testkit.cjs` from `a5b2519` is extracted to an owned temporary directory for the before control; the test cleans that directory and browser. Fifteen checks cover invalid/unbounded budgets, old default-rAF timeout despite readiness becoming true, numeric polling with the same bound, raw textContent while innerText throws, bounded false state, Page/Frame parity, unchanged kit.open URL/viewport/wait:false/test:false behavior, genuine DOM fullscreen exit and authored viewport sizes, and actual kit.shot remaining blocked until two genuine native rAF callbacks and its two controlled draw calls occur. The draw collaborator is deliberately a counter, not a renderer or apartment. Native PNGs show the fixture report and frame-gated DOM text, not game pixels. This is correctness under a synthetic stopped-rAF condition, not a measured generic speedup.

The two selected drivers preserve all original predicates, assertions, labels, timing budgets, launch flags, URLs/modes and ports; reversing only the helper import/wait-routing edits exactly restores all four existing helper/driver sources. `combatremotetest.cjs` completed its original three checks/exit0 before and after routing against its actual historical/current remote-combat module fixture. Its existing CPU observations belong to that fixture, not a new #880 performance claim. The original `fixtureviewport.test.cjs` failed before (including a frozen-source repeat) and after with actual exit1 at the same unchanged assertion: DOM fullscreen is true while CDP Browser.getWindowForTarget reports normal rather than fullscreen. Browser/launch mode matched its original requirements (headless Chromium145.0.7632.6 and original flags). This pre-existing separate defect is tracked as #889; the driver is not claimed green. The semantic helper's successful genuine DOM fullscreen/viewport probe does not establish that missing CDP window-state transition.

Artifacts `/tmp/lunden-priority-880/{before,after,native2,native3,helper-final}` and `routing-proof.json` retain native output, reviewed fixture screenshots, exact before copies and the before/after viewport failure. The first authored new probe had a fixture URL-route error after seven passing checks; that incomplete run is not acceptance. The corrected helper/native test passed all15 checks with actual Node exit0 and zero recorded pageerrors; published helper step `63259f5` preserves those four tested source bytes after rebase. No game runtime, product changelog, global inventory rewrite, heavy apartment/WebGL, physical-phone or FPS certification is included.


#880 final source proof: driver/documentation slice `061d3f1` retains all six tested helper/driver/native source hashes after rebase (`/tmp/lunden-priority-880/final-source-hashes.json`). `routing-proof.json` restores all four existing sources exactly when only the import/wait-call changes are reversed. Actual tool exit results are recorded in `verification-exits.json`: helper-native15 checks exit0, remoteCombat3 checks exit0 before/after, and unchanged viewportdriver exit1 before/frozen-repeat/after for #889. Both native report and frame-gated DOM image were reviewed by agent and root. Earlier fixture-route failure remains an incomplete authored probe, not a product regression or accepted result. No runtime/renderer/assertion/budget/mode/port/changelog change or broad inventory rewrite was made.


## Confirmed distance points (#873)

Start `python3 tools/devserve.py 8869 .` and `node cloudflare/dev.mjs 8870`, then run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/pvppointstest.cjs http://localhost:8869 http://localhost:8870 /tmp/pvp-points`. The default is native-only: real Ghosts/Combat, two local PlayerRoom WebSockets, actual synchronous rifle targeting and a real Three-mesh obstacle raycast, original index/HUD/statistics DOM and a genuine browser reload; apartment bootstrap and WebGL are blocked. It compares the shared browser/Worker rule, 5/10/20-point confirmations, an exact60-point minute and next refusal, invalid award fields, same-connection replay, reconnect/new seq1, old-socket late acknowledgements, save/reload/reset and cached Worker base-only behavior. The visible original panel checks separate count/bonus labels and viewport bounds.

The fixture also retains a real server lethal packet, omits only its kill UUID from the first controlled reducer delivery, then replays the original packet. That controlled replay proves the separately persistent kill receipt can be recorded without repeating an already-consumed score, hit counter, sound or #875 hit-marker deadline; it is not an additional real kill. `node --test cloudflare/players.test.mjs` preserves existing participant/range/rate/health/recovery/crouch cases and tests min/first-bonus/middle/cap, monotonic finite geometry, ignored client rewards, exact budget and hibernating award sequence.

Verification after #875/#878 integration: 18 Node tests and 23 native browser checks PASS, actual CLI exit0, zero page errors and zero WebGL calls. The screenshot `/tmp/lunden-priority-873/rebased/score-stats-native.png` was visually reviewed: original panel shows7 hits,35 separately labelled extra distance points and1 defeated player; actual HUD value70 is checked in the DOM. The1 kill comes from the real lethal receipt's delayed controlled replay. Source freeze contains248 paths; the later63259f5 test-helper changes do not alter any of them. Earlier native runs21/22 passed before marker/crouch integration; the first image used a custom panel and is not the accepted original-panel evidence. No apartment rendering, physical-device, FPS or authentication result is claimed.

Shared fall integration (#869): start own devserve/Worker, then `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/fallintegrationtest.cjs BASE OUTPUT WORKER [--app]`. Default checks actual Player/Fall/Combat/Ghosts and the real local PlayerRoom on a controlled Three world without WebGL: lower/high damage, suit, injury in place, same health offline, cancellation/timeout/stale/duplicate response, no extra PvP/death callback. `--app` requires the shared heavy browser slot and runs the authored `falltest.html` app/World routes. It retains the existing pointer-lock getter/event simulation. Once loading finishes, the driver stops automatic frames and fixes the native wall clock at full health; manual simulation steps yield for actual damage responses, with single-ms timer tasks so slow software rendering cannot accidentally earn healing between the two lower falls. Four checkpoints call the actual frame(0) with full drawing, including an assertion for visible half-life HUD within the viewport. This is actual World/test-controller evidence, not full/test parity or physical-phone/FPS evidence.

#869 final validation: 34 native PASS and 38 actual app/World PASS, zero FAIL/page errors and actual CLI exit 0. Separate changed `respawntest.cjs` passed all 19 native checks, exit 0; its existing direct lethal hurt setup now explicitly passes `true`. Full World covers lower damage/death with and without the actual held blaster, suit protection, unchanged penalties, single checked outdoor wake, original jolt/black/fade, all stairs/ramp/crouch/bunk/resume paths. The four 484×304 iframe-border captures (480×300 app viewport) were visually reviewed: unarmed red 5/10 at the landing street, armed 5/10 with the blaster, fatal black, safe wake. The parent final image records all 38 results with its paused last draw; final native identity has lives10/deaths3/no pending/t=-1, without claiming a later reset paint in that image. All 258 recorded runtime/fixture paths stayed byte-identical across the final run. Artifacts: `/tmp/lunden-fall869-surface/final-frame`, `final-frame.log`, `final-frame-exit.txt`, `final-summary.json`, `runtime-frame-before.json`, and `respawn/`/logs. Earlier harness locator/clock-past failures are separate from this green run. Existing misleading wake copy is tracked in #883, outside this slice.

#869 publication rebase: after integrating the later kill-receipt/statistics, hit-marker, armed-ghost-focus and cold-triangle allocation changes, the complete Fall source and both main landing/Combat-fall callback blocks matched the tested versions exactly. The actual combined native probe passed34 again on merged Combat and a restarted merged Worker, exit0. Incoming inactive shot/greeting branches were preserved; no additional whole-World run or blanket whole-file match is claimed. Rebase proof: `/tmp/lunden-fall869-surface/rebase-source-proof.json`; final native output: `rebased-native/`, `rebased-native.log`, `rebased-native-exit.txt`.

## Artifact checkpoints (#881)

`tools/artifactcheckpoint.cjs` supplies a synchronous atomic checkpoint for `recoverytest.cjs` and
`ghostlivestest.cjs`. It writes a temporary JSON file and renames it over `result.json`; serialization
or rename failure leaves the previous JSON readable. Each invocation starts a new runId with no reused
assertions/result, no automatic resume and no skipped checks. Existing respawn/nerf early-write paths
are left as they were.

The schema keeps `provenance` (checkout git revision, explicitly whitelisted code-file SHA256 hashes,
aggregate JS/MJS tree hashes for src/cloudflare, fixed mode/scenario), completed raw `snapshots`, final
`result`, and separate `stages.logic`, `stages.images.captures`, `stages.cleanup` and `stages.cli`. The
final result's previous driver fields now live under `result`; intermediate records are under snapshots.
Logic complete+passed, image completion and browser cleanup cannot substitute for whole CLI completion.
Drivers write the CLI status from Node's actual exit event, after finally cleanup. A later phase failure
leaves earlier snapshots and completed-image records intact while logic/scenario remains incomplete and
the actual CLI is failed. An abrupt process termination leaves the last checkpoint's CLI incomplete.

`capture` writes the pending-image record before calling the original screenshot operation and records
its success/failure afterward. All original screenshot modes, assertions, game checks and viewport
policies remain. PNG files must still be viewed; earlier PASS rows never authorize an image skip or a
green CLI after a screenshot failure. Caller fields are explicitly limited to fixture results; do not
add environment dumps, raw command arguments, private fixture inputs or credentials. Error metadata
records only an allowed error type, not arbitrary messages/stacks. Source hashes describe the local
checkout: serve that same checkout and start the matching local Worker; rerun after runtime changes.
They do not hash the browser binary or externally installed dependencies and do not prove a remote
server ran those files.

Verify the helper with `node --test tools/artifactcheckpoint.test.cjs`. Run the actual native receipt/
badge subprocess failure proof with `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/artifactcheckpointtest.cjs game worker artifacts`.
It runs the unchanged native ghost-life assertions to success, then injects a first-PNG failure, a post-browser-acquisition checkpoint write failure and a
later-phase failure using a test-only Playwright preload. It independently witnesses actual browser
closure and actual subprocess exits 0/1, retained pre-image raw badge measurements/provenance and exact
image/logic/CLI statuses. It also injects recovery's first PNG error after a real shot and authoritative
local/remote damage synchronization, leaving the not-yet-run real-minute scenario incomplete. No new
real-minute recovery or optional controlled-WebGL execution is claimed by this process-only proof.
The fault subprocesses use owned process groups for their wall-time bound.

Native #881 evidence: six Node cases PASS; 28 fault-harness checks PASS, harness exit 0; successful
ghost-life scenario retains all 14 original native assertions and its reviewed PNGs, actual CLI 0.
The four expected failing drivers have actual CLI 1 and closed owned browsers. Artifacts are under
`/tmp/lunden-artifact881-surface/exit-proof/` and final rebase proof as reported on the issue.

The resource-acquisition checkpoint write stays inside the same browser try/finally guard; a one-shot
rename failure there also exits 1 with an independently closed browser, no fake scenario/image completion.


## #889: native window fullscreen without focus capture (2026-10-13)

The frozen original `fixtureviewport.test.cjs` at `73757cc` reproduced its real assertion failure with actual CLI exit 1 on both installed Chrome 155.0.8059.39 and exact Playwright Chromium 145.0.7632.6. On 145, the original Playwright module was 1.58.2. Native traces sampled DOM fullscreen and CDP bounds for 10.28–10.42 seconds: DOM remained true and windowState remained normal. Headed DISPLAY=:0, natural viewport and physical Playwright click probes also failed to produce window fullscreen. This excludes a short transition race as the observed cause; no transition polling was added.

Chromium source explains the behavior: focus emulation acquires a visible capture handle, and captured tabs enter fullscreen-within-tab without changing browser-window state. Turning focus emulation off through a second CDP session cannot release the original session's handle. Playwright's public 1.60+ `connectOverCDP({ noDefaults: true })` skips focus emulation on the existing default context ([official API](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults); [Chromium focus handler](https://chromium.googlesource.com/chromium/src/+/main/content/browser/devtools/protocol/emulation_handler.cc); [Chromium fullscreen controller](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/exclusive_access/fullscreen_controller.cc)). Headless is not generally incapable of native window fullscreen: both tested full browser binaries successfully implement it in the corrected mode.

The corrected fixture passed its original native DOM/window fullscreen and exit assertions, viewport dimensions, unchanged requestFullscreen function, touch/text preservation and repeated entry/exit checks: **1 test PASS / actual CLI 0 on each browser**, using Playwright 1.64.0. Its strict minimum-version guard produced **actual CLI 1** on Playwright 1.58.2 before acquiring a browser. The three outcomes retain separate stages and source hashes in `result.json`; raw snapshots persist before expensive images and a failure cannot inherit a prior run's green status. No game/runtime/helper viewport predicates changed. No screenshot or window-state assignment simulates fullscreen.

Surface artifacts: `/tmp/lunden-fullscreen889-surface/before/{test.log,exit.txt}`, `before145/{fixtureviewport.test.cjs,fixtureviewport.cjs,semanticwait.cjs,provenance.json,test.log,exit.txt}`, `trace*.json`, `after155/{result.json,phone.png,desktop.png}`, `after145/{result.json,phone.png,desktop.png}`, `incompatible/result.json`, plus corresponding parent-written `*-exit.txt` and logs. The 667×375 and 960×600 actual DOM PNGs were visually inspected and reviewed by the root agent. Owned browsers/profile processes were absent after completion. Browser 145 was downloaded into the task artifact directory (Ubuntu 24.04 browser payload used on this Ubuntu 26.04 host); its exact version is in the evidence. No WebGL/apartment, gameplay performance or physical phone claim is made. Reproduction and supported-mode requirements: [local development](local-development.md#native-window-fullscreen-fixture-889).

### Presence/FPS badge (#884)

`PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/fpstest.cjs http://localhost:8871 /tmp/fps` checks the pure counter and actual index/Presence/Combat HUD with bootstrap suppressed: 60 draws versus 100 callbacks, reduced 10-Hz draws, stable windows, lifecycle resets, heartbeat failure/node preservation, stacked divider/glyph bounds, safe areas and existing lives/marker clearance at 568×320, 667×375, 844×390 and desktop. Add `--app` for one bounded quality-0 apartment integration without `&perf` or test mode: controlled clock/callback cadence with a 320×180 drawing buffer proves the ordinary render hook, reduced reading draws, pause/hidden clearing and resumed window; extra renderer calls do not inflate the badge. Headless warm-up is skipped by the existing headless path. These checks do not measure hardware FPS or certify physical-phone startup/visibility. Artifacts retain actual native screenshots and JSON results in the specified directory. `--app` requires two separate raw images: actual game-canvas pixels exported synchronously after the final ordinary `frame(0)` draw and `gl.finish`, and current actual HUD DOM captured natively with only the game canvas hidden. They are not a composited/full-app image. `FPS_CAPTURE=paired … node tools/fpstest.cjs BASE OUTPUT --capture-probe` cheaply checks the same paired capture path using real Three/index DOM without building the apartment.

Initial #884 acceptance: 47 counter/native HUD checks passed with Node exit0 and inspected four HUD screenshots; actual quality-0 apartment proved five ordinary draws over controlled one second (5 FPS) and an excluded extra renderer call. Two earlier app drivers exited1 during incomplete later phases: first deliberately stopped for excessive render work, second hit its 60-second post-startup guard. These are not reading/pause/resume acceptance. Existing `hudlayouttest.cjs` exited1 on its 15 obsolete outside-combat life-visibility assertions, tracked separately in #896.
Hus A port culling (#887): start devserve and run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/entrancecullingtest.cjs BASE OUTPUT`.
The native browser uses actual Core/CoreHouse A/B/C with original construction/collision data and Three raycasts, without WebGL or apartment startup.
It checks patio/boundary/near opaque occlusion, bounded retained geometry, triangle conservation, original glass, actual far animated door/collision,
unchanged floor support, power restoration and frustum/shadow flags. Actual World acceptance additionally requires inspected before/after patio and
near pictures at ordinary quality3 and low quality0, without `&test`; retain camera/query, rendering counts and page errors before screenshots.
Inspected actual World evidence: `/tmp/lunden-port887-surface/world-{before,after}.json` and four pictures per run
`{before,after}-{patio,near}-q{0,3}.png`, all eight inspected; both CLIs exited0 with no page error or context loss.
Cameras x1.8/y1.62/z14 and z28; fixed midday June, no `&test`, actual Quality.set(0/3), manual step/frame(0).
Before routes retain original73757cc Core/CoreHouse; after uses the change. Each result checkpoints before its picture; after explicitly completes GL with finish().
The unchanged nearby glass/lobby remains visible; the distant view loses the background lawn/trees through the house and hits the actual opaque wallz38.9.
This proves geometry/culling acceptance, not newer main HUD changes, live FPS or a physical phone.

### Interactive statistics (#886)

Run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/statspaneltest.cjs game artifacts`.
The driver serves the original index DOM/CSS without apartment bootstrap, imports the real Player,
touch controller, statistics and StatsPanel, and executes complete production main input/panel blocks
verbatim. It acquires real browser pointer lock using the original start button, checks held Tab
including its close button/release, pinned T with Tab/Shift-Tab focus, wheel/keyboard scrolling,
Escape, click/Enter return, and native touch gestures. Gameplay collaborators and a small Player
world are controlled stand-ins; this is no apartment/render/network-combat proof. Statistics exist
only in a fresh browser context; cancellation of the existing menu reset dialog preserves them.
Native touch scroll inertia must settle by measured scrollTop before the close-button tap.
`--before` runs the historical b2efbc5 index/main blocks to reproduce retained pointer lock,
non-scrolling wheel/focus selection and a held trigger; failure is expected.

The armed greeting fixture keeps its original 22 assertions; its source anchor and fixture globals
include the new stats input guard so it still extracts the production handler. No room, touch mode,
port, fullscreen or existing PASS/FAIL contract is replaced.

Native evidence: 22 checks PASS, CLI 0, no page errors; reviewed held/touch PNGs. The
unchanged armed-greeting actions/assertions also report 22 PASS, CLI 0. These native checks
do not claim an apartment/WebGL run or physical-phone verification.

#886 final provenance: source slice `ba28eb4` retains 22 native PASS/CLI 0 and 22
armed-greeting PASS/CLI 0 after the last runtime rebase. Historical b2efbc5 main/index
reproduces three expected failures (CLI 1, no page errors). Raw outputs and inspected
held/touch/before PNGs are under `/tmp/lunden-priority-886/{rebased,before-final,armed-rebased}`;
`publication-proof.json` records the tested paths. The subsequent #715 commit8237269 changes
none of these ten paths; this is path-specific evidence, not whole-application parity.
Owned browser processes and the native server were stopped after the runs.

Final review correction keeps the Touch child button's native Enter/Space activation: only a key
targeted at the return surface itself requests mouse resume. Its duplicate role attribute is removed.
The complete original arm-child/start-touch handlers are included verbatim in the native fixture.
The final run has **24 PASS / CLI 0**, including both real keyboard Touch activations, with all
previous 22 assertions preserved; artifacts are `/tmp/lunden-priority-886/final-publication`. The last rebase preserves the
#892 avatarLook/config addition; final native checks run on that checkout.

#896 partial verification (2026-10-13): all 15 original viewport/safe-area cases and geometry assertions remain. Actual Combat hurt/life calls and mutable weapon/connection state now check injured unarmed, full unarmed, injured offline and full armed visibility (60 recorded state snapshots), with explicit no-WebGL/pageerror guards. On Linux Chrome for Testing 149.0.7827.55, the unchanged original driver against the same served source exited 1 with 15 obsolete life failures plus 9 compact-cell clipping failures; the revised driver exited 1 with zero life failures and the same 9 geometry failures. #902 tracks temperature, clock and score clipping at 568×320 across all three inset cases; no geometry assertion or runtime was changed. Thus #896 remains open pending whole-suite exit 0. Logs/results and visually reviewed 844×390 and compact 568×320 HUD screenshots are in `/tmp/lunden-priority-896/`; candidate artifacts are in `candidate-final/`; a repeat after rebase to 8f0ea44 retained the same 15 cases, zero life failures and nine clipping failures (actual exit 1), with reviewed compact image in `post-rebase/`. This is HUD-only evidence, not apartment rendering or physical-phone acceptance.
Final reordered #884 real-app run completed all16 counter/integration checks before image capture: one ordinary draw over600ms rounds2FPS, extra renderer call excluded, actual phone reading3callbacks gives2due draws over600ms (3FPS), pause clears immediately, controlled hidden0draws remains dash, resumed fresh2FPS. Zero pageerrors; startup plus logic121890ms, existing headless warm-up skip, stopped native app animation loop, actual320×180 drawing buffer. Completed raw checkpoint/result and CLI were saved first. The subsequent Playwright screenshot timed out10s after fonts loaded despite resumed Playwright clock; actual runner exit1 and owned browser closed. This is complete logic evidence with a failed capture, not a successful whole-driver/capture run. Prior HUD PNGs remain actual index/native layout evidence.

Capture diagnosis: a fifth full-app run repeated all16 logic checks but direct native CDP `fromSurface:true` also timed out15s (CLI1), disproving the hypothesis that only Playwright screenshot/rAF waiting was responsible. Tiny actual Three/index probes with the identical stopped animation loop and clock lifecycle passed12 checks/exit0 both as a small canvas and as a full-viewport antialiased `#game-canvas` using the real viewport binder. The full-World compositor stall was not reproduced cheaply; its cause remains unproven. The prepared explicit paired capture path exports real game-canvas pixels synchronously after one final actual render/finish, then separately captures the actual HUD DOM with only that canvas hidden (`fromSurface:false`). The two images must never be called a composited/full-app image. Acceptance still requires proof of that path and actual final driver exit0.

The exact paired capture path then passed the cheap real Three/index probe12 checks, Node exit0: `/tmp/lunden-fps884-surface/capture-paired/` contains the actual320×180 blue/yellow canvas PNG and separately captured667×375 current Presence/FrameRate DOM2FPS PNG with its canvas hidden. Both raw images were visually inspected. No full-World startup was used for this diagnosis.

Final #884 paired apartment acceptance passed19 checks with actual Node exit0 and zero pageerrors. The earlier16 controlled counter/integration assertions completed before images; final ordinary `frame(0)` draw, `gl.finish` and synchronous canvas export produced the visually inspected320×180 kitchen/fridge game pixels. Separate native DOM capture with only the canvas hidden shows the same current2FPS under the offline online-count dash at667×375. Both required image checks passed; no fabricated/composited image was produced. Startup plus logic was122194ms before capture. Final raw JSON/checkpoints, CLI and PNGs are `/tmp/lunden-fps884-surface/`; all five incomplete runs and capture diagnoses remain retained separately. This is controlled source/render-hook/lifecycle evidence, not physical-phone acceptance, measured hardware FPS or full-quality screenshot evidence. Owned Chrome closed immediately after this run.

Final FPS rebase preserved incoming statistics keyboard interactions, canonical avatar appearance appended to config and combat cache work. `fps.js`/`presence.js`, the FPS CSS, main FPS DOM setup/render hook/overlay reset, and the existing config prefix including HUD_FPS remained unchanged; whole main/index/config differ in those unrelated incoming blocks. Exact scoped checks are retained in `final-rebase-fps-contract.json`. `final-paired-app-cli.txt` is the successful19-PASS/actual-exit0 transcript; earlier `final-app-cli.txt` remains a failed historical capture attempt.


#900 current contract: `oloftest.html` now tests car-only Olof, legacy `?olof=0` inertness, free apartment seats, unchanged shared driver figure, arrival/greeting/score and saved-car restoration. `resttest.html` no longer disables a removed indoor actor; `nonpctest.html` exercises its existing speech/old-greeting-save checks through OlofDriver. Historical #829 comparisons above describe the old fixture and are not current indoor-spawn acceptance.

#900 source/native step: a non-repository diagnostic `/tmp/lunden-priority-900/probe.cjs` executes the complete current main driver-init span and whole `use` function verbatim in real index DOM, with actual Car, Greetings, OlofDriver and Avatar, without bootstrap/WebGL. It completed 26 PASS, actual Node exit 0 and no page errors: native arrival, greeting/once-per-arrival scoring, saved parked/arriving/leaving restoration, garage seat release, independent pre-change driver/Avatar geometry and bone-pose parity. Shared figure/skeleton/IK/pose prefix and driver implementation remain byte-identical except descriptive comments. The first 22-check attempt passed assertions but exited 1 on diagnostic circular-result serialization; the corrected final run is separate. Its result image is a text-only native summary, not rendered gameplay. Actual full-app verification is still pending an exclusive run.
